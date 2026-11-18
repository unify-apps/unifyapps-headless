// The shared Figma board cache: LOOPS_HOME/figma-cache/<fileKey>/<nodeId>/. LOOPS_HOME is resolved by the
// native-device-pool block: the LOOPS_HOME variable, else <UA_HOME>/loops (moved once from ~/.agentic-loops).
// One capture serves every run of the same frame; a rate limit is remembered so nobody retries within a day.
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, symlinkSync, lstatSync, readlinkSync, cpSync } from 'node:fs';
import path from 'node:path';
import { readJsonIfExists, writeJsonAtomic, writeFileAtomic } from './args.mjs';
import { readIhdr } from './png.mjs';
import { loopsHome as resolveLoopsHome } from '../../../native-device-pool/scripts/lib/home.mjs';

export const KINDS = { metadata: 'metadata.xml', screenshot: 'screenshot.png', 'design-context': 'design-context.md', asset: 'assets', export: 'exports' };
export const RATE_LIMIT_HOURS = 24;

export function loopsHome() { return resolveLoopsHome(); }
export function cacheRoot() { return path.join(loopsHome(), 'figma-cache'); }
const safe = (text) => String(text).replace(/[^\w.:-]/g, '_');
export function cacheDir(fileKey, nodeId) { return path.join(cacheRoot(), safe(fileKey), safe(nodeId)); }

function emptyMeta(fileKey, nodeId) {
  return { fileKey, nodeId, frameName: null, fetched: { metadata: null, screenshot: null, designContext: null, assets: null }, rateLimited: { designContext: null }, fileVersion: null };
}

export function readMeta(fileKey, nodeId) {
  return { ...emptyMeta(fileKey, nodeId), ...(readJsonIfExists(path.join(cacheDir(fileKey, nodeId), 'meta.json')) ?? {}) };
}

export function writeMeta(fileKey, nodeId, meta) {
  writeJsonAtomic(path.join(cacheDir(fileKey, nodeId), 'meta.json'), meta);
  return meta;
}

const sizeOf = (file) => (existsSync(file) ? statSync(file).size : null);
const listDir = (dir) => (existsSync(dir) ? readdirSync(dir).filter((name) => !name.startsWith('.')).sort() : []);

export function hoursSince(iso) {
  if (!iso) return null;
  const then = Date.parse(iso);
  return Number.isFinite(then) ? (Date.now() - then) / 3600000 : null;
}

export function status(fileKey, nodeId) {
  const dir = cacheDir(fileKey, nodeId);
  const meta = readMeta(fileKey, nodeId);
  const files = {
    metadata: sizeOf(path.join(dir, 'metadata.xml')),
    screenshot: sizeOf(path.join(dir, 'screenshot.png')),
    screenshotJson: readJsonIfExists(path.join(dir, 'screenshot.json')),
    designContext: sizeOf(path.join(dir, 'design-context.md')),
    assets: listDir(path.join(dir, 'assets')),
    exports: listDir(path.join(dir, 'exports')),
  };
  const since = hoursSince(meta.rateLimited?.designContext);
  return { dir, exists: existsSync(dir), meta, files, rateLimited: { designContext: meta.rateLimited?.designContext ?? null, hoursAgo: since, active: since !== null && since < RATE_LIMIT_HOURS } };
}

// Copies a captured file into the cache under its canonical name and stamps meta.json.
export function put(fileKey, nodeId, kind, file, { frameName, frameWidth, maxDimension, fileVersion, name } = {}) {
  if (!(kind in KINDS)) throw new Error(`unknown kind "${kind}"; one of ${Object.keys(KINDS).join(', ')}`);
  if (!existsSync(file)) throw new Error(`${file} does not exist`);
  const dir = cacheDir(fileKey, nodeId);
  mkdirSync(dir, { recursive: true });
  const target = kind === 'asset' || kind === 'export' ? path.join(dir, KINDS[kind], name ?? path.basename(file)) : path.join(dir, KINDS[kind]);
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  copyFileSync(file, tmp);
  rmSync(target, { force: true });
  cpSync(tmp, target);
  rmSync(tmp, { force: true });
  const meta = readMeta(fileKey, nodeId);
  const stampKey = { metadata: 'metadata', screenshot: 'screenshot', 'design-context': 'designContext', asset: 'assets', export: 'assets' }[kind];
  meta.fetched[stampKey] = new Date().toISOString();
  if (frameName) meta.frameName = frameName;
  if (fileVersion) meta.fileVersion = fileVersion;
  let extra = null;
  if (kind === 'screenshot') {
    const ihdr = readIhdr(target);
    extra = { maxDimension: maxDimension ?? null, pxWidth: ihdr?.width ?? null, pxHeight: ihdr?.height ?? null, pxPerPt: ihdr && frameWidth ? Number((ihdr.width / frameWidth).toFixed(4)) : null, frameWidth: frameWidth ?? null };
    writeJsonAtomic(path.join(dir, 'screenshot.json'), extra);
  }
  writeMeta(fileKey, nodeId, meta);
  return { target, size: sizeOf(target), extra };
}

export function recordRateLimit(fileKey, nodeId, what = 'designContext') {
  const meta = readMeta(fileKey, nodeId);
  meta.rateLimited ||= {};
  meta.rateLimited[what] = new Date().toISOString();
  mkdirSync(cacheDir(fileKey, nodeId), { recursive: true });
  return writeMeta(fileKey, nodeId, meta);
}

// <runDir>/board/figma -> the cache dir. A symlink when the file system allows it, otherwise a copy.
export function link(fileKey, nodeId, runDir) {
  const dir = cacheDir(fileKey, nodeId);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(path.join(dir, 'meta.json'))) writeMeta(fileKey, nodeId, readMeta(fileKey, nodeId));
  const target = path.join(runDir, 'board', 'figma');
  mkdirSync(path.dirname(target), { recursive: true });
  try {
    if (lstatSync(target, { throwIfNoEntry: false })) {
      if (lstatSync(target).isSymbolicLink() && readlinkSync(target) === dir) return { target, mode: 'symlink', existed: true };
      rmSync(target, { recursive: true, force: true });
    }
    symlinkSync(dir, target, 'dir');
    return { target, mode: 'symlink', existed: false };
  } catch {
    rmSync(target, { recursive: true, force: true });
    cpSync(dir, target, { recursive: true });
    return { target, mode: 'copy', existed: false };
  }
}

export function invalidate(fileKey, nodeId) {
  const dir = cacheDir(fileKey, nodeId);
  const existed = existsSync(dir);
  rmSync(dir, { recursive: true, force: true });
  return { dir, existed };
}

// The next cheapest Figma call, in the capture order the board follows.
export function nextCall(cacheStatus, { hasPng = false, hasCss = false, fontsUnknown = true } = {}) {
  const { files, rateLimited } = cacheStatus;
  if (!files.screenshot && !hasPng) return { call: 'get_screenshot', why: 'no screenshot and no PNG export: the board has nothing to look at' };
  if (!files.metadata) return { call: 'get_metadata', why: 'no metadata: the spec needs the frame tree (frame node only, never a section)' };
  if (!files.designContext && fontsUnknown && !hasCss) {
    if (rateLimited.active) return { call: null, why: `design context rate-limited ${rateLimited.hoursAgo.toFixed(1)} h ago; ask once for the CSS export instead` };
    return { call: 'get_design_context', why: 'fonts or colours unknown and no CSS export: one call, never retried within 24 h of a rate limit' };
  }
  return { call: null, why: files.designContext || hasCss ? 'board complete' : 'fonts known; no Figma call needed' };
}

export function writeText(file, text) { writeFileAtomic(file, text); }
