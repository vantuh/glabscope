## MODIFIED Requirements

### Requirement: Pipeline list with four status colors

The system SHALL present a selectable list of existing pipelines (running and finished) as aligned rows of columns: pipeline id, status, name, and started time. Each row MUST express its status with exactly one of four visual status buckets: success, failed, running-or-pending, other (including created, manual, skipped, canceled, and similar GitLab states). The bucket color and a status glyph MUST be confined to the row's status cell, the id and the started time MUST render in the muted chrome color, and the name MUST render in the default foreground, so the four buckets stay the only bright signals in the list.

#### Scenario: Mixed statuses

- **WHEN** the project has pipelines in success, failed, running, and canceled states
- **THEN** those four buckets are visually distinct on the list

#### Scenario: Status color does not tint the whole row

- **WHEN** a row for a failed pipeline and a row for a successful pipeline are visible
- **THEN** only their status cells carry the bucket color, while the id, name, and started cells of both rows render in the same non-bucket colors

#### Scenario: Choose a historical pipeline

- **WHEN** the operator highlights a pipeline that is not the latest on the current branch and confirms selection
- **THEN** the system opens that pipeline's job graph rather than silently substituting the latest pipeline

#### Scenario: Loading feedback while opening a pipeline

- **WHEN** the operator confirms a pipeline and its job graph is still being fetched
- **THEN** the system dims only the framed list's content area with an animated spinner and loading text, while its border, title, and key-help footer remain visible

#### Scenario: Repeated confirm while loading

- **WHEN** the operator presses confirm again on the same or another pipeline while a job graph fetch is already in flight
- **THEN** the system does not start a second fetch and the existing fetch is unaffected

#### Scenario: Fetch fails while loading

- **WHEN** the job graph fetch fails after the operator confirms a pipeline
- **THEN** the system clears the loading indicator and shows the error, and the operator can confirm a pipeline again

## ADDED Requirements

### Requirement: Human-readable pipeline names

The system SHALL render, in the name column, a human label for what each pipeline runs on, derived from the pipeline's ref, instead of the raw git ref. A merge-request ref (`refs/merge-requests/<iid>/head`) MUST render as `!<iid>`. A branch ref (`refs/heads/<name>`, or the bare branch name the list reports) MUST render as the branch name. A tag ref (`refs/tags/<name>`) MUST render as the tag name. A ref of any other shape MUST render unchanged.

#### Scenario: Merge-request pipeline

- **WHEN** a pipeline's ref is `refs/merge-requests/2/head`
- **THEN** its name column reads `!2`

#### Scenario: Branch pipeline

- **WHEN** a pipeline's ref is `refs/heads/release/2.1-hotfix` or `main`
- **THEN** its name column reads `release/2.1-hotfix` or `main` respectively

#### Scenario: Tag pipeline

- **WHEN** a pipeline's ref is `refs/tags/v1.0`
- **THEN** its name column reads `v1.0`

#### Scenario: Unrecognized ref shape

- **WHEN** a pipeline's ref matches none of the known shapes
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

- **WHEN** the list has been visible for several refresh cycles and a row's pipeline has aged by that time
- **THEN** the started cell reflects the new age within one successful refresh, with no extra GitLab read beyond the existing list refresh

#### Scenario: Missing creation timestamp

- **WHEN** the list read reports no creation timestamp for a pipeline
- **THEN** its started cell shows `—` and the rest of the row stays readable

### Requirement: Aligned single-line rows with a column header

The system SHALL align every list row to the same column boundaries within one render, taking each column's width from the rows being shown, and SHALL show a muted header row that labels the columns. The header MUST stay visible while the rows scroll. A cell whose text is longer than its column MUST be truncated with an ellipsis, and every row MUST occupy exactly one line so that differing status and name lengths cannot shift the columns.

#### Scenario: Rows align despite different status lengths

- **WHEN** the visible rows mix short and long status words
- **THEN** the name and started cells start at the same column in every row

#### Scenario: Long name is truncated, not wrapped

- **WHEN** a pipeline's name is longer than the name column
- **THEN** that name ends with an ellipsis inside the column, and the row still occupies one line with the started cell in its usual column

#### Scenario: Header survives scrolling

- **WHEN** the operator moves the selection past the last visible row so the rows scroll
- **THEN** the column header stays visible above the rows

#### Scenario: Narrow panel

- **WHEN** the framed list is too narrow to show every column
- **THEN** the name column shrinks to a minimum first and the started column is dropped before the id and status columns, which stay visible
