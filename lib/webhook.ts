// lib/webhook.ts — Cerebro del webhook (SPEC-B.2 / B.4): normaliza el evento de Kapso,
// deduplica (idempotencia) y rutea botón vs texto. Framework-agnóstico: el server HTTP
// (src/hornero/server.ts) solo llama handleInbound y responde 200 rápido.

import { runAgent } from "./agent.js";
import { type Deps, defaultDeps } from "./deps.js";
import { handleButton } from "./orchestration.js";

export interface InboundPayload {
	event?: string;
	message?: {
		id?: string;
		type?: string;
		from?: string;
		text?: { body?: string };
		interactive?: {
			type?: string;
			button_reply?: { id?: string };
			list_reply?: { id?: string };
		};
	};
	conversation?: { phone_number?: string };
}

export interface Normalized {
	message_id: string;
	from: string;
	buttonId?: string;
	text?: string;
}

/** Extrae { message_id, from, buttonId|text } del payload de Kapso, o null si no aplica. */
export function normalizeInbound(payload: InboundPayload): Normalized | null {
	const m = payload?.message;
	if (!m) return null;
	const from = m.from ?? payload?.conversation?.phone_number;
	const message_id = m.id;
	if (!from || !message_id) return null;
	const buttonId = m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id;
	const text = m.text?.body;
	return { message_id, from, buttonId: buttonId || undefined, text: text || undefined };
}

export type InboundResult = { status: "ok" | "ignored" | "duplicate"; route?: "button" | "text" };

/**
 * Procesa un webhook entrante: ignora lo que no sea un mensaje, deduplica por message_id y
 * rutea botón → handleButton (determinista) / texto → runAgent (LLM).
 */
export async function handleInbound(payload: InboundPayload, deps: Deps = defaultDeps): Promise<InboundResult> {
	const { db } = deps;

	// SPEC-B.2: solo procesamos whatsapp.message.received.
	if (payload?.event && payload.event !== "whatsapp.message.received") return { status: "ignored" };

	const n = normalizeInbound(payload);
	if (!n) return { status: "ignored" };

	// SPEC-B.4: idempotencia — no doble-procesar reintentos de Kapso/Meta.
	if (await db.wasProcessed(n.message_id)) return { status: "duplicate" };
	await db.markProcessed(n.message_id);

	if (n.buttonId) {
		await handleButton(n.from, n.buttonId, deps);
		return { status: "ok", route: "button" };
	}
	if (n.text) {
		await runAgent(n.from, n.text, deps);
		return { status: "ok", route: "text" };
	}
	return { status: "ignored" };
}
