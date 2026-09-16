## Context

See `proposal.md` - Why. Both watch loops are self-scheduling: each schedules its next tick only after the current `glab` subprocess settles, so the delay is a floor on the gap between requests rather than a fixed timer. The cadence lives in two places — `src/polling.ts` owns the constants and `nextPollDelay`, and `src/app.tsx` picks the constant for the list loop (`app.tsx:294`, `app.tsx:311`) and the graph loop (`app.tsx:355`, `app.tsx:371`).

Relevant facts this design leans on:

- One list tick is one `glab ci list -F json` invocation, which paginates up to five pages of 50 — so one tick is one subprocess for personal-sized projects and up to five for projects with more than 50 pipelines.
- One graph tick is one `glab api graphql` invocation. `projectFullPath` is cached in-process, so its `glab repo view -F json` lookup does not repeat per tick.
- Only one loop runs at a time: the list loop requires `screen === "list"` and a non-empty list, the graph loop requires the graph or attempts screen with a loaded graph.
- GitLab.com currently allows 2,000 authenticated API requests per minute per user, and `GET /projects/:id/pipelines` has no separate limit. The planned per-plan limits (Free: 100/minute burst, 5,000/hour sustained) are documented as proposed and not yet in effect.
- A rate-limit response doubles the current delay up to `MAX_POLL_MS`; any successful refresh restores `NORMAL_POLL_MS`.

## Goals / Non-Goals

**Goals:**

- Make the difference between "something is active" and "nothing is active" visible in the request rate, not just in the constant's name.
- Pin the relationship between the two intervals in the specs so the next edit cannot collapse it.
- Keep the change to the cadence policy entirely inside `src/polling.ts` plus its test.

**Non-Goals:**

- Changing what either loop fetches, when it pauses, or how it reconciles results.
- Changing the backoff policy, the backoff ceiling, or what the footer shows while backing off.
- Making the first tick on (re)entering a screen immediate.

## Decisions

### Set the watch interval to 15 s

15 s is 3.75x the normal interval, which clears the spec floor with margin and makes the watch state observable (4 refreshes per minute instead of 12). It stays below `MAX_POLL_MS`, so the 429 backoff still has room to climb from the watch state (15 s, then 30 s) instead of starting at the ceiling.

Alternatives:

- **10 s** — also clears the floor and saves half the idle ticks. Rejected only because it leaves less separation from the 15 s backoff step, so a 429 during watch mode would be indistinguishable from a normal watch tick.
- **30 s** — equal to `MAX_POLL_MS`, so a rate-limited watch state would jump straight to the ceiling and the backoff would stop being a progressive response.
- **No automatic watch at all (stop polling on a terminal pipeline)** — zero steady-state traffic, but it makes externally triggered retries and new pipelines invisible until `r` is pressed, which is the behavior the watch interval exists to avoid.

The observable effect for the operator is a screen that refreshes four times a minute instead of twelve while nothing is active. The escape hatch for impatience is the existing `r` manual refresh, which is a one-shot outside the loop and is unaffected.

### Keep `MAX_POLL_MS` at 30 s

The ceiling trades probe frequency against recovery latency: while GitLab is throttling, the watch loop issues `60 / MAX_POLL_MS` requests per minute, and after the throttle window clears it may wait up to a full ceiling before noticing. At 30 s that is 2 probes per minute against a 2,000-per-minute budget — 0.1 % — so raising it to 60 s would buy roughly 60 fewer wasted requests per hour while doubling the worst-case staleness after recovery. Since this tool is likely throttled by another consumer of the same account quota rather than by its own traffic, recovery latency is the part the operator actually feels.

Alternatives:

- **Raise to 60 s** — rejected for the reason above.
- **Honor `Retry-After`** — the correct long-term answer, since GitLab returns it precisely to be followed. Not available through the current I/O surface: `glab ci list` has no option to include response headers (only `glab api` has `-i/--include`), so the list path cannot see the header without replacing `glab ci list` with a direct `glab api` call. Deferred rather than half-done for the graph only.

The invariant this leaves behind: `NORMAL_POLL_MS < IDLE_POLL_MS < MAX_POLL_MS` (4 s < 15 s < 30 s). It is asserted in `src/polling.test.ts`, because a future edit that crosses two of these constants breaks a distinct behavior in each direction.

### Express the requirement as a ratio, not a number

The specs say "bounded watch interval" and never named a value, so the two intervals were able to drift to 4 s and 5 s with every requirement still passing. Pinning the number in the spec would move the same brittleness into a second place; pinning the ratio makes the requirement falsifiable ("at least twice the normal interval") while leaving the exact value to this design. The guard that fails today is the point: it would have caught the drift.

## Risks / Trade-offs

- [A retry started outside the TUI takes up to 15 s to appear instead of 5 s] -> Accepted: the operator is watching a screen that already shows the pre-retry state, and `r` refreshes immediately. The spec scenarios measure "within one successful watch refresh", which stays true.
- [The first tick after re-entering a screen is scheduled on the watch interval, so returning from the log screen to a terminal graph can wait 15 s] -> Pre-existing behavior, widened by this change; listing it as a non-goal keeps the change to one constant. If it proves annoying in use, the follow-up is an immediate first tick on loop start.
- [`IDLE_POLL_MS > NORMAL_POLL_MS` is now semantically load-bearing, so the two constants must not be merged or reordered] -> Asserted in `src/polling.test.ts` with the ordering and the ratio, not just the literals.
- [Manual refresh does not reset the loop's delay, so pressing `r` during a backoff still leaves the loop waiting out its full ceiling] -> Unchanged by this design; noted because raising the watch interval makes long gaps between automatic refreshes more noticeable while backing off.
