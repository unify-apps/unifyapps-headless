#!/usr/bin/env node
// The per-solution profile the loops read: the app, its Figma file, the device and scaling rule, the
// visual check pass limit, the publish policy and the test users. The app is a MOBILE app on a simulator (402 pt phone,
// the design scaled to it, a deep link into the Preview app). It lives in <solution>/.nebula/loops/profile.json (a profile
// an older loops plugin left in <solution>/.agentic-loops/ is moved there on first read) and, in a folder under
// git, is kept out through .git/info/exclude, never through .gitignore (that file belongs to the team).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const PROFILE_DIR = path.join('.nebula', 'loops');
export const LEGACY_PROFILE_DIR = '.agentic-loops';
export const PROFILE_FILE = 'profile.json';
export const DEFAULT_BUNDLE_ID = 'com.unifyapps.matrix';
export const PUBLISH_POLICIES = ['ask', 'draft-only', 'publish-on-pass'];
// Approvals a solution may answer once, in advance. A release approval (publish, write-back, delete) is never listed.
export const PREAPPROVABLE = ['settings', 'plan'];
// Keys an older profile may lack: a missing one is not a violation, and a present one is checked.
export const OPTIONAL_KEYS = ['fixtures'];
export const DEVICE_PROFILES = ['release'];
export const FONT_ROUNDING = ['whole', 'half', 'none'];
export const APP_TYPES = ['MOBILE', 'WEB'];

const HELP = `profile — the solution folder's .nebula/loops/profile.json.

Usage
  node profile.mjs init     [--dir <folder>] [--from-json <file>] [--set k=v ...] [--force] [--json]
  node profile.mjs get      [--dir <folder>] [<dotted.key>] [--json]
  node profile.mjs set      [--dir <folder>] k=v [k=v ...] [--json]
  node profile.mjs validate [--dir <folder>] [--json]

Commands
  init      Write a new profile: defaults, then --from-json, then every --set. Refuses to overwrite one
            unless --force. Adds ".nebula/loops/" to .git/info/exclude when the folder is in a git repo.
            Every command first moves a legacy .agentic-loops/profile.json to .nebula/loops/ (once).
  get       Print the profile, or one value by dotted key (app.endpoint).
  set       Change values by dotted key. A value parses as JSON when it can (5, true, null, {...});
            anything else is a string. Quote a JSON string to force one: app.name='"123"'.
  validate  List every violation, one per line. Exit 1 when there is any.

Derived values
  app.deepLink      matrix://open?url=<app.endpoint, URL-encoded> — the platform's preview-link shape — when it
                    is null or still equals the link built from the previous endpoint.
  scaling.factor    device.widthPt / scaling.figmaFrameWidth (402/440 = 0.9136) when null.

Options
  --dir <folder>    The solution folder. Default: the current folder.
  --json            Print the result as JSON ({file, profile} or {ok, violations}).

Exit codes: 0 ok, 1 a violation or a refused write, 2 usage.`;

export function defaultProfile() {
  return {
    version: 1,
    tenant: null,
    solution: { id: null, name: null },
    app: { id: null, name: null, type: 'MOBILE', endpoint: null, deepLink: null, bundleId: DEFAULT_BUNDLE_ID },
    figma: { fileKey: null, pages: {} },
    device: { model: 'iPhone 16 Pro', widthPt: 402, heightPt: 874, scale: 3, runtime: null },
    scaling: { figmaFrameWidth: 440, factor: null, grid: 4, fontRound: 'whole', textCapTrim: true, smallBelow: 7 },
    loop: { maxPasses: 4, deviceProfile: 'release', preApproved: [] },
    publish: { policy: 'ask', versionLabel: null },
    testUsers: { withData: null, empty: null },
    evaluate: { pageVarsExpr: null },
    preferredDevice: { udid: null },
    fixtures: { recordMissingField: null, recordFreshData: null },
    createdAt: null,
    updatedAt: null,
  };
}

/** The platform's preview-link shape: matrix://open plus a URL-encoded url param. */
export function buildDeepLink(endpoint) {
  return `matrix://open?${new URLSearchParams({ url: endpoint }).toString()}`;
}

export function profilePath(dir) {
  return path.join(path.resolve(dir), PROFILE_DIR, PROFILE_FILE);
}

/**
 * Moves <dir>/.agentic-loops/profile.json to <dir>/.nebula/loops/profile.json once: only when the old file
 * exists and the new one does not. The old folder goes too when nothing else is left in it.
 */
export function migrateLegacyProfile(dir) {
  const from = path.join(path.resolve(dir), LEGACY_PROFILE_DIR, PROFILE_FILE);
  const to = profilePath(dir);
  if (!fs.existsSync(from) || fs.existsSync(to)) return null;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  try { fs.rmdirSync(path.dirname(from)); } catch { /* other files stay where they are */ }
  return { from, to };
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isTextOrNull = (value) => value === null || typeof value === 'string';
const isPositive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isHttpUrl = (value) => { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } };
const isIso = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const UUID = /^[0-9A-F]{8}-(?:[0-9A-F]{4}-){3}[0-9A-F]{12}$/iu;
const NODE_ID = /^\d+[:-]\d+$/u;

/** Every violation as "key: what is wrong". An empty list means the profile is valid. */
export function validateProfile(profile) {
  const out = [];
  const fail = (key, why) => out.push(`${key}: ${why}`);
  if (!isObject(profile)) return ['profile: must be a JSON object'];
  const known = Object.keys(defaultProfile());
  for (const key of Object.keys(profile)) if (!known.includes(key)) fail(key, 'unknown key');
  for (const key of known) if (!(key in profile) && !OPTIONAL_KEYS.includes(key)) fail(key, 'missing');
  const section = (name) => (isObject(profile[name]) ? profile[name] : (fail(name, 'must be an object'), {}));
  if (profile.version !== 1) fail('version', 'must be 1');
  if (!isText(profile.tenant) || !/^[a-z0-9.-]+$/iu.test(profile.tenant)) fail('tenant', 'must be the tenant host, for example acme.example.com');
  const solution = section('solution');
  if (!isText(solution.id)) fail('solution.id', 'must be the solution id');
  if (!isTextOrNull(solution.name)) fail('solution.name', 'must be a string or null');
  const app = section('app');
  if (!isText(app.id)) fail('app.id', 'must be the app id');
  if (!isTextOrNull(app.name)) fail('app.name', 'must be a string or null');
  if (!APP_TYPES.includes(app.type)) fail('app.type', `must be ${APP_TYPES.join(' or ')}`);
  if (app.endpoint !== null && !isHttpUrl(app.endpoint)) fail('app.endpoint', 'must be an http(s) URL or null');
  if (app.deepLink !== null && !(typeof app.deepLink === 'string' && app.deepLink.startsWith('matrix://open?url='))) fail('app.deepLink', 'must start with matrix://open?url= or be null');
  if (!isText(app.bundleId)) fail('app.bundleId', `must be the Preview app bundle id (${DEFAULT_BUNDLE_ID})`);
  const figma = section('figma');
  if (!isTextOrNull(figma.fileKey)) fail('figma.fileKey', 'must be the Figma file key or null');
  if (!isObject(figma.pages)) fail('figma.pages', 'must be an object of page slug → {nodeId, sections}');
  else for (const [slug, page] of Object.entries(figma.pages)) {
    if (!isObject(page)) { fail(`figma.pages.${slug}`, 'must be {nodeId, sections}'); continue; }
    if (!(typeof page.nodeId === 'string' && NODE_ID.test(page.nodeId))) fail(`figma.pages.${slug}.nodeId`, 'must look like 11853:279124');
    if (!isObject(page.sections)) fail(`figma.pages.${slug}.sections`, 'must be an object');
  }
  const device = section('device');
  if (!isText(device.model)) fail('device.model', 'must name the simulator model');
  for (const key of ['widthPt', 'heightPt', 'scale']) if (!isPositive(device[key])) fail(`device.${key}`, 'must be a positive number');
  if (!isTextOrNull(device.runtime)) fail('device.runtime', 'must be the iOS runtime (iOS 18.6) or null');
  const scaling = section('scaling');
  if (!isPositive(scaling.figmaFrameWidth)) fail('scaling.figmaFrameWidth', 'must be the Figma frame width in px');
  if (!(isPositive(scaling.factor) && scaling.factor <= 3)) fail('scaling.factor', 'must be a number between 0 and 3 (device width / frame width)');
  if (!(Number.isInteger(scaling.grid) && scaling.grid > 0)) fail('scaling.grid', 'must be a positive integer (points)');
  if (!FONT_ROUNDING.includes(scaling.fontRound)) fail('scaling.fontRound', `must be one of ${FONT_ROUNDING.join(', ')}`);
  if (typeof scaling.textCapTrim !== 'boolean') fail('scaling.textCapTrim', 'must be true or false');
  if (!(typeof scaling.smallBelow === 'number' && scaling.smallBelow >= 0)) fail('scaling.smallBelow', 'must be a number of points');
  const loop = section('loop');
  if (!(Number.isInteger(loop.maxPasses) && loop.maxPasses >= 1 && loop.maxPasses <= 20)) fail('loop.maxPasses', 'must be an integer from 1 to 20');
  if (!DEVICE_PROFILES.includes(loop.deviceProfile)) fail('loop.deviceProfile', `must be one of ${DEVICE_PROFILES.join(', ')}`);
  if (loop.preApproved !== undefined && !(Array.isArray(loop.preApproved) && loop.preApproved.every((id) => PREAPPROVABLE.includes(id)))) {
    fail('loop.preApproved', `must be a list of ${PREAPPROVABLE.join(', ')}`);
  }
  const publish = section('publish');
  if (!PUBLISH_POLICIES.includes(publish.policy)) fail('publish.policy', `must be one of ${PUBLISH_POLICIES.join(', ')}`);
  if (!isTextOrNull(publish.versionLabel)) fail('publish.versionLabel', 'must be a string or null');
  const users = section('testUsers');
  for (const key of ['withData', 'empty']) if (!isTextOrNull(users[key])) fail(`testUsers.${key}`, 'must be a user name or null');
  if (!isTextOrNull(section('evaluate').pageVarsExpr)) fail('evaluate.pageVarsExpr', 'must be an expression string or null');
  const preferred = section('preferredDevice');
  if (preferred.udid !== null && !(typeof preferred.udid === 'string' && UUID.test(preferred.udid))) fail('preferredDevice.udid', 'must be a simulator UDID or null');
  if (profile.fixtures !== undefined) {
    const fixtures = section('fixtures');
    for (const [key, value] of Object.entries(fixtures)) {
      const id = isObject(value) && !Array.isArray(value) ? value.id : value;
      const purposeOk = !isObject(value) || value.purpose === undefined || typeof value.purpose === 'string';
      if (!(value === null || (typeof id === 'string' && /^\S+$/u.test(id) && purposeOk))) fail(`fixtures.${key}`, 'must be a record id without spaces, {id, purpose}, or null');
    }
  }
  for (const key of ['createdAt', 'updatedAt']) if (!isIso(profile[key])) fail(key, 'must be an ISO date');
  return out;
}

export function getPath(target, dotted) {
  return dotted.split('.').reduce((value, key) => (isObject(value) ? value[key] : undefined), target);
}

export function setPath(target, dotted, value) {
  const keys = dotted.split('.');
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    if (!isObject(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
}

export function parseValue(raw) {
  try { return JSON.parse(raw); } catch { return raw; }
}

export function parseAssignment(text) {
  const equal = text.indexOf('=');
  if (equal <= 0) throw new UsageError(`"${text}" is not key=value`);
  return [text.slice(0, equal).trim(), parseValue(text.slice(equal + 1))];
}

function deepMerge(base, extra) {
  if (!isObject(extra)) return base;
  for (const [key, value] of Object.entries(extra)) {
    base[key] = isObject(value) && isObject(base[key]) ? deepMerge(base[key], value) : value;
  }
  return base;
}

/** Fills the values that follow from others. `previousEndpoint` tells a re-derivation apart from a link the person set. */
export function derive(profile, { previousEndpoint = null } = {}) {
  const app = profile.app ?? {};
  const staleLink = previousEndpoint && app.deepLink === buildDeepLink(previousEndpoint);
  if (app.endpoint && (app.deepLink === null || app.deepLink === undefined || staleLink)) app.deepLink = buildDeepLink(app.endpoint);
  const scaling = profile.scaling ?? {};
  if ((scaling.factor === null || scaling.factor === undefined) && isPositive(profile.device?.widthPt) && isPositive(scaling.figmaFrameWidth)) {
    scaling.factor = Number((profile.device.widthPt / scaling.figmaFrameWidth).toFixed(4));
  }
  return profile;
}

export function readProfile(dir) {
  migrateLegacyProfile(dir);
  const file = profilePath(dir);
  if (!fs.existsSync(file)) throw new UsageError(`${file} does not exist; run profile.mjs init first`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeProfile(dir, profile) {
  const file = profilePath(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(profile, null, 2)}\n`);
  fs.renameSync(temp, file);
  return file;
}

/** Adds ".nebula/loops/" to the repo's info/exclude. Returns what it did; a folder outside git is left alone. */
export function excludeFromGit(dir) {
  const found = spawnSync('git', ['-C', path.resolve(dir), 'rev-parse', '--git-path', 'info/exclude'], { encoding: 'utf8' });
  if (found.status !== 0) return { git: false, file: null, added: false };
  const file = path.resolve(dir, found.stdout.trim());
  let content = '';
  try { content = fs.readFileSync(file, 'utf8'); } catch { /* a fresh repo has no exclude file yet */ }
  const lines = content.split(/\r?\n/u).map((line) => line.trim());
  const entry = PROFILE_DIR.split(path.sep).join('/');
  if (lines.includes(`${entry}/`) || lines.includes(entry) || lines.includes('.nebula/') || lines.includes('.nebula')) return { git: true, file, added: false };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${content && !content.endsWith('\n') ? '\n' : ''}${entry}/\n`);
  return { git: true, file, added: true };
}

export class UsageError extends Error {}
export class ValidationError extends Error {
  constructor(violations) {
    super(violations.join('\n'));
    this.violations = violations;
  }
}

export function init(dir, { fromJson = null, sets = [], force = false, now = () => new Date() } = {}) {
  migrateLegacyProfile(dir);
  const file = profilePath(dir);
  if (fs.existsSync(file) && !force) throw new UsageError(`${file} exists; use "set" to change it, or init --force to replace it`);
  const profile = defaultProfile();
  if (fromJson) deepMerge(profile, JSON.parse(fs.readFileSync(fromJson, 'utf8')));
  for (const [key, value] of sets) setPath(profile, key, value);
  derive(profile);
  const stamp = now().toISOString();
  profile.createdAt = profile.createdAt ?? stamp;
  profile.updatedAt = stamp;
  const violations = validateProfile(profile);
  if (violations.length) throw new ValidationError(violations);
  writeProfile(dir, profile);
  return { file, profile, git: excludeFromGit(dir) };
}

export function set(dir, sets, { now = () => new Date() } = {}) {
  const profile = readProfile(dir);
  const previousEndpoint = profile.app?.endpoint ?? null;
  for (const [key, value] of sets) setPath(profile, key, value);
  derive(profile, { previousEndpoint });
  profile.updatedAt = now().toISOString();
  const violations = validateProfile(profile);
  if (violations.length) throw new ValidationError(violations);
  writeProfile(dir, profile);
  return { file: profilePath(dir), profile, git: excludeFromGit(dir) };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      dir: { type: 'string' }, 'from-json': { type: 'string' }, set: { type: 'string', multiple: true },
      force: { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    },
  });
  const [command, ...rest] = positionals;
  if (values.help || !command) { console.log(HELP); return; }
  const dir = path.resolve(values.dir ?? process.cwd());
  const report = (result) => {
    if (values.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`${result.file}${result.git?.added ? ` (added ${PROFILE_DIR}/ to ${result.git.file})` : ''}`);
  };
  if (command === 'init') {
    report(init(dir, { fromJson: values['from-json'] ?? null, sets: (values.set ?? []).map(parseAssignment), force: Boolean(values.force) }));
    return;
  }
  if (command === 'get') {
    const profile = readProfile(dir);
    const value = rest[0] ? getPath(profile, rest[0]) : profile;
    console.log(typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2));
    return;
  }
  if (command === 'set') {
    if (!rest.length) throw new UsageError('set needs at least one key=value');
    report(set(dir, rest.map(parseAssignment)));
    return;
  }
  if (command === 'validate') {
    const violations = validateProfile(readProfile(dir));
    if (values.json) console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2));
    else console.log(violations.length ? violations.join('\n') : `profile ok: ${profilePath(dir)}`);
    process.exitCode = violations.length ? 1 : 0;
    return;
  }
  throw new UsageError(`Unknown command "${command}". Run with --help.`);
}

// Compare real paths: Node resolves the main module through symlinks (~/.claude/skills links), argv[1] does not.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch((error) => {
    if (process.argv.includes('--json')) console.log(JSON.stringify({ ok: false, error: error.message, violations: error.violations ?? [] }));
    else console.error(error.message);
    process.exit(error instanceof UsageError ? (error.message.startsWith('Unknown command') || error.message.includes('key=value') ? 2 : 1) : 1);
  });
}
