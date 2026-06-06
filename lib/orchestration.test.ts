import { describe, expect, it } from "vitest";
import { mockModel } from "./_testkit.js";
import type { Deps } from "./deps.js";
import { createMockDb, createMockSend } from "./mocks.js";
import { coordinatorRespond, handleButton, respondToAssignment } from "./orchestration.js";

async function setup(opts: { twoCandidates?: boolean } = {}) {
	const db = createMockDb();
	const send = createMockSend();
	const deps: Deps = { db, send, model: mockModel(), now: () => "2026-06-06T12:00:00Z" };
	const ana = await db.upsertPerson({ wa_phone: "549110000a", name: "Ana", is_coordinator: true });
	const beto = await db.upsertPerson({ wa_phone: "549110000b", name: "Beto", skills: ["informes"], capacity: "alta" });
	if (opts.twoCandidates) await db.upsertPerson({ wa_phone: "549110000c", name: "Caro", skills: ["informes"], capacity: "baja" });
	const task = await db.createTask({ title: "Informe", required_skills: ["informes"] });
	const a = await db.insertAssignment({ task_id: task.id, person_id: beto.id });
	await db.setTaskStatus(task.id, "propuesta");
	return { db, send, deps, ana, beto, task, a };
}

describe("coordinatorRespond (SPEC-00 §4.3)", () => {
	it("aprobar → aprobada_coord + botones a la PERSONA", async () => {
		const { db, send, deps, ana, beto, a } = await setup();
		await coordinatorRespond(a.id, "aprobar", undefined, deps);

		const stored = await db.getAssignment(a.id);
		expect(stored?.status).toBe("aprobada_coord");
		expect(stored?.coord_id).toBe(ana.id);

		const btns = send.outbox.find((o) => o.kind === "buttons");
		expect(btns?.to).toBe(beto.wa_phone);
		if (btns?.kind === "buttons") expect(btns.buttons.map((b) => b.id)).toEqual([`approve:${a.id}`, `reject:${a.id}`]);
	});

	it("rechazar → rechazada(coordinador) + tarea vuelve a pendiente", async () => {
		const { db, deps, task, a } = await setup();
		await coordinatorRespond(a.id, "rechazar", undefined, deps);
		expect((await db.getAssignment(a.id))?.status).toBe("rechazada");
		expect((await db.getAssignment(a.id))?.rejected_by).toBe("coordinador");
		expect((await db.listTasks()).find((t) => t.id === task.id)?.status).toBe("pendiente");
	});
});

describe("respondToAssignment (SPEC-00 §4.3)", () => {
	it("aprobada → tarea activa + aviso al coordinador", async () => {
		const { db, send, deps, ana, task, a } = await setup();
		await coordinatorRespond(a.id, "aprobar", undefined, deps);
		send.reset();
		await respondToAssignment(a.id, "aprobada", deps);

		expect((await db.getAssignment(a.id))?.status).toBe("aprobada");
		expect((await db.listTasks()).find((t) => t.id === task.id)?.status).toBe("aprobada");
		const txt = send.outbox.find((o) => o.kind === "text" && o.to === ana.wa_phone);
		expect(txt?.body).toContain("Beto");
	});

	it("rechazada → rechazada(persona) + re-propone al siguiente candidato", async () => {
		const { db, send, deps, beto, task, a } = await setup({ twoCandidates: true });
		await respondToAssignment(a.id, "rechazada", deps);

		expect((await db.getAssignment(a.id))?.rejected_by).toBe("persona");
		// se creó una nueva propuesta para OTRO candidato (Caro), no Beto
		const board = await db.getBoard();
		const fresh = board.pending_approval.find((x) => x.task_id === task.id && x.status === "propuesta");
		expect(fresh).toBeDefined();
		expect(fresh?.person_id).not.toBe(beto.id);
		expect(send.outbox.some((o) => o.kind === "buttons" && o.to === "549110000a")).toBe(true);
	});
});

describe("handleButton (SPEC-00 §5)", () => {
	it("rutea coord_approve:<id> a coordinatorRespond", async () => {
		const { send, deps, beto, a } = await setup();
		await handleButton("549110000a", `coord_approve:${a.id}`, deps);
		expect(send.outbox.some((o) => o.kind === "buttons" && o.to === beto.wa_phone)).toBe(true);
	});
});
