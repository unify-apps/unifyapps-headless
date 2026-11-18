// GitHub Copilot CLI: the Claude manifests work here as they are. Registering
// the staged copy as a marketplace and installing `ua@unifyapps-headless` gives
// Copilot the skills, the 14 tenant MCP servers and the 12 builders (as
// `ua:<name>`, usable with `--agent` and in fleet mode), all from
// `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
//
// Two things differ from the other agents (measured on GitHub Copilot CLI
// 1.0.114):
//
//   it needs no manifest of its own  Copilot expands `${CLAUDE_PLUGIN_ROOT}` in
//                                    an MCP server's arguments and starts the
//                                    server in the session's folder, which is
//                                    where the bridge must run to find the
//                                    solution, so the Codex workaround is not
//                                    needed here.
//   there are no slash commands      Copilot has no user-defined slash command,
//                                    so a skill is reached by asking for the
//                                    work in words; the model picks the skill
//                                    from its description.
//
// A marketplace registered from a local path is installed "live": Copilot reads
// the staged copy where it is and copies nothing, so a reinstall of the same
// version needs no cache to be cleared.
import fs from 'node:fs';
import path from 'node:path';
import { pluginId } from '../../release/plugin-id.mjs';
import { home, run, versionOf } from '../util.mjs';

/** Only `GitHub Copilot CLI <version>` is the CLI. */
const REAL = /^GitHub Copilot CLI\s+\d/u;
/** The shim Visual Studio Code ships is also called `copilot` and is often first
 * on PATH. It passes a command to the real CLI when one is installed, and offers
 * to install it when none is, but it answers 0 for a command that failed, which
 * would make a failed install look like a clean one. The real binary is
 * preferred for that reason; the shim is used only when it is all there is. */
const SHIM = /github\.copilot-chat|copilotCli/u;

export function copilotBin() {
  const dirs = [...String(process.env.PATH ?? '').split(path.delimiter), path.join(home(), '.local', 'bin')].filter(Boolean);
  const found = [];
  for (const dir of dirs) {
    const file = path.join(dir, 'copilot');
    try {
      fs.accessSync(file, fs.constants.X_OK);
      if (!fs.statSync(file).isFile()) continue;
    } catch { continue; }
    if (REAL.test(String(versionOf(file) ?? ''))) found.push(file);
  }
  return found.find((file) => !SHIM.test(file)) ?? found[0] ?? null;
}

const marketplaces = (bin) => JSON.parse(run(bin, ['plugin', 'marketplace', 'list', '--json']));
const installed = (bin, name, marketplace) => JSON.parse(run(bin, ['plugin', 'list', '--json']))
  .find((plugin) => plugin.name === name && plugin.marketplace === marketplace);

export default {
  id: 'copilot',
  label: 'Copilot CLI',

  detect() {
    const bin = copilotBin();
    if (!bin) return { found: false, note: 'not found' };
    return { found: true, version: versionOf(bin) };
  },

  install({ pluginRoot }) {
    const bin = copilotBin();
    const own = pluginId(pluginRoot);
    const root = path.resolve(pluginRoot);
    // Copilot reports a local marketplace as `Local: <path>`. Another path, or a
    // GitHub-sourced one of the same name, is replaced by the staged copy — and
    // the plugin goes first, since Copilot refuses to remove a marketplace whose
    // plugins are still installed.
    const registered = () => marketplaces(bin).find((entry) => entry.name === own.marketplace);
    const wanted = `Local: ${root}`;
    const before = registered();
    if (installed(bin, own.plugin, own.marketplace)) run(bin, ['plugin', 'uninstall', own.id]);
    if (before && before.source !== wanted) run(bin, ['plugin', 'marketplace', 'remove', own.marketplace]);
    if (!before || before.source !== wanted) run(bin, ['plugin', 'marketplace', 'add', root]);
    // Both checks are read back, because the shim answers 0 for a failed command.
    if (registered()?.source !== wanted) throw new Error(`Copilot CLI did not register ${root} as the ${own.marketplace} marketplace.`);
    run(bin, ['plugin', 'install', own.id]);
    const result = installed(bin, own.plugin, own.marketplace);
    if (!result?.enabled) throw new Error(`Copilot CLI did not enable ${own.id} after installing it.`);
    if (result.installedFrom && path.resolve(result.installedFrom) !== root) {
      throw new Error(`Copilot CLI installed ${own.id} from ${result.installedFrom}, not ${root}.`);
    }
    return {
      start: 'Start a new Copilot CLI session (`copilot`) in your folder and ask it to set up UnifyApps Headless.',
      // Copilot picks a skill from its description, since copilot 1.0.114 has no
      // user-defined slash commands.
      notes: [
        'Copilot CLI has no /ua: commands: ask for the work in words, such as "set up UnifyApps Headless here".',
        // The skills run scripts from the staged copy, which is outside the
        // session folder, so Copilot asks before the first one runs.
        `Approve the commands Copilot asks about, or start it with --add-dir ${path.dirname(path.dirname(root))}, since UnifyApps Headless keeps its state and this copy there.`,
      ],
    };
  },

  uninstall({ pluginRoot }) {
    const bin = copilotBin();
    if (!bin) return;
    const own = pluginId(pluginRoot);
    try { run(bin, ['plugin', 'uninstall', own.id]); } catch { /* not installed */ }
    try { run(bin, ['plugin', 'marketplace', 'remove', own.marketplace]); } catch { /* not registered */ }
  },
};
