## MODIFIED Requirements

### Requirement: Keymap in chrome, not mixed into content
Each framed screen MUST show the keys that work on that screen in a dim help line that is part of the chrome (footer or title area), not mixed into the first content row. Transient status text MUST NOT be appended to that help line: the help line's own text MUST be the same whether or not a status is pending. A key that only applies to some jobs MUST still be listed on the screens where it can apply. When one key carries more than one job action, the help line MUST name each action that key can perform rather than only the action that fits the focused job.

#### Scenario: List help
- **WHEN** the pipeline list is visible
- **THEN** enter/quit (and back, when it applies) appear in the dim chrome help line

#### Scenario: Graph help
- **WHEN** the job graph is visible
- **THEN** move, open log, refresh, retry, run, back, and quit appear in the dim chrome help line

#### Scenario: Log help
- **WHEN** the job log is visible
- **THEN** retry, back, and live vs ended are visible in the chrome, and the trace body is only log text

#### Scenario: Attempts help
- **WHEN** the attempts list is visible
- **THEN** open log, retry, back, and quit appear in the dim chrome help line

#### Scenario: A status does not extend the help line
- **WHEN** a transient status is visible on a screen and then clears
- **THEN** the help line text is unchanged, with no status word inside it in either state

#### Scenario: Retry key pressed on a job that cannot be retried
- **WHEN** the operator presses the retry key on a job that is neither failed or canceled nor a waiting manual job
- **THEN** the reason is shown as a non-fatal message in the screen content, and the dim help line keeps listing that key

## ADDED Requirements

### Requirement: Confirm a job action before it starts
Before the system starts or restarts a job at the operator's request, it MUST show a confirmation prompt for that action and that job and MUST NOT request anything from GitLab until the operator answers it. A job the key cannot act on MUST keep showing its non-fatal message instead of a prompt. The prompt MUST appear inside the framed content area of the screen that asked for it, above that screen's own content, which MUST stay visible behind it, and it MUST use the muted chrome color rather than any of the four status-bucket colors. The prompt MUST name the job and the action the operator is about to take, and MUST show the keys that answer it. Enter MUST confirm the prompt and Escape MUST cancel it; while the prompt is open those two keys answer it and every other key is ignored, except the quit key, which MUST still quit. Cancelling MUST choose nothing: the screen stays exactly as it was, no job action is recorded, and no message explains the cancellation. On confirmation the system MUST re-check the action against the job as it now stands in the pipeline and MUST refuse instead of starting it: with that action's own non-fatal message while the job is still in the pipeline, or with a message saying the job is no longer in the pipeline when a refresh dropped it.

#### Scenario: Prompt for a restart
- **WHEN** the operator presses the retry key on a failed or canceled job
- **THEN** the screen shows a prompt naming that job and the restart it would perform, with the screen's own content still visible behind it and no GitLab command started yet

#### Scenario: Prompt for a run
- **WHEN** the operator presses the retry key on a waiting manual job
- **THEN** the screen shows a prompt naming that job and the run it would perform, with the screen's own content still visible behind it and no GitLab command started yet

#### Scenario: Confirmed action
- **WHEN** the operator confirms the prompt
- **THEN** the prompt disappears and the named job action is requested exactly once

#### Scenario: Cancelled action
- **WHEN** the operator presses escape to cancel the prompt
- **THEN** no job action is requested, no message appears, the prompt closes, and the screen behind it is unchanged: nothing navigates back

#### Scenario: Other keys while the prompt is open
- **WHEN** the operator presses a movement or refresh key while the prompt is open
- **THEN** the prompt stays and nothing on the screen behind it changes

#### Scenario: Quit while the prompt is open
- **WHEN** the operator presses the quit key while the prompt is open
- **THEN** the app quits

#### Scenario: The job changed while the prompt was open
- **WHEN** the pipeline state changes while the prompt is open so that the named job no longer qualifies for that action
- **THEN** confirming starts nothing in GitLab and shows the message the key shows for a job it cannot act on, or that the job is no longer in this pipeline when a refresh dropped the job
