# job-graph Specification

## Purpose

Shows one executed pipeline as a job-dependency graph with status colors so the operator can move between jobs the way GitLab’s Job dependencies view does, in the terminal.

## Requirements

### Requirement: Same-pipeline needs graph
For the selected pipeline the system SHALL display jobs as rounded cards grouped into stage columns from left to right in GraphQL `pipeline.stages.nodes` order (GitLab pipeline page), not as a single top-to-bottom list and not by sorting stage names. Named stages present on jobs but missing from that list MUST append after it. Jobs that share a stage MUST stack in that stage’s column. The graph SHALL show one card per job name+stage using the latest attempt (`retried` false, else highest numeric id); earlier attempts MUST remain available after confirm when more than one exists. The system SHALL draw directed arrows only for GraphQL `needs` among those visible cards (from needed jobs to dependents). Layout MUST NOT invent edges from stage order alone. Trigger or bridge jobs MUST appear as ordinary cards; v1 MUST NOT open a child pipeline graph from them.

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
While the selected pipeline's status is running or pending, the system SHALL refresh job statuses, dependency edges, and pipeline status on a bounded interval. When the pipeline is terminal, the system SHALL slow automatic refresh to a bounded watch interval instead of stopping, so externally retried or created jobs still appear. Refresh MUST pause while the job log screen is open. If GitLab rate-limits a refresh, the system SHALL increase the delay up to a bounded maximum and SHALL restore the normal interval after a successful refresh. A failed background refresh MUST keep the last successful graph visible and MUST NOT prevent navigation.

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
