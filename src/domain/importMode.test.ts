import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KapsoButton, OutboundClient } from "../kapso/client.js";
import { MarkdownStore } from "../storage/markdownStore.js";
import type { ImportExtractor } from "./importMode.js";
import { processInboundMessage } from "./processInboundMessage.js";

class FakeOutbound implements OutboundClient {
	texts: Array<{ to: string; body: string }> = [];
	buttons: Array<{ to: string; bodyText: string; buttons: KapsoButton[] }> = [];

	async sendText(to: string, body: string): Promise<void> {
		this.texts.push({ to, body });
	}

	async sendButtons(
		to: string,
		bodyText: string,
		buttons: KapsoButton[],
	): Promise<void> {
		this.buttons.push({ to, bodyText, buttons });
	}

	async sendList(): Promise<void> {
		/* not used */
	}

	async sendTemplate(): Promise<void> {
		/* not used */
	}
}

let dataDir: string;
let store: MarkdownStore;
let outbound: FakeOutbound;
let orgId: string;

beforeEach(async () => {
	dataDir = await mkdtemp(join(tmpdir(), "kapso-import-mode-"));
	store = new MarkdownStore(dataDir);
	outbound = new FakeOutbound();
	const created = await store.createOrgWithAdmin({
		name: "Demo NGO",
		adminPhone: "15551234567",
		adminName: "Admin",
	});
	orgId = created.org.id;
	await store.setConversationState({
		phone: "15551234567",
		orgId,
		mode: "import",
		step: "collecting",
		scratch: {},
		updatedAt: new Date().toISOString(),
	});
});

afterEach(async () => {
	await rm(dataDir, { recursive: true, force: true });
});

describe("import mode", () => {
	it("stages non-LISTO content, acknowledges receipt, and creates no tasks", async () => {
		await processInboundMessage(textPayload("Comprar alimentos"), {
			store,
			outbound,
		});

		await expect(store.getImportItems(orgId)).resolves.toMatchObject([
			{ rawText: "Comprar alimentos", sourceType: "text" },
		]);
		await expect(
			store.listTasks({ orgId, filter: "all" }),
		).resolves.toHaveLength(0);
		expect(outbound.texts).toEqual([
			{ to: "15551234567", body: "✓ recibido" },
		]);
	});

	it("turns LISTO into a pending batch and confirm/cancel buttons without creating tasks", async () => {
		await store.appendImportItem({
			orgId,
			sourceType: "text",
			rawText: "Comprar alimentos",
		});
		const extractor = vi.fn<ImportExtractor>(async (items) => ({
			tasks: items.map((item) => ({
				title: item.rawText,
				assignee: null,
				dueDate: null,
				priority: "med",
			})),
			members: [],
		}));

		await processInboundMessage(textPayload("LISTO"), {
			store,
			outbound,
			importExtractor: extractor,
		});

		expect(extractor).toHaveBeenCalledOnce();
		await expect(
			store.listTasks({ orgId, filter: "all" }),
		).resolves.toHaveLength(0);
		expect(outbound.buttons).toHaveLength(1);
		expect(outbound.buttons[0]?.bodyText).toContain("1 tarea");
		const buttonIds = outbound.buttons[0]?.buttons.map((button) => button.id) ?? [];
		expect(buttonIds).toHaveLength(2);
		expect(buttonIds[0]).toMatch(/^confirm_import:batch_/);
		expect(buttonIds[1]).toMatch(/^cancel_import:batch_/);

		const batchId = buttonIds[0].replace("confirm_import:", "");
		await expect(store.getPendingBatch(orgId, batchId)).resolves.toMatchObject({
			status: "pending",
			tasks: [{ title: "Comprar alimentos", priority: "med" }],
		});
	});

	it("confirms a pending batch, applies tasks and members, clears staging, and activates the sender", async () => {
		await store.appendImportItem({
			orgId,
			sourceType: "text",
			rawText: "Comprar alimentos",
		});
		const batch = await store.savePendingBatch({
			orgId,
			tasks: [
				{
					title: "Comprar alimentos",
					assignee: null,
					dueDate: null,
					priority: "high",
				},
			],
			members: [{ name: "Beto", role: "voluntario" }],
		});

		await processInboundMessage(interactivePayload(`confirm_import:${batch.id}`), {
			store,
			outbound,
			textHandler: vi.fn(async () => undefined),
		});

		await expect(store.listTasks({ orgId, filter: "all" })).resolves.toMatchObject(
			[{ title: "Comprar alimentos", priority: "high", source: "import" }],
		);
		await expect(store.listMembers(orgId)).resolves.toEqual(
			expect.arrayContaining([expect.objectContaining({ name: "Beto" })]),
		);
		await expect(store.getImportItems(orgId)).resolves.toEqual([]);
		await expect(store.getPendingBatch(orgId, batch.id)).resolves.toMatchObject({
			status: "applied",
		});
		await expect(store.getConversationState("15551234567")).resolves.toMatchObject({
			mode: "active",
			orgId,
		});
		expect(outbound.texts.at(-1)?.body).toContain("Importación confirmada");
	});

	it("cancels a pending batch without creating tasks and preserves raw staging", async () => {
		await store.appendImportItem({
			orgId,
			sourceType: "text",
			rawText: "Comprar alimentos",
		});
		const batch = await store.savePendingBatch({
			orgId,
			tasks: [
				{
					title: "Comprar alimentos",
					assignee: null,
					dueDate: null,
					priority: "med",
				},
			],
			members: [],
		});

		await processInboundMessage(interactivePayload(`cancel_import:${batch.id}`), {
			store,
			outbound,
			textHandler: vi.fn(async () => undefined),
		});

		await expect(
			store.listTasks({ orgId, filter: "all" }),
		).resolves.toHaveLength(0);
		await expect(store.getImportItems(orgId)).resolves.toMatchObject([
			{ rawText: "Comprar alimentos" },
		]);
		await expect(store.getPendingBatch(orgId, batch.id)).resolves.toMatchObject({
			status: "cancelled",
		});
		expect(outbound.texts.at(-1)?.body).toContain("Importación cancelada");
	});
});

function textPayload(text: string) {
	return {
		event: "whatsapp.message.received",
		message: {
			id: `wamid.${text}`,
			from: "15551234567",
			type: "text",
			text: { body: text },
		},
	};
}

function interactivePayload(id: string) {
	return {
		event: "whatsapp.message.received",
		message: {
			id: `wamid.${id}`,
			from: "15551234567",
			type: "interactive",
			interactive: {
				type: "button_reply",
				button_reply: { id, title: id },
			},
		},
	};
}
