#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const matrixPath = join(ROOT, 'e2e/config/stage-matrix.json');
const outDir = join(ROOT, 'e2e/results/stages');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
const selected = process.argv.includes('--stage')
  ? process.argv[process.argv.indexOf('--stage') + 1]
  : null;

const stages = selected
  ? matrix.stages.filter((s) => s.id === selected)
  : matrix.stages;

if (!stages.length) {
  console.error('No stages to run. Check --stage value or stage-matrix.json');
  process.exit(1);
}

const runId = `qa-${Date.now()}`;
const summary = { runId, startedAt: new Date().toISOString(), stages: [] };

for (const stage of stages) {
  const env = {
    ...process.env,
    PLAYWRIGHT_BASE_URL: stage.baseUrl,
    SHRE_STAGE: stage.id,
    SHRE_WORKSPACE: stage.workspace,
    SHRE_TEST_MODE: stage.mode,
    SHRE_RUN_ID: runId,
  };

  const started = Date.now();
  let ok = true;
  let errText = '';

  try {
    execSync('node scripts/qa-orchestrator.mjs --dry-run', {
      cwd: ROOT,
      env,
      stdio: 'pipe',
      timeout: 12 * 60_000,
    });
  } catch (err) {
    ok = false;
    errText = String(err?.stdout || err?.message || 'unknown failure').slice(0, 2000);
  }

  summary.stages.push({
    stage: stage.id,
    baseUrl: stage.baseUrl,
    workspace: stage.workspace,
    mode: stage.mode,
    passed: ok,
    durationMs: Date.now() - started,
    error: errText || null,
  });
}

summary.finishedAt = new Date().toISOString();
const outFile = join(outDir, `${runId}.json`);
writeFileSync(outFile, JSON.stringify(summary, null, 2));

const passed = summary.stages.filter((s) => s.passed).length;
console.log(`Stage run complete: ${passed}/${summary.stages.length} passed`);
console.log(`Report: ${outFile}`);
if (passed !== summary.stages.length) process.exit(2);
