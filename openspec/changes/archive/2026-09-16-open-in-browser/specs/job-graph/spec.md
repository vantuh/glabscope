## ADDED Requirements

### Requirement: Open the focused job in the browser

While the job graph is visible, the open key (`o`, with or without shift, and with no other modifier) SHALL open the page of the job attempt the focused card stands for in the project's GitLab web UI. The page MUST be that job attempt's own page, not the pipeline page and not another attempt of the same job. The open key MUST NOT start or restart any job, MUST NOT change the focused card, MUST NOT leave the job graph, and MUST NOT refresh the graph. When the focused card stands for more than one attempt, the open key MUST NOT open anything: it MUST open the attempts chooser instead — the same list of attempts the confirm key opens, newest first — and MUST show a non-fatal notice in the graph content saying that the job has more than one attempt and that one must be picked and the open key pressed again. Only one open may be in flight at a time: a repeated open key while an open is still in flight MUST NOT open a second page. When the browser cannot be launched, or the project's web address cannot be resolved, the system MUST keep the graph navigable and show a non-fatal message in the screen content.

#### Scenario: Open a job with a single attempt

- **WHEN** the operator presses the open key on a job card that stands for one attempt
- **THEN** that attempt's job page opens in the browser and the graph stays on screen with the same card focused

#### Scenario: A card with several attempts asks which one

- **WHEN** the operator presses the open key on a card whose job has more than one attempt
- **THEN** nothing opens, the attempts chooser appears with the newest attempt focused, and the graph area carries a notice that the job has several attempts and that one must be picked and the open key pressed again

#### Scenario: The open key is not the confirm key

- **WHEN** the operator presses the open key on a job card with a single attempt
- **THEN** no log screen opens and no job is started or restarted

#### Scenario: Repeated open while an open is in flight

- **WHEN** the operator presses the open key again while a previous open has not been launched yet
- **THEN** no second page is opened and the graph is unaffected

#### Scenario: The browser cannot be launched

- **WHEN** opening the browser fails for a focused job
- **THEN** a non-fatal message appears in the graph content and the operator can still move around the graph and open logs

### Requirement: Open the focused attempt in the browser

While the attempts list is visible, the open key SHALL open the page of the focused attempt in the project's GitLab web UI, addressed by that attempt's own job id, so an earlier attempt opens as that earlier attempt and never as the job's newest attempt. Opening MUST NOT start or restart anything, MUST NOT change the focused attempt, and MUST NOT leave the attempts list. The notice about having to pick an attempt belongs to the open key that led into this list: when the list was reached with the confirm key, no such notice is shown. When the browser cannot be launched, or the project's web address cannot be resolved, the system MUST keep the list usable and show a non-fatal message in the screen content.

#### Scenario: Open the focused attempt

- **WHEN** the operator presses the open key on the attempts list with an attempt focused
- **THEN** that attempt's own job page opens in the browser and the attempts list stays on screen with the same attempt focused

#### Scenario: An earlier attempt opens as itself

- **WHEN** the operator focuses an older attempt of a retried job and presses the open key
- **THEN** the older attempt's job page opens, not the newest attempt's page

#### Scenario: Attempts reached with the confirm key

- **WHEN** the operator opens the attempts list with the confirm key and then presses the open key
- **THEN** the focused attempt's page opens and no notice about picking an attempt is shown

#### Scenario: The browser cannot be launched

- **WHEN** opening the browser fails for a focused attempt
- **THEN** a non-fatal message appears in the attempts content and the operator can still open a log or go back
