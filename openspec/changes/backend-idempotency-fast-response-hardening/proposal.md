# Proposal — Backend idempotency and fast-response hardening

## Status

Proposed.

## Source

Split from `docs/spec-backend.md` SPEC-B.4 and mapped through `artifacts/backend-spec-current-map.md`.

## Why

The current webhook path deduplicates by idempotency key or message ID and enqueues work before returning. The gap is confidence: fallback message ID behavior and side-effect suppression need tests, the async processor should be injectable, and retry semantics should be documented or represented in storage.

## What changes

- Add tests for fallback deduplication by `message.id`.
- Add tests proving duplicate deliveries cause no second domain/outbound side effect.
- Make async processing injectable or otherwise observable in tests.
- Preserve fast `200` responses that do not await heavy domain, AI, or media work.
- Decide and document the storage semantics for accepted/processed/failed webhook attempts.

## Non-goals

- Do not introduce an external queue service for the hackathon version.
- Do not add Postgres or a production idempotency table.
- Do not change tenant resolution or domain behavior except as needed to prove one side effect per message.
- Do not implement deploy adapters in this change.

## Impact

Webhook retries become safer and easier to reason about. Tests can verify the acceptance path is quick and that duplicate Kapso/Meta retries do not duplicate user-facing actions.

## Dependencies

- Existing webhook ingestion and processed-webhook Markdown storage.
- Existing in-process queue or a small compatible abstraction around it.
