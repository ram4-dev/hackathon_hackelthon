// api/index.ts — Función serverless de Vercel para el webhook de Hornero.
// Monta la misma app Hono (src/hornero/app.ts) con el adaptador hono/vercel.
// Vercel inyecta las env vars (Supabase/Kapso/LLM) desde el dashboard del proyecto.
// vercel.json reescribe todas las rutas a /api → la app rutea /api/webhook y /health.

import { handle } from "hono/vercel";
import { app } from "../src/hornero/app.js";

export const config = { runtime: "nodejs" };

export default handle(app);
