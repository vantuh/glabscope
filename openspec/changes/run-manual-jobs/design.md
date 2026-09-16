## Context

See `proposal.md` for motivation and `specs/job-graph/spec.md` for the requirements.

The retry action already provides everything a second job action needs, and this design leans on it instead of building a parallel path:

- `src/glab/retry.ts`: `retryArgv`, `parseRetriedJobId`, `isRetryableJob`, `retryJob` through `runGlab` (20 s timeout, nonzero exit → `Error`).
- `src/model.ts`: the `retry` in-flight slot, `retryMessage` notice, `startRetry` / `retrySucceeded` / `retryFailed` actions, and `retryRefusalMessage`.
- `src/app.tsx`: `isRetryKey`, the `retryRef` re-entry guard, `refreshGraphAfterRetry`, the graph / attempts / logs key handlers, and the single `useKeyboard` handler that resolves `q` (quit) and `escape` (back) before the per-screen branches.
- `src/app.tsx`'s `ScreenPanel` already hosts an absolutely positioned overlay inside the framed content box for the log-loading spinner (`LoadingOverlay`), which is the shape a confirmation prompt can reuse.
- `src/glab/query.ts` + `src/glab/graph.ts`: the pipeline graph payload (`status`, `kind`, `retried`, `needs`).

How the play facts were established, and how strongly:

- **Read from the installed glab 1.117.0 binary** (not run): `glab ci trigger <job-id>` is the CLI's route to a manual job and prints `Triggered job (ID: %d), status: %s, ref: %s, weburl: %s`, beside retry's `Retried job (ID: %d), …` and `Could not trigger job with ID: %d`.
- **Read from upstream sources**: `ciutils.GetJobId` (used by `ci trigger`) returns a numeric argument as the job id directly, so no `-p` / `-b` is needed; `Ci::PlayBuildService` → `Ci::EnqueueJobService` → `job.enqueue!` enqueues the same build, so a run normally keeps the job id and the card moves `manual` → `pending`, with a new attempt only on GitLab's internal invalid-transition fallback; `Ci::Build#playable?` is `action? && !archived? && (manual? || scheduled? || retryable?)`, which is also true for successful manual jobs and for retryable jobs.
- **Verified against the operator's instance** (`gitlab.foodtech.team`), read-only: a GraphQL schema introspection showed `CiJob` carries `playable`, `canPlayJob`, `retryable`, and `manualJob`, so the instance is new enough for any of them; the status gate still needs none of them.
- **Not verified against a live GitLab**: the running `glab ci trigger` command, its real stdout, and the same-id enqueue. The operator declined the live spike (task 1.1) because the only waiting manual jobs reachable in their projects are `deploy_*` jobs, so `src/glab/play.ts` and its fixture rest on the binary format string and the upstream source above, exactly as the existing retry fixture does.
- Node names in the graph are already the GitLab job id, so the focused card's `numericId` is the argument.

## Goals / Non-Goals

**Goals:**

- One key, two job actions, with the deciding policy in a single pure function that the reducer and the key handler share.
- Every action on every screen goes through one confirmation prompt and one start path, so no screen can start a GitLab job without the operator confirming it.
- No change to the GraphQL query, the polling cadence rules, the attempts list, or the log screen beyond that confirmation.
- The run path reuses retry's in-flight guard, immediate refresh, and focus reconciliation, so a run cannot corrupt retry's invariants.

**Non-Goals:**

- Any GraphQL field addition, any second HTTP client, any `glab ci run`/pipeline-level command.
- Manual job variables or inputs; `glab ci trigger` is called with the job id alone.
- Running from the attempts list or the log screen.
- Optimistically painting the card before the refresh returns.
- Remembering a confirmation choice, so the prompt appears for every action.

## Decisions

**1. Gate on the job's status, in a new `src/glab/play.ts`.**

`isPlayableJob(job)` is `!job.isBridge && job.status.toLowerCase() === "manual"`, mirroring `isRetryableJob`. The operator asked for waiting manual jobs only, and the status is already in the graph payload, so the query stays as it is.

Alternatives rejected: GraphQL `playable` (true for `success` and retryable jobs, needs a query change, and cannot express "waiting"); `canPlayJob` (a Gitaly call per job for a permission check whose refusal already surfaces as a non-fatal CLI error); `manualJob` (true for a manual job that already ran, where the key would be a re-run of a green card).

**2. Wrap the command the way retry is wrapped.**

`playArgv(jobId)` returns `["ci", "trigger", jobId]` after the same numeric-id validation; `parseTriggeredJobId(stdout)` matches `Triggered job \(ID: (\d+)\)` against SGR-stripped stdout; `playJob(jobId, cwd)` runs it through `runGlab` and throws the stderr (or stdout, or the exit code) on a nonzero exit. The CLI's trigger command is the only sanctioned route, and its output shape lets a run reuse retry's "follow the returned id" handling.

**3. One in-flight job action, with a kind.**

The existing `retry` slot becomes `{ jobId, screen, kind: "retry" | "play" }`. `kind` drives the two action-specific strings: the in-flight label (`retrying…` / `running…`) and the failure prefix (`retry failed: …` / `run failed: …`).

The names `retry`, `retryMessage`, `startRetry`, `retrySucceeded`, `retryFailed`, `retryRef`, `refreshGraphAfterRetry` and `retryFailureMessage` stay as they are; renaming them to a neutral "job action" vocabulary would touch roughly 280 mentions across `model.ts`, `app.tsx` and their tests for no behaviour change. The slot is documented as the one in-flight job action that retry introduced. Local helpers whose meaning actually changes (`retryRefusalMessage` → `jobActionRefusalMessage`, `retryFailureMessage` → `jobActionFailureMessage`) are renamed, since they are single-definition helpers.

**4. The screen policy lives in one pure function.**

`jobActionKind(job, screen)` in `src/model.ts` returns `"retry"`, `"play"`, or `null`, reading a `SCREEN_ACTIONS` table: the graph allows both actions, the attempts list and the log allow retry only, the list allows neither. The reducer and the key handler both call it, so the precedence (retry first) exists once. The reducer stops after the table says `null` and stores a notice; the key handler stops after the same answer, so it never spawns a `glab` process the reducer would have refused.

This also keeps the log screen honest: a manual traced job yields `null` there, exactly as it does today, and the screen-chrome refusal message for a screen without the run action keeps retry's wording.

**5. One notice, two wordings, and a neutral bridge message.**

`jobActionRefusalMessage(job, screen)` returns:

- bridge or trigger job → `this job cannot be restarted here` (today's `cannot be retried here` is now wrong for a manual bridge, and the retry requirement is modified to match);
- a screen that offers the run action → `only failed or canceled jobs can be retried, and only waiting manual jobs can be run`;
- any other screen → today's retry-only wording.

**6. The refresh and focus path is retry's, unchanged.**

A successful run dispatches `retrySucceeded` with the id the CLI printed and then `refreshGraphAfterRetry(iid)`, so the graph fetches once, newest-wins ordering still applies, and focus stays on the same job: by id in the normal in-place enqueue case, or by job name+stage through the existing `visibleMatchIndex` fallback if GitLab answered with a different attempt. The pipeline turning active again is what restores the normal polling interval, because the graph loop derives its delay from the refreshed pipeline status; no polling code changes.

**7. The graph footer names both actions.**

`ctrl+r retry` becomes `ctrl+r retry/run` on the graph only; the attempts and log footers keep `ctrl+r retry`. This follows the existing convention that a key applying to only some jobs is still listed where it applies, and it keeps the help line independent of the focused job.

**8. A job action is two steps: request a prompt, then confirm it.**

The model gains a `confirm` slot holding `{ kind, jobId, name }` (the screen cannot change while the prompt owns the keyboard, so it is not stored), and the key press becomes three steps:

- `requestJobAction(job)` — refuse with the usual notice when the gate says no action applies, otherwise open the prompt. The gate is evaluated here, so a job the key cannot act on never shows a prompt.
- `cancelJobAction` — clear the prompt. Nothing else changes: no message, no focus move, no trace restart, no state on the screen behind it.
- `confirmJobAction` — resolve the prompt through `pendingJobAction`, then either record the in-flight action with its kind or replace the prompt with the reason it cannot be honoured. The reducer owns both state and message.

**The process is started by the committed state, not by the key handler.** An effect watches `model.retry` and spawns `retryJob` / `playJob` once per distinct action, keyed by kind, job id and screen, so:

- a refresh that commits between the key press and the confirmation is seen by the reducer, which refuses, and nothing is ever spawned from a stale snapshot;
- two Return events in the same frame cannot spawn two commands, because the second one only meets a cleared prompt and the reducer returns the same state;
- the handler is three lines (confirm, cancel, swallow) and the app needs no in-flight mirror ref, so the reducer is the only gate.

This replaced an earlier plan to keep `startRetry` as the confirmed step spawned from the handler. `retryFailed` and the log-screen fallback also clear the prompt so a refusal can never leave a stale dialog on screen.

The prompt state lives in the model rather than in component state so that "one action at a time" (`retry` or `confirm`, never both), the gate re-check and the messages are all testable through `reduce`, exactly like the in-flight slot today.

**9. Confirming re-checks the action against the current pipeline.**

`pendingJobAction(model)` returns the job the open prompt would act on, looked up by job id in the current graph and re-gated with `jobActionKind`. The reducer's confirm step resolves the prompt through that same helper, and the key handler calls it to decide whether to spawn a process at all, so the re-check exists once. The re-check also requires the job's action to still be **the action the operator confirmed**: `jobActionKind` must return the prompt's own kind, so a failed job that turned manual cannot answer a confirmed "retry" with a play, and a manual job that turned canceled cannot answer a confirmed "run" with a retry.

A job that disappeared, changed action, or no longer qualifies produces a non-fatal notice instead of a command: `that job is no longer in this pipeline`, `that job's status changed while the prompt was open`, or the action's own refusal message. The graph keeps polling while the prompt is open, so a manual job another operator already started must not be played again, and GitLab answers a play on an enqueued job with its invalid-transition fallback, which would create a second attempt.

**11. A refresh from outside the graph loop can pull the pending wait back to the normal interval.**

The graph loop keeps its cadence in closure state and only recomputes it in its own `tick()`, so a run on a terminal pipeline would otherwise leave the already-scheduled watch-interval timer running: the post-action refresh reports a running pipeline, and the operator then waits out up to the whole watch interval before normal polling resumes.

The loop publishes `{ isSlow, wake }` through a ref, and an effect on the committed pipeline status calls `wake()` when the pipeline just became active while the pending delay is slower than normal. `wake()` reschedules the pending timer at `NORMAL_POLL_MS` instead of fetching immediately, which keeps the property the retry change established — exactly one graph fetch per job action — and leaves rate-limit backoff untouched, because a wake only fires on a transition into an active pipeline.

**10. The prompt is an overlay inside the existing content box, and it owns the keyboard while it is open.**

A `ConfirmPrompt` renders like `LoadingOverlay` — absolutely positioned inside `ScreenPanel`'s content box, above the screen's own content — but with two lines: the question (`retry job <name>?`, `run job <name>?`) and its keys (`enter confirm  esc cancel`). The question uses the help gray and the keys the frame gray, so the prompt reads as chrome; the success, failed and running-or-pending colors stay reserved for job state. (In this codebase the help gray is the same hex as the `other` bucket, which is why the requirement names the three state-carrying colors instead of all four buckets.) `ScreenPanel` gains an optional prompt node next to its existing `loadingLabel`, and the graph, attempts and log panels pass it from `model.confirm`.

The prompt outranks the log-loading overlay in z-order, and the request is refused outright while a manual refresh is showing. Without that, the two overlays paint into the same centred cells — the confirmed question and the spinner composite into one unreadable line — so the prompt is simply not offered while the screen is mid-refresh.

The prompt is not transient status, so it stays out of the chrome status area and the key-help line keeps listing the screen's own keys, which is what the screen-chrome requirement already demands.

Key handling adds one branch ahead of the per-screen handlers and, importantly, ahead of the global `escape` → back branch: while a prompt is open, `enter` confirms and `escape` cancels, every other key is swallowed except `q`, which still quits because quitting changes no GitLab state and is handled first today.

## Risks / Trade-offs

- [A manual bridge job would start a child pipeline instead of a job] → `isPlayableJob` rejects bridges, and the bridge branch of the refusal message names the reason.
- [`glab ci trigger` behaviour is version-specific] → the command, its numeric-id handling and its output line were read from the installed 1.117.0 binary, and the apply tasks spike the real command before wiring the UI.
- [GitLab may answer a play with a different job id (its invalid-transition fallback)] → `retrySucceeded` plus name-based focus reconciliation already handles a replaced attempt; a task covers the changed-id case.
- [A run leaves the card showing `manual` with a `running…` marker until the refresh lands] → same shape as a retry today, and the refresh follows the CLI answer immediately.
- [The two-action refusal notice is long for a narrow terminal] → it is one short line in the graph body, and the retry-only screens keep the shorter wording.
- [A status other than `manual` may look runnable to the operator on some instances] → the gate is one predicate; widening it later is a one-line change plus a spec delta.
- [A confirmation prompt makes every retry slower, including the hurried "the flaky test failed again" case] → accepted by the operator's request: a stray `ctrl+r` must not start a GitLab job, and the prompt costs one `enter`.
- [Escape now means "cancel the prompt" on the log and graph screens, where it used to mean back] → the prompt branch runs before the back branch, and a task verifies both meanings with a prompt open and closed.
- [A prompt left open while polling changes the pipeline] → the re-check in decision 9 refuses the action with a message instead of starting a job that no longer qualifies.

## Migration Plan

No migration: the TUI keeps no state between runs and stores nothing in GitLab. Rollback is reverting the commit.
