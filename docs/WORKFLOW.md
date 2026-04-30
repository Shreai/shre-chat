# Shre OS Workflow

## Deployment Request

Use this format when you want Shre OS to spin up or deploy work on a specific mesh node.

```text
Project: AROS
Owner: AROS
Type: client / internal / platform
Target mesh nodes: Mac 2, Mac 3
Workspace: /path/to/project
Environment: client-hosted / nirlab-hosted / hybrid
Hosting: Hostinger VPS / customer VPS / Cloudflare / other
Database: Supabase / customer DB
Auth: Supabase Auth / customer IdP
Frontend: shared shell / custom shell
Backend: shared / dedicated
Need QA: yes
Need security review: yes
Need audit review: yes
Need launch docs: yes
```

## Handoff Rules

- One project per workspace.
- One agent fleet per project.
- One owner for each write area.
- Do not let two nodes edit the same files at the same time.
- Sync only at task boundaries or explicit handoffs.

## Product Boundary Rule

- If the work has its own owner, brand, support flow, release cadence, or docs, treat it as a separate product.
- If the work is only a shared control-plane capability, keep it inside Shre OS.

## Project Operating Base

- every new project should inherit the [Project Operating Base](PROJECT-OPERATING-BASE.md)
- the base must be present before build mode starts
- projects may customize stack and design, but the base docs and review loop stay in place
- if a project is missing the base docs, treat that as a launch blocker

## Guardrails

- Docs do not count as delivery.
- Every change needs code, tests, build output, and a runtime path.
- QA deploys happen before production deploys.
- Anything shipped by the fleet should have an audit trail and rollback plan.
- UI and workflow changes should pass through the trace route agent with before/after evidence.
- Backend and frontend work should be reviewed separately using the full-stack standards doc.
