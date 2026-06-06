import { describe, expect, it } from "vitest";
import { mockModel, textStep, toolCall } from "./_testkit.js";
import type { Deps } from "./deps.js";
import { createMockDb, createMockSend } from "./mocks.js";
import { handleInbound, normalizeInbound } from "./webhook.js";

function buttonPayload(id: string, from = "549110000a", message_id = "wamid.1") {
	return { event: "whatsapp.message.received", message: { id: message_id, from, type: "interactive", interactive: { button_reply: { id } } } };
}
function textPayload(body: string, from = "549110000s", message_id = "wamid.t1") {
	return { event: "whatsapp.message.received", message: { id: message_id, from, type: "text", text: { body } } };
}

describe("normalizeInbound (SPEC-B.2)", () => {
	it("extrae botón, texto, o null", () => {
		expect(normalizeInbound(buttonPayload("coord_approve:assign_1"))).toMatchObject({ buttonId: "coord_approve:assign_1" });
		expect(normalizeInbound(textPayload("hola"))).toMatchObject({ text: "hola" });
		expect(normalizeInbound({} as never)).toBeNull();
	});
});

describe("handleInbound (SPEC-B.2/B.4)", () => {
	async function deps(model: Deps["model"]) {
		const db = createMockDb();
		const send = createMockSend();
		return { db, send, deps: { db, send, model, now: () => "2026-06-06T12:00:00Z" } as Deps };
	}

	it("ignora eventos que no son whatsapp.message.received", async () => {
		const { deps: d } = await deps(mockModel());
		expect((await handleInbound({ event: "whatsapp.status.update" }, d)).status).toBe("ignored");
	});

	it("idempotencia: el mismo message_id no se procesa dos veces", async () => {
		const { db, send, deps: d } = await deps(mockModel());
		const ana = await db.upsertPerson({ wa_phone: "549110000a", name: "Ana", is_coordinator: true });
		const beto = await db.upsertPerson({ wa_phone: "549110000b", name: "Beto", skills: ["informes"] });
		const task = await db.createTask({ title: "Informe", required_skills: ["informes"] });
		const a = await db.insertAssignment({ task_id: task.id, person_id: beto.id });

		const payload = buttonPayload(`coord_approve:${a.id}`, ana.wa_phone, "wamid.dup");
		const first = await handleInbound(payload, d);
		const second = await handleInbound(payload, d);

		expect(first.status).toBe("ok");
		expect(first.route).toBe("button");
		expect(second.status).toBe("duplicate");
		// el botón a la persona se mandó UNA sola vez
		expect(send.outbox.filter((o) => o.kind === "buttons" && o.to === beto.wa_phone)).toHaveLength(1);
	});

	it("rutea texto a runAgent", async () => {
		const { db, send, deps: d } = await deps(mockModel(toolCall("sendText", { body: "¡Hola!" }), textStep("")));
		await db.upsertPerson({ wa_phone: "549110000s", name: "Sol" });
		const r = await handleInbound(textPayload("buenas", "549110000s"), d);
		expect(r).toMatchObject({ status: "ok", route: "text" });
		expect(send.outbox.some((o) => o.kind === "text" && o.body === "¡Hola!")).toBe(true);
	});
});
