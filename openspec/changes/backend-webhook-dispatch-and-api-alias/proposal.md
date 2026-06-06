# Proposal — Backend webhook dispatch and API alias

## Status

Proposed.

## Source

Split from `docs/spec-backend.md` SPEC-B.2 and mapped through `artifacts/backend-spec-current-map.md`.

## Why

The current Hono app accepts `POST /webhook`, verifies signatures, deduplicates, and normalizes messages, but normalized interactive IDs and text are not yet dispatched to deterministic button handlers or text processing. SPEC-BACKEND also references `/api/webhook`; supporting an alias reduces deployment/Sandbox friction without switching to Next.js.

## What changes

- Keep the existing Hono `POST /webhook` endpoint.
- Add `POST /api/webhook` as an alias to the same handler.
- Return a stable `200` response for unsupported Kapso events.
- Route interactive reply IDs before text/AI handling.
- Route text messages to a real text handler or explicit echo/stub handler, not console logging.
- Add tests that prove button and text dispatch paths are distinct.

## Non-goals

- Do not migrate the app to Next.js App Router.
- Do not implement import confirmation side effects in this change.
- Do not implement the SPEC-00 assignment approval state machine here.
- Do not change storage away from Markdown files.

## Impact

Webhook transport becomes apply-ready for deterministic button flows and text agent integration. Kapso can be configured with either `/webhook` or `/api/webhook` while the Hono runtime remains the source of truth.

## Dependencies

- Existing webhook ingestion, signature verification, idempotency, and message normalization.
- `backend-kapso-outbound-list-limits` only if the chosen text/button handlers need the new outbound list helper.
