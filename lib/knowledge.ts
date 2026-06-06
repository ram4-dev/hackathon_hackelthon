// SPEC-M.7 — Knowledge (integrar / deduplicar) — nice-to-have.
//
// inferKnowledge extrae hechos útiles de una conversación y los INTEGRA en el KB:
// si ya existe algo equivalente → updateKnowledge (expande), si es nuevo → addKnowledge
// (kind='inferido', source). El LLM propone; un dedup determinista es la red de seguridad
// para que loadKnowledge no crezca en duplicados.

import { generateObject } from "ai";
import { z } from "zod";
import type { Knowledge } from "../types.js";
import type { Db } from "./contracts.js";
import { type Deps, defaultDeps } from "./deps.js";

const STOPWORDS = new Set([
	"el","la","los","las","un","una","unos","unas","de","del","a","ante","con","en","y","o","u","que","se","su","sus","por","para","es","son","al","lo","le","les","como","más","mas","muy","ya","si","no","the","of","to","and","in","on",
]);

/** Normaliza a un set de palabras (minúsculas, sin acentos/puntuación, sin stopwords). */
export function tokenize(text: string): Set<string> {
	const clean = text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9\s]/g, " ");
	const words = clean.split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
	return new Set(words);
}

/** Similitud Jaccard entre dos textos (0..1). */
export function similarity(a: string, b: string): number {
	const A = tokenize(a);
	const B = tokenize(b);
	if (A.size === 0 || B.size === 0) return 0;
	let inter = 0;
	for (const w of A) if (B.has(w)) inter++;
	const union = A.size + B.size - inter;
	return union === 0 ? 0 : inter / union;
}

const DUP_THRESHOLD = 0.6;

/** Red de seguridad determinista: encuentra un KB equivalente al `content`, o null. */
export function findDuplicate(content: string, existing: Knowledge[]): Knowledge | null {
	let best: Knowledge | null = null;
	let bestScore = 0;
	for (const k of existing) {
		const s = similarity(content, k.content);
		if (s > bestScore) {
			bestScore = s;
			best = k;
		}
	}
	return bestScore >= DUP_THRESHOLD ? best : null;
}

/**
 * Inserta un hecho deduplicando (red de seguridad determinista): si ya existe algo
 * equivalente, expande sus tags en vez de crear una fila nueva. Lo usa la tool addKnowledge
 * del agente para que el KB no acumule duplicados en el camino en vivo.
 */
export async function integrateFact(
	db: Db,
	fact: { content: string; kind?: Knowledge["kind"]; tags?: string[]; source?: string },
): Promise<{ action: "added" | "updated"; knowledge: Knowledge }> {
	const existing = await db.loadKnowledge();
	const match = findDuplicate(fact.content, existing);
	if (match) {
		const tags = Array.from(new Set([...match.tags, ...(fact.tags ?? [])]));
		return { action: "updated", knowledge: await db.updateKnowledge(match.id, { tags }) };
	}
	const knowledge = await db.addKnowledge({
		content: fact.content,
		kind: fact.kind ?? "hecho",
		tags: fact.tags,
		source: fact.source,
	});
	return { action: "added", knowledge };
}

const factSchema = z.object({
	content: z.string(),
	kind: z.enum(["politica", "proceso", "hecho", "inferido"]),
	tags: z.array(z.string()),
	/** id de un KB existente que este hecho reformula, o "" si es nuevo. */
	duplicate_of: z.string(),
});
const extractionSchema = z.object({ facts: z.array(factSchema) });

/**
 * Extrae hechos de la conversación y los integra/deduplica en el KB.
 * Devuelve las filas agregadas o actualizadas.
 */
export async function inferKnowledge(
	conversationText: string,
	deps: Deps = defaultDeps,
	source = "conversación",
): Promise<Knowledge[]> {
	const { db, model } = deps;
	const existing = await db.loadKnowledge();

	const existingList = existing.length
		? existing.map((k) => `[${k.id}] ${k.content}`).join("\n")
		: "(KB vacío)";

	let facts: z.infer<typeof extractionSchema>["facts"] = [];
	try {
		const { object } = await generateObject({
			model,
			schema: extractionSchema,
			prompt:
				`Sos el bibliotecario de la memoria de una ONG. De la conversación de abajo, extraé hechos ` +
				`ÚTILES y duraderos sobre la organización (procesos, políticas, quién sabe qué, datos). ` +
				`Ignorá lo efímero (saludos, coordinación puntual).\n\n` +
				`KB actual:\n${existingList}\n\nConversación:\n${conversationText}\n\n` +
				`Para cada hecho: content (frase clara y autocontenida), kind, tags, y duplicate_of = el id ` +
				`de un KB existente que ya dice lo mismo (aunque con otras palabras), o "" si es realmente nuevo. ` +
				`No dupliques conocimiento ya presente.`,
		});
		facts = object.facts;
	} catch {
		return []; // sin LLM o falla → no tocamos el KB
	}

	const result: Knowledge[] = [];
	for (const fact of facts) {
		if (!fact.content.trim()) continue;
		// 1) match declarado por el LLM, 2) red de seguridad determinista.
		const declared = fact.duplicate_of ? existing.find((k) => k.id === fact.duplicate_of) : null;
		const match = declared ?? findDuplicate(fact.content, existing);

		if (match) {
			// Reformulación de algo ya presente → expandir tags, no crear fila nueva.
			const tags = Array.from(new Set([...match.tags, ...fact.tags]));
			const updated = await db.updateKnowledge(match.id, { tags });
			result.push(updated);
		} else {
			const added = await db.addKnowledge({ content: fact.content.trim(), kind: "inferido", tags: fact.tags, source });
			existing.push(added); // evita duplicar dos hechos nuevos equivalentes en la misma tanda
			result.push(added);
		}
	}
	return result;
}
