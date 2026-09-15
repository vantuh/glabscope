## ADDED Requirements

### Requirement: Job log sits in a framed scrollable panel
The job trace MUST appear inside a visible framed panel that fills the remaining space and stays scrollable. The chrome MUST show the job’s name and whether the trace is live or has ended. Trace body text MUST not share a row with keymap or identity chrome.

#### Scenario: Live trace
- **WHEN** the operator is watching a running job’s log
- **THEN** the growing trace is inside a framed panel whose chrome marks the log as live

#### Scenario: Ended trace
- **WHEN** the job or tracer has finished and the operator is still on the log screen
- **THEN** the captured buffer remains inside the same framed panel whose chrome marks the log as ended

#### Scenario: Waiting for first bytes
- **WHEN** the log screen is open but no trace bytes have arrived yet
- **THEN** a waiting message still appears inside the framed log panel
