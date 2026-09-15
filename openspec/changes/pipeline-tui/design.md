## Context

Greenfield repo: OpenSpec only, no application code. See `proposal.md` for motivation. Constraints: reuse logged-in `glab` (no HTML, no extra OAuth UI); nested screens list → DAG → log; same-pipeline `needs` graph; embed `glab ci trace` for logs.

GitLab REST `GET .../pipelines/:id/jobs` does not document `needs`. GitLab’s DAG UI historically loads needs over GraphQL. Job logs: REST `GET .../jobs/:id/trace` is a snapshot; `glab ci trace` already polls that for live output.

## Goals / Non-Goals

**Goals:**

- TypeScript UI with OpenTUI React (Flexbox, nested screens, embedded terminal for trace).
- Data access only through `glab` subprocesses (`ci list -F json`, `api graphql`, `ci trace`).
- Topological DAG layout with a scrollable viewport; four-color status buckets shared by list and graph.
- Pause graph polling while the log pane is active.

**Non-Goals:**

- Child-pipeline drill-down, retry/cancel/play, artifacts, MR-centric entry, YAML editor visualize.
- Custom trace poller or websocket client.
- Static Go binary / Bubble Tea parity with `glab` itself.
- Supporting GitLab versions whose GraphQL `CiJob` has no needs relationship (fail clearly).

## Decisions

### 1. UI: OpenTUI + React

React matches the chosen DX (components, hooks). OpenTUI’s Zig core is the renderer; Bun is the documented runtime. Alternative: Bubble Tea (closer to `glab`, worse nested-layout DX). Alternative: Ink (React without the native renderer). Alternative: Solid (better fine-grained updates; rejected for familiarity).

### 2. GitLab I/O: `glab` CLI, not a second HTTP client

Auth, host, and project resolution stay in `glab` (cwd git remote, `-R` later). Alternative: `@gitbeaker/rest` with a PAT — duplicates what `glab` already stores.

### 3. DAG data: GraphQL via `glab api graphql`

Query pipeline jobs with status and `needs` (prefer job ids when the schema exposes them; fall back to names and document parallel-name ambiguity). Alternative: parse `.gitlab-ci.yml` — wrong for rules/matrix/includes. Alternative: REST jobs — no needs.

Layout: longest-path / topological ranks, left-to-right, ASCII edges, clip to a viewport. Do not attempt GitLab web pixel layout.

### 4. Logs: embed `glab ci trace <job-id>`

OpenTUI embedded terminal (or equivalent PTY pane). One path for running and finished jobs. When the child exits, keep the pane and buffer; Esc pops to the graph. Alternative: poll REST trace in React — duplicates `glab ci trace`.

While the log screen is open, pause GraphQL polling (spec). Optional later: refresh the focused job color once on return.

### 5. Status buckets

| Bucket | GitLab statuses (indicative) |
|---|---|
| success | success |
| failed | failed |
| running-or-pending | running, pending, waiting_for_resource, preparing |
| other | created, manual, skipped, canceled, scheduled, ... |

Four colors only, as requested.

### 6. App shape

```
cwd --> glab project resolve
  --> PipelineList (glab ci list -F json)
        --> JobGraph (graphql poll if active)
              --> JobLog (pty: glab ci trace)
```

Shared process-spawner with timeouts, stderr surfaced as UI errors, conservative poll interval (e.g. 3–5s) and backoff on 429.

## Risks / Trade-offs

- [Older GraphQL without needs] → Detect missing fields; show jobs without edges plus an error, do not parse YAML.
- [Rate limits] → Pause on log screen; backoff; do not poll finished pipelines.
- [Parallel jobs, same name] → Prefer IDs in GraphQL; if only names exist, edges may be ambiguous.
- [Wide DAGs] → Viewport + scroll; graph will not match GitLab’s web layout.
- [PTY / `trace` exit] → Treat process exit as “freeze buffer”, not “pop screen”.
- [Bun + native OpenTUI] → Personal-tool install cost; document Bun as the run path.
- [After trace, graph stale] → Accept until Esc; refresh once on return if cheap.

## Migration Plan

New app; no production data to migrate. Rollback is unused. Ship as a local CLI once `glab` is on PATH.

## Open Questions

- Exact GraphQL field names across GitLab versions (spike against gitlab.com and the operator’s instance during apply).
- OpenTUI React major / embedded-terminal API at implement time — follow current OpenTUI docs, not a pinned guess here.
