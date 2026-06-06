# SPEC-D.2 Results Artifact

> Owner: Data Engineer. Executor for Supabase Cloud: Antigravity.
> Scope: SPEC-D.2 only — demo seed data.

---

## 1. Current Result

Codex prepared SPEC-D.2 as an executable Supabase Cloud seed handoff but cannot connect to the Supabase MCP from this session.

Completed locally:
- [x] `docs/spec-data-engineer.md` now contains the SPEC-D.2 seed SQL, validation SQL, acceptance gates, and Antigravity handoff.
- [x] The seed is scoped to project ref `tjpfstdhxsgwyejlosfq`.
- [x] The seed is idempotent for demo rows:
  - people upsert by `wa_phone`
  - knowledge tagged with `source='demo_seed_spec_d2'`
  - demo tasks deleted/recreated by title and seed coordinator `5491100000001`

Not completed by Codex:
- [ ] Supabase Cloud MCP authentication.
- [ ] Seed execution in Supabase Cloud.
- [ ] Validation query execution against the live database.

Reason: this Codex session does not currently expose an authenticated Supabase MCP tool.

---

## 2. Antigravity Execution Tasks

Antigravity must execute SPEC-D.2 in Supabase Cloud after SPEC-D.1 is complete.

Tasks:
- [ ] Confirm SPEC-D.1 schema exists in project `tjpfstdhxsgwyejlosfq`.
- [ ] Connect to hosted Supabase MCP: `https://mcp.supabase.com/mcp?project_ref=tjpfstdhxsgwyejlosfq`.
- [ ] Apply seed `002_spec_d2_demo_seed` from `docs/spec-data-engineer.md`.
- [ ] Run all SPEC-D.2 validation queries from `docs/spec-data-engineer.md`.
- [ ] Record query outputs in section 5 of this artifact.

---

## 3. Acceptance Gates

SPEC-D.2 is done only when all gates pass.

| Gate | Expected result | Status |
|---|---:|---|
| Active demo people | `4` | Pending Antigravity |
| Active coordinator | `>= 1` | Pending Antigravity |
| Demo knowledge rows | `5` | Pending Antigravity |
| Demo pending task | `1` | Pending Antigravity |
| Demo proposed task | `1` | Pending Antigravity |
| Pending approval assignment | `1` | Pending Antigravity |

---

## 4. Guardrails

Antigravity must not expand scope while executing SPEC-D.2.

- Do not modify the schema. Schema belongs to SPEC-D.1.
- Do not implement `db.*` wrappers. That starts in SPEC-D.3 and later.
- Do not seed real personal data.
- Do not delete non-demo rows.
- Do not proceed if SPEC-D.1 has not been applied and validated.

---

## 5. Execution Evidence

Fill this after Antigravity runs the seed and validation queries.

| Field | Value |
|---|---|
| Supabase project ref | `tjpfstdhxsgwyejlosfq` |
| Seed name/id | `002_spec_d2_demo_seed` |
| Seed applied at | TBD |
| Validation executed at | TBD |
| `active_people` | TBD |
| `active_coordinators` | TBD |
| `demo_knowledge` | TBD |
| task status counts | TBD |
| `pending_approval` | TBD |
| Executor | Antigravity |

Validation output:

```text
TBD
```

Final status:

```text
Pending Antigravity execution.
```
