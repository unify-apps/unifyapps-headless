// Codex, for the installer (a checkout or a downloaded copy): the staged copy is
// registered as a local marketplace and `ua` is installed from it, exactly as
// `codex plugin marketplace add unify-apps/unifyapps-headless` does from GitHub.
// Codex copies the plugin into its cache and reads `.codex-plugin/plugin.json`
// there, which finds the plugin's scripts at that cache folder
// (release/codex-manifest.mjs). The builders go to ~/.codex/agents, which the
// solution server also refreshes each time it starts.
import path from 'node:path';
import { pluginId } from '../../release/plugin-id.mjs';
import { codexManifestIsCurrent } from '../../release/codex-manifest.mjs';
import { removeCodexAgents, writeCodexAgents } from '../../workspace/codex-agents.mjs';
import { home, run, versionOf, which } from '../util.mjs';

const codexHome = () => process.env.CODEX_HOME || path.join(home(), '.codex');
const codex = () => which('codex');

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
    if (!codexManifestIsCurrent(pluginRoot)) throw new Error('.codex-plugin/plugin.json does not match this version: run node scripts/release/codex-manifest.mjs');
    const registered = marketplaces(bin).find((entry) => entry.name === own.marketplace);
    if (registered && path.resolve(registered.root) !== path.resolve(pluginRoot)) run(bin, ['plugin', 'marketplace', 'remove', own.marketplace]);
    if (!registered || path.resolve(registered.root) !== path.resolve(pluginRoot)) run(bin, ['plugin', 'marketplace', 'add', pluginRoot]);
    // Re-adding the same version keeps Codex's cached copy, so a reinstall removes it first.
    if (installed(bin, own.id)) run(bin, ['plugin', 'remove', own.id]);
    run(bin, ['plugin', 'add', own.id]);
    const result = installed(bin, own.id);
    if (!result?.enabled) throw new Error(`Codex did not enable ${own.id} after installing it.`);
    writeCodexAgents(path.join(codexHome(), 'plugins', 'cache', own.marketplace, own.plugin, result.version));
    // Codex lists plugin skills under `$`, not `/` (codex-cli 0.169.0 has no user-defined slash commands).
    return { start: 'Start a new Codex session (`codex`) and type $ua:setup.', notes: [] };
  },

  uninstall({ pluginRoot }) {
    const bin = codex();
    if (!bin) return;
    const own = pluginId(pluginRoot);
    try { run(bin, ['plugin', 'remove', own.id]); } catch { /* not installed */ }
    try { run(bin, ['plugin', 'marketplace', 'remove', own.marketplace]); } catch { /* not registered */ }
    removeCodexAgents();
  },
};
