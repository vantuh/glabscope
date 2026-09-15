## Why

Pipeline and job statuses become stale while the operator remains on the pipeline list or job graph, so completed work is not reflected without leaving or restarting the view. The TUI should refresh active CI state promptly while remaining safe for GitLab API limits and compatible with its existing `glab` authentication model.

## What Changes

- Refresh the pipeline list while any visible pipeline is running or pending, preserving the current selection when rows update.
- Continue refreshing the selected pipeline's job graph while it is active, and surface job and pipeline terminal states promptly.
- Use bounded `glab` polling only while live state can change; stop when no relevant pipeline is active and pause graph refresh while viewing logs.
- Apply exponential backoff with a maximum delay after HTTP 429 responses, then recover to the normal interval after a successful refresh.
- Keep the last successful data visible when a background refresh fails and present a non-fatal refresh error rather than replacing the screen.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pipeline-list`: Add automatic, selection-preserving refresh of active pipeline statuses with rate-limit handling.
- `job-graph`: Clarify prompt status refresh, failure behavior, and recovery while preserving the existing pause and terminal-stop rules.

## Impact

- Affects the application refresh lifecycle and model state in `src/app.tsx` and `src/model.ts`.
- Reuses `glab ci list -F json` for pipeline-list refresh and `glab api graphql` for job-graph refresh.
- Extends model and application tests for refresh scheduling, selection preservation, terminal stop, errors, and 429 backoff.
- Adds no dependency and requires no separate GitLab token.

## Non-goals

- Direct GitLab GraphQL subscriptions or Action Cable WebSockets; `glab api` is request/response only and the project does not permit a parallel GitLab client.
- Webhook setup, a local callback server, retry/cancel/play actions, or custom job-log polling.
- Refreshing terminal-only history when no visible pipeline can still change state.
