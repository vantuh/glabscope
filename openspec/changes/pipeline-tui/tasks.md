## 1. Bootstrap

- [x] 1.1 Scaffold a Bun TypeScript app with `@opentui/react` and verify `bun` starts a blank TUI that exits cleanly on `q`
- [x] 1.2 Document that `glab` must be on PATH and authenticated; verify a missing-`glab` launch shows an error instead of an empty success list
- [x] 1.3 Spike `glab api graphql` against the operator’s GitLab for pipeline jobs, status, and `needs` (ids if present); verify the query is recorded in code comments or a fixture from a real payload

## 2. GitLab client

- [x] 2.1 Wrap `glab ci list -F json` with pagination flags and map statuses into the four buckets; verify unit tests cover success, failed, running/pending, and other
- [x] 2.2 Wrap GraphQL job+needs fetch and fail clearly when `needs` is absent from the schema; verify a fixture without needs reports the error path
- [x] 2.3 Spawn `glab ci trace <job-id>` as a child process with cwd inherited; verify a dry-run/help invocation builds the correct argv

## 3. Pipeline list

- [ ] 3.1 Render a scrollable pipeline list from cwd-resolved `glab` data with four-color status; verify launch in a bound repo shows rows and unbound dir shows the error from 1.2
- [ ] 3.2 Enter opens the graph for the highlighted pipeline id (not “latest on branch”); verify selecting a non-latest id is passed through
- [ ] 3.3 Esc from the graph returns to the list with selection preserved when that pipeline is still listed; verify navigation test or manual checklist in a TUI test harness

## 4. Job graph

- [ ] 4.1 Compute topological ranks and a viewport-clipped ASCII DAG from jobs+needs; verify unit tests on a small diamond graph and a stages-only graph (no invented edges)
- [ ] 4.2 Render job nodes with four-color status and keyboard focus; verify focus moves and Enter targets the focused job id
- [ ] 4.3 Treat trigger/bridge jobs as single nodes that do not replace the graph; verify a fixture with a bridge job stays on the same pipeline
- [ ] 4.4 Poll GraphQL only while pipeline status is running/pending, with interval and 429 backoff; verify polling stops on terminal pipeline status
- [ ] 4.5 Pause graph polling while the log screen is open and refresh once on return if cheap; verify no poll ticks during an open log session in tests

## 5. Job logs

- [ ] 5.1 Embed `glab ci trace` in an OpenTUI PTY/terminal pane for the focused job; verify a running job’s output grows without a custom REST poller
- [ ] 5.2 Keep the log buffer and screen when the job finishes or the tracer exits; verify the pane does not auto-pop
- [ ] 5.3 Esc from logs returns to the graph with the same job focused if it still exists; verify it does not jump to the pipeline list

## 6. Integration

- [ ] 6.1 Walk list → graph → live log → stay after complete → Esc → Esc in a real project and verify the specs’ scenarios against that session
- [ ] 6.2 Add a README run command (`bun` + `glab` prerequisites) and verify a new clone can follow it without extra auth UI
