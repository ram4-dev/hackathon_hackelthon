# Apply Progress — Backend deploy and Kapso Sandbox smoke

## Status

Applied on 2026-06-06.

## Completed tasks

- Chose a Render-style long-running Node.js web service as the documented deploy target for the current Hono/Node backend.
- Documented that no serverless adapter/config is required for the selected target because the app already runs with `@hono/node-server` via `npm start`.
- Documented build/start commands, Node.js 20+ expectation, health check path, storage persistence guidance, and `PORT` behavior.
- Documented supported public webhook URLs: `/webhook` and `/api/webhook`.
- Documented current env var names from `src/env.ts` and AI provider usage without reading or printing secret values.
- Explicitly excluded Supabase/Postgres from deploy env guidance under current Markdown/file-storage constraints.
- Documented local console outbound fallback behavior when Kapso outbound credentials are absent.
- Documented manual Kapso Sandbox smoke steps for sending `hola` and observing either a WhatsApp reply or console-stub log.
- Recorded smoke evidence as pending because no public deployment URL or live Kapso Sandbox credentials were available.

## Files changed

- `README.md`
- `docs/deploy-kapso-sandbox.md`
- `artifacts/backend-deploy-sandbox-smoke-evidence.md`
- `openspec/changes/backend-deploy-sandbox-smoke/tasks.md`
- `openspec/changes/backend-deploy-sandbox-smoke/apply-progress.md`

## TDD Cycle Evidence

Strict TDD is not active for this docs/config slice. No production source code changed.

| Cycle | RED | GREEN | Refactor / note |
| --- | --- | --- | --- |
| Deploy documentation | N/A — documentation-only implementation based on approved OpenSpec acceptance criteria. | Wrote README and deploy/Sandbox docs covering target, commands, env var names, webhook paths, fallback behavior, and smoke checklist. | No deploy adapter added because the selected target runs the existing Node server directly. |
| Validation | N/A | `npm run typecheck`, `npm test`, and `git diff --check` run during validation. | Smoke evidence remains pending live deployment/Kapso credentials. |

## Test commands run

- `npm run typecheck` — passed.
- `npm test` — passed.
- `git diff --check` — passed.

## Deviations from design

- `.env.example` was not read because the slice prompt explicitly forbids reading `.env.example` and other secret-bearing files. Env var names were verified from `src/env.ts` and provider usage instead, then documented without values.
- No `vercel.json` or serverless adapter was added because the selected deploy target is a long-running Node service compatible with the existing `npm run build && npm start` workflow.
- Live Kapso Sandbox smoke was not performed because no public deployment URL or live credentials were available in this worker context.

## Remaining tasks

- Perform live Sandbox smoke after deployment and fill in `artifacts/backend-deploy-sandbox-smoke-evidence.md` or the evidence section in `docs/deploy-kapso-sandbox.md`.
- Optionally verify/update `.env.example` in a separate safe-secrets-enabled pass if the parent provides secure file-write tooling or approves a redacted template update path.

## Workload / PR boundary

- Slice boundary: deploy/Sandbox documentation and evidence only.
- Review workload: small; no production source or package config changed.
