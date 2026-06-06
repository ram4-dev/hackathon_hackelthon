// SPEC-M.5 — Propuesta + scoring.
// scoreCandidates: PURO y determinista (testeable con fixtures).
// proposeAssignment: scoring + insertAssignment('propuesta') + botones AL COORDINADOR.

import type { Assignment, Person, PersonLoad, Priority, Task } from "../types.js";
import { type Deps, defaultDeps } from "./deps.js";

const CAPACITY_RANK: Record<Person["capacity"], number> = { alta: 3, media: 2, baja: 1 };

interface Scored {
	person: Person;
	load: PersonLoad;
	matched: string[];
}

/**
 * SPEC-M.5: filtra por overlap de required_skills → elige menor active_effort →
 * desempata por capacity. Devuelve el mejor candidato con un `reason` legible.
 */
export function scoreCandidates(
	task: Task,
	load: PersonLoad[],
	people: Person[],
): { candidate: Person; reason: string } {
	const active = people.filter((p) => p.active);
	if (active.length === 0) throw new Error("No hay personas activas para asignar.");

	const loadById = new Map(load.map((l) => [l.id, l]));
	const zeroLoad = (p: Person): PersonLoad => ({
		id: p.id,
		name: p.name,
		capacity: p.capacity,
		active_effort: 0,
		active_tasks: 0,
	});

	const required = task.required_skills ?? [];
	const withMatch: Scored[] = active.map((p) => ({
		person: p,
		load: loadById.get(p.id) ?? zeroLoad(p),
		matched: required.filter((s) => p.skills.includes(s)),
	}));

	// Filtrá por overlap de skills; si NADIE matchea, caé a todos (siempre proponemos a alguien).
	const haveOverlap = withMatch.filter((c) => c.matched.length > 0);
	const skillFiltered = required.length > 0 && haveOverlap.length > 0;
	const pool = skillFiltered ? haveOverlap : withMatch;

	// Orden: más skills matcheados → menor esfuerzo activo → mayor capacidad → estable.
	pool.sort((a, b) => {
		if (b.matched.length !== a.matched.length) return b.matched.length - a.matched.length;
		if (a.load.active_effort !== b.load.active_effort) return a.load.active_effort - b.load.active_effort;
		return CAPACITY_RANK[b.person.capacity] - CAPACITY_RANK[a.person.capacity];
	});

	const best = pool[0];
	return { candidate: best.person, reason: buildReason(best, required, skillFiltered) };
}

function buildReason(best: Scored, required: string[], skillFiltered: boolean): string {
	const carga = `esfuerzo activo ${best.load.active_effort}, ${best.load.active_tasks} tarea${
		best.load.active_tasks === 1 ? "" : "s"
	}`;
	if (skillFiltered && best.matched.length > 0) {
		const skills = best.matched.length === 1 ? `el skill "${best.matched[0]}"` : `los skills ${best.matched.map((s) => `"${s}"`).join(", ")}`;
		return `${best.person.name} tiene ${skills} y es de las menos cargadas hoy (${carga}).`;
	}
	if (required.length > 0) {
		return `Nadie tiene exactamente los skills pedidos (${required.join(", ")}); propongo a ${best.person.name} por ser quien está más libre hoy (${carga}).`;
	}
	return `${best.person.name} es quien está más libre hoy (${carga}).`;
}

const PRIORITY_LABEL: Record<Priority, string> = { baja: "baja", media: "media", alta: "alta" };

/**
 * SPEC-M.5: crea la asignación 'propuesta' y le manda la propuesta al COORDINADOR
 * con botones coord_approve/coord_reject (ids según SPEC-00 §5).
 */
export async function proposeAssignment(
	task_id: string,
	deps: Deps = defaultDeps,
	excludePersonIds: string[] = [],
): Promise<{ assignment: Assignment; candidate: Person; reason: string }> {
	const { db, send } = deps;

	const task = (await db.listTasks()).find((t) => t.id === task_id);
	if (!task) throw new Error(`Tarea no encontrada: ${task_id}`);

	// Guard ANTES de mutar estado: sin coordinador no hay doble aprobación → fallo limpio.
	const coordinator = (await db.listCoordinators())[0];
	if (!coordinator) throw new Error("No hay coordinador configurado para aprobar la asignación.");

	// excludePersonIds: re-proponer al siguiente candidato cuando alguien ya rechazó esta tarea.
	const people = (await db.listPeople({ active: true })).filter((p) => !excludePersonIds.includes(p.id));
	const load = await db.readPersonLoad();
	const { candidate, reason } = scoreCandidates(task, load, people);

	const assignment = await db.insertAssignment({ task_id, person_id: candidate.id, reason });
	await db.setTaskStatus(task_id, "propuesta");

	const cload = load.find((l) => l.id === candidate.id);
	const deadlineTxt = task.deadline ? ` (vence ${formatDeadline(task.deadline)})` : "";
	const cargaTxt = cload ? `\nCarga de ${candidate.name}: ${cload.active_effort} de esfuerzo, ${cload.active_tasks} tareas activas.` : "";
	const body =
		`Propongo a *${candidate.name}* para «${task.title}»${deadlineTxt}.\n` +
		`Prioridad ${PRIORITY_LABEL[task.priority]}. ${reason}${cargaTxt}\n\n¿Aprobás la asignación?`;

	await send.sendButtons(coordinator.wa_phone, body, [
		{ id: `coord_approve:${assignment.id}`, title: "✅ Aprobar" },
		{ id: `coord_reject:${assignment.id}`, title: "❌ Rechazar" },
	]);

	return { assignment, candidate, reason };
}

function formatDeadline(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}
