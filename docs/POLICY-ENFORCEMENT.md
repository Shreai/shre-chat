# Policy Enforcement

This document defines how platform rules are checked in practice.
The goal is to keep docs, manifests, code, and deploys aligned.

## Checks

- docs link to real files and routes
- manifests match the current app or connector surface
- CI runs tests and build checks
- QA deploy happens before production deploy
- visible UI changes have trace evidence
- backend changes have schema and auth review

## Where Enforcement Lives

- pre-commit checks for formatting and basic hygiene
- CI checks for tests, build, and docs links
- review checks for architecture, security, and legal coverage
- deploy checks for environment readiness and rollback path

## Drift Signals

- docs mention a route that does not exist
- a manifest row exists without a README or owner
- a connector or pipe has no rollback path
- a policy says something is required but there is no check for it
- a deploy path differs from the documented path

## Rule

If a platform rule matters, give it at least one concrete check.
