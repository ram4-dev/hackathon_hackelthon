# Tasks — Backend webhook dispatch and API alias

## Delivery strategy

Refactor the current webhook handler into a shared Hono route handler, mount it at both paths, then add dispatch tests with injected domain handlers.

## Review workload forecast

Small to medium. Likely touches `src/app.ts`, `src/domain/processInboundMessage.ts`, a new `src/domain/buttonRouter.ts` or `src/domain/textHandler.ts`, and tests in `src/app.test.ts` plus focused domain tests.

## Task list

- [x] Extract or reuse one webhook handler for both `POST /webhook` and `POST /api/webhook`.
- [x] Keep raw-body signature verification behavior unchanged for both routes.
- [x] Return a stable HTTP `200` response for unsupported events.
- [x] Ensure normalized `interactiveId` dispatches before text handling.
- [x] Add an injectable deterministic button dispatcher boundary.
- [x] Add an injectable text handler boundary or explicit echo/stub handler.
- [x] Add tests for `/webhook` and `/api/webhook` parity.
- [x] Add tests that button payloads call only the button dispatcher.
- [x] Add tests that text payloads call only the text handler.

## Exit gate

- [x] `npm test` passes.
- [x] `npm run typecheck` passes.
- [x] Tests prove `/api/webhook` and `/webhook` both accept valid Kapso events.
- [x] Tests prove interactive replies are not routed through text/AI handling.

## Depends on

Existing T5/T6 behavior from `kapso-ong-task-agent-md`; no hard dependency on code changes outside webhook/domain dispatch unless a handler needs outbound list support.
