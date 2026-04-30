# Service Catalog

This is the canonical list of services the platform depends on.
It helps with ownership, environment mapping, and incident response.

## Fields

- service name
- owner
- purpose
- environment
- port or host
- dependencies
- status
- incident contact
- rollback path

## Starter Entries

| Service | Owner | Purpose | Environment | Port / Host | Status |
|---|---|---|---|---|---|
| `shre-chat` | platform | chat command center | dev / qa / prod | `5510` | active |
| `shre-router` | platform | model routing and trust gate | shared | `5497` | active |
| `shre-auth` | platform | auth and sessions | shared | `5455` | active |
| `shre-tasks` | platform | task creation | optional | `5460` | active |
| `shre-fleet` | platform | agent count / fleet metadata | optional | `5498` | active |
| `MIB007` | platform | workspace shell and apps | shared | `5520` | active |
| `Supabase` | platform | database/auth/storage | qa / prod | host-managed | active |
| `Cloudflare` | platform | edge, WAF, DNS | prod | host-managed | active |
| `Hostinger VPS` | platform | hosting for internal products | prod | host-managed | active |

## Rules

- every production-relevant service needs an owner
- every service should have an incident contact
- every service should have a rollback path or replacement path
- if a service is missing from the catalog, add it before launch

## Rule

The service catalog should be complete enough that an on-call human can find the right place to look.
