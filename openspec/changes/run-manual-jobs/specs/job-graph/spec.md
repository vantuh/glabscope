## MODIFIED Requirements

### Requirement: Retry a failed job from the graph
Pressing the retry key on the graph SHALL show the confirmation prompt for the focused job and, once the operator confirms it, restart that job in GitLab and then show the restarted attempt. The system SHALL only request a restart when the focused job's status is failed or canceled and the job is not a trigger or bridge job; for any other focused job the system MUST NOT request a restart, and while a waiting manual job is handled by the run requirement, every other status MUST contact no GitLab and MUST show a short non-fatal message instead. No restart MUST be requested before the operator confirms the prompt. The restart MUST go through the GitLab CLI retry command for that job's id, and the system MUST NOT restart a job by any other route. The refresh that follows a restart MUST belong to the pipeline that job is in, so a graph the operator has since opened for another pipeline is never replaced by it.

#### Scenario: Retry a failed job
- **WHEN** the focused job has failed and the operator presses the retry key and confirms the prompt
- **THEN** that job is restarted in GitLab and the graph replaces the failed node with the new attempt, still focused on the same job

#### Scenario: Retry a canceled job
- **WHEN** the focused job was canceled and the operator presses the retry key and confirms the prompt
- **THEN** that job is restarted in GitLab and the graph shows the new attempt for the same job

#### Scenario: Retry feedback while the restart is in flight
- **WHEN** a retry has been requested and GitLab has not answered yet
- **THEN** the graph screen marks the retry as in progress without blocking navigation

#### Scenario: Focused job is not retryable
- **WHEN** the operator presses the retry key while the focused job is running, pending, successful, skipped, or created
- **THEN** no restart is requested and no prompt appears, the graph keeps showing the current jobs, and a short non-fatal message explains which jobs this key can act on

#### Scenario: Focused job is a trigger or bridge job
- **WHEN** the operator presses the retry key while a trigger or bridge job is focused
- **THEN** no restart is requested and no prompt appears, and a short non-fatal message says that this job cannot be restarted here

#### Scenario: Retry prompt is cancelled
- **WHEN** the operator presses the retry key on a failed job and then cancels the prompt
- **THEN** no restart is requested, the graph keeps showing the current jobs, and no message appears

#### Scenario: Repeated retry while one is in flight
- **WHEN** the operator presses the retry key again while a retry is still in flight
- **THEN** the system does not request a second restart and the in-flight retry is unaffected

#### Scenario: GitLab rejects the retry
- **WHEN** the retry request is rejected by GitLab or the CLI
- **THEN** the graph stays navigable with its current jobs and a non-fatal message shows why the restart was refused

#### Scenario: Graph refreshed while the restart runs
- **WHEN** a background or manual graph refresh completes while a retry is in flight
- **THEN** the refreshed graph is shown and the retry in flight is unaffected

#### Scenario: The restart settles after another pipeline was opened
- **WHEN** the restart's answer arrives while the operator has opened another pipeline
- **THEN** that pipeline's graph stays on screen and is not replaced by the restarted job's pipeline

### Requirement: Retry a failed attempt from the attempts list
Pressing the retry key on the attempts list SHALL show the confirmation prompt for the focused attempt and, once the operator confirms it, restart that attempt in GitLab. The system SHALL only request a restart when the focused attempt's status is failed or canceled and it is not a trigger or bridge job; for any other attempt the system MUST NOT contact GitLab and MUST show a short non-fatal message instead. No restart MUST be requested before the operator confirms the prompt. The restart MUST go through the GitLab CLI retry command for that attempt's id, and the system MUST NOT restart an attempt by any other route. After a successful restart the attempts list MUST refresh for that job.

#### Scenario: Retry the job's latest attempt
- **WHEN** the focused row is the job's latest attempt, it is failed, and the operator presses the retry key and confirms the prompt
- **THEN** that attempt is restarted in GitLab, the list refreshes for the job, and focus follows the attempt that replaced it

#### Scenario: Retry an earlier attempt
- **WHEN** the focused row is an earlier, superseded attempt, it is failed, and the operator presses the retry key and confirms the prompt
- **THEN** that attempt is restarted in GitLab and focus stays on the attempt that was retried

#### Scenario: Retry feedback while the restart is in flight
- **WHEN** a retry has been requested from the attempts list and GitLab has not answered yet
- **THEN** the attempts screen marks the retry as in progress without blocking navigation

#### Scenario: Focused attempt is not retryable
- **WHEN** the operator presses the retry key on an attempt that is running, pending, successful, or skipped
- **THEN** no restart is requested and no prompt appears, the list keeps showing the job's attempts, and a short non-fatal message explains that only failed or canceled attempts can be retried

#### Scenario: Retry prompt is cancelled
- **WHEN** the operator presses the retry key on a failed attempt and then cancels the prompt
- **THEN** no restart is requested, the list keeps showing the same attempts with the same row focused, and no message appears

#### Scenario: Repeated retry while one is in flight
- **WHEN** the operator presses the retry key again while a retry is still in flight
- **THEN** the system does not request a second restart and the in-flight retry is unaffected

#### Scenario: GitLab rejects the retry
- **WHEN** the retry request is rejected by GitLab or the CLI
- **THEN** the attempts list stays navigable with its rows and a non-fatal message shows why the restart was refused

## ADDED Requirements

### Requirement: Run a waiting manual job from the graph
Pressing the retry key on the graph SHALL show the confirmation prompt for the focused job and, once the operator confirms it, run that job in GitLab when the job's status is `manual` and it is not a trigger or bridge job. The system SHALL only run a job in that state: for any other focused job it MUST NOT start a job and MUST show a short non-fatal message naming the states the key acts on. No run MUST be requested before the operator confirms the prompt. The run MUST go through the GitLab CLI command that triggers a manual job by job id, and the system MUST NOT start a job by any other route. The system MUST request at most one job action at a time, so a run and a restart can never be in flight together. After a successful run the graph MUST refresh immediately, so the card for that job shows its new status with focus still on that job, and that refresh MUST belong to the pipeline the job is in rather than replacing a graph the operator has since opened for another pipeline.

#### Scenario: Run a waiting manual job
- **WHEN** the focused job has status `manual` and the operator presses the retry key and confirms the prompt
- **THEN** that job is started in GitLab, and once the immediate refresh lands the graph shows that job's card in the running-or-pending bucket, still focused on that job, with still one card for that job name and stage

#### Scenario: Run prompt is cancelled
- **WHEN** the operator presses the retry key on a waiting manual job and then cancels the prompt
- **THEN** no job is started, the graph keeps showing the current jobs, and no message appears

#### Scenario: Run feedback while the run is in flight
- **WHEN** a run has been requested and GitLab has not answered yet
- **THEN** the graph screen marks the run as in progress without blocking navigation

#### Scenario: Focused job is not runnable
- **WHEN** the operator presses the retry key while the focused job is skipped, scheduled, created, successful, running, or pending
- **THEN** no run is requested and no prompt appears, the graph keeps showing the current jobs, and a short non-fatal message explains which jobs this key can act on

#### Scenario: Focused job is a trigger or bridge job
- **WHEN** the operator presses the retry key while a trigger or bridge job is focused
- **THEN** no run is requested and no prompt appears, and a short non-fatal message says that this job cannot be restarted here

#### Scenario: Repeated run while one is in flight
- **WHEN** the operator presses the retry key again while a run is still in flight
- **THEN** the system does not request a second run and the in-flight run is unaffected

#### Scenario: A job action starts while another is in flight
- **WHEN** the operator presses the retry key on another job while a run or a restart is still in flight
- **THEN** the system does not request a second job action and the action in flight is unaffected

#### Scenario: GitLab rejects the run
- **WHEN** the run is rejected by GitLab or the CLI
- **THEN** the graph stays navigable with its current jobs and a non-fatal message shows why the job was not started

#### Scenario: Graph refreshed while the run is in flight
- **WHEN** a background or manual graph refresh completes while a run is in flight
- **THEN** the refreshed graph is shown and the run in flight is unaffected

#### Scenario: Running a job of a terminal pipeline
- **WHEN** the operator runs a waiting manual job of a pipeline that GitLab last reported as terminal
- **THEN** the next graph refresh reports the pipeline as running or pending and the graph returns to its normal refresh interval
