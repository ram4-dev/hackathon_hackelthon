import { describe, expect, it } from "vitest";
import type { Person, PersonLoad, Task } from "../types.js";
import { createMockDb, createMockSend } from "./mocks.js";
import { mockModel } from "./_testkit.js";
import type { Deps } from "./deps.js";
import { proposeAssignment, scoreCandidates } from "./scoring.js";

function person(p: Partial<Person> & { id: string; name: string; skills: string[]; capacity: Person["capacity"] }): Person {
	return {
		role: undefined,
		is_coordinator: false,
		timezone: "America/Argentina/Buenos_Aires",
		active: true,
		created_at: "2026-06-06T00:00:00Z",
		wa_phone: `549110000${p.id}`,
		...p,
	};
}
function load(id: string, name: string, capacity: Person["capacity"], active_effort: number): PersonLoad {
	return { id, name, capacity, active_effort, active_tasks: active_effort };
}
function task(required_skills: string[]): Task {
	return {
		id: "task_x",
		title: "Mandar el informe a Huésped",
		priority: "media",
		required_skills,
		effort: 2,
		status: "pendiente",
		created_at: "2026-06-06T00:00:00Z",
	};
}

describe("scoreCandidates (SPEC-M.5)", () => {
	const ana = person({ id: "a", name: "Ana", skills: ["gestion"], capacity: "media" });
	const beto = person({ id: "b", name: "Beto", skills: ["informes", "datos"], capacity: "alta" });
	const caro = person({ id: "c", name: "Caro", skills: ["informes"], capacity: "baja" });
	const people = [ana, beto, caro];

	it("filtra por overlap de skills y elige la menos cargada", () => {
		const loads = [load("a", "Ana", "media", 0), load("b", "Beto", "alta", 3), load("c", "Caro", "baja", 1)];
		const { candidate, reason } = scoreCandidates(task(["informes"]), loads, people);
		// Ana no tiene el skill; entre Beto(3) y Caro(1) gana Caro por menor carga.
		expect(candidate.id).toBe("c");
		expect(reason).toContain("informes");
		expect(reason.toLowerCase()).toContain("esfuerzo");
	});

	it("desempata por capacidad cuando la carga es igual", () => {
		const loads = [load("b", "Beto", "alta", 2), load("c", "Caro", "baja", 2)];
		const { candidate } = scoreCandidates(task(["informes"]), loads, [beto, caro]);
		expect(candidate.id).toBe("b"); // misma carga → gana mayor capacidad (alta > baja)
	});

	it("sin required_skills elige a quien está más libre", () => {
		const loads = [load("a", "Ana", "media", 5), load("b", "Beto", "alta", 1), load("c", "Caro", "baja", 9)];
		const { candidate } = scoreCandidates(task([]), loads, people);
		expect(candidate.id).toBe("b");
	});

	it("si nadie tiene el skill, cae a la menos cargada y lo explica", () => {
		const loads = [load("a", "Ana", "media", 4), load("b", "Beto", "alta", 0), load("c", "Caro", "baja", 2)];
		const { candidate, reason } = scoreCandidates(task(["medicina"]), loads, people);
		expect(candidate.id).toBe("b");
		expect(reason.toLowerCase()).toContain("nadie tiene");
	});

	it("lanza error si no hay personas activas", () => {
		expect(() => scoreCandidates(task(["x"]), [], [])).toThrow();
	});
});

describe("proposeAssignment (SPEC-M.5)", () => {
	async function setup() {
		const db = createMockDb();
		const send = createMockSend();
		const deps: Deps = { db, send, model: mockModel(), now: () => "2026-06-06T12:00:00Z" };
		await db.upsertPerson({ wa_phone: "549110000a", name: "Ana", is_coordinator: true, skills: ["gestion"] });
		await db.upsertPerson({ wa_phone: "549110000b", name: "Beto", skills: ["informes", "datos"], capacity: "alta" });
		const t = await db.createTask({ title: "Mandar el informe", required_skills: ["informes"] });
		return { db, send, deps, taskId: t.id };
	}

	it("crea assignment 'propuesta' y manda botones al coordinador con ids de SPEC-00 §5", async () => {
		const { db, send, deps, taskId } = await setup();
		const { assignment, candidate, reason } = await proposeAssignment(taskId, deps);

		expect(candidate.name).toBe("Beto"); // tiene 'informes'
		expect(reason).toContain("informes");

		const stored = await db.getAssignment(assignment.id);
		expect(stored?.status).toBe("propuesta");
		const t = (await db.listTasks()).find((x) => x.id === taskId);
		expect(t?.status).toBe("propuesta");

		const btns = send.outbox.find((o) => o.kind === "buttons");
		expect(btns).toBeDefined();
		if (btns?.kind === "buttons") {
			expect(btns.to).toBe("549110000a"); // al COORDINADOR
			expect(btns.buttons.map((b) => b.id)).toEqual([
				`coord_approve:${assignment.id}`,
				`coord_reject:${assignment.id}`,
			]);
		}
	});

	it("sin coordinador falla SIN efectos colaterales", async () => {
		const db = createMockDb();
		const deps: Deps = { db, send: createMockSend(), model: mockModel(), now: () => "2026-06-06T12:00:00Z" };
		await db.upsertPerson({ wa_phone: "549110000b", name: "Beto", skills: ["informes"] }); // no coordinador
		const t = await db.createTask({ title: "Mandar el informe", required_skills: ["informes"] });

		await expect(proposeAssignment(t.id, deps)).rejects.toThrow();

		const board = await db.getBoard();
		expect(board.pending_approval).toHaveLength(0); // no se creó assignment
		expect((await db.listTasks())[0].status).toBe("pendiente"); // tarea sin tocar
	});

	it("excludePersonIds re-propone al siguiente candidato", async () => {
		const db = createMockDb();
		const deps: Deps = { db, send: createMockSend(), model: mockModel(), now: () => "2026-06-06T12:00:00Z" };
		await db.upsertPerson({ wa_phone: "549110000a", name: "Ana", is_coordinator: true });
		const beto = await db.upsertPerson({ wa_phone: "549110000b", name: "Beto", skills: ["informes"], capacity: "alta" });
		await db.upsertPerson({ wa_phone: "549110000c", name: "Caro", skills: ["informes"], capacity: "baja" });
		const t = await db.createTask({ title: "Mandar el informe", required_skills: ["informes"] });

		const first = await proposeAssignment(t.id, deps);
		expect(first.candidate.id).toBe(beto.id); // alta capacidad, empatan en carga 0

		const second = await proposeAssignment(t.id, deps, [beto.id]);
		expect(second.candidate.name).toBe("Caro"); // Beto excluido → siguiente
	});
});
