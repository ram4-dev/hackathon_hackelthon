# Apply Progress — Backend Kapso outbound list and limits

## Status

Completed on 2026-06-06.

## Workload / PR boundary

- Slice: `backend-kapso-outbound-list-limits` only.
- Review forecast from `tasks.md`: small.
- Decision guard lines were not present in this slice's `tasks.md`; no workload blocker applied.
- PR boundary: outbound Kapso client surface and focused tests only.

## Completed tasks

- Added/formalized outbound client surface with `sendText`, `sendButtons`, `sendList`, and existing `sendTemplate` compatibility.
- Truncated outbound interactive buttons to the first 3 items before calling Kapso SDK/API.
- Added `sendList` via Kapso SDK/API `sendInteractiveList` support.
- Truncated list rows to the first 10 items before sending.
- Preserved caller-provided list row `id`, `title`, and optional `description` values.
- Updated console fallback client with `sendList`.
- Added focused tests for button truncation, list truncation, payload shape, and fallback compatibility.
- Updated existing onboarding test fake outbound to satisfy the expanded interface.

## Files changed

- `src/kapso/client.ts`
- `src/kapso/consoleClient.ts`
- `src/kapso/client.test.ts`
- `src/domain/onboarding.test.ts`
- `openspec/changes/backend-kapso-outbound-list-limits/tasks.md`
- `openspec/changes/backend-kapso-outbound-list-limits/apply-progress.md`

## TDD Cycle Evidence

| Cycle | RED | GREEN | REFACTOR / validation |
| --- | --- | --- | --- |
| Outbound limits/list support | Added `src/kapso/client.test.ts`; `npm test -- src/kapso/client.test.ts` failed because `sendButtons` passed 4 buttons to SDK validation and `sendList` was missing on real/fallback clients. | Implemented button truncation, `sendList`, SDK message injection for focused tests, and fallback `sendList`; focused test passed: 3/3. | Ran full `npm test` and `npm run typecheck`; typecheck initially exposed existing fake outbound missing `sendList`, then passed after updating the fake. |

## Test commands run

- `npm test -- src/kapso/client.test.ts` — failed as expected for RED, then passed after implementation.
- `npm test` — passed: 10 test files, 23 tests.
- `npm run typecheck` — initially failed because `src/domain/onboarding.test.ts` fake `OutboundClient` lacked `sendList`; passed after updating the fake.

## Deviations from design

- Used a small injectable `KapsoMessages` dependency in `KapsoClient` to support focused fake-SDK tests without mocking the package module globally. Production behavior still constructs `WhatsAppClient` and uses `messages.sendInteractiveList`.
- `sendList` uses default WhatsApp list button text `Ver opciones` because the approved public helper signature is `sendList(to, body, rows)` and does not include a button-label parameter.

## Remaining tasks

- None for this slice.
- Live Kapso Sandbox validation remains out of scope for this slice and belongs to `backend-deploy-sandbox-smoke`.
