import { describe, expect, it } from "vitest";
import { KapsoClient, type KapsoButton, type KapsoListRow } from "./client.js";
import { ConsoleOutboundClient } from "./consoleClient.js";

type SentMessage = {
	kind: "buttons" | "list";
	payload: Record<string, unknown>;
};

function createClient() {
	const sent: SentMessage[] = [];
	const messages = {
		async sendText(input: Record<string, unknown>) {
			return { id: "text", input };
		},
		async sendInteractiveButtons(input: Record<string, unknown>) {
			sent.push({ kind: "buttons", payload: input });
			return { id: "buttons" };
		},
		async sendInteractiveList(input: Record<string, unknown>) {
			sent.push({ kind: "list", payload: input });
			return { id: "list" };
		},
		async sendTemplate(input: Record<string, unknown>) {
			return { id: "template", input };
		},
	};

	return {
		client: new KapsoClient(
			{ baseUrl: "https://kapso.test", apiKey: "test-key", phoneNumberId: "phone-1" },
			messages,
		),
		sent,
	};
}

describe("KapsoClient outbound helpers", () => {
	it("truncates interactive buttons to the first 3 while preserving IDs and titles", async () => {
		const { client, sent } = createClient();
		const buttons: KapsoButton[] = [
			{ id: "one", title: "One" },
			{ id: "two", title: "Two" },
			{ id: "three", title: "Three" },
			{ id: "four", title: "Four" },
		];

		await client.sendButtons("5491111111111", "Choose", buttons);

		expect(sent).toEqual([
			{
				kind: "buttons",
				payload: {
					phoneNumberId: "phone-1",
					to: "5491111111111",
					bodyText: "Choose",
					buttons: buttons.slice(0, 3),
				},
			},
		]);
	});

	it("sends interactive lists with the first 10 rows and preserves optional descriptions", async () => {
		const { client, sent } = createClient();
		const rows: KapsoListRow[] = Array.from({ length: 12 }, (_, index) => ({
			id: `row-${index + 1}`,
			title: `Row ${index + 1}`,
			description: index % 2 === 0 ? `Description ${index + 1}` : undefined,
		}));

		await client.sendList("5491111111111", "Pick a task", rows);

		expect(sent).toEqual([
			{
				kind: "list",
				payload: {
					phoneNumberId: "phone-1",
					to: "5491111111111",
					bodyText: "Pick a task",
					buttonText: "Ver opciones",
					sections: [{ rows: rows.slice(0, 10) }],
				},
			},
		]);
	});

	it("keeps the console fallback compatible with the outbound surface", async () => {
		const client = new ConsoleOutboundClient();

		await expect(client.sendList("5491111111111", "Pick", [])).resolves.toBeUndefined();
	});
});
