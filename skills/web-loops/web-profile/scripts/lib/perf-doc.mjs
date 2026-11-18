// perf.json for a WEB run: schema loops.perf/1 with "platform": "web", the metric table
// the orchestrator's perf-json.mjs keeps as WEB_METRICS, checked by its checkPerf, rendered
// by the orchestrator's `loops perf render`. Built from the *.web-step.json files of a run folder;
// also turns the metrics past their thresholds into issue findings. Node 22, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA, WEB_METRICS, checkPerf, verdictFor } from '../../../../native-loops/loop-orchestrator/scripts/lib/perf-json.mjs';
import { STEP_SCHEMA } from './step.mjs';

export { WEB_METRICS, checkPerf };

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const median = (values) => {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const worst = (verdicts) => (verdicts.includes('fail') ? 'fail' : verdicts.includes('warn') ? 'warn' : verdicts.includes('pass') ? 'pass' : null);

export const UNMEASURED_WHY = {
  ttfbMs: 'no open step (profile.mjs open)', fcpMs: 'no open step, or no first-contentful-paint entry',
  lcpMs: 'no open step, or no largest-contentful-paint entry (the browser did not report one)',
  domContentLoadedMs: 'no open step with navigation timing', loadMs: 'no open step whose load event ended',
  cls: 'no step file', inpMs: 'no interaction step (profile.mjs step), or no event timing for it',
  longestTaskMs: 'no step file', totalBlockingTimeMs: 'no step file',
  dataSourceCalls: 'no step file', duplicateDataSourceCalls: 'no step file', slowestDataSourceMs: 'no data-source call with resource timing',
  resourceCount: 'no open step', transferKB: 'no open step', jsHeapMB: 'no open step, or performance.memory did not answer',
  jsHeapGrowthMB: 'no interaction step with performance.memory before and after', domNodes: 'no open step', mountedBlocks: 'no open step',
  largestAssetKB: 'no image with a known size (resource timing gave none)', oversizedImages: 'no open step read the images',
};

function walk(dir, depth = 0, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (depth < 4) walk(file, depth + 1, out); } else out.push(file);
  }
  return out;
}
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

/**
 * The `findings` pointer of perf.json: { path (relative to the folder perf.json sits in), count, kinds }
 * for a findings.json (the issue feed array, or { findings: [...] }). `build` and `profile.mjs findings`
 * both write it, so it reads the same whichever ran last.
 */
export function findingsPointer(perfDir, findingsFile, doc) {
  const list = Array.isArray(doc) ? doc : doc?.findings ?? [];
  return { path: path.relative(perfDir, findingsFile).split(path.sep).join('/'), count: list.length, kinds: [...new Set(list.map((item) => item?.kind).filter(Boolean))] };
}

/** Every step file of a run folder, grouped by step name, runs in order. */
export function readSteps(runDir) {
  const files = walk(runDir).filter((file) => file.endsWith('.web-step.json'));
  const byName = new Map();
  for (const file of files) {
    const step = readJson(file);
    if (!step || step.schema !== STEP_SCHEMA || typeof step.step !== 'string') continue;
    if (!byName.has(step.step)) byName.set(step.step, { name: step.step, kind: step.kind, pageId: step.pageId ?? null, files: [], samples: [] });
    const entry = byName.get(step.step);
    entry.files.push(path.relative(runDir, file).split(path.sep).join('/'));
    entry.samples.push(step);
  }
  for (const entry of byName.values()) {
    const order = entry.samples.map((step, at) => ({ step, file: entry.files[at] })).sort((a, b) => (a.step.run ?? 0) - (b.step.run ?? 0));
    entry.samples = order.map((item) => item.step);
    entry.files = order.map((item) => item.file);
  }
  return [...byName.values()];
}

/** perf.json (platform web) for a run folder. Options: app, appName, pages, scope, runId, thresholds, now. */
export function buildWebPerf(runDir, options = {}) {
  const groups = readSteps(runDir);
  const thresholds = options.thresholds ?? {};
  const steps = groups.map((group) => {
    const values = {};
    for (const [name, def] of Object.entries(WEB_METRICS)) {
      if (def.kinds && !def.kinds.includes(group.kind)) continue;
      values[name] = median(group.samples.map((sample) => sample.metrics?.[name]));
    }
    const first = group.samples[0];
    return {
      name: group.name, kind: group.kind, openKind: null, pageId: group.pageId, files: group.files, runs: group.samples.length,
      times: { ttfbMs: values.ttfbMs ?? null, fcpMs: values.fcpMs ?? null, lcpMs: values.lcpMs ?? null, domContentLoadedMs: values.domContentLoadedMs ?? null, loadMs: values.loadMs ?? null, inpMs: values.inpMs ?? null, longestTaskMs: values.longestTaskMs ?? null, totalBlockingTimeMs: values.totalBlockingTimeMs ?? null, cls: values.cls ?? null },
      frames: null,
      requests: { calls: first.dataSources?.count ?? 0, bytes: Math.round((first.dataSources?.calls ?? []).reduce((sum, call) => sum + (call.kb ?? 0), 0) * 1024), failed: first.dataSources?.failed ?? 0, duplicateCalls: first.dataSources?.duplicateCalls ?? 0, duplicates: first.dataSources?.duplicates ?? [] },
      memory: { jsHeapMB: first.memory?.jsHeapMB ?? null, rssPeakMB: null, appGone: false, source: first.memory?.source ?? null },
      counts: { blocks: { total: first.counts?.blocks ?? null, notInTypeMap: null }, domNodes: first.counts?.domNodes ?? null, lists: [], renders: { topBlocks: [], topComponents: [] } },
      resources: first.resources ?? null, lcp: first.lcp ?? null, shifts: first.shifts ?? [], longTasks: first.longTasks ?? null, inp: first.inp ?? null,
      cache: group.samples.map((sample) => sample.cache), viewport: first.viewport ?? null,
      notes: [...new Set(group.samples.flatMap((sample) => sample.notes ?? []))],
      values,
    };
  });

  // Images across the open steps, largest first; one entry per path.
  const seen = new Map();
  for (const group of groups) for (const sample of group.samples) for (const image of sample.images ?? []) if (!seen.has(image.path)) seen.set(image.path, { image, step: group.name, file: group.files[0], pageId: sample.pageId });
  const assets = [...seen.values()].map(({ image, file, pageId }) => {
    const verdict = finite(image.kb) ? verdictFor(image.kb, thresholds.largestAssetKB ?? WEB_METRICS.largestAssetKB) : image.oversized ? 'warn' : null;
    const why = [image.oversized ? `${image.natural.w}×${image.natural.h} shown at ${image.shown.w}×${image.shown.h}` : null, image.format && ['png', 'jpeg', 'gif', 'bmp'].includes(image.format) && finite(image.kb) && image.kb > 100 ? `${image.format}: WebP or AVIF would be smaller` : null].filter(Boolean).join('; ') || null;
    return { uri: image.path, scheme: 'https', component: image.blockId, count: 1, width: image.natural?.w ?? null, height: image.natural?.h ?? null, bytes: image.bytes ?? null, type: null, format: image.format, kb: image.kb, verdict: image.oversized && verdict === 'pass' ? 'warn' : verdict, why, pageId, file };
  }).sort((a, b) => (b.bytes ?? -1) - (a.bytes ?? -1));

  const metrics = {};
  const unmeasured = [];
  for (const [name, def] of Object.entries(WEB_METRICS)) {
    const threshold = { pass: thresholds[name]?.pass ?? def.pass, warn: thresholds[name]?.warn ?? def.warn };
    let samples = [];
    let evidence = null;
    let worstStep = null;
    if (name === 'largestAssetKB') {
      const sized = assets.filter((asset) => finite(asset.kb));
      if (sized.length) { samples = sized.map((asset) => ({ step: asset.uri, value: asset.kb })); evidence = sized[0].file; }
    } else {
      samples = steps.filter((step) => finite(step.values[name])).map((step) => ({ step: step.name, value: step.values[name] }));
      if (samples.length) {
        const top = samples.reduce((m, s) => (s.value > m.value ? s : m), samples[0]);
        worstStep = top.step;
        evidence = steps.find((step) => step.name === top.step)?.files[0] ?? null;
      }
    }
    if (!samples.length) { unmeasured.push({ metric: name, reason: UNMEASURED_WHY[name] }); continue; }
    const value = Math.max(...samples.map((sample) => sample.value));
    metrics[name] = { label: def.label, value: +value.toFixed(def.unit === 'score' ? 4 : 2), unit: def.unit, samples, threshold, verdict: verdictFor(+value.toFixed(def.unit === 'score' ? 4 : 2), threshold), evidence, step: worstStep };
  }
  unmeasured.push({ metric: 'cpu', reason: 'tracing is refused in a signed-in browser (browser.mjs); long tasks stand in for CPU time' });

  const duplicates = steps.flatMap((step) => step.requests.duplicates.map((dup) => ({ method: 'POST', url: '/api/workflow/execute/node', name: dup.name, bodyHash: dup.bodyHash, atMs: dup.atMs, repeats: dup.repeats, count: dup.count, step: step.name })));
  const slowest = groups.flatMap((group) => (group.samples[0].dataSources?.calls ?? []).map((call) => ({ step: group.name, method: 'POST', url: '/api/workflow/execute/node', name: call.name, ms: call.ms, bytes: finite(call.kb) ? Math.round(call.kb * 1024) : null, status: call.status })))
    .filter((call) => finite(call.ms)).sort((a, b) => b.ms - a.ms).slice(0, 10);

  const findingsFile = walk(runDir).filter((file) => path.basename(file) === 'findings.json').sort((a, b) => a.split(path.sep).length - b.split(path.sep).length)[0] ?? null;
  const findingsDoc = findingsFile ? readJson(findingsFile) : null;
  const pages = new Map();
  for (const page of options.pages ?? []) { const id = typeof page === 'string' ? page : page?.id; if (id) pages.set(id, { id, name: typeof page === 'object' ? page.name ?? null : null }); }
  for (const step of steps) if (step.pageId && !pages.has(step.pageId)) pages.set(step.pageId, { id: step.pageId, name: null });
  const notes = ["Times come from the builder preview route in the UnifyApps Headless browser (Chrome for Testing) on this laptop, the saved draft: the platform's builder code loads with the app, so they are not the published app's times."];
  for (const step of steps) for (const note of step.notes) notes.push(`${step.name}: ${note}`);
  if (steps.some((step) => step.cache.includes('warm'))) notes.push('some opens ran on a warm cache (a repeat in the same browser): transfer sizes there are low');
  const viewport = steps.find((step) => step.viewport)?.viewport ?? null;
  const heaps = steps.map((step) => step.memory.jsHeapMB?.after).filter(finite);

  return {
    schema: SCHEMA,
    platform: 'web',
    runId: options.runId ?? path.basename(path.resolve(runDir)),
    generatedAt: options.now ?? new Date().toISOString(),
    scope: options.scope ?? (pages.size > 1 ? 'app' : 'page'),
    app: { id: options.app ?? null, name: options.appName ?? null },
    pages: [...pages.values()],
    device: { name: 'Chrome for Testing', udid: null, runtime: null, model: viewport ? `${viewport.w}×${viewport.h}` : null, platform: 'web', profile: null, buildKind: null, bundleId: null, route: 'preview (saved draft)' },
    mode: 'full',
    verdict: worst(Object.values(metrics).map((metric) => metric.verdict)),
    metrics,
    steps: steps.map(({ values, ...rest }) => rest),
    network: { calls: steps.reduce((sum, step) => sum + step.requests.calls, 0), bytes: steps.reduce((sum, step) => sum + step.requests.bytes, 0), failed: steps.reduce((sum, step) => sum + step.requests.failed, 0), duplicates, slowest },
    frames: null,
    memory: { samples: [], trends: [], leakSuspect: false, jsHeapPeakMB: heaps.length ? Math.max(...heaps) : null, rssPeakMB: null, appGone: false },
    assets,
    rerenders: [],
    lists: [],
    cpu: { profiles: [], topGroups: [], devOnlyPctMax: null },
    duplicates,
    profiles: [],
    leaks: [],
    findings: findingsFile ? findingsPointer(runDir, findingsFile, findingsDoc) : null,
    notes,
    unmeasured,
  };
}

const FIX = {
  ttfbMs: 'the preview host answered slowly: measure again; a slow first byte is rarely the page config',
  fcpMs: 'static chrome first: header and layout blocks without data, a loader over every data region (X1)',
  lcpMs: 'the largest block waits on data or a big image: fetch it first, keep it small, or show a placeholder of the same size',
  domContentLoadedMs: 'heavy custom code in the page or app header: defer it',
  loadMs: 'many or large assets on open: lazy-load images below the fold',
  cls: 'blocks that move once data arrives: give data regions a fixed or minimum height, and images their size',
  inpMs: 'the interaction runs long work before the next paint: lighter onClick logic, fewer variable writes per click, debounce typing',
  longestTaskMs: 'one long main-thread task: a big JS transform or a long list rendered at once (page it, or virtualise)',
  totalBlockingTimeMs: 'long tasks add up: split heavy page functions, render fewer blocks on open',
  dataSourceCalls: 'many sources on open: merge sources that read the same object, defer what waits one click away (P3)',
  duplicateDataSourceCalls: 'one source fires twice: an on-load fetch and a variable change both trigger it, or two blocks bind it (P10)',
  slowestDataSourceMs: 'one slow source: page it, filter on the server, or move its work into one automation call',
  resourceCount: 'many requests on open: fewer images and icons above the fold',
  transferKB: 'heavy page: compress images, lazy-load what is below the fold',
  jsHeapMB: 'large data held in the page: page lists, keep only the fields shown',
  jsHeapGrowthMB: 'memory grows per interaction: variables that copy whole rows (P14)',
  domNodes: 'many elements: page or virtualise long lists, remove hidden blocks',
  mountedBlocks: 'many blocks mounted: page long lists (P6), drop blocks nothing shows',
  largestAssetKB: 'a large image: serve it at its shown size, as WebP or AVIF',
  oversizedImages: 'images far bigger than shown: serve them at their shown size',
};

/**
 * Metrics past pass as issue findings (warn minor, fail major), worst first, with the feed keys
 * a fix run reads from findings.json: rank, metric and gain.
 */
export function perfFindings(perf) {
  const out = [];
  for (const [name, metric] of Object.entries(perf.metrics ?? {})) {
    if (metric.verdict !== 'warn' && metric.verdict !== 'fail') continue;
    const step = (perf.steps ?? []).find((item) => item.name === metric.step) ?? null;
    let where = { blockId: null, blockType: null, what: metric.step ? `step ${metric.step}` : 'the page' };
    if (name === 'lcpMs' && step?.lcp) where = { blockId: step.lcp.blockId, blockType: step.lcp.tag, what: `largest paint (${step.lcp.tag ?? 'element'})` };
    if (name === 'cls' && step?.shifts?.length) where = { blockId: step.shifts.flatMap((shift) => shift.blockIds ?? [])[0] ?? null, blockType: null, what: 'shifting block' };
    if (name === 'duplicateDataSourceCalls') where = { blockId: null, blockType: null, what: `data source ${(perf.duplicates ?? []).filter((dup) => dup.step === metric.step).map((dup) => dup.name).join(', ') || '?'}` };
    if (name === 'slowestDataSourceMs') where = { blockId: null, blockType: null, what: `data source ${(perf.network?.slowest ?? []).find((call) => call.step === metric.step)?.name ?? '?'}` };
    if (name === 'largestAssetKB' || name === 'oversizedImages') {
      const asset = (perf.assets ?? []).find((item) => item.verdict === 'fail' || item.verdict === 'warn');
      if (asset) where = { blockId: asset.component, blockType: null, what: `image ${asset.uri?.split('/').pop() ?? ''}` };
    }
    out.push({
      ...where, inPage: true, rule: name, severity: metric.verdict === 'fail' ? 'major' : 'minor', kind: 'performance',
      expected: `${metric.label} ≤ ${metric.threshold.pass} ${metric.unit} (warn to ${metric.threshold.warn})`,
      actual: `${metric.value} ${metric.unit}${metric.step ? ` on ${metric.step}` : ''}`,
      evidence: `${metric.evidence ?? 'perf.json'}#metrics.${name}`, fix: FIX[name] ?? '—',
      metric: { id: name, value: metric.value, unit: metric.unit, step: metric.step }, gain: 'GUESS: under the pass threshold once fixed',
      _score: (metric.verdict === 'fail' ? 2 : 1) + metric.value / (metric.threshold.warn || 1),
    });
  }
  out.sort((a, b) => b._score - a._score);
  return out.map(({ _score, ...rest }, index) => ({ ...rest, rank: index + 1 }));
}
