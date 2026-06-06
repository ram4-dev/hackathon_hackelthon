# Proposal — Kapso NGO WhatsApp task agent with Markdown storage

## Status

Proposed.

## Source

This proposal is promoted from:

- `docs/spec-kapso-ong-task-agent.md`

## Why

NGOs with limited human resources currently manage operational tasks across WhatsApp chats, audio notes, screenshots, PDFs and informal messages. Important work gets lost because there is no lightweight task system that fits the team's actual communication channel.

For the hackathon demo, the product needs to prove that a shared WhatsApp agent can:

1. receive messy task information inside WhatsApp,
2. resolve the correct NGO from the sender phone on every message,
3. turn the information into actionable tasks,
4. let the team list, assign and complete tasks without leaving WhatsApp.

The original idea included Postgres. For speed, this SDD change intentionally replaces Postgres/ORM/migrations with human-readable Markdown/file storage while preserving clean repository boundaries so storage can be swapped later.

## What changes

Build a Node.js + TypeScript WhatsApp agent using Kapso and the Vercel AI SDK.

### Inbound and outbound WhatsApp

- Add `POST /webhook` for Kapso `whatsapp.message.received` events.
- Verify Kapso `X-Webhook-Signature` with HMAC SHA256 over the raw payload.
- Deduplicate webhook delivery with `X-Idempotency-Key` when present and `message.id` as fallback.
- Return `200` quickly and process heavier work asynchronously.
- Send replies through Kapso API/SDK, not through the webhook response.
- Support text replies and interactive button messages.

### Tenant resolution

- Resolve tenant on every inbound message from sender phone.
- Use `message.from` when present, with `conversation.phone_number` as fallback.
- Map phone → member → organization from storage.
- Never keep or trust a global/current tenant.
- Never accept `orgId` from the model as trusted input.

### Conversation state machine

Implement three modes:

1. `onboarding`
   - Create a new NGO from `Quiero registrar mi ONG`.
   - Join an existing NGO from `UNIRME <invite_code>`.
   - Generate invite codes and invitation links.
2. `import`
   - Stage every incoming item and reply only `✓ recibido`.
   - On `LISTO`, extract proposed tasks and members from all staged content.
   - Require human confirmation before persisting the batch.
3. `active`
   - Create, list, assign, complete and remind tasks through AI SDK tools.

### Media normalization

- Use `message.kapso.content` as the primary normalized text input.
- For audio, prefer `message.kapso.transcript.text`.
- For image/document/video, use `message.kapso.content` first; optionally download `message.kapso.media_data.url` immediately for fallback extraction.
- Treat OCR/PDF parsing as best-effort for the hackathon.

### AI SDK behavior

- Use Vercel AI SDK `generateText` with `tools` for conversational operations.
- Define tools with `tool()` and Zod `inputSchema`.
- Inject `orgId` and `actorPhone` inside server-side tool closures.
- Use structured extraction for import finalization with the proposed Zod schema.
- Prefer current structured-output API if the installed AI SDK recommends it; keep `generateObject` as compatibility fallback if available.

### Markdown storage

Create a file-backed storage adapter under `data/`:

```txt
data/
  orgs/<orgId>/
    org.md
    members.md
    tasks.md
    import-staging.md
    conversation-states.md
    pending-batches.md
    reminders.md
  indexes/
    phone-to-member.md
    invite-codes.md
    processed-webhooks.md
```

This is a hackathon storage choice, not a production guarantee. The domain layer should depend on repository functions, not directly on Markdown parsing everywhere.

## Non-goals

- Do not add Postgres, Drizzle, Prisma or DB migrations in this change.
- Do not build a dashboard.
- Do not implement production-grade concurrent writes.
- Do not implement full-quality OCR/PDF extraction.
- Do not configure approved Meta templates yet; leave proactive out-of-window reminders as a documented TODO.
- Do not support multiple WhatsApp numbers as tenant identity.

## Impact

### User impact

- NGO admins can register an organization and invite team members from WhatsApp.
- Admins can brain-dump initial work and confirm extracted tasks in batch.
- Team members can manage tasks by sending natural messages.

### Technical impact

- Adds a clear webhook-processing pipeline.
- Adds a storage abstraction backed by Markdown files.
- Adds AI SDK tool definitions and import extraction.
- Adds Kapso client wrapper for text and interactive messages.
- Establishes tenant-resolution and idempotency as architectural invariants.

### Review impact

Preflight choice: user selected single-PR default and no review line limit. Even so, implementation should still keep logical work units separated internally to reduce merge/debug risk during the hackathon.

## Acceptance criteria

- Invalid Kapso signatures are rejected.
- Duplicate webhook deliveries are processed once.
- Every inbound message resolves tenant from sender phone.
- Unknown phones enter onboarding.
- Creating an NGO returns an invite code and invite link.
- Import mode stages each item and replies `✓ recibido`.
- Sending `LISTO` produces a deduped proposed task batch.
- Batch tasks/members are not persisted until explicit confirmation.
- Active mode can create/list/assign/complete tasks through AI SDK tools.
- Audio messages use Kapso transcript/content instead of custom STT by default.
- Markdown storage remains readable after demo operations.

## Open questions for spec/design

1. Which HTTP framework should be used: Express, Hono or Fastify?
2. Which model/provider should be used for the demo: Anthropic, OpenAI or AI Gateway?
3. How strict should Markdown write locking be for the demo?
4. How should approximate member matching behave when two names are similar?
5. Should reminders be simulated in demo mode, or should a real scheduler be wired?
