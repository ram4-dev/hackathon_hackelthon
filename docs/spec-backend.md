# SPEC-BACKEND · Transporte WhatsApp + Webhook + Deploy (Backend)

> **Depende de:** SPEC-00 (contrato). **Provee:** `sendText/Buttons/List`, `/api/webhook`, `handleButton`, `coordinatorRespond`, `respondToAssignment`, idempotencia, deploy + Sandbox.
> **Consume (mockeable):** `db.*` (Data) y `proposeAssignment` / `startImpactFlow` (ML).
> Nivel: spec-anchored. Validación por criterios de aceptación.

---

## 0. Alcance

**Tuyo:** todo lo que entra y sale por WhatsApp, y el pegamento del runtime. Recibir webhooks de Kapso, rutear botones a la acción determinista, mandar mensajes interactivos, y dejar todo deployado contra el Sandbox.
**NO es tuyo:** qué responde el agente en lenguaje natural (ML) ni cómo se guardan los datos (Data). Vos transportás y orquestás los pasos deterministas (los que vienen de botones).

> **Caveat de exactitud:** los shapes de Kapso (helper `normalizeWebhook`, campos de `button_reply`, body de envío) seguí el estándar de la WhatsApp Cloud API, pero **confirmalos contra los docs de Kapso y el repo `gokapso/whatsapp-cloud-api-js`** antes de pulir.

---

## 1. Cómo NO bloquear

- Trabajás contra **stubs**: un `runAgent` que responde un eco (`sendText(from, "ok: " + text)`), un `proposeAssignment` que devuelve un assignment fijo, y los `db.*` del `lib/mocks.ts`.
- Con eso podés **deployar y probar el camino completo de transporte** (mensaje → webhook → respuesta) sin que ML ni Data hayan terminado.
- Reemplazás stubs por las implementaciones reales al integrar; las firmas de SPEC-00 garantizan que encajan.

---

## 2. Specs

### SPEC-B.1 — Helpers de envío (Kapso)
**Comportamiento:** implementar `sendText`, `sendButtons` (≤3), `sendList` (≤10) contra `POST https://api.kapso.ai/meta/whatsapp/v24.0/{PHONE_ID}/messages` con header `X-API-Key`.
**Criterios de aceptación:**
- [ ] `sendText` entrega un mensaje de texto a un número del Sandbox.
- [ ] `sendButtons` arma `interactive.type='button'` con `action.buttons[].reply = {id,title}` y **trunca a 3**.
- [ ] `sendList` arma `interactive.type='list'` con `sections[].rows = {id,title,description?}` y **trunca a 10**.
- [ ] Los `id` de los botones respetan la convención de SPEC-00 §5.
**Validación:** mandar a tu propio número (Sandbox) un texto, una tanda de 2 botones y una lista de 3 filas; verificar que llegan y que al tocar un botón el `id` vuelve en el webhook.

### SPEC-B.2 — Webhook entrante
**Comportamiento:** `POST /api/webhook` (Next.js App Router). Normalizar, distinguir **button_reply vs texto**, responder `200` rápido.
**Criterios de aceptación:**
- [ ] Ignora eventos que no sean `whatsapp.message.received` (responde `{ok:true}`).
- [ ] Si hay `interactive.button_reply.id` → `handleButton(from, id)`.
- [ ] Si hay `text.body` → `runAgent(from, text.body)`.
- [ ] Responde `200` en < ~1 s (no espera a que termine el agente; ver SPEC-B.4).
**Validación:** `curl` con un payload de ejemplo de botón → ejecuta el handler correcto; con un payload de texto → llama `runAgent`. Unit test del router con ambos shapes.

### SPEC-B.3 — Routing de botones + orquestación determinista
**Comportamiento:** `handleButton` parsea `id` y ejecuta la acción; `coordinatorRespond` y `respondToAssignment` mutan estado vía `db.*` y mandan el siguiente mensaje. **Sin LLM.**
**Criterios de aceptación:**
- [ ] `handleButton` mapea por prefijo según SPEC-00 §5 (`coord_approve`, `coord_reject`, `approve`, `reject`, `done`).
- [ ] `coordinatorRespond(id,'aprobar')`: `db.setAssignmentStatus(id,'aprobada_coord',{coord_id})` → `sendButtons(persona, "...¿la tomás?", [approve/reject])`.
- [ ] `coordinatorRespond(id,'rechazar')`: `db.setAssignmentStatus(id,'rechazada',{rejected_by:'coordinador'})` → `db.setTaskStatus(task,'pendiente')`.
- [ ] `coordinatorRespond(id,'reasignar', new_person_id)` *(nice-to-have)*: re-propone al nuevo candidato.
- [ ] `respondToAssignment(id,'aprobada')`: `db.setAssignmentStatus(id,'aprobada')` → `db.setTaskStatus(task,'aprobada')` → `sendText(coordinador, "X tomó la tarea ✅")`.
- [ ] `respondToAssignment(id,'rechazada')`: `db.setAssignmentStatus(id,'rechazada',{rejected_by:'persona'})` → llama `proposeAssignment(task_id)` (ML) para re-proponer.
**Validación:** unit tests con `id`s de ejemplo y `db.*` mockeado → verificar las transiciones de estado y a quién se le manda el siguiente mensaje (spy sobre `sendButtons/sendText`). Debe matchear la máquina de estados del RFC §10.

### SPEC-B.4 — Idempotencia + respuesta rápida
**Comportamiento:** deduplicar reintentos de Kapso/Meta y procesar el agente sin bloquear el `200`.
**Criterios de aceptación:**
- [ ] Si `db.wasProcessed(message_id)` → descartar (no doble-procesar). Si no, `db.markProcessed(message_id)` y seguir.
- [ ] El trabajo del agente corre con `waitUntil(...)` (Vercel) o equivalente, después de responder `200`.
**Validación:** postear el mismo webhook (mismo `message_id`) dos veces → una sola asignación / un solo balance (no duplicados).

### SPEC-B.5 — Deploy + Sandbox + env
**Comportamiento:** deployar a Vercel y conectar el Sandbox de Kapso al webhook.
**Criterios de aceptación:**
- [ ] App deployada con URL pública (no túnel local).
- [ ] Webhook de Kapso apuntando a `https://<deploy>/api/webhook`; verificación de firma con `KAPSO_WEBHOOK_SECRET` si Kapso la provee.
- [ ] Env vars de SPEC-00 §7 cargadas en Vercel.
- [ ] **Smoke E2E con stub:** mandar "hola" al Sandbox → llega un eco del `runAgent` stub.
**Validación:** desde tu WhatsApp al número Sandbox, "hola" → respuesta. (Antes de que ML conecte el agente real.)

---

## 3. Orden de implementación (Specify → Plan → Implement → Validate)
1. SPEC-B.1 (helpers de envío) → validar contra Sandbox. Es lo primero porque todo lo demás manda mensajes.
2. SPEC-B.5 (deploy temprano con stub) → tener URL pública desde el arranque evita el dolor de los túneles.
3. SPEC-B.2 (webhook + router).
4. SPEC-B.3 (botones + orquestación determinista) → contra `db.*` mock + `proposeAssignment` stub.
5. SPEC-B.4 (idempotencia + waitUntil).
6. Integración: cambiar stubs por `db` real (Data) y `proposeAssignment`/`startImpactFlow` reales (ML).

---

## 4. Definition of Done
- [ ] `lib/kapso.ts` exporta `sendText/Buttons/List` (con los topes 3/10) y andan contra el Sandbox.
- [ ] `app/api/webhook/route.ts` rutea botones vs texto, responde `200` rápido, deduplica.
- [ ] `handleButton` + `coordinatorRespond` + `respondToAssignment` implementan la máquina de estados del RFC §10 (validado con tests).
- [ ] App deployada; "hola" al Sandbox devuelve respuesta (primero con stub, luego con el agente real).
- [ ] No hay lógica de negocio "adivinada" por LLM en este módulo — todo lo de botones es determinista.
