## ADDED Requirements

### Requirement: Mouse selection copies the log body
While the operator is on the job log screen, finishing a mouse drag that selected one or more characters of job-trace body text MUST copy that selected visible text to the system clipboard. The copy MUST be plain text (no SGR). The copy MUST NOT include title, live/ended, or keymap chrome. An empty selection MUST NOT overwrite the clipboard. The same mouse-up MUST NOT copy when the operator is on any other screen.

#### Scenario: Drag-select a stack line
- **WHEN** the operator is on the log screen with captured trace text and finishes a mouse drag over part of that text
- **THEN** the selected visible characters are on the system clipboard

#### Scenario: Empty drag does nothing
- **WHEN** the operator mouse-drags on the log screen but the selection contains no characters
- **THEN** the clipboard is left unchanged

#### Scenario: Other screens stay Herdr-blocked as today
- **WHEN** the operator is on the pipeline list, job graph, or attempts screen
- **THEN** finishing a mouse drag does not copy log text (this requirement does not add copy-on-select there)

### Requirement: Yank key copies the whole log buffer
While the operator is on the job log screen, pressing `y` MUST copy the entire retained visible log buffer to the system clipboard as plain text (the same text the panel shows after SGR parse, including the 200_000-character cap). The copy MUST NOT include chrome. If no trace bytes have been retained yet, `y` MUST NOT overwrite the clipboard. `y` MUST be ignored for this purpose on every other screen. Log-screen chrome MUST mention `y`.

#### Scenario: Yank after the tracer has printed
- **WHEN** the operator is on the log screen with a non-empty retained visible buffer and presses `y`
- **THEN** the full retained visible buffer is on the system clipboard

#### Scenario: Yank while still waiting
- **WHEN** the log screen is showing the waiting message and no trace bytes have been retained
- **THEN** pressing `y` leaves the clipboard unchanged

#### Scenario: Yank does not fire on the graph
- **WHEN** the operator is on the job graph and presses `y`
- **THEN** the clipboard is not updated by this action
