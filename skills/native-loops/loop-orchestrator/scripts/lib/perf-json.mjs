#!/usr/bin/env node
// perf.json (schema loops.perf/1): the metric tables, the verdict rule and the check of the file.
// web-profile's profile.mjs builds a WEB run's file; `loops.mjs perf render` checks it with
// checkPerf and turns it into perf-report.html. Node 22, no dependencies.
// `platform` says whose metric table applies: `web`, or `mobile` (a file without the field).
import fs from 'node:fs';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const SCHEMA = 'loops.perf/1';
export const VERDICTS = ['pass', 'warn', 'fail'];
const PROFILES = ['release', null];
const BUILD_KINDS = ['release-embedded', null];
const PLATFORMS = ['ios', 'android', null];

const OPEN_KINDS = ['open', 'hop', 'tab', 'back', 'foreground'];
const NAV_KINDS = ['open', 'hop', 'back'];

// Lower is better for every metric. Thresholds are starting points read on a simulator.
export const METRICS = {
  ttrMs: { unit: 'ms', pass: 1000, warn: 2500, kinds: OPEN_KINDS, label: 'Time to render (first commit with data)' },
  ttiMs: { unit: 'ms', pass: 2000, warn: 5000, kinds: OPEN_KINDS, label: 'Time to interactive' },
  transitionMs: { unit: 'ms', pass: 300, warn: 1000, kinds: NAV_KINDS, label: 'Page transition (tap to new route rendered)' },
  longestFreezeMs: { unit: 'ms', pass: 200, warn: 700, label: 'Longest JS freeze' },
  framesDroppedPct: { unit: '%', pass: 5, warn: 15, label: 'JS frames dropped' },
  requests: { unit: 'count', pass: 6, warn: 12, label: 'Network calls in one step' },
  duplicateRequests: { unit: 'count', pass: 0, warn: 2, label: 'Duplicate calls in one step' },
  requestKB: { unit: 'KB', pass: 200, warn: 1000, label: 'Bytes received in one step' },
  jsHeapGrowthMB: { unit: 'MB', pass: 10, warn: 50, label: 'JS heap growth in one step' },
  memorySlopeMB: { unit: 'MB', pass: 0.5, warn: 1, label: 'Memory growth per repeat of a route' },
  mountedBlocks: { unit: 'count', pass: 400, warn: 1500, label: 'Mounted block instances' },
  unvirtualisedLists: { unit: 'count', pass: 0, warn: 0, label: 'Lists that mount every row' },
  maxBlockRenders: { unit: 'count', pass: 3, warn: 10, label: 'Re-renders of one block in one step' },
  largestAssetKB: { unit: 'KB', pass: 200, warn: 500, label: 'Largest image' },
};

// A WEB page in the UnifyApps Headless browser (web-profile). Lower is better here too. Core Web Vitals
// thresholds for LCP, CLS and INP; the rest are starting points read on the builder preview route.
// `kinds` is the step kinds that measure a metric: an open (a fresh load of the page) or an interaction.
const WEB_OPEN = ['open'];
const WEB_INTERACTION = ['interaction'];
const WEB_ANY = ['open', 'interaction'];
export const WEB_METRICS = {
  ttfbMs: { unit: 'ms', pass: 800, warn: 1800, kinds: WEB_OPEN, label: 'Time to first byte' },
  fcpMs: { unit: 'ms', pass: 1800, warn: 3000, kinds: WEB_OPEN, label: 'First contentful paint' },
  lcpMs: { unit: 'ms', pass: 2500, warn: 4000, kinds: WEB_OPEN, label: 'Largest contentful paint' },
  domContentLoadedMs: { unit: 'ms', pass: 2000, warn: 4000, kinds: WEB_OPEN, label: 'DOMContentLoaded' },
  loadMs: { unit: 'ms', pass: 3000, warn: 6000, kinds: WEB_OPEN, label: 'Load event' },
  cls: { unit: 'score', pass: 0.1, warn: 0.25, kinds: WEB_ANY, label: 'Cumulative layout shift (largest session window)' },
  inpMs: { unit: 'ms', pass: 200, warn: 500, kinds: WEB_INTERACTION, label: 'Interaction to next paint' },
  longestTaskMs: { unit: 'ms', pass: 200, warn: 700, kinds: WEB_ANY, label: 'Longest main-thread task' },
  totalBlockingTimeMs: { unit: 'ms', pass: 200, warn: 600, kinds: WEB_ANY, label: 'Total blocking time (long tasks past 50 ms)' },
  dataSourceCalls: { unit: 'count', pass: 6, warn: 12, kinds: WEB_ANY, label: 'Data-source calls in one step' },
  duplicateDataSourceCalls: { unit: 'count', pass: 0, warn: 2, kinds: WEB_ANY, label: 'Duplicate data-source calls in one step' },
  slowestDataSourceMs: { unit: 'ms', pass: 1000, warn: 3000, kinds: WEB_ANY, label: 'Slowest data-source call in one step' },
  resourceCount: { unit: 'count', pass: 150, warn: 300, kinds: WEB_OPEN, label: 'Resources loaded on open' },
  transferKB: { unit: 'KB', pass: 1600, warn: 5000, kinds: WEB_OPEN, label: 'Bytes transferred on open' },
  jsHeapMB: { unit: 'MB', pass: 100, warn: 250, kinds: WEB_OPEN, label: 'JS heap after open' },
  jsHeapGrowthMB: { unit: 'MB', pass: 10, warn: 50, kinds: WEB_INTERACTION, label: 'JS heap growth in one step' },
  domNodes: { unit: 'count', pass: 1500, warn: 3000, kinds: WEB_OPEN, label: 'DOM elements in the app' },
  mountedBlocks: { unit: 'count', pass: 400, warn: 1500, kinds: WEB_OPEN, label: 'Mounted block instances' },
  largestAssetKB: { unit: 'KB', pass: 200, warn: 500, kinds: WEB_ANY, label: 'Largest image' },
  oversizedImages: { unit: 'count', pass: 0, warn: 2, kinds: WEB_OPEN, label: 'Images over twice their shown size' },
};

export const PERF_PLATFORMS = ['mobile', 'web'];
/** The metric table a perf.json of `platform` answers to (a file without one is mobile). */
export const metricsFor = (platform) => (platform === 'web' ? WEB_METRICS : METRICS);

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export function verdictFor(value, { pass, warn }) {
  if (!finite(value)) return null;
  if (value <= pass) return 'pass';
  if (value <= warn) return 'warn';
  return 'fail';
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// --- check -------------------------------------------------------------------------------------

export function checkPerf(doc, { runDir = null } = {}) {
  const problems = [];
  const bad = (msg) => problems.push(msg);
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(doc)) return ['not a JSON object'];
  if (doc.schema !== SCHEMA) bad(`schema must be "${SCHEMA}"`);
  const platform = doc.platform ?? 'mobile';
  if (!PERF_PLATFORMS.includes(platform)) bad('platform must be mobile or web');
  const table = metricsFor(platform);
  if (typeof doc.runId !== 'string' || !doc.runId) bad('runId must be a non-empty string');
  if (typeof doc.generatedAt !== 'string' || Number.isNaN(Date.parse(doc.generatedAt))) bad('generatedAt must be an ISO time');
  if (!['page', 'app'].includes(doc.scope)) bad('scope must be page or app');
  if (!isObj(doc.app) || !('id' in doc.app)) bad('app must be an object with id');
  if (!Array.isArray(doc.pages) || doc.pages.some((p) => !isObj(p) || typeof p.id !== 'string')) bad('pages must be a list of { id }');
  if (!isObj(doc.device)) bad('device must be an object');
  else {
    if (!PROFILES.includes(doc.device.profile ?? null)) bad('device.profile must be release or null');
    if (!BUILD_KINDS.includes(doc.device.buildKind ?? null)) bad('device.buildKind must be release-embedded or null');
    if (platform === 'web' ? !['web', null].includes(doc.device.platform ?? null) : !PLATFORMS.includes(doc.device.platform ?? null)) bad(platform === 'web' ? 'device.platform must be web or null on a web perf.json' : 'device.platform must be ios, android or null');
  }
  if (doc.verdict !== null && !VERDICTS.includes(doc.verdict)) bad('verdict must be pass, warn, fail or null');
  if (!['full', 'release-subset'].includes(doc.mode)) bad('mode must be full or release-subset');
  for (const key of ['duplicates', 'profiles', 'leaks']) if (!Array.isArray(doc[key])) bad(`${key} must be a list`);
  if (!isObj(doc.metrics)) bad('metrics must be an object');
  const evidence = [];
  for (const [name, m] of Object.entries(isObj(doc.metrics) ? doc.metrics : {})) {
    const at = `metrics.${name}`;
    if (!isObj(m)) { bad(`${at} must be an object`); continue; }
    if (!finite(m.value)) bad(`${at}.value must be a number`);
    if (typeof m.unit !== 'string' || !m.unit) bad(`${at}.unit must be set`);
    if (!Array.isArray(m.samples) || !m.samples.length || m.samples.some((s) => !isObj(s) || !finite(s.value))) bad(`${at}.samples must be a non-empty list of { step, value }`);
    if (!isObj(m.threshold) || !finite(m.threshold.pass) || !finite(m.threshold.warn) || m.threshold.warn < m.threshold.pass) bad(`${at}.threshold needs pass <= warn`);
    if (!VERDICTS.includes(m.verdict)) bad(`${at}.verdict must be pass, warn or fail`);
    else if (finite(m.value) && isObj(m.threshold) && verdictFor(m.value, m.threshold) !== m.verdict) bad(`${at}.verdict ${m.verdict} does not match value ${m.value} against its threshold`);
    if (m.evidence !== null && typeof m.evidence !== 'string') bad(`${at}.evidence must be a path or null`);
    if (typeof m.evidence === 'string') evidence.push([at, m.evidence]);
  }
  if (!Array.isArray(doc.unmeasured) || doc.unmeasured.some((u) => !isObj(u) || !u.metric || !u.reason)) bad('unmeasured must be a list of { metric, reason }');
  else {
    const listed = new Set(doc.unmeasured.map((u) => u.metric));
    for (const name of Object.keys(table)) if (!(name in (doc.metrics ?? {})) && !listed.has(name)) bad(`metric ${name} is neither measured nor listed in unmeasured`);
  }
  if (!Array.isArray(doc.steps) || doc.steps.some((s) => !isObj(s) || typeof s.name !== 'string' || !Array.isArray(s.files) || !isObj(s.times))) bad('steps must be a list of { name, kind, files, times }');
  else for (const s of doc.steps) for (const f of s.files) evidence.push([`steps.${s.name}`, f]);
  if (!isObj(doc.network) || !finite(doc.network.calls) || !finite(doc.network.bytes) || !Array.isArray(doc.network.duplicates)) bad('network needs calls, bytes and duplicates[]');
  if (doc.frames !== null && (!isObj(doc.frames) || !finite(doc.frames.dropped) || !finite(doc.frames.total) || !finite(doc.frames.worstGapMs))) bad('frames must be null or { dropped, total, worstGapMs }');
  if (!isObj(doc.memory) || !Array.isArray(doc.memory.samples) || typeof doc.memory.leakSuspect !== 'boolean') bad('memory needs samples[] and leakSuspect');
  for (const key of ['assets', 'rerenders', 'lists']) if (!Array.isArray(doc[key])) bad(`${key} must be a list`);
  if (Array.isArray(doc.assets)) doc.assets.forEach((a, i) => { if (a.verdict !== null && !VERDICTS.includes(a.verdict)) bad(`assets[${i}].verdict must be pass, warn, fail or null`); });
  if (!isObj(doc.cpu) || !Array.isArray(doc.cpu.profiles) || !Array.isArray(doc.cpu.topGroups)) bad('cpu needs profiles[] and topGroups[]');
  if (doc.findings !== null && (!isObj(doc.findings) || typeof doc.findings.path !== 'string' || !finite(doc.findings.count))) bad('findings must be null or { path, count }');
  if (doc.findings?.path) evidence.push(['findings', doc.findings.path]);
  if (!Array.isArray(doc.notes) || doc.notes.some((n) => typeof n !== 'string')) bad('notes must be a list of strings');
  if (runDir) {
    for (const [at, file] of evidence) {
      if (path.isAbsolute(file)) bad(`${at}: ${file} must be relative to the run folder`);
      else if (!fs.existsSync(path.join(runDir, file))) bad(`${at}: ${file} does not exist in the run folder`);
    }
  }
  return problems;
}

// --- CLI ---------------------------------------------------------------------------------------

const HELP = `Usage:
  node perf-json.mjs check <perf.json> [--run <dir>] [--json]

check   Validates a perf.json: shape, verdicts against thresholds, every metric of its platform's
        table measured or listed in unmeasured, and with --run every evidence path present. A
        "platform": "web" file (web-profile's profile.mjs build) answers to the WEB table:
        ${Object.keys(WEB_METRICS).join(', ')}.

Exit codes: 0 ok, 1 check found problems or a file could not be read, 2 usage.`;

async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: { run: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
  });
  const [command, file] = positionals;
  if (values.help || !command) { console.log(HELP); return values.help ? 0 : 2; }
  if (command === 'check') {
    if (!file) { console.error('check needs <perf.json>'); return 2; }
    const doc = readJson(file);
    const problems = doc ? checkPerf(doc, { runDir: values.run ?? null }) : [`${file} is not readable JSON`];
    if (values.json) console.log(JSON.stringify({ ok: !problems.length, problems }));
    else console.log(problems.length ? problems.join('\n') : `ok: ${Object.keys(doc.metrics).length} metrics, verdict ${doc.verdict ?? 'none'}`);
    return problems.length ? 1 : 0;
  }
  console.error(`unknown command "${command}" (check)`);
  return 2;
}

// Compare real paths: Node resolves the main module through symlinks, argv[1] does not.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => { console.error(`error: ${error.message}`); process.exit(1); });
}
