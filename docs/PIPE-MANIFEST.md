# Pipe Manifest

Pipes connect one app to another. Treat them as versioned integration contracts, not casual automation.

## Rules

- every pipe needs a named owner
- every pipe needs a source app and a destination app
- every pipe needs a payload contract
- every pipe needs a rollback path
- every pipe needs observability and retry rules
- if a pipe crosses products, tenants, or jurisdictions, review it like a release

## Fields

- pipe id
- pipe name
- source app
- destination app
- trigger
- event or payload type
- data classification
- auth method
- secret location
- transformation rules
- idempotency key
- retry policy
- dead-letter or failure handling
- fallback behavior
- owner
- environment
- version
- rollback path
- audit log location

## Minimum Contract

Every pipe should define:

1. what starts it
2. what data moves through it
3. what changes are allowed in transit
4. what happens on failure
5. how to stop or roll it back

## Example Row

| Pipe ID | Source App | Destination App | Trigger | Data Class | Owner | README |
|---|---|---|---|---|---|---|
| `tasks-to-email` | Tasks | Email | task created | internal | platform | [docs/pipes/tasks-to-email.md](pipes/tasks-to-email.md) |

## Rules For Design

- keep pipes narrow and specific
- prefer event names over loose free-text triggers
- never let a pipe write to two systems without explicit ownership
- separate read-only sync from write-back pipes
- version breaking pipe changes
