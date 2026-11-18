// Turns one cached app into the object every rule reads: the app record and where each page is
// served, and for each page its stored record, its walked blocks and its data sources. The blocks
// are walked by app-page-quality's walkPage, the same walk its page audit uses.
import { walkPage } from '../../app-page-quality/scripts/walk.mjs';
import { pagePaths } from '../../../scripts/lib/cache-views.mjs';
import { readCachedAppContext, readCachedPageContext } from '../../../scripts/workspace/entity-cache.mjs';

export const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asObject = value => (isPlainObject(value) ? value : {});

/**
 * 'hidden' for the boolean false the runtime hides on (`value !== false` shows), 'conditional' for
 * `value: 'conditions'`, 'shown' otherwise: a leftover `conditions` beside `value: true` is inert.
 */
export function visibilityOf(visibility) {
  if (visibility?.value === false) return 'hidden';
  if (visibility?.value === 'conditions') return 'conditional';
  return 'shown';
}

/** `pageModel(page, { dataSources, appDataSources, slug }) → PageModel`; `slug` is the one the app record serves. */
export function pageModel(page, { dataSources = [], appDataSources = [], slug = null } = {}) {
  const properties = asObject(page?.properties);
  const walk = walkPage(page);
  const variables = asObject(properties.pageVariables);
  const functions = asObject(properties.pageFunctions);
  return {
    id: page.id,
    name: properties.name ?? page.id,
    slug,
    global: String(page.id).startsWith('e_global_'),
    record: page,
    blocks: asObject(properties.blocks),
    walk,
    dataSources,
    appDataSources,
    variables,
    functions,
    // Page handlers live under interactions.events; properties.events is a module's declared events.
    events: Array.isArray(asObject(properties.interactions).events) ? properties.interactions.events : [],
    counts: {
      blocks: walk.order.length,
      dataSources: dataSources.length,
      variables: Object.keys(variables).length,
      functions: Object.keys(functions).length,
    },
  };
}

/**
 * Where each page is served, as `cache paths` reads it. An app with no `paths` tree serves every
 * slug at the top level (the platform's legacy flat mode), so it is read as one root.
 */
function pageAddresses(appInterface) {
  const properties = asObject(appInterface?.properties);
  const ids = Object.keys({ ...asObject(properties.interfacePageIdVsSlugMap), ...asObject(properties.entityDetailsMap) });
  const paths = properties.paths || { f_root: { id: 'f_root', path: '/', children: ids } };
  return pagePaths({ interface: { ...appInterface, properties: { ...properties, paths } } }, { interfaceId: appInterface?.id ?? null });
}

/** `appModel(appInterface, pages) → AppModel`, where `pages` is `[{ page, dataSources, appDataSources }]`. */
export function appModel(appInterface, pages) {
  const properties = asObject(appInterface?.properties);
  const addresses = pageAddresses(appInterface);
  const slugs = new Map([...addresses.pages, ...addresses.unplaced].map(entry => [entry.id, entry.slug]));
  const models = [];
  const skipped = [];
  for (const entry of pages) {
    try {
      models.push(pageModel(entry.page, { ...entry, slug: slugs.get(entry.page?.id) ?? null }));
    } catch (error) {
      skipped.push({ pageId: entry.page?.id ?? null, reason: error.message });
    }
  }
  return {
    id: appInterface?.id ?? null,
    name: properties.name ?? appInterface?.id ?? null,
    type: asObject(properties.manifest).type ?? 'WEB',
    record: appInterface,
    pagePaths: addresses,
    pages: models,
    skipped,
  };
}

/**
 * Reads the app, or only `pageIds`, from the solution folder's cache. A stale or missing page
 * is skipped with its reason, never read old: the caller refreshes the cache and runs again.
 */
export function readApp(home, appId, { pageIds = null } = {}) {
  const context = readCachedAppContext(home, appId);
  if (context.status !== 'hit') throw new Error(`The app ${appId} is not cached (${context.status}: ${context.reason}). Run \`solution refresh --json\` and run again.`);
  const wanted = pageIds ? new Set(pageIds) : null;
  const pages = [];
  const skipped = [];
  for (const entry of context.pages) {
    if (wanted && !wanted.has(entry.pageId)) continue;
    const page = readCachedPageContext(home, appId, entry.pageId);
    if (page.status === 'hit') pages.push(page);
    else skipped.push({ pageId: entry.pageId, reason: `${page.status}: ${page.reason}` });
  }
  if (wanted) for (const id of wanted) if (!context.pages.some(entry => entry.pageId === id)) skipped.push({ pageId: id, reason: 'not a page of this app' });
  const model = appModel(context.interface, pages);
  model.skipped.push(...skipped);
  return model;
}
