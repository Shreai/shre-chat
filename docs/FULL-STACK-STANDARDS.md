# Full-Stack Standards

## Role Split

Use separate specialists for the two halves of product delivery:

- **Backend expert**: schemas, database design, APIs, auth, integrations, server-side contracts, secure boundaries
- **Frontend expert**: layout, CSS, motion, accessibility, responsive behavior, theming, polish

Keep the split visible in planning, code review, and release signoff. A generalist can still ship both sides, but the review checklist should treat them as distinct disciplines.

## Backend Standards

- keep secrets, tokens, and private credentials server-side
- model data before wiring UI
- define API contracts explicitly
- validate inputs at the boundary
- check object-level and function-level authorization
- log important auth, deploy, and rollback events
- prefer secure defaults over convenience shortcuts

## Frontend Standards

- keep components pure and props/state predictable
- keep UI state minimal and derived values computed on demand
- use semantic HTML first
- keep animations subtle and respect reduced-motion preferences
- optimize for mobile and keyboard navigation
- use CSS for presentation and motion when practical
- keep white-label theming in design tokens and shared shell layers

## Shared Standards

- React UI follows one-way data flow and component purity
- API work follows OWASP ASVS and OWASP API Security guidance
- visible UI changes need before/after evidence
- every release needs tests, build output, and rollback notes
- backend/frontend separation is enforced by secure API boundaries

## Review Checklist

- Is the backend contract defined before UI wiring?
- Are database and schema changes documented?
- Are secure API routes used instead of direct secret access?
- Are CSS, layout, and animation changes accessible?
- Does the work respect the product boundary and tenant boundary?
- Is there a trace-route artifact for visible changes?

