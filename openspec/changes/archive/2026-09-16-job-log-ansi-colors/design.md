## Context

See `proposal.md` for motivation. Logs still come from `glab ci trace <job-id>` via the existing `Bun.spawn` pipe in `src/glab/trace.ts` (stdout and stderr concatenated into `logChunk` actions). `src/log-text.ts` currently runs `stripAnsiSequences` on every chunk, then stores a plain string in `logBuffer`. The log screen paints that string as one unstyled text node inside a sticky `scrollbox`. OpenTUI can already paint per-span foreground/background; it does not ship an ANSI-to-style parser.

Config still says “PTY pane”; the shipped path is a pipe plus a string buffer. This change keeps the pipe.

## Goals / Non-Goals

**Goals:**
- Map SGR from the trace onto styled runs and paint them in the existing framed log panel.
- Keep `glab ci trace <job-id>` as the only log source.
- Preserve the 200_000-character cap on visible text and live append + sticky scroll.

**Non-Goals:**
- No PTY / embedded terminal, no custom REST trace poller, no new GitLab client.
- No keyword highlighter and no collapsible sections.

## Decisions

### 1. Parse SGR in-process; keep the glab pipe
Extend `src/log-text.ts` with a small stateful scanner: consume CSI `m` (reset, bold, standard/bright fg/bg, `38;5;n` / `48;5;n`). Drop other CSI (including `0K`), OSC, and GitLab `section_start` / `section_end` payloads. Normalize `\r\n` and `\r` to `\n` as today.

Hold an incomplete escape suffix between chunks so a split `\x1b[` cannot leak into the panel or lose the following color.

Paint from styled runs (visible text + fg/bg/bold). Keep `logBuffer` as visible text for tests that only assert content, or derive content from the same runs; do not keep raw CSI in the string that tests treat as the operator-visible log.

Alternative: embed a PTY and let the terminal emulator render ANSI. Rejected — Esc must remain “back to graph”, and the current scrollbox + sticky follow already works.

Alternative: keep stripping and regex-color `ERROR`. Rejected — diverges from GitLab web.

### 2. Map colors to the same buckets GitLab uses
Use 16-color SGR as named terminal colors and 256-color indexes via OpenTUI’s existing indexed-color → RGB helper. Ignore 24-bit `38;2` / `48;2` (treat as no color change) to stay aligned with GitLab’s documented 8-bit job-log colors.

### 3. Cap visible characters, not raw bytes
Apply `MAX_LOG_CHARS` to visible text after parse. When trimming from the front, drop whole runs (or split a run) so a cap never starts mid-escape. Incomplete CSI stays in the scanner leftover, not in the capped buffer.

### 4. Restyle on each paint from retained runs
Rebuild styled children (or `StyledText`) from the retained runs when the log screen renders. Avoid putting hundreds of thousands of React children one-per-character; one node per consecutive same-style run is enough.

## Risks / Trade-offs

- [Chunk splits CSI] → leftover prefix on the scanner until the sequence completes or is discarded as junk.
- [Front-trim of a 200k log drops a color that should apply to later text] → keep the active SGR on the scanner independently of trimmed runs; only the visible window is capped.
- [False “highlighting” expectation for unstyled ERROR] → spec and tests lock default color for unstyled wording.
- [Pipe vs PTY: tools that detect TTY may emit fewer colors] → accept GitLab’s stored trace; `glab ci trace` is already a pipe today, so this does not regress vs current fetch.

## Migration Plan

Restart the TUI. Rollback is reverting the commit; `glab` usage is unchanged.
