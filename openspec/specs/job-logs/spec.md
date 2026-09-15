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
When the job finishes or the tracer process exits, the system MUST keep the log screen and its buffer visible. The operator leaves only with the back action, which MUST return to the job graph with the same job focused if that job still exists.

#### Scenario: Job completes while watching
- **WHEN** a running job reaches a terminal status while the log screen is open
- **THEN** the operator remains on the log screen and can scroll the captured output

#### Scenario: Tracer exits
- **WHEN** the trace process exits after printing a finished job’s log
- **THEN** the log screen stays open until the back action

#### Scenario: Back to graph
- **WHEN** the operator uses the back action on the log screen
- **THEN** they return to the job graph, not the pipeline list

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
