# Delta Spec — Backend idempotency and fast-response hardening

## MODIFIED Requirements

### Requirement: Kapso webhook ingestion

The system SHALL deduplicate webhook delivery by `X-Idempotency-Key` when present and by inbound `message.id` when the header is absent, while returning HTTP `200` before heavy processing runs.

#### Scenario: Duplicate idempotency header is ignored

- **Given** a valid Kapso webhook delivery with `X-Idempotency-Key` value `K`
- **And** delivery `K` was already accepted or processed
- **When** the webhook receives the delivery again
- **Then** it responds with HTTP `200`
- **And** it does not enqueue or run the domain processor again
- **And** it does not send duplicate outbound messages

#### Scenario: Duplicate message ID fallback is ignored

- **Given** a valid Kapso webhook delivery has no `X-Idempotency-Key`
- **And** the normalized inbound message has ID `M`
- **And** message `M` was already accepted or processed
- **When** the webhook receives the delivery again
- **Then** it responds with HTTP `200`
- **And** it does not enqueue or run the domain processor again
- **And** it does not send duplicate outbound messages

#### Scenario: Accepted webhook responds before heavy work

- **Given** a valid new Kapso message requires domain, AI, or media processing
- **When** the webhook accepts the request
- **Then** it records the idempotency key or message ID before processing side effects
- **And** it responds with HTTP `200` without awaiting heavy processing
- **And** the heavy processing runs through the configured async queue or equivalent scheduler

### Requirement: Webhook processing outcome is explicit

The system SHALL make the chosen retry semantics for accepted webhook messages explicit in Markdown-compatible storage or documentation.

#### Scenario: Processing fails after acceptance

- **Given** the webhook accepted a new message and recorded its idempotency key
- **When** asynchronous processing fails
- **Then** the system behavior is deterministic and documented as either non-retryable accepted delivery or status-tracked failed delivery
- **And** duplicate retries do not accidentally create duplicate side effects
