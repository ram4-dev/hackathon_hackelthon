// src/hornero/app.ts — App Hono del webhook de Hornero (SPEC-00 / SPEC-B).
// Exportable para correr local (server.ts con @hono/node-server) y en Vercel
// (api/index.ts con hono/vercel). Verificación de firma adoptada de Backend (PR#3).

import { Hono } from "hono";
import { handleInbound, type InboundPayload } from "../../lib/webhook.js";
import { verifyKapsoSignature } from "../kapso/verifyWebhook.js";

export const app = new Hono();

app.get("/health", (c) => c.text("ok"));

app.post("/api/webhook", async (c) => {
	const raw = await c.req.text();

	// SPEC-B.5: verificación de firma si KAPSO_WEBHOOK_SECRET está configurado (PR#3).
	const secret = process.env.KAPSO_WEBHOOK_SECRET;
	if (secret) {
		const signature =
			c.req.header("x-webhook-signature") ??
			c.req.header("x-kapso-signature") ??
			c.req.header("x-hub-signature-256");
		if (!verifyKapsoSignature({ rawBody: raw, signature, secret })) {
			return c.json({ ok: false, error: "invalid signature" }, 401);
		}
	}

	let payload: InboundPayload = {};
	try {
		payload = JSON.parse(raw) as InboundPayload;
	} catch {
		// body no-JSON → ignoramos
	}

	// SPEC-B.4: responder 200 rápido; procesar en background (waitUntil en Vercel).
	const work = handleInbound(payload).catch((e) => console.error("webhook error:", e));
	try {
		c.executionCtx.waitUntil(work);
	} catch {
		void work; // entorno sin executionCtx (Node local)
	}
	return c.json({ ok: true });
});
