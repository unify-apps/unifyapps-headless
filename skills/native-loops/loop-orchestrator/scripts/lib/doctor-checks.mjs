// The full, fresh check: every probe of the source doctor.sh plus the iOS runtime,
// baguette, the loop ports with their holders, and laptop capacity. Refreshes the
// health cache with what it saw. On WEB (platform 'WEB') the checks are WEB_CHECKS:
// no simulator, Xcode, runtime, Rosetta, argent, baguette, pool, Preview app or ports.
import path from 'node:path';
import { mtimeMs, nowMs, xcodeApp } from './exec.mjs';
import { CACHE_VERSION, TTL_MS, WEB_TTL_MS, cacheFile, summarize, summarizeWeb, webStamp } from './health.mjs';
import { pluginVersion, readLoopsConfig, writeJson } from './paths.mjs';
import {
  finishBaguette, probeArgent, probeArgentServer, probeArgentSkills, probeBaguetteRaw, probeCapacity,
  probeFigma, probeFileTable, probeLegacyLoops, probeLoopsHome, probeUa, probeNode, probePool, probePorts, probePreview,
  probeRosetta, probeRuntime, probeTool, probeXcode,
} from './probes.mjs';
import { probeAgents, probeBrowser, probeBrowsers, probeNpx } from './web-probes.mjs';

export const CHECKS = ['node', 'xcode', 'ios-runtime', 'rosetta', 'baguette', 'argent', 'argent-skills', 'argent-server', 'ports',
  'file-table', 'ffmpeg', 'tesseract', 'UnifyApps Headless', 'figma-mcp', 'preview-app', 'sim-pool', 'capacity', 'loops-home', 'legacy-loops'];
export const WEB_CHECKS = ['node', 'npx', 'browser', 'browsers', 'capacity', 'file-table', 'UnifyApps Headless', 'figma-mcp', 'loops-home', 'legacy-loops'];

/** The checks of a platform ('MOBILE' or 'WEB'). */
export const checksFor = (platform = 'MOBILE') => (platform === 'WEB' ? WEB_CHECKS : CHECKS);

export async function runDoctor({ home, cwd = process.cwd(), only = null, platform = 'MOBILE' } = {}) {
  if (platform === 'WEB') return runWebDoctor({ home, only });
  const config = readLoopsConfig(home);
  const ctx = { home, config, cwd };
  let xcode = null;
  const xcodeOnce = () => (xcode ??= probeXcode());
  // One function per check; --only runs just those (baguette also reads the Xcode row).
  const PROBES = {
    node: () => probeNode(),
    xcode: () => xcodeOnce(),
    'ios-runtime': () => probeRuntime(config),
    rosetta: () => probeRosetta(),
    baguette: async () => { const [raw, xcodeRow] = await Promise.all([probeBaguetteRaw(), xcodeOnce()]); return finishBaguette(raw, xcodeRow, config); },
    argent: () => probeArgent({ cwd, deep: true }),
    'argent-skills': () => probeArgentSkills({ cwd }),
    'argent-server': () => probeArgentServer(),
    ports: () => probePorts({ deep: true }),
    'file-table': () => probeFileTable({ deep: true }),
    ffmpeg: () => probeTool('ffmpeg', 'turns screen recordings into mp4 and gif for reports', ['-version']),
    tesseract: () => probeTool('tesseract', 'OCR of measurement screenshots'),
    'UnifyApps Headless': () => probeUa(),
    'figma-mcp': () => probeFigma(),
    'preview-app': () => probePreview(ctx),
    'sim-pool': () => probePool(ctx),
    capacity: () => probeCapacity(config),
    'loops-home': () => probeLoopsHome(),
    'legacy-loops': () => probeLegacyLoops(),
  };
  const names = only?.length ? CHECKS.filter((name) => only.includes(name)) : CHECKS;
  const rows = await Promise.all(names.map((name) => PROBES[name]()));
  // What doctor saw is fresh: it becomes the health cache.
  if (!only?.length) {
    const at = nowMs();
    const group = (name) => ({ at, rows: rows.filter((item) => item.group === name) });
    try {
      writeJson(cacheFile(home), {
        version: CACHE_VERSION, pluginVersion: pluginVersion(), xcodeMtimeMs: mtimeMs(xcodeApp()),
        groups: Object.fromEntries(Object.keys(TTL_MS).map((name) => [name, group(name)])),
      });
    } catch {
      // read-only home
    }
  }
  const summary = summarize(rows, { config });
  const requiredMissing = rows.filter((item) => !item.optional && item.ok === false);
  return { ...summary, ok: requiredMissing.length === 0, requiredMissing: requiredMissing.map((item) => item.tool), home, cacheFile: path.relative(home, cacheFile(home)) };
}

/** The WEB doctor: every WEB check, fresh; refreshes the WEB health cache (health-web.json). */
export async function runWebDoctor({ home, only = null } = {}) {
  const config = readLoopsConfig(home);
  const PROBES = {
    node: async () => { const node = await probeNode(); return { ...node, group: 'web', detail: node.detail.replace(/; argent is installed under.*$/u, '') }; },
    npx: () => probeNpx(),
    browser: () => probeBrowser(),
    browsers: () => probeBrowsers(config),
    capacity: () => probeAgents(config),
    'file-table': () => probeFileTable({ deep: true }),
    'UnifyApps Headless': () => probeUa(),
    'figma-mcp': () => probeFigma(),
    'loops-home': () => probeLoopsHome(),
    'legacy-loops': () => probeLegacyLoops(),
  };
  const names = only?.length ? WEB_CHECKS.filter((name) => only.includes(name)) : WEB_CHECKS;
  const rows = await Promise.all(names.map((name) => PROBES[name]()));
  if (!only?.length) {
    const at = nowMs();
    try {
      writeJson(cacheFile(home, 'WEB'), {
        version: CACHE_VERSION, ...webStamp(),
        groups: Object.fromEntries(Object.keys(WEB_TTL_MS).map((name) => [name, { at, rows: rows.filter((item) => item.group === name) }])),
      });
    } catch {
      // read-only home
    }
  }
  const summary = summarizeWeb(rows);
  const requiredMissing = rows.filter((item) => !item.optional && item.ok === false);
  return { ...summary, ok: requiredMissing.length === 0, requiredMissing: requiredMissing.map((item) => item.tool), home, cacheFile: path.relative(home, cacheFile(home, 'WEB')) };
}

const mark = (item) => {
  if (item.present === null) return '–';
  if (!item.ok) return item.optional ? '!' : '✗';
  return item.present === false ? '○' : '✓';
};

export function renderDoctor(result) {
  const lines = [`Loops doctor${result.platform === 'WEB' ? ' (web)' : ''} — ${result.ok ? 'ready' : `${result.requiredMissing.length} required item(s) need attention`}`];
  for (const item of result.rows) {
    lines.push(`${mark(item)} ${item.tool.padEnd(14)} ${item.version ? `${item.version} · ` : ''}${item.detail}`);
  }
  const fixes = result.rows.filter((item) => item.fixCommand && item.ok === false);
  if (fixes.length) {
    lines.push('', 'Fixes:');
    for (const item of fixes) lines.push(`  ${item.tool} (${item.fixKind}): ${item.fixCommand}`);
  }
  if (result.platform === 'WEB' && result.capacity) lines.push('', `Suggested: ${result.capacity.browsers ?? '?'} browsers, ${result.capacity.agents ?? '?'} agents.`);
  else if (result.capacity) lines.push('', `Suggested: pool ${result.capacity.pool} simulators, ${result.capacity.agents} agents.`);
  lines.push('', result.line);
  return lines.join('\n');
}
