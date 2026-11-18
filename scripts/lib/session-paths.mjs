/** Filesystem boundaries for private UnifyApps Headless data and per-Claude-session caches. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeTenant } from './contracts.mjs';

export const UA_HOME = path.resolve(process.env.UA_HOME || path.join(os.homedir(), '.unifyapps-solutions'));

export const sessionIdPattern = /^[A-Za-z0-9_-]{1,200}$/u;
const solutionIdPattern = /^[A-Za-z0-9_-]{1,200}$/u;
const solutionSlugPattern = /^[a-z0-9](?:[a-z0-9._-]{0,198}[a-z0-9])?$/u;

export function solutionSlug(name) {
  const slug = String(name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/\s+/gu, '-')
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/-{2,}/gu, '-')
    .replace(/^[._-]+|[._-]+$/gu, '')
    .slice(0, 200)
    .replace(/[._-]+$/gu, '');
  return slug || 'solution';
}

export function canonicalCwd(cwd = process.cwd()) {
  const resolved = path.resolve(String(cwd));
  try { return fs.realpathSync(resolved); }
  catch { return resolved; }
}

const approvedWorkspaces = new Set([canonicalCwd(process.cwd())]);

export function validatedSessionId(id) {
  const value = String(id ?? '');
  if (!sessionIdPattern.test(value)) throw new Error('Invalid Claude session id.');
  return value;
}

export function approveWorkspace(cwd) {
  const approved = canonicalCwd(cwd);
  try {
    if (!fs.statSync(approved).isDirectory()) throw new Error('Workspace must be a directory.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  approvedWorkspaces.add(approved);
  return approved;
}

export function validatedSolutionKey(key) {
  const value = String(key ?? '');
  const first = value.indexOf('--'), last = value.lastIndexOf('--');
  if (first < 1 || last <= first + 2) throw new Error('Invalid solution key.');
  const slug = value.slice(0, first), rawTenant = value.slice(first + 2, last), id = value.slice(last + 2);
  const tenant = normalizeTenant(rawTenant);
  if (!solutionSlugPattern.test(slug) || solutionSlug(slug) !== slug || !tenant || tenant !== rawTenant || !solutionIdPattern.test(id)) {
    throw new Error('Invalid solution key.');
  }
  return value;
}

export function deriveSolutionHome(cwd, key) {
  validatedSolutionKey(key);
  return canonicalCwd(cwd);
}

function isWithin(file, base) {
  const relative = path.relative(base, file);
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function assertNoSymlinks(base, target) {
  const relative = path.relative(base, target);
  if (!isWithin(target, base)) throw new Error('Local path is outside its allowed base.');
  const parts = relative ? relative.split(path.sep) : [];
  let cursor = base;
  for (let index = -1; index < parts.length; index += 1) {
    if (index >= 0) cursor = path.join(cursor, parts[index]);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error(`Local path contains a symbolic link: ${cursor}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function solutionHomeForPath(target) {
  return [...approvedWorkspaces]
    .filter(workspace => isWithin(target, workspace))
    .sort((a, b) => b.length - a.length)[0] ?? null;
}

export function assertHome(home) {
  const target = path.resolve(String(home));
  for (const workspace of approvedWorkspaces) {
    if (target !== workspace) continue;
    assertNoSymlinks(workspace, target);
    return target;
  }
  throw new Error('Session home is not derived from an approved workspace.');
}

export function assertLocalPath(file, base) {
  const target = path.resolve(String(file));
  if (base !== undefined) {
    const allowedBase = assertLocalPath(base);
    if (!isWithin(target, allowedBase)) throw new Error('Local path is outside its allowed base.');
    assertNoSymlinks(allowedBase, target);
    return target;
  }
  if (isWithin(target, UA_HOME)) {
    assertNoSymlinks(UA_HOME, target);
    return target;
  }
  const solutionHome = solutionHomeForPath(target);
  if (solutionHome) {
    assertHome(solutionHome);
    assertNoSymlinks(solutionHome, target);
    return target;
  }
  throw new Error('Local path is outside UA_HOME and approved session homes.');
}

function permissionRoot(target) {
  if (isWithin(target, UA_HOME)) return UA_HOME;
  const home = solutionHomeForPath(target);
  if (!home) throw new Error('Local path has no private permission root.');
  return home;
}

function makePrivateDirectory(directory, boundary) {
  const relative = path.relative(boundary, directory);
  const parts = relative ? relative.split(path.sep) : [];
  const created = [];
  let cursor = boundary;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) created.push(cursor);
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (boundary === UA_HOME) fs.chmodSync(boundary, 0o700);
  for (const createdDirectory of created) fs.chmodSync(createdDirectory, 0o700);
}

export function processIsAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}

// A lock is held for one read and write of a small file, a few milliseconds. A lock with
// no process id that is older than this was left by a crash, not by a writer at work.
const EMPTY_LOCK_MAX_AGE_MS = 10_000;

/** True when the lock names a process that has since died: a crash mid-write leaves
 * this file behind forever otherwise, since nothing else ever removes it. A lock with no
 * process id comes from an older UnifyApps Headless, which left it empty, or from a writer that has
 * only just opened it; it counts as dead once it is too old to be the second. */
function lockIsDead(lock) {
  try {
    let saved = null;
    try { saved = JSON.parse(fs.readFileSync(lock, 'utf8')); } catch (error) { if (error?.code === 'ENOENT') throw error; }
    if (Number.isSafeInteger(saved?.pid)) return !processIsAlive(saved.pid);
    return Date.now() - fs.statSync(lock).mtimeMs > EMPTY_LOCK_MAX_AGE_MS;
  } catch (error) { return error?.code === 'ENOENT'; }
}

/** Runs `work` while holding `<file>.lock`, for one read-modify-write of a small
 * file. `work` must be synchronous: the lock is a blocking file lock, so a call
 * that yielded while holding it would stall every other call in this process.
 * Waits up to 5 seconds, clearing a lock whose process has died. */
export function withFileLock(file, work) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`, until = Date.now() + 5_000;
  let handle;
  while (handle === undefined) {
    try { handle = fs.openSync(lock, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (lockIsDead(lock)) { try { fs.unlinkSync(lock); } catch { /* another caller already cleared it */ } continue; }
      if (Date.now() > until) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
  fs.writeFileSync(handle, JSON.stringify({ pid: process.pid }));
  try { return work(); }
  finally { fs.closeSync(handle); fs.unlinkSync(lock); }
}

export function atomicFile(file, content) {
  const target = assertLocalPath(file);
  const directory = path.dirname(target);
  const boundary = permissionRoot(target);
  makePrivateDirectory(directory, boundary);
  assertLocalPath(target);
  const candidate = path.join(directory, `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  const checkedCandidate = assertLocalPath(candidate, directory);
  let descriptor;
  try {
    descriptor = fs.openSync(checkedCandidate, 'wx', 0o600);
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(checkedCandidate, target);
    fs.chmodSync(target, 0o600);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(checkedCandidate, { force: true });
  }
  return target;
}

export function readJsonFile(file, fallback) {
  const target = assertLocalPath(file);
  let source;
  try { source = fs.readFileSync(target, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
  try { return JSON.parse(source); }
  catch (error) { throw new Error(`Invalid JSON in ${target}: ${error.message}`, { cause: error }); }
}

/** Remove one file UnifyApps Headless wrote. It refuses a folder, so a wrong path can never take a
 * whole folder of someone's work with it; removeFolderSafe is the one way to do that. */
export function removeSafe(file) {
  const target = assertLocalPath(file);
  let stat;
  try { stat = fs.lstatSync(target); }
  catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  if (stat.isDirectory()) throw new Error(`Refusing to remove a folder as a file: ${target}`);
  fs.rmSync(target, { force: true });
}

/** Remove a folder that only UnifyApps Headless writes (acceptance receipts, an entity cache folder). */
export function removeFolderSafe(folder) {
  const target = assertLocalPath(folder);
  fs.rmSync(target, { recursive: true, force: true });
}
