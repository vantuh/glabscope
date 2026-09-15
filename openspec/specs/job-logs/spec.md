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
