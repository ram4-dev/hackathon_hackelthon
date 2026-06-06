# Hackelthon Kapso NGO Agent

WhatsApp task-management agent for NGOs built with Node.js, TypeScript, Hono, Kapso, Vercel AI SDK packages, and Markdown/file storage.

## Backend SSoT

Backend implementation currently follows `docs/spec-backend-ssot.md` and the incremental OpenSpec slices under `openspec/changes/backend-*`.

Current architectural constraints:

- Hono/Node runtime.
- Kapso webhooks for inbound WhatsApp events.
- Kapso SDK/API for outbound WhatsApp messages.
- Markdown/file storage under `DATA_DIR`.
- No Postgres or Supabase for the hackathon version.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

The local server listens on `PORT` when set, or `3000` by default.

Useful commands:

```bash
npm run build
npm start
npm run typecheck
npm test
```

## Webhook routes

Both routes are supported by the same Hono handler:

- `POST /webhook`
- `POST /api/webhook`

Use either public URL in Kapso Sandbox, for example:

```text
https://<deploy-host>/webhook
https://<deploy-host>/api/webhook
```

## Deploy and Sandbox smoke

See `docs/deploy-kapso-sandbox.md` for the selected deploy target, environment variable names, local console fallback behavior, and the manual Kapso Sandbox smoke checklist.
