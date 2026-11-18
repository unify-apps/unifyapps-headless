/** Locked index for per-Claude-session workspace caches. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { UaError, normalizeTenant, STORAGES, TENANT_BINDING_HOLD_MS } from '../lib/contracts.mjs';
import {
  UA_HOME, approveWorkspace, assertHome, assertLocalPath, atomicFile, canonicalCwd,
  deriveSolutionHome, readJsonFile, solutionSlug, validatedSessionId, validatedSolutionKey,
} from '../lib/session-paths.mjs';

export { UA_HOME, canonicalCwd };

const registryFile = path.join(UA_HOME, 'sessions.json');
const lockFile = `${registryFile}.lock`;
const reapLockFile = `${lockFile}.reap`;
const idPattern = /^[A-Za-z0-9_-]{1,200}$/u;
const emptyRegistry = () => ({ version: 5, lastTenant: null, tenantMcpUrls: {}, tenantStorage: {}, tenantBindings: {}, sessions: {}, signIns: {}, workspaces: {} });
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function validatedEntityId(id) {
  const value = String(id ?? '');
  if (!idPattern.test(value)) throw new Error('Invalid solution id.');
  return value;
}

function validatedTenant(host) {
  const tenant = normalizeTenant(host);
  if (!tenant) throw new Error('A tenant host is required.');
  return tenant;
}

export function solutionKey(name, host, id) {
  return `${solutionSlug(name)}--${validatedTenant(host)}--${validatedEntityId(id)}`;
}

export function paths(cwd, key, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  const workspace = approveWorkspace(cwd);
  const home = assertHome(deriveSolutionHome(workspace, validatedSolutionKey(key)));
  const id = sessionId ? validatedSessionId(sessionId) : null;
  const sessionHome = id ? path.join(home, '.sessions', id) : null;
  return {
    root: UA_HOME,
    registry: registryFile,
    session: path.join(UA_HOME, 'session'),
    cookies: path.join(UA_HOME, 'session', 'cookies'),
    chromeProfile: path.join(UA_HOME, 'session', 'chrome-profile'),
    home,
    sessionHome,
    state: sessionHome ? path.join(sessionHome, 'state.json') : path.join(home, 'state.json'),
    records: path.join(home, 'records'),
    solutionRecord: path.join(home, 'records', 'solution.json'),
    specRecords: path.join(home, 'records', 'specs'),
    planRecords: path.join(home, 'records', 'plans'),
    specs: path.join(home, 'specs'),
    drafts: sessionHome ? path.join(sessionHome, 'drafts') : path.join(home, 'specs'),
    plans: path.join(home, 'plans'),
    memory: path.join(home, 'memory.md'),
    docs: path.join(home, 'docs'),
    features: path.join(home, 'docs', 'features'),
    acceptance: sessionHome ? path.join(sessionHome, 'acceptance') : path.join(home, 'acceptance'),
    checkpoint: sessionHome ? path.join(sessionHome, 'checkpoint.json') : path.join(home, 'checkpoint.json'),
    entities: path.join(home, 'entities'),
  };
}

function assertRecordedPath(entry, version = 3) {
  if (!path.isAbsolute(entry.cwd) || !path.isAbsolute(entry.path)) throw new Error('Invalid session registry path.');
  const key = solutionKey(entry.solutionName, entry.tenant, entry.solutionId);
  const expected = version === 1 ? path.join(canonicalCwd(entry.cwd), '.nebula', 'sessions', entry.sessionId)
    : version === 2 ? path.join(canonicalCwd(entry.cwd), 'UnifyApps Headless', `${entry.tenant}--${entry.solutionId}`)
      : version === 3 ? path.join(canonicalCwd(entry.cwd), 'UnifyApps Headless', key)
        : version === 4 ? path.join(canonicalCwd(entry.cwd), key)
          : deriveSolutionHome(entry.cwd, key);
  if (entry.path !== expected) throw new Error('Invalid session registry path.');
  const relative = path.relative(entry.cwd, entry.path);
  const expectedRelative = version === 1 ? path.join('.nebula', 'sessions', entry.sessionId)
    : version === 2 ? path.join('UnifyApps Headless', `${entry.tenant}--${entry.solutionId}`)
      : version === 3 ? path.join('UnifyApps Headless', key) : version === 4 ? key : '';
  if (relative !== expectedRelative) throw new Error('Invalid session registry path.');
  let cursor = entry.cwd;
  for (const part of relative ? relative.split(path.sep) : []) {
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Invalid session registry path: symbolic link.');
    } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) throw error; }
    cursor = path.join(cursor, part);
  }
  try {
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Invalid session registry path: symbolic link.');
  } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) throw error; }
}

/** `{ storage, missing, checkedAt }`: what the last lifecycle-type probe found on a tenant. */
function validatedStorageCheck(entry) {
  if (!plainObject(entry) || !STORAGES.includes(entry.storage) || !Array.isArray(entry.missing) ||
      entry.missing.some(type => typeof type !== 'string' || !type.trim()) ||
      typeof entry.checkedAt !== 'string' || !Number.isFinite(Date.parse(entry.checkedAt))) {
    throw new Error('Invalid tenant storage check.');
  }
  return { storage: entry.storage, missing: [...entry.missing], checkedAt: entry.checkedAt };
}

// A sign-in entry lives only until its session opens a solution, or for a day:
// a setup that stopped after the sign-in must not name that tenant for ever.
export const SIGN_IN_TTL_MS = 24 * 60 * 60 * 1000;

/** `{ cwd, tenant, at }`: a Claude session signed in to a tenant in a folder, with
 * no solution open yet. Expired and broken entries are dropped on read. */
function validatedSignIn({ sessionId, entry, now }) {
  if (!plainObject(entry)) throw new Error('Invalid sign-in entry.');
  validatedSessionId(sessionId);
  const tenant = validatedTenant(entry.tenant);
  if (entry.tenant !== tenant || typeof entry.cwd !== 'string' || !path.isAbsolute(entry.cwd)) throw new Error('Invalid sign-in entry fields.');
  const signedInAt = Date.parse(entry.at);
  if (typeof entry.at !== 'string' || !Number.isFinite(signedInAt)) throw new Error('Invalid sign-in timestamp.');
  if (now - signedInAt > SIGN_IN_TTL_MS) throw new Error('Expired sign-in entry.');
  return { cwd: entry.cwd, tenant, at: entry.at };
}

function validateEntry(index, entry, version) {
  if (!plainObject(entry)) throw new Error('Invalid session registry entry.');
  const sessionId = validatedSessionId(index);
  if (entry.sessionId !== undefined && entry.sessionId !== sessionId) throw new Error('Invalid session registry session id.');
  const tenant = validatedTenant(entry.tenant);
  const solutionId = validatedEntityId(entry.solutionId);
  const key = solutionKey(entry.solutionName, tenant, solutionId);
  const storedKey = version < 3 ? `${tenant}--${solutionId}` : key;
  if (entry.tenant !== tenant || entry.key !== undefined && entry.key !== storedKey) throw new Error('Invalid session registry solution key.');
  if (typeof entry.cwd !== 'string' || typeof entry.path !== 'string' || typeof entry.solutionName !== 'string') {
    throw new Error('Invalid session registry entry fields.');
  }
  if (typeof entry.lastUsedAt !== 'string' || !Number.isFinite(Date.parse(entry.lastUsedAt))) {
    throw new Error('Invalid session registry timestamp.');
  }
  if (entry.storage !== undefined && !STORAGES.includes(entry.storage)) throw new Error('Invalid session registry storage.');
  assertRecordedPath({ ...entry, sessionId }, version);
  return { ...entry, key, path: deriveSolutionHome(entry.cwd, key) };
}

function validateRegistry(value) {
  if (!plainObject(value) || ![1, 2, 3, 4, 5].includes(value.version) || !plainObject(value.sessions)) {
    throw new Error('Invalid sessions index.');
  }
  const tenantMcpUrls = value.tenantMcpUrls ?? {};
  if (!plainObject(tenantMcpUrls)) throw new Error('Invalid sessions index.');
  const workspaces = value.workspaces ?? {};
  if (!plainObject(workspaces)) throw new Error('Invalid sessions index workspaces.');
  if (value.lastTenant !== null && (typeof value.lastTenant !== 'string' || validatedTenant(value.lastTenant) !== value.lastTenant)) {
    throw new Error('Invalid sessions index last tenant.');
  }
  for (const [host, url] of Object.entries(tenantMcpUrls)) {
    if (validatedTenant(host) !== host || typeof url !== 'string' || !url.trim()) throw new Error('Invalid sessions index tenant MCP URL.');
  }
  const tenantStorage = value.tenantStorage ?? {};
  if (!plainObject(tenantStorage)) throw new Error('Invalid sessions index.');
  for (const [host, entry] of Object.entries(tenantStorage)) {
    if (validatedTenant(host) !== host) throw new Error('Invalid sessions index tenant storage.');
    validatedStorageCheck(entry);
  }
  // One session whose folder moved, or whose id no longer matches a valid pattern,
  // must never take down every other folder's commands: drop only that entry.
  const sessions = Object.fromEntries(Object.entries(value.sessions).flatMap(([id, entry]) => {
    try { return [[id, validateEntry(id, entry, value.version)]]; }
    catch { return []; }
  }));
  const storedSignIns = value.signIns ?? {};
  if (!plainObject(storedSignIns)) throw new Error('Invalid sessions index sign-ins.');
  const now = Date.now();
  const signIns = Object.fromEntries(Object.entries(storedSignIns).flatMap(([sessionId, entry]) => {
    try { return [[sessionId, validatedSignIn({ sessionId, entry, now })]]; }
    catch { return []; }
  }));
  // Same rule as a session: one bad binding is dropped, never fatal.
  const tenantBindings = plainObject(value.tenantBindings) ? Object.fromEntries(Object.entries(value.tenantBindings).flatMap(([folder, entry]) => {
    try { return [[folder, validatedBinding(folder, entry)]]; }
    catch { return []; }
  })) : {};
  return { ...value, version: 5, tenantMcpUrls, tenantStorage, tenantBindings, sessions, signIns, workspaces: {} };
}

/** `{ tenant, ownerSession, sessions, connectedAt, lastUsedAt }`: a folder connected to a tenant before any solution is open there. */
function validatedBinding(folder, entry) {
  if (!path.isAbsolute(folder) || !plainObject(entry) || !Array.isArray(entry.sessions)) throw new Error('Invalid tenant binding.');
  const tenant = validatedTenant(entry.tenant);
  const sessions = entry.sessions.map(id => validatedSessionId(id));
  for (const at of [entry.connectedAt, entry.lastUsedAt]) {
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) throw new Error('Invalid tenant binding timestamp.');
  }
  return { tenant, ownerSession: validatedSessionId(entry.ownerSession), sessions, connectedAt: entry.connectedAt, lastUsedAt: entry.lastUsedAt };
}

function readStoredRegistry() {
  return validateRegistry(readJsonFile(registryFile, emptyRegistry()));
}

export function readRegistry() {
  const stored = readStoredRegistry();
  return { ...stored, sessions: Object.fromEntries(Object.entries(stored.sessions).map(([id, entry]) => [id, enriched(id, entry)])) };
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}

function publishLock(file, token) {
  const target = assertLocalPath(file);
  const candidate = assertLocalPath(path.join(UA_HOME, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`));
  let descriptor;
  try {
    descriptor = fs.openSync(candidate, 'wx', 0o600);
    fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, createdAt: Date.now(), token }));
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    try { fs.linkSync(candidate, target); return true; }
    catch (error) { if (error?.code === 'EEXIST') return false; throw error; }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(candidate, { force: true });
  }
}

function releasePublishedLock(file, token) {
  try {
    const saved = JSON.parse(fs.readFileSync(assertLocalPath(file), 'utf8'));
    if (saved?.token === token && saved?.pid === process.pid) fs.unlinkSync(file);
  } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

function recoverDeadLock() {
  const reapToken = randomUUID();
  if (!publishLock(reapLockFile, reapToken)) return false;
  try {
    let lock;
    try { lock = JSON.parse(fs.readFileSync(assertLocalPath(lockFile), 'utf8')); }
    catch (error) {
      if (error?.code === 'ENOENT') return true;
      return false;
    }
    if (!plainObject(lock) || processIsAlive(lock.pid)) return false;
    try { fs.unlinkSync(lockFile); return true; }
    catch (error) { return error?.code === 'ENOENT'; }
  } finally { releasePublishedLock(reapLockFile, reapToken); }
}

function acquireLock() {
  assertLocalPath(UA_HOME);
  fs.mkdirSync(UA_HOME, { recursive: true, mode: 0o700 });
  assertLocalPath(UA_HOME);
  fs.chmodSync(UA_HOME, 0o700);
  const token = randomUUID();
  const deadline = Date.now() + 5_000;
  for (;;) {
    try {
      if (publishLock(lockFile, token)) return token;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    if (recoverDeadLock()) continue;
    if (Date.now() >= deadline) throw new Error('Timed out waiting for the sessions index lock.');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 8);
  }
}

function releaseLock(token) {
  releasePublishedLock(lockFile, token);
}

export function mutateRegistry(change) {
  const token = acquireLock();
  try {
    const current = readStoredRegistry();
    const result = change(current);
    validateRegistry(current);
    atomicFile(registryFile, `${JSON.stringify(current, null, 2)}\n`);
    return result;
  } finally { releaseLock(token); }
}

export function registerSession({ sessionId, cwd, tenant, solutionId, solutionName, storage = 'platform' }) {
  const id = validatedSessionId(sessionId);
  const host = validatedTenant(tenant);
  const entityId = validatedEntityId(solutionId);
  const name = String(solutionName ?? entityId);
  const key = solutionKey(name, host, entityId);
  const resolved = paths(cwd, key, id);
  // One entry per Claude session, so a session that moved to another folder
  // (see moveSessionHere) is bound to the new one and no longer to the old.
  return mutateRegistry(current => {
    if (resolved.sessionHome) fs.mkdirSync(resolved.sessionHome, { recursive: true, mode: 0o700 });
    assertHome(resolved.home);
    if (!STORAGES.includes(storage)) throw new Error('Invalid solution storage.');
    const stored = {
      path: resolved.home, cwd: canonicalCwd(cwd), tenant: host,
      solutionId: entityId, solutionName: name, lastUsedAt: new Date().toISOString(), storage,
    };
    current.sessions[id] = stored;
    // The solution row now names this session's tenant, so its sign-in entry is done.
    if (current.signIns) delete current.signIns[id];
    current.lastTenant = host;
    // The folder now holds a solution, and its session names the tenant from here on.
    if (current.tenantBindings) delete current.tenantBindings[stored.cwd];
    return { ...stored, key, sessionId: id };
  });
}

/**
 * A Claude session signed in to a tenant in a folder, before any solution is
 * open. The tenant bridges take their tenant from the folder's newest entry, so
 * this lists their tools while setup still runs, and a call made during setup
 * carries this session's id, and the solution only when the folder already holds
 * one on that tenant. It writes nothing into
 * the folder, binds no command or hook to it, and names no solution anywhere:
 * `sessions` keeps meaning "this folder holds this solution". `registerSession`
 * removes it when the solution row lands, and a read drops it after a day.
 */
export function registerSignIn({ sessionId, cwd, tenant }) {
  const validSessionId = validatedSessionId(sessionId);
  const host = validatedTenant(tenant);
  const folder = canonicalCwd(approveWorkspace(cwd));
  return mutateRegistry(current => {
    const signIn = { cwd: folder, tenant: host, at: new Date().toISOString() };
    // Expired entries are dropped on read; this write is where they leave the file.
    const expiresBefore = Date.now() - SIGN_IN_TTL_MS;
    const unexpired = Object.entries(current.signIns ?? {}).filter(([, entry]) => Date.parse(entry?.at) >= expiresBefore);
    current.signIns = { ...Object.fromEntries(unexpired), [validSessionId]: signIn };
    current.lastTenant = host;
    return { ...signIn, sessionId: validSessionId };
  });
}

/** The newest sign-in entry for this folder, or null. */
export function signInForFolder(cwd = process.cwd()) {
  const folder = canonicalCwd(cwd);
  // Newest first; two sign-ins in the same millisecond tie on `at`, and the later-written one wins.
  const [newestSessionId, newestSignIn] = Object.entries(readRegistry().signIns ?? {})
    .filter(([, entry]) => entry.cwd === folder)
    .reverse()
    .sort(([, a], [, b]) => b.at.localeCompare(a.at))[0] ?? [];
  return newestSignIn ? { sessionId: newestSessionId, ...newestSignIn } : null;
}

/**
 * A setup command run in another folder than the one this Claude session is
 * bound to means the session itself moved there: only the main session runs
 * setup, and the desktop app can move a session to another folder. When that
 * folder held the same solution, the session's own files (`.sessions/<id>/`:
 * state, drafts, questionnaires, receipts) come along, unless this folder
 * already has some. Answers the folder the session moved from, or null.
 */
export function moveSessionHere(sessionId, cwd, { tenant, solutionId }) {
  const id = validatedSessionId(sessionId);
  const workspace = approveWorkspace(cwd);
  const entry = readStoredRegistry().sessions[id];
  if (!entry || entry.cwd === workspace) return null;
  if (entry.tenant !== validatedTenant(tenant) || entry.solutionId !== solutionId) return entry.cwd;
  approveWorkspace(entry.cwd);
  const from = path.join(entry.path, '.sessions', id), to = path.join(workspace, '.sessions', id);
  if (!fs.existsSync(from) || fs.existsSync(to)) return entry.cwd;
  fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 });
  // Another disk cannot take a rename: the files stay, and the session starts fresh here.
  try { fs.renameSync(assertLocalPath(from), assertLocalPath(to)); }
  catch (error) { if (error?.code !== 'EXDEV') throw error; }
  return entry.cwd;
}

function enriched(sessionId, entry) {
  return { ...entry, key: solutionKey(entry.solutionName, entry.tenant, entry.solutionId), sessionId };
}

function available(sessionId, entry) {
  try {
    if (!fs.statSync(entry.cwd).isDirectory() || !fs.statSync(entry.path).isDirectory()) return false;
    assertRecordedPath({ ...entry, sessionId }, 5);
    const stateFile = path.join(entry.path, '.sessions', sessionId, 'state.json');
    if (fs.lstatSync(stateFile).isSymbolicLink()) return false;
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return state?.claudeSessionId === sessionId && state.tenant === entry.tenant && state.solutionId === entry.solutionId;
  } catch { return false; }
}

export function homeForCwd(cwd = process.cwd(), sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  if (!sessionId) return null;
  let id;
  try { id = validatedSessionId(sessionId); } catch { return null; }
  let workspace;
  try { workspace = approveWorkspace(cwd); } catch { return null; }
  const registry = readRegistry();
  const entry = registry.sessions[id];
  if (!entry || entry.cwd !== workspace || entry.path !== deriveSolutionHome(workspace, entry.key) || !available(id, entry)) return null;
  assertHome(entry.path);
  return { ...enriched(id, entry), home: entry.path, sessionHome: path.join(entry.path, '.sessions', id) };
}

export function solutionsForTenant(host) {
  const tenant = validatedTenant(host);
  const deduped = new Map();
  for (const [sessionId, stored] of Object.entries(readRegistry().sessions)) {
    const entry = enriched(sessionId, stored);
    if (entry.tenant !== tenant) continue;
    const previous = deduped.get(entry.key);
    if (!previous || entry.lastUsedAt > previous.lastUsedAt) deduped.set(entry.key, entry);
  }
  return [...deduped.values()].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt) || a.key.localeCompare(b.key)).map(entry => ({
    key: entry.key, id: entry.solutionId, name: entry.solutionName, tenant: entry.tenant,
    lastUsedAt: entry.lastUsedAt, lastUsed: entry.lastUsedAt, storage: entry.storage ?? 'platform', cwd: entry.cwd,
  }));
}

export function sessionsForSolution(host, id, { excludeSessionId } = {}) {
  const tenant = validatedTenant(host);
  const solutionId = validatedEntityId(id);
  return Object.entries(readRegistry().sessions)
    .map(([sessionId, entry]) => enriched(sessionId, entry))
    .filter(entry => entry.tenant === tenant && entry.solutionId === solutionId && entry.sessionId !== excludeSessionId)
    .map(entry => ({ ...entry, available: available(entry.sessionId, entry) }))
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt) || a.sessionId.localeCompare(b.sessionId));
}

// One working folder holds one solution, so the newest session opened here
// names the tenant. No Claude session id is needed, which keeps the answer
// right after /clear or /resume gives Claude a new id.
export function sessionForFolder(cwd = process.cwd()) {
  const folder = canonicalCwd(cwd);
  const newest = Object.entries(readRegistry().sessions)
    .filter(([, entry]) => entry.cwd === folder)
    .sort(([, a], [, b]) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0];
  return newest ? { sessionId: newest[0], ...newest[1] } : null;
}

/** The tenant a folder is connected to with no solution open, or null. */
export function tenantBindingFor(cwd = process.cwd()) {
  const folder = canonicalCwd(cwd);
  const binding = readStoredRegistry().tenantBindings[folder];
  return binding ? { folder, ...binding } : null;
}

/** A tenant-only session keeps its state (the current task) in `<bound folder>/.sessions/<sessionId>/`.
 * The folder holds no solution, so it is never rendered or refreshed as one. */
export function tenantOnlyHome(cwd = process.cwd(), sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  if (!sessionId) return null;
  let id;
  try { id = validatedSessionId(sessionId); } catch { return null; }
  const binding = tenantBindingFor(cwd);
  if (!binding) return null;
  const home = assertHome(approveWorkspace(binding.folder));
  return { home, sessionHome: path.join(home, '.sessions', id), tenant: binding.tenant };
}

/**
 * Connect a folder to a tenant before any solution exists, so questions can be
 * answered with read tools. A session on the same tenant joins the binding. Another
 * tenant may take the folder only after the binding sat unused for
 * TENANT_BINDING_HOLD_MS, and never while the folder holds a solution on another tenant.
 */
export function connectTenantBinding({ sessionId, cwd, tenant, now = Date.now() }) {
  const id = validatedSessionId(sessionId);
  const host = validatedTenant(tenant);
  const folder = approveWorkspace(cwd);
  return mutateRegistry(current => {
    current.tenantBindings ??= {};
    const solution = Object.values(current.sessions).filter(entry => entry.cwd === folder)
      .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0];
    if (solution && solution.tenant !== host) {
      throw new UaError('TENANT_BINDING_CONFLICT',
        `This folder holds the solution ${solution.solutionName} on ${solution.tenant}. Use that tenant here, or use another folder.`,
        { tenant: solution.tenant, solutionId: solution.solutionId });
    }
    const at = new Date(now).toISOString();
    const previous = current.tenantBindings[folder];
    let action = 'connected';
    if (previous?.tenant === host) action = 'joined';
    else if (previous) {
      if (now - Date.parse(previous.lastUsedAt) < TENANT_BINDING_HOLD_MS) {
        throw new UaError('TENANT_BINDING_CONFLICT', { tenant: previous.tenant, lastUsedAt: previous.lastUsedAt });
      }
      action = 'replaced';
    }
    const binding = action === 'joined'
      ? { ...previous, sessions: [...new Set([...previous.sessions, id])], lastUsedAt: at }
      : { tenant: host, ownerSession: id, sessions: [id], connectedAt: at, lastUsedAt: at };
    current.tenantBindings[folder] = binding;
    current.lastTenant = host;
    return { folder, action, ...(action === 'replaced' ? { replacedTenant: previous.tenant } : {}),
      ...(solution ? { solutionId: solution.solutionId } : {}), ...binding };
  });
}

/**
 * Refuse a solution open or create on `tenant` while another session that used the
 * folder within TENANT_BINDING_HOLD_MS holds it for another tenant: the rule
 * connectTenantBinding applies. registerSession removes the binding afterwards.
 */
export function assertTenantBindingFree({ sessionId, cwd, tenant, now = Date.now() }) {
  const binding = readStoredRegistry().tenantBindings[canonicalCwd(cwd)];
  if (!binding || binding.tenant === tenant) return;
  if ((binding.sessions ?? []).includes(sessionId)) return;
  if (!(now - Date.parse(binding.lastUsedAt) < TENANT_BINDING_HOLD_MS)) return;
  throw new UaError('TENANT_BINDING_CONFLICT', { tenant: binding.tenant, lastUsedAt: binding.lastUsedAt });
}

export function tenantForFolder(cwd = process.cwd()) {
  return sessionForFolder(cwd)?.tenant ?? null;
}

export function readConfig() {
  const { lastTenant, tenantMcpUrls, tenantStorage } = readRegistry();
  return { lastTenant, tenantMcpUrls: { ...tenantMcpUrls }, tenantStorage: structuredClone(tenantStorage) };
}

export function writeConfig(patch = {}, { beforeWrite } = {}) {
  return mutateRegistry(current => {
    // Check ownership after acquiring the same lock used by workspace handoffs.
    beforeWrite?.();
    if (Object.hasOwn(patch, 'lastTenant')) current.lastTenant = patch.lastTenant === null ? null : validatedTenant(patch.lastTenant);
    if (patch.tenantMcpUrls !== undefined) {
      if (!plainObject(patch.tenantMcpUrls)) throw new Error('Invalid tenant MCP URL settings.');
      for (const [host, url] of Object.entries(patch.tenantMcpUrls)) {
        const tenant = validatedTenant(host);
        if (typeof url !== 'string' || !url.trim()) throw new Error('Invalid tenant MCP URL.');
        current.tenantMcpUrls[tenant] = url;
      }
    }
    if (patch.tenantStorage !== undefined) {
      if (!plainObject(patch.tenantStorage)) throw new Error('Invalid tenant storage settings.');
      for (const [host, entry] of Object.entries(patch.tenantStorage)) current.tenantStorage[validatedTenant(host)] = validatedStorageCheck(entry);
    }
    return { lastTenant: current.lastTenant, tenantMcpUrls: { ...current.tenantMcpUrls }, tenantStorage: structuredClone(current.tenantStorage) };
  });
}
