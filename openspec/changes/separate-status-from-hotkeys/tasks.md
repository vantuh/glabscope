## 1. Chrome row split

- [x] 1.1 In `src/app.tsx`, rename `ScreenPanel`'s `footer` prop to `keyHelp`, add `justifyContent="space-between"` to the chrome footer row, and render the optional `status` node inside a `flexShrink={0}` box next to the help text; verify with `bunx tsc --noEmit` that the only remaining errors are the stale `footer` uses at the call sites (they are fixed in 1.2).
- [x] 1.2 Update all `ScreenPanel` call sites (startup, error, log, attempts, graph, pipelines) and the direct `ScreenPanel` render in `src/app.test.tsx` to the `keyHelp` prop, leaving every help string byte-identical; verify `bunx tsc --noEmit` passes and `git diff -U0 -- src/app.tsx` shows no change to any help-string literal.
- [x] 1.3 Drop the leading two-space prefix from `RefreshStatus` and `CopiedNotice`; verify `bun test src/app.test.tsx` passes and a captured frame on the list screen with a poll in flight has the spinner immediately after the right-aligned gap instead of `"  " + spinner`.

## 2. Tests for the two slots

- [x] 2.1 Add a test to `src/app.test.tsx`: on the pipeline list with a background poll in flight, the help text and the spinner render on the same row, the help text starts at the row's first content column, and the spinner ends at the row's last content column; verify the test passes, and that it fails when `justifyContent="space-between"` is temporarily removed.
- [x] 2.2 Add a test to `src/app.test.tsx`: on the job log after a copy, the chrome row still contains the exact help text `ended · y yank · esc back`, with `copied to clipboard` on the same row to its right; verify the test passes.
- [x] 2.3 Add a test to `src/app.test.tsx`: with no status pending, the list chrome row contains the help text only, with no spinner, no copy notice, and no placeholder text on its right; verify the test passes.
- [x] 2.4 Add a test to `src/app.test.tsx`: after a background refresh fails, the `refresh error:` message still renders as a body row above the chrome row and not inside the chrome row; verify the test passes.

## 3. Narrow-row behavior

- [x] 3.1 Add a test to `src/app.test.tsx` that renders a screen whose help text plus status exceed the chrome row width and asserts the full status label is still visible while the help text is the truncated one; verify the test passes, and that it fails if the `flexShrink={0}` wrapper around the status is removed.

## 4. Final verification

- [x] 4.1 Run the whole suite with `bun test` plus `bunx tsc --noEmit`; verify both exit clean with no failures and no type errors.
- [ ] 4.2 Run the TUI from a GitLab project (`bun /path/to/glab-pipeline-viewer/src/index.tsx`) and confirm on the job graph and the pipeline list that the polling spinner sits at the right edge of the chrome row separated from the keys, and on the job log that `copied to clipboard` sits at the right edge while `ended · y yank · esc back` stays left; record the terminal width used.
