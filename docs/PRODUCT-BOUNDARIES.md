# Product Boundaries

## Shre OS

- Command center for the fleet
- Owned by Shre.ai within the Nirlab umbrella
- Controls orchestration, audit, release control, and shared platform services

## AROS

- Separate product
- Launched through Shre Platform
- Own product context, release notes, docs, and support flow
- Can share platform services without collapsing into the command center
- Can use its own theme pack, brand tokens, and layout accents without changing the shared shell structure

## Dashboard Rule

- Do not hard-clone dashboards unless the products truly need separate codebases.
- Prefer one shared shell with product modes, branding layers, and tenant/workspace boundaries.
- Split codebases only when release cadence, compliance, or ownership demands it.
- Allow product-specific theme packs so AROS can look distinct while still using the shared platform shell.
