# Shre Chat — Testing Guide

## Overview

Shre Chat uses a multi-agent Playwright E2E test architecture with 16 specialized test agents, a QA orchestrator that auto-creates bug tasks, and support for real Android device testing.

## Quick Start

```bash
# Ensure shre-chat is running
npm run serve &

# Smoke test (30 seconds)
npm run qa:agent -- smoke

# Full QA suite (~8 minutes)
npm run qa

# Android device test
npm run test:android
```

## Test Commands

| Command | Description | Duration |
|---------|-------------|----------|
| `npm run test:e2e` | Raw Playwright run (all projects) | ~8 min |
| `npm run qa` | Full QA + bug task creation in shre-tasks | ~8 min |
| `npm run qa:agent -- <name>` | Single agent (e.g., `smoke`, `chat-core`) | 5-60s |
| `npm run qa:rerun` | Re-run only failed tests from last run | varies |
| `npm run qa:report` | Parse last results, create bug tasks (no test run) | instant |
| `npm run qa:dry` | Run tests without creating bug tasks | ~8 min |
| `npm run test:android` | Test on connected Android device | ~3 min |

## Test Agents

| Agent | File | Tests | Domain |
|-------|------|-------|--------|
| Agent 1 (chat-core) | chat-core.spec.ts | 10 | Messaging, sessions, tabs, shortcuts |
| Agent 2 (navigation) | navigation.spec.ts | 11 | View switching, sidebar routing |
| Agent 3 (api-health) | api-health.spec.ts | 20 | Endpoint availability, security headers |
| Agent 4 (ecosystem) | ecosystem.spec.ts | 11 | App drawer, integrations |
| Agent 5 (sidebar) | sidebar.spec.ts | 9 | Sessions, search, bookmarks |
| Agent 6 (accessibility) | accessibility.spec.ts | 13 | A11y labels, WCAG, touch targets |
| Agent 7 (preview) | preview.spec.ts | 13 | File rendering (HTML, CSV, JSON, PDF) |
| Agent 8 (responsive) | responsive.spec.ts | 6 | Viewport layouts, touch targets |
| Agent 9 (data-integration) | data-integration.spec.ts | 10 | POS/RapidRMS integration |
| Agent 10 (write-operations) | write-operations.spec.ts | 3 | Item create, price update, stock |
| Agent 11 (voice) | voice.spec.ts | 5 | Voice UI, TTS/STT endpoints |
| Agent 12 (edi-import) | edi-import.spec.ts | 10 | EDI extraction and mapping |
| Smoke | smoke.spec.ts | 6 | Quick sanity checks |
| Terminal | terminal.spec.ts | 8 | Terminal UI, mobile layout |
| Router Connect | router-connect.spec.ts | 4 | Router connectivity |
| Responsive Preview | responsive-preview.spec.ts | 18 | File preview across viewports |

**Total: ~150+ tests across 16 agents**

## Viewports Tested

| Device | Width | Height | Type |
|--------|-------|--------|------|
| iPhone SE | 375 | 667 | Mobile |
| iPhone 14 | 390 | 844 | Mobile |
| Android | 360 | 800 | Mobile |
| Mobile Landscape | 667 | 375 | Mobile |
| iPad Portrait | 768 | 1024 | Tablet |
| iPad Landscape | 1024 | 768 | Tablet |
| Laptop | 1366 | 768 | Desktop |
| Full HD | 1920 | 1080 | Desktop |
| Ultrawide | 2560 | 1080 | Desktop |

## Android Device Testing

### Prerequisites

1. **Android device** with USB debugging enabled
2. **USB cable** connecting Android to your Mac
3. **Chrome** installed on the Android device
4. **Android SDK Platform Tools** (for `adb`)

### Setup Android Device

1. **Enable Developer Options:**
   - Go to Settings > About Phone
   - Tap "Build Number" 7 times
   - Go back to Settings > Developer Options

2. **Enable USB Debugging:**
   - In Developer Options, turn on "USB Debugging"
   - Connect device via USB
   - Accept the "Allow USB debugging?" prompt on the device

3. **Install ADB (if not installed):**
   ```bash
   brew install android-platform-tools
   ```

4. **Verify connection:**
   ```bash
   adb devices
   # Should show your device ID
   ```

### Run Android Tests

```bash
# Automated — detects device, sets up port forwarding, runs tests
npm run test:android

# Or run the script directly with options
node scripts/test-android.mjs

# Specific test agent on Android
node scripts/test-android.mjs --agent smoke

# Keep port forwarding alive after tests (for manual testing)
node scripts/test-android.mjs --keep-alive
```

### What the Android Test Does

1. Detects connected Android device via `adb devices`
2. Sets up port forwarding: `adb reverse tcp:5510 tcp:5510`
3. Launches Chrome on the device and connects via CDP (Chrome DevTools Protocol)
4. Runs the test suite against the real device browser
5. Captures screenshots on failure
6. Cleans up port forwarding

### Manual Testing on Android

If you just want to browse shre-chat on your Android device:

```bash
# Set up port forwarding (device accesses Mac's localhost)
adb reverse tcp:5510 tcp:5510

# Now open Chrome on Android and go to:
# http://localhost:5510
```

This makes your Mac's port 5510 accessible as `localhost:5510` on the Android device.

### Network Testing (Wi-Fi, no USB)

If the Android device is on the same Wi-Fi network:

1. Find your Mac's local IP: `ipconfig getifaddr en0`
2. Open Chrome on Android: `http://<mac-ip>:5510`
3. No ADB required, but shre-chat must bind to `0.0.0.0` (it does by default)

## QA Orchestrator

The QA orchestrator (`scripts/qa-orchestrator.mjs`) wraps Playwright with:

1. **Test fixture setup** — Creates test JPEG/PNG/PDF files in `/tmp/preview-test/`
2. **Parallel agent execution** — 4 Chromium workers, all agents run concurrently
3. **Gap detection** — Soft failures logged as "gaps" (pass the test but flag issues)
4. **Bug task creation** — Failed tests auto-create tasks in shre-tasks
5. **Markdown report** — Results saved to `e2e/results/qa-report.md`
6. **Re-run support** — `--rerun-failed` only re-tests failures

### Output Files

| File | Purpose |
|------|---------|
| `e2e/results/test-results.json` | Raw Playwright JSON results |
| `e2e/results/qa-report.md` | Human-readable summary |
| `e2e/results/failed-tests.json` | Cache for `--rerun-failed` |
| `e2e/results/artifacts/` | Screenshots, videos, traces |
| `e2e/results/html-report/` | Interactive HTML report |

### Viewing HTML Report

```bash
npx playwright show-report e2e/results/html-report
```

## Writing New Tests

### Add a test to an existing agent

1. Open the relevant `.spec.ts` file in `e2e/`
2. Add a new `test()` block inside the `test.describe()` group
3. Use `page.goto('/')` and wait for `#shre-chat-textarea` to load
4. Run: `npm run qa:agent -- <agent-name>`

### Create a new test agent

1. Create `e2e/my-agent.spec.ts`
2. Add project to `playwright.config.ts`:
   ```ts
   {
     name: 'my-agent',
     testMatch: /my-agent\.spec\.ts/,
     use: { browserName: 'chromium', storageState: AUTH_FILE },
     dependencies: ['setup'],
   },
   ```
3. Add to `AGENTS` array in `scripts/qa-orchestrator.mjs`:
   ```js
   { name: 'my-agent', domain: 'My Domain', owner: 'Agent N', file: 'my-agent.spec.ts' },
   ```
4. Run: `npm run qa:agent -- my-agent`

### Key Selectors

| Element | Selector |
|---------|----------|
| Chat textarea | `#shre-chat-textarea` |
| Send button | `button[aria-label="Send"]` |
| Theme toggle | `button[aria-label="Switch to light mode"]` (or dark) |
| More options menu | `button[aria-label="More options"]` |
| System prompt item | `button:has-text("System Prompt")` (inside more menu) |
| Session list items | `[class*="cursor-pointer"]` with agent name |
| Status bar | `[class*="status-bar"]` |
| Message bubbles | `.group/msg` |
| Assistant messages | `.justify-start .group/msg` |

### Important Notes

- **Ctrl+Enter** sends messages (not plain Enter)
- **Auth caching:** Tests reuse `/tmp/shre-chat-auth.json` (10 min TTL) to avoid rate limits
- **Service dependencies:** Tests skip gracefully when upstream services (CortexDB, shre-edi) are down
- **Timeouts:** Default 60s per test, 10 min for full QA suite
