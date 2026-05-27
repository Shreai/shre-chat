# QA Automation Structure (MIB / Shre Chat)

## Goal
Automate end-to-end validation for UI + backend/API wiring across all stages:
`dev`, `qa`, `beta`, `prod`, `external0-dev`.

## What Is Implemented
- Stage matrix config: `e2e/config/stage-matrix.json`
- Feature/function registry: `e2e/meta/feature-registry.json`
- Stage orchestrator: `scripts/qa/stage-orchestrator.mjs`
- Wiring audit: `scripts/qa/wiring-audit.mjs`
- Existing multi-agent Playwright orchestration remains primary: `scripts/qa-orchestrator.mjs`

## Run Commands
- Full per-stage dry-run QA:
```bash
npm run qa:stages
```
- Single stage:
```bash
npm run qa:stages -- --stage dev
```
- API wiring audit against current base URL:
```bash
npm run qa:wiring
```
- API wiring audit for a target stage URL:
```bash
PLAYWRIGHT_BASE_URL=https://<stage-url> npm run qa:wiring
```

- Contract schema + RBAC matrix agents only:
```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5000 \
npx playwright test --no-deps --project=contract-schema --project=rbac-matrix
```

- CI policy gate bundle:
```bash
npm run qa:policy
```

## Superadmin Coverage Model
Add dedicated specs for these controls and enforce per stage:
1. Stage selector visibility and stage lock rules.
2. Feature activation/deactivation control (`on/off`) with RBAC checks.
3. Workspace scoping (`rapidnir`, `nir`) and policy boundaries.
4. Audit trail verification (event emitted, actor, stage, correlation id).

RBAC credentials are env-driven for secure CI/local execution:
- `E2E_SUPERADMIN_USER`, `E2E_SUPERADMIN_PASS`
- `E2E_ADMIN_USER`, `E2E_ADMIN_PASS`
- `E2E_OPERATOR_USER`, `E2E_OPERATOR_PASS`
- `E2E_READONLY_USER`, `E2E_READONLY_PASS`

If a role pair is missing, that role test is skipped (not failed).

To hard-enforce all roles in CI, set:
- `E2E_RBAC_REQUIRE_ALL=true`

## Traceability Requirements
Every test run should emit and persist:
- `runId` (already emitted by stage orchestrator)
- `stage`
- `workspace`
- `featureId`
- `correlationId` from API responses (if available)
- screenshots / trace / video artifacts

## What Else To Add Next (Recommended)
1. Contract assertions per endpoint from `contract.json` (status + JSON schema).
2. Role matrix tests (`superadmin`, `admin`, `operator`, `read-only`) per stage.
3. Service virtualization for unstable dependencies (`shre-tasks`, optional integrations).
4. Synthetic data seeding/reset per run for deterministic results.
5. OpenTelemetry export and dashboards (latency, error rate, flaky tests by feature).
6. Graph sync gate in CI (`graphify update .`) with artifact retention outside Git.

## Important Notes
- Do not commit generated `graphify-out/*` artifacts in `shre-chat`.
- For prod/beta runs, use real auth flow and 2FA-compliant service users.

## Fully Automated Cycle
Use one command to run the full cycle and emit a single pass/fail artifact:

```bash
npm run qa:cycle
```

Variants:
- Include stage matrix:
```bash
npm run qa:cycle:full
```
- Hard gate for CI (no skips, all RBAC creds required):
```bash
npm run qa:cycle:strict
```

Output artifact:
- `e2e/results/cycle/cycle-<timestamp>.json`
- Contains per-step status, duration, and final pass/fail.
