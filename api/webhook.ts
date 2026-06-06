// api/webhook.ts — Webhook de Hornero como función Vercel Node nativa (req,res).
// (hono/vercel devuelve un handler Web que el runtime Node de Vercel no envía → colgaba;
//  esta función Node lo resuelve.) Lee el body crudo (para verificar firma), procesa y
// responde 200 rápido; el agente corre en background con waitUntil (SPEC-B.4/B.5).
// Vercel inyecta las env vars (Supabase/Kapso/LLM) desde el dashboard del proyecto.

import type { IncomingMessage, ServerResponse } from "node:http";
import { waitUntil } from "@vercel/functions";
import { handleInbound, type InboundPayload } from "../lib/webhook.js";
import { verifyKapsoSignature } from "../src/kapso/verifyWebhook.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

async function readRawBody(req: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
	if (req.method !== "POST") {
		res.statusCode = 200;
		res.end("ok");
		return;
	}

	const raw = await readRawBody(req);

	// SPEC-B.5: verificación de firma si KAPSO_WEBHOOK_SECRET está configurado.
	const secret = process.env.KAPSO_WEBHOOK_SECRET;
	if (secret) {
		const h = req.headers;
		const signature = (h["x-webhook-signature"] ?? h["x-kapso-signature"] ?? h["x-hub-signature-256"]) as
			| string
			| undefined;
		if (!verifyKapsoSignature({ rawBody: raw, signature, secret })) {
			res.statusCode = 401;
			res.setHeader("content-type", "application/json");
			res.end(JSON.stringify({ ok: false, error: "invalid signature" }));
			return;
		}
	}

	let payload: InboundPayload = {};
	try {
		payload = JSON.parse(raw) as InboundPayload;
	} catch {
		// body no-JSON → payload vacío (handleInbound lo ignora)
	}

	// SPEC-B.4: responder 200 rápido; el agente corre en background (waitUntil lo mantiene vivo).
	res.statusCode = 200;
	res.setHeader("content-type", "application/json");
	res.end(JSON.stringify({ ok: true }));
	waitUntil(handleInbound(payload).catch((e) => console.error("webhook error:", e)));
}
