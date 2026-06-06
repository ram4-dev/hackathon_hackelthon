# Tasks — Kapso NGO WhatsApp task agent with Markdown storage

> SSoT update: this broad task list is reference-only for backend implementation. Use `docs/spec-backend-ssot.md` and the six `openspec/changes/backend-*` slices for current backend work.

## Delivery strategy

- User preflight choice: single PR default, no review line limit.
- Still keep commits/work units logically separated: scaffold → storage → webhook → domain flows → AI → README/tests.
- No Postgres/ORM/migrations in this change.

## Review workload forecast

Expected implementation size: medium-large hackathon build.

Risk areas:

- Markdown parsing/writing edge cases.
- Webhook raw-body signature handling.
- Tenant context leakage into AI tools.
- Import confirmation accidentally persisting before user confirmation.

Mitigation:

- Keep boundaries strict.
- Add focused tests for signature, idempotency, tenant resolution, import confirmation, and tool context injection.

## Task list

### T0 — Project scaffold

- [ ] Initialize Node.js + TypeScript project if absent.
- [ ] Add package scripts:
  - `dev`
  - `build`
  - `typecheck`
  - `test`
- [ ] Add core dependencies:
  - Hono or selected HTTP framework
  - `ai`
  - selected provider package (`@ai-sdk/openai` or `@ai-sdk/anthropic`)
  - `zod`
  - Kapso WhatsApp SDK if available (`@kapso/whatsapp-cloud-api`) or REST wrapper
- [ ] Add `.env.example` with required variables and no secrets.
- [ ] Add `src/` structure from design.

Exit gate:

- [ ] `npm run typecheck` or equivalent runs.
- [ ] Empty server can start locally.

Depends on: none.

### T1 — Markdown storage primitives

- [ ] Implement `src/storage/ids.ts`.
- [ ] Implement Markdown table read/write helpers.
- [ ] Implement pipe/newline escaping for table cells.
- [ ] Implement heading-block append/read helpers for staging and batches.
- [ ] Implement a simple async write mutex.
- [ ] Create `data/.gitkeep` and ensure runtime creates missing directories.

Exit gate:

- [ ] Unit tests cover table round-trip and section block append/read.

Depends on: T0.

### T2 — App storage repositories

- [ ] Implement organization/member repositories.
- [ ] Implement task repository.
- [ ] Implement import staging repository.
- [ ] Implement conversation state repository.
- [ ] Implement pending batch repository.
- [ ] Implement reminder repository.
- [ ] Implement processed webhook/idempotency repository.

Exit gate:

- [ ] Tests can create an org with admin, find member by phone, create/list tasks, and mark webhook processed.

Depends on: T1.

### T3 — Kapso signature verification and outbound client

- [ ] Implement `src/kapso/verifyWebhook.ts` using HMAC SHA256 over raw body.
- [ ] Use timing-safe comparison and handle malformed signatures safely.
- [ ] Implement `src/kapso/client.ts` with:
  - `sendText(to, body)`
  - `sendButtons(to, bodyText, buttons)`
  - template placeholder method for reminders
- [ ] Keep API keys only in env.

Exit gate:

- [ ] Tests verify valid/invalid signatures.
- [ ] Client can be mocked in domain tests.

Depends on: T0.

### T4 — Kapso message normalization

- [ ] Implement `src/kapso/normalizeMessage.ts`.
- [ ] Extract sender from `message.from || conversation.phone_number`.
- [ ] Use audio `message.kapso.transcript.text` first.
- [ ] Use `message.kapso.content` fallback.
- [ ] Parse interactive button/list replies into deterministic IDs.
- [ ] Preserve `message.id`, source type and media ref.

Exit gate:

- [ ] Fixture tests cover text, audio transcript, media content and interactive button payloads.

Depends on: T0.

### T5 — Webhook endpoint and in-process queue

- [ ] Implement `src/server.ts` with `POST /webhook`.
- [ ] Read raw body before parsing JSON.
- [ ] Reject invalid signatures.
- [ ] Ignore unsupported events with `200`.
- [ ] Deduplicate by `X-Idempotency-Key || message.id`.
- [ ] Return `200` before async processing.
- [ ] Implement `src/jobs/queue.ts` as in-process async queue.

Exit gate:

- [ ] Tests cover invalid signature, duplicate delivery, and fast accepted path.

Depends on: T2, T3, T4.

### T6 — Tenant resolution and state machine skeleton

- [ ] Implement `src/domain/tenant.ts`.
- [ ] Normalize phone consistently.
- [ ] Resolve `phone → member → org` on every message.
- [ ] Implement `src/domain/stateMachine.ts` router.
- [ ] Route known members to `active` by default.
- [ ] Route unknown senders to `onboarding`.
- [ ] Preserve `import` state after org creation for admin.

Exit gate:

- [ ] Tests prove no global tenant is used and two phones route independently.

Depends on: T2, T4.

### T7 — Onboarding mode

- [ ] Implement create NGO flow.
- [ ] Parse `Quiero registrar mi ONG`.
- [ ] Ask for NGO name if missing.
- [ ] Create org, invite code and admin member.
- [ ] Send invite link.
- [ ] Move admin to `import` mode.
- [ ] Implement join flow from `UNIRME <invite_code>`.
- [ ] Ask for missing name/role if needed.
- [ ] Move joined member to `active` mode.
- [ ] Handle invalid invite codes.

Exit gate:

- [ ] Demo fixture can create org and join second phone.

Depends on: T6, T3.

### T8 — Import staging and deterministic confirmations

- [ ] Implement import handler fast path: non-`LISTO` stages item and replies `✓ recibido`.
- [ ] Ensure staging does not create tasks.
- [ ] Handle interactive IDs before LLM routing:
  - `confirm_import:<batchId>`
  - `cancel_import:<batchId>`
- [ ] Implement confirm batch persistence.
- [ ] Implement cancel behavior preserving raw staging.
- [ ] Move admin to `active` after successful confirm.

Exit gate:

- [ ] Tests prove tasks are not persisted before confirm and are persisted after confirm.

Depends on: T6, T7.

### T9 — AI model factory and system prompt

- [ ] Implement `src/ai/model.ts` provider factory.
- [ ] Support env-based provider/model selection.
- [ ] Implement `src/ai/systemPrompt.ts` using the approved system prompt.
- [ ] Verify installed AI SDK docs/API before coding final calls.

Exit gate:

- [ ] Typecheck passes with selected provider.

Depends on: T0.

### T10 — Active AI SDK tools

- [ ] Implement `src/ai/tools.ts` active tools:
  - `createTask`
  - `listTasks`
  - `assignTask`
  - `completeTask`
  - `setReminder`
  - `registerMember`
- [ ] Define each tool with `tool()` and Zod `inputSchema`.
- [ ] Inject `orgId` and `actorPhone` through server-side closures.
- [ ] Ensure model cannot override trusted context.
- [ ] Implement conservative assignee matching.
- [ ] Implement active handler with `generateText` and `stopWhen`.

Exit gate:

- [ ] Tests/mock prove tool calls write only to resolved org.
- [ ] Active demo can create/list/assign/complete a task.

Depends on: T6, T9.

### T11 — Structured import extraction

- [ ] Implement `src/ai/importExtraction.ts`.
- [ ] Define Zod schema for tasks and inferred members.
- [ ] Use current supported structured output API:
  - preferred `generateText + Output.object`
  - fallback `generateObject` if installed version supports it better
- [ ] Dedupe tasks by normalized title.
- [ ] Resolve assignees against known members conservatively.
- [ ] Generate pending batch summary.

Exit gate:

- [ ] Fixture extraction output is transformed into a pending batch.
- [ ] Missing assignee/date stays empty.

Depends on: T8, T9.

### T12 — Reminder skeleton

- [ ] Implement `src/jobs/reminders.ts` interval worker.
- [ ] Append reminder jobs from `setReminder`.
- [ ] Send free-form text when 24h window is open.
- [ ] Mark as template-required when outside window and no template env is configured.
- [ ] Document template setup as TODO.

Exit gate:

- [ ] Reminder job can be scheduled and marked sent/blocked in local demo.

Depends on: T10.

### T13 — README demo flow

- [ ] Document setup:
  - env vars
  - install
  - dev server
  - exposing webhook locally if needed
- [ ] Document Kapso webhook configuration.
- [ ] Include demo script:
  - create NGO
  - send audio/text dump
  - `LISTO`
  - confirm tasks
  - list/assign/complete
- [ ] Explain Markdown storage files for judges.
- [ ] Note limitations: concurrency, templates, OCR/PDF quality.

Exit gate:

- [ ] A teammate can run the demo from README without reading the implementation.

Depends on: T5, T7, T8, T10, T11.

### T14 — End-to-end validation

- [ ] Add webhook payload fixtures from Kapso docs.
- [ ] Add a local script or test that simulates:
  - onboarding create
  - import stage
  - finalize pending batch
  - confirm batch
  - active list/complete
- [ ] Run typecheck and tests.
- [ ] Record known demo limitations.

Exit gate:

- [ ] Typecheck passes.
- [ ] Tests pass.
- [ ] Demo script succeeds locally with mocked Kapso/AI where needed.

Depends on: T13.

## Suggested implementation sequence

```txt
T0 → T1 → T2
      ├→ T3 → T5
      ├→ T4 → T6 → T7 → T8
      └→ T9 → T10 → T11 → T12
all → T13 → T14
```

## Parallelization notes

If multiple teammates work in parallel:

- Person A: T0–T2 storage foundation.
- Person B: T3–T5 Kapso/webhook once T0 exists.
- Person C: T9–T11 AI tools/extraction after storage interfaces stabilize.
- Person D: T13 README/demo and fixtures, then T14 validation.

Hard reconciliation point: T6 state machine needs storage and normalization contracts stable.
