## ADDED Requirements

### Requirement: Job graph sits in a framed panel
The job graph MUST appear inside the screen’s framed content panel. The chrome title MUST identify the selected pipeline (its iid) and MAY include that pipeline’s status. Job rows MUST keep the four status-bucket colors. Truncation warnings MUST stay visible inside the panel, not outside the frame.

#### Scenario: Graph after opening a pipeline
- **WHEN** the operator opens a pipeline’s job graph
- **THEN** the jobs and edges render inside a visible frame whose title includes that pipeline’s iid

#### Scenario: Truncated job list
- **WHEN** the graph reports that the job list was truncated
- **THEN** the truncation warning appears inside the framed panel

## MODIFIED Requirements

### Requirement: Keyboard navigation
The operator SHALL move focus among job nodes and confirm the focused job to open its log. A back action MUST return to the pipeline list.

#### Scenario: Focus and open
- **WHEN** the operator moves focus to a job and confirms
- **THEN** the job log screen opens for that job

#### Scenario: Loading feedback while opening a log
- **WHEN** the operator confirms a job and the log screen is still being prepared
- **THEN** the system shows an animated spinner and loading text inside the still-visible framed graph until the log screen is showing or opening the log fails

#### Scenario: Repeated confirm while loading
- **WHEN** the operator presses confirm again on the same or another job while a log open is already in flight
- **THEN** the system does not start a second log open and the existing one is unaffected

#### Scenario: Opening the log fails
- **WHEN** opening the log screen fails after the operator confirms a job
- **THEN** the system clears the loading indicator and shows the error, and the operator can confirm a job again
