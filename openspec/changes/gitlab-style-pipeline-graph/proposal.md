## Why

The job graph is a single vertical list: up/down and left/right all walk the same flattened order, and status is color only. That is not how GitLab’s pipeline page works, so the operator cannot scan stages horizontally or move like the web graph.

## What Changes

- **BREAKING (graph keyboard and layout):** replace the one-column job list with a GitLab-style pipeline graph: stages as columns left-to-right, jobs stacked in each stage as rounded blocks, and directed `needs` arrows between those blocks.
- Up/down move among jobs in the focused stage; left/right move to an adjacent stage. Enter still opens the job log; Esc still returns to the pipeline list.
- Show each job’s status with a Nerd Font icon **and** the existing four status-bucket colors (icon is the primary glyph; color stays as a second cue).
- Keep GraphQL `needs` as the only source of arrows: do not invent edges from stage order, parse `.gitlab-ci.yml`, or scrape GitLab HTML.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `job-graph`: layout becomes stage columns with job cards and `needs` arrows (not a flattened list or rank-only columns). Keyboard becomes two-dimensional (vertical in a stage, horizontal across stages). Job status MUST include a Nerd Font icon in addition to bucket color.

## Impact

- `src/layout/`: stage-column layout, card rendering, and `needs` arrow paths; today’s `visualJobs` flatten + `formatJobLine` list is replaced for the graph screen.
- `src/app.tsx`: graph screen as a 2D grid of OpenTUI rounded boxes; graph key handlers split up/down vs left/right.
- `src/status.ts` (or a small icon helper): Nerd Font glyph per status, still mapped through the four buckets for color.
- Tests: `src/layout/dag.test.ts` and graph keyboard/render tests must expect columns, 2D focus moves, icons, and no invented edges.
- In-flight `polish-tui-chrome` and `add-navigation-loading-spinner` also touch the graph screen; this change owns job layout/nav/icons, not list/log chrome or loading copy.

## Non-goals

- Retry, cancel, play/manual, artifacts, MR entry, YAML visualize, or child-pipeline drill-down from bridge jobs.
- Mouse, a second HTTP client, PAT UI, or GitLab HTML scraping.
- Replacing OpenTUI/React/Bun or `glab`.
- Changing the pipeline list or job-log screens beyond sharing status icons if a job name appears there (logs stay a trace pane).
- Detecting whether the terminal’s font is a Nerd Font; the operator is expected to use one.
- Pixel-perfect GitLab bezier curves; TUI box-drawing is enough.
