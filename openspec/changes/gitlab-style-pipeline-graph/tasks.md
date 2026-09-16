## 1. Status icons

- [x] 1.1 Add `statusIcon(status)` next to `statusBucket` in `src/status.ts` with Nerd Font glyphs for success, failed, running/pending, skipped, canceled, and a fallback for other; verify unit tests assert distinct glyphs for that mix and that colors still come only from the four buckets

## 2. Stage layout and 2D focus

- [x] 2.1 Add a stage-column builder (group by `JobNode.stage`, column order = first-seen name, empty stage last as `(no stage)`) that still takes `needs` edges from `buildDag` (or the same name-match walk) and invents none; verify unit tests: multi-stage columns left-to-right, stages-only fixture has zero edges, diamond/`src/fixtures/pipeline-jobs-needs.json` still has only named `needs` edges
- [x] 2.2 Add `moveFocus(columns, focusedId, dir)` for up/down (same column, no wrap) and left/right (adjacent column, clamp to last job, no wrap off the ends); verify unit tests for a tall column, a shorter neighbor, first/last stage, and that up/down never change stage

## 3. Graph screen

- [x] 3.1 Replace the graph `scrollbox` list in `src/app.tsx` with a horizontal row of stage columns, each job a rounded bordered card (name + `statusIcon` + bucket color, brighter border when focused); verify a render/`captureCharFrame` test shows more than one column for a two-stage graph, rounded box characters, and the focused job’s name
- [x] 3.2 Draw `needs` arrows in the connector strips between cards (orthogonal box-drawing); verify the needs fixture’s render contains a path/arrow between a needed job and its dependent, and a stages-only graph has no invented `→`/`-->` between unrelated jobs
- [x] 3.3 Wire graph keys to `moveFocus` instead of flattening `visualJobs` ± 1; verify tests or a small harness: up/down stay in-stage, left/right change stage, Enter still opens logs for the focused id, Esc still returns to the list, bridge job remains one card
- [x] 3.4 Keep truncation warning, loading line, polling, and `glab api graphql` / `glab ci trace` unchanged; verify existing poll/log tests still pass (`bun test`)

## 4. Docs and leftover list layout

- [x] 4.1 Stop using the flattened `formatJobLine` list on the graph screen (remove or keep helpers only if tests still need them); verify no graph render path prints `>[name] <- deps` as the primary UI
- [x] 4.2 Note in README that the graph expects a Nerd Font; verify the README run section mentions it

## 5. GitLab stage order and retries

- [x] 5.1 Add `pipeline.stages.nodes { name }` and `jobs.nodes.retried` to `PIPELINE_JOBS_QUERY` / `parsePipelineGraph` (missing `retried` defaults false; keep every attempt in `jobs`); verify the query test and that the needs fixture’s `stageNames` start with `prepare` before `security`
- [x] 5.2 Order columns from `stageNames`, leftover named stages first-seen after that list, empty stage last; do not sort names; verify a unit test that `prepare` is left of `security` on the needs fixture
- [x] 5.3 Collapse graph cards and `needs` edges to `latestJobs` (prefer `retried: false`, else highest numeric id, grouped by name+stage); verify one card for a retried pair and the watch-refresh test
- [x] 5.4 Add an attempts screen when Enter hits a card with more than one attempt (newest-first; Enter opens that attempt’s log; Esc log→attempts→graph; poll while on attempts; single attempt still opens logs); verify model tests and a render test
- [x] 5.5 Restore keyboard scenarios `Loading feedback while opening a log`, `Repeated confirm while loading`, and `Opening the log fails` into this change’s spec delta
