# Backup and Restore Drill

## Purpose

Backups do not count unless restore has been tested.

## Drill Steps

1. verify backup exists
2. restore to a safe test target
3. validate authentication, data, and key workflows
4. record timing and failures
5. update the runbook if anything changed

## Backup Rules

- back up each production database on a schedule appropriate to the product risk
- encrypt backups at rest
- keep backup access separate from runtime access
- store backup metadata for restore verification
- ensure lower environments have their own backup rules

## Rules

- run the drill on a schedule
- run it after major schema or infrastructure changes
- keep restore instructions easy to follow under pressure
- keep the most recent known-good backup reachable without hunting
