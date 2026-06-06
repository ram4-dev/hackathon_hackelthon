// src/hornero/server.ts — Webhook HTTP de Hornero para correr LOCAL (Node, @hono/node-server).
// Monta la app de app.ts. Usa db/kapso reales si SUPABASE_URL/KAPSO están set (ver lib/deps.ts),
// o mocks en memoria si no.
//
//   npm run serve     (necesita .env; Supabase/Kapso opcionales)

import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
console.log(`🐦 Hornero webhook escuchando en http://localhost:${port}/api/webhook`);
