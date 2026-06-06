# SPEC-00 · Contrato compartido y Constitución (Pulso)

> **SSoT update para Backend:** este documento queda como contrato histórico/reference-only para backend cuando contradice el baseline actual. La fuente de verdad backend vigente es `docs/spec-backend-ssot.md` y los cambios `openspec/changes/backend-*` listados ahí. En particular, no se debe agregar Postgres/Supabase ni el modelo `Assignment` sin aprobar primero la slice decision-gated correspondiente.

> **Esto es la fuente de verdad histórica.** Las tres specs de rol (Backend, Data, ML) implementan o consumen lo definido acá salvo supersesión explícita. Metodología: _Spec-Driven Development_ nivel **spec-anchored** — la spec manda, el código se valida contra los **criterios de aceptación** (que funcionan como _validation gates_). Workflow por spec: **Specify → Plan → Implement → Validate**.
>
> **Regla de oro del paralelismo:** nadie espera a nadie. Cada rol programa contra las **firmas** de abajo y **mockea** lo que aún no existe. La integración es trivial porque todos respetan el mismo contrato.

---

## 1. Constitución (reglas que no se rompen)

1. **La lógica vive en funciones deterministas; el LLM solo orquesta e interpreta lenguaje natural.** Nada de SQL ni decisiones de negocio "dentro" del prompt.
2. **Human-in-the-loop doble:** el coordinador decide _a quién_; la persona decide _si puede_. El agente nunca asigna solo.
3. **Nunca inventar números.** En el Balance de Impacto, solo se registra lo que responde la persona.
4. **Baja fricción:** lenguaje natural + botones/listas. Tope 4 preguntas por flujo, una por mensaje.
5. **Validación por contrato:** toda función respeta la firma y el shape de retorno de este documento. Si algo no alcanza, se cambia _acá primero_, no en cada lado.

---

## 2. Tipos compartidos (TypeScript)

```ts
export type TaskStatus =
  | "pendiente"
  | "propuesta"
  | "aprobada"
  | "en_curso"
  | "hecha"
  | "bloqueada";
export type AssignmentStatus =
  | "propuesta"
  | "aprobada_coord"
  | "aprobada"
  | "rechazada";
export type Capacity = "baja" | "media" | "alta";
export type Priority = "baja" | "media" | "alta";
export type TaskType =
  | "charla"
  | "informe"
  | "difusion"
  | "atencion"
  | "gestion"
  | "recaudacion"
  | "otro";

export interface Person {
  id: string;
  wa_phone: string;
  name: string;
  role?: string;
  skills: string[];
  capacity: Capacity;
  is_coordinator: boolean;
  timezone: string;
  active: boolean;
  created_at: string;
}
export interface Task {
  id: string;
  title: string;
  description?: string;
  task_type?: TaskType;
  priority: Priority;
  required_skills: string[];
  effort: number;
  deadline?: string /*ISO*/;
  status: TaskStatus;
  created_by?: string;
  created_at: string;
}
export interface Assignment {
  id: string;
  task_id: string;
  person_id: string;
  status: AssignmentStatus;
  reason?: string;
  coord_id?: string;
  coord_decision_at?: string;
  rejected_by?: "coordinador" | "persona";
  proposed_at: string;
  responded_at?: string;
}
export interface ImpactReport {
  id: string;
  task_id: string;
  reported_by?: string;
  task_type?: TaskType;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  outcome?: string;
  headline?: string;
  raw_answers: Record<string, string>;
  summary?: string;
  created_at: string;
}
export interface Knowledge {
  id: string;
  content: string;
  kind: "politica" | "proceso" | "hecho" | "inferido";
  tags: string[];
  source?: string;
  created_at: string;
}
export interface Session {
  wa_phone: string;
  state: string | null;
  context: Record<string, unknown>;
  updated_at: string;
}
export interface Message {
  wa_phone: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}
export interface PersonLoad {
  id: string;
  name: string;
  capacity: Capacity;
  active_effort: number;
  active_tasks: number;
}

export interface Board {
  columns: Record<TaskStatus, Task[]>;
  pending_approval: Assignment[];
  alerts: Task[]; // deadline < now + 24h y no 'hecha'
  recent_impact: { headline?: string; created_at: string }[];
}
```

---

## 3. Esquema canónico (Postgres / Supabase)

Owner: **Data**. Es el de la v4 del PRD §10 + `sessions`/`messages` del RFC §6 + idempotencia. Reproducido acá como contrato:

```sql
create table people (
  id uuid primary key default gen_random_uuid(),
  wa_phone text unique not null, name text not null, role text,
  skills text[] default '{}', capacity text default 'media',
  is_coordinator boolean default false,
  timezone text default 'America/Argentina/Buenos_Aires',
  active boolean default true, created_at timestamptz default now()
);
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text, task_type text,
  priority text default 'media', required_skills text[] default '{}',
  effort int default 1, deadline timestamptz, status text default 'pendiente',
  created_by uuid references people(id), created_at timestamptz default now()
);
create table assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  person_id uuid references people(id),
  status text default 'propuesta', reason text,
  coord_id uuid references people(id), coord_decision_at timestamptz,
  rejected_by text, proposed_at timestamptz default now(), responded_at timestamptz
);
create table knowledge (
  id uuid primary key default gen_random_uuid(),
  content text not null, kind text default 'hecho',
  tags text[] default '{}', source text, created_at timestamptz default now()
);
create table impact_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  reported_by uuid references people(id), task_type text,
  inputs jsonb default '{}', outputs jsonb default '{}',
  outcome text, headline text, raw_answers jsonb default '{}',
  summary text, created_at timestamptz default now()
);
create table sessions (
  wa_phone text primary key, state text,
  context jsonb default '{}', updated_at timestamptz default now()
);
create table messages (
  id bigserial primary key, wa_phone text not null,
  role text not null, content text not null, created_at timestamptz default now()
);
create table processed_messages ( message_id text primary key, at timestamptz default now() );

create view person_load as
select p.id, p.name, p.capacity,
       coalesce(sum(t.effort) filter (where t.status in ('aprobada','en_curso')), 0) as active_effort,
       count(t.id)            filter (where t.status in ('aprobada','en_curso')) as active_tasks
from people p
left join assignments a on a.person_id = p.id and a.status = 'aprobada'
left join tasks t       on t.id = a.task_id
group by p.id, p.name, p.capacity;
```

> RLS **off** en el MVP (deuda técnica explícita).

---

## 4. Contrato de funciones (las firmas que todos respetan)

### 4.1 Capa de datos — `db.*` (owner: **Data**)

```ts
// Personas
db.upsertPerson(input: { wa_phone: string; name?: string; role?: string; skills?: string[]; capacity?: Capacity; is_coordinator?: boolean }): Promise<Person>
db.getPersonByPhone(wa_phone: string): Promise<Person | null>
db.listCoordinators(): Promise<Person[]>
db.listPeople(filter?: { active?: boolean }): Promise<Person[]>   // ML: candidatos para scoring (con skills; readPersonLoad no los trae)
// Tareas
db.createTask(input: { title: string; description?: string; task_type?: TaskType; priority?: Priority; required_skills?: string[]; effort?: number; deadline?: string; created_by?: string }): Promise<Task>
db.listTasks(filter?: { status?: TaskStatus; person_id?: string }): Promise<Task[]>
db.setTaskStatus(task_id: string, status: TaskStatus): Promise<Task>
db.getBoard(): Promise<Board>
// Asignaciones
db.insertAssignment(input: { task_id: string; person_id: string; reason?: string }): Promise<Assignment>
db.getAssignment(id: string): Promise<Assignment | null>
db.setAssignmentStatus(id: string, status: AssignmentStatus, patch?: { coord_id?: string; rejected_by?: 'coordinador'|'persona' }): Promise<Assignment>
db.readPersonLoad(): Promise<PersonLoad[]>
// Impacto
db.insertImpactReport(input: Omit<ImpactReport,'id'|'created_at'>): Promise<ImpactReport>
db.getImpactReport(task_id: string): Promise<ImpactReport | null>
db.getOrgImpact(filter?: { task_type?: TaskType }): Promise<{ headlines: string[]; by_type: Record<string, number> }>
// Conocimiento (LLM Wiki: se carga entero, sin búsqueda)
db.loadKnowledge(): Promise<Knowledge[]>
db.addKnowledge(input: { content: string; kind?: Knowledge['kind']; tags?: string[]; source?: string }): Promise<Knowledge>
db.updateKnowledge(id: string, patch: Partial<Pick<Knowledge,'content'|'tags'|'kind'>>): Promise<Knowledge>
// Sesiones / historial / idempotencia
db.getSession(wa_phone: string): Promise<Session | null>
db.setSession(wa_phone: string, state: string | null, context: Record<string, unknown>): Promise<Session>
db.clearSession(wa_phone: string): Promise<void>
db.loadHistory(wa_phone: string, n?: number): Promise<Message[]>
db.appendHistory(wa_phone: string, role: 'user'|'assistant', content: string): Promise<void>
db.wasProcessed(message_id: string): Promise<boolean>
db.markProcessed(message_id: string): Promise<void>
```

### 4.2 Transporte WhatsApp — Kapso (owner: **Backend**)

```ts
sendText(to: string, body: string): Promise<void>
sendButtons(to: string, body: string, buttons: { id: string; title: string }[]): Promise<void>   // ≤ 3
sendList(to: string, body: string, rows: { id: string; title: string; description?: string }[]): Promise<void>  // ≤ 10
```

### 4.3 Orquestación determinista desde botones (owner: **Backend**)

```ts
handleButton(waPhone: string, id: string): Promise<void>
coordinatorRespond(assignment_id: string, decision: 'aprobar'|'reasignar'|'rechazar', new_person_id?: string): Promise<void>
respondToAssignment(assignment_id: string, decision: 'aprobada'|'rechazada'): Promise<void>
```

### 4.4 El agente (owner: **ML**)

```ts
runAgent(waPhone: string, text: string): Promise<void>                          // entrypoint para texto libre
proposeAssignment(task_id: string): Promise<{ assignment: Assignment; candidate: Person; reason: string }>
scoreCandidates(task: Task, load: PersonLoad[], people: Person[]): { candidate: Person; reason: string }
startImpactFlow(waPhone: string, task_id: string): Promise<void>                // markTaskDone + 1ª pregunta
```

---

## 5. Convención de IDs de botón (contrato Backend ↔ ML ↔ WhatsApp)

| ID del botón                    | Quién lo manda                 | Qué dispara (en `handleButton`)        |
| ------------------------------- | ------------------------------ | -------------------------------------- |
| `coord_approve:<assignment_id>` | `proposeAssignment` (ML)       | `coordinatorRespond(id, 'aprobar')`    |
| `coord_reject:<assignment_id>`  | `proposeAssignment` (ML)       | `coordinatorRespond(id, 'rechazar')`   |
| `approve:<assignment_id>`       | `coordinatorRespond` (Backend) | `respondToAssignment(id, 'aprobada')`  |
| `reject:<assignment_id>`        | `coordinatorRespond` (Backend) | `respondToAssignment(id, 'rechazada')` |
| `done:<task_id>`                | tablero / "mis tareas"         | `startImpactFlow(waPhone, task_id)`    |
| `cap:baja\|media\|alta`         | onboarding (ML)                 | (sin handler) → reenviar a `runAgent`  |

> **Botones fuera de esta tabla** (p. ej. `cap:*` del onboarding): `handleButton` no los reconoce y los **reenvía a `runAgent(waPhone, id)`** para que el agente los interprete como texto. Regla: prefijo conocido → acción determinista; prefijo desconocido → al agente.

---

## 6. Estados de sesión (contrato Data ↔ ML)

- `null` → conversación normal (el agente decide intención).
- `'onboarding'` → `context = { step, name?, role?, skills?, capacity? }`.
- `'impact:<task_id>'` → `context = { task_type, questions: string[], answers: Record<string,string>, i: number }`.

---

## 7. Variables de entorno

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=        # SOLO server-side
KAPSO_API_KEY=
KAPSO_PHONE_NUMBER_ID=
KAPSO_WEBHOOK_SECRET=             # si Kapso lo provee
ANTHROPIC_API_KEY=                # o el provider del AI SDK que usen
LLM_MODEL=                        # string del modelo
```

---

## 8. Tabla de ownership (quién hace qué)

| Área                                                                                                                                                                                                                          | Owner       | Consume (mockeable)                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------- |
| Esquema, `person_load`, **todas las `db.*`**, seed, tipos                                                                                                                                                                     | **Data**    | —                                                          |
| `sendText/Buttons/List`, `/api/webhook`, `handleButton`, `coordinatorRespond`, `respondToAssignment`, idempotencia, deploy, Sandbox                                                                                           | **Backend** | `db.*` (Data), `proposeAssignment`, `startImpactFlow` (ML) |
| `runAgent`, `buildSystemPrompt`, loop del agente, flujos NL (onboarding, alta de tarea, consultas), `proposeAssignment`, `scoreCandidates`, `inferImpactQuestions`, `recordImpactReport`, `inferKnowledge`, `startImpactFlow` | **ML**      | `db.*` (Data), `sendText/Buttons/List` (Backend)           |

> Las referencias cruzadas (Backend↔ML) se resuelven por las firmas de §4: cada lado mockea al otro hasta integrar.

---

## 9. Orden global (Bloque 0, juntos, ~20 min)

1. Pegar este archivo en el repo como `SPEC-00-contracts.md` y crear `types.ts` con la §2.
2. Crear `lib/mocks.ts` con implementaciones triviales de `db.*` (datos en memoria) y de `sendText/Buttons/List` (que hagan `console.log`). **Esto es lo que desbloquea el trabajo en paralelo.**
3. Crear proyectos Vercel + Supabase y cargar las env vars.
4. A partir de acá, cada rol abre su `SPEC-<rol>.md` y arranca. Integración al final contra las firmas reales.
