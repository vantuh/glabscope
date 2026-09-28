## Context

The log screen (`src/app.tsx`, `model.screen === "logs"`) renders the trace inside one focused scrollable panel. That panel already passes `stickyScroll`, but OpenTUI's `ScrollBoxRenderable` only uses `stickyScroll` to pin the view when `stickyStart` is also set (`node_modules/@opentui/core` bundle: `recalculateBarProps` skips all pinning branches when `stickyStart` is undefined and `isAtStickyPosition()` is false without it). So today new trace lines never pull the view to the bottom — the complaint in the proposal.

OpenTUI's sticky machinery already implements the whole requested behavior:

- With `stickyScroll` + `stickyStart="bottom"`, every content-size change (`recalculateBarProps`) re-pins the view to the bottom unless the operator scrolled away (`_hasManualScroll`).
- `syncManualScrollState` sets `_hasManualScroll` whenever the operator's wheel or scroll-key input leaves the sticky position, which pauses the pinning; wheel (`onMouseEvent`) and key input (`handleKeyPress` → scrollbar `onChange`) both go through it.
- While `_hasManualScroll` is set, returning within one line of the bottom (`isAtStickyReengagePoint`: `scrollTop >= maxScrollTop - 1`) clears it and resumes pinning.
- Short content (`maxScrollTop <= 1`) reports no manual scroll, so a replaced trace (retry → new attempt) naturally restarts from the follow state.

## Goals / Non-Goals

**Goals:**

- Default-follow: log screen opens at the bottom; arriving output keeps the tail visible.
- Pause on scroll-up (wheel or scroll keys), resume when scrolled back to the bottom.
- Reuse OpenTUI's scroll machinery; keep the change to one JSX prop.

**Non-Goals:**

- No follow/paused indicator, no new keys, no chrome changes.
- No scrolling changes on the list, graph, or attempts panels (the graph panel intentionally uses `scrollChildIntoView` focus tracking instead of bottom-sticky).
- No changes to trace capture, buffer cap, copy/yank, or glab commands (`glab ci trace` stays the only log source).

## Decisions

1. **Set `stickyStart="bottom"` on the log panel's scrollbox, keep `stickyScroll`.** One prop completes what `stickyScroll` was already half-enabling. No custom `useEffect`/interval to force-scroll on updates — fighting the framework would reintroduce the race this machinery solves (content size changes asynchronously on every chunk). Alternative considered: manual `scrollToBottom()` on each stream chunk in an effect; rejected because it re-implements OpenTUI's size-change hook, needs a ref, and breaks pause-on-scroll-up tracking.

2. **Rely on OpenTUI's `_hasManualScroll` pause/resume, no app-level follow state.** The model/reducer stays untouched. The only observable difference from a hand-rolled flag is the resume trigger: OpenTUI resumes within one line of the bottom, which matches "scrolled back to the bottom". Alternative considered: app-level `follow` state toggled by wheel/key handlers and a "resume" key — rejected as new keys + state for what the framework already tracks.

3. **No explicit re-anchor when the traced attempt is replaced by a retry.** The new attempt's trace starts short (viewport not scrollable), which clears the manual-scroll state; if it grows past the viewport the panel is again in follow mode. No code change needed for the retry path.

## Risks / Trade-offs

- **Pause threshold is "one line from the bottom".** A wheel tick that lands exactly one line up keeps following. Accepted: it is the framework's re-engage rule and matches how tails behave; finer control would need custom handlers.
- **OpenTUI behavior is bundled, not typed beyond `ScrollBoxOptions`.** The pause/resume internals are private fields (`_hasManualScroll`), so the design pins behavior with tests in `src/app.test.tsx` rather than types; if a framework upgrade changes the semantics, the tests fail first.
- **Scroll position is a renderable concern, not model state.** Nothing in the model knows whether following is on; Esc-back and re-entering the same job re-mounts the panel and follows again. Accepted: follow is what you want on entry.
