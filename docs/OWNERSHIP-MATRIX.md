# Ownership Matrix

| Area | Owner | Notes |
|------|-------|-------|
| Product | Business owner | Brand, scope, pricing, roadmap |
| Code | Engineering | Implementation and technical quality |
| Data | Platform owner | Schema, retention, backup, restore |
| Security | Security owner | Threat model, secrets, access, audits |
| Release | Release owner | QA, rollout, rollback, versioning |
| Support | Support owner | Handoff, docs, triage, incident follow-up |

## Rules

- every workspace gets one named owner per area
- no area is “shared by default” when a decision is needed
- write owners into the project context before build starts

