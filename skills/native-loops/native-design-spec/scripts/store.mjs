#!/usr/bin/env node
// The solution design store: one folder per app under <solution>/design/<app-id>/ that holds every screen's
// design source as given, its reference picture at device size, and the design spec the UI check measures against.
// Figma frames come in through the design-capture agent; HTML prototypes through a browser measure; screenshots
// as pictures with whatever boxes someone marked on them. A WEB app's store keeps one reference and one spec
// per screen and width (screens/<screen>@<width>.png, specs/<screen>@<width>.json), in CSS px, 1:1.
import { copyFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { figmaCallsOf, installErrorLines, parseArgs, need, num, readJson, readJsonIfExists, writeJsonAtomic } from './lib/args.mjs';
import { buildSpec, mergeRegionMap } from './lib/spec/build.mjs';
import { formatSummary, summarize } from './lib/spec/summary.mjs';
import { HTML_EXCLUDE, measureToSources, readMeasure } from './lib/html-measure.mjs';
import { boxesToSources, dominantColors, IMAGE_EXT, readImage, toReferencePng } from './lib/screenshot.mjs';
import { readIhdr } from './lib/png.mjs';
import * as cache from './lib/cache.mjs';
import {
  addSource, specFile, ensureStore, findEntry, isWeb, loadStore, parseWidths, platformOf, regionMapFile, screenEntry, screenFile, screenKey, screenOf,
  storeDir, WEB_WIDTHS, webWidthOfPicture, widthsOf, writeIndex,
} from './lib/store.mjs';

const HELP = `store — the solution design store <solution>/design/<app-id>/ (design.md, sources/, screens/, specs/).

Usage: every command takes --app <appId> [--solution <dir>, default the current folder] [--json].
A screen is --page P in --state S (default idle): files are named <page> or <page>--<state>.
A WEB store (init --platform web) keeps one screen per width: <page>[--<state>]@<width>, in CSS px, 1:1 (no device
scale, no grid, no safe top). --width <px> names it; without it a command takes the width a source says (a measure's
window, a Figma frame's --frame-width, a picture's own width at 1x, 2x or 3x) or the only width the screen has.

  init                     [--platform mobile|web] [--widths 1440,375 (WEB)] [--app-name N]
                           [--device-model M] [--device-width 402] [--device-height 874] [--safe-area-top 62] [--px-per-pt 3] (MOBILE)
  approve                  --words "<the person's words>"     records who approved the design and when
  add-source <files...>    [--page P [--state S]] [--kind html|screenshot|pdf|css|svg|figma-export|other] [--version V] [--notes T]
  add-screen               --page P [--state S] --image <png|jpg|heic|...> [--source-kind figma|html|screenshot]
                           [--source sources/F] [--figma <fileKey>:<nodeId>] [--url U] [--frame-width PT] [--max-width PX]
                           [--width PX (WEB)] [--page-id ID] [--page-name N] [--version V] [--notes T]
  spec-from-measure        --page P [--state S] --measure <measure.json> (WEB: one --measure per width, repeatable)
                           [--width PX (WEB, one measure)] [--page-id ID] [--page-name N] [--scale R]
                           [--grid N] [--status-band auto|PT] [--safe-area-top PT] [--pinned-top RE] [--pinned-bottom RE]
                           [--skip-region RE] [--exclude-names RE] [--region-depth auto|1|2]
  spec-from-screenshot     --page P [--state S] [--width PX (WEB)] [--image F (default the screen's reference)] [--boxes boxes.json]
                           [--frame-width PT] [--status-band PT (default the device safe top; 0 on WEB)] [--page-id ID] [--page-name N]
  add-spec                 --page P [--state S] --spec <spec.json> [--width PX (WEB)] [--region-map F] [--figma <fileKey>:<nodeId>]
                           (a spec with the old schema id loops.pixel.contract/1 is taken too)
  link-run                 --page P [--state S] [--width PX (WEB; default the widest)] --run-dir RUN
                                                                fills RUN/board/ (spec, region map, reference, board.json)
  serve                    [--port 0]                           serves the store on http://127.0.0.1 for the browser
  status                   [--page P]

What each writes
  sources/                  the files as given (the same content is never copied twice); measures and marked boxes too
  screens/<screen>.png      the reference picture, at most --max-width px wide (default device width x px-per-pt;
                            WEB: screens/<screen>@<width>.png, at most 2 x the width)
  specs/<screen>.json       loops.design.spec/1, the design spec native-visual-check reads; <screen>.region-map.json beside it
                            (WEB: specs/<screen>@<width>.json, the file web-visual-check reads for that width)
A store made before specs/ had contracts/: the first command that opens it moves the folder to specs/ once.
  design.md                 the index: screen, state, [width (WEB)], page, source, version, reference, spec, notes
Exit codes: 0 done, 1 bad input.`;

const FLAGS = ['help', 'json'];
const REPEAT = ['pinned-top', 'pinned-bottom', 'skip-region', 'measure'];

function context(args) {
  need(args, 'app');
  return { dir: storeDir(args.solution ?? process.cwd(), args.app) };
}

function print(args, value, lines) {
  if (args.json) console.log(JSON.stringify(value, null, 2));
  else for (const line of lines) console.log(line);
}

// "<fileKey>:<nodeId>"; a node id carries its own colon (12:34), the file key never does.
function parseFigma(text) {
  if (!text) return null;
  const match = /^([^:]+):(.+)$/.exec(text);
  if (!match) throw new Error(`--figma wants <fileKey>:<nodeId>, got "${text}"`);
  return { fileKey: match[1], nodeId: match[2] };
}

const naming = (entry, args) => {
  if (args['page-id']) entry.pageId = args['page-id'];
  if (args['page-name']) entry.pageName = args['page-name'];
};

// The pixel width of a picture: a PNG's header, anything else after sips made it a PNG.
function pictureWidth(file) {
  const ihdr = readIhdr(file);
  if (ihdr) return ihdr.width;
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'design-width-'));
  try { return toReferencePng(file, path.join(tmp, 'picture.png')).width; } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// The CSS px width a WEB picture shows: --width, else --frame-width (a Figma frame's own width), else the picture's
// own width read as a known width at 1x, 2x or 3x.
function webWidth(args, image) {
  const given = num(args.width) ?? num(args['frame-width']);
  if (given) return { width: Math.round(given), from: args.width ? '--width' : '--frame-width' };
  const px = pictureWidth(image);
  const found = webWidthOfPicture(px);
  if (!found) throw new Error(`${path.basename(image)} is ${px} px wide, which is no known width at 1x, 2x or 3x: pass --width <the CSS px width it shows>`);
  return { width: found.width, from: `the picture's ${px} px at ${found.k}x` };
}

// Copies the picture into sources/, writes screens/<screen>.png (WEB: screens/<screen>@<width>.png) and records the screen.
function addScreen(dir, index, args) {
  if (!IMAGE_EXT.test(args.image)) throw new Error(`${args.image} is not a picture (png, jpg, heic, webp, gif, tiff)`);
  const web = isWeb(index) ? webWidth(args, args.image) : null;
  const entry = web ? screenEntry(index, args.page, args.state, web.width) : screenEntry(index, args.page, args.state);
  const sourceKind = args['source-kind'] ?? (args.figma ? 'figma' : 'screenshot');
  const { entry: source } = addSource(dir, index, args.image, { kind: sourceKind === 'screenshot' ? 'screenshot' : `${sourceKind}-screenshot`, screen: entry.key, version: args.version, notes: args.notes });
  const maxWidth = num(args['max-width'], web ? web.width * 2 : Math.round(index.device.widthPt * index.device.pxPerPt));
  const result = toReferencePng(args.image, path.join(dir, screenFile(entry.key)), { maxWidth });
  const frameWidth = web ? web.width : num(args['frame-width'], index.device.widthPt);
  const figma = parseFigma(args.figma);
  Object.assign(entry, {
    reference: screenFile(entry.key),
    px: { width: result.width, height: result.height },
    pxPerPt: Number((result.width / frameWidth).toFixed(4)),
    frame: { widthPt: frameWidth, heightPt: Number((result.height / (result.width / frameWidth)).toFixed(1)) },
    source: args.source ?? (sourceKind === 'screenshot' ? source.file : entry.source ?? source.file), sourceKind,
    url: args.url ?? entry.url, version: args.version ?? entry.version ?? source.version,
    figma: figma ?? entry.figma, notes: args.notes ?? entry.notes, updatedAt: new Date().toISOString(),
  });
  naming(entry, args);
  return { entry, result, frameWidth, widthFrom: web?.from ?? null };
}

function recordSpec(dir, entry, spec, map, args) {
  const out = path.join(dir, specFile(entry.key));
  const mapOut = path.join(dir, regionMapFile(entry.key));
  writeJsonAtomic(out, spec);
  writeJsonAtomic(mapOut, mergeRegionMap(map, readJsonIfExists(mapOut, {})));
  const summary = summarize(spec);
  Object.assign(entry, {
    spec: specFile(entry.key), regionMap: regionMapFile(entry.key), updatedAt: new Date().toISOString(),
    specSummary: { elements: summary.elements, regions: summary.regions, unknownFonts: summary.unknownFonts, visual: summary.visual, sources: summary.sources },
  });
  naming(entry, args);
  return { out, mapOut, summary };
}

const deviceOpts = (index, args) => ({
  deviceWidth: index.device.widthPt, deviceHeight: index.device.heightPt, deviceModel: index.device.model,
  safeAreaTop: num(args['safe-area-top'], index.device.safeAreaTop),
});

// A WEB spec: 1:1 in CSS px at the screen's width; build.mjs fills the rest (grid 1, safe top 0, band 0, no bars dropped).
const webOpts = (width, height, args) => ({
  platform: 'web', deviceWidth: width, deviceHeight: Math.round(height), scale: args.scale, grid: num(args.grid),
  safeAreaTop: num(args['safe-area-top']), statusBand: args['status-band'], excludeNames: args['exclude-names'],
});

const specLines = (written, notes, extra = []) => [`OK spec ${written.out}`, ...formatSummary(written.summary).map((line) => `  ${line}`), ...extra, ...notes.map((note) => `  note: ${note}`), `OK region-map ${written.mapOut}`];

// One HTML measure → one spec. WEB: at the width of the window the measure was taken in (or --width), 1:1.
function measureSpec(dir, index, args, file) {
  const web = isWeb(index);
  const measure = readMeasure(file);
  const width = web ? Math.round(num(args.width) ?? num(measure.viewport?.width) ?? num(measure.root?.w)) : null;
  if (web && !width) throw new Error(`${file} names no window width: pass --width <px>`);
  const entry = web ? screenEntry(index, args.page, args.state, width) : screenEntry(index, args.page, args.state);
  const { entry: kept } = addSource(dir, index, file, { kind: 'html-measure', screen: entry.key, notes: measure.url ?? null, name: `${entry.key}.measure.json` });
  const built = measureToSources(measure, { pageName: args['page-name'] ?? entry.pageName ?? undefined, platform: web ? 'web' : null });
  const factor = index.device.widthPt / built.frame.w;
  const html = index.sources.find((source) => source.kind === 'html' && [entry.key, screenOf(entry.key)].includes(source.screen)) ?? index.sources.find((source) => source.kind === 'html');
  const fit = web
    ? webOpts(width, built.frame.h, args)
    : { scale: args.scale, grid: num(args.grid, !args.scale && Math.abs(factor - 1) < 0.005 ? 1 : 4), ...deviceOpts(index, args), statusBand: args['status-band'] ?? 'auto', statusBandDefault: 0, excludeNames: args['exclude-names'] ?? HTML_EXCLUDE };
  const { spec, regionMap } = buildSpec({
    document: built.document, designContext: { records: built.records },
    opts: {
      notes: [...built.notes], page: args['page-id'] ?? entry.pageId ?? entry.page, app: args.app, pageName: args['page-name'] ?? entry.pageName, appName: index.appName,
      textCapTrim: 'off', capTrimGaps: false, positions: 'relative', positionsEvidence: 'html-measure', ...fit,
      pinnedTop: [...built.pinnedTop, ...(args['pinned-top'] ?? [])], pinnedBottom: [...built.pinnedBottom, ...(args['pinned-bottom'] ?? [])],
      skipRegion: args['skip-region'], regionDepth: args['region-depth'],
      labels: { metadata: 'html', 'design-context': 'html' },
      nodeHook: (nodes) => { for (const node of nodes) if (built.imageIds.has(node.id)) node.imageFill = true; },
      screenshot: entry.reference, pxPerPt: entry.pxPerPt,
      sources: { metadata: null, designContext: null, css: null, svg: null, overrides: null, html: html?.file ?? null, measure: kept.file },
      design: { kind: 'html', url: measure.url ?? null, title: measure.title ?? null, viewport: measure.viewport ?? null, background: built.background, reference: entry.reference ?? null, ...(web ? { width } : {}) },
    },
  });
  const written = recordSpec(dir, entry, spec, regionMap, args);
  entry.sourceKind ??= 'html';
  entry.source ??= html?.file ?? kept.file;
  entry.url ??= measure.url ?? null;
  entry.version ??= html?.version ?? kept.version;
  return { json: { out: written.out, regionMap: written.mapOut, summary: written.summary, notes: spec.notes, ...(web ? { width } : {}) }, lines: specLines(written, spec.notes) };
}

const loadStoreIfAny = (dir) => { try { return loadStore(dir); } catch { return null; } };

const commands = {
  init(args) {
    const { dir } = context(args);
    const platform = platformOf(args.platform);
    const widths = args.widths ? parseWidths(args.widths) : null;
    if (widths && platform !== 'WEB' && !isWeb(loadStoreIfAny(dir))) throw new Error('--widths is for a WEB store: init --platform web --widths 1440,375');
    const device = platform === 'WEB' ? {} : { model: args['device-model'], widthPt: num(args['device-width']), heightPt: num(args['device-height']), safeAreaTop: num(args['safe-area-top']), pxPerPt: num(args['px-per-pt']) };
    const { index, created } = ensureStore(dir, args.app, { appName: args['app-name'], device, platform, widths });
    print(args, { dir, created, index }, [`OK store ${dir} (${created ? 'created' : 'already there'})`, isWeb(index)
      ? `WEB: widths ${index.widths.join(', ')}; one spec per width, CSS px, 1:1`
      : `device ${index.device.model} ${index.device.widthPt}x${index.device.heightPt}pt, safe top ${index.device.safeAreaTop}, ${index.device.pxPerPt} px/pt`]);
  },

  approve(args) {
    need(args, 'words');
    const { dir } = context(args);
    const index = loadStore(dir);
    index.approved = { words: args.words, at: new Date().toISOString() };
    writeIndex(dir, index);
    print(args, { approved: index.approved }, [`OK approved: ${args.words}`]);
  },

  'add-source'(args) {
    const { dir } = context(args);
    const index = loadStore(dir);
    const files = args._.slice(1);
    if (!files.length) throw new Error('name at least one file to add');
    const screen = args.page ? screenKey(args.page, args.state) : null;
    const added = files.map((file) => addSource(dir, index, file, { kind: args.kind, screen, version: args.version, notes: args.notes }));
    writeIndex(dir, index);
    print(args, { added: added.map((item) => ({ ...item.entry, copied: item.copied })) }, added.map((item) => `OK source ${item.entry.file} (${item.entry.kind}${item.copied ? '' : ', already there'})`));
  },

  'add-screen'(args) {
    need(args, 'page', 'image');
    const { dir } = context(args);
    const index = loadStore(dir);
    const { entry, result, frameWidth, widthFrom } = addScreen(dir, index, args);
    writeIndex(dir, index);
    print(args, { screen: entry }, [isWeb(index)
      ? `OK screen ${entry.reference} ${result.width}x${result.height}px (${result.tool}), width ${frameWidth} (from ${widthFrom}), ${entry.pxPerPt} px per CSS px`
      : `OK screen ${entry.reference} ${result.width}x${result.height}px (${result.tool}), ${entry.pxPerPt} px per design pt, frame ${frameWidth}pt wide`]);
  },

  'spec-from-measure'(args) {
    need(args, 'page', 'measure');
    const { dir } = context(args);
    const index = loadStore(dir);
    const web = isWeb(index);
    const files = [].concat(args.measure);
    if (!web && files.length > 1) throw new Error('one --measure per call on a MOBILE store');
    if (web && args.width && files.length > 1) throw new Error('--width goes with one --measure; each measure keeps the width of the window it was taken in');
    const results = files.map((file) => measureSpec(dir, index, args, file));
    writeIndex(dir, index);
    if (results.length === 1) print(args, results[0].json, results[0].lines);
    else print(args, { specs: results.map((result) => result.json) }, results.flatMap((result) => result.lines));
  },

  'spec-from-screenshot'(args) {
    need(args, 'page');
    const { dir } = context(args);
    const index = loadStore(dir);
    const web = isWeb(index);
    const entry = args.image ? addScreen(dir, index, args).entry : web ? findEntry(index, args.page, args.state, num(args.width)) : screenEntry(index, args.page, args.state);
    const image = entry?.reference ? path.join(dir, entry.reference) : null;
    if (!image || !existsSync(image)) throw new Error('no picture: pass --image, or run add-screen for this screen first');
    const ihdr = readIhdr(image);
    const frameWidth = web ? entry.width : num(args['frame-width'], entry.frame?.widthPt ?? index.device.widthPt);
    const pxPerPt = ihdr.width / frameWidth;
    const frame = { w: frameWidth, h: Number((ihdr.height / pxPerPt).toFixed(1)) };
    const { image: decoded, error } = readImage(image);
    const notes = decoded ? [] : [`colours not sampled: ${error ?? 'this PNG kind cannot be decoded without pngjs'}`];
    const boxesInput = args.boxes ? readJson(args.boxes) : [];
    const boxes = Array.isArray(boxesInput) ? boxesInput : boxesInput.boxes ?? [];
    const built = boxesToSources(boxes, { frame, pxPerPt, image: decoded, pageName: args['page-name'] ?? entry.pageName ?? entry.page });
    const palette = decoded ? dominantColors(decoded, null, { top: 6, inset: 0 }) : [];
    notes.push(...built.notes, 'not measurable from a picture: font size, line height, weight and family unless marked; letter-spacing; shadows, blurs and gradients; gaps between things nobody marked. Judge those from the reference.');
    const scale = index.device.widthPt / frameWidth;
    const fit = web
      ? webOpts(frameWidth, frame.h, args)
      : { scale, grid: num(args.grid, Math.abs(scale - 1) < 0.005 ? 1 : 4), ...deviceOpts(index, args), statusBand: String(num(args['status-band'], index.device.safeAreaTop)) };
    const { spec, regionMap } = buildSpec({
      document: built.document, designContext: { records: built.records },
      opts: {
        notes, page: args['page-id'] ?? entry.pageId ?? entry.page, app: args.app, pageName: args['page-name'] ?? entry.pageName, appName: index.appName,
        textCapTrim: 'off', capTrimGaps: false, positions: 'relative', positionsEvidence: 'marked-boxes', ...fit,
        pinnedTop: args['pinned-top'], pinnedBottom: args['pinned-bottom'], skipRegion: args['skip-region'], regionDepth: args['region-depth'] ?? 1,
        labels: { metadata: 'marked', 'design-context': 'marked' },
        nodeHook: (nodes) => { for (const node of nodes) if (built.imageIds.has(node.id)) node.imageFill = true; },
        screenshot: entry.reference, pxPerPt: Number(pxPerPt.toFixed(4)),
        sources: { metadata: null, designContext: null, css: null, svg: null, overrides: null, screenshot: entry.reference, boxes: null },
        design: { kind: 'screenshot', reference: entry.reference, palette, background: palette[0]?.color ?? null, boxes: boxes.length, visualReference: true, ...(web ? { width: frameWidth } : {}) },
      },
    });
    if (args.boxes) spec.sources.boxes = addSource(dir, index, args.boxes, { kind: 'marked-boxes', screen: entry.key, name: `${entry.key}.boxes.json` }).entry.file;
    const written = recordSpec(dir, entry, spec, regionMap, args);
    entry.sourceKind ??= 'screenshot';
    writeIndex(dir, index);
    print(args, { out: written.out, regionMap: written.mapOut, summary: written.summary, palette, notes: spec.notes }, specLines(written, spec.notes, [`  palette ${palette.map((item) => `${item.color} ${(item.share * 100).toFixed(0)}%`).join(' · ') || 'not sampled'}`]));
  },

  'add-spec'(args) {
    need(args, 'page', 'spec');
    const { dir } = context(args);
    const index = loadStore(dir);
    const spec = readJson(args.spec);
    // loops.pixel.contract/1 is the id a spec had before the rename; it is stored under the new one.
    if (!['loops.design.spec/1', 'loops.pixel.contract/1'].includes(spec.schema)) throw new Error(`${args.spec} is not a loops.design.spec/1`);
    spec.schema = 'loops.design.spec/1';
    const map = readJsonIfExists(args['region-map'] ?? path.join(path.dirname(args.spec), 'region-map.json'), {}) ?? {};
    const webSpec = spec.device?.platform === 'web';
    let entry;
    if (isWeb(index)) {
      const factor = spec.scale?.factor ?? 1;
      if (Math.abs(factor - 1) > 0.005 || (spec.device?.safeAreaTop ?? 0) > 0) {
        throw new Error(`${args.spec} is scaled to a phone (factor ${factor}, safe top ${spec.device?.safeAreaTop ?? 0}): a WEB app's spec is 1:1, make it with figma-spec.mjs --platform web`);
      }
      const width = Math.round(num(args.width) ?? (webSpec ? spec.device.widthPt : null) ?? num(spec.figma?.width) ?? 0);
      if (!width) throw new Error(`${args.spec} names no width: pass --width <px>`);
      entry = screenEntry(index, args.page, args.state, width);
    } else {
      if (webSpec) throw new Error(`${args.spec} is a WEB spec (device.platform web) and this store is MOBILE`);
      entry = screenEntry(index, args.page, args.state);
    }
    const figma = parseFigma(args.figma) ?? (spec.figma?.fileKey ? { fileKey: spec.figma.fileKey, nodeId: spec.figma.nodeId } : null);
    if (figma) { entry.figma = figma; entry.sourceKind ??= 'figma'; }
    const written = recordSpec(dir, entry, spec, map, { 'page-id': spec.page?.id, 'page-name': spec.page?.name, ...args });
    writeIndex(dir, index);
    print(args, { out: written.out, regionMap: written.mapOut, summary: written.summary }, specLines(written, []));
  },

  'link-run'(args) {
    need(args, 'page', 'run-dir');
    const { dir } = context(args);
    const index = loadStore(dir);
    // WEB: the width asked, else the widest the screen has; the visual check reads every other width from the store.
    const entry = isWeb(index) ? findEntry(index, args.page, args.state, num(args.width), { pick: 'widest' }) : index.screens[screenKey(args.page, args.state)];
    if (!entry?.spec) throw new Error(`no spec for ${entry?.key ?? screenKey(args.page, args.state)} in ${dir}: build one first (status says how)`);
    const board = path.join(args['run-dir'], 'board');
    mkdirSync(board, { recursive: true });
    const spec = readJson(path.join(dir, entry.spec));
    copyFileSync(path.join(dir, entry.spec), path.join(board, 'spec.json'));
    if (entry.regionMap && existsSync(path.join(dir, entry.regionMap))) copyFileSync(path.join(dir, entry.regionMap), path.join(board, 'region-map.json'));
    const hasReference = Boolean(entry.reference && existsSync(path.join(dir, entry.reference)));
    if (hasReference) copyFileSync(path.join(dir, entry.reference), path.join(board, 'screenshot.png'));
    const boardFile = path.join(board, 'board.json');
    const current = readJsonIfExists(boardFile);
    const value = {
      schema: 'loops.design-board/1', page: entry.pageId ?? entry.page,
      store: { dir, screen: entry.key, page: entry.page, state: entry.state, sourceKind: entry.sourceKind, version: entry.version, ...(entry.width ? { width: entry.width, widths: widthsOf(index, entry.page, entry.state === 'idle' ? null : entry.state) } : {}) },
      figma: { fileKey: entry.figma?.fileKey ?? spec.figma?.fileKey ?? null, nodeId: entry.figma?.nodeId ?? spec.figma?.nodeId ?? null, frameName: spec.figma?.frameName ?? null, width: spec.figma?.width ?? entry.frame?.widthPt ?? null, height: spec.figma?.height ?? entry.frame?.heightPt ?? null, pxPerPt: entry.pxPerPt ?? null },
      sources: { screenshot: null, metadata: null, designContext: null, exports: { css: null, svg: null, pdf: null, png: hasReference ? 'screenshot.png' : null, svgRaster: null, pdfText: null, other: [] } },
      regions: spec.regions.map((region) => ({ name: region.name, figmaNodeId: region.figmaNodeId, figma: region.figma })),
      crops: current?.crops ?? [], figmaCalls: figmaCallsOf(current), createdAt: current?.createdAt ?? new Date().toISOString(),
    };
    const linked = entry.figma?.fileKey && entry.figma?.nodeId ? cache.link(entry.figma.fileKey, entry.figma.nodeId, args['run-dir']) : null;
    writeJsonAtomic(boardFile, value);
    print(args, { board, spec: path.join(board, 'spec.json'), reference: hasReference ? path.join(board, 'screenshot.png') : null, figmaCache: linked?.target ?? null }, [`OK board ${board} from ${entry.spec}${hasReference ? ` + ${entry.reference}` : ' (no reference picture)'}${linked ? ` · board/figma -> cache (${linked.mode})` : ''}`, 'next: board.mjs crops --run-dir RUN --out RUN/board/crops cuts the region crops']);
  },

  serve(args) {
    const { dir } = context(args);
    loadStore(dir);
    const root = realpathSync(dir);
    const types = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
    const server = http.createServer((request, response) => {
      let file = path.join(root, decodeURIComponent(new URL(request.url, 'http://x').pathname));
      try { file = realpathSync(file); } catch { response.writeHead(404).end('not found'); return; }
      if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end('outside the store'); return; }
      if (statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!existsSync(file)) { response.writeHead(404).end('not found'); return; }
      response.writeHead(200, { 'content-type': types[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      createReadStream(file).pipe(response);
    });
    server.listen(Number(args.port ?? 0), '127.0.0.1', () => {
      const { port } = server.address();
      const pages = loadStore(dir).sources.filter((source) => source.kind === 'html').map((source) => `http://127.0.0.1:${port}/${source.file}`);
      console.log(`OK serving ${dir} on http://127.0.0.1:${port}/ (stop it when the measure is done)`);
      for (const url of pages) console.log(`  ${url}`);
    });
  },

  status(args) {
    const { dir } = context(args);
    const index = loadStore(dir);
    const web = isWeb(index);
    const screens = Object.values(index.screens).filter((screen) => !args.page || screen.page === screenKey(args.page));
    const next = (screen) => {
      if (!screen.reference) return screen.sourceKind === 'html' ? `browser_take_screenshot${web ? ` at ${screen.width}` : ''}, then add-screen` : 'add-screen --image <picture>';
      if (!screen.spec) return screen.sourceKind === 'html' ? `measure in the browser${web ? ` at ${screen.width}` : ''}, then spec-from-measure` : screen.sourceKind === 'figma' ? `figma-spec.mjs${web ? ' --platform web' : ''}, then add-spec` : 'spec-from-screenshot [--boxes] (or none: the reference alone)';
      return screen.specSummary?.unknownFonts ? `${screen.specSummary.unknownFonts} font values unknown: a CSS export, a design context or marked fonts settle them` : 'ready';
    };
    const rows = screens.map((screen) => ({ screen: screen.key, page: screen.page, state: screen.state, ...(web ? { width: screen.width } : {}), pageId: screen.pageId, source: screen.sourceKind, version: screen.version, reference: screen.reference, spec: screen.spec, elements: screen.specSummary?.elements ?? null, next: next(screen) }));
    // WEB: a width of the store that a screen has no spec for is not compared at that width.
    const notCompared = [];
    if (web) {
      for (const base of [...new Set(screens.map((screen) => screenOf(screen.key)))].sort()) {
        for (const width of index.widths ?? WEB_WIDTHS) if (!index.screens[`${base}@${width}`]?.spec) notCompared.push({ screen: base, width });
      }
    }
    const unmeasured = index.sources.filter((source) => source.kind === 'html' && !Object.values(index.screens).some((screen) => screen.source === source.file));
    print(args, { dir, ...(web ? { platform: 'WEB', widths: index.widths } : {}), approved: index.approved, device: index.device, screens: rows, ...(web ? { notCompared } : {}), sources: index.sources.length, htmlUnmeasured: unmeasured.map((source) => source.file) }, [
      `store ${dir} · ${web ? `WEB, widths ${(index.widths ?? WEB_WIDTHS).join(', ')} · ` : ''}${index.approved ? 'approved' : 'not yet approved'} · ${index.sources.length} sources · ${Object.keys(index.screens).length} screens`,
      ...rows.map((row) => `${row.screen}: ${row.source ?? 'no source'} · reference ${row.reference ? 'yes' : 'no'} · spec ${row.spec ? `yes (${row.elements} elements)` : 'no'} · next: ${row.next}`),
      ...notCompared.map((item) => `${item.screen}@${item.width}: no spec, so not compared at ${item.width} (a measure, frame or picture at that width makes one)`),
      ...unmeasured.map((source) => `${source.file}: an HTML prototype no screen was measured from yet`),
    ]);
  },
};

export async function main(argv) {
  const args = parseArgs(argv, { flags: FLAGS, repeat: REPEAT });
  const command = args._[0];
  if (args.help || !command) { console.log(HELP); return args.help ? 0 : 1; }
  const run = commands[command];
  if (!run) throw new Error(`unknown command ${command} (see --help)`);
  await run(args);
  return 0;
}

// Compare real paths: Node resolves the main module through symlinks, argv[1] does not.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  installErrorLines();
  main(process.argv.slice(2)).then((code) => { if (code) process.exitCode = code; });
}
