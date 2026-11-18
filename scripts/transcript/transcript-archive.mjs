/** Pack one Claude session's transcript — its own `.jsonl` plus the folder holding
 * its subagents — into a single archive, and upload it to the tenant's file store.
 * Nothing else in the project folder is read: the sibling `.jsonl` files belong to
 * other sessions. Also downloads an uploaded file again, so a sender can compare
 * hashes. No output; the caller reports. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tenantFetch } from '../platform/tenant-fetch.mjs';
import { UaError, normalizeTenant } from '../lib/contracts.mjs';
import { redactSecrets } from '../lib/redact-secrets.mjs';

const DOWNLOAD_PATH = '/api/file/download/';
const TRANSFER_TIMEOUT_MS = 120_000;

const have = (command) => {
  try { execFileSync('command', ['-v', command], { shell: true, stdio: 'ignore' }); return true; }
  catch { return false; }
};

/** Every file the archive will carry, as archive-relative paths. */
function memberFiles(folder, members) {
  const found = [];
  const walk = (relative) => {
    const absolute = path.join(folder, relative);
    let stat;
    try { stat = fs.lstatSync(absolute); } catch { return; }
    if (stat.isSymbolicLink()) return;
    if (stat.isFile()) { found.push(relative); return; }
    if (!stat.isDirectory()) return;
    for (const name of fs.readdirSync(absolute).sort()) walk(path.join(relative, name));
  };
  for (const member of members) walk(member);
  return found;
}

/**
 * Build the archive for `sessionId` under `folder` (the Claude project log folder).
 * Returns `null` when the session has no transcript file.
 * `zip` keeps the familiar format; `tar -czf` is the fallback where zip is absent.
 */
export function packTranscript(folder, sessionId, destinationFolder) {
  if (!/^[A-Za-z0-9_-]+$/u.test(String(sessionId ?? ''))) throw new UaError('USAGE', 'Invalid Claude session id.');
  const transcript = `${sessionId}.jsonl`;
  if (!fs.existsSync(path.join(folder, transcript))) return null;
  const members = [transcript, ...(fs.existsSync(path.join(folder, sessionId)) ? [sessionId] : [])];
  const files = memberFiles(folder, members);
  const zip = have('zip');
  const name = `transcript-${sessionId}.${zip ? 'zip' : 'tar.gz'}`;
  fs.mkdirSync(destinationFolder, { recursive: true, mode: 0o700 });
  const file = path.join(destinationFolder, name);
  fs.rmSync(file, { force: true });
  // The archive is built from a redacted copy, so no cookie or key in the logs is uploaded.
  const staging = fs.mkdtempSync(path.join(destinationFolder, '.redacted-'));
  try {
    for (const relative of files) {
      const target = path.join(staging, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      const content = fs.readFileSync(path.join(folder, relative));
      // Any text file can quote a secret (subagent .json metadata too); only binary files are copied as they are.
      if (content.includes(0)) fs.writeFileSync(target, content, { mode: 0o600 });
      else fs.writeFileSync(target, redactSecrets(content.toString('utf8')), { mode: 0o600 });
    }
    const staged = members.filter((member) => fs.existsSync(path.join(staging, member)));
    // Every path is relative to the staging folder, which sits inside the
    // archive's folder. GNU tar (the one Git for Windows puts on PATH) reads an
    // archive name like `C:\Users\…` as `host:file` on a remote machine and
    // fails, so a Windows drive letter must never reach it. stderr is kept so a
    // failure says why instead of only "Command failed".
    const archive = path.relative(staging, file);
    const run = { cwd: staging, stdio: ['ignore', 'ignore', 'pipe'] };
    if (zip) execFileSync('zip', ['-q', '-r', '-X', archive, ...staged], run);
    else execFileSync('tar', ['-czf', archive, ...staged], run);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  const bytes = fs.statSync(file).size;
  const sha256 = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return { file, name, format: zip ? 'zip' : 'tar.gz', bytes, sha256, files };
}

/** The file field a `nebula_session` record carries for an uploaded file, in the
 * shape the platform's own uploader writes. */
export function uploadedFileField(reference, { name, bytes, fileType, mimeType }) {
  return {
    name, url: reference.url ?? '', ...(reference.location ? { source: reference.location } : {}),
    sourceType: 'CLOUD_STORAGE', fileType, mimeType, size: bytes, progress: 100, isUploaded: true, type: 'FILE',
  };
}

const fakeFiles = () => path.join(process.env.UA_HOME ?? '.', 'session', 'fake', 'files');
let fakeUploads = 0;
function fakeUpload(tenant, file, name) {
  const failAfter = process.env.UA_FAKE_UPLOAD_FAIL_AFTER;
  if (failAfter !== undefined && fakeUploads >= Number(failAfter)) throw new UaError('PLATFORM_UNREACHABLE', undefined, { host: tenant });
  fakeUploads++;
  fs.mkdirSync(fakeFiles(), { recursive: true });
  const target = path.join(fakeFiles(), name);
  fs.copyFileSync(file, target);
  const damage = process.env.UA_FAKE_UPLOAD_DAMAGE;
  if (damage === 'cut') fs.truncateSync(target, Math.floor(fs.statSync(target).size * 0.9));
  if (damage === 'flip') { const bytes = fs.readFileSync(target); bytes[0] ^= 0xff; fs.writeFileSync(target, bytes); }
  return { url: `/api/file/download/${name}`, location: `fake://${tenant}/${name}` };
}

/**
 * `POST /api/file/upload-file`, multipart field `file` — the same call the platform's
 * own attachment upload makes. Answers `{url, location}`; the url is the
 * `/api/file/download/<path>` reference that resolves to a signed download.
 */
export async function uploadFile(host, file, name) {
  const tenant = normalizeTenant(host);
  if (process.env.UA_FAKE === '1') return fakeUpload(tenant, file, name);
  const form = new FormData();
  form.set('file', new Blob([fs.readFileSync(file)], { type: 'application/octet-stream' }), name);
  let response;
  try {
    response = await tenantFetch(tenant, '/api/file/upload-file', {
      method: 'POST', signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS), body: form,
    });
  } catch (error) {
    if (error instanceof UaError) throw error;
    throw new UaError('PLATFORM_UNREACHABLE', undefined, { host: tenant });
  }
  if (response.status === 401 || response.status === 403) throw new UaError('AUTH_EXPIRED', undefined, { host: tenant });
  if (!response.ok) throw Object.assign(new Error(`upload-file returned HTTP ${response.status}`), { httpStatus: response.status });
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  const url = typeof payload?.url === 'string' ? payload.url : null;
  const location = typeof payload?.location === 'string' ? payload.location : null;
  if (!url && !location) throw new Error('upload-file returned no file reference.');
  return { ...(url ? { url } : {}), ...(location ? { location } : {}) };
}

/**
 * Downloads an uploaded file to `file`, streaming, and answers its size and sha256.
 * The tenant answers with a redirect to a signed storage address; the cookie stays on the tenant.
 */
export async function downloadFile(host, url, file) {
  const tenant = normalizeTenant(host);
  if (!String(url ?? '').startsWith(DOWNLOAD_PATH)) throw new UaError('PLATFORM_UNREACHABLE', 'The file reference is not a tenant file.', { host: tenant });
  let body;
  if (process.env.UA_FAKE === '1') body = fs.createReadStream(path.join(fakeFiles(), path.basename(url)));
  else {
    let response;
    try {
      response = await tenantFetch(tenant, url, { redirect: 'manual', signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS) });
      const location = response.headers.get('location');
      if (location) {
        if (!location.startsWith('https://')) throw new UaError('PLATFORM_UNREACHABLE', 'The file redirect is not https.', { host: tenant });
        response = await fetch(location, { signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS) });
      }
    } catch (error) {
      if (error instanceof UaError) throw error;
      throw new UaError('PLATFORM_UNREACHABLE', undefined, { host: tenant });
    }
    if (response.status === 401 || response.status === 403) throw new UaError('AUTH_EXPIRED', undefined, { host: tenant });
    if (!response.ok || !response.body) throw new UaError('PLATFORM_UNREACHABLE', `The file download answered HTTP ${response.status}.`, { host: tenant });
    body = Readable.fromWeb(response.body);
  }
  const hash = createHash('sha256');
  let bytes = 0;
  const tally = new Transform({ transform(chunk, _encoding, done) { hash.update(chunk); bytes += chunk.length; done(null, chunk); } });
  try { await pipeline(body, tally, fs.createWriteStream(file, { mode: 0o600 })); }
  catch (error) {
    if (error instanceof UaError || ['ENOSPC', 'EDQUOT', 'EFBIG', 'EIO', 'EROFS', 'EACCES'].includes(error?.code)) throw error;
    throw new UaError('PLATFORM_UNREACHABLE', undefined, { host: tenant });
  }
  return { bytes, sha256: hash.digest('hex') };
}
