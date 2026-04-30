# Guardrails

## Definition of Done

A change is not done unless it has:

- implementation in code
- tests for the changed path
- build passing
- a runtime path or UI flow that exercises the change

Docs alone do not count as delivery.

## Evidence Required

Every meaningful change should leave evidence:

- commit hash
- test output
- build output
- preview or QA URL when available
- Playwright trace or screenshot for UI work

## Audit Checks

Before release, confirm:

- docs match actual behavior
- routes exist in code
- config values exist in runtime
- release notes match shipped work

## Debt Control

When AI adds code, we should verify:

- no dead scaffolding is left behind
- no duplicate implementation is created
- temporary hacks are removed or tracked
- tests cover the new behavior

## Release Rules

- QA first, production second
- preview deploy before wider rollout
- rollback plan for user-facing changes
- version everything that affects behavior
