## 1. Trace SGR parser

- [x] 1.1 Replace whole-chunk ANSI stripping in `src/log-text.ts` with a stateful scanner that keeps SGR color/bold, maps 16-color and `38;5`/`48;5` indexes, drops erase/section/other CSI, and holds an incomplete escape suffix — verify unit tests for red SGR, unstyled `ERROR`, `section_start`/`0K`, split CSI across chunks, `\r` → newline, ignored `38;2`, and the 200_000 visible-character cap
- [x] 1.2 Reset parser leftover and SGR when a log session starts (`logsReady` / empty buffer) so a previous job cannot leak color into the next — verify a model or log-text test that a new session starts unstyled

## 2. Log screen paint

- [x] 2.1 Keep `glab ci trace <job-id>` spawn unchanged; store visible text plus style runs from the parser on each `logChunk` — verify existing model tests still see plain `hello` in `logBuffer` (no CSI in the operator-visible string)
- [x] 2.2 Paint the framed log body from those runs (one node per consecutive style), leaving the waiting message unstyled — verify `src/app.test.tsx` (or a focused log-frame test) that a red SGR chunk renders red, unstyled `ERROR` is not forced red, and the panel chrome still shows live/ended

## 3. Verification

- [x] 3.1 Run `bun test`, `bunx tsc --noEmit`, and `openspec validate "job-log-ansi-colors" --strict` — verify all complete successfully
