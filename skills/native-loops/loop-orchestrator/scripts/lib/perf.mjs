// `perf render`: perf.json → perf-report.html from templates/perf-report.html.
//
// perf.json is schema `loops.perf/1`, checked by perf-json.mjs beside this file (documented in
// references/perf-json.md; templates/perf.schema.json mirrors it). A WEB run's file is built by
// web-profile's profile.mjs build, with "platform": "web" and the WEB metric table (no frames, no
// CPU profiles; per-step LCP, long tasks, INP and resources instead). The render checks it with
// checkPerf, then fills the template with the run's metrics (value, unit, pass/warn threshold, verdict, worst step, evidence), the steps,
// network, frames, memory trends, assets, re-renders, lists, CPU groups, notes, what was not
// measured, and the findings (issues) from the findings.json it points at. Nested sections are read
// (network.duplicates, cpu.profiles, memory.trends); the flat aliases are not needed here.
//
// Pure: the same perf.json (and findings.json) gives byte-identical output — no clock, keys
// sorted, numbers normalised (render.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { failed, missing, usage } from './output.mjs';
import { PLUGIN_ROOT, readJson, writeText } from './paths.mjs';
import { fill, readTemplate } from './render.mjs';

export const PERF_SCHEMA = 'loops.perf/1';
export const PERF_JSON_SCRIPT = path.join(PLUGIN_ROOT, 'skills', 'native-loops', 'loop-orchestrator', 'scripts', 'lib', 'perf-json.mjs');
// The metric order of perf-json.mjs METRICS (mobile) and WEB_METRICS (web); a metric not listed
// sorts after these by name.
export const METRIC_ORDER = ['ttrMs', 'ttiMs', 'transitionMs', 'longestFreezeMs', 'framesDroppedPct', 'requests', 'duplicateRequests', 'requestKB',
  'jsHeapGrowthMB', 'memorySlopeMB', 'mountedBlocks', 'unvirtualisedLists', 'maxBlockRenders', 'largestAssetKB'];
export const WEB_METRIC_ORDER = ['ttfbMs', 'fcpMs', 'lcpMs', 'domContentLoadedMs', 'loadMs', 'cls', 'inpMs', 'longestTaskMs', 'totalBlockingTimeMs',
  'dataSourceCalls', 'duplicateDataSourceCalls', 'slowestDataSourceMs', 'resourceCount', 'transferKB', 'jsHeapMB', 'jsHeapGrowthMB', 'domNodes',
  'mountedBlocks', 'largestAssetKB', 'oversizedImages'];
/** Pure: a perf.json's platform; a file without one is mobile. */
export const platformOf = (perf) => (perf?.platform === 'web' ? 'web' : 'mobile');
export const metricOrder = (platform) => (platform === 'web' ? WEB_METRIC_ORDER : METRIC_ORDER);
const VERDICT_RANK = { fail: 0, warn: 1, pass: 2 };
const SEVERITY_RANK = { critical: 0, major: 1, high: 1, minor: 2, medium: 2, low: 3 };

/** The check of perf-json.mjs, or a minimal one when that block is not installed beside us. */
export async function loadCheck() {
  try {
    const mod = await import(pathToFileURL(PERF_JSON_SCRIPT).href);
    if (typeof mod.checkPerf === 'function') return (doc) => mod.checkPerf(doc);
  } catch {
    // fall through
  }
  return (doc) => {
    const problems = [];
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['not a JSON object'];
    if (doc.schema !== PERF_SCHEMA) problems.push(`schema must be "${PERF_SCHEMA}"`);
    if (!doc.metrics || typeof doc.metrics !== 'object') problems.push('metrics must be an object');
    if (!Array.isArray(doc.steps)) problems.push('steps must be a list');
    return problems;
  };
}

const metricIndexIn = (name, order = METRIC_ORDER) => {
  const index = order.indexOf(name);
  return index < 0 ? order.length : index;
};

/** Pure: the findings (issues) of findings.json, whichever of its two shapes. */
export function normaliseFindings(doc) {
  const list = Array.isArray(doc) ? doc : Array.isArray(doc?.findings) ? doc.findings : [];
  const fallbackPage = Array.isArray(doc) ? null : doc?.pageId ?? null;
  return list.filter((item) => item && typeof item === 'object').map((item, index) => {
    const evidence = Array.isArray(item.evidence)
      ? item.evidence.map((entry) => (typeof entry === 'string' ? entry : [entry?.type, entry?.detail, entry?.source].filter(Boolean).join(': '))).join(' · ')
      : item.evidence ?? null;
    const what = item.actual ? `${item.region ? `${item.region}: ` : ''}${item.actual}` : item.title ?? item.region ?? null;
    return {
      id: String(item.id ?? `f${index + 1}`),
      rank: Number.isFinite(item.rank) ? item.rank : null,
      severity: item.severity ?? item.risk?.level ?? null,
      kind: item.kind ?? null,
      page: item.page ?? item.targets?.pageIds?.join(', ') ?? fallbackPage,
      what,
      expected: item.expected ?? null,
      evidence,
      fix: item.fix ?? null,
      metric: item.metric && typeof item.metric === 'object' ? `${item.metric.id ?? ''} ${item.metric.value ?? ''} ${item.metric.unit ?? ''}`.trim() : null,
      gain: item.gain ?? null,
      needsCode: item.needsCode === true,
      owner: item.owner ?? null,
    };
  }).sort((left, right) => (left.rank ?? 1e9) - (right.rank ?? 1e9)
    || (SEVERITY_RANK[left.severity] ?? 9) - (SEVERITY_RANK[right.severity] ?? 9) || left.id.localeCompare(right.id));
}

/** Pure: perf.json (+ findings.json) → the data the template draws. */
export function perfReportData(perf, findingsDoc = null) {
  const platform = platformOf(perf);
  const order = metricOrder(platform);
  const metricIndex = (name) => metricIndexIn(name, order);
  const metrics = Object.entries(perf.metrics ?? {})
    .map(([name, metric]) => ({
      name, label: metric.label ?? name, value: metric.value ?? null, unit: metric.unit ?? '', pass: metric.threshold?.pass ?? null, warn: metric.threshold?.warn ?? null,
      verdict: metric.verdict ?? null, step: metric.step ?? null, evidence: metric.evidence ?? null,
      samples: (metric.samples ?? []).map((sample) => ({ step: sample.step ?? null, value: sample.value ?? null })),
    }))
    .sort((left, right) => metricIndex(left.name) - metricIndex(right.name) || left.name.localeCompare(right.name));
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const metric of metrics) if (metric.verdict in counts) counts[metric.verdict] += 1;
  const worstFirst = [...metrics].filter((metric) => metric.verdict === 'fail' || metric.verdict === 'warn')
    .sort((left, right) => VERDICT_RANK[left.verdict] - VERDICT_RANK[right.verdict] || metricIndex(left.name) - metricIndex(right.name));
  const steps = (perf.steps ?? []).map((step) => ({
    name: step.name, kind: step.kind ?? null, openKind: step.openKind ?? null, pageId: step.pageId ?? null, runs: step.runs ?? null,
    times: step.times ?? {}, frames: step.frames ?? null,
    requests: step.requests ? { calls: step.requests.calls ?? null, bytes: step.requests.bytes ?? null, failed: step.requests.failed ?? null, duplicateCalls: step.requests.duplicateCalls ?? null } : null,
    heapBeforeMB: step.memory?.jsHeapMB?.before ?? null, heapAfterMB: step.memory?.jsHeapMB?.after ?? null, rssPeakMB: step.memory?.rssPeakMB ?? null, appGone: step.memory?.appGone ?? false,
    blocks: step.counts?.blocks?.total ?? null, notes: step.notes ?? [],
    // WEB only: what web-profile measured per step in place of frames and a CPU profile.
    ...(platform === 'web' ? {
      domNodes: step.counts?.domNodes ?? null,
      lcp: step.lcp ? { ms: step.lcp.ms ?? null, tag: step.lcp.tag ?? null, blockId: step.lcp.blockId ?? null } : null,
      longTasks: step.longTasks ? { source: step.longTasks.source ?? null, count: step.longTasks.count ?? null, longestMs: step.longTasks.longestMs ?? null, totalBlockingMs: step.longTasks.totalBlockingMs ?? null } : null,
      inp: step.inp ? { ms: step.inp.ms ?? null, interactions: step.inp.interactions ?? null, approximate: step.inp.approximate === true } : null,
      resources: step.resources ? { count: step.resources.count ?? null, transferKB: step.resources.transferKB ?? null, largest: (step.resources.largest ?? []).slice(0, 5) } : null,
      cache: step.cache ?? [], viewport: step.viewport ?? null,
    } : {}),
  }));
  const memory = perf.memory ?? {};
  const findings = findingsDoc ? normaliseFindings(findingsDoc) : [];
  return {
    schema: 'loops.perf-report/1',
    // Only a WEB report says so: a MOBILE report's data stays what it was before WEB, byte for byte.
    ...(platform === 'web' ? { platform } : {}),
    run: { id: perf.runId ?? null, generatedAt: perf.generatedAt ?? null, scope: perf.scope ?? null, mode: perf.mode ?? null, verdict: perf.verdict ?? null },
    app: perf.app ?? null,
    pages: perf.pages ?? [],
    device: perf.device ?? null,
    summary: { metrics: metrics.length, ...counts, unmeasured: (perf.unmeasured ?? []).length, findings: findings.length, worst: worstFirst.slice(0, 4).map((metric) => ({ name: metric.name, label: metric.label, value: metric.value, unit: metric.unit, verdict: metric.verdict, step: metric.step })) },
    metrics,
    unmeasured: [...(perf.unmeasured ?? [])].sort((left, right) => metricIndex(left.metric) - metricIndex(right.metric) || String(left.metric).localeCompare(String(right.metric))),
    steps,
    network: { calls: perf.network?.calls ?? null, bytes: perf.network?.bytes ?? null, failed: perf.network?.failed ?? null, duplicates: perf.network?.duplicates ?? [], slowest: perf.network?.slowest ?? [] },
    frames: perf.frames ?? null,
    memory: { leakSuspect: memory.leakSuspect ?? false, jsHeapPeakMB: memory.jsHeapPeakMB ?? null, rssPeakMB: memory.rssPeakMB ?? null, appGone: memory.appGone ?? false, trends: memory.trends ?? [], samples: (memory.samples ?? []).length },
    assets: perf.assets ?? [],
    rerenders: perf.rerenders ?? [],
    lists: perf.lists ?? [],
    cpu: { topGroups: perf.cpu?.topGroups ?? [], devOnlyPctMax: perf.cpu?.devOnlyPctMax ?? null, profiles: perf.cpu?.profiles ?? [] },
    findings,
    findingsSource: perf.findings ?? null,
    notes: perf.notes ?? [],
  };
}

export async function renderPerf({ input, out }) {
  if (!input) throw usage('perf render needs perf.json or its folder: perf render <run>/findings/perf.json');
  const resolved = path.resolve(input);
  let file = resolved;
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    file = [path.join(resolved, 'perf.json'), path.join(resolved, 'findings', 'perf.json')].find((candidate) => fs.existsSync(candidate)) ?? path.join(resolved, 'perf.json');
  }
  if (!fs.existsSync(file)) throw missing(`no perf.json at ${file}`);
  const perf = readJson(file);
  if (!perf) throw failed(`${file} is not valid JSON`);
  const problems = (await loadCheck())(perf);
  if (problems.length) throw failed(`${file} does not match ${PERF_SCHEMA}:\n${problems.map((line) => `  ${line}`).join('\n')}`, { problems });
  const findingsFile = typeof perf.findings?.path === 'string' ? path.resolve(path.dirname(file), perf.findings.path) : null;
  const findingsDoc = findingsFile && fs.existsSync(findingsFile) ? readJson(findingsFile) : null;
  const data = perfReportData(perf, findingsDoc);
  const target = out ? path.resolve(out) : path.join(path.dirname(file), 'perf-report.html');
  writeText(target, fill(readTemplate('perf-report.html'), data));
  const { pass, warn, fail } = data.summary;
  return { data: { file: target, verdict: data.run.verdict, summary: data.summary }, text: `Perf report: ${target}\nVerdict ${data.run.verdict ?? '—'}: ${fail} fail, ${warn} warn, ${pass} pass; ${data.summary.unmeasured} unmeasured; ${data.findings.length} findings.` };
}
