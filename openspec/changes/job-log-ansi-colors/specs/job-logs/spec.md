## ADDED Requirements

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
