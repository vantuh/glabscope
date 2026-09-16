## Why

When a job fails, the operator has to leave the TUI and run `glab ci retry` or open the GitLab web UI, then come back and re-find the job. Restarting the job they are already looking at — from its log or the job graph — belongs in the same nested session.

## What Changes

- `ctrl+r` restarts the focused job on the job graph and the traced job on the job log, through the official `glab ci retry <job-id>` command: no new HTTP client, no HTML scraping.
- Retry is offered only for jobs whose GitLab status is `failed` or `canceled`. On any other status, and on trigger/bridge jobs, `ctrl+r` contacts no GitLab and shows a short non-fatal message.
- After a retry from the graph, the graph refreshes immediately so the restarted attempt replaces the old node, with focus kept on the same job.
- After a retry from the log, the screen re-attaches to the newly created attempt and streams its trace live, so the operator watches the restart instead of a finished log. If the new attempt's id cannot be read, the screen returns to the job graph.
- The graph shows only the latest attempt of each job, so a retried job never renders as two nodes with the same name.
- Retry refusals (permission, quota, or GitLab rejection) keep the current screen usable with a non-fatal message, never a fatal screen. Both screens list the retry key in their dim key-help line.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `job-graph`: add a retry action on the focused job with an explicit retryable-status gate, immediate refresh and preserved focus after a successful retry, and a latest-attempt-only job set.
- `job-logs`: add a retry action on the traced job and re-attach the log screen to the newly created attempt.
- `screen-chrome`: key-help lines for the job graph and job log must include the retry key.

## Impact

- New `src/glab/retry.ts` wrapping `glab ci retry <job-id>` and reading the new job id from its output; `src/keys.ts` gains the `ctrl+r` predicate.
- `src/glab/query.ts` / `src/glab/graph.ts`: keep the jobs connection unfiltered so earlier attempts reach the attempts list, and show one card per job from `latestJobs`.
- `src/model.ts` / `src/app.tsx`: retry in-flight guard, non-fatal retry messages, immediate graph refresh after retry, focus reconciliation by job name when the focused attempt id is gone, and log re-attach to a new job id.
- Tests: `src/glab/retry.test.ts` (new), `src/glab/query.test.ts`, `src/model.test.ts`, `src/app.test.tsx`.
- Builds on the uncommitted `gitlab-style-pipeline-graph` work in these files; its in-progress failing focus test is out of scope here.
- No new dependency, no stored token, no `glab` subcommand beyond `ci retry`.

## Non-goals

- Cancel, play/manual, artifacts, MR entry, YAML visualize, or child-pipeline drill-down.
- Retry from the pipeline list, bulk or whole-pipeline retry, or retrying bridge/trigger jobs.
- Retrying `success`, `manual`, `skipped`, or `created` jobs, or jobs GitLab calls active.
- Any local retry queue, offline retry, or scheduling: every retry is one immediate `glab` call.
