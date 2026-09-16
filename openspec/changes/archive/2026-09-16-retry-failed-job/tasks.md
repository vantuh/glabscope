## 1. Spikes Against the Operator's GitLab

- [x] 1.1 Spike `glab ci retry <job-id>` against a real project on the operator's GitLab: retry a failed job by numeric id (no `-p`/`-b`) and confirm the command retries that job's attempt, not the latest job with the same name. Verify by running the command, comparing the printed new id against the job GitLab shows, and recording the exact stdout line as a fixture for task 2.1.
This task, not the retry-command spike in 1.1, is superseded by the latest-attempt decision (design decision 5): the jobs connection stays unfiltered, so no `retried: false` argument is sent and there is no argument left to spike. The collapse to one node per job is covered by the fixture in 3.1 instead.

## 2. Retry Command Wrapper

- [x] 2.1 Add `src/glab/retry.ts` with `retryJob(jobId)` calling `glab ci retry <job-id>` through `runGlab` and `parseRetriedJobId(stdout)` reading `Retried job (ID: <id>)`. Verify unit tests cover the fixture stdout, stdout wrapped in SGR sequences, a nonzero exit surfacing stderr, and stdout without the pattern returning no id.
- [x] 2.2 Add `isRetryableJob(job)` in the same module: `failed` and `canceled` statuses only, and never a bridge/trigger job. Verify unit tests cover every status the graph can show (failed, canceled, success, running, pending, skipped, manual, created) and a bridge job whose status is failed.

## 3. Latest Attempt in the Graph

- [x] 3.1 Keep the jobs connection unfiltered (no `retried: false`, so earlier attempts stay in the payload for the attempts list) and add `src/fixtures/pipeline-jobs-retried.json` with a retried-away attempt. Verify `src/glab/query.test.ts` records that the query asks for every attempt, and `src/glab/graph.test.ts` collapses that fixture into exactly one node per job name+stage with its `needs` intact.
- [x] 3.2 Reconcile graph focus by job id first and by job name when the id is gone, so an attempt swap keeps focus on the same job. Verify `src/model.test.ts` covers id present, id replaced by a new attempt with the same name, and neither present falling back to the nearest row.

## 4. Retry on the Job Graph

- [x] 4.1 Add the `ctrl+r` key predicate to `src/keys.ts` beside `isQuitKey` and use it in both screen handlers. Verify `src/keys.test.ts` accepts Ctrl+R, rejects plain `r`, and rejects Ctrl+R combined with another modifier.
- [x] 4.2 Add reducer state for one in-flight retry per job plus a non-fatal retry message, rejecting an in-flight retry for the same job and clearing the message on navigation or the next retry, so a background refresh cannot wipe a reason before it is read. Verify `src/model.test.ts` covers accept, duplicate rejection, refusal message, failure message, and message clearing.
- [x] 4.3 Wire `ctrl+r` on the graph: call `retryJob` for the focused job, refresh the graph immediately on success (newest fetch wins over a poll already in flight or an older fetch from another pipeline), and show refusals, in-flight state, and GitLab failures non-fatally. Verify `src/app.test.tsx` shows one retry call for a failed job with focus kept on that job's new attempt, no `glab` call plus a message for a non-retryable job, one call for a repeated press while in flight, and the graph still navigable after a failed retry.
- [x] 4.4 Add `ctrl+r retry` to the graph key-help footer. Verify a captured frame for the graph screen contains the retry key alongside the existing keys.

## 5. Retry on the Job Log

- [x] 5.1 Add a reducer action that re-attaches the log screen to a new attempt id, resetting the trace buffer, and a fallback that returns to the graph when no new id is available. Verify `src/model.test.ts` covers both, plus rejection while a retry is already in flight.
- [x] 5.2 Wire `ctrl+r` on the log screen: restart the traced job (never the attempt it replaced), re-attach the trace to the new attempt, refresh the graph once so the new attempt's status becomes readable, and show refusals and failures without dropping the visible log. Verify `src/app.test.tsx` shows a new `glab ci trace` spawn for the new job id with the previous body cleared and the replaced tracer killed, no respawn plus a message for a non-retryable job, no restart at all for an attempt the graph cannot vouch for, the log kept after a failed retry, and the graph screen with a message when the new id cannot be read or its trace cannot be spawned.
- [x] 5.3 Add `ctrl+r retry` to the log key-help footer without mixing it into the trace body. Verify a captured frame for the log screen contains the retry key in the chrome row only.

## 6. Verification

- [x] 6.1 Run `bun test` and verify every test added or touched by this change passes; report any still-failing test that belongs to the in-progress `gitlab-style-pipeline-graph` change instead of fixing it here.
- [x] 6.2 List the retry key in the README's key line, next to the existing keys, without reordering or rewriting the rest of that line. Verify the README diff shows only the added key.
- [x] 6.3 Manually retry a failed job from the graph and from its log against the operator's GitLab: verify the restarted attempt replaces the old node, the log screen streams the new attempt, `ctrl+r` on a running and on a successful job changes nothing but shows the message, and Esc still returns to the graph and list.

## 7. Retry on the Job Attempts List

- [x] 7.1 Make the attempts branch of `refreshGraph` follow a replaced latest attempt: prefer the focused attempt's id, and drop that preference when the focused row was the focused job's own latest attempt, so focus lands on the newest row. Verify `src/model.test.ts` covers the latest-attempt retry (focus moves to the new attempt) and the earlier-attempt retry (focus stays on the attempt that was retried).
- [x] 7.2 Wire `ctrl+r` on the attempts screen: restart the focused attempt through `retryJob`, refresh the graph immediately on success, and show refusals, in-flight state, and GitLab failures non-fatally above the rows. Verify `src/app.test.tsx` shows one call for the focused attempt's id with focus on the replacement row, no `glab` call plus a message for a non-retryable attempt, one call for a repeated press while in flight, and the rows still navigable after a failed retry.
- [x] 7.3 Add `ctrl+r retry` to the attempts key-help footer. Verify a captured frame for the attempts screen contains the retry key in the chrome row only.
- [x] 7.4 Re-run `bun test` and `./node_modules/.bin/tsc --noEmit` after section 7: every test added or touched by this change must pass.

## 8. Review Follow-ups

- [x] 8.1 Only re-attach a log screen whose traced attempt is the one the restart started from, so a restart that completes after the operator opened another job's log cannot take over that screen. Verify `src/model.test.ts` and `src/app.test.tsx` both cover navigating to a second log mid-restart.
- [x] 8.2 Close the graph-fetch ordering hole: a canceled polling loop drops its own late answer, and opening another pipeline invalidates every fetch already in flight. Verify `src/app.test.tsx` holds pipeline 5's poll across a navigation to pipeline 6 and asserts the late answer does not land.
- [x] 8.3 Keep the retry notice until navigation instead of clearing it on any successful refresh, so the reason a log screen returned to the graph survives the post-retry refresh. Verify `src/model.test.ts` asserts the notice survives a refresh and both `src/model.test.ts` and `src/app.test.tsx` assert navigation clears it.
- [x] 8.4 Qualify the back action in the `job-logs` delta by where the log was opened, so the MODIFIED requirement no longer contradicts the archived `job-graph` requirement that a log opened from the attempts list returns there.
