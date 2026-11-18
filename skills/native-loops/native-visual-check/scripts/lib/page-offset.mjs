// Turns per-viewport describe dumps into page coordinates. The scroll delta between two
// shots is measured from the screenshots' pixel rows first and from the elements both shots
// list second, never assumed from the swipe.
import { box, normText, round1 } from './schemas.mjs';

const BIN = 1.5;
const PINNED_EPS = 0.75;
const AGREE_PT = 2;
const TWIN_PT = 3;

export function axText(element) {
  return element.label ?? element.value ?? element.identifier ?? '';
}

export function axKind(element) {
  const cls = String(element.viewClassName ?? '');
  const traits = (element.traits ?? []).map((trait) => String(trait).toLowerCase());
  if (/Text|Paragraph/.test(cls) || traits.includes('statictext') || traits.includes('text')) return 'text';
  if (/Image/.test(cls) || traits.includes('image')) return 'image';
  if (traits.includes('button')) return 'button';
  return 'view';
}

// Elements with the same text, size, class and x are the same thing in two shots: a vertical
// scroll never moves x, and x tells two same-sized icons on one row apart.
export function elementKey(element) {
  const frame = box(element.frame);
  return `${normText(axText(element))}|${Math.round(frame.w)}|${Math.round(frame.h)}|${element.viewClassName ?? ''}|${Math.round(frame.x)}`;
}

function uniqueByKey(elements) {
  const groups = new Map();
  for (const element of elements) {
    const key = elementKey(element);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(element);
  }
  const unique = new Map();
  for (const [key, members] of groups) if (members.length === 1) unique.set(key, members[0]);
  return unique;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Greedy 1.5pt bins over sorted deltas; biggest cluster first. */
export function clusterDeltas(entries, bin = BIN) {
  const sorted = [...entries].sort((left, right) => left.delta - right.delta);
  const clusters = [];
  for (const entry of sorted) {
    const current = clusters[clusters.length - 1];
    if (current && entry.delta - current.members[0].delta <= bin) current.members.push(entry);
    else clusters.push({ members: [entry] });
  }
  for (const cluster of clusters) {
    const deltas = cluster.members.map((member) => member.delta);
    cluster.median = median(deltas);
    cluster.spread = Math.max(...deltas) - Math.min(...deltas);
  }
  return clusters.sort((left, right) => right.members.length - left.members.length);
}

function sameFrame(left, right, eps = PINNED_EPS) {
  const a = box(left.frame); const b = box(right.frame);
  return Math.abs(a.y - b.y) <= eps && Math.abs(a.x - b.x) <= eps;
}

/** Normalised cross-correlation of row-gradient profiles; prev[y + shift] lines up with cur[y]. */
export function correlateRows(prevRows, curRows, { minShift = 0, maxShift = prevRows.length - 8 } = {}) {
  const gradient = (rows) => Float64Array.from(rows, (value, index) => (index + 1 < rows.length ? Math.abs(rows[index + 1] - value) : 0));
  const prev = gradient(prevRows); const cur = gradient(curRows);
  let best = { shift: 0, score: -1 };
  for (let shift = minShift; shift <= maxShift; shift += 1) {
    const length = Math.min(prev.length - shift, cur.length);
    if (length < 8) break;
    let dot = 0; let pp = 0; let cc = 0;
    for (let index = 0; index < length; index += 1) {
      const prevValue = prev[index + shift]; const curValue = cur[index];
      dot += prevValue * curValue; pp += prevValue * prevValue; cc += curValue * curValue;
    }
    const score = pp && cc ? dot / Math.sqrt(pp * cc) : 0;
    if (score > best.score) best = { shift, score };
  }
  return best;
}

function downsample(rows, factor) {
  const out = new Float64Array(Math.floor(rows.length / factor));
  for (let index = 0; index < out.length; index += 1) {
    let total = 0;
    for (let sub = 0; sub < factor; sub += 1) total += rows[index * factor + sub];
    out[index] = total / factor;
  }
  return out;
}

// Banner rows are pinned pixels inside the content band; flattened to one value they add no
// gradient, so they cannot pull the correlation towards "nothing moved".
function flattenRows(rows, ranges, pxPerPt) {
  if (!ranges?.length) return rows;
  const out = Float64Array.from(rows);
  for (const range of ranges) {
    const top = Math.max(0, Math.floor(range.y * pxPerPt)); const bottom = Math.min(out.length, Math.ceil((range.y + range.h) * pxPerPt));
    const level = top > 0 ? out[top - 1] : out[Math.min(out.length - 1, bottom)];
    for (let row = top; row < bottom; row += 1) out[row] = level;
  }
  return out;
}

function rowsOffsetPt(prevPx, curPx, pxPerPt, bandPt) {
  const factor = Math.max(1, Math.round(pxPerPt));
  const slice = (rows) => rows.subarray(Math.round(bandPt.top * pxPerPt), Math.round(bandPt.bottom * pxPerPt));
  const prevPt = downsample(slice(prevPx), factor); const curPt = downsample(slice(curPx), factor);
  const coarse = correlateRows(prevPt, curPt, { minShift: 0, maxShift: Math.max(8, prevPt.length - 40) });
  const centre = coarse.shift * factor;
  const fine = correlateRows(slice(prevPx), slice(curPx), { minShift: Math.max(0, centre - factor), maxShift: centre + factor });
  return { shift: fine.shift / pxPerPt, score: fine.score };
}

function unionBand(elements) {
  if (!elements.length) return null;
  const top = Math.min(...elements.map((element) => box(element.frame).y));
  const bottom = Math.max(...elements.map((element) => box(element.frame).y + box(element.frame).h));
  return { y: top, h: bottom - top };
}

/**
 * The scroll delta of one step. Pixels decide when the screenshots decode; the anchors (the
 * elements both dumps list) say whether the tree moved with them: agreement keeps their
 * confidence, a still tree (every anchor at Δ0 while the pixels moved) means the frames stayed
 * in page coordinates, a different answer is low confidence either way.
 */
function stepDelta({ pairs, rows, lastDelta, screen }) {
  const clusters = clusterDeltas(pairs);
  const zero = clusters.find((cluster) => Math.abs(cluster.median) < PINNED_EPS);
  const best = clusters.find((cluster) => cluster !== zero);
  const anchorsOffset = best ? round1(best.median) : null;
  const anchorsConfidence = best && best.members.length >= 3 && best.spread <= 1.5 ? (best.members.length >= 6 && best.spread <= 0.5 ? 'exact' : 'high') : 'low';
  const treeStill = !best && (zero?.members.length ?? 0) >= 3;
  const step = { anchorsOffset, rowsOffset: null, zero, anchors: best?.members ?? [], treeMoved: null, delta: null, method: 'assumed', confidence: 'low' };
  if (rows) {
    step.rowsOffset = round1(rows.shift);
    step.delta = step.rowsOffset; step.method = 'rows';
    const rowsConfidence = rows.score >= 0.6 ? 'high' : 'low';
    if (anchorsOffset !== null && Math.abs(anchorsOffset - step.rowsOffset) <= AGREE_PT) { step.method = 'rows+anchors'; step.confidence = anchorsConfidence === 'low' ? rowsConfidence : anchorsConfidence; step.treeMoved = step.delta; }
    else if (anchorsOffset !== null) { step.confidence = 'low'; step.treeMoved = anchorsOffset; }
    else { step.confidence = rowsConfidence; step.treeMoved = treeStill ? 0 : step.delta; }
    return step;
  }
  if (anchorsOffset !== null) { step.delta = anchorsOffset; step.method = 'anchors'; step.confidence = anchorsConfidence; step.treeMoved = anchorsOffset; return step; }
  step.delta = lastDelta ?? screen.h * 0.5; step.treeMoved = step.delta;
  return step;
}

/**
 * viewports: [{k, elements}] dumps in capture order, overlays already removed. rows: optional
 * {k: Float64Array} per-pixel-row luminance at pxPerPt. masks: optional {k: [{y, h}]} in points,
 * rows to flatten before correlating (banners). Returns per-viewport offsets, pinned keys, bands.
 */
export function deriveOffsets({ viewports, screen, rows = null, pxPerPt = 3, safeAreaTop = 59, masks = null }) {
  const uniques = viewports.map((viewport) => uniqueByKey(viewport.elements));
  const out = [{ k: viewports[0].k, offset: 0, offsetMethod: 'top', offsetConfidence: 'exact', anchors: [], anchorsOffset: null, rowsOffset: null, axStale: false, axShift: 0 }];
  let pinnedKeys = null;
  let lastDelta = null;
  for (let index = 1; index < viewports.length; index += 1) {
    const prev = uniques[index - 1]; const cur = uniques[index];
    const pairs = [];
    for (const [key, element] of cur) {
      const before = prev.get(key);
      if (before) pairs.push({ key, delta: box(before.frame).y - box(element.frame).y, element, before });
    }
    let correlated = null;
    const prevK = viewports[index - 1].k; const curK = viewports[index].k;
    if (rows?.[prevK] && rows?.[curK]) {
      // Only bands proven by earlier shots bound the band; this shot's own zero cluster is what the pixels are checking.
      const proven = [...(pinnedKeys ?? [])].map((key) => cur.get(key)).filter(Boolean);
      const header = unionBand(proven.filter((element) => box(element.frame).y < screen.h / 2));
      const tabbar = unionBand(proven.filter((element) => box(element.frame).y >= screen.h / 2));
      const band = { top: header ? header.y + header.h : safeAreaTop + 60, bottom: tabbar ? tabbar.y : screen.h - 90 };
      correlated = rowsOffsetPt(flattenRows(rows[prevK], masks?.[prevK], pxPerPt), flattenRows(rows[curK], masks?.[curK], pxPerPt), pxPerPt, band);
    }
    const step = stepDelta({ pairs, rows: correlated, lastDelta, screen });
    // The tree lags the pixels by whatever it did not move; the lag is what page coordinates undo.
    const lag = round1(step.delta - step.treeMoved);
    const axStale = Math.abs(lag) > AGREE_PT;
    const keptFrame = (pair) => viewports.slice(0, index).every((earlier) => {
      const seen = uniques[viewports.indexOf(earlier)].get(pair.key);
      return seen && sameFrame(seen, pair.element);
    });
    const pinnedNow = new Set((step.zero?.members ?? []).filter(keptFrame).map((pair) => pair.key));
    // A pinned element stays pinned only while every later shot shows it at the same frame; a
    // still tree pins nothing, its zero cluster is the whole page.
    pinnedKeys = pinnedKeys ? new Set([...pinnedKeys].filter((key) => pinnedNow.has(key))) : pinnedNow;
    if (axStale && index === 1) pinnedKeys = new Set();
    lastDelta = step.delta;
    out.push({
      k: curK,
      offset: round1(out[index - 1].offset + step.delta),
      offsetMethod: step.method,
      offsetConfidence: step.confidence,
      anchors: step.anchors.slice(0, 12).map((pair) => ({ key: pair.key, text: axText(pair.element), windowY: box(pair.element.frame).y, delta: round1(pair.delta) })),
      anchorsOffset: step.anchorsOffset,
      rowsOffset: step.rowsOffset,
      axStale,
      axShift: round1(out[index - 1].axShift + lag),
    });
  }
  pinnedKeys = pinnedKeys ?? new Set();
  const last = uniques[uniques.length - 1];
  const pinnedElements = [...pinnedKeys].map((key) => last.get(key)).filter(Boolean);
  const bands = {
    status: { y: 0, h: safeAreaTop },
    header: unionBand(pinnedElements.filter((element) => box(element.frame).y + box(element.frame).h / 2 < screen.h / 2)),
    tabbar: unionBand(pinnedElements.filter((element) => box(element.frame).y + box(element.frame).h / 2 >= screen.h / 2)),
  };
  return { viewports: out, pinnedKeys, bands };
}

function visibleFraction(frame, screen) {
  const top = Math.max(0, frame.y); const bottom = Math.min(screen.h, frame.y + frame.h);
  return frame.h > 0 ? Math.max(0, bottom - top) / frame.h : 0;
}

/** Merge every viewport's elements into one page list; pinned ones keep window coordinates. */
export function toPageElements({ viewports, offsets, pinnedKeys, screen }) {
  const merged = [];
  for (const viewport of viewports) {
    const offset = offsets.find((entry) => entry.k === viewport.k);
    for (const element of viewport.elements) {
      const frame = box(element.frame);
      const key = elementKey(element);
      const pinned = pinnedKeys.has(key);
      const page = pinned ? { ...frame } : { ...frame, y: round1(frame.y - offset.axShift + offset.offset) };
      const candidate = { key, pinned, page, window: { ...frame, k: viewport.k }, visible: visibleFraction(frame, screen), raw: element };
      const twin = merged.find((entry) => entry.key === key && Math.abs(entry.page.y - page.y) <= TWIN_PT);
      if (!twin) { merged.push({ ...candidate, seenIn: [viewport.k] }); continue; }
      twin.seenIn.push(viewport.k);
      if (candidate.visible > twin.visible) Object.assign(twin, { page: candidate.page, window: candidate.window, visible: candidate.visible, raw: candidate.raw });
    }
  }
  return merged.map((entry, index) => ({
    id: `m${index + 1}`,
    kind: axKind(entry.raw),
    text: axText(entry.raw) || null,
    label: entry.raw.label ?? null,
    identifier: entry.raw.identifier ?? null,
    viewClassName: entry.raw.viewClassName ?? null,
    axRole: entry.raw.axRole ?? null,
    traits: entry.raw.traits ?? [],
    page: entry.page,
    window: entry.window,
    pinned: entry.pinned,
    seenIn: entry.seenIn,
    source: entry.raw.source ?? 'native',
    blockId: null,
    displayName: null,
    backgroundColor: null,
  }));
}
