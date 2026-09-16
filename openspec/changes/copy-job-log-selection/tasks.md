## 1. Clipboard helper

- [x] 1.1 Add a small `copyPlainText` wrapper that writes via OpenTUI host clipboard plus OSC 52 (best-available), skipping empty strings — verify a unit test that nonempty text is passed through and empty text does not call the writer

## 2. Log screen copy

- [x] 2.1 On the log screen, copy a finished nonempty mouse selection of the trace body through `copyPlainText`; do not copy chrome or fire on list/graph/attempts — verify an app or helper test that the selection handler writes selected text only when `screen` is logs and the selection is nonempty
- [x] 2.2 Handle `y` only on the log screen: copy `logBuffer` when nonempty, no-op while waiting; mention `y` in the log footer; leave `glab ci trace <job-id>` unchanged — verify app tests that `y` on a filled log calls `copyPlainText` with `logBuffer`, `y` on the waiting screen and on the graph does not, and the log footer includes `y`

## 3. Verification

- [x] 3.1 Run `bun test`, `bunx tsc --noEmit`, and `openspec validate "copy-job-log-selection" --strict` — verify all complete successfully
