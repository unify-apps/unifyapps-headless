// The fast loops health check, cached in LOOPS_HOME/health.json.
//
// Groups and their time to live:
//   toolchain  node, Xcode, the iOS runtime, Rosetta, baguette, argent, laptop capacity   24 h
//   preview    the Preview app on the pool (version proven on a booted simulator)          6 h
//   pool       pool simulators and their boot state                                        2 min
//   live       ports 3001, 8081, 8421 and the open-file table                              never cached
// The whole cache is dropped when the plugin version or /Applications/Xcode.app's mtime
// changes; setup, pool and preview commands drop the groups they touch (invalidate()).
//
// health.json: { version, pluginVersion, xcodeMtimeMs, groups: { <group>: { at, rows[] } } }
//
// A WEB app's loops drive browsers, not simulators: their check is its own, kept in its own
// file (health-web.json), so a WEB check never reuses or overwrites a MOBILE row:
//   web    node, npx, Playwright's Chrome for Testing, the agent limit                       24 h
//   live   browsers this laptop runs at once (free memory)                                   never cached
// The platform: --platform web|mobile, else app.type of <solution>/.nebula/loops/profile.json,
// else MOBILE (platformFor()).
import fs from 'node:fs';
import path from 'node:path';
import { mtimeMs, nowMs, xcodeApp } from './exec.mjs';
import { pluginVersion, readJson, readLoopsConfig, wantedRuntime, writeJson } from './paths.mjs';
import {
  finishBaguette, probeArgent, probeBaguetteRaw, probeCapacity, probeFileTable, probeNode,
  probePool, probePorts, probePreview, probeRosetta, probeRuntime, probeXcode,
} from './probes.mjs';
import { usage } from './output.mjs';
import { PLATFORMS } from './platform.mjs';
import { probeAgents, probeBrowser, probeBrowsers, probeNpx } from './web-probes.mjs';

export const CACHE_VERSION = 1;
export const TTL_MS = { toolchain: 24 * 3600_000, preview: 6 * 3600_000, pool: 2 * 60_000 };
export const GROUPS = Object.keys(TTL_MS);
export const WEB_TTL_MS = { web: 24 * 3600_000 };

export const cacheFile = (home, platform = 'MOBILE') => path.join(home, platform === 'WEB' ? 'health-web.json' : 'health.json');

/** --platform web|mobile (any case) → 'WEB' | 'MOBILE'; else app.type of the solution's loops profile; else MOBILE. */
export function platformFor({ flag = null, solution = null } = {}) {
  if (flag != null && flag !== '') {
    const value = String(flag).trim().toUpperCase();
    if (!PLATFORMS.includes(value)) throw usage('--platform takes web or mobile');
    return value;
  }
  if (solution) {
    const type = readJson(path.join(solution, '.nebula', 'loops', 'profile.json'))?.app?.type;
    const value = typeof type === 'string' ? type.trim().toUpperCase() : null;
    if (PLATFORMS.includes(value)) return value;
  }
  return 'MOBILE';
}

export function readCache(home, platform = 'MOBILE') {
  const cache = readJson(cacheFile(home, platform));
  return cache && cache.version === CACHE_VERSION && cache.groups && typeof cache.groups === 'object' ? cache : null;
}

/** Drop cached groups ('all' or a list) of one platform's cache; later checks probe them again. */
export function invalidate(home, groups = 'all', platform = 'MOBILE') {
  const cache = readCache(home, platform);
  if (!cache) return;
  if (groups === 'all') {
    fs.rmSync(cacheFile(home, platform), { force: true });
    return;
  }
  for (const group of groups) delete cache.groups[group];
  writeJson(cacheFile(home, platform), cache);
}

const PROBES = {
  async toolchain(ctx) {
    const [node, xcode, runtime, rosetta, argent, baguette] = await Promise.all([
      probeNode(), probeXcode(), probeRuntime(ctx.config), probeRosetta(), probeArgent({ cwd: ctx.cwd }), probeBaguetteRaw(),
    ]);
    return [node, xcode, runtime, rosetta, finishBaguette(baguette, xcode, ctx.config), argent, probeCapacity(ctx.config)];
  },
  async preview(ctx) {
    return [await probePreview(ctx)];
  },
  async pool(ctx) {
    return [await probePool(ctx)];
  },
};

/**
 * Run the check. Returns { rows, groups: { name: { cached, at } }, problems, capacity, line, ok }.
 * fresh: skip the cache (it is still rewritten with what was probed).
 */
export async function checkHealth({ home, fresh = false, cwd = process.cwd(), platform = 'MOBILE' } = {}) {
  if (platform === 'WEB') return checkWebHealth({ home, fresh });
  const config = readLoopsConfig(home);
  const ctx = { home, config, cwd };
  const now = nowMs();
  const stamp = { pluginVersion: pluginVersion(), xcodeMtimeMs: mtimeMs(xcodeApp()) };
  let cache = fresh ? null : readCache(home);
  if (cache && (cache.pluginVersion !== stamp.pluginVersion || cache.xcodeMtimeMs !== stamp.xcodeMtimeMs)) cache = null;
  const groups = {};
  const probed = {};
  await Promise.all(GROUPS.map(async (group) => {
    const entry = cache?.groups?.[group];
    if (entry && Array.isArray(entry.rows) && now - entry.at >= 0 && now - entry.at < TTL_MS[group]) {
      groups[group] = { cached: true, at: entry.at, rows: entry.rows };
      return;
    }
    const rows = await PROBES[group](ctx);
    groups[group] = { cached: false, at: now, rows };
    probed[group] = { at: now, rows };
  }));
  const live = await Promise.all([probePorts(), probeFileTable()]);
  if (Object.keys(probed).length) {
    const next = { version: CACHE_VERSION, ...stamp, groups: { ...(cache?.groups ?? {}), ...probed } };
    try {
      writeJson(cacheFile(home), next);
    } catch {
      // a read-only home still answers
    }
  }
  const rows = [...GROUPS.flatMap((group) => groups[group].rows), ...live];
  return summarize(rows, { groups, config });
}

const byTool = (rows) => Object.fromEntries(rows.map((item) => [item.tool, item]));

/** Problems, the capacity suggestion and the one line, from probe rows. Pure. */
export function summarize(rows, { groups = {}, config = {} } = {}) {
  const tools = byTool(rows);
  const problems = [];
  const add = (tool, short, setup = true) => problems.push({ tool, short, setup, detail: tools[tool]?.detail ?? '', fixCommand: tools[tool]?.fixCommand ?? null });
  const cap = tools.capacity?.data ?? null;
  if (tools.node && !tools.node.ok) add('node', tools.node.present ? 'Node 22+ needed' : 'node missing');
  if (tools.xcode && !tools.xcode.ok) add('xcode', 'Xcode missing');
  if (tools['ios-runtime'] && !tools['ios-runtime'].ok) add('ios-runtime', `iOS ${tools['ios-runtime'].data?.wanted ?? wantedRuntime(config)} runtime missing`);
  if (tools.rosetta && !tools.rosetta.ok) add('rosetta', 'Rosetta missing');
  if (tools.baguette && !tools.baguette.ok) add('baguette', tools.baguette.present ? 'baguette unusable' : 'baguette missing');
  if (tools.argent && !tools.argent.ok) add('argent', tools.argent.present ? 'argent MCP not registered' : 'argent missing');
  const pool = tools['sim-pool'];
  if (pool && !pool.ok) {
    if (!pool.present) add('sim-pool', `no simulator pool${cap ? ` (suggested ${cap.pool})` : ''}`);
    else add('sim-pool', `${pool.data?.ready ?? 0} of ${pool.data?.devices ?? 0} simulators ready`);
  }
  const preview = tools['preview-app'];
  if (preview && !preview.ok && pool?.present) add('preview-app', 'Preview app not installed');
  const files = tools['file-table'];
  if (files && files.present === false) add('file-table', `file table ${files.data?.pct ?? '?'}% full`, false);
  return { ok: problems.length === 0, rows, problems, capacity: cap ? { pool: cap.pool, agents: cap.agents, runners: cap.pool, suggested: cap.suggested, machine: cap.machine } : null, groups: cacheInfo(groups), line: quickLine({ tools, problems }) };
}

function cacheInfo(groups) {
  return Object.fromEntries(Object.entries(groups).map(([group, info]) => [group, { cached: info.cached, at: new Date(info.at).toISOString() }]));
}

/** The one line for session start. */
export function quickLine({ tools, problems }) {
  if (problems.length) {
    const shown = problems.slice(0, 3).map((problem) => problem.short);
    const more = problems.length > 3 ? ` +${problems.length - 3} more` : '';
    const setup = problems.some((problem) => problem.setup);
    const remedy = setup ? 'ask to set up the simulators (native-setup)' : 'stop local servers running under --watch';
    return `Loops: ${shown.join(', ')}${more} → ${remedy}`;
  }
  const parts = [];
  const pool = tools['sim-pool']?.data;
  if (pool) parts.push(`${pool.ready} ${pool.ready === 1 ? 'simulator' : 'simulators'} ready${pool.booted < pool.ready ? ` (${pool.booted} booted)` : ''}`);
  const takes = tools.capacity?.data?.pool;
  if (pool && Number.isInteger(takes) && takes > pool.devices) parts.push(`this laptop takes ${takes} (native-setup grows the pool)`);
  const preview = tools['preview-app'];
  if (preview) parts.push(`Preview app ${preview.version ?? 'OK'}`);
  const baguette = tools.baguette;
  if (baguette) parts.push(`baguette OK${baguette.data?.mode && baguette.data.mode !== 'input' ? ' (viewer)' : ''}`);
  if (tools.ports?.data?.ports?.['8421']?.listening) parts.push('farm on :8421');
  return `Loops: ${parts.join(' · ') || 'ready'}`;
}

// --- WEB -------------------------------------------------------------------------------------

export const webStamp = () => ({ pluginVersion: pluginVersion() });

/** The WEB check: node, npx and Chrome for Testing (cached 24 h), the browsers free memory allows (live). */
export async function checkWebHealth({ home, fresh = false } = {}) {
  const config = readLoopsConfig(home);
  const now = nowMs();
  const stamp = webStamp();
  let cache = fresh ? null : readCache(home, 'WEB');
  if (cache && cache.pluginVersion !== stamp.pluginVersion) cache = null;
  const entry = cache?.groups?.web;
  let web;
  if (entry && Array.isArray(entry.rows) && now - entry.at >= 0 && now - entry.at < WEB_TTL_MS.web) {
    web = { cached: true, at: entry.at, rows: entry.rows };
  } else {
    web = { cached: false, at: now, rows: await probeWebGroup(config) };
    try {
      writeJson(cacheFile(home, 'WEB'), { version: CACHE_VERSION, ...stamp, groups: { ...(cache?.groups ?? {}), web: { at: now, rows: web.rows } } });
    } catch {
      // a read-only home still answers
    }
  }
  const rows = [...web.rows, probeBrowsers(config)];
  return summarizeWeb(rows, { groups: { web } });
}

/** The cached WEB rows, each tagged group web. */
export async function probeWebGroup(config) {
  const [node, npx] = await Promise.all([probeNode(), probeNpx()]);
  // probeNode names an argent under another node; argent is a MOBILE tool.
  return [{ ...node, group: 'web', detail: node.detail.replace(/; argent is installed under.*$/u, '') }, npx, probeBrowser(), probeAgents(config)];
}

/** Problems, the limits and the one line of a WEB check, from its rows. Pure. */
export function summarizeWeb(rows, { groups = {} } = {}) {
  const tools = byTool(rows);
  const problems = [];
  const add = (tool, short, setup = true) => problems.push({ tool, short, setup, detail: tools[tool]?.detail ?? '', fixCommand: tools[tool]?.fixCommand ?? null });
  if (tools.node && !tools.node.ok) add('node', tools.node.present ? 'Node 22+ needed' : 'node missing');
  if (tools.npx && !tools.npx.ok) add('npx', 'npx missing');
  if (tools.browser && !tools.browser.ok) add('browser', 'Chrome for Testing missing');
  const files = tools['file-table'];
  if (files && files.present === false) add('file-table', `file table ${files.data?.pct ?? '?'}% full`, false);
  const browsers = tools.browsers?.data ?? null;
  const agents = tools.capacity?.data ?? null;
  const capacity = browsers || agents ? {
    agents: agents?.agents ?? null, browsers: browsers?.browsers ?? null, runners: browsers?.browsers ?? null,
    freeGb: browsers?.freeGb ?? null, cap: browsers?.cap ?? null, capFrom: browsers?.capFrom ?? null, machine: agents?.machine ?? null,
  } : null;
  return { ok: problems.length === 0, platform: 'WEB', rows, problems, capacity, groups: cacheInfo(groups), line: quickLineWeb({ tools, problems }) };
}

/** The one line for session start in a WEB folder. */
export function quickLineWeb({ tools, problems }) {
  if (problems.length) {
    const shown = problems.slice(0, 3).map((problem) => problem.short);
    const more = problems.length > 3 ? ` +${problems.length - 3} more` : '';
    const remedy = problems.some((problem) => problem.setup) ? 'the fix or build loop sets it up on a yes' : 'stop local servers running under --watch';
    return `Loops (web): ${shown.join(', ')}${more} → ${remedy}`;
  }
  const parts = [];
  if (tools.browser?.ok) parts.push('Chrome for Testing ready');
  const browsers = tools.browsers?.data?.browsers;
  if (browsers != null) parts.push(`${browsers} ${browsers === 1 ? 'browser' : 'browsers'}`);
  return `Loops (web): ${parts.join(' · ') || 'ready'}`;
}
