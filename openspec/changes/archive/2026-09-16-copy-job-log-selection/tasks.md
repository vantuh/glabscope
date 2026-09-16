## 1. Clipboard helper

- [x] 1.1 Add a small `copyPlainText` wrapper that writes via OpenTUI host clipboard plus OSC 52 (best-available), skipping empty strings — verify a unit test that nonempty text is passed through and empty text does not call the writer

## 2. Log screen copy

- [x] 2.1 On the log screen, copy a finished nonempty mouse selection of the trace body through `copyPlainText`; do not copy chrome or fire on list/graph/attempts — verify an app or helper test that the selection handler writes selected text only when `screen` is logs and the selection is nonempty
- [x] 2.2 Handle `y` only on the log screen: copy `logBuffer` when nonempty, no-op while waiting; mention `y` in the log footer; leave `glab ci trace <job-id>` unchanged — verify app tests that `y` on a filled log calls `copyPlainText` with `logBuffer`, `y` on the waiting screen and on the graph does not, and the log footer includes `y`

## 3. Verification

- [x] 3.1 Run `bun test`, `bunx tsc --noEmit`, and `openspec validate "copy-job-log-selection" --strict` — verify all complete successfully

## 4. Copy feedback and selection reset

- [x] 4.1 Make `copyPlainText` report whether it wrote anything (nonempty text → `true`, empty → `false`) — verify the helper unit test asserts the write and the return value for both cases
- [x] 4.2 After a log-screen copy that wrote, clear the log selection and show a short-lived `copied to clipboard` notice in the log footer; an empty selection and `y` while waiting stay silent — verify app tests that the notice shows for both copy paths, that it clears itself with no input, and that the selection highlight is gone after a drag copy
- [x] 4.3 Run `bun test`, `bunx tsc --noEmit`, and `openspec validate "copy-job-log-selection" --strict` — verify all complete successfully

## 5. Review follow-up

- [x] 5.1 Make the copy notice non-selectable chrome — verify a test that a drag starting on the visible notice produces no second copy (fails while the notice is selectable)
- [x] 5.2 Tighten the selection assertions to the exact dragged characters, so copying the whole buffer would fail, and copy an SGR-styled line as plain text — verify `writes` equals the exact substring with no escape sequences
- [x] 5.3 Extend the no-copy coverage to the list and attempts screens and assert that an empty selection shows no notice
- [x] 5.4 Correct the stale design notes (tests stub `clipboardWriter`, not `copyPlainText`; notice lifetime is per log-screen visit) and name the copy notice in the chrome requirement
- [x] 5.5 Run `bun test`, `bunx tsc --noEmit`, and `openspec validate "copy-job-log-selection" --strict` — verify all complete successfully
