#!/usr/bin/env node
// The design board of one page: links the Figma cache into the run, folds exports in, says which Figma
// call comes next, and cuts one crop per region for judging and for builders.
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { figmaCallsOf, installErrorLines, parseArgs, need, readJson, readJsonIfExists, writeJsonAtomic, slug } from './lib/args.mjs';
import * as cache from './lib/cache.mjs';
import { importExports, listExportFiles } from './lib/imports.mjs';
import { readIhdr, cropPng, hasSips, loadPngjs } from './lib/png.mjs';
import { parseXml } from './lib/xml.mjs';
import { readNodes } from './lib/spec/positions.mjs';

installErrorLines();

const HELP = `board — the design board of one page under <run>/board/.

Usage
  node board.mjs init   --run-dir <dir> --file-key <key> --node-id <id> [--page <slug>] [--exports <dir>]
  node board.mjs status --run-dir <dir> [--json]
  node board.mjs crops  --run-dir <dir> --out <dir> [--spec <spec.json>] [--max-width 400]
  node board.mjs cache  status|put|link|invalidate|rate-limit --file-key <key> --node-id <id> [options]

init    writes board.json, links board/figma -> the shared cache (LOOPS_HOME/figma-cache/<fileKey>/<nodeId>),
        imports --exports, then prints status.
status  what the board holds and the next cheapest Figma call: exports -> screenshot -> metadata (frame only)
        -> spec -> design context (only when fonts are unknown and no rate limit in the last 24 h).
crops   one PNG per region (<= --max-width px wide) from board/figma/screenshot.png, else from the PNG export,
        with sips (macOS) or a vendored pngjs; without either, crops.json lists the rectangles to cut.
cache   put <kind> <file> with kind metadata|screenshot|design-context|asset|export [--frame-width 440]
        [--max-dimension 4096] [--frame-name "..."]; link --run-dir <dir>; rate-limit [--what designContext].
Exit codes: 0 ok, 1 bad input, 2 nothing to crop.`;

const args = parseArgs(process.argv.slice(2), { flags: ['help', 'json'] });
const command = args._[0];
if (args.help || !command) { console.log(HELP); process.exit(args.help ? 0 : 1); }

const boardFile = (runDir) => path.join(runDir, 'board', 'board.json');
const readBoard = (runDir) => { const file = boardFile(runDir); if (!existsSync(file)) throw new Error(`${file} missing: run "board.mjs init" first`); return readJson(file); };

function emptyBoard({ page, fileKey, nodeId }) {
  return {
    schema: 'loops.design-board/1', page: page ?? null,
    figma: { fileKey, nodeId, frameName: null, width: null, height: null, pxPerPt: null },
    sources: { screenshot: null, metadata: null, designContext: null, exports: { css: null, svg: null, pdf: null, png: null, svgRaster: null, pdfText: null, other: [] } },
    regions: [], crops: [], figmaCalls: { calls: 0, rateLimitedAt: null }, createdAt: new Date().toISOString(),
  };
}

// A board filled from the solution design store (store.mjs link-run) for an HTML or screenshot source has no
// Figma frame behind it: nothing to fetch, nothing in the cache.
const fromStoreOnly = (board) => Boolean(board.store) && !board.figma?.fileKey;
const NO_CACHE = { files: { screenshot: null, metadata: null, designContext: null, screenshotJson: null, assets: [], exports: [] }, meta: {}, rateLimited: { designContext: null, hoursAgo: null, active: false } };

// Reads the cache into board.json: which files exist, the frame's name and size, pxPerPt.
function refresh(runDir, board) {
  if (fromStoreOnly(board)) return NO_CACHE;
  const status = cache.status(board.figma.fileKey, board.figma.nodeId);
  const figmaDir = path.join(runDir, 'board', 'figma');
  board.sources.screenshot = status.files.screenshot ? 'figma/screenshot.png' : null;
  board.sources.metadata = status.files.metadata ? 'figma/metadata.xml' : null;
  board.sources.designContext = status.files.designContext ? 'figma/design-context.md' : null;
  board.figma.frameName = status.meta.frameName ?? board.figma.frameName;
  board.figmaCalls = { ...figmaCallsOf(board), rateLimitedAt: status.rateLimited.designContext };
  delete board.budget;
  if (status.files.metadata) {
    try {
      const { root } = readNodes(parseXml(readFileSync(path.join(figmaDir, 'metadata.xml'), 'utf8')));
      board.figma.frameName = root.name; board.figma.width = root.w; board.figma.height = root.h; board.figma.rootTag = root.tag;
      board.regions = root.children.filter((child) => Number(child.w) > 0 && Number(child.h) > 0).map((child) => ({ name: child.name, figmaNodeId: child.id, figma: { x: child.x, y: child.y, w: child.w, h: child.h } }));
    } catch (error) { board.notes = [`metadata.xml unreadable: ${error.message}`]; }
  }
  const shotJson = status.files.screenshotJson;
  if (shotJson?.pxPerPt) board.figma.pxPerPt = shotJson.pxPerPt;
  else if (shotJson?.pxWidth && board.figma.width) board.figma.pxPerPt = Number((shotJson.pxWidth / board.figma.width).toFixed(4));
  else if (board.sources.exports?.pngPx && board.figma.width) board.figma.pxPerPt = Number((board.sources.exports.pngPx.width / board.figma.width).toFixed(4));
  return status;
}

function printStatus(runDir, board, status) {
  if (fromStoreOnly(board)) {
    const spec = readJsonIfExists(path.join(runDir, 'board', 'spec.json'));
    const next = { call: null, why: `the board comes from the design store (${board.store.sourceKind ?? 'unknown source'})` };
    if (args.json) { console.log(JSON.stringify({ board, next, spec: Boolean(spec) }, null, 2)); return; }
    console.log(`board from the design store: ${board.store.dir} page ${board.store.page} (${board.store.sourceKind ?? '?'}, ${board.store.version ?? 'no version'})`);
    console.log(`reference ${board.sources.exports?.png ? 'yes' : 'no'} · spec ${spec ? `yes (${spec.elements.length} elements)` : 'no'} · crops ${board.crops.length}`);
    console.log(`next: no Figma call — ${next.why}`);
    return;
  }
  const exportsHeld = Object.entries(board.sources.exports).filter(([key, value]) => ['css', 'svg', 'pdf', 'png'].includes(key) && value).map(([key]) => key);
  const specFile = path.join(runDir, 'board', 'spec.json');
  const spec = readJsonIfExists(specFile);
  const fontsUnknown = spec ? spec.elements.some((element) => element.kind === 'text' && element.expect.fontSize?.source === 'unknown') : !exportsHeld.includes('css') && !board.sources.designContext;
  const next = cache.nextCall(status, { hasPng: exportsHeld.includes('png'), hasCss: exportsHeld.includes('css'), fontsUnknown });
  const lines = [
    `board ${board.figma.fileKey}/${board.figma.nodeId} ${board.figma.frameName ? `"${board.figma.frameName}"` : ''} ${board.figma.width ? `${board.figma.width}x${board.figma.height}pt` : ''}`.trim(),
    `screenshot ${board.sources.screenshot ? `yes (${status.files.screenshot} bytes, ${board.figma.pxPerPt ?? '?'} px/pt)` : 'no'} · metadata ${board.sources.metadata ? `yes (${status.files.metadata} bytes${board.figma.rootTag === 'section' ? ', a SECTION: fetch the frame instead' : ''})` : 'no'} · design context ${board.sources.designContext ? 'yes' : 'no'}`,
    `exports ${exportsHeld.length ? exportsHeld.join(', ') : 'none'}${board.sources.exports.svgRaster ? ` (svg ${typeof board.sources.exports.svgRaster === 'string' ? board.sources.exports.svgRaster : 'rasterised by ' + board.sources.exports.svgRaster.tool})` : ''}`,
    `spec ${spec ? `yes (${spec.elements.length} elements)` : 'no'} · crops ${board.crops.length}`,
    `rate limit ${status.rateLimited.active ? `active (${status.rateLimited.hoursAgo.toFixed(1)} h ago)` : 'none recorded in 24 h'}`,
    `next: ${next.call ?? 'no Figma call'} — ${next.why}`,
  ];
  if (!spec && board.sources.metadata) lines.push('next after that: figma-spec.mjs --metadata board/figma/metadata.xml' + (exportsHeld.includes('css') ? ' --css board/' + board.sources.exports.css : ''));
  if (args.json) console.log(JSON.stringify({ board, cache: { files: status.files, rateLimited: status.rateLimited }, next, spec: Boolean(spec) }, null, 2));
  else for (const line of lines) console.log(line);
}

if (command === 'init') {
  need(args, 'run-dir', 'file-key', 'node-id');
  const runDir = args['run-dir'];
  mkdirSync(path.join(runDir, 'board'), { recursive: true });
  const board = readJsonIfExists(boardFile(runDir)) ?? emptyBoard({ page: args.page ?? null, fileKey: args['file-key'], nodeId: args['node-id'] });
  if (args.page) board.page = args.page;
  board.figma.fileKey = args['file-key']; board.figma.nodeId = args['node-id'];
  const linked = cache.link(board.figma.fileKey, board.figma.nodeId, runDir);
  writeJsonAtomic(boardFile(runDir), board);
  console.log(`OK link board/figma -> ${linked.target} (${linked.mode})`);
  if (args.exports) {
    const files = statSync(args.exports).isDirectory() ? listExportFiles(args.exports) : [args.exports];
    const { report } = importExports(runDir, files);
    for (const line of report) console.log(`OK export ${line.kind} ${line.copiedTo}${line.raster ? ` (${line.raster === 'unrasterised' ? 'unrasterised' : 'rasterised by ' + line.raster.tool})` : ''}`);
  }
  const fresh = readBoard(runDir);
  const status = refresh(runDir, fresh);
  writeJsonAtomic(boardFile(runDir), fresh);
  console.log(`OK board ${boardFile(runDir)}`);
  printStatus(runDir, fresh, status);
} else if (command === 'status') {
  need(args, 'run-dir');
  const board = readBoard(args['run-dir']);
  const status = refresh(args['run-dir'], board);
  writeJsonAtomic(boardFile(args['run-dir']), board);
  printStatus(args['run-dir'], board, status);
} else if (command === 'crops') {
  need(args, 'run-dir', 'out');
  const runDir = args['run-dir'];
  const board = readBoard(runDir);
  refresh(runDir, board);
  const maxWidth = Number(args['max-width'] ?? 400);
  const spec = readJsonIfExists(args.spec ?? path.join(runDir, 'board', 'spec.json'));
  const regions = spec ? spec.regions.map((region) => ({ key: region.key, name: region.name, figma: region.figma })) : board.regions.map((region) => ({ key: slug(region.name), name: region.name, figma: region.figma }));
  if (!regions.length) { console.log('FAIL crops no regions: build the spec or fetch metadata first'); process.exit(2); }
  const shot = board.sources.screenshot ? path.join(runDir, 'board', 'figma', 'screenshot.png') : board.sources.exports.png ? path.join(runDir, 'board', board.sources.exports.png) : null;
  if (!shot || !existsSync(shot)) { console.log('FAIL crops no screenshot.png and no PNG export to crop from'); process.exit(2); }
  const ihdr = readIhdr(shot);
  const pxPerPt = board.figma.width ? ihdr.width / board.figma.width : board.figma.pxPerPt;
  if (!pxPerPt) { console.log('FAIL crops frame width unknown: fetch metadata so px/pt can be derived'); process.exit(2); }
  mkdirSync(args.out, { recursive: true });
  const rects = regions.map((region) => ({ key: region.key, name: region.name, file: `${region.key.replace(/[#/]/g, '-')}.png`, rect: { x: region.figma.x * pxPerPt, y: region.figma.y * pxPerPt, w: region.figma.w * pxPerPt, h: region.figma.h * pxPerPt } }));
  const canCrop = hasSips() || (await loadPngjs());
  board.crops = [];
  if (!canCrop) {
    writeJsonAtomic(path.join(args.out, 'crops.json'), { source: shot, pxPerPt, maxWidth, crops: rects, how: 'sips -s format png --cropToHeightWidth <h> <w> --cropOffset <y> <x> <source> --out <file>; then --resampleWidth <maxWidth> when wider' });
    console.log(`OK crops.json ${path.join(args.out, 'crops.json')} (no sips and no pngjs: ${rects.length} rectangles listed for the model to cut)`);
  } else {
    for (const entry of rects) {
      const result = await cropPng(shot, entry.rect, path.join(args.out, entry.file), { maxWidth });
      board.crops.push({ region: entry.key, path: path.relative(runDir, path.join(args.out, entry.file)), px: { width: result.width, height: result.height }, rect: { x: result.x, y: result.y, w: result.w, h: result.h }, tool: result.tool });
      console.log(`OK crop ${entry.key} ${entry.file} ${result.width}x${result.height} (${result.tool}, from ${result.x},${result.y} ${result.w}x${result.h}px)`);
    }
  }
  writeJsonAtomic(boardFile(runDir), board);
  console.log(`OK crops ${board.crops.length} from ${path.basename(shot)} at ${pxPerPt.toFixed(3)} px/pt`);
} else if (command === 'cache') {
  const sub = args._[1];
  need(args, 'file-key', 'node-id');
  const key = args['file-key'], node = args['node-id'];
  if (sub === 'status') { const status = cache.status(key, node); console.log(args.json ? JSON.stringify(status, null, 2) : `${status.dir}\n${Object.entries(status.files).map(([name, value]) => `${name}: ${Array.isArray(value) ? value.length + ' files' : value && typeof value === 'object' ? JSON.stringify(value) : value ?? 'no'}`).join('\n')}\nrate limit: ${status.rateLimited.active ? 'active' : 'none in 24 h'}`); }
  else if (sub === 'put') { const [, , kind, file] = args._; if (!kind || !file) throw new Error('cache put <kind> <file>'); const result = cache.put(key, node, kind, file, { frameName: args['frame-name'], frameWidth: args['frame-width'] ? Number(args['frame-width']) : undefined, maxDimension: args['max-dimension'] ? Number(args['max-dimension']) : undefined, fileVersion: args['file-version'], name: args.name }); console.log(`OK put ${kind} ${result.target} (${result.size} bytes)${result.extra ? ' ' + JSON.stringify(result.extra) : ''}`); }
  else if (sub === 'link') { need(args, 'run-dir'); const linked = cache.link(key, node, args['run-dir']); console.log(`OK link ${linked.target} (${linked.mode})`); }
  else if (sub === 'invalidate') { const result = cache.invalidate(key, node); console.log(`OK invalidate ${result.dir} (${result.existed ? 'removed' : 'was empty'})`); }
  else if (sub === 'rate-limit') { cache.recordRateLimit(key, node, args.what ?? 'designContext'); console.log(`OK rate-limit recorded for ${args.what ?? 'designContext'}`); }
  else throw new Error(`cache ${sub ?? ''}: use status|put|link|invalidate|rate-limit`);
} else {
  throw new Error(`unknown command ${command} (see --help)`);
}
