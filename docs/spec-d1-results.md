# SPEC-D.1 Results Artifact

> Owner: Data Engineer. Executor for Supabase Cloud: Antigravity.
> Scope: SPEC-D.1 only — schema + `person_load` view.

---

## 1. Current Result

Codex prepared SPEC-D.1 for Supabase Cloud execution but cannot connect to the Supabase MCP from this session.

Completed locally:
- [x] `docs/spec-data-engineer.md` now contains the full SPEC-D.1 schema, view, smoke SQL, rollback SQL, and Antigravity handoff.
- [x] Workspace MCP configs point to Supabase Cloud, not localhost:
  - `.vscode/mcp.json`
  - `.gemini/settings.json`
- [x] Codex global config was updated with hosted Supabase MCP:

```toml
[mcp_servers.supabase]
url = "https://mcp.supabase.com/mcp"
enabled = true
default_tools_approval_mode = "prompt"
```

Not completed by Codex:
- [ ] Supabase Cloud MCP authentication.
- [ ] Migration execution in Supabase Cloud.
- [ ] Smoke query execution against the live database.

Reason: this Codex session does not currently expose an authenticated Supabase MCP tool.

---

## 2. Antigravity Execution Tasks

Antigravity must execute SPEC-D.1 in Supabase Cloud.

Tasks:
- [ ] Connect to the hosted Supabase MCP: `https://mcp.supabase.com/mcp`.
- [ ] Confirm the target Supabase project before applying changes.
- [ ] If the project ref is known, scope the MCP endpoint to `https://mcp.supabase.com/mcp?project_ref=<SUPABASE_PROJECT_REF>`.
- [ ] Apply migration `001_spec_d1_schema` from `docs/spec-data-engineer.md`.
- [ ] Confirm all required relations exist:
  - `people`
  - `tasks`
  - `assignments`
  - `knowledge`
  - `impact_reports`
  - `sessions`
  - `messages`
  - `processed_messages`
  - `person_load`
- [ ] Run the smoke validation SQL from `docs/spec-data-engineer.md`.
- [ ] Confirm the smoke output includes:
  - `active_effort = 3`
  - `active_tasks = 1`
- [ ] Run the rollback SQL:

```sql
delete from people where wa_phone = '5491100000000';
```

- [ ] Record the final execution evidence in section 5 of this artifact.

---

## 3. Acceptance Gates

SPEC-D.1 is done only when all gates pass.

| Gate | Expected result | Status |
|---|---:|---|
| Required tables exist | 8 tables | Pending Antigravity |
| `person_load` view exists | 1 view | Pending Antigravity |
| Insert/select works | Smoke SQL runs | Pending Antigravity |
| Load calculation works | `active_effort = 3` | Pending Antigravity |
| Task count calculation works | `active_tasks = 1` | Pending Antigravity |
| Smoke data removed | rollback executed | Pending Antigravity |

---

## 4. Guardrails

Antigravity must not expand scope while executing SPEC-D.1.

- Do not seed demo data. Seed starts in SPEC-D.2.
- Do not implement `db.*` wrappers. Function implementation starts after schema validation.
- Do not create Postgres enums. SPEC-00 currently defines text columns and TypeScript validation.
- Do not enable RLS in the MVP.
- Do not change table or view shapes without updating SPEC-00 first.

---

## 5. Execution Evidence

Fill this after Antigravity runs the migration and smoke test.

| Field | Value |
|---|---|
| Supabase project ref | TBD |
| Migration name/id | `001_spec_d1_schema` |
| Migration applied at | TBD |
| Smoke query executed at | TBD |
| Smoke `person_load.id` | TBD |
| Smoke `active_effort` | TBD |
| Smoke `active_tasks` | TBD |
| Rollback executed | TBD |
| Executor | Antigravity |

Smoke output:

```text
TBD
```

Final status:

```text
Pending Antigravity execution.
```
