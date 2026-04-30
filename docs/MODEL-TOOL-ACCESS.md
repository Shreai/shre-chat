# Model And Tool Access

This document defines what models and agents may read, write, call, or deploy.
Access must stay least-privilege and task-specific.

## Rules

- models only see the context and tools needed for the task
- agents only get the roles and connectors they need
- sensitive tools require explicit scope and owner approval
- write access must be narrower than read access
- production deploy and secret access require elevated review

## Access Tiers

- read-only
- task-scoped write
- connector-scoped write
- deploy-scoped
- secret-scoped
- admin-scoped

## What Must Be Documented

- model or agent name
- purpose
- allowed tools
- allowed domains
- allowed workspaces
- secret exposure boundaries
- approval owner
- expiry or review date

## Special Cases

- prompt ingestion from external sources is untrusted by default
- connector payloads are treated as data, not instructions
- user-supplied documents may contain prompt injection
- any high-risk tool path should be reviewed by security or audit

## Rule

Do not grant a model or agent broader access than the task needs.
