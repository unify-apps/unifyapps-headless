#!/usr/bin/env node
/**
 * The page queue of the discover loop's walk: one helper walks each page of the app side by side,
 * writes its part of the graph as a fragment with ids of its own, and `merge` joins the fragments
 * into the one journeys.json the coverage check reads (references/parallel-walk.md).
 *
 *   node pages.mjs scan add    --run <run.json> --at <URL the links were read on> --links <file walk.mjs links printed>
 *                              [--base <app root URL>] [--within <path prefix>]... [--page-paths <get_page_paths reply>]
 *   node pages.mjs scan seed   --run <run.json> --route <route> --url <the record's URL> --record <"qzx… survey throwaway …">
 *                              [--record-id <id>] [--delete-by <how>] [--built]
 *   node pages.mjs scan seed   --run <run.json> --route <route> --share-with <seeded route>   a deeper route of that record
 *   node pages.mjs scan status --run <run.json>                                        what init still refuses on
 *   node pages.mjs init     --run <run.json> --base <app root URL> --entry <landing URL> [--page-paths <get_page_paths reply>]
 *                           [--route <URL or path>]... [--within <path prefix>]... [--global-nav <file>] [--chrome <file>]
 *                           [--skip <path>]... [--walk-test-pages] [--allow-incomplete-scan]
 *                           [--helpers 8] [--deadline 45] [--surfaces 120] [--minutes 120] [--max-edges 8] [--depth core|full] [--now <ISO>]
 *   node pages.mjs folders  --run <run.json> --private-folder <folder> [--now <ISO>]   a resumed run: new browser folders, the walk clock goes on
 *   node pages.mjs route    --run <run.json> --url <URL or path>                      the route a URL is, and its page
 *   node pages.mjs dispatch --run <run.json> --key <page>... [--helper <name>, with one key only] [--now <ISO>]
 *                           a page sent again is named discover-<key>-<attempt> and carries its `problem` line
 *   node pages.mjs report   --run <run.json> --key <page>... [--status failed --reason <text>] [--now <ISO>]
 *                           a walked fragment that fails the depth check goes back to the queue once (`sentAgain`),
 *                           never when its helper has deleted the page's seed
 *   node pages.mjs check    --run <run.json> --key <page>            the depth check on a fragment as it stands, for its helper
 *   node pages.mjs tick     --run <run.json> [--now <ISO>] [--load <1-min load> --cores <n>] [--failed-5xx <in a row>]
 *   node pages.mjs stop     --run <run.json> --reason <text>                          no more pages: every queued page gets that reason
 *   node pages.mjs note     --run <run.json> [--stage <stage>] [--cap <n>] [--drop-user <id> --reason <text>]
 *                           [--append <stalls|sessions|sessionsRefreshed|wouldHaveAsked|reportLines> --value <json>]
 *   node pages.mjs merge    --run <run.json> [--out <journeys.json>] [--max-edges <the contract's journey length, else init's>]
 *   node pages.mjs stats    --run <run.json>
 *
 * Every command that changes run.json holds a lock beside it while it reads, changes and rewrites
 * the file whole (a temporary file and a rename), so two calls at once never lose each other's
 * change and a helper reading it never sees half a file. No network, no browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backoffMinutes, enumerateJourneys } from '../../../skills/app-test-author/scripts/loop.mjs';

// A segment that names one record rather than a page: a UUID, a platform id, a long hex, a date, or a
// number, which counts only from two digits or as the last segment: the platform's own `/p/0/` is a
// workspace, not a record. Two URLs that differ only there are one page, so `/orders/42` and
// `/orders/43` are walked once.
const ID_SEGMENT = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|e_[0-9a-f]{12,}|[0-9a-f]{16,}|\d{4}-\d{2}-\d{2}|\d{2,})$/iu;
const isRecordId = (segment, index, segments) => ID_SEGMENT.test(segment) || (/^\d+$/u.test(segment) && index === segments.length - 1);
// A link that ends the session every helper rides is never a page: opening it signs the test user out.
const SIGN_OUT = /(^|\/)(log-?out|sign-?out|log-?off|sign-?off)(\/|$)/iu;
// A page an app keeps for its builders, not its users, read off the last part of its address:
// `test123`, `tmp`, `untitled-2`, `copy-of-orders`; never `/test/:id`, `/sandbox` or `/temp`.
const TEST_PAGE = /(^|\/)(?:(?:test|tmp|temp|scratch|untitled|dummy)[-_]?\d+|tmp|scratch|untitled|copy[-_]of[-_][^/]*)$/iu;
// A router's catch-all (`*`, `/*`, `/:path*`, `/(.*)`, `/**`): the app's not-found page. It has no address
// of its own, so it is walked at one no page has, and read back as the route `/*`.
const FALLBACK_SEGMENT = /^(\*+|:[A-Za-z_]\w*\*|\(\.\*\))$/u;
const FALLBACK_ROUTE = '/*';
// The kinds whose control lands on a state of the page (traversal.md, The depth check). An id of one of
// these kinds with no edge is a walk that stopped at the inventory line: the code-app run wrote
// `Next: Page 1 -> 2` and `page size 20 -> Page 1 of 72` as lines and recorded no node for either.
const OWES_EDGE = Object.freeze({
  tab: 'a tab selected is a state of the page',
  select: 'a value picked changes what the page shows',
  pager: 'the next page of a list is a state of the page',
  form: 'a form submitted lands on its validation state or its result',
  submit: 'a submit lands on a result or a confirmation',
});
// How many times a page is sent to a helper before its fragment is taken as it stands.
const DEPTH_PASSES = 2;
// The defaults of the survey contract's helper fields (references/survey-contract.md).
// A page's helper walks its page whole, so the surfaces budget bounds how many pages a run opens, not how
// deep: at core depth a rich page is about 4 states, so 120 is about 25 pages. The tick counts the pages
// still walking at the average size of the pages reported, so the budget is not overshot by a wave.
const DEFAULTS = Object.freeze({ helpers: 8, floor: 4, deadline: 45, surfaces: 120, minutes: 120, maxEdges: 8, depth: 'core' });
// How deep a helper walks each page (survey-contract.md, Depth): `core` records one state per kind of control
// (one tab of a set, one page of a pager, one filter applied), `full` every state and every variant.
const DEPTHS = new Set(['core', 'full']);
const TERMINAL = new Set(['walked', 'redirected', 'unreachable', 'failed']);
const APPENDABLE = new Set(['stalls', 'sessions', 'sessionsRefreshed', 'wouldHaveAsked', 'reportLines']);
// An id the walk numbered, standing on its own: not part of a hook such as `step-N2` or a word.
const ID_TOKEN = /(?<![\w-])([NSEP])(\d+)(?:\.(\d+))?(?![\w-])/gu;
// Text an author copies word for word: a hook in backticks, the app's own words in double quotes.
const QUOTED = /(`[^`\n]*`|"[^"\n]*")/u;
// The plugin this script ships in: helpers name every script by it, as the authoring helpers do.
const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// How long a call waits for another to let go of run.json, and when a lock is a crashed call's.
const LOCK_WAIT_MS = 15_000;
const LOCK_STALE_MS = 60_000;

const segmentsOf = (pathname) => String(pathname).split('/').filter(Boolean);

/** The path a URL opens, relative to the app's root, with no query, hash or trailing slash. */
export function pathOf(url, base) {
  let pathname;
  try { pathname = new URL(url, base ?? 'http://local.invalid/').pathname; } catch { pathname = String(url).split(/[?#]/u)[0]; }
  const basePath = base ? new URL(base).pathname.replace(/\/+$/u, '') : '';
  if (basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))) pathname = pathname.slice(basePath.length);
  return `/${segmentsOf(pathname).join('/')}`;
}

/** Is the URL on the app's own origin? A path with no origin always is. */
export function sameOrigin(url, base) {
  if (!base) return true;
  try { return new URL(url, base).origin === new URL(base).origin; } catch { return false; }
}

/** The route a URL is: the page-list address it matches (a static one before one with parameters),
 * else its path with every id-like segment written `:id`. Two URLs with one route are one page. */
export function routeOf(url, { base = null, patterns = [] } = {}) {
  const segments = segmentsOf(pathOf(url, base));
  if (segments.length && FALLBACK_SEGMENT.test(segments.at(-1))) return FALLBACK_ROUTE;
  const ordered = [...patterns].sort((left, right) => segmentsOf(left).filter((segment) => segment.startsWith(':')).length - segmentsOf(right).filter((segment) => segment.startsWith(':')).length);
  for (const pattern of ordered) {
    const parts = segmentsOf(pattern);
    if (parts.length === segments.length && parts.every((part, index) => part.startsWith(':') || part === segments[index])) return `/${parts.join('/')}`;
  }
  return `/${segments.map((segment, index) => (isRecordId(segment, index, segments) ? ':id' : segment)).join('/')}`;
}

/** A key made only of letters, digits, `_` and `-`, unique among `taken`. */
export function keyOf(route, taken = new Set()) {
  const stem = route === FALLBACK_ROUTE ? 'fallback' : String(route).replace(/^\/+/u, '').replace(/[^A-Za-z0-9_-]+/gu, '-').replace(/-+/gu, '-').replace(/^-|-$/gu, '').slice(0, 40) || 'home';
  let key = stem;
  for (let suffix = 2; taken.has(key); suffix++) key = `${stem}-${suffix}`;
  return key;
}

const hasParams = (route) => segmentsOf(route).some((segment) => segment.startsWith(':'));
/** The address the fallback page is opened at: one no page of the app has, the same for the whole run.
 * The scan mints it first (`scan.fallbackPath`) and `init` takes it over, so the scan, `init` and the
 * helpers all open the catch-all at one address. */
const mintFallbackPath = () => `qzx${String(Math.floor(Math.random() * 9000) + 1000)}-no-such-page`;
const fallbackUrlOf = (fallbackPath, base) => new URL(fallbackPath, `${base.replace(/\/+$/u, '')}/`).href;
function fallbackUrl(run) {
  run.fallbackPath ??= mintFallbackPath();
  return fallbackUrlOf(run.fallbackPath, run.base);
}
/** Is the URL the one a page was told to open? The fallback page's address matches no route. */
const isStartUrl = (page, url, base) => Boolean(page.startUrl) && pathOf(page.startUrl, base) === pathOf(url, base);
const isoOf = (now) => new Date(now ?? Date.now()).toISOString();
const minutesBetween = (from, to) => (new Date(to).getTime() - new Date(from).getTime()) / 60_000;
const round1 = (value) => Math.round(value * 10) / 10;

export function readRun(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeRun(file, run) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(run, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

/** Runs `change` on run.json under a lock file beside it, and writes the result whole. */
export function withRun(file, change) {
  const lock = `${file}.lock`;
  const started = Date.now();
  for (;;) {
    try { fs.closeSync(fs.openSync(lock, 'wx')); break; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) { fs.rmSync(lock, { force: true }); continue; } } catch { continue; }
      if (Date.now() - started > LOCK_WAIT_MS) throw new Error(`${lock} is held by another pages.mjs call; try again`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    const run = readRun(file);
    const result = change(run);
    writeRun(file, run);
    return result;
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

const firingOf = (runFile) => path.dirname(path.resolve(runFile));
const patternsOf = (run) => (run.pages ?? []).map((page) => page.route).filter(Boolean);
const insideOf = (run, route) => !(run.within ?? []).length || run.within.some((prefix) => route === prefix || route.startsWith(`${prefix.replace(/\/+$/u, '')}/`));

/** The walk's minutes so far: counted from the map, paused while no session was running the walk. */
export function walkMinutes(run, now = Date.now()) {
  const clock = run.walkClock;
  if (clock?.since) return Number(clock.before ?? 0) + Math.max(0, minutesBetween(clock.since, now));
  return run.traverseStartedAt ? Math.max(0, minutesBetween(run.traverseStartedAt, now)) : 0;
}

/** The folders and files one page's helper owns, all named by its key. */
function pageFiles(run, firing, key) {
  const pageFolder = path.join(firing, 'pages', key);
  const others = Object.fromEntries((run.users ?? []).slice(1).map((user) => [user.id, run.privateFolder ? path.join(run.privateFolder, `browser-${key}-${user.id}`) : null]));
  return {
    pageFolder,
    fragment: path.join(pageFolder, 'fragment.json'),
    workFolder: path.join(pageFolder, 'work'),
    browserFolder: run.privateFolder ? path.join(run.privateFolder, `browser-${key}`) : null,
    otherBrowserFolders: others,
  };
}

/**
 * Adds one URL to the queue, or says why not. A route already queued is not queued again; a
 * page-list route with parameters waits (`needs-url`) until a URL that matches it arrives. The
 * entry is always queued. With named areas, a route outside them is queued only when a page inside
 * them opens it (`outsideArea`), and nothing that page opens is.
 */
export function enqueue(run, firing, url, { source, entry = false, from = null } = {}) {
  if (!sameOrigin(url, run.base)) return { url, ignored: 'another origin' };
  // The catch-all's minted address (the scan's or this run's) is the route `/*`, not a page of its own.
  const route = run.fallbackPath && pathOf(url, run.base) === `/${run.fallbackPath}` ? FALLBACK_ROUTE : routeOf(url, { base: run.base, patterns: patternsOf(run) });
  if (SIGN_OUT.test(route)) return { url, route, ignored: 'signs out' };
  const inside = insideOf(run, route);
  if (!inside && !entry && !(from && !from.outsideArea && insideOf(run, from.route ?? ''))) return { url, route, ignored: 'outside the named areas' };
  run.pages ??= [];
  const known = run.pages.find((page) => page.route === route) ?? run.pages.find((page) => page.route && isStartUrl(page, url, run.base));
  const startUrl = route === FALLBACK_ROUTE ? fallbackUrl(run) : new URL(url, run.base).href;
  if (known) {
    if (entry) known.entry = true;
    if (known.state === 'needs-url') {
      Object.assign(known, { state: 'queued', startUrl, source: `${known.source}; url from ${source}` });
      return { url, route, key: known.key, filled: true };
    }
    return { url, route, key: known.key, known: true };
  }
  const key = keyOf(route, new Set(run.pages.map((page) => page.key)));
  // A screen one hop outside the named areas is a surface the walk saw, never one it walks: it is kept as a
  // page so the exit has a node, and skipped, so no helper is ever sent to another module's pages.
  const page = { key, route, startUrl, order: run.pages.length + 1, entry, source, state: 'queued', attempts: 0, ...(inside || entry ? {} : { outsideArea: true }), ...pageFiles(run, firing, key) };
  if (!inside && !entry) {
    Object.assign(page, { state: 'skipped', reason: 'outside the named areas' });
    run.pages.push(page);
    return { url, route, key, skipped: 'outside the named areas' };
  }
  if (!entry && (run.skipRoutes ?? []).includes(route)) Object.assign(page, { state: 'skipped', reason: 'skipped by the contract' });
  else if (!entry && !run.walkTestPages && TEST_PAGE.test(route)) Object.assign(page, { state: 'skipped', reason: 'a test or scratch page' });
  run.pages.push(page);
  return { url, route, key, queued: true };
}

/** One page of a get_page_paths reply: queued at its address, waiting for a URL, or unplaced. */
function enqueueListed(run, firing, listed) {
  run.pages ??= [];
  if (!listed.address) {
    const key = keyOf(listed.slug || listed.pageId || 'unplaced', new Set(run.pages.map((page) => page.key)));
    run.pages.push({ key, route: null, pageId: listed.pageId ?? null, startUrl: null, order: run.pages.length + 1, entry: false, source: 'page list', state: 'unplaced', reason: listed.reason ?? 'no address', attempts: 0, ...pageFiles(run, firing, key) });
    return { key, unplaced: true };
  }
  const segments = segmentsOf(listed.address);
  const fallback = segments.length > 0 && FALLBACK_SEGMENT.test(segments.at(-1));
  const route = fallback ? FALLBACK_ROUTE : `/${segments.join('/')}`;
  if (SIGN_OUT.test(route)) return { route, ignored: 'signs out' };
  if (!insideOf(run, route)) return { route, ignored: 'outside the named areas' };
  if (run.pages.some((page) => page.route === route)) return { route, known: true };
  const key = keyOf(route, new Set(run.pages.map((page) => page.key)));
  const waiting = !fallback && (hasParams(route) || (listed.params ?? []).length > 0);
  run.pages.push({
    key, route, pageId: listed.pageId ?? null, startUrl: waiting ? null : fallback ? fallbackUrl(run) : new URL(route.replace(/^\//u, ''), `${run.base.replace(/\/+$/u, '')}/`).href,
    order: run.pages.length + 1, entry: false, source: 'page list', state: waiting ? 'needs-url' : 'queued', attempts: 0, ...pageFiles(run, firing, key),
  });
  return { key, route, queued: !waiting, needsUrl: waiting };
}

/** Sets the walk up: the base, the area filter, the helper fields, the budget, the clock and the first pages. */
export function initPages(run, firing, { base, entry, pagePaths = null, routes = [], within = [], globalNav = null, chrome = null, skip = [], walkTestPages = false, allowIncompleteScan = false, helpers, deadline, surfaces, minutes, maxEdges, depth, now } = {}) {
  // The scan's routes and seeds are the queue (The scan): init refuses while it is not complete.
  const scan = readScan(firing);
  if (Object.keys(scan.routes ?? {}).length) {
    base ||= scan.base;
    if (!within.length) within = scan.within ?? [];
    const status = scanStatus(scan);
    if (!status.ready && !allowIncompleteScan) {
      throw new Error(`the scan is not complete: ${status.needsSeed.length} route(s) need a seed record (${status.needsSeed.join(', ') || 'none'}), ${status.unscanned.length} never opened for their links (${status.unscanned.join(', ') || 'none'}). Finish the scan (parallel-walk.md, The scan). --allow-incomplete-scan is only for a seed record the app would not make, with that reason in reportLines`);
    }
    if (scan.fallbackPath) run.fallbackPath ??= scan.fallbackPath;
    routes = [...routes, ...Object.entries(scan.routes).flatMap(([route, item]) => (item.seed ? [item.seed.startUrl] : hasParams(route) ? [] : item.urls.slice(0, 1)))];
    run.seeds = seedsOf(scan);
    run.scan = { routes: status.routes, seeded: status.seeded.length, shared: status.shared.length, records: new Set(run.seeds.map((seed) => seed.recordId ?? seed.startUrl)).size, complete: status.ready };
  }
  if (!base) throw new Error('--base <the app root URL> is required');
  if (!entry) throw new Error('--entry <the URL the app landed on> is required');
  run.base = base;
  run.pluginRoot ??= PLUGIN_ROOT;
  run.within = within.map((prefix) => `/${segmentsOf(prefix).join('/')}`);
  if (globalNav) run.globalNav = globalNav;
  // Chrome is the platform's own frame (the side navigation, the AI FDE button, the tenant and branch
  // switchers), read once at the map and skipped by every helper. An app has none: its frame is the
  // app's, and the frame helper walks it whole (traversal.md, The app frame).
  const app = Boolean(run.subject) && run.subject !== 'platform';
  if (chrome) {
    const list = (Array.isArray(chrome) ? chrome : chrome.chrome ?? []).map(({ hook, label }) => ({ hook, label }));
    if (list.length && app) throw new Error(`nothing is chrome in a ${run.subject}: its frame is walked by the frame helper (parallel-walk.md, The map); pass --chrome only on a survey of the platform`);
    run.chrome = list;
  }
  const cap = Number(helpers ?? run.contractHelperCap ?? DEFAULTS.helpers);
  Object.assign(run, {
    contractHelperCap: cap,
    helperCap: cap,
    helperCapFloor: Math.min(cap, DEFAULTS.floor),
    helperDeadlineMinutes: Number(deadline ?? run.helperDeadlineMinutes ?? DEFAULTS.deadline),
    traverseStartedAt: run.traverseStartedAt ?? isoOf(now),
    budget: { surfaces: Number(surfaces ?? run.budget?.surfaces ?? DEFAULTS.surfaces), minutes: Number(minutes ?? run.budget?.minutes ?? DEFAULTS.minutes), surfacesUsed: run.budget?.surfacesUsed ?? 0, minutesUsed: run.budget?.minutesUsed ?? 0 },
    // The contract's journey length: the merge checks the graph at it, as the check and the render do.
    journeyLength: Number(maxEdges ?? run.journeyLength ?? DEFAULTS.maxEdges),
    depth: depth ?? run.depth ?? DEFAULTS.depth,
  });
  if (!DEPTHS.has(run.depth)) throw new Error(`--depth takes core or full, not ${run.depth}`);
  run.walkClock ??= { since: run.traverseStartedAt, before: 0 };
  run.walkTestPages = walkTestPages;
  run.skipRoutes = skip.map((url) => `/${segmentsOf(pathOf(url, base)).join('/')}`);
  run.pages ??= [];
  const results = [];
  // The page list goes first, so every later URL is matched against its addresses.
  for (const listed of pagePaths?.pages ?? []) results.push(enqueueListed(run, firing, listed));
  // A skipped route is matched against the page list's own addresses, once they are known.
  run.skipRoutes = run.skipRoutes.map((route) => routeOf(route, { base: run.base, patterns: patternsOf(run) }));
  results.unshift(enqueue(run, firing, entry, { source: 'entry', entry: true }));
  for (const url of routes) results.push(enqueue(run, firing, url, { source: 'entry links' }));
  // Test and scratch pages, and the pages the contract skips, are never walked; the entry always is.
  for (const page of run.pages) {
    if (page.entry || !page.route || !['queued', 'needs-url'].includes(page.state)) continue;
    if (run.skipRoutes.includes(page.route)) Object.assign(page, { state: 'skipped', reason: 'skipped by the contract' });
    else if (!walkTestPages && TEST_PAGE.test(page.route)) Object.assign(page, { state: 'skipped', reason: 'a test or scratch page' });
  }
  // The frame around every page is walked once, by a helper of its own, from the entry's URL: in an app
  // the whole frame, always; on the platform the module's shared controls, when the map found any.
  // It has no route, so no URL is ever matched to it.
  if ((app || (run.globalNav ?? []).length) && !run.pages.some((page) => page.frame)) {
    const key = keyOf('frame', new Set(run.pages.map((page) => page.key)));
    run.pages.push({ key, route: null, frame: true, startUrl: new URL(entry, base).href, order: run.pages.length + 1, entry: false, source: 'app frame', state: 'queued', attempts: 0, ...pageFiles(run, firing, key) });
    results.push({ key, frame: true, queued: true });
  }
  return { pages: run.pages.length, skipped: run.pages.filter((page) => page.state === 'skipped').map((page) => page.route), results };
}

// ---- The scan (parallel-walk.md, The scan) ----
// Before init, the main session finds every page: it opens each route inside the area once for
// its links, and makes a throwaway record for every route that names one. `scan.json` holds
// what it found, `seed-records.json` the records; `init` refuses while a route still waits for
// a seed or was never opened, so the first tick dispatches every page and the walk is one wave.
// Two Solution Builder runs read the landing's links, ran init, and met the record pages as
// exits, one wave after another.
const scanFile = (firing) => path.join(firing, 'scan.json');
const seedsFile = (firing) => path.join(firing, 'seed-records.json');
const workingFolderOf = (firing) => path.resolve(firing, '..', '..', '..', '..');
const SEED_NAME = /survey throwaway/iu;

export function readScan(firing) {
  try { return JSON.parse(fs.readFileSync(scanFile(firing), 'utf8')); } catch { return { base: null, within: [], patterns: [], routes: {} }; }
}

/** The seeds as the helpers read them: one per route, and `sharedBy` naming every route that walks the same record. */
export function seedsOf(scan) {
  const seeded = Object.entries(scan.routes ?? {}).filter(([, entry]) => entry.seed);
  return seeded.map(([route, entry]) => {
    const sharedBy = seeded.filter(([, other]) => other.seed.recordId && other.seed.recordId === entry.seed.recordId).map(([other]) => other);
    return { route, ...entry.seed, shared: sharedBy.length > 1, sharedBy };
  });
}

function writeScan(firing, scan) {
  fs.writeFileSync(scanFile(firing), `${JSON.stringify(scan, null, 2)}\n`);
  fs.writeFileSync(seedsFile(firing), `${JSON.stringify(seedsOf(scan), null, 2)}\n`);
}

// Routes two or more levels under a record route (`/p/0/solutions/:id/settings/users`,
// `/…/:id/settings/teams`, `/…/:id/settings/roles/create`) share one seed among themselves: the first
// of them seeded is the one the rest share. The record route and its first-level tabs (`/overview`,
// `/plan`) each keep a seed of their own, since their pages rename, delete, publish or restore the record.
const idCount = (route) => segmentsOf(route).filter((segment) => segment.startsWith(':')).length;
const familyBase = (route) => { const parts = segmentsOf(route); const at = parts.findIndex((segment) => segment.startsWith(':')); return at < 0 ? null : `/${parts.slice(0, at + 1).join('/')}`; };
const depthOf = (route) => segmentsOf(route).length - segmentsOf(familyBase(route) ?? route).length;
const canShare = (route, other) => familyBase(route) !== null && familyBase(route) === familyBase(other) && idCount(route) === idCount(other) && depthOf(route) >= 2 && depthOf(other) >= 2 && route !== other;
function shareableWith(scan, route) {
  const candidates = Object.entries(scan.routes ?? {}).filter(([other, entry]) => entry.seed && canShare(route, other));
  candidates.sort((left, right) => segmentsOf(left[0]).length - segmentsOf(right[0]).length || left[0].localeCompare(right[0]));
  return candidates[0]?.[0] ?? null;
}

/** A route's own address on another route's record: the record ids of that seed's URL put into this route. */
function fillRoute(route, fromUrl, fromRoute, base) {
  const from = new URL(fromUrl, base);
  const fromParts = segmentsOf(from.pathname);
  const fromPattern = segmentsOf(fromRoute);
  const ids = fromPattern.map((segment, index) => (segment.startsWith(':') ? fromParts[index] : null)).filter(Boolean);
  let taken = 0;
  const parts = segmentsOf(route).map((segment) => (segment.startsWith(':') ? ids[taken++] : segment));
  if (parts.some((part) => part === undefined)) return null;
  return new URL(`/${parts.join('/')}`, from.origin).href;
}

/** The folder's own solution, the one /ua:setup opened: never a seed record. */
function folderSolutionId(firing) {
  try { return JSON.parse(fs.readFileSync(path.join(workingFolderOf(firing), '.nebula', 'sync.json'), 'utf8')).solutionId ?? null; } catch { return null; }
}

/** The JSON a walk.mjs `links` call printed: the file holds that JSON, or the whole walk.mjs output with it under the last `### Result`. */
export function parseLinksOutput(text) {
  try { return JSON.parse(text); } catch { /* the whole walk.mjs output */ }
  const lines = String(text).split('\n');
  for (let index = lines.length - 1; index >= 0; index--) {
    if (!/^### Result/u.test(lines[index])) continue;
    const block = [];
    for (let next = index + 1; next < lines.length && !/^#{2,3} /u.test(lines[next]); next++) block.push(lines[next]);
    // The JSON ends before playwright-cli's page lines (`- Page URL: …`): try the block whole, then without its tail.
    for (let end = block.length; end > 0; end--) {
      try { return JSON.parse(block.slice(0, end).join('\n')); } catch { /* one line shorter */ }
    }
  }
  throw new Error('no links JSON found: pass the file walk.mjs links printed, or its JSON');
}

/** What the scan still owes before init: routes never opened for their links, and routes that name a record and have no seed. */
export function scanStatus(scan) {
  const routes = Object.entries(scan.routes ?? {});
  const patterns = scan.patterns ?? [];
  // An application's page list is its oracle: a listed page needs no links read; only a route that names a record needs a seed.
  const unscanned = routes.filter(([route, entry]) => !entry.scannedAt.length && entry.urls.length && !patterns.includes(route)).map(([route]) => route);
  const needsSeed = routes.filter(([route, entry]) => hasParams(route) && !entry.seed).map(([route]) => route);
  const seeded = routes.filter(([, entry]) => entry.seed).map(([route]) => route);
  // Deeper routes of a seeded record may share its seed: `shareable` says which, so the scan builds fewer records.
  const shareable = Object.fromEntries(needsSeed.map((route) => [route, shareableWith(scan, route)]).filter(([, from]) => from));
  const shared = seedsOf(scan).filter((seed) => seed.shared).map((seed) => seed.route);
  // The catch-all is opened at one minted address, the scan's and then the walk's: `scan add --at` it to scan `/*`.
  const fallbackUrl = scan.routes?.[FALLBACK_ROUTE] && scan.fallbackPath && scan.base ? fallbackUrlOf(scan.fallbackPath, scan.base) : null;
  return { routes: routes.length, unscanned, needsSeed, shareable, seeded, shared, ...(fallbackUrl ? { fallbackUrl } : {}), ready: !unscanned.length && !needsSeed.length };
}

/** Records the links one page showed: that page's route is scanned, and every inside link's route is known. */
export function scanAdd(firing, { at, links, base = null, within = [], pagePaths = null }) {
  const scan = readScan(firing);
  if (base) scan.base = base;
  if (!scan.base) throw new Error('--base <the app root URL> is required on the first scan call');
  if (within.length) scan.within = within.map((prefix) => `/${segmentsOf(prefix).join('/')}`);
  if (pagePaths) scan.patterns = (pagePaths.pages ?? []).filter((page) => page.address).map((page) => `/${segmentsOf(page.address).join('/')}`);
  const inside = (route) => insideOf({ within: scan.within ?? [] }, route);
  const options = { base: scan.base, patterns: scan.patterns ?? [] };
  // The catch-all (`*` from a router or a page list) has no address: the scan mints one, and every later
  // call (the scan's own `--at`, `init`, the helper) opens it there.
  const fallbackAddress = () => { scan.fallbackPath ??= mintFallbackPath(); return fallbackUrlOf(scan.fallbackPath, scan.base); };
  for (const pattern of scan.patterns ?? []) {
    if (SIGN_OUT.test(pattern) || !inside(pattern)) continue;
    const route = routeOf(pattern, options);
    scan.routes[route] ??= { urls: route === FALLBACK_ROUTE ? [fallbackAddress()] : hasParams(route) ? [] : [new URL(route.replace(/^\//u, ''), `${scan.base.replace(/\/+$/u, '')}/`).href], scannedAt: [], seed: null, foundFrom: 'page list' };
  }
  const atUrl = new URL(at, scan.base).href;
  const routeAt = scan.fallbackPath && pathOf(atUrl, scan.base) === `/${scan.fallbackPath}` ? FALLBACK_ROUTE : routeOf(atUrl, options);
  const entry = (scan.routes[routeAt] ??= { urls: [], scannedAt: [], seed: null, foundFrom: 'scan' });
  if (!entry.urls.includes(atUrl)) entry.urls.push(atUrl);
  if (!entry.scannedAt.includes(atUrl)) entry.scannedAt.push(atUrl);
  const added = [];
  const outside = new Set();
  for (const link of links?.links ?? []) {
    let url;
    try { url = new URL(link.path ?? link.url, scan.base).href; } catch { continue; }
    if (!sameOrigin(url, scan.base)) continue;
    const route = routeOf(url, options);
    if (route === FALLBACK_ROUTE) url = fallbackAddress();
    if (SIGN_OUT.test(route)) continue;
    if (!inside(route)) { outside.add(route); continue; }
    const known = scan.routes[route];
    if (!known) { scan.routes[route] = { urls: [url], scannedAt: [], seed: null, foundFrom: atUrl }; added.push(route); }
    else if (!known.urls.includes(url)) known.urls.push(url);
  }
  writeScan(firing, scan);
  return { at: routeAt, added, outside: [...outside], ...scanStatus(scan) };
}

/** A throwaway record the scan made for a route that names one: the seed its helper walks and deletes. */
export function scanSeed(firing, { route, url, record, recordId = null, deleteBy = null, built = false, shareWith = null }) {
  const scan = readScan(firing);
  if (!scan.base) throw new Error('run `scan add` first');
  const options = { base: scan.base, patterns: scan.patterns ?? [] };
  const normalized = routeOf(route, options);
  if (!hasParams(normalized)) throw new Error(`${normalized} names no record: it needs no seed`);
  if (shareWith) {
    // The route walks another route's record: its seed is that seed, at this route's own address.
    const fromRoute = routeOf(shareWith, options);
    const from = scan.routes[fromRoute]?.seed;
    if (!from) throw new Error(`${fromRoute} has no seed to share`);
    if (!canShare(normalized, fromRoute)) throw new Error(`${normalized} may not share ${fromRoute}'s seed: only routes two or more levels under the same record share one (scan status names what is shareable); the record route and its first-level tabs each get a seed of their own`);
    const derived = fillRoute(normalized, from.startUrl, fromRoute, scan.base);
    if (!derived) throw new Error(`could not place ${fromRoute}'s record into ${normalized}`);
    ({ url, record, recordId, deleteBy, built } = { url: derived, record: from.record, recordId: from.recordId, deleteBy: from.deleteBy, built: from.built });
  }
  if (!SEED_NAME.test(record ?? '')) throw new Error(`a seed record is a throwaway made at this scan, named "qzx<digits> survey throwaway <page>", not "${record ?? ''}"`);
  const own = folderSolutionId(firing);
  if (own && recordId && String(recordId) === String(own)) throw new Error(`${recordId} is the folder's own solution: never a seed record; make a throwaway`);
  const startUrl = url ? new URL(url, scan.base).href : null;
  if (!startUrl || routeOf(startUrl, options) !== normalized) throw new Error(`the seed's URL ${url} is not an address of ${normalized}`);
  const entry = (scan.routes[normalized] ??= { urls: [], scannedAt: [], seed: null, foundFrom: 'seed' });
  entry.seed = { startUrl, record, recordId, deleteBy, built: Boolean(built) };
  if (!entry.urls.includes(startUrl)) entry.urls.push(startUrl);
  writeScan(firing, scan);
  return { route: normalized, seed: entry.seed, ...scanStatus(scan) };
}

/** A resumed run: the private folder is new, and the walk clock starts again where it stopped. */
export function resumeFolders(run, firing, privateFolder, now) {
  run.privateFolder = path.resolve(privateFolder);
  for (const page of run.pages ?? []) Object.assign(page, pageFiles(run, firing, page.key));
  // The minutes the walk had used when the last report came in; the time no session ran it is not counted.
  run.walkClock = { since: isoOf(now), before: Number(run.budget?.minutesUsed ?? 0) };
  return { privateFolder: run.privateFolder, pages: (run.pages ?? []).length, minutesUsed: run.walkClock.before };
}

/**
 * Marks one page dispatched to a helper, and says the job line its helper's message carries. A page
 * sent again (the depth check, a merge problem, a deadline) gets a helper name of its own and the
 * problems its last fragment left, which go to the helper as the message's `Problem:` line.
 */
export function dispatchPage(run, key, helper = null, now) {
  const page = (run.pages ?? []).find((entry) => entry.key === key);
  if (!page) throw new Error(`no page ${key} in the run file`);
  // A walked or failed page goes out again only to fix what the script refused, and continues from its fragment.
  if (!page.startUrl) throw new Error(`page ${key} is ${page.state}: it has no URL to open`);
  const attempts = (page.attempts ?? 0) + 1;
  helper ??= attempts > 1 ? `discover-${page.key}-${attempts}` : `discover-${page.key}`;
  // `firstDispatchedAt` is the wave the page started in; a second pass is not a wave.
  Object.assign(page, { state: 'walking', helper, dispatchedAt: isoOf(now), firstDispatchedAt: page.firstDispatchedAt ?? isoOf(now), attempts });
  const problems = page.walkProblems ?? [];
  return { key: page.key, helper, job: page.frame ? 'walk frame' : `walk page ${page.key}`, attempts, dispatchedAt: page.dispatchedAt, ...(problems.length ? { problem: problems.join('; ') } : {}) };
}

/**
 * What a fragment reported `walked` still owes (traversal.md, The depth check): a control whose kind
 * lands on a state but has no edge, a frontier left, a role not walked. The code-app comparison showed
 * the gap: the single walker recorded page 2, page size 20, the Clans collection and a response shown
 * as states of /naruto; the page helper listed the same controls and recorded none of them.
 */
export function walkProblems(fragment, run = {}) {
  const problems = [];
  if (!fragment) return problems;
  const via = new Set((fragment.edges ?? []).map((edge) => edge.via).filter(Boolean));
  for (const node of fragment.nodes ?? []) {
    // The tabs selected on arrival land nowhere: the node's `selected` names them. A node that names none
    // may leave one tab without an edge, the one tab set's selected tab.
    const selected = new Set(node.selected ?? []);
    const tabs = [];
    for (const [id, kind] of Object.entries(node.inventoryKinds ?? {})) {
      if (!OWES_EDGE[kind] || via.has(id) || selected.has(id)) continue;
      if (kind === 'tab') { tabs.push(id); continue; }
      problems.push(`${id} [${kind}] has no edge: ${OWES_EDGE[kind]}; exercise it and record the node it lands on`);
    }
    if (run.depth === 'full') {
      if (tabs.length > (selected.size ? 0 : 1)) problems.push(`${node.id}: tabs ${tabs.join(', ')} have no edge; each tab selected is a state of the page (list the tabs selected on arrival in the node's "selected"; every other tab owes an edge)`);
    } else {
      // Core depth: a tab set owes one edge, from any one of its tabs.
      const tabIds = Object.entries(node.inventoryKinds ?? {}).filter(([, kind]) => kind === 'tab').map(([id]) => id);
      if (tabIds.length && !tabIds.some((id) => via.has(id))) problems.push(`${node.id}: no tab of ${tabIds.join(', ')} has an edge; at core depth one tab of each set is selected and recorded as a state`);
    }
  }
  if (fragment.status === 'walked' && (fragment.frontier ?? []).length) problems.push(`frontier still holds ${fragment.frontier.join(', ')}: walk them before the status is walked`);
  const users = (run.users ?? []).filter((user) => !user.dropped).map((user) => String(user.id));
  const done = new Set((fragment.rolesDone ?? []).map(String));
  const missing = users.filter((id) => !done.has(id));
  if (fragment.status === 'walked' && missing.length) problems.push(`rolesDone lacks ${missing.join(', ')}: open every recorded node as each role`);
  return problems;
}

/** The seed the scan made for a page, by its route. */
const seedOf = (run, page) => (run.seeds ?? []).find((seed) => seed.route && seed.route === page.route) ?? null;
/** Does a throwaway entry name the seed: by its record name, or its id? */
const namesSeed = (item, seed) => Boolean(seed) && [seed.record, seed.recordId].filter(Boolean).some((name) => String(item.record ?? '').includes(String(name)));

/** The depth check on one page's fragment as it stands, for its helper before it deletes its seed. Pure. */
export function checkPage(run, key) {
  const page = (run.pages ?? []).find((entry) => entry.key === key);
  if (!page) throw new Error(`no page ${key} in the run file`);
  const fragment = readFragment(page);
  if (!fragment) return { key, problems: ['no fragment yet'] };
  return { key, status: fragment.status ?? null, problems: walkProblems({ ...fragment, status: 'walked' }, run) };
}

function readFragment(page) {
  try { return JSON.parse(fs.readFileSync(page.fragment, 'utf8')); } catch { return null; }
}

/** The walked surfaces of a fragment: its nodes less the ones still in its own frontier. */
const walkedOf = (fragment) => (fragment?.nodes ?? []).filter((node) => !(fragment.frontier ?? []).includes(node.id)).length;

/**
 * Records one helper's report from its fragment: the page's state, its surfaces, its throwaways,
 * and every exit to a page not yet queued. `--status failed` is for a helper that ended without
 * a fragment it could stand behind, or stalled. A fragment reported walked that fails the depth
 * check goes back to the queue once, with its problems; the next tick sends the page again, and
 * that helper continues from the fragment. The second report is taken as it stands.
 */
export function reportPage(run, firing, key, { status = null, reason = null, now } = {}) {
  const page = (run.pages ?? []).find((entry) => entry.key === key);
  if (!page) throw new Error(`no page ${key} in the run file`);
  const fragment = readFragment(page);
  const walked = status ?? (fragment && TERMINAL.has(fragment.status) ? fragment.status : 'failed');
  const problems = walked === 'walked' ? walkProblems(fragment, run) : [];
  // A record page whose helper deleted its seed has nothing left to open: the depth check cannot send it
  // back (the beta 76 insights helper met a 404 on its second pass). The helper runs `check` before the delete.
  const seedGone = Boolean(seedOf(run, page)) && (fragment?.throwaways ?? []).some((item) => item.deleted && namesSeed(item, seedOf(run, page)));
  const sentAgain = problems.length > 0 && (page.attempts ?? 0) < DEPTH_PASSES && !seedGone;
  const state = sentAgain ? 'queued' : walked;
  Object.assign(page, { state, reportedAt: isoOf(now), surfaces: walkedOf(fragment) });
  if (problems.length) page.walkProblems = problems; else delete page.walkProblems;
  // Every pass's problems are kept, so the report can quote what the depth check asked for and whether the next pass fixed it.
  if (problems.length) (page.depthHistory ??= []).push({ attempt: page.attempts ?? 0, problems, sentAgain, ...(problems.length && !sentAgain && seedGone ? { why: 'seed deleted: the page cannot be opened again' } : {}) });
  // A page whose surface is another route's page (a catch-all that renders the dashboard): one node, and the route it renders.
  if (fragment?.sameAs) page.sameAs = fragment.sameAs; else delete page.sameAs;
  if (state === 'failed') page.reason = reason ?? (fragment ? `the helper left its fragment ${fragment.status ?? 'unfinished'}` : 'the helper wrote no fragment');
  else if (fragment?.reason) page.reason = fragment.reason;
  if (fragment?.landedOn) page.landedOn = fragment.landedOn;
  const queued = [];
  const filled = [];
  const ignored = [];
  const exits = [...(fragment?.edges ?? []).filter((edge) => edge.toRoute).map((edge) => edge.toRoute), ...(fragment?.landedOn ? [fragment.landedOn] : [])];
  for (const url of exits) {
    const result = enqueue(run, firing, url, { source: `exit of ${key}`, from: page });
    if (result.queued || result.filled) {
      // A page the walk meets only now is one the scan missed: it starts a later wave, and the report names it.
      const late = run.pages.find((entry) => entry.key === result.key);
      if (late) late.lateFound = true;
    }
    if (result.queued) queued.push(result.key);
    else if (result.filled) filled.push(result.key);
    else if (result.ignored) ignored.push({ url, why: result.ignored });
  }
  // A fragment set aside keeps the throwaways it named: the app may still hold them.
  if (fragment) {
    run.throwaways = [...(run.throwaways ?? []).filter((item) => item.page !== key), ...(fragment.throwaways ?? []).map((item) => ({ ...item, page: key }))];
    run.wouldHaveAsked = [...(run.wouldHaveAsked ?? []).filter((item) => item.page !== key), ...(fragment.wouldHaveAsked ?? []).map((item) => ({ ...item, page: key }))];
  }
  run.budget ??= { ...DEFAULTS, surfacesUsed: 0, minutesUsed: 0 };
  run.budget.surfacesUsed = (run.pages ?? []).reduce((total, entry) => total + (entry.surfaces ?? 0), 0);
  run.budget.minutesUsed = round1(walkMinutes(run, now ?? Date.now()));
  return { key, state, surfaces: page.surfaces, queued, filled, ignored, surfacesUsed: run.budget.surfacesUsed, problems, sentAgain };
}

/** No more pages: every page still queued or waiting for a URL is closed with the reason given. */
export function stopPages(run, reason) {
  const stopped = [];
  for (const page of run.pages ?? []) {
    if (page.state === 'queued' || page.state === 'needs-url') { Object.assign(page, { state: 'stopped', reason }); stopped.push(page.key); }
  }
  return { stopped, reason };
}

/**
 * One tick of the walk's watch, from the run file: helpers past their deadline (dispatch again
 * once, then fail the page), the helper cap under load, the 5xx back-off, the traversal budget,
 * and which queued pages to dispatch now: the frame, the entry, then the rest in the order found.
 * A page sent again past its deadline holds its slot. Pure: the caller acts on the answer.
 */
export function walkTick(run, { now = new Date(), load = null, cores = null, consecutive5xx = 0 } = {}) {
  const at = new Date(now).getTime();
  const pages = run.pages ?? [];
  const deadlineMs = Number(run.helperDeadlineMinutes ?? DEFAULTS.deadline) * 60_000;
  const pastDeadline = pages
    .filter((page) => page.state === 'walking' && page.dispatchedAt && at - new Date(page.dispatchedAt).getTime() > deadlineMs)
    .map((page) => ({ key: page.key, helper: page.helper, action: (page.attempts ?? 1) >= 2 ? 'fail' : 'redispatch' }));
  const contractCap = Number(run.contractHelperCap ?? run.helperCap ?? DEFAULTS.helpers);
  const floor = Math.min(contractCap, Math.max(1, Number(run.helperCapFloor ?? DEFAULTS.floor)));
  let cap = Math.max(floor, Number(run.helperCap ?? contractCap));
  let why = null;
  if (load !== null && cores) {
    if (load > cores && cap > floor) { cap = Math.max(floor, cap - 2); why = 'machine load'; }
    else if (load < cores / 2 && cap < contractCap) { cap = Math.min(contractCap, cap + 2); why = 'machine load'; }
  }
  const backoff = backoffMinutes(consecutive5xx);
  const budget = run.budget ?? {};
  const surfacesUsed = pages.reduce((total, page) => total + (page.surfaces ?? 0), 0);
  const minutesUsed = walkMinutes(run, at);
  const first = (page) => (page.frame ? 0 : page.entry ? 1 : 2);
  const queued = pages.filter((page) => page.state === 'queued').sort((left, right) => first(left) - first(right) || left.order - right.order);
  const walking = pages.filter((page) => page.state === 'walking').length;
  // The pages still walking count at the average size of the pages reported so far (6 before any report),
  // so the budget stops dispatch before the wave in flight overshoots it, not after.
  const reported = pages.filter((page) => page.reportedAt && typeof page.surfaces === 'number');
  const average = reported.length ? reported.reduce((total, page) => total + page.surfaces, 0) / reported.length : 6;
  const projected = Math.round(surfacesUsed + walking * average);
  const budgetWhy = Number(budget.surfaces) > 0 && surfacesUsed >= Number(budget.surfaces) ? `${budget.surfaces} surfaces`
    : Number(budget.surfaces) > 0 && projected >= Number(budget.surfaces) ? `${budget.surfaces} surfaces (projected ${projected})`
    : Number(budget.minutes) > 0 && minutesUsed >= Number(budget.minutes) ? `${budget.minutes} minutes` : null;
  const inFlight = walking - pastDeadline.filter((item) => item.action === 'fail').length;
  const dispatch = backoff || budgetWhy ? [] : queued.slice(0, Math.max(0, cap - inFlight)).map((page) => page.key);
  return {
    pastDeadline,
    cap,
    capChange: cap !== Number(run.helperCap ?? contractCap) ? { from: Number(run.helperCap ?? contractCap), to: cap, why } : null,
    backoffMinutes: backoff,
    dispatch,
    budget: { reached: Boolean(budgetWhy), why: budgetWhy, surfacesUsed, projected, minutesUsed: round1(minutesUsed), left: budgetWhy ? queued.map((page) => page.key) : [] },
    walking,
    queued: queued.length,
    done: walking === 0 && (queued.length === 0 || Boolean(budgetWhy)),
  };
}

/** Why a page has no walked node, in the words its not-covered row starts with. */
function notWalkedWhy(page, budgetReached) {
  if (page.state === 'unplaced') return `could not reach: ${page.reason ?? 'the page has no address'}`;
  if (page.state === 'needs-url') return 'could not reach: no control leads to it';
  if (page.state === 'redirected') return `could not reach: opens ${page.landedOn ?? 'another page'} instead`;
  if (page.state === 'unreachable') return `could not reach: ${page.reason ?? 'the page does not open for the test users'}`;
  if (page.state === 'failed') return `could not reach: the page's walk did not finish (${page.reason ?? 'helper failed'})`;
  if (page.state === 'stopped') return `could not reach: ${page.reason ?? 'the walk stopped'}`;
  if (page.state === 'skipped') return `outside the cap or the named areas: ${page.reason ?? 'skipped'}`;
  if (budgetReached || page.state === 'queued') return 'could not reach: traversal budget';
  return 'could not reach: not walked';
}

/**
 * Rewrites every id a page's text names, by that page's maps. An id the page does not hold, an id
 * inside a hook (`step-N2`), and anything in backticks or double quotes stay as they are: those are
 * the hooks and the app's own words an author copies.
 */
export function rewriteIds(text, maps) {
  return String(text).split(QUOTED).map((part, index) => (index % 2 ? part : part.replace(ID_TOKEN, (token, letter, number, item) => {
    if (letter === 'S' && item !== undefined) {
      const node = maps.nodes.get(`N${number}`);
      return node ? `S${node.slice(1)}.${item}` : token;
    }
    if (item !== undefined) return token;
    const table = { N: maps.nodes, E: maps.edges, P: maps.recipes }[letter];
    return table?.get(`${letter}${number}`) ?? token;
  }))).join('');
}

/** The order pages are numbered in: the entry, the frame, then the page list's own order, then
 * every page found on the way by its route, so the same fragments make the same graph whichever helper
 * reported first. */
function mergeOrder(pages) {
  const rank = (page) => (page.entry ? 0 : page.frame ? 1 : String(page.source ?? '').startsWith('page list') ? 2 : 3);
  return [...pages].sort((left, right) => rank(left) - rank(right)
    || (rank(left) === 2 ? left.order - right.order : String(left.route ?? left.key).localeCompare(String(right.route ?? right.key), 'en')));
}

/**
 * Joins every page's fragment into one graph with ids of the run: pages in merge order, each page's
 * nodes, edges and recipes numbered on from the last. An inventory id keeps its item number and takes
 * its node's new number. An exit becomes an edge to the first node of the page it opens; a page with
 * no walked node becomes one node marked `notWalked`, so its row can name it. The entry page's first
 * node is an entry of the graph, and so is the frame's first node. The result is checked
 * as the coverage check reads it, so a fragment that breaks the graph's shape is named here, by page.
 */
export function mergeFragments(run, { existing = {}, maxEdges = null } = {}) {
  const pages = mergeOrder(run.pages ?? []);
  const problems = [];
  const nodes = [];
  const edges = [];
  const provisioning = [];
  const surveys = [];
  const counters = { N: 0, E: 0, P: 0 };
  const next = (letter) => `${letter}${++counters[letter]}`;
  const firstNodeOf = new Map();
  const mapsOf = new Map();
  const budget = run.budget ?? {};
  const budgetReached = (Number(budget.surfaces) > 0 && Number(budget.surfacesUsed ?? 0) >= Number(budget.surfaces))
    || (Number(budget.minutes) > 0 && Number(budget.minutesUsed ?? 0) >= Number(budget.minutes));
  const fragments = new Map(pages.map((page) => [page.key, page.fragment ? readFragment(page) : null]));

  for (const page of pages) {
    const fragment = fragments.get(page.key);
    const maps = { nodes: new Map(), edges: new Map(), recipes: new Map() };
    mapsOf.set(page.key, maps);
    if (!fragment || !(fragment.nodes ?? []).length) continue;
    for (const [list, table, letter, what] of [[fragment.nodes, maps.nodes, 'N', 'node'], [fragment.edges ?? [], maps.edges, 'E', 'edge'], [fragment.provisioning ?? [], maps.recipes, 'P', 'recipe']]) {
      for (const item of list) {
        if (!item?.id) { problems.push(`page ${page.key}: a ${what} has no id`); continue; }
        if (table.has(item.id)) { problems.push(`page ${page.key}: ${what} ${item.id} is listed twice`); continue; }
        table.set(item.id, next(letter));
      }
    }
    const named = (fragment.entry ?? [])[0];
    if (named && !maps.nodes.has(named)) problems.push(`page ${page.key}: entry ${named} is not one of its nodes`);
    firstNodeOf.set(page.key, maps.nodes.get(maps.nodes.has(named) ? named : fragment.nodes[0].id));
  }

  // A page that has no walked node still gets one, so the surface can be named in a row.
  const stubOf = new Map();
  const stubFor = (page) => {
    if (!stubOf.has(page.key)) {
      const id = next('N');
      stubOf.set(page.key, id);
      const title = page.frame ? 'App frame' : page.route ?? `page ${page.pageId ?? page.key} (no address)`;
      nodes.push({ id, url: page.route ?? (page.frame ? pathOf(page.startUrl, run.base) : null), title, state: 'default', roles: [], inventory: [], page: page.key, notWalked: notWalkedWhy(page, budgetReached) });
    }
    return stubOf.get(page.key);
  };
  const byRoute = new Map(pages.filter((page) => page.route).map((page) => [page.route, page]));
  // A route the contract's areas leave out is a surface still: one node, outside the named areas.
  const outside = new Map();
  const targetOf = (url, from) => {
    if (!sameOrigin(url, run.base)) { problems.push(`page ${from}: exit to ${url} leaves the app's origin; record that control as an inventory item, not an edge`); return null; }
    const route = routeOf(url, { base: run.base, patterns: patternsOf(run) });
    let page = byRoute.get(route);
    if (page?.state === 'redirected' && page.landedOn) page = byRoute.get(routeOf(page.landedOn, { base: run.base, patterns: patternsOf(run) })) ?? page;
    if (page) return firstNodeOf.get(page.key) ?? stubFor(page);
    if (SIGN_OUT.test(route)) { problems.push(`page ${from}: exit to ${route} signs out; it is an untouched control, not an edge`); return null; }
    if (!insideOf(run, route)) {
      if (!outside.has(route)) {
        const id = next('N');
        outside.set(route, id);
        nodes.push({ id, url: route, title: route, state: 'default', roles: [], inventory: [], notWalked: 'outside the cap or the named areas' });
      }
      return outside.get(route);
    }
    problems.push(`page ${from}: exit to ${route} matches no page of the run; record the report with pages.mjs report first`);
    return null;
  };

  for (const page of pages) {
    const fragment = fragments.get(page.key);
    const maps = mapsOf.get(page.key);
    if (!fragment || !(fragment.nodes ?? []).length) continue;
    const frontier = new Set(fragment.frontier ?? []);
    const seen = new Set();
    for (const node of fragment.nodes) {
      if (!node?.id || seen.has(node.id)) continue;
      seen.add(node.id);
      const id = maps.nodes.get(node.id);
      const number = id.slice(1);
      const inventory = [];
      const kinds = {};
      for (const item of node.inventory ?? []) {
        const [, prefix, itemNumber] = String(item).match(/^S(\d+)\.(\d+)$/u) ?? [];
        if (!itemNumber) { problems.push(`page ${page.key}: ${node.id} lists ${item}, which is not an S<k>.<n> id`); continue; }
        if (`N${prefix}` !== node.id) problems.push(`page ${page.key}: ${item} is numbered for N${prefix} but listed on ${node.id}`);
        const global = `S${number}.${itemNumber}`;
        if (inventory.includes(global)) { problems.push(`page ${page.key}: ${node.id} lists item ${itemNumber} twice`); continue; }
        inventory.push(global);
        if (node.inventoryKinds?.[item]) kinds[global] = node.inventoryKinds[item];
      }
      for (const item of Object.keys(node.inventoryKinds ?? {})) if (!(node.inventory ?? []).includes(item)) problems.push(`page ${page.key}: ${node.id} gives ${item} a kind but does not list it`);
      const surveyFile = node.surveyFile ? `survey/survey-${number}.md` : undefined;
      if (node.surveyFile) surveys.push({ from: path.resolve(page.pageFolder, node.surveyFile), to: surveyFile, maps });
      nodes.push({
        ...node, id, url: node.url ?? page.route ?? pathOf(page.startUrl, run.base), inventory,
        ...(Object.keys(kinds).length ? { inventoryKinds: kinds } : { inventoryKinds: undefined }),
        ...(surveyFile ? { surveyFile } : {}), page: page.key,
        ...(fragment.sameAs ? { sameAs: fragment.sameAs } : {}),
        ...(frontier.has(node.id) ? { notWalked: page.state === 'failed' ? notWalkedWhy(page, budgetReached) : 'could not reach: traversal budget' } : {}),
      });
    }
    const seenEdges = new Set();
    for (const edge of fragment.edges ?? []) {
      if (!edge?.id || seenEdges.has(edge.id)) continue;
      seenEdges.add(edge.id);
      const id = maps.edges.get(edge.id);
      const from = maps.nodes.get(edge.from);
      if (!from) { problems.push(`page ${page.key}: ${edge.id} starts at ${edge.from}, which is not one of its nodes`); continue; }
      let to = edge.to ? maps.nodes.get(edge.to) : null;
      if (edge.to && !to) { problems.push(`page ${page.key}: ${edge.id} ends at ${edge.to}, which is not one of its nodes`); continue; }
      if (!to && edge.toRoute) to = targetOf(edge.toRoute, page.key);
      if (!to) { if (!edge.toRoute) problems.push(`page ${page.key}: ${edge.id} has neither to nor toRoute`); continue; }
      const via = edge.via ? rewriteIds(edge.via, maps) : edge.via;
      const { toRoute, ...rest } = edge;
      edges.push({ ...rest, id, from, to, ...(via ? { via } : {}), ...(toRoute ? { toRoute } : {}), page: page.key });
    }
    for (const recipe of fragment.provisioning ?? []) {
      if (!recipe?.id || !maps.recipes.has(recipe.id)) continue;
      provisioning.push({ ...recipe, id: maps.recipes.get(recipe.id), ...(recipe.observedOn ? { observedOn: maps.edges.get(recipe.observedOn) ?? recipe.observedOn } : {}), page: page.key });
    }
  }
  // Every page the run knew and did not walk is a surface still, named for its row.
  for (const page of pages) if (!firstNodeOf.has(page.key)) stubFor(page);

  const entryPage = pages.find((page) => page.entry) ?? pages.find((page) => !page.frame);
  if (pages.length && !pages.some((page) => page.entry)) problems.push('no page is the entry; queue the URL the app landed on with pages.mjs init --entry');
  const entry = entryPage ? [firstNodeOf.get(entryPage.key) ?? stubFor(entryPage)] : [];
  // A frame control's nav edge starts at the app frame, so a journey may begin there too.
  const framePage = pages.find((page) => page.frame);
  if (framePage && firstNodeOf.has(framePage.key)) entry.push(firstNodeOf.get(framePage.key));
  const reached = new Set(edges.map((edge) => edge.to));
  const graph = {
    ...existing,
    appUrl: existing.appUrl ?? run.appUrl,
    entry,
    nodes: nodes.map((node) => Object.fromEntries(Object.entries(node).filter(([, value]) => value !== undefined))).sort((left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1))),
    edges,
    ...(existing.chrome ? { chrome: existing.chrome.map((item) => ({ ...item, seenOn: entry })) } : {}),
    provisioning,
  };
  // The graph as the coverage check will read it: a shape it refuses is named now, with its page.
  const pageOfId = new Map([...graph.nodes, ...graph.edges].filter((item) => item.page).map((item) => [item.id, item.page]));
  for (const problem of enumerateJourneys(graph, { maxEdges: Number(maxEdges ?? run.journeyLength ?? DEFAULTS.maxEdges) }).problems) {
    const owner = (problem.match(/\b[NE]\d+\b/u) ?? []).map((id) => pageOfId.get(id)).find(Boolean);
    problems.push(owner ? `page ${owner}: ${problem}` : problem);
  }
  const notWalked = graph.nodes.filter((node) => node.notWalked).map((node) => ({ node: node.id, route: node.url, why: node.notWalked }));
  const orphans = pages.filter((page) => firstNodeOf.has(page.key) && !page.entry && !page.frame && !reached.has(firstNodeOf.get(page.key))).map((page) => ({ page: page.key, node: firstNodeOf.get(page.key) }));
  return { graph, surveys, notWalked, orphans, problems };
}

/** How the walk spent its time: its minutes against helper-minutes, the measure of what running pages side by side saved. */
export function walkStats(run) {
  const pages = run.pages ?? [];
  const reported = pages.filter((page) => page.dispatchedAt && page.reportedAt);
  const helperMinutes = reported.reduce((total, page) => total + minutesBetween(page.dispatchedAt, page.reportedAt), 0);
  const lastReport = reported.map((page) => page.reportedAt).sort().at(-1);
  const wallMinutes = lastReport ? walkMinutes(run, lastReport) : 0;
  const longest = reported.map((page) => ({ key: page.key, minutes: round1(minutesBetween(page.dispatchedAt, page.reportedAt)) })).sort((left, right) => right.minutes - left.minutes)[0] ?? null;
  const byState = {};
  for (const page of pages) byState[page.state] = (byState[page.state] ?? 0) + 1;
  return {
    pages: pages.length,
    byState,
    helpersDispatched: pages.reduce((total, page) => total + (page.attempts ?? 0), 0),
    surfaces: pages.reduce((total, page) => total + (page.surfaces ?? 0), 0),
    wallMinutes: round1(wallMinutes),
    helperMinutes: round1(helperMinutes),
    sideBySide: wallMinutes > 0 ? round1(helperMinutes / wallMinutes) : 0,
    longest,
    // The waves: one for every page the scan knew, plus one per distinct first dispatch of a page the walk
    // found late. A second pass, or a page held back by the helper cap, is not a wave.
    waves: (pages.some((page) => page.firstDispatchedAt ?? page.dispatchedAt) ? 1 : 0)
      + new Set(pages.filter((page) => page.lateFound && (page.firstDispatchedAt ?? page.dispatchedAt)).map((page) => (page.firstDispatchedAt ?? page.dispatchedAt).slice(0, 16))).size,
    lateFound: pages.filter((page) => page.lateFound).map((page) => page.key),
    // The depth check: the pages sent back for a second pass, every pass's problems word for word with whether
    // the page's last report resolved them, and the problems a page's last report still left.
    secondPasses: pages.filter((page) => (page.attempts ?? 0) > 1).map((page) => page.key),
    depthHistory: pages.flatMap((page) => (page.depthHistory ?? []).map((pass) => ({ page: page.key, ...pass, resolved: !(page.walkProblems ?? []).length }))),
    depthProblems: pages.filter((page) => (page.walkProblems ?? []).length).map((page) => ({ page: page.key, problems: page.walkProblems })),
    // Pages whose surface is another route's page: one node each, and the route it renders.
    sameAs: pages.filter((page) => page.sameAs).map((page) => ({ page: page.key, route: page.route, sameAs: page.sameAs })),
  };
}

function argsOf(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const name = arg.slice(2);
    const value = argv[index + 1] !== undefined && !argv[index + 1].startsWith('--') ? argv[++index] : true;
    if (['route', 'within', 'key', 'skip'].includes(name)) (flags[name] ??= []).push(value);
    else flags[name] = value;
  }
  return { positional, flags };
}

const readJson = (value) => JSON.parse(fs.readFileSync(String(value).replace(/^@/u, ''), 'utf8'));
const print = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

export function main(argv) {
  const { positional: [command], flags } = argsOf(argv);
  if (typeof flags.run !== 'string') throw new Error('--run <run.json> is required');
  const runFile = path.resolve(flags.run);
  const firing = firingOf(runFile);
  const now = typeof flags.now === 'string' ? flags.now : undefined;
  const number = (name) => (flags[name] !== undefined ? Number(flags[name]) : undefined);
  const keys = (flags.key ?? []).flatMap((value) => String(value).split(',')).map((key) => key.trim()).filter(Boolean);
  const text = (name) => (typeof flags[name] === 'string' ? flags[name] : null);
  if (command === 'init') {
    print(withRun(runFile, (run) => {
      const result = initPages(run, firing, {
        base: flags.base, entry: flags.entry, pagePaths: flags['page-paths'] ? readJson(flags['page-paths']) : null,
        routes: flags.route ?? [], within: flags.within ?? [], globalNav: flags['global-nav'] ? readJson(flags['global-nav']) : null, chrome: flags.chrome ? readJson(flags.chrome) : null, skip: flags.skip ?? [], walkTestPages: flags['walk-test-pages'] === true,
        allowIncompleteScan: flags['allow-incomplete-scan'] === true,
        helpers: number('helpers'), deadline: number('deadline'), surfaces: number('surfaces'), minutes: number('minutes'), maxEdges: number('max-edges'), depth: text('depth') ?? undefined, now,
      });
      return { ...result, queued: run.pages.filter((page) => page.state === 'queued').length, needsUrl: run.pages.filter((page) => page.state === 'needs-url').map((page) => page.route), unplaced: run.pages.filter((page) => page.state === 'unplaced').length };
    }));
  } else if (command === 'scan') {
    const sub = argsOf(argv).positional[1];
    if (sub === 'add') {
      if (!text('at') || !text('links')) throw new Error('scan add takes --at <the URL the links were read on> and --links <the file walk.mjs links printed>');
      print(scanAdd(firing, { at: flags.at, links: parseLinksOutput(fs.readFileSync(flags.links, 'utf8')), base: text('base'), within: flags.within ?? [], pagePaths: flags['page-paths'] ? readJson(flags['page-paths']) : null }));
    } else if (sub === 'seed') {
      if (!text('route') && !(flags.route ?? []).length) throw new Error('scan seed takes --route <the route the record is for>');
      print(scanSeed(firing, { route: (flags.route ?? [])[0], url: text('url'), record: text('record'), recordId: text('record-id'), deleteBy: text('delete-by'), built: flags.built === true, shareWith: text('share-with') }));
    } else if (sub === 'status') {
      print(scanStatus(readScan(firing)));
    } else throw new Error('usage: pages.mjs scan add|seed|status --run <run.json> …');
  } else if (command === 'folders') {
    if (!text('private-folder')) throw new Error('--private-folder <folder> is required');
    print(withRun(runFile, (run) => resumeFolders(run, firing, flags['private-folder'], now)));
  } else if (command === 'route') {
    if (!text('url')) throw new Error('--url <URL or path> is required');
    const run = readRun(runFile);
    // The fallback page's address matches no route: a URL a page was told to open is that page.
    const opened = (run.pages ?? []).find((entry) => entry.route && isStartUrl(entry, flags.url, run.base));
    const route = opened?.route ?? routeOf(flags.url, { base: run.base, patterns: patternsOf(run) });
    const page = opened ?? (run.pages ?? []).find((entry) => entry.route === route);
    print({ route, page: page?.key ?? null, sameOrigin: sameOrigin(flags.url, run.base), inside: insideOf(run, route) });
  } else if (command === 'dispatch') {
    if (!keys.length) throw new Error('--key <page> is required, once per page');
    // `--helper` names one helper, so it goes with one page: a page sent again gets a call of its own.
    if (text('helper') && keys.length > 1) throw new Error('--helper names one helper; send each page again with a dispatch call of its own');
    print(withRun(runFile, (run) => keys.map((key) => dispatchPage(run, key, text('helper'), now))));
  } else if (command === 'report') {
    if (!keys.length) throw new Error('--key <page> is required, once per page');
    print(withRun(runFile, (run) => keys.map((key) => reportPage(run, firing, key, { status: text('status'), reason: text('reason'), now }))));
  } else if (command === 'check') {
    if (keys.length !== 1) throw new Error('--key <page> is required: the one page whose fragment to check');
    print(checkPage(readRun(runFile), keys[0]));
  } else if (command === 'tick') {
    print(walkTick(readRun(runFile), { now: now ?? new Date(), load: flags.load !== undefined ? Number(flags.load) : null, cores: flags.cores !== undefined ? Number(flags.cores) : null, consecutive5xx: number('failed-5xx') ?? 0 }));
  } else if (command === 'stop') {
    if (!text('reason')) throw new Error('--reason <text> is required: it is what each page\'s row says after "could not reach: "');
    print(withRun(runFile, (run) => stopPages(run, flags.reason)));
  } else if (command === 'note') {
    print(withRun(runFile, (run) => {
      if (text('stage')) run.stage = flags.stage;
      if (flags.cap !== undefined) run.helperCap = Number(flags.cap);
      if (text('drop-user')) {
        const user = (run.users ?? []).find((entry) => String(entry.id) === flags['drop-user']);
        if (!user) throw new Error(`no user ${flags['drop-user']} in the run file`);
        user.dropped = text('reason') ?? 'session expired';
      }
      if (text('append')) {
        if (!APPENDABLE.has(flags.append)) throw new Error(`--append takes one of ${[...APPENDABLE].join(', ')}`);
        if (!text('value')) throw new Error('--value <json> is required with --append');
        (run[flags.append] ??= []).push(JSON.parse(flags.value));
      }
      return { stage: run.stage, helperCap: run.helperCap, dropped: (run.users ?? []).filter((user) => user.dropped).map((user) => user.id) };
    }));
  } else if (command === 'merge') {
    const run = readRun(runFile);
    const out = text('out') ? path.resolve(flags.out) : path.join(firing, 'journeys.json');
    const existing = fs.existsSync(out) ? readJson(out) : {};
    const { graph, surveys, notWalked, orphans, problems } = mergeFragments(run, { existing, maxEdges: number('max-edges') ?? null });
    fs.mkdirSync(path.join(firing, 'survey'), { recursive: true });
    for (const survey of surveys) {
      try { fs.writeFileSync(path.join(firing, survey.to), rewriteIds(fs.readFileSync(survey.from, 'utf8'), survey.maps)); } catch (error) { problems.push(`survey file ${survey.from}: ${error.message}`); }
    }
    fs.writeFileSync(out, `${JSON.stringify(graph, null, 2)}\n`);
    const inventory = graph.nodes.reduce((total, node) => total + (node.inventory ?? []).length, 0);
    print({ out, nodes: graph.nodes.length, edges: graph.edges.length, inventory, provisioning: graph.provisioning.length, notWalked, orphans, problems, stats: walkStats(run) });
    if (problems.length) process.exitCode = 1;
  } else if (command === 'stats') {
    print(walkStats(readRun(runFile)));
  } else {
    throw new Error('usage: pages.mjs init|folders|route|dispatch|report|check|tick|stop|note|merge|stats --run <run.json> …');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
}
