import { join } from "node:path";
import type {
	ConversationState,
	ImportStagingItem,
	Member,
	Organization,
	PendingImportBatch,
	Priority,
	Reminder,
	SourceType,
	Task,
	TaskStatus,
} from "../domain/types.js";
import { appendBlock, parseBlocks } from "./markdownBlocks.js";
import {
	parseTable,
	serializeTable,
	type MarkdownRow,
} from "./markdownTables.js";
import { makeId, makeInviteCode } from "./ids.js";
import { readTextFile, updateTextFile, writeTextFile } from "./files.js";

const MEMBER_HEADERS = ["id", "org_id", "phone", "name", "role", "created_at"];
const TASK_HEADERS = [
	"id",
	"org_id",
	"title",
	"assignee_member_id",
	"due_date",
	"priority",
	"status",
	"source",
	"created_at",
];
const PHONE_INDEX_HEADERS = ["phone", "org_id", "member_id"];
const INVITE_INDEX_HEADERS = ["invite_code", "org_id"];
const STATE_HEADERS = [
	"phone",
	"org_id",
	"mode",
	"step",
	"scratch_json",
	"updated_at",
];
const PROCESSED_HEADERS = ["key", "message_id", "processed_at"];
const REMINDER_HEADERS = [
	"id",
	"org_id",
	"task_id",
	"recipient_phone",
	"when",
	"status",
	"created_at",
];

export class MarkdownStore {
	constructor(private readonly dataDir: string) {}

	async createOrgWithAdmin(input: {
		name: string;
		adminPhone: string;
		adminName: string;
		adminRole?: string;
	}): Promise<{ org: Organization; admin: Member }> {
		const org: Organization = {
			id: makeId("org"),
			name: input.name,
			inviteCode: await this.makeUniqueInviteCode(),
			createdAt: now(),
		};
		const admin: Member = {
			id: makeId("mem"),
			orgId: org.id,
			phone: normalizePhone(input.adminPhone),
			name: input.adminName,
			role: input.adminRole ?? "admin",
			createdAt: now(),
		};

		await writeTextFile(this.orgFile(org.id, "org.md"), serializeOrg(org));
		await this.writeMembers(org.id, [admin]);
		await this.upsertRows(
			this.phoneIndexPath(),
			PHONE_INDEX_HEADERS,
			[{ phone: admin.phone, org_id: org.id, member_id: admin.id }],
			"phone",
		);
		await this.upsertRows(
			this.inviteIndexPath(),
			INVITE_INDEX_HEADERS,
			[{ invite_code: org.inviteCode, org_id: org.id }],
			"invite_code",
		);
		return { org, admin };
	}

	async findOrgByInviteCode(inviteCode: string): Promise<Organization | null> {
		const row = (await this.readRows(this.inviteIndexPath())).find(
			(item) => item.invite_code === inviteCode.toUpperCase(),
		);
		if (!row) return null;
		return this.getOrg(row.org_id);
	}

	async getOrg(orgId: string): Promise<Organization | null> {
		const markdown = await readTextFile(this.orgFile(orgId, "org.md"));
		if (!markdown.trim()) return null;
		return parseOrg(markdown);
	}

	async getMemberByPhone(phone: string): Promise<Member | null> {
		const normalized = normalizePhone(phone);
		const indexRow = (await this.readRows(this.phoneIndexPath())).find(
			(row) => row.phone === normalized,
		);
		if (!indexRow) return null;
		return this.getMember(indexRow.org_id, indexRow.member_id);
	}

	async getMember(orgId: string, memberId: string): Promise<Member | null> {
		return (
			(await this.listMembers(orgId)).find(
				(member) => member.id === memberId,
			) ?? null
		);
	}

	async listMembers(orgId: string): Promise<Member[]> {
		return (await this.readRows(this.orgFile(orgId, "members.md"))).map(
			rowToMember,
		);
	}

	async joinOrg(input: {
		orgId: string;
		phone: string;
		name: string;
		role?: string;
	}): Promise<Member> {
		const existing = await this.getMemberByPhone(input.phone);
		if (existing) return existing;

		const member: Member = {
			id: makeId("mem"),
			orgId: input.orgId,
			phone: normalizePhone(input.phone),
			name: input.name,
			role: input.role ?? "member",
			createdAt: now(),
		};

		const members = await this.listMembers(input.orgId);
		await this.writeMembers(input.orgId, [...members, member]);
		await this.upsertRows(
			this.phoneIndexPath(),
			PHONE_INDEX_HEADERS,
			[{ phone: member.phone, org_id: member.orgId, member_id: member.id }],
			"phone",
		);
		return member;
	}

	async getConversationState(phone: string): Promise<ConversationState | null> {
		const normalized = normalizePhone(phone);
		const row = (await this.readRows(this.statePath())).find(
			(item) => item.phone === normalized,
		);
		return row ? rowToState(row) : null;
	}

	async setConversationState(state: ConversationState): Promise<void> {
		await this.upsertRows(
			this.statePath(),
			STATE_HEADERS,
			[
				stateToRow({
					...state,
					phone: normalizePhone(state.phone),
					updatedAt: now(),
				}),
			],
			"phone",
		);
	}

	async appendImportItem(input: {
		orgId: string;
		sourceType: SourceType;
		rawText: string;
		mediaRef?: string | null;
	}): Promise<ImportStagingItem> {
		const item: ImportStagingItem = {
			id: makeId("stg"),
			orgId: input.orgId,
			sourceType: input.sourceType,
			rawText: input.rawText,
			mediaRef: input.mediaRef ?? null,
			createdAt: now(),
		};
		await updateTextFile(
			this.orgFile(input.orgId, "import-staging.md"),
			(current) =>
				appendBlock(current, {
					id: item.id,
					metadata: {
						org_id: item.orgId,
						source_type: item.sourceType,
						media_ref: item.mediaRef ?? "",
						created_at: item.createdAt,
					},
					body: item.rawText,
				}),
		);
		return item;
	}

	async getImportItems(orgId: string): Promise<ImportStagingItem[]> {
		return parseBlocks(
			await readTextFile(this.orgFile(orgId, "import-staging.md")),
		).map((block) => ({
			id: block.id,
			orgId,
			sourceType: parseSourceType(block.metadata.source_type),
			rawText: block.body,
			mediaRef: block.metadata.media_ref || null,
			createdAt: block.metadata.created_at,
		}));
	}

	async clearImportItems(orgId: string): Promise<void> {
		await writeTextFile(this.orgFile(orgId, "import-staging.md"), "");
	}

	async savePendingBatch(
		batch: Omit<PendingImportBatch, "id" | "createdAt" | "status"> & {
			id?: string;
			status?: PendingImportBatch["status"];
		},
	): Promise<PendingImportBatch> {
		const pending: PendingImportBatch = {
			id: batch.id ?? makeId("batch"),
			orgId: batch.orgId,
			tasks: batch.tasks,
			members: batch.members,
			status: batch.status ?? "pending",
			createdAt: now(),
		};
		await updateTextFile(
			this.orgFile(pending.orgId, "pending-batches.md"),
			(current) =>
				appendBlock(current, {
					id: pending.id,
					metadata: {
						org_id: pending.orgId,
						status: pending.status,
						created_at: pending.createdAt,
					},
					body: JSON.stringify(
						{ tasks: pending.tasks, members: pending.members },
						null,
						2,
					),
				}),
		);
		return pending;
	}

	async getPendingBatch(
		orgId: string,
		batchId: string,
	): Promise<PendingImportBatch | null> {
		const block = parseBlocks(
			await readTextFile(this.orgFile(orgId, "pending-batches.md")),
		).find((item) => item.id === batchId);
		if (!block) return null;
		const parsed = JSON.parse(block.body) as Pick<
			PendingImportBatch,
			"tasks" | "members"
		>;
		return {
			id: block.id,
			orgId,
			status: parseBatchStatus(block.metadata.status),
			createdAt: block.metadata.created_at,
			tasks: parsed.tasks,
			members: parsed.members,
		};
	}

	async applyImportBatch(
		orgId: string,
		batchId: string,
	): Promise<{ tasks: Task[]; members: Member[] }> {
		const batch = await this.getPendingBatch(orgId, batchId);
		if (!batch || batch.status !== "pending") return { tasks: [], members: [] };

		const createdMembers: Member[] = [];
		for (const member of batch.members) {
			const name = member.name.trim();
			if (!name) continue;
			const existing = (await this.listMembers(orgId)).find(
				(item) => item.name.toLowerCase() === name.toLowerCase(),
			);
			if (!existing) {
				createdMembers.push(
					await this.joinOrg({
						orgId,
						phone: `unknown_${makeId("mem")}`,
						name,
						role: member.role ?? "member",
					}),
				);
			}
		}

		const tasks: Task[] = [];
		for (const task of batch.tasks) {
			tasks.push(
				await this.createTask({
					orgId,
					title: task.title,
					assigneeMemberId: task.assigneeMemberId ?? null,
					dueDate: task.dueDate,
					priority: task.priority,
					source: "import",
				}),
			);
		}

		await this.clearImportItems(orgId);
		await this.updateBatchStatus(orgId, batchId, "applied");
		return { tasks, members: createdMembers };
	}

	async updateBatchStatus(
		orgId: string,
		batchId: string,
		status: PendingImportBatch["status"],
	): Promise<void> {
		const blocks = parseBlocks(
			await readTextFile(this.orgFile(orgId, "pending-batches.md")),
		);
		const next = blocks
			.map((block) =>
				block.id === batchId
					? { ...block, metadata: { ...block.metadata, status } }
					: block,
			)
			.map((block) => appendBlock("", block).trim())
			.join("\n\n");
		await writeTextFile(
			this.orgFile(orgId, "pending-batches.md"),
			next ? `${next}\n` : "",
		);
	}

	async createTask(input: {
		orgId: string;
		title: string;
		assigneeMemberId?: string | null;
		dueDate?: string | null;
		priority?: Priority;
		source?: Task["source"];
	}): Promise<Task> {
		const task: Task = {
			id: makeId("task"),
			orgId: input.orgId,
			title: input.title,
			assigneeMemberId: input.assigneeMemberId ?? null,
			dueDate: input.dueDate ?? null,
			priority: input.priority ?? "med",
			status: "open",
			source: input.source ?? "chat",
			createdAt: now(),
		};
		await this.writeTasks(input.orgId, [
			...(await this.listTasks({ orgId: input.orgId, filter: "all" })),
			task,
		]);
		return task;
	}

	async listTasks(input: {
		orgId: string;
		filter?: "open" | "done" | "all";
	}): Promise<Task[]> {
		const tasks = (
			await this.readRows(this.orgFile(input.orgId, "tasks.md"))
		).map(rowToTask);
		if (!input.filter || input.filter === "all") return tasks;
		return tasks.filter((task) => task.status === input.filter);
	}

	async assignTask(input: {
		orgId: string;
		taskId: string;
		memberId: string | null;
	}): Promise<Task | null> {
		const tasks = await this.listTasks({ orgId: input.orgId, filter: "all" });
		const next = tasks.map((task) =>
			task.id === input.taskId
				? { ...task, assigneeMemberId: input.memberId }
				: task,
		);
		await this.writeTasks(input.orgId, next);
		return next.find((task) => task.id === input.taskId) ?? null;
	}

	async completeTask(input: {
		orgId: string;
		taskId: string;
	}): Promise<Task | null> {
		const tasks = await this.listTasks({ orgId: input.orgId, filter: "all" });
		const next = tasks.map((task) =>
			task.id === input.taskId
				? { ...task, status: "done" as TaskStatus }
				: task,
		);
		await this.writeTasks(input.orgId, next);
		return next.find((task) => task.id === input.taskId) ?? null;
	}

	async appendReminder(input: {
		orgId: string;
		taskId: string;
		recipientPhone: string;
		when: string;
	}): Promise<Reminder> {
		const reminder: Reminder = {
			id: makeId("rem"),
			orgId: input.orgId,
			taskId: input.taskId,
			recipientPhone: normalizePhone(input.recipientPhone),
			when: input.when,
			status: "pending",
			createdAt: now(),
		};
		await this.upsertRows(
			this.orgFile(input.orgId, "reminders.md"),
			REMINDER_HEADERS,
			[reminderToRow(reminder)],
			"id",
		);
		return reminder;
	}

	async isWebhookProcessed(key: string): Promise<boolean> {
		return (await this.readRows(this.processedPath())).some(
			(row) => row.key === key,
		);
	}

	async markWebhookProcessed(input: {
		key: string;
		messageId: string;
	}): Promise<void> {
		await this.upsertRows(
			this.processedPath(),
			PROCESSED_HEADERS,
			[{ key: input.key, message_id: input.messageId, processed_at: now() }],
			"key",
		);
	}

	private async makeUniqueInviteCode(): Promise<string> {
		const existing = new Set(
			(await this.readRows(this.inviteIndexPath())).map(
				(row) => row.invite_code,
			),
		);
		let code = makeInviteCode();
		while (existing.has(code)) code = makeInviteCode();
		return code;
	}

	private async readRows(path: string): Promise<MarkdownRow[]> {
		return parseTable(await readTextFile(path));
	}

	private async upsertRows(
		path: string,
		headers: string[],
		rows: MarkdownRow[],
		key: string,
	): Promise<void> {
		await updateTextFile(path, (current) => {
			const existing = parseTable(current);
			const byKey = new Map(existing.map((row) => [row[key], row]));
			for (const row of rows) byKey.set(row[key], row);
			return serializeTable(headers, [...byKey.values()]);
		});
	}

	private async writeMembers(orgId: string, members: Member[]): Promise<void> {
		await writeTextFile(
			this.orgFile(orgId, "members.md"),
			serializeTable(MEMBER_HEADERS, members.map(memberToRow)),
		);
	}

	private async writeTasks(orgId: string, tasks: Task[]): Promise<void> {
		await writeTextFile(
			this.orgFile(orgId, "tasks.md"),
			serializeTable(TASK_HEADERS, tasks.map(taskToRow)),
		);
	}

	private orgFile(orgId: string, file: string): string {
		return join(this.dataDir, "orgs", orgId, file);
	}

	private phoneIndexPath(): string {
		return join(this.dataDir, "indexes", "phone-to-member.md");
	}

	private inviteIndexPath(): string {
		return join(this.dataDir, "indexes", "invite-codes.md");
	}

	private statePath(): string {
		return join(this.dataDir, "indexes", "conversation-states.md");
	}

	private processedPath(): string {
		return join(this.dataDir, "indexes", "processed-webhooks.md");
	}
}

export function normalizePhone(phone: string): string {
	if (phone.startsWith("unknown_")) return phone;
	return phone.replace(/\D/g, "");
}

function now(): string {
	return new Date().toISOString();
}

function serializeOrg(org: Organization): string {
	return `---\nid: ${org.id}\nname: ${org.name}\ninvite_code: ${org.inviteCode}\ncreated_at: ${org.createdAt}\n---\n`;
}

function parseOrg(markdown: string): Organization {
	const fields = Object.fromEntries(
		[...markdown.matchAll(/^([^:\n]+):\s*(.*)$/gm)].map((match) => [
			match[1],
			match[2],
		]),
	);
	return {
		id: fields.id,
		name: fields.name,
		inviteCode: fields.invite_code,
		createdAt: fields.created_at,
	};
}

function memberToRow(member: Member): MarkdownRow {
	return {
		id: member.id,
		org_id: member.orgId,
		phone: member.phone,
		name: member.name,
		role: member.role,
		created_at: member.createdAt,
	};
}

function rowToMember(row: MarkdownRow): Member {
	return {
		id: row.id,
		orgId: row.org_id,
		phone: row.phone,
		name: row.name,
		role: row.role,
		createdAt: row.created_at,
	};
}

function taskToRow(task: Task): MarkdownRow {
	return {
		id: task.id,
		org_id: task.orgId,
		title: task.title,
		assignee_member_id: task.assigneeMemberId ?? "",
		due_date: task.dueDate ?? "",
		priority: task.priority,
		status: task.status,
		source: task.source,
		created_at: task.createdAt,
	};
}

function rowToTask(row: MarkdownRow): Task {
	return {
		id: row.id,
		orgId: row.org_id,
		title: row.title,
		assigneeMemberId: row.assignee_member_id || null,
		dueDate: row.due_date || null,
		priority: parsePriority(row.priority),
		status: row.status === "done" ? "done" : "open",
		source: row.source === "import" ? "import" : "chat",
		createdAt: row.created_at,
	};
}

function stateToRow(state: ConversationState): MarkdownRow {
	return {
		phone: state.phone,
		org_id: state.orgId ?? "",
		mode: state.mode,
		step: state.step,
		scratch_json: JSON.stringify(state.scratch),
		updated_at: state.updatedAt,
	};
}

function rowToState(row: MarkdownRow): ConversationState {
	return {
		phone: row.phone,
		orgId: row.org_id || null,
		mode:
			row.mode === "import" || row.mode === "active" ? row.mode : "onboarding",
		step: row.step,
		scratch: safeJson(row.scratch_json),
		updatedAt: row.updated_at,
	};
}

function reminderToRow(reminder: Reminder): MarkdownRow {
	return {
		id: reminder.id,
		org_id: reminder.orgId,
		task_id: reminder.taskId,
		recipient_phone: reminder.recipientPhone,
		when: reminder.when,
		status: reminder.status,
		created_at: reminder.createdAt,
	};
}

function parsePriority(value: string): Priority {
	if (value === "low" || value === "high") return value;
	return "med";
}

function parseSourceType(value: string): SourceType {
	const allowed: SourceType[] = [
		"text",
		"audio",
		"image",
		"document",
		"video",
		"interactive",
		"unknown",
	];
	return allowed.includes(value as SourceType)
		? (value as SourceType)
		: "unknown";
}

function parseBatchStatus(value: string): PendingImportBatch["status"] {
	if (value === "applied" || value === "cancelled") return value;
	return "pending";
}

function safeJson(value: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(value || "{}");
		return typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}
