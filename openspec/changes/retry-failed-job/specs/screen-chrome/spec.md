## MODIFIED Requirements

### Requirement: Keymap in chrome, not mixed into content
Each framed screen MUST show the keys that work on that screen in a dim help line that is part of the chrome (footer or title area), not mixed into the first content row. A key that only applies to some jobs MUST still be listed on the screens where it can apply.

#### Scenario: List help
- **WHEN** the pipeline list is visible
- **THEN** enter/quit (and back, when it applies) appear in the dim chrome help line

#### Scenario: Graph help
- **WHEN** the job graph is visible
- **THEN** move, open log, refresh, retry, back, and quit appear in the dim chrome help line

#### Scenario: Log help
- **WHEN** the job log is visible
- **THEN** retry, back, and live vs ended are visible in the chrome, and the trace body is only log text

#### Scenario: Retry key pressed on a job that cannot be retried
- **WHEN** the operator presses the retry key on a job that is not failed or canceled
- **THEN** the reason is shown as a non-fatal message in the screen content, and the dim help line keeps listing the retry key
