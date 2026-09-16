## Why

The chrome footer is one string with the status node pasted onto its tail, so "copied to clipboard" or the refresh spinner reads as another key hint appended to `y yank · esc back`. Status and keys are different kinds of information and the operator has to re-parse the whole line to tell them apart.

## What Changes

- The screen chrome gets two distinct slots instead of one mixed line: a **key help line** (keys only) and a **status area** (transient status only).
- The status area is pinned to the right edge of the same chrome row; the key help line stays flush left. The two never share text.
- `ScreenPanel` takes the two slots as separate props, so a caller can no longer append status text to the key help string.
- Status that lands in the status area: the in-flight refresh/polling spinner (pipeline list, job graph, job attempts) and the `copied to clipboard` notice (job log). Both stop carrying the `"  "` prefix that used to separate them from the help text.
- Non-transient messages stay content: the yellow `refresh error: … — retrying` body row is unchanged, as is the `job list truncated at 100` row and the dim loading overlay.
- Key help text itself is unchanged: the same keys are listed on the same screens, and the status area rendering nothing changes nothing about the help line.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `screen-chrome`: the key help line must carry keys only, and transient status must render in a separate status area pinned to the right edge of the chrome row, never concatenated onto the help text.

## Impact

- `src/app.tsx`: `ScreenPanel` splits its single `footer` + trailing `status` pair into a key-help slot and a justified status slot; the four call sites (startup, error, list, graph, attempts, log) pass the two separately, and `RefreshStatus` / `CopiedNotice` drop their leading separator.
- `src/app.test.tsx`: existing chrome tests read the footer row by substring (`y yank`, `refreshing…`, `copied to clipboard`) and keep working; new assertions cover the split (keys left, status right on the same row, no status text inside the help string).
- No new dependency, no new glab command, no change to polling, the model reducer, or any spec outside `screen-chrome`.
- The pending `retry-failed-job` change also modifies `screen-chrome`'s keymap requirement; whichever lands second must fold the other's clause in rather than drop it.

## Non-goals

- Moving persistent diagnostics (`refresh error: … — retrying`, `job list truncated at 100`) out of the screen body into the status area.
- A multi-line status log, status history, scrollback, or auto-dismiss timers beyond the existing `copied to clipboard` notice.
- Changing which statuses exist, when polling shows a spinner, or any key binding.
- Restyling the frame, title, or colors beyond what the two slots already use.
