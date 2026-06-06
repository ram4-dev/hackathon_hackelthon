# Delta Spec — WhatsApp NGO task agent

> SSoT update: this broad delta spec is reference-only for backend implementation where it overlaps the newer backend slices. Use `docs/spec-backend-ssot.md` and `openspec/changes/backend-*` as the current backend SSoT.

## ADDED Requirements

### Requirement: Kapso webhook ingestion

The system SHALL expose `POST /webhook` for Kapso WhatsApp webhook events.

#### Scenario: Valid inbound message is accepted quickly

- **Given** Kapso sends a `whatsapp.message.received` event
- **And** the request has a valid `X-Webhook-Signature`
- **When** the webhook receives the request
- **Then** it verifies the signature against the raw payload
- **And** records an idempotency key
- **And** responds with HTTP `200` before running heavy AI or media work
- **And** queues or schedules asynchronous processing for the message

#### Scenario: Invalid signature is rejected

- **Given** a request to `POST /webhook`
- **And** the `X-Webhook-Signature` does not match the raw payload HMAC SHA256
- **When** the webhook handles the request
- **Then** it responds with HTTP `401`
- **And** does not process the message
- **And** does not send a WhatsApp reply

#### Scenario: Duplicate webhook is ignored

- **Given** a webhook delivery whose `X-Idempotency-Key` was already processed
- **Or** whose fallback `message.id` was already processed
- **When** the webhook handles the request
- **Then** it responds with HTTP `200`
- **And** does not run the state machine again
- **And** does not send duplicate outbound messages

### Requirement: Tenant resolution per inbound message

The system SHALL resolve the organization tenant on every inbound message from the sender phone number.

#### Scenario: Known member resolves to active organization

- **Given** sender phone `P` is registered as a member of organization `O`
- **When** any inbound message from `P` is processed
- **Then** the system resolves `orgId = O` from storage
- **And** passes trusted `orgId` and `actorPhone = P` into server-side handlers
- **And** ignores any model-provided tenant value

#### Scenario: Unknown sender enters onboarding

- **Given** sender phone `P` is not registered as a member
- **And** there is no conversation state for `P`
- **When** an inbound message from `P` is processed
- **Then** the system creates or loads onboarding state for `P`
- **And** routes the message to onboarding logic

#### Scenario: No global tenant state is used

- **Given** two messages from different phones arrive close together
- **When** both are processed
- **Then** each message resolves tenant independently from its sender phone
- **And** no module reads or writes a global current organization

### Requirement: Markdown-backed storage

The system SHALL store hackathon data in human-readable Markdown files behind repository-style storage functions.

#### Scenario: Organization is created

- **Given** a new NGO name and admin phone
- **When** the system creates an organization
- **Then** it writes `data/orgs/<orgId>/org.md`
- **And** appends the admin to `members.md`
- **And** updates `data/indexes/phone-to-member.md`
- **And** updates `data/indexes/invite-codes.md`

#### Scenario: Task is created

- **Given** a resolved `orgId`
- **And** a task title
- **When** the system creates a task
- **Then** it appends a row to `data/orgs/<orgId>/tasks.md`
- **And** sets default `priority = med` when absent
- **And** sets `status = open`

#### Scenario: Storage remains swappable

- **Given** a domain handler needs members, tasks or state
- **When** it reads or writes data
- **Then** it calls repository/storage functions
- **And** it does not parse Markdown tables directly inside AI tools or HTTP handlers

### Requirement: Onboarding mode

The system SHALL support onboarding for creating or joining an NGO from WhatsApp.

#### Scenario: Create NGO from deep-link text

- **Given** an unknown sender sends `Quiero registrar mi ONG`
- **When** onboarding handles the message
- **Then** it asks for the NGO name if missing
- **And** creates an organization after the name is known
- **And** generates a short unique invite code
- **And** registers the sender as admin
- **And** sends an invite link ready to forward
- **And** transitions the sender state to `import`

#### Scenario: Join NGO from invite code

- **Given** an unknown sender sends `UNIRME ABC123`
- **And** invite code `ABC123` exists
- **When** onboarding handles the message
- **Then** it asks for missing name or role if needed
- **And** registers the sender as a member of that organization
- **And** transitions the sender state to `active`

#### Scenario: Invalid invite code

- **Given** an unknown sender sends an invalid invite code
- **When** onboarding handles the message
- **Then** it sends a short WhatsApp message explaining the code was not found
- **And** keeps the sender in onboarding

### Requirement: Import mode stages brain-dump items

The system SHALL stage incoming content during initial import and avoid premature task writes.

#### Scenario: Import item is staged

- **Given** a sender is in `import` mode for organization `O`
- **And** the message is not `LISTO`
- **When** the message is processed
- **Then** the normalized content is appended to `data/orgs/<orgId>/import-staging.md`
- **And** the user receives exactly a brief acknowledgement equivalent to `✓ recibido`
- **And** no task is created yet

#### Scenario: LISTO starts batch extraction

- **Given** a sender is in `import` mode
- **And** staged items exist for the organization
- **When** the sender sends `LISTO`
- **Then** the system runs structured extraction over all staged items
- **And** produces a pending batch of proposed tasks and inferred members
- **And** stores the batch in `pending-batches.md`
- **And** sends a summary with confirm and cancel buttons
- **And** does not persist final tasks before confirmation

#### Scenario: Confirm import persists batch

- **Given** a pending import batch exists
- **When** the sender taps `confirm_import:<batchId>`
- **Then** the system persists accepted members and tasks
- **And** clears staged import items for the organization
- **And** removes or marks the pending batch as applied
- **And** transitions the sender state to `active`

#### Scenario: Cancel import does not persist batch

- **Given** a pending import batch exists
- **When** the sender taps `cancel_import:<batchId>`
- **Then** the system does not create tasks from that batch
- **And** keeps staged raw items available unless explicitly cleared later
- **And** sends a short cancellation acknowledgement

### Requirement: Structured import extraction

The system SHALL use AI SDK structured output to extract tasks and members from staged import content.

#### Scenario: Extraction schema is enforced

- **Given** staged import text
- **When** extraction runs
- **Then** the output conforms to:
  - `tasks[].title` string
  - `tasks[].assignee` nullable string
  - `tasks[].dueDate` nullable string
  - `tasks[].priority` one of `low`, `med`, `high`
  - `members[].name` string
  - `members[].role` nullable string

#### Scenario: Tasks are deduplicated conservatively

- **Given** extraction returns duplicate or near-identical task titles
- **When** the batch is prepared
- **Then** tasks are deduplicated by normalized title
- **And** the clearer title is retained when possible

#### Scenario: Missing assignee or due date is not invented

- **Given** staged content does not explicitly identify an assignee or due date
- **When** extraction produces proposed tasks
- **Then** the corresponding fields remain null/empty
- **And** the system does not invent a person or date

#### Scenario: Assignee matching is conservative

- **Given** extracted assignee text does not clearly match exactly one known member
- **When** tasks are persisted
- **Then** the task remains unassigned
- **And** the user is told briefly that no clear match was found when relevant

### Requirement: Active task operations through AI SDK tools

The system SHALL use AI SDK tools for data-changing operations in active mode.

#### Scenario: Create task

- **Given** a known member in `active` mode sends a message requesting a task creation
- **When** the AI SDK selects `createTask`
- **Then** the tool creates the task under the resolved `orgId`
- **And** returns a short user-safe confirmation

#### Scenario: List tasks

- **Given** a known member in `active` mode asks to list tasks
- **When** the AI SDK selects `listTasks`
- **Then** the tool returns tasks filtered by `open`, `done`, `mine` or `all`
- **And** the response does not expose internal IDs unless the UI needs short task references

#### Scenario: Assign task

- **Given** a known member asks to assign a task
- **When** the AI SDK selects `assignTask`
- **Then** the tool resolves the assignee by phone or clear name match
- **And** assigns only if exactly one clear member matches
- **And** otherwise leaves the task unassigned

#### Scenario: Complete task

- **Given** a known member asks to complete a task
- **When** the AI SDK selects `completeTask`
- **Then** the task status becomes `done`
- **And** the user receives a short confirmation

### Requirement: Kapso outbound messages

The system SHALL send WhatsApp replies through Kapso API/SDK.

#### Scenario: Text reply

- **Given** a handler has a text response for a phone
- **When** it sends the response
- **Then** it calls Kapso outbound API/SDK with `phoneNumberId`, recipient phone and body text
- **And** does not attempt to return the message body as the webhook HTTP response

#### Scenario: Interactive confirmation buttons

- **Given** an import batch requires confirmation
- **When** the system sends the confirmation prompt
- **Then** it sends Kapso interactive buttons with deterministic IDs
- **And** includes at least confirm and cancel actions

### Requirement: Kapso media normalization

The system SHALL normalize inbound Kapso content before routing it to AI or state handlers.

#### Scenario: Audio transcript is used

- **Given** `message.type = audio`
- **And** `message.kapso.transcript.text` is present
- **When** the message is normalized
- **Then** the normalized text is the transcript text
- **And** no custom speech-to-text is required

#### Scenario: Kapso content fallback is used

- **Given** `message.kapso.content` is present
- **When** any supported message type is normalized
- **Then** the content is used as the primary agent input unless a more specific transcript rule applies

#### Scenario: Temporary media URL is handled carefully

- **Given** a media message has `message.kapso.media_data.url`
- **When** fallback file processing is needed
- **Then** the system downloads the file immediately with Kapso authentication
- **And** does not assume the URL will remain valid later

### Requirement: Reminder scheduling boundary

The system SHALL support reminder requests while respecting WhatsApp's 24-hour messaging window.

#### Scenario: Reminder is scheduled

- **Given** a known member asks to set a reminder for a task
- **When** the AI SDK selects `setReminder`
- **Then** the system appends a reminder job to Markdown storage
- **And** records task, target time and recipient

#### Scenario: Reminder fires inside 24-hour window

- **Given** a reminder job is due
- **And** the recipient has an open 24-hour WhatsApp window
- **When** the reminder worker runs
- **Then** it sends a free-form text reminder through Kapso

#### Scenario: Reminder fires outside 24-hour window

- **Given** a reminder job is due
- **And** the recipient is outside the 24-hour WhatsApp window
- **When** the reminder worker runs
- **Then** it uses a configured approved template if available
- **And** otherwise records/surfaces that template configuration is required
- **And** does not promise delivery that cannot be sent
