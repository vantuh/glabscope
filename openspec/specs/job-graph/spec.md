# job-graph Specification

## Purpose

Shows one executed pipeline as a job-dependency graph with status colors so the operator can move between jobs the way GitLab’s Job dependencies view does, in the terminal.

## Requirements

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

### Requirement: Status colors on jobs
Each job card MUST use the same four visual buckets as the pipeline list: success, failed, running-or-pending, other. Each card MUST also show a Nerd Font status icon for that job so status is not color alone.

#### Scenario: Live mix of job states
- **WHEN** some jobs succeeded, one failed, one is running, and one is skipped
- **THEN** those four buckets are visually distinct on the graph by both color and icon

### Requirement: Keyboard navigation
The operator SHALL move focus among job cards and confirm the focused job to open its log, or an attempts list when that card has more than one attempt. Up and down MUST move among jobs in the same stage. Left and right MUST move to a job in the adjacent stage. A back action from the graph MUST return to the pipeline list. A back action from a log opened via attempts MUST return to the attempts list.

#### Scenario: Focus and open
- **WHEN** the operator moves focus to a job with a single attempt and confirms
- **THEN** the job log screen opens for that job

#### Scenario: Confirm a retried job
- **WHEN** the operator confirms a graph card that has more than one attempt
- **THEN** an attempts list opens (newest first) instead of the log, and confirming a row opens that attempt’s log

#### Scenario: Loading feedback while opening a log
- **WHEN** the operator confirms a job and the log screen is still being prepared
- **THEN** the system dims only the framed graph’s content area with an animated spinner and loading text, while its border, title, and key-help footer remain visible

#### Scenario: Repeated confirm while loading
- **WHEN** the operator presses confirm again on the same or another job while a log open is already in flight
- **THEN** the system does not start a second log open and the existing one is unaffected

#### Scenario: Opening the log fails
- **WHEN** opening the log screen fails after the operator confirms a job
- **THEN** the system clears the loading indicator and shows the error, and the operator can confirm a job again

#### Scenario: Vertical move in a stage
- **WHEN** the operator presses up or down while several jobs share the focused stage
- **THEN** focus moves to another job in that same stage and does not jump to a different stage

#### Scenario: Horizontal move between stages
- **WHEN** the operator presses left or right and an adjacent stage exists
- **THEN** focus moves to a job in that adjacent stage

#### Scenario: Adjacent stage is shorter
- **WHEN** the operator moves left or right into a stage that has fewer jobs than the current row
- **THEN** focus lands on the last job in that stage rather than leaving the graph or wrapping around

### Requirement: Poll while the pipeline is active
While the selected pipeline's status is running or pending, the system SHALL refresh job statuses, dependency edges, and pipeline status on a bounded interval. When the pipeline is terminal, the system SHALL slow automatic refresh to a bounded watch interval instead of stopping, so externally retried or created jobs still appear. The watch interval SHALL be at least twice the normal interval, so a terminal graph is observably quieter than a running or pending one. Refresh MUST pause while the job log screen is open. If GitLab rate-limits a refresh, the system SHALL increase the delay up to a bounded maximum and SHALL restore the normal interval after a successful refresh. A failed background refresh MUST keep the last successful graph visible and MUST NOT prevent navigation.

#### Scenario: Running pipeline
- **WHEN** the operator stays on the graph of a running or pending pipeline
- **THEN** node colors and pipeline status update within one successful refresh interval as GitLab state changes

#### Scenario: Job reaches terminal state
- **WHEN** an active job completes while the operator remains on the graph
- **THEN** the job node reflects its terminal status within one successful refresh interval without manual navigation

#### Scenario: Log screen open
- **WHEN** the operator is on the job log screen
- **THEN** the graph does not keep polling until they return

#### Scenario: Return from log screen
- **WHEN** the operator returns from the job log screen to an active pipeline graph
- **THEN** automatic graph refresh resumes without requiring a manual reload

#### Scenario: Finished pipeline
- **WHEN** a graph refresh reports that the pipeline reached a terminal status
- **THEN** the refreshed terminal state remains visible and automatic graph refresh slows to the bounded watch interval

#### Scenario: Watch interval is slowed
- **WHEN** a graph refresh reports that the pipeline is terminal and the operator stays on the graph
- **THEN** consecutive automatic refreshes are spaced at least twice as far apart as they are while the pipeline is running or pending

#### Scenario: Job retried while watching
- **WHEN** the pipeline is terminal, automatic refresh is slowed to the watch interval, and the operator retries a job from outside the TUI
- **THEN** the new job attempt appears in the graph within one successful watch refresh without manual navigation

#### Scenario: Graph refresh is rate-limited
- **WHEN** an automatic graph refresh receives a rate-limit response
- **THEN** the next refresh is scheduled later than the normal interval without discarding the current graph

#### Scenario: Graph refresh recovers
- **WHEN** a graph refresh succeeds after one or more rate-limit responses
- **THEN** subsequent active-pipeline refreshes use the normal interval

#### Scenario: Graph refresh fails
- **WHEN** an automatic graph refresh fails for a reason other than rate limiting
- **THEN** the last successful graph remains navigable and a non-fatal refresh error is shown

### Requirement: Manual graph refresh
Pressing the refresh key on the graph SHALL trigger an immediate one-shot graph refresh regardless of the current refresh cadence. The focused job SHALL be preserved across the refreshed graph and a failed manual refresh MUST keep the graph visible with a non-fatal warning.

#### Scenario: Manual refresh at the watch interval
- **WHEN** automatic graph refresh is slowed to the watch interval and the operator presses the refresh key
- **THEN** a fresh graph fetch replaces the graph with the focused job preserved

#### Scenario: Manual graph refresh fails
- **WHEN** a manual graph refresh fails
- **THEN** the previous graph remains navigable and a non-fatal refresh warning is shown

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
