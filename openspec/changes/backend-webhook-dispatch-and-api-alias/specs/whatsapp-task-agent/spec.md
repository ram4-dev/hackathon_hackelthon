# Delta Spec — Backend webhook dispatch and API alias

## ADDED Requirements

### Requirement: Webhook endpoint has API-compatible alias

The system SHALL expose both `POST /webhook` and `POST /api/webhook` for Kapso inbound WhatsApp events in the Hono runtime.

#### Scenario: Kapso posts to the canonical Hono route

- **Given** Kapso sends a valid inbound message event to `POST /webhook`
- **When** the request is handled
- **Then** the system applies the same signature verification, idempotency, normalization, and dispatch behavior as the main webhook handler

#### Scenario: Kapso posts to the API alias

- **Given** Kapso sends a valid inbound message event to `POST /api/webhook`
- **When** the request is handled
- **Then** the system applies the same signature verification, idempotency, normalization, and dispatch behavior as `POST /webhook`

### Requirement: Webhook dispatch separates interactive replies from text

The system SHALL dispatch normalized interactive reply IDs before any text or AI handling.

#### Scenario: Interactive reply is routed deterministically

- **Given** an inbound `whatsapp.message.received` event contains an interactive button or list reply ID
- **When** the normalized message is processed
- **Then** the system calls the deterministic button dispatcher with the sender phone and reply ID
- **And** it does not call the text handler for that message

#### Scenario: Text message is routed to text handler

- **Given** an inbound `whatsapp.message.received` event contains text content and no interactive reply ID
- **When** the normalized message is processed
- **Then** the system calls the text handler with the sender phone and normalized text
- **And** it does not call the deterministic button dispatcher

### Requirement: Unsupported events are acknowledged safely

The system SHALL ignore unsupported Kapso events without side effects.

#### Scenario: Unsupported event is ignored

- **Given** Kapso sends an event whose type is not `whatsapp.message.received`
- **When** the webhook handles the request
- **Then** it responds with HTTP `200`
- **And** it does not enqueue message processing
- **And** it does not send a WhatsApp reply
