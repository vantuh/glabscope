## Context

See proposal.md - Why. Constraints that shape the approach:

- All GitLab access goes through `glab` on `PATH`: `src/glab/run.ts` (`runGlab` + `parseJsonStdout`) for one-shot commands, and `src/glab/trace.ts` spawning `glab ci trace <job-id>` with streamed stdout for logs. There is no HTTP client in the project.
- The graph query in `src/glab/query.ts` requests `jobs(first: 100)` with no `retried` filter, and `src/glab/graph.ts` derives each job's numeric id from `gid://gitlab/Ci::Build/<job-id>` — the same id `glab ci trace` and `glab ci retry` accept.
- `src/model.ts` is a reducer with in-flight markers (`navigating`, `manualRefresh`) and non-fatal messages (`refreshWarning`); `src/app.tsx` drives side effects in `useEffect`s keyed on derived model values (`traceJobId`, `model.screen`).
- The working tree already contains the in-progress `gitlab-style-pipeline-graph` change (stage columns, job cards, `statusIcon`); this design layers on that state and must not revert it.
- Verified against glab 1.117.0 `internal/commands/ci/retry/retry.go`: a numeric job id is used directly (no pipeline/branch lookup) and the command prints `Retried job (ID: <new-job-id>), status: <status>, ref: <ref>, weburl: <url>` to stdout.
- Verified in GitLab's `Resolvers::Ci::JobsResolver`: `jobs(retried: false)` returns only the latest attempt per job; leaving the argument out returns every attempt, so a retried job currently renders as two nodes with the same name.

## Goals / Non-Goals

**Goals:**

- One retry path shared by the job graph and the job log, with the same retryable-status gate and the same non-fatal feedback rules.
- After a retry the operator sees the new attempt where they already are: the graph node for that job, or the log screen's live trace.
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

**5. Add `retried: false` to the jobs connection in `pipelineJobsQuery`.**
A retried job must remain one node. Filtering to the latest attempt also removes the current ambiguity where two nodes share a name and `needs` edges are matched by name. Cost: instances that do not support the `retried` argument would fail the query; the spike task verifies this on the operator's GitLab before the query changes.

**6. Reconcile graph focus by job id, then by job name.**
After a retry the previously focused gid no longer exists in the latest-attempt view, so id-only reconciliation would clamp focus to the first job. Falling back to the job name keeps focus on the same job across an attempt swap and is a no-op when the id still exists. Selection still prefers the id, so unrelated reordering behaves exactly as today.

**7. Re-attach the log screen to the new attempt through the existing trace effect.**
A reducer action sets the traced job id to the new attempt; the existing `traceJobId` effect then kills the finished tracer and spawns `glab ci trace <new-job-id>`, resetting the buffer through the same `logsReady` handshake used when opening a log. Alternative rejected: keeping the screen and swapping buffers in place would need a second code path for tracer lifecycle and error handling.

**8. Model retry state as `retry: { jobId: string } | null` plus `retryMessage: string | null`.**
This mirrors the existing `manualRefresh` / `refreshWarning` pair: `retry` drives the in-progress mark and is the reducer-owned guard against a second concurrent restart, and `retryMessage` carries refusals and GitLab errors as non-fatal text cleared on the next navigation or successful refresh.

**9. Keep key predicates in `src/keys.ts`.**
The file already owns `isQuitKey`; the Ctrl+R predicate belongs beside it so the handler, the footer help text, and tests share one definition. OpenTUI reports Ctrl+R as `{ name: "r", ctrl: true }`, so plain `r` (manual refresh) stays unambiguous.

## Risks / Trade-offs

- [glab changes the `Retried job (ID: …)` wording] → the parse is confined to one exported function with its own unit test, and a parse miss degrades to the documented graph fallback rather than a wrong behaviour; the spike task pins the format on the installed glab before the UI work lands.
- [`retried: false` unsupported on the operator's GitLab] → verified by spike task 1.1 before the query edit; if unsupported, implementation stops and this design (and the job-graph delta's latest-attempt clause) must be revisited rather than shipping duplicate nodes.
- [Retry of a job GitLab still considers active, or one canceled by the pipeline] → the local gate blocks running/pending jobs, and remaining GitLab refusals surface as a non-fatal message with the graph or log intact.
- [Retrying a job flips a terminal pipeline back to active] → no code change: the existing polling rules already branch on pipeline status, and a fresh graph fetch follows the retry.
- [Graph refresh pauses while the log screen is open, so the retried node updates only after returning] → accepted; the log screen itself streams the new attempt live, which is the stronger signal.
- [Uncommitted `gitlab-style-pipeline-graph` work in the same files] → graph edits are layered on the current tree; the change must not revert or reformat that work, and its pre-existing failing `src/app.test.tsx` focus test stays out of this change's scope.
