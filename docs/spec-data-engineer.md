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
**Comportamiento:** crear todas las tablas y la vista `person_load` de SPEC-00 §3 en Supabase (usá el MCP para generarlas/migrarlas).
**Criterios de aceptación:**
- [ ] Existen `people, tasks, assignments, knowledge, impact_reports, sessions, messages, processed_messages`.
- [ ] `person_load` devuelve `active_effort` y `active_tasks` correctos (suma `effort` de tareas `aprobada/en_curso` asignadas y aprobadas).
- [ ] Insert/select básico funciona en cada tabla.
**Validación:** correr un SQL que inserte 1 persona + 1 tarea + 1 assignment `aprobada` y verificar que `select * from person_load` muestre `active_effort = effort` de esa tarea.

### SPEC-D.2 — Seed de demo
**Comportamiento:** poblar datos creíbles para la demo.
**Criterios de aceptación:**
- [ ] 3-4 personas con `skills` y `capacity` variados; **al menos 1 con `is_coordinator = true`**.
- [ ] 3-5 filas en `knowledge` (procesos/hechos de una ONG ficticia).
- [ ] Opcional: 1-2 tareas en estados distintos para que `getBoard` no venga vacío.
**Validación:** `db.getBoard()` y `db.listCoordinators()` devuelven datos no vacíos.

### SPEC-D.3 — Personas
**Funciones:** `db.upsertPerson`, `db.getPersonByPhone`, `db.listCoordinators`.
**Criterios de aceptación:**
- [ ] `upsertPerson` inserta si el `wa_phone` no existe y **actualiza** si existe (no duplica).
- [ ] Defaults aplicados: `capacity='media'`, `is_coordinator=false`, `skills=[]`, `active=true`, `timezone` AR.
- [ ] `getPersonByPhone` devuelve `null` (no error) si no existe.
- [ ] `listCoordinators` solo trae `is_coordinator=true` y `active=true`.
**Validación:** test: upsert dos veces el mismo `wa_phone` → 1 sola fila, datos mergeados.

### SPEC-D.4 — Tareas + tablero
**Funciones:** `db.createTask`, `db.listTasks`, `db.setTaskStatus`, `db.getBoard`.
**Criterios de aceptación:**
- [ ] `createTask` aplica defaults (`priority='media'`, `effort=1`, `status='pendiente'`, `required_skills=[]`).
- [ ] `getBoard.columns` agrupa tareas por `status` (todas las claves de `TaskStatus`, aunque estén vacías).
- [ ] `getBoard.alerts` = tareas con `deadline < now + 24h` y `status != 'hecha'`.
- [ ] `getBoard.recent_impact` = últimos 5 `impact_reports` (headline + fecha), desc.
- [ ] `getBoard.pending_approval` = assignments en `'propuesta'`.
- [ ] `setTaskStatus` valida que el status sea un `TaskStatus`.
**Validación:** seed con una tarea `deadline = now()+2h` → aparece en `alerts`; con `deadline = now()+3d` → no.

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
