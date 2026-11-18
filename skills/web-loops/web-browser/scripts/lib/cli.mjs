// What the WEB check scripts share: their common flags, opening the page at a width, the evidence
// files, the issues and the one JSON line they print.
import fs from 'node:fs';
import path from 'node:path';
import { BrowserError, command, evalIn, openPage } from './driver.mjs';
import { setWidth } from './breakpoints.mjs';
import { settle } from './collectors.mjs';
import { CHECK_CODES, counts, evidencePath, numberIssues, pageCell, readDisplayNames, writeOutputs } from './issues.mjs';

export const COMMON_OPTIONS = {
  browser: { type: 'string' }, url: { type: 'string' }, width: { type: 'string' }, 'out-dir': { type: 'string' }, run: { type: 'string' },
  'page-name': { type: 'string' }, 'page-id': { type: 'string' }, blocks: { type: 'string' },
  check: { type: 'string' }, code: { type: 'string' }, group: { type: 'string' }, start: { type: 'string' },
  'issues-json': { type: 'string' }, issues: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
};

export const COMMON_HELP = `Common flags:
  --browser <folder>    this test runner's browser folder (<run>/runners/web-<n>/browser); required
  --url <preview url>   open-page this URL first (https://<host>/p/0/interfaces/<app>/preview/<path>, the saved draft);
                        without it the check reads the page the browser shows
  --width <px>          put the preview at this width first (page-shot for 1366, 1440, 1680, 1920, 2560; the
                        phone tab's "Iphone X (375 x 812)" for 375)
  --out-dir <dir>       where the evidence files go (the run's web/<pageId>/<kind>-<request id>/ folder); required
  --run <dir>           the run folder, so evidence paths are relative to it
  --page-name, --page-id  the page column (<Page> · <pageId>); the page id defaults to the one open-page saw
  --blocks <file>       ua cache blocks --json export, to name blocks by display name
  --check, --code, --group, --start   the issues' check and id: <code><group>-<nn> from --start (default 1)
  --issues-json <file>  write the issues as JSON;  --issues <file>  write them as an issue log (formats.md)
  --json                print the summary as one JSON line (the default prints it too); it carries
                        loadedAt, when the page was opened (open-page's, or the browser folder's last open)

Exit codes: 0 done (issues or none) · 1 a browser command failed · 2 usage · 3-7 open-page's own exit
(3 no browser, 4 no load, 5 wrong page or signed out, 6 no block drawn, 7
the tenant would not say its environment) — app-verify's browser-walk.md says what each means.`;

export class UsageError extends Error {}

/** The run's common values, checked. */
export function readCommon(values, { defaultCheck }) {
  if (!values.browser) throw new UsageError('--browser <folder> is required');
  if (!values['out-dir']) throw new UsageError('--out-dir <dir> is required');
  const width = values.width ? Number(values.width) : null;
  if (values.width && !(Number.isInteger(width) && width > 0)) throw new UsageError(`--width takes a number of pixels, not ${values.width}`);
  const check = values.check ?? defaultCheck;
  return {
    folder: path.resolve(values.browser), outDir: path.resolve(values['out-dir']), run: values.run ? path.resolve(values.run) : null, url: values.url ?? null, width,
    check, code: values.code ?? CHECK_CODES[check] ?? 'W', group: values.group ?? '1', start: values.start ? Number(values.start) : 1,
    page: { name: values['page-name'] ?? null, id: values['page-id'] ?? null }, displayNames: readDisplayNames(values.blocks),
    issuesJson: values['issues-json'] ?? null, issues: values.issues ?? null,
  };
}

/** Opens the page when a URL is given, puts it at the width when one is given, and waits until it is still. */
export function preparePage(common, { env } = {}) {
  const out = { opened: null, width: null, settle: null };
  if (common.url) {
    const opened = openPage(common.folder, common.url, { env });
    if (!opened.ok) throw new BrowserError(`open-page: ${opened.message}`, opened.code, 'open-page');
    out.opened = opened;
    if (!common.page.id && opened.pageIds?.length) common.page.id = opened.pageIds[0];
  }
  if (common.width) {
    const set = setWidth(common.folder, common.width, { env });
    if (!set.ok) throw new BrowserError(`width ${common.width}: ${set.message}`, 1, 'width');
    out.width = set;
  }
  out.settle = evalIn(common.folder, settle, { quietMs: 500, capMs: 8000 }, { env });
  if (!common.page.id && out.settle?.pageIds?.length) common.page.id = out.settle.pageIds[0];
  restMouse(common.folder, out.settle, { env });
  return out;
}

/** Puts the mouse in the window's bottom-right corner, off the controls, so nothing reads as hovered. */
export function restMouse(folder, settled, { env } = {}) {
  const corner = settled?.viewport ? [Math.max(0, settled.viewport.w - 2), Math.max(0, settled.viewport.h - 2)] : [0, 0];
  command(folder, ['mousemove', ...corner], { env, check: false });
  return corner;
}

export function writeEvidence(common, name, data) {
  fs.mkdirSync(common.outDir, { recursive: true });
  const file = path.join(common.outDir, name);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);
  return { file, rel: evidencePath(file, common.run) };
}

/**
 * When the page the check read was opened (ISO): open-page's own loadedAt with --url, else the one
 * the browser folder's last open-page saved in .ua-open-page.json; null when neither says.
 */
export function loadedAtOf(folder, opened = null) {
  if (opened?.loadedAt) return opened.loadedAt;
  try { return JSON.parse(fs.readFileSync(path.join(folder, '.ua-open-page.json'), 'utf8')).loadedAt ?? null; } catch { return null; }
}

/** Issues from findings, written where asked; the summary the script prints, with when the page was opened. */
export function finish(common, { findings, notes = [], title, extra = {}, browserLine, opened = null }) {
  const issues = numberIssues(findings, { check: common.check, code: common.code, group: common.group, start: common.start, page: common.page, displayNames: common.displayNames });
  const header = [
    ['Stage', `${common.check} (WEB)`],
    ['Browser', browserLine],
    ['Page', `${common.page.name ?? '?'} · ${common.page.id ?? '?'}`],
    ['Time', new Date().toISOString()],
  ];
  const written = writeOutputs({ issues, json: common.issuesJson ?? null, md: common.issues ?? null, title, header, notReached: notes, page: pageCell(common.page) });
  // The issues go to the files asked for; printed only when no file was.
  return { ok: true, loadedAt: loadedAtOf(common.folder, opened), counts: counts(issues), ...(written.json || written.issues ? {} : { issues }), notes, written, ...extra };
}

/** Prints the summary and exits with the right code for an error. */
export async function main(run) {
  try {
    const summary = await run();
    process.stdout.write(summary?.help ? `${summary.help}\n` : `${JSON.stringify(summary)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) { process.stderr.write(`${error.message}\n`); return 2; }
    if (error instanceof BrowserError) { process.stderr.write(`${error.message}\n`); return error.code >= 3 && error.code <= 7 ? error.code : 1; }
    process.stderr.write(`${process.env.UA_DEBUG ? error.stack : error.message}\n`);
    return 1;
  }
}

export const browserLine = (prepared, width) => `Chrome for Testing (UnifyApps Headless's browser) · preview route, saved draft · ${prepared.width ? `${prepared.width.width}×${prepared.width.height ?? '?'} (${prepared.width.class})` : width ? `${width}px` : 'the window as it was'}`;
