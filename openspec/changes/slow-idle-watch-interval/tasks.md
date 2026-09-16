## 1. Interval

- [ ] 1.1 Set `IDLE_POLL_MS` in `src/polling.ts` to 15 s and leave `NORMAL_POLL_MS` (4 s) and `MAX_POLL_MS` (30 s) untouched; verify with `grep -rn "IDLE_POLL_MS\|NORMAL_POLL_MS\|MAX_POLL_MS" src` that the three constants are still defined only in `src/polling.ts` and consumed only from `src/app.tsx` and `src/polling.test.ts`, with no second hardcoded interval.

## 2. Guard the relationship

- [ ] 2.1 Add assertions to `src/polling.test.ts` pinning `IDLE_POLL_MS` to 15 s, the ordering `NORMAL_POLL_MS < IDLE_POLL_MS < MAX_POLL_MS`, and the spec floor `IDLE_POLL_MS >= 2 * NORMAL_POLL_MS`; verify with `bun test src/polling.test.ts` green and by temporarily lowering `IDLE_POLL_MS` to `NORMAL_POLL_MS` to confirm the floor assertion fails.
- [ ] 2.2 Assert in `src/polling.test.ts` that a rate-limited tick from the watch interval reaches the ceiling in one step (`nextPollDelay(IDLE_POLL_MS, true) === MAX_POLL_MS`) and that a successful tick from the watch interval returns the loop to 15 s; verify with `bun test src/polling.test.ts` green.

## 3. Verification

- [ ] 3.1 Run `bun test` and `./node_modules/.bin/tsc --noEmit` and verify both are green with no new failures against the current baseline (173 passing tests, clean type check) plus the new `src/polling.test.ts` assertions.
- [ ] 3.2 Run `bun start` from a GitLab-bound working tree and verify by eye that the footer spinner on a terminal pipeline list and graph appears roughly four times a minute while an active pipeline refreshes roughly fifteen times a minute, and that a job retried outside the TUI appears within one watch interval; record the observed outcome in this change, or state it as not run (this working copy has no git remote, so the interval cannot be exercised from here).
