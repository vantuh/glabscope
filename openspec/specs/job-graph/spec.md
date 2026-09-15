# job-graph Specification

## Purpose

Shows one executed pipeline as a job-dependency graph with status colors so the operator can move between jobs the way GitLab’s Job dependencies view does, in the terminal.

## Requirements

### Requirement: Same-pipeline needs graph
For the selected pipeline the system SHALL display jobs as nodes and `needs` relationships as directed edges. Layout MUST follow dependency order (downstream after upstream), not stage columns alone. Trigger or bridge jobs MUST appear as ordinary nodes; v1 MUST NOT open a child pipeline graph from them.

#### Scenario: Jobs with needs
- **WHEN** the selected pipeline has jobs linked by `needs`
- **THEN** those jobs are shown with edges from needed jobs to dependents

#### Scenario: Jobs without needs
- **WHEN** jobs only share stages and have no `needs`
- **THEN** the system still shows every job in the pipeline without inventing false edges

#### Scenario: Bridge job
- **WHEN** the pipeline contains a trigger or bridge job
- **THEN** it is shown as a single node and confirming it does not replace the graph with a child pipeline

### Requirement: Status colors on jobs
Each job node MUST use the same four visual buckets as the pipeline list: success, failed, running-or-pending, other.

#### Scenario: Live mix of job states
- **WHEN** some jobs succeeded, one failed, one is running, and one is skipped
- **THEN** those four buckets are visually distinct on the graph

### Requirement: Keyboard navigation
The operator SHALL move focus among job nodes and confirm the focused job to open its log. A back action MUST return to the pipeline list.

#### Scenario: Focus and open
- **WHEN** the operator moves focus to a job and confirms
- **THEN** the job log screen opens for that job

### Requirement: Poll while the pipeline is active
While the selected pipeline’s status is running or pending, the system SHALL refresh job statuses and edges on an interval with backoff if the GitLab API rate-limits. Refresh MUST pause while the job log screen is open. When the pipeline is finished, the system MUST stop polling.

#### Scenario: Running pipeline
- **WHEN** the operator stays on the graph of a running pipeline
- **THEN** node colors update as jobs change status without a manual reload

#### Scenario: Log screen open
- **WHEN** the operator is on the job log screen
- **THEN** the graph does not keep polling until they return

#### Scenario: Finished pipeline
- **WHEN** the pipeline reaches a terminal status
- **THEN** automatic graph refresh stops
