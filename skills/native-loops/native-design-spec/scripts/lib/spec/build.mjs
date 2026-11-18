// Builds a spec (loops.design.spec/1) from a frame tree plus style records, whatever the design source:
// Figma metadata (figma-spec.mjs), an HTML prototype measured in a browser, or boxes marked on a screenshot
// (store.mjs). The tree is the parseXml shape { tag, attrs: { id, name, x, y, width, height }, children }.
import { DEFAULT_SCALE } from '../scale.mjs';
import { readNodes, detectPositions, placeNodes } from './positions.mjs';
import { DEFAULT_EXCLUDE, excludeNodes, statusBand, pickRegions, pinnedFor, regionKey, flowOf } from './regions.mjs';
import { buildElements } from './elements.mjs';
import { attachSources } from './match.mjs';
import { styleExpectations, detectCapTrim } from './style.mjs';
import { geometryExpectations } from './geometry.mjs';
import { summarize, regionMap } from './summary.mjs';
import { parseRatio, num } from '../args.mjs';

// expect.<key> -> the record property it was read from, for per-property source labels.
const PROP_OF = { radius: 'borderRadius', fill: 'fill', color: 'color', fontSize: 'fontSize', lineHeight: 'lineHeight', fontWeight: 'fontWeight', fontFamily: 'fontFamily', letterSpacing: 'letterSpacing', textCase: 'textTransform', shadow: 'shadow', blur: 'filterBlur', backdropBlur: 'backdropBlur', opacity: 'opacity', border: 'border', gradient: 'gradient', image: 'image', text: 'text' };

// Renames the generic source labels to the real design source: a browser measure is `html`, not
// `design-context`; a box marked on a screenshot is `marked`. A record may name a source per property
// (`propSources`), e.g. a fill sampled from the screenshot pixels.
function relabel(elements, labels) {
  if (!labels) return;
  for (const element of elements) {
    const records = { 'design-context': element.sources?.designContext, css: element.sources?.css };
    for (const [key, expectation] of Object.entries(element.expect)) {
      if (!expectation || typeof expectation !== 'object') continue;
      const record = records[expectation.source];
      const perProp = record?.propSources?.[PROP_OF[key] ?? key];
      if (perProp) { expectation.source = perProp.source ?? perProp; if (perProp.judge) expectation.judge = perProp.judge; if (perProp.approx) expectation.approx = true; continue; }
      if (labels[expectation.source]) expectation.source = labels[expectation.source];
    }
    const matched = element.sources?.matchedBy;
    if (matched) for (const [tier, label] of [['designContext', labels['design-context']], ['css', labels.css]]) if (label && matched[tier]) { matched[label] = matched[tier]; delete matched[tier]; }
  }
}

// A WEB spec is the design 1:1 in CSS px: factor 1, whole px (grid 1), no safe top, no status band, no
// phone bars dropped, and device.widthPt the width the page is checked at (the frame's own width by default).
// web-visual-check reads it as specs/<screen>@<width>.json.
export const WEB_DEFAULTS = Object.freeze({ scale: 1, grid: 1, safeAreaTop: 0, statusBand: '0', excludeNames: '' });

/**
 * opts: platform ('web' for a WEB spec, below), page, app, pageName, appName, fileKey, scale ("402/440" | number), grid, fontRound, smallBelow,
 * textCapTrim (auto|on|off), deviceWidth, deviceHeight, deviceModel, safeAreaTop, statusBand (auto|pt),
 * statusBandDefault (pt used when auto finds no drawn bar; Figma's rule is 54), pinnedTop[], pinnedBottom[],
 * skipRegion[], regionDepth, excludeNames, capTrimGaps (default true), labels ({ metadata, 'design-context', css }),
 * sources (the `sources` block paths), design (an extra `design` block), nodeHook(nodes) before regions are picked.
 */
export function buildSpec({ document, cssRecords = [], designContext = null, svg = null, board = null, overrides = [], opts: given = {} }) {
  const web = String(given.platform ?? '').toLowerCase() === 'web';
  const opts = web ? { ...given, ...Object.fromEntries(Object.entries(WEB_DEFAULTS).filter(([key]) => given[key] === undefined || given[key] === null)) } : given;
  const { root, nodes } = readNodes(document);
  const notes = opts.notes ?? [];
  if (root.tag === 'section') throw new Error(`metadata root is the section "${root.name}" (${root.children.length} frames): fetch the FRAME node instead`);
  if (opts.nodeHook) opts.nodeHook(nodes);

  const positions = opts.positions ? { mode: opts.positions, evidence: opts.positionsEvidence ?? 'source', confident: true } : detectPositions(nodes, cssRecords);
  if (!positions.confident) notes.push(`position mode ${positions.mode} is not certain (relative ${(positions.relativeShare * 100).toFixed(0)}%, absolute ${(positions.absoluteShare * 100).toFixed(0)}% of children inside their parents)`);
  placeNodes(root, positions.mode);

  const deviceWidth = num(opts.deviceWidth, web ? Math.round(root.w) : 402);
  const factor = opts.scale ? (typeof opts.scale === 'number' ? opts.scale : parseRatio(opts.scale)) : deviceWidth / root.w;
  // A child as wide as the frame is as wide as the device on a phone; on WEB it is as wide as the frame itself
  // (a page measured beside a scroll bar is a few px narrower than the window it was checked at).
  const fullWidth = web ? Math.round(root.w * factor) : deviceWidth;
  const scale = {
    factor,
    grid: num(opts.grid, DEFAULT_SCALE.grid),
    middleTolerance: DEFAULT_SCALE.middleTolerance,
    smallBelow: num(opts.smallBelow, DEFAULT_SCALE.smallBelow),
    capHeightRatio: DEFAULT_SCALE.capHeightRatio,
  };
  const letterSpacing = { copy: -0.02, upper: 0.02 };
  const safeAreaTop = num(opts.safeAreaTop, 62);

  const dropped = excludeNodes(root, opts.excludeNames ?? DEFAULT_EXCLUDE);
  let band = statusBand(root, dropped, opts.statusBand);
  if (band.source === 'rule' && opts.statusBandDefault !== undefined) band = { value: opts.statusBandDefault, source: 'rule' };
  const picked = pickRegions(root, { depth: opts.regionDepth ?? 'auto', skip: opts.skipRegion ?? [] });
  if (!picked.regions.length) throw new Error('no regions: the frame has no sized children after exclusions');
  const usedKeys = new Set();
  const keys = picked.regions.map((region) => regionKey(region, usedKeys));
  const built = buildElements(picked.regions, keys);
  attachSources(built.elements, { designContext, css: cssRecords, svg });

  for (const element of built.elements) element.expect = styleExpectations(element, { scale, letterSpacing });
  const capTrim = detectCapTrim(built.elements, [...cssRecords, ...(designContext?.records ?? [])], opts.textCapTrim ?? 'auto');
  geometryExpectations(built.elements, { scale, deviceWidth: fullWidth, frameWidth: root.w, safeAreaTop, statusBand: band.value, capTrim: capTrim.value, capTrimGaps: opts.capTrimGaps ?? true });
  relabel(built.elements, opts.labels);

  const byKey = new Map(built.elements.map((element) => [element.key, element]));
  for (const override of overrides ?? []) {
    const element = byKey.get(override.key);
    if (!element) { notes.push(`override for unknown key ${override.key}`); continue; }
    const previous = element.expect[override.property];
    element.expect[override.property] = { value: override.value, figma: previous?.figma ?? null, source: 'override', words: override.words ?? null, ...(previous?.judge ? { judge: previous.judge } : {}) };
  }

  const toApp = (value) => Math.round(value * scale.factor);
  const regions = built.regions.map((region) => ({
    id: region.id, name: region.node.name, key: region.key, figmaNodeId: region.node.id,
    pinned: pinnedFor(region.node, { pinnedTop: opts.pinnedTop ?? [], pinnedBottom: opts.pinnedBottom ?? [] }),
    figma: { ...region.node.abs },
    app: { x: toApp(region.node.abs.x), y: safeAreaTop + toApp(region.node.abs.y - band.value), w: region.node.abs.w >= root.w - 0.5 ? fullWidth : toApp(region.node.abs.w), h: built.elements.find((element) => element.id === region.elementIds[0])?.app.h ?? toApp(region.node.abs.h) },
    flow: flowOf(region.node), elements: region.elementIds,
  }));
  const elements = built.elements.map((element) => ({
    id: element.id, region: element.region, key: element.key, name: element.name, figmaNodeId: element.figmaNodeId, kind: element.kind,
    parent: element.parent, prevSibling: element.prevSibling, flow: element.flow, visible: element.visible,
    figma: { ...element.figma, ...(element.kind === 'text' ? { lines: element.expect.lines?.value ?? null } : {}) },
    app: element.app, centered: element.centered, expect: element.expect, block: null,
    matchedBy: element.sources.matchedBy,
  }));

  const spec = {
    schema: 'loops.design.spec/1',
    page: { id: opts.page, name: opts.pageName ?? board?.page?.name ?? null, appId: opts.app, appName: opts.appName ?? null },
    figma: { fileKey: board?.figma?.fileKey ?? opts.fileKey ?? null, nodeId: root.id, frameName: root.name, width: root.w, height: root.h, statusBand: band.value, statusBandSource: band.source, screenshot: opts.screenshot ?? board?.sources?.screenshot ?? null, pxPerPt: opts.pxPerPt ?? board?.figma?.pxPerPt ?? null, fetchedAt: new Date().toISOString() },
    ...(opts.design ? { design: opts.design } : {}),
    scale: { factor: scale.factor, grid: scale.grid, middle: { tolerance: scale.middleTolerance, spacing: 'down', size: 'up' }, fontRound: opts.fontRound ?? 'whole', smallBelow: scale.smallBelow, textCapTrim: capTrim.value, textCapTrimEvidence: capTrim.evidence, capHeightRatio: scale.capHeightRatio, letterSpacing: { copy: `${letterSpacing.copy}em`, upper: `+${letterSpacing.upper}em` } },
    device: web
      ? { model: opts.deviceModel ?? `browser ${deviceWidth}px`, widthPt: deviceWidth, heightPt: num(opts.deviceHeight, Math.round(root.h * factor)), safeAreaTop, platform: 'web', unit: 'px' }
      : { model: opts.deviceModel ?? null, widthPt: deviceWidth, heightPt: num(opts.deviceHeight, null), safeAreaTop },
    sources: { metadata: null, designContext: null, css: null, svg: null, overrides: null, ...(opts.sources ?? {}), positions: positions.mode, positionsEvidence: positions.evidence, regionDepth: picked.depthUsed, skippedRegions: picked.skipped, excluded: dropped.map((node) => node.name) },
    regions, elements, notes,
  };
  return { spec, regionMap: regionMap(spec), summary: summarize(spec), notes };
}

// Keeps the block ids a visual check already wrote into an earlier region-map.
export function mergeRegionMap(fresh, existing = {}) {
  for (const [key, entry] of Object.entries(fresh)) if (!entry.blockIds?.length && existing?.[key]?.blockIds?.length) entry.blockIds = existing[key].blockIds;
  return fresh;
}
