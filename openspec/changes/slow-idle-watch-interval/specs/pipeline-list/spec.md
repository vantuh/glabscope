## MODIFIED Requirements

### Requirement: Refresh active pipeline statuses
While the pipeline list contains at least one running or pending pipeline, the system SHALL refresh the list automatically on a bounded interval. When no visible pipeline is running or pending, the system SHALL slow automatic refresh to a bounded watch interval instead of stopping, so externally started pipelines still appear. The watch interval SHALL be at least twice the normal interval, so a list with nothing active is observably quieter than one with an active pipeline.

#### Scenario: Active pipeline changes status
- **WHEN** the operator remains on the pipeline list and a visible running or pending pipeline changes status
- **THEN** the corresponding row reflects the new status within one successful refresh interval without manual navigation

#### Scenario: No active pipelines remain
- **WHEN** a refresh returns no visible pipeline in a running or pending state
- **THEN** the system slows automatic pipeline-list refresh to the bounded watch interval

#### Scenario: New pipeline starts while watching
- **WHEN** automatic refresh is slowed to the watch interval and the operator starts a new pipeline from outside the TUI
- **THEN** the new pipeline appears in the list within one successful watch refresh without manual navigation

#### Scenario: Watch interval is slowed
- **WHEN** the list holds no running or pending pipeline and the operator stays on it
- **THEN** consecutive automatic refreshes are spaced at least twice as far apart as they are while a running or pending pipeline is visible
