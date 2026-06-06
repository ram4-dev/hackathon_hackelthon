# Delta Spec — Backend assignment approval contract decision

## ADDED Requirements

### Requirement: Assignment approval contract requires explicit decision

The system SHALL NOT implement the SPEC-00 assignment approval state machine until a parent/product decision records that the contract remains in scope for the current Markdown-backed app.

#### Scenario: Decision is missing

- **Given** no explicit decision has approved the SPEC-00 assignment approval contract
- **When** implementation work reaches this change
- **Then** no code is added for `coord_approve`, `coord_reject`, `approve`, `reject`, or `done` assignment side effects
- **And** no Postgres, Supabase, or full SPEC-00 schema is introduced
- **And** this change remains blocked, deferred, or superseded

#### Scenario: Decision approves current Markdown-compatible implementation

- **Given** a recorded decision approves implementing the SPEC-00 assignment approval contract
- **When** this change is implemented
- **Then** assignment state is represented through Markdown-compatible storage
- **And** the implementation does not require Postgres, Supabase, migrations, or a global tenant

### Requirement: Assignment button IDs route deterministically if approved

If approved, the system SHALL route SPEC-00 assignment button IDs without LLM interpretation.

#### Scenario: Coordinator approves assignment

- **Given** a coordinator taps `coord_approve:<assignmentId>`
- **And** the assignment exists in Markdown-compatible storage
- **When** `handleButton` processes the ID
- **Then** it calls `coordinatorRespond(assignmentId, 'aprobar')`
- **And** marks the assignment as coordinator-approved
- **And** sends the candidate a button prompt with `approve:<assignmentId>` and `reject:<assignmentId>`

#### Scenario: Coordinator rejects assignment

- **Given** a coordinator taps `coord_reject:<assignmentId>`
- **And** the assignment exists in Markdown-compatible storage
- **When** `handleButton` processes the ID
- **Then** it calls `coordinatorRespond(assignmentId, 'rechazar')`
- **And** marks the assignment rejected by coordinator
- **And** returns the related task to a pending/open state compatible with the current task model

#### Scenario: Candidate accepts assignment

- **Given** a candidate taps `approve:<assignmentId>`
- **And** the assignment exists in Markdown-compatible storage
- **When** `handleButton` processes the ID
- **Then** it calls `respondToAssignment(assignmentId, 'aprobada')`
- **And** marks the assignment accepted
- **And** marks the related task approved or active using the current task model mapping
- **And** notifies the coordinator

#### Scenario: Candidate rejects assignment

- **Given** a candidate taps `reject:<assignmentId>`
- **And** the assignment exists in Markdown-compatible storage
- **When** `handleButton` processes the ID
- **Then** it calls `respondToAssignment(assignmentId, 'rechazada')`
- **And** marks the assignment rejected by person
- **And** calls the approved `proposeAssignment(taskId)` boundary to seek a new candidate

#### Scenario: Task done starts impact flow

- **Given** a user taps `done:<taskId>`
- **When** `handleButton` processes the ID
- **Then** it calls `startImpactFlow(waPhone, taskId)` through the approved ML boundary
