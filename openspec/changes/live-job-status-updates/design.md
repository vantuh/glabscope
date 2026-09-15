## Context

See `proposal.md` for motivation. The app currently loads pipelines once with `glab ci list -F json`. Its graph effect immediately runs and then polls every four seconds with `glab api graphql`, pauses outside the graph screen, stops on a terminal pipeline, and doubles its delay to 30 seconds after rate limiting. Pipeline refresh, selection-by-id reconciliation, shared rate-limit classification, and retry after ordinary transient failures are absent.

GitLab exposes CI GraphQL subscriptions over Action Cable on some versions and feature-flag combinations. However, `glab api graphql` is a one-shot HTTP command and cannot maintain that WebSocket protocol. Webhooks also require project configuration and a callback server. Both approaches would violate the fixed `glab`-only I/O boundary, so live behavior must remain polling-based.

## Goals / Non-Goals

**Goals:**

- Keep list and graph data current while visible CI state is active.
- Preserve list selection and graph focus across reordered refresh results.
- Use one in-flight request per visible screen, bounded intervals, and bounded 429 backoff.
- Preserve usable data and recover automatically after background failures.

**Non-Goals:**

- Introduce WebSockets, webhooks, a GitLab SDK, or separate token handling.
- Poll while the log screen is open or after relevant state becomes terminal.
- Discover newly created pipelines after polling has stopped because the visible list is entirely terminal.

## Decisions

### Use screen-scoped, self-scheduling polling loops

The list screen will run `glab ci list -F json` while at least one current row has a running or pending status. The graph screen will run the existing `glab api graphql` pipeline/jobs query while the selected graph is running or pending. Each loop schedules its next tick only after the current subprocess settles, preventing overlapping requests when GitLab or `glab` is slow.

A four-second normal interval preserves the existing request rate and provides prompt updates without increasing steady-state API traffic. The loop starts with an immediate refresh when entering an eligible screen, then waits between subsequent requests.

Alternative: a fixed timer can overlap slow commands and increase rate-limit risk. A shared global loop complicates screen lifecycle and can refresh hidden data.

### Reconcile refreshed data by stable identity

A pipeline-list refresh will preserve the selected pipeline using its numeric pipeline `id`, not its array index. If that identity disappears, selection will clamp to the nearest valid row. Graph refresh continues preserving focused jobs by GraphQL job id.

Alternative: retaining only the selected index can silently move focus to a different pipeline when GitLab inserts or reorders rows.

### Centralize background refresh outcomes

Model actions will distinguish initial fatal loading failures from non-fatal background refresh failures. Successful refreshes replace data and clear the refresh warning; failures retain the last successful data. Both loops will use a common rate-limit classification from `glab` command output so list and graph behavior agree.

A 429 doubles the current delay up to 30 seconds. Any successful refresh resets it to four seconds. Non-rate-limit failures also retain data and continue retrying at the current bounded delay rather than permanently terminating live updates.

Alternative: stopping on the first transient error leaves the screen stale. Treating a background failure as fatal discards usable state.

### Keep push delivery outside this change

GitLab's `ciJobStatusUpdated` subscription is job-scoped; `ciJobProcessed` can be project-scoped but is version/feature-flag dependent. Both require a persistent Action Cable WebSocket client that `glab` does not expose. A thin event-triggered refetch would be reasonable only after a separate change explicitly expands the GitLab I/O boundary and defines authentication, compatibility probing, reconnect behavior, and polling fallback.

## Risks / Trade-offs

- [Four-second polling does not provide instant push latency] → Refresh only active data and keep the interval short enough for interactive status tracking.
- [A project with active pipelines generates repeated CLI/API calls] → Allow only one in-flight call, stop on terminal state, pause hidden screens, and back off to 30 seconds on 429.
- [Error text may not expose an HTTP status consistently across GitLab/glab versions] → Cover known 429 forms in a shared classifier and treat unknown failures as recoverable non-rate-limit errors.
- [Stopping list polling when all visible rows are terminal misses pipelines created later] → Keep that limitation explicit; manual/new-pipeline discovery can be designed separately without forcing perpetual polling.

## Migration Plan

1. Add model-level refresh predicates, identity reconciliation, and delay/error behavior with unit tests.
2. Add the pipeline-list loop and harden the graph loop using the same scheduler policy.
3. Add application tests for screen transitions, terminal stop, failures, and recovery.
4. Run `bun test`; no persisted data or configuration migration is required.

Rollback consists of reverting the refresh actions/effects; existing initial list load and graph navigation remain unchanged.
