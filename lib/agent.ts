// SPEC-M.2 — Loop del agente + registro de tools.
//
// runAgent(waPhone, text): carga persona/sesión/historial/kb → generateText con TODAS
// las tools (propias + db.* envueltas + sendText/Buttons/List) y tool-calling multi-paso
// (stopWhen: stepCountIs(8)) → manda la respuesta y persiste historial.
//
// Flujos especiales (deterministas, no por LLM, para respetar la Constitución):
//  - Impacto activo (session 'impact:<id>') → handleImpactAnswer captura la respuesta.
//  - Onboarding → runAgent administra session.state='onboarding' y la cierra al registrar.

import { generateText, type ModelMessage, stepCountIs, tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Person, Priority, TaskStatus, TaskType } from "../types.js";
import { type Deps, defaultDeps } from "./deps.js";
import { handleImpactAnswer, startImpactFlow } from "./impact.js";
import { integrateFact } from "./knowledge.js";
import { buildSystemPrompt } from "./prompt.js";
import { proposeAssignment } from "./scoring.js";

// Re-exports: superficie pública de ML (SPEC-00 §4.4) para que Backend importe de un lado.
export { proposeAssignment, scoreCandidates } from "./scoring.js";
export {
	inferImpactQuestions,
	recordImpactReport,
	startImpactFlow,
	handleImpactAnswer,
} from "./impact.js";
export { inferKnowledge } from "./knowledge.js";
export { buildSystemPrompt } from "./prompt.js";

const PRIORITIES = ["baja", "media", "alta"] as const;
const TASK_TYPES = ["charla", "informe", "difusion", "atencion", "gestion", "recaudacion", "otro"] as const;
const TASK_STATUSES = ["pendiente", "propuesta", "aprobada", "en_curso", "hecha", "bloqueada"] as const;

/** Envuelve un execute para que un error no aborte el loop: el agente recibe {error}. */
function safe<I>(fn: (input: I) => Promise<unknown>) {
	return async (input: I) => {
		try {
			return await fn(input);
		} catch (e) {
			return { error: e instanceof Error ? e.message : String(e) };
		}
	};
}

interface SendTracker {
	count: number;
	bodies: string[];
}

/** Registra TODAS las tools del agente (SPEC-M.2). */
export function buildTools(deps: Deps, waPhone: string, person: Person | null, tracker: SendTracker): ToolSet {
	const { db, send } = deps;

	return {
		upsertPerson: tool({
			description:
				"Guardá/actualizá a la persona actual. Llamala para CERRAR el onboarding una vez que " +
				"tengas nombre, rol, 2-3 skills y disponibilidad.",
			inputSchema: z.object({
				name: z.string().optional(),
				role: z.string().optional(),
				skills: z.array(z.string()).optional(),
				capacity: z.enum(["baja", "media", "alta"]).optional(),
				is_coordinator: z.boolean().optional(),
			}),
			execute: safe(async (input) => {
				const p = await db.upsertPerson({ wa_phone: waPhone, ...input });
				return { id: p.id, name: p.name, role: p.role, skills: p.skills, capacity: p.capacity };
			}),
		}),

		createTask: tool({
			description:
				"Creá una tarea nueva a partir de lo que pidió la persona. Extraé título, descripción, " +
				"prioridad, skills requeridos, deadline (ISO) y clasificá el tipo. Después llamá proposeAssignment.",
			inputSchema: z.object({
				title: z.string(),
				description: z.string().optional(),
				task_type: z.enum(TASK_TYPES).optional(),
				priority: z.enum(PRIORITIES).optional(),
				required_skills: z.array(z.string()).optional(),
				deadline: z.string().optional().describe("Fecha límite en ISO 8601 (ej 2026-06-12T00:00:00Z)"),
			}),
			execute: safe(async (input) => {
				const t = await db.createTask({
					title: input.title,
					description: input.description,
					task_type: input.task_type as TaskType | undefined,
					priority: input.priority as Priority | undefined,
					required_skills: input.required_skills,
					deadline: input.deadline,
					created_by: person?.id,
				});
				return { id: t.id, title: t.title, task_type: t.task_type, deadline: t.deadline, status: t.status };
			}),
		}),

		proposeAssignment: tool({
			description:
				"Proponé al mejor responsable para una tarea. Manda la propuesta (con justificación) AL " +
				"COORDINADOR con botones de aprobar/rechazar — NO a la persona. Llamala justo después de createTask.",
			inputSchema: z.object({ task_id: z.string() }),
			execute: safe(async ({ task_id }) => {
				const { assignment, candidate, reason } = await proposeAssignment(task_id, deps);
				return { assignment_id: assignment.id, candidate: candidate.name, reason, sent_to: "coordinador" };
			}),
		}),

		startImpactFlow: tool({
			description:
				"Iniciá el cierre + Balance de Impacto cuando la persona dice que TERMINÓ una tarea. " +
				"Marca la tarea como hecha y arranca las preguntas de impacto.",
			inputSchema: z.object({ task_id: z.string() }),
			execute: safe(async ({ task_id }) => {
				await startImpactFlow(waPhone, task_id, deps);
				return { ok: true };
			}),
		}),

		listTasks: tool({
			description:
				'Listá tareas. Usá mine=true para "mis tareas" (las de la persona actual). Filtrá por estado si hace falta.',
			inputSchema: z.object({
				status: z.enum(TASK_STATUSES).optional(),
				mine: z.boolean().optional(),
			}),
			execute: safe(async ({ status, mine }) => {
				const rows = await db.listTasks({
					status: status as TaskStatus | undefined,
					person_id: mine ? person?.id : undefined,
				});
				return rows.map((t) => ({ id: t.id, title: t.title, status: t.status, deadline: t.deadline }));
			}),
		}),

		getBoard: tool({
			description: 'Traé el tablero (estados, pendientes de aprobación, vencimientos, impacto reciente). Para "¿cómo venimos?".',
			inputSchema: z.object({}),
			execute: safe(async () => {
				const b = await db.getBoard();
				const counts = Object.fromEntries(Object.entries(b.columns).map(([k, v]) => [k, v.length]));
				return {
					counts,
					pending_approval: b.pending_approval.length,
					alerts: b.alerts.map((t) => ({ title: t.title, deadline: t.deadline })),
					recent_impact: b.recent_impact,
				};
			}),
		}),

		getOrgImpact: tool({
			description: "Resumen agregado del impacto de la organización (titulares + conteo por tipo de tarea).",
			inputSchema: z.object({ task_type: z.enum(TASK_TYPES).optional() }),
			execute: safe(async ({ task_type }) => db.getOrgImpact({ task_type: task_type as TaskType | undefined })),
		}),

		addKnowledge: tool({
			description:
				"Guardá un dato/política/proceso NUEVO de la organización en la memoria (KB). Usalo cuando la " +
				"persona te cuenta algo útil y duradero sobre cómo funciona la ONG.",
			inputSchema: z.object({
				content: z.string(),
				kind: z.enum(["politica", "proceso", "hecho", "inferido"]).optional(),
				tags: z.array(z.string()).optional(),
			}),
			execute: safe(async (input) => {
				const { action, knowledge } = await integrateFact(db, { ...input, source: waPhone });
				return { id: knowledge.id, content: knowledge.content, action };
			}),
		}),

		sendText: tool({
			description: "Mandale un mensaje de texto a la persona (o a otro número con 'to'). Es la forma normal de responder.",
			inputSchema: z.object({ to: z.string().optional(), body: z.string() }),
			execute: safe(async ({ to, body }) => {
				await send.sendText(to ?? waPhone, body);
				tracker.count++;
				tracker.bodies.push(body);
				return { ok: true };
			}),
		}),

		sendButtons: tool({
			description: "Mandá botones (máx 3) para opciones cerradas (sí/no, disponibilidad). Default va a la persona actual.",
			inputSchema: z.object({
				to: z.string().optional(),
				body: z.string(),
				buttons: z.array(z.object({ id: z.string(), title: z.string() })).max(3),
			}),
			execute: safe(async ({ to, body, buttons }) => {
				await send.sendButtons(to ?? waPhone, body, buttons);
				tracker.count++;
				tracker.bodies.push(body);
				return { ok: true };
			}),
		}),

		sendList: tool({
			description: "Mandá una lista (máx 10 filas) para elegir entre varias opciones (ej. cuál tarea cerrar).",
			inputSchema: z.object({
				to: z.string().optional(),
				body: z.string(),
				rows: z.array(z.object({ id: z.string(), title: z.string(), description: z.string().optional() })).max(10),
			}),
			execute: safe(async ({ to, body, rows }) => {
				await send.sendList(to ?? waPhone, body, rows);
				tracker.count++;
				tracker.bodies.push(body);
				return { ok: true };
			}),
		}),
	};
}

/** Entrypoint para texto libre (SPEC-00 §4.4). */
export async function runAgent(waPhone: string, text: string, deps: Deps = defaultDeps): Promise<void> {
	const { db, model } = deps;

	await db.appendHistory(waPhone, "user", text);

	// 1) Flujo de impacto activo → captura determinista (sin inventar números).
	if (await handleImpactAnswer(waPhone, text, deps)) return;

	// 2) Contexto del turno.
	const person = await db.getPersonByPhone(waPhone);
	let session = await db.getSession(waPhone);
	if (!person && (!session || !session.state)) {
		session = await db.setSession(waPhone, "onboarding", {});
	}
	const [kb, history] = await Promise.all([db.loadKnowledge(), db.loadHistory(waPhone, 20)]);
	const system = buildSystemPrompt({ person, session, kb }, { now: deps.now() });
	const messages: ModelMessage[] = history.map((m) => ({ role: m.role, content: m.content }));

	// 3) Loop del agente con todas las tools (multi-paso).
	const tracker: SendTracker = { count: 0, bodies: [] };
	const tools = buildTools(deps, waPhone, person, tracker);
	const result = await generateText({ model, system, messages, tools, stopWhen: stepCountIs(8) });

	// 4) Respuesta: si el agente no mandó nada por tools pero dejó texto, lo mandamos (fallback).
	const reply = result.text?.trim();
	if (tracker.count === 0 && reply) {
		await deps.send.sendText(waPhone, reply);
		tracker.bodies.push(reply);
	}
	// Persistir el turno del asistente = lo que efectivamente se mandó (o el texto final).
	const assistantTurn = tracker.bodies.join("\n").trim() || reply || "";
	if (assistantTurn) await db.appendHistory(waPhone, "assistant", assistantTurn);

	// 5) Onboarding cerrado: si ahora existe la persona, limpiamos la sesión.
	if (!person && session?.state === "onboarding") {
		const after = await db.getPersonByPhone(waPhone);
		if (after) await db.clearSession(waPhone);
	}
}
