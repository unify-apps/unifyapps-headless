// Where things are: the plugin root (resolved from this file, symlink-safe),
// LOOPS_HOME, the solution folder and a run folder, plus small JSON helpers.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));

/** skills/native-loops/loop-orchestrator/scripts */
export const SCRIPTS_DIR = path.resolve(here, '..');
/** skills/native-loops/loop-orchestrator */
export const SKILL_DIR = path.resolve(SCRIPTS_DIR, '..');
export const TEMPLATES_DIR = path.join(SKILL_DIR, 'templates');
/** The plugin root: skills/native-loops/loop-orchestrator/scripts/loops.mjs → ../../../.. */
export const PLUGIN_ROOT = path.resolve(SCRIPTS_DIR, '..', '..', '..', '..');

/** The block scripts this CLI wraps (owned by the native-device-pool and loop-preflight blocks). */
export const BLOCKS = {
  devicePool: path.join(PLUGIN_ROOT, 'skills', 'native-loops', 'native-device-pool', 'scripts', 'device-pool.mjs'),
  devicePoolSh: path.join(PLUGIN_ROOT, 'skills', 'native-loops', 'native-device-pool', 'scripts', 'device-pool.sh'),
  home: path.join(PLUGIN_ROOT, 'skills', 'native-loops', 'native-device-pool', 'scripts', 'lib', 'home.mjs'),
  preflightHealth: path.join(PLUGIN_ROOT, 'skills', 'native-loops', 'loop-preflight', 'scripts', 'health.mjs'),
  preflightProfile: path.join(PLUGIN_ROOT, 'skills', 'native-loops', 'loop-preflight', 'scripts', 'profile.mjs'),
};

export const UA = {
  runNode: path.join(PLUGIN_ROOT, 'scripts', 'run-node.sh'),
  cli: path.join(PLUGIN_ROOT, 'scripts', 'ua.mjs'),
};

export function pluginVersion(root = PLUGIN_ROOT) {
  const manifest = readJson(path.join(root, '.claude-plugin', 'plugin.json'));
  return typeof manifest?.version === 'string' ? manifest.version : null;
}

const homeDir = (env) => env.HOME || os.homedir();

/** `LOOPS_HOME`, else `${UA_HOME:-~/.unifyapps-solutions}/loops`. Resolves only. */
export function loopsHomePath(env = process.env) {
  if (env.LOOPS_HOME) return path.resolve(env.LOOPS_HOME);
  const base = env.UA_HOME || path.join(homeDir(env), '.unifyapps-solutions');
  return path.join(path.resolve(base), 'loops');
}

/**
 * LOOPS_HOME, after the one-time move from ~/.agentic-loops. The move belongs to
 * native-device-pool (lib/home.mjs); it runs here first because this CLI may be the first
 * thing to write into the new folder, and a folder that exists blocks the move.
 */
export async function loopsHome(env = process.env) {
  const target = loopsHomePath(env);
  if (env.LOOPS_HOME) return target;
  const legacy = path.join(homeDir(env), '.agentic-loops');
  if (!fs.existsSync(target) && fs.existsSync(legacy)) {
    try {
      const mod = await import(pathToFileURL(BLOCKS.home).href);
      if (typeof mod.migrateLegacyHome === 'function') mod.migrateLegacyHome({ from: legacy, to: target });
    } catch {
      // native-device-pool is not beside us: the next device-pool call moves it
    }
  }
  return target;
}

export function legacyHomePending(env = process.env) {
  if (env.LOOPS_HOME) return false;
  return fs.existsSync(path.join(homeDir(env), '.agentic-loops')) && !fs.existsSync(loopsHomePath(env));
}

/** The solution folder: --solution, else the nearest folder up from cwd holding .nebula/, else cwd. */
export function solutionDir(flag, cwd = process.cwd()) {
  if (flag) return path.resolve(flag);
  let dir = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.nebula'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(cwd);
    dir = parent;
  }
}

export const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export function runsDir(solution) {
  return path.join(solution, '.nebula', 'loops', 'runs');
}

/**
 * A run folder from --run (an id or a folder path) or LOOPS_RUN_ID.
 * Returns { id, dir } or null when neither is given.
 */
export function resolveRun({ run, solution }, env = process.env) {
  const token = run ?? env.LOOPS_RUN_ID ?? null;
  if (!token) return null;
  if (token.includes('/') || token.startsWith('.')) {
    const dir = path.resolve(token);
    return { id: path.basename(dir), dir };
  }
  if (!RUN_ID_PATTERN.test(token)) throw Object.assign(new Error(`run id "${token}" may hold only letters, digits, ".", "_" and "-"`), { usage: true });
  return { id: token, dir: path.join(runsDir(solution), token) };
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** Lines of a JSONL file; a bad line is skipped, never fatal (a log is not a strict format). */
export function readJsonl(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip
    }
  }
  return out;
}

/** config.json in LOOPS_HOME, shared with device-pool. Read-only here. */
export function readLoopsConfig(home) {
  const config = readJson(path.join(home, 'config.json'), {});
  return config && typeof config === 'object' && !Array.isArray(config) ? config : {};
}

export function getPath(object, dotted) {
  return dotted.split('.').reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), object);
}

/** The wanted iOS runtime version (config ios.runtime, default 18.6). */
export function wantedRuntime(config) {
  const value = getPath(config, 'ios.runtime');
  return typeof value === 'string' && /^\d+\.\d+$/u.test(value) ? value : '18.6';
}
