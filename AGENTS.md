# AGENTS.md

## Purpose

Repo-local execution overlay for `shre-chat`.

Primary shared contract:

- `../docs/shared-coding-rules.md`

Read before editing:

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/TRACE-ROUTE.md`
4. `contract.json`

## Repo Boundaries

- `serve.js` owns transport, proxying, session persistence wiring, and local direct-mode server behavior.
- `src/` owns UI state, rendering, route behavior, and client-side orchestration.
- `routes/` owns backend route slices and must stay thin.
- `contract.json` is the API contract surface and must stay aligned with route and UI behavior.
- AI provider selection, trust gates, shared memory, and budget enforcement belong in `shre-router`, not in UI components.

Hard rules:

- Do not put provider-specific or infrastructure execution logic into React components.
- Do not invent backend behavior in UI just to complete a flow.
- Normalize API results at the edge before rendering.
- Prefer local route boundaries or fallbacks over global crash handling for browser-blocking bugs.

## Context Budget

Scope work to:

1. changed component, hook, route, or server handler
2. direct caller or callee
3. contract boundary in `contract.json` or the touched route

Do not review the whole chat app unless a failing test or trace shows wider impact.

## Verification Ladder

- targeted component or route test first
- targeted route curl or local request second
- touched chat flow or page check third
- `npm test`, `npm run build`, or broader QA only after the narrow checks pass, or when release risk requires it

## Trace Route

For visible or flow changes, keep a trace packet with:

- before state
- changed files
- after state
- rollback target

Use `docs/TRACE-ROUTE.md` as the repo-specific evidence standard.
