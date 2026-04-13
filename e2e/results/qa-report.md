# QA Test Report — 2026-04-13 21:37:51

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | 138 |
| Passed | 124 |
| Failed | 0 |
| Skipped | 11 |
| Flaky | 3 |
| Pass Rate | 89.9% |

## Agent Results

| Agent | Domain | Passed | Failed | Skipped |
|-------|--------|--------|--------|--------|
| Agent 1 (chat-core) | Chat Core | 10 | 0 | 0 |
| Agent 2 (navigation) | Navigation | 11 | 0 | 0 |
| Agent 3 (api-health) | API Health | 20 | 0 | 0 |
| Agent 4 (ecosystem) | Ecosystem | 11 | 0 | 0 |
| Agent 5 (sidebar) | Sidebar | 9 | 0 | 0 |
| Agent 6 (accessibility) | Accessibility | 13 | 0 | 0 |
| Agent 7 (preview) | Preview | 13 | 0 | 0 |
| Agent 8 (responsive) | Responsive | 6 | 0 | 0 |
| Smoke (smoke) | Smoke | 6 | 0 | 0 |
| Agent 9 (data-integration) | Data Integration | 10 | 0 | 2 |
| Agent 12 (edi-import) | EDI Import | 1 | 0 | 9 |

## Gaps Detected

- **responsive** (buttons have minimum touch targets (44px)): 1 buttons below 32px touch target on mobile:
- **data-integration** (rapidlab query returns data-aware response): Agent cannot access rapidlab data — check data-source-resolver tenant-sources.json
- **router-connect** (status bar shows connected (green dot)): Status bar shows Disconnected — shre-router may be down

## Tasks Created in shre-tasks

- `undefined`: 1 buttons below 32px touch target on mobile:
- `undefined`: Agent cannot access rapidlab data — check data-source-resolver tenant-sources.json
- `undefined`: Status bar shows Disconnected — shre-router may be down

## Re-run Failed Tests

```bash
node scripts/qa-orchestrator.mjs --rerun-failed
```

## Run Single Agent

```bash
node scripts/qa-orchestrator.mjs --agent chat-core
```
