# Tasks — Backend deterministic import buttons

## Delivery strategy

Implement this as a domain-level import mode module with injected storage, outbound client, and extraction boundary. Use a deterministic stub extractor until the ML import extraction spec is ready.

## Review workload forecast

Medium. Likely touches `src/domain/processInboundMessage.ts`, a new `src/domain/importMode.ts`, a new or shared `src/domain/buttonRouter.ts`, existing `src/storage/markdownStore.ts` only if helper gaps appear, and domain tests.

## Task list

- [x] Create an import-mode handler for known admin/member state `import`.
- [x] For non-`LISTO` text/content in import mode, append a staging item to Markdown storage.
- [x] Reply with a concise acknowledgement equivalent to `✓ recibido`.
- [x] Prove no task is created while staging raw import items.
- [x] On `LISTO`, read staged items and call an extractor boundary.
- [x] Provide a deterministic stub extractor if the ML structured extractor is not available yet.
- [x] Store extracted proposals as a pending batch.
- [x] Send a summary with `confirm_import:<batchId>` and `cancel_import:<batchId>` buttons.
- [x] Implement deterministic handling for `confirm_import:<batchId>`.
- [x] Implement deterministic handling for `cancel_import:<batchId>`.
- [x] Transition the sender to `active` after successful confirm.
- [x] Preserve staged raw items on cancel unless explicitly cleared later.

## Exit gate

- [x] `npm test` passes.
- [x] `npm run typecheck` passes.
- [x] Tests prove staged import items do not create tasks before confirmation.
- [x] Tests prove confirm persists tasks/members, clears or marks staging as applied, and marks the batch applied.
- [x] Tests prove cancel does not persist tasks and preserves raw staging.

## Depends on

- `backend-webhook-dispatch-and-api-alias`.
- Existing Markdown storage for conversation states, import staging, pending batches, and tasks.
