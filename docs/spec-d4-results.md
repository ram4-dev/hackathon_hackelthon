# SPEC-D.4 Results Artifact

> Owner: Data Engineer. Scope: SPEC-D.4 only — tasks and board `db.*` functions.

---

## 1. Current Result

Codex prepared SPEC-D.4 as an implementation-ready handoff.

Completed locally:
- [x] `docs/spec-data-engineer.md` now defines D.4 behavior for:
  - `db.createTask`
  - `db.listTasks`
  - `db.setTaskStatus`
  - `db.getBoard`
- [x] The spec defines defaults, validation rules, list filters, and board composition.
- [x] The spec defines the `listTasks({ person_id })` ambiguity as accepted assignments only: `assignments.status='aprobada'`.
- [x] The spec includes minimum unit validation and optional live SQL validation.

Not completed by Codex:
- [ ] Runtime `db.*` implementation.
- [ ] Unit tests.
- [ ] Live Supabase validation.

Reason: Antigravity is being assigned D.3 implementation homework first; D.4 is prepared as the next task.

---

## 2. Antigravity Homework

Antigravity should execute D.4 after D.3 is implemented and pushed.

Homework checklist:
- [ ] Pull latest `data-engineer`.
- [ ] Stay on branch `data-engineer`; do not work on `main`.
- [ ] Confirm D.3 people functions and Supabase client exist.
- [ ] Implement only D.4 task/board functions.
- [ ] Keep write scope narrow:
  - SPEC-00-compatible data types
  - existing server-side Supabase client module
  - existing `db.*` module
  - focused D.4 tests
  - this results artifact
- [ ] Add validation for `TaskStatus`, `Priority`, and `TaskType`.
- [ ] Validate unit tests locally.
- [ ] Run optional live validation against project `tjpfstdhxsgwyejlosfq`.
- [ ] Fill section 5 with evidence.
- [ ] Commit and push to `origin/data-engineer`.

Do not:
- [ ] Do not change schema.
- [ ] Do not implement D.5 assignment transitions in the D.4 commit.
- [ ] Do not change D.3 behavior while implementing D.4 unless a test exposes a direct integration bug.

---

## 3. Acceptance Gates

SPEC-D.4 is done only when all gates pass.

| Gate | Expected result | Status |
|---|---|---|
| `createTask` defaults | `priority='media'`, `effort=1`, `status='pendiente'`, `required_skills=[]` | Pending implementation |
| `listTasks(status)` | only matching status | Pending implementation |
| `listTasks(person_id)` | only tasks with approved assignment for person | Pending implementation |
| `setTaskStatus` valid status | updates and returns task | Pending implementation |
| `setTaskStatus` invalid status | rejects before Supabase call | Pending implementation |
| Board columns | all 6 `TaskStatus` keys exist | Pending implementation |
| Board alerts | deadline < 24h and status != `hecha` | Pending implementation |
| Board recent impact | max 5, newest first | Pending implementation |
| Board pending approval | only `assignments.status='propuesta'` | Pending implementation |

---

## 4. Guardrails

- Do not change the `tasks`, `assignments`, or `impact_reports` schema in D.4.
- Do not implement assignment approval state changes; that starts in SPEC-D.5.
- Do not let proposals appear in `listTasks({ person_id })`; proposals belong in `getBoard().pending_approval`.
- Do not omit empty board columns.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` client-side.

---

## 5. Execution Evidence

Fill this after implementation and validation.

| Field | Value |
|---|---|
| Implementation commit | TBD |
| `db.*` module path | TBD |
| Unit tests command | TBD |
| Unit tests result | TBD |
| Live Supabase validation | TBD |
| Executor | TBD |

Validation output:

```text
TBD
```

Final status:

```text
Pending implementation.
```
