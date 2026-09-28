# Job log auto-scroll

## Why

The framed log panel never follows new trace output: when a live job streams, or a long finished trace is shown, the newest lines fall below the viewport and the operator must scroll down by hand after every chunk. Reading a running job means chasing the log instead of watching it.

## What Changes

- The log panel follows the newest trace output by default: when the screen opens and whenever new output arrives, the view sits at the bottom, so a live trace reads like `tail -f`.
- Scrolling up — mouse wheel or scroll keys (`up`, `pageup`) — pauses the follow. The operator reads history undisturbed while new output keeps accumulating below.
- Scrolling back to the bottom (wheel to the last line, or `pagedown`/`end`) re-engages the follow.
- No new keys; no chrome changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `job-logs`: the framed log panel MUST follow the newest trace by default, MUST stop following when the operator scrolls up, and MUST resume following when they return to the bottom.

## Impact

- `src/app.tsx`: the log screen's scrollable panel gets sticky-bottom follow (OpenTUI `stickyScroll` plus `stickyStart="bottom"`); OpenTUI's manual-scroll tracking provides the pause/resume. No model/reducer change, no glab change, no new process.
- Tests in `src/app.test.tsx`: opening a long trace shows its tail; streamed chunks keep the tail visible; after scrolling up, arriving chunks do not move the view; returning to the bottom resumes following.

## Non-goals

- No follow/paused indicator in the log chrome.
- No new keys for jumping to the bottom — the existing `end` key and wheel already reach it.
- No change to scrolling behavior of the list, graph, or attempts screens.
- No change to the retained-buffer cap or the copy-on-select / yank behavior.
- No PTY/embedded-terminal rewrite of `glab ci trace`.
