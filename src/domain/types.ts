export type LegacyPriority = "low" | "med" | "high";
export type LegacyTaskStatus = "open" | "done";
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
	priority: LegacyPriority;
	status: LegacyTaskStatus;
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
	priority: LegacyPriority;
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

// --- SPEC-D.6 Types ---
export interface ImpactReport {
	id: string;
	task_id: string;
	reported_by?: string;
	task_type?: TaskType;
	inputs: Record<string, unknown>;
	outputs: Record<string, unknown>;
	outcome?: string;
	headline?: string;
	raw_answers: Record<string, unknown>;
	summary?: string;
	created_at: string;
}

export interface OrgImpact {
	headlines: string[];
	by_type: Partial<Record<TaskType, number>>;
}

// --- SPEC-D.8 Types ---
export interface Session {
	wa_phone: string;
	state: string | null;
	context: Record<string, unknown>;
	updated_at: string;
}

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
	id: number;
	wa_phone: string;
	role: MessageRole;
	content: string;
	created_at: string;
}

// --- SPEC-D.7 Types ---
export type KnowledgeKind = "hecho" | "politica" | "proceso";

export interface KnowledgeEntry {
	id: string;
	content: string;
	kind: KnowledgeKind;
	tags: string[];
	source?: string;
	created_at: string;
}

