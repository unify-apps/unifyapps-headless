// Shared runtime context: the session id, session records, the owner pid,
// pool access and live reservations. Commands and hooks import
// from here so there is one answer to "which session is this" and "who holds
// what".
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  appendLog, listRecords, makeRecord, readJson, replaceJson, stalenessReason, statePaths, withLock,
} from '../lib/state.mjs';
import { usage } from './output.mjs';

const ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;

export function resolveSessionId(values) {
  const sessionId = values.session || process.env.LOOPS_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID;
  if (!sessionId) {
    throw usage('no session id: pass --session <id> or run inside Claude Code, where LOOPS_SESSION_ID / CLAUDE_CODE_SESSION_ID are set. Never type a session id or a UDID from memory.');
  }
  if (!ID_PATTERN.test(sessionId)) throw usage(`session id "${sessionId}" has characters a file name cannot hold`);
  return sessionId;
}

export const isSafeId = (value) => typeof value === 'string' && ID_PATTERN.test(value);

// A session may hold a second simulator under a role of its own, `--session <session id>.<role>`
// (the realtime check's writer): `reserve` gives a session back the simulator it already holds, so a
// second one needs its own id. The guard hooks and the session's own release read such a reservation
// as this session's.
export const ownedBy = (holder, sessionId) => typeof holder === 'string' && typeof sessionId === 'string' && sessionId !== ''
  && (holder === sessionId || holder.startsWith(`${sessionId}.`));

// The CLI process exits at once, so a reservation cannot be owned by it. The owner
// is the long-lived Claude process above it; without one (tests, CI) the
// record is null-owned and only its TTL ends it.
export function findClaudeAncestor(startPid = process.ppid) {
  let text;
  try {
    text = execFileSync('ps', ['-axo', 'pid=,ppid=,comm='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
  const parents = new Map();
  const names = new Map();
  for (const line of text.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    parents.set(Number(match[1]), Number(match[2]));
    names.set(Number(match[1]), path.basename(match[3].trim()));
  }
  const seen = new Set();
  let pid = startPid;
  while (pid && pid > 1 && !seen.has(pid)) {
    seen.add(pid);
    if (names.get(pid) === 'claude') return pid;
    pid = parents.get(pid);
  }
  return null;
}

// --- sessions ------------------------------------------------------------------

export const sessionFile = (home, sessionId) => path.join(statePaths(home).sessions, `${sessionId}.json`);

export function loadSession(home, sessionId) {
  const record = readJson(sessionFile(home, sessionId));
  return record && !record.corrupt ? record : null;
}

export function upsertSession(home, sessionId, patch = {}, { cwd = process.cwd() } = {}) {
  const existing = loadSession(home, sessionId);
  const now = new Date().toISOString();
  const record = existing
    ? { ...existing, ...patch, lastSeenAt: now }
    : { ...makeRecord({ kind: 'session', id: sessionId, sessionId, cwd, ownerPid: findClaudeAncestor() }), startedAt: now, lastSeenAt: now, lastUdid: null, unreservedWarnings: 0, ...patch };
  replaceJson(sessionFile(home, sessionId), record);
  return record;
}

export function liveSessions(home) {
  return listRecords(statePaths(home).sessions).filter(({ record }) => !stalenessReason(record)).map(({ record }) => record);
}

// --- pool ----------------------------------------------------------------------

export function readPool(home) {
  const pool = readJson(statePaths(home).pool);
  if (pool?.corrupt) throw new Error(`${statePaths(home).pool} is not valid JSON: ${pool.error}`);
  return pool;
}

export function loadPool(home) {
  const pool = readPool(home);
  if (!pool) throw usage(`no simulator pool at ${statePaths(home).pool}. Run: device-pool pool init --count 6 --preview-app <path|url>`);
  return pool;
}

export function findDevice(pool, udid) {
  return pool?.devices?.find((device) => device.udid === udid) ?? null;
}

export async function updatePool(home, fn, { sessionId = null } = {}) {
  return withLock(home, 'pool-write', () => {
    const pool = loadPool(home);
    const result = fn(pool);
    pool.updatedAt = new Date().toISOString();
    replaceJson(statePaths(home).pool, pool);
    return result ?? pool;
  }, { ttlSec: 10, waitMs: 2000, sessionId });
}

// --- reservations, waiter tickets -------------------------------------------------

export const reservationFile = (home, udid) => path.join(statePaths(home).reservations, `${udid}.json`);

// Every reservation record with why it is stale (null when live). A record
// written before the rename says kind "lease"; it is read the same.
export function allReservations(home) {
  return listRecords(statePaths(home).reservations).map(({ file, record }) => ({ file, record, stale: stalenessReason(record) }));
}

export function liveReservations(home) {
  return allReservations(home).filter(({ stale }) => !stale).map(({ record }) => record);
}

export function liveTickets(home) {
  return listRecords(statePaths(home).queue).filter(({ record }) => !stalenessReason(record)).map(({ file, record }) => ({ file, record }));
}

export async function dropReservation(home, reservation, { by, reason }) {
  try {
    fs.unlinkSync(reservationFile(home, reservation.udid));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await updatePool(home, (pool) => {
      const device = findDevice(pool, reservation.udid);
      if (device) device.state.lastReleasedAt = new Date().toISOString();
    });
  } catch {
    // the pool may be gone or locked by a slow init; the reservation file is what frees the device
  }
  appendLog(home, 'reservation.log', [`release ${reservation.udid} ${reservation.name ?? ''} session=${reservation.sessionId} by=${by} reason=${reason}`]);
}

export function dropTickets(home, sessionId) {
  let dropped = 0;
  for (const { file, record } of listRecords(statePaths(home).queue)) {
    if (record?.sessionId !== sessionId) continue;
    try {
      fs.unlinkSync(file);
      dropped += 1;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return dropped;
}

// Everything one session holds, released in one place: the CLI's release,
// the Stop event's hook and SessionEnd all end here so no path forgets a kind.
export async function releaseSession(home, sessionId, { reservations = true, locks = true, pageLocks = true, tickets = true, keepSession = false, reason }) {
  const paths = statePaths(home);
  const released = { reservations: [], locks: [], pageLocks: [], tickets: 0 };
  if (reservations) {
    // A role's simulator (`<session>.<role>`) goes first, so the last one released, which the
    // session remembers as lastUdid, is the session's own.
    const held = liveReservations(home).filter((record) => ownedBy(record.sessionId, sessionId))
      .sort((left, right) => Number(left.sessionId === sessionId) - Number(right.sessionId === sessionId));
    for (const reservation of held) {
      await dropReservation(home, reservation, { by: sessionId, reason });
      released.reservations.push(reservation.udid);
    }
    const session = loadSession(home, sessionId);
    if (session && released.reservations.length) replaceJson(sessionFile(home, sessionId), { ...session, lastUdid: released.reservations.at(-1) });
  }
  for (const [kind, enabled, dir] of [['locks', locks, paths.locks], ['pageLocks', pageLocks, paths.pageLocks]]) {
    if (!enabled) continue;
    for (const { file, record } of listRecords(dir)) {
      if (record?.sessionId !== sessionId) continue;
      fs.unlinkSync(file);
      released[kind].push(path.relative(dir, file).replace(/\.json$/, ''));
    }
  }
  if (tickets) released.tickets = dropTickets(home, sessionId);
  if (!keepSession) {
    try {
      fs.unlinkSync(sessionFile(home, sessionId));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return released;
}
