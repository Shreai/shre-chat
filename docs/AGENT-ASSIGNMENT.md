# Agent Assignment

This doc explains how Shre OS assigns work to agents and, when helpful, to different model families such as Codex, Claude, or Gemini.

## Core Rule

Assign by task shape and responsibility first, then choose the model that fits the task best.

Do not assign by model brand alone.
Do not let two agents edit the same write area at the same time.

## Default Assignment Flow

1. define the task
2. pick the responsible role
3. pick the smallest write scope
4. choose the model or tool that best fits the task
5. define evidence, tests, and rollback expectations
6. hand off through the coordinator

## Practical Model Routing

| Task shape | Preferred fit | Notes |
|---|---|---|
| repo-local code changes | Codex-style coding agent | Best for editing files, running tests, fixing build issues, and iterating inside the workspace |
| architecture, policy, and long synthesis | Claude-style reasoning agent | Best for design review, policy writing, and wide-context analysis |
| multimodal or cross-check work | Gemini-style review agent | Best when the task benefits from alternate reasoning, image/doc inspection, or broad cross-checking |
| release validation and traceable changes | QA / trace-route agent | Best for evidence, screenshots, traces, and rollback proof |
| risk, compliance, and gap review | audit / security agent | Best for policy checks and inconsistency detection |

## Assignment Rules

- coordinator owns routing
- tech stack expert owns architecture decisions
- backend expert owns schema, database, and API shape
- frontend expert owns layout, CSS, motion, and visual polish
- infra expert owns deploy, environment, and hosting details
- QA agent owns test coverage and validation
- security / pentest agent owns attack-surface review
- audit agent owns gap detection and rule drift checks

## Write Scope Rules

- give each agent one primary write area
- keep shared docs read-only unless the coordinator assigns a docs task
- use handoff notes when a task moves from one agent to another
- if a task overlaps another agent's write area, split the task before work starts

## Evidence Rules

- every coded task should produce tests, build output, or trace evidence
- every visible UI change should have before/after proof
- every deployable change should have a rollback path
- every risky change should have a reviewer

## Rule

If the assignment is unclear, the coordinator must resolve the task shape before the agent starts work.
