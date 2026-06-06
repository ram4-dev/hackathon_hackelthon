# Apply Progress — Backend deterministic import buttons

## Status

Applied on 2026-06-06.

## Completed tasks

- Added `src/domain/importMode.ts` for import-mode staging, LISTO handling, deterministic import extraction, and confirm/cancel button side effects.
- Added deterministic stub extraction: one pending `med` priority task per non-empty staged item, no inferred members.
- Routed known senders in conversation mode `import` through the import handler before the generic text/echo handler.
- Added a default button dispatcher factory that handles `confirm_import:<batchId>` and `cancel_import:<batchId>` before falling back to unhandled-button logging.
- Confirm flow resolves tenant from sender phone, applies the pending batch, creates tasks/members through Markdown storage, clears staging via `applyImportBatch`, marks the batch applied, transitions the sender to `active`, and sends confirmation text.
- Cancel flow resolves tenant from sender phone, marks the pending batch cancelled, preserves staging, creates no tasks, and sends cancellation acknowledgement.
- Preserved the injectable `ButtonDispatcher` and text handler seams used by tests and prior slices.

## Files changed

- `src/domain/importMode.ts`
- `src/domain/importMode.test.ts`
- `src/domain/buttonRouter.ts`
- `src/domain/processInboundMessage.ts`
- `openspec/changes/backend-deterministic-import-buttons/tasks.md`
- `openspec/changes/backend-deterministic-import-buttons/apply-progress.md`

## TDD Cycle Evidence

| Cycle | RED | GREEN | Refactor / note |
| --- | --- | --- | --- |
| Import mode behavior | Added `src/domain/importMode.test.ts` covering staging/no premature tasks, LISTO pending batch/buttons, confirm side effects/state, cancel preservation/no tasks. Focused run failed: 4 tests failed because import mode and default import button routing were not implemented. | Implemented `importMode.ts`, default button dispatcher, and process routing. `npm test -- src/domain/importMode.test.ts src/domain/processInboundMessage.test.ts` passed: 2 files / 6 tests. | Kept extraction as an injectable boundary with deterministic stub fallback. |
| Full validation | N/A | `npm test` passed: 12 files / 35 tests. `npm run typecheck` passed. `git diff --check` passed. | No schema change was needed; existing pending batch and staging storage methods were sufficient. |

## Test commands run

- `npm test -- src/domain/importMode.test.ts` — failed as expected during RED: 1 file / 4 failing tests.
- `npm test -- src/domain/importMode.test.ts src/domain/processInboundMessage.test.ts` — passed, 2 files / 6 tests.
- `npm test` — passed, 12 files / 35 tests.
- `npm run typecheck` — passed.
- `git diff --check` — passed.

## Deviations from design

- The stub extractor intentionally does not infer members. This follows the task guidance to avoid unsafe inference until the ML extraction slice lands.
- Cancel keeps the sender in `import` mode; only successful confirm transitions to `active`, matching the acceptance criteria.

## Remaining tasks

- None for this slice.
- Later slices still own SPEC-00 assignment approval decision and deploy/Sandbox smoke.

## Workload / PR boundary

- Slice boundary: deterministic import-mode staging and import confirmation/cancel buttons only.
- Review workload: medium; changes are localized to domain routing/tests and reuse existing Markdown storage.
