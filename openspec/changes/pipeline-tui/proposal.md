## Why

`glab` can list pipelines, inspect one pipeline, and stream a job log, but it does not offer nested selection: pick an existing pipeline, walk its job-dependency graph, then drop into that job’s log and return with Esc. GitLab’s web DAG (`needs` arrows and status colors) is the missing view. This change adds a personal terminal app that reuses official `glab`/GitLab APIs only—no HTML scraping.

## What Changes

- Add a React + OpenTUI app launched from a git working tree that resolves the GitLab project the same way `glab` does (cwd remote / `glab` config).
- Show a scrollable list of pipelines for that project, colored by a four-bucket status mapping (success, failed, running/pending, other).
- On Enter, open a same-pipeline **Job dependencies** DAG (`needs` edges, status colors), not stage columns only; poll while the pipeline is running or pending.
- On Enter on a job, embed `glab ci trace <job-id>` in a pane (live while the job runs). When the job or `trace` process ends, keep the log buffer on screen until Esc.
- Esc pops Log → DAG → list. v1 does not drill into child/bridge pipelines, retry/cancel, or implement a custom log streamer.

## Capabilities

### New Capabilities

- `pipeline-list`: Discover the current GitLab project from the working tree and list existing pipelines with status coloring and selection.
- `job-graph`: Render and navigate a same-pipeline `needs` DAG with status colors and polling while the pipeline is active.
- `job-logs`: Open an embedded official job trace for the focused job and keep the log screen after the job or tracer exits.

### Modified Capabilities

- None (greenfield; no main specs yet).

## Impact

- New application code (TypeScript, OpenTUI React, Bun runtime and native OpenTUI core).
- Depends on a logged-in `glab` on PATH (`ci list`, `api graphql`, `ci trace`); no separate GitLab token UI in v1.
- No changes to GitLab itself; GraphQL job `needs` may be thinner on older self-managed instances.
