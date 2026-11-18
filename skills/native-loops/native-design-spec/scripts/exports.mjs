#!/usr/bin/env node
// Folds the person's Figma exports into a run's board: CSS all layers, PNG @1x, SVG (rasterised when big), PDF.
import { statSync } from 'node:fs';
import { installErrorLines, parseArgs, need } from './lib/args.mjs';
import { importExports, listExportFiles } from './lib/imports.mjs';

installErrorLines();

const HELP = `exports — copy Figma exports into <run>/board/exports/ and record them in board.json.

Usage
  node exports.mjs import --run-dir <dir> <files or folders...> [--json]

What happens to each file
  css   kept as is (the CSS "all layers" export; parsed by figma-spec.mjs --css)
  png   kept as is; its pixel size is recorded (pxPerPt = width / frame width)
  svg   kept; above 1 MB it is also rasterised to <name>.raster.png with sips (1x) or qlmanage, else marked unrasterised.
        The raw SVG is for the script only. Never read it into the model.
  pdf   kept; text goes to <name>.txt only when pdftotext is installed, else skipped
  other kept under sources.exports.other
Exit codes: 0 imported, 1 bad input.`;

const args = parseArgs(process.argv.slice(2), { flags: ['help', 'json'] });
const command = args._[0];
if (args.help || !command) { console.log(HELP); process.exit(args.help ? 0 : 1); }
if (command !== 'import') throw new Error(`unknown command ${command} (see --help)`);
need(args, 'run-dir');
const inputs = args._.slice(1);
if (!inputs.length) throw new Error('name at least one file or folder to import');
const files = inputs.flatMap((input) => (statSync(input).isDirectory() ? listExportFiles(input) : [input]));
const { report, board } = importExports(args['run-dir'], files);
if (args.json) { console.log(JSON.stringify({ report, exports: board.sources.exports }, null, 2)); process.exit(0); }
for (const line of report) {
  const extras = [line.px ? `${line.px}px` : null, line.raster ? (line.raster === 'unrasterised' ? 'unrasterised' : `rasterised by ${line.raster.tool} ${line.raster.width}x${line.raster.height}`) : null, line.text ? (typeof line.text === 'string' ? line.text : `text by ${line.text.tool}`) : null].filter(Boolean).join(', ');
  console.log(`${line.status === 'missing' ? 'FAIL' : 'OK'} ${line.kind ?? 'missing'} ${line.copiedTo ?? line.file}${extras ? ` (${extras})` : ''}`);
}
console.log(`OK exports ${Object.entries(board.sources.exports).filter(([key, value]) => ['css', 'svg', 'pdf', 'png'].includes(key) && value).map(([key]) => key).join(', ') || 'none'}`);
