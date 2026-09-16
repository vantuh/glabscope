## ADDED Requirements

### Requirement: Open the traced job in the browser

While the job log screen is visible, the open key (`o`, with or without shift, and with no other modifier) SHALL open the page of the job attempt being traced in the project's GitLab web UI, addressed by that attempt's own job id. It MUST be the attempt whose trace is on screen, not the graph's focused card and not the job's newest attempt, and it MUST work even when that attempt is no longer present in the refreshed job graph. Opening MUST NOT disturb the trace: the log stays on screen, keeps streaming while it is live, and keeps whatever it has already captured; no retry, no prompt, and no clipboard write are involved. Only one open may be in flight at a time: a repeated open key while an open is still in flight MUST NOT open a second page. When the browser cannot be launched, or the project's web address cannot be resolved, the system MUST keep the trace on screen and readable and show a non-fatal message in the screen content.

#### Scenario: Open the traced attempt

- **WHEN** the operator presses the open key while reading a job's log
- **THEN** the page of the attempt being traced opens in the browser and the log screen stays on screen

#### Scenario: An older attempt is traced

- **WHEN** the log on screen belongs to an older attempt of a retried job and the operator presses the open key
- **THEN** that older attempt's page opens, not the newest attempt's page

#### Scenario: The traced attempt left the graph

- **WHEN** the graph has been refreshed and no longer lists the attempt being traced, and the operator presses the open key
- **THEN** the traced attempt's page still opens and the log stays on screen

#### Scenario: The live trace is not disturbed

- **WHEN** the operator presses the open key while a running job's log is streaming
- **THEN** the trace keeps streaming into the same panel and nothing already captured is lost

#### Scenario: The open key is neither yank nor retry

- **WHEN** the operator presses the open key on the log screen
- **THEN** the clipboard is not written by this key and no confirmation prompt for a job action appears

#### Scenario: The browser cannot be launched

- **WHEN** opening the browser fails on the log screen
- **THEN** a non-fatal message appears in the log content and the captured output stays readable
