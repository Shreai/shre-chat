# Platform Standards

## Purpose

This document defines the shared operating rules for every product built on Shre OS.
It applies to internal work, client work, and white-labeled products unless a stricter customer standard overrides it.

## Platform Rule Loading

- every model used in the platform should read this document before acting on a task
- every agent should follow this document where it applies to the task
- agents should also read the relevant domain, product, connector, or pipe document before making changes in that area
- if a task touches legal, compliance, or jurisdiction, the legal pack and governance review also apply

## Non-Negotiables

- workspace-first and multi-tenant by default
- backend and frontend stay separate
- secrets stay server-side
- every release has code, tests, build output, and evidence
- visible changes need before/after trace evidence
- every product declares its compliance profile before launch

## Transport

- use HTTPS for all public traffic
- allow HTTP only for private local development or trusted internal hops behind a proxy, tunnel, or private network
- terminate TLS at the edge or trusted ingress
- reject mixed or ambiguous transport setups for production
- prefer modern TLS settings and keep certificates rotated

## SLA and Support

Every product should declare:

- uptime target
- support response targets by severity
- maintenance window policy
- incident escalation path
- rollback target and recovery time objective
- data recovery objective

Treat SLA numbers as product-specific commitments, not a universal default.

## Compliance Profiles

These are design targets, not automatic certifications.
We can build to be compatible with them, but certification or formal attestation is a separate business/legal process.

- **HIPAA**: use when handling ePHI; require administrative, physical, and technical safeguards; keep access limited to role and need
- **PCI DSS**: use when handling payment data; isolate the cardholder data environment; never store secrets or card data in the client bundle; scope narrowly
- **SOC 2**: align to security, availability, processing integrity, confidentiality, and privacy controls
- **ISO/IEC 27001**: align to an information security management system with risk management, policies, and continual improvement

If a product needs a regulated profile, add a separate compliance checklist and owner for it.

## Coding Style

- use TypeScript where possible
- prefer small, focused modules
- keep components pure
- use props and state deliberately
- avoid hidden mutation and broad side effects
- keep names explicit and consistent
- prefer reusable helpers over copy-paste
- format with the repo formatter before merging
- keep lint warnings under control

## Backend Standards

- schema first, then API, then UI
- use migrations for database changes
- define API contracts explicitly
- validate all inbound payloads
- authorize by workspace, role, and object scope
- log important auth, deploy, and rollback events
- keep secrets, keys, and private credentials out of responses
- do not let the frontend talk to the database directly unless the architecture explicitly allows it

## Database Standards

- model around tenants/workspaces
- use stable identifiers
- avoid ambiguous nullable fields when a clear enum or relation is better
- index common lookup paths
- separate canonical data from derived views
- make migrations reversible when practical
- document any irreversible or forward-only migration
- treat destructive changes as release events, not casual edits

## API Standards

- version APIs when behavior changes materially
- use clear request and response schemas
- return predictable error shapes
- make write endpoints idempotent where practical
- support pagination for list endpoints
- never expose internal secrets or raw connector tokens
- rate limit auth-sensitive and write-heavy endpoints
- secure APIs against broken object-level authorization, injection, and unsafe consumption patterns

## Frontend Standards

- use semantic HTML first
- keep the visual shell swappable for white-label use
- keep animations subtle and meaningful
- respect `prefers-reduced-motion`
- keep text readable and layouts responsive on mobile and desktop
- prefer CSS-driven presentation and motion over imperative animation when practical
- keep design tokens centralized
- use accessible focus states and keyboard interactions

## Authentication and Authorization

- use server-managed sessions or signed tokens stored safely
- require MFA for privileged access where possible
- scope permissions by workspace and role
- do not trust client-side claims without server verification
- use least privilege for service accounts and connectors
- keep auth flows explicit in logs and runbooks

## API Keys and Secrets

- never ship raw keys to the browser bundle
- store secrets server-side or in a vault
- rotate keys on schedule and after incidents
- scope keys to the narrowest possible use
- separate dev, QA, and production credentials
- never print full secrets in logs
- mask secrets in screenshots, traces, and exports

## Connectors and Integrations

- each connector gets a versioned adapter
- connectors should be idempotent where possible
- retries must have backoff and failure handling
- prefer allowlists over wildcard access
- document required scopes and callback URLs
- keep connector-specific credentials separate from app-wide credentials
- make connector behavior testable with a sandbox or mock

## Conexxus Rule

For retail and petroleum products, use the applicable Conexxus standards as the contract layer for industry-specific behavior.
That includes product codes, loyalty flows, site assets, device integration, and any other published standard needed by the product.
When a Conexxus standard exists, prefer it over ad hoc message shapes.

## Launch Checklist

- compliance profile chosen
- SLA defined
- HTTPS/TLS path defined
- backend schema reviewed
- API contracts reviewed
- frontend accessibility reviewed
- auth reviewed
- connector scopes reviewed
- trace-route evidence captured
- rollback plan documented
