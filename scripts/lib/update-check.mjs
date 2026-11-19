// Is this copy of UnifyApps Headless out of date, and must it update?
//
// Every GitHub Release carries a `release.json`:
//   { "version": "0.0.7", "minRequiredVersion": "0.0.6", "message": "..." }
// The one in the release GitHub marks Latest is always at RELEASE_URL. A copy
// older than `version` may update; one older than `minRequiredVersion` must,
// and the tenant bridge refuses tool calls until it does (UPDATE_REQUIRED).
//
// The answer is cached in UA_HOME for CHECK_EVERY_MS, so a session start or a
// tool call costs no download most of the time. The download sends nothing
// about the person or the machine. When GitHub cannot be reached the check
// passes: an offline person is never locked out.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UA_HOME } from './session-paths.mjs';
import { compareVersions, parseVersion, REPO } from '../release/versions.mjs';

export const RELEASE_URL = `https://github.com/${REPO}/releases/latest/download/release.json`;
export const CHECK_EVERY_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;
const PLUGIN_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const cacheFile = () => path.join(UA_HOME, 'update-check.json');

export function installedVersion(root = PLUGIN_ROOT) {
  try { return String(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version ?? ''); } catch { return ''; }
}

/** Which agent installed this copy, from where the copy sits. */
export function installedBy(root = PLUGIN_ROOT) {
  const at = root.split(path.sep).join('/');
  if (at.includes('/plugins/cache/') && /\/\.codex[^/]*\//u.test(`${at}/`)) return 'codex';
  if (at.includes('/.claude') && at.includes('/plugins/cache/')) return 'claude';
  if (at.includes('/.copilot/')) return 'copilot';
  if (at.includes('/.gemini/extensions/')) return 'gemini';
  if (at.includes('/.gemini/config/plugins/')) return 'antigravity';
  if (at.includes('/opencode/') && at.includes('/node_modules/')) return 'opencode';
  if (at.includes('/.unifyapps-solutions/plugin/')) return 'installer';
  if (['codex', 'antigravity'].includes(process.env.UA_AGENT)) return process.env.UA_AGENT;
  return 'checkout';
}

/** The command that updates this copy, for the agent that installed it. */
export function updateCommand(agent = installedBy(), latest = null) {
  const tag = latest ? `v${latest}` : 'vX.Y.Z';
  return {
    antigravity: `agy plugin install https://github.com/unify-apps/unifyapps-headless/tree/${tag}, then restart Antigravity`,
    claude: 'claude plugin marketplace update unifyapps-headless && claude plugin update ua@unifyapps-headless, then restart Claude Code',
    copilot: 'copilot plugin marketplace update unifyapps-headless && copilot plugin update ua@unifyapps-headless, then restart Copilot',
    codex: 'codex plugin marketplace upgrade unifyapps-headless && codex plugin add ua@unifyapps-headless, then start a new Codex session',
    gemini: 'gemini extensions update unifyapps-headless, then restart Gemini CLI',
    opencode: "opencode plugin remove 'github:unify-apps/unifyapps-headless#semver:*' && rm -rf ~/.cache/opencode/npm/git-unifyapps-headless-* && opencode plugin add 'github:unify-apps/unifyapps-headless#semver:*', then restart OpenCode",
    installer: 'run the install command again: curl -fsSL https://github.com/unify-apps/unifyapps-headless/releases/latest/download/install.sh | bash',
    checkout: 'git pull in this checkout',
  }[agent] ?? 'reinstall UnifyApps Headless';
}

/** Where the answer comes from: the Latest release, or a file or URL a test names. */
const source = () => process.env.UA_RELEASE_URL || RELEASE_URL;

async function download(url) {
  if (!/^https?:/u.test(url)) return JSON.parse(fs.readFileSync(url, 'utf8'));
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function readCache() {
  try { return JSON.parse(fs.readFileSync(cacheFile(), 'utf8')); } catch { return null; }
}

function writeCache(entry) {
  try {
    fs.mkdirSync(UA_HOME, { recursive: true, mode: 0o700 });
    const temp = `${cacheFile()}.${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    fs.renameSync(temp, cacheFile());
  } catch { /* a cache that cannot be written only costs another download */ }
}

/** The latest release.json, from the cache while it is fresh. Null when unknown. */
export async function latestRelease({ now = Date.now(), force = false } = {}) {
  if (process.env.UA_NO_UPDATE_CHECK === '1') return null;
  const cached = readCache();
  if (!force && cached?.source === source() && now - cached.checkedAt < CHECK_EVERY_MS) return cached.release;
  try {
    const release = await download(source());
    if (!parseVersion(release?.version)) throw new Error('release.json has no version');
    writeCache({ source: source(), checkedAt: now, release });
    return release;
  } catch {
    return cached?.source === source() ? cached.release : null;
  }
}

/**
 * `current`, `available` (a newer release exists) or `required` (this copy is
 * below the minimum). A beta of a later version counts as that version, so a
 * tester on 0.0.8-beta.1 is not told to "update" to 0.0.7.
 */
export function updateState(version, release) {
  if (!release || !parseVersion(version)) return { state: 'current' };
  const base = (v) => { const p = parseVersion(v); return `${p.major}.${p.minor}.${p.patch}`; };
  const atLeast = (minimum) => compareVersions(version, minimum) >= 0 || (parseVersion(version).pre && compareVersions(base(version), minimum) > 0);
  const min = parseVersion(release.minRequiredVersion) ? release.minRequiredVersion : null;
  const details = { installed: version, latest: release.version, minRequired: min, message: release.message ?? '' };
  if (min && !atLeast(min)) return { state: 'required', ...details };
  if (!atLeast(release.version)) return { state: 'available', ...details };
  return { state: 'current', ...details };
}

export async function checkForUpdate(options = {}) {
  const version = options.version ?? installedVersion();
  const release = await latestRelease(options);
  return { ...updateState(version, release), command: updateCommand(options.agent, release?.version) };
}

/** One line for a session start, or null when there is nothing to say. */
export function updateNotice(result) {
  if (!result || result.state === 'current') return null;
  const why = result.message ? ` (${result.message.replace(/\.$/u, '')})` : '';
  if (result.state === 'required') {
    return `UnifyApps Headless ${result.installed} is out of date and must be updated: ${result.minRequired} or later is required${why}. Until then its tenant tools refuse every call. Tell the person, first thing, to update with: ${result.command}.`;
  }
  return `UnifyApps Headless ${result.latest} is available (this is ${result.installed})${why}. Mention it to the person once: update with ${result.command}.`;
}

/** The refusal a tool call gets while an update is required. */
export const updateRequiredMessage = (result) => `UPDATE_REQUIRED: UnifyApps Headless ${result.installed} is out of date; ${result.minRequired} or later is required${result.message ? ` (${result.message.replace(/\.$/u, '')})` : ''}. Nothing was sent to the tenant. Update with: ${result.command}.`;
