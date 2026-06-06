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
- [x] Supabase Cloud MCP authentication.
- [x] Migration execution in Supabase Cloud.
- [x] Smoke query execution against the live database.

Reason: Resolved by configuring the remote Supabase MCP server settings on Antigravity and executing the migration pipeline.

---

## 2. Antigravity Execution Tasks

Antigravity must execute SPEC-D.1 in Supabase Cloud.

Tasks:
- [x] Connect to the hosted Supabase MCP: `https://mcp.supabase.com/mcp`.
- [x] Confirm the target Supabase project before applying changes.
- [x] If the project ref is known, scope the MCP endpoint to `https://mcp.supabase.com/mcp?project_ref=tjpfstdhxsgwyejlosfq`.
- [x] Apply migration `001_spec_d1_schema` from `docs/spec-data-engineer.md`.
- [x] Confirm all required relations exist:
  - `people`
  - `tasks`
  - `assignments`
  - `knowledge`
  - `impact_reports`
  - `sessions`
  - `messages`
  - `processed_messages`
  - `person_load`
- [x] Run the smoke validation SQL from `docs/spec-data-engineer.md`.
- [x] Confirm the smoke output includes:
  - `active_effort = 3`
  - `active_tasks = 1`
- [x] Run the rollback SQL:

```sql
delete from assignments where person_id = '16da2c20-edc4-4590-8a4a-fa1636a6d405';
delete from tasks where created_by = '16da2c20-edc4-4590-8a4a-fa1636a6d405';
delete from people where id = '16da2c20-edc4-4590-8a4a-fa1636a6d405';
```

- [x] Record the final execution evidence in section 5 of this artifact.

---

## 3. Acceptance Gates

SPEC-D.1 is done only when all gates pass.

| Gate | Expected result | Status |
|---|---:|---|
| Required tables exist | 8 tables | Passed |
| `person_load` view exists | 1 view | Passed |
| Insert/select works | Smoke SQL runs | Passed |
| Load calculation works | `active_effort = 3` | Passed |
| Task count calculation works | `active_tasks = 1` | Passed |
| Smoke data removed | rollback executed | Passed |

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
| Supabase project ref | tjpfstdhxsgwyejlosfq |
| Migration name/id | `001_spec_d1_schema` |
| Migration applied at | 2026-06-06 18:47:37 UTC |
| Smoke query executed at | 2026-06-06 18:47:48 UTC |
| Smoke `person_load.id` | 16da2c20-edc4-4590-8a4a-fa1636a6d405 |
| Smoke `active_effort` | 3 |
| Smoke `active_tasks` | 1 |
| Rollback executed | Yes |
| Executor | Antigravity |

Smoke output:

```text
[
  {
    "id": "16da2c20-edc4-4590-8a4a-fa1636a6d405",
    "name": "Smoke Data Engineer",
    "capacity": "media",
    "active_effort": 3,
    "active_tasks": 1
  }
]
```

Final status:

```text
Completed successfully.
```
