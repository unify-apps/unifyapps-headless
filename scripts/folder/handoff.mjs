import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UaError, normalizeTenant, SOLUTION_ID } from '../lib/contracts.mjs';
import { parseEntityInput } from '../lib/entity-target.mjs';
import { UA_HOME } from '../lib/session-paths.mjs';
import { folderAssociations } from './folder-layout.mjs';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function handoffFolder(value) {
  const text = String(value ?? '').trim();
  if (text.startsWith('~/')) return path.join(os.homedir(), text.slice(2));
  if (path.isAbsolute(text)) return path.resolve(text);
  throw new UaError('USAGE', 'The folder must be an absolute path or start with ~/.');
}

export function folderHoldsSolution(folder) {
  try { return folderAssociations(folder).length > 0; }
  catch (error) { if (error?.code === 'FOLDER_CONTENT_CONFLICT') return true; throw error; }
}

// The Claude desktop app has no terminal, so the handoff message is worded for it.
export function claudeApp(env = process.env) {
  return env.CLAUDE_CODE_ENTRYPOINT === 'claude-desktop' ? 'desktop' : 'terminal';
}

// The file lives in the UnifyApps Headless home, keyed by the target folder, so nothing but
// the folder itself is written into a solution folder.
export function handoffFile(folder, home = UA_HOME) {
  let real = path.resolve(folder);
  try { real = fs.realpathSync(real); } catch {}
  const key = crypto.createHash('sha256').update(real).digest('hex').slice(0, 16);
  return path.join(home, 'handoffs', `${key}.json`);
}

export function writeHandoff(folder, body, home = UA_HOME) {
  const file = handoffFile(folder, home);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(file), 0o700);
  // A rename replaces a symlink at the target instead of writing through it.
  const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
}

export function validHandoffEntity(entity, tenant) {
  try { parseEntityInput(entity, tenant); return true; } catch { return false; }
}

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;

export const HANDOFF_REQUEST_MAX = 4000;
const claimFile = (file) => `${file}.claim`;
// Both paths come from handoffFile, under the given home, never from input;
// removeSafe would refuse a home other than this process's UA_HOME.
const removeOwn = (file) => { try { if (!fs.lstatSync(file).isDirectory()) fs.rmSync(file, { force: true }); } catch (error) { if (error?.code !== 'ENOENT') throw error; } };
const readClaim = (file) => { try { return JSON.parse(fs.readFileSync(claimFile(file), 'utf8')); } catch { return null; } };
// A file written before handoffs carried an id is told apart by its createdAt.
const identity = (raw) => ({ id: typeof raw?.id === 'string' ? raw.id : null, createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : null });
const sameHandoff = (a, b) => !!a && !!b && (a.id || b.id ? a.id === b.id : a.createdAt === b.createdAt);

// The file is data a person could edit, never instructions: only these fixed
// fields are read, each checked, and anything else in it is ignored. The answer
// names its state, so setup can tell a missing file from an expired, broken or
// claimed one. `claimed` means another session claimed it first.
export function readHandoff(folder, now = Date.now(), home = UA_HOME, sessionId = null) {
  const file = handoffFile(folder, home);
  if (!fs.existsSync(file)) return { state: 'missing' };
  const invalid = (reason) => ({ state: 'invalid', reason });
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return invalid('the file is not valid JSON'); }
  if (raw?.version !== 1) return invalid('the file has an unknown version');
  let tenant;
  try { tenant = normalizeTenant(raw.tenant); } catch { return invalid('the tenant is not valid'); }
  if (!tenant) return invalid('the tenant is not valid');
  const solutionId = text(raw.solutionId), solutionName = text(raw.solutionName);
  if (Boolean(solutionId) === Boolean(solutionName)) return invalid('it must name exactly one solution id or name');
  if (solutionId && !SOLUTION_ID.test(solutionId)) return invalid('the solution id is not valid');
  const created = Date.parse(raw.createdAt);
  if (!Number.isFinite(created) || now - created > MAX_AGE_MS || created - now > 60_000) return { state: 'expired' };
  const request = typeof raw.request === 'string' && raw.request.trim() ? raw.request.slice(0, HANDOFF_REQUEST_MAX) : null;
  const entity = text(raw.entity) && validHandoffEntity(text(raw.entity), tenant) ? text(raw.entity) : null;
  const { id } = identity(raw);
  const handoff = { tenant, ...(solutionId ? { solutionId } : { solutionName }), ...(entity ? { entity } : {}), ...(request ? { request } : {}),
    ...(request && raw.requestTruncated === true ? { requestTruncated: true } : {}), ...(id ? { id } : {}), createdAt: raw.createdAt };
  const claim = readClaim(file);
  if (claim && sameHandoff(claim, identity(raw)) && claim.sessionId !== sessionId) return { state: 'claimed', handoff, claimedBy: claim.sessionId ?? null };
  return { state: 'valid', handoff };
}

// One session wins: the claim file is created with O_EXCL, so a second session
// sees it already there. A claim left by an older handoff is replaced.
export function claimHandoff(folder, sessionId, now = Date.now(), home = UA_HOME) {
  const read = readHandoff(folder, now, home, sessionId);
  if (read.state !== 'valid') return read;
  const file = handoffFile(folder, home);
  const stale = readClaim(file);
  if (stale && !sameHandoff(stale, read.handoff)) removeOwn(claimFile(file));
  const body = { sessionId, ...identity(read.handoff), claimedAt: new Date(now).toISOString() };
  try { fs.writeFileSync(claimFile(file), `${JSON.stringify(body)}\n`, { mode: 0o600, flag: 'wx' }); }
  catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const claim = readClaim(file);
    if (claim?.sessionId !== sessionId) return { state: 'claimed', handoff: read.handoff, claimedBy: claim?.sessionId ?? null };
  }
  return { state: 'valid', handoff: read.handoff, claimed: true };
}

export function releaseHandoff(folder, sessionId, home = UA_HOME) {
  const file = handoffFile(folder, home);
  if (readClaim(file)?.sessionId !== sessionId) return false;
  removeOwn(claimFile(file));
  return true;
}

// The handoff this session claimed, or else the one it read; null when neither.
export function claimedHandoffIdentity(folder, sessionId, home = UA_HOME) {
  const claim = readClaim(handoffFile(folder, home));
  return claim?.sessionId === sessionId ? identity(claim) : null;
}

export function handoffIdentity(folder, home = UA_HOME) {
  const file = handoffFile(folder, home);
  if (!fs.existsSync(file)) return null;
  try { return identity(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return { broken: true }; }
}

// Removes the handoff only when it is still the one expected, so a newer
// handoff written for this folder in the meantime survives.
export function consumeHandoff(folder, expected, home = UA_HOME) {
  if (!expected) return false;
  const file = handoffFile(folder, home);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch {
    // A broken file read as broken when the command started is still that file.
    if (!expected.broken || !fs.existsSync(file)) return false;
    removeOwn(file); removeOwn(claimFile(file)); return true;
  }
  if (expected.broken || !sameHandoff(identity(raw), identity(expected))) return false;
  removeOwn(file);
  removeOwn(claimFile(file));
  return true;
}

// Once the record exists, a name in the file would create a second solution if
// the open after it fails and setup runs again, so the file names the id instead.
export function pinHandoff(folder, solutionId, home = UA_HOME) {
  const file = handoffFile(folder, home);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; }
  if (!raw?.solutionName) return;
  const { solutionName, ...rest } = raw;
  writeHandoff(folder, { ...rest, solutionId }, home);
}

