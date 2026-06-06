// SPEC-M.6 — Flujo de impacto (la feature estrella).
//
// Diseño anti-"números inventados" (Constitución #3): la lógica determinista
// (assembleReport + número-guard) está separada del LLM. El LLM solo PROPONE un
// borrador del balance; un guard valida que TODO número provenga de las respuestas
// del usuario. Si el borrador mete un número inventado → fallback determinista que
// solo formatea las respuestas crudas. Así el balance NUNCA inventa números.

import { generateObject } from "ai";
import { z } from "zod";
import type { ImpactReport, Task, TaskType } from "../types.js";
import { type Deps, defaultDeps } from "./deps.js";

// --- Priors por arquetipo (PRD §7). Guía para el LLM, NO formulario fijo. ------

export const IMPACT_ARCHETYPES: Record<TaskType, { guidance: string; headline: string }> = {
	charla: {
		guidance: "¿Cuántas personas asistieron? ¿Cuántas horas duró? ¿Hubo material/encuesta? ¿% que la valoró útil?",
		headline: "N personas formadas",
	},
	informe: {
		guidance: "¿A quién se entregó? ¿Se usó para una decisión o presentación? ¿Qué cubría?",
		headline: "Informe usado en decisión X",
	},
	difusion: {
		guidance: "¿Qué alcance tuvo? ¿Cuántas interacciones? ¿Sumó voluntarios o donantes?",
		headline: "N nuevos contactos",
	},
	atencion: {
		guidance: "¿Cuántos beneficiarios? ¿Cuántas unidades (raciones, kits)?",
		headline: "N familias asistidas",
	},
	gestion: {
		guidance: "¿Qué se resolvió? ¿Cuánto tiempo o recurso ahorró?",
		headline: "Trámite X completado",
	},
	recaudacion: {
		guidance: "¿Cuánto se recaudó? ¿Cuántos donantes nuevos?",
		headline: "$X recaudados",
	},
	otro: {
		guidance: "¿Qué se produjo (números duros)? ¿A cuántas personas alcanzó? ¿Qué cambió?",
		headline: "El resultado que más cuenta",
	},
};

// --- Número-guard (PURO, testeable) ------------------------------------------

const NUMBER_RE = /\d[\d.,]*\d|\d/g;

/** Normaliza un token a su valor canónico (es-AR: '.' miles, ',' decimal). "$1.500"→"1500", "3,5"→"3.5". */
function normalizeNumber(token: string): string {
	const canonical = token.replace(/\./g, "").replace(",", ".");
	const n = Number(canonical);
	return Number.isFinite(n) ? String(n) : token.replace(/\D/g, "");
}

/** Extrae los números (valor canónico) de un texto. Distingue 3,5 de 35. */
export function extractNumbers(text: string): string[] {
	return (text.match(NUMBER_RE) ?? []).map(normalizeNumber).filter((s) => s.length > 0);
}

function numbersOf(values: string[]): Set<string> {
	const set = new Set<string>();
	for (const v of values) for (const n of extractNumbers(v)) set.add(n);
	return set;
}

/** Borra de `text` cualquier número que NO esté en `allowed` (deja los válidos intactos). */
export function redactUngrounded(text: string, allowed: Set<string>): string {
	return text
		.replace(NUMBER_RE, (m) => (allowed.has(normalizeNumber(m)) ? m : ""))
		.replace(/\s{2,}/g, " ")
		.trim();
}

/** ¿Todos los números de `parts` están entre los números de `raw_answers`? */
export function numbersAreGrounded(parts: string[], raw_answers: Record<string, string>): boolean {
	const allowed = numbersOf(Object.values(raw_answers));
	for (const p of parts) for (const n of extractNumbers(p)) if (!allowed.has(n)) return false;
	return true;
}

// --- Balance ------------------------------------------------------------------

export interface BalanceItem {
	label: string;
	value: string;
}
export interface Balance {
	inputs: BalanceItem[]; // inversión
	outputs: BalanceItem[]; // resultado (números duros)
	outcome: string; // qué cambió
	headline: string; // "la cifra que cuenta"
}

/** TODOS los números (normalizados) que el balance muestra: labels + valores + outcome +
 *  headline. Es la superficie que el test compara contra raw_answers (garantía "nunca inventa"). */
export function balanceFigureNumbers(b: Balance): string[] {
	return [
		...b.inputs.flatMap((i) => [i.label, i.value]),
		...b.outputs.flatMap((o) => [o.label, o.value]),
		b.outcome,
		b.headline,
	].flatMap(extractNumbers);
}

/** Todo lo que escribe el LLM (incluidos labels): se valida más estricto. */
function draftAllText(b: Balance): string[] {
	return [
		...b.inputs.flatMap((i) => [i.label, i.value]),
		...b.outputs.flatMap((o) => [o.label, o.value]),
		b.outcome,
		b.headline,
	];
}

/** Fallback 100% seguro: solo formatea las respuestas crudas (cero invención). */
function deterministicBalance(raw_answers: Record<string, string>): Balance {
	const outputs: BalanceItem[] = Object.entries(raw_answers).map(([label, value]) => ({ label, value }));
	// Titular = la primera respuesta que tenga un número; si no, la primera respuesta.
	const answers = Object.values(raw_answers);
	const withNumber = answers.find((a) => extractNumbers(a).length > 0);
	const headline = withNumber ?? answers[0] ?? "Tarea completada";
	return { inputs: [], outputs, outcome: "", headline };
}

function redactBalance(b: Balance, allowed: Set<string>): Balance {
	const item = (i: BalanceItem): BalanceItem => ({
		label: redactUngrounded(i.label, allowed),
		value: redactUngrounded(i.value, allowed),
	});
	return {
		inputs: b.inputs.map(item),
		outputs: b.outputs.map(item),
		outcome: redactUngrounded(b.outcome, allowed),
		headline: redactUngrounded(b.headline, allowed),
	};
}

/**
 * PURO y testeable: dado el borrador del LLM (o null) y las respuestas crudas,
 * devuelve el balance validado (nunca con números inventados) + el summary formateado.
 * Red de seguridad FINAL: redacta cualquier número fuera de raw_answers en CUALQUIER parte
 * del balance (labels, valores, outcome, headline) y en el título de la tarjeta.
 */
export function assembleReport(
	task: Pick<Task, "title" | "task_type">,
	raw_answers: Record<string, string>,
	draft: Balance | null,
): { balance: Balance; summary: string } {
	const allowed = numbersOf(Object.values(raw_answers));
	const chosen = draft && numbersAreGrounded(draftAllText(draft), raw_answers) ? draft : deterministicBalance(raw_answers);
	const balance = redactBalance(chosen, allowed);
	const safeTitle = redactUngrounded(task.title, allowed);
	return { balance, summary: buildSummaryCard({ title: safeTitle, task_type: task.task_type }, balance) };
}

/** Tarjeta del Balance de Impacto (PURO). */
export function buildSummaryCard(task: Pick<Task, "title" | "task_type">, b: Balance): string {
	const lines: string[] = [`📊 *Balance de Impacto* — ${task.title}`, ""];
	if (b.inputs.length) {
		lines.push("💪 *Inversión*");
		for (const i of b.inputs) lines.push(`• ${i.label}: ${i.value}`);
		lines.push("");
	}
	if (b.outputs.length) {
		lines.push("🎯 *Resultado*");
		for (const o of b.outputs) lines.push(`• ${o.label}: ${o.value}`);
		lines.push("");
	}
	if (b.outcome.trim()) {
		lines.push("🌱 *Impacto*", b.outcome.trim(), "");
	}
	lines.push(`⭐ *${b.headline}*`);
	return lines.join("\n").trim();
}

// --- inferImpactQuestions (SPEC-M.6) -----------------------------------------

const TASK_TYPES: TaskType[] = ["charla", "informe", "difusion", "atencion", "gestion", "recaudacion", "otro"];

/** Devuelve 2-4 preguntas cuantificables a medida del task_type (no formulario fijo). */
export async function inferImpactQuestions(
	task_id: string,
	deps: Deps = defaultDeps,
): Promise<{ task_type: TaskType; questions: string[] }> {
	const { db, model } = deps;
	const task = (await db.listTasks()).find((t) => t.id === task_id);
	if (!task) throw new Error(`Tarea no encontrada: ${task_id}`);

	const hint = task.task_type ?? "otro";
	const priors = TASK_TYPES.map((t) => `- ${t}: ${IMPACT_ARCHETYPES[t].guidance}`).join("\n");

	const schema = z.object({
		task_type: z.enum(["charla", "informe", "difusion", "atencion", "gestion", "recaudacion", "otro"]),
		questions: z.array(z.string()).min(2).max(4),
	});

	const { object } = await generateObject({
		model,
		schema,
		prompt:
			`Una tarea de una ONG se acaba de terminar y hay que armarle el Balance de Impacto.\n` +
			`Título: ${task.title}\n` +
			`Descripción: ${task.description ?? "(sin descripción)"}\n` +
			`Tipo tentativo: ${hint}\n\n` +
			`Clasificá el tipo de tarea y generá entre 2 y 4 preguntas CUANTIFICABLES, a medida de ese tipo, ` +
			`para capturar el impacto. Una métrica por pregunta, en español rioplatense, cortas y concretas. ` +
			`No es un formulario fijo: adaptalas al caso. Guía por tipo (prior, no copiar literal):\n${priors}\n\n` +
			`Importante: las preguntas deben poder responderse con un número o un dato concreto.`,
	});

	// Dedup (preguntas idénticas colisionarían como claves de raw_answers) + tope 4.
	const questions = Array.from(new Set(object.questions.map((q) => q.trim()).filter(Boolean))).slice(0, 4);
	return { task_type: object.task_type, questions };
}

// --- recordImpactReport (SPEC-M.6) -------------------------------------------

const balanceItem = z.object({ label: z.string(), value: z.string() });
const draftSchema = z.object({
	inputs: z.array(balanceItem),
	outputs: z.array(balanceItem),
	outcome: z.string(),
	headline: z.string(),
});

/**
 * Arma el Balance (inversión/resultado/impacto/titular), lo persiste y lo manda a
 * la persona + coordinador. NUNCA inventa números (guard + fallback determinista).
 */
export async function recordImpactReport(
	task_id: string,
	answers: Record<string, string>,
	reported_by_phone?: string,
	deps: Deps = defaultDeps,
): Promise<ImpactReport> {
	const { db, send, model } = deps;
	const task = (await db.listTasks()).find((t) => t.id === task_id);
	if (!task) throw new Error(`Tarea no encontrada: ${task_id}`);

	// El LLM PROPONE un borrador estructurado a partir de las respuestas.
	let draft: Balance | null = null;
	try {
		const qa = Object.entries(answers)
			.map(([q, a]) => `P: ${q}\nR: ${a}`)
			.join("\n");
		const { object } = await generateObject({
			model,
			schema: draftSchema,
			prompt:
				`Armá un Balance de Impacto para esta tarea de una ONG, usando SOLO lo que respondió la persona.\n` +
				`Tarea: ${task.title} (tipo ${task.task_type ?? "otro"}).\n\nRespuestas:\n${qa}\n\n` +
				`Devolvé:\n- inputs: inversión (horas, personas, recursos) — solo si está en las respuestas.\n` +
				`- outputs: resultados con números duros (alcanzados, unidades, entregables).\n` +
				`- outcome: qué cambió (texto corto).\n- headline: la cifra que cuenta (ej "120 familias recibieron un kit").\n\n` +
				`REGLA ABSOLUTA: no estimes, no calcules, no inventes números. Cada número debe aparecer textualmente ` +
				`en las respuestas. Si un dato no está, no lo incluyas.`,
		});
		draft = object;
	} catch {
		draft = null; // sin LLM o falla → fallback determinista
	}

	const { balance, summary } = assembleReport(task, answers, draft);

	const person = reported_by_phone ? await db.getPersonByPhone(reported_by_phone) : null;
	const toRecord = (items: BalanceItem[]): Record<string, unknown> =>
		Object.fromEntries(items.map((i) => [i.label, i.value]));

	const report = await db.insertImpactReport({
		task_id,
		reported_by: person?.id,
		task_type: task.task_type,
		inputs: toRecord(balance.inputs),
		outputs: toRecord(balance.outputs),
		outcome: balance.outcome || undefined,
		headline: balance.headline,
		raw_answers: answers,
		summary,
	});

	// Mandar a la persona + coordinador (dedup por teléfono).
	const recipients = new Map<string, string>();
	if (reported_by_phone) recipients.set(reported_by_phone, summary);
	for (const coord of await db.listCoordinators()) {
		if (!recipients.has(coord.wa_phone)) {
			recipients.set(coord.wa_phone, `📊 ${person?.name ?? "Alguien"} cerró «${task.title}»:\n\n${summary}`);
		}
	}
	for (const [to, body] of recipients) await send.sendText(to, body);

	return report;
}

// --- startImpactFlow + acumulación de respuestas (SPEC-M.6) -------------------

// Shape exacto de SPEC-00 §6: { task_type, questions, answers, i }.
interface ImpactContext {
	task_type: TaskType;
	questions: string[];
	answers: Record<string, string>;
	i: number;
}

/** markTaskDone + inferImpactQuestions + setSession(impact:<id>) + 1ª pregunta. */
export async function startImpactFlow(waPhone: string, task_id: string, deps: Deps = defaultDeps): Promise<void> {
	const { db, send } = deps;
	await db.setTaskStatus(task_id, "hecha");

	const { task_type, questions } = await inferImpactQuestions(task_id, deps);
	if (questions.length === 0) {
		await recordImpactReport(task_id, {}, waPhone, deps);
		await db.clearSession(waPhone);
		return;
	}

	const ctx: ImpactContext = { task_type, questions, answers: {}, i: 0 };
	await db.setSession(waPhone, `impact:${task_id}`, ctx as unknown as Record<string, unknown>);
	const first = `¡Genial que la terminaste! 🙌 Para cerrar el balance: ${questions[0]}`;
	await send.sendText(waPhone, first);
	await db.appendHistory(waPhone, "assistant", first);
}

/**
 * Si hay un flujo de impacto activo, captura la respuesta del usuario (determinista,
 * sin inventar nada) y manda la próxima pregunta; al completar, arma el balance.
 * Devuelve true si manejó el mensaje (estaba en flujo de impacto).
 */
export async function handleImpactAnswer(waPhone: string, text: string, deps: Deps = defaultDeps): Promise<boolean> {
	const { db, send } = deps;
	const session = await db.getSession(waPhone);
	if (!session?.state || !session.state.startsWith("impact:")) return false;

	const task_id = session.state.slice("impact:".length);
	const ctx = session.context as unknown as ImpactContext;
	const question = ctx.questions[ctx.i];
	const answers = { ...ctx.answers, [question]: text.trim() };
	const nextI = ctx.i + 1;

	if (nextI < ctx.questions.length) {
		await db.setSession(waPhone, session.state, { ...ctx, answers, i: nextI } as unknown as Record<string, unknown>);
		await send.sendText(waPhone, ctx.questions[nextI]);
		await db.appendHistory(waPhone, "assistant", ctx.questions[nextI]);
	} else {
		const report = await recordImpactReport(task_id, answers, waPhone, deps);
		await db.appendHistory(waPhone, "assistant", report.summary ?? "Balance de Impacto generado.");
		await db.clearSession(waPhone);
	}
	return true;
}
