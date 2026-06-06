# Backend SSoT — Incremental OpenSpec slices

## Status

Source of truth for backend implementation as of 2026-06-06.

## Why this exists

`docs/spec-backend.md` and `docs/spec 00 contract.md` are useful historical inputs, but they conflict with the current repository baseline in important ways:

- current app: Hono/Node service, not Next.js App Router;
- current storage: Markdown/file storage, not Postgres/Supabase;
- current webhook path: `/webhook`, with `/api/webhook` only as a compatibility alias if implemented;
- current constraints: resolve tenant from sender phone on every inbound message and never use global tenant state.

For implementation, the backend SSoT is now the incremental OpenSpec changes below. Legacy docs are reference-only unless a new decision explicitly promotes a requirement back into scope.

## Authority order

When docs disagree, use this order:

1. `openspec/config.yaml` constraints.
2. The six `openspec/changes/backend-*` slices listed below.
3. Existing current implementation and tests.
4. `docs/spec-backend.md` and `docs/spec 00 contract.md` as historical input only.

Do not add Postgres, Supabase migrations, or a Next.js-only route because an older source doc mentions them. Do not implement the SPEC-00 assignment model unless the decision-gated assignment slice is approved.

## Backend implementation slices

Implement in this order unless a later planning pass changes dependencies:

1. `openspec/changes/backend-kapso-outbound-list-limits`
   - Closes outbound text/buttons/list helpers under Kapso SDK/API constraints.
   - Adds `sendList` and enforces WhatsApp limits: 3 buttons, 10 list rows.

2. `openspec/changes/backend-webhook-dispatch-and-api-alias`
   - Closes webhook dispatch for text vs interactive IDs.
   - Keeps `/webhook`; may add `/api/webhook` as compatibility alias.

3. `openspec/changes/backend-idempotency-fast-response-hardening`
   - Hardens duplicate handling and fast-response behavior.
   - Adds side-effect-focused tests around fallback `message.id` dedupe.

4. `openspec/changes/backend-deterministic-import-buttons`
   - Implements deterministic import confirmation/cancel buttons for the current Markdown task-agent flow.
   - Keeps import persistence behind explicit human confirmation.

5. `openspec/changes/backend-assignment-approval-contract-decision`
   - Decision-gated slice for the older SPEC-00 assignment approval model.
   - Must not be implemented until product/architecture approves how Assignment maps into the Markdown domain.

6. `openspec/changes/backend-deploy-sandbox-smoke`
   - Documents and validates deploy/Sandbox smoke flow under the current Hono/Node setup.

## Superseded / reference-only inputs

The following documents are not implementation SSoT for backend work anymore:

- `docs/spec-backend.md` — source input used to derive the backend slices.
- `docs/spec 00 contract.md` — shared historical contract; backend-only requirements are superseded when they conflict with current OpenSpec constraints.
- `openspec/changes/kapso-ong-task-agent-md` — broad original change; useful context, but backend implementation now proceeds through the six smaller slices above.

## Validation rule

Each slice owns its own acceptance gates. For code changes, run at least:

- `npm test`
- `npm run typecheck`

Deploy/Sandbox evidence may additionally require manual WhatsApp/Kapso validation recorded in the relevant slice tasks or report.
