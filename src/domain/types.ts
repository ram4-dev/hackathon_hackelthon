export type Priority = "low" | "med" | "high";
export type TaskStatus = "open" | "done";
export type ConversationMode = "onboarding" | "import" | "active";
export type SourceType =
	| "text"
	| "audio"
	| "image"
	| "document"
	| "video"
	| "interactive"
	| "unknown";

export type Organization = {
	id: string;
	name: string;
	inviteCode: string;
	createdAt: string;
};

export type Member = {
	id: string;
	orgId: string;
	phone: string;
	name: string;
	role: string;
	createdAt: string;
};

export type Task = {
	id: string;
	orgId: string;
	title: string;
	assigneeMemberId: string | null;
	dueDate: string | null;
	priority: Priority;
	status: TaskStatus;
	source: "import" | "chat";
	createdAt: string;
};

export type ImportStagingItem = {
	id: string;
	orgId: string;
	sourceType: SourceType;
	rawText: string;
	mediaRef: string | null;
	createdAt: string;
};

export type ConversationState = {
	phone: string;
	orgId: string | null;
	mode: ConversationMode;
	step: string;
	scratch: Record<string, unknown>;
	updatedAt: string;
};

export type PendingImportTask = {
	title: string;
	assignee: string | null;
	assigneeMemberId?: string | null;
	dueDate: string | null;
	priority: Priority;
};

export type PendingImportMember = {
	name: string;
	role: string | null;
};

export type PendingImportBatch = {
	id: string;
	orgId: string;
	tasks: PendingImportTask[];
	members: PendingImportMember[];
	status: "pending" | "applied" | "cancelled";
	createdAt: string;
};

export type Reminder = {
	id: string;
	orgId: string;
	taskId: string;
	recipientPhone: string;
	when: string;
	status: "pending" | "sent" | "blocked_template_required";
	createdAt: string;
};

// --- SPEC-00 Types ---
export type Capacity = "baja" | "media" | "alta";

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

export type TaskStatus =
	| "pendiente"
	| "propuesta"
	| "aprobada"
	| "en_curso"
	| "hecha"
	| "bloqueada";

export type Priority = "baja" | "media" | "alta";

export type TaskType =
	| "charla"
	| "informe"
	| "difusion"
	| "atencion"
	| "gestion"
	| "recaudacion"
	| "otro";

export interface SpecTask {
	id: string;
	title: string;
	description?: string;
	task_type?: TaskType;
	priority: Priority;
	required_skills: string[];
	effort: number;
	deadline?: string;
	status: TaskStatus;
	created_by?: string;
	created_at: string;
}

export interface Assignment {
	id: string;
	task_id: string;
	person_id: string;
	status: string;
	reason?: string;
	coord_id?: string;
	coord_decision_at?: string;
	rejected_by?: string;
	proposed_at: string;
	responded_at?: string;
}

export interface ImpactReportSummary {
	headline?: string;
	created_at: string;
}

export interface Board {
	columns: Record<TaskStatus, SpecTask[]>;
	pending_approval: Assignment[];
	alerts: SpecTask[];
	recent_impact: ImpactReportSummary[];
}

// --- SPEC-D.5 Types ---
export type AssignmentStatus =
	| "propuesta"
	| "aprobada_coord"
	| "aprobada"
	| "rechazada";

export interface PersonLoad {
	id: string;
	name: string;
	capacity: Capacity;
	active_effort: number;
	active_tasks: number;
}

