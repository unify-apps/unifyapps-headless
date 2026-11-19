#!/usr/bin/env node
// Codex installs the plugin from the same catalogue as Claude Code, and reads
// `.codex-plugin/plugin.json` before the Claude manifest. It needs one of its
// own because, measured on codex-cli 0.169.0, it does not expand
// `${CLAUDE_PLUGIN_ROOT}` in an MCP server's arguments, sets no plugin-root
// variable for the server, and starts it in the session's folder. So a server
// finds the plugin at the place Codex installs it, which is fixed:
// `${CODEX_HOME:-~/.codex}/plugins/cache/<marketplace>/<plugin>/<version>`.
// The version is part of that path, so this file is written again whenever the
// version changes (`setVersion` in the publish run), and the smoke test fails
// when it is out of date.
//
//   node scripts/release/codex-manifest.mjs           write it
//   node scripts/release/codex-manifest.mjs --check   exit 1 when it is stale
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CODEX_MANIFEST = '.codex-plugin/plugin.json';
const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const readJson = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const quote = (text) => `"${text.replace(/["\\$`]/gu, '\\$&')}"`;

/** The folder Codex installs this version into, as a shell expression. */
export function codexRootExpression(root = ROOT) {
  const plugin = readJson(root, '.claude-plugin/plugin.json');
  const marketplace = readJson(root, '.claude-plugin/marketplace.json').name;
  return `\${CODEX_HOME:-$HOME/.codex}/plugins/cache/${marketplace}/${plugin.name}/${plugin.version}`;
}

/** One Claude MCP server as a Codex one: the same launcher, from the Codex folder. */
function codexServer(server, rootExpression) {
  if (server.command !== 'bash') throw new Error(`Codex manifest: a server must start with bash, not ${server.command}.`);
  const args = server.args.map((arg) => (arg.startsWith('${CLAUDE_PLUGIN_ROOT}/')
    ? `"$r/${arg.slice('${CLAUDE_PLUGIN_ROOT}/'.length)}"` : quote(arg)));
  // Codex passes a server only some of its environment; CODEX_HOME is named so
  // a person who moved Codex's folder still has the server find the plugin.
  return { command: 'bash', args: ['-c', `r="${rootExpression}"; export CLAUDE_PLUGIN_ROOT="$r" UA_AGENT=codex; exec bash ${args.join(' ')}`], env_vars: ['CODEX_HOME'] };
}

export function codexManifest(root = ROOT) {
  const claude = readJson(root, '.claude-plugin/plugin.json');
  const rootExpression = codexRootExpression(root);
  return {
    name: claude.name,
    version: claude.version,
    description: claude.description,
    author: claude.author,
    homepage: 'https://github.com/unify-apps/unifyapps-headless',
    repository: 'https://github.com/unify-apps/unifyapps-headless',
    license: 'MIT',
    skills: claude.skills,
    mcpServers: Object.fromEntries(Object.entries(claude.mcpServers).map(([name, server]) => [name, codexServer(server, rootExpression)])),
    interface: {
      displayName: 'UnifyApps Headless',
      shortDescription: 'Build UnifyApps solutions from Codex.',
      longDescription: claude.description,
      developerName: 'UnifyApps',
      category: 'Developer Tools',
      capabilities: ['Interactive', 'Read', 'Write', 'MCP'],
    },
  };
}

export const codexManifestText = (root = ROOT) => `${JSON.stringify(codexManifest(root), null, 2)}\n`;

export function writeCodexManifest(root = ROOT) {
  fs.mkdirSync(path.join(root, path.dirname(CODEX_MANIFEST)), { recursive: true });
  fs.writeFileSync(path.join(root, CODEX_MANIFEST), codexManifestText(root));
}

export function codexManifestIsCurrent(root = ROOT) {
  try { return fs.readFileSync(path.join(root, CODEX_MANIFEST), 'utf8') === codexManifestText(root); } catch { return false; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    if (!codexManifestIsCurrent()) { console.error(`${CODEX_MANIFEST} is out of date: run node scripts/release/codex-manifest.mjs`); process.exit(1); }
  } else writeCodexManifest();
}
