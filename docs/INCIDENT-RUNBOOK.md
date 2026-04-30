# Incident Runbook

## Severity

- **SEV-1**: outage, data loss, major security exposure
- **SEV-2**: degraded service, partial auth failure, widespread bug
- **SEV-3**: limited bug or support issue

## Steps

1. detect and assign an owner
2. contain the blast radius
3. decide rollback vs hotfix
4. notify stakeholders
5. restore service
6. write the incident summary

## Rules

- favor rollback over risky patching when user impact is high
- preserve evidence before changes when practical
- record what happened, what fixed it, and what we learned

