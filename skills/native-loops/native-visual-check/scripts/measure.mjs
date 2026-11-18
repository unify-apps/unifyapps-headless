#!/usr/bin/env node
// Measure one page on the device: a fresh config, then per viewport a full-resolution screenshot
// and two accessibility dumps (native-describe-screen in points, describe normalised). A page
// that fits the screen is never swiped; otherwise a mid-screen swipe per viewport until the
// screenshot stops changing, a sheet opens by accident, or --max-viewports. Ends by merging into
// measured.json.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { box, readJson, writeJson } from './lib/schemas.mjs';
import { elementKey } from './lib/page-offset.mjs';
import { decodePngFile, differingRowFraction } from './lib/png.mjs';
import { mergeAxIntoNative, parseDescribe } from './lib/ax-describe.mjs';
import { classifyOverlays, contentExtent, findOpenedSheet, isBannerLabel } from './lib/overlays.mjs';
import { loadArgentLib, makeClient, idle, describeWithRecovery, readAx } from './lib/argent-client.mjs';
import { mergePass, summarise } from './measure-merge.mjs';

const HELP = `Usage:
  node measure.mjs --udid ID --bundle BUNDLE --out PASSDIR
      [--overlap 120] [--max-viewports 8] [--reproduce baseline.json] [--no-containers] [--containers spec.json]
      [--safe-area-top N] [--build "draft v52"] [--no-refresh] [--runner fake.mjs] [--json]

Writes PASSDIR/device-<k>.png (full resolution, never shown to the model), PASSDIR/raw/describe-<k>.json
(native-describe-screen), raw/ax-<k>.json (describe), raw/views-1.json
(containers), raw/device.json, raw/scroll.json, measure.log and measured.json.
Fresh config first: restart-app; the caller handles sign-in
and LogBox before calling (a banner still on screen is reported as WARN and excluded, never tapped).
No swipe when viewport 1 fits the screen; otherwise a swipe from mid-screen (0.62 → 0.22), and the pass
stops when the screenshot no longer changes or a sheet opens. The scroll delta is measured from the
screenshots and the dumps, never assumed from the swipe.
--reproduce nudges each viewport until the stored anchor text sits within 1pt of its stored window y.
--containers reads up to 15 container elements of the spec with native-view-at-point in viewport 1.
--runner (or LOOPS_FAKE_ARGENT) loads a module exporting runArgent(tool, args) in place of argent.

Exit codes: 0 ok, 1 error, 2 usage, 3 no viewport captured, 5 native devtools unavailable, 6 argent not found.`;

// Safe-area top per simulator model, in points. Only the iPhone 16 Pro value was read on a
// device (one app's avatar top sat at 62pt); the others are Apple's published insets (R12).
export const SAFE_AREA_TOP_BY_MODEL = {
  'iPhone 17 Pro': 62, 'iPhone 17': 62, 'iPhone 16 Pro Max': 62, 'iPhone 16 Pro': 62, 'iPhone 16 Plus': 59, 'iPhone 16': 59,
  'iPhone 15 Pro Max': 59, 'iPhone 15 Pro': 59, 'iPhone 15 Plus': 59, 'iPhone 15': 59, 'iPhone 14 Pro Max': 59, 'iPhone 14 Pro': 59,
  'iPhone 14 Plus': 47, 'iPhone 14': 47, 'iPhone 13': 47, 'iPhone 13 mini': 50, 'iPhone SE': 20,
};

// A swipe that starts near the bottom edge opens the Preview app's dev menu instead of scrolling.
export const SWIPE = Object.freeze({ fromX: 0.5, fromY: 0.62, toX: 0.5, toY: 0.22, durationMs: 450, momentum: false });
export const IDENTICAL_ROWS = 0.002;
export const FITS_SLACK = 4;

export function safeAreaFor(model, override = null) {
  if (typeof override === 'number' && Number.isFinite(override)) return { value: override, source: 'flag' };
  const name = String(model ?? '');
  if (SAFE_AREA_TOP_BY_MODEL[name] !== undefined) return { value: SAFE_AREA_TOP_BY_MODEL[name], source: name === 'iPhone 16 Pro' ? 'known' : 'table' };
  const prefix = Object.keys(SAFE_AREA_TOP_BY_MODEL).filter((key) => name.startsWith(key)).sort((left, right) => right.length - left.length)[0];
  return prefix ? { value: SAFE_AREA_TOP_BY_MODEL[prefix], source: 'table' } : { value: 59, source: 'guess' };
}

/** Two describe dumps show the same screen when every key is back at the same frame. */
export function sameScreen(prev, cur, eps = 0.5) {
  const a = (prev?.elements ?? []).filter((element) => box(element.frame)); const b = (cur?.elements ?? []).filter((element) => box(element.frame));
  if (a.length !== b.length || !a.length) return false;
  const index = new Map(a.map((element) => [elementKey(element), box(element.frame)]));
  return b.every((element) => { const frame = index.get(elementKey(element)); const now = box(element.frame); return frame && Math.abs(frame.y - now.y) <= eps && Math.abs(frame.x - now.x) <= eps; });
}

/** A short swipe that moves the content by diffPt (positive = the anchor sits too low, move it up). */
export function nudgeFor(diffPt, screenH) {
  const fraction = Math.min(0.4, Math.abs(diffPt) / screenH);
  const fromY = 0.6;
  return { fromX: 0.5, fromY, toX: 0.5, toY: Math.round((diffPt > 0 ? fromY - fraction : fromY + fraction) * 1000) / 1000, durationMs: 300, momentum: false };
}

/** Whether two screenshots show the same pixels below the status band; null when a file does not decode. */
export function screenshotsIdentical(prevImage, curImage, { skipTopPt = 0, screenW }) {
  if (!prevImage || !curImage) return null;
  const fromRow = Math.round(skipTopPt * (curImage.width / screenW));
  return differingRowFraction(prevImage, curImage, { fromRow }) < IDENTICAL_ROWS;
}

export function pageFits(elements, screen) {
  return contentExtent(elements).bottom <= screen.h + FITS_SLACK;
}

/** Both dumps of one viewport, merged and classified; the raw answers are kept for the files. */
function readViewport(client, ctx) {
  const native = describeWithRecovery(client, ctx);
  const ax = readAx(client, ctx);
  const screen = ctx.screen ?? { w: box(native.screenFrame)?.w ?? 0, h: box(native.screenFrame)?.h ?? 0 };
  const elements = classifyOverlays(mergeAxIntoNative((native.elements ?? []).filter((element) => box(element.frame)), ax ? parseDescribe(ax).entries : [], screen), screen);
  return { native, ax, elements, screen };
}

function reproduceNudge(client, ctx, k, viewport) {
  const stored = ctx.baseline?.viewports?.find((entry) => entry.k === k);
  const anchor = stored?.anchors?.[0];
  if (!anchor) return viewport;
  let current = viewport;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const hit = (current.native.elements ?? []).find((element) => elementKey(element) === anchor.key);
    if (!hit) { client.log(`reproduce k${k}: anchor "${anchor.text}" not on screen`); return current; }
    const diff = box(hit.frame).y - anchor.windowY;
    if (Math.abs(diff) <= 1) { client.log(`reproduce k${k}: anchor within ${Math.round(diff * 10) / 10}pt`); return current; }
    client.call('gesture-swipe', { udid: ctx.udid, ...nudgeFor(diff, ctx.screen.h) });
    idle(client, ctx.udid);
    current = readViewport(client, ctx);
  }
  return current;
}

function readContainers(client, ctx, spec) {
  const screenH = ctx.screen.h;
  const containers = spec.elements.filter((element) => element.kind === 'container' && box(element.app) && box(element.app).y + box(element.app).h <= screenH).slice(0, 15);
  const views = [];
  for (const element of containers) {
    const app = box(element.app);
    const result = client.call('native-view-at-point', { udid: ctx.udid, bundleId: ctx.bundleId, x: app.x + app.w / 2, y: app.y + app.h / 2, includeAncestors: false, includeChildren: false, fields: ['className', 'frame', 'screenFrame', 'backgroundColor', 'clipsToBounds', 'nativeID', 'identifier', 'layerName', 'hidden', 'alpha'] });
    if (result.ok && result.data?.status === 'ok') views.push({ elementId: element.id, view: result.data.view ?? result.data });
  }
  writeJson(path.join(ctx.passDir, 'raw', 'views-1.json'), views);
  return views.length;
}

function writeDumps(ctx, k, viewport) {
  writeJson(path.join(ctx.passDir, 'raw', `describe-${k}.json`), viewport.native);
  if (viewport.ax) writeJson(path.join(ctx.passDir, 'raw', `ax-${k}.json`), viewport.ax);
}

export async function runMeasure(options) {
  const { udid, bundleId, passDir, maxViewports = 8, refresh = true } = options;
  fs.mkdirSync(path.join(passDir, 'raw'), { recursive: true });
  const lib = await loadArgentLib(options.runner ?? null);
  const client = makeClient(lib, passDir);
  const ctx = { udid, bundleId, passDir, recoveries: {}, baseline: options.reproduce ? readJson(options.reproduce) : null, screen: null };
  client.log(`start udid=${udid} bundle=${bundleId}${lib.fake ? ' runner=fake' : ''}`);
  const devices = client.call('list-devices', {});
  if (!devices.ok && /not on PATH/.test(devices.error ?? '')) throw Object.assign(new Error(devices.error), { exitCode: 6 });
  const device = (devices.data?.devices ?? []).find((entry) => entry.udid === udid || entry.serial === udid || entry.id === udid) ?? {};
  if (refresh) {
    client.call('restart-app', { udid, bundleId });
    idle(client, udid);
  }
  let current = readViewport(client, ctx);
  ctx.screen = current.screen;
  const safe = safeAreaFor(device.name ?? device.model, options.safeAreaTop ?? null);
  writeJson(path.join(passDir, 'raw', 'device.json'), { udid, model: device.name ?? device.model ?? null, bundleId, build: options.build ?? null, screen: ctx.screen, safeAreaTop: safe.value, safeAreaSource: safe.source });
  const warnings = [];
  let previous = null; let previousImage = null; let captured = 0; let scrolled = false; let stopReason = null;
  for (let shot = 1; shot <= maxViewports; shot += 1) {
    if (shot > 1) {
      client.call('gesture-swipe', { udid, ...SWIPE });
      idle(client, udid);
      current = readViewport(client, ctx);
      if (ctx.baseline) current = reproduceNudge(client, ctx, shot, current);
      const opened = findOpenedSheet(previous.elements, current.elements, ctx.screen);
      if (opened) { warnings.push(`accidental sheet: "${opened}" opened after the swipe at viewport ${shot}; dismiss it through the tree before the next pass`); stopReason = 'sheet'; break; }
    }
    const png = path.join(passDir, `device-${shot}.png`);
    if (!client.screenshot(udid, png)) throw new Error(`screenshot ${shot} failed; see measure.log`);
    const image = decodePngFile(png);
    if (shot > 1) {
      const same = screenshotsIdentical(previousImage, image, { skipTopPt: safe.value, screenW: ctx.screen.w }) ?? sameScreen(previous.native, current.native);
      if (same) { fs.unlinkSync(png); stopReason = scrolled ? 'bottom' : 'no-scroll'; client.log(`k${shot}: the screenshot repeats viewport ${shot - 1}; ${stopReason}`); break; }
      scrolled = true;
    }
    writeDumps(ctx, shot, current);
    captured = shot; previous = current; previousImage = image;
    if (shot === 1) {
      const banners = current.elements.filter((element) => element.overlay === 'banner' && isBannerLabel(element.label)).map((element) => `"${element.label}"`);
      if (banners.length) warnings.push(`banners on screen: ${banners.join(', ')}; dismiss them through the tree (await-ui-element, then the tree's tap point), never by a blind tap; their rows are excluded`);
      if (pageFits(current.elements, ctx.screen)) { stopReason = 'fits'; client.log('k1: the content fits the screen; no swipe'); break; }
    }
    if (shot === maxViewports) stopReason = 'max-viewports';
  }
  if (!captured) throw Object.assign(new Error('no viewport captured'), { exitCode: 3 });
  writeJson(path.join(passDir, 'raw', 'scroll.json'), { scrolled, stopReason, swipe: SWIPE, warnings });
  for (const warning of warnings) client.log(`WARN ${warning}`);
  if (options.containers) client.log(`containers: ${readContainers(client, ctx, readJson(options.containers))} views read`);
  const measured = mergePass({ passDir, mode: 'native', safeAreaTop: safe.value });
  writeJson(path.join(passDir, 'measured.json'), measured);
  client.log(`done ${summarise(measured)}`);
  return measured;
}

async function main() {
  const { values } = parseArgs({
    options: {
      udid: { type: 'string' }, bundle: { type: 'string' }, out: { type: 'string' },
      overlap: { type: 'string', default: '120' }, 'max-viewports': { type: 'string', default: '8' }, reproduce: { type: 'string' }, containers: { type: 'string' }, 'no-containers': { type: 'boolean', default: false },
      'safe-area-top': { type: 'string' }, build: { type: 'string' }, 'no-refresh': { type: 'boolean', default: false }, runner: { type: 'string' }, json: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) { console.log(HELP); return 0; }
  if (!values.udid || !values.bundle || !values.out) { console.error('measure needs --udid, --bundle and --out. Run with --help.'); return 2; }
  const measured = await runMeasure({
    udid: values.udid, bundleId: values.bundle, passDir: values.out, maxViewports: Number(values['max-viewports']),
    reproduce: values.reproduce ?? null, containers: values['no-containers'] ? null : values.containers ?? null, safeAreaTop: values['safe-area-top'] ? Number(values['safe-area-top']) : null, build: values.build ?? null, refresh: !values['no-refresh'],
    runner: values.runner ?? null,
  });
  const low = measured.viewports.filter((viewport) => viewport.offsetConfidence === 'low').map((viewport) => viewport.k);
  if (values.json) console.log(JSON.stringify({ out: path.join(values.out, 'measured.json'), viewports: measured.viewports.length, lowConfidence: low, bands: measured.bands, scrolled: measured.scrolled, stopReason: measured.stopReason, warnings: measured.warnings }));
  else {
    console.log(`OK ${summarise(measured)} → ${path.join(values.out, 'measured.json')}`);
    for (const warning of measured.warnings) console.log(`WARN ${warning}`);
    if (low.length) console.log(`WARN offsets with low confidence in viewport ${low.join(', ')}: re-shoot before trusting their rows`);
  }
  return 0;
}

// Compare real paths: Node resolves the main module through symlinks (~/.claude/skills links), argv[1] does not.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().then((code) => process.exit(code), (error) => { console.error(error.message); process.exit(error.exitCode ?? 1); });
}
