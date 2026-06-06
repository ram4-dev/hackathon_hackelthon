import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboundClient } from "../kapso/client.js";
import { MarkdownStore } from "../storage/markdownStore.js";
import { processInboundMessage } from "./processInboundMessage.js";

class FakeOutbound implements OutboundClient {
	async sendText() {
		/* not used */
	}
	async sendButtons() {
		/* not used */
	}
	async sendList() {
		/* not used */
	}
	async sendTemplate() {
		/* not used */
	}
}

let dataDir: string;
let store: MarkdownStore;

beforeEach(async () => {
	dataDir = await mkdtemp(join(tmpdir(), "kapso-dispatch-"));
	store = new MarkdownStore(dataDir);
	await store.createOrgWithAdmin({
		name: "Demo NGO",
		adminPhone: "15551234567",
		adminName: "Admin",
	});
});

afterEach(async () => {
	await rm(dataDir, { recursive: true, force: true });
});

describe("processInboundMessage dispatch", () => {
	it("routes interactive IDs only to the deterministic button dispatcher", async () => {
		const buttonDispatcher = vi.fn(async () => undefined);
		const textHandler = vi.fn(async () => undefined);

		await processInboundMessage(
			{
				event: "whatsapp.message.received",
				message: {
					id: "wamid.button",
					from: "15551234567",
					type: "interactive",
					interactive: {
						type: "button_reply",
						button_reply: { id: "confirm_import:batch_1", title: "Confirmar" },
					},
				},
			},
			{
				store,
				outbound: new FakeOutbound(),
				buttonDispatcher,
				textHandler,
			},
		);

		expect(buttonDispatcher).toHaveBeenCalledWith(
			"15551234567",
			"confirm_import:batch_1",
		);
		expect(textHandler).not.toHaveBeenCalled();
	});

	it("routes text messages only to the text handler", async () => {
		const buttonDispatcher = vi.fn(async () => undefined);
		const textHandler = vi.fn(async () => undefined);

		await processInboundMessage(
			{
				event: "whatsapp.message.received",
				message: {
					id: "wamid.text",
					from: "15551234567",
					type: "text",
					text: { body: "hola" },
				},
			},
			{
				store,
				outbound: new FakeOutbound(),
				buttonDispatcher,
				textHandler,
			},
		);

		expect(textHandler).toHaveBeenCalledWith("15551234567", "hola");
		expect(buttonDispatcher).not.toHaveBeenCalled();
	});
});
