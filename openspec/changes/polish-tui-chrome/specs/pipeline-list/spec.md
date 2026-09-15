## ADDED Requirements

### Requirement: Pipeline list sits in a framed panel
The selectable pipeline list MUST appear inside the screen’s framed content panel. Rows MUST still use exactly one of the four status-bucket colors. The panel title MUST identify the view as the pipeline list.

#### Scenario: List after a successful load
- **WHEN** `glab` listed pipelines and the operator is on the list screen
- **THEN** the rows are inside a visible frame titled as the pipeline list, not floating on the root background

#### Scenario: Empty or loading list still framed
- **WHEN** the list screen is shown before rows exist or with zero pipelines after a successful probe
- **THEN** the empty or waiting area is still inside the same framed panel

## MODIFIED Requirements

### Requirement: Pipeline list with four status colors
The system SHALL present a selectable list of existing pipelines (running and finished). Each row MUST use exactly one of four visual status buckets: success, failed, running-or-pending, other (including created, manual, skipped, canceled, and similar GitLab states).

#### Scenario: Mixed statuses
- **WHEN** the project has pipelines in success, failed, running, and canceled states
- **THEN** those four buckets are visually distinct on the list

#### Scenario: Choose a historical pipeline
- **WHEN** the operator highlights a pipeline that is not the latest on the current branch and confirms selection
- **THEN** the system opens that pipeline’s job graph rather than silently substituting the latest pipeline

#### Scenario: Loading feedback while opening a pipeline
- **WHEN** the operator confirms a pipeline and its job graph is still being fetched
- **THEN** the system shows an animated spinner and loading text inside the still-visible framed list until the job graph is ready or the fetch fails

#### Scenario: Repeated confirm while loading
- **WHEN** the operator presses confirm again on the same or another pipeline while a job graph fetch is already in flight
- **THEN** the system does not start a second fetch and the existing fetch is unaffected

#### Scenario: Fetch fails while loading
- **WHEN** the job graph fetch fails after the operator confirms a pipeline
- **THEN** the system clears the loading indicator and shows the error, and the operator can confirm a pipeline again
