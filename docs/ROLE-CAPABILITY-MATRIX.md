# Role Capability Matrix

This matrix defines what each role can typically read, write, approve, or deploy.
Use it to keep model and agent access narrow.

## Matrix

| Role | Read | Write | Approve | Deploy |
|---|---|---|---|---|
| coordinator | all project docs | task routing | scope triage | no |
| tech stack expert | architecture, code, standards | technical docs | architecture review | no |
| backend expert | backend, schema, API | backend code, API docs | backend review | no |
| frontend expert | UI, design, accessibility | frontend code, design docs | UI review | no |
| infra expert | deployment, env, secrets | infra config, deploy docs | env review | yes, scoped |
| QA agent | tests, traces, UI flows | test assets, QA notes | release validation | no |
| security / pentest agent | security docs, threat model | findings, security notes | security review | no |
| marketing agent | brand, launch, content | marketing docs | copy review | no |
| support / docs agent | handoff, runbooks, docs | support docs | doc review | no |
| audit agent | everything needed for review | audit notes, gap lists | policy review | no |
| trace-route agent | UI evidence, before/after traces | trace notes | visible-change review | no |

## Rules

- roles should default to read-only unless a task needs write access
- deploy access should stay limited to infra or release owners
- approvals should be explicit, not implied
- if a role needs broader access, document the exception

## Rule

Every project should know which role can do what before work starts.
