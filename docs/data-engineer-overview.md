# Data Engineer — What We Built

> Branch: `data-engineer` · Stack: TypeScript + Supabase Cloud · Status: **Complete**

---

## What is this?

This layer is the **data backbone** of Pulso — a WhatsApp-based coordination agent for NGOs. It sits between Supabase (the database) and every other layer (the AI agent, backend, ML scoring). Nobody talks to Postgres directly; they call `db.*` functions from this module.

Think of it as a typed API over the database. If you want to create a task, you call `db.createTask(...)`. If you want to know who is overloaded, you call `db.readPersonLoad()`. The shape of every response is guaranteed by TypeScript types.

---

## High-Level Architecture

```
WhatsApp
   │
   ▼
Backend (webhook handler)
   │  uses db.wasProcessed / db.markProcessed   ← dedup
   │  uses db.getSession / db.setSession         ← conversation state
   │  uses db.appendHistory / db.loadHistory     ← message memory
   │
   ▼
ML Agent (AI reasoning layer)
   │  uses db.getPersonByPhone / db.listCoordinators
   │  uses db.createTask / db.listTasks / db.getBoard
   │  uses db.insertAssignment / db.setAssignmentStatus
   │  uses db.loadKnowledge / db.addKnowledge
   │  uses db.insertImpactReport / db.getOrgImpact
   │
   ▼
┌─────────────────────────────────────┐
│          src/lib/db.ts              │  ← this module
│  24 typed async functions           │
│  server-side Supabase client only   │
└─────────────────────────────────────┘
   │
   ▼
Supabase Cloud  (project: tjpfstdhxsgwyejlosfq)
   │
   ├── people
   ├── tasks
   ├── assignments
   ├── knowledge
   ├── impact_reports
   ├── sessions
   ├── messages
   ├── processed_messages
   └── VIEW: person_load
```

---

## Database Schema

```
people
  id uuid PK
  wa_phone text UNIQUE          ← natural key, used everywhere
  name text
  role text
  skills text[]
  capacity text                 ← 'baja' | 'media' | 'alta'
  is_coordinator boolean
  timezone text
  active boolean
  created_at timestamptz

tasks
  id uuid PK
  title text
  description text
  task_type text                ← charla | informe | difusion | atencion | gestion | recaudacion | otro
  priority text                 ← 'baja' | 'media' | 'alta'
  required_skills text[]
  effort int                    ← story points (1 = small, 3 = big)
  deadline timestamptz
  status text                   ← see lifecycle below
  created_by uuid → people.id
  created_at timestamptz

assignments
  id uuid PK
  task_id uuid → tasks.id
  person_id uuid → people.id
  status text                   ← see double-approval below
  reason text
  coord_id uuid → people.id    ← who approved at coord step
  coord_decision_at timestamptz
  rejected_by text             ← 'coordinador' | 'persona'
  proposed_at timestamptz
  responded_at timestamptz

knowledge
  id uuid PK
  content text                 ← free-text fact/policy/process
  kind text                    ← 'hecho' | 'politica' | 'proceso'
  tags text[]
  source text
  created_at timestamptz

impact_reports
  id uuid PK
  task_id uuid → tasks.id
  reported_by uuid → people.id
  task_type text
  inputs jsonb                 ← what went in (resources, time, effort)
  outputs jsonb                ← what came out (beneficiaries, events)
  outcome text
  headline text                ← one-line result for the board
  raw_answers jsonb            ← original answers from the volunteer
  summary text
  created_at timestamptz

sessions
  wa_phone text PK             ← one session per phone number
  state text                   ← current conversation state name
  context jsonb                ← arbitrary state data
  updated_at timestamptz

messages
  id bigserial PK
  wa_phone text
  role text                    ← 'user' | 'assistant' | 'system'
  content text
  created_at timestamptz

processed_messages
  message_id text PK           ← WhatsApp message ID
  at timestamptz

VIEW: person_load
  id, name, capacity
  active_effort int            ← sum of effort for approved/in-progress tasks
  active_tasks int             ← count of those tasks
```

---

## Task Lifecycle

```
                ┌──────────────┐
    created ──► │  pendiente   │
                └──────┬───────┘
                       │ ML proposes assignment
                       ▼
                ┌──────────────┐
                │   propuesta  │ ◄── visible in getBoard().pending_approval
                └──────┬───────┘
                       │ coordinator approves
                       ▼
                ┌──────────────┐
                │   aprobada   │ ◄── volunteer can see it in listTasks({person_id})
                └──────┬───────┘
                       │ volunteer starts
                       ▼
                ┌──────────────┐
                │   en_curso   │
                └──────┬───────┘
                       │ finished
                       ▼
                ┌──────────────┐
                │    hecha     │ ◄── triggers impact report flow
                └──────────────┘

         (at any point)
                       │
                       ▼
                ┌──────────────┐
                │  bloqueada   │
                └──────────────┘
```

---

## Assignment Double-Approval Flow

Every task assignment goes through two checkpoints before the volunteer
is considered "officially assigned". This prevents surprises on both sides.

```
Agent creates assignment
         │
         ▼
   ┌───────────┐
   │ propuesta │  ← shows up in getBoard().pending_approval
   └─────┬─────┘
         │ Coordinator reviews
         ▼
┌─────────────────┐         ┌───────────────┐
│ aprobada_coord  │         │   rechazada   │ ← coord_decision_at set
│ (coord_id set)  │         │ (rejected_by= │
└────────┬────────┘         │ 'coordinador')│
         │ Volunteer accepts └───────────────┘
         ▼
   ┌───────────┐             ┌───────────────┐
   │  aprobada │             │   rechazada   │ ← responded_at set
   │(responded_│             │(rejected_by=  │
   │  at set)  │             │ 'persona')    │
   └───────────┘             └───────────────┘
```

---

## The `db` Module — All 24 Functions

### People (D3)
| Function | What it does |
|---|---|
| `upsertPerson(input)` | Create or update a volunteer/coordinator by `wa_phone`. Merge-semantics: only updates fields you pass. |
| `getPersonByPhone(wa_phone)` | Look up one person. Returns `null` if not found. |
| `listCoordinators()` | All active coordinators, ordered by join date. |

### Tasks + Board (D4)
| Function | What it does |
|---|---|
| `createTask(input)` | Create a task. Defaults: `priority='media'`, `effort=1`, `status='pendiente'`, `required_skills=[]`. |
| `listTasks(filter?)` | All tasks, or filtered by `status` and/or `person_id` (approved assignments only). |
| `setTaskStatus(task_id, status)` | Move a task to a new status. Validates the status before touching Supabase. |
| `getBoard()` | Full board: tasks grouped by all 6 statuses, deadline alerts (<24h), pending approvals, and last 5 impact headlines. |

### Assignments (D5)
| Function | What it does |
|---|---|
| `insertAssignment(input)` | Propose an assignment. Always starts as `propuesta`. |
| `getAssignment(id)` | Look up one assignment. Returns `null` if not found. |
| `setAssignmentStatus(id, status, opts?)` | Advance the approval flow. Enforces required fields per step. |
| `readPersonLoad()` | Read the `person_load` view: active effort and task count per person. |

### Impact Reports (D6)
| Function | What it does |
|---|---|
| `insertImpactReport(input)` | Record what happened after a task. JSONB fields default to `{}`. |
| `getImpactReport(task_id)` | Get the latest report for a task. Returns `null` if none. |
| `getOrgImpact()` | Org-wide rollup: `headlines[]` and `by_type` count per task type. No metric summing. |

### Knowledge (D7)
| Function | What it does |
|---|---|
| `loadKnowledge()` | Load the entire knowledge base (no filter, no pagination). Designed to be injected fully into LLM context. |
| `addKnowledge(input)` | Add a new fact/policy/process. Defaults: `kind='hecho'`, `tags=[]`. |
| `updateKnowledge(id, patch)` | Edit an existing entry in place. Used by ML for deduplication. Rejects empty patch. |

### Sessions + History + Idempotency (D8)
| Function | What it does |
|---|---|
| `getSession(wa_phone)` | Get conversation state for a phone number. Returns `null` if not started. |
| `setSession(wa_phone, state, context)` | Upsert conversation state. Always stamps `updated_at`. |
| `clearSession(wa_phone)` | Delete the session entirely. |
| `loadHistory(wa_phone, n=20)` | Last `n` messages in chronological order. |
| `appendHistory(wa_phone, role, content)` | Add one message to the history. |
| `wasProcessed(message_id)` | Check if a WhatsApp message ID was already handled. Returns `bool`. |
| `markProcessed(message_id)` | Mark a message as handled. Idempotent — safe to call twice. |

---

## Types at a Glance (`src/domain/types.ts`)

```
Domain values (string unions):
  Capacity          'baja' | 'media' | 'alta'
  TaskStatus        'pendiente' | 'propuesta' | 'aprobada' | 'en_curso' | 'hecha' | 'bloqueada'
  Priority          'baja' | 'media' | 'alta'
  TaskType          'charla' | 'informe' | 'difusion' | 'atencion' | 'gestion' | 'recaudacion' | 'otro'
  AssignmentStatus  'propuesta' | 'aprobada_coord' | 'aprobada' | 'rechazada'
  KnowledgeKind     'hecho' | 'politica' | 'proceso'
  MessageRole       'user' | 'assistant' | 'system'

Row shapes (interfaces):
  Person            → people table
  SpecTask          → tasks table
  Assignment        → assignments table
  ImpactReport      → impact_reports table
  ImpactReportSummary → slim view used by getBoard()
  KnowledgeEntry    → knowledge table
  Session           → sessions table
  Message           → messages table
  PersonLoad        → person_load VIEW

Composite:
  Board             { columns, pending_approval, alerts, recent_impact }
  OrgImpact         { headlines, by_type }
```

---

## What's Validated

| Spec | Unit tests | Live (Supabase Cloud) |
|---|---|---|
| D1 — Schema + view | via smoke SQL | ✅ Antigravity |
| D2 — Demo seed | via smoke SQL | ✅ Antigravity |
| D3 — People functions | 5 tests | ✅ Antigravity |
| D4 — Tasks + board | 9 tests | ✅ Antigravity |
| D5 — Assignments | 9 tests | ✅ Antigravity |
| D6 — Impact reports | 6 tests | ✅ Antigravity |
| D7 — Knowledge | 5 tests | ✅ Antigravity |
| D8 — Sessions / history / idempotency | 11 tests | ✅ Antigravity |
| **Total** | **64 tests** | **All specs live-verified** |

TypeScript typecheck: **clean** (0 errors).

---

## Key Design Decisions

**1. One module, one client.**
Everything lives in `src/lib/db.ts`. There is one server-side Supabase client (`SUPABASE_SERVICE_ROLE_KEY`). No client-side exposure, no multiple clients, no connection pooling complexity at MVP.

**2. `wa_phone` is the natural key for people.**
No auth, no sessions from a user perspective — the WhatsApp phone number is the identity. `upsertPerson` uses it as the conflict target.

**3. `listTasks({ person_id })` uses an inner join, not post-filter.**
A person's tasks are only those with an `aprobada` assignment. Proposals don't appear in "my tasks" — they live in `getBoard().pending_approval`. This distinction is enforced at the query level.

**4. `markProcessed` is idempotent.**
WhatsApp delivers webhooks at-least-once. The `processed_messages` table deduplicates retries. A duplicate insert is silently swallowed (Postgres error code `23505`).

**5. `loadKnowledge` has no filter.**
The knowledge base is small and meant to be fully injected into LLM context on every agent call. Filtering or paginating would break that pattern.

**6. `getBoard` fires 3 parallel queries.**
Tasks, pending assignments, and recent impact are fetched with `Promise.all`. No sequential waiting.

**7. Legacy POC types (`LegacyPriority`, `LegacyTaskStatus`) are kept.**
The old markdown-based storage layer (`markdownStore.ts`) predates SPEC-00 and uses `"low"|"med"|"high"` priorities and `"open"|"done"` statuses. These are preserved under `Legacy*` names so the old code compiles cleanly while SPEC-00 types take the unqualified names.

---

## How to Run

```bash
# Unit tests (no Supabase credentials needed)
npm test

# Typecheck
npm run typecheck

# Dev server (needs .env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
npm run dev
```

Required env variables:
```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

---

## Files Changed in This Branch

```
src/
  domain/types.ts          ← all SPEC-00 types + Legacy* POC types
  lib/db.ts                ← the entire db module (24 functions)
  lib/db.test.ts           ← 64 unit tests

docs/
  spec-d1-results.md       ← schema + view (Antigravity executed)
  spec-d2-results.md       ← demo seed (Antigravity executed)
  spec-d3-results.md       ← people functions
  spec-d4-results.md       ← tasks + board ✅ live
  spec-d5-results.md       ← assignments ✅ live
  spec-d6-results.md       ← impact reports ✅ live
  spec-d7-results.md       ← knowledge ✅ live
  spec-d8-results.md       ← sessions/history/idempotency ✅ live
  data-engineer-overview.md ← this file
```
