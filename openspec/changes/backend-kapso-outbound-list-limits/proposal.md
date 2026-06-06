# Proposal — Backend Kapso outbound list and limits

## Status

Proposed.

## Source

Split from `docs/spec-backend.md` SPEC-B.1 and mapped through `artifacts/backend-spec-current-map.md`.

## Why

The current backend already sends text and button messages through the Kapso SDK, but it does not expose list messages and does not enforce WhatsApp interactive limits. This change closes the outbound transport helper gap while preserving the existing Hono/Node, Kapso SDK/API and Markdown-storage constraints.

## What changes

- Extend the outbound client interface with `sendList(to, body, rows)`.
- Enforce `sendButtons` truncation to at most 3 buttons.
- Enforce `sendList` truncation to at most 10 total rows.
- Preserve deterministic button/list row IDs exactly as provided by callers.
- Add tests using a fake Kapso SDK/client to verify payload shape and limits.

## Non-goals

- Do not switch from the Kapso SDK/API to a hand-rolled REST-only client unless the SDK cannot support list messages.
- Do not implement webhook routing or button side effects in this change.
- Do not add Postgres, Supabase, or database-backed state.
- Do not perform live Sandbox validation as part of automated tests.

## Impact

The domain layer can send all required WhatsApp interactive message forms through a stable backend boundary. Later changes can depend on a tested `sendButtons`/`sendList` contract without duplicating Kapso payload logic.

## Dependencies

- Existing project scaffold and Kapso client.
- Existing env handling for Kapso credentials.
