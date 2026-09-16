## Context

See `proposal.md` for motivation and `specs/job-graph/spec.md` for the requirements.

The retry action already provides everything a second job action needs, and this design leans on it instead of building a parallel path:

- `src/glab/retry.ts`: `retryArgv`, `parseRetriedJobId`, `isRetryableJob`, `retryJob` through `runGlab` (20 s timeout, nonzero exit → `Error`).
- `src/model.ts`: the `retry` in-flight slot, `retryMessage` notice, `startRetry` / `retrySucceeded` / `retryFailed` actions, and `retryRefusalMessage`.
- `src/app.tsx`: `isRetryKey`, the `retryRef` re-entry guard, `refreshGraphAfterRetry`, and the graph / attempts / logs key handlers.
- `src/glab/query.ts` + `src/glab/graph.ts`: the pipeline graph payload (`status`, `kind`, `retried`, `needs`).

Facts established before writing this, against glab 1.117.0 and the operator's instance (`gitlab.foodtech.team`):

- `glab ci trigger <job-id>` is the only official route to a manual job. With a numeric argument no `-p` / `-b` is required (`ciutils.GetJobId` returns an integer id directly), and the command prints `Triggered job (ID: %d), status: %s, ref: %s, weburl: %s`. The format string is in the installed binary, beside retry's `Retried job (ID: %d), …` and `Could not trigger job with ID: %d`.
- Node names in the graph are already the GitLab job id, so the focused card's `numericId` is the argument.
- GitLab's play service enqueues the job in place (`Ci::PlayBuildService` → `Ci::EnqueueJobService` → `job.enqueue!`), so a run normally keeps the job id and the card moves `manual` → `pending`. Only GitLab's internal invalid-transition fallback produces a new attempt with a new id.
- GitLab's own `playable` condition is `action? && !archived? && (manual? || scheduled? || retryable?)`, which is also true for successful manual jobs and for retryable jobs, and the GraphQL `playable` / `canPlayJob` fields are not needed for the status gate chosen below (`canPlayJob` additionally calls Gitaly).

## Goals / Non-Goals

**Goals:**

- One key, two job actions, with the deciding policy in a single pure function that the reducer and the key handler share.
- No change to the GraphQL query, the polling cadence rules, the attempts list, or the log screen.
- The run path reuses retry's in-flight guard, immediate refresh, and focus reconciliation, so a run cannot corrupt retry's invariants.

**Non-Goals:**

- Any GraphQL field addition, any second HTTP client, any `glab ci run`/pipeline-level command.
- Manual job variables or inputs; `glab ci trigger` is called with the job id alone.
- Running from the attempts list or the log screen.
- Optimistically painting the card before the refresh returns.

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

## Risks / Trade-offs

- [A manual bridge job would start a child pipeline instead of a job] → `isPlayableJob` rejects bridges, and the bridge branch of the refusal message names the reason.
- [`glab ci trigger` behaviour is version-specific] → the command, its numeric-id handling and its output line were read from the installed 1.117.0 binary, and the apply tasks spike the real command before wiring the UI.
- [GitLab may answer a play with a different job id (its invalid-transition fallback)] → `retrySucceeded` plus name-based focus reconciliation already handles a replaced attempt; a task covers the changed-id case.
- [A run leaves the card showing `manual` with a `running…` marker until the refresh lands] → same shape as a retry today, and the refresh follows the CLI answer immediately.
- [The two-action refusal notice is long for a narrow terminal] → it is one short line in the graph body, and the retry-only screens keep the shorter wording.
- [A status other than `manual` may look runnable to the operator on some instances] → the gate is one predicate; widening it later is a one-line change plus a spec delta.

## Migration Plan

No migration: the TUI keeps no state between runs and stores nothing in GitLab. Rollback is reverting the commit.
