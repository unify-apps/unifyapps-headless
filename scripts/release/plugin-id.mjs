import fs from 'node:fs';
import path from 'node:path';

/** The id Claude Code gives the plugin in `root`: `<plugin.json name>@<marketplace.json name>`. */
export function pluginId(root) {
  const read = (file) => JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', file), 'utf8')).name;
  const plugin = read('plugin.json');
  const marketplace = read('marketplace.json');
  return { id: `${plugin}@${marketplace}`, plugin, marketplace };
}
