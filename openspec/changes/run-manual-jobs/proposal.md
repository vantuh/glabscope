## Why

A pipeline with a `when: manual` job is stuck: the graph card renders gray and nothing in the TUI can start it, so the operator leaves the session, runs `glab ci trigger`, and comes back. Retry already showed that acting on the focused card belongs in the TUI; the same key should reach the waiting manual job.

## What Changes

- The retry key on the job graph becomes a two-way job action: a focused failed or canceled job is still retried exactly as today, and a focused job whose GitLab status is `manual` is run through the official `glab ci trigger <job-id>` command. No second HTTP client, no HTML scraping.
- A focused job that is neither failed or canceled nor a waiting manual job contacts no GitLab and shows a short non-fatal message naming the states the key acts on.
- Run is offered only for jobs whose status is `manual`, and never for trigger or bridge jobs. Manual jobs GitLab reports as `skipped`, `scheduled`, `created`, `success`, or active are not run.
- After a successful run the graph refreshes immediately, so the same card turns running-or-pending in place, focus stays on that job, and the pipeline's normal refresh cadence resumes because the pipeline is active again.
- In-flight and failure feedback distinguishes the two actions (`retrying…` versus `running…`, and a `run failed:` message beside the existing `retry failed:` one).
- The job log screen and the attempts list are unchanged: there the key still only retries.
- The project context lists play as out of scope for v1; this change explicitly expands it for play only, on the operator's request.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `job-graph`: add running a waiting manual job from the focused graph card, with an explicit status gate, an immediate refresh that keeps focus, and non-fatal refusals.
- `screen-chrome`: the graph key-help line lists the key as retry-or-run, and the refusal scenario covers both actions.

## Impact

- New `src/glab/play.ts` wrapping `glab ci trigger <job-id>` and reading the played job id from `Triggered job (ID: <id>)`; a model-level `jobActionKind(job)` decides retry, run, or neither.
- `src/model.ts` / `src/app.tsx`: the in-flight job action carries its kind and its messages; the run path reuses retry's in-flight guards, refresh, and focus reconciliation.
- Tests: `src/glab/play.test.ts` (new), `src/model.test.ts`, `src/app.test.tsx`.
- README key line, next to the existing keys.
- No new dependency, no stored token, no `glab` subcommand beyond `ci trigger`; the GraphQL query and its fields stay as they are.

## Non-goals

- The job log screen and the attempts list: no run action there, retry only, as today.
- Playing jobs GitLab reports as `skipped`, `scheduled`, `created`, or already run, and any bridge job.
- Cancel, whole-pipeline run (`glab ci run`), artifacts, MR entry, YAML visualize, child-pipeline drill-down.
- Manual job variables or inputs: `glab ci trigger` is called with the job id alone.
