import { describe, expect, it } from "vitest";
import type { Knowledge } from "../types.js";
import { mockModel, objectStep } from "./_testkit.js";
import type { Deps } from "./deps.js";
import { findDuplicate, inferKnowledge, integrateFact, similarity } from "./knowledge.js";
import { createMockDb, createMockSend } from "./mocks.js";

function kb(id: string, content: string, tags: string[] = []): Knowledge {
	return { id, content, kind: "proceso", tags, created_at: "2026-06-06T00:00:00Z" };
}

describe("dedup determinista (SPEC-M.7 red de seguridad)", () => {
	it("similarity detecta reformulaciones", () => {
		const a = "Las charlas se dan los sábados a la mañana en el centro comunitario";
		const b = "Las charlas se dan los sábados a la mañana";
		expect(similarity(a, b)).toBeGreaterThanOrEqual(0.6);
		expect(similarity(a, "El informe a donantes se manda en PDF por mail")).toBeLessThan(0.3);
	});

	it("integrateFact (camino en vivo del agente) deduplica en vez de apilar", async () => {
		const db = createMockDb();
		await db.addKnowledge({ content: "Las charlas se dan los sábados a la mañana en el centro" });
		const before = (await db.loadKnowledge()).length;

		const dup = await integrateFact(db, { content: "Las charlas se hacen los sábados a la mañana en el centro", tags: ["x"] });
		expect(dup.action).toBe("updated");
		expect((await db.loadKnowledge()).length).toBe(before); // no duplica

		const fresh = await integrateFact(db, { content: "Compramos una camioneta para reparto" });
		expect(fresh.action).toBe("added");
		expect((await db.loadKnowledge()).length).toBe(before + 1);
	});

	it("findDuplicate encuentra el KB equivalente", () => {
		const existing = [
			kb("kb_1", "Las charlas se dan los sábados a la mañana en el centro comunitario"),
			kb("kb_2", "Los informes a donantes se entregan en PDF por mail"),
		];
		expect(findDuplicate("Las charlas se hacen los sábados a la mañana en el centro comunitario", existing)?.id).toBe("kb_1");
		expect(findDuplicate("Tenemos una nueva sede en Morón", existing)).toBeNull();
	});
});

describe("inferKnowledge (SPEC-M.7)", () => {
	function deps(model: Deps["model"]) {
		const db = createMockDb();
		return { db, deps: { db, send: createMockSend(), model, now: () => "2026-06-06T12:00:00Z" } as Deps };
	}

	it("un hecho ya presente reformulado NO crea fila nueva", async () => {
		const { db, deps: d } = deps(
			mockModel(
				objectStep({
					facts: [
						{ content: "Las charlas se hacen los sábados por la mañana", kind: "proceso", tags: ["charlas"], duplicate_of: "kb_1" },
					],
				}),
			),
		);
		await db.addKnowledge({ content: "Las charlas se dan los sábados a la mañana en el centro" }); // → kb_1
		const before = (await db.loadKnowledge()).length;

		await inferKnowledge("charlamos sobre los talleres del sábado", d);

		expect((await db.loadKnowledge()).length).toBe(before); // sin duplicados
	});

	it("un hecho nuevo se agrega con kind='inferido' y source", async () => {
		const { db, deps: d } = deps(
			mockModel(
				objectStep({
					facts: [{ content: "Abrimos una nueva sede en Morón", kind: "hecho", tags: ["sede"], duplicate_of: "" }],
				}),
			),
		);
		const before = (await db.loadKnowledge()).length;
		const added = await inferKnowledge("contamos que abrimos en Morón", d, "wa:123");

		expect((await db.loadKnowledge()).length).toBe(before + 1);
		expect(added[0].kind).toBe("inferido");
		expect(added[0].source).toBe("wa:123");
	});
});
