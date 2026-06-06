# SPEC-D.5 Results Artifact

> Owner: Data Engineer. Scope: SPEC-D.5 only — assignment persistence and double-approval flow.

---

## 1. Current Result

SPEC-D.5 implemented and validated locally.

Completed:
- [x] `AssignmentStatus` type added to `src/domain/types.ts`: `propuesta | aprobada_coord | aprobada | rechazada`.
- [x] `PersonLoad` type added to `src/domain/types.ts` (mirrors `person_load` view shape).
- [x] `db.insertAssignment` — inserts with `status='propuesta'` and `proposed_at=now()`.
- [x] `db.getAssignment` — lookup by id, returns `null` if missing (no throw).
- [x] `db.setAssignmentStatus` — validates `AssignmentStatus` before Supabase call; sets `coord_id` + `coord_decision_at` for `aprobada_coord`; sets `responded_at` for `aprobada` and `rechazada`; sets `rejected_by` for `rechazada`.
- [x] `db.readPersonLoad` — reads `person_load` view (active effort + task counts).
- [x] 9 new D.5 unit tests (42 total, all passing).
- [ ] Live Supabase validation (requires credentials — Antigravity executes).

---

## 2. Antigravity Homework

Homework checklist:
- [ ] Pull latest `data-engineer`.
- [ ] Stay on branch `data-engineer`.
- [ ] Confirm D.4 tasks/board functions are live in Supabase Cloud.
- [ ] Run the full assignment state transition: `propuesta → aprobada_coord → aprobada`.
- [ ] Verify `person_load` view reflects approved assignment effort correctly.
- [ ] Clean up smoke data after validation.
- [ ] Fill section 5 with evidence.
- [ ] Commit and push to `origin/data-engineer`.

Do not:
- Do not change the `assignments` schema.
- Do not implement D.6 impact reports in the D.5 commit.

---

## 3. Acceptance Gates

| Gate | Expected result | Status |
|---|---|---|
| `insertAssignment` status | `status='propuesta'`, `proposed_at` set | **PASS** (unit test) |
| `getAssignment` missing | returns `null`, no throw | **PASS** (unit test) |
| `setAssignmentStatus` invalid | rejects before Supabase | **PASS** (unit test) |
| `setAssignmentStatus('aprobada_coord', {coord_id})` | sets `coord_id`, `coord_decision_at` | **PASS** (unit test) |
| `setAssignmentStatus('aprobada')` | sets `responded_at` | **PASS** (unit test) |
| `setAssignmentStatus('rechazada', {rejected_by})` | sets `rejected_by`, `responded_at` | **PASS** (unit test) |
| `readPersonLoad` | reads `person_load` view | **PASS** (unit test) |
| Full state transition test | `propuesta → aprobada_coord → aprobada` timestamps set | Pending live validation |

---

## 4. Guardrails

- Do not change the `assignments` schema (all fields exist from D.1).
- `rejected_by` must be `'coordinador'` or `'persona'` per SPEC-00 semantics.
- `aprobada_coord` requires `coord_id`; `rechazada` requires `rejected_by` — both enforced at db layer.
- Do not skip `propuesta` state when inserting new assignments.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` client-side.

---

## 5. Execution Evidence

| Field | Value |
|---|---|
| Implementation commit | TBD (pending push) |
| `db.*` module path | `src/lib/db.ts` |
| Types path | `src/domain/types.ts` |
| Unit tests command | `npm test` |
| Unit tests result | 42 passed (9 D.5 tests) |
| Live Supabase validation | Pending — Antigravity |
| Executor | Claude Code / data-engineer branch |

Validation output:

```text
 RUN  v4.1.8

 Test Files  10 passed (10)
      Tests  42 passed (42)
   Start at  16:09:46
   Duration  489ms
```

Final status:

```text
Unit implementation complete. Live validation delegated to Antigravity (requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
```
