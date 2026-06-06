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
