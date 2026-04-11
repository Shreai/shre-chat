#!/usr/bin/env node
/**
 * QA Orchestrator — Multi-Agent Test Runner with Bug Reporting
 *
 * Workflow:
 *   1. Run all Playwright test agents in parallel
 *   2. Parse JSON results → identify failures & gaps
 *   3. Create bug tasks in shre-tasks via POST /v1/intake
 *   4. Print summary report
 *   5. Support re-run cycle: --rerun-failed to only re-test failures
 *
 * Usage:
 *   node scripts/qa-orchestrator.mjs                    # Full QA run
 *   node scripts/qa-orchestrator.mjs --rerun-failed     # Re-run only failed tests
 *   node scripts/qa-orchestrator.mjs --agent chat-core  # Run single agent
 *   node scripts/qa-orchestrator.mjs --report-only      # Parse last results, report bugs
 *   node scripts/qa-orchestrator.mjs --dry-run          # Run tests but don't create tasks
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const RESULTS_FILE = join(PROJECT_ROOT, 'e2e/results/test-results.json');
const REPORT_FILE = join(PROJECT_ROOT, 'e2e/results/qa-report.md');
const FAILED_CACHE = join(PROJECT_ROOT, 'e2e/results/failed-tests.json');
const TASKS_URL = 'http://localhost:5460';

// ── Argument parsing ──
const args = process.argv.slice(2);
const flags = {
  rerunFailed: args.includes('--rerun-failed'),
  reportOnly: args.includes('--report-only'),
  dryRun: args.includes('--dry-run'),
  agent: args.includes('--agent') ? args[args.indexOf('--agent') + 1] : null,
  verbose: args.includes('--verbose'),
};

// ── Agent definitions ──
const AGENTS = [
  { name: 'chat-core', domain: 'Chat Core', owner: 'Agent 1', file: 'chat-core.spec.ts' },
  { name: 'navigation', domain: 'Navigation', owner: 'Agent 2', file: 'navigation.spec.ts' },
  { name: 'api-health', domain: 'API Health', owner: 'Agent 3', file: 'api-health.spec.ts' },
  { name: 'ecosystem', domain: 'Ecosystem', owner: 'Agent 4', file: 'ecosystem.spec.ts' },
  { name: 'sidebar', domain: 'Sidebar', owner: 'Agent 5', file: 'sidebar.spec.ts' },
  {
    name: 'accessibility',
    domain: 'Accessibility',
    owner: 'Agent 6',
    file: 'accessibility.spec.ts',
  },
  { name: 'preview', domain: 'Preview', owner: 'Agent 7', file: 'preview.spec.ts' },
  { name: 'responsive', domain: 'Responsive', owner: 'Agent 8', file: 'responsive.spec.ts' },
  { name: 'smoke', domain: 'Smoke', owner: 'Smoke', file: 'smoke.spec.ts' },
  { name: 'edi-import', domain: 'EDI Import', owner: 'Agent 12', file: 'edi-import.spec.ts' },
];

// ── Step 1: Run Playwright ──
function runTests() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   QA Orchestrator — Multi-Agent Test Runner  ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Ensure results dir exists
  const resultsDir = join(PROJECT_ROOT, 'e2e/results');
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });

  let cmd = 'npx playwright test';

  if (flags.agent) {
    cmd += ` --project=${flags.agent}`;
    console.log(`  Running single agent: ${flags.agent}\n`);
  } else if (flags.rerunFailed) {
    if (!existsSync(FAILED_CACHE)) {
      console.log('  No failed test cache found. Running full suite.\n');
    } else {
      const failed = JSON.parse(readFileSync(FAILED_CACHE, 'utf-8'));
      if (failed.length === 0) {
        console.log('  All tests passed last run! Nothing to re-run.\n');
        return true;
      }
      // Run only the projects that had failures
      const projects = [...new Set(failed.map((f) => f.project))];
      cmd += ` ${projects.map((p) => `--project=${p}`).join(' ')}`;
      console.log(`  Re-running ${failed.length} failed tests across: ${projects.join(', ')}\n`);
    }
  } else {
    console.log('  Running all 8 test agents in parallel...\n');
  }

  try {
    execSync(cmd, {
      cwd: PROJECT_ROOT,
      stdio: flags.verbose ? 'inherit' : 'pipe',
      timeout: 300_000, // 5 min max
    });
    console.log('  All tests PASSED\n');
    return true;
  } catch (err) {
    if (flags.verbose) {
      console.log(err.stdout?.toString() || '');
    }
    console.log('  Some tests FAILED — analyzing results...\n');
    return false;
  }
}

// ── Step 2: Parse Results ──
function parseResults() {
  if (!existsSync(RESULTS_FILE)) {
    console.error('  ERROR: No test results found at', RESULTS_FILE);
    console.error('  Make sure Playwright ran with JSON reporter enabled.');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'));
  const suites = raw.suites || [];

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    failures: [],
    gaps: [],
    byAgent: {},
  };

  function walkSpecs(specs, project) {
    for (const spec of specs || []) {
      for (const test of spec.tests || []) {
        results.total++;
        const agentName = test.projectName || project || 'unknown';

        if (!results.byAgent[agentName]) {
          results.byAgent[agentName] = { passed: 0, failed: 0, skipped: 0, tests: [] };
        }

        const status = test.status || test.expectedStatus;
        const result = test.results?.[0] || {};

        if (status === 'passed' || result.status === 'passed') {
          results.passed++;
          results.byAgent[agentName].passed++;
        } else if (status === 'skipped') {
          results.skipped++;
          results.byAgent[agentName].skipped++;
        } else if (status === 'flaky') {
          results.flaky++;
          results.byAgent[agentName].passed++;
        } else {
          results.failed++;
          results.byAgent[agentName].failed++;

          const failure = {
            title: test.title || spec.title,
            project: agentName,
            file: spec.file || '',
            error: result.error?.message?.slice(0, 500) || 'Unknown error',
            screenshot: result.attachments?.find((a) => a.name === 'screenshot')?.path || null,
          };
          results.failures.push(failure);
          results.byAgent[agentName].tests.push(failure);
        }

        // Check stdout for GAP markers
        const stdout = result.stdout?.map((s) => s.text || s).join('') || '';
        const gapMatches = stdout.match(/GAP: .+/g) || [];
        for (const gap of gapMatches) {
          results.gaps.push({
            message: gap.replace('GAP: ', ''),
            project: agentName,
            test: test.title || spec.title,
          });
        }
      }
    }
  }

  for (const suite of suites) {
    const project = suite.title || '';
    walkSpecs(suite.specs, project);
    for (const child of suite.suites || []) {
      walkSpecs(child.specs, project);
    }
  }

  // Cache failed tests for --rerun-failed
  writeFileSync(FAILED_CACHE, JSON.stringify(results.failures, null, 2));

  return results;
}

// ── Step 3: Create Bug Tasks ──
async function createBugTasks(results) {
  if (flags.dryRun) {
    console.log('  [DRY RUN] Would create tasks for:');
    results.failures.forEach((f) => console.log(`    - ${f.project}: ${f.title}`));
    results.gaps.forEach((g) => console.log(`    - GAP (${g.project}): ${g.message}`));
    return;
  }

  const created = [];

  // Create tasks for failures
  for (const failure of results.failures) {
    const agent = AGENTS.find((a) => a.name === failure.project);
    try {
      const res = await fetch(`${TASKS_URL}/v1/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `QA Bug: ${failure.title}`,
          description: [
            `**Agent:** ${agent?.owner || failure.project}`,
            `**Domain:** ${agent?.domain || 'Unknown'}`,
            `**Test File:** ${failure.file}`,
            `**Error:**\n\`\`\`\n${failure.error}\n\`\`\``,
            failure.screenshot ? `**Screenshot:** ${failure.screenshot}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          source: 'qa-orchestrator',
          category: 'bug',
          priority: 'medium',
          dedupe_tag: `qa-bug:${failure.project}:${failure.title.replace(/\s+/g, '-').slice(0, 60)}`,
        }),
      });
      const body = await res.json();
      if (body.deduplicated) {
        console.log(`    Deduped: ${failure.title}`);
      } else {
        created.push({ id: body.objective_id, title: failure.title });
        console.log(`    Created: ${failure.title} → ${body.objective_id}`);
      }
    } catch (err) {
      console.log(`    Failed to create task: ${failure.title} — ${err.message}`);
    }
  }

  // Create tasks for gaps (lower priority)
  for (const gap of results.gaps) {
    try {
      const res = await fetch(`${TASKS_URL}/v1/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `QA Gap: ${gap.message.slice(0, 80)}`,
          description: [
            `**Detected in:** ${gap.project} — ${gap.test}`,
            `**Gap:** ${gap.message}`,
            `**Action:** Investigate and fix or document as known limitation`,
          ].join('\n'),
          source: 'qa-orchestrator',
          category: 'improvement',
          priority: 'low',
          dedupe_tag: `qa-gap:${gap.message.replace(/\s+/g, '-').slice(0, 60)}`,
        }),
      });
      const body = await res.json();
      if (!body.deduplicated) {
        created.push({ id: body.objective_id, title: gap.message });
      }
    } catch (err) {
      // shre-tasks may be down — log but don't fail
      console.log(`    Gap task creation failed: ${err.message}`);
    }
  }

  return created;
}

// ── Step 4: Generate Report ──
function generateReport(results, tasksCreated = []) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : '0';

  let md = `# QA Test Report — ${timestamp}\n\n`;
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total Tests | ${results.total} |\n`;
  md += `| Passed | ${results.passed} |\n`;
  md += `| Failed | ${results.failed} |\n`;
  md += `| Skipped | ${results.skipped} |\n`;
  md += `| Flaky | ${results.flaky} |\n`;
  md += `| Pass Rate | ${passRate}% |\n\n`;

  md += `## Agent Results\n\n`;
  md += `| Agent | Domain | Passed | Failed | Skipped |\n`;
  md += `|-------|--------|--------|--------|--------|\n`;
  for (const agent of AGENTS) {
    const data = results.byAgent[agent.name] || { passed: 0, failed: 0, skipped: 0 };
    const status = data.failed > 0 ? 'FAIL' : 'PASS';
    md += `| ${agent.owner} (${agent.name}) | ${agent.domain} | ${data.passed} | ${data.failed} | ${data.skipped} |\n`;
  }
  md += '\n';

  if (results.failures.length > 0) {
    md += `## Failures\n\n`;
    for (const f of results.failures) {
      md += `### ${f.project}: ${f.title}\n\n`;
      md += `- **File:** ${f.file}\n`;
      md += `- **Error:** \`${f.error.split('\n')[0]}\`\n`;
      if (f.screenshot) md += `- **Screenshot:** ${f.screenshot}\n`;
      md += '\n';
    }
  }

  if (results.gaps.length > 0) {
    md += `## Gaps Detected\n\n`;
    for (const g of results.gaps) {
      md += `- **${g.project}** (${g.test}): ${g.message}\n`;
    }
    md += '\n';
  }

  if (tasksCreated.length > 0) {
    md += `## Tasks Created in shre-tasks\n\n`;
    for (const t of tasksCreated) {
      md += `- \`${t.id}\`: ${t.title}\n`;
    }
    md += '\n';
  }

  md += `## Re-run Failed Tests\n\n`;
  md += '```bash\nnode scripts/qa-orchestrator.mjs --rerun-failed\n```\n\n';
  md += `## Run Single Agent\n\n`;
  md += '```bash\nnode scripts/qa-orchestrator.mjs --agent chat-core\n```\n';

  writeFileSync(REPORT_FILE, md);
  console.log(`\n  Report saved to: e2e/results/qa-report.md`);

  return md;
}

// ── Step 5: Print Console Summary ──
function printSummary(results) {
  console.log('\n┌─────────────────────────────────────┐');
  console.log('│         QA ORCHESTRATOR REPORT       │');
  console.log('├─────────────────────────────────────┤');

  const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : '0';
  console.log(`│  Total:   ${String(results.total).padStart(3)}                        │`);
  console.log(`│  Passed:  ${String(results.passed).padStart(3)}                        │`);
  console.log(`│  Failed:  ${String(results.failed).padStart(3)}                        │`);
  console.log(`│  Skipped: ${String(results.skipped).padStart(3)}                        │`);
  console.log(`│  Rate:    ${passRate.padStart(5)}%                     │`);
  console.log('├─────────────────────────────────────┤');

  for (const agent of AGENTS) {
    const data = results.byAgent[agent.name];
    if (!data) continue;
    const icon = data.failed > 0 ? 'FAIL' : 'PASS';
    const line = `│  ${icon} ${agent.owner.padEnd(9)} ${String(data.passed).padStart(2)}P ${String(data.failed).padStart(2)}F ${String(data.skipped).padStart(2)}S     │`;
    console.log(line);
  }

  console.log('└─────────────────────────────────────┘');

  if (results.failures.length > 0) {
    console.log('\n  FAILURES:');
    results.failures.forEach((f) => {
      console.log(`    [${f.project}] ${f.title}`);
      console.log(`      ${f.error.split('\n')[0].slice(0, 100)}`);
    });
  }

  if (results.gaps.length > 0) {
    console.log('\n  GAPS DETECTED:');
    results.gaps.forEach((g) => {
      console.log(`    [${g.project}] ${g.message}`);
    });
  }
}

// ── Main ──
async function main() {
  if (!flags.reportOnly) {
    runTests();
  }

  const results = parseResults();
  printSummary(results);

  let tasksCreated = [];
  if (results.failures.length > 0 || results.gaps.length > 0) {
    console.log('\n  Creating tasks in shre-tasks...');
    tasksCreated = (await createBugTasks(results)) || [];
  }

  generateReport(results, tasksCreated);

  console.log('\n  Next steps:');
  if (results.failed > 0) {
    console.log('    1. Engineering fixes the bugs');
    console.log('    2. Re-run: node scripts/qa-orchestrator.mjs --rerun-failed');
    console.log('    3. Cycle continues until all pass');
  } else {
    console.log('    All tests passed! QA cycle complete.');
  }
  console.log('');

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('QA Orchestrator failed:', err.message);
  process.exit(1);
});
