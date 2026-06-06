# Design — Kapso NGO WhatsApp task agent with Markdown storage

## 1. Design goals

- Demo-ready implementation with minimal moving parts.
- Correct multi-tenant behavior despite one shared WhatsApp number.
- Clear boundaries so Markdown storage can later be replaced by Postgres.
- AI is constrained to tool calls for data changes; server owns trusted context.
- Webhook response stays fast; outbound replies go through Kapso API/SDK.

## 2. Major decisions

### D1 — HTTP framework: Hono

Use **Hono** on Node.js for the hackathon server.

Why:

- Small TypeScript-first API.
- Easy raw body handling for signature verification.
- Lightweight enough for a single webhook service.

Fallback: Express is acceptable if package availability becomes an issue, but keep the same handler boundaries.

### D2 — Storage: Markdown adapter behind repositories

Use Markdown files under `data/` for hackathon speed, but do not let domain logic parse Markdown directly.

All reads/writes go through `MarkdownStore` repository methods:

- `getMemberByPhone(phone)`
- `createOrgWithAdmin(input)`
- `joinOrg(input)`
- `getConversationState(phone)`
- `setConversationState(state)`
- `appendImportItem(input)`
- `getImportItems(orgId)`
- `savePendingBatch(batch)`
- `applyImportBatch(batchId)`
- `createTask(input)`
- `listTasks(input)`
- `assignTask(input)`
- `completeTask(input)`
- `appendReminder(input)`
- `isWebhookProcessed(key)`
- `markWebhookProcessed(input)`

### D3 — File write locking

Use a simple per-process async mutex around Markdown writes.

This is enough for a local hackathon demo. It is not a production concurrency solution. The storage adapter should make this limitation explicit.

### D4 — AI provider

Implement `src/ai/model.ts` as a small provider factory.

Default for demo:

- `AI_PROVIDER=openai`
- `OPENAI_API_KEY=...`
- model ID from `AI_MODEL`, e.g. `gpt-4.1-mini` or current available equivalent.

Allow `AI_PROVIDER=anthropic` if the team has that key. Do not hardcode model IDs deep in handlers.

### D5 — Structured extraction API

Use current installed AI SDK docs as source of truth during implementation.

Preferred design:

- `generateText` + `Output.object({ schema })` for structured extraction if supported by installed `ai` version.

Compatibility fallback:

- `generateObject({ schema })` if available and simpler with the installed version.

The extraction interface returned to domain code must be stable either way.

## 3. Architecture overview

```txt
Kapso Webhook
    |
    v
src/server.ts
    |
    +--> kapso/verifyWebhook.ts
    +--> jobs/queue.ts -----------------------------+
                                                      |
                                                      v
                                              processInboundMessage
                                                      |
                                                      +--> kapso/normalizeMessage.ts
                                                      +--> domain/tenant.ts
                                                      +--> domain/stateMachine.ts
                                                              |
                                                              +--> onboarding handler
                                                              +--> import handler
                                                              +--> active handler
                                                                      |
                                                                      +--> ai/tools.ts
                                                                      +--> ai/importExtraction.ts
                                                                      +--> storage/markdownStore.ts
                                                                      +--> kapso/client.ts
```

## 4. Runtime flow

### 4.1 Webhook handler

`src/server.ts` owns only HTTP concerns:

1. Read raw request body.
2. Verify `X-Webhook-Signature`.
3. Parse JSON.
4. Ignore non-`whatsapp.message.received` events with `200`.
5. Compute idempotency key:
   - `X-Idempotency-Key`
   - fallback `payload.message.id`
6. If already processed, return `200`.
7. Mark key as accepted/processed.
8. Return `200` quickly.
9. Enqueue `processInboundMessage(payload)`.

For the hackathon, `jobs/queue.ts` can be an in-process `setImmediate` queue with error logging. Keep the function shape so it can later become BullMQ/SQS/etc.

### 4.2 Tenant resolution

`domain/tenant.ts`:

```ts
type TenantContext =
  | {
      kind: "known";
      phone: string;
      orgId: string;
      memberId: string;
      role: string;
    }
  | { kind: "unknown"; phone: string; state?: ConversationState };
```

Algorithm:

1. Extract phone with `message.from || conversation.phone_number`.
2. Normalize phone to digits-only plus country prefix where possible.
3. Lookup `phone-to-member.md`.
4. If found, load member/org and return `known`.
5. Else load `conversation-states.md` and return `unknown`.

No handler may accept `orgId` from the LLM or request payload as trusted tenant context.

### 4.3 State routing

`domain/stateMachine.ts`:

```ts
type Mode = "onboarding" | "import" | "active";

async function routeInbound(ctx: InboundContext): Promise<void> {
  const tenant = await resolveTenant(ctx.from);
  const mode = resolveMode(tenant, state);

  switch (mode) {
    case "onboarding":
      return handleOnboarding(ctx, tenant);
    case "import":
      return handleImport(ctx, tenant);
    case "active":
      return handleActive(ctx, tenant);
  }
}
```

Mode resolution:

- Known member defaults to `active` unless state says `import` for an admin after org creation.
- Unknown sender defaults to `onboarding`.
- State is keyed by phone, not by global server context.

## 5. Data model in TypeScript

```ts
type Organization = {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: string;
};

type Member = {
  id: string;
  orgId: string;
  phone: string;
  name: string;
  role: string;
  createdAt: string;
};

type Task = {
  id: string;
  orgId: string;
  title: string;
  assigneeMemberId: string | null;
  dueDate: string | null;
  priority: "low" | "med" | "high";
  status: "open" | "done";
  source: "import" | "chat";
  createdAt: string;
};

type ImportStagingItem = {
  id: string;
  orgId: string;
  sourceType:
    | "text"
    | "audio"
    | "image"
    | "document"
    | "video"
    | "interactive"
    | "unknown";
  rawText: string;
  mediaRef: string | null;
  createdAt: string;
};

type ConversationState = {
  phone: string;
  orgId: string | null;
  mode: "onboarding" | "import" | "active";
  step: string;
  scratch: Record<string, unknown>;
  updatedAt: string;
};
```

## 6. Markdown file contracts

Keep all Markdown generated by the storage layer stable and simple.

### Tables

Use Markdown tables for compact row collections:

- `members.md`
- `tasks.md`
- `conversation-states.md`
- `processed-webhooks.md`
- indexes

Escape pipe characters in cell values.

### Section blocks

Use heading-delimited blocks for raw text:

- `import-staging.md`
- `pending-batches.md`

Raw text goes inside fenced code blocks to avoid table escaping problems.

### IDs

Use short prefixed IDs:

- `org_<random>`
- `mem_<random>`
- `task_<random>`
- `stg_<random>`
- `batch_<random>`

For demo, `crypto.randomUUID()` shortened is acceptable.

## 7. Kapso modules

### 7.1 `verifyWebhook.ts`

```ts
function verifyKapsoSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean;
```

Rules:

- HMAC SHA256.
- Timing-safe comparison.
- Compare equal-length buffers only; return false on malformed input.
- Never log secrets or raw signatures.

### 7.2 `normalizeMessage.ts`

```ts
type NormalizedMessage = {
  messageId: string;
  from: string;
  type: string;
  text: string;
  sourceType: ImportStagingItem["sourceType"];
  mediaRef: string | null;
  interactiveId?: string;
};
```

Priority:

1. Audio transcript: `message.kapso.transcript.text`.
2. Kapso content: `message.kapso.content`.
3. Text body: `message.text.body`.
4. Interactive button/list ID + title.
5. Media URL fallback for immediate download if needed.

### 7.3 `client.ts`

Wrap Kapso SDK/API:

- `sendText(to, body)`
- `sendButtons(to, bodyText, buttons)`
- `sendTemplate(to, template)` for reminder fallback TODO

The rest of the app should not import the Kapso SDK directly.

## 8. AI modules

### 8.1 Tool construction

`src/ai/tools.ts` exports tool factory functions:

```ts
function buildActiveTools(ctx: ToolContext): ToolSet;
function buildOnboardingTools(ctx: ToolContext): ToolSet;
function buildImportTools(ctx: ToolContext): ToolSet;
```

`ToolContext` includes trusted server context:

```ts
type ToolContext = {
  orgId: string | null;
  actorPhone: string;
  actorMemberId?: string;
  store: AppStore;
  kapso: KapsoClient;
};
```

Tools expose only model-fillable fields in `inputSchema`. They close over `ToolContext` for trusted values.

### 8.2 Active conversation

`handleActive` calls `generateText` with:

- `system: SYSTEM_PROMPT`
- prompt containing the normalized user message plus safe context:
  - mode
  - member display name/role
  - not raw internal IDs unless needed by tools
- active tools
- `stopWhen: stepCountIs(5)`

### 8.3 Import behavior

Fast path:

- If text is not `LISTO`, do not call LLM; stage directly and send `✓ recibido`.

Finalize path:

- On `LISTO`, call `extractImportBatch(stagedItems)`.
- Store pending batch.
- Send confirmation buttons.

This avoids wasting tokens and enforces the product behavior.

## 9. Human confirmation model

`pending-batches.md` stores extracted tasks/members before persistence.

Interactive IDs:

```txt
confirm_import:<batchId>
cancel_import:<batchId>
complete_task:<taskId>
```

Button handling happens before LLM routing when an inbound message is `interactive` and the ID matches a known command. This keeps confirmations deterministic.

## 10. Reminder model

For hackathon:

- Store reminders in `reminders.md`.
- Run a simple interval worker every minute.
- If due and inside WhatsApp 24h window, send text.
- If outside window, attempt configured template if `KAPSO_REMINDER_TEMPLATE_NAME` exists.
- Else mark reminder as `blocked_template_required` and surface this in logs/demo README.

Window approximation:

- Use `conversation.kapso.last_inbound_at` when present from recent webhook context.
- Also store last inbound per member in state if needed.

## 11. Module boundaries

```txt
server.ts
  may import: kapso/*, jobs/queue

jobs/queue.ts
  may import: domain/stateMachine

domain/*
  may import: storage interfaces, kapso client interface, ai handlers
  must not import: HTTP framework

ai/*
  may import: ai SDK, zod, storage interfaces
  must not import: Hono/server request objects

storage/*
  may import: fs/path/crypto only
  must not import: ai SDK or Kapso SDK

kapso/*
  may import: crypto, Kapso SDK/fetch
  must not import: domain-specific storage parsing
```

## 12. Error handling

- Signature failure: `401`, no processing.
- Duplicate webhook: `200`, no processing.
- Missing sender phone: log and ignore with `200`.
- AI extraction failure: send a short message asking the admin to retry `LISTO`; keep staging intact.
- Markdown write failure: log error; send apology if safe and avoid partial confirmation claims.
- Tool execution failure: return a short user-safe failure message; do not expose stack traces.

## 13. Environment variables

```txt
KAPSO_API_KEY=
KAPSO_WEBHOOK_SECRET=
KAPSO_PHONE_NUMBER_ID=
AI_PROVIDER=openai
AI_MODEL=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
KAPSO_REMINDER_TEMPLATE_NAME=
DATA_DIR=./data
```

Only variables needed by the chosen provider must be set.

## 14. Testing strategy

Minimum tests for implementation:

1. `verifyKapsoSignature` accepts valid and rejects invalid signatures.
2. Webhook idempotency prevents duplicate processing.
3. Tenant resolution maps phone → member → org every time.
4. Unknown sender routes to onboarding.
5. Import item stages without creating tasks.
6. `LISTO` creates pending batch, not persisted tasks.
7. Confirm import persists tasks and clears staging.
8. Active tools inject trusted `orgId`; model input cannot override it.
9. Audio normalization uses transcript first.
10. Markdown table escaping round-trips simple values.

## 15. Implementation order

1. Project scaffold and env example.
2. Markdown storage primitives and repositories.
3. Kapso signature verification and client wrapper.
4. Webhook handler with idempotency and queue.
5. Tenant resolution and state machine skeleton.
6. Onboarding mode.
7. Import staging and confirmation flow.
8. AI SDK active tools.
9. Structured import extraction.
10. Reminder skeleton.
11. README demo script.
12. Tests and local fixtures.
