## Why

The pipeline list draws each pipeline as one unaligned, fully tinted line (`> #1458696  failed  refs/merge-requests/2/head`). Column positions drift between rows because status words differ in length, the status-bucket color smears over the whole row instead of marking the status, the git ref is shown raw, and there is no start time at all — the operator must open a pipeline to learn when it ran.

## What Changes

- Render each pipeline as fixed columns: pipeline id, status, name, started.
- Move the bucket color onto the status cell and give it the status icon the other screens already use (`v success`, `x failed`); keep the id and the time muted and the name neutral.
- Derive a human name from the ref: `refs/merge-requests/2/head` becomes `!2`, `refs/heads/x` becomes `x`, `refs/tags/v1.0` becomes `v1.0`.
- Show `created_at` in a started column as relative time (`4m`, `3h`, `2d`).
- Add a muted header row pinned above the scrolling rows to label the columns.
- Pad and truncate long names with an ellipsis instead of letting them wrap, which currently breaks row alignment. On a narrow panel the name column shrinks first and the started column is dropped before id and status.
- Carry `createdAt` on `PipelineRow`; a row without a timestamp renders `—`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pipeline-list`: the row requirement changes from "one of four status colors per row" to an aligned multi-column row whose bucket color and icon mark the status cell, plus new requirements for the human-readable name, the relative start time, the column header, and truncation instead of wrapping.

## Impact

- `src/glab/list.ts` (`createdAt`, optional `created_at` in the JSON shape), `src/app.tsx` (list rendering and column fitting), two new pure helper modules with unit tests, and the `row()` fixture/assertions in `src/app.test.tsx` and `src/glab/list.test.ts`.
- No change to `glab ci list -F json`, no new GitLab calls, no navigation, keys, polling, or rate-limit changes.
- No changes to the graph, attempts, or log screens.

## Non-goals

- No commit title, duration, user, or source columns, and no switch of the list data path from `glab ci list -F json` to GraphQL.
- No bordered table, no `TextTable`, no background-highlighted selection row.
- No sorting, filtering, grouping, or pipeline actions.
- No change to the four status-bucket vocabulary or the DAG/log screens.
