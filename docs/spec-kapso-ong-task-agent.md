# Spec — WhatsApp task agent for NGOs (Kapso + AI SDK, Markdown storage)

## 1. Goal

Build a hackathon-ready WhatsApp agent that helps NGOs consolidate scattered work from chats, audio transcripts and files into clear tasks, entirely inside WhatsApp.

For this version there is **one shared WhatsApp number for all NGOs**. Tenant identity is resolved **on every inbound message** from the sender phone number. The app must never rely on a global/current tenant.

## 2. Scope for the quick version

### In scope

- Node.js + TypeScript runtime.
- Kapso webhook endpoint: `POST /webhook`.
- Kapso webhook signature verification.
- Idempotent inbound processing.
- Tenant resolution per message from sender phone.
- State machine: `onboarding`, `import`, `active`.
- AI SDK tool calling for conversational actions.
- Structured task extraction for the import flow.
- Kapso outbound messages: text and interactive buttons.
- Markdown/file-based storage instead of Postgres.
- README demo flow.

### Out of scope for hackathon

- Postgres, Drizzle, Prisma or migrations.
- Production-grade concurrent writes.
- Multi-number routing.
- Full OCR/PDF extraction quality.
- Approved Meta template setup. The code should leave this as configuration TODO.
- Admin dashboards.

## 3. Key product flows

### 3.1 Onboarding

A new phone starts in `onboarding` unless it already belongs to a member.

Supported entry messages:

- Create NGO: `Quiero registrar mi ONG`
- Join NGO: `UNIRME ABC123`

Create flow:

1. Ask for NGO name if missing.
2. Create organization with short `invite_code`.
3. Register sender as first admin member.
4. Return invite link ready to forward.
5. Move conversation state to `import`.

Join flow:

1. Parse invite code.
2. Ask for name/role if missing.
3. Register sender as member of that organization.
4. Move conversation state to `active`.

### 3.2 Import / initial brain dump

The admin can send text, voice notes, screenshots, PDFs or documents.

Each inbound item is staged and acknowledged with only:

```txt
✓ recibido
```

When the admin sends `LISTO`:

1. Load all staged markdown entries for the resolved `orgId`.
2. Extract proposed tasks and inferred members with structured AI output.
3. Dedupe tasks by normalized title.
4. Resolve assignees approximately against known members.
5. Present a batch summary using text plus buttons:
   - `confirm_import:<batchId>`
   - `cancel_import:<batchId>`
6. Persist tasks/members only after explicit confirmation.
7. Clear staging.
8. Move state to `active`.

### 3.3 Active mode

One message should map to one operation whenever possible:

- Create task.
- List tasks.
- Assign task.
- Complete task.
- Set reminder.

The LLM chooses tools, but the server injects trusted context (`orgId`, `actorPhone`) into tool `execute` functions. The model must never provide or override tenant context.

## 4. Kapso integration notes

Based on Kapso docs:

- Incoming WhatsApp messages arrive as `whatsapp.message.received`.
- Payloads include `message`, `conversation`, and top-level `phone_number_id`.
- `message.kapso` is message-scoped and may include:
  - `content`: text representation of text/media/transcripts.
  - `transcript.text`: audio transcript.
  - `media_data.url`: temporary media URL.
  - `processing_status`.
- Do not assume `phone_number`, `from`, `to` or `wa_id` always exist. Prefer `message.from` for sender when present and fallback to `conversation.phone_number`.
- Verify `X-Webhook-Signature` using HMAC SHA256 over the raw payload and timing-safe compare.
- Return `200` quickly and process heavy work asynchronously.
- Use `X-Idempotency-Key` when present, with `message.id` as fallback.

## 5. Markdown storage design

This replaces Postgres for speed. The storage layer exposes repository-like functions so it can be swapped later.

```txt
data/
  orgs/
    <orgId>/
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

### 5.1 `org.md`

```md
---
id: org_abc123
name: Fundación Ejemplo
invite_code: ABC123
created_at: 2026-06-06T12:00:00.000Z
---
```

### 5.2 `members.md`

Markdown table:

```md
| id    | phone         | name | role  | created_at               |
| ----- | ------------- | ---- | ----- | ------------------------ |
| mem_1 | 5491111111111 | Ana  | admin | 2026-06-06T12:00:00.000Z |
```

Phone must be globally unique across `phone-to-member.md`.

### 5.3 `tasks.md`

```md
| id     | title             | assignee_member_id | due_date   | priority | status | source | created_at               |
| ------ | ----------------- | ------------------ | ---------- | -------- | ------ | ------ | ------------------------ |
| task_1 | Llamar a donantes | mem_1              | 2026-06-10 | high     | open   | import | 2026-06-06T12:05:00.000Z |
```

Allowed values:

- `priority`: `low`, `med`, `high`
- `status`: `open`, `done`

### 5.4 `import-staging.md`

Append-only sections:

````md
## item_stg_1

- source_type: audio
- media_ref: wamid.xxx
- created_at: 2026-06-06T12:03:00.000Z

```text
Transcript or normalized Kapso content here.
```
````

````

### 5.5 `conversation-states.md`

```md
| phone | org_id | mode | step | scratch_json | updated_at |
| --- | --- | --- | --- | --- | --- |
| 5491111111111 | org_abc123 | import | collecting | {} | 2026-06-06T12:04:00.000Z |
````

### 5.6 `processed-webhooks.md`

```md
| key      | message_id | processed_at             |
| -------- | ---------- | ------------------------ |
| idem_123 | wamid.123  | 2026-06-06T12:00:02.000Z |
```

Check this before queueing work.

## 6. Processing algorithm

```txt
POST /webhook
  read raw body
  verify X-Webhook-Signature
  parse payload
  if event != whatsapp.message.received: return 200
  idempotencyKey = X-Idempotency-Key || message.id
  if already processed: return 200
  record processed key
  return 200 quickly
  enqueue processInbound(payload)

processInbound(payload)
  from = message.from || conversation.phone_number
  normalized = normalizeMessage(message)
  member = findMemberByPhone(from)
  state = loadConversationState(from)

  if member exists:
    orgId = member.org_id
    mode = state.mode if compatible else active
  else:
    orgId = state.org_id || null
    mode = state.mode || onboarding

  route to handler(mode)
```

## 7. Message normalization

```txt
normalizeMessage(message)
  if message.type == audio:
    return message.kapso.transcript.text || message.kapso.content || "[audio sin transcripción]"

  if message.type in image/document/video:
    if message.kapso.content exists:
      return message.kapso.content
    else if message.kapso.media_data.url exists:
      download now with Kapso auth and extract text best-effort
    else:
      stage as pending media reference

  if message.type == interactive:
    return selected button/list id + title

  default:
    return message.kapso.content || message.text.body || ""
```

For the hackathon, `message.kapso.content` is the primary input. OCR/PDF parsing is optional fallback.

## 8. AI SDK usage

Use current AI SDK tool definitions with `tool()` and Zod `inputSchema`.

Example pattern:

```ts
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";

const tools = {
  createTask: tool({
    description: "Create a task for the current NGO.",
    inputSchema: z.object({
      title: z.string(),
      assignee: z.string().optional(),
      dueDate: z.string().nullable().optional(),
      priority: z.enum(["low", "med", "high"]).default("med"),
    }),
    execute: async (input) =>
      taskRepo.createTask({
        orgId, // injected by server closure
        actorPhone, // injected by server closure
        ...input,
      }),
  }),
};

const result = await generateText({
  model,
  system: SYSTEM_PROMPT,
  prompt: userMessage,
  tools,
  stopWhen: stepCountIs(5),
});
```

### Structured extraction note

The original prompt asks for `generateObject`. Current AI SDK docs recommend structured output via `generateText` + `Output.object()` in newer versions, while `generateObject` may be deprecated depending on installed version. For this implementation:

- Preferred: `generateText({ output: Output.object({ schema }) })`.
- Compatibility fallback: `generateObject({ schema })` if the installed AI SDK version supports it and the team wants to keep the original prompt wording.

Schema:

```ts
const importExtractionSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      assignee: z.string().nullable(),
      dueDate: z.string().nullable(),
      priority: z.enum(["low", "med", "high"]).default("med"),
    }),
  ),
  members: z.array(
    z.object({
      name: z.string(),
      role: z.string().nullable(),
    }),
  ),
});
```

## 9. Tools to implement

Each tool is exposed to the LLM with only user-provided fields. `orgId` and `actorPhone` are injected in server code.

| Tool                                                    | Mode       | Behavior                                                                      |
| ------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| `createOrg({ name })`                                   | onboarding | Create org, invite code, admin member, state -> import.                       |
| `joinOrg({ inviteCode, name, role })`                   | onboarding | Register phone into existing org, state -> active.                            |
| `registerMember({ name, phone, role })`                 | active     | Admin-only add member.                                                        |
| `stageImportItem({ rawText, sourceType })`              | import     | Append to `import-staging.md`.                                                |
| `finalizeImport()`                                      | import     | Extract batch and write `pending-batches.md`; do not persist final tasks yet. |
| `confirmImport({ batchId })`                            | import     | Persist batch tasks/members and clear staging.                                |
| `createTask({ title, assignee?, dueDate?, priority? })` | active     | Create one task.                                                              |
| `listTasks({ filter })`                                 | active     | Return filtered tasks.                                                        |
| `assignTask({ taskId, memberPhoneOrName })`             | active     | Assign only on clear member match.                                            |
| `completeTask({ taskId })`                              | active     | Mark task done.                                                               |
| `setReminder({ taskId, when })`                         | active     | Append reminder job; template fallback TODO outside 24h.                      |

## 10. Human confirmation rules

Require explicit confirmation before:

- Persisting import batches.
- Creating many tasks at once.
- Destructive or irreversible operations.

Interactive button IDs should be deterministic and parseable:

```txt
confirm_import:<batchId>
cancel_import:<batchId>
complete_task:<taskId>
```

## 11. Outbound Kapso messages

Use the TypeScript SDK when possible:

```ts
import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";

const client = new WhatsAppClient({
  baseUrl: "https://api.kapso.ai/meta/whatsapp",
  kapsoApiKey: process.env.KAPSO_API_KEY!,
});

await client.messages.sendInteractiveButtons({
  phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID!,
  to: phone,
  bodyText: "¿Confirmás estas tareas?",
  buttons: [
    { id: `confirm_import:${batchId}`, title: "Confirmar" },
    { id: `cancel_import:${batchId}`, title: "Cancelar" },
  ],
});
```

Secrets are environment variables only. Never commit real API keys or webhook secrets.

## 12. System prompt

Use this as `SYSTEM_PROMPT` for `generateText`:

```txt
Sos el asistente de gestión de tareas de una ONG, operando por WhatsApp. Tu
trabajo es convertir información dispersa (texto, audios transcriptos, archivos)
en tareas claras y accionables, y ayudar al equipo a gestionarlas.

Contexto que recibís en cada turno:
- La organización (org_id) y el miembro que escribe ya están resueltos por el
  sistema. NO preguntes por ellos ni los inventes.
- El modo actual: onboarding, import (carga inicial) o active.

Comportamiento:
- Sé breve y concreto. Es WhatsApp: mensajes cortos, sin formato pesado.
- Usá las tools disponibles para todo lo que toque datos (crear/listar/asignar/
  completar tareas, dar de alta miembros, etc.). No describas la acción: hacela
  con la tool.
- En modo import: tu objetivo es que el admin vuelque TODO sin fricción. Acusá
  recibo de cada ítem con un "✓ recibido" breve y nada más. Solo cuando el
  usuario diga LISTO, llamá a finalizeImport y presentá el resultado para
  confirmar.
- Al extraer tareas: cada tarea necesita un título claro y conciso. Si no hay
  responsable o fecha explícitos, dejalos vacíos; NUNCA los inventes.
- Antes de escribir muchas tareas de una o de hacer algo irreversible, mostrá un
  resumen y pedí confirmación.
- Para asignar, resolvé la persona contra el roster real. Si no hay match claro,
  dejá la tarea sin asignar y avisá.
- Si te mandan un audio, ya viene transcripto: trabajá sobre el texto.
- Tono cálido y directo, en el idioma del usuario. No prometas recordatorios que
  no podés cumplir: si una notificación cae fuera de la ventana de 24h, depende
  de plantillas aprobadas.

Nunca expongas IDs internos, detalles técnicos ni el funcionamiento del sistema
al usuario. Hablá en términos de tareas, personas y fechas.
```

## 13. Acceptance criteria

- Webhook rejects invalid Kapso signatures.
- Duplicate webhook delivery is processed once.
- Every inbound message resolves tenant from sender phone.
- Unknown sender enters onboarding.
- Created NGO returns invite code and WhatsApp invite link.
- Import mode stores each item in markdown staging and replies `✓ recibido`.
- `LISTO` produces a deduped proposed task batch.
- Batch is not persisted until user taps confirm.
- Active mode can create/list/assign/complete tasks through AI SDK tools.
- Audio uses `message.kapso.transcript.text` or `message.kapso.content`.
- Markdown files remain human-readable after demo operations.

## 14. Suggested implementation files

```txt
src/
  server.ts
  kapso/
    verifyWebhook.ts
    client.ts
    normalizeMessage.ts
  storage/
    markdownStore.ts
    markdownTables.ts
    ids.ts
  domain/
    tenant.ts
    stateMachine.ts
    onboarding.ts
    importMode.ts
    activeMode.ts
  ai/
    model.ts
    systemPrompt.ts
    tools.ts
    importExtraction.ts
  jobs/
    queue.ts
    reminders.ts
README.md
data/
  .gitkeep
```

## 15. Demo script

1. User sends: `Quiero registrar mi ONG`.
2. Agent asks for NGO name if needed.
3. Agent creates org and returns invite link.
4. Admin sends audio brain dump.
5. Agent replies: `✓ recibido`.
6. Admin sends another text/file dump.
7. Agent replies: `✓ recibido`.
8. Admin sends: `LISTO`.
9. Agent returns proposed tasks with confirm/cancel buttons.
10. Admin confirms.
11. Agent saves tasks and switches to active mode.
12. Admin sends: `listar abiertas`.
13. Agent lists open tasks.
14. Admin sends: `asigná la tarea 2 a Ana`.
15. Agent assigns if Ana is a clear member match.
16. Admin sends: `completar tarea 2`.
17. Agent marks done.

## 16. Known risks

- Markdown storage is not safe for high concurrency; acceptable for hackathon demo.
- Approximate member matching must be conservative.
- Kapso media URLs are temporary; download immediately if later processing is needed.
- Outside the 24h WhatsApp window, proactive reminders require approved templates.
- Current AI SDK structured output API may differ by installed version; verify locally before implementation.
