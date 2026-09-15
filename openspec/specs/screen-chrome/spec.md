# screen-chrome Specification

## Purpose

Gives every screen a shared visual shell so the operator can tell where content, identity, and key help sit, instead of reading loose text on the terminal background.

## Requirements

### Requirement: Framed screens
Every screen the operator can land on (boot, error, pipeline list, job graph, job log) MUST show its primary content inside a visible rectangular frame. The frame MUST include a title that names the screen or the object in view. Chrome (frame and title) MUST use a muted color that is visually distinct from the four status-bucket colors used for pipeline and job rows.

#### Scenario: Boot
- **WHEN** the operator starts the app and it is still checking `glab`
- **THEN** the checking message appears inside a titled frame, not as unframed text on the background

#### Scenario: Fatal or recoverable error
- **WHEN** the app shows an error
- **THEN** the error text appears inside a titled frame, and the error color remains on the message, not on the whole frame

#### Scenario: Chrome does not steal status colors
- **WHEN** a screen with status-colored rows is visible
- **THEN** the frame and title stay muted while success, failed, running-or-pending, and other row colors remain distinguishable from the chrome

### Requirement: Keymap in chrome, not mixed into content
Each framed screen MUST show the keys that work on that screen in a dim help line that is part of the chrome (footer or title area), not mixed into the first content row.

#### Scenario: List help
- **WHEN** the pipeline list is visible
- **THEN** enter/quit (and back, when it applies) appear in the dim chrome help line

#### Scenario: Graph help
- **WHEN** the job graph is visible
- **THEN** move, open log, back, and quit appear in the dim chrome help line

#### Scenario: Log help
- **WHEN** the job log is visible
- **THEN** back (and live vs ended) are visible in the chrome, and the trace body is only log text
