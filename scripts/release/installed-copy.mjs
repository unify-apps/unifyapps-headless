import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** What a person types to move an open chat to the installed copy. */
export const RELOAD_STEP = 'Type /reload-plugins to load it. Your chat stays. If UnifyApps Headless still says this after the reload, restart Claude Code.';

const real = (file) => { try { return fs.realpathSync(file); } catch { return path.resolve(file); } };

/**
 * Where a running UnifyApps Headless copy stands against the copy Claude Code has installed.
 * `inCache` is false for a copy outside Claude Code's plugin cache (a checkout,
 * a worktree). `installed` is the registered copy of this plugin, or null when
 * none is registered or `installed_plugins.json` cannot be read. `isInstalled`
 * is true only when the running copy is that registered copy.
 */
export function installedCopy(selfRoot, { configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude') } = {}) {
  const self = real(selfRoot);
  const cache = real(path.join(configDir, 'plugins', 'cache'));
  const inCache = self.startsWith(cache + path.sep);
  if (!inCache) return { self, inCache, installed: null, isInstalled: false };
  let plugins;
  try { plugins = JSON.parse(fs.readFileSync(path.join(configDir, 'plugins', 'installed_plugins.json'), 'utf8')).plugins; }
  catch { return { self, inCache, installed: null, isInstalled: false }; }
  // The cache keeps each version in its own folder beside the others, so a
  // registered copy of this plugin is one whose folder sits next to this one.
  const copies = Object.values(plugins ?? {}).flat()
    .filter((entry) => typeof entry?.installPath === 'string' && path.dirname(real(entry.installPath)) === path.dirname(self));
  const own = copies.find((entry) => real(entry.installPath) === self);
  return { self, inCache, installed: own ?? copies[0] ?? null, isInstalled: Boolean(own) };
}
