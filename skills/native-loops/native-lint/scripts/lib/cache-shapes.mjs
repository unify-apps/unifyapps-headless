// The UnifyApps Headless cache views page-lint and drift read, and the two ways to get them: the UnifyApps Headless
// CLI (`cache <view> … --json`) or a folder of saved view files (`--from`, what the tests use).
// Shapes are those of this plugin's scripts/lib/cache-views.mjs (the function named on each line) and
// scripts/cmd/cache.mjs; `--json` prints the view itself, a miss or stale read prints
// { cache: { status, reason } }. The block runs UnifyApps Headless's own CLI from the plugin it ships in.
//   outline  pageOutline     { pageId, version, validatedAt, total, shown, nodes:[{ id, level, componentType, displayName, parentId, dataSourceIds, hidden }] }
//   blocks   findBlocks      { pageId, version, matched, shown, notFound, blocks:[<stored block>] }   (needs --match '.*' --limit N for a whole page)
//   ds       dataSourceView  { pageId, dataSources:[{ id, name, scope, type, automationId, parameters:[names], dependsOn, callbacks, consumers, bindings?, source? }] }
//            bindings and source come only with --id/--name (one call per source for H1)
//            consumers are the blocks, page functions and page variables whose stored config names the source (componentType PageFunction / PageVariable for the last two)
//   events   eventView       { pageId, version, chains:[{ kind:'page'|'block'|'data-source', id, name, componentType, events:[{ id, actionId, eventType, actionType, target, conditional, payload }] }] }
//   keys     contextKeys     { pageId, version, variables:[{ id, name, type, initialValue?, binding }], functions:[…], dataSources:[…], formFields:[…] }
//   page     pageSummary     { page:{ id, name, slug, componentType, version, validatedAt, blocks }, componentTypes, variables, layoutSlots, dataSources, appDataSources }
//   nav      appNavigation   { app:{ id, name, version }, defaultPage, primary:[{ id, name, type, pageId }], secondary, devices:[{ device, navigator, position, moduleId }] }
//   paths    pagePaths       { app, folders, pages:[{ id, name, slug, path, isPublic, global }], unplaced, duplicates }
//   entity   `entity context page <id> --app-id <app> --json` → { cache:{ status, page:{ id, version, properties:{ statusBar, folders, pageVariables, pageFunctions, inputSchema, interactions, blocks } }, dataSources, appDataSources, appInterface } }
//            (an older tenant's saved fixture may still hold this record under the name interface)
//            the only read that carries page settings; cache page has no statusBar.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VIEW_FILES = ['page', 'outline', 'blocks', 'ds', 'events', 'keys', 'nav', 'paths', 'entity', 'app-ds', 'assets'];

/**
 * The plugin this block ships in: scripts/lib → scripts → native-lint → skills → plugin root.
 * `flag` (--ua-root) overrides it, for a checkout under test; CLAUDE_PLUGIN_ROOT is the
 * fallback when the file was copied out of the plugin.
 */
export function pluginRoot(flag = null) {
  const hasCli = (dir) => Boolean(dir) && fs.existsSync(path.join(dir, 'scripts', 'ua.mjs'));
  if (flag) {
    if (hasCli(flag)) return path.resolve(flag);
    throw new Error(`${flag} has no scripts/ua.mjs`);
  }
  const own = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  if (hasCli(own)) return own;
  if (hasCli(process.env.CLAUDE_PLUGIN_ROOT)) return path.resolve(process.env.CLAUDE_PLUGIN_ROOT);
  throw new Error(`no scripts/ua.mjs above ${own}; run this script from the UnifyApps Headless plugin, or pass --ua-root`);
}

/** Kept for callers of the older name. */
export const resolveUaRoot = pluginRoot;

/** Runs one UnifyApps Headless CLI command with --json and returns its data; a miss, stale read or error throws with UnifyApps Headless's own message. */
export function uaJson(root, args, { cwd = process.cwd() } = {}) {
  const result = spawnSync('bash', [path.join(root, 'scripts', 'run-node.sh'), path.join(root, 'scripts', 'ua.mjs'), ...args, '--json'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(`UnifyApps Headless ${args.join(' ')}: ${result.error.message}`);
  let data;
  try { data = JSON.parse(result.stdout); } catch { throw new Error(`UnifyApps Headless ${args.join(' ')} printed no JSON: ${(result.stderr || result.stdout).trim().slice(0, 300)}`); }
  if (data?.error) throw new Error(`UnifyApps Headless ${args.join(' ')}: ${data.error.code} ${data.error.message}`);
  if (data?.cache && data.cache.status && data.cache.status !== 'hit') throw new Error(`UnifyApps Headless ${args.join(' ')}: cache ${data.cache.status}${data.cache.reason ? ` (${data.cache.reason})` : ''}; re-run with --refresh or solution refresh`);
  return data;
}

/** Every saved view in a folder: <view>.json for each of VIEW_FILES, plus targets/<pageId>/{outline,blocks,events}.json. Missing files are null. */
export function readCacheSet(dir) {
  const read = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
  const set = Object.fromEntries(VIEW_FILES.map((view) => [view, read(path.join(dir, `${view}.json`))]));
  set.targets = {};
  const targetsDir = path.join(dir, 'targets');
  if (fs.existsSync(targetsDir)) {
    for (const pageId of fs.readdirSync(targetsDir)) {
      set.targets[pageId] = { outline: read(path.join(targetsDir, pageId, 'outline.json')), blocks: read(path.join(targetsDir, pageId, 'blocks.json')), events: read(path.join(targetsDir, pageId, 'events.json')) };
    }
  }
  set.from = dir;
  return set;
}

const cacheArgs = (view, pageId, appId, extra = []) => ['cache', view, ...(pageId ? [pageId] : []), '--app-id', appId, ...extra];
const wholePage = ['--match', '.*', '--limit', '100000'];

/** The same set through the CLI. `refresh` re-reads the page first; `targets` are the pages navigation leads to (H7, H16). */
export function fetchCacheSet({ root, pageId, appId, refresh = false, appWide = false, targets = [], cwd }) {
  const run = (args) => uaJson(root, args, { cwd });
  const refreshFlag = refresh ? ['--refresh'] : [];
  const set = { from: null, targets: {} };
  set.page = run(cacheArgs('page', pageId, appId, refreshFlag));
  set.outline = run(cacheArgs('outline', pageId, appId));
  set.blocks = run(cacheArgs('blocks', pageId, appId, wholePage));
  set.ds = run(cacheArgs('ds', pageId, appId));
  // Parameter bindings come only from the per-source view (cache-views.mjs dataSourceView with --id).
  set.ds.dataSources = set.ds.dataSources.map((source) => {
    try { return run(cacheArgs('ds', pageId, appId, ['--id', source.id])).dataSources.find((item) => item.id === source.id) ?? source; } catch { return source; }
  });
  set.events = run(cacheArgs('events', pageId, appId));
  set.keys = run(cacheArgs('keys', pageId, appId));
  for (const [view, args] of [['nav', ['cache', 'nav', appId]], ['paths', ['cache', 'paths', appId]], ['entity', ['entity', 'context', 'page', pageId, '--app-id', appId]]]) {
    try { set[view] = run(args); } catch (error) { set[view] = null; set[`${view}Error`] = error.message; }
  }
  if (appWide) { try { set['app-ds'] = run(['cache', 'ds', '--app-id', appId]); } catch (error) { set['app-ds'] = null; set.appDsError = error.message; } }
  for (const target of targets) {
    try { set.targets[target] = { outline: run(cacheArgs('outline', target, appId)), blocks: run(cacheArgs('blocks', target, appId, wholePage)), events: run(cacheArgs('events', target, appId)) }; }
    catch (error) { set.targets[target] = { error: error.message }; }
  }
  return set;
}

// ---- normalisers the rules read ----------------------------------------------------------
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export const blocksOf = (set) => (Array.isArray(set.blocks?.blocks) ? set.blocks.blocks : []);
export const nodesOf = (set) => (Array.isArray(set.outline?.nodes) ? set.outline.nodes : []);
export const chainsOf = (set) => (Array.isArray(set.events?.chains) ? set.events.chains : []);

/** Data sources with their parameter bindings as [{ name, value }], from the chosen view or the stored source. */
export function sourcesOf(set) {
  return (set.ds?.dataSources ?? []).map((source) => {
    const stored = asObject(asObject(asObject(source.source).properties).inputs).parameters;
    const bindings = Array.isArray(source.bindings) ? source.bindings : Object.entries(stored).map(([name, value]) => [name, value]).map(([name, value]) => ({ name, value }));
    const advanced = asObject(asObject(asObject(source.source).properties).advancedOptions);
    const onLoad = asObject(advanced.timing).runQueryOnPageLoad === true || advanced.runBehaviour === 'automatic';
    return { ...source, bindings, onLoad, bindingsKnown: Array.isArray(source.bindings) || Boolean(source.source) };
  });
}

/** What the page record says about itself, from whichever view carries it. */
export function pageInfo(set, pageId) {
  const entityPage = asObject(asObject(set.entity?.cache).page);
  const props = asObject(entityPage.properties);
  const summary = asObject(set.page?.page);
  const pathsPage = (set.paths?.pages ?? []).find((page) => page.id === pageId) ?? null;
  return {
    id: pageId,
    name: summary.name ?? props.name ?? pathsPage?.name ?? set.outline?.pageId ?? null,
    version: summary.version ?? entityPage.version ?? set.outline?.version ?? null,
    statusBar: 'statusBar' in props ? props.statusBar : undefined,
    settingsKnown: Boolean(set.entity?.cache?.page),
    folders: props.folders ?? null,
    pageVariables: props.pageVariables ?? null,
    pageFunctions: props.pageFunctions ?? null,
    inputSchema: props.inputSchema ?? null,
    isPublic: pathsPage ? pathsPage.isPublic === true : (typeof set.page?.page?.isPublic === 'boolean' ? set.page.page.isPublic : null),
    appType: asObject(asObject(asObject(set.entity?.cache?.appInterface ?? set.entity?.cache?.interface).properties).manifest).type ?? set.nav?.app?.appType ?? null,
    appId: set.nav?.app?.id ?? set.paths?.app?.id ?? null,
  };
}

/** The pages the bottom bar opens: cache nav primary items of type PAGE (cache-views.mjs appNavigation). null when nav was not read. */
export function tabPageIds(set) {
  if (!set.nav) return null;
  return (set.nav.primary ?? []).filter((item) => item.type === 'PAGE' && item.pageId).map((item) => item.pageId);
}

export const VIEWS = VIEW_FILES;
