## MODIFIED Requirements

### Requirement: Same-pipeline needs graph
For the selected pipeline the system SHALL display jobs as nodes and `needs` relationships as directed edges. Layout MUST follow dependency order (downstream after upstream), not stage columns alone. Trigger or bridge jobs MUST appear as ordinary nodes; v1 MUST NOT open a child pipeline graph from them. Each job MUST appear as a single node showing its latest attempt: earlier attempts of a retried job MUST NOT appear as extra nodes.

#### Scenario: Jobs with needs
- **WHEN** the selected pipeline has jobs linked by `needs`
- **THEN** those jobs are shown with edges from needed jobs to dependents

#### Scenario: Jobs without needs
- **WHEN** jobs only share stages and have no `needs`
- **THEN** the system still shows every job in the pipeline without inventing false edges

#### Scenario: Bridge job
- **WHEN** the pipeline contains a trigger or bridge job
- **THEN** it is shown as a single node and confirming it does not replace the graph with a child pipeline

#### Scenario: A job has been retried
- **WHEN** a job in the pipeline has one or more earlier attempts
- **THEN** the graph shows a single node for that job carrying the latest attempt's status, its `needs` edges stay attached to it, and the earlier attempts are not shown as additional nodes

## ADDED Requirements

### Requirement: Retry a failed job from the graph
Pressing the retry key on the graph SHALL restart the focused job in GitLab and then show the restarted attempt. The system SHALL only request a restart when the focused job's status is failed or canceled and the job is not a trigger or bridge job; for any other focused job the system MUST NOT contact GitLab and MUST show a short non-fatal message instead. The restart MUST go through the GitLab CLI retry command for that job's id, and the system MUST NOT restart a job by any other route.

#### Scenario: Retry a failed job
- **WHEN** the focused job has failed and the operator presses the retry key
- **THEN** that job is restarted in GitLab and the graph replaces the failed node with the new attempt, still focused on the same job

#### Scenario: Retry a canceled job
- **WHEN** the focused job was canceled and the operator presses the retry key
- **THEN** that job is restarted in GitLab and the graph shows the new attempt for the same job

#### Scenario: Retry feedback while the restart is in flight
- **WHEN** a retry has been requested and GitLab has not answered yet
- **THEN** the graph screen marks the retry as in progress without blocking navigation

#### Scenario: Focused job is not retryable
- **WHEN** the operator presses the retry key while the focused job is running, pending, successful, skipped, manual, or created
- **THEN** no restart is requested, the graph keeps showing the current jobs, and a short non-fatal message explains that only failed or canceled jobs can be retried

#### Scenario: Focused job is a trigger or bridge job
- **WHEN** the operator presses the retry key while a trigger or bridge job is focused
- **THEN** no restart is requested and a short non-fatal message says that this job cannot be retried here

#### Scenario: Repeated retry while one is in flight
- **WHEN** the operator presses the retry key again while a retry is still in flight
- **THEN** the system does not request a second restart and the in-flight retry is unaffected

#### Scenario: GitLab rejects the retry
- **WHEN** the retry request is rejected by GitLab or the CLI
- **THEN** the graph stays navigable with its current jobs and a non-fatal message shows why the restart was refused

#### Scenario: Graph refreshed while the restart runs
- **WHEN** a background or manual graph refresh completes while a retry is in flight
- **THEN** the refreshed graph is shown and the retry in flight is unaffected
