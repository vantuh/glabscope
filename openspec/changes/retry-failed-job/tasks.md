## 1. Spikes Against the Operator's GitLab

- [ ] 1.1 Spike `glab ci retry <job-id>` against a real project on the operator's GitLab: retry a failed job by numeric id (no `-p`/`-b`) and confirm the command retries that job's attempt, not the latest job with the same name. Verify by running the command, comparing the printed new id against the job GitLab shows, and recording the exact stdout line as a fixture for task 2.1.
Superseded by the latest-attempt decision (design decision 5): the jobs connection stays unfiltered, so no `retried: false` argument is sent and there is no argument left to spike. The collapse to one node per job is covered by the fixture in 3.1 instead.

## 2. Retry Command Wrapper

- [x] 2.1 Add `src/glab/retry.ts` with `retryJob(jobId)` calling `glab ci retry <job-id>` through `runGlab` and `parseRetriedJobId(stdout)` reading `Retried job (ID: <id>)`. Verify unit tests cover the fixture stdout, stdout wrapped in SGR sequences, a nonzero exit surfacing stderr, and stdout without the pattern returning no id.
- [x] 2.2 Add `isRetryableJob(job)` in the same module: `failed` and `canceled` statuses only, and never a bridge/trigger job. Verify unit tests cover every status the graph can show (failed, canceled, success, running, pending, skipped, manual, created) and a bridge job whose status is failed.

## 3. Latest Attempt in the Graph

- [x] 3.1 Keep the jobs connection unfiltered (no `retried: false`, so earlier attempts stay in the payload for the attempts list) and add `src/fixtures/pipeline-jobs-retried.json` with a retried-away attempt. Verify `src/glab/query.test.ts` records that the query asks for every attempt, and `src/glab/graph.test.ts` collapses that fixture into exactly one node per job name+stage with its `needs` intact.
- [x] 3.2 Reconcile graph focus by job id first and by job name when the id is gone, so an attempt swap keeps focus on the same job. Verify `src/model.test.ts` covers id present, id replaced by a new attempt with the same name, and neither present falling back to the nearest row.

## 4. Retry on the Job Graph

- [x] 4.1 Add the `ctrl+r` key predicate to `src/keys.ts` beside `isQuitKey` and use it in both screen handlers. Verify `src/keys.test.ts` accepts Ctrl+R, rejects plain `r`, and rejects Ctrl+R combined with another modifier.
- [x] 4.2 Add reducer state for one in-flight retry per job plus a non-fatal retry message, rejecting an in-flight retry for the same job and clearing the message on navigation or a successful refresh. Verify `src/model.test.ts` covers accept, duplicate rejection, refusal message, failure message, and message clearing.
- [x] 4.3 Wire `ctrl+r` on the graph: call `retryJob` for the focused job, refresh the graph immediately on success, and show refusals, in-flight state, and GitLab failures non-fatally. Verify `src/app.test.tsx` shows one retry call for a failed job with focus kept on that job's name, no `glab` call plus a message for a non-retryable job, one call for a repeated press while in flight, and the graph still navigable after a failed retry.
- [x] 4.4 Add `ctrl+r retry` to the graph key-help footer. Verify a captured frame for the graph screen contains the retry key alongside the existing keys.

## 5. Retry on the Job Log

- [x] 5.1 Add a reducer action that re-attaches the log screen to a new attempt id, resetting the trace buffer, and a fallback that returns to the graph when no new id is available. Verify `src/model.test.ts` covers both, plus rejection while a retry is already in flight.
- [x] 5.2 Wire `ctrl+r` on the log screen: restart the traced job, re-attach the trace to the new attempt, and show refusals and failures without dropping the visible log. Verify `src/app.test.tsx` shows a new `glab ci trace` spawn for the new job id with the previous body cleared, no respawn plus a message for a non-retryable job, the log kept after a failed retry, and the graph screen with a message when the new id cannot be read.
- [x] 5.3 Add `ctrl+r retry` to the log key-help footer without mixing it into the trace body. Verify a captured frame for the log screen contains the retry key in the chrome row only.

## 6. Verification

- [x] 6.1 Run `bun test` and verify every test added or touched by this change passes; report any still-failing test that belongs to the in-progress `gitlab-style-pipeline-graph` change instead of fixing it here.
- [x] 6.2 List the retry key in the README's key line, next to the existing keys, without reordering or rewriting the rest of that line. Verify the README diff shows only the added key.
- [ ] 6.3 Manually retry a failed job from the graph and from its log against the operator's GitLab: verify the restarted attempt replaces the old node, the log screen streams the new attempt, `ctrl+r` on a running and on a successful job changes nothing but shows the message, and Esc still returns to the graph and list.
