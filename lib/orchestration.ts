// Orquestación determinista desde botones (SPEC-00 §4.3 / §5, SPEC-B.3).
// SIN LLM: estas funciones mutan estado vía db.* y mandan el siguiente mensaje.
// Es la máquina de estados de la doble aprobación (RFC §10).

import type { Person } from "../types.js";
import { runAgent } from "./agent.js";
import type { Db } from "./contracts.js";
import { type Deps, defaultDeps } from "./deps.js";
import { startImpactFlow } from "./impact.js";
import { proposeAssignment } from "./scoring.js";

async function personById(db: Db, id: string): Promise<Person | null> {
	return (await db.listPeople()).find((p) => p.id === id) ?? null;
}

/**
 * Respuesta del COORDINADOR (SPEC-00 §4.3).
 *  - 'aprobar'   → aprobada_coord + botones a la PERSONA (¿la tomás?).
 *  - 'rechazar'  → rechazada(coordinador) + tarea vuelve a 'pendiente'.
 *  - 'reasignar' → re-propone al siguiente candidato (nice-to-have).
 */
export async function coordinatorRespond(
	assignment_id: string,
	decision: "aprobar" | "reasignar" | "rechazar",
	new_person_id?: string,
	deps: Deps = defaultDeps,
): Promise<void> {
	const { db, send } = deps;

	if (decision === "aprobar") {
		const coord = (await db.listCoordinators())[0];
		const a = await db.setAssignmentStatus(assignment_id, "aprobada_coord", { coord_id: coord?.id });
		const task = (await db.listTasks()).find((t) => t.id === a.task_id);
		const person = await personById(db, a.person_id);
		if (person && task) {
			await send.sendButtons(person.wa_phone, `El equipo te propuso «${task.title}». ¿La tomás?`, [
				{ id: `approve:${a.id}`, title: "✅ La tomo" },
				{ id: `reject:${a.id}`, title: "❌ No puedo" },
			]);
		}
		return;
	}

	if (decision === "rechazar") {
		const a = await db.setAssignmentStatus(assignment_id, "rechazada", { rejected_by: "coordinador" });
		await db.setTaskStatus(a.task_id, "pendiente");
		return;
	}

	// 'reasignar' (nice-to-have): rechaza la actual y re-propone (excluyendo al candidato anterior).
	const a = await db.setAssignmentStatus(assignment_id, "rechazada", { rejected_by: "coordinador" });
	await proposeAssignment(a.task_id, deps, new_person_id ? [] : [a.person_id]);
}

/**
 * Respuesta de la PERSONA (SPEC-00 §4.3).
 *  - 'aprobada'  → aprobada + tarea activa + aviso al coordinador.
 *  - 'rechazada' → rechazada(persona) + re-propone al siguiente candidato.
 */
export async function respondToAssignment(
	assignment_id: string,
	decision: "aprobada" | "rechazada",
	deps: Deps = defaultDeps,
): Promise<void> {
	const { db, send } = deps;

	if (decision === "aprobada") {
		const a = await db.setAssignmentStatus(assignment_id, "aprobada");
		await db.setTaskStatus(a.task_id, "aprobada");
		const coord = (await db.listCoordinators())[0];
		const person = await personById(db, a.person_id);
		if (coord) await send.sendText(coord.wa_phone, `${person?.name ?? "Alguien"} tomó la tarea ✅`);
		return;
	}

	const a = await db.setAssignmentStatus(assignment_id, "rechazada", { rejected_by: "persona" });
	// Re-propone al siguiente candidato, excluyendo a quien rechazó.
	await proposeAssignment(a.task_id, deps, [a.person_id]);
}

/**
 * Rutea un botón por su prefijo (SPEC-00 §5). Prefijo desconocido (ej. onboarding cap:*) →
 * se reenvía a runAgent como texto.
 */
export async function handleButton(waPhone: string, id: string, deps: Deps = defaultDeps): Promise<void> {
	const sep = id.indexOf(":");
	const prefix = sep === -1 ? id : id.slice(0, sep);
	const arg = sep === -1 ? "" : id.slice(sep + 1);

	switch (prefix) {
		case "coord_approve":
			return coordinatorRespond(arg, "aprobar", undefined, deps);
		case "coord_reject":
			return coordinatorRespond(arg, "rechazar", undefined, deps);
		case "coord_reassign":
			return coordinatorRespond(arg, "reasignar", undefined, deps);
		case "approve":
			return respondToAssignment(arg, "aprobada", deps);
		case "reject":
			return respondToAssignment(arg, "rechazada", deps);
		case "done":
			return startImpactFlow(waPhone, arg, deps);
		default:
			// cap:* y cualquier id fuera del contrato → al agente como texto.
			return runAgent(waPhone, id, deps);
	}
}
