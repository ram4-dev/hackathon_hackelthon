import { createRequire } from "node:module";
import type {
	Person,
	Capacity,
	SpecTask,
	TaskStatus,
	Priority,
	TaskType,
	Assignment,
	AssignmentStatus,
	Board,
	ImpactReportSummary,
	PersonLoad,
	ImpactReport,
	OrgImpact,
	KnowledgeEntry,
	KnowledgeKind,
	Session,
	Message,
	MessageRole,
} from "../domain/types.js";

const ASSIGNMENT_STATUSES: AssignmentStatus[] = [
	"propuesta",
	"aprobada_coord",
	"aprobada",
	"rechazada",
];

const TASK_STATUSES: TaskStatus[] = [
	"pendiente",
	"propuesta",
	"aprobada",
	"en_curso",
	"hecha",
	"bloqueada",
];

const PRIORITIES: Priority[] = ["baja", "media", "alta"];

const TASK_TYPES: TaskType[] = [
	"charla",
	"informe",
	"difusion",
	"atencion",
	"gestion",
	"recaudacion",
	"otro",
];

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const require = createRequire(import.meta.url);

type SupabaseLike = {
	from(table: string): any;
};

let runtimeSupabase: SupabaseLike | null = null;

function getRuntimeSupabase(): SupabaseLike {
	if (!runtimeSupabase) {
		const { createClient } = require("@supabase/supabase-js") as {
			createClient(url: string, key: string): SupabaseLike;
		};
		runtimeSupabase = createClient(supabaseUrl, supabaseKey);
	}
	return runtimeSupabase;
}

export const supabase: SupabaseLike = {
	from(table: string) {
		return getRuntimeSupabase().from(table);
	},
};

export const db = {
	async upsertPerson(input: {
		wa_phone: string;
		name?: string;
		role?: string;
		skills?: string[];
		capacity?: Capacity;
		is_coordinator?: boolean;
	}): Promise<Person> {
		// Try to find the person first
		const { data: existing, error: findError } = await supabase
			.from("people")
			.select("*")
			.eq("wa_phone", input.wa_phone)
			.maybeSingle();

		if (findError) throw findError;

		if (existing) {
			// Update: merge semantics. We only update provided fields.
			const patch: any = {};
			if (input.name !== undefined) patch.name = input.name;
			if (input.role !== undefined) patch.role = input.role;
			if (input.skills !== undefined) patch.skills = input.skills;
			if (input.capacity !== undefined) patch.capacity = input.capacity;
			if (input.is_coordinator !== undefined) patch.is_coordinator = input.is_coordinator;

			// If no new fields to update, return the existing person
			if (Object.keys(patch).length === 0) {
				return existing as Person;
			}

			const { data, error } = await supabase
				.from("people")
				.update(patch)
				.eq("wa_phone", input.wa_phone)
				.select()
				.single();

			if (error) throw error;
			return data as Person;
		} else {
			// Insert: apply defaults
			const payload = {
				wa_phone: input.wa_phone,
				name: input.name ?? input.wa_phone,
				role: input.role,
				skills: input.skills ?? [],
				capacity: input.capacity ?? "media",
				is_coordinator: input.is_coordinator ?? false,
				active: true,
				timezone: "America/Argentina/Buenos_Aires",
			};

			const { data, error } = await supabase
				.from("people")
				.insert(payload)
				.select()
				.single();

			if (error) throw error;
			return data as Person;
		}
	},

	async getPersonByPhone(wa_phone: string): Promise<Person | null> {
		const { data, error } = await supabase
			.from("people")
			.select("*")
			.eq("wa_phone", wa_phone)
			.maybeSingle();

		if (error) throw error;
		return data as Person | null;
	},

	async listCoordinators(): Promise<Person[]> {
		const { data, error } = await supabase
			.from("people")
			.select("*")
			.eq("is_coordinator", true)
			.eq("active", true);

		if (error) throw error;
		return data as Person[];
	},

	async listPeople(filter?: { active?: boolean }): Promise<Person[]> {
		let query = supabase.from("people").select("*");
		if (filter?.active !== undefined) {
			query = query.eq("active", filter.active);
		}

		const { data, error } = await query;
		if (error) throw error;
		return (data ?? []) as Person[];
	},

	// --- SPEC-D.4 ---

	async createTask(input: {
		title: string;
		description?: string;
		task_type?: TaskType;
		priority?: Priority;
		required_skills?: string[];
		effort?: number;
		deadline?: string;
		created_by?: string;
	}): Promise<SpecTask> {
		if (input.priority && !PRIORITIES.includes(input.priority)) {
			throw new Error(`Invalid priority: ${input.priority}`);
		}
		if (input.task_type && !TASK_TYPES.includes(input.task_type)) {
			throw new Error(`Invalid task_type: ${input.task_type}`);
		}

		const payload = {
			title: input.title,
			description: input.description,
			task_type: input.task_type,
			priority: input.priority ?? "media",
			required_skills: input.required_skills ?? [],
			effort: input.effort ?? 1,
			deadline: input.deadline,
			status: "pendiente" as TaskStatus,
			created_by: input.created_by,
		};

		const { data, error } = await supabase
			.from("tasks")
			.insert(payload)
			.select()
			.single();

		if (error) throw error;
		return data as SpecTask;
	},

	async listTasks(filter?: {
		status?: TaskStatus;
		person_id?: string;
	}): Promise<SpecTask[]> {
		if (filter?.status && !TASK_STATUSES.includes(filter.status)) {
			throw new Error(`Invalid status: ${filter.status}`);
		}

		if (filter?.person_id) {
			// Tasks with an approved assignment for this person
			let query = supabase
				.from("tasks")
				.select("*, assignments!inner(person_id, status)")
				.eq("assignments.person_id", filter.person_id)
				.eq("assignments.status", "aprobada")
				.order("created_at", { ascending: false });

			if (filter.status) {
				query = query.eq("status", filter.status);
			}

			const { data, error } = await query;
			if (error) throw error;
			return (data ?? []) as SpecTask[];
		}

		let query = supabase
			.from("tasks")
			.select("*")
			.order("created_at", { ascending: false });

		if (filter?.status) {
			query = query.eq("status", filter.status);
		}

		const { data, error } = await query;
		if (error) throw error;
		return (data ?? []) as SpecTask[];
	},

	async setTaskStatus(task_id: string, status: TaskStatus): Promise<SpecTask> {
		if (!TASK_STATUSES.includes(status)) {
			throw new Error(`Invalid status: ${status}`);
		}

		const { data, error } = await supabase
			.from("tasks")
			.update({ status })
			.eq("id", task_id)
			.select()
			.single();

		if (error) throw error;
		if (!data) throw new Error(`Task not found: ${task_id}`);
		return data as SpecTask;
	},

	async getBoard(): Promise<Board> {
		const columns: Record<TaskStatus, SpecTask[]> = {
			pendiente: [],
			propuesta: [],
			aprobada: [],
			en_curso: [],
			hecha: [],
			bloqueada: [],
		};

		const now = new Date();
		const deadline24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

		const [tasksResult, assignmentsResult, impactResult] = await Promise.all([
			supabase.from("tasks").select("*").order("created_at", { ascending: false }),
			supabase
				.from("assignments")
				.select("*, tasks(title)")
				.eq("status", "propuesta")
				.order("proposed_at", { ascending: true }),
			supabase
				.from("impact_reports")
				.select("headline, created_at")
				.order("created_at", { ascending: false })
				.limit(5),
		]);

		if (tasksResult.error) throw tasksResult.error;
		if (assignmentsResult.error) throw assignmentsResult.error;
		if (impactResult.error) throw impactResult.error;

		const tasks = (tasksResult.data ?? []) as SpecTask[];
		for (const task of tasks) {
			if (columns[task.status] !== undefined) {
				columns[task.status].push(task);
			}
		}

		const alerts = tasks.filter(
			(t) => t.deadline && t.deadline < deadline24h && t.status !== "hecha"
		);
		alerts.sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1));

		return {
			columns,
			pending_approval: (assignmentsResult.data ?? []) as Assignment[],
			alerts,
			recent_impact: (impactResult.data ?? []) as ImpactReportSummary[],
		};
	},

	// --- SPEC-D.5 ---

	async insertAssignment(input: {
		task_id: string;
		person_id: string;
		reason?: string;
	}): Promise<Assignment> {
		const payload = {
			task_id: input.task_id,
			person_id: input.person_id,
			reason: input.reason,
			status: "propuesta" as AssignmentStatus,
			proposed_at: new Date().toISOString(),
		};

		const { data, error } = await supabase
			.from("assignments")
			.insert(payload)
			.select()
			.single();

		if (error) throw error;
		return data as Assignment;
	},

	async getAssignment(id: string): Promise<Assignment | null> {
		const { data, error } = await supabase
			.from("assignments")
			.select("*")
			.eq("id", id)
			.maybeSingle();

		if (error) throw error;
		return data as Assignment | null;
	},

	async setAssignmentStatus(
		id: string,
		status: AssignmentStatus,
		opts?: { coord_id?: string; rejected_by?: string }
	): Promise<Assignment> {
		if (!ASSIGNMENT_STATUSES.includes(status)) {
			throw new Error(`Invalid assignment status: ${status}`);
		}

		const patch: Record<string, unknown> = { status };

		if (status === "aprobada_coord") {
			if (!opts?.coord_id) throw new Error("coord_id required for aprobada_coord");
			patch.coord_id = opts.coord_id;
			patch.coord_decision_at = new Date().toISOString();
		}

		if (status === "aprobada") {
			patch.responded_at = new Date().toISOString();
		}

		if (status === "rechazada") {
			if (!opts?.rejected_by) throw new Error("rejected_by required for rechazada");
			patch.rejected_by = opts.rejected_by;
			patch.responded_at = new Date().toISOString();
		}

		const { data, error } = await supabase
			.from("assignments")
			.update(patch)
			.eq("id", id)
			.select()
			.single();

		if (error) throw error;
		if (!data) throw new Error(`Assignment not found: ${id}`);
		return data as Assignment;
	},

	async readPersonLoad(): Promise<PersonLoad[]> {
		const { data, error } = await supabase
			.from("person_load")
			.select("*");

		if (error) throw error;
		return (data ?? []) as PersonLoad[];
	},

	// --- SPEC-D.6 ---

	async insertImpactReport(input: {
		task_id: string;
		reported_by?: string;
		task_type?: TaskType;
		inputs?: Record<string, unknown>;
		outputs?: Record<string, unknown>;
		outcome?: string;
		headline?: string;
		raw_answers?: Record<string, unknown>;
		summary?: string;
	}): Promise<ImpactReport> {
		const payload = {
			task_id: input.task_id,
			reported_by: input.reported_by,
			task_type: input.task_type,
			inputs: input.inputs ?? {},
			outputs: input.outputs ?? {},
			outcome: input.outcome,
			headline: input.headline,
			raw_answers: input.raw_answers ?? {},
			summary: input.summary,
		};

		const { data, error } = await supabase
			.from("impact_reports")
			.insert(payload)
			.select()
			.single();

		if (error) throw error;
		return data as ImpactReport;
	},

	async getImpactReport(task_id: string): Promise<ImpactReport | null> {
		const { data, error } = await supabase
			.from("impact_reports")
			.select("*")
			.eq("task_id", task_id)
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle();

		if (error) throw error;
		return data as ImpactReport | null;
	},

	async getOrgImpact(): Promise<OrgImpact> {
		const { data, error } = await supabase
			.from("impact_reports")
			.select("headline, task_type")
			.order("created_at", { ascending: false });

		if (error) throw error;

		const rows = (data ?? []) as { headline?: string; task_type?: string }[];
		const headlines = rows.flatMap((r) => (r.headline ? [r.headline] : []));
		const by_type: Record<string, number> = {};
		for (const r of rows) {
			if (r.task_type) {
				by_type[r.task_type] = (by_type[r.task_type] ?? 0) + 1;
			}
		}

		return { headlines, by_type };
	},

	// --- SPEC-D.7 ---

	async loadKnowledge(): Promise<KnowledgeEntry[]> {
		const { data, error } = await supabase
			.from("knowledge")
			.select("*")
			.order("created_at", { ascending: true });

		if (error) throw error;
		return (data ?? []) as KnowledgeEntry[];
	},

	async addKnowledge(input: {
		content: string;
		kind?: KnowledgeKind;
		tags?: string[];
		source?: string;
	}): Promise<KnowledgeEntry> {
		const payload = {
			content: input.content,
			kind: input.kind ?? "hecho",
			tags: input.tags ?? [],
			source: input.source,
		};

		const { data, error } = await supabase
			.from("knowledge")
			.insert(payload)
			.select()
			.single();

		if (error) throw error;
		return data as KnowledgeEntry;
	},

	async updateKnowledge(
		id: string,
		patch: Partial<Pick<KnowledgeEntry, "content" | "tags" | "kind" | "source">>
	): Promise<KnowledgeEntry> {
		if (Object.keys(patch).length === 0) {
			throw new Error("updateKnowledge: patch must have at least one field");
		}

		const { data, error } = await supabase
			.from("knowledge")
			.update(patch)
			.eq("id", id)
			.select()
			.single();

		if (error) throw error;
		if (!data) throw new Error(`Knowledge entry not found: ${id}`);
		return data as KnowledgeEntry;
	},

	// --- SPEC-D.8 ---

	async getSession(wa_phone: string): Promise<Session | null> {
		const { data, error } = await supabase
			.from("sessions")
			.select("*")
			.eq("wa_phone", wa_phone)
			.maybeSingle();

		if (error) throw error;
		return data as Session | null;
	},

	async setSession(
		wa_phone: string,
		state: string | null,
		context: Record<string, unknown>
	): Promise<Session> {
		const payload = {
			wa_phone,
			state,
			context,
			updated_at: new Date().toISOString(),
		};

		const { data, error } = await supabase
			.from("sessions")
			.upsert(payload, { onConflict: "wa_phone" })
			.select()
			.single();

		if (error) throw error;
		return data as Session;
	},

	async clearSession(wa_phone: string): Promise<void> {
		const { error } = await supabase
			.from("sessions")
			.delete()
			.eq("wa_phone", wa_phone);

		if (error) throw error;
	},

	async loadHistory(wa_phone: string, n = 20): Promise<Message[]> {
		// Fetch last n rows desc, then reverse for chronological order
		const { data, error } = await supabase
			.from("messages")
			.select("*")
			.eq("wa_phone", wa_phone)
			.order("created_at", { ascending: false })
			.limit(n);

		if (error) throw error;
		return ((data ?? []) as Message[]).reverse();
	},

	async appendHistory(
		wa_phone: string,
		role: MessageRole,
		content: string
	): Promise<Message> {
		const { data, error } = await supabase
			.from("messages")
			.insert({ wa_phone, role, content })
			.select()
			.single();

		if (error) throw error;
		return data as Message;
	},

	async wasProcessed(message_id: string): Promise<boolean> {
		const { data, error } = await supabase
			.from("processed_messages")
			.select("message_id")
			.eq("message_id", message_id)
			.maybeSingle();

		if (error) throw error;
		return data !== null;
	},

	async markProcessed(message_id: string): Promise<void> {
		const { error } = await supabase
			.from("processed_messages")
			.insert({ message_id });

		// Ignore duplicate key — idempotent by design
		if (error && error.code !== "23505") throw error;
	},
};
