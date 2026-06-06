# Tasks — Backend idempotency and fast-response hardening

## Delivery strategy

Start with tests that expose the current guarantees, then adjust only the webhook/queue/storage boundary needed to make behavior explicit and testable.

## Review workload forecast

Small to medium. Likely touches `src/app.ts`, `src/jobs/queue.ts`, `src/storage/markdownStore.ts` if status tracking is added, and `src/app.test.ts`.

## Task list

- [x] Add a test where duplicate deliveries share only `message.id` and no `X-Idempotency-Key`.
- [x] Add a test where a duplicate delivery produces only one domain/outbound side effect.
- [x] Add a test or fixture proving the webhook response does not await the domain processor.
- [x] Make the async processor injectable from app construction or queue construction.
- [x] Document or implement accepted/processed/failed semantics for webhook processing.
- [x] If retry after async failure is required, replace the single processed flag with Markdown-compatible status tracking. (Not required: accepted deliveries are documented as non-retryable for this hackathon implementation.)
- [x] Preserve compatibility with existing processed-webhook storage for already processed IDs.

## Exit gate

- [x] `npm test` passes.
- [x] `npm run typecheck` passes.
- [x] Tests prove header-key dedupe and fallback-message-id dedupe.
- [x] Tests prove duplicate deliveries do not call the domain processor twice.
- [x] The chosen mark-before-processing or status-tracking behavior is documented in code comments or docs.

## Depends on

Existing webhook ingestion and processed-webhooks repository from `kapso-ong-task-agent-md`.
