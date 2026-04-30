# Connector Manifest

This is the per-connector companion to the connector catalog.
Use it to point each integration at the README, secret location, owner, and environment it belongs to.

## Rules

- every connector needs a named owner
- every connector needs a README or manifest entry
- every secret location must be documented
- sandbox and production credentials stay separate

## Fields

- connector id
- connector name
- app or domain
- owner
- environment
- auth method
- secret location
- README path
- callback URLs
- required scopes
- rollback / revoke path

## Starter Rows

| Connector ID | Connector Name | App / Domain | Owner | Environment | README |
|---|---|---|---|---|---|
| `mib007-api` | MIB007 API | MIB shell | platform | shared | [docs/apps/mib007.md](apps/mib007.md) |
| `shre-router` | Shre Router | platform | platform | shared | [docs/apps/router-gateway.md](apps/router-gateway.md) |
| `shre-auth` | Shre Auth | platform | platform | shared | [docs/apps/shre-platform.md](apps/shre-platform.md) |
| `supabase` | Supabase | data | platform | qa / prod | [docs/apps/cortexdb.md](apps/cortexdb.md) |
| `hostinger-vps` | Hostinger VPS | hosting | platform | prod | [docs/apps/bos.md](apps/bos.md) |
| `cloudflare` | Cloudflare | edge | platform | prod | [docs/apps/status.md](apps/status.md) |
| `slack` | Slack | communications | platform | shared | [docs/apps/persona.md](apps/persona.md) |

## Rule

Before adding a new connector, add a manifest row and a README path.
