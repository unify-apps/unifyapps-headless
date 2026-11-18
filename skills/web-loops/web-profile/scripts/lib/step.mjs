// One WEB step file (loops.web.step/1) from what the probe read in the page and the data-source
// calls browser.mjs recorded. Pure: CLS session windows, INP, long tasks, resources, images and
// data-source duplicates are computed here, where they are tested.
import crypto from 'node:crypto';

export const STEP_SCHEMA = 'loops.web.step/1';
export const STEP_KINDS = ['open', 'interaction'];

const round = (n, places = 0) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10 ** places) / 10 ** places : null);

/** CLS as Chrome reports it: the largest session window (shifts under 1 s apart, a window at most 5 s) without recent input. */
export function clsOf(shifts = []) {
  const counted = shifts.filter((shift) => !shift.hadRecentInput).sort((a, b) => a.at - b.at);
  let best = 0;
  let windowStart = null;
  let previous = null;
  let sum = 0;
  for (const shift of counted) {
    if (windowStart === null || shift.at - previous >= 1000 || shift.at - windowStart >= 5000) { windowStart = shift.at; sum = 0; }
    sum += shift.value;
    previous = shift.at;
    best = Math.max(best, sum);
  }
  return round(best, 4) ?? 0;
}

/**
 * INP from event timing: the longest event of each interaction, then the worst of them (the 98th
 * percentile once there are 50 or more). Without interaction ids, the longest pointer or key
 * event stands in, marked approximate.
 */
export function inpOf(events = []) {
  const byInteraction = new Map();
  for (const event of events) if (event.id) byInteraction.set(event.id, Math.max(byInteraction.get(event.id) ?? 0, event.ms));
  const durations = [...byInteraction.values()].sort((a, b) => b - a);
  if (durations.length) {
    const at = durations.length >= 50 ? Math.floor(durations.length / 50) : 0;
    return { ms: round(durations[at]), interactions: durations.length, approximate: false };
  }
  const inputs = events.filter((event) => /^(pointer|mouse|click|key|touch)/u.test(event.name));
  if (!inputs.length) return { ms: null, interactions: 0, approximate: false };
  return { ms: round(Math.max(...inputs.map((event) => event.ms))), interactions: 0, approximate: true };
}

/** Long tasks (or long animation frames when the long-task observer saw none): longest, count and TBT. */
export function longTasksOf({ longTasks = [], frames = [] }) {
  if (longTasks.length) {
    return { source: 'longtask', count: longTasks.length, longestMs: round(Math.max(...longTasks.map((task) => task.ms))), totalBlockingMs: round(longTasks.reduce((sum, task) => sum + Math.max(0, task.ms - 50), 0)) };
  }
  const long = frames.filter((frame) => frame.ms > 50);
  if (long.length) {
    return { source: 'long-animation-frame', count: long.length, longestMs: round(Math.max(...long.map((frame) => frame.ms))), totalBlockingMs: round(long.reduce((sum, frame) => sum + (frame.blockingMs ?? Math.max(0, frame.ms - 50)), 0)) };
  }
  return { source: 'none', count: 0, longestMs: 0, totalBlockingMs: 0 };
}

const FORMATS = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp', avif: 'avif', gif: 'gif', svg: 'svg', ico: 'ico', bmp: 'bmp' };
/** The image format a path's extension names, or null. */
export function formatOf(pathname) {
  const ext = (/\.([a-z0-9]+)$/iu.exec(String(pathname ?? '')) || [])[1];
  return ext ? FORMATS[ext.toLowerCase()] ?? null : null;
}

/** Resources: count, KB transferred, by type, and the ten largest. */
export function resourcesOf(resources = []) {
  const byType = {};
  let bytes = 0;
  let unknown = 0;
  for (const resource of resources) {
    bytes += resource.transfer;
    if (!resource.transfer && !resource.encoded) unknown += 1;
    const type = resource.type || 'other';
    byType[type] ??= { count: 0, kb: 0 };
    byType[type].count += 1;
    byType[type].kb = round(byType[type].kb + resource.transfer / 1024, 1);
  }
  const largest = [...resources].sort((a, b) => (b.transfer || b.encoded) - (a.transfer || a.encoded)).slice(0, 10)
    .map((resource) => ({ path: resource.path, type: resource.type, kb: round((resource.transfer || resource.encoded) / 1024, 1), ms: resource.ms, sameOrigin: resource.sameOrigin }));
  return { count: resources.length, transferKB: round(bytes / 1024, 1), sizeUnknown: unknown, byType, largest };
}

/** Images: format, KB (from resource timing), shown against natural size; oversized when twice the needed pixels each way. */
export function imagesOf(images = [], resources = [], dpr = 1) {
  const sizeOf = new Map();
  for (const resource of resources) if (resource.path) sizeOf.set(resource.path, resource.transfer || resource.encoded || null);
  return images.map((image) => {
    const bytes = sizeOf.get(image.path) ?? null;
    const needW = image.shown.w * dpr;
    const needH = image.shown.h * dpr;
    const oversized = image.natural.w > 0 && needW > 0 && image.natural.w >= 2 * needW && image.natural.h >= 2 * needH;
    return { path: image.path, format: formatOf(image.path), kb: bytes === null ? null : round(bytes / 1024, 1), bytes, natural: image.natural, shown: image.shown, dpr, oversized, blockId: image.blockId ?? null };
  });
}

const hash = (text) => (text ? crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 12) : null);

/**
 * Data-source calls of the step: browser.mjs `calls` from `startedAt` on, each matched in order
 * to its resource timing entry (by source name) for duration and size. The request body is kept
 * only as a 12-character hash. Duplicates: the same source and body again within 2 s.
 */
export function dataSourcesOf(calls = [], resources = [], startedAt = null) {
  const from = startedAt ? Date.parse(startedAt) : -Infinity;
  const timing = new Map();
  for (const resource of resources) if (resource.source) { if (!timing.has(resource.source)) timing.set(resource.source, []); timing.get(resource.source).push(resource); }
  const list = calls.filter((call) => Date.parse(call.at) >= from).map((call) => {
    const entry = call.name && timing.get(call.name)?.shift();
    const failed = call.status === null || call.status >= 400 || /^failed:/u.test(String(call.resp ?? ''));
    return { name: call.name, status: call.status ?? null, failed, ms: entry ? entry.ms : null, kb: entry ? round((entry.transfer || entry.encoded) / 1024, 1) : null, at: call.at, bodyHash: hash(call.post) };
  });
  const groups = new Map();
  for (const call of list) {
    const key = `${call.name}|${call.bodyHash}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(call);
  }
  const duplicates = [];
  for (const group of groups.values()) {
    const times = group.map((call) => Date.parse(call.at)).sort((a, b) => a - b);
    let repeats = 0;
    for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] <= 2000) repeats += 1;
    if (repeats) duplicates.push({ name: group[0].name, bodyHash: group[0].bodyHash, count: group.length, repeats, atMs: times.map((time) => time - times[0]) });
  }
  const timed = list.filter((call) => typeof call.ms === 'number');
  const slowest = timed.length ? timed.reduce((worst, call) => (call.ms > worst.ms ? call : worst), timed[0]) : null;
  return { count: list.length, failed: list.filter((call) => call.failed).length, duplicateCalls: duplicates.reduce((sum, item) => sum + item.repeats, 0), duplicates, slowest: slowest ? { name: slowest.name, ms: slowest.ms, status: slowest.status } : null, calls: list };
}

/** The step file: { schema, step, kind, run, pageId, …, metrics: { <WEB_METRICS name>: value } }. */
export function buildStep({ raw, calls = [], step, kind, run = 1, startedAt = null, pageId = null, width = null, notes = [] }) {
  if (!STEP_KINDS.includes(kind)) throw new Error(`kind must be one of ${STEP_KINDS.join(', ')}`);
  if (!raw || raw.error) throw new Error(`the probe answered no data: ${raw?.error ?? 'nothing'}`);
  const tasks = longTasksOf(raw);
  const inp = inpOf(raw.events);
  const resources = resourcesOf(raw.resources);
  const dataSources = dataSourcesOf(calls, raw.resources, startedAt);
  const images = imagesOf(raw.images, raw.resources, raw.dpr ?? 1);
  const lcp = raw.lcp?.length ? raw.lcp[raw.lcp.length - 1] : null;
  const open = kind === 'open';
  const heapAfter = raw.memory?.usedMB ?? null;
  const heapBefore = raw.memory?.beforeMB ?? null;
  const allNotes = [...notes];
  if (!raw.settle?.settled) allNotes.push(`the page was still busy when the step was read (${raw.settle?.ms ?? '?'} ms cap)`);
  if (inp.approximate) allNotes.push('no interaction ids in event timing: INP is the longest input event');
  if (tasks.source === 'none') allNotes.push('no long task or long animation frame seen');
  if (raw.inFrame) allNotes.push('the page sits in a frame: navigation timing is the frame\'s');
  const cached = raw.resources?.length ? raw.resources.filter((r) => !r.transfer && r.encoded).length / raw.resources.length : 0;
  const metrics = {
    ttfbMs: open ? round(raw.nav?.ttfb) : null,
    fcpMs: open ? round(raw.fcp) : null,
    lcpMs: open && lcp ? round(lcp.at) : null,
    domContentLoadedMs: open && raw.nav?.dcl ? round(raw.nav.dcl) : null,
    loadMs: open && raw.nav?.load ? round(raw.nav.load) : null,
    cls: clsOf(raw.shifts),
    inpMs: open ? null : inp.ms,
    longestTaskMs: tasks.longestMs,
    totalBlockingTimeMs: tasks.totalBlockingMs,
    dataSourceCalls: dataSources.count,
    duplicateDataSourceCalls: dataSources.duplicateCalls,
    slowestDataSourceMs: dataSources.slowest?.ms ?? null,
    resourceCount: open ? resources.count : null,
    transferKB: open ? resources.transferKB : null,
    jsHeapMB: open ? heapAfter : null,
    jsHeapGrowthMB: !open && heapAfter !== null && heapBefore !== null ? round(heapAfter - heapBefore, 1) : null,
    domNodes: open ? raw.counts?.domNodes ?? null : null,
    mountedBlocks: open ? raw.counts?.blocks ?? null : null,
    oversizedImages: open && raw.images ? images.filter((image) => image.oversized).length : null,
  };
  return {
    schema: STEP_SCHEMA, step, kind, run, pageId: pageId ?? raw.pageIds?.[0] ?? null, startedAt, width, viewport: raw.viewport ?? null,
    cache: cached > 0.5 ? 'warm' : 'cold',
    metrics,
    lcp: lcp ? { ms: round(lcp.at), tag: lcp.tag, blockId: lcp.blockId, url: lcp.url } : null,
    shifts: (raw.shifts ?? []).filter((shift) => !shift.hadRecentInput).map((shift) => ({ at: round(shift.at), value: round(shift.value, 4), blockIds: shift.blockIds })),
    longTasks: tasks, inp, resources, images, dataSources,
    memory: { jsHeapMB: { before: heapBefore, after: heapAfter }, source: raw.memory ? 'performance.memory' : 'none' },
    counts: raw.counts ?? null, settle: raw.settle ?? null, notes: allNotes,
  };
}
