## Why

A `when: manual` job leaves its graph card gray with no way to start it, so the operator leaves the TUI for `glab ci trigger`. The key that retries a failed job should reach that waiting job too — and since it starts and restarts GitLab jobs, one accidental press must not be enough.

## What Changes

- The retry key on the job graph becomes a two-way job action: a focused failed or canceled job is still retried, and a focused job whose GitLab status is `manual` is run through the official `glab ci trigger <job-id>` command.
- Every job action — retry on the graph, the attempts list, and the log screen, and run on the graph — asks for confirmation first: a prompt names the action and the job, `enter` confirms, `esc` cancels, and other keys are ignored while it is open. No `glab` command starts before the confirmation; cancelling contacts no GitLab and leaves the screen as it was.
- Any other focused job contacts no GitLab and shows a short non-fatal message naming the states the key acts on: run applies to status `manual` only, never to a trigger or bridge job.
- After a successful action the graph refreshes immediately: the card shows its new status in place with focus kept, and running a manual job of a terminal pipeline restores the normal refresh cadence.
- In-flight and failure feedback distinguishes the two actions (`retrying…` versus `running…`, `retry failed:` versus `run failed:`).
- The project context lists play as out of scope for v1; this change expands it on the operator's request.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `job-graph`: add running a waiting manual job from the focused graph card, and require confirmation before that run and before the graph and attempts-list retries, with an explicit status gate, an immediate refresh that keeps focus, and non-fatal refusals.
- `job-logs`: require confirmation before a retry started from the log screen.
- `screen-chrome`: the graph key-help line lists the key as retry-or-run, the refusal scenario covers both actions, and the confirmation prompt is specified as chrome inside the framed content area.

## Impact

- New `src/glab/play.ts` wrapping `glab ci trigger <job-id>` and reading the played job id from `Triggered job (ID: <id>)`; a model-level `jobActionKind(job, screen)` decides retry, run, or neither.
- `src/model.ts` / `src/app.tsx`: a pending confirmation with confirm and cancel, an in-flight job action carrying its kind and messages, and one shared start path.
- Tests: `src/glab/play.test.ts` (new), `src/model.test.ts`, `src/app.test.tsx`; README key line.
- No new dependency, no stored token, no `glab` subcommand beyond `ci trigger`, no GraphQL change.

## Non-goals

- Starting or restarting a job without confirmation, and any "don't ask again" preference.
- Playing jobs GitLab reports as `skipped`, `scheduled`, `created`, or already run, and any bridge job.
- Cancel, whole-pipeline run (`glab ci run`), artifacts, MR entry, YAML visualize, child-pipeline drill-down.
- Manual job variables or inputs: the job id alone is passed.
