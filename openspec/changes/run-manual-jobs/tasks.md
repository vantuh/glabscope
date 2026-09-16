## 1. Spike Against the Operator's GitLab

- [ ] 1.1 Spike `glab ci trigger <job-id>` on a real project of the operator's GitLab: pick a pipeline with a waiting manual job, trigger it by numeric id with no `-p` and no `-b`, and record the exact stdout line as the fixture for task 2.1. Verify by comparing the printed id, status, and ref with what GitLab shows for that pipeline, and by noting whether the printed id equals the id passed in (the in-place enqueue) or a new attempt id.

## 2. Play Command Wrapper

- [ ] 2.1 Add `src/glab/play.ts` with `playArgv(jobId)`, `parseTriggeredJobId(stdout)`, and `playJob(jobId, cwd)` calling `glab ci trigger <job-id>` through `runGlab`, beside the module's doc comment naming that exact command. Verify `src/glab/play.test.ts` covers the fixture stdout from 1.1, stdout wrapped in SGR sequences, a nonzero exit surfacing stderr, a stdout without the pattern returning no id, and a non-numeric job id rejected before any process is spawned.
- [ ] 2.2 Add `isPlayableJob(job)` to the same module: status `manual` only, and never a bridge job. Verify unit tests cover manual, skipped, scheduled, created, running, pending, success, failed, and canceled, plus a bridge job whose status is manual.

## 3. Job Action Policy in the Model

- [ ] 3.1 Add `jobActionKind(job, screen)` with its per-screen action table: the graph offers retry and run, the attempts list and the log offer retry only, and retry wins when both could apply. Verify `src/model.test.ts` covers a failed graph job yielding `retry`, a manual graph job yielding `play`, a manual job on the log screen yielding `null`, and a manual job on the attempts screen yielding `null`.
- [ ] 3.2 Use `jobActionKind` inside the retry reducer case: store the action kind in the in-flight slot alongside the job id and screen, and refuse a start while any job action is already in flight. Verify `src/model.test.ts` shows `kind: "play"` for a manual job on the graph, `kind: "retry"` for a failed job, one refused second start for a repeated press of either kind, and no state change for a job the table refuses.
- [ ] 3.3 Rename the local refusal helper to `jobActionRefusalMessage(job, screen)` and give it one wording per case: a trigger or bridge job says the job cannot be restarted here, a screen with the run action names both retryable and runnable states, and a screen without it keeps the retry-only wording. Verify `src/model.test.ts` asserts each wording, including the bridge message change from the old "cannot be retried" text.

## 4. Run on the Job Graph

- [ ] 4.1 Generalize the app-level start helper to ask `jobActionKind` for the focused job and the current screen, spawn the retry command for a retry and the trigger command for a run, keep the one-action re-entry guard, and leave the attempts and log handlers on retry only. Verify `src/app.test.tsx` shows one `glab ci trigger` call with the focused manual card's id and no retry call, still one `glab ci retry` and no trigger call for a failed card, no spawn at all for a manual card on the log screen, and no second spawn on a repeated press while a run is in flight.
- [ ] 4.2 Refresh the graph immediately after a successful run through the existing post-action refresh, keeping focus on the same job by id and by job name+stage when the command answers with a different id, and show refusals and CLI failures non-fatally. Verify `src/app.test.tsx` covers the in-place same-id answer keeping focus and the graph navigable after a rejected run, and `src/model.test.ts` covers focus following a replaced id.
- [ ] 4.3 Read the stored action kind for the in-flight status label and the failure text, so a run in flight reads as running while a retry in flight keeps reading as retrying, and a failure is prefixed for the action that failed. Verify `src/app.test.tsx` shows the running label while a manual job's trigger call is unanswered, the retrying label for a retry in flight, and a `run failed:` message that keeps the graph navigable.
- [ ] 4.4 List the run action beside the retry action in the graph key-help footer, without changing the attempts or log footers. Verify a captured graph frame contains `ctrl+r retry/run` in the chrome row and captured attempts and log frames still show `ctrl+r retry` only.

## 5. Change-Level Verification

- [ ] 5.1 Run `bun test` and `./node_modules/.bin/tsc --noEmit` and verify every test added or touched by this change passes and the type check is clean; report any pre-existing failure instead of fixing it here.
- [ ] 5.2 Add the run action to the README key line next to the retry wording, without reordering or rewriting the rest of the line. Verify the README diff shows only that wording change.
- [ ] 5.3 Manually run a waiting manual job from the graph of a real pipeline on the operator's GitLab: verify the same card turns running-or-pending, the graph returns to its normal refresh interval, `ctrl+r` on a skipped and on a failed job still behaves as specified, the refusal notice appears for a job the key cannot act on, and Esc still returns to the list.
