#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const OUT_DIR = join(ROOT, 'e2e/results/cycle');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const includeStages =
  args.includes('--with-stages') ||
  String(process.env.QA_CYCLE_INCLUDE_STAGES || '').toLowerCase() === 'true';
const strictNoSkips =
  args.includes('--strict-no-skips') ||
  String(process.env.QA_CYCLE_STRICT_NO_SKIPS || '').toLowerCase() === 'true';

const runId = `cycle-${Date.now()}`;
const startedAt = new Date().toISOString();
const steps = [];

function runStep(name, cmd, opts = {}) {
  const started = Date.now();
  let ok = true;
  let stdout = '';
  let err = '';
  const retries = Math.max(0, Number(opts.retries || 0));
  let attempt = 0;
  while (attempt <= retries) {
    try {
      stdout = execSync(cmd, {
        cwd: ROOT,
        stdio: 'pipe',
        env: { ...process.env, ...(opts.env || {}) },
        timeout: opts.timeoutMs || 15 * 60_000,
      }).toString('utf8');
      ok = true;
      err = '';
      break;
    } catch (e) {
      ok = false;
      stdout = String(e?.stdout || '');
      err = String(e?.stderr || e?.message || 'unknown failure');
      attempt += 1;
      if (attempt <= retries) {
        // brief backoff before retrying flaky UI/API gates
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
      }
    }
  }
  steps.push({
    name,
    cmd,
    ok,
    attempts: attempt + (ok ? 1 : 0),
    durationMs: Date.now() - started,
    stdout: stdout.slice(-4000),
    error: err.slice(-4000) || null,
  });
  return ok;
}

function checkSkipsFromPlaywrightJson() {
  const p = join(ROOT, 'e2e/results/test-results.json');
  if (!existsSync(p)) return { found: false, skipped: 0 };
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    let skipped = 0;
    const walk = (suites = []) => {
      for (const s of suites) {
        for (const spec of s.specs || []) {
          for (const t of spec.tests || []) {
            const st = t.status || t.expectedStatus;
            if (st === 'skipped') skipped++;
          }
        }
        walk(s.suites || []);
      }
    };
    walk(raw.suites || []);
    return { found: true, skipped };
  } catch {
    return { found: false, skipped: 0 };
  }
}

// 1) policy gate
runStep('policy', 'npm run -s qa:policy', { retries: 1 });

// 2) optional stage matrix
if (includeStages) {
  runStep('stages', 'npm run -s qa:stages');
}

// 3) wiring gate
runStep('wiring', 'npm run -s qa:wiring');

// 4) strict no-skips gate (optional)
let skipsGateOk = true;
const skipInfo = checkSkipsFromPlaywrightJson();
if (strictNoSkips) {
  skipsGateOk = skipInfo.found ? skipInfo.skipped === 0 : false;
  steps.push({
    name: 'strict-no-skips',
    cmd: 'parse e2e/results/test-results.json',
    ok: skipsGateOk,
    durationMs: 0,
    stdout: `found=${skipInfo.found} skipped=${skipInfo.skipped}`,
    error: skipsGateOk ? null : 'Skipped tests detected under strict-no-skips',
  });
}

const passed = steps.every((s) => s.ok);
const finishedAt = new Date().toISOString();
const result = {
  runId,
  startedAt,
  finishedAt,
  includeStages,
  strictNoSkips,
  skipInfo,
  passed,
  steps,
};

const outFile = join(OUT_DIR, `${runId}.json`);
writeFileSync(outFile, JSON.stringify(result, null, 2));

console.log(`QA cycle ${passed ? 'PASSED' : 'FAILED'}: ${outFile}`);
if (!passed) process.exit(2);
