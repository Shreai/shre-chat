# Observability Standard

## Required Signals

- structured logs
- service health checks
- error rate
- latency
- deploy status
- auth failures
- rollback events

## Dashboards

- one overview dashboard per product
- one incident dashboard for live problems
- one release dashboard for QA and deploy status

## Rules

- log by request or trace id when possible
- keep logs searchable and redact secrets
- alert on user-facing failures and auth spikes
- every incident needs a post-incident note

