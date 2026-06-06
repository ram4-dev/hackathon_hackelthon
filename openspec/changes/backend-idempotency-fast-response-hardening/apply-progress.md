# Apply Progress — Backend idempotency and fast-response hardening

## Status

Applied on 2026-06-06.

## Completed tasks

- Added fallback deduplication coverage where duplicate deliveries have the same `message.id` and no `X-Idempotency-Key`.
- Strengthened header-key deduplication coverage to prove only one processing job is enqueued for duplicate deliveries.
- Added concurrent duplicate coverage for both `X-Idempotency-Key` and fallback `message.id` paths.
- Added fast-response coverage showing the webhook responds `200 OK` while an async domain processor path remains pending.
- Used the existing app-level injectable `enqueue` seam to observe processing without changing production queue behavior.
- Documented chosen retry semantics in `src/app.ts`: webhook deliveries are atomically marked accepted before scheduling work and are non-retryable in the hackathon implementation to avoid duplicate side effects.
- Added `MarkdownStore.tryMarkWebhookProcessed` to atomically claim accepted deliveries within the existing Markdown write mutex while preserving the `processed-webhooks.md` schema.

## Files changed

- `src/app.ts`
- `src/app.test.ts`
- `src/storage/markdownStore.ts`
- `openspec/changes/backend-idempotency-fast-response-hardening/tasks.md`
- `openspec/changes/backend-idempotency-fast-response-hardening/apply-progress.md`

## TDD Cycle Evidence

| Cycle                       | RED                                                                                                                                                                                                                                                              | GREEN                                                                                                                                                                                     | Refactor / note                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Dedupe characterization     | Added focused tests for header-key enqueue suppression, fallback `message.id` dedupe, and fast response. Focused run passed immediately because the previous webhook slice had already introduced the required enqueue seam and mark-before-processing behavior. | `npm test -- src/app.test.ts` passed: 1 file / 6 tests.                                                                                                                                   | Added an explicit retry-semantics comment in `src/app.ts`.                                                              |
| Concurrent dedupe hardening | Fresh review reproduced a race where two parallel duplicate deliveries could both pass check-then-mark and enqueue.                                                                                                                                              | Replaced check-then-mark with atomic `tryMarkWebhookProcessed` and added concurrent duplicate tests for header and fallback keys. `npm test -- src/app.test.ts` passed: 1 file / 8 tests. | The processed-webhooks Markdown schema stayed unchanged; the claim operation now runs inside the existing update mutex. |
| Full validation             | N/A                                                                                                                                                                                                                                                              | `npm test` passed: 11 files / 31 tests. `npm run typecheck` passed. `git diff --check` passed.                                                                                            | Fresh re-review found no blockers.                                                                                      |

## Test commands run

- `npm test -- src/app.test.ts` — passed, 1 test file / 8 tests.
- `npm test` — passed, 11 test files / 31 tests.
- `npm run typecheck` — passed.
- `git diff --check` — passed.

## Deviations from design

- No Markdown status-tracking schema was added. The approved hackathon behavior is atomic mark-before-processing/non-retryable accepted delivery, documented in code. Async failures are logged by the existing queue and duplicate retries remain ignored.

## Remaining tasks

- None for this slice.
- Later slices still own deterministic import side effects, assignment decision, and deploy/Sandbox smoke.

## Workload / PR boundary

- Slice boundary: idempotency/fast-response hardening only.
- Review workload: small to medium; this slice adds focused tests and an atomic processed-webhook claim while preserving the existing storage schema.
