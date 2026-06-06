# Tasks — Backend assignment approval contract decision

## Delivery strategy

Do not implement code until the prerequisite decision is recorded. If approved, implement the smallest Markdown-compatible assignment slice and keep it separate from import confirmation buttons.

## Review workload forecast

Medium to large if approved. Likely touches `src/domain/types.ts`, `src/storage/markdownStore.ts`, a new `src/domain/assignmentButtons.ts`, possibly outbound helper types in `src/kapso/client.ts`, and new domain/storage tests.

## Task list

- [ ] Record the prerequisite decision: implement SPEC-00 assignment approval buttons, defer them, or supersede them with the current task-agent flow.
- [ ] If deferred or superseded, mark this change as closed/superseded without code changes.
- [ ] If approved, design a Markdown-compatible `Assignment` storage representation.
- [ ] Add assignment types without requiring Postgres or the full SPEC-00 schema.
- [ ] Add repository functions for insert/get/update assignment status.
- [ ] Add interfaces or stubs for `proposeAssignment(taskId)` and `startImpactFlow(waPhone, taskId)`.
- [ ] Implement `handleButton(waPhone, id)` prefix routing for `coord_approve`, `coord_reject`, `approve`, `reject`, and `done`.
- [ ] Implement `coordinatorRespond(assignmentId, decision, newPersonId?)` for approved decisions.
- [ ] Implement `respondToAssignment(assignmentId, decision)` for assignee accept/reject decisions.
- [ ] Add tests for coordinator approve/reject transitions and outbound messages.
- [ ] Add tests for assignee approve/reject transitions and ML boundary calls.
- [ ] Add tests for `done:<taskId>` calling `startImpactFlow`.

## Exit gate

- [ ] Decision is recorded before implementation starts.
- [ ] If approved: `npm test` passes.
- [ ] If approved: `npm run typecheck` passes.
- [ ] If approved: tests prove no Postgres/Supabase dependency is introduced.
- [ ] If approved: assignment button routing coexists with import confirmation routing without prefix collisions.

## Depends on

- Parent/product decision.
- `backend-webhook-dispatch-and-api-alias` for deterministic button dispatch.
- `backend-kapso-outbound-list-limits` if assignment UX needs list messages.
