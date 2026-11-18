// WEB runtime perf read INSIDE the page through web-browser's evalIn (each function is sent as
// source text; `ctx` and `H` are web-browser's pageContext and helpers). Tracing is refused in a
// signed-in browser, so everything comes from buffered PerformanceObservers and the performance
// timeline: navigation and paint timing, LCP, layout shifts, long tasks (or long animation
// frames), event timing for INP, resource timing, images, performance.memory and DOM counts.

/** Starts the observers (buffered, so a page already loaded still reports its load). */
export function installProbe(ctx, H) {
  const win = ctx.win;
  const old = win.__uaPerf;
  if (old && old.observers) for (const observer of old.observers) observer.disconnect();
  const state = { lcp: [], shifts: [], longTasks: [], frames: [], events: [], observers: [], mark: 0, heapBefore: null, resourcesBefore: 0 };
  win.__uaPerf = state;
  const supported = (win.PerformanceObserver && win.PerformanceObserver.supportedEntryTypes) || [];
  // Chrome keeps 250 resource entries by default; a builder preview can fill that before the step's calls.
  try { win.performance.setResourceTimingBufferSize(5000); } catch (error) { /* older browser */ }
  const blockOf = (node) => {
    const el = node && node.nodeType === 1 ? node : node && node.parentElement;
    const b = el && el.closest ? el.closest('[data-block-id]') : null;
    return b ? b.getAttribute('data-block-id') : null;
  };
  const observe = (type, handle, extra) => {
    if (!supported.includes(type)) return false;
    try {
      const observer = new win.PerformanceObserver((list) => { for (const entry of list.getEntries()) handle(entry); });
      observer.observe({ type, buffered: true, ...(extra || {}) });
      state.observers.push(observer);
      return true;
    } catch (error) { return false; }
  };
  const on = {
    lcp: observe('largest-contentful-paint', (e) => state.lcp.push({ at: e.startTime, size: e.size, tag: e.element ? e.element.tagName.toLowerCase() : null, blockId: blockOf(e.element), url: e.url ? H.pathOnly(e.url) : null })),
    shifts: observe('layout-shift', (e) => state.shifts.push({ at: e.startTime, value: e.value, hadRecentInput: e.hadRecentInput, blockIds: (e.sources || []).map((s) => blockOf(s.node)).filter(Boolean).slice(0, 5) })),
    longTasks: observe('longtask', (e) => state.longTasks.push({ at: e.startTime, ms: e.duration })),
    frames: observe('long-animation-frame', (e) => state.frames.push({ at: e.startTime, ms: e.duration, blockingMs: e.blockingDuration || 0 })),
    events: observe('event', (e) => state.events.push({ name: e.name, id: e.interactionId || 0, at: e.startTime, ms: e.duration, inputDelayMs: e.processingStart - e.startTime, processingMs: e.processingEnd - e.processingStart, blockId: blockOf(e.target) }), { durationThreshold: 16 }),
  };
  return { observing: on, supported: supported.filter((type) => ['largest-contentful-paint', 'layout-shift', 'longtask', 'long-animation-frame', 'event', 'paint', 'navigation', 'resource'].includes(type)), at: win.performance.now() };
}

/** Marks the start of an interaction step: what came before it is not the step's. */
export function markStep(ctx) {
  const win = ctx.win;
  const state = win.__uaPerf;
  if (!state) return { error: 'no probe: run installProbe first (profile.mjs open does)' };
  state.mark = win.performance.now();
  state.heapBefore = win.performance.memory ? win.performance.memory.usedJSHeapSize : null;
  state.resourcesBefore = win.performance.getEntriesByType('resource').length;
  return { mark: state.mark };
}

/**
 * Waits until the page is quiet (no new resource, long task, frame or shift for quietMs, at most
 * capMs), then answers what happened since `opts.since` ("navigation" or "mark").
 */
export async function collectStep(ctx, H, opts) {
  const win = ctx.win;
  const perf = win.performance;
  const state = win.__uaPerf;
  if (!state) return { error: 'no probe: run installProbe first (profile.mjs open does)' };
  const quietMs = opts.quietMs || 600;
  const capMs = opts.capMs || 10000;
  const started = Date.now();
  const activity = () => perf.getEntriesByType('resource').length + state.longTasks.length + state.frames.length + state.shifts.length + state.lcp.length + state.events.length;
  let last = activity();
  let quietSince = Date.now();
  while (Date.now() - started < capMs) {
    await new Promise((done) => setTimeout(done, 100));
    const now = activity();
    if (now !== last) { last = now; quietSince = Date.now(); }
    if (Date.now() - quietSince >= quietMs) break;
  }
  const since = opts.since === 'mark' ? state.mark : 0;
  const after = (list) => list.filter((entry) => entry.at >= since);
  const nav = perf.getEntriesByType('navigation')[0] || null;
  const paint = perf.getEntriesByType('paint').find((entry) => entry.name === 'first-contentful-paint') || null;
  const resources = perf.getEntriesByType('resource').slice(opts.since === 'mark' ? state.resourcesBefore : 0).slice(0, 800).map((entry) => {
    let source = null;
    if (/\/workflow\/execute\/node/.test(entry.name)) { try { source = new URL(entry.name).searchParams.get('name'); } catch (error) { source = null; } }
    let sameOrigin = false;
    try { sameOrigin = new URL(entry.name).origin === location.origin; } catch (error) { sameOrigin = false; }
    return { path: H.pathOnly(entry.name), sameOrigin, type: entry.initiatorType, transfer: entry.transferSize || 0, encoded: entry.encodedBodySize || 0, ms: Math.round(entry.duration), at: Math.round(entry.startTime), source };
  });
  const images = opts.images ? [...ctx.appRoot.querySelectorAll('img')].filter(H.visible).slice(0, 200).map((img) => {
    const r = img.getBoundingClientRect();
    return { path: H.pathOnly(img.currentSrc || img.src), natural: { w: img.naturalWidth, h: img.naturalHeight }, shown: { w: Math.round(r.width), h: Math.round(r.height) }, ...H.block(img) };
  }) : [];
  const memory = perf.memory ? { usedMB: Math.round((perf.memory.usedJSHeapSize / 1048576) * 10) / 10, beforeMB: state.heapBefore === null ? null : Math.round((state.heapBefore / 1048576) * 10) / 10 } : null;
  return {
    since: opts.since || 'navigation', now: Math.round(perf.now()), mark: Math.round(state.mark), settle: { ms: Date.now() - started, settled: Date.now() - quietSince >= quietMs },
    nav: nav ? { ttfb: nav.responseStart, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, transfer: nav.transferSize || 0, type: nav.type } : null,
    fcp: paint ? paint.startTime : null,
    lcp: opts.since === 'mark' ? [] : state.lcp,
    shifts: after(state.shifts), longTasks: after(state.longTasks), frames: after(state.frames), events: after(state.events),
    resources, images, memory, dpr: win.devicePixelRatio, viewport: { w: win.innerWidth, h: win.innerHeight },
    counts: { domNodes: ctx.appRoot.getElementsByTagName('*').length, blocks: ctx.blocks }, pageIds: ctx.pageIds, inFrame: ctx.inFrame,
  };
}
