#!/usr/bin/env node
/**
 * E2E test: storepulse.nirtek.net chat (Ellie agent) ↔ RapidRMS data tools.
 *
 * Logs in, runs N scripted prompts through /chat-proxy, parses the SSE
 * Responses-API stream, captures the final assistant text + model, prints a
 * compact pass/fail table, and writes a results JSON.
 *
 * Usage:
 *   node shre-chat/scripts/ad-hoc/storepulse-e2e-rapidrms.mjs           # public
 *   BASE=http://127.0.0.1:8899 node ...                                  # local
 *   PROMPTS=1,3,7 node ...                                               # subset
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE || 'https://storepulse.nirtek.net';
const WORKSPACE = process.env.WORKSPACE || '2'; // Party Liquor (read-only shadow)
const EMAIL = process.env.EMAIL || 'rapidnir';
const PASSWORD = process.env.PASSWORD || 'rapid@nir';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 60000);
const PROMPT_FILTER = (process.env.PROMPTS || '').trim();

const SESSION_KEY = `e2e-${Date.now()}`;
const PAGE_CONTEXT = 'Dashboard';

// 15 scripted prompts — mix of fast-path (today/wtd) + Ellie+tool routes.
const PROMPTS = [
  { id: 1,  category: 'sales-today',     ask: "What are today's sales?" },
  { id: 2,  category: 'sales-yesterday', ask: 'How did we do yesterday?' },
  { id: 3,  category: 'wtd-vs-lastweek', ask: 'How did I perform this week vs last week?' },
  { id: 4,  category: 'mtd',             ask: 'Give me month-to-date sales and transactions.' },
  { id: 5,  category: 'top-items',       ask: 'What are the top 5 selling items today?' },
  { id: 6,  category: 'top-vendors',     ask: 'Which vendors generated the most revenue this week?' },
  { id: 7,  category: 'hourly-pattern',  ask: 'Show me the hourly sales pattern for today.' },
  { id: 8,  category: 'cashier-perf',    ask: 'Which cashier had the most transactions today?' },
  { id: 9,  category: 'department-mix',  ask: 'Break down sales by department today.' },
  { id: 10, category: 'discounts',       ask: 'How much did we discount this week and on which items?' },
  { id: 11, category: 'inventory-low',   ask: 'List items where stock is running low.' },
  { id: 12, category: 'avg-ticket',      ask: 'What is the average ticket trend over the last 7 days?' },
  { id: 13, category: 'tax-collected',   ask: 'How much sales tax did we collect today?' },
  { id: 14, category: 'refunds-voids',   ask: 'Any refunds or voids today? Summarize them.' },
  { id: 15, category: 'compare-day',     ask: 'Compare today vs yesterday — sales, ticket count, average ticket.' },
];

function selectedPrompts() {
  if (!PROMPT_FILTER) return PROMPTS;
  const ids = new Set(PROMPT_FILTER.split(',').map((s) => Number(s.trim())));
  return PROMPTS.filter((p) => ids.has(p.id));
}

// ─── Cookie jar (login → /chat-proxy) ────────────────────────
let cookieHeader = '';

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(body)}`);
  }
  const setCookie = res.headers.get('set-cookie') || '';
  const m = setCookie.match(/rms_session=([^;]+)/);
  if (!m) throw new Error('No rms_session cookie returned');
  cookieHeader = `rms_session=${m[1]}`;
  return body;
}

// ─── SSE parser → final assistant text + model ──────────────
async function chatOnce(prompt) {
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let firstByte = null;
  let model = null;
  let finalText = '';
  let httpStatus = 0;
  let raw = '';

  try {
    const res = await fetch(`${BASE}/chat-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        Origin: BASE.startsWith('https') ? 'https://storepulse.nirtek.net' : `${BASE}`,
      },
      body: JSON.stringify({
        input: prompt.ask,
        metadata: {
          workspace: WORKSPACE,
          sessionKey: `${SESSION_KEY}-${prompt.id}`,
          pageContext: PAGE_CONTEXT,
        },
      }),
      signal: ac.signal,
    });
    httpStatus = res.status;
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, http: httpStatus, error: errText.slice(0, 200), elapsedMs: Date.now() - t0 };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (firstByte === null) firstByte = Date.now() - t0;
      buffer += decoder.decode(value, { stream: true });
      raw += buffer.slice(-0); // not stored, just to keep linter quiet
      // Parse complete SSE events ("\n\n" terminator)
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const evt = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLine = evt.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        let payload;
        try {
          payload = JSON.parse(dataLine.slice(5).trim());
        } catch {
          continue;
        }
        if (payload.type === 'response.created' && payload.response?.model) {
          model = payload.response.model;
        }
        if (payload.type === 'response.output_text.done' && typeof payload.text === 'string') {
          finalText = payload.text;
        }
        if (payload.type === 'response.completed') {
          const out = payload.response?.output?.[0]?.content?.[0]?.text;
          if (out && !finalText) finalText = out;
          if (payload.response?.model && !model) model = payload.response.model;
        }
      }
    }

    return {
      ok: !!finalText,
      http: httpStatus,
      model: model || 'unknown',
      elapsedMs: Date.now() - t0,
      ttfbMs: firstByte,
      length: finalText.length,
      excerpt: finalText.slice(0, 220).replace(/\n/g, ' '),
      text: finalText,
    };
  } catch (err) {
    return {
      ok: false,
      http: httpStatus,
      error: err.message || String(err),
      elapsedMs: Date.now() - t0,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Runner ─────────────────────────────────────────────────
async function main() {
  console.log(`\n=== StorePulse E2E — Ellie ↔ RapidRMS  (${BASE})  ws=${WORKSPACE} ===\n`);
  const session = await login();
  console.log(`Login OK  (syncing=${session.syncing})\n`);

  const results = [];
  const todo = selectedPrompts();
  for (const p of todo) {
    process.stdout.write(`[${String(p.id).padStart(2, '0')}/${PROMPTS.length}] ${p.category.padEnd(20)} `);
    const r = await chatOnce(p);
    results.push({ prompt: p, result: r });
    if (r.ok) {
      const ttfb = r.ttfbMs == null ? '   ?' : `${String(r.ttfbMs).padStart(4)}ms`;
      console.log(
        `PASS  model=${(r.model || '?').padEnd(18)} ttfb=${ttfb} total=${String(r.elapsedMs).padStart(5)}ms  len=${String(r.length).padStart(4)}`,
      );
      console.log(`     → ${r.excerpt}${r.length > 220 ? '…' : ''}`);
    } else {
      console.log(`FAIL  http=${r.http} elapsed=${r.elapsedMs}ms`);
      if (r.error) console.log(`     ! ${r.error.slice(0, 200)}`);
    }
  }

  // Aggregate
  const passed = results.filter((r) => r.result.ok).length;
  const failed = results.length - passed;
  const byModel = {};
  for (const r of results) {
    const m = r.result.model || (r.result.ok ? 'unknown' : 'error');
    byModel[m] = (byModel[m] || 0) + 1;
  }
  console.log('\n--- Summary ---');
  console.log(`  Passed: ${passed}/${results.length}`);
  console.log(`  Failed: ${failed}/${results.length}`);
  console.log(`  Models: ${Object.entries(byModel).map(([k, v]) => `${k}=${v}`).join('  ')}`);

  // Save
  const outDir = join(process.cwd(), 'shre-chat', 'scripts', 'ad-hoc', 'results');
  try { mkdirSync(outDir, { recursive: true }); } catch {}
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = join(outDir, `storepulse-e2e-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify({ base: BASE, workspace: WORKSPACE, sessionKey: SESSION_KEY, ranAt: new Date().toISOString(), summary: { passed, failed, byModel }, results }, null, 2));
  console.log(`\n  Results: ${outPath}`);

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(2);
});
