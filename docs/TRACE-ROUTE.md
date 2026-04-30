# Trace Route Agent

## Purpose

The trace route agent verifies what changed between two states of the app or codebase.
It is responsible for:

- capturing a before screenshot or trace before change lands
- capturing an after screenshot or trace after change lands
- comparing the UI or flow delta
- recording rollback steps when behavior regresses

## Inputs

- commit hash or branch
- before screenshot or Playwright trace
- after screenshot or Playwright trace
- changed files or route list
- rollout target and rollback target

## Outputs

- short change summary
- evidence links or file paths
- mismatch list if behavior diverges from the request
- rollback recommendation if the after state is worse

## Rules

- do not mark a change complete without before and after evidence for UI or flow work
- prefer Playwright screenshots or traces over manual descriptions
- if rollback is needed, document the exact commit or deploy target to revert to
- keep the evidence packet with the release notes

## Coverage

Use this role for:

- UI changes
- workflow changes
- auth or navigation changes
- release validation
- rollback verification

