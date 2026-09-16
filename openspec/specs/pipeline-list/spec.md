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
- **THEN** the system dims only the framed list’s content area with an animated spinner and loading text, while its border, title, and key-help footer remain visible

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

### Requirement: Refresh active pipeline statuses
While the pipeline list contains at least one running or pending pipeline, the system SHALL refresh the list automatically on a bounded interval. When no visible pipeline is running or pending, the system SHALL slow automatic refresh to a bounded watch interval instead of stopping, so externally started pipelines still appear. The watch interval SHALL be at least twice the normal interval, so a list with nothing active is observably quieter than one with an active pipeline.

#### Scenario: Active pipeline changes status
- **WHEN** the operator remains on the pipeline list and a visible running or pending pipeline changes status
- **THEN** the corresponding row reflects the new status within one successful refresh interval without manual navigation

#### Scenario: No active pipelines remain
- **WHEN** a refresh returns no visible pipeline in a running or pending state
- **THEN** the system slows automatic pipeline-list refresh to the bounded watch interval

#### Scenario: New pipeline starts while watching
- **WHEN** automatic refresh is slowed to the watch interval and the operator starts a new pipeline from outside the TUI
- **THEN** the new pipeline appears in the list within one successful watch refresh without manual navigation

#### Scenario: Watch interval is slowed
- **WHEN** the list holds no running or pending pipeline and the operator stays on it
- **THEN** consecutive automatic refreshes are spaced at least twice as far apart as they are while a running or pending pipeline is visible

### Requirement: Preserve list interaction during refresh
An automatic refresh SHALL preserve the selected pipeline by identity when it is still present. A failed background refresh MUST keep the last successful list visible and MUST NOT turn the screen into a fatal error.

#### Scenario: Selection survives reordered results
- **WHEN** refreshed pipeline results change row order and the selected pipeline is still present
- **THEN** that same pipeline remains selected

#### Scenario: Selected pipeline disappears
- **WHEN** refreshed results no longer contain the selected pipeline
- **THEN** the system selects the nearest valid row without preventing further navigation

#### Scenario: Background refresh fails
- **WHEN** an automatic list refresh fails
- **THEN** the last successful pipeline list remains usable and a non-fatal refresh error is shown

### Requirement: Back off after pipeline-list rate limiting
When GitLab rate-limits an automatic pipeline-list refresh, the system SHALL increase the delay before the next refresh up to a bounded maximum. After a successful refresh, the system SHALL restore the normal refresh interval.

#### Scenario: Rate-limited refresh
- **WHEN** an automatic pipeline-list refresh receives a rate-limit response
- **THEN** the next refresh is scheduled later than the normal interval without discarding the current list

#### Scenario: Refresh recovers
- **WHEN** a refresh succeeds after one or more rate-limit responses
- **THEN** subsequent active-pipeline refreshes use the normal interval

### Requirement: Manual list refresh
Pressing the refresh key on the pipeline list SHALL trigger an immediate one-shot refresh regardless of the current refresh cadence. A manual refresh SHALL preserve selection and MUST NOT turn the screen into a fatal error.

#### Scenario: Manual refresh at the watch interval
- **WHEN** automatic refresh is slowed to the watch interval and the operator presses the refresh key
- **THEN** a fresh list fetch replaces the rows with selection preserved

#### Scenario: Manual refresh fails
- **WHEN** a manual list refresh fails
- **THEN** the previous rows remain visible with a non-fatal refresh warning
