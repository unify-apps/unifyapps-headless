#!/usr/bin/env node
// Turns page configs read through UnifyApps Headless into a navigation graph and the routes to one page.
// Reads files only. Never calls the tenant.
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HELP = `page-routes — build the navigation graph of one app and list routes to a target page.

Usage
  node page-routes.mjs --pages <dir> --nav <file> --target <page> [options]

Inputs
  --pages <dir>     Folder with one JSON file per page. Each file is the --json output of
                    "ua cache events <page> --app-id <app>" or of
                    "ua entity context page <page> --app-id <app>".
  --nav <file>      The --json output of "ua cache nav <app>". Gives the default page
                    and the menu (tab or drawer) pages.
  --paths <file>    Optional. The --json output of "ua cache paths <app>". Gives page
                    names and addresses, and marks pages with no address.
  --target <page>   Target page: id, name or slug.

Options
  --from <ids>      Start pages, comma separated. Default: the default page.
  --max-hops <n>    Longest route to list. Default 8.
  --max-routes <n>  How many routes to list. Default 10.
  --out <file>      Write the JSON here instead of stdout.
  --help            Print this help.

Output (JSON)
  target, starts, pages, edges, incoming, outgoing, plainBacks, dynamic, routes, notes.
  Each edge: from, to, action (navigateToPage | navigateBack | menu), history, pageInputs,
  modal, rowScoped, via (where the event lives and what triggers it).
`;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--help' || key === '-h') { args.help = true; continue; }
    if (!key.startsWith('--')) throw new Error(`Unknown argument ${key}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${key} needs a value`);
    args[key.slice(2)] = value;
    i++;
  }
  return args;
}

const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const isBinding = (v) => typeof v === 'string' && v.includes('{{');

// The same event shape "ua cache events" prints (lib/cache-views.mjs eventView).
const shapeEvent = (event) => ({
  id: event?.id ?? null,
  actionId: asObject(event?.action).id ?? null,
  eventType: event?.eventType ?? null,
  actionType: asObject(event?.action).actionType ?? null,
  conditional: Boolean(asObject(event?.action).runCondition),
  payload: asObject(event?.action).payload ?? null,
});

// Accepts a "cache events --json" view or an "entity context page --json" body.
function normalisePage(doc, file) {
  if (Array.isArray(doc?.chains)) {
    return { pageId: doc.pageId, pageName: null, chains: doc.chains };
  }
  const cache = asObject(doc?.cache);
  if (cache.status && cache.status !== 'hit') return { skipped: `${file}: cache ${cache.status}${cache.reason ? ` (${cache.reason})` : ''}` };
  const page = cache.page;
  if (!page) throw new Error(`${file}: not a cache events or entity context page output`);
  const props = asObject(page.properties);
  const chains = [];
  const pageEvents = asObject(props.interactions).events;
  if (Array.isArray(pageEvents) && pageEvents.length) {
    chains.push({ kind: 'page', id: page.id, name: props.name ?? null, componentType: 'Page', events: pageEvents.map(shapeEvent) });
  }
  for (const block of Object.values(asObject(props.blocks))) {
    if (!Array.isArray(block?.events) || !block.events.length) continue;
    chains.push({ kind: 'block', id: block.id, name: block.displayName ?? null,
      componentType: asObject(block.component).componentType ?? null, events: block.events.map(shapeEvent) });
  }
  for (const [scope, list] of [['page', cache.dataSources ?? []], ['app', cache.appDataSources ?? []]]) {
    for (const source of list) {
      const sp = asObject(source.properties);
      const events = Object.values(asObject(sp.callbacks)).filter(Array.isArray).flat();
      if (events.length) chains.push({ kind: 'data-source', scope, id: source.id, name: sp.name ?? source.name ?? null, componentType: 'DataSource', events: events.map(shapeEvent) });
    }
  }
  return { pageId: page.id, pageName: props.name ?? null, chains };
}

// A row inside a Repeatable is read as b_<repeatable>['context']['item'].
const ROW_SCOPE = /\['context'\]\['item'\]/u;

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(HELP); return; }
  for (const need of ['pages', 'nav', 'target']) if (!args[need]) throw new Error(`--${need} is required. Run with --help.`);
  const maxHops = Number(args['max-hops'] ?? 8);
  const maxRoutes = Number(args['max-routes'] ?? 10);
  const notes = [];

  const files = readdirSync(args.pages).filter((f) => f.endsWith('.json')).map((f) => join(args.pages, f)).filter((f) => statSync(f).isFile());
  if (!files.length) throw new Error(`No .json files in ${args.pages}`);
  const pagesRead = [];
  for (const f of files) {
    const page = normalisePage(readJson(f), f);
    if (page.skipped) notes.push(`Skipped ${page.skipped}. Refresh it and run again.`); else pagesRead.push(page);
  }

  const nav = readJson(args.nav);
  const pathsDoc = args.paths ? readJson(args.paths) : null;

  const pages = {};
  const note = (id, name, path) => {
    pages[id] ??= { name: null, path: undefined };
    if (name && !pages[id].name) pages[id].name = name;
    if (path !== undefined) pages[id].path = path;
  };
  for (const p of pathsDoc?.pages ?? []) note(p.id, p.name, p.path ?? null);
  for (const p of pagesRead) note(p.pageId, p.pageName);
  if (nav?.defaultPage?.id) note(nav.defaultPage.id, nav.defaultPage.name);
  for (const item of nav?.primary ?? []) if (item.pageId) note(item.pageId, item.pageName);

  const resolve = (ref) => {
    if (pages[ref]) return ref;
    const lower = String(ref).toLowerCase();
    const hits = Object.entries(pages).filter(([, p]) => (p.name ?? '').toLowerCase() === lower || (p.path ?? '').toLowerCase().endsWith(`/${lower}`));
    if (hits.length === 1) return hits[0][0];
    if (hits.length > 1) throw new Error(`"${ref}" matches ${hits.length} pages: ${hits.map(([id]) => id).join(', ')}`);
    throw new Error(`No page "${ref}" in the inputs.`);
  };
  const targetId = resolve(args.target);
  const starts = args.from ? args.from.split(',').map((s) => resolve(s.trim())) : [nav?.defaultPage?.id].filter(Boolean);
  if (!starts.length) throw new Error('No start page: the nav file has no defaultPage. Pass --from.');

  // Who triggers each data source, per page: controlDataSource actions name it in payload.dataSourceId.
  const triggers = new Map();
  for (const p of pagesRead) {
    for (const chain of p.chains) {
      for (const e of chain.events) {
        const dsId = asObject(e.payload).dataSourceId;
        if (e.actionType !== 'controlDataSource' || !dsId) continue;
        const list = triggers.get(dsId) ?? [];
        list.push({ pageId: p.pageId, kind: chain.kind, id: chain.id, name: chain.name, eventType: e.eventType, method: asObject(e.payload).method ?? null });
        triggers.set(dsId, list);
      }
    }
  }

  const edges = [];
  const plainBacks = [];
  const dynamic = [];
  const seenAppSource = new Set();

  const sourcePagesOf = (chain, pageId) => {
    if (chain.kind !== 'data-source' || chain.scope !== 'app') return [pageId];
    // An app data source shows up in every page's events. Its real source pages are the ones that trigger it.
    const found = [...new Set((triggers.get(chain.id) ?? []).map((t) => t.pageId))];
    return found;
  };

  for (const p of pagesRead) {
    for (const chain of p.chains) {
      for (const e of chain.events) {
        if (!['navigateToPage', 'navigateBack', 'navigate'].includes(e.actionType)) continue;
        if (chain.kind === 'data-source' && chain.scope === 'app') {
          const key = `${chain.id}:${e.id}`;
          if (seenAppSource.has(key)) continue;
          seenAppSource.add(key);
        }
        const payload = asObject(e.payload);
        const via = {
          kind: chain.kind, scope: chain.scope ?? null, id: chain.id, name: chain.name, componentType: chain.componentType,
          eventType: e.eventType, eventId: e.id, actionId: e.actionId, conditional: e.conditional,
          triggeredBy: chain.kind === 'data-source' ? (triggers.get(chain.id) ?? []) : undefined,
        };
        const froms = sourcePagesOf(chain, p.pageId);
        if (!froms.length) {
          dynamic.push({ from: null, action: e.actionType, reason: 'app data source that no read page triggers', payload, via });
          continue;
        }
        for (const from of froms) {
          if (e.actionType === 'navigate') {
            dynamic.push({ from, action: 'navigate', reason: 'address path, not a page id', path: payload.path ?? null, history: payload.history ?? null, via });
            continue;
          }
          if (e.actionType === 'navigateBack') {
            // Both the flag and a pageId are needed; either alone is a plain back (app-native rule 16).
            if (payload.navigateToSpecificPage === true && payload.pageId && !isBinding(payload.pageId)) {
              edges.push({ from, to: payload.pageId, action: 'navigateBack', history: 'back', pageInputs: payload.pageInputs ?? {}, modal: false, rowScoped: ROW_SCOPE.test(JSON.stringify(payload.pageInputs ?? {})), via });
            } else {
              plainBacks.push({ pageId: from, via });
            }
            continue;
          }
          if (!payload.pageId || isBinding(payload.pageId)) {
            dynamic.push({ from, action: 'navigateToPage', reason: 'page id is missing or a binding', pageId: payload.pageId ?? null, via });
            continue;
          }
          edges.push({
            from, to: payload.pageId, action: 'navigateToPage', history: payload.history ?? null,
            pageInputs: payload.pageInputs ?? {}, pageParams: payload.pageParams ?? undefined,
            modal: payload.overridePageAnimation === true ? (payload.pageTransitionBehavior ?? 'override') : false,
            rowScoped: ROW_SCOPE.test(JSON.stringify(payload.pageInputs ?? {})), via,
          });
        }
      }
    }
  }

  // Menu pages are reachable from the default page through the tab bar or drawer.
  const phone = (nav?.devices ?? []).find((d) => d.device === 'SM');
  for (const item of nav?.primary ?? []) {
    if (item.type !== 'PAGE' || !item.pageId) continue;
    for (const start of starts) {
      if (start === item.pageId) continue;
      edges.push({ from: start, to: item.pageId, action: 'menu', history: null, pageInputs: {}, modal: false, rowScoped: false,
        via: { kind: 'menu', id: item.id, name: item.name, eventType: 'tap', navigator: phone?.navigator ?? null } });
    }
  }

  for (const e of edges) { note(e.from); note(e.to); }
  const readIds = new Set(pagesRead.map((p) => p.pageId));
  const notRead = [...new Set(edges.map((e) => e.to))].filter((id) => !readIds.has(id));
  if (notRead.length) notes.push(`${notRead.length} target pages were not in --pages, so their own exits are missing: ${notRead.join(', ')}`);
  if (pages[targetId]?.path === null) notes.push('The target page has no address. navigateToPage does nothing for a page with no address (app-native rule 11).');
  if (!readIds.has(targetId)) notes.push('The target page itself was not in --pages, so its exits (outgoing, plainBacks) are missing.');

  // Rank: an edge a person can take with one plain tap first.
  const edgeRank = (e) => (e.action === 'menu' ? 0 : 1) + (e.via.conditional ? 2 : 0) + (e.rowScoped ? 1 : 0) + (e.via.kind === 'data-source' ? 1 : 0) + (e.action === 'navigateBack' ? 3 : 0);
  const byFrom = new Map();
  for (const [i, e] of edges.entries()) {
    const key = `${e.from}>${e.to}`;
    const group = byFrom.get(e.from) ?? new Map();
    const list = group.get(key) ?? [];
    list.push(i);
    group.set(key, list);
    byFrom.set(e.from, group);
  }
  for (const group of byFrom.values()) for (const list of group.values()) list.sort((a, b) => edgeRank(edges[a]) - edgeRank(edges[b]));

  // Breadth first over pages; a page may be reached a few times, so the shortest simple routes come out first.
  // Then the easiest of them win: fewer hops, then plain taps over conditions, row taps and data source callbacks.
  const found = [];
  const pool = maxRoutes * 5;
  const reached = new Map();
  const queue = starts.map((s) => ({ pages: [s], hops: [] }));
  while (queue.length && found.length < pool) {
    const cur = queue.shift();
    const at = cur.pages[cur.pages.length - 1];
    if (at === targetId && cur.hops.length) { found.push(cur); continue; }
    if (cur.hops.length >= maxHops) continue;
    const count = (reached.get(at) ?? 0) + 1;
    reached.set(at, count);
    if (count > pool) continue;
    for (const list of (byFrom.get(at) ?? new Map()).values()) {
      const to = edges[list[0]].to;
      if (cur.pages.includes(to)) continue;
      queue.push({ pages: [...cur.pages, to], hops: [...cur.hops, list] });
    }
  }
  const cost = (r) => r.hops.reduce((sum, list) => sum + edgeRank(edges[list[0]]), 0);
  const routes = found.sort((a, b) => a.hops.length - b.hops.length || cost(a) - cost(b)).slice(0, maxRoutes);
  if (starts.includes(targetId)) notes.push('The target is a start page. Open it directly; no hop is needed.');
  if (!routes.length && !starts.includes(targetId)) notes.push(`No route within ${maxHops} hops. Check "incoming" and "dynamic" for ways in the graph cannot follow.`);

  const label = (id) => pages[id]?.name ?? id;
  const out = {
    target: { id: targetId, name: label(targetId), path: pages[targetId]?.path ?? null },
    starts: starts.map((id) => ({ id, name: label(id) })),
    pages,
    edges: edges.map((e, i) => ({ index: i, ...e })),
    incoming: edges.flatMap((e, i) => (e.to === targetId ? [i] : [])),
    outgoing: edges.flatMap((e, i) => (e.from === targetId ? [i] : [])),
    plainBacks: plainBacks.filter((b) => b.pageId === targetId),
    dynamic,
    routes: routes.map((r) => ({
      pages: r.pages.map((id) => ({ id, name: label(id) })),
      hops: r.hops.map((list) => ({ use: list[0], alternatives: list.slice(1), from: label(edges[list[0]].from), to: label(edges[list[0]].to) })),
    })),
    notes,
  };
  const text = JSON.stringify(out, null, 2);
  if (args.out) writeFileSync(args.out, text); else process.stdout.write(`${text}\n`);
}

try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
