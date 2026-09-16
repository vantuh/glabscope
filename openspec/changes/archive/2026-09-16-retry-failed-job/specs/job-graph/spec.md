## MODIFIED Requirements

### Requirement: Same-pipeline needs graph
For the selected pipeline the system SHALL display jobs as rounded cards grouped into stage columns from left to right in GraphQL `pipeline.stages.nodes` order (GitLab pipeline page), not as a single top-to-bottom list and not by sorting stage names. Named stages present on jobs but missing from that list MUST append after it. Jobs that share a stage MUST stack in that stage’s column. The graph SHALL show one card per job name+stage using the latest attempt (`retried` false, else highest numeric id); earlier attempts MUST remain available after confirm when more than one exists, and MUST NOT appear as additional cards. The system SHALL draw directed arrows only for GraphQL `needs` among those visible cards (from needed jobs to dependents). Layout MUST NOT invent edges from stage order alone. Trigger or bridge jobs MUST appear as ordinary cards; v1 MUST NOT open a child pipeline graph from them.

#### Scenario: Jobs with needs
- **WHEN** the selected pipeline has jobs linked by `needs`
- **THEN** those jobs are shown as cards with visible arrows from needed jobs to dependents

#### Scenario: Jobs without needs
- **WHEN** jobs only share stages and have no `needs`
- **THEN** the system still shows every job in the pipeline in their stage columns without inventing false edges

#### Scenario: Bridge job
- **WHEN** the pipeline contains a trigger or bridge job
- **THEN** it is shown as a single card and confirming it does not replace the graph with a child pipeline

#### Scenario: Stage columns
- **WHEN** the pipeline has more than one stage
- **THEN** earlier stages from `stages.nodes` appear to the left of later stages (for example `prepare` left of `security`) and jobs in the same stage appear in the same column

#### Scenario: Retried job on the graph
- **WHEN** a job name+stage has earlier attempts and a latest attempt
- **THEN** the graph shows a single card for that job with the latest attempt’s status, and `needs` arrows attach only to visible latest cards

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

### Requirement: Retry a failed attempt from the attempts list
Pressing the retry key on the attempts list SHALL restart the focused attempt in GitLab. The system SHALL only request a restart when the focused attempt's status is failed or canceled and it is not a trigger or bridge job; for any other attempt the system MUST NOT contact GitLab and MUST show a short non-fatal message instead. The restart MUST go through the GitLab CLI retry command for that attempt's id, and the system MUST NOT restart an attempt by any other route. After a successful restart the attempts list MUST refresh for that job.

#### Scenario: Retry the job's latest attempt
- **WHEN** the focused row is the job's latest attempt, it is failed, and the operator presses the retry key
- **THEN** that attempt is restarted in GitLab, the list refreshes for the job, and focus follows the attempt that replaced it

#### Scenario: Retry an earlier attempt
- **WHEN** the focused row is an earlier, superseded attempt, it is failed, and the operator presses the retry key
- **THEN** that attempt is restarted in GitLab and focus stays on the attempt that was retried

#### Scenario: Retry feedback while the restart is in flight
- **WHEN** a retry has been requested from the attempts list and GitLab has not answered yet
- **THEN** the attempts screen marks the retry as in progress without blocking navigation

#### Scenario: Focused attempt is not retryable
- **WHEN** the operator presses the retry key on an attempt that is running, pending, successful, or skipped
- **THEN** no restart is requested, the list keeps showing the job's attempts, and a short non-fatal message explains that only failed or canceled attempts can be retried

#### Scenario: Repeated retry while one is in flight
- **WHEN** the operator presses the retry key again while a retry is still in flight
- **THEN** the system does not request a second restart and the in-flight retry is unaffected

#### Scenario: GitLab rejects the retry
- **WHEN** the retry request is rejected by GitLab or the CLI
- **THEN** the attempts list stays navigable with its rows and a non-fatal message shows why the restart was refused
