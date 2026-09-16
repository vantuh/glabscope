## Why

The watch interval (5 s) is barely longer than the normal interval (4 s), so the "slow automatic refresh when nothing is active" behavior that the `pipeline-list` and `job-graph` specs require does not actually happen: a screen with nothing running polls twelve times a minute, almost as often as one with an active pipeline. The one-second difference is invisible to the operator while it keeps a `glab` subprocess, a network round trip, and a timer wakeup going every five seconds indefinitely. Because any value above the normal interval satisfies the current wording, the requirement cannot fail — which is why the two intervals drifted together unnoticed.

## What Changes

- `IDLE_POLL_MS` goes from 5 s to 15 s in `src/polling.ts`. The normal interval (4 s) and the rate-limit maximum (30 s) are unchanged.
- Both watch loops inherit the new interval — the pipeline list and the job graph. No loop logic, screen, key binding, or `glab` invocation changes.
- The "slow automatic refresh" requirement in `pipeline-list` and `job-graph` gains a floor on the **relationship** between the two intervals (the watch interval must be at least twice the normal one), so a later edit cannot silently collapse the difference again.
- `src/polling.test.ts` gains assertions that pin the watch interval and the `normal < watch < max` ordering.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pipeline-list`: "Refresh active pipeline statuses" gains the watch-interval floor.
- `job-graph`: "Poll while the pipeline is active" gains the same floor, stated for the graph loop.

## Impact

- `src/polling.ts` (one constant), `src/polling.test.ts` (assertions), and `src/app.test.tsx` (its four watch-interval assertions hardcoded 5000 and now read the imported constants). The plan had counted only the first two files; no production file other than `src/polling.ts` changes.
- No change to `glab` invocation, rate-limit backoff, retry, navigation, rendering, or the model reducer.
- `pipeline-list-columns` is in flight and modifies a different `pipeline-list` requirement, so the two deltas do not collide on the same requirement.

## Non-goals

- Raising `MAX_POLL_MS` above 30 s. A longer cap doubles the worst-case staleness after GitLab's rate-limit window clears, in exchange for about 60 fewer probe requests per hour — noise against the 2,000 requests per minute an authenticated GitLab.com user is already allowed.
- Honoring `Retry-After`. `glab ci list` exposes no response headers, so this cannot be done for the list path without changing the `glab`-only I/O surface.
- Making the first refresh on re-entering a screen immediate. That changes observable behavior beyond the interval and is deliberately deferred.
- Any new polling loop, websocket, cache, or status-area indicator for the backoff state.
