import { describe, expect, it } from "vitest";
import { mockModel, objectStep } from "./_testkit.js";
import type { Deps } from "./deps.js";
import {
	assembleReport,
	type Balance,
	balanceFigureNumbers,
	buildSummaryCard,
	extractNumbers,
	handleImpactAnswer,
	inferImpactQuestions,
	numbersAreGrounded,
	recordImpactReport,
	startImpactFlow,
} from "./impact.js";
import { createMockDb, createMockSend, type MockSend } from "./mocks.js";

function deps(model: Deps["model"]): { deps: Deps; send: MockSend; db: ReturnType<typeof createMockDb> } {
	const db = createMockDb();
	const send = createMockSend();
	return { db, send, deps: { db, send, model, now: () => "2026-06-06T12:00:00Z" } };
}

const allowed = (answers: Record<string, string>) => {
	const set = new Set<string>();
	for (const v of Object.values(answers)) for (const n of extractNumbers(v)) set.add(n);
	return set;
};

describe("número-guard (PURO)", () => {
	it("extractNumbers normaliza separadores/moneda/% y distingue decimales", () => {
		expect(extractNumbers("120 familias")).toEqual(["120"]);
		expect(extractNumbers("$1.500 recaudados")).toEqual(["1500"]);
		expect(extractNumbers("80% la valoró")).toEqual(["80"]);
		expect(extractNumbers("sin números")).toEqual([]);
		// es-AR: ',' decimal → 3,5 ≠ 35 (evita falsos negativos del guard)
		expect(extractNumbers("3,5 horas")).toEqual(["3.5"]);
		expect(extractNumbers("35 personas")).toEqual(["35"]);
	});

	it("numbersAreGrounded detecta números que no dio el usuario", () => {
		const answers = { q1: "120 familias", q2: "2 horas" };
		expect(numbersAreGrounded(["120 familias asistidas"], answers)).toBe(true);
		expect(numbersAreGrounded(["200 familias"], answers)).toBe(false); // 200 inventado
		expect(numbersAreGrounded(["3,5 horas"], { q: "35" })).toBe(false); // 3,5 ≠ 35
	});
});

describe("assembleReport — NUNCA inventa números (SPEC-M.6)", () => {
	const answers = { "¿Cuántas familias?": "120", "¿Cuántas horas?": "2" };

	it("usa el borrador del LLM si todos sus números provienen de las respuestas", () => {
		const draft: Balance = {
			inputs: [{ label: "Horas dedicadas", value: "2" }],
			outputs: [{ label: "Familias alcanzadas", value: "120" }],
			outcome: "Recibieron un kit de invierno",
			headline: "120 familias recibieron un kit",
		};
		const { balance, summary } = assembleReport({ title: "Entrega de kits", task_type: "atencion" }, answers, draft);
		expect(balance).toEqual(draft);
		expect(summary).toContain("120 familias recibieron un kit");
	});

	it("descarta el borrador si inventa un número y cae al fallback determinista", () => {
		const invented: Balance = {
			inputs: [],
			outputs: [{ label: "Familias alcanzadas", value: "350" }], // 350 NO está en las respuestas
			outcome: "",
			headline: "350 familias",
		};
		const { balance } = assembleReport({ title: "Entrega de kits", task_type: "atencion" }, answers, invented);
		const ok = allowed(answers);
		for (const n of balanceFigureNumbers(balance)) expect(ok.has(n)).toBe(true);
		expect(JSON.stringify(balance)).not.toContain("350");
	});

	it("garantía global: ningún número del balance ni del summary sale de fuera de raw_answers", () => {
		for (const draft of [null, { inputs: [], outputs: [{ label: "x", value: "999" }], outcome: "", headline: "999 cosas" }] as (Balance | null)[]) {
			const { balance, summary } = assembleReport({ title: "Tarea 12 de junio", task_type: "otro" }, answers, draft);
			const ok = allowed(answers);
			for (const n of balanceFigureNumbers(balance)) expect(ok.has(n)).toBe(true);
			// La superficie completa renderizada (incluido el título) también queda saneada.
			for (const n of extractNumbers(summary)) expect(ok.has(n)).toBe(true);
		}
	});

	it("una pregunta con un número que el usuario NO respondió no filtra ese número (label-leak)", () => {
		const qa = { "¿Lograron las 200 firmas del petitorio?": "sí, lo logramos" };
		const { balance, summary } = assembleReport({ title: "Petitorio", task_type: "gestion" }, qa, null);
		expect(summary).not.toContain("200");
		expect(JSON.stringify(balance)).not.toContain("200");
		expect(balanceFigureNumbers(balance)).toEqual([]); // raw_answers no tiene números → cero números
	});

	it("también sanea un número inventado por el LLM en un LABEL del borrador", () => {
		const draft: Balance = {
			inputs: [],
			outputs: [{ label: "Asistentes a la charla de 500", value: "40" }], // 500 inventado en el label
			outcome: "",
			headline: "40 personas",
		};
		const { balance, summary } = assembleReport({ title: "Charla", task_type: "charla" }, { q: "40" }, draft);
		expect(summary).not.toContain("500");
		expect(JSON.stringify(balance)).not.toContain("500");
	});
});

describe("buildSummaryCard", () => {
	it("renderiza inversión/resultado/impacto/titular", () => {
		const b: Balance = {
			inputs: [{ label: "Horas", value: "3" }],
			outputs: [{ label: "Asistentes", value: "40" }],
			outcome: "Aprendieron RCP",
			headline: "40 personas formadas",
		};
		const card = buildSummaryCard({ title: "Charla RCP", task_type: "charla" }, b);
		expect(card).toContain("Balance de Impacto");
		expect(card).toContain("Asistentes: 40");
		expect(card).toContain("⭐");
		expect(card).toContain("40 personas formadas");
	});
});

describe("inferImpactQuestions (SPEC-M.6)", () => {
	it("devuelve 2-4 preguntas a medida del task_type", async () => {
		const { db, deps: d } = deps(
			mockModel(
				objectStep({
					task_type: "charla",
					questions: ["¿Cuántas personas asistieron?", "¿Cuántas horas duró?", "¿Hubo encuesta de satisfacción?"],
				}),
			),
		);
		const t = await db.createTask({ title: "Charla de RCP", task_type: "charla" });
		const { task_type, questions } = await inferImpactQuestions(t.id, d);
		expect(task_type).toBe("charla");
		expect(questions.length).toBeGreaterThanOrEqual(2);
		expect(questions.length).toBeLessThanOrEqual(4);
	});

	it("clasifica y adapta a otro arquetipo (informe)", async () => {
		const { db, deps: d } = deps(
			mockModel(objectStep({ task_type: "informe", questions: ["¿A quién se entregó?", "¿Se usó para una decisión?"] })),
		);
		const t = await db.createTask({ title: "Informe anual a Huésped", task_type: "informe" });
		const { task_type, questions } = await inferImpactQuestions(t.id, d);
		expect(task_type).toBe("informe");
		expect(questions).toContain("¿A quién se entregó?");
	});

	it("deduplica preguntas repetidas (evita colisión de claves en raw_answers)", async () => {
		const { db, deps: d } = deps(
			mockModel(objectStep({ task_type: "otro", questions: ["¿Cuántos?", "¿Cuántos?", "¿Qué cambió?"] })),
		);
		const t = await db.createTask({ title: "X" });
		const { questions } = await inferImpactQuestions(t.id, d);
		expect(questions).toEqual(["¿Cuántos?", "¿Qué cambió?"]);
	});
});

describe("recordImpactReport (SPEC-M.6)", () => {
	it("persiste el balance, lo manda a persona + coordinador y no inventa números aunque el LLM lo intente", async () => {
		const invented = { inputs: [], outputs: [{ label: "Familias", value: "999" }], outcome: "", headline: "999 familias" };
		const { db, send, deps: d } = deps(mockModel(objectStep(invented)));
		await db.upsertPerson({ wa_phone: "549110000c", name: "Ana", is_coordinator: true });
		await db.upsertPerson({ wa_phone: "549110000p", name: "Dani" });
		const t = await db.createTask({ title: "Entrega de kits", task_type: "atencion" });

		const answers = { "¿Cuántas familias?": "120", "¿Cuántas unidades?": "120 kits" };
		const report = await recordImpactReport(t.id, answers, "549110000p", d);

		// El número inventado (999) no aparece en el balance persistido.
		const ok = allowed(answers);
		for (const n of extractNumbers(JSON.stringify(report.outputs) + report.headline + (report.summary ?? ""))) {
			expect(ok.has(n)).toBe(true);
		}
		expect(JSON.stringify(report)).not.toContain("999");

		expect(await db.getImpactReport(t.id)).not.toBeNull();
		const tos = send.outbox.map((o) => o.to);
		expect(tos).toContain("549110000p"); // persona
		expect(tos).toContain("549110000c"); // coordinador
	});
});

describe("startImpactFlow + handleImpactAnswer (SPEC-M.6)", () => {
	it("recorre las preguntas de a una y arma el balance al final", async () => {
		const questions = objectStep({ task_type: "charla", questions: ["¿Cuántas personas asistieron?", "¿Cuántas horas duró?"] });
		const draft = objectStep({
			inputs: [{ label: "Horas", value: "3" }],
			outputs: [{ label: "Asistentes", value: "50" }],
			outcome: "Aprendieron RCP",
			headline: "50 personas formadas",
		});
		const { db, send, deps: d } = deps(mockModel(questions, draft));
		await db.upsertPerson({ wa_phone: "549110000c", name: "Ana", is_coordinator: true });
		await db.upsertPerson({ wa_phone: "549110000p", name: "Dani" });
		const t = await db.createTask({ title: "Charla de RCP", task_type: "charla" });

		await startImpactFlow("549110000p", t.id, d);
		expect((await db.listTasks()).find((x) => x.id === t.id)?.status).toBe("hecha");
		expect(send.outbox.at(-1)?.body).toContain("¿Cuántas personas asistieron?");

		expect(await handleImpactAnswer("549110000p", "50", d)).toBe(true);
		expect(send.outbox.at(-1)?.body).toBe("¿Cuántas horas duró?");

		expect(await handleImpactAnswer("549110000p", "3 horas", d)).toBe(true);

		const report = await db.getImpactReport(t.id);
		expect(report).not.toBeNull();
		expect(report?.headline).toBe("50 personas formadas");
		expect(await db.getSession("549110000p")).toBeNull(); // sesión cerrada
	});
});
