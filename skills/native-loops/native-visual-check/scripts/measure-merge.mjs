#!/usr/bin/env node
// Merge the raw dumps of one pass (native-describe-screen, describe, fiber, views, PNGs) into
// measured.json: page coordinates for every element the page owns, the overlays it does not,
// the pinned bands and the offset confidence per viewport.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { MEASURED_SCHEMA, box, readJson, writeJson } from './lib/schemas.mjs';
import { deriveOffsets, toPageElements, elementKey, axKind, axText } from './lib/page-offset.mjs';
import { decodePngFile, readIhdrFile, rowLuminance } from './lib/png.mjs';
import { mergeAxIntoNative, parseDescribe } from './lib/ax-describe.mjs';
import { classifyOverlays } from './lib/overlays.mjs';

const HELP = `Usage:
  node measure-merge.mjs --pass DIR [--mode auto|fiber|native] [--no-rows] [--safe-area-top N] --out measured.json [--json]

Reads DIR/raw/describe-<k>.json (native-describe-screen, frames in points), DIR/raw/ax-<k>.json
(the describe tool: the accessibility service's text rendering, normalised frames), DIR/raw/fiber-<k>.json
(mode A block frames), DIR/raw/views-1.json (native-view-at-point containers), DIR/raw/device.json,
DIR/raw/scroll.json (what measure.mjs decided about scrolling) and DIR/device-<k>.png. Writes the
loops.visual.measured/1 file. Per viewport the two dumps merge by frame; a parked sheet and the LogBox
banners go to overlays[], never into elements[] or contentHeight. The scroll offset of each viewport
comes from the screenshots' pixel rows, cross-checked by the elements both dumps list.

Exit codes: 0 ok, 1 error, 2 usage, 3 no describe dumps in DIR/raw.`;

const FITS_SLACK = 4;

function listDumps(rawDir, prefix) {
  if (!fs.existsSync(rawDir)) return [];
  return fs.readdirSync(rawDir)
    .map((name) => /^(\w+)-(\d+)\.json$/.exec(name))
    .filter((hit) => hit && hit[1] === prefix)
    .map((hit) => ({ k: Number(hit[2]), file: path.join(rawDir, hit[0]) }))
    .sort((left, right) => left.k - right.k);
}

function fiberEntries(json) {
  const list = Array.isArray(json) ? json : json?.result ?? json?.value ?? json?.blocks ?? [];
  return (Array.isArray(list) ? list : []).map((entry) => ({ ...entry, frame: box(entry.frame) })).filter((entry) => entry.blockId && entry.frame);
}

function attachFibers(elements, fibersByK, offsets) {
  const containers = [];
  for (const [k, fibers] of fibersByK) {
    const offset = offsets.find((entry) => entry.k === k);
    for (const fiber of fibers) {
      const twin = elements.find((element) => element.window.k === k
        && Math.abs(element.window.x - fiber.frame.x) <= 1.5 && Math.abs(element.window.y - fiber.frame.y) <= 1.5
        && Math.abs(element.window.w - fiber.frame.w) <= 1.5 && Math.abs(element.window.h - fiber.frame.h) <= 1.5);
      if (twin) { twin.blockId = fiber.blockId; twin.displayName = fiber.displayName ?? null; twin.source = `${twin.source}+fiber`; continue; }
      const known = containers.find((container) => container.blockId === fiber.blockId && Math.abs(container.window.y - fiber.frame.y) <= 1.5 && container.window.k !== k);
      if (known) { known.seenIn.push(k); continue; }
      containers.push({
        id: `c${containers.length + 1}`, kind: 'view', text: null, label: null, identifier: null, viewClassName: null, traits: [],
        page: { ...fiber.frame, y: Math.round((fiber.frame.y - (offset?.axShift ?? 0) + (offset?.offset ?? 0)) * 10) / 10 },
        window: { ...fiber.frame, k }, pinned: false, seenIn: [k], source: 'fiber', blockId: fiber.blockId, displayName: fiber.displayName ?? null, backgroundColor: null, derived: null,
      });
    }
  }
  return containers;
}

function viewContainers(views) {
  const list = Array.isArray(views) ? views : views?.views ?? [];
  return list.map((entry, index) => {
    const view = entry.view ?? entry.result?.view ?? entry;
    const frame = box(view.screenFrame ?? view.frame);
    if (!frame) return null;
    return {
      id: `v${index + 1}`, kind: 'view', text: null, label: view.label ?? null, identifier: view.identifier ?? view.nativeID ?? null,
      viewClassName: view.className ?? null, traits: [], page: { ...frame }, window: { ...frame, k: 1 }, pinned: false, seenIn: [1],
      source: 'views', blockId: entry.blockId ?? null, displayName: entry.elementId ?? null, backgroundColor: view.backgroundColor ?? null, derived: null,
    };
  }).filter(Boolean);
}

/** One list of the excluded elements across viewports (a parked sheet is in every dump). */
function overlayList(perViewport) {
  const seen = new Map();
  for (const viewport of perViewport) {
    for (const element of viewport.overlays) {
      const key = `${element.overlay}|${elementKey(element)}`;
      if (seen.has(key)) { seen.get(key).seenIn.push(viewport.k); continue; }
      const frame = box(element.frame);
      seen.set(key, { id: `o${seen.size + 1}`, overlay: element.overlay, kind: axKind(element), text: axText(element) || null, label: element.label ?? null, window: { ...frame, k: viewport.k }, seenIn: [viewport.k], source: element.source ?? 'native' });
    }
  }
  return [...seen.values()];
}

/** Pure merge for tests and for measure.mjs; dumps are [{k, describe, ax?, fiber?, png?}]. */
export function mergeDumps({ dumps, device, views = null, mode = 'native', rows = null, safeAreaTop = null, scroll = null }) {
  const first = dumps[0]?.describe;
  const screenFrame = box(first?.screenFrame) ?? { w: device.screen?.w, h: device.screen?.h };
  const screen = { w: device.screen?.w ?? screenFrame.w, h: device.screen?.h ?? screenFrame.h };
  const safe = safeAreaTop ?? device.safeAreaTop ?? 59;
  const perViewport = dumps.map((dump) => {
    const native = (dump.describe?.elements ?? []).filter((element) => box(element.frame));
    const all = classifyOverlays(mergeAxIntoNative(native, dump.ax ? parseDescribe(dump.ax).entries : [], screen), screen);
    return { k: dump.k, elements: all.filter((element) => !element.overlay), overlays: all.filter((element) => element.overlay) };
  });
  const masks = Object.fromEntries(perViewport.map((viewport) => [viewport.k, viewport.overlays.filter((element) => element.overlay === 'banner').map((element) => box(element.frame))]));
  const derived = deriveOffsets({ viewports: perViewport, screen, rows, pxPerPt: device.pxPerPt ?? 3, safeAreaTop: safe, masks });
  const elements = toPageElements({ viewports: perViewport, offsets: derived.viewports, pinnedKeys: derived.pinnedKeys, screen });
  const fibersByK = new Map(dumps.filter((dump) => dump.fiber).map((dump) => [dump.k, fiberEntries(dump.fiber)]));
  const containers = [...attachFibers(elements, fibersByK, derived.viewports), ...viewContainers(views)];
  const actualMode = fibersByK.size ? 'fiber' : 'native';
  const bottoms = [...elements, ...containers].map((element) => element.page.y + element.page.h);
  const contentHeight = bottoms.length ? Math.round(Math.max(...bottoms)) : 0;
  const fits = contentHeight <= screen.h + FITS_SLACK;
  return {
    schema: MEASURED_SCHEMA,
    device: { udid: device.udid ?? null, model: device.model ?? null, screen, pxPerPt: device.pxPerPt ?? null, safeAreaTop: safe, bundleId: device.bundleId ?? null, build: device.build ?? null },
    mode: mode === 'auto' ? actualMode : mode,
    scrolled: scroll?.scrolled ?? dumps.length > 1,
    stopReason: scroll?.stopReason ?? (dumps.length === 1 && fits ? 'fits' : null),
    warnings: scroll?.warnings ?? [],
    viewports: derived.viewports.map((entry, index) => ({
      k: entry.k, png: dumps[index]?.png ?? null, offset: entry.offset, offsetMethod: entry.offsetMethod, offsetConfidence: entry.offsetConfidence,
      anchors: entry.anchors, anchorsOffset: entry.anchorsOffset, rowsOffset: entry.rowsOffset, axStale: entry.axStale, axShift: entry.axShift,
    })),
    bands: derived.bands,
    contentHeight,
    elements,
    overlays: overlayList(perViewport),
    containers,
  };
}

export function mergePass({ passDir, mode = 'auto', rows = true, safeAreaTop = null }) {
  const rawDir = path.join(passDir, 'raw');
  const describes = listDumps(rawDir, 'describe');
  if (!describes.length) return null;
  const fibers = new Map(listDumps(rawDir, 'fiber').map((entry) => [entry.k, entry.file]));
  const axes = new Map(listDumps(rawDir, 'ax').map((entry) => [entry.k, entry.file]));
  const deviceFile = path.join(rawDir, 'device.json');
  const device = fs.existsSync(deviceFile) ? readJson(deviceFile) : {};
  const rowsByK = {};
  const dumps = describes.map(({ k, file }) => {
    const pngRel = `device-${k}.png`;
    const png = path.join(passDir, pngRel);
    const hasPng = fs.existsSync(png);
    if (hasPng && !device.pxPerPt) {
      const ihdr = readIhdrFile(png);
      const screenW = box(readJson(file).screenFrame)?.w ?? device.screen?.w;
      if (screenW) device.pxPerPt = Math.round((ihdr.width / screenW) * 100) / 100;
    }
    if (hasPng && rows) {
      const image = decodePngFile(png);
      if (image) rowsByK[k] = rowLuminance(image, image.width * 0.1, image.width * 0.9);
    }
    return { k, describe: readJson(file), ax: axes.has(k) ? readJson(axes.get(k)) : null, fiber: fibers.has(k) ? readJson(fibers.get(k)) : null, png: hasPng ? pngRel : null };
  });
  const viewsFile = path.join(rawDir, 'views-1.json');
  const scrollFile = path.join(rawDir, 'scroll.json');
  return mergeDumps({
    dumps, device, views: fs.existsSync(viewsFile) ? readJson(viewsFile) : null, mode, rows: Object.keys(rowsByK).length ? rowsByK : null, safeAreaTop,
    scroll: fs.existsSync(scrollFile) ? readJson(scrollFile) : null,
  });
}

export function summarise(measured) {
  const offsets = measured.viewports.map((viewport) => `k${viewport.k} +${viewport.offset} (${viewport.offsetMethod}, ${viewport.offsetConfidence}${viewport.axStale ? ', tree in page coords' : ''})`).join(' · ');
  const bands = [measured.bands.header ? `header ${measured.bands.header.y}–${Math.round(measured.bands.header.y + measured.bands.header.h)}` : 'no header band',
    measured.bands.tabbar ? `tab bar ${Math.round(measured.bands.tabbar.y)}–${Math.round(measured.bands.tabbar.y + measured.bands.tabbar.h)}` : 'no tab bar band'].join(', ');
  const overlays = measured.overlays ?? [];
  const sheet = overlays.filter((entry) => entry.overlay === 'offscreen-sheet').length; const banner = overlays.filter((entry) => entry.overlay === 'banner').length;
  const scroll = measured.stopReason ? `, ${measured.scrolled ? 'scrolled' : 'no scroll'} (${measured.stopReason})` : '';
  return `measured ${measured.elements.length} elements, ${measured.containers.length} containers, content ${measured.contentHeight}pt${scroll}, mode ${measured.mode}, ${overlays.length} overlays (${sheet} sheet, ${banner} banner) · ${offsets} · ${bands}`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      pass: { type: 'string' }, mode: { type: 'string', default: 'auto' }, out: { type: 'string' },
      rows: { type: 'boolean', default: true }, 'no-rows': { type: 'boolean', default: false },
      'safe-area-top': { type: 'string' }, json: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) { console.log(HELP); return 0; }
  if (!values.pass || !values.out) { console.error('measure-merge needs --pass and --out. Run with --help.'); return 2; }
  const measured = mergePass({ passDir: values.pass, mode: values.mode, rows: !values['no-rows'], safeAreaTop: values['safe-area-top'] ? Number(values['safe-area-top']) : null });
  if (!measured) { console.error(`no raw/describe-<k>.json in ${values.pass}`); return 3; }
  writeJson(values.out, measured);
  console.log(values.json ? JSON.stringify({ out: values.out, viewports: measured.viewports, bands: measured.bands, elements: measured.elements.length, overlays: measured.overlays.length, contentHeight: measured.contentHeight, scrolled: measured.scrolled, stopReason: measured.stopReason }) : `OK ${summarise(measured)} → ${values.out}`);
  return 0;
}

// Compare real paths: Node resolves the main module through symlinks (~/.claude/skills links), argv[1] does not.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().then((code) => process.exit(code), (error) => { console.error(error.message); process.exit(1); });
}
