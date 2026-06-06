import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MarkdownStore } from "./markdownStore.js";

let dir: string;
let store: MarkdownStore;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "kapso-store-"));
	store = new MarkdownStore(dir);
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("MarkdownStore", () => {
	it("creates an org with admin and resolves member by phone", async () => {
		const { org, admin } = await store.createOrgWithAdmin({
			name: "Fundación Demo",
			adminPhone: "+54 9 11 1234-5678",
			adminName: "Ana",
		});

		await expect(store.getOrg(org.id)).resolves.toMatchObject({
			name: "Fundación Demo",
		});
		await expect(
			store.getMemberByPhone("5491112345678"),
		).resolves.toMatchObject({ id: admin.id, orgId: org.id });
		await expect(
			store.findOrgByInviteCode(org.inviteCode),
		).resolves.toMatchObject({ id: org.id });
	});

	it("creates and lists tasks", async () => {
		const { org } = await store.createOrgWithAdmin({
			name: "Org",
			adminPhone: "1",
			adminName: "Ana",
		});

		const task = await store.createTask({
			orgId: org.id,
			title: "Llamar donantes",
		});
		await expect(
			store.listTasks({ orgId: org.id, filter: "open" }),
		).resolves.toMatchObject([
			{
				id: task.id,
				title: "Llamar donantes",
				priority: "med",
				status: "open",
			},
		]);

		await store.completeTask({ orgId: org.id, taskId: task.id });
		await expect(
			store.listTasks({ orgId: org.id, filter: "done" }),
		).resolves.toHaveLength(1);
	});

	it("stages import items and applies a pending batch", async () => {
		const { org } = await store.createOrgWithAdmin({
			name: "Org",
			adminPhone: "1",
			adminName: "Ana",
		});
		await store.appendImportItem({
			orgId: org.id,
			sourceType: "audio",
			rawText: "Comprar alimentos",
		});
		await expect(store.getImportItems(org.id)).resolves.toMatchObject([
			{ rawText: "Comprar alimentos" },
		]);

		const batch = await store.savePendingBatch({
			orgId: org.id,
			tasks: [
				{
					title: "Comprar alimentos",
					assignee: null,
					dueDate: null,
					priority: "high",
				},
			],
			members: [],
		});

		const applied = await store.applyImportBatch(org.id, batch.id);
		expect(applied.tasks).toHaveLength(1);
		await expect(store.getImportItems(org.id)).resolves.toEqual([]);
	});

	it("marks webhook keys as processed", async () => {
		await expect(store.isWebhookProcessed("idem_1")).resolves.toBe(false);
		await store.markWebhookProcessed({ key: "idem_1", messageId: "wamid.1" });
		await expect(store.isWebhookProcessed("idem_1")).resolves.toBe(true);
	});
});
