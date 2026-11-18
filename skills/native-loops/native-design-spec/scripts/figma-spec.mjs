#!/usr/bin/env node
// Turns a Figma frame's metadata (plus a CSS export, design context, SVG and overrides when present) into
// spec.json: every element's expected device values, each with the source it came from.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { installErrorLines, parseArgs, need, readJson, readJsonIfExists, writeJsonAtomic } from './lib/args.mjs';
import { parseXml } from './lib/xml.mjs';
import { parseCssExport, parseDesignContext } from './lib/css.mjs';
import { parseSvgExport } from './lib/svg.mjs';
import { DEFAULT_EXCLUDE } from './lib/spec/regions.mjs';
import { buildSpec, mergeRegionMap } from './lib/spec/build.mjs';
import { summarize, formatSummary } from './lib/spec/summary.mjs';

installErrorLines();

const HELP = `figma-spec — write spec.json (loops.design.spec/1) from a Figma frame's metadata.

Usage
  node figma-spec.mjs --metadata figma/metadata.xml --page <id> --app <id> --out spec.json [options]

Sources
  --metadata <file>        get_metadata XML of the FRAME node (never a section). Required.
  --design-context <file>  get_design_context result (React + Tailwind, data-node-id attributes).
  --css <file>             the person's Figma CSS "all layers" export.
  --svg <file>             the person's SVG export; read by the script only, never by the model.
  --overrides <file>       JSON [{ key, property, value, words }] -> expect.<property> with source "override".
  --board <board.json>     fills figma.fileKey, frameName, screenshot and pxPerPt from the board.

Platform
  --platform web           a WEB app: the frame 1:1 in CSS px (factor 1, whole px, safe top 0, status band 0, no
                           phone bars dropped), device.widthPt the frame's own width (or --device-width). Keep it in
                           the store as specs/<screen>@<width>.json (store.mjs add-spec on a WEB store).

Scaling (MOBILE; the defaults are the settled 440 -> 402 rule)
  --scale 402/440          factor; default deviceWidth / frame width
  --grid 4  --font-round whole  --small-below 7  --text-cap-trim auto|on|off
  --device-width 402  --device-height 874  --device-model "iPhone 16 Pro"  --safe-area-top 62
  --status-band auto|<pt>  height of the drawn status bar (auto: the top child matching --exclude-names, else 54)

Regions
  --pinned-top <regex>  --pinned-bottom <regex>   (repeatable) regions that do not scroll
  --skip-region <regex>                           (repeatable) regions left out
  --region-depth auto|1|2                         auto: top-level children, single-child wrappers opened, one page frame opened
  --exclude-names <regex>                         dropped anywhere; default "${DEFAULT_EXCLUDE}"

Output
  --out spec.json  --region-map region-map.json (default beside --out)  --page-name  --app-name  --json  --help
Exit codes: 0 written, 1 bad input.`;

const args = parseArgs(process.argv.slice(2), { flags: ['help', 'json'], repeat: ['pinned-top', 'pinned-bottom', 'skip-region'] });
if (args.help || process.argv.length <= 2) { console.log(HELP); process.exit(args.help ? 0 : 1); }
need(args, 'metadata', 'page', 'app', 'out');
if (args.platform && !['web', 'mobile'].includes(String(args.platform).toLowerCase())) { console.error(`FAIL --platform must be web or mobile, got "${args.platform}"`); process.exit(1); }

const document = parseXml(readFileSync(args.metadata, 'utf8'));
const notes = [];
const cssRecords = args.css ? parseCssExport(readFileSync(args.css, 'utf8')) : [];
let designContext = null;
if (args['design-context']) {
  designContext = parseDesignContext(readFileSync(args['design-context'], 'utf8'));
  if (designContext.tooLarge) { notes.push('design context is the sparse-metadata fallback, not code; call get_design_context on sublayers or use a CSS export'); designContext = null; }
}
const svg = args.svg ? parseSvgExport(readFileSync(args.svg, 'utf8')) : null;
const board = args.board ? readJson(args.board) : null;
const overrides = args.overrides ? readJsonIfExists(args.overrides, []) : [];

const { spec, regionMap: map } = buildSpec({
  document, cssRecords, designContext, svg, board, overrides,
  opts: {
    notes, platform: args.platform, page: args.page, app: args.app, pageName: args['page-name'], appName: args['app-name'], fileKey: args['file-key'],
    scale: args.scale, grid: args.grid, fontRound: args['font-round'], smallBelow: args['small-below'], textCapTrim: args['text-cap-trim'],
    deviceWidth: args['device-width'], deviceHeight: args['device-height'], deviceModel: args['device-model'], safeAreaTop: args['safe-area-top'],
    statusBand: args['status-band'], pinnedTop: args['pinned-top'], pinnedBottom: args['pinned-bottom'], skipRegion: args['skip-region'],
    regionDepth: args['region-depth'], excludeNames: args['exclude-names'],
    sources: { metadata: args.metadata, designContext: designContext ? args['design-context'] : null, css: args.css ?? null, svg: args.svg ?? null, overrides: args.overrides ?? null },
  },
});
writeJsonAtomic(args.out, spec);
const mapFile = args['region-map'] ?? path.join(path.dirname(args.out), 'region-map.json');
writeJsonAtomic(mapFile, mergeRegionMap(map, existsSync(mapFile) ? readJson(mapFile) : {}));

const summary = summarize(spec);
if (args.json) console.log(JSON.stringify({ out: args.out, regionMap: mapFile, summary, notes }, null, 2));
else {
  console.log(`OK spec ${args.out}`);
  for (const line of formatSummary(summary)) console.log('  ' + line);
  for (const note of notes) console.log(`  note: ${note}`);
  console.log(`OK region-map ${mapFile}`);
}
