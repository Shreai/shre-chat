# Project Operating Base

This is the default starting pack for every new project in Shre OS.
It keeps memory, routing, review, security, release behavior, and the fleet lifecycle consistent across workspaces.

## Required Docs

Every project should have these docs before launch:

- [Memory and Retrieval Blueprint](MEMORY-RETRIEVAL-BLUEPRINT.md)
- [Governance Review](GOVERNANCE-REVIEW.md)
- [Policy Enforcement](POLICY-ENFORCEMENT.md)
- [Security Baseline](SECURITY-BASELINE.md)
- [CI/CD Operations](CI-CD-OPERATIONS.md)
- [Role Capability Matrix](ROLE-CAPABILITY-MATRIX.md)
- [Service Catalog](SERVICE-CATALOG.md)
- [Release Evidence Pack](RELEASE-EVIDENCE-PACK.md)
- [Retirement Process](RETIREMENT-PROCESS.md)
- [Exception Process](EXCEPTION-PROCESS.md)
- [Dependency and License Review](DEPENDENCY-LICENSE-REVIEW.md)
- [Prompt Injection Safety](PROMPT-INJECTION-SAFETY.md)
- [Delivery Control](DELIVERY-CONTROL.md)
- [Risk Register](RISK-REGISTER.md)
- [Fleet Lifecycle](FLEET-LIFECYCLE.md)

## Enterprise Docs

If the project is strategic, multi-team, customer-facing at scale, or vendor-heavy, add:

- [Portfolio Governance](PORTFOLIO-GOVERNANCE.md)
- [Architecture Decisions](ARCHITECTURE-DECISIONS.md)
- [Vendor Risk](VENDOR-RISK.md)
- [Business Continuity](BUSINESS-CONTINUITY.md)

## Growth Docs

If the project is moving toward beta, launch, or growth, add:

- [Growth Operating Base](GROWTH-OPERATING-BASE.md)

## Default Build Rules

- keep backend and frontend separate
- keep secret-bearing operations server-side
- keep data and credentials isolated per environment
- keep memory structured and retrieval small
- keep the release path versioned and evidenced
- keep exceptions explicit and time-bound

## Default Fleet Rules

- one project per workspace
- one agent fleet per project
- one owner per write area
- one audit path per release
- one rollback path per deployment
- one lifecycle plan per product

## Default Deliverables

Every project should end up with:

- a product context or scope doc
- a delivery control record
- a service catalog entry
- a release evidence pack
- a risk register when the project has meaningful delivery or launch risk
- a rollback path
- a retirement path
- a maintain-and-upgrade plan
- an expansion plan when the product has a future beyond launch
- a legal/compliance review when applicable
- a growth plan when the project is intended for market adoption
- a portfolio or continuity view when the project is strategic or high-availability

## Rule

If a project does not have this base yet, add it before the project enters build mode.
