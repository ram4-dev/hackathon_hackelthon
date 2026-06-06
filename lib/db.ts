// lib/db.ts — Adaptador de integración: expone la capa Supabase de Data (SPEC-D1–D8,
// src/lib/db.ts) como la interfaz `Db` del contrato (SPEC-00 §4.1, tipos de types.ts).
//
// ⚠️ Importar este módulo crea el cliente Supabase (necesita SUPABASE_URL /
//    SUPABASE_SERVICE_ROLE_KEY). lib/deps.ts solo lo importa cuando SUPABASE_URL está set;
//    en modo demo/mock no se toca.
//
// Reusa las 24 funciones de Data y completa el contrato:
//  - agrega db.listPeople (SPEC-00 §4.1; scoreCandidates necesita los skills por candidato).
//  - getOrgImpact admite el filtro task_type (la capa de Data lo ignora).
// El cast `as unknown as Db` puentea los renombres de tipos de Data (SpecTask/KnowledgeEntry)
// y el kind 'inferido'; en runtime las columnas son `text`, así que es seguro.

import { db as dataDb, supabase } from "../src/lib/db.js";
import type { Person } from "../types.js";
import type { Db } from "./contracts.js";

export const db: Db = {
	...(dataDb as unknown as Db),

	async listPeople(filter) {
		let q = supabase.from("people").select("*");
		if (filter?.active !== undefined) q = q.eq("active", filter.active);
		const { data, error } = await q;
		if (error) throw new Error(`listPeople: ${error.message}`);
		return (data ?? []) as Person[];
	},

	async getOrgImpact(filter) {
		let q = supabase.from("impact_reports").select("task_type, headline");
		if (filter?.task_type) q = q.eq("task_type", filter.task_type);
		const { data, error } = await q;
		if (error) throw new Error(`getOrgImpact: ${error.message}`);
		const rows = (data ?? []) as { task_type: string | null; headline: string | null }[];
		const by_type: Record<string, number> = {};
		for (const r of rows) {
			const k = r.task_type ?? "otro";
			by_type[k] = (by_type[k] ?? 0) + 1;
		}
		const headlines = rows.map((r) => r.headline).filter((h): h is string => Boolean(h));
		return { headlines, by_type };
	},
};
