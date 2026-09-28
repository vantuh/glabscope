## 1. Default follow

- [ ] 1.1 In `src/app.tsx`, add `stickyStart="bottom"` to the log screen's scrollbox (keep `stickyScroll`) so content growth re-pins the view to the bottom. Verify: `bun test src/app.test.tsx` with a new test "opening a long log shows its tail" — open a job whose body is longer than the panel (many lines via `openLog`), assert the last line is on screen and the first line is not.
- [ ] 1.2 Add a test that streamed chunks keep the tail visible: open the log with `queuedTrace()` pushed to `traceStreams`, then `trace.write()` successive lines and assert each newest line is visible without any input. Verify: `bun test src/app.test.tsx`.

## 2. Pause on scroll-up

- [ ] 2.1 Add a test that scrolling up pauses following: open a multi-line log, press `up` (scroll key) to move off the bottom, then `trace.write()` a new chunk — assert the view stays on the scrolled-to lines and the new chunk does not pull the view back down. Verify: `bun test src/app.test.tsx`.

## 3. Resume and end-of-trace edges

- [ ] 3.1 Add a test that returning to the bottom resumes following: after scrolling up, press `end` (jump-to-bottom scroll key), then `trace.write()` a chunk — assert the newest line is visible again. Verify: `bun test src/app.test.tsx`.
- [ ] 3.2 Add a test that the trace ending while scrolled up changes nothing in the view: with following paused, let the tracer exit and assert the panel keeps the operator's position, the buffer stays readable, and the chrome still marks `ended`. Verify: `bun test src/app.test.tsx`.

## 4. Regression and smoke

- [ ] 4.1 Run the whole suite (`bun test`) and confirm no existing behavior moved: list/graph/attempts scrolling, copy-on-select, `y` yank, retry-from-log, and the `ended`/`live` chrome tests all still pass. Verify: `bun test` exits clean.
- [ ] 4.2 Manual smoke on a real pipeline: `bun run src/index.tsx` (or the repo's start script), open a running job's log — tail follows; wheel up pauses; wheel or `pagedown`/`end` back to the bottom resumes. Verify: observed in the terminal; if no live pipeline exists, watch a finished job's long log and confirm it opens at the bottom.
