#!/usr/bin/env node
// A WEB page at each width: the page or a block wider than the window, text cut off or running
// over other text, and which navigation it shows. Drives UnifyApps Headless's browser (app-verify's
// browser.mjs) and prints issues and the navigation per width. Node 22, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BrowserError, command, evalIn, openPage } from './lib/driver.mjs';
import { collectResponsive, settle } from './lib/collectors.mjs';
import { parseWidths, planFor, setWidth } from './lib/breakpoints.mjs';
import { responsiveAcross } from './lib/responsive.mjs';
import { evidencePath } from './lib/issues.mjs';
import { COMMON_HELP, COMMON_OPTIONS, UsageError, finish, main, readCommon, restMouse, writeEvidence } from './lib/cli.mjs';

const HELP = `Usage:
  node responsive.mjs --browser <folder> --out-dir <dir> --url <preview url> [--widths 1440,375 | all] [common flags]

Opens the page once, then for each width (widest first) puts the preview there, waits until it is
still, and reads it. Issues (check responsive, code RS):
  W12 the page or a block wider than the window (at 375, wider than the app frame) · W13 text cut off (an ellipsis is minor) ·
  W14 text over text · W15 a navigation that does not fit the width (a side bar on a phone width,
  no navigation and no menu button, top-bar items cut off)
--widths defaults to 1440,375: the laptop size every WEB preview has and the phone ("Iphone X
(375 x 812)" in the menu's phone tab, in a 460 x 900 window); "all" adds 1366. A width the preview
does not offer is listed under "unavailable", never guessed. Evidence per width:
<out-dir>/responsive-<width>.json and responsive-<width>.png.

${COMMON_HELP}`;

export async function runResponsive(argv, { env = process.env } = {}) {
  const { values } = parseArgs({ args: argv, allowPositionals: false, options: { ...COMMON_OPTIONS, widths: { type: 'string' } } });
  if (values.help) return { help: HELP };
  const common = readCommon(values, { defaultCheck: 'responsive' });
  if (!common.url) throw new UsageError('--url <preview url> is required: each width is read from a fresh open');
  let widths;
  try { widths = parseWidths(values.widths ?? (common.width ? String(common.width) : null)); } catch (error) { throw new UsageError(error.message); }
  // Desktop sizes first: page-shot picks the Desktop tab back after the phone pick, not the other way round.
  widths.sort((a, b) => (planFor(a).via === planFor(b).via ? b - a : planFor(a).via === 'page-shot' ? -1 : 1));
  const { folder } = common;
  const opened = openPage(folder, common.url, { env });
  if (!opened.ok) throw new BrowserError(`open-page: ${opened.message}`, opened.code, 'open-page');
  if (!common.page.id && opened.pageIds?.length) common.page.id = opened.pageIds[0];

  const read = [];
  const unavailable = [];
  for (const width of widths) {
    let set;
    try { set = setWidth(folder, width, { env }); } catch (error) { unavailable.push({ width, why: error.message, message: error.message }); continue; }
    if (!set.ok) { unavailable.push({ width, why: set.why, items: set.items, message: set.message }); continue; }
    restMouse(folder, evalIn(folder, settle, { quietMs: 500, capMs: 8000 }, { env }), { env });
    const data = evalIn(folder, collectResponsive, {}, { env });
    const evidence = writeEvidence(common, `responsive-${width}.json`, { width, setWidth: set, data });
    let shot = set.shot ?? null;
    if (!shot) {
      command(folder, ['fit-page'], { env, check: false });
      command(folder, ['screenshot', `--filename=page-${width}.png`], { env, check: false });
      shot = path.join(folder, `page-${width}.png`);
    }
    let shotRel = null;
    if (shot && fs.existsSync(shot)) {
      const copy = path.join(common.outDir, `responsive-${width}.png`);
      fs.copyFileSync(shot, copy);
      shotRel = evidencePath(copy, common.run);
    }
    read.push({ width, data, evidence: shotRel ? `${evidence.rel} + ${shotRel}` : evidence.rel, plan: set });
  }
  const result = responsiveAcross(read);
  const notes = [...result.notes, ...unavailable.map((entry) => `${entry.width}px not checked: ${entry.message}`)];
  return finish(common, {
    findings: result.findings, notes, title: `Issues — ${common.check} (WEB responsive) · ${common.page.name ?? common.page.id ?? 'page'}`,
    browserLine: `Chrome for Testing (UnifyApps Headless's browser) · preview route, saved draft · ${read.map((entry) => `${entry.width} (${entry.plan.class})`).join(', ') || 'no width'}`,
    extra: { widths: read.map((entry) => entry.width), unavailable, navigation: result.navs }, opened,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exit(await main(() => runResponsive(process.argv.slice(2))));
}
