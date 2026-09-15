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
- **THEN** the system dims only the framed list’s content area with an animated spinner and loading text, while its border, title, and key-help footer remain visible

#### Scenario: Repeated confirm while loading
- **WHEN** the operator presses confirm again on the same or another pipeline while a job graph fetch is already in flight
- **THEN** the system does not start a second fetch and the existing fetch is unaffected

#### Scenario: Fetch fails while loading
- **WHEN** the job graph fetch fails after the operator confirms a pipeline
- **THEN** the system clears the loading indicator and shows the error, and the operator can confirm a pipeline again
