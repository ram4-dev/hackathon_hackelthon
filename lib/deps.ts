// lib/deps.ts — Inyección de dependencias para las funciones de ML / orquestación.
//
// INTEGRACIÓN AUTOMÁTICA por entorno (SPEC-00 §9, "integración trivial"):
//   - db    → Supabase real (lib/db.ts) si hay SUPABASE_URL; si no, mock en memoria (demo).
//   - send  → Kapso real (lib/kapso.ts) si hay KAPSO_API_KEY+PHONE_ID; si no, mock que loguea.
//   - model → proveedor del AI SDK (lib/model.ts).
// Imports ESTÁTICOS (sin top-level await): el cliente Supabase es import-safe (lazy) y kapso
// lee su env recién al enviar, así que importar ambos sin credenciales no rompe nada — clave
// para que la función serverless (Vercel) no se cuelgue en el cold start.

import type { LanguageModel } from "ai";
import type { Db, Send } from "./contracts.js";
import { db as realDb } from "./db.js";
import * as kapso from "./kapso.js";
import { createModel } from "./model.js";
import { db as mockDb, sendButtons as mSendButtons, sendList as mSendList, sendText as mSendText } from "./mocks.js";

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

const db: Db = useSupabase ? realDb : mockDb;
const send: Send = useKapso
	? { sendText: kapso.sendText, sendButtons: kapso.sendButtons, sendList: kapso.sendList }
	: { sendText: mSendText, sendButtons: mSendButtons, sendList: mSendList };

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
