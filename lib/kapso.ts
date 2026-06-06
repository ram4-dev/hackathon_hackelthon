// lib/kapso.ts — Transporte WhatsApp (SPEC-B.1): implementa la interfaz `Send` contra la
// API de Kapso (wrapper de WhatsApp Cloud API v24.0). POST a /{PHONE_ID}/messages con
// header X-API-Key. Topes: botones ≤3, filas de lista ≤10.
//
// Env (lazy, no se lee al importar → seguro en modo mock):
//   KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID, KAPSO_BASE_URL (default api.kapso.ai/meta/whatsapp)

import type { Send } from "./contracts.js";

function cfg() {
	const apiKey = process.env.KAPSO_API_KEY ?? "";
	const phoneId = process.env.KAPSO_PHONE_NUMBER_ID ?? "";
	const baseUrl = process.env.KAPSO_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp";
	if (!apiKey || !phoneId) throw new Error("Kapso no configurado: faltan KAPSO_API_KEY / KAPSO_PHONE_NUMBER_ID");
	return { apiKey, phoneId, baseUrl };
}

async function post(payload: Record<string, unknown>): Promise<void> {
	const { apiKey, phoneId, baseUrl } = cfg();
	const res = await fetch(`${baseUrl}/v24.0/${phoneId}/messages`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
		body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
	});
	if (!res.ok) {
		const detail = await res.text().catch(() => "");
		throw new Error(`Kapso send falló (${res.status}): ${detail}`);
	}
}

export const sendText: Send["sendText"] = async (to, body) => {
	await post({ to, type: "text", text: { body } });
};

export const sendButtons: Send["sendButtons"] = async (to, body, buttons) => {
	await post({
		to,
		type: "interactive",
		interactive: {
			type: "button",
			body: { text: body },
			action: {
				buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })),
			},
		},
	});
};

export const sendList: Send["sendList"] = async (to, body, rows) => {
	await post({
		to,
		type: "interactive",
		interactive: {
			type: "list",
			body: { text: body },
			action: {
				button: "Elegí",
				sections: [
					{
						rows: rows.slice(0, 10).map((r) => ({ id: r.id, title: r.title, description: r.description })),
					},
				],
			},
		},
	});
};
