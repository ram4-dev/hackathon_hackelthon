import { createClient } from "@supabase/supabase-js";
import type {
	Person,
	Capacity,
	SpecTask,
	TaskStatus,
	Priority,
	TaskType,
	Assignment,
	Board,
	ImpactReportSummary,
} from "../domain/types";

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

export const supabase = createClient(supabaseUrl, supabaseKey);

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
};
