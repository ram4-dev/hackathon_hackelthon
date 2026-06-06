// Interfaces de los puertos que ML consume (SPEC-00 §4.1 y §4.2).
// `Db`   → lo implementa Data en lib/db.ts (hoy: lib/mocks.ts).
// `Send` → lo implementa Backend en lib/kapso.ts (hoy: lib/mocks.ts).
// ML programa contra estas firmas; al integrar solo cambia el import en lib/deps.ts.

import type {
	Assignment,
	AssignmentStatus,
	Board,
	Capacity,
	ImpactReport,
	Knowledge,
	Message,
	Person,
	PersonLoad,
	Priority,
	Session,
	Task,
	TaskStatus,
	TaskType,
} from "../types.js";

// SPEC-00 §4.1 — Capa de datos (owner: Data)
export interface Db {
	// Personas
	upsertPerson(input: {
		wa_phone: string;
		name?: string;
		role?: string;
		skills?: string[];
		capacity?: Capacity;
		is_coordinator?: boolean;
	}): Promise<Person>;
	getPersonByPhone(wa_phone: string): Promise<Person | null>;
	listCoordinators(): Promise<Person[]>;
	// SPEC-00 §4.1 — lo necesita scoreCandidates (skills por candidato; readPersonLoad no los trae).
	//   Data lo implementa en lib/db.ts como `select * from people where active`.
	listPeople(filter?: { active?: boolean }): Promise<Person[]>;

	// Tareas
	createTask(input: {
		title: string;
		description?: string;
		task_type?: TaskType;
		priority?: Priority;
		required_skills?: string[];
		effort?: number;
		deadline?: string;
		created_by?: string;
	}): Promise<Task>;
	listTasks(filter?: { status?: TaskStatus; person_id?: string }): Promise<Task[]>;
	setTaskStatus(task_id: string, status: TaskStatus): Promise<Task>;
	getBoard(): Promise<Board>;

	// Asignaciones
	insertAssignment(input: { task_id: string; person_id: string; reason?: string }): Promise<Assignment>;
	getAssignment(id: string): Promise<Assignment | null>;
	setAssignmentStatus(
		id: string,
		status: AssignmentStatus,
		patch?: { coord_id?: string; rejected_by?: "coordinador" | "persona" },
	): Promise<Assignment>;
	readPersonLoad(): Promise<PersonLoad[]>;

	// Impacto
	insertImpactReport(input: Omit<ImpactReport, "id" | "created_at">): Promise<ImpactReport>;
	getImpactReport(task_id: string): Promise<ImpactReport | null>;
	getOrgImpact(filter?: { task_type?: TaskType }): Promise<{ headlines: string[]; by_type: Record<string, number> }>;

	// Conocimiento (LLM Wiki: se carga entero, sin búsqueda)
	loadKnowledge(): Promise<Knowledge[]>;
	addKnowledge(input: { content: string; kind?: Knowledge["kind"]; tags?: string[]; source?: string }): Promise<Knowledge>;
	updateKnowledge(id: string, patch: Partial<Pick<Knowledge, "content" | "tags" | "kind">>): Promise<Knowledge>;

	// Sesiones / historial / idempotencia
	getSession(wa_phone: string): Promise<Session | null>;
	setSession(wa_phone: string, state: string | null, context: Record<string, unknown>): Promise<Session>;
	clearSession(wa_phone: string): Promise<void>;
	loadHistory(wa_phone: string, n?: number): Promise<Message[]>;
	appendHistory(wa_phone: string, role: "user" | "assistant", content: string): Promise<void>;
	wasProcessed(message_id: string): Promise<boolean>;
	markProcessed(message_id: string): Promise<void>;
}

// SPEC-00 §4.2 — Transporte WhatsApp (owner: Backend)
export interface Send {
	sendText(to: string, body: string): Promise<void>;
	sendButtons(to: string, body: string, buttons: { id: string; title: string }[]): Promise<void>; // ≤ 3
	sendList(
		to: string,
		body: string,
		rows: { id: string; title: string; description?: string }[],
	): Promise<void>; // ≤ 10
}
