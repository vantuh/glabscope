## MODIFIED Requirements

### Requirement: Keyboard navigation
The operator SHALL move focus among job nodes and confirm the focused job to open its log. A back action MUST return to the pipeline list.

#### Scenario: Focus and open
- **WHEN** the operator moves focus to a job and confirms
- **THEN** the job log screen opens for that job

#### Scenario: Loading feedback while opening a log
- **WHEN** the operator confirms a job and the log screen is still being prepared
- **THEN** the system dims only the framed graph’s content area with an animated spinner and loading text, while its border, title, and key-help footer remain visible

#### Scenario: Repeated confirm while loading
- **WHEN** the operator presses confirm again on the same or another job while a log open is already in flight
- **THEN** the system does not start a second log open and the existing one is unaffected

#### Scenario: Opening the log fails
- **WHEN** opening the log screen fails after the operator confirms a job
- **THEN** the system clears the loading indicator and shows the error, and the operator can confirm a job again
