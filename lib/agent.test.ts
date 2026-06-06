import { describe, expect, it } from "vitest";
import { mockModel, textStep, toolCall } from "./_testkit.js";
import { runAgent } from "./agent.js";
import type { Deps } from "./deps.js";
import { createMockDb, createMockSend } from "./mocks.js";

describe("runAgent — secuencia de tool calls (SPEC-M.2)", () => {
	it('"creá una tarea para mandar el informe" → createTask y luego proposeAssignment', async () => {
		const db = createMockDb();
		const send = createMockSend();
		const deps: Deps = {
			db,
			send,
			model: mockModel(
				toolCall("createTask", {
					title: "Mandar el informe a Huésped",
					required_skills: ["informes"],
					task_type: "informe",
					deadline: "2026-06-12T00:00:00Z",
				}),
				toolCall("proposeAssignment", { task_id: "task_1" }),
				textStep("Listo, se lo propuse al coordinador ✅"),
			),
			now: () => "2026-06-06T12:00:00Z",
		};
		await db.upsertPerson({ wa_phone: "549110000a", name: "Ana", is_coordinator: true });
		await db.upsertPerson({ wa_phone: "549110000b", name: "Beto", skills: ["informes", "datos"], capacity: "alta" });
		await db.upsertPerson({ wa_phone: "549110000s", name: "Sol" }); // remitente registrado (sin onboarding)

		await runAgent("549110000s", "creá una tarea para mandar el informe el viernes", deps);

		// createTask
		const tasks = await db.listTasks();
		expect(tasks).toHaveLength(1);
		expect(tasks[0].title).toContain("informe");
		// M.4: el tipo clasificado y el deadline ISO se persisten por el camino del agente.
		expect(tasks[0].task_type).toBe("informe");
		expect(tasks[0].deadline).toBe("2026-06-12T00:00:00Z");
		// proposeAssignment → assignment 'propuesta' + botones al coordinador
		const board = await db.getBoard();
		expect(board.pending_approval).toHaveLength(1);
		expect(board.pending_approval[0].status).toBe("propuesta");
		const btns = send.outbox.find((o) => o.kind === "buttons");
		expect(btns?.to).toBe("549110000a");
		if (btns?.kind === "buttons") expect(btns.buttons[0].id.startsWith("coord_approve:")).toBe(true);
		// respuesta a la persona (fallback del texto final)
		expect(send.outbox.some((o) => o.kind === "text" && o.to === "549110000s")).toBe(true);
	});
});

describe("runAgent — persistencia del turno del asistente (SPEC-M.2)", () => {
	it("persiste el turno del asistente aunque responda SOLO por tools", async () => {
		const db = createMockDb();
		const send = createMockSend();
		const deps: Deps = {
			db,
			send,
			model: mockModel(toolCall("sendText", { body: "¡Hola! 👋" }), textStep("")),
			now: () => "2026-06-06T12:00:00Z",
		};
		await db.upsertPerson({ wa_phone: "549110000z", name: "Zoe" });

		await runAgent("549110000z", "buenas", deps);

		expect(send.outbox.some((o) => o.kind === "text" && o.body === "¡Hola! 👋")).toBe(true);
		const hist = await db.loadHistory("549110000z");
		expect(hist.some((m) => m.role === "assistant" && m.content === "¡Hola! 👋")).toBe(true);
	});
});

describe("runAgent — onboarding (SPEC-M.3)", () => {
	it("persona nueva → upsertPerson + clearSession al completar", async () => {
		const db = createMockDb();
		const send = createMockSend();
		const deps: Deps = {
			db,
			send,
			model: mockModel(
				toolCall("upsertPerson", { name: "Eva", role: "Comunicación", skills: ["redes", "redaccion"], capacity: "media" }),
				textStep("¡Listo Eva, ya estás registrada! 🎉"),
			),
			now: () => "2026-06-06T12:00:00Z",
		};

		await runAgent("549119999999", "hola", deps);

		const eva = await db.getPersonByPhone("549119999999");
		expect(eva?.name).toBe("Eva");
		expect(eva?.skills).toEqual(["redes", "redaccion"]);
		expect(eva?.capacity).toBe("media");
		// sesión de onboarding cerrada
		expect(await db.getSession("549119999999")).toBeNull();
	});
});
