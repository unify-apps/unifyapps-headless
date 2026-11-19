#!/usr/bin/env node
// Opens a MOBILE app's saved draft in the UnifyApps Preview app, so a change is
// seen on a phone before it is published. The app must have been published
// once: the Preview app reads both copies and refuses an app never published.
// A link to the app already open is ignored.
//
//   node preview.mjs link <app id | builder URL> [--tenant <host>] [--json]
//   node preview.mjs open <app id | builder URL> [--tenant <host>] [--device ios|android|<udid>|<serial>] [--package <app id>] [--json]
//
// The link is the tenant's own: the app-testing tool `get_preview_link` builds
// it with the function the builder's Preview QR uses, from the app's matrix address (a
// per-app domain mapping first, then the tenant's base domain and the app's
// base path). A tenant whose tools predate it answers `derive_matrix_url`, the
// same address, and the link is built here the way the QR builds it. Beside
// that read, `list_interface_versions` says whether the app was ever published:
// `open` stops for an app never published and `link` warns. A failed version
// read is said and stops nothing; a refusal (the production gate, an expired
// sign-in, the AGENT_LLM_TOOLS permission) is never caught.
// A refused address or link is never printed. The reads go through UnifyApps Headless's
// bridge with the saved sign-in, so the production check applies and
// no token is ever an argument. The link carries only the address (the Preview QR's matrix
// mode without its optional session token), so it is safe to print: the app
// signs in on the tenant's own login page. `open` sends it to a booted iOS
// simulator or an Android device as a `matrix://open` deep link; the app then
// asks "Choose a version to open", and Draft runs the saved draft. `open`
// picks the store build first; `--package` names another installed Preview build.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UaError, normalizeTenant } from '../../../scripts/lib/contracts.mjs';
import { callTenantTool } from '../../../scripts/platform/tenant-mcp.mjs';
import { readRegistry, sessionForFolder } from '../../../scripts/folder/session-registry.mjs';

/** The UnifyApps Preview app's ids on iOS and Android, store build first. */
export const PREVIEW_APP_IDS = Object.freeze([
  'com.unifyapps.matrix', 'com.unifyapps.matrix.preview', 'com.unifyapps.matrix.internal',
]);
const STORE_LINKS = Object.freeze({
  ios: 'https://testflight.apple.com/join/gqe8xWtD',
  android: 'https://play.google.com/store/apps/details?id=com.unifyapps.matrix',
});
// Path segments that sit between `interfaces` and the app id in a builder URL,
// the same list derive_matrix_url skips.
const ID_SKIP = new Set(['manager', 'create', 'ai-create', 'modules', 'packages', 'template-components', 'edit', 'clone', 'share', 'code-builder']);
const APP_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
// What a read may never swallow: the production gate's two refusals, a sign-in
// that ran out, and the tenant refusing UnifyApps Headless's tools to this person (AGENT_LLM_TOOLS): each one
// refuses the next call the same way, so it stops the command rather than becoming a warning.
const REFUSALS = new Set(['PRODUCTION_BLOCKED', 'ENVIRONMENT_UNCONFIRMED', 'AUTH_EXPIRED', 'PERMISSION_REQUIRED']);
const NEVER_PUBLISHED_FIX = 'publish the app once, or open the draft from the builder\'s Preview QR with "Use current login session" on';

const usage = (message) => new UaError('USAGE', message);

function checkedAppId(value) {
  const id = String(value ?? '').trim();
  if (!APP_ID.test(id)) throw usage(`"${id}" is not an app id. Pass the app id or its builder URL.`);
  return id;
}

/** The tenant and app id named by an app id (with `tenant`) or a builder URL, which carries both. */
export function parseTarget(value, { tenant } = {}) {
  const text = String(value ?? '').trim();
  if (!text) throw usage('Name the app: its id, or its builder URL.');
  const named = tenant ? normalizeTenant(tenant) : null;
  if (!/^https?:\/\//iu.test(text)) return { tenant: named, interfaceId: checkedAppId(text) };
  let url;
  try { url = new URL(text); } catch { throw usage('The builder URL does not parse.'); }
  const parts = url.pathname.split('/').filter(Boolean);
  const at = parts.indexOf('interfaces');
  const id = at === -1 ? undefined : parts.slice(at + 1).find((segment) => !ID_SKIP.has(segment));
  if (!id) throw usage(`No app id in ${url.origin}${url.pathname}. Pass the app's builder URL, or its id with --tenant.`);
  const host = normalizeTenant(url.hostname);
  if (named && named !== host) throw usage(`The URL is on ${host}, but --tenant names ${named}.`);
  let decoded;
  try { decoded = decodeURIComponent(id); } catch { throw usage('The app id in the URL does not parse.'); }
  return { tenant: host, interfaceId: checkedAppId(decoded) };
}

/** The tenant of this Claude session, else of the newest session opened in this folder. */
export function sessionTenant({ cwd = process.cwd(), sessionId = process.env.CLAUDE_CODE_SESSION_ID } = {}) {
  try {
    const own = sessionId ? readRegistry().sessions[sessionId] : null;
    if (own?.tenant) return { tenant: own.tenant, sessionId, solutionId: own.solutionId ?? null };
    const folder = sessionForFolder(cwd);
    return folder?.tenant ? { tenant: folder.tenant, sessionId: null, solutionId: null } : null;
  } catch { return null; }
}

/** The platform URL the app-testing tools read the app from. */
const platformUrl = (tenant, interfaceId) => `https://${tenant}/interfaces/${encodeURIComponent(interfaceId)}`;

// The app's address: an https URL with no sign-in, query or fragment in it. It answers the address as
// parsed, never the raw text, because new URL() drops tabs and newlines before it parses, so the checks
// say nothing about the raw string. The parser's trailing slash on a bare origin is kept only when the
// tool wrote it. A refused address is never echoed, since what makes it refused (`?previewAuthToken=…`,
// `user:pass@`) can be a session: the error says only why.
function checkedMatrixUrl(value, tool) {
  const text = typeof value === 'string' ? value.trim() : '';
  let url = null;
  try { url = new URL(text); } catch { /* answered below */ }
  const problem = !text ? 'it gave none' : !url ? 'it does not parse' : url.protocol !== 'https:' ? 'it is not https'
    : url.username || url.password ? 'it carries a sign-in' : url.search || url.hash ? 'it carries a query or a fragment' : null;
  if (problem) throw new UaError('PLATFORM_UNREACHABLE', `${tool} answered no usable app address: ${problem}.`);
  return url.pathname === '/' && !text.endsWith('/') ? url.origin : `${url.origin}${url.pathname}`;
}

/** Asks the tenant for the app's matrix address through the bridge. `call` is callTenantTool, swapped in tests. */
export async function deriveMatrixAddress({ tenant, interfaceId, sessionId, solutionId, call = callTenantTool }) {
  const answer = await call({ host: tenant, route: '/mcp/app-testing', name: 'derive_matrix_url',
    args: { url: platformUrl(tenant, interfaceId) }, sessionId, solutionId });
  return { matrixUrl: checkedMatrixUrl(answer?.matrixUrl, 'derive_matrix_url'), source: answer?.source ?? null };
}

/** The Preview QR's links in matrix mode, without the optional session token: the deep link a device opens,
 * and the builder's own web page, which forwards to the deep link and works from a phone's camera. */
export function previewLinks(tenant, matrixUrl) {
  const query = new URLSearchParams({ url: matrixUrl }).toString();
  return { deepLink: `matrix://open?${query}`, webLink: `https://${tenant}/internal/matrix-preview?${query}` };
}

const sessionFree = (url) => !url.username && !url.password && !url.searchParams.has('previewAuthToken');

// The tool builds its links with the builder's own code, so they are taken as they come once they
// prove to be matrix-mode Preview links to this app's address, on this tenant, with no session in
// them: every link this script prints must be safe to share. A refused link is never echoed. What is
// printed and opened is each link as parsed, so a tab or newline the parser dropped is not in it.
function checkedToolLinks(tenant, answer) {
  const matrixUrl = checkedMatrixUrl(answer?.matrixUrl, 'get_preview_link');
  let deep = null, page = null;
  try { deep = new URL(answer.deepLink); page = new URL(answer.previewUrl); } catch { /* answered below */ }
  const deepOk = deep?.protocol === 'matrix:' && deep.host === 'open' && sessionFree(deep) && deep.searchParams.get('url') === matrixUrl;
  const pageOk = page?.protocol === 'https:' && page.host === tenant && page.pathname === '/internal/matrix-preview'
    && sessionFree(page) && page.searchParams.get('url') === matrixUrl;
  if (!deepOk || !pageOk) {
    throw new UaError('PLATFORM_UNREACHABLE', `get_preview_link answered no usable link: not a matrix-mode Preview link to ${matrixUrl} on ${tenant} without a session.`, { host: tenant });
  }
  return { matrixUrl, deepLink: deep.href, webLink: page.href };
}

/** The app's Preview links, from the tenant's `get_preview_link`. A tenant whose tools predate it answers
 * `derive_matrix_url`, and the links are built here as the Preview QR builds them. */
export async function askPreviewLink({ tenant, interfaceId, sessionId, solutionId, call = callTenantTool }) {
  let answer;
  try {
    // An older tenant answers an unknown tool as an MCP error or as a tool error; with
    // answerRefusals, callTenantTool names both `missingTool`.
    answer = await call({ host: tenant, route: '/mcp/app-testing', name: 'get_preview_link',
      args: { url: platformUrl(tenant, interfaceId) }, sessionId, solutionId, answerRefusals: true });
  } catch (error) {
    if (!error?.details?.missingTool) throw error;
    const { matrixUrl, source } = await deriveMatrixAddress({ tenant, interfaceId, sessionId, solutionId, call });
    return { matrixUrl, source, ...previewLinks(tenant, matrixUrl) };
  }
  if (answer?.ok === false) throw new UaError('PLATFORM_UNREACHABLE', `get_preview_link failed: ${answer.message ?? 'tool error.'}`, { host: tenant });
  const { matrixUrl, deepLink, webLink } = checkedToolLinks(tenant, answer);
  return { matrixUrl, source: answer.source ?? null, deepLink, webLink };
}

/** Whether the app was ever published, from `list_interface_versions`: `published` is true or false, or null
 * with the `reason` when the read failed. A failed read stops nothing; a refusal is never caught. */
export async function askPublished({ tenant, interfaceId, sessionId, solutionId, call = callTenantTool }) {
  try {
    const answer = await call({ host: tenant, route: '/mcp/application-builder', name: 'list_interface_versions',
      args: { interfaceId, kind: 'published', limit: 1 }, sessionId, solutionId });
    if (!Array.isArray(answer?.versions)) return { published: null, reason: 'list_interface_versions answered no list of versions' };
    return { published: answer.versions.length > 0, reason: null };
  } catch (error) {
    if (REFUSALS.has(error?.code)) throw error;
    return { published: null, reason: String(error?.message ?? error).replace(/\.$/u, '') };
  }
}

function exec(file, args, { timeout = 30_000 } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, missing: error?.code === 'ENOENT', stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });
}

/** Every booted iOS simulator and every Android device `adb` sees. A missing tool lists nothing. */
export async function listDevices(run = exec) {
  const devices = [];
  const ios = await run('xcrun', ['simctl', 'list', '--json', 'devices', 'booted']);
  if (ios.ok) {
    try {
      for (const list of Object.values(JSON.parse(ios.stdout).devices ?? {})) {
        for (const device of list ?? []) {
          if (device?.state === 'Booted' && device.udid) devices.push({ platform: 'ios', id: device.udid, name: device.name ?? device.udid });
        }
      }
    } catch { /* an unreadable list names no simulator */ }
  }
  const android = await run('adb', ['devices']);
  if (android.ok) {
    for (const line of android.stdout.split('\n').slice(1)) {
      const [serial, state] = line.trim().split(/\s+/u);
      if (serial && state === 'device') devices.push({ platform: 'android', id: serial, name: serial });
    }
  }
  return devices;
}

const named = (devices) => devices.map((device) => `${device.platform} ${device.name}${device.name === device.id ? '' : ` (${device.id})`}`).join(', ') || 'none';

/** The one device to open the link on: the one asked for, else the only one running. */
export function pickDevice(devices, wanted) {
  if (!wanted && devices.length === 1) return devices[0];
  if (!wanted && !devices.length) {
    throw new UaError('NO_DEVICE', 'No booted iOS simulator or Android device is running. Start one, then run open again; the link above opens the draft there too.');
  }
  if (!wanted) throw usage(`Several devices are running: ${named(devices)}. Pass --device <id>.`);
  const matches = devices.filter((device) => (wanted === 'ios' || wanted === 'android' ? device.platform === wanted : device.id === wanted));
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new UaError('NO_DEVICE', `No running device matches ${wanted}. Running: ${named(devices)}.`);
  throw usage(`Several ${wanted} devices are running: ${named(matches)}. Pass --device <id>.`);
}

/** The Preview app on the device: the one asked for, else the first installed in PREVIEW_APP_IDS order. */
export async function previewAppOn(device, wanted, run = exec) {
  let installed = [];
  if (device.platform === 'ios') {
    for (const id of PREVIEW_APP_IDS) {
      if ((await run('xcrun', ['simctl', 'get_app_container', device.id, id])).ok) installed.push(id);
    }
  } else {
    const listed = await run('adb', ['-s', device.id, 'shell', 'pm', 'list', 'packages', 'com.unifyapps.matrix']);
    const found = new Set(listed.stdout.split('\n').map((line) => line.trim().replace(/^package:/u, '')));
    installed = PREVIEW_APP_IDS.filter((id) => found.has(id));
  }
  if (wanted) {
    if (!installed.includes(wanted)) throw new UaError('NOT_INSTALLED', `${wanted} is not installed on ${device.name}. Installed Preview apps: ${installed.join(', ') || 'none'}.`);
    return { use: wanted, installed };
  }
  if (!installed.length) {
    throw new UaError('NOT_INSTALLED', `The UnifyApps Preview app is not installed on ${device.name}. Install it from ${STORE_LINKS[device.platform]}, then run open again.`);
  }
  return { use: installed[0], installed };
}

/** The device and its Preview app: the device asked for, else the only one running, else the only running
 * one with a Preview app installed, since a machine often runs several simulators and only one has it. */
export async function chooseTarget(devices, { device: wanted, package: appId } = {}, run = exec) {
  if (wanted || devices.length <= 1) {
    const device = pickDevice(devices, wanted);
    return { device, app: await previewAppOn(device, appId, run) };
  }
  const ready = [];
  for (const device of devices) {
    try { ready.push({ device, app: await previewAppOn(device, appId, run) }); }
    catch (error) { if (error.code !== 'NOT_INSTALLED') throw error; }
  }
  if (ready.length === 1) return ready[0];
  if (!ready.length) {
    throw new UaError('NOT_INSTALLED', `No running device has the UnifyApps Preview app${appId ? ` ${appId}` : ''}: ${named(devices)}. Install it from ${STORE_LINKS.ios} (iOS) or ${STORE_LINKS.android} (Android), then run open again.`);
  }
  throw usage(`Several running devices have the Preview app: ${named(ready.map((item) => item.device))}. Pass --device <id>.`);
}

/** Sends the deep link to the device. iOS picks the app that registered `matrix://`; Android is told which app. */
export async function openOn(device, deepLink, appId, run = exec) {
  const result = device.platform === 'ios'
    ? await run('xcrun', ['simctl', 'openurl', device.id, deepLink])
    // adb hands its words to the device's shell: the quotes keep `?` and `&` in the link.
    : await run('adb', ['-s', device.id, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-p', appId, '-d', `'${deepLink.replaceAll("'", '%27')}'`]);
  const said = `${result.stdout}\n${result.stderr}`;
  if (!result.ok || /\bError\b|Exception/u.test(said)) {
    throw new UaError('OPEN_FAILED', `Could not open the link on ${device.name}: ${said.trim().split('\n').slice(-1)[0] || 'no answer'}.`);
  }
}

function nextSteps(device, app, { published = null } = {}) {
  const lines = [
    'Next: the app shows "Choose a version to open". Pick Draft. It loads the saved draft, and asks for the tenant\'s sign-in when this device has not signed in to the app yet.',
    'Before you check anything, confirm the version: the debug sheet (the lower half of the floating pill, or shake the device) shows Draft and the app\'s v<n> in its header.',
    'After each save in the builder, tap the upper half of the floating pill: the app reloads, fetches the saved draft and comes back to the same page. Offline it silently shows the copy it already had.',
    'If the Preview app already had this app open, the link did nothing: choose Exit Application in its debug sheet (it also signs the app out), then run open again. Another app\'s link signs the open one out.',
  ];
  if (published !== true) lines.push(`If it says the app may never have been published: ${NEVER_PUBLISHED_FIX}.`);
  if (device.platform === 'ios') {
    lines.push('The first matrix:// link on a simulator makes iOS ask "Open in “UnifyApps Preview”?": tap Open once.');
    if (app.installed.length > 1) {
      lines.push(`Several Preview apps are installed (${app.installed.join(', ')}); iOS opens the link in one of them.`);
    }
  }
  return lines;
}

function parseArgs(argv) {
  const [command, target, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--json') flags.json = true;
    else if (['--tenant', '--device', '--package'].includes(arg)) {
      const value = rest[index + 1];
      if (!value || value.startsWith('--')) throw usage(`${arg} needs a value.`);
      flags[arg.slice(2)] = value;
      index += 1;
    } else throw usage(`Unknown argument: ${arg}.`);
  }
  if (!['link', 'open'].includes(command)) {
    throw usage('Usage: preview.mjs link|open <app id | builder URL> [--tenant <host>] [--device ios|android|<id>] [--package <app id>] [--json]');
  }
  return { command, target, flags };
}

// Under --json a failure is printed as the report so far with its error, one object, and not again on stderr.
const withError = (report, error) => `${JSON.stringify({ ...report, error: { code: error.code ?? 'ERROR', message: error.message } }, null, 2)}\n`;

export async function run(argv, { call, runCommand = exec, out = process.stdout } = {}) {
  const { command, target, flags } = parseArgs(argv);
  if (command === 'link' && (flags.device || flags.package)) throw usage('--device and --package belong to open.');
  const parsed = parseTarget(target, { tenant: flags.tenant });
  const session = sessionTenant();
  const tenant = parsed.tenant ?? session?.tenant ?? null;
  if (!tenant) throw usage('No UnifyApps Headless session here names a tenant. Pass --tenant <host>, or the app\'s builder URL.');
  const own = session?.tenant === tenant ? session : {};
  const ask = { tenant, interfaceId: parsed.interfaceId, sessionId: own.sessionId ?? undefined,
    solutionId: own.solutionId ?? undefined, ...(call ? { call } : {}) };
  // Side by side: the link is the answer, and the version read only decides whether open goes ahead.
  let answers;
  try { answers = await Promise.all([askPreviewLink(ask), askPublished(ask)]); }
  catch (error) {
    if (flags.json) {
      out.write(withError({ tenant, interfaceId: parsed.interfaceId, matrixUrl: null, source: null, deepLink: null, webLink: null,
        opened: null, next: [], published: null, warnings: [] }, error));
    }
    error.reported = flags.json === true;
    throw error;
  }
  const [link, { published, reason }] = answers;
  const report = { tenant, interfaceId: parsed.interfaceId, matrixUrl: link.matrixUrl, source: link.source,
    deepLink: link.deepLink, webLink: link.webLink, opened: null, next: [], published, warnings: [] };
  const neverPublished = `${parsed.interfaceId} has never been published, so the Preview app refuses its link`;
  if (published === false && command === 'link') report.warnings.push(`${neverPublished}: ${NEVER_PUBLISHED_FIX}.`);
  if (published === null) {
    report.warnings.push(`Could not check whether ${parsed.interfaceId} was ever published (${reason}). The Preview app opens an app only once it has been published.`);
  }
  if (!flags.json) {
    out.write(`App address: ${link.matrixUrl}${link.source ? ` (${link.source})` : ''}\n`);
    out.write(`Preview link: ${link.deepLink}\n`);
    out.write(`Web link: ${link.webLink}\n`);
    for (const warning of report.warnings) out.write(`Warning: ${warning}\n`);
  }
  if (command === 'open') {
    try {
      if (published === false) throw new UaError('NOT_PUBLISHED', `${neverPublished}, and nothing was opened. To see the draft on a device, ${NEVER_PUBLISHED_FIX}.`);
      const { device, app } = await chooseTarget(await listDevices(runCommand), flags, runCommand);
      await openOn(device, link.deepLink, app.use, runCommand);
      report.opened = { platform: device.platform, device: device.id, name: device.name, app: app.use };
      report.next = nextSteps(device, app, { published });
    } catch (error) {
      if (flags.json) out.write(withError(report, error));
      error.reported = flags.json === true;
      throw error;
    }
    if (!flags.json) out.write(`Opened on ${report.opened.name} in ${report.opened.app}.\n${report.next.join('\n')}\n`);
  }
  if (flags.json) out.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const isMain = (() => {
  try { return process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();

if (isMain) {
  run(process.argv.slice(2)).catch((error) => {
    if (!error.reported) process.stderr.write(`${error.message}\n`);
    process.exitCode = error.code === 'USAGE' ? 2 : 1;
  });
}
