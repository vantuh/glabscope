## Context

See `proposal.md` for motivation. Today `src/layout/dag.ts` already builds a needs-ranked DAG (`buildDag`) but `src/app.tsx` flattens `visualJobs(dag)` into one `<text>` list. Graph keys treat up/left as “previous in that flat list” and down/right as “next”. Job color comes from `BUCKET_COLOR` in `src/status.ts`; there are no status glyphs.

GitLab I/O stays unchanged: `glab ci list -F json` for the list screen, `glab api graphql` (`pipelineJobsQuery`) for jobs/status/stage/`needs` plus `pipeline.stages.nodes { name }` and `CiJob.retried`, `glab ci trace <job-id>` for logs. Do not parse `.gitlab-ci.yml` or scrape HTML for layout.

In-flight `polish-tui-chrome` frames the graph panel; `add-navigation-loading-spinner` adds loading copy. This change replaces only the graph *body* and graph arrow semantics.

## Goals / Non-Goals

**Goals:**
- Stage-column layout + card nodes + `needs`-only arrows on the graph screen.
- 2D focus: up/down in a column, left/right across columns, clamp when the target column is shorter.
- Nerd Font status icon plus existing four-bucket colors.
- Keep polling, Esc, Enter, bridge-as-one-node, and truncation warning as they are.
- Column X follows GitLab `Pipeline.stages.nodes` order. Graph cards collapse retries to the latest attempt; earlier attempts stay in the model for an attempts list.

**Non-Goals:**
- Bézier curves, mouse hit-testing, or a canvas besides OpenTUI boxes/text.
- New `glab` commands (`ci retry` / cancel / play). Do not filter `jobs(retried: false)` at query time — fetch every attempt.
- GraphQL `stages.groups` or other fields beyond `stages.nodes.name`, existing job fields, and `retried`.
- Font detection or a config toggle for ASCII fallback icons.

## Decisions

### 1. Columns are CI stages, ranks stay an edge helper

Group jobs by `JobNode.stage`. Column order is `pipeline.stages.nodes { name }` from GraphQL, left to right, **not** first-seen in the jobs array (jobs are newest-first and reverse GitLab’s stage order) and **not** a homemade sort of stage names. Named stages that appear on jobs but not in `stages.nodes` append in first-seen leftover order. Jobs with an empty stage sit in a single `"(no stage)"` column at the end, not scattered.

Keep `buildDag` (or extract its edge walk) as the **only** source of arrows: name-matched `needs`, no stage-to-stage invented edges. Do **not** use topological ranks as the on-screen X axis; that is the Job dependencies view, which the operator declined.

**Alternative considered:** Rank columns from `buildDag.ranks`. Rejected — user asked for the pipeline page (stages), not the DAG ranks view.

**Alternative considered:** First-seen stage name in the jobs payload (no extra GraphQL). Rejected — GitLab returns jobs newest-first, so first-seen puts later stages on the left (`security` before `prepare`).

### 2. Cards in OpenTUI, arrows in the gaps

Render each stage as a vertical `box` in a horizontal row. Each job is a nested `box` with `borderStyle="rounded"`, job name, and status icon; the focused card uses a brighter `borderColor` (still muted chrome vs status fg). Between columns, a narrow connector strip of box-drawing (`─`, `│`, `╭`, `╮`, `╰`, `╯`, `▶` or `→`) is painted from a small grid of connector cells derived from the same layout.

If a `needs` target is not in the next column (skipped stages, same-stage needs), still draw a routed path; if the path would overlap cards, prefer going around in the connector channels rather than dropping the edge.

**Alternative considered:** One ASCII canvas (`renderDagAscii` 2D rewrite) with no per-job `box`. Rejected — the operator asked for rounded GitLab-like blocks; OpenTUI already has rounded borders (also planned in `polish-tui-chrome` for the *screen* frame).

**Alternative considered:** Flex layout without a connector grid (cards only). Rejected — arrows would not line up.

### 3. Two-dimensional focus is a (stageIndex, jobIndex) walk

Pure function, e.g. `moveFocus(columns, focusedId, dir)`, used by `app.tsx` instead of `visualJobs` ± 1.

- `up`/`down`: clamp inside the current column; no wrap.
- `left`/`right`: adjacent column; same job index, or last job if that column is shorter; no wrap off the first/last stage.
- `openGraph`: focus the first job of the leftmost GitLab stage (first column after `stages.nodes` layout), not `jobs[0]` in payload order.
- Refresh: keep the visible card by id, else by name+stage when the previous id is now a retried-away attempt.

`focusedJobIndex` in `model.ts` can stay an index into `graph.jobs`; the layout layer maps id → column cell. Visible cards are `latestJobs`, not every attempt.

### 4. Icons by GitLab status string, color by bucket

Add `statusIcon(status: string): string` next to `statusBucket`. Map common GitLab statuses to Nerd Font glyphs (check, close, spinner/play, clock, skip, cancel). Unknown statuses use the `other` glyph. Card `fg` stays `BUCKET_COLOR[bucket]` so the four-bucket rule holds.

Glyphs live as UTF-8 in source; no extra npm font package. README one-liner: graph assumes a Nerd Font in the terminal.

**Alternative considered:** One icon per bucket only. Rejected — skipped vs canceled would collapse into `other`; GitLab distinguishes them. Color still buckets; icon can be more specific.

### 5. Horizontal overflow

If stages do not fit, wrap the graph body in the existing `scrollbox` (horizontal + vertical). Do not hide stages.

### 6. Latest card on the graph, all attempts behind Enter

Keep every GraphQL job in `PipelineGraph.jobs`. Graph cards and `needs` edges use `latestJobs`: group by name+stage (matrix parallels have distinct names), pick `retried: false`, else the highest numeric id. Missing `retried` defaults to false.

Enter on a card with more than one attempt opens an attempts screen (newest-first). Enter there opens that attempt’s log. Esc from logs returns to attempts when opened from there (`logBackScreen`). A single-attempt card still opens logs directly. Graph polling continues on the attempts screen. Do not implement `glab ci retry` here.

**Alternative considered:** Filter `jobs(retried: false)` in GraphQL. Rejected — the attempts list needs every attempt.

## Risks / Trade-offs

- [Connector drawing in OpenTUI is fiddly] → Implement layout + `moveFocus` + icon unit tests first; then a connector renderer with fixtures (`src/fixtures/pipeline-jobs-needs.json`). Prefer simple orthogonal paths over pretty curves.
- [Same-stage `needs`] → Still draw an edge (loop/side channel); never drop the relationship.
- [Missing Nerd Font] → Icons become tofu; documented; no runtime detect.
- [Merge conflict with chrome/spinner] → Touch graph body and keys only; leave loading text and outer frame to those changes.
- [Wide pipelines] → Scroll rather than shrinking cards to unreadability.

## Migration Plan

Personal TUI, no stored layout. Ship as a graph-screen visual/keyboard break. Rollback is revert of this change.

## Open Questions

None. Stage-vs-needs was confirmed with the operator: GitLab pipeline page (stage columns + dependency arrows + rounded job blocks).
