# Tasks — Backend deploy and Kapso Sandbox smoke

## Delivery strategy

Document first, then add only the minimum config/adapter needed for the selected deploy target. Keep manual Sandbox validation separate from automated tests.

## Review workload forecast

Small to medium. Likely touches `README.md`, `.env.example`, optional `vercel.json` or deployment adapter files, possibly `src/app.ts`/`src/server.ts` for serverless export compatibility, and an artifact under `artifacts/` for smoke evidence.

## Task list

- [x] Choose and document the deploy target for the Hono/Node app.
- [x] Add deployment config or adapter only if the target requires it. (No adapter required for the selected Render-style long-running Node target.)
- [x] Document build/start commands and required Node version if relevant.
- [x] Document Kapso Sandbox webhook URL using `/webhook` and/or `/api/webhook`.
- [x] Verify current env var names from `src/env.ts`/provider usage and document them without Supabase/Postgres. (`.env.example` was not read because this slice's safe-secrets guardrail forbids reading secret-bearing files.)
- [x] Document how to run the local console outbound fallback.
- [x] Document a manual smoke test: send `hola` from WhatsApp to the Sandbox number.
- [x] Record manual smoke evidence when a public deployment is available. (Recorded as pending because no public deployment/Kapso credentials were available.)

## Exit gate

- [x] `npm run typecheck` passes after any deploy adapter/config changes.
- [x] If source files changed, `npm test` passes. (No source files changed; full test suite still passed.)
- [x] Documentation includes required env vars and webhook URL paths.
- [x] Manual Sandbox smoke evidence is captured or explicitly marked pending with the blocker.

## Depends on

- `backend-webhook-dispatch-and-api-alias`.
- A text handler or echo/stub path capable of producing a visible reply.
- Kapso Sandbox credentials outside the repository.
