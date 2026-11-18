#!/usr/bin/env node
/**
 * affected.mjs — which Test Studio cases a code app pull request can change, and what their run showed.
 *   node affected.mjs routes --checkout <dir>
 *   node affected.mjs select --checkout <dir> --changed <file> --cases <file> [--elements <file>] [--app-url <deployed app URL>] --out <affected.json>
 *   node affected.mjs report --affected <affected.json> [--executions <file>] [--pr <pr.json>] (--on <link> | --live) [--run <run id>] [--app-url <URL>] [--note <text>]… --out <report.md>
 * Reads the files it is given and writes only --out. No network, no tenant, no git.
 *
 *   routes    every route the checkout's router declares, with the files that render it
 *   select    --changed: the PR's files as `gh api …/pulls/<n>/files` answers them (JSON or one object a
 *             line), or a compare_code_versions answer; --cases: a fetch_test_cases answer saved verbatim;
 *             --elements: search_elements answers, one or several. Writes the selected cases, why each
 *             was picked, and what every changed file reaches.
 *   report    the run's executions (fetch_run_executions saved verbatim, or the per-case reads collected
 *             into one array) against the selection: each red is new, already failing, or a first run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { columnsOf, errorTextOf, failingStepOf, runHost } from '../../app-test-author/scripts/loop.mjs';
import { buildGraph, effectOf, normalizeRoutePath, pathMatches, routeForPath, withDescendants } from './source-graph.mjs';

const PASSED = new Set(['PASSED', 'SUCCESS']);
const FAILED = new Set(['FAILED', 'ERROR', 'TIMED_OUT', 'CANCELLED']);
const NAVIGATE_ACTIONS = new Set(['navigate', 'goto', 'open_url', 'open_new_tab']);
const ELEMENT_KEYS = new Set(['element', 'element2', 'revealsElement']);
const URL_KEYS = new Set(['url', 'startingUrl', 'pageUrl']);
// One line of an error in a table cell: enough to recognise it, short enough to keep the table readable.
const ERROR_CHARS = 160;
// The causes named on one row; the full list is in the Changed files table.
const CAUSES_SHOWN = 3;

/** JSON, one JSON value a line, or pages of arrays one after another, as `gh api --paginate` prints them. */
export function readJsonish(file) {
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return null;
  try {
    return unwrap(JSON.parse(text));
  } catch {
    // not one JSON value: try the other two shapes
  }
  try {
    return text.split('\n').filter((line) => line.trim()).map((line) => unwrap(JSON.parse(line)));
  } catch {
    // not one value a line either
  }
  try {
    return unwrap(JSON.parse(`[${text.replace(/\]\s*\[/gu, ',').replace(/^\[|\]$/gu, '')}]`));
  } catch {
    throw new Error(`${file} is not JSON, one JSON value a line, or concatenated JSON arrays`);
  }
}

/** A tool reply saved as its MCP content (`[{type:'text', text}]`) is unwrapped to the JSON it carries. */
function unwrap(value) {
  const items = Array.isArray(value) ? value : Array.isArray(value?.content) ? value.content : null;
  if (items?.length && items.every((item) => item?.type === 'text' && typeof item.text === 'string')) {
    const parsed = items.map((item) => {
      try {
        return JSON.parse(item.text);
      } catch {
        return item.text;
      }
    });
    return parsed.length === 1 ? parsed[0] : parsed;
  }
  return value;
}

/** Splits a unified diff of several files into one patch per file, keyed by the head path. */
export function splitPatch(text) {
  const byFile = new Map();
  let current = null;
  for (const line of String(text ?? '').split('\n')) {
    const header = /^diff --git a\/(.+) b\/(.+)$/u.exec(line);
    if (header) {
      current = { path: header[2], lines: [], inHunks: false };
      byFile.set(current.path, current);
    } else if (current && line.startsWith('+++ b/')) {
      byFile.delete(current.path);
      current.path = line.slice(6);
      byFile.set(current.path, current);
    } else if (current && (line.startsWith('@@') || current.inHunks)) {
      current.inHunks = true;
      current.lines.push(line);
    }
  }
  return new Map([...byFile].map(([file, entry]) => [file, entry.lines.join('\n')]));
}

const STATUS_WORDS = { added: 'added', add: 'added', new: 'added', removed: 'removed', deleted: 'removed', delete: 'removed', renamed: 'renamed', rename: 'renamed' };

/** The PR's changed files as `{ path, status, patch }`, a rename split into the new path and the old one removed. */
export function normalizeChanges(value) {
  // One changed file printed one object a line is a single object, not a list.
  const single = value && typeof value === 'object' && !Array.isArray(value) && (value.filename || value.path) ? [value] : null;
  const rows = Array.isArray(value) ? value.flat() : Array.isArray(value?.files) ? value.files : (single ?? []);
  const patches = typeof value?.patch === 'string' ? splitPatch(value.patch) : new Map();
  const changes = [];
  for (const row of rows) {
    const file = typeof row === 'string' ? row : (row?.filename ?? row?.path ?? row?.file);
    if (!file) continue;
    const status = STATUS_WORDS[String(row?.status ?? row?.change ?? row?.changeType ?? '').toLowerCase()] ?? 'modified';
    const patch = typeof row?.patch === 'string' ? row.patch : (patches.get(file) ?? null);
    const previous = row?.previous_filename ?? row?.previousPath ?? row?.oldPath;
    if (status === 'renamed') {
      changes.push({ path: file, status: 'modified', patch });
      if (previous) changes.push({ path: previous, status: 'removed', patch: null });
    } else changes.push({ path: file, status, patch });
  }
  return changes;
}

const snake = (name) => name.replace(/([a-z])([A-Z])/gu, '$1_$2').toUpperCase();

function field(item, name) {
  for (const holder of [item, item?.columns]) {
    if (holder && typeof holder === 'object') {
      if (holder[name] !== undefined) return holder[name];
      if (holder[snake(name)] !== undefined) return holder[snake(name)];
    }
  }
  return undefined;
}

function parseMaybe(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const LIST_KEYS = ['testCases', 'objects', 'rows', 'items', 'elements', 'data', 'results'];

/** The list a reply holds: the reply itself, a known key, or one level down (`{ data: { testCases } }`). */
function listOf(value, depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of LIST_KEYS) if (Array.isArray(value[key])) return value[key];
  const direct = Object.values(value).find(Array.isArray);
  if (direct) return direct;
  if (depth > 0) return [];
  for (const key of LIST_KEYS) {
    const nested = listOf(value[key], depth + 1);
    if (nested.length) return nested;
  }
  return [];
}

/** The cases of a fetch_test_cases answer, each with what the report needs. */
export function normalizeCases(value) {
  return listOf(value)
    .map((item) => ({
      id: field(item, 'id') ?? field(item, '_id'),
      name: field(item, 'name') ?? '',
      hasScript: field(item, 'hasScript'),
      lastRunStatus: field(item, 'lastRunStatus') ?? null,
      lastRunOn: field(item, 'lastRunOn') ?? null,
      raw: item,
    }))
    .filter((testCase) => testCase.id);
}

/** The app's base: the host cases run on and the path every route sits under. */
export function appBaseOf(appUrl) {
  if (!appUrl) return { host: null, basePath: '' };
  const url = new URL(appUrl);
  return { host: url.host, basePath: url.pathname.replace(/\/$/u, '') };
}

/** A case's URL as a path of the app, or null when it is another site or a platform screen. */
export function toAppPath(value, app) {
  let text = String(value ?? '').trim();
  const templated = /^(?:<<[^>]+>>|\{\{[^}]+\}\}|\$\{[^}]+\})(\/.*)?$/u.exec(text);
  if (templated) text = templated[1] ?? '/';
  let pathname;
  if (text.startsWith('/')) pathname = text;
  else {
    let url;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (app.host && url.host !== app.host) return null;
    pathname = url.pathname;
  }
  pathname = pathname.split(/[?#]/u)[0];
  if (pathname.includes('/p/0/interfaces/')) return null;
  if (app.basePath && (pathname === app.basePath || pathname.startsWith(`${app.basePath}/`))) pathname = pathname.slice(app.basePath.length);
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // a malformed escape: keep the path as written
  }
  return normalizeRoutePath(pathname);
}

const pageOf = (value) => {
  if (value && typeof value === 'object') return value.id ?? value.pageId ?? value.slug ?? value.path ?? null;
  return typeof value === 'string' ? value : null;
};

/** Element id → the route path its page is, from one or several search_elements answers. */
export function elementPages(value, app) {
  const pages = new Map();
  const visit = (node) => {
    for (const item of listOf(node)) {
      if (listOf(item).length && !field(item, 'id')) {
        visit(item);
        continue;
      }
      const id = field(item, 'id') ?? field(item, '_id');
      const page = pageOf(field(item, 'pageId') ?? field(item, 'page') ?? item?.properties?.pageId);
      const pageUrl = field(item, 'pageUrl');
      const route = page !== null && page !== undefined ? normalizeRoutePath(page) : pageUrl ? toAppPath(pageUrl, app) : null;
      if (id && route) pages.set(String(id), route);
    }
  };
  visit(value);
  return pages;
}

/** Every page a case visits: its navigations, the routes its steps land on, and the pages of the elements it uses. */
export function casePaths(testCase, pages, app) {
  const found = new Set();
  const add = (route) => {
    if (route) found.add(route);
  };
  const walk = (node, key) => {
    const value = parseMaybe(node);
    if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
      return;
    }
    if (typeof value === 'string') {
      if (key === 'navigatesTo' || key === 'pageId') add(normalizeRoutePath(value));
      else if (URL_KEYS.has(key)) add(toAppPath(value, app));
      else if (ELEMENT_KEYS.has(key)) add(pages.get(value) ?? null);
      else if (key === 'script') for (const match of value.matchAll(/\bgoto\(\s*['"`]([^'"`]+)['"`]/gu)) add(toAppPath(match[1], app));
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (NAVIGATE_ACTIONS.has(String(value.action ?? '')) && typeof value.value === 'string') add(toAppPath(value.value, app));
    for (const [childKey, child] of Object.entries(value)) walk(child, childKey);
  };
  walk(testCase.raw, null);
  return found;
}

export function select({ checkout, changed, cases, elements, appUrl }) {
  const graph = buildGraph(checkout);
  const app = appBaseOf(appUrl);
  const changes = normalizeChanges(changed);
  const pathOfRoute = (id) => graph.routes.find((route) => route.id === id)?.path ?? id;
  const effects = changes.map((change) => {
    const effect = effectOf(graph, change);
    return effect.routes ? { ...effect, routePaths: [...new Set(effect.routes.map(pathOfRoute))] } : effect;
  });
  if (!graph.routes.length) {
    for (const effect of effects) {
      if (effect.reason === 'not imported by any page') Object.assign(effect, { effect: 'every page', reason: 'the checkout declares no routes, so no page can be told apart' });
    }
  }
  const everyPage = effects.filter((effect) => effect.effect === 'every page');
  // A PR that changes nothing the app loads cannot change a case, even one whose pages are unknown.
  const reachesApp = effects.some((effect) => effect.effect !== 'none');
  const causes = new Map();
  for (const effect of effects) {
    for (const id of withDescendants(graph, effect.routes ?? [])) causes.set(id, new Set([...(causes.get(id) ?? []), effect.path]));
  }
  const removed = effects.flatMap((effect) => (effect.removedPaths ?? []).map((routePath) => ({ routePath, cause: effect.path })));
  const pages = elementPages(elements, app);
  const selected = [];
  const unmapped = [];
  const cannotRun = [];
  let notSelected = 0;
  for (const testCase of normalizeCases(cases)) {
    const base = { id: testCase.id, name: testCase.name, lastRunStatus: testCase.lastRunStatus, lastRunOn: testCase.lastRunOn };
    if (testCase.hasScript === false) {
      cannotRun.push({ ...base, why: 'no compiled script in Test Studio' });
      continue;
    }
    const visited = [...casePaths(testCase, pages, app)];
    if (everyPage.length) {
      selected.push({ ...base, pages: visited, why: 'every page', because: everyPage.slice(0, CAUSES_SHOWN).map((effect) => effect.path) });
      continue;
    }
    if (!visited.length) {
      if (reachesApp) unmapped.push({ ...base, why: 'its steps name no page of this app' });
      else notSelected += 1;
      continue;
    }
    const hits = new Map();
    for (const visitedPath of visited) {
      const route = routeForPath(graph, visitedPath);
      if (route && causes.has(route.id)) hits.set(route.path, [...(hits.get(route.path) ?? []), ...causes.get(route.id)]);
      for (const gone of removed) if (pathMatches(gone.routePath, visitedPath)) hits.set(`${gone.routePath} (removed)`, [gone.cause]);
    }
    if (hits.size) selected.push({ ...base, pages: [...hits.keys()], why: 'visits a changed page', because: [...new Set([...hits.values()].flat())] });
    else notSelected += 1;
  }
  const routes = [...causes].map(([id, files]) => ({ path: pathOfRoute(id), because: [...files] }));
  return {
    checkout: { appDir: graph.appDir || '.', routers: [...graph.routers.keys()], routes: graph.routes.length },
    changes: effects,
    everyPage: everyPage.map((effect) => ({ path: effect.path, reason: effect.reason })),
    routes,
    removedRoutes: removed.map((gone) => gone.routePath),
    cases: { total: selected.length + unmapped.length + cannotRun.length + notSelected, selected, unmapped, cannotRun, notSelected },
    // What run_test_cases takes: the picked cases and the ones no page could be read from, each once.
    ids: [...new Set([...selected, ...unmapped].map((testCase) => testCase.id))],
  };
}

const cell = (value) => String(value ?? '').replace(/\|/gu, '\\|').replace(/\s*\n\s*/gu, ' ').trim();
const firstLine = (text) => {
  const line = String(text ?? '').split('\n').find((part) => part.trim()) ?? '';
  return line.length > ERROR_CHARS ? `${line.slice(0, ERROR_CHARS - 1)}…` : line;
};
const outcomeOf = (status) => (PASSED.has(status) ? 'passed' : FAILED.has(status) ? 'failed' : status ? 'unsettled' : 'no execution');
const beforeOf = (status) => {
  const upper = String(status ?? '').toUpperCase();
  if (PASSED.has(upper)) return 'passed';
  if (FAILED.has(upper)) return 'failed';
  return 'never run';
};

/** The newest execution of each case, from fetch_run_executions or per-case reads collected into one array. */
export function executionsByCase(value) {
  const rows = [];
  const visit = (node) => {
    for (const item of listOf(node)) {
      if (!columnsOf(item).TEST_CASE_ID && listOf(item).length) visit(item);
      else rows.push(item);
    }
  };
  if (value && !Array.isArray(value) && columnsOf(value).TEST_CASE_ID) rows.push(value);
  else visit(value);
  const byCase = new Map();
  for (const row of rows) {
    const columns = columnsOf(row);
    const id = columns.TEST_CASE_ID;
    if (!id) continue;
    const kept = byCase.get(id);
    if (!kept || Number(columns.START_TIME ?? 0) >= Number(columnsOf(kept).START_TIME ?? 0)) byCase.set(id, row);
  }
  return byCase;
}

export function report({ affected, executions, pr, on, live, run, appUrl, notes = [] }) {
  const byCase = executionsByCase(executions);
  const ran = [...affected.cases.selected, ...affected.cases.unmapped];
  const everyCase = ran.map((testCase) => {
    const row = byCase.get(testCase.id);
    const columns = row ? columnsOf(row) : {};
    const outcome = row ? outcomeOf(String(columns.STATUS ?? '')) : 'no execution';
    const step = row ? failingStepOf(columns) : null;
    return { ...testCase, outcome, host: runHost(columns.DOMAIN), before: beforeOf(testCase.lastRunStatus), executionId: columns.ID ?? null, step, error: row ? firstLine(step?.error || errorTextOf(columns)) : '' };
  });
  // The platform runs a host it does not allow on the app's own one and still answers the run, so a
  // settled case counts for the PR only when its execution's DOMAIN is the preview's host.
  const wanted = executions && on && !live ? runHost(on) : null;
  const settled = (result) => result.outcome !== 'unsettled' && result.outcome !== 'no execution';
  const elsewhere = wanted ? everyCase.filter((result) => settled(result) && result.host && result.host !== wanted) : [];
  const unconfirmed = wanted ? everyCase.filter((result) => settled(result) && !result.host).length : 0;
  const results = everyCase.filter((result) => !elsewhere.includes(result));
  const elsewhereHosts = {};
  for (const result of elsewhere) elsewhereHosts[result.host] = (elsewhereHosts[result.host] ?? 0) + 1;
  const hostList = Object.keys(elsewhereHosts).map((host) => `\`${host}\``).join(', ');
  const count = (outcome) => results.filter((result) => result.outcome === outcome).length;
  const failed = results.filter((result) => result.outcome === 'failed');
  const newReds = failed.filter((result) => result.before === 'passed');
  const title = pr?.title ? `${pr.title}${pr.number ? ` (#${pr.number})` : ''}` : 'a code app change';
  const lines = [`# Tests affected by ${title}`, ''];
  const head = [pr?.url, pr?.headRefOid ? `head \`${String(pr.headRefOid).slice(0, 7)}\`` : null, pr?.headRefName ? `on \`${pr.headRefName}\`` : null].filter(Boolean).join(' · ');
  if (head) lines.push(head, '');
  for (const note of notes) lines.push(`**Note:** ${note}`, '');
  if (live) lines.push('**Ran on the live app, not on the PR’s preview.** These results show which of the cases the PR reaches fail today; they say nothing about the PR’s own code.', '');
  else if (elsewhere.length && elsewhere.length === ran.length) {
    lines.push(`**None of the ${elsewhere.length} cases ran on the preview.** They ran on ${hostList}: the tenant does not run cases on ${wanted}. Nothing below is a result for the PR.`, '');
  } else if (elsewhere.length) {
    lines.push(`**Not every case ran on the preview.** ${elsewhere.length} of ${ran.length} cases ran on ${hostList} instead of ${on}${run ? ` (run \`${run}\`)` : ''}: ${elsewhere.length === 1 ? 'it is' : 'they are'} listed under Ran elsewhere and not counted below.`, '');
  } else if (unconfirmed) {
    lines.push(`Asked to run on ${on}${run ? `, run \`${run}\`` : ''}. The run records do not say which host ${unconfirmed} of ${ran.length} cases ran on, so it is not confirmed that they ran on the preview.`, '');
  } else if (on) lines.push(`Ran on ${on}${run ? `, run \`${run}\`` : ''}.`, '');
  if (elsewhere.length && unconfirmed) lines.push(`The run records do not say which host ${unconfirmed} of ${ran.length} cases ran on.`, '');
  if (!ran.length) {
    const reachesApp = affected.changes.some((change) => change.effect !== 'none');
    lines.push(reachesApp
      ? '**Nothing to run.** No case visits a page this PR reaches.'
      : '**Nothing to run.** This PR changes nothing the app loads, so no case can be affected.', '');
  } else if (!executions) lines.push('**Not run.** The cases below were selected; no run was started.', '');
  const totals = `${ran.length} of ${affected.cases.total} cases selected`;
  lines.push(executions
    ? `**Result:** ${totals} · ${count('passed')} passed · ${failed.length} failed (${newReds.length} new) · ${count('unsettled')} still running · ${count('no execution')} with no execution${elsewhere.length ? ` · ${elsewhere.length} ran elsewhere` : ''}`
    : `**Selection:** ${totals}`, '');
  if (elsewhere.length) {
    lines.push('## Ran elsewhere', '', '| Case | Ran on | Result |', '|---|---|---|');
    for (const result of elsewhere) lines.push(`| ${cell(result.name)} | \`${cell(result.host)}\` | ${result.outcome} |`);
    lines.push('');
  }
  if (executions && failed.length) {
    lines.push('## Failed', '', '| Case | Failing step | Error | Before this run |', '|---|---|---|---|');
    for (const result of failed) {
      const before = result.before === 'passed' ? '**passed: new red**' : result.before === 'failed' ? 'already failing' : 'first run';
      const step = result.step ? `${result.step.position}. ${result.step.title}` : '';
      lines.push(`| ${cell(result.name)} | ${cell(step)} | ${cell(result.error)} | ${before} |`);
    }
    lines.push('');
  }
  const pending = results.filter((result) => result.outcome === 'unsettled' || result.outcome === 'no execution');
  if (executions && pending.length) {
    lines.push('## Not settled', '', '| Case | State | Execution |', '|---|---|---|');
    for (const result of pending) lines.push(`| ${cell(result.name)} | ${result.outcome} | ${cell(result.executionId ?? '')} |`);
    lines.push('');
  }
  if (executions && count('passed')) lines.push('## Passed', '', ...results.filter((result) => result.outcome === 'passed').map((result) => `- ${result.name}`), '');
  if (ran.length) lines.push('## Why these cases', '', '| Case | Pages | Because of |', '|---|---|---|');
  for (const testCase of ran) {
    const pages = testCase.why === 'every page' ? 'every page' : (testCase.pages ?? []).join(', ') || '—';
    const because = testCase.because?.length ? testCase.because.map((file) => `\`${file}\``).join(', ') : testCase.why;
    lines.push(`| ${cell(testCase.name)} | ${cell(pages)} | ${cell(because)} |`);
  }
  lines.push(...(ran.length ? [''] : []), '## Changed files', '', '| File | Reaches | Why |', '|---|---|---|');
  for (const change of affected.changes) {
    const removedNote = change.removedPaths?.length ? `removed ${change.removedPaths.join(', ')}` : null;
    const reaches = change.effect === 'routes' ? [...(change.routePaths ?? []), removedNote].filter(Boolean).join(', ') || 'no route' : change.effect;
    lines.push(`| \`${cell(change.path)}\` | ${cell(reaches)} | ${cell(change.reason)} |`);
  }
  if (affected.routes.length) {
    lines.push('', '## Pages reached', '', '| Route | Because of |', '|---|---|');
    for (const route of affected.routes) lines.push(`| \`${cell(route.path)}\` | ${route.because.map((file) => `\`${cell(file)}\``).join(', ')} |`);
  }
  if (affected.cases.cannotRun.length) {
    lines.push('', '## Not run', '', ...affected.cases.cannotRun.map((testCase) => `- ${testCase.name}: ${testCase.why}`));
  }
  lines.push('', `${affected.cases.notSelected} case(s) visit no page this change reaches and were not run.`);
  if (executions && failed.length && run) lines.push('', '## Next', '', `- Sort the reds by cause: \`/ua:app-test-triage-loop ${run}${appUrl ? ` for ${appUrl}` : ''}\`.`);
  return {
    markdown: `${lines.join('\n')}\n`,
    summary: { selected: ran.length, total: affected.cases.total, counted: results.length, passed: count('passed'), failed: failed.length, newReds: newReds.length, unsettled: pending.length, ranElsewhere: elsewhere.length, unconfirmed, elsewhereHosts },
  };
}

// Flags given more than once keep every value, in order.
const REPEATABLE = new Set(['note']);

function flagsOf(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const name = arg.slice(2);
    const next = argv[index + 1];
    const value = next === undefined || next.startsWith('--') ? true : next;
    if (value !== true) index += 1;
    if (REPEATABLE.has(name)) flags[name] = [...(flags[name] ?? []), value];
    else flags[name] = value;
  }
  return flags;
}

function need(flags, names) {
  for (const name of names) if (typeof flags[name] !== 'string') throw new Error(`--${name} is required`);
}

function write(file, text) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, text);
}

function main(argv) {
  const [command] = argv;
  const flags = flagsOf(argv.slice(1));
  if (command === 'routes') {
    need(flags, ['checkout']);
    const graph = buildGraph(flags.checkout);
    const routes = graph.routes.map((route) => ({ path: route.path, index: route.index, file: route.file, line: route.line, entries: route.entries }));
    process.stdout.write(`${JSON.stringify({ appDir: graph.appDir || '.', routers: [...graph.routers.keys()], routes }, null, 2)}\n`);
  } else if (command === 'select') {
    need(flags, ['checkout', 'changed', 'cases', 'out']);
    if (!fs.existsSync(flags.checkout)) throw new Error(`no checkout at ${flags.checkout}`);
    const result = select({
      checkout: flags.checkout,
      changed: readJsonish(flags.changed),
      cases: readJsonish(flags.cases),
      elements: typeof flags.elements === 'string' ? readJsonish(flags.elements) : null,
      appUrl: typeof flags['app-url'] === 'string' ? flags['app-url'] : null,
    });
    write(flags.out, `${JSON.stringify(result, null, 2)}\n`);
    const { cases } = result;
    process.stdout.write(`${JSON.stringify({ out: flags.out, changed: result.changes.length, everyPage: result.everyPage.length > 0, routes: result.routes.length, selected: cases.selected.length, unmapped: cases.unmapped.length, cannotRun: cases.cannotRun.length, notSelected: cases.notSelected, total: cases.total })}\n`);
  } else if (command === 'report') {
    need(flags, ['affected', 'out']);
    if (!flags.live && typeof flags.on !== 'string' && flags.executions) throw new Error('say where the run ran: --on <link> or --live');
    const result = report({
      affected: JSON.parse(fs.readFileSync(flags.affected, 'utf8')),
      executions: typeof flags.executions === 'string' ? readJsonish(flags.executions) : null,
      pr: typeof flags.pr === 'string' ? readJsonish(flags.pr) : null,
      on: typeof flags.on === 'string' ? flags.on : null,
      live: flags.live === true,
      run: typeof flags.run === 'string' ? flags.run : null,
      appUrl: typeof flags['app-url'] === 'string' ? flags['app-url'] : null,
      notes: (flags.note ?? []).filter((note) => typeof note === 'string'),
    });
    write(flags.out, result.markdown);
    process.stdout.write(`${JSON.stringify({ out: flags.out, ...result.summary })}\n`);
  } else {
    throw new Error('usage: affected.mjs routes|select|report … (see the comment at the top of this file)');
  }
}

const invokedDirectly = (() => {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
