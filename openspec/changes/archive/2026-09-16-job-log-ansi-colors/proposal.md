## Why

The job log pane shows a plain dump of `glab ci trace` after stripping every ANSI sequence. GitLab’s web viewer colors the same trace by mapping those sequences to styles, so errors that are already red in the job (and on the web) look unstyled here. The GitLab CLI has no highlight flag to turn on.

## What Changes

- Keep SGR color and intensity from the official `glab ci trace <job-id>` stream and paint them on the log screen.
- Still drop GitLab control sequences that are not color (erase-to-end-of-line, section markers) and treat carriage returns as line breaks, as today.
- Carry SGR state across streamed chunks so a split escape does not leak garbage or lose color.
- Leave traces with no ANSI unstyled. Do not invent keyword coloring for `ERROR` / `FAIL`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `job-logs`: the framed log body MUST show SGR colors from the job trace, matching GitLab web’s ANSI mapping rather than a second highlighter.

## Impact

- `src/log-text.ts` (and tests): stop stripping color SGR; parse it into styles; keep junk-sequence and buffer-cap behavior.
- `src/app.tsx` (and log-screen tests): render the log body with those styles instead of a single unstyled string.
- `src/model.ts` can keep a string buffer if styles are derived at paint time, or hold styled runs if that is simpler. No new GitLab command, HTTP client, or dependency.

## Non-goals

- No `glab` flags, custom trace poller, HTML scrape, or PTY/embedded-terminal rewrite.
- No tree-sitter / language syntax highlighting.
- No extra keyword regex coloring beyond ANSI already in the trace.
- No collapsible `section_start` / `section_end` UX (markers stay hidden).
- No 24-bit truecolor requirement; 8/16 color plus 256-color (`38;5;n` / `48;5;n`) is enough to match common GitLab job logs.
