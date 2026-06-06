# SPEC-DATA · Capa de datos (Data Engineer)

> **Depende de:** SPEC-00 (contrato). **Provee:** esquema + `db.*` + seed + `types.ts`.
> **Consume:** nada en runtime — sos la base. Usás el **MCP de Supabase** en Claude Code para dev-time.
> Nivel: spec-anchored. Cada spec se valida contra sus **criterios de aceptación**.

---

## 0. Alcance

**Tuyo:** todo lo que toca Postgres y la forma de los datos. Las `db.*` de SPEC-00 §4.1, el esquema (§3), la vista `person_load`, el seed, y `types.ts`.
**NO es tuyo:** el agente, el scoring, el webhook, los envíos por WhatsApp. Vos exponés funciones tipadas; otros las llaman.

---

## 1. Cómo NO bloquear

- Sos la dependencia de los otros dos, así que **lo más urgente es publicar las firmas** (ya están en SPEC-00) y un **`lib/mocks.ts`** con `db.*` en memoria (lo arma el equipo en el Bloque 0). Con eso, Backend y ML trabajan sin tu base real.
- Vos podés desarrollar y validar **100 % en aislamiento**: esquema + seed + funciones + un script de smoke test. No necesitás ni el webhook ni el agente.
- **Contrato de retorno = ley.** Si una función necesita devolver algo más, se actualiza SPEC-00 primero.

---

## 2. Specs

### SPEC-D.1 — Esquema + vista
**Comportamiento:** crear en **Supabase Cloud** todas las tablas y la vista `person_load` de SPEC-00 §3. Usar el **MCP remoto de Supabase** en dev-time, no el MCP local.

**MCP target:**
- Servidor: `https://mcp.supabase.com/mcp`
- Si se conoce el proyecto, preferir: `https://mcp.supabase.com/mcp?project_ref=<SUPABASE_PROJECT_REF>`
- Features necesarias: `database` (migraciones + SQL). `docs` opcional.
- No usar `read_only=true` para esta spec, porque hay que aplicar migración.

**Delegación a Antigravity:** Codex no puede conectarse al MCP de Supabase desde esta sesión. Antigravity queda como agente ejecutor de SPEC-D.1 en Supabase Cloud.

Tasks para Antigravity:
- [ ] Autenticarse contra el MCP remoto de Supabase Cloud (`https://mcp.supabase.com/mcp`) con permisos de escritura sobre el proyecto correcto.
- [ ] Confirmar el `project_ref` antes de ejecutar cambios y, si es posible, usar el MCP scoping `?project_ref=<SUPABASE_PROJECT_REF>`.
- [ ] Aplicar la migración `001_spec_d1_schema` con el SQL de esta sección.
- [ ] Verificar que existen `people, tasks, assignments, knowledge, impact_reports, sessions, messages, processed_messages`.
- [ ] Ejecutar el smoke SQL de validación de esta sección.
- [ ] Confirmar explícitamente que `person_load.active_effort = 3` y `person_load.active_tasks = 1`.
- [ ] Ejecutar el rollback manual del smoke test (`delete from people where wa_phone = '5491100000000';`) después de capturar evidencia.
- [ ] Reportar evidencia mínima: proyecto usado, nombre/id de migración, output del smoke query, y confirmación de rollback.

Guardrails para Antigravity:
- No tocar seed: SPEC-D.2 empieza después.
- No crear enums Postgres: D.1 sigue el contrato `text` de SPEC-00.
- No activar RLS en el MVP.
- No cambiar el shape de tablas/vista sin actualizar primero SPEC-00.

**Migración requerida:** aplicar una migración única e idempotente para el MVP. Nombre sugerido: `001_spec_d1_schema`.

```sql
create extension if not exists pgcrypto;

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  wa_phone text unique not null,
  name text not null,
  role text,
  skills text[] default '{}',
  capacity text default 'media',
  is_coordinator boolean default false,
  timezone text default 'America/Argentina/Buenos_Aires',
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  task_type text,
  priority text default 'media',
  required_skills text[] default '{}',
  effort int default 1,
  deadline timestamptz,
  status text default 'pendiente',
  created_by uuid references people(id),
  created_at timestamptz default now()
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  person_id uuid references people(id),
  status text default 'propuesta',
  reason text,
  coord_id uuid references people(id),
  coord_decision_at timestamptz,
  rejected_by text,
  proposed_at timestamptz default now(),
  responded_at timestamptz
);

create table if not exists knowledge (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  kind text default 'hecho',
  tags text[] default '{}',
  source text,
  created_at timestamptz default now()
);

create table if not exists impact_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  reported_by uuid references people(id),
  task_type text,
  inputs jsonb default '{}',
  outputs jsonb default '{}',
  outcome text,
  headline text,
  raw_answers jsonb default '{}',
  summary text,
  created_at timestamptz default now()
);

create table if not exists sessions (
  wa_phone text primary key,
  state text,
  context jsonb default '{}',
  updated_at timestamptz default now()
);

create table if not exists messages (
  id bigserial primary key,
  wa_phone text not null,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists processed_messages (
  message_id text primary key,
  at timestamptz default now()
);

drop view if exists person_load;

create view person_load as
select p.id,
       p.name,
       p.capacity,
       coalesce(sum(t.effort) filter (where t.status in ('aprobada','en_curso')), 0) as active_effort,
       count(t.id) filter (where t.status in ('aprobada','en_curso')) as active_tasks
from people p
left join assignments a on a.person_id = p.id and a.status = 'aprobada'
left join tasks t on t.id = a.task_id
group by p.id, p.name, p.capacity;
```

**Notas de alcance:**
- RLS queda **off** para el MVP, como deuda técnica explícita de SPEC-00 §3.
- No crear enums Postgres en D.1: el contrato actual usa `text` y la validación fuerte queda en `types.ts`/`db.*`.
- No crear seed en D.1: eso empieza en SPEC-D.2.

**Criterios de aceptación:**
- [ ] Existen `people, tasks, assignments, knowledge, impact_reports, sessions, messages, processed_messages`.
- [ ] `person_load` devuelve `active_effort` y `active_tasks` correctos (suma `effort` de tareas `aprobada/en_curso` asignadas y aprobadas).
- [ ] Insert/select básico funciona en cada tabla.

**Validación:** correr este smoke SQL en Supabase Cloud y verificar que devuelve `active_effort = 3` y `active_tasks = 1` para la persona insertada.

```sql
with person as (
  insert into people (wa_phone, name, skills, capacity)
  values ('5491100000000', 'Smoke Data Engineer', array['datos'], 'media')
  on conflict (wa_phone) do update
    set name = excluded.name,
        skills = excluded.skills,
        capacity = excluded.capacity
  returning id
),
task as (
  insert into tasks (title, effort, status, created_by)
  select 'Smoke SPEC-D.1', 3, 'aprobada', id
  from person
  returning id
),
assignment as (
  insert into assignments (task_id, person_id, status)
  select task.id, person.id, 'aprobada'
  from task, person
  returning id
)
select pl.*
from person_load pl
join person p on p.id = pl.id;
```

**Rollback manual para el smoke test:**

```sql
delete from people where wa_phone = '5491100000000';
```

### SPEC-D.2 — Seed de demo
**Comportamiento:** poblar datos creíbles para la demo en Supabase Cloud, después de que SPEC-D.1 haya aplicado el esquema. El seed debe ser idempotente y mínimo: personas, knowledge y 1-2 tareas de ejemplo para que el tablero no arranque vacío.

**Precondición:** SPEC-D.1 aplicado y validado en el proyecto Supabase Cloud.

**MCP target:**
- Servidor: `https://mcp.supabase.com/mcp?project_ref=tjpfstdhxsgwyejlosfq`
- Features necesarias: `database`.
- No usar `read_only=true` para esta spec, porque hay que insertar seed.

**Delegación a Antigravity:** Codex no puede conectarse al MCP de Supabase desde esta sesión. Antigravity queda como agente ejecutor de SPEC-D.2 en Supabase Cloud.

Tasks para Antigravity:
- [ ] Confirmar que SPEC-D.1 ya existe en el proyecto `tjpfstdhxsgwyejlosfq`.
- [ ] Aplicar el seed `002_spec_d2_demo_seed` con el SQL de esta sección.
- [ ] Verificar que hay 4 personas activas y al menos 1 coordinador activo.
- [ ] Verificar que hay 5 filas de `knowledge` con `source='demo_seed_spec_d2'`.
- [ ] Verificar que hay 2 tareas demo creadas por la coordinadora seed.
- [ ] Verificar que hay 1 assignment `propuesta` para alimentar `getBoard.pending_approval`.
- [ ] Ejecutar las queries de validación y registrar evidencia en `docs/spec-d2-results.md`.

Guardrails para Antigravity:
- No tocar filas que no sean del demo seed.
- No cambiar el esquema: D.2 solo inserta datos.
- No implementar `db.*` todavía.
- No usar datos personales reales: teléfonos y nombres son ficticios para demo.
- Si el proyecto ya tiene seed del equipo, coordinar antes de borrar/resembrar filas demo.

**Seed requerido:** aplicar una migración/seed idempotente. Nombre sugerido: `002_spec_d2_demo_seed`.

```sql
begin;

delete from tasks t
using people p
where t.created_by = p.id
  and p.wa_phone = '5491100000001'
  and t.title in (
    'Preparar informe para donantes',
    'Organizar charla de derechos digitales'
  );

delete from knowledge
where source = 'demo_seed_spec_d2';

insert into people (wa_phone, name, role, skills, capacity, is_coordinator, timezone, active)
values
  ('5491100000001', 'Lucia Coordinadora', 'Coordinacion general', array['coordinacion','gestion','donantes'], 'alta', true, 'America/Argentina/Buenos_Aires', true),
  ('5491100000002', 'Ana Voluntaria', 'Comunicacion', array['redaccion','difusion','datos'], 'media', false, 'America/Argentina/Buenos_Aires', true),
  ('5491100000003', 'Bruno Tallerista', 'Formacion', array['facilitacion','comunidad','charlas'], 'baja', false, 'America/Argentina/Buenos_Aires', true),
  ('5491100000004', 'Carla Operaciones', 'Atencion territorial', array['logistica','atencion','relevamiento'], 'alta', false, 'America/Argentina/Buenos_Aires', true)
on conflict (wa_phone) do update
set name = excluded.name,
    role = excluded.role,
    skills = excluded.skills,
    capacity = excluded.capacity,
    is_coordinator = excluded.is_coordinator,
    timezone = excluded.timezone,
    active = excluded.active;

insert into knowledge (content, kind, tags, source)
values
  ('La ONG prioriza acciones de educacion, acompanamiento territorial y rendicion transparente a donantes.', 'hecho', array['ong','prioridades'], 'demo_seed_spec_d2'),
  ('Toda tarea que impacta a beneficiarios debe cerrarse con un balance de impacto cuantificado.', 'politica', array['impacto','cierre'], 'demo_seed_spec_d2'),
  ('Los informes para donantes deben incluir alcance, resultados concretos y proximo paso recomendado.', 'proceso', array['donantes','informes'], 'demo_seed_spec_d2'),
  ('Las charlas comunitarias se coordinan con al menos 72 horas de anticipacion y un responsable de materiales.', 'proceso', array['charlas','logistica'], 'demo_seed_spec_d2'),
  ('El equipo usa WhatsApp como canal operativo principal; las decisiones importantes quedan registradas por el agente.', 'hecho', array['whatsapp','operacion'], 'demo_seed_spec_d2');

with coord as (
  select id from people where wa_phone = '5491100000001'
),
ana as (
  select id from people where wa_phone = '5491100000002'
),
created_tasks as (
  insert into tasks (title, description, task_type, priority, required_skills, effort, deadline, status, created_by)
  select 'Preparar informe para donantes',
         'Armar un resumen de resultados del mes con datos de actividades y aprendizajes.',
         'informe',
         'alta',
         array['redaccion','datos'],
         3,
         now() + interval '2 hours',
         'pendiente',
         coord.id
  from coord
  union all
  select 'Organizar charla de derechos digitales',
         'Coordinar una charla comunitaria introductoria y preparar materiales de apoyo.',
         'charla',
         'media',
         array['facilitacion','comunidad'],
         2,
         now() + interval '3 days',
         'propuesta',
         coord.id
  from coord
  returning id, title
)
insert into assignments (task_id, person_id, status, reason)
select created_tasks.id,
       ana.id,
       'propuesta',
       'Seed demo: Ana tiene skills de comunicacion y carga media para validar pending_approval.'
from created_tasks, ana
where created_tasks.title = 'Organizar charla de derechos digitales';

commit;
```

**Notas de alcance:**
- Este seed usa `source='demo_seed_spec_d2'` para poder distinguir knowledge demo.
- Las personas se upsertean por `wa_phone`, que ya es unique en SPEC-D.1.
- Las tareas demo se borran y recrean en cada corrida para mantener deadlines relativos (`now()+2h` y `now()+3d`).
- La assignment `propuesta` es intencional para que `getBoard.pending_approval` tenga datos apenas D.4 exista.

**Criterios de aceptación:**
- [ ] 3-4 personas con `skills` y `capacity` variados; **al menos 1 con `is_coordinator = true`**.
- [ ] 3-5 filas en `knowledge` (procesos/hechos de una ONG ficticia).
- [ ] Opcional: 1-2 tareas en estados distintos para que `getBoard` no venga vacío.
- [ ] 1 assignment `propuesta` para validar el pending approval del tablero.

**Validación:** ejecutar estas queries en Supabase Cloud y registrar resultados.

```sql
select count(*) as active_people
from people
where active = true
  and wa_phone in ('5491100000001','5491100000002','5491100000003','5491100000004');

select count(*) as active_coordinators
from people
where active = true
  and is_coordinator = true
  and wa_phone in ('5491100000001','5491100000002','5491100000003','5491100000004');

select count(*) as demo_knowledge
from knowledge
where source = 'demo_seed_spec_d2';

select t.status, count(*) as tasks
from tasks
join people p on p.id = t.created_by
where p.wa_phone = '5491100000001'
  and t.title in ('Preparar informe para donantes', 'Organizar charla de derechos digitales')
group by t.status
order by t.status;

select count(*) as pending_approval
from assignments a
join tasks t on t.id = a.task_id
join people creator on creator.id = t.created_by
join people candidate on candidate.id = a.person_id
where a.status = 'propuesta'
  and creator.wa_phone = '5491100000001'
  and candidate.wa_phone = '5491100000002'
  and t.title = 'Organizar charla de derechos digitales';
```

Resultados esperados:
- `active_people = 4`
- `active_coordinators >= 1`
- `demo_knowledge = 5`
- tareas: 1 `pendiente`, 1 `propuesta`
- `pending_approval = 1`

### SPEC-D.3 — Personas
**Funciones:** `db.upsertPerson`, `db.getPersonByPhone`, `db.listCoordinators`, `db.listPeople`.

**Comportamiento:** implementar las funciones de personas de SPEC-00 §4.1 contra Supabase Cloud usando `supabase-js` server-side. Esta spec empieza la capa `db.*` real; no cambia el esquema.

**Precondición:** SPEC-D.1 aplicado. SPEC-D.2 no es bloqueante para implementar D.3, pero sus datos sirven para validar `listCoordinators`.

**Contrato de funciones:**

```ts
db.upsertPerson(input: {
  wa_phone: string
  name?: string
  role?: string
  skills?: string[]
  capacity?: Capacity
  is_coordinator?: boolean
}): Promise<Person>

db.getPersonByPhone(wa_phone: string): Promise<Person | null>

db.listCoordinators(): Promise<Person[]>

db.listPeople(filter?: { active?: boolean }): Promise<Person[]>
```

**Reglas de implementación:**
- `upsertPerson` usa `wa_phone` como clave natural (`people.wa_phone unique`).
- Insert:
  - `wa_phone` requerido.
  - `name` en SPEC-00 es opcional, pero `people.name` es `not null`; si falta, insertar `name = wa_phone` como placeholder determinista.
  - defaults: `capacity='media'`, `is_coordinator=false`, `skills=[]`, `active=true`, `timezone='America/Argentina/Buenos_Aires'`.
- Update:
  - no duplica fila.
  - mergea solo campos presentes en `input`.
  - si `name` falta, conserva el nombre existente.
  - si `skills` falta, conserva skills existentes; si viene `[]`, actualiza a arreglo vacío.
  - si `is_coordinator` falta, conserva valor existente; si viene `false`, actualiza a false.
- `getPersonByPhone`:
  - busca por `wa_phone`.
  - devuelve `null` si Supabase responde 0 filas (`maybeSingle`/equivalente), no tira error.
- `listCoordinators`:
  - filtra `is_coordinator = true` y `active = true`.
  - orden sugerido: `created_at asc`.
- `listPeople`:
  - lista personas para scoring/ML.
  - si recibe `{ active: true }` filtra personas activas; si recibe `{ active: false }` filtra inactivas; si no recibe filtro, devuelve todas.
  - preserva `skills` como arreglo.
  - orden sugerido: `created_at asc`.
- Todas las funciones devuelven el shape `Person` de SPEC-00, con timestamps serializados como string ISO por Supabase.

**Delegación a Antigravity/Codex executor:** D.3 se puede implementar cuando D.2 termine o en paralelo si el executor tiene acceso a repo + env local. Codex en esta sesión prepara la spec y el artifact; el executor que tenga credenciales Supabase debe completar la validación live.

Tasks para executor:
- [ ] Agregar dependencia runtime `@supabase/supabase-js` si todavía no existe.
- [ ] Crear el cliente server-side con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Exportar las cuatro funciones D.3 desde el módulo `db.*` acordado por el equipo.
- [ ] Agregar tipos `Person`, `Capacity` compatibles con SPEC-00 si todavía no existen.
- [ ] Agregar tests unitarios con Supabase mock/stub para insert, update, null, coordinadores y `listPeople`.
- [ ] Ejecutar validación live contra Supabase Cloud cuando haya credenciales.

**Criterios de aceptación:**
- [ ] `upsertPerson` inserta si el `wa_phone` no existe y **actualiza** si existe (no duplica).
- [ ] Defaults aplicados: `capacity='media'`, `is_coordinator=false`, `skills=[]`, `active=true`, `timezone` AR.
- [ ] `getPersonByPhone` devuelve `null` (no error) si no existe.
- [ ] `listCoordinators` solo trae `is_coordinator=true` y `active=true`.
- [ ] `listPeople({active})` lista personas (con `skills`) para el scoring de ML; `active` filtra por estado.

**Validación unitaria mínima:**
- `upsertPerson({ wa_phone })` crea 1 fila con defaults y `name = wa_phone`.
- `upsertPerson({ wa_phone, name:'A', skills:['datos'], is_coordinator:true })` y luego `upsertPerson({ wa_phone, role:'Ops', skills:[] })` deja 1 sola fila, conserva `name='A'`, actualiza `role='Ops'`, actualiza `skills=[]`, conserva `is_coordinator=true`.
- `getPersonByPhone('no-existe')` devuelve `null`.
- `listCoordinators()` no devuelve personas inactivas ni no coordinadoras.
- `listPeople()` devuelve personas con `skills`; `listPeople({ active: true })` y `listPeople({ active: false })` filtran correctamente.

**Validación live SQL opcional:** si el executor valida directo en Supabase, usar un teléfono reservado y limpiar al final.

```sql
delete from people where wa_phone = '5491100000099';

insert into people (wa_phone, name)
values ('5491100000099', '5491100000099')
on conflict (wa_phone) do update
set name = excluded.name
returning wa_phone, name, capacity, is_coordinator, skills, active, timezone;

update people
set name = 'Persona D3',
    role = 'Ops',
    skills = '{}',
    is_coordinator = true
where wa_phone = '5491100000099'
returning wa_phone, name, role, skills, is_coordinator;

select count(*) as rows_for_phone
from people
where wa_phone = '5491100000099';

select wa_phone, name
from people
where is_coordinator = true and active = true
order by created_at asc;

delete from people where wa_phone = '5491100000099';
```

### SPEC-D.4 — Tareas + tablero
**Funciones:** `db.createTask`, `db.listTasks`, `db.setTaskStatus`, `db.getBoard`.

**Comportamiento:** implementar funciones de tareas y tablero de SPEC-00 §4.1 contra Supabase Cloud usando `supabase-js` server-side. Esta spec no cambia el esquema; compone datos de `tasks`, `assignments` e `impact_reports`.

**Precondición:** SPEC-D.1 aplicado. SPEC-D.3 recomendado porque comparte cliente/types. SPEC-D.2 ayuda a validar tablero no vacío, pero no debe ser requisito para tests unitarios.

**Contrato de funciones:**

```ts
db.createTask(input: {
  title: string
  description?: string
  task_type?: TaskType
  priority?: Priority
  required_skills?: string[]
  effort?: number
  deadline?: string
  created_by?: string
}): Promise<Task>

db.listTasks(filter?: { status?: TaskStatus; person_id?: string }): Promise<Task[]>

db.setTaskStatus(task_id: string, status: TaskStatus): Promise<Task>

db.getBoard(): Promise<Board>
```

**Reglas de implementación:**
- Validar `TaskStatus`: `'pendiente' | 'propuesta' | 'aprobada' | 'en_curso' | 'hecha' | 'bloqueada'`.
- Validar `Priority`: `'baja' | 'media' | 'alta'`.
- Validar `TaskType`: `'charla' | 'informe' | 'difusion' | 'atencion' | 'gestion' | 'recaudacion' | 'otro'`.
- `createTask`:
  - requiere `title`.
  - defaults: `priority='media'`, `effort=1`, `status='pendiente'`, `required_skills=[]`.
  - acepta `deadline` como ISO string y lo persiste en `deadline`.
  - devuelve la fila insertada con shape `Task`.
- `listTasks`:
  - sin filtro: devuelve todas las tareas, orden sugerido `created_at desc`.
  - `filter.status`: filtra `tasks.status`.
  - `filter.person_id`: devuelve tareas con una assignment `aprobada` para esa persona; propuestas quedan fuera de "mis tareas".
  - si vienen ambos filtros, aplica ambos.
- `setTaskStatus`:
  - rechaza status fuera de `TaskStatus` antes de llamar Supabase.
  - actualiza `tasks.status` y devuelve la fila actualizada.
  - si `task_id` no existe, debe tirar error explícito.
- `getBoard`:
  - `columns`: objeto con todas las claves de `TaskStatus`, incluso si el arreglo está vacío.
  - `pending_approval`: assignments con `status='propuesta'`, orden sugerido `proposed_at asc`.
  - `alerts`: tareas con `deadline < now + 24h` y `status != 'hecha'`, ordenadas por `deadline asc`.
  - `recent_impact`: últimos 5 `impact_reports`, solo `{ headline, created_at }`, orden `created_at desc`.
  - no muta datos.

**Delegación a Antigravity/Codex executor:** D.4 debe implementarse después de D.3 o reutilizando su cliente/types. Codex en esta sesión prepara la spec y el artifact; el executor con repo/env completa implementación y validación.

Tasks para executor:
- [ ] Reutilizar el cliente Supabase server-side de D.3.
- [ ] Agregar/ajustar tipos `Task`, `TaskStatus`, `Priority`, `TaskType`, `Assignment`, `Board` compatibles con SPEC-00.
- [ ] Implementar `createTask`, `listTasks`, `setTaskStatus`, `getBoard`.
- [ ] Agregar tests unitarios con Supabase mock/stub para defaults, filtros, columnas, alertas, impacto reciente y validación de status.
- [ ] Ejecutar validación live contra Supabase Cloud cuando haya credenciales.

**Criterios de aceptación:**
- [ ] `createTask` aplica defaults (`priority='media'`, `effort=1`, `status='pendiente'`, `required_skills=[]`).
- [ ] `getBoard.columns` agrupa tareas por `status` (todas las claves de `TaskStatus`, aunque estén vacías).
- [ ] `getBoard.alerts` = tareas con `deadline < now + 24h` y `status != 'hecha'`.
- [ ] `getBoard.recent_impact` = últimos 5 `impact_reports` (headline + fecha), desc.
- [ ] `getBoard.pending_approval` = assignments en `'propuesta'`.
- [ ] `setTaskStatus` valida que el status sea un `TaskStatus`.

**Validación unitaria mínima:**
- `createTask({ title:'x' })` aplica defaults.
- `listTasks({ status:'pendiente' })` devuelve solo pendientes.
- `listTasks({ person_id })` devuelve solo tareas con assignment `aprobada` de esa persona.
- `setTaskStatus(task_id,'en_curso')` persiste y devuelve la tarea.
- `setTaskStatus(task_id,'invalid' as TaskStatus)` falla antes de Supabase.
- `getBoard().columns` contiene exactamente las 6 claves de `TaskStatus`.
- Una tarea `deadline = now()+2h`, `status='pendiente'` aparece en `alerts`.
- Una tarea `deadline = now()+3d`, `status='pendiente'` no aparece en `alerts`.
- Una tarea `deadline = now()+2h`, `status='hecha'` no aparece en `alerts`.
- `recent_impact` trae máximo 5, orden desc.
- `pending_approval` trae solo assignments `propuesta`.

**Validación live SQL opcional:** si el executor valida directo en Supabase, usar títulos reservados y limpiar al final.

```sql
with coord as (
  select id from people where wa_phone = '5491100000001'
),
person as (
  select id from people where wa_phone = '5491100000002'
),
cleanup_assignments as (
  delete from assignments a
  using tasks t
  where a.task_id = t.id
    and t.title in ('Smoke D4 alerta', 'Smoke D4 futura', 'Smoke D4 hecha')
  returning a.id
),
cleanup_tasks as (
  delete from tasks
  where title in ('Smoke D4 alerta', 'Smoke D4 futura', 'Smoke D4 hecha')
  returning id
),
created as (
  insert into tasks (title, effort, deadline, status, created_by)
  select 'Smoke D4 alerta', 1, now() + interval '2 hours', 'pendiente', coord.id from coord
  union all
  select 'Smoke D4 futura', 1, now() + interval '3 days', 'pendiente', coord.id from coord
  union all
  select 'Smoke D4 hecha', 1, now() + interval '2 hours', 'hecha', coord.id from coord
  returning id, title, status, deadline
),
approved_assignment as (
  insert into assignments (task_id, person_id, status, reason)
  select created.id, person.id, 'aprobada', 'Smoke D4 approved assignment'
  from created, person
  where created.title = 'Smoke D4 alerta'
  returning id
),
pending_assignment as (
  insert into assignments (task_id, person_id, status, reason)
  select created.id, person.id, 'propuesta', 'Smoke D4 pending assignment'
  from created, person
  where created.title = 'Smoke D4 futura'
  returning id
)
select title, status, deadline
from created
order by title;

select t.title
from tasks t
where t.deadline < now() + interval '24 hours'
  and t.status != 'hecha'
  and t.title like 'Smoke D4%'
order by t.deadline asc;

select a.status, count(*) as assignments
from assignments a
join tasks t on t.id = a.task_id
where t.title like 'Smoke D4%'
group by a.status
order by a.status;

delete from assignments
where task_id in (select id from tasks where title like 'Smoke D4%');

delete from tasks
where title like 'Smoke D4%';
```

### SPEC-D.5 — Asignaciones (persistencia de la doble aprobación)
**Funciones:** `db.insertAssignment`, `db.getAssignment`, `db.setAssignmentStatus`, `db.readPersonLoad`.
**Criterios de aceptación:**
- [ ] `insertAssignment` crea con `status='propuesta'` y `proposed_at=now()`.
- [ ] `setAssignmentStatus(id,'aprobada_coord',{coord_id})` setea `coord_id` y `coord_decision_at=now()`.
- [ ] `setAssignmentStatus(id,'aprobada')` setea `responded_at=now()`.
- [ ] `setAssignmentStatus(id,'rechazada',{rejected_by})` guarda `rejected_by` ('coordinador'|'persona').
- [ ] `readPersonLoad` lee la vista `person_load`.
**Validación:** test que recorra `propuesta → aprobada_coord → aprobada` y verifique los campos/timestamps en cada paso.

### SPEC-D.6 — Impacto
**Funciones:** `db.insertImpactReport`, `db.getImpactReport`, `db.getOrgImpact`.
**Criterios de aceptación:**
- [ ] `insertImpactReport` persiste `inputs/outputs/raw_answers` como JSONB y `headline`, `summary`, `outcome`, `task_type`.
- [ ] `getImpactReport(task_id)` devuelve el último (o `null`).
- [ ] `getOrgImpact` devuelve `{ headlines: string[], by_type: { <task_type>: <count> } }` (rollup por tipo, **sin** sumar métricas heterogéneas).
**Validación:** insertar 2 reports de tipos distintos → `by_type` cuenta 1 y 1; `headlines` trae ambos.

### SPEC-D.7 — Knowledge (estilo LLM Wiki)
**Funciones:** `db.loadKnowledge`, `db.addKnowledge`, `db.updateKnowledge`.
**Criterios de aceptación:**
- [ ] `loadKnowledge` devuelve **todas** las filas (sin paginar, sin búsqueda — se carga entero en contexto).
- [ ] `addKnowledge` aplica `kind='hecho'` por defecto y `tags=[]`.
- [ ] `updateKnowledge(id, patch)` permite a ML **integrar/deduplicar** (editar contenido/tags en vez de crear fila nueva).
**Validación:** `loadKnowledge` tras el seed trae las 3-5 filas; `updateKnowledge` modifica una y `loadKnowledge` la refleja.

### SPEC-D.8 — Sesiones, historial, idempotencia
**Funciones:** `db.getSession`, `db.setSession`, `db.clearSession`, `db.loadHistory`, `db.appendHistory`, `db.wasProcessed`, `db.markProcessed`.
**Criterios de aceptación:**
- [ ] `setSession` hace upsert por `wa_phone` y guarda `state` + `context` (JSONB) + `updated_at`.
- [ ] `getSession` devuelve `null` si no hay; `clearSession` la borra (o setea `state=null`).
- [ ] `loadHistory(wa_phone, n=20)` trae los últimos `n` mensajes en orden cronológico.
- [ ] `appendHistory` agrega una fila `{role, content}`.
- [ ] `wasProcessed(message_id)` → bool; `markProcessed` lo registra. (Para que Backend deduplique reintentos.)
**Validación:** `markProcessed('x')` y luego `wasProcessed('x') === true`, `wasProcessed('y') === false`.

---

## 3. Orden de implementación (Specify → Plan → Implement → Validate)
1. **Implement** SPEC-D.1 (esquema vía MCP) → **Validate** con el SQL smoke test. *Esto desbloquea a todos.*
2. SPEC-D.2 (seed) → así los otros tienen datos reales apenas conecten.
3. SPEC-D.3 + D.4 (personas, tareas, tablero) — lo que más se usa en la demo.
4. SPEC-D.5 (asignaciones) — habilita la doble aprobación.
5. SPEC-D.8 (sesiones/historial/idempotencia) — habilita los flujos multi-turno de ML y la robustez de Backend.
6. SPEC-D.6 + D.7 (impacto, knowledge).

> Empaquetá todo en un módulo `lib/db.ts` que exporte el objeto `db`. Cliente: `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` server-side.

---

## 4. Definition of Done
- [ ] `lib/db.ts` exporta **todas** las `db.*` de SPEC-00 §4.1, tipadas con `types.ts`.
- [ ] Esquema + vista + seed aplicados en el proyecto Supabase del equipo.
- [ ] Un script `scripts/smoke.ts` corre las funciones clave y pasa.
- [ ] Los shapes de retorno coinciden 1:1 con SPEC-00 (Backend y ML pueden reemplazar el mock por `db` sin tocar su código).
