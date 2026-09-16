## Context

See `proposal.md` for motivation. Logs still come from `glab ci trace <job-id>` via the existing `Bun.spawn` pipe in `src/glab/trace.ts`. The log screen paints parsed runs in a focused sticky `scrollbox`. `createCliRenderer()` leaves mouse tracking on (`useMouse` defaults true), so Herdr cannot copy-on-select inside this pane. OpenTUI already starts mouse selections on text (`selectable` defaults true on text nodes) and emits a `selection` event; the app never writes that text to a clipboard. `logBuffer` is already the operator-visible string (no CSI). `y` is unused.

## Goals / Non-Goals

**Goals:**
- On `screen === "logs"`, copy a finished nonempty mouse selection of the trace body.
- On that screen, `y` copies `logBuffer` when it is nonempty.
- Keep mouse tracking so wheel still scrolls the framed log.

**Non-Goals:**
- No new GitLab command, REST client, or trace poller — still `glab ci trace <job-id>`.
- No `useMouse: false`.
- No copy handlers on list/graph/attempts.
- No visual toast beyond footer `y`.

## Decisions

### 1. Keep OpenTUI mouse; copy on selection finish
Subscribe to renderer selection (OpenTUI’s selection event / React selection hook) and, only while the log screen is current, write `getSelectedText()` when the selection is nonempty and dragging has finished.

Alternative: disable mouse so Herdr copy-on-select works. Rejected — operators lose in-app wheel scroll, which the framed log already uses.

Alternative: yank-only (`y` / `Y`). Rejected — the requested Herdr gesture is select-and-already-copied.

### 2. Clipboard via OpenTUI host + OSC 52
Write through OpenTUI’s clipboard helpers (`writeText` with best-available destination, plus OSC 52). Nested Herdr panes often swallow OSC 52; host clipboard is the path that matches “it landed in the buffer.” Extract a tiny `copyPlainText(text)` so tests can stub the write.

Do not shell out to `pbcopy` unless the OpenTUI write fails in a follow-up; that is outside the first slice.

### 3. Yank source is `logBuffer`, not the viewport
`y` copies the retained visible buffer (capped at 200_000 characters), not only the on-screen rows. Waiting placeholder is not retained in `logBuffer`; empty buffer → no-op.

### 4. Footer
Log footer becomes `live|ended · y yank · esc back` (wording can be shorter as long as `y` is visible).

## Risks / Trade-offs

- [Selection event fires while dragging] → copy only when the selection is finished (not mid-drag), and skip empty strings.
- [Selection includes chrome] → keep title/footer as non-selectable chrome; only the log body text is selectable.
- [OSC 52 ignored inside Herdr] → prefer host clipboard write; verify manually in a Herdr pane.
- [Live append during a drag] → copy whatever the selection object reports at finish; do not freeze the buffer for mouse copy.
- [Tests cannot see the real clipboard] → stub `copyPlainText` and assert it was called with `logBuffer` / selected text.

## Migration Plan

Restart the TUI. Rollback is reverting the change; `glab ci trace` is unchanged.
