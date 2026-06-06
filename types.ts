// SPEC-00 §2 — Tipos compartidos (la fuente de verdad del contrato).
// Owner: Data. Reproducido acá tal cual SPEC-00 para que Backend/ML/Data
// programen contra las mismas firmas. NO cambiar sin actualizar SPEC-00 primero.

export type TaskStatus = "pendiente" | "propuesta" | "aprobada" | "en_curso" | "hecha" | "bloqueada";
export type AssignmentStatus = "propuesta" | "aprobada_coord" | "aprobada" | "rechazada";
export type Capacity = "baja" | "media" | "alta";
export type Priority = "baja" | "media" | "alta";
export type TaskType = "charla" | "informe" | "difusion" | "atencion" | "gestion" | "recaudacion" | "otro";

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
