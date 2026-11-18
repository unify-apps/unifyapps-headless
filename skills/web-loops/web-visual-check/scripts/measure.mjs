#!/usr/bin/env node
// Measures a WEB page's saved draft at one width in UnifyApps Headless's browser: every block box and every
// text, button and image with its computed style, into the visual check's measured.json. Node 22,
// no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BrowserError, command, evalIn, openPage } from '../../web-browser/scripts/lib/driver.mjs';
import { settle } from '../../web-browser/scripts/lib/collectors.mjs';
import { setWidth } from '../../web-browser/scripts/lib/breakpoints.mjs';
import { readDisplayNames } from '../../web-browser/scripts/lib/issues.mjs';
import { UsageError, main, restMouse } from '../../web-browser/scripts/lib/cli.mjs';
import { measureWebPage } from './lib/measure-page.mjs';
import { toMeasured } from './lib/to-measured.mjs';

const HELP = `Usage:
  node measure.mjs --browser <folder> --url <preview url> --width <px> --out <pass folder> [--no-open] [--blocks blocks.json]

Opens the page's draft on the preview route (unless --no-open), puts the preview at the width
(page-shot for 1366, 1440, 1680, 1920, 2560; the variant menu's phone tab for 375, the app frame
inside the phone frame), waits until it is still, and measures it in the page. Writes in the pass folder:
  raw/measure-<width>.json   what the page answered (loops.web.measure/1)
  measured.json              loops.visual.measured/1, CSS px, one viewport holding the whole page
  device-1.png               the page shot at that width
Prints one JSON line: { measured, elements, containers, shot, pageIds, width, opened, notes }.
Exit codes: open-page's own (3-7), 1 a browser command failed or the width is not offered, 2 usage.`;

export async function runMeasure(argv, { env = process.env } = {}) {
  const { values } = parseArgs({ args: argv, options: { browser: { type: 'string' }, url: { type: 'string' }, width: { type: 'string' }, out: { type: 'string' }, 'no-open': { type: 'boolean' }, blocks: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) return { help: HELP };
  const width = Number(values.width);
  if (!values.browser || !values.out || !Number.isInteger(width) || width <= 0) throw new UsageError('measure.mjs needs --browser <folder>, --width <px> and --out <pass folder>');
  if (!values['no-open'] && !values.url) throw new UsageError('give --url <preview url>, or --no-open to measure the page the browser shows');
  const folder = path.resolve(values.browser);
  const out = path.resolve(values.out);
  fs.mkdirSync(path.join(out, 'raw'), { recursive: true });
  let opened = null;
  if (!values['no-open']) {
    opened = openPage(folder, values.url, { env });
    if (!opened.ok) throw new BrowserError(`open-page: ${opened.message}`, opened.code, 'open-page');
  }
  const set = setWidth(folder, width, { env });
  if (!set.ok) throw new BrowserError(`width ${width}: ${set.message}`, 1, 'width');
  const still = evalIn(folder, settle, { quietMs: 500, capMs: 8000 }, { env });
  restMouse(folder, still, { env });
  const raw = evalIn(folder, measureWebPage, {}, { env, timeoutMs: 180000 });
  if (raw?.error) throw new BrowserError(`measure: ${raw.error}`, 1, 'eval');
  fs.writeFileSync(path.join(out, 'raw', `measure-${width}.json`), `${JSON.stringify(raw, null, 1)}\n`);
  let shot = set.shot ?? null;
  if (!shot) {
    command(folder, ['fit-page'], { env, check: false });
    command(folder, ['screenshot', `--filename=page-${width}.png`], { env, check: false });
    shot = path.join(folder, `page-${width}.png`);
  }
  let png = null;
  if (shot && fs.existsSync(shot)) {
    fs.copyFileSync(shot, path.join(out, 'device-1.png'));
    png = 'device-1.png';
  }
  const measured = toMeasured(raw, { width, displayNames: readDisplayNames(values.blocks), png });
  const file = path.join(out, 'measured.json');
  fs.writeFileSync(file, `${JSON.stringify(measured, null, 2)}\n`);
  return { measured: file, elements: measured.elements.length, containers: measured.containers.length, shot: png ? path.join(out, png) : null, pageIds: raw.pageIds, width: set, opened: opened ? { url: opened.url, loadedAt: opened.loadedAt } : null, notes: measured.notes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exit(await main(() => runMeasure(process.argv.slice(2))));
}
