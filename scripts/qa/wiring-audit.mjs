#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5000';

const registry = JSON.parse(readFileSync(join(ROOT, 'e2e/meta/feature-registry.json'), 'utf8'));

const out = { baseUrl: BASE, checkedAt: new Date().toISOString(), features: [] };
let failed = 0;

for (const feature of registry.features) {
  const apiResults = [];
  for (const api of feature.apis || []) {
    try {
      const res = await fetch(`${BASE}${api}`, { signal: AbortSignal.timeout(6000) });
      apiResults.push({ api, status: res.status, ok: res.ok });
    } catch (err) {
      apiResults.push({ api, status: 0, ok: false, error: String(err) });
    }
  }

  const pass = apiResults.some((r) => r.ok) || apiResults.some((r) => [401, 403].includes(r.status));
  if (!pass) failed++;

  out.features.push({
    id: feature.id,
    criticality: feature.criticality,
    owner: feature.owner,
    pass,
    apiResults,
    specs: feature.specs || [],
  });
}

console.log(JSON.stringify(out, null, 2));
if (failed > 0) process.exit(2);
