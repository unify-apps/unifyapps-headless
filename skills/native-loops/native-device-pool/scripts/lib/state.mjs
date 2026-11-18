// Machine-wide state for the loops: one folder of small JSON files, no daemon.
// Every reservation, lock, page lock and waiter ticket is one file in the same
// envelope, so one reaper and one staleness rule cover all of them.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loopsHome as resolveHome } from './home.mjs';

export const STATE_VERSION = 1;

export const DEFAULT_CONFIG = {
  version: STATE_VERSION,
  nodeBin: null,
  // No default source: the person gives the Preview app's simulator build (loops preview install
  // --app or --url), and pool install records it here.
  previewApp: { path: null, url: null, bundleId: 'com.unifyapps.matrix', scheme: 'matrix', kind: null, sha: null },
  // size: how many simulators `pool init` keeps (null: the laptop default that
  // `loops.mjs` computes and passes as --count). runtime: null picks iOS 18.6,
  // else the newest iOS 18.x installed; set it to pin another one on purpose.
  // slim: turn off the background services a test simulator does not need (lib/slim.mjs);
  // false keeps them on, and the laptop default sizes the pool for stock simulators.
  pool: { size: null, model: 'iPhone 16 Pro', runtime: null, slim: true },
  reservation: { ttlSec: 1800, waitSec: 0, pollSec: 15, maxHoldSec: 14400, releaseOnStop: true },
  locks: { publishTtlSec: 600, pageLockTtlSec: 21600 },
  limits: { warnTokens: 600000, maxPasses: 4, maxConcurrentRuns: 6 },
};

// Keys the loops renamed. A config.json written before reads the same: an old
// key's value is used when the new key is absent, and the old key is dropped
// from the merged config (so `config set` writes the new names).
const RENAMED_CONFIG = [['lease', 'reservation'], ['budget', 'limits']];
const RENAMED_LIMITS = [['maxRowRounds', 'maxAttempts'], ['laneMinutes', 'jobMinutes']];

export function upgradeConfig(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return stored;
  const next = { ...stored };
  for (const [old, now] of RENAMED_CONFIG) {
    if (!(old in next)) continue;
    if (!(now in next)) next[now] = next[old];
    delete next[old];
  }
  if (next.limits && typeof next.limits === 'object' && !Array.isArray(next.limits)) {
    const limits = { ...next.limits };
    for (const [old, now] of RENAMED_LIMITS) {
      if (!(old in limits)) continue;
      if (!(now in limits)) limits[now] = limits[old];
      delete limits[old];
    }
    next.limits = limits;
  }
  if (next.locks && typeof next.locks === 'object' && !Array.isArray(next.locks) && 'claimTtlSec' in next.locks) {
    const { claimTtlSec, ...locks } = next.locks;
    next.locks = { pageLockTtlSec: claimTtlSec, ...locks };
  }
  return next;
}

// LOOPS_HOME, else <UA_HOME>/loops (moved once from ~/.agentic-loops): see home.mjs.
export function loopsHome() {
  return resolveHome();
}

export function statePaths(home = loopsHome()) {
  return {
    home,
    config: path.join(home, 'config.json'),
    pool: path.join(home, 'pool.json'),
    reservations: path.join(home, 'reservations'),
    locks: path.join(home, 'locks'),
    pageLocks: path.join(home, 'page-locks'),
    queue: path.join(home, 'queue'),
    verifyQueue: path.join(home, 'verify-queue'),
    sessions: path.join(home, 'sessions'),
    apps: path.join(home, 'apps'),
    runs: path.join(home, 'runs'),
    logs: path.join(home, 'logs'),
  };
}

// Folders the loops renamed: leases/ → reservations/, claims/ → page-locks/.
export const RENAMED_DIRS = [['leases', 'reservations'], ['claims', 'page-locks']];

// Moves what an old folder holds into the new one: an entry the new folder
// lacks is moved, one it already has is dropped (the new one is the live
// state), and emptied folders are removed.
function mergeFolder(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let moved = 0;
  let entries;
  try {
    entries = fs.readdirSync(from, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      moved += mergeFolder(source, target);
      continue;
    }
    try {
      if (fs.existsSync(target)) fs.unlinkSync(source);
      else {
        fs.renameSync(source, target);
        moved += 1;
      }
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'EEXIST') throw error;
    }
  }
  try {
    fs.rmdirSync(from);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY' && error.code !== 'EEXIST') throw error;
  }
  return moved;
}

/**
 * Moves leases/ to reservations/ and claims/ to page-locks/ once: a rename when
 * the new folder is absent, else a merge. Returns what it did ([] when nothing
 * was there). Another process doing the same move at once is not an error.
 */
export function migrateStateFolders(home = loopsHome()) {
  const done = [];
  for (const [old, now] of RENAMED_DIRS) {
    const from = path.join(home, old);
    const to = path.join(home, now);
    if (!fs.existsSync(from)) continue;
    let how = null;
    if (!fs.existsSync(to)) {
      try {
        fs.renameSync(from, to);
        how = 'renamed';
      } catch (error) {
        if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT') throw error;
      }
    }
    if (!how) {
      if (!fs.existsSync(from)) continue; // another process moved it first
      how = `merged ${mergeFolder(from, to)}`;
    }
    done.push({ from: old, to: now, how });
  }
  if (done.length) {
    try {
      appendLog(home, 'migrate.log', done.map((item) => `moved ${item.from}/ -> ${item.to}/ (${item.how})`));
    } catch {
      // the log is a courtesy
    }
  }
  return done;
}

export function ensureHome(home = loopsHome()) {
  const paths = statePaths(home);
  try {
    migrateStateFolders(home);
  } catch {
    // a failed move leaves the old folder in place; the new one starts empty
  }
  for (const dir of [paths.home, paths.reservations, paths.locks, paths.pageLocks, paths.queue, paths.verifyQueue, paths.sessions, paths.apps, paths.runs, paths.logs]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}

export function readJson(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return { corrupt: true, file, error: error.message };
  }
}

function tmpNameFor(file) {
  return path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
}

export function replaceJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = tmpNameFor(file);
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

// The record is complete before its name exists: the content goes to a private
// tmp file and link() publishes it, failing with EEXIST when someone was first.
// A reader therefore never sees a half-written reservation, which is what lets reap
// treat any unparsable record as stale without a grace period.
export function createExclusive(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = tmpNameFor(file);
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  try {
    fs.linkSync(tmp, file);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  } finally {
    fs.unlinkSync(tmp);
  }
}

export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// null when the record is live, else why it is not: ttl, pid or corrupt.
export function stalenessReason(record, now = Date.now()) {
  if (!record || typeof record !== 'object' || record.corrupt || typeof record.kind !== 'string') return 'corrupt';
  if (record.expiresAt && Date.parse(record.expiresAt) < now) return 'ttl';
  if (record.ownerPid != null && !isPidAlive(record.ownerPid)) return 'pid';
  return null;
}

export function makeRecord(fields, now = Date.now()) {
  const { kind, id, sessionId = null, cwd = process.cwd(), ownerPid = null, task = null, ttlSec = null, ...kindFields } = fields;
  const acquiredAt = new Date(now).toISOString();
  return {
    version: STATE_VERSION,
    kind,
    id,
    sessionId,
    cwd,
    ownerPid,
    task,
    acquiredAt,
    renewedAt: acquiredAt,
    expiresAt: ttlSec ? new Date(now + ttlSec * 1000).toISOString() : null,
    ttlSec,
    renewals: 0,
    host: os.hostname(),
    ...kindFields,
  };
}

export function renewRecord(record, { ttlSec = record.ttlSec, now = Date.now() } = {}) {
  return {
    ...record,
    renewedAt: new Date(now).toISOString(),
    expiresAt: ttlSec ? new Date(now + ttlSec * 1000).toISOString() : record.expiresAt,
    ttlSec,
    renewals: (record.renewals ?? 0) + 1,
  };
}

export function listRecords(dir) {
  const found = [];
  const walk = (folder) => {
    let entries;
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.json')) found.push({ file, record: readJson(file) });
    }
  };
  walk(dir);
  return found.sort((left, right) => left.file.localeCompare(right.file));
}

export function appendLog(home, name, lines) {
  const paths = statePaths(home);
  fs.mkdirSync(paths.logs, { recursive: true });
  const stamp = new Date().toISOString();
  fs.appendFileSync(path.join(paths.logs, name), lines.map((line) => `${stamp} ${line}\n`).join(''));
}

// Sessions are reaped too: a killed Claude never fires SessionEnd, and its
// reservations would otherwise stay "live" until their TTL while the session row
// lingers in status forever.
export function reap(home = loopsHome(), { now = Date.now() } = {}) {
  const paths = statePaths(home);
  const reaped = [];
  for (const dir of [paths.reservations, paths.locks, paths.pageLocks, paths.queue, paths.sessions]) {
    for (const { file, record } of listRecords(dir)) {
      const reason = stalenessReason(record, now);
      if (!reason) continue;
      try {
        fs.unlinkSync(file);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        continue;
      }
      reaped.push({ file, kind: record?.kind ?? path.basename(dir), reason, sessionId: record?.sessionId ?? null });
    }
  }
  if (reaped.length) {
    appendLog(home, 'reap.log', reaped.map((item) => `reaped ${item.kind} ${path.relative(home, item.file)} reason=${item.reason} session=${item.sessionId ?? '-'}`));
  }
  return reaped;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A short process-scoped lock around read-modify-write of a shared file. The
// owner pid is this process, so a crash mid-update frees it on the next reap.
export async function withLock(home, name, fn, { ttlSec = 30, waitMs = 5000, sessionId = null, task = null } = {}) {
  const file = path.join(statePaths(home).locks, `${name}.json`);
  const token = crypto.randomUUID();
  const deadline = Date.now() + waitMs;
  for (;;) {
    const record = makeRecord({ kind: 'lock', id: token, name, sessionId, ownerPid: process.pid, task, ttlSec });
    if (createExclusive(file, record)) break;
    const existing = readJson(file);
    if (stalenessReason(existing)) {
      try {
        fs.unlinkSync(file);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      continue;
    }
    if (Date.now() > deadline) {
      const error = new Error(`lock "${name}" is held by session ${existing?.sessionId ?? '-'} (pid ${existing?.ownerPid ?? '-'})${existing?.task ? ` for "${existing.task}"` : ''}`);
      error.code = 'LOCKED';
      error.holder = existing;
      throw error;
    }
    await sleep(25);
  }
  try {
    return await fn();
  } finally {
    if (readJson(file)?.id === token) fs.unlinkSync(file);
  }
}

function mergeDefaults(defaults, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const merged = { ...defaults, ...value };
  for (const [key, child] of Object.entries(defaults)) {
    if (child && typeof child === 'object' && !Array.isArray(child)) merged[key] = mergeDefaults(child, value[key]);
  }
  return merged;
}

export function readConfig(home = loopsHome()) {
  const paths = ensureHome(home);
  const stored = readJson(paths.config);
  if (stored?.corrupt) throw new Error(`${paths.config} is not valid JSON: ${stored.error}`);
  const config = mergeDefaults(DEFAULT_CONFIG, upgradeConfig(stored));
  if (!stored) replaceJson(paths.config, config);
  return config;
}

export function writeConfig(home, config) {
  replaceJson(statePaths(home).config, config);
}

export function getPath(object, dotted) {
  return dotted.split('.').reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), object);
}

export function setPath(object, dotted, value) {
  const keys = dotted.split('.');
  let cursor = object;
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = value;
  return object;
}

// "true", "12", "null" and JSON literals become values; anything else stays text.
export function parseValue(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
