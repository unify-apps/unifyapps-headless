// Where the loops keep machine-wide state (LOOPS_HOME): the simulator pool,
// reservations, page locks, named locks, the device queue, the Figma cache
// and config.json.
//
// LOOPS_HOME, when set, wins. Otherwise it is <UA_HOME>/loops, with
// UA_HOME defaulting to ~/.unifyapps-solutions like the rest of UnifyApps Headless.
// The loops used to live in ~/.agentic-loops; the first call that finds that
// folder and no new one moves it across once, and rewrites the absolute paths
// its JSON files hold (app bundles, logs) so nothing points at the old place.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const LEGACY_DIR_NAME = '.agentic-loops';

export function legacyHome(env = process.env) {
  return path.join(env.HOME || os.homedir(), LEGACY_DIR_NAME);
}

export function defaultHome(env = process.env) {
  const base = env.UA_HOME || path.join(env.HOME || os.homedir(), '.unifyapps-solutions');
  return path.join(path.resolve(base), 'loops');
}

// JSON files at the top of the folder that may carry absolute paths into it.
const PATH_BEARING = ['config.json', 'pool.json', 'health.json'];

function rewritePaths(home, from) {
  const rewritten = [];
  for (const name of PATH_BEARING) {
    const file = path.join(home, name);
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    // Paths are JSON strings, so the old prefix appears escaped the same way.
    const needle = JSON.stringify(from).slice(1, -1);
    if (!text.includes(needle)) continue;
    const replacement = JSON.stringify(home).slice(1, -1);
    fs.writeFileSync(file, text.split(needle).join(replacement));
    rewritten.push(name);
  }
  return rewritten;
}

/**
 * Moves the legacy folder to `to` once: only when `from` exists and `to` does not.
 * Returns what it did, or null when there was nothing to move.
 */
export function migrateLegacyHome({ from = legacyHome(), to = defaultHome() } = {}) {
  if (!fs.existsSync(from) || fs.existsSync(to)) return null;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
  } catch (error) {
    if (error.code === 'EEXIST' || error.code === 'ENOTEMPTY' || error.code === 'ENOENT') return null; // another process moved it first
    if (error.code !== 'EXDEV') throw error;
    fs.cpSync(from, to, { recursive: true, preserveTimestamps: true });
    fs.rmSync(from, { recursive: true, force: true });
  }
  const rewritten = rewritePaths(to, from);
  try {
    fs.mkdirSync(path.join(to, 'logs'), { recursive: true });
    fs.appendFileSync(path.join(to, 'logs', 'migrate.log'), `${new Date().toISOString()} moved ${from} -> ${to}${rewritten.length ? ` (rewrote ${rewritten.join(', ')})` : ''}\n`);
  } catch {
    // the log is a courtesy
  }
  return { from, to, rewritten };
}

/**
 * The loops home. `migrate: false` only resolves (the hooks' fast path uses it
 * to decide whether there is anything to do at all).
 */
export function loopsHome({ env = process.env, migrate = true } = {}) {
  if (env.LOOPS_HOME) return path.resolve(env.LOOPS_HOME);
  const home = defaultHome(env);
  if (migrate) {
    try {
      migrateLegacyHome({ from: legacyHome(env), to: home });
    } catch {
      // a failed move leaves the old folder in place; the new one starts empty
    }
  }
  return home;
}
