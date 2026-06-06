# SPEC-D.3 Results Artifact

> Owner: Data Engineer. Scope: SPEC-D.3 only — people `db.*` functions.

---

## 1. Current Result

Codex prepared SPEC-D.3 as an implementation-ready handoff.

Completed locally:
- [x] `docs/spec-data-engineer.md` now defines D.3 behavior for:
  - `db.upsertPerson`
  - `db.getPersonByPhone`
  - `db.listCoordinators`
- [x] The spec resolves the `name?: string` versus `people.name not null` gap with deterministic insert fallback `name = wa_phone`.
- [x] The spec defines merge semantics for updates and default values for inserts.
- [x] The spec includes minimum unit validation and optional live SQL validation.

Not completed by Codex:
- [ ] Runtime `db.*` implementation.
- [ ] `@supabase/supabase-js` dependency addition.
- [ ] Unit tests.
- [ ] Live Supabase validation.

Reason: Antigravity is currently executing SPEC-D.2, and this pass only prepares SPEC-D.3 for the next implementation step.

---

## 2. Implementation Tasks

Executor tasks after D.2:
- [ ] Add `@supabase/supabase-js` if missing.
- [ ] Create a server-side Supabase client using `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Add SPEC-00-compatible `Person` and `Capacity` types if missing.
- [ ] Implement `db.upsertPerson`.
- [ ] Implement `db.getPersonByPhone`.
- [ ] Implement `db.listCoordinators`.
- [ ] Export the functions from the team-agreed `db.*` module.
- [ ] Add tests for insert defaults, update merge, missing-person null, and coordinator filtering.
- [ ] Run live validation against Supabase Cloud.

---

## 2.a Antigravity Homework

Antigravity should execute D.3 as the next implementation homework once D.2 is stable.

Homework checklist:
- [ ] Pull latest `data-engineer`.
- [ ] Stay on branch `data-engineer`; do not work on `main`.
- [ ] Implement only D.3 people functions.
- [ ] Keep write scope narrow:
  - `package.json`
  - `package-lock.json`
  - `src/domain/types.ts` or a new SPEC-00-compatible data types file
  - new server-side Supabase client module
  - new `db.*` module
  - focused D.3 tests
  - this results artifact
- [ ] Use `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- [ ] Validate unit tests locally.
- [ ] Run optional live validation against project `tjpfstdhxsgwyejlosfq`.
- [ ] Fill section 5 with evidence.
- [ ] Commit and push to `origin/data-engineer`.

Do not:
- [ ] Do not change schema.
- [ ] Do not implement D.4 task functions in the D.3 commit.
- [ ] Do not overwrite D.4 spec work if it appears while D.3 is in progress.

---

## 3. Acceptance Gates

SPEC-D.3 is done only when all gates pass.

| Gate | Expected result | Status |
|---|---|---|
| Insert by `wa_phone` | one new person row | Pending implementation |
| Insert defaults | `capacity='media'`, `skills=[]`, `is_coordinator=false`, `active=true`, AR timezone | Pending implementation |
| Optional name fallback | missing `name` inserts `name = wa_phone` | Pending implementation |
| Update by `wa_phone` | no duplicate row | Pending implementation |
| Update merge | absent fields are preserved; explicit `[]`/`false` are applied | Pending implementation |
| Missing phone lookup | `null`, not thrown error | Pending implementation |
| Coordinator list | only `active=true` and `is_coordinator=true` | Pending implementation |

---

## 4. Guardrails

- Do not change the `people` schema in D.3.
- Do not implement tasks, assignments, impact, knowledge, sessions, or history in D.3.
- Do not make `name` required in the TypeScript function input; SPEC-00 keeps it optional.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` client-side.
- Do not depend on D.2 seed for unit tests; D.2 may still be running.

---

## 5. Execution Evidence

Fill this after implementation and validation.

| Field | Value |
|---|---|
| Implementation commit | TBD |
| `@supabase/supabase-js` added | TBD |
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
