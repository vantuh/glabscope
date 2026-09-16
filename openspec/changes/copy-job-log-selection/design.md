## Context

See `proposal.md` for motivation. Logs still come from `glab ci trace <job-id>` via the existing `Bun.spawn` pipe in `src/glab/trace.ts`. The log screen paints parsed runs in a focused sticky `scrollbox`. `createCliRenderer()` leaves mouse tracking on (`useMouse` defaults true), so Herdr cannot copy-on-select inside this pane. OpenTUI already starts mouse selections on text (`selectable` defaults true on text nodes) and emits a `selection` event; the app never writes that text to a clipboard. `logBuffer` is already the operator-visible string (no CSI). `y` is unused.

## Goals / Non-Goals

**Goals:**
- On `screen === "logs"`, copy a finished nonempty mouse selection of the trace body.
- On that screen, `y` copies `logBuffer` when it is nonempty.
- After a copy that wrote text, drop the selection and show a short-lived `copied to clipboard` notice in the footer.
- Keep mouse tracking so wheel still scrolls the framed log.

**Non-Goals:**
- No new GitLab command, REST client, or trace poller — still `glab ci trace <job-id>`.
- No `useMouse: false`.
- No copy handlers on list/graph/attempts.
- No floating toast window: the notice reuses the log panel's existing footer status slot.

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
Log footer becomes `live|ended · y yank · esc back` (wording can be shorter as long as `y` is visible). The `copied to clipboard` notice paints into the footer's existing `status` slot, so no new chrome row is added.

### 5. Feedback: optimistic notice plus a dropped selection
`copyPlainText` reports whether it wrote anything. When it did, the log screen (a) clears the renderer selection so the body repaints unselected and (b) shows `copied to clipboard` in the footer status slot for ~1.5 s via a timer, which also clears on unmount.

The notice is optimistic: OpenTUI's write is fire-and-forget and the TUI cannot read the clipboard back, so the feedback means "a copy was issued", not "the terminal accepted it". The selection clear rides on the same signal, so a drag that copied nothing leaves the body untouched.

Alternative: announce only after `writeText` confirms (host `written` / OSC 52 `attempted`). Rejected — it makes `copyPlainText` async, delays feedback behind the host timeout, and tells the operator nothing more inside Herdr panes, where the host path is not attempted at all.

## Risks / Trade-offs

- [Selection event fires while dragging] → copy only when the selection is finished (not mid-drag), and skip empty strings.
- [Selection includes chrome] → keep title/footer as non-selectable chrome; only the log body text is selectable.
- [OSC 52 ignored inside Herdr] → prefer host clipboard write; verify manually in a Herdr pane.
- [Live append during a drag] → copy whatever the selection object reports at finish; do not freeze the buffer for mouse copy.
- [Tests cannot see the real clipboard] → stub `copyPlainText` and assert it was called with `logBuffer` / selected text.
- [Optimistic feedback can lie] → the notice may appear when the terminal drops the write; accepted because the clipboard cannot be read back, and silence would be worse feedback. Revisit if a `pbcopy` fallback lands.
- [Notice timer outliving the screen] → the notice renders only on the log screen and the timer is cleared on unmount, so leaving the log cannot resurrect it.

## Migration Plan

Restart the TUI. Rollback is reverting the change; `glab ci trace` is unchanged.
