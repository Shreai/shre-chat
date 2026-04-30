# Dependency and License Review

This document defines how we review libraries, assets, and third-party code.
The goal is to avoid accidental license problems and supply-chain surprises.

## Review Items

- package dependencies
- transitive dependencies
- fonts and media assets
- connector SDKs
- generated code
- open-source license obligations

## Rules

- review new dependencies before shipping them in a product
- remove dead or duplicate dependencies during cleanup
- keep a record of license-sensitive packages
- track whether a dependency is allowed in customer-delivered products
- verify any redistribution obligations before release

## What To Record

- dependency name
- version
- license
- purpose
- owner
- review date
- allowed products or workspaces
- removal or replacement plan

## Review Triggers

- new dependency
- major version change
- new asset source
- customer delivery
- product redistribution

## Rule

If a dependency or asset matters to distribution, license review is required before release.
