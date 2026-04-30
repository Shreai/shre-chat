# Fleet Lifecycle

This doc defines what the agent fleet is for in Shre OS.
The fleet exists to take a product from idea to launch, then keep it healthy as it changes.

## Purpose

The fleet is not only for new builds.
It is the operating team that:

- codes the product
- maintains the product
- upgrades the product
- expands the product
- retires the product cleanly when needed

## Lifecycle Phases

1. idea and intake
2. discovery and scope
3. build and MVP
4. QA and launch
5. maintain
6. upgrade and expand
7. review, deprecate, or retire

## What The Fleet Does In Each Phase

- **Build**: implement the first working product.
- **Maintain**: fix bugs, keep dependencies current, support users, and keep docs honest.
- **Upgrade**: add features, improve architecture, strengthen security, and reduce debt.
- **Expand**: add new modules, connectors, workspaces, markets, or automation.

## Operating Rules

- every project gets a right-sized fleet
- the fleet should stay narrow and purpose-driven
- build work and maintenance work both use the same project base, delivery control, risk, and review loop
- changes should be tracked as releases or controlled requests, not informal drift
- the fleet should use evidence, tests, and rollback paths for anything user-facing

## Rule

If a project has an owner and a future, it should have a fleet lifecycle plan, not just a build plan.
