// src/hornero/server.ts — Webhook HTTP de Hornero (SPEC-00 / SPEC-B). Entry runnable que
// monta el cerebro de lib/webhook.ts sobre Hono. SPEC-B.4: responde 200 rápido y procesa
// en background (no espera al agente). Usa db/kapso reales si SUPABASE_URL/KAPSO están set
// (ver lib/deps.ts), o mocks en memoria si no.
//
//   npm run serve     (necesita .env con el proveedor LLM; Supabase/Kapso opcionales)

import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { handleInbound, type InboundPayload } from "../../lib/webhook.js";

const app = new Hono();

app.get("/health", (c) => c.text("ok"));

app.post("/api/webhook", async (c) => {
	let payload: InboundPayload = {};
	try {
		payload = (await c.req.json()) as InboundPayload;
	} catch {
		// body no-JSON → ignoramos
	}
	// SPEC-B.4: 200 rápido; el trabajo del agente corre después (fire-and-forget).
	void handleInbound(payload).catch((e) => console.error("webhook error:", e));
	return c.json({ ok: true });
});

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
console.log(`🐦 Hornero webhook escuchando en http://localhost:${port}/api/webhook`);
