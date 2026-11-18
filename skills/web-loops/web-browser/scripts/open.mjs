#!/usr/bin/env node
// Opens a WEB page's saved draft on the preview route in this test runner's browser, at one width, and
// waits until it is still. The first step of every WEB device request. Node 22, no dependencies.
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { BrowserError, evalIn, openPage } from './lib/driver.mjs';
import { settle } from './lib/collectors.mjs';
import { setWidth } from './lib/breakpoints.mjs';
import { UsageError, main } from './lib/cli.mjs';

const HELP = `Usage:
  node open.mjs --browser <folder> --url <preview url> [--width 1440] [--quiet-ms 500]

Runs open-page (signed in, the saved draft on https://<host>/p/0/interfaces/<app>/preview/<path>),
puts the preview at the width, then waits until the DOM is still. A platform device size (1366,
1440, 1680, 1920, 2560) is page-shot, which saves page-<width>.png. 375 picks "Iphone X (375 x 812)"
in the "Switch variant" menu's phone tab (labelled Mobile, or the tab whose list holds Iphone X) and
sets the window to 460 x 900, which the phone frame needs; it saves no shot (take one with
browser.mjs screenshot). Prints one JSON line:
  { ok, url, loadedAt, pageIds, blocks, width: { width, height, class, via, shot }, settle: { ms, settled } }
Exit codes: open-page's own (3 no browser, 4 no load, 5 wrong page or signed out, 6 no block,
7 the tenant would not say its environment), 1 when the width is not
offered or the browser failed, 2 usage.`;

export async function runOpen(argv, { env = process.env } = {}) {
  const { values } = parseArgs({ args: argv, options: { browser: { type: 'string' }, url: { type: 'string' }, width: { type: 'string' }, 'quiet-ms': { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) return { help: HELP };
  if (!values.browser || !values.url) throw new UsageError('open.mjs needs --browser <folder> and --url <preview url>');
  const folder = path.resolve(values.browser);
  const opened = openPage(folder, values.url, { env });
  if (!opened.ok) throw new BrowserError(`open-page: ${opened.message}`, opened.code, 'open-page');
  let width = null;
  if (values.width) {
    width = setWidth(folder, Number(values.width), { env });
    if (!width.ok) throw new BrowserError(`width ${values.width}: ${width.message}`, 1, 'width');
  }
  const still = evalIn(folder, settle, { quietMs: values['quiet-ms'] ? Number(values['quiet-ms']) : 500, capMs: 8000 }, { env });
  return { ...opened, width, settle: { ms: still.ms, settled: still.settled, inFrame: still.inFrame } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exit(await main(() => runOpen(process.argv.slice(2))));
}
