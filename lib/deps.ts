// lib/deps.ts — inyección de dependencias para las funciones de ML.
//
// PUNTO ÚNICO DE INTEGRACIÓN: hoy `db` y `send` salen de lib/mocks.ts.
// Al integrar, cambiá SOLO estos imports:
//   import { db } from "./db.js";              // Data  (reemplaza el mock)
//   import { sendText, ... } from "./kapso.js" // Backend (reemplaza el mock)
// Nada más cambia: runAgent/proposeAssignment/etc. ya programan contra Deps.

import type { LanguageModel } from "ai";
import type { Db, Send } from "./contracts.js";
import { createModel } from "./model.js";
// ⬇️ SWAP AQUÍ al integrar (mocks → reales)
import { db, sendButtons, sendList, sendText } from "./mocks.js";

export interface Deps {
	db: Db;
	send: Send;
	model: LanguageModel;
	/** Fecha/hora actual ISO — inyectable para tests deterministas. */
	now: () => string;
}

let _model: LanguageModel | null = null;

/** Dependencias reales del runtime (db+send reales al integrar, modelo del AI SDK). */
export const defaultDeps: Deps = {
	db,
	send: { sendText, sendButtons, sendList },
	get model() {
		if (!_model) _model = createModel();
		return _model;
	},
	now: () => new Date().toISOString(),
};
