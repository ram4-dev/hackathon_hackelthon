# Delta Spec — Backend deterministic import buttons

## ADDED Requirements

### Requirement: Import mode stages content before persistence

The system SHALL stage import-mode content and avoid creating final tasks until explicit human confirmation.

#### Scenario: Import content is staged

- **Given** a sender is resolved to an organization and has conversation state `import`
- **And** the inbound message is not `LISTO`
- **When** the message is processed
- **Then** the normalized content is appended to the organization's import staging storage
- **And** the sender receives a brief acknowledgement equivalent to `✓ recibido`
- **And** no final task is created from that message

#### Scenario: LISTO creates pending batch

- **Given** a sender is in `import` mode
- **And** staged import items exist for the resolved organization
- **When** the sender sends `LISTO`
- **Then** the system calls the configured import extraction boundary over the staged content
- **And** stores the extracted proposals as a pending batch
- **And** sends a summary with `confirm_import:<batchId>` and `cancel_import:<batchId>` buttons
- **And** does not persist final tasks before confirmation

### Requirement: Import confirmation buttons are deterministic

The system SHALL handle `confirm_import` and `cancel_import` button IDs without LLM interpretation.

#### Scenario: Confirm import applies pending batch

- **Given** a pending import batch exists for the resolved organization
- **When** the sender taps `confirm_import:<batchId>`
- **Then** the system persists the batch's accepted members and tasks using Markdown storage
- **And** marks the batch as applied or removes it from pending work
- **And** clears or marks the staged raw items as applied
- **And** transitions the sender state to `active`
- **And** sends a short confirmation message

#### Scenario: Cancel import preserves raw staging

- **Given** a pending import batch exists for the resolved organization
- **When** the sender taps `cancel_import:<batchId>`
- **Then** the system does not create tasks from that batch
- **And** marks the batch cancelled or no longer pending
- **And** keeps the staged raw items available unless a later explicit action clears them
- **And** sends a short cancellation acknowledgement

### Requirement: Import buttons route before AI/text handling

The system SHALL route import confirmation button IDs before any text or AI handler.

#### Scenario: Import button does not reach text handler

- **Given** an inbound interactive reply has ID `confirm_import:<batchId>` or `cancel_import:<batchId>`
- **When** the normalized message is dispatched
- **Then** the deterministic import button handler processes the ID
- **And** no text handler or LLM flow is invoked for that inbound message
