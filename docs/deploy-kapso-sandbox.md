# Backend deploy and Kapso Sandbox smoke

## Selected deploy target

Use a long-running Node.js web service such as **Render Web Service** for this hackathon backend.

Why Render-style Node hosting:

- The current app already runs as a Node server via `@hono/node-server`.
- No serverless adapter is required.
- The deploy can use the existing commands:
  - build: `npm run build`
  - start: `npm start`
- The service can bind to the platform-provided `PORT` environment variable.

A Railway/Fly-style long-running Node service is also compatible if it supports the same build/start commands and exposes an HTTPS URL. Do not switch to a serverless target unless a minimal Hono adapter is added separately.

## Runtime expectations

- Node.js: 20 or newer.
- Package install: `npm install` or platform equivalent.
- Build command: `npm run build`.
- Start command: `npm start`.
- Health check path: `GET /health`.
- Storage: `DATA_DIR` points to Markdown/file storage. If demo data must survive restarts, mount a persistent disk and set `DATA_DIR` to that mount path. For throwaway hackathon smoke tests, ephemeral storage is acceptable.

## Required environment variable names

Configure values in the deploy platform secret/env UI. Do not commit real values.

### Kapso / WhatsApp transport

- `KAPSO_API_KEY` — required for real outbound WhatsApp replies.
- `KAPSO_PHONE_NUMBER_ID` — required for real outbound WhatsApp replies.
- `KAPSO_WEBHOOK_SECRET` — required to verify inbound Kapso webhook signatures.
- `KAPSO_BASE_URL` — optional; defaults to the current Kapso Meta WhatsApp API base URL.
- `KAPSO_PUBLIC_WHATSAPP_NUMBER` — optional; used in invite/deep-link copy when available.
- `KAPSO_REMINDER_TEMPLATE_NAME` — optional placeholder for later reminder template work.

### AI provider configuration

- `AI_PROVIDER` — optional; supported values are `openai`, `anthropic`, or `opencode`; defaults to `openai`.
- `AI_MODEL` — optional model override.
- `OPENAI_API_KEY` — required by the OpenAI provider when `AI_PROVIDER=openai`.
- `ANTHROPIC_API_KEY` — required by the Anthropic provider when `AI_PROVIDER=anthropic`.
- `OPENCODE_API_KEY` — required by the OpenCode-compatible provider when `AI_PROVIDER=opencode`.
- `OPENCODE_BASE_URL` — optional; defaults to the configured OpenCode-compatible base URL.

### Runtime / storage

- `DATA_DIR` — optional; defaults to `./data`. Set to a persistent disk path for deployed demos that must survive restarts.
- `PORT` — usually provided by the deploy platform; defaults to `3000` locally.

Do not configure Supabase, Postgres, Drizzle, Prisma, or migration variables for the current Markdown-backed architecture.

## Kapso Sandbox webhook setup

After deployment, configure Kapso Sandbox to send inbound events to one of these URLs:

```text
https://<deploy-host>/webhook
https://<deploy-host>/api/webhook
```

Both paths route to the same Hono handler and apply the same signature verification, idempotency, normalization, and async processing behavior.

Use the same webhook signing secret value in Kapso and `KAPSO_WEBHOOK_SECRET` on the deploy target. Keep the value secret; this document intentionally lists only variable names.

## Local console outbound fallback

When either `KAPSO_API_KEY` or `KAPSO_PHONE_NUMBER_ID` is missing, the app uses `ConsoleOutboundClient` instead of the real Kapso client.

In fallback mode:

- inbound signed webhooks can still be processed when `KAPSO_WEBHOOK_SECRET` is configured;
- outbound `sendText`, `sendButtons`, `sendList`, and `sendTemplate` calls are logged to the process console;
- no real WhatsApp message is sent.

This is useful for local smoke testing and demo rehearsals without outbound Kapso credentials. For end-to-end Sandbox validation, configure the real Kapso outbound variables.

## Manual Sandbox smoke checklist

1. Deploy the service with the build/start commands above.
2. Confirm `GET https://<deploy-host>/health` returns JSON with `ok: true`.
3. Configure Kapso Sandbox webhook URL to either:
   - `https://<deploy-host>/webhook`, or
   - `https://<deploy-host>/api/webhook`.
4. Configure `KAPSO_WEBHOOK_SECRET` on the deploy target to match Kapso's signing secret.
5. Configure real outbound Kapso env vars if the expected result is a WhatsApp reply:
   - `KAPSO_API_KEY`
   - `KAPSO_PHONE_NUMBER_ID`
6. Send `hola` from WhatsApp to the Sandbox number.
7. Expected result:
   - with real Kapso outbound credentials: a visible WhatsApp reply. Unknown senders should receive the onboarding response; known active senders should receive the current text echo/stub response.
   - with console fallback: a logged `Kapso text` entry in the service logs.
8. Confirm duplicate delivery does not create duplicate replies when Kapso retries the same idempotency key or message ID.

## Current smoke evidence

Status: **pending live validation**.

Reason: no public deployment URL or live Kapso Sandbox credentials were available during this apply slice. Automated validation was still run locally; record the deployment URL, webhook path, timestamp, sender/tester, and observed reply/log entry here when live validation is performed.
