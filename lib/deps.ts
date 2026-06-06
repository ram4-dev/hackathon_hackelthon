// lib/deps.ts — Inyección de dependencias para las funciones de ML / orquestación.
//
// INTEGRACIÓN AUTOMÁTICA por entorno (SPEC-00 §9, "integración trivial"):
//   - db    → Supabase real (lib/db.ts) si hay SUPABASE_URL; si no, mock en memoria (demo).
//   - send  → Kapso real (lib/kapso.ts) si hay KAPSO_API_KEY+PHONE_ID; si no, mock que loguea.
//   - model → proveedor del AI SDK (lib/model.ts).
// Así el harness/demo corre sin credenciales y el webhook usa la infra real cuando está set.

import type { LanguageModel } from "ai";
import type { Db, Send } from "./contracts.js";
import { createModel } from "./model.js";

export interface Deps {
	db: Db;
	send: Send;
	model: LanguageModel;
	/** Fecha/hora actual ISO — inyectable para tests deterministas. */
	now: () => string;
}

// HORNERO_FORCE_MOCK=1 → todo mock (db + envío), aunque haya credenciales (harness/demo).
// HORNERO_MOCK_SEND=1 → solo el ENVÍO a mock; la db sigue real → probar el agente contra
//   Supabase real SIN mandar WhatsApp de verdad.
const forceMock = process.env.HORNERO_FORCE_MOCK === "1";
const mockSend = forceMock || process.env.HORNERO_MOCK_SEND === "1";
const useSupabase = !forceMock && !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const useKapso = !mockSend && !!process.env.KAPSO_API_KEY && !!process.env.KAPSO_PHONE_NUMBER_ID;

// Import dinámico: lib/db.ts crea el cliente Supabase al importarse, así que solo lo
// cargamos cuando está configurado (evita romper el modo mock sin credenciales).
const db: Db = useSupabase ? (await import("./db.js")).db : (await import("./mocks.js")).db;
const sendMod = useKapso ? await import("./kapso.js") : await import("./mocks.js");
const send: Send = { sendText: sendMod.sendText, sendButtons: sendMod.sendButtons, sendList: sendMod.sendList };

if (!process.env.VITEST) {
	console.error(`[deps] db=${useSupabase ? "supabase" : "mock"} · send=${useKapso ? "kapso" : "mock"}`);
}

let _model: LanguageModel | null = null;

/** Dependencias reales del runtime (db/send según entorno, modelo del AI SDK). */
export const defaultDeps: Deps = {
	db,
	send,
	get model() {
		if (!_model) _model = createModel();
		return _model;
	},
	now: () => new Date().toISOString(),
};
