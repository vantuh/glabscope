## 1. Refresh State and Scheduling

- [x] 1.1 Add model predicates for active pipeline-list and graph refresh eligibility, and verify unit tests cover list/graph/log screens plus active and terminal statuses.
- [x] 1.2 Reconcile refreshed pipeline rows by stable pipeline id with nearest-row fallback, and verify model tests cover reordered, retained, and removed selections.
- [x] 1.3 Centralize the 4-second normal delay, bounded 429 backoff, reset-after-success behavior, and `glab` rate-limit classification; verify unit tests cover doubling, the 30-second cap, reset, and representative 429 output.
- [x] 1.4 Add non-fatal background refresh success/error actions that retain current data and clear recovered warnings, and verify reducer tests cover failure followed by recovery.

## 2. Live Pipeline List

- [x] 2.1 Add a screen-scoped, single-flight pipeline-list loop using `glab ci list -F json`; verify application tests show an immediate eligible refresh, subsequent scheduling, and cancellation when leaving the list.
- [x] 2.2 Stop list refresh after results contain no running or pending pipeline while preserving navigation and selection; verify application tests cover terminal transition, result reordering, and a missing selected row.
- [x] 2.3 Keep the last successful list visible and continue bounded retries after ordinary failures or 429 responses; verify application tests cover non-fatal error display, delayed retry, and interval reset after recovery.

## 3. Live Job Graph

- [x] 3.1 Refactor the existing `glab api graphql` graph loop to remain single-flight and retry recoverable failures without discarding the graph; verify application tests cover job status updates and ordinary-error recovery.
- [x] 3.2 Preserve graph polling pause on the log screen, immediate resume on return, and stop after a terminal graph refresh; verify application tests cover all three screen/status transitions.
- [x] 3.3 Apply the shared 429 backoff and success reset to graph refresh while preserving focused job identity; verify model and application tests cover backoff recovery and reordered jobs.

## 4. Verification

- [x] 4.1 Run `bun test` and verify the full suite passes with no new dependency or GitLab client added.
- [ ] 4.2 Manually run the TUI against an active pipeline and verify both list and graph statuses update, graph polling pauses during logs, terminal polling stops, and keyboard navigation remains usable.
