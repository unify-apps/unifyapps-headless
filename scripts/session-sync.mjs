#!/usr/bin/env node
/**
 * Runs detached from the SessionStart hook: refreshes the solution this folder
 * holds. The refresh goes
 * through the CLI itself, so AUTH_EXPIRED behaves as for a typed
 * `solution refresh`, and nothing here opens a browser.
 * Usage: session-sync.mjs <workspace> <sessionId>
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonicalCwd, readRegistry, sessionForFolder } from './folder/local.mjs';
import { failureStatus, readSyncStatus, writeSyncStatus } from './folder/solution-sync.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const faked = () => process.env.UA_FAKE === '1';

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}

export function syncRunning(home) {
  const status = readSyncStatus(home);
  return status?.status === 'running' && pidAlive(status.pid);
}

/** The session the refresh runs under: this one when it opened UnifyApps Headless here, else the
 * newest session in the folder, since a new Claude session has no state of its own yet. */
export function refreshSession(workspace, sessionId) {
  const folder = canonicalCwd(workspace);
  const own = readRegistry().sessions[sessionId];
  if (own?.cwd === folder) return { sessionId, ...own };
  return sessionForFolder(folder);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function statusFor(session) {
  return { pid: process.pid, solutionId: session.solutionId ?? null, tenant: session.tenant ?? null, solutionName: session.solutionName ?? null };
}

function refresh(session, home) {
  const run = spawnSync(process.execPath, [path.join(here, 'ua.mjs'), 'solution', 'refresh', '--json', '--session', session.sessionId], {
    cwd: session.cwd, env: { ...process.env, CLAUDE_CODE_SESSION_ID: session.sessionId }, encoding: 'utf8', timeout: 15 * 60_000,
  });
  if (run.status === 0) return;
  let error = null;
  try { error = JSON.parse(run.stdout)?.error ?? null; } catch { /* no JSON */ }
  const code = error?.code ?? 'ERROR';
  // The refresh records its own failure; this covers one that ended before it could.
  writeSyncStatus(home, { ...(readSyncStatus(home) ?? {}), ...statusFor(session), ...failureStatus(code), endedAt: new Date().toISOString(),
    error: { code, message: error?.message ?? (run.error?.message || 'The refresh failed.') } });
}

/**
 * A new Claude session in a set-up folder opens the folder's solution here, so no
 * command has to load setup first. A failed open (signed out, production) changes
 * nothing: setup still opens it when the first command needs it.
 */
function openHere(session, folder, sessionId) {
  const run = spawnSync(process.execPath, [path.join(here, 'ua.mjs'), 'solution', 'open', '--tenant', session.tenant, '--id', session.solutionId,
    ...(session.storage ? ['--storage', session.storage] : []), '--json', '--session', sessionId], {
    cwd: folder, env: { ...process.env, CLAUDE_CODE_SESSION_ID: sessionId }, encoding: 'utf8', timeout: 5 * 60_000,
  });
  return run.status === 0;
}

export async function sessionSync(workspace, sessionId) {
  const folder = canonicalCwd(workspace);
  let session = refreshSession(folder, sessionId);
  const home = session?.path ?? folder;
  const syncing = session && !syncRunning(home);
  if (syncing) writeSyncStatus(home, { status: 'running', startedAt: new Date().toISOString(), ...statusFor(session),
    endedAt: null, changed: null, failed: null, error: null, reason: null });
  // Stands in for a slow tenant, before either path below reads it, so a test
  // sees the same wait whichever one does the work.
  if (syncing && faked() && Number(process.env.UA_FAKE_SYNC_DELAY_MS) > 0) await sleep(Number(process.env.UA_FAKE_SYNC_DELAY_MS));
  // A new Claude session opens the folder's solution, and that open pulls the
  // whole solution and records its own sync status. Reading it all a second time
  // cannot find anything the open missed, so the refresh below is skipped: the
  // tenant is read once per session start, not twice.
  let openedHere = false;
  if (session && session.sessionId !== sessionId && openHere(session, folder, sessionId)) {
    session = refreshSession(folder, sessionId);
    openedHere = true;
  }
  if (!syncing) return;
  // Only when the open did not already pull it all: an open that failed, one
  // that could not read some entities, or a session that was already working
  // in this folder still needs the refresh.
  const opened = openedHere ? readSyncStatus(home) : null;
  if (opened?.status === 'ok' && !opened.failed) return;
  refresh(session, home);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [workspace, sessionId] = process.argv.slice(2);
  try {
    if (workspace && sessionId) await sessionSync(workspace, sessionId);
  }
  catch (error) { process.stderr.write(`ua session sync failed: ${error?.message ?? error}\n`); }
}
