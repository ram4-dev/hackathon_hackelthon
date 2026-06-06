import { describe, expect, it } from "vitest";
import type { Knowledge, Person, Session } from "../types.js";
import { buildSystemPrompt } from "./prompt.js";

const NOW = "2026-06-06T12:00:00Z";
const kb: Knowledge[] = [
	{ id: "kb_1", content: "Las charlas se dan los sábados", kind: "proceso", tags: ["charlas"], created_at: NOW },
];

const ana: Person = {
	id: "p1",
	wa_phone: "549110000001",
	name: "Ana",
	role: "Coordinación",
	skills: ["gestion"],
	capacity: "media",
	is_coordinator: true,
	timezone: "America/Argentina/Buenos_Aires",
	active: true,
	created_at: NOW,
};

describe("buildSystemPrompt (SPEC-M.1)", () => {
	it("siempre incluye Constitución, KB y catálogo de tools", () => {
		const p = buildSystemPrompt({ person: ana, session: null, kb }, { now: NOW });
		expect(p).toContain("NUNCA inventes números");
		expect(p).toContain("Doble aprobación");
		expect(p).toContain("Baja fricción");
		expect(p).toContain("Conocimiento de la organización");
		expect(p).toContain("Las charlas se dan los sábados"); // KB inyectado entero
		expect(p).toContain("Catálogo de tools");
		expect(p).toContain(NOW); // fecha de referencia para deadlines
	});

	it("persona desconocida → instrucción de onboarding", () => {
		const p = buildSystemPrompt({ person: null, session: null, kb: [] }, { now: NOW });
		expect(p).toContain("ONBOARDING");
		expect(p).toContain("upsertPerson");
	});

	it("persona existente → muestra sus datos", () => {
		const p = buildSystemPrompt({ person: ana, session: null, kb: [] }, { now: NOW });
		expect(p).toContain("Persona actual");
		expect(p).toContain("Ana");
		expect(p).toContain("COORDINADOR");
	});

	it("sesión de impacto → refleja el flujo y la pregunta pendiente", () => {
		const session: Session = {
			wa_phone: "549110000002",
			state: "impact:task_9",
			context: { task_type: "charla", questions: ["¿Cuántas personas asistieron?", "¿Cuántas horas?"], answers: {}, i: 0 },
			updated_at: NOW,
		};
		const p = buildSystemPrompt({ person: ana, session, kb: [] }, { now: NOW });
		expect(p).toContain("BALANCE DE IMPACTO");
		expect(p).toContain("task_9");
		expect(p).toContain("¿Cuántas personas asistieron?");
	});
});
