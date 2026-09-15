## Context

See proposal.md for motivation. Relevant current code:

- `src/model.ts`: `AppModel` has no field marking "a navigation request is in flight." `reduce()` has no action for it.
- `src/app.tsx`, list screen Enter handler: calls `fetchPipelineGraph(String(row.iid))` (a promise) and only dispatches `openGraph` or `error` when it settles. Nothing is dispatched synchronously, so repeated Enter presses can call `fetchPipelineGraph` multiple times before the first resolves.
- `src/app.tsx`, graph screen Enter handler: dispatches `openLogs` synchronously (screen switches immediately); the actual `glab ci trace` subprocess is spawned in a `useEffect` keyed on `[model.screen, model.logJobId]`, and effect-level spawn failure already dispatches a non-fatal `error` action. There is no async gap between confirm and screen switch today.

## Goals / Non-Goals

**Goals:**
- One consistent loading concept usable by both transitions (list→graph, graph→logs), driven from `AppModel`/`reduce`, not ad-hoc component state.
- Loading indicator appears synchronously on the same tick as the confirm key press, before any `await`.
- A second confirm press while loading is a no-op (no duplicate fetch, no duplicate log open).

**Non-Goals:**
- No changes to `glab` invocation, polling cadence/backoff, or log trace behavior.
- No global overlay/toast framework; the loading overlay is a small local component used only by the two navigation transitions named in the proposal.
- No loading indicator for graph polling refreshes (`refreshGraph`) — those already update in place without blocking input.

## Decisions

**Model shape**: add `navigating: { kind: "graph"; pipelineIid: string } | { kind: "logs"; jobId: string } | null` to `AppModel`, plus two new actions: `startNavigating` (sets it) and the existing `openGraph`/`openLogs`/`error` actions clear it (set back to `null`) as part of their existing reducer cases.
- Alternative considered: a plain `boolean isLoading` flag. Rejected because both list→graph and graph→logs need loading state and the graph screen's own `error`/`back` handling needs to know which kind of navigation was in flight to render the right message; a boolean loses that.

**Guard against duplicate requests**: the Enter key handlers in `app.tsx` check a ref synchronized with `model.navigating` and return early before doing anything else, in addition to dispatching `startNavigating` on the first press. The handler updates the ref synchronously before dispatch so a second key event in the same React render cannot observe stale model state. This keeps the guard co-located with the dispatch that starts the async work, matching the existing pattern where all async triggers live in the keyboard handler or effects, not in reducer logic.
- Alternative considered: guard inside `reduce()` by ignoring a second `startNavigating` while one is active. Rejected as redundant — the key handler already needs to read `model.navigating` to decide whether to call `fetchPipelineGraph`/spawn the trace at all, so putting the guard there avoids calling the async function a second time in the first place (the reducer-only guard would still let the second `fetch` call fire and race).

**graph→logs "opening" state**: today `openLogs` is dispatched synchronously and the trace subprocess spawns in an effect. To give this transition the same loading semantics as list→graph, `openLogs` no longer switches `screen` immediately; it sets `navigating: { kind: "logs", jobId }` instead. The trace-spawn effect dispatches a new `logsReady` action once `Bun.spawn` succeeds, deferred to the next task so the graph can paint its loading line first. Stream readers start only after that dispatch, preserving the reset-before-first-chunk ordering of the old flow. `logsReady` sets `screen: "logs"` and clears `navigating`; if `Bun.spawn` throws, the existing `error` action path clears `navigating` too.
- Alternative considered: keep `openLogs` synchronous and only show a loading indicator for the brief window before the effect runs. Rejected — `Bun.spawn` is synchronous and typically fast, but the proposal's modified `job-graph` requirement explicitly asks for a loading indicator "while the log screen is being prepared" and a guard against repeated confirms; making the state explicit in the model is simpler than trying to time a synchronous call.

**Rendering**: a local `LoadingOverlay` component is rendered as an absolute, full-screen layer with a translucent dark background and a high z-index above the current list or graph. Its centered content combines a short braille-frame animation with `Loading pipeline…` or `Loading log…`; the underlying screen remains visible but dimmed. The animation advances on a small interval only while the overlay is mounted, and uses no new dependency.
- Alternative considered: keep the static `Loading…` line. Rejected after manual review because it communicates progress but does not provide the desired visual focus or polish.
- Alternative considered: introduce a reusable modal/overlay framework. Rejected as broader than this change; the component remains local to these two navigation transitions.

## Risks / Trade-offs

- [Changing `openLogs` from synchronous to effect-driven changes an existing, working code path] → Mitigation: keep the existing trace-spawn effect's logic identical; only move the `screen: "logs"` transition from `openLogs` to the new `logsReady` action fired from that same effect once `Bun.spawn` succeeds.
- [`navigating` state could get stuck if an async path forgets to clear it] → Mitigation: graph navigation ends with `openGraph`, log navigation ends with `logsReady`, `error` clears either transition, and `back` explicitly cancels pending log navigation; tests cover success, failure/retry, and cancellation ordering.
