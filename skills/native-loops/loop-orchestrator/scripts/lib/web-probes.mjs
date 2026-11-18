// The WEB probes: what a WEB app's loops need on this laptop. A WEB device is a browser, so
// there is no simulator, Xcode, iOS runtime, Rosetta, argent, baguette, pool or Preview app to
// check; only Node, npx (browser.mjs runs playwright-cli through it), Playwright's
// Chrome for Testing on disk, and how many browsers this laptop runs at once.
//
// Chrome for Testing lives where Playwright keeps its browsers: $PLAYWRIGHT_BROWSERS_PATH, else
// ~/Library/Caches/ms-playwright (macOS), ~/.cache/ms-playwright (Linux),
// %LOCALAPPDATA%/ms-playwright (Windows). A `chromium-<revision>` (or `chrome-…`) folder holding
// INSTALLATION_COMPLETE is an installed browser; `chromium_headless_shell-…` is not one.
// Browsers: about one per GB of free memory, read through the exec layer so tests fake vm_stat; the
// cap is capacity.browsers in LOOPS_HOME/config.json, else 6.
// Probes never install, start or change anything.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CAP, GB_PER_BROWSER, browsersFor, freeFromMeminfo, freeFromVmStat } from '../../../../web-loops/web-browser/scripts/capacity.mjs';
import { capacity } from './capacity.mjs';
import { firstLine, run, runAsync, which } from './exec.mjs';
import { PLUGIN_ROOT } from './paths.mjs';

// The rule (about one browser per GB of free memory, never above the cap) and the readers of
// vm_stat and /proc/meminfo are web-browser's capacity.mjs; re-exported here for the probes' callers.
export { DEFAULT_CAP, GB_PER_BROWSER, browsersFor, freeFromMeminfo, freeFromVmStat };

export const BROWSER_SCRIPT = path.join(PLUGIN_ROOT, 'skills', 'app-verify', 'scripts', 'browser.mjs');
export const BROWSER_INSTALL = { cmd: 'node', args: [BROWSER_SCRIPT, '--install'] };
export const browserInstallCommand = () => `node "${BROWSER_SCRIPT}" --install`;
const BROWSER_FOLDER = /^(chromium|chrome)(-for-testing)?-[\w.]+$/u;

function row(tool, group, fields) {
  const present = fields.present ?? null;
  return {
    tool, group, present, ok: fields.ok ?? present === true, optional: Boolean(fields.optional),
    version: fields.version ?? null, detail: fields.detail ?? '', fixCommand: fields.fixCommand ?? null, fixKind: fields.fixKind ?? 'none',
    ...(fields.data ? { data: fields.data } : {}),
  };
}

/** Where Playwright keeps its browsers on this machine. */
export function playwrightBrowsersDir(env = process.env, platform = process.platform) {
  const set = env.PLAYWRIGHT_BROWSERS_PATH;
  if (set && set !== '0') return path.resolve(set);
  const home = env.HOME || os.homedir();
  if (platform === 'darwin') return path.join(home, 'Library', 'Caches', 'ms-playwright');
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'ms-playwright');
  return path.join(env.XDG_CACHE_HOME || path.join(home, '.cache'), 'ms-playwright');
}

/** Pure: the installed Chrome for Testing folders of a listing, newest revision first. */
export function installedBrowsers(names, isComplete = () => true) {
  return names.filter((name) => BROWSER_FOLDER.test(name) && isComplete(name))
    .sort((left, right) => (Number(/(\d+)$/u.exec(right)?.[1]) || 0) - (Number(/(\d+)$/u.exec(left)?.[1]) || 0) || right.localeCompare(left));
}

export function probeBrowser({ env = process.env } = {}) {
  const dir = playwrightBrowsersDir(env);
  let names = [];
  try { names = fs.readdirSync(dir); } catch { /* not there yet */ }
  const found = installedBrowsers(names, (name) => fs.existsSync(path.join(dir, name, 'INSTALLATION_COMPLETE')));
  if (!found.length) {
    return row('browser', 'web', {
      present: false,
      detail: `Playwright's Chrome for Testing is not in ${dir}; UnifyApps Headless's browser (app-verify's browser.mjs) needs it (about 100 MB, once per machine; an open-page also installs it on first use)`,
      fixCommand: browserInstallCommand(), fixKind: 'npm',
    });
  }
  const revision = /(\d+)$/u.exec(found[0])?.[1] ?? null;
  return row('browser', 'web', { present: true, version: revision, detail: `Chrome for Testing ${found[0]} in ${dir}${found.length > 1 ? ` (+${found.length - 1} older)` : ''}`, data: { dir, folders: found } });
}

export async function probeNpx() {
  const bin = which('npx');
  if (!bin) {
    return row('npx', 'web', { present: false, detail: 'npx is not on PATH; browser.mjs runs playwright-cli through it (npm ships it with Node)', fixCommand: 'install Node 22 or newer with npm (it brings npx)', fixKind: 'manual' });
  }
  const result = await runAsync('npx', ['--version'], { timeout: 10_000 });
  const version = firstLine(result.stdout) || null;
  return row('npx', 'web', { present: true, version, detail: `npx ${version ?? '?'} at ${bin}; runs playwright-cli for browser.mjs` });
}

/** Free memory in bytes: vm_stat (macOS), /proc/meminfo (Linux), else os.freemem(). */
export function readFreeBytes() {
  const vm = run('vm_stat', [], { timeout: 3000 });
  if (vm.status === 0) {
    const bytes = freeFromVmStat(vm.stdout);
    if (bytes) return { bytes, source: 'vm_stat (free + inactive + speculative + purgeable)' };
  }
  if (!process.env.LOOPS_FAKE_EXEC && process.platform === 'linux') {
    try {
      const bytes = freeFromMeminfo(fs.readFileSync('/proc/meminfo', 'utf8'));
      if (bytes) return { bytes, source: '/proc/meminfo MemAvailable' };
    } catch { /* fall through */ }
  }
  return { bytes: os.freemem(), source: 'os.freemem()' };
}

const positive = (value) => (Number.isInteger(value) && value > 0 ? value : null);

/** How many browsers this laptop runs at once: { freeGb, browsers, cap, capFrom, source }. */
export function browserCapacity(config = {}, free = readFreeBytes()) {
  const freeGb = Math.round((free.bytes / 2 ** 30) * 10) / 10;
  const fromConfig = positive(config?.capacity?.browsers);
  const cap = fromConfig ?? DEFAULT_CAP;
  return { freeGb, browsers: browsersFor({ freeGb, cap }), cap, capFrom: fromConfig ? 'LOOPS_HOME/config.json capacity.browsers' : 'default', source: free.source };
}

export function probeBrowsers(config = {}) {
  const data = browserCapacity(config);
  return row('browsers', 'live', { present: true, optional: true, detail: `${data.freeGb} GB free (${data.source}) → ${data.browsers} browser${data.browsers === 1 ? '' : 's'} at once, cap ${data.cap} (${data.capFrom})`, data });
}

/** The agent limit on WEB: the laptop's RAM rule, without the simulator pool. */
export function probeAgents(config = {}) {
  const result = capacity({ config });
  const { ramGb, perfCores, source } = result.machine;
  return row('capacity', 'web', { present: true, optional: true, detail: `${ramGb ?? '?'} GB RAM, ${perfCores ?? '?'} performance cores (${source}) → agents ${result.agents}${result.overridden.agents ? ' (config)' : ''}`, data: { agents: result.agents, suggested: result.suggested, machine: result.machine, overridden: result.overridden } });
}
