#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

function isExternal(target) {
  return /^(https?:|mailto:|tel:|#)/i.test(target);
}

function normalizeTarget(target) {
  let cleaned = target.trim();
  if (cleaned.startsWith('<') && cleaned.endsWith('>')) cleaned = cleaned.slice(1, -1);
  cleaned = cleaned.split('#')[0];
  cleaned = cleaned.split('?')[0];
  cleaned = cleaned.split(':')[0];
  return cleaned;
}

async function exists(filePath) {
  try {
    await readFile(filePath, 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function collectMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const files = [path.join(ROOT, 'README.md'), ...(await collectMarkdownFiles(path.join(ROOT, 'docs')))].map((f) =>
    path.relative(ROOT, f),
  );
  const problems = [];
  for (const file of files) {
    const abs = path.join(ROOT, file);
    const text = await readFile(abs, 'utf8');
    for (const match of text.matchAll(LINK_RE)) {
      const target = match[2];
      if (isExternal(target)) continue;
      const normalized = normalizeTarget(target);
      if (!normalized || normalized === target && !target.endsWith('.md') && !target.endsWith('.json')) continue;
      const resolved = path.resolve(path.dirname(abs), normalized);
      if (!(await exists(resolved))) {
        problems.push(`${file} -> ${target}`);
      }
    }
  }

  if (problems.length) {
    console.error('Broken documentation links found:');
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Checked ${files.length} markdown files; no broken local links found.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
