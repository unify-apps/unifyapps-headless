// Codex: installed as a Codex plugin from the staged copy, which is also a
// marketplace (`.claude-plugin/marketplace.json`, which Codex reads too).
//
// Codex would take the Claude manifest as it is, but two things in it do not
// work there (measured on codex-cli 0.169.0): it neither expands
// `${CLAUDE_PLUGIN_ROOT}` in an MCP server's arguments nor sets it in the
// environment, and it starts an MCP server in the session's folder, which is
// where the bridge must run to find the solution. So the install writes a
// Codex manifest, `.codex-plugin/plugin.json`, which Codex reads before the
// Claude one, naming each server by absolute path, and a copy of the skills
// with `${CLAUDE_PLUGIN_ROOT}` replaced by the same path. Codex names a plugin
// skill `<plugin>:<skill>`, so every skill is `ua:<name>`. The builders go
// to Codex's own agents folder.
import fs from 'node:fs';
import path from 'node:path';
import { codexAgent, opencodeServers, pluginAgents, pluginServers, pluginSkills, portableSkill } from '../../workspace/agent-targets.mjs';
import { pluginId } from '../../release/plugin-id.mjs';
import { home, run, versionOf, which, writeFileAtomic } from '../util.mjs';

export const CODEX_SKILLS_DIR = 'codex-skills';
const AGENT_PREFIX = 'ua-';
const codexHome = () => process.env.CODEX_HOME || path.join(home(), '.codex');
const codex = () => which('codex');

/** Every Markdown file in a skill folder, with the plugin root written in. */
function writeSkillCopy(skill, into, pluginRoot) {
  const target = path.join(into, skill.name);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(skill.dir, target, { recursive: true, dereference: true });
  const resolve = (text) => text.replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot).replaceAll('$CLAUDE_PLUGIN_ROOT', pluginRoot);
  for (const file of fs.readdirSync(target, { recursive: true })) {
    const full = path.join(target, String(file));
    if (!full.endsWith('.md') || !fs.statSync(full).isFile()) continue;
    let text = resolve(fs.readFileSync(full, 'utf8'));
    if (path.basename(full) === 'SKILL.md') text = portableSkill(text) ?? text;
    fs.writeFileSync(full, text);
  }
}

/** The Codex manifest: the Claude one's identity, the skill copy, and the
 * servers by absolute path, started in the session's folder. */
export function codexManifest(pluginRoot) {
  const claude = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
  const mcpServers = Object.fromEntries(Object.entries(opencodeServers(pluginServers()))
    .map(([name, { command: [command, ...args] }]) => [name, { command, args }]));
  return {
    name: claude.name,
    version: claude.version,
    description: claude.description,
    author: claude.author,
    homepage: claude.homepage,
    repository: claude.repository,
    keywords: claude.keywords,
    skills: [`./${CODEX_SKILLS_DIR}/`],
    mcpServers,
    interface: {
      displayName: claude.displayName ?? 'UnifyApps Headless',
      shortDescription: 'Build UnifyApps solutions from Codex.',
      longDescription: claude.description,
      developerName: claude.author?.name ?? 'UnifyApps',
      category: 'Developer Tools',
      capabilities: ['Interactive', 'Read', 'Write', 'MCP'],
    },
  };
}

/** Writes the Codex manifest and skill copy into the staged plugin. */
export function writeCodexBundle(pluginRoot) {
  const skillsInto = path.join(pluginRoot, CODEX_SKILLS_DIR);
  fs.rmSync(skillsInto, { recursive: true, force: true });
  fs.mkdirSync(skillsInto, { recursive: true });
  for (const skill of pluginSkills()) writeSkillCopy(skill, skillsInto, pluginRoot);
  writeFileAtomic(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), `${JSON.stringify(codexManifest(pluginRoot), null, 2)}\n`);
}

/** The builders, one TOML file each, replacing the ones a former install wrote. */
function writeAgents(pluginRoot) {
  const dir = path.join(codexHome(), 'agents');
  fs.mkdirSync(dir, { recursive: true });
  removeAgents();
  const skillsDir = path.join(pluginRoot, CODEX_SKILLS_DIR);
  for (const agent of pluginAgents()) {
    const text = codexAgent(agent, { skillsDir }).replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot);
    writeFileAtomic(path.join(dir, `${AGENT_PREFIX}${agent.name}.toml`), text);
  }
}

function removeAgents() {
  const dir = path.join(codexHome(), 'agents');
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (!file.startsWith(AGENT_PREFIX) || !file.endsWith('.toml')) continue;
    const full = path.join(dir, file);
    if (fs.readFileSync(full, 'utf8').startsWith('# UnifyApps Headless.')) fs.rmSync(full, { force: true });
  }
}

const marketplaces = (bin) => JSON.parse(run(bin, ['plugin', 'marketplace', 'list', '--json'])).marketplaces ?? [];
const installed = (bin, id) => (JSON.parse(run(bin, ['plugin', 'list', '--json'])).installed ?? []).find((plugin) => plugin.pluginId === id);

export default {
  id: 'codex',
  label: 'Codex',

  detect() {
    const bin = codex();
    if (!bin) return { found: false, note: 'not found' };
    const version = versionOf(bin);
    return version ? { found: true, version } : { found: false, note: 'on PATH but it cannot run' };
  },

  install({ pluginRoot }) {
    const bin = codex();
    const own = pluginId(pluginRoot);
    writeCodexBundle(pluginRoot);
    const registered = marketplaces(bin).find((entry) => entry.name === own.marketplace);
    if (registered && path.resolve(registered.root) !== path.resolve(pluginRoot)) run(bin, ['plugin', 'marketplace', 'remove', own.marketplace]);
    if (!registered || path.resolve(registered.root) !== path.resolve(pluginRoot)) run(bin, ['plugin', 'marketplace', 'add', pluginRoot]);
    // Re-adding the same version keeps Codex's cached copy, so a reinstall removes it first.
    if (installed(bin, own.id)) run(bin, ['plugin', 'remove', own.id]);
    run(bin, ['plugin', 'add', own.id]);
    const result = installed(bin, own.id);
    if (!result?.enabled) throw new Error(`Codex did not enable ${own.id} after installing it.`);
    writeAgents(pluginRoot);
    // Codex lists plugin skills under `$`, not `/` (codex-cli 0.169.0 has no user-defined slash commands).
    return { start: 'Start a new Codex session (`codex`) and type $ua:setup.', notes: [] };
  },

  uninstall({ pluginRoot }) {
    const bin = codex();
    if (!bin) return;
    const own = pluginId(pluginRoot);
    try { run(bin, ['plugin', 'remove', own.id]); } catch { /* not installed */ }
    try { run(bin, ['plugin', 'marketplace', 'remove', own.marketplace]); } catch { /* not registered */ }
    removeAgents();
  },
};
