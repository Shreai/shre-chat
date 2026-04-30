# Retirement Process

This document defines how to retire an app, connector, pipe, or policy cleanly.

## When To Retire

- the feature is replaced
- the feature is no longer used
- the feature has a safer or simpler successor
- the feature is causing maintenance burden without enough value

## Steps

1. mark the item deprecated
2. notify owners and affected workspaces
3. document the replacement or migration path
4. remove write access or turn off automation
5. preserve data or export it if required
6. update docs, manifests, and indexes
7. confirm the retired path no longer accepts new work

## Rules

- do not delete without a migration or archival plan
- keep old links understandable for a period of time
- retire dependencies and pipes before removing the source or target app
- archive legal or compliance records as required

## Outputs

- deprecation note
- migration note
- archive status
- removal commit or deploy reference

## Rule

Retirement should be a planned change, not an accident.
