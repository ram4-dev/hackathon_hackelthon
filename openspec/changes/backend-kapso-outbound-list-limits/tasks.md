# Tasks — Backend Kapso outbound list and limits

## Delivery strategy

Implement the smallest outbound-client change first, behind tests with a fake Kapso SDK/client. Keep the public transport helper surface compatible with current callers.

## Review workload forecast

Small. Likely touches `src/kapso/client.ts`, `src/kapso/consoleClient.ts`, and a focused test file such as `src/kapso/client.test.ts`.

## Task list

- [x] Add or formalize an outbound client interface exposing `sendText`, `sendButtons`, and `sendList`.
- [x] Update `sendButtons` to truncate input buttons to the first 3 items.
- [x] Implement `sendList` using Kapso SDK/API interactive list support.
- [x] Truncate list rows to the first 10 total rows.
- [x] Preserve caller-provided `{ id, title, description? }` values in outgoing rows.
- [x] Update the console/fallback client to implement the same methods.
- [x] Add tests for button truncation, list truncation, and outbound payload shape.

## Exit gate

- [x] `npm test` passes.
- [x] `npm run typecheck` passes.
- [x] Tests prove no more than 3 buttons and 10 list rows are sent.

## Depends on

Existing scaffold and Kapso client from the broad `kapso-ong-task-agent-md` change.
