// Impact analysis: which pages a change reaches, from the UnifyApps Headless cache (`loops impact`).
//
// Pages share modules (a Module block holds `content.moduleId`) and card pages (a page
// another page renders inside itself). A change to one of them reaches every page that
// embeds it, and the pages that embed those, and so on. Two cache reads:
//   cache app <app> --json                                   the pages of the app
//   cache grep '^(moduleId|<page ids>)$' --app-id <app> --json   every block value that names one of
//                                                            those ids, or sits under a moduleId key
// A reference under events or actions is navigation (a tap opens that page), not an embed:
// it is reported, but it does not spread a change. With --template the grep also matches
// `templateComponentId`, so a template-component instance is an embed.
//
// A WEB app also has an app shell every page shows: the menu (side or top bar, with its items,
// groups and default page), the module that draws the bar at a screen size, and header, footer
// and template modules several pages embed. For a WEB app (cache app type WEB) impact also reads
//   cache nav <app> --json      the menu, the page or module each item opens, each size's bar
//   cache paths <app> --json    every page's path, its `:param` parts, public pages
// and the grep always matches `templateComponentId`.
// The menu shows on every routed page (a page with a path; not the global page, a module or a
// template), so a change to it, to one of its items or to the module that draws the bar reaches
// all of them. Those, and a module or template more than one page embeds, are the `app shell`
// job. A MOBILE app is read exactly as before: two calls, the same answer.
import { ua } from './blocks.mjs';
import { LoopsError, EXIT, failed, missing, plural, usage } from './output.mjs';

const ID = /^e_[A-Za-z0-9_]+$/u;
// A template component is an interface of its own; its id is not always an e_ id.
const TEMPLATE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,}$/u;
const NAV_PATH = /(^|[.[\]])(events|actions|onClick|onPress|onTap|navigate\w*|navigation|navigator\w*)([.[\]]|$)/iu;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const SHELL = 'app shell';
const NOT_ROUTED = new Set(['MODULE', 'TEMPLATE_COMPONENT']);

/** Pure: grep hits → edges { from (embedding page), to (embedded id), via, at, nav }. */
export function edgesFromHits(hits, knownIds) {
  const edges = [];
  const seen = new Set();
  for (const hit of hits ?? []) {
    const to = String(hit.value ?? '').trim();
    const viaTemplateKey = /(^|\.)templateComponentId$/u.test(hit.at ?? '');
    if (!(ID.test(to) || (viaTemplateKey && TEMPLATE_ID.test(to))) || !hit.pageId || to === hit.pageId) continue;
    const viaModuleKey = /(^|\.)moduleId$/u.test(hit.at ?? '');
    if (!viaModuleKey && !viaTemplateKey && !knownIds.has(to)) continue;
    const nav = NAV_PATH.test(hit.at ?? '');
    const via = viaTemplateKey ? 'template' : viaModuleKey || hit.componentType === 'Module' ? 'module' : nav ? 'navigation' : 'embed';
    const key = `${hit.pageId}>${to}>${via}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from: hit.pageId, to, via, nav, block: hit.blockId ?? hit.dataSourceId ?? null, at: hit.at ?? null });
  }
  return edges;
}

/**
 * Pure: the dependency view.
 * pages: [{ id, name }]; edges from edgesFromHits; target: { id, kind } or null.
 */
export function dependencyView({ appId, pages, edges, target = null, stale = [] }) {
  const names = new Map(pages.map((page) => [page.id, page.name ?? null]));
  const embeds = edges.filter((edge) => !edge.nav);
  const usedBy = new Map();
  for (const edge of embeds) {
    if (!usedBy.has(edge.to)) usedBy.set(edge.to, new Set());
    usedBy.get(edge.to).add(edge.from);
  }
  const kindOf = (id) => (embeds.some((edge) => edge.to === id && edge.via === 'template') ? 'template'
    : embeds.some((edge) => edge.to === id && edge.via === 'module') || /^e_module/u.test(id) ? 'module' : usedBy.has(id) ? 'card' : 'page');
  const shared = [...usedBy.entries()]
    .map(([id, users]) => ({ id, name: names.get(id) ?? null, kind: kindOf(id), usedBy: [...users].sort(), shared: users.size > 1 }))
    .sort((left, right) => right.usedBy.length - left.usedBy.length || left.id.localeCompare(right.id));
  const navigation = edges.filter((edge) => edge.nav).length;
  const view = { appId, pages: pages.length, shared, navigationLinks: navigation, stale };
  if (!target) return view;
  // Everything that embeds the target, directly or through another embed.
  const affected = new Map([[target.id, { id: target.id, name: names.get(target.id) ?? null, why: 'the change itself', depth: 0 }]]);
  const queue = [target.id];
  while (queue.length) {
    const current = queue.shift();
    for (const user of [...(usedBy.get(current) ?? [])].sort()) {
      if (affected.has(user)) continue;
      affected.set(user, { id: user, name: names.get(user) ?? null, why: `embeds ${names.get(current) ?? current} [${current}]`, depth: affected.get(current).depth + 1 });
      queue.push(user);
    }
  }
  const list = [...affected.values()].sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id));
  return { ...view, target: { id: target.id, kind: target.kind ?? kindOf(target.id), name: names.get(target.id) ?? null }, affected: list, retest: list.filter((item) => item.depth > 0).map((item) => item.id) };
}

/** Pure: the `:param` parts of a page path, by name (`/orders/:orderId` → ['orderId']). */
export const pathParams = (pagePath) => [...String(pagePath ?? '').matchAll(/:([A-Za-z0-9_]+)/gu)].map((match) => match[1]);

/** Pure: every menu item, groups opened up, with the list and group it sits in and what it opens. */
export function flattenMenu(nav) {
  const items = [];
  const visit = (entry, list, group) => {
    const opens = entry.pageId ? { kind: 'page', id: entry.pageId, name: entry.pageName ?? null }
      : entry.moduleId ? { kind: 'module', id: entry.moduleId, slug: entry.slug ?? null }
        : entry.url ? { kind: 'url', url: entry.url } : null;
    items.push({ id: entry.id ?? null, name: entry.name ?? null, type: entry.type ?? null, list, group: group ? { id: group.id ?? null, name: group.name ?? null } : null, opens });
    for (const child of entry.items ?? []) visit(child, list, entry);
  };
  for (const list of ['primary', 'secondary']) for (const entry of nav?.[list] ?? []) visit(entry, list, null);
  return items;
}

/** Pure: "start at XL, LG; top at SM" from the bar of each screen size; null when the cache names none. */
export function barPlaces(devices) {
  const byPosition = new Map();
  for (const device of devices ?? []) {
    if (!device?.device || /^none$/iu.test(device.navigator ?? '')) continue;
    const position = device.position ?? 'default place';
    byPosition.set(position, [...(byPosition.get(position) ?? []), device.device]);
  }
  return byPosition.size ? [...byPosition].map(([position, sizes]) => `${position} at ${sizes.join(', ')}`).join('; ') : null;
}

/** Pure: the modules that draw the bar, with the sizes each draws. */
export function navigatorModules(devices) {
  const modules = new Map();
  for (const device of devices ?? []) {
    if (!device?.moduleId) continue;
    if (!modules.has(device.moduleId)) modules.set(device.moduleId, []);
    modules.get(device.moduleId).push(device.device);
  }
  return [...modules].map(([id, sizes]) => ({ id, sizes }));
}

/**
 * Pure: the WEB view, on top of dependencyView: paths, the menu, the app shell, the job,
 * and the targets only a WEB app has (the menu, one menu item, the module that draws the bar).
 * nav: the `cache nav` view or null; paths: the `cache paths` view or null.
 */
export function webDependencyView({ appId, pages, edges, nav = null, paths = null, target = null, stale = [] }) {
  const names = new Map(pages.map((page) => [page.id, page.name ?? null]));
  const base = dependencyView({ appId, pages, edges, target: target && ['nav', 'nav-item'].includes(target.kind) ? null : target, stale });
  const embedded = new Set(base.shared.filter((item) => item.kind === 'module' || item.kind === 'template').map((item) => item.id));
  const bar = navigatorModules(nav?.devices);
  const barIds = new Set(bar.map((item) => item.id));
  const pathList = (paths?.pages ?? [])
    .filter((page) => !page.global && page.path)
    .map((page) => ({ id: page.id, name: page.name ?? names.get(page.id) ?? null, path: page.path, params: pathParams(page.path), isPublic: page.isPublic === true, ...(page.type && page.type !== 'PAGE' ? { type: page.type } : {}) }));
  const routed = pathList.filter((page) => !NOT_ROUTED.has(page.type) && !embedded.has(page.id) && !barIds.has(page.id)).map((page) => page.id).sort();
  const places = barPlaces(nav?.devices);
  const menuWhy = `shows the app menu${places ? ` (${places})` : ''}`;
  const items = flattenMenu(nav).map((item) => (item.opens?.id && item.opens.name == null ? { ...item, opens: { ...item.opens, name: names.get(item.opens.id) ?? null } } : item));
  const navigation = nav ? { defaultPage: nav.defaultPage ?? null, items, bar: (nav.devices ?? []).map((device) => ({ device: device.device, navigator: device.navigator ?? null, position: device.position ?? null, moduleId: device.moduleId ?? null })), navigatorModules: bar.map((item) => ({ ...item, name: names.get(item.id) ?? null })) } : null;

  // The bar's module shows on every routed page: it is shared by all of them, so `issues split --impact` gives it a job.
  const shared = base.shared.map((item) => ({ ...item, job: (item.kind === 'module' || item.kind === 'template') && item.shared ? SHELL : item.kind }));
  for (const module of bar) {
    const existing = shared.find((item) => item.id === module.id);
    const users = [...new Set([...(existing?.usedBy ?? []), ...routed])].sort();
    const entry = { id: module.id, name: names.get(module.id) ?? null, kind: 'navigator', usedBy: users, shared: users.length > 1, sizes: module.sizes, job: SHELL };
    if (existing) Object.assign(existing, entry);
    else shared.push(entry);
  }
  shared.sort((left, right) => right.usedBy.length - left.usedBy.length || left.id.localeCompare(right.id));

  const appShell = [];
  if (items.length) appShell.push({ id: 'navigation', kind: 'menu', name: 'App menu', usedBy: routed, why: `${plural(items.length, 'menu item')}; ${menuWhy} on ${plural(routed.length, 'routed page')}`, job: SHELL });
  for (const module of bar) appShell.push({ id: module.id, kind: 'navigator', name: names.get(module.id) ?? null, sizes: module.sizes, usedBy: routed, why: `draws the app's menu bar at ${module.sizes.join(', ')}`, job: SHELL });
  for (const item of shared.filter((entry) => entry.job === SHELL && entry.kind !== 'navigator')) {
    appShell.push({ id: item.id, kind: item.kind, name: item.name, usedBy: item.usedBy, why: `embedded by ${plural(item.usedBy.length, 'page')}`, job: SHELL });
  }

  const view = { ...base, platform: 'WEB', shared, paths: pathList, routed, navigation, appShell };
  if (!target) return view;

  const reachMenu = (affected, why, depth) => {
    for (const id of routed) if (!affected.has(id)) affected.set(id, { id, name: names.get(id) ?? null, why, depth });
  };
  const finish = (affected, targetInfo, job) => {
    const list = [...affected.values()].sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id));
    return { ...view, target: targetInfo, affected: list, retest: list.filter((item) => item.depth > 0).map((item) => item.id), job };
  };
  if (target.kind === 'nav') {
    if (!nav) throw missing(`the menu of app ${appId} is not in the cache; run solution refresh, then impact again`);
    const affected = new Map([['navigation', { id: 'navigation', name: 'App menu', why: 'the change itself', depth: 0 }]]);
    reachMenu(affected, menuWhy, 1);
    return finish(affected, { id: 'navigation', kind: 'nav', name: 'App menu' }, SHELL);
  }
  if (target.kind === 'nav-item') {
    const item = items.find((entry) => entry.id === target.id);
    if (!item) throw missing(`menu item ${target.id} is not in the cached menu of app ${appId} (items: ${items.map((entry) => entry.id).join(', ') || 'none'}); run solution refresh, then impact again`);
    const affected = new Map([[item.id, { id: item.id, name: item.name, why: 'the change itself', depth: 0 }]]);
    const children = items.filter((entry) => entry.group?.id === item.id);
    for (const opened of [item, ...children].map((entry) => [entry, entry.opens]).filter(([, opens]) => opens && opens.kind !== 'url')) {
      const [entry, opens] = opened;
      if (!affected.has(opens.id)) affected.set(opens.id, { id: opens.id, name: names.get(opens.id) ?? opens.name ?? null, why: `opened by menu item ${entry.name ?? entry.id}`, depth: 1 });
    }
    reachMenu(affected, menuWhy, 1);
    return finish(affected, { id: item.id, kind: 'nav-item', name: item.name }, SHELL);
  }
  const affected = new Map(base.affected.map((entry) => [entry.id, entry]));
  const drawn = bar.find((module) => module.id === target.id);
  if (drawn) reachMenu(affected, `the app's menu bar is drawn by ${names.get(drawn.id) ?? drawn.id} at ${drawn.sizes.join(', ')}`, 1);
  const own = shared.find((entry) => entry.id === target.id);
  const job = drawn ? SHELL : own?.job ?? base.target.kind;
  return finish(affected, drawn ? { ...base.target, kind: 'navigator' } : base.target, job);
}

export function renderImpact(view) {
  const label = (id, name) => `${name ?? '(not cached)'} [${id}]`;
  const lines = [];
  if (view.target) {
    lines.push(`A change to ${view.target.kind} ${label(view.target.id, view.target.name)} reaches ${plural(view.affected.length, 'page')}${view.job ? ` (job: ${view.job})` : ''}:`);
    for (const item of view.affected) lines.push(`  ${label(item.id, item.name)} — ${item.why}`);
  } else {
    const sharedOnes = view.shared.filter((item) => item.shared);
    lines.push(`${view.pages} cached pages; ${plural(sharedOnes.length, 'module or card page', 'modules and card pages')} used by more than one page:`);
    for (const item of sharedOnes) lines.push(`  ${item.kind} ${label(item.id, item.name)} — used by ${item.usedBy.length}: ${item.usedBy.join(', ')}`);
    const single = view.shared.filter((item) => !item.shared);
    if (single.length) lines.push(`${plural(single.length, 'other embed')} used by one page each.`);
  }
  if (view.platform === 'WEB' && !view.target) {
    if (view.appShell.length) {
      lines.push(`App shell (its own job; a change reaches many pages): ${view.appShell.length}`);
      for (const item of view.appShell) lines.push(`  ${item.kind} ${label(item.id, item.name)} — ${item.why}`);
    }
    if (view.navigation) {
      lines.push(`Menu: ${plural(view.navigation.items.length, 'item')}; default page ${view.navigation.defaultPage ? label(view.navigation.defaultPage.id ?? view.navigation.defaultPage.path, view.navigation.defaultPage.name) : '—'}`);
      for (const item of view.navigation.items) {
        const opens = item.opens ? (item.opens.kind === 'url' ? ` -> ${item.opens.url}` : ` -> ${item.opens.kind} ${label(item.opens.id, item.opens.name ?? null)}`) : '';
        lines.push(`  ${item.list}${item.group ? ` / ${item.group.name ?? item.group.id}` : ''}: ${item.type ?? '?'} ${item.name ?? '(unnamed)'} [${item.id}]${opens}`);
      }
    }
    if (view.paths.length) {
      lines.push(`Paths: ${plural(view.paths.length, 'page')}, ${plural(view.routed.length, 'routed page')} show the menu`);
      for (const page of view.paths) lines.push(`  ${page.path} — ${label(page.id, page.name)}${page.params.length ? ` params ${page.params.join(', ')}` : ''}${page.isPublic ? ' public' : ''}${page.type ? ` ${page.type}` : ''}`);
    }
  }
  if (view.navigationLinks) lines.push(`${plural(view.navigationLinks, 'navigation link')} seen (they do not spread a change).`);
  if (view.stale.length) lines.push(`Not scanned (stale or not cached; run solution refresh, then impact again): ${view.stale.join(', ')}`);
  return lines.join('\n');
}

export function cliFailure(result, what) {
  const error = result.json?.error;
  const code = error?.code ?? null;
  const message = error?.message ?? (result.message || `exit ${result.status}`);
  if (code === 'NOT_STARTED' || code === 'NO_SOLUTION') return missing(`${what}: this folder is not a set-up UnifyApps Headless solution (${message})`);
  return new LoopsError(`${what} failed: ${message}`, { exit: code === 'USAGE' ? EXIT.MISSING : EXIT.FAIL, code: code ?? 'UA_FAILED' });
}

const WEB_ONLY = new Set(['nav', 'nav-item']);

export function computeImpact({ appId, target = null, solution, session }) {
  if (!appId) throw usage('impact needs the app id: impact <app-id> [--page|--module|--card|--template <id> | --nav | --nav-item <id>]');
  const app = ua(['cache', 'app', appId], { cwd: solution, session });
  if (app.status !== 0 || app.json?.error) throw cliFailure(app, `cache app ${appId}`);
  if (!Array.isArray(app.json?.pages)) {
    throw missing(`app ${appId} is not in the cache (${app.message || app.json?.cache?.status || 'miss'}); run solution refresh, then impact again`);
  }
  const resolvedApp = app.json.app?.id ?? appId;
  const web = String(app.json.app?.type ?? '').trim().toUpperCase() === 'WEB';
  const pages = app.json.pages.map((page) => ({ id: page.id, name: page.name ?? null, status: page.status }));
  const ids = new Set(pages.map((page) => page.id));
  if (target && WEB_ONLY.has(target.kind) && !web) throw usage(`--${target.kind} reads a WEB app's menu; app ${resolvedApp} is ${app.json.app?.type ?? 'not typed'}`);
  if (target && target.kind === 'template' && !TEMPLATE_ID.test(target.id)) throw usage(`--template takes a template component id, got ${target.id}`);
  if (target && !WEB_ONLY.has(target.kind) && target.kind !== 'template' && !ID.test(target.id)) throw usage(`--${target.kind} takes an id (e_…), got ${target.id}`);
  if (target && !WEB_ONLY.has(target.kind)) ids.add(target.id);
  const keys = web || target?.kind === 'template' ? 'moduleId|templateComponentId' : 'moduleId';
  const pattern = `^(${keys}|${[...ids].sort().map(escapeRegex).join('|')})$`;
  const grep = ua(['cache', 'grep', pattern, '--app-id', resolvedApp, '--limit', '1000000'], { cwd: solution, session });
  if (grep.status !== 0 || grep.json?.error) throw cliFailure(grep, 'cache grep');
  if (!Array.isArray(grep.json?.hits)) throw failed('cache grep gave no hits list');
  const stale = [...new Set([...(grep.json.scanned?.stale ?? []), ...pages.filter((page) => page.status && page.status !== 'hit').map((page) => `${page.id} (${page.status})`)])].sort();
  const edges = edgesFromHits(grep.json.hits, ids);
  if (!web) {
    const view = dependencyView({ appId: resolvedApp, pages, edges, target, stale });
    return { data: { ...view, edges }, text: renderImpact(view) };
  }
  const read = (command) => {
    const result = ua(['cache', command, resolvedApp], { cwd: solution, session });
    if (result.status !== 0 || result.json?.error) throw cliFailure(result, `cache ${command} ${resolvedApp}`);
    const ok = command === 'nav' ? Array.isArray(result.json?.primary) : Array.isArray(result.json?.pages);
    if (!ok) stale.push(`${command === 'nav' ? 'the menu' : 'the page paths'} (${result.json?.cache?.status ?? 'not cached'})`);
    return ok ? result.json : null;
  };
  const nav = read('nav');
  const paths = read('paths');
  const view = webDependencyView({ appId: resolvedApp, pages, edges, nav, paths, target, stale: stale.sort() });
  return { data: { ...view, edges }, text: renderImpact(view) };
}
