## MODIFIED Requirements

### Requirement: Stay on the log after the job ends
When the job finishes or the tracer process exits, the system MUST keep the log screen and its buffer visible. The operator leaves that trace only with the back action, which MUST return to the job graph with the same job focused if that job still exists. A successful retry started from the log screen is the one other way the current trace ends: the screen then shows the new attempt instead.

#### Scenario: Job completes while watching
- **WHEN** a running job reaches a terminal status while the log screen is open
- **THEN** the operator remains on the log screen and can scroll the captured output

#### Scenario: Tracer exits
- **WHEN** the trace process exits after printing a finished job’s log
- **THEN** the log screen stays open until the back action

#### Scenario: Back to graph
- **WHEN** the operator uses the back action on the log screen
- **THEN** they return to the job graph, not the pipeline list

#### Scenario: Retry replaces the traced attempt
- **WHEN** a retry started from the log screen succeeds
- **THEN** the previous attempt’s log is no longer shown and the screen carries the new attempt’s trace instead

## ADDED Requirements

### Requirement: Retry the traced job from its log
Pressing the retry key on the log screen SHALL restart the job being traced and then show the newly created attempt in the same screen. The system SHALL only request a restart when the traced job's status is failed or canceled; for any other status the system MUST NOT contact GitLab and MUST show a short non-fatal message instead. The restart MUST go through the GitLab CLI retry command for that job's id, and the system MUST NOT restart a job by any other route.

#### Scenario: Retry a failed job from its log
- **WHEN** the operator is reading the log of a failed job and presses the retry key
- **THEN** that job is restarted in GitLab, the log screen clears the failed trace, and the new attempt’s live trace streams in the same framed log panel

#### Scenario: Retry feedback while the restart is in flight
- **WHEN** a retry has been requested from the log screen and GitLab has not answered yet
- **THEN** the log screen marks the retry as in progress and the operator can still scroll the current output or go back

#### Scenario: Traced job is not retryable
- **WHEN** the operator presses the retry key while the traced job is running, pending, successful, skipped, manual, or created
- **THEN** no restart is requested, the current log stays visible, and a short non-fatal message explains that only failed or canceled jobs can be retried

#### Scenario: Repeated retry while one is in flight
- **WHEN** the operator presses the retry key again while a retry from the log screen is still in flight
- **THEN** the system does not request a second restart and the in-flight retry is unaffected

#### Scenario: GitLab rejects the retry
- **WHEN** the retry request is rejected by GitLab or the CLI
- **THEN** the current log stays visible and a non-fatal message shows why the restart was refused

#### Scenario: The new attempt cannot be identified
- **WHEN** the restart succeeded but the system cannot determine the new attempt’s job id
- **THEN** the system leaves the log screen, returns to the job graph for that job, and shows a non-fatal message saying the new attempt could not be followed
