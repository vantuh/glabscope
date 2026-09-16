## ADDED Requirements

### Requirement: Open the focused pipeline in the browser

While the pipeline list is visible, the open key (`o`, with or without shift, and with no other modifier) SHALL open the selected pipeline's page in the project's GitLab web UI. The page MUST be that pipeline itself, addressed by the project and the pipeline's own id, and MUST NOT be the project's pipeline index or the latest pipeline on the same ref. The open key MUST leave the app state alone: the same row stays selected, the screen stays the pipeline list, nothing is refreshed, and nothing is requested from GitLab beyond resolving the project's web address. Only one open may be in flight at a time: a repeated open key while an open is still in flight MUST NOT open a second page. When the browser cannot be launched, or the project's web address cannot be resolved, the system MUST keep the list usable and show a non-fatal message in the screen content.

#### Scenario: Open the selected pipeline

- **WHEN** the operator presses the open key with a pipeline row selected
- **THEN** that pipeline's own page opens in the browser

#### Scenario: A historical pipeline opens itself

- **WHEN** the operator selects a pipeline that is not the latest on its ref and presses the open key
- **THEN** that pipeline's page opens, not the latest pipeline on its ref

#### Scenario: Opening does not navigate

- **WHEN** the operator presses the open key on the pipeline list
- **THEN** the pipeline list stays on screen with the same row selected, and no job graph is opened

#### Scenario: Repeated open while an open is in flight

- **WHEN** the operator presses the open key again while a previous open has not been launched yet
- **THEN** no second page is opened and the list is unaffected

#### Scenario: The browser cannot be launched

- **WHEN** opening the browser fails for the selected pipeline
- **THEN** a non-fatal message appears in the list content, the rows stay usable, and no error screen replaces the list
