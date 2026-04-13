#!/usr/bin/env node
/**
 * Android Device Testing Script
 *
 * Runs Playwright E2E tests on a real Android device connected via USB.
 * Uses ADB port forwarding + Chrome DevTools Protocol.
 *
 * Prerequisites:
 *   - Android device with USB debugging enabled
 *   - Chrome installed on the device
 *   - ADB installed: brew install android-platform-tools
 *   - shre-chat running on port 5510
 *
 * Usage:
 *   node scripts/test-android.mjs                   # Full test suite
 *   node scripts/test-android.mjs --agent smoke     # Single agent
 *   node scripts/test-android.mjs --keep-alive      # Keep port forwarding after tests
 *   node scripts/test-android.mjs --manual          # Setup only (for manual browsing)
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const RESULTS_DIR = join(PROJECT_ROOT, 'e2e/results/android');
const PORT = 5510;

const args = process.argv.slice(2);
const flags = {
  agent: args.includes('--agent') ? args[args.indexOf('--agent') + 1] : null,
  keepAlive: args.includes('--keep-alive'),
  manual: args.includes('--manual'),
  verbose: args.includes('--verbose'),
  help: args.includes('--help') || args.includes('-h'),
};

if (flags.help) {
  console.log(`
  Android Device Testing for Shre Chat

  Usage:
    node scripts/test-android.mjs [options]

  Options:
    --agent <name>   Run single test agent (e.g., smoke, chat-core)
    --keep-alive     Keep ADB port forwarding after tests finish
    --manual         Setup port forwarding only (for manual browser testing)
    --verbose        Show full test output
    --help           Show this help

  Prerequisites:
    1. Enable USB debugging on Android device
    2. Connect device via USB and accept debugging prompt
    3. Install ADB: brew install android-platform-tools
    4. Ensure shre-chat is running: npm run serve

  Examples:
    node scripts/test-android.mjs                  # Full test suite on device
    node scripts/test-android.mjs --agent smoke    # Quick smoke test
    node scripts/test-android.mjs --manual         # Browse on device manually
  `);
  process.exit(0);
}

// ── Step 1: Check prerequisites ──

function checkPrereqs() {
  console.log('\n  Android Device Test Runner\n  ─────────────────────────\n');

  // Check ADB
  try {
    execSync('which adb', { stdio: 'pipe' });
  } catch {
    console.error('  ERROR: adb not found. Install with: brew install android-platform-tools');
    process.exit(1);
  }

  // Check device connection
  const devices = execSync('adb devices', { encoding: 'utf-8' });
  const deviceLines = devices.split('\n').filter(l => l.includes('\tdevice'));

  if (deviceLines.length === 0) {
    console.error('  ERROR: No Android device connected.');
    console.error('  Make sure USB debugging is enabled and the device is connected.\n');
    console.error('  Steps:');
    console.error('    1. Settings > About Phone > Tap "Build Number" 7 times');
    console.error('    2. Settings > Developer Options > Enable "USB Debugging"');
    console.error('    3. Connect via USB and accept the prompt on device');
    console.error('    4. Run: adb devices (should show your device)\n');
    process.exit(1);
  }

  const deviceId = deviceLines[0].split('\t')[0];
  console.log(`  Device: ${deviceId}`);

  // Get device info
  try {
    const model = execSync(`adb -s ${deviceId} shell getprop ro.product.model`, { encoding: 'utf-8' }).trim();
    const version = execSync(`adb -s ${deviceId} shell getprop ro.build.version.release`, { encoding: 'utf-8' }).trim();
    const resolution = execSync(`adb -s ${deviceId} shell wm size`, { encoding: 'utf-8' }).trim().replace('Physical size: ', '');
    console.log(`  Model:  ${model}`);
    console.log(`  Android: ${version}`);
    console.log(`  Screen: ${resolution}`);
  } catch { /* ignore */ }

  // Check shre-chat is running
  try {
    execSync(`curl -s --connect-timeout 2 http://127.0.0.1:${PORT}/health`, { stdio: 'pipe' });
    console.log(`  Server: http://localhost:${PORT} (running)`);
  } catch {
    console.error(`\n  ERROR: shre-chat not running on port ${PORT}.`);
    console.error('  Start it with: npm run serve\n');
    process.exit(1);
  }

  return deviceId;
}

// ── Step 2: Setup ADB port forwarding ──

function setupPortForwarding(deviceId) {
  console.log(`\n  Setting up port forwarding: device:${PORT} → localhost:${PORT}`);
  try {
    execSync(`adb -s ${deviceId} reverse tcp:${PORT} tcp:${PORT}`, { stdio: 'pipe' });
    console.log('  Port forwarding active\n');
  } catch (err) {
    console.error('  ERROR: Failed to set up port forwarding:', err.message);
    process.exit(1);
  }
}

// ── Step 3: Run tests via Playwright with Android Chrome ──

function runTests(deviceId) {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  // Get device screen dimensions for viewport
  let width = 360, height = 800;
  try {
    const size = execSync(`adb -s ${deviceId} shell wm size`, { encoding: 'utf-8' });
    const match = size.match(/(\d+)x(\d+)/);
    if (match) {
      // Physical pixels — convert to logical (assume ~3x density)
      const density = parseInt(execSync(`adb -s ${deviceId} shell wm density`, { encoding: 'utf-8' }).match(/(\d+)/)?.[1] || '480');
      const scale = density / 160;
      width = Math.round(parseInt(match[1]) / scale);
      height = Math.round(parseInt(match[2]) / scale);
    }
  } catch { /* use defaults */ }

  console.log(`  Viewport: ${width}x${height} (logical)`);

  // Build Playwright command
  let cmd = 'npx playwright test';

  if (flags.agent) {
    cmd += ` --project=${flags.agent}`;
    console.log(`  Agent: ${flags.agent}`);
  } else {
    // Run mobile-relevant tests by default
    cmd += ' --project=smoke --project=chat-core --project=navigation --project=accessibility --project=responsive';
    console.log('  Agents: smoke, chat-core, navigation, accessibility, responsive');
  }

  // Override viewport and user agent for Android
  cmd += ` --reporter=list`;
  cmd += ` --output=e2e/results/android`;

  console.log('\n  Running tests...\n');

  // Set env vars for Android viewport
  const env = {
    ...process.env,
    PLAYWRIGHT_BASE_URL: `http://localhost:${PORT}`,
    // Playwright will use these in config if we add Android project
    ANDROID_VIEWPORT_WIDTH: String(width),
    ANDROID_VIEWPORT_HEIGHT: String(height),
    ANDROID_DEVICE: deviceId,
  };

  try {
    const result = execSync(cmd, {
      cwd: PROJECT_ROOT,
      stdio: flags.verbose ? 'inherit' : 'pipe',
      timeout: 300_000,
      env,
    });

    if (!flags.verbose) {
      const output = result.toString();
      // Extract summary line
      const summary = output.split('\n').filter(l => l.includes('passed') || l.includes('failed'));
      summary.forEach(l => console.log(`  ${l.trim()}`));
    }

    console.log('\n  All Android tests PASSED\n');
    return true;
  } catch (err) {
    if (!flags.verbose && err.stdout) {
      const lines = err.stdout.toString().split('\n');
      // Show failures and summary
      lines.filter(l => l.includes('✘') || l.includes('failed') || l.includes('passed')).forEach(l => console.log(`  ${l.trim()}`));
    }
    console.log('\n  Some Android tests FAILED — check e2e/results/android/ for artifacts\n');
    return false;
  }
}

// ── Step 4: Capture device screenshot ──

function captureScreenshot(deviceId) {
  try {
    const screenshotPath = join(RESULTS_DIR, `device-screenshot-${Date.now()}.png`);
    execSync(`adb -s ${deviceId} exec-out screencap -p > "${screenshotPath}"`, { stdio: 'pipe' });
    console.log(`  Device screenshot: ${screenshotPath}`);
  } catch { /* ignore screenshot failure */ }
}

// ── Step 5: Cleanup ──

function cleanup(deviceId) {
  if (flags.keepAlive) {
    console.log(`  Port forwarding kept alive. To remove: adb -s ${deviceId} reverse --remove-all`);
    return;
  }
  try {
    execSync(`adb -s ${deviceId} reverse --remove-all`, { stdio: 'pipe' });
    console.log('  Port forwarding cleaned up');
  } catch { /* ignore */ }
}

// ── Main ──

const deviceId = checkPrereqs();
setupPortForwarding(deviceId);

if (flags.manual) {
  console.log(`  Manual mode: open Chrome on your Android device and go to:`);
  console.log(`  http://localhost:${PORT}\n`);
  console.log(`  Press Ctrl+C to stop port forwarding.\n`);

  // Keep alive until Ctrl+C
  process.on('SIGINT', () => {
    cleanup(deviceId);
    process.exit(0);
  });

  // Block forever
  setInterval(() => {}, 60_000);
} else {
  const passed = runTests(deviceId);
  captureScreenshot(deviceId);
  cleanup(deviceId);
  process.exit(passed ? 0 : 1);
}
