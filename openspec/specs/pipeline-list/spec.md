# pipeline-list Specification

## Purpose

Lets the operator see existing GitLab pipelines for the current working tree and open one without knowing its id in advance.

## Requirements

### Requirement: Project comes from the working tree
When launched from a git working tree that `glab` can resolve to a GitLab project, the system SHALL list pipelines for that project using the operator’s existing `glab` authentication. The system MUST NOT require a separate token prompt in the happy path.

#### Scenario: Launch inside a bound repository
- **WHEN** the operator starts the app from a directory whose git remote `glab` already maps to a GitLab project and `glab` is authenticated
- **THEN** the system shows pipelines for that project

#### Scenario: Unusable working tree
- **WHEN** the current directory is not a `glab`-resolvable GitLab project or `glab` is missing or unauthenticated
- **THEN** the system shows a clear error and does not present an empty list as success

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

### Requirement: Return from the graph
The system SHALL return the operator to the same pipeline list (same selection if still present) when they leave the job graph with the back action.

#### Scenario: Esc from graph
- **WHEN** the operator is on the job graph and uses the back action
- **THEN** they see the pipeline list again
