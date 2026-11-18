// OpenCode: one loader file in OpenCode's global plugins folder, which OpenCode
// loads at every start. OpenCode 1 and 2 both load a `.js` file placed directly
// in that folder. It re-exports the package entry, `opencode/index.mjs`, from
// the staged copy: one default export that OpenCode 2 runs as `setup` and
// OpenCode 1 as `server`, adding the MCP servers, the builders, the skills and
// a `/ua:<name>` command per typed skill.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { home, versionOf, which, writeFileAtomic } from '../util.mjs';

const LOADER = 'unifyapps-headless.js';
const configDir = () => path.join(process.env.XDG_CONFIG_HOME || path.join(home(), '.config'), 'opencode');
export const loaderPath = () => path.join(configDir(), 'plugins', LOADER);
const opencode = () => which('opencode', [path.join(home(), '.opencode', 'bin')]);

export function loaderText(pluginRoot, version) {
  const entry = pathToFileURL(path.join(pluginRoot, 'opencode', 'index.mjs')).href;
  return `// UnifyApps Headless ${version}. Written by its installer; run the installer again to update it.\n`
    + `export { default } from ${JSON.stringify(entry)};\n`;
}

export default {
  id: 'opencode',
  label: 'OpenCode',

  detect() {
    const bin = opencode();
    if (!bin) return { found: false, note: 'not found' };
    const version = versionOf(bin);
    return version ? { found: true, version } : { found: false, note: 'found but it cannot run' };
  },

  install({ pluginRoot, version }) {
    writeFileAtomic(loaderPath(), loaderText(pluginRoot, version));
    return { start: 'Start a new OpenCode session (`opencode`) and type /ua:setup.', notes: [] };
  },

  uninstall() {
    fs.rmSync(loaderPath(), { force: true });
  },
};
