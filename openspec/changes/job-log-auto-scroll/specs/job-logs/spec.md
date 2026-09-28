## ADDED Requirements

### Requirement: Log follows the newest output by default
While the operator is on the job log screen, the framed log panel MUST show the newest trace output by default: when the screen opens, the panel MUST sit at the bottom of the captured trace, and while trace output arrives, the panel MUST keep the newest line visible without operator input. This default MUST NOT move the view against the operator: scrolling up is the operator's signal to stop following, and scrolling back to the bottom is the signal to resume. Pausing and resuming MUST only change what the view shows — the captured trace keeps accumulating, and the trace itself is unaffected.

#### Scenario: Opening a long finished trace
- **WHEN** the operator opens a job whose captured trace is longer than the panel
- **THEN** the panel shows the last lines of the trace, not its first lines

#### Scenario: Live stream keeps the tail visible
- **WHEN** a running job's trace appends lines while the panel is at the bottom
- **THEN** each arriving line is visible without operator input

#### Scenario: Scrolling up pauses following
- **WHEN** the operator scrolls up from the bottom of the panel with the mouse wheel or the scroll keys
- **THEN** the panel stops following, and arriving output no longer moves the view

#### Scenario: History stays put while output keeps streaming
- **WHEN** following is paused and the trace keeps streaming
- **THEN** the scrolled-to lines stay on screen unchanged and the new output keeps accumulating in the retained buffer

#### Scenario: Returning to the bottom resumes following
- **WHEN** the operator scrolls back to the bottom of the panel
- **THEN** following re-engages, and the next arriving output again keeps the newest line visible

#### Scenario: The trace ends while the operator is scrolled up
- **WHEN** the job or tracer finishes while following is paused
- **THEN** the panel stays where the operator left it and the captured buffer remains readable and scrollable
