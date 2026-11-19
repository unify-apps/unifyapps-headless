#!/usr/bin/env node
// Antigravity CLI's own manifest. `agy` reads `.antigravity-plugin/plugin.json`
// before it would fall back to converting the Gemini extension, and takes every
// component from the plugin root: the skills (the folders the manifest names;
// Antigravity has no commands, so each /ua: command is the skill of that name),
// the builders in agents/ (shared with Claude Code, whose tool lists are YAML
// lists so both read them), and the tenant servers in `mcp_config.json`, each
// started from `${PLUGIN_ROOT}`. Both files are written from the Claude ones,
// so one version serves both; the publish run writes them when the version
// changes, and `npm test` fails when they are stale.
//
//   node scripts/release/antigravity-manifest.mjs           write them
//   node scripts/release/antigravity-manifest.mjs --check   exit 1 when one is stale
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ANTIGRAVITY_DIR = '.antigravity-plugin';
const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const readJson = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
export function antigravityFiles(root = ROOT) {
  const claude = readJson(root, '.claude-plugin/plugin.json');
  const mcpServers = Object.fromEntries(Object.entries(claude.mcpServers).map(([name, server]) => [name, {
    ...server,
    args: server.args.map((arg) => arg.replaceAll('${CLAUDE_PLUGIN_ROOT}', '${PLUGIN_ROOT}')),
    env: { UA_AGENT: 'antigravity' },
  }]));
  return {
    [`${ANTIGRAVITY_DIR}/plugin.json`]: json({
      name: 'unifyapps-headless',
      displayName: 'UnifyApps Headless',
      version: claude.version,
      description: claude.description,
      author: claude.author,
      homepage: 'https://github.com/unify-apps/unifyapps-headless',
      repository: 'https://github.com/unify-apps/unifyapps-headless',
      license: 'MIT',
      category: 'Developer Tools',
      skills: claude.skills,
      suggestedPrompts: ['Set up UnifyApps Headless in this folder', 'Build the page in this Figma: <link>'],
    }),
    'mcp_config.json': json({ mcpServers }),
  };
}

export function writeAntigravityFiles(root = ROOT) {
  for (const [file, body] of Object.entries(antigravityFiles(root))) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), body);
  }
}

/** The files that differ from what the Claude ones say. */
export function antigravityDrift(root = ROOT) {
  return Object.entries(antigravityFiles(root)).filter(([file, body]) => {
    try { return fs.readFileSync(path.join(root, file), 'utf8') !== body; } catch { return true; }
  }).map(([file]) => file);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const stale = antigravityDrift();
    if (stale.length) { console.error(`${stale.join(', ')} out of date: run node scripts/release/antigravity-manifest.mjs`); process.exit(1); }
  } else writeAntigravityFiles();
}
