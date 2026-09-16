# job-logs Specification

## Purpose

Lets the operator read a selected job’s GitLab log inside the same nested session, live while the job runs, without scraping the GitLab web UI.

## Requirements

### Requirement: Official job trace
When the operator confirms a focused job, the system SHALL show that job’s log by running the GitLab CLI job-trace command for the job’s id (the same official live tracer `glab` uses). The system MUST NOT fetch logs by scraping HTML.

#### Scenario: Running job
- **WHEN** the confirmed job is running
- **THEN** the log screen appends new trace output in real time until the job ends

#### Scenario: Finished job
- **WHEN** the confirmed job has already finished
- **THEN** the log screen shows the existing job trace

### Requirement: Stay on the log after the job ends
When the job finishes or the tracer process exits, the system MUST keep the log screen and its buffer visible. The operator leaves that trace only with the back action, which MUST return to the job graph with the same job focused if that job still exists, or to the attempts list when the log was opened from it. A successful retry started from the log screen is the one other way the current trace ends: the screen then shows the new attempt instead.

#### Scenario: Job completes while watching
- **WHEN** a running job reaches a terminal status while the log screen is open
- **THEN** the operator remains on the log screen and can scroll the captured output

#### Scenario: Tracer exits
- **WHEN** the trace process exits after printing a finished job’s log
- **THEN** the log screen stays open until the back action

#### Scenario: Back to graph
- **WHEN** the operator uses the back action on a log opened from the job graph
- **THEN** they return to the job graph, not the pipeline list

#### Scenario: Back to the attempts list
- **WHEN** the operator uses the back action on a log opened from the attempts list
- **THEN** they return to that attempts list with the same attempt focused

#### Scenario: Retry replaces the traced attempt
- **WHEN** a retry started from the log screen succeeds
- **THEN** the previous attempt’s log is no longer shown and the screen carries the new attempt’s trace instead

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

### Requirement: Job trace keeps ANSI colors
The log body MUST show the same SGR colors and intensity that GitLab stores in the job trace (standard and bright foreground/background, plus 256-color indexes). The system MUST NOT strip those sequences before display. Control sequences that are not color (erase-to-end-of-line, GitLab collapsible-section markers) MUST still be omitted from the visible text. Carriage returns MUST continue to become line breaks. Text with no SGR MUST stay in the default log color. The system MUST NOT color lines only because they contain words such as `ERROR` or `FAIL`. Color state MUST survive streamed chunks, including when an escape sequence is split across chunks. The 200_000-character retained-buffer cap MUST still apply to visible text.

#### Scenario: Colored failure from the job
- **WHEN** the trace contains a red SGR sequence around failure text
- **THEN** that text appears red in the framed log panel

#### Scenario: Unstyled error wording
- **WHEN** the trace contains the word `ERROR` with no SGR color
- **THEN** that text stays the default log color

#### Scenario: GitLab section and erase junk
- **WHEN** the trace includes `section_start` / `section_end` markers or erase-to-end-of-line sequences
- **THEN** those markers and erase codes are not shown as visible characters, and remaining colored text still shows its SGR color

#### Scenario: Color across streamed chunks
- **WHEN** a live trace delivers an SGR start in one chunk and the following text in a later chunk
- **THEN** the later text uses the color from that SGR until reset or a later color change

### Requirement: Mouse selection copies the log body
While the operator is on the job log screen, finishing a mouse drag that selected one or more characters of job-trace body text MUST copy that selected visible text to the system clipboard. The copy MUST be plain text (no SGR). The copy MUST NOT include any log-screen chrome: the title, live/ended, keymap, or the copy notice. An empty selection MUST NOT overwrite the clipboard. The same mouse-up MUST NOT copy when the operator is on any other screen.

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

### Requirement: Selection clears after a copy
While the operator is on the job log screen, finishing a mouse drag that copied selected trace text MUST clear the selection so the log body returns to its unselected appearance. Only a drag that actually copied text clears anything; a drag that copied nothing leaves the log body unselected too.

#### Scenario: Drag-select a stack line
- **WHEN** the operator finishes a mouse drag that copied part of the trace body
- **THEN** the log body renders with no selection highlight

### Requirement: Copy feedback
Log-screen chrome MUST show a short-lived `copied to clipboard` notice whenever a copy on that screen writes text, whether it came from a mouse selection or from `y`. The notice MUST clear itself without operator input. A copy that writes nothing (an empty selection, or `y` while no trace bytes have been retained) MUST NOT show the notice.

#### Scenario: Mouse selection copy is announced
- **WHEN** the operator finishes a mouse drag that copied part of the trace body
- **THEN** the log footer shows `copied to clipboard`

#### Scenario: Yank is announced
- **WHEN** the operator presses `y` on the log screen with a non-empty retained buffer
- **THEN** the log footer shows `copied to clipboard`

#### Scenario: The notice clears itself
- **WHEN** the notice has been shown and the operator does nothing further
- **THEN** the notice disappears without any input

#### Scenario: Nothing copied, nothing announced
- **WHEN** the operator presses `y` while the log screen still shows the waiting message
- **THEN** the clipboard is unchanged and no `copied to clipboard` notice appears

### Requirement: Retry the traced job from its log
Pressing the retry key on the log screen SHALL restart the job being traced and then show the newly created attempt in the same screen. The system SHALL only request a restart when the traced job's status is failed or canceled; for any other status the system MUST NOT contact GitLab and MUST show a short non-fatal message instead. The restart MUST go through the GitLab CLI retry command for that job's id, and the system MUST NOT restart a job by any other route.

#### Scenario: Retry a failed job from its log
- **WHEN** the operator is reading the log of a failed job and presses the retry key
- **THEN** that job is restarted in GitLab, the log screen clears the failed trace, and the new attempt’s live trace streams in the same framed log panel

#### Scenario: Retry feedback while the restart is in flight
- **WHEN** a retry has been requested from the log screen and GitLab has not answered yet
- **THEN** the log screen marks the retry as in progress and the operator can still scroll the current output or go back

#### Scenario: Traced job is not retryable
- **WHEN** the operator presses the retry key while the traced job is running, pending, successful, skipped, manual, or created
- **THEN** no restart is requested, the current log stays visible, and a short non-fatal message explains that only failed or canceled jobs can be retried

#### Scenario: Repeated retry while one is in flight
- **WHEN** the operator presses the retry key again while a retry from the log screen is still in flight
- **THEN** the system does not request a second restart and the in-flight retry is unaffected

#### Scenario: GitLab rejects the retry
- **WHEN** the retry request is rejected by GitLab or the CLI
- **THEN** the current log stays visible and a non-fatal message shows why the restart was refused

#### Scenario: Another log was opened while the restart was in flight
- **WHEN** a restart started from one job's log is still in flight and the operator opens another job's log
- **THEN** the restart does not take over that screen: the second job's log stays visible and only the in-flight mark clears when the restart completes

#### Scenario: The new attempt cannot be identified
- **WHEN** the restart succeeded but the system cannot determine the new attempt’s job id
- **THEN** the system leaves the log screen, returns to the job graph for that job, and shows a non-fatal message saying the new attempt could not be followed
