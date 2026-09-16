## Why

The TUI shows a pipeline, its job graph, and a live log, but the operator cannot get from a row or a card to the same object in the GitLab web UI. Anything the terminal view does not cover — a job's full page, its artifacts, the pipeline page to share or to inspect in the browser — means leaving the app and finding that pipeline by hand again.

## What Changes

- One bare `o` key opens the focused object in the browser: the selected pipeline on the list screen, the focused job card on the graph, the focused attempt on the attempts list, and the traced job on the log screen. `Shift+O` works the same as `o`.
- A graph card that has more than one attempt opens nothing: it drills into the existing attempts chooser and shows a non-fatal notice that the job has several attempts, so the operator picks one and presses `o` again to open that exact attempt.
- Every open targets the object's own GitLab page: the pipeline page for a list row, `/jobs/<id>` for the job attempt in view. Opening never mutates anything in GitLab and never moves the operator off the screen they are on.
- The browser URL is derived from the project web URL `glab` already reports for the working tree, so no new GitLab read sits on any refresh path and no per-press API call is made.
- Opening is best-effort and non-blocking: one open is in flight at a time, a repeated `o` starts no second page, and only a failure to launch the browser system opener is reported, as a non-fatal message in the content area.
- The key help lines of the list, graph, attempts, and log screens mention the browser key.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pipeline-list`: a new requirement to open the focused pipeline in the browser.
- `job-graph`: a new requirement to open the focused job attempt in the browser, and to route a multi-attempt card through the attempts chooser with a notice first.
- `job-logs`: a new requirement to open the traced job attempt in the browser.
- `screen-chrome`: the key help line requirement now lists the browser key on the screens where it applies.

## Impact

- `src/app.tsx`: `o` handling on the four screens, the browser notice, and key help text.
- `src/keys.ts`: one new key predicate beside the existing ones.
- `src/model.ts`: one new action for entering the attempts chooser from the browser key, with its notice.
- `src/glab/graph.ts`: the cached project read exposes the project web URL it already fetches.
- New `src/browser.ts` (platform browser opener) and `src/gitlab-url.ts` (URL building), both pure and unit-tested.
- `README.md`: the key list gains `o`.
- No new dependency, no new glab command, no change to polling, retry/run, log tracing, or the list refresh path.

## Non-goals

- Delegating the open to `glab ci view --web` for pipelines and a hand-rolled opener for jobs; one mechanism covers both.
- Honoring a `BROWSER` environment override, browser profiles, or anything beyond the platform's default opener.
- Copying the URL to the clipboard, showing the URL on screen, or adding a web-URL column to the pipeline list.
- Web links for anything without a focused object: merge requests, branches, artifacts, or a bridge job's child pipeline.
- Adding `webUrl` to the GraphQL query (this instance exposes no such field on `Pipeline` or `CiJob`) or a per-job REST read on press.
- Changing which screen a key opens, or the load/refresh feedback those navigations already show.
