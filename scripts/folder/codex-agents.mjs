// The builders as Codex agents, one TOML file each in ~/.codex/agents. A Codex
// plugin carries skills and MCP servers but no agents, so the solution server
// writes them when it starts under Codex, and rewrites only what changed.
// Files are named `ua-<builder>.toml` and start with a marker line, so a
// rewrite or an uninstall never touches anyone else's agents.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codexAgent, pluginAgents, pluginSkills } from './agent-targets.mjs';

const PREFIX = 'ua-';
const MARKER = '# UnifyApps Headless.';
export const codexAgentsDir = () => path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'agents');

/** Each builder's TOML, with the plugin's folder written into it. */
export function codexAgentFiles(pluginRoot) {
  const skillDirs = new Map(pluginSkills().map((skill) => [skill.name, skill.dir]));
  return pluginAgents().map((agent) => {
    const text = codexAgent(agent, { skillPath: (name) => skillDirs.get(name) ?? path.join(pluginRoot, 'skills', name) })
      .replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot).replaceAll('$CLAUDE_PLUGIN_ROOT', pluginRoot);
    return { file: `${PREFIX}${agent.name}.toml`, text };
  });
}

const ours = (dir, file) => file.startsWith(PREFIX) && file.endsWith('.toml')
  && fs.readFileSync(path.join(dir, file), 'utf8').startsWith(MARKER);

/** Writes the builders, removes ones no longer shipped. Returns how many files changed. */
export function writeCodexAgents(pluginRoot, dir = codexAgentsDir()) {
  fs.mkdirSync(dir, { recursive: true });
  const wanted = codexAgentFiles(pluginRoot);
  const names = new Set(wanted.map(({ file }) => file));
  let changed = 0;
  for (const file of fs.readdirSync(dir)) {
    if (!names.has(file) && ours(dir, file)) { fs.rmSync(path.join(dir, file), { force: true }); changed++; }
  }
  for (const { file, text } of wanted) {
    const full = path.join(dir, file);
    let current = null;
    try { current = fs.readFileSync(full, 'utf8'); } catch { /* new */ }
    if (current === text) continue;
    if (current !== null && !current.startsWith(MARKER)) continue;
    fs.writeFileSync(`${full}.tmp`, text);
    fs.renameSync(`${full}.tmp`, full);
    changed++;
  }
  return changed;
}

export function removeCodexAgents(dir = codexAgentsDir()) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) if (ours(dir, file)) fs.rmSync(path.join(dir, file), { force: true });
}
