// Claude Code: the plugin is native here. The installer adds the plugin to the
// Claude Code already on this machine (on PATH, or a private copy an earlier
// UnifyApps Headless installed); it never installs Claude Code itself. Registering the staged copy as a
// marketplace and installing `ua@unifyapps-headless` gives every new session the
// skills as `/ua:<name>` commands, the MCP servers, the builder agents and the
// hooks, all from the plugin's own manifests.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { installLocal } from '../../install-local.mjs';
import { pluginId } from '../../release/plugin-id.mjs';
import { UA_HOME } from '../../lib/session-paths.mjs';
import { run, versionOf, which } from '../util.mjs';

const privateCopy = () => path.join(UA_HOME, 'runtime', 'claude', 'node_modules', '.bin');
const claude = () => which('claude', [privateCopy()]);

export default {
  id: 'claude',
  label: 'Claude Code',

  detect() {
    const bin = claude();
    if (!bin) return { found: false, note: 'not found' };
    const version = versionOf(bin);
    return version ? { found: true, version } : { found: false, note: 'found but it cannot run' };
  },

  install({ pluginRoot }) {
    const bin = claude();
    installLocal({ source: pluginRoot, uaHome: UA_HOME, run: (...args) => run(bin, args) });
    const notes = [];
    // The auto-mode rules live in the person's own Claude settings, and the
    // script refuses to run inside a Claude session, so a refusal is a note.
    const rules = spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'permissions.mjs'), 'apply'], { encoding: 'utf8' });
    if (rules.status !== 0) notes.push(`Auto-mode permission rules were not added. Run this in your own terminal: bash "${path.join(pluginRoot, 'setup.sh')}" --permissions`);
    return { start: 'Open a new terminal, run `claude`, and type /ua:setup.', notes };
  },

  uninstall({ pluginRoot }) {
    const bin = claude();
    if (!bin) return;
    const own = pluginId(pluginRoot);
    try { run(bin, ['plugin', 'uninstall', own.id, '--scope', 'user', '--yes']); } catch { /* not installed */ }
    try { run(bin, ['plugin', 'marketplace', 'remove', own.marketplace]); } catch { /* not registered */ }
  },
};
