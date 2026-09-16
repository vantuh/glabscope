## MODIFIED Requirements

### Requirement: Keymap in chrome, not mixed into content
Each framed screen MUST show the keys that work on that screen in a dim help line that is part of the chrome (footer or title area), not mixed into the first content row. Transient status text MUST NOT be appended to that help line: the help line's own text MUST be the same whether or not a status is pending. A key that only applies to some jobs MUST still be listed on the screens where it can apply. When one key carries more than one job action, the help line MUST name each action that key can perform rather than only the action that fits the focused job. A screen on which the open key can open a pipeline, a job, or an attempt in the browser MUST list that key in its help line.

#### Scenario: List help
- **WHEN** the pipeline list is visible
- **THEN** enter/quit (and back, when it applies) and the browser key appear in the dim chrome help line

#### Scenario: Graph help
- **WHEN** the job graph is visible
- **THEN** move, open log, refresh, retry, run, browser, back, and quit appear in the dim chrome help line

#### Scenario: Log help
- **WHEN** the job log is visible
- **THEN** retry, browser, back, and live vs ended are visible in the chrome, and the trace body is only log text

#### Scenario: Attempts help
- **WHEN** the attempts list is visible
- **THEN** open log, retry, browser, back, and quit appear in the dim chrome help line

#### Scenario: A status does not extend the help line
- **WHEN** a transient status is visible on a screen and then clears
- **THEN** the help line text is unchanged, with no status word inside it in either state

#### Scenario: Retry key pressed on a job that cannot be retried
- **WHEN** the operator presses the retry key on a job that is neither failed or canceled nor a waiting manual job
- **THEN** the reason is shown as a non-fatal message in the screen content, and the dim help line keeps listing that key
