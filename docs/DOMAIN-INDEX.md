# Domain Index

This is the quick entry point for apps, connectors, and agent skills in the Shre AI platform.
Use it to find the right operating docs by domain instead of hunting across folders.

## How To Use

- start with the product or work domain
- open the app or connector doc that matches the system you are touching
- follow the linked standards before editing code, flows, or credentials
- if a domain is regulated or cross-border, check the legal pack and jurisdiction matrix first

## Shre OS And Command Center

- [Workflow](WORKFLOW.md) for mesh requests, product boundaries, and handoff rules
- [Platform Standards](PLATFORM-STANDARDS.md) for shared operating rules
- [Full-Stack Standards](FULL-STACK-STANDARDS.md) for backend/frontend separation
- [Operations Index](OPERATIONS-INDEX.md) for releases, incidents, observability, and change control
- [Guardrails](GUARDRAILS.md) for definition of done and evidence requirements

## Products And Workspaces

- [Product Boundaries](PRODUCT-BOUNDARIES.md) for Shre OS vs AROS separation
- [Ownership Matrix](OWNERSHIP-MATRIX.md) for who owns code, data, deploys, and rollback
- [Customer Handoff Pack](CUSTOMER-HANDOFF.md) for delivered product handoff
- [Environment Matrix](ENVIRONMENT-MATRIX.md) for host, database, and deployment targets
- [App Registry](APP-REGISTRY.md) for the current app surface and README mapping
- [App README Template](APP-README-TEMPLATE.md) for app, connector, and tool docs
- [Indexing Standard](INDEXING-STANDARD.md) for category, tags, and keywords
- [App Readmes](apps/README.md) for generated starter docs per app
- [Pipe Manifest](PIPE-MANIFEST.md) for app-to-app contract flows
- [Pipes Starter Docs](pipes/README.md) for pipe-specific templates
- [Governance Review](GOVERNANCE-REVIEW.md) for policy review cadence and gaps
- [CI/CD Operations](CI-CD-OPERATIONS.md) for build and deploy flow
- [Exception Process](EXCEPTION-PROCESS.md) for controlled overrides
- [Model and Tool Access](MODEL-TOOL-ACCESS.md) for least-privilege model access
- [Dependency and License Review](DEPENDENCY-LICENSE-REVIEW.md) for supply chain checks
- [Prompt Injection Safety](PROMPT-INJECTION-SAFETY.md) for untrusted content handling

## Legal And Compliance

- [Legal Docs Pack](LEGAL-DOCS-PACK.md) for terms, privacy, IP, and jurisdiction docs
- [Terms and Conditions](TERMS-AND-CONDITIONS.md)
- [Privacy Policy](PRIVACY-POLICY.md)
- [Copyright and IP Policy](COPYRIGHT-IP.md)
- [Jurisdiction Matrix](JURISDICTION-MATRIX.md)
- [Compliance Register](COMPLIANCE-REGISTER.md)

## Backend And API Domains

- [API Reference](API.md)
- [API Versioning](API-VERSIONING.md)
- [Connector Catalog](CONNECTOR-CATALOG.md)
- [Connector Manifest](CONNECTOR-MANIFEST.md)
- [Pipe Manifest](PIPE-MANIFEST.md)
- [Dependency Policy](DEPENDENCY-POLICY.md)
- [Secrets Rotation](SECRETS-ROTATION.md)
- [Threat Model](THREAT-MODEL.md)

## Frontend And Design Domains

- [Design Tokens](DESIGN-TOKENS.md)
- [Trace Route](TRACE-ROUTE.md)
- [Testing Guide](TESTING.md)
- [Observability Standard](OBSERVABILITY-STANDARD.md)

## Agent Roles

These are the default operating roles for project fleets:

- coordinator
- tech stack expert
- backend expert
- frontend expert
- infra expert
- QA agent
- security / pentest agent
- marketing agent
- support / docs agent
- audit agent
- trace-route agent

## Domain Shortcuts

### Retail / Petroleum

- use [Platform Standards](PLATFORM-STANDARDS.md) for the Conexxus rule
- prefer Conexxus-aligned schemas, connectors, and device behavior

### Regulated Data

- check [Compliance Register](COMPLIANCE-REGISTER.md)
- check [Launch Approval](LAUNCH-APPROVAL-CHECKLIST.md)
- check [Jurisdiction Matrix](JURISDICTION-MATRIX.md)

### New Market Launch

- review [Terms and Conditions](TERMS-AND-CONDITIONS.md)
- review [Privacy Policy](PRIVACY-POLICY.md)
- review [Copyright and IP Policy](COPYRIGHT-IP.md)
- fill in the jurisdiction row before release

### App Documentation

- start with [App Registry](APP-REGISTRY.md)
- copy [App README Template](APP-README-TEMPLATE.md)
- link connectors through [Connector Catalog](CONNECTOR-CATALOG.md)

## Rule

If a domain does not have a linked doc yet, create the doc before wiring new code or adding a connector.
