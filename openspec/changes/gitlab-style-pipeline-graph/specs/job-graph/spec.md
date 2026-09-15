## MODIFIED Requirements

### Requirement: Same-pipeline needs graph
For the selected pipeline the system SHALL display jobs as rounded cards grouped into stage columns from left to right (GitLab pipeline page), not as a single top-to-bottom list. Jobs that share a stage MUST stack in that stage’s column. The system SHALL draw directed arrows only for GraphQL `needs` (from needed jobs to dependents). Layout MUST NOT invent edges from stage order alone. Trigger or bridge jobs MUST appear as ordinary cards; v1 MUST NOT open a child pipeline graph from them.

#### Scenario: Jobs with needs
- **WHEN** the selected pipeline has jobs linked by `needs`
- **THEN** those jobs are shown as cards with visible arrows from needed jobs to dependents

#### Scenario: Jobs without needs
- **WHEN** jobs only share stages and have no `needs`
- **THEN** the system still shows every job in the pipeline in their stage columns without inventing false edges

#### Scenario: Bridge job
- **WHEN** the pipeline contains a trigger or bridge job
- **THEN** it is shown as a single card and confirming it does not replace the graph with a child pipeline

#### Scenario: Stage columns
- **WHEN** the pipeline has more than one stage
- **THEN** earlier stages appear to the left of later stages and jobs in the same stage appear in the same column

### Requirement: Status colors on jobs
Each job card MUST use the same four visual buckets as the pipeline list: success, failed, running-or-pending, other. Each card MUST also show a Nerd Font status icon for that job so status is not color alone.

#### Scenario: Live mix of job states
- **WHEN** some jobs succeeded, one failed, one is running, and one is skipped
- **THEN** those four buckets are visually distinct on the graph by both color and icon

### Requirement: Keyboard navigation
The operator SHALL move focus among job cards and confirm the focused job to open its log. Up and down MUST move among jobs in the same stage. Left and right MUST move to a job in the adjacent stage. A back action MUST return to the pipeline list.

#### Scenario: Focus and open
- **WHEN** the operator moves focus to a job and confirms
- **THEN** the job log screen opens for that job

#### Scenario: Vertical move in a stage
- **WHEN** the operator presses up or down while several jobs share the focused stage
- **THEN** focus moves to another job in that same stage and does not jump to a different stage

#### Scenario: Horizontal move between stages
- **WHEN** the operator presses left or right and an adjacent stage exists
- **THEN** focus moves to a job in that adjacent stage

#### Scenario: Adjacent stage is shorter
- **WHEN** the operator moves left or right into a stage that has fewer jobs than the current row
- **THEN** focus lands on the last job in that stage rather than leaving the graph or wrapping around
