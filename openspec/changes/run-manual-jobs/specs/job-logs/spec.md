## MODIFIED Requirements

### Requirement: Retry the traced job from its log
Pressing the retry key on the log screen SHALL show the confirmation prompt for the traced job and, once the operator confirms it, restart that job in GitLab and then show the newly created attempt in the same screen. The system SHALL only request a restart when the traced job's status is failed or canceled; for any other status the system MUST NOT contact GitLab and MUST show a short non-fatal message instead. No restart MUST be requested before the operator confirms the prompt. The restart MUST go through the GitLab CLI retry command for that job's id, and the system MUST NOT restart a job by any other route.

#### Scenario: Retry a failed job from its log
- **WHEN** the operator is reading the log of a failed job and presses the retry key and confirms the prompt
- **THEN** that job is restarted in GitLab, the log screen clears the failed trace, and the new attempt’s live trace streams in the same framed log panel

#### Scenario: Retry prompt is cancelled
- **WHEN** the operator presses the retry key while reading the log of a failed job and then cancels the prompt
- **THEN** no restart is requested, the current trace keeps streaming on the screen, and no message appears

#### Scenario: Retry feedback while the restart is in flight
- **WHEN** a retry has been requested from the log screen and GitLab has not answered yet
- **THEN** the log screen marks the retry as in progress and the operator can still scroll the current output or go back

#### Scenario: Traced job is not retryable
- **WHEN** the operator presses the retry key while the traced job is running, pending, successful, skipped, manual, or created
- **THEN** no restart is requested and no prompt appears, the current log stays visible, and a short non-fatal message explains that only failed or canceled jobs can be retried

#### Scenario: Repeated retry while one is in flight
- **WHEN** the operator presses the retry key again while a retry from the log screen is still in flight
- **THEN** the system does not request a second restart and the in-flight retry is unaffected

#### Scenario: GitLab rejects the retry
- **WHEN** the retry request is rejected by GitLab or the CLI
- **THEN** the current log stays visible and a non-fatal message shows why the restart was refused

#### Scenario: Another log was opened while the restart was in flight
- **WHEN** a restart started from one job's log is still in flight and the operator opens another job's log
- **THEN** the restart does not take over that screen: the second job's log stays visible and only the in-flight mark clears when the restart completes

#### Scenario: The new attempt cannot be identified
- **WHEN** the restart succeeded but the system cannot determine the new attempt’s job id
- **THEN** the system leaves the log screen, returns to the job graph for that job, and shows a non-fatal message saying the new attempt could not be followed
