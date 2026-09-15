## ADDED Requirements

### Requirement: Job graph sits in a framed panel
The job graph MUST appear inside the screen’s framed content panel. The chrome title MUST identify the selected pipeline (its iid) and MAY include that pipeline’s status. Job rows MUST keep the four status-bucket colors. Truncation warnings MUST stay visible inside the panel, not outside the frame.

#### Scenario: Graph after opening a pipeline
- **WHEN** the operator opens a pipeline’s job graph
- **THEN** the jobs and edges render inside a visible frame whose title includes that pipeline’s iid

#### Scenario: Truncated job list
- **WHEN** the graph reports that the job list was truncated
- **THEN** the truncation warning appears inside the framed panel
