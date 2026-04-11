# QA Test Report — 2026-04-11 22:51:19

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | 12 |
| Passed | 12 |
| Failed | 0 |
| Skipped | 0 |
| Flaky | 0 |
| Pass Rate | 100.0% |

## Agent Results

| Agent | Domain | Passed | Failed | Skipped |
|-------|--------|--------|--------|--------|
| Agent 1 (chat-core) | Chat Core | 0 | 0 | 0 |
| Agent 2 (navigation) | Navigation | 0 | 0 | 0 |
| Agent 3 (api-health) | API Health | 0 | 0 | 0 |
| Agent 4 (ecosystem) | Ecosystem | 11 | 0 | 0 |
| Agent 5 (sidebar) | Sidebar | 0 | 0 | 0 |
| Agent 6 (accessibility) | Accessibility | 0 | 0 | 0 |
| Agent 7 (preview) | Preview | 0 | 0 | 0 |
| Agent 8 (responsive) | Responsive | 0 | 0 | 0 |
| Smoke (smoke) | Smoke | 0 | 0 | 0 |
| Agent 12 (edi-import) | EDI Import | 0 | 0 | 0 |

## Re-run Failed Tests

```bash
node scripts/qa-orchestrator.mjs --rerun-failed
```

## Run Single Agent

```bash
node scripts/qa-orchestrator.mjs --agent chat-core
```
