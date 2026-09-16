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
The system SHALL present a selectable list of existing pipelines (running and finished) as aligned rows of columns: pipeline id, status, name, and started time. Each row MUST express its status with exactly one of four visual status buckets: success, failed, running-or-pending, other (including created, manual, skipped, canceled, and similar GitLab states). The bucket color and a status glyph MUST be confined to the row’s status cell, the id and the started time MUST render in the muted chrome color, and the name MUST render in the default foreground, so the four buckets stay the only bright signals in the list.

#### Scenario: Mixed statuses
- **WHEN** the project has pipelines in success, failed, running, and canceled states
- **THEN** those four buckets are visually distinct on the list

#### Scenario: Status color does not tint the whole row
- **WHEN** a row for a failed pipeline and a row for a successful pipeline are visible
- **THEN** only their status cells carry the bucket color, while the id, name, and started cells of both rows render in the same non-bucket colors

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

### Requirement: Human-readable pipeline names
The system SHALL render, in the name column, a human label for what each pipeline runs on, derived from the pipeline’s ref, instead of the raw git ref. A merge-request ref (`refs/merge-requests/<iid>/head`) MUST render as `!<iid>`. A branch ref (`refs/heads/<name>`, or the bare branch name the list reports) MUST render as the branch name. A tag ref (`refs/tags/<name>`) MUST render as the tag name. A ref of any other shape MUST render unchanged.

#### Scenario: Merge-request pipeline
- **WHEN** a pipeline’s ref is `refs/merge-requests/2/head`
- **THEN** its name column reads `!2`

#### Scenario: Branch pipeline
- **WHEN** a pipeline’s ref is `refs/heads/release/2.1-hotfix` or `main`
- **THEN** its name column reads `release/2.1-hotfix` or `main` respectively

#### Scenario: Tag pipeline
- **WHEN** a pipeline’s ref is `refs/tags/v1.0`
- **THEN** its name column reads `v1.0`

#### Scenario: Unrecognized ref shape
- **WHEN** a pipeline’s ref matches none of the known shapes
- **THEN** its name column shows that ref unchanged, and the operator can still open the pipeline

### Requirement: Pipeline start time
The system SHALL show, in the started column, how long ago each pipeline was created, in a compact relative form (`4m`, `3h`, `2d`). The value MUST be derived from the creation timestamp the list read reports for that pipeline, MUST be recomputed on each list render so it stays accurate without any additional GitLab read, and MUST render a placeholder (`—`) when the list read reports no creation timestamp.

#### Scenario: Recently created pipeline
- **WHEN** a visible pipeline was created five minutes before the render
- **THEN** its started column reads `5m`

#### Scenario: Older pipeline
- **WHEN** a visible pipeline was created three days before the render
- **THEN** its started column reads `3d`

#### Scenario: Age stays current without a manual refresh
- **WHEN** the list has been visible for several refresh cycles and a row’s pipeline has aged by that time
- **THEN** the started cell reflects the new age within one successful refresh, with no extra GitLab read beyond the existing list refresh

#### Scenario: Missing creation timestamp
- **WHEN** the list read reports no creation timestamp for a pipeline
- **THEN** its started cell shows `—` and the rest of the row stays readable

### Requirement: Aligned single-line rows with a column header
The system SHALL align every list row to the same column boundaries within one render, taking each column’s width from the rows being shown, and SHALL show a muted header row that labels the columns. The header MUST stay visible while the rows scroll. A cell whose text is longer than its column MUST be truncated with an ellipsis, and every row MUST occupy exactly one line so that differing status and name lengths cannot shift the columns.

#### Scenario: Rows align despite different status lengths
- **WHEN** the visible rows mix short and long status words
- **THEN** the name and started cells start at the same column in every row

#### Scenario: Long name is truncated, not wrapped
- **WHEN** a pipeline’s name is longer than the name column
- **THEN** that name ends with an ellipsis inside the column, and the row still occupies one line with the started cell in its usual column

#### Scenario: Header survives scrolling
- **WHEN** the operator moves the selection past the last visible row so the rows scroll
- **THEN** the column header stays visible above the rows

#### Scenario: Narrow panel
- **WHEN** the framed list is too narrow to show every column
- **THEN** the name column shrinks to a minimum first and the started column is dropped before the id and status columns, which stay visible

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

### Requirement: Open the focused pipeline in the browser

While the pipeline list is visible, the open key (`o`, with or without shift, and with no other modifier) SHALL open the selected pipeline's page in the project's GitLab web UI. The page MUST be that pipeline itself, addressed by the project and the pipeline's own id, and MUST NOT be the project's pipeline index or the latest pipeline on the same ref. The open key MUST leave the app state alone: the same row stays selected, the screen stays the pipeline list, nothing is refreshed, and nothing is requested from GitLab beyond resolving the project's web address. Only one open may be in flight at a time: a repeated open key while an open is still in flight MUST NOT open a second page. When the browser cannot be launched, or the project's web address cannot be resolved, the system MUST keep the list usable and show a non-fatal message in the screen content.

#### Scenario: Open the selected pipeline

- **WHEN** the operator presses the open key with a pipeline row selected
- **THEN** that pipeline's own page opens in the browser

#### Scenario: A historical pipeline opens itself

- **WHEN** the operator selects a pipeline that is not the latest on its ref and presses the open key
- **THEN** that pipeline's page opens, not the latest pipeline on its ref

#### Scenario: Opening does not navigate

- **WHEN** the operator presses the open key on the pipeline list
- **THEN** the pipeline list stays on screen with the same row selected, and no job graph is opened

#### Scenario: Repeated open while an open is in flight

- **WHEN** the operator presses the open key again while a previous open has not been launched yet
- **THEN** no second page is opened and the list is unaffected

#### Scenario: The browser cannot be launched

- **WHEN** opening the browser fails for the selected pipeline
- **THEN** a non-fatal message appears in the list content, the rows stay usable, and no error screen replaces the list
