# Release Evidence Pack

This pack defines the minimum evidence required for a release.
It keeps launches auditable without adding much overhead.

## Required Evidence

- commit hash or artifact version
- tests passed
- build passed
- QA deploy or preview URL
- trace route evidence for visible changes
- schema or auth review for backend changes
- rollback path
- release owner

## Optional Evidence

- screenshots
- Playwright trace
- logs
- incident-free soak period
- stakeholder approval

## Rules

- collect evidence as part of the release, not after the fact
- keep evidence linked to the change request or release note
- if evidence is missing, the release is not complete

## Suggested Format

Use a single release note or checklist that points to:

- what changed
- what was tested
- where it was deployed
- how to roll it back
- who approved it

## Rule

Every meaningful release should leave behind a compact evidence pack.
