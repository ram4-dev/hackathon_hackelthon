import type { LanguageModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../../lib/contracts.js";
import type { OutboundClient } from "../kapso/client.js";
import { createAgentTextHandler, createEchoTextHandler } from "./textHandler.js";

function createOutbound(): OutboundClient {
	return {
		sendText: vi.fn(async () => undefined),
		sendButtons: vi.fn(async () => undefined),
		sendList: vi.fn(async () => undefined),
		sendTemplate: vi.fn(async () => undefined),
	};
}

describe("text handlers", () => {
	it("delegates active text to the injected ML runner with backend send surface", async () => {
		const outbound = createOutbound();
		const db = {} as Db;
		const model = {} as LanguageModel;
		const now = () => "2026-06-06T00:00:00.000Z";
		const runner = vi.fn(async (_waPhone, _text, deps) => {
			expect(deps.db).toBe(db);
			expect(deps.model).toBe(model);
			expect(deps.now()).toBe("2026-06-06T00:00:00.000Z");
			await deps.send.sendText("549111", "agent reply");
			await deps.send.sendButtons("549111", "choose", [
				{ id: "yes", title: "Sí" },
			]);
			await deps.send.sendList("549111", "pick", [
				{ id: "task-1", title: "Tarea" },
			]);
		});
		const handler = createAgentTextHandler(outbound, { db, model, now, runner });

		await handler("549111", "hola");

		expect(runner).toHaveBeenCalledWith(
			"549111",
			"hola",
			expect.objectContaining({ db, model }),
		);
		expect(outbound.sendText).toHaveBeenCalledWith("549111", "agent reply");
		expect(outbound.sendButtons).toHaveBeenCalledWith("549111", "choose", [
			{ id: "yes", title: "Sí" },
		]);
		expect(outbound.sendList).toHaveBeenCalledWith("549111", "pick", [
			{ id: "task-1", title: "Tarea" },
		]);
	});

	it("keeps explicit echo fallback available for local tests", async () => {
		const outbound = createOutbound();
		const handler = createEchoTextHandler(outbound);

		await handler("549111", "hola");

		expect(outbound.sendText).toHaveBeenCalledWith("549111", "ok: hola");
	});
});
