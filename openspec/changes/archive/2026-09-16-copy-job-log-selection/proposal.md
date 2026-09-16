## Why

On the job log screen, OpenTUI owns mouse tracking, so Herdr-style copy-on-select never reaches the multiplexer clipboard. Operators cannot grab a stack trace by dragging, and there is no key to yank the whole captured trace.

## What Changes

- On the log screen only, finishing a mouse drag over job-trace text copies that visible selection to the system clipboard immediately (Herdr-like: select → already copied).
- On the log screen, pressing `y` copies the entire retained visible log buffer (plain text, no SGR), including live appends so far.
- A copy that wrote text shows a short-lived `copied to clipboard` notice in the log footer and drops the selection highlight, for both the mouse gesture and `y`.
- Log chrome (title, live/ended, keymap, the copy notice) stays out of both copies. Wheel/keyboard scroll of the framed log stays.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `job-logs`: the log screen MUST copy a finished mouse selection of the trace body to the clipboard, and MUST copy the full retained visible buffer on `y`.

## Impact

- `src/app.tsx`: wire log-screen mouse selection to clipboard; handle `y` while `screen === "logs"`; mention `y` in log footer.
- Selection clear and footer notice after a copy that wrote text (`src/app.tsx`, no model/reducer change).
- Clipboard write through OpenTUI’s existing host/OSC 52 path (no new GitLab command or HTTP client).
- Tests in `src/app.test.tsx` (and a small clipboard helper test if write is extracted): mouse selection copy, `y` copies buffer, waiting/empty no-op, list/graph/attempts unchanged, notice shown for both copy paths and clears itself, selection dropped after a drag copy.

## Non-goals

- No copy-on-select or `y` on list, graph, attempts, or error screens.
- No `useMouse: false` / handing selection back to Herdr (that would drop in-app wheel scroll).
- No PTY/embedded-terminal rewrite of `glab ci trace`.
- No keyboard-driven selection (vim visual mode); mouse drag plus full-buffer yank only.
- No floating toast window: the notice is a footer text slot, and a copy that wrote nothing stays completely silent.
