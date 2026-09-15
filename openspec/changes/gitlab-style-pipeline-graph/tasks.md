## 1. Status icons

- [ ] 1.1 Add `statusIcon(status)` next to `statusBucket` in `src/status.ts` with Nerd Font glyphs for success, failed, running/pending, skipped, canceled, and a fallback for other; verify unit tests assert distinct glyphs for that mix and that colors still come only from the four buckets

## 2. Stage layout and 2D focus

- [ ] 2.1 Add a stage-column builder (group by `JobNode.stage`, column order = first-seen name, empty stage last as `(no stage)`) that still takes `needs` edges from `buildDag` (or the same name-match walk) and invents none; verify unit tests: multi-stage columns left-to-right, stages-only fixture has zero edges, diamond/`src/fixtures/pipeline-jobs-needs.json` still has only named `needs` edges
- [ ] 2.2 Add `moveFocus(columns, focusedId, dir)` for up/down (same column, no wrap) and left/right (adjacent column, clamp to last job, no wrap off the ends); verify unit tests for a tall column, a shorter neighbor, first/last stage, and that up/down never change stage

## 3. Graph screen

- [ ] 3.1 Replace the graph `scrollbox` list in `src/app.tsx` with a horizontal row of stage columns, each job a rounded bordered card (name + `statusIcon` + bucket color, brighter border when focused); verify a render/`captureCharFrame` test shows more than one column for a two-stage graph, rounded box characters, and the focused job’s name
- [ ] 3.2 Draw `needs` arrows in the connector strips between cards (orthogonal box-drawing); verify the needs fixture’s render contains a path/arrow between a needed job and its dependent, and a stages-only graph has no invented `→`/`-->` between unrelated jobs
- [ ] 3.3 Wire graph keys to `moveFocus` instead of flattening `visualJobs` ± 1; verify tests or a small harness: up/down stay in-stage, left/right change stage, Enter still opens logs for the focused id, Esc still returns to the list, bridge job remains one card
- [ ] 3.4 Keep truncation warning, loading line, polling, and `glab api graphql` / `glab ci trace` unchanged; verify existing poll/log tests still pass (`bun test`)

## 4. Docs and leftover list layout

- [ ] 4.1 Stop using the flattened `formatJobLine` list on the graph screen (remove or keep helpers only if tests still need them); verify no graph render path prints `>[name] <- deps` as the primary UI
- [ ] 4.2 Note in README that the graph expects a Nerd Font; verify the README run section mentions it
