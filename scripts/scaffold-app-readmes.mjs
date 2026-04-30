#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'docs', 'APP-REGISTRY.md');
const TEMPLATE_PATH = path.join(ROOT, 'docs', 'APP-README-TEMPLATE.md');
const OUTPUT_DIR = path.join(ROOT, 'docs', 'apps');
const INDEX_PATH = path.join(OUTPUT_DIR, 'README.md');

const args = new Set(process.argv.slice(2));
const force = args.has('--force');

const SECTION_MAP = {
  'Platform Apps': 'platform-app',
  'MIB Deep-Link Apps': 'workspace-app',
  'Subdomain Apps': 'subdomain-app',
};

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[`']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseRegistry(md) {
  const lines = md.split(/\r?\n/);
  let section = null;
  const rows = [];
  for (const line of lines) {
    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    if (!section || !SECTION_MAP[section]) continue;
    if (!line.startsWith('| `')) continue;
    const cols = line
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    if (cols.length < 5) continue;
    const [idCol, name, type, notes] = cols;
    const id = idCol.replace(/`/g, '');
    rows.push({
      id,
      name,
      type,
      notes,
      section,
      appType: SECTION_MAP[section],
      slug: slugify(id),
    });
  }
  return rows;
}

function fillTemplate(template, app) {
  const defaults = {
    name: app.name,
    id: app.id,
    type: app.type,
    domain: app.section.replace(/ Apps$/, '').replace(/\s+/g, ' / '),
    owner: '<owner or team>',
    workspace: '<workspace or tenant>',
    status: 'active',
    uiPath: app.appType === 'platform-app'
      ? '<host or route>'
      : app.appType === 'workspace-app'
      ? `/mib/${app.id}`
      : `<${app.id} route or host>`,
    apiPath: '<api route or service>',
    installCommand: 'pnpm install',
    runCommand: 'npm run dev',
    testCommand: 'npm test',
  };

  return template
    .replace(/^# App README Template/m, `# ${defaults.name}`)
    .replaceAll('<app name>', defaults.name)
    .replaceAll('<app id>', defaults.id)
    .replaceAll('app | connector | tool | skill', app.type)
    .replaceAll('<domain or product line>', defaults.domain)
    .replaceAll('<person or team>', defaults.owner)
    .replaceAll('<workspace or tenant>', defaults.workspace)
    .replaceAll('planned | active | deprecated', defaults.status)
    .replaceAll('<route or host>', defaults.uiPath)
    .replaceAll('<api route or service>', defaults.apiPath)
    .replaceAll('<install command>', defaults.installCommand)
    .replaceAll('<run command>', defaults.runCommand)
    .replaceAll('<test command>', defaults.testCommand);
}

async function main() {
  const [registry, template] = await Promise.all([
    readFile(REGISTRY_PATH, 'utf8'),
    readFile(TEMPLATE_PATH, 'utf8'),
  ]);
  const apps = parseRegistry(registry);
  await mkdir(OUTPUT_DIR, { recursive: true });

  const indexLines = [
    '# App Readmes',
    '',
    'Generated from [App Registry](../APP-REGISTRY.md).',
    '',
    '| App ID | Name | Type | README |',
    '|---|---|---|---|',
  ];

  for (const app of apps) {
    const outPath = path.join(OUTPUT_DIR, `${app.slug}.md`);
    const content = fillTemplate(template, app).trimEnd() + '\n';
    if (!force) {
      try {
        await readFile(outPath, 'utf8');
        indexLines.push(`| \`${app.id}\` | ${app.name} | ${app.type} | [${app.slug}.md](${app.slug}.md) |`);
        continue;
      } catch {
        // create new file
      }
    }
    const adjusted = content
      .replaceAll('](APP-REGISTRY.md)', '](../APP-REGISTRY.md)')
      .replaceAll('](DOMAIN-INDEX.md)', '](../DOMAIN-INDEX.md)')
      .replaceAll('](CONNECTOR-CATALOG.md)', '](../CONNECTOR-CATALOG.md)');
    await writeFile(outPath, adjusted, 'utf8');
    indexLines.push(`| \`${app.id}\` | ${app.name} | ${app.type} | [${app.slug}.md](${app.slug}.md) |`);
  }

  indexLines.push('', '## Rule', '', 'Use the generated README as the starting point, then add app-specific setup, config, and QA details.');
  await writeFile(INDEX_PATH, indexLines.join('\n') + '\n', 'utf8');

  console.log(`Generated ${apps.length} app README files in ${path.relative(ROOT, OUTPUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
