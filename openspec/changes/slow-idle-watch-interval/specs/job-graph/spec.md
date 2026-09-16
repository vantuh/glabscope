## MODIFIED Requirements

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
