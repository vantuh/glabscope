## 1. List data

- [x] 1.1 Add `created_at?: string` to `GlabPipelineJson` and `createdAt: string` to `PipelineRow` in `src/glab/list.ts`, mapping it through with a `""` default, and verify with new `src/glab/list.test.ts` cases that a row carries `created_at` and that a pipeline without it yields `""` (`bun test src/glab/list.test.ts` green).

## 2. Pure helpers

- [x] 2.1 Add `refLabel(ref)` in `src/pipeline-ref.ts` and verify with tests covering `refs/merge-requests/2/head` -> `!2`, `refs/heads/release/2.1-hotfix` -> `release/2.1-hotfix`, bare `main` -> `main`, `refs/tags/v1.0` -> `v1.0`, and an unrecognized ref returned unchanged.
- [x] 2.2 Add `relativeTime(iso, now)` in `src/relative-time.ts` and verify with tests using a fixed `now`: seconds, minutes, hours, days, and weeks boundaries produce `Xs`/`Xm`/`Xh`/`Xd`/`Xw`, and an empty or unparsable value produces `—`.
- [x] 2.3 Add `src/list-layout.ts` with the per-column width computation from the visible rows plus `fit(text, width)` (truncate with `…`, then pad), and verify with tests that mixed status-word lengths align the later columns, an over-long name is ellipsized into a single line, and a narrow available width shrinks the name to its minimum and drops the started column while the id and status columns remain.

## 3. List screen

- [x] 3.1 Render each pipeline row in `src/app.tsx` as one `<text>` of spans (marker, id, status, name, started) with `statusIcon()` + `BUCKET_COLOR` confined to the status cell and the id/started cells in the muted chrome color, then verify in `src/app.test.tsx` that a rendered frame shows the `>` marker before the id, the glyph plus status word, and `!2` for an MR-ref row.
- [x] 3.2 Add the muted header row above the scrollbox using the same computed widths, and verify in `src/app.test.tsx` that the header is present in the frame, that its started cell and the first row's started cell land in the same column, and that the header is still present after the selection scrolls past the last visible row.
- [x] 3.3 Implement the narrow-panel degradation (name shrinks first, started drops before id and status), and verify with a frame rendered at a narrow width that the id and status are still visible, the started column is gone, and the number of rendered row lines still equals the number of pipelines (no wrapping).

## 4. Verification

- [x] 4.1 Run the full `bun test` suite and `./node_modules/.bin/tsc --noEmit` and verify both are green with no new failures against the pre-change baseline (173 passing tests, clean type check at plan time; 200 passing after this change).
- [x] 4.2 Run `bun start` from a GitLab-bound working tree and verify by eye that columns line up, names read as `!N`/branch/tag, ages advance across a poll cycle without a manual refresh, and narrowing the terminal drops the started column instead of wrapping rows; operator ran it from their own GitLab-bound working tree and confirmed the result.
