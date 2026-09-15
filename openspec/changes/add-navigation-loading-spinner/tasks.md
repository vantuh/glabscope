## 1. Model: navigation state

- [ ] 1.1 Add `navigating: { kind: "graph"; pipelineIid: string } | { kind: "logs"; jobId: string } | null` to `AppModel` (default `null` in `emptyModel`) and verify `bun test src/model.test.ts` still passes with the new field present
- [ ] 1.2 Add `startNavigating` action (`{ type: "startNavigating"; target: NonNullable<AppModel["navigating"]> }`) that sets `model.navigating`, and a unit test in `src/model.test.ts` asserting `reduce(emptyModel, { type: "startNavigating", target: { kind: "graph", pipelineIid: "5" } }).navigating` equals that target
- [ ] 1.3 Update `openGraph` and `error` reducer cases to reset `navigating: null`, and add unit tests asserting a model with `navigating` set returns `navigating: null` after each action
- [ ] 1.4 Add `logsReady` action that sets `screen: "logs"`, `logJobId`, resets `logBuffer`/`logDone` (same fields `openLogs` sets today) and clears `navigating: null`; change `openLogs` to only set `navigating: { kind: "logs", jobId }` (no screen change); verify with a unit test that `openLogs` leaves `screen` unchanged and sets `navigating`, and `logsReady` transitions `screen` to `"logs"` and clears `navigating`

## 2. App: list → graph loading

- [ ] 2.1 In the list screen's Enter handler in `src/app.tsx`, return early if `model.navigating !== null`; otherwise dispatch `startNavigating` with `{ kind: "graph", pipelineIid: String(row.iid) }` synchronously before calling `fetchPipelineGraph`, and keep dispatching `openGraph`/`error` on settle — verify with a test in `src/app.test.tsx` that pressing Enter twice quickly only results in one `fetchPipelineGraph` call (mock/spy or count via a stub module)
- [ ] 2.2 Render a loading line (e.g. `Loading pipeline…`) on the list screen when `model.navigating?.kind === "graph"` — verify with an `app.test.tsx` test using `testRender` that the captured frame includes the loading text immediately after pressing Enter, before the graph fetch promise resolves

## 3. App: graph → logs loading

- [ ] 3.1 In the graph screen's Enter handler, return early if `model.navigating !== null`; otherwise dispatch `openLogs` (now only sets `navigating`, per 1.4) — verify with an `app.test.tsx` test that pressing Enter twice on the graph screen before the trace effect resolves does not spawn a second `glab ci trace` process
- [ ] 3.2 Update the trace-spawn `useEffect` (keyed on the job id from `model.navigating` when `kind === "logs"`) to dispatch `logsReady` once `Bun.spawn` succeeds, and dispatch `error` (clearing `navigating` per 1.3) if `Bun.spawn` throws — verify with a unit/integration test that a spawn failure clears `navigating` and shows the error screen
- [ ] 3.3 Render a loading line (e.g. `Loading log…`) on the graph screen when `model.navigating?.kind === "logs"` — verify with an `app.test.tsx` test that the captured frame shows the loading text between confirm and the log screen appearing

## 4. Verification

- [ ] 4.1 Run `bun test` and confirm all existing and new tests pass, including `src/model.test.ts` and `src/app.test.tsx`
- [ ] 4.2 Manually smoke-test from a real GitLab project directory (per README): press Enter on a pipeline and confirm a loading indicator appears immediately and repeated Enter presses do not open multiple graphs or error; repeat for confirming a job on the graph screen
