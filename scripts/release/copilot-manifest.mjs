#!/usr/bin/env node
// GitHub Copilot CLI's own catalogue and manifest, in `.github/plugin/`, which
// Copilot reads before the `.claude-plugin/` files it otherwise falls back to.
// Both are written from the Claude ones, so one version and one release tag
// serve both: the catalogue's `ua` entry is the same source (a release tag),
// and the manifest names every skill folder and starts each MCP server with
// Copilot's `${PLUGIN_ROOT}`. The publish run writes them after the version
// changes; the smoke test fails when they are out of date.
//
//   node scripts/release/copilot-manifest.mjs           write them
//   node scripts/release/copilot-manifest.mjs --check   exit 1 when one is stale
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COPILOT_DIR = '.github/plugin';
const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const readJson = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const text = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function copilotFiles(root = ROOT) {
  const claude = readJson(root, '.claude-plugin/plugin.json');
  const catalogue = readJson(root, '.claude-plugin/marketplace.json');
  const mcpServers = Object.fromEntries(Object.entries(claude.mcpServers).map(([name, server]) => [name, {
    ...server, args: server.args.map((arg) => arg.replaceAll('${CLAUDE_PLUGIN_ROOT}', '${PLUGIN_ROOT}')),
  }]));
  return {
    'marketplace.json': text(catalogue),
    'plugin.json': text({
      name: claude.name,
      version: claude.version,
      description: claude.description,
      author: claude.author,
      license: 'MIT',
      repository: 'https://github.com/unify-apps/unifyapps-headless',
      skills: claude.skills,
      agents: './agents/',
      mcpServers,
    }),
  };
}

export function writeCopilotFiles(root = ROOT) {
  fs.mkdirSync(path.join(root, COPILOT_DIR), { recursive: true });
  for (const [file, body] of Object.entries(copilotFiles(root))) fs.writeFileSync(path.join(root, COPILOT_DIR, file), body);
}

/** The files that differ from what the Claude ones say. */
export function copilotDrift(root = ROOT) {
  return Object.entries(copilotFiles(root)).filter(([file, body]) => {
    try { return fs.readFileSync(path.join(root, COPILOT_DIR, file), 'utf8') !== body; } catch { return true; }
  }).map(([file]) => `${COPILOT_DIR}/${file}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const stale = copilotDrift();
    if (stale.length) { console.error(`${stale.join(', ')} out of date: run node scripts/release/copilot-manifest.mjs`); process.exit(1); }
  } else writeCopilotFiles();
}
