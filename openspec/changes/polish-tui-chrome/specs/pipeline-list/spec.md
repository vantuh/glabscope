## ADDED Requirements

### Requirement: Pipeline list sits in a framed panel
The selectable pipeline list MUST appear inside the screen’s framed content panel. Rows MUST still use exactly one of the four status-bucket colors. The panel title MUST identify the view as the pipeline list.

#### Scenario: List after a successful load
- **WHEN** `glab` listed pipelines and the operator is on the list screen
- **THEN** the rows are inside a visible frame titled as the pipeline list, not floating on the root background

#### Scenario: Empty or loading list still framed
- **WHEN** the list screen is shown before rows exist or with zero pipelines after a successful probe
- **THEN** the empty or waiting area is still inside the same framed panel
