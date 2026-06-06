# Proposal — Backend deploy and Kapso Sandbox smoke

## Status

Proposed.

## Source

Split from `docs/spec-backend.md` SPEC-B.5 and mapped through `artifacts/backend-spec-current-map.md`.

## Why

The backend has local Hono/Node runtime and env scaffolding, but it does not yet document or provide a deploy path, Kapso Sandbox webhook setup, or manual smoke evidence. A deploy-focused slice should validate the transport path without changing product architecture.

## What changes

- Document the deploy target and commands for the Hono/Node app.
- Add deployment adapter/config only if required by the chosen target.
- Document public webhook URLs for both `/webhook` and `/api/webhook` if the alias exists.
- Keep env documentation aligned with current constraints: Kapso, AI provider/model, data directory; no Supabase.
- Add a manual Sandbox smoke checklist for sending `hola` and observing a WhatsApp or console-stub reply.
- Record smoke evidence in docs or an artifact when performed.

## Non-goals

- Do not add Postgres/Supabase env vars unless the project constraints are changed.
- Do not implement the AI agent in this deploy slice.
- Do not require a live Sandbox in automated CI.
- Do not remove local Node/Hono development support.

## Impact

The team gets a repeatable path from local implementation to a public webhook connected to Kapso Sandbox. This closes the transport demo loop once text dispatch and outbound helpers are in place.

## Dependencies

- `backend-webhook-dispatch-and-api-alias` for deploy URL compatibility and text dispatch.
- Existing env handling and Kapso outbound client.
- Optional: `backend-idempotency-fast-response-hardening` for safer retry behavior before public exposure.
