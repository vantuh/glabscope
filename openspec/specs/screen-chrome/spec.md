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
Each framed screen MUST show the keys that work on that screen in a dim help line that is part of the chrome (footer or title area), not mixed into the first content row. Transient status text MUST NOT be appended to that help line: the help line's own text MUST be the same whether or not a status is pending.

#### Scenario: List help
- **WHEN** the pipeline list is visible
- **THEN** enter/quit (and back, when it applies) appear in the dim chrome help line

#### Scenario: Graph help
- **WHEN** the job graph is visible
- **THEN** move, open log, back, and quit appear in the dim chrome help line

#### Scenario: Log help
- **WHEN** the job log is visible
- **THEN** back (and live vs ended) are visible in the chrome, and the trace body is only log text

#### Scenario: A status does not extend the help line
- **WHEN** a transient status is visible on a screen and then clears
- **THEN** the help line text is unchanged, with no status word inside it in either state

### Requirement: Transient status has its own area at the right edge
Each framed screen MUST render transient status in a status area that is a separate chrome element from the key help line: both share the same chrome row, the key help stays at the left edge, and the status area is pinned to the right edge of that row. On a screen with no transient status, the row MUST contain the key help line only, with no empty status placeholder. The status area MUST keep the status's own color rather than the muted chrome color. Persistent diagnostics MUST NOT move into the status area.

#### Scenario: Refresh in flight
- **WHEN** a background poll or a manual refresh is in flight on the pipeline list, the job graph, or the job attempts screen
- **THEN** the spinner and its label appear at the right edge of the chrome row, while the key help for that screen stays at the left edge

#### Scenario: Copy notice on the log
- **WHEN** a copy on the job log screen writes text
- **THEN** `copied to clipboard` appears at the right edge of the chrome row, while the live-or-ended marker and the log keys stay at the left edge

#### Scenario: Nothing to report
- **WHEN** no transient status is pending on the visible screen
- **THEN** the chrome row shows only the key help line, and the row's right edge is empty

#### Scenario: Status keeps its color
- **WHEN** the status area shows the copied-to-clipboard notice or the refresh spinner
- **THEN** that text renders in its own status color, not in the muted color used for the frame and the key help line

#### Scenario: Refresh error stays in the body
- **WHEN** a background refresh fails on the pipeline list, the job graph, or the job attempts screen
- **THEN** the `refresh error: … — retrying` message still appears in the screen body, not in the status area
