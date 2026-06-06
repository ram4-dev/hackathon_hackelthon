# Backend deploy and Kapso Sandbox smoke evidence

## Status

Pending live validation.

## Reason

No public deployment URL or live Kapso Sandbox credentials were available during this apply slice. Per the safe-secrets guardrail, no secret-bearing files were read and no secret values were inspected or printed.

## Automated validation

- `npm run typecheck` — passed.
- `npm test` — passed, 12 test files / 35 tests.
- `git diff --check` — passed.

## Manual evidence template

Fill this section after a live deployment and Kapso Sandbox smoke run.

- Deploy target:
- Public URL:
- Webhook path used: `/webhook` or `/api/webhook`
- Timestamp:
- Tester/sender:
- Inbound message: `hola`
- Expected result:
  - real Kapso credentials: visible WhatsApp reply. Unknown senders should receive onboarding; known active senders should receive the current text echo/stub response.
  - console fallback: `Kapso text` log entry in service logs.
- Observed result:
- Pass/fail:
- Notes:
