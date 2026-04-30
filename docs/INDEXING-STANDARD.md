# Indexing Standard

Use this standard when a file, app, connector, or pipe is likely to grow over time.
The goal is fast retrieval, clear categorization, and lower doc drift.

## Why It Exists

Long docs become hard to scan unless they carry stable metadata.
Indexing helps humans, search, and agents find the right doc without guessing.

## Metadata Fields

- category
- subcategory
- tags
- keywords
- aliases
- audience
- domain
- product
- owner
- status

## Rules

- pick one primary category per file
- use 3 to 7 tags, not a giant tag cloud
- keep keywords short and specific
- include aliases when an app, connector, or pipe is known by multiple names
- keep category names stable across the whole platform
- add metadata at the top of the doc before the body content

## Suggested Categories

- platform
- product
- workspace
- connector
- pipe
- compliance
- legal
- operations
- design
- security
- qa
- marketing
- support
- agent

## Suggested Keywords

- app name
- app id
- brand name
- connector name
- source app
- destination app
- external service name
- industry terms
- compliance terms

## File Types

- **App README**: category, tags, keywords, aliases
- **Connector manifest**: category, tags, scopes, environment
- **Pipe manifest**: category, tags, source, destination, event
- **Policy doc**: category, keywords, audience
- **Runbook**: category, audience, incident type

## Rule

If a doc is hard to find or likely to grow, add indexing metadata before it becomes a problem.
