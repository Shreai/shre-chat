# CI/CD Operations

This document defines how code moves from change to QA to production.
It is the operating standard for builds, pipelines, promotions, and rollback.

## Pipeline Stages

1. validate
2. test
3. build
4. package
5. deploy to QA
6. smoke test
7. promote to production

## Rules

- do not promote a build that failed tests or build checks
- keep QA and production as separate targets
- use the same artifact from QA to production when practical
- store deploy credentials outside the repo
- require a rollback path before production promotion
- notify the owning workspace or product channel on deploy start and finish

## Branching

- feature branches for active work
- `qa` for QA deployment
- `main` or `master` for production deployment

## Required Controls

- build logs
- test logs
- artifact identity or commit hash
- environment-specific secrets
- deploy owner
- rollback instructions

## Environment Promotion

- dev to QA requires automated checks and a QA target
- QA to production requires approval and a healthy QA run
- customer-hosted deployments should use the customer's target and credentials
- Nirlab-hosted internal products use the shared platform target

## Rollback

- keep the previous known-good artifact available
- document the revert command or deploy target
- verify the rollback with smoke checks

## Observability

- record deploy start and deploy finish
- alert on deploy failure
- keep links to logs and traces where available

## Rule

Every project should have a CI/CD plan before it is treated as shippable.
