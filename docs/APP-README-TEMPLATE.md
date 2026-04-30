# App README Template

Use this as the default README for any app, connector, or tool in the Shre AI platform.
Copy it into the app's own folder or docs area and fill in the placeholders.

## Identity

- **Name:** `<app name>`
- **App ID:** `<app id>`
- **Type:** `app | connector | tool | skill`
- **Domain:** `<domain or product line>`
- **Owner:** `<person or team>`
- **Workspace:** `<workspace or tenant>`
- **Status:** `planned | active | deprecated`

## Purpose

Describe what the app does in one or two sentences.

## Where It Lives

- **UI path:** `<route or host>`
- **API path:** `<api route or service>`
- **Registry link:** `[App Registry](APP-REGISTRY.md)`
- **Domain link:** `[Domain Index](DOMAIN-INDEX.md)`
- **Connector link:** `[Connector Catalog](CONNECTOR-CATALOG.md)`

## Related Systems

- upstream services:
- downstream services:
- auth provider:
- data store:
- webhook or callback endpoints:
- external dependencies:

## Agent And Skill Map

List the agent roles or skills that should be used when working on this app.

- coordinator:
- backend expert:
- frontend expert:
- infra expert:
- QA agent:
- security / pentest agent:
- audit agent:

## Setup

```bash
# install
<install command>

# run locally
<run command>

# test
<test command>
```

## Configuration

- required env vars:
- secrets location:
- feature flags:
- sandbox or test credentials:
- production credentials:

## Data And Contracts

- primary tables or collections:
- API contracts:
- webhook contracts:
- file formats:
- event names:

## Security

- auth model:
- role model:
- secret handling:
- rate limits:
- audit logging:
- compliance notes:

## Operations

- deployment target:
- rollback path:
- backup policy:
- incident contact:
- support contact:
- SLA notes:

## QA

- smoke tests:
- regression tests:
- accessibility checks:
- screenshot or trace evidence:
- release approval requirements:

## Dependencies

- apps:
- connectors:
- libraries:
- external APIs:

## Change Log

- `YYYY-MM-DD` — initial creation
- `YYYY-MM-DD` — major update
