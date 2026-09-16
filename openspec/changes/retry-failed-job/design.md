## Context

See proposal.md - Why. Constraints that shape the approach:

- All GitLab access goes through `glab` on `PATH`: `src/glab/run.ts` (`runGlab` + `parseJsonStdout`) for one-shot commands, and `src/glab/trace.ts` spawning `glab ci trace <job-id>` with streamed stdout for logs. There is no HTTP client in the project.
- The graph query in `src/glab/query.ts` requests `jobs(first: 100)` with no `retried` filter, so the payload carries every attempt; `src/glab/graph.ts` collapses each job name+stage to its latest attempt with `latestJobs` and derives the job's numeric id from `gid://gitlab/Ci::Build/<job-id>` — the same id `glab ci trace` and `glab ci retry` accept.
- `src/model.ts` is a reducer with in-flight markers (`navigating`, `manualRefresh`) and non-fatal messages (`refreshWarning`); `src/app.tsx` drives side effects in `useEffect`s keyed on derived model values (`traceJobId`, `model.screen`).
- The working tree already contains the in-progress `gitlab-style-pipeline-graph` change (stage columns, job cards, `statusIcon`); this design layers on that state and must not revert it.
- Verified against glab 1.117.0 `internal/commands/ci/retry/retry.go`: a numeric job id is used directly (no pipeline/branch lookup) and the command prints `Retried job (ID: <new-job-id>), status: <status>, ref: <ref>, weburl: <url>` to stdout.
- Verified in GitLab's `Resolvers::Ci::JobsResolver`: `jobs(retried: false)` returns only the latest attempt per job, so that argument would drop superseded attempts from the payload; leaving it out returns every attempt and the attempts list keeps working.

## Goals / Non-Goals

**Goals:**

- One retry path shared by the job graph, the attempts list, and the job log, with the same retryable-status gate and the same non-fatal feedback rules.
- After a retry the operator sees the new attempt where they already are: the graph card for that job, the new row in the attempts list, or the log screen's live trace.
- Keep GitLab interaction to existing `glab` subprocesses and keep the model reducer the single owner of retry in-flight state.

**Non-Goals:**

- Retry UI on the pipeline list, cancel or play/manual actions, bulk or whole-pipeline retry.
- Retrying trigger/bridge jobs (GitLab retries those through a different route); the UI refuses them locally instead.
- Any cached retry queue, background retry, or retry history — each retry is one immediate `glab` call.

## Decisions

**1. Use `glab ci retry <job-id>`, not `glab api --method POST "projects/:id/jobs/:job_id/retry"`.**
The subcommand takes a numeric job id directly, works with the operator's existing login, and its stdout carries the new job id, so no second request is needed. The `glab api` alternative returns cleaner JSON (the new job's `id`), but duplicates logic glab already owns and needs the project path resolved first. Both stay inside the glab-only I/O rule; the subcommand is less code.

**2. Read the new attempt id from `glab ci retry` stdout with `Retried job \(ID: (\d+)\)`.**
Matched anywhere in stdout and tolerant of SGR sequences, because `glab`'s log writer may decorate the line depending on TTY. If the pattern is absent, the retry is still considered successful but unfollowable: the log screen returns to the job graph with a non-fatal message (spec: *The new attempt cannot be identified*).

**3. Put the retryable gate in one pure helper, not in the key handler.**
`isRetryableJob(job)` = `!job.isBridge && (status === "failed" || status === "canceled")`. Both screens call it, so the gate cannot drift between them, and the reducer can reject a retry action that bypasses the UI. The rejected alternative — always calling `glab` and surfacing GitLab's error — was dropped because it makes a one-keystroke re-run of a healthy or running job possible.

**4. Run the retry through `runGlab`, not a PTY.**
A numeric job id skips glab's interactive selection prompt, so no PTY is needed; `runGlab` already bounds the process with a timeout and returns stdout/stderr/code. A PTY would only complicate exit handling.

**5. Keep `jobs(first: 100)` unfiltered and derive the single visible card per job from the payload.**
`latestJobs` already collapses each job name+stage to its latest attempt (`retried` false, else highest numeric id), and `buildStageGraph` renders only those cards with `needs` matched by name, so a retried job is one node today. Asking GitLab for `jobs(retried: false)` would drop earlier attempts from the payload, which makes the attempts list (`jobAttempts(...).length > 1`) unreachable — a capability this change does not modify — and would also fail on instances without the `retried` argument. Cost: superseded attempts consume part of the 100-job page, so a heavily retried pipeline is likelier to truncate. The graph tests still pin the one-node-per-job collapse with a retried-away fixture.

**6. Reconcile graph focus by job id, then by job name.**
After a retry the previously focused gid no longer exists in the latest-attempt view, so id-only reconciliation would clamp focus to the first job. Falling back to the job name keeps focus on the same job across an attempt swap and is a no-op when the id still exists. Selection still prefers the id, so unrelated reordering behaves exactly as today.

**7. Re-attach the log screen to the new attempt through the existing trace effect.**
A reducer action sets the traced job id to the new attempt; the existing `traceJobId` effect then kills the finished tracer and spawns `glab ci trace <new-job-id>`, resetting the buffer through the same `logsReady` handshake used when opening a log. Alternative rejected: keeping the screen and swapping buffers in place would need a second code path for tracer lifecycle and error handling.

**8. Model retry state as `retry: { jobId: string; screen: Screen } | null` plus `retryMessage: string | null`.**
This mirrors the existing `manualRefresh` / `refreshWarning` pair: `retry` drives the in-progress mark and is the reducer-owned guard against a second concurrent restart, and `retryMessage` carries refusals, GitLab errors, and the reason a log screen gave up as non-fatal text. It is cleared by the next navigation or retry rather than by a successful refresh, so a poll landing right after a refusal cannot wipe the reason before the operator reads it. `screen` records where the restart started, so only a restart begun on the log screen re-attaches that screen — and only when the log it started from is still the one on screen, because navigation stays possible while a restart is in flight. The key handler also keeps a ref of the same value, next to the existing `navigatingRef`, so two presses inside one render cannot both reach GitLab.

**9. Keep key predicates in `src/keys.ts`.**
The file already owns `isQuitKey`; the Ctrl+R predicate belongs beside it so the handler, the footer help text, and tests share one definition. OpenTUI reports Ctrl+R as `{ name: "r", ctrl: true }`, so plain `r` (manual refresh) stays unambiguous — the manual-refresh branches check `!key.ctrl` explicitly, otherwise one Ctrl+R press both restarts the job and starts a refresh whose loading overlay hides the retry message.

**10. A restart from the log screen refreshes the graph once, and only the traced attempt may be restarted there.**
The log screen's key handler refuses to restart anything but the job whose numeric id it is tracing: `tracedJob` falls back to the focused card for the panel title, and retrying that card would restart the attempt the screen just replaced. Because polling is paused on the log screen, the new attempt is unknown to the model until the graph is fetched, so a successful restart triggers one immediate graph fetch (the same one the graph screen does) instead of waiting for the operator to navigate back. Until that fetch lands — or if it fails — a second press is refused with a non-fatal message rather than a restart of the replaced attempt.

**11. Only the newest graph fetch may land.**
Polling, manual refresh, and a post-restart refresh can be in flight together, and every result used to dispatch the same `refreshGraph` action, so an older poll could overwrite the graph that already carries the new attempt. A monotonically increasing request id makes the newest fetch the only one that dispatches; opening another pipeline takes a new id too, and a polling loop that was canceled passes its own `stopped` flag so its late answer is dropped as well. Without that, a poll started on the previous pipeline could replace the newly opened one.

**12. A log screen that cannot trace leaves for the graph.**
If the trace process cannot be spawned for a re-attached attempt, the log screen has nothing to show and no further navigation of its own, so the operator is returned to the graph for that job with the reason as a non-fatal message — the same path a restart whose new id could not be read takes. Leaving the screen open would keep claiming `live` with no process behind it.

**13. The attempts list restarts its focused row, and focus follows a replaced latest attempt.**
The row under the cursor is the attempt that gets restarted, so an older attempt is never swapped for whatever the card currently shows. Focus after the refresh is derived rather than stored: the attempts branch prefers the focused attempt's id, except when that focused row was the job's latest attempt — the one a restart replaces — because that id is exactly what the refresh moved on from. Dropping the preference there lets focus land on the newest row, which is the attempt that replaced it, while retrying an earlier superseded attempt keeps focus on the attempt that was asked for. No new retry state is needed: the existing `focusedAttemptIndex` covers it.

## Risks / Trade-offs

- [glab changes the `Retried job (ID: …)` wording] → the parse is confined to one exported function with its own unit test, and a parse miss degrades to the documented graph fallback rather than a wrong behaviour. The format string `Retried job (ID: %d), status: %s, ref: %s, weburl: %s` is present in the installed glab 1.117.0 binary, which is what the unit fixture records; task 1.1 still has to confirm a live restart against the operator's GitLab.
- [Earlier attempts now stay in the payload] → the graph collapses them with `latestJobs` (pinned by a retried-away fixture), so the cost is the 100-job page rather than duplicate nodes; the attempts list keeps working.
- [Retry of a job GitLab still considers active, or one canceled by the pipeline] → the local gate blocks running/pending jobs, and remaining GitLab refusals surface as a non-fatal message with the graph or log intact.
- [Retrying a job flips a terminal pipeline back to active] → no code change: the existing polling rules already branch on pipeline status, and a fresh graph fetch follows the retry.
- [A trace is replaced while a chunk is in flight] → the reader re-checks its cancellation after every read, so output from the killed tracer cannot land in the buffer cleared for the new attempt (pinned by a queued-stream test).
- [A restart whose new attempt the graph has not returned yet] → the log screen refuses a second restart with a non-fatal message instead of restarting the replaced attempt, and the post-restart fetch usually makes the status readable within the same second.
- [GitLab answers `glab ci retry` before the new attempt shows up in the graph query] → the refresh still lands and the node appears on the following poll; the change does not re-fetch in a bounded loop, so a slow instance can show the superseded card for one interval.
- [Polling, manual refresh, and the post-restart refresh overlap] → newest-fetch-wins discards the older result; a fetch that starts after the post-restart fetch wins, which is safe because it observes the same new attempt, and opening another pipeline invalidates everything already in flight.
- [A restart from one log completes while another log is open] → the completion only clears the in-flight mark; the log it started from is no longer the visible one, so nothing is re-attached onto the screen the operator moved to.
- [Uncommitted `gitlab-style-pipeline-graph` work in the same files] → that work landed before this change; the change does not revert or reformat it, and its previously failing `src/app.test.tsx` focus test passes on this tree.
