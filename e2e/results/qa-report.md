# QA Test Report — 2026-03-27 20:46:39

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | 99 |
| Passed | 95 |
| Failed | 0 |
| Skipped | 4 |
| Flaky | 0 |
| Pass Rate | 96.0% |

## Agent Results

| Agent | Domain | Passed | Failed | Skipped |
|-------|--------|--------|--------|--------|
| Agent 1 (chat-core) | Chat Core | 8 | 0 | 2 |
| Agent 2 (navigation) | Navigation | 11 | 0 | 0 |
| Agent 3 (api-health) | API Health | 20 | 0 | 0 |
| Agent 4 (ecosystem) | Ecosystem | 11 | 0 | 0 |
| Agent 5 (sidebar) | Sidebar | 9 | 0 | 0 |
| Agent 6 (accessibility) | Accessibility | 13 | 0 | 0 |
| Agent 7 (preview) | Preview | 12 | 0 | 0 |
| Agent 8 (responsive) | Responsive | 6 | 0 | 0 |
| Smoke (smoke) | Smoke | 4 | 0 | 2 |

## Gaps Detected

- **accessibility** (no console errors on page load): 1 console errors on load:
- **responsive** (buttons have minimum touch targets (44px)): 2 buttons below 32px touch target on mobile:

## Re-run Failed Tests

```bash
node scripts/qa-orchestrator.mjs --rerun-failed
```

## Run Single Agent

```bash
node scripts/qa-orchestrator.mjs --agent chat-core
```
