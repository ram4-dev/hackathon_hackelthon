import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const app = createApp(env);

serve({ fetch: app.fetch, port: env.port });

console.log(`Kapso NGO agent listening on :${env.port}`);
