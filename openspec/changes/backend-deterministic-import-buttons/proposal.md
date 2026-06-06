# Proposal — Backend deterministic import buttons

## Status

Proposed.

## Source

Split from `docs/spec-backend.md` SPEC-B.3's deterministic-button principle and aligned with the current OpenSpec import flow described in `artifacts/backend-spec-current-map.md`.

## Why

The current product already has onboarding and Markdown storage for import staging and pending batches, but import-mode runtime behavior is incomplete. The next safe deterministic button scope is the current app's import confirmation flow (`confirm_import`/`cancel_import`), not the unresolved SPEC-00 assignment model.

## What changes

- Implement import-mode staging for non-`LISTO` messages.
- Reply with a brief acknowledgement and avoid task persistence before confirmation.
- Handle `LISTO` by creating a pending batch using an extractor boundary or stub until ML extraction lands.
- Send confirm/cancel interactive buttons for the pending batch.
- Handle `confirm_import:<batchId>` and `cancel_import:<batchId>` deterministically before AI/text handling.
- Add tests for staging, confirmation, cancellation, and state transitions.

## Non-goals

- Do not implement the SPEC-00 assignment approval buttons in this change.
- Do not build final AI extraction quality here; a stub extractor boundary is acceptable.
- Do not create tasks before the user confirms a pending import batch.
- Do not add Postgres or global tenant state.

## Impact

The onboarding-to-import demo path becomes functional and deterministic. This provides an immediate human-in-the-loop confirmation flow with Markdown storage, while leaving richer active-mode AI tools to separate ML/backend specs.

## Dependencies

- Existing onboarding, tenant resolution, conversation state, import staging, and pending batch Markdown storage.
- `backend-webhook-dispatch-and-api-alias` for deterministic button routing before text handling.
- Outbound button helper from existing client or `backend-kapso-outbound-list-limits`.
