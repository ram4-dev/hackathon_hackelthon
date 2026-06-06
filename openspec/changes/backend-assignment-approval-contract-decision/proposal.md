# Proposal — Backend assignment approval contract decision

## Status

Proposed; decision-gated.

## Source

Split from `docs/spec-backend.md` SPEC-B.3 and `docs/spec 00 contract.md` sections 4.3 and 5, with conflicts identified in `artifacts/backend-spec-current-map.md`.

## Why

SPEC-00 defines a double human-in-the-loop assignment approval model with `coord_approve`, `coord_reject`, `approve`, `reject`, and `done` buttons. The current repo does not have the SPEC-00 assignment data model, Spanish task statuses, person load, impact reports, or Postgres storage; current constraints require Markdown/file storage and no Postgres. This change captures the decision and safe implementation path without silently rebaselining the app.

## What changes

If product/parent explicitly approves preserving the SPEC-00 assignment contract:

- Add Markdown-compatible assignment storage and types scoped to the current app.
- Implement deterministic routing for `coord_approve`, `coord_reject`, `approve`, `reject`, and `done` IDs.
- Implement `handleButton`, `coordinatorRespond`, and `respondToAssignment` against current Markdown repositories.
- Add ML boundary stubs/interfaces for `proposeAssignment(taskId)` and `startImpactFlow(waPhone, taskId)`.
- Add tests for assignment status transitions and outbound recipients.

If not approved, this change should be closed or superseded by the current import/active task-agent button model.

## Non-goals

- Do not add Postgres, Supabase, migrations, or the full SPEC-00 schema.
- Do not rename or replace the current Markdown task model unless separately approved.
- Do not implement this spec before the prerequisite decision is recorded.
- Do not mix assignment approval side effects into import confirmation buttons.

## Impact

This prevents accidental scope creep while preserving a clear route to implement the legacy assignment approval contract if it remains required for the demo.

## Dependencies

- Explicit parent/product decision that SPEC-00 assignment approval remains in scope.
- Markdown-compatible data-model design for assignments.
- Existing outbound button/text helpers and webhook deterministic button dispatch.
