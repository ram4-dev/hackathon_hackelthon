# Apply Progress — Backend webhook dispatch and API alias

## Status

Applied on 2026-06-06.

## Completed tasks

- Extracted one shared webhook handler and mounted it at both `POST /webhook` and `POST /api/webhook`.
- Preserved raw-body HMAC signature verification for both routes.
- Preserved stable `200 OK` acknowledgement for unsupported events and added coverage that they do not enqueue processing.
- Added injectable app-level queue, outbound, button dispatcher, and text handler seams for focused transport tests.
- Added deterministic button dispatcher boundary in `src/domain/buttonRouter.ts`.
- Added explicit echo/stub text handler boundary in `src/domain/textHandler.ts`.
- Updated inbound processing to route normalized `interactiveId` to the button dispatcher before text handling.
- Updated inbound processing to route known text messages to the injected/default text handler instead of console logging.
- Added route parity and dispatch separation tests.

## Files changed

- `src/app.ts`
- `src/app.test.ts`
- `src/domain/buttonRouter.ts`
- `src/domain/textHandler.ts`
- `src/domain/processInboundMessage.ts`
- `src/domain/processInboundMessage.test.ts`
- `openspec/changes/backend-webhook-dispatch-and-api-alias/tasks.md`
- `openspec/changes/backend-webhook-dispatch-and-api-alias/apply-progress.md`

## TDD Cycle Evidence

| Cycle | RED | GREEN | Refactor / note |
| --- | --- | --- | --- |
| Route alias + dispatch seams | `npm test -- src/domain/processInboundMessage.test.ts src/app.test.ts` failed: `/api/webhook` returned 404; button dispatcher and text handler spies were not called. | Added shared webhook handler alias plus injectable dispatch boundaries; focused tests passed. | Kept existing `/webhook` behavior and default async queue path intact. |
| Full validation | N/A | `npm test` passed: 11 files / 27 tests. `npm run typecheck` passed. | No additional refactor needed. |

## Test commands run

- `npm test -- src/domain/processInboundMessage.test.ts src/app.test.ts` — failed as expected for RED.
- `npm test -- src/domain/processInboundMessage.test.ts src/app.test.ts` — passed after implementation.
- `npm test` — passed, 11 test files / 27 tests.
- `npm run typecheck` — passed.

## Deviations from design

- The default text handler is an explicit echo/stub implemented as `ok: ${text}` because the real AI/text handler belongs to later ML/current active-mode slices.
- The default deterministic button dispatcher logs unhandled IDs only; import confirmation and assignment side effects remain out of scope for this slice.
- App-level dependency injection was added to make route dispatch and no-enqueue behavior testable without changing production defaults.

## Remaining tasks

- None for this slice.
- Follow-up slices own idempotency hardening, deterministic import button side effects, assignment decision, and deploy/Sandbox smoke.

## Workload / PR boundary

- Slice boundary: webhook alias and dispatch only.
- Review workload: small/medium; code changes are limited to app routing, inbound dispatch boundaries, and focused tests.
