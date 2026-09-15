## ADDED Requirements

### Requirement: Refresh active pipeline statuses
While the pipeline list contains at least one running or pending pipeline, the system SHALL refresh the list automatically on a bounded interval. The system MUST stop automatic refresh when no visible pipeline is running or pending.

#### Scenario: Active pipeline changes status
- **WHEN** the operator remains on the pipeline list and a visible running or pending pipeline changes status
- **THEN** the corresponding row reflects the new status within one successful refresh interval without manual navigation

#### Scenario: No active pipelines remain
- **WHEN** a refresh returns no visible pipeline in a running or pending state
- **THEN** the system stops automatic pipeline-list refresh

### Requirement: Preserve list interaction during refresh
An automatic refresh SHALL preserve the selected pipeline by identity when it is still present. A failed background refresh MUST keep the last successful list visible and MUST NOT turn the screen into a fatal error.

#### Scenario: Selection survives reordered results
- **WHEN** refreshed pipeline results change row order and the selected pipeline is still present
- **THEN** that same pipeline remains selected

#### Scenario: Selected pipeline disappears
- **WHEN** refreshed results no longer contain the selected pipeline
- **THEN** the system selects the nearest valid row without preventing further navigation

#### Scenario: Background refresh fails
- **WHEN** an automatic list refresh fails
- **THEN** the last successful pipeline list remains usable and a non-fatal refresh error is shown

### Requirement: Back off after pipeline-list rate limiting
When GitLab rate-limits an automatic pipeline-list refresh, the system SHALL increase the delay before the next refresh up to a bounded maximum. After a successful refresh, the system SHALL restore the normal refresh interval.

#### Scenario: Rate-limited refresh
- **WHEN** an automatic pipeline-list refresh receives a rate-limit response
- **THEN** the next refresh is scheduled later than the normal interval without discarding the current list

#### Scenario: Refresh recovers
- **WHEN** a refresh succeeds after one or more rate-limit responses
- **THEN** subsequent active-pipeline refreshes use the normal interval
