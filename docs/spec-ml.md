# SPEC-ML · El Agente (Machine Learning)

> **Depende de:** SPEC-00 (contrato). **Provee:** `runAgent`, `buildSystemPrompt`, el loop del agente, los flujos NL, `proposeAssignment`, `scoreCandidates`, `inferImpactQuestions`, `recordImpactReport`, `inferKnowledge`, `startImpactFlow`.
> **Consume (mockeable):** `db.*` (Data) y `sendText/Buttons/List` (Backend).
> Nivel: spec-anchored. Validación por criterios de aceptación.

---

## 0. Alcance

**Tuyo:** el "cerebro". Interpretar lenguaje natural, decidir qué tools llamar, generar las preguntas de impacto a medida, puntuar candidatos y mantener el knowledge base. Todo lo que requiere criterio del LLM.
**NO es tuyo:** el webhook ni los envíos crudos (Backend), ni el SQL (Data). Vos consumís `db.*` y `sendText/Buttons/List` por sus firmas.

---

## 1. Cómo NO bloquear

- Desarrollás contra **mocks**: `lib/mocks.ts` (db en memoria) y un `sendText/Buttons/List` que hace `console.log`/spy.
- Armá un **harness local** (`scripts/chat.ts`): un loop de consola que toma texto, llama `runAgent`, e imprime los tool calls y la respuesta. **Con esto probás todo el agente sin webhook ni base real.**
- No esperás a nadie: cuando Backend y Data terminan, reemplazás los mocks por las implementaciones reales (mismas firmas).

---

## 2. Specs

### SPEC-M.1 — Construcción del system prompt
**Comportamiento:** `buildSystemPrompt({ person, session, kb })` arma el contexto de cada turno.
**Criterios de aceptación:**
- [ ] Incluye las reglas de la Constitución (SPEC-00 §1): lógica determinista, doble aprobación, **nunca inventar números**, baja fricción.
- [ ] Inyecta el **knowledge base completo** (`kb = db.loadKnowledge()`) como texto (patrón LLM Wiki: todo en contexto, sin RAG).
- [ ] Si `person == null` → instrucción de onboarding. Si existe → datos de la persona.
- [ ] Si `session.state` está activo → refleja el flujo en curso y la próxima acción (ej. "estás recolectando impacto para la tarea X; pregunta pendiente: …").
- [ ] Incluye el catálogo de cuándo usar cada tool.
**Validación:** snapshot del prompt para 3 inputs (persona nueva / persona existente / sesión de impacto) y verificar que cada parte aparezca.

### SPEC-M.2 — Loop del agente
**Comportamiento:** `runAgent(waPhone, text)` = cargar persona/sesión/historial/kb → `generateText({ model, system, messages, tools, stopWhen: stepCountIs(8) })` → mandar la respuesta y persistir historial.
**Criterios de aceptación:**
- [ ] Registra **todas** las tools (las propias + `db.*` envueltas como tools + `sendText/Buttons/List`).
- [ ] Tool calling **multi-paso** habilitado (v5: `stopWhen: stepCountIs(n)`; v4: `maxSteps`).
- [ ] Persiste `db.appendHistory` para usuario y asistente.
- [ ] Dado *"creá una tarea para mandar el informe el viernes"* → el agente llama `createTask` y luego `proposeAssignment`.
**Validación:** correr en el harness con tools mockeadas y **assertear la secuencia de tool calls** esperada.

### SPEC-M.3 — Onboarding (NL, baja fricción)
**Comportamiento:** si la persona no existe, el agente se presenta y pide en pocos turnos: nombre, área/rol, 2-3 skills, disponibilidad (con botones Baja/Media/Alta). Guarda con `db.upsertPerson` y confirma.
**Criterios de aceptación (Given/When/Then):**
- [ ] **Given** un `wa_phone` desconocido, **When** manda "hola", **Then** el primer mensaje guía solo ("…contame tu nombre 👇") y setea `session.state='onboarding'`.
- [ ] Recolecta los campos en ≤4 turnos; usa botones para `capacity`.
- [ ] Al completar: `db.upsertPerson(...)`, `db.clearSession`, y un mensaje de confirmación.
**Validación:** conversación scripteada en el harness → al final existe la persona con los campos cargados.

### SPEC-M.4 — Intake de tareas (extracción)
**Comportamiento:** de texto libre, extraer `title, description, priority, required_skills, deadline (ISO), task_type` y crear con `db.createTask`.
**Criterios de aceptación:**
- [ ] "antes del viernes" → `deadline` ISO correcto (usar la fecha actual como referencia).
- [ ] Clasifica `task_type` (charla/informe/difusion/atencion/gestion/recaudacion/otro).
- [ ] Confirma con la persona antes de proponer (o crea y avisa).
**Validación:** tabla de 5 inputs de ejemplo → campos esperados (incluido `task_type` y `deadline`).

### SPEC-M.5 — Propuesta + scoring
**Comportamiento:** `scoreCandidates(task, load, people)` elige al mejor; `proposeAssignment(task_id)` compone: scoring + `db.insertAssignment(status 'propuesta')` + `sendButtons(coordinador, …, [coord_approve/coord_reject])`.
**Criterios de aceptación:**
- [ ] `scoreCandidates` filtra por overlap de `required_skills` → elige menor `active_effort` → desempata por `capacity`. (Versión que luce: dejar que el LLM elija/justifique sobre los candidatos con su carga.)
- [ ] Devuelve un `reason` **legible** ("…tiene el skill X y es la menos cargada hoy").
- [ ] `proposeAssignment` manda los botones **al coordinador** (`db.listCoordinators()[0]`), no a la persona.
- [ ] Los `id` de botón siguen SPEC-00 §5.
**Validación:** unit test de `scoreCandidates` con fixtures (3 personas, cargas distintas) → elige la esperada; el `reason` menciona skill y carga.

### SPEC-M.6 — Flujo de impacto (la feature estrella)
**Comportamiento:** `startImpactFlow(waPhone, task_id)` = `db.setTaskStatus(task,'hecha')` + `inferImpactQuestions(task_id)` + `db.setSession(impact:<id>, {questions, answers:{}, i:0})` + mandar la 1ª pregunta. Mientras `session.state='impact:<id>'`, `runAgent` acumula respuestas y manda la siguiente; al completar, `recordImpactReport`.
**Criterios de aceptación (Given/When/Then):**
- [ ] `inferImpactQuestions` devuelve **2-4** preguntas **cuantificables**, **a medida del `task_type`** (no formulario fijo):
  - **Given** `task_type='charla'` → pregunta por asistentes / horas / material o encuesta.
  - **Given** `task_type='informe'` → pregunta por a quién se entregó / si se usó para una decisión / qué cubría.
  - (Resto de arquetipos según PRD §7.)
- [ ] Una pregunta por mensaje; tope 4 (baja fricción).
- [ ] `recordImpactReport` arma el **Balance**: `inputs` (inversión), `outputs` (resultado), `outcome` (qué cambió), `headline` ("la cifra que cuenta"), `summary` formateado; persiste con `db.insertImpactReport` y lo manda a persona + coordinador.
- [ ] **Nunca inventa números**: cada valor del balance proviene de `raw_answers`. Si falta un dato, lo deja vacío o lo vuelve a preguntar — no lo completa.
**Validación:** en el harness, cerrar una tarea de cada arquetipo → preguntas acordes al tipo; un balance sin ningún número que no haya dado el usuario (test que compare valores del `summary` contra `raw_answers`).

### SPEC-M.7 — Knowledge (integrar / deduplicar)
**Comportamiento:** `inferKnowledge(conversationText)` extrae hechos útiles de la conversación y los **integra** en el KB: si ya existe algo equivalente, `db.updateKnowledge` (revisa/expande) en vez de `db.addKnowledge` (apilar duplicado).
**Criterios de aceptación:**
- [ ] Dado un hecho ya presente reformulado, **no** crea fila nueva (actualiza o ignora).
- [ ] Dado un hecho nuevo, lo agrega con `kind='inferido'` y `source`.
**Validación:** feedear dos veces el mismo hecho con otras palabras → `loadKnowledge` no crece en duplicados.

---

## 3. Orden de implementación (Specify → Plan → Implement → Validate)
1. SPEC-M.1 + M.2 (system prompt + loop) contra mocks + harness → la espina dorsal.
2. SPEC-M.3 (onboarding) — primer flujo demostrable end-to-end (con mocks).
3. SPEC-M.4 (intake) + SPEC-M.5 (propuesta + scoring) — habilita el corazón operativo.
4. **SPEC-M.6 (impacto)** — la feature estrella; reservar el bloque 2:30–3:30 para esto.
5. SPEC-M.7 (knowledge) — si hay tiempo.
6. Integración: reemplazar `lib/mocks.ts` por `db` real (Data) y los `sendText/Buttons/List` reales (Backend).

---

## 4. Definition of Done
- [ ] `lib/agent.ts` exporta `runAgent` y compone correctamente las tools (propias + `db.*` + envío).
- [ ] El harness corre el recorrido completo contra mocks: onboarding → crear tarea → propuesta (con `reason`) → [mock approve] → "Terminé" → preguntas a medida → **Balance de Impacto** → "¿cómo venimos?".
- [ ] `scoreCandidates`, `inferImpactQuestions` y `recordImpactReport` tienen tests (validación de la spec).
- [ ] Garantía verificada: **ningún número del balance** sale de algo que el usuario no haya respondido.
- [ ] Al integrar, no hace falta tocar código de Backend/Data — solo cambiar el import de mocks por las reales.
