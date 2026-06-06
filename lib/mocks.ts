// lib/mocks.ts — Implementaciones triviales en memoria de `db.*` (Data) y
// `sendText/Buttons/List` (Backend). Esto es lo que desbloquea el trabajo en
// paralelo (SPEC-00 §9.2). Al integrar, Data reemplaza el `db` por lib/db.ts y
// Backend reemplaza el `send` por lib/kapso.ts — mismas firmas (lib/contracts.ts).
//
// Notas de fidelidad al contrato:
//  - ids deterministas (person_1, task_1, …) para tests reproducibles.
//  - person_load calculado igual que la vista SQL de SPEC-00 §3.
//  - getBoard agrupa por TaskStatus (todas las claves), alerts < now+24h, etc.

import type {
	Assignment,
	AssignmentStatus,
	Board,
	ImpactReport,
	Knowledge,
	Message,
	Person,
	PersonLoad,
	Session,
	Task,
	TaskStatus,
	TaskType,
} from "../types.js";
import type { Db, Send } from "./contracts.js";

const TASK_STATUSES: TaskStatus[] = ["pendiente", "propuesta", "aprobada", "en_curso", "hecha", "bloqueada"];
const AR_TZ = "America/Argentina/Buenos_Aires";
const now = () => new Date().toISOString();

interface MockState {
	people: Person[];
	tasks: Task[];
	assignments: Assignment[];
	knowledge: Knowledge[];
	impacts: ImpactReport[];
	sessions: Map<string, Session>;
	messages: Message[];
	processed: Set<string>;
	seq: Record<string, number>;
}

function emptyState(): MockState {
	return {
		people: [],
		tasks: [],
		assignments: [],
		knowledge: [],
		impacts: [],
		sessions: new Map(),
		messages: [],
		processed: new Set(),
		seq: {},
	};
}

function nextId(state: MockState, prefix: string): string {
	state.seq[prefix] = (state.seq[prefix] ?? 0) + 1;
	return `${prefix}_${state.seq[prefix]}`;
}

/** Carga real por persona — réplica de la vista `person_load` (SPEC-00 §3). */
function computeLoad(state: MockState): PersonLoad[] {
	return state.people.map((p) => {
		const taskIds = state.assignments
			.filter((a) => a.person_id === p.id && a.status === "aprobada")
			.map((a) => a.task_id);
		const active = state.tasks.filter(
			(t) => taskIds.includes(t.id) && (t.status === "aprobada" || t.status === "en_curso"),
		);
		return {
			id: p.id,
			name: p.name,
			capacity: p.capacity,
			active_effort: active.reduce((s, t) => s + t.effort, 0),
			active_tasks: active.length,
		};
	});
}

export function createMockDb(opts: { seed?: boolean } = {}): Db {
	const state = emptyState();
	if (opts.seed) seedDemo(state);

	const db: Db = {
		// --- Personas ---
		async upsertPerson(input) {
			const existing = state.people.find((p) => p.wa_phone === input.wa_phone);
			if (existing) {
				if (input.name !== undefined) existing.name = input.name;
				if (input.role !== undefined) existing.role = input.role;
				if (input.skills !== undefined) existing.skills = input.skills;
				if (input.capacity !== undefined) existing.capacity = input.capacity;
				if (input.is_coordinator !== undefined) existing.is_coordinator = input.is_coordinator;
				return { ...existing };
			}
			const person: Person = {
				id: nextId(state, "person"),
				wa_phone: input.wa_phone,
				name: input.name ?? "",
				role: input.role,
				skills: input.skills ?? [],
				capacity: input.capacity ?? "media",
				is_coordinator: input.is_coordinator ?? false,
				timezone: AR_TZ,
				active: true,
				created_at: now(),
			};
			state.people.push(person);
			return { ...person };
		},
		async getPersonByPhone(wa_phone) {
			const p = state.people.find((x) => x.wa_phone === wa_phone);
			return p ? { ...p } : null;
		},
		async listCoordinators() {
			return state.people.filter((p) => p.is_coordinator && p.active).map((p) => ({ ...p }));
		},
		async listPeople(filter) {
			let rows = state.people;
			if (filter?.active !== undefined) rows = rows.filter((p) => p.active === filter.active);
			return rows.map((p) => ({ ...p }));
		},

		// --- Tareas ---
		async createTask(input) {
			const task: Task = {
				id: nextId(state, "task"),
				title: input.title,
				description: input.description,
				task_type: input.task_type,
				priority: input.priority ?? "media",
				required_skills: input.required_skills ?? [],
				effort: input.effort ?? 1,
				deadline: input.deadline,
				status: "pendiente",
				created_by: input.created_by,
				created_at: now(),
			};
			state.tasks.push(task);
			return { ...task };
		},
		async listTasks(filter) {
			let rows = state.tasks;
			if (filter?.status) rows = rows.filter((t) => t.status === filter.status);
			if (filter?.person_id) {
				const taskIds = state.assignments
					.filter((a) => a.person_id === filter.person_id && a.status !== "rechazada")
					.map((a) => a.task_id);
				rows = rows.filter((t) => taskIds.includes(t.id));
			}
			return rows.map((t) => ({ ...t }));
		},
		async setTaskStatus(task_id, status) {
			if (!TASK_STATUSES.includes(status)) throw new Error(`status inválido: ${status}`);
			const t = state.tasks.find((x) => x.id === task_id);
			if (!t) throw new Error(`task no encontrada: ${task_id}`);
			t.status = status;
			return { ...t };
		},
		async getBoard() {
			const columns = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as Task[]])) as Record<
				TaskStatus,
				Task[]
			>;
			for (const t of state.tasks) columns[t.status].push({ ...t });
			const soon = Date.now() + 24 * 60 * 60 * 1000;
			const alerts = state.tasks
				.filter((t) => t.status !== "hecha" && t.deadline && new Date(t.deadline).getTime() < soon)
				.map((t) => ({ ...t }));
			const recent_impact = [...state.impacts]
				.sort((a, b) => b.created_at.localeCompare(a.created_at))
				.slice(0, 5)
				.map((r) => ({ headline: r.headline, created_at: r.created_at }));
			const pending_approval = state.assignments
				.filter((a) => a.status === "propuesta")
				.map((a) => ({ ...a }));
			const board: Board = { columns, pending_approval, alerts, recent_impact };
			return board;
		},

		// --- Asignaciones ---
		async insertAssignment(input) {
			const a: Assignment = {
				id: nextId(state, "assign"),
				task_id: input.task_id,
				person_id: input.person_id,
				status: "propuesta",
				reason: input.reason,
				proposed_at: now(),
			};
			state.assignments.push(a);
			return { ...a };
		},
		async getAssignment(id) {
			const a = state.assignments.find((x) => x.id === id);
			return a ? { ...a } : null;
		},
		async setAssignmentStatus(id, status: AssignmentStatus, patch) {
			const a = state.assignments.find((x) => x.id === id);
			if (!a) throw new Error(`assignment no encontrada: ${id}`);
			a.status = status;
			if (status === "aprobada_coord") {
				if (patch?.coord_id) a.coord_id = patch.coord_id;
				a.coord_decision_at = now();
			}
			if (status === "aprobada") a.responded_at = now();
			if (status === "rechazada" && patch?.rejected_by) a.rejected_by = patch.rejected_by;
			return { ...a };
		},
		async readPersonLoad() {
			return computeLoad(state);
		},

		// --- Impacto ---
		async insertImpactReport(input) {
			const r: ImpactReport = { ...input, id: nextId(state, "impact"), created_at: now() };
			state.impacts.push(r);
			return { ...r };
		},
		async getImpactReport(task_id) {
			const rows = state.impacts.filter((r) => r.task_id === task_id);
			return rows.length ? { ...rows[rows.length - 1] } : null;
		},
		async getOrgImpact(filter) {
			let rows = state.impacts;
			if (filter?.task_type) rows = rows.filter((r) => r.task_type === filter.task_type);
			const by_type: Record<string, number> = {};
			for (const r of rows) {
				const k = r.task_type ?? "otro";
				by_type[k] = (by_type[k] ?? 0) + 1;
			}
			const headlines = rows
				.filter((r): r is ImpactReport & { headline: string } => Boolean(r.headline))
				.map((r) => r.headline);
			return { headlines, by_type };
		},

		// --- Conocimiento ---
		async loadKnowledge() {
			return state.knowledge.map((k) => ({ ...k }));
		},
		async addKnowledge(input) {
			const k: Knowledge = {
				id: nextId(state, "kb"),
				content: input.content,
				kind: input.kind ?? "hecho",
				tags: input.tags ?? [],
				source: input.source,
				created_at: now(),
			};
			state.knowledge.push(k);
			return { ...k };
		},
		async updateKnowledge(id, patch) {
			const k = state.knowledge.find((x) => x.id === id);
			if (!k) throw new Error(`knowledge no encontrado: ${id}`);
			if (patch.content !== undefined) k.content = patch.content;
			if (patch.tags !== undefined) k.tags = patch.tags;
			if (patch.kind !== undefined) k.kind = patch.kind;
			return { ...k };
		},

		// --- Sesiones / historial / idempotencia ---
		async getSession(wa_phone) {
			const s = state.sessions.get(wa_phone);
			return s ? { ...s } : null;
		},
		async setSession(wa_phone, stateName, context) {
			const s: Session = { wa_phone, state: stateName, context, updated_at: now() };
			state.sessions.set(wa_phone, s);
			return { ...s };
		},
		async clearSession(wa_phone) {
			state.sessions.delete(wa_phone);
		},
		async loadHistory(wa_phone, n = 20) {
			return state.messages.filter((m) => m.wa_phone === wa_phone).slice(-n).map((m) => ({ ...m }));
		},
		async appendHistory(wa_phone, role, content) {
			state.messages.push({ wa_phone, role, content, created_at: now() });
		},
		async wasProcessed(message_id) {
			return state.processed.has(message_id);
		},
		async markProcessed(message_id) {
			state.processed.add(message_id);
		},
	};

	return db;
}

// --- Send mock (Backend) -----------------------------------------------------

export type OutboxItem =
	| { kind: "text"; to: string; body: string }
	| { kind: "buttons"; to: string; body: string; buttons: { id: string; title: string }[] }
	| { kind: "list"; to: string; body: string; rows: { id: string; title: string; description?: string }[] };

export interface MockSend extends Send {
	outbox: OutboxItem[];
	reset(): void;
}

export function createMockSend(opts: { log?: boolean } = {}): MockSend {
	const outbox: OutboxItem[] = [];
	const log = (item: OutboxItem) => {
		if (opts.log) console.log(`📤 [${item.kind}→${item.to}] ${item.body}`);
	};
	return {
		outbox,
		reset() {
			outbox.length = 0;
		},
		async sendText(to, body) {
			const item: OutboxItem = { kind: "text", to, body };
			outbox.push(item);
			log(item);
		},
		async sendButtons(to, body, buttons) {
			const item: OutboxItem = { kind: "buttons", to, body, buttons: buttons.slice(0, 3) };
			outbox.push(item);
			log(item);
			if (opts.log) for (const b of item.buttons) console.log(`     [${b.id}] ${b.title}`);
		},
		async sendList(to, body, rows) {
			const item: OutboxItem = { kind: "list", to, body, rows: rows.slice(0, 10) };
			outbox.push(item);
			log(item);
			if (opts.log) for (const r of item.rows) console.log(`     • ${r.title}${r.description ? ` — ${r.description}` : ""}`);
		},
	};
}

// --- Seed de demo (SPEC-D.2) -------------------------------------------------

function seedDemo(state: MockState): void {
	const make = (
		wa_phone: string,
		name: string,
		role: string,
		skills: string[],
		capacity: Person["capacity"],
		is_coordinator = false,
	): Person => {
		const p: Person = {
			id: nextId(state, "person"),
			wa_phone,
			name,
			role,
			skills,
			capacity,
			is_coordinator,
			timezone: AR_TZ,
			active: true,
			created_at: now(),
		};
		state.people.push(p);
		return p;
	};

	make("5491100000001", "Ana", "Coordinación", ["gestion", "coordinacion"], "media", true);
	make("5491100000002", "Beto", "Comunicación", ["redaccion", "informes", "datos"], "alta");
	make("5491100000003", "Caro", "Difusión", ["comunicacion", "difusion", "redes"], "media");
	make("5491100000004", "Dani", "Territorio", ["logistica", "atencion", "campo"], "baja");

	const kb: { content: string; kind: Knowledge["kind"]; tags: string[] }[] = [
		{ content: "La ONG se llama Manos Solidarias y trabaja en el oeste del conurbano bonaerense.", kind: "hecho", tags: ["org"] },
		{ content: "Los informes a donantes se entregan en PDF y se mandan por mail antes de fin de mes.", kind: "proceso", tags: ["informes", "donantes"] },
		{ content: "Las charlas se dan los sábados a la mañana en el centro comunitario.", kind: "proceso", tags: ["charlas"] },
		{ content: "Política: toda asignación de tarea la aprueba un coordinador antes de avisarle a la persona.", kind: "politica", tags: ["gobernanza"] },
	];
	for (const k of kb) {
		state.knowledge.push({
			id: nextId(state, "kb"),
			content: k.content,
			kind: k.kind,
			tags: k.tags,
			source: "seed",
			created_at: now(),
		});
	}

	// Una tarea pendiente para que el tablero no venga vacío.
	state.tasks.push({
		id: nextId(state, "task"),
		title: "Difundir la colecta de invierno en redes",
		description: "Armar posteos y stories para la colecta de abrigos.",
		task_type: "difusion",
		priority: "media",
		required_skills: ["difusion", "redes"],
		effort: 2,
		status: "pendiente",
		created_at: now(),
	});
}

// --- Singletons para runtime/harness (punto de swap en lib/deps.ts) ----------

/** db en memoria, seedeado. Data lo reemplaza por el `db` real de lib/db.ts. */
export const db: Db = createMockDb({ seed: true });

/** send que loguea. Backend lo reemplaza por lib/kapso.ts. */
const _send = createMockSend({ log: true });
export const outbox = _send.outbox;
export const sendText = _send.sendText.bind(_send);
export const sendButtons = _send.sendButtons.bind(_send);
export const sendList = _send.sendList.bind(_send);
