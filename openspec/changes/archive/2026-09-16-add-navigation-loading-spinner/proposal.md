## Why

Selecting a pipeline (list → graph) or a job (graph → logs) triggers an async `glab` call before the next screen appears, but the UI gives no feedback while that call is in flight. The operator can't tell whether Enter registered, so they press it again — sometimes queuing duplicate navigation once the first request resolves.

## What Changes

- Show a fullscreen dim overlay with an animated spinner immediately when Enter is pressed on the pipeline list, while the job graph is being fetched, and clear it when the graph screen opens or the fetch fails.
- Show the same fullscreen dim overlay with an animated spinner immediately when Enter is pressed on the job graph, while the log screen is being opened, and clear it once the log screen is showing (or the trace fails to start).
- Ignore repeated Enter presses on the same target while its loading indicator is active, so duplicate requests can't queue up.

## Capabilities

### Modified Capabilities
- `pipeline-list`: opening a pipeline's job graph must show a loading state while the graph is being fetched, and must not start a second fetch from a repeated Enter while one is already in flight.
- `job-graph`: opening a job's log must show a loading state while the log screen is being prepared, and must not open a second log request from a repeated Enter while one is already in flight.

## Impact

- `src/model.ts`: new state to track an in-flight navigation (target pipeline/job id) and clear-on-resolve/clear-on-error transitions.
- `src/app.tsx`: dispatch a "loading" action synchronously on Enter (before the `fetchPipelineGraph` promise settles), render an animated fullscreen dim overlay above the existing screen, and guard the Enter handler against re-firing while loading.
- No changes to `glab` invocations, polling, or log streaming behavior.
