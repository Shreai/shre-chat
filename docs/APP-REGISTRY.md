# App Registry

This registry lists the current app surface in the Shre OS and MIB shell.
Use it to decide which README template, connector doc, or agent skill to open first.

## Rules

- every app should have a README based on [App README Template](APP-README-TEMPLATE.md)
- every connector should point back to [Connector Catalog](CONNECTOR-CATALOG.md)
- every app should identify its domain in [Domain Index](DOMAIN-INDEX.md)
- every long-lived app should carry category, tags, and keywords in its README
- if an app crosses jurisdictions or regulated data, check the legal pack before launch

## Platform Apps

| App ID | Name | Type | Notes | README |
|---|---|---|---|---|
| `mib007` | MIB007 | platform app | Agents & Issues | use template |
| `shre-platform` | Shre AI | platform app | Dashboard | use template |
| `router-gateway` | Gateway Status | platform app | AI Gateway | use template |
| `cortexdb` | CortexDB | platform app | Knowledge DB | use template |

## MIB Deep-Link Apps

| App ID | Name | Type | Notes | README |
|---|---|---|---|---|
| `tasks` | Tasks | workspace app | Task Manager | use template |
| `email` | Email | workspace app | Inbox & Compose | use template |
| `todo` | Todo | workspace app | Reminders & Lists | use template |
| `calendar` | Calendar | workspace app | Events & Schedule | use template |
| `contacts` | Contacts | workspace app | CRM Contacts | use template |
| `deals` | Deals | workspace app | Sales Pipeline | use template |
| `pos` | POS | workspace app | Point of Sale | use template |
| `invoices` | Invoices | workspace app | Billing & Invoices | use template |
| `projects` | Projects | workspace app | Project Boards | use template |
| `issues` | Issues | workspace app | Bugs & Requests | use template |
| `goals` | Goals | workspace app | OKRs & Goals | use template |
| `files` | Files | workspace app | Documents & Files | use template |
| `approvals` | Approvals | workspace app | Pending Approvals | use template |
| `pipes` | Pipes | workspace app | Automations | use template |
| `persona` | Persona | workspace app | AI Persona Builder | use template |

## Subdomain Apps

| App ID | Name | Type | Notes | README |
|---|---|---|---|---|
| `marketplace` | Marketplace | subdomain app | Agent Store | use template |
| `storepulse` | StorePulse | subdomain app | POS Analytics | use template |
| `peytm` | Peytm | subdomain app | Domain Registry | use template |
| `bos` | BOS | subdomain app | Back Office | use template |
| `developers` | Developers | subdomain app | Developer Portal | use template |
| `voice` | Voice | subdomain app | Voice Assistant | use template |
| `status` | Status | subdomain app | Health Monitor | use template |
| `shreroute` | ShreRoute | subdomain app | Dev Tool | use template |
| `api` | API | subdomain app | Platform API | use template |
| `cpg` | CPG Intel | subdomain app | Brand Intelligence | use template |
| `benchmark` | Benchmark | subdomain app | Platform Score | use template |
| `pos-site` | Nirtek | subdomain app | Main Site | use template |
| `centrix` | Centrix ERP | marketplace app | Embeddable ERP | use template |

## Suggested README Sections

If you create a README for one of the apps above, keep the same section order:

1. identity
2. purpose
3. where it lives
4. related systems
5. agent and skill map
6. setup
7. configuration
8. data and contracts
9. security
10. operations
11. QA
12. dependencies
13. change log
