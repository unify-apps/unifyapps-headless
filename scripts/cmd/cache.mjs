/**
 * Read the local entity cache the way the surface tools read the tenant.
 *
 * `entity context` hands back whole entities — one page of a real app is ~140 KB
 * and a whole app ~900 KB — so a reader that only wants one block's appearance,
 * or the pages of an app, either pays for all of it or writes a throwaway script
 * to dig through it. These commands are those scripts, written once: each one
 * mirrors a surface tool, answers from the snapshot on disk, and says in its
 * first line which version it read and when that copy was validated.
 *
 * Nothing here writes, and nothing here invents: a page the cache does not hold,
 * or holds behind a write this session sent, answers `miss` or `stale` and names
 * the tool to use instead. `--refresh` re-reads that app or entity from the
 * tenant first, the one place these commands touch the network.
 */
import { UaError } from '../lib/contracts.mjs';
import {
  cachedIdFor,
  checkpointEntityRef,
  listCachedEntities,
  listCachedVersions,
  readCachedAppContext,
  readCachedEntity,
  readCachedEntityContext,
  readCachedEntityVersion,
  readCachedPageBody,
  readCachedPageContext,
} from '../folder/entity-cache.mjs';
import { readInterfaceManifest } from '../folder/interface-cache.mjs';
import {
  MCP_ONLY, calledAutomationId,
  agentView, appNavigation, appOverview, contextKeys, dataSourceView, dependencyGraph, eventView, findBlocks, formView, formatStale, grepPages, objectView,
  pageDiff, pageKey, pageOutline, pagePaths, pageSummary, workflowContract, workflowDependencies, workflowView,
  renderAgent, renderAppOverview, renderBlocks, renderContextKeys, renderContract, renderDataSources, renderDependencies, renderDiff, renderEvents,
  renderForms, renderGrep, renderLimits, renderNavigation, renderObject, renderOutline, renderPageKey, renderPagePaths, renderPageSummary, renderWorkflow,
  renderWorkflowDependencies,
} from '../lib/cache-views.mjs';

const required = (value, label) => {
  const text = String(value ?? '').trim();
  if (!text) throw new UaError('USAGE', `${label} is required.`);
  return text;
};
const lower = value => String(value ?? '').toLowerCase();
/** A pattern the person typed, checked here so a bad one is a usage error that says what to escape, not a crash. */
const validPattern = (text, label) => {
  try { new RegExp(text, 'iu'); }
  catch (error) { throw new UaError('USAGE', `${label} is not a valid regular expression (${error.message}). Put a backslash before ( ) [ ] { } . * + ? | to match it as text.`); }
  return text;
};
const positiveInteger = (value, label, fallback) => {
  if (value === undefined) return fallback;
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1) throw new UaError('USAGE', `--${label} takes a whole number of 1 or more.`);
  return count;
};

export const cachedApps = home => listCachedEntities(home)
  .filter(snapshot => snapshot.entityType === 'e_interface')
  .map(snapshot => ({ id: snapshot.id, name: snapshot.entity?.properties?.name ?? null }));

/** An app by id or by the name the platform shows. The error names every cached app, so no one guesses twice. */
export function resolveApp(home, token) {
  const apps = cachedApps(home);
  if (apps.some(app => app.id === token)) return token;
  const exact = apps.filter(app => lower(app.name) === lower(token));
  const partial = exact.length ? exact : apps.filter(app => lower(app.name).includes(lower(token)) || lower(app.id).includes(lower(token)));
  if (partial.length === 1) return partial[0].id;
  const list = apps.map(app => `${app.name ?? '(unnamed)'} [${app.id}]`).join(', ') || 'none';
  if (partial.length > 1) throw new UaError('USAGE', `More than one cached app matches ${token}: ${partial.map(app => app.id).join(', ')}.`);
  throw new UaError('USAGE', `No cached app matches ${token}. Cached apps: ${list}. A missing app needs entity read app <id> or solution refresh.`);
}

const pageMembers = (home, appId) => (readInterfaceManifest(home, appId)?.members ?? []).filter(member => member.entityType.includes('component'));

/** A page by id, by the slug in its URL, or by name. The URL of a builder page carries the slug, never the id. */
export function resolvePage(home, appId, token) {
  const members = pageMembers(home, appId);
  if (!members.length) throw new UaError('USAGE', `App ${appId} has no cached pages. Run entity read app ${appId} or solution refresh.`);
  if (members.some(member => member.id === token)) return token;
  const slugs = readCachedEntity(home, 'e_interface', appId)?.entity?.properties?.interfacePageIdVsSlugMap ?? {};
  const candidates = members.map((member) => {
    const page = readCachedEntity(home, member.entityType, member.id)?.entity;
    return { id: member.id, slug: page?.properties?.slug ?? slugs[member.id] ?? null, name: page?.properties?.name ?? null };
  });
  // An exact slug or name wins: "Users" must not lose to "Users Admin", which only contains it.
  const exact = candidates.filter(page => lower(page.slug) === lower(token) || lower(page.name) === lower(token));
  const matches = exact.length ? exact : candidates.filter(page => lower(page.name).includes(lower(token)));
  const unique = [...new Map(matches.map(page => [page.id, page])).values()];
  if (unique.length === 1) return unique[0].id;
  const list = candidates.map(page => `${page.name ?? '(unnamed)'} /${page.slug ?? '?'} [${page.id}]`).join(', ');
  if (unique.length > 1) throw new UaError('USAGE', `More than one page of ${appId} matches ${token}: ${unique.map(page => page.id).join(', ')}.`);
  throw new UaError('USAGE', `No page of ${appId} matches ${token}. Cached pages: ${list}.`);
}

// The hint names the cache command itself: entity context has no --refresh, and
// an agent told only "re-read with --refresh" added it to entity context.
const missMessage = (cache, tools, command) => `Cache is ${cache.status}${cache.reason ? ` (${cache.reason})` : ''}; use ${tools}, or re-run cache ${command} with --refresh.`;

/** An object or automation by id or by name. A name the cache does not hold is a miss, so a task that creates the entity can still ask first. */
export function entityIdFor(home, entityType, token) {
  return cachedIdFor(home, entityType, token) ?? (/^[A-Za-z0-9_-]+$/u.test(token) ? token : null);
}
const notCached = (entityType, name) => ({ status: 'miss', reason: 'not-cached', entityType, name });

/** `--refresh` is the only network call in this area: it re-reads one app or entity and never links or writes to the tenant. */
async function refresh(ctx, ref) {
  try { await checkpointEntityRef(ctx, ref, { source: 'cache-refresh', link: false }); }
  catch (error) { throw new UaError(error.code ?? 'PLATFORM_UNREACHABLE', `The refresh failed: ${error.message}`); }
}

// The app's id, refreshing it FIRST when --refresh is set. resolveApp only
// knows apps already in the local manifest, so resolving before a requested
// refresh runs would refuse a brand-new app, or one whose manifest is simply
// missing a page added since the last read, before --refresh ever got the
// chance to fetch it. The raw token (an id already, or a name) goes straight
// to the refresh; only the freshly-written manifest is then searched by name.
async function resolvedAppId(ctx, rawAppId, flags) {
  if (flags.refresh) await refresh(ctx, { kind: 'app', id: rawAppId });
  return resolveApp(ctx.home, rawAppId);
}

/** The page's body: a hit as before, or, on `stale`, the same body WITH the
 * staleness flagged, when it is still on disk (no network call here — see the
 * file header). A genuine miss (the page itself is not cached) still refuses. */
function pageContext(home, appId, pageId) {
  const cache = readCachedPageContext(home, appId, pageId);
  if (cache.status !== 'stale') return cache;
  const body = readCachedPageBody(home, appId, pageId);
  return body ? { status: 'stale', reason: cache.reason, ...body } : cache;
}

/** Every cached page of one app or of all of them, for a cross-page scan. Stale pages are named, never quietly skipped.
 * Each stale entry carries the owning app's id so a caller can hint at refreshing just that one page. */
function scanTargets(home, appId) {
  const apps = appId ? [{ id: appId }] : cachedApps(home);
  const pages = [];
  const stale = [];
  for (const app of apps) {
    const context = readCachedAppContext(home, app.id);
    if (context.status !== 'hit') { stale.push({ id: app.id, appId: app.id, status: context.status }); continue; }
    for (const entry of context.pages) {
      if (entry.status !== 'hit') { stale.push({ id: entry.pageId, appId: app.id, status: entry.status }); continue; }
      pages.push({ appId: app.id, pageId: entry.pageId, pageName: entry.page?.properties?.name ?? null, page: entry.page, dataSources: entry.dataSources });
    }
  }
  return { pages, stale, apps: apps.length };
}

/**
 * What calls an automation, from the cache: every data source of every cached
 * page, the app-level ones on each global page included, and every cached
 * automation with a call node naming it. A stale page is named, not scanned.
 */
function automationCallers(home, automationId) {
  const scanned = scanTargets(home, null);
  const dataSources = scanned.pages.flatMap(entry => (entry.dataSources ?? [])
    .filter(source => source?.properties?.inputs?.automationId === automationId)
    .map(source => ({ id: source.id, name: source.properties?.name ?? null, appId: entry.appId, pageId: entry.pageId, pageName: entry.pageName })));
  const automations = listCachedEntities(home)
    .filter(snapshot => snapshot.entityType === 'WORKFLOW_DEFINITION' && snapshot.id !== automationId)
    .filter(snapshot => (snapshot.entity?.nodes ?? []).some(node => calledAutomationId(node) === automationId))
    .map(snapshot => ({ id: snapshot.id, name: snapshot.entity?.name ?? null, status: readCachedEntityContext(home, 'WORKFLOW_DEFINITION', snapshot.id).status }));
  return { dataSources, automations, stale: scanned.stale };
}

const APP_COMMANDS = {
  nav: { view: appNavigation, render: renderNavigation, tool: 'get_navigation', message: view => `${view.primary.length + view.secondary.length} menu items of ${view.app.name ?? view.app.id} from the cache.` },
  paths: { view: pagePaths, render: renderPagePaths, tool: 'get_page_paths', message: view => `${view.pages.length} page paths of ${view.app.name ?? view.app.id} from the cache.` },
};

const PAGE_COMMANDS = new Set(['page', 'outline', 'blocks', 'ds', 'deps', 'events', 'form', 'keys', 'diff']);

export async function run(command, args = [], flags = {}, ctx) {
  if (!ctx?.home || !ctx.state?.solutionId) throw new UaError('NOT_STARTED');

  if (command === 'limits') {
    return { data: { mcpOnly: Object.fromEntries(MCP_ONLY) }, text: renderLimits(), message: 'The cache cannot answer these.' };
  }

  if (command === 'app') {
    const appId = await resolvedAppId(ctx, required(args[0] ?? flags['app-id'], 'App id or name (positional or --app-id)'), flags);
    const cache = readCachedAppContext(ctx.home, appId);
    if (cache.status !== 'hit') return { data: { cache }, message: missMessage(cache, 'get_app_overview', command) };
    const view = appOverview(cache, { interfaceId: appId });
    return { data: view, text: renderAppOverview(view), message: `${view.pages.length} pages of ${view.app.name ?? appId} from the cache.` };
  }

  if (APP_COMMANDS[command]) {
    const spec = APP_COMMANDS[command];
    const appId = await resolvedAppId(ctx, required(args[0] ?? flags['app-id'], 'App id or name (positional or --app-id)'), flags);
    const cache = readCachedAppContext(ctx.home, appId);
    if (cache.status !== 'hit') return { data: { cache }, message: missMessage(cache, spec.tool, command) };
    const view = spec.view(cache, { interfaceId: appId });
    return { data: view, text: spec.render(view, appId), message: spec.message(view) };
  }

  if (command === 'grep') {
    // A single-dash token such as -i is never a flag here (only --name is), so it would
    // otherwise become the pattern itself and silently drop whatever followed it in
    // args[1]. cache grep already matches case-insensitively, so there is nothing a
    // short flag like -i would add; name the mistake instead of searching for "-i".
    const first = required(args[0], 'A pattern');
    if (/^-[A-Za-z]+$/u.test(first)) {
      throw new UaError('USAGE', `${JSON.stringify(first)} looks like a flag, not a pattern: cache grep takes no short flags, and already matches case-insensitively. Run cache grep ${args[1] ? JSON.stringify(args[1]) : '"<pattern>"'}.`);
    }
    const pattern = validPattern(first, 'The pattern');
    if (flags.refresh && !flags['app-id']) throw new UaError('USAGE', 'cache grep --refresh needs --app-id: a refresh re-reads one app, never every app at once.');
    const appId = flags['app-id'] ? resolveApp(ctx.home, flags['app-id']) : null;
    if (flags.refresh) await refresh(ctx, { kind: 'app', id: appId });
    const scanned = scanTargets(ctx.home, appId);
    const view = grepPages(scanned.pages, { pattern, field: flags.field ?? null, limit: positiveInteger(flags.limit, 'limit', 50) });
    return {
      data: { ...view, scanned: { apps: scanned.apps, pages: scanned.pages.length, stale: scanned.stale } },
      text: renderGrep(view, { scanned: { apps: scanned.apps, pages: scanned.pages.length, stale: scanned.stale } }),
      message: `${view.matched} matches for ${pattern} in ${scanned.pages.length} cached pages.`,
    };
  }

  if (command === 'obj') {
    const token = required(args[0], 'Object id or name');
    const id = entityIdFor(ctx.home, 'ENTITY_TYPE', token);
    if (!id) return { data: { cache: notCached('ENTITY_TYPE', token) }, message: `Cache is miss: no cached object is named ${token}; use search or get_objects.` };
    if (flags.refresh) await refresh(ctx, { kind: 'object', id });
    const cache = readCachedEntityContext(ctx.home, 'ENTITY_TYPE', id);
    if (cache.status !== 'hit') return { data: { cache }, message: missMessage(cache, 'get_objects or describe_storage_object', command) };
    const view = objectView({ entity: cache.entity, version: cache.version, cachedAt: cache.cachedAt });
    return { data: view, text: renderObject(view), message: `${view.fields.length} fields of ${view.object.name ?? id} from the cache.` };
  }

  if (command === 'agent') {
    const token = required(args[0], 'AI agent id or name');
    const id = entityIdFor(ctx.home, 'ai_agent', token);
    if (!id) return { data: { cache: notCached('ai_agent', token) }, message: `Cache is miss: no cached AI agent is named ${token}; use list_agents, then get_agent.` };
    if (flags.refresh) await refresh(ctx, { kind: 'ai-agent', id });
    const cache = readCachedEntityContext(ctx.home, 'ai_agent', id);
    if (cache.status !== 'hit') return { data: { cache }, message: missMessage(cache, 'get_agent', command) };
    const view = agentView({ entity: cache.entity, version: cache.version, cachedAt: cache.cachedAt });
    const models = Object.values(view.models).filter(Boolean).length;
    return { data: view, text: renderAgent(view),
      message: `${view.agent.name ?? id}: ${view.instructions?.chars ?? 0} chars of instructions, ${models} models, deployed version ${view.agent.deployed.version ?? '—'} from the cache.` };
  }

  if (command === 'wf') {
    if (flags.contract && flags.deps) throw new UaError('USAGE', 'cache wf takes --contract or --deps, not both.');
    const token = required(args[0], 'Automation id or name');
    const tool = flags.contract ? 'describe_callable_workflow' : flags.deps ? 'get_workflow_dependencies' : 'open_workflow for the code and search_workflows for what is deployed';
    const id = entityIdFor(ctx.home, 'WORKFLOW_DEFINITION', token);
    if (!id) return { data: { cache: notCached('WORKFLOW_DEFINITION', token) }, message: `Cache is miss: no cached automation is named ${token}; use search_workflows, then ${tool}.` };
    if (flags.refresh) await refresh(ctx, { kind: 'automation', id });
    const cache = readCachedEntityContext(ctx.home, 'WORKFLOW_DEFINITION', id);
    if (cache.status !== 'hit') return { data: { cache }, message: missMessage(cache, tool, command) };
    const snapshot = { entity: cache.entity, version: cache.version, cachedAt: cache.cachedAt };
    if (flags.contract) {
      const view = workflowContract(snapshot);
      const stale = view.automation.aheadOfDeploy
        ? ` This is the cached draft (cached ${view.automation.cachedAt ?? 'unknown when'}), not the deployed definition (deployed ${view.automation.deployedAt ?? 'unknown when'}) — it may not match what live calls accept. Check search_workflows for what is live before treating this as an unpublished save.`
        : '';
      return { data: view, text: renderContract(view), message: `${view.inputs.length} inputs and ${view.outputs.length} outputs of ${view.automation.name ?? id} from the cache.${stale}` };
    }
    if (flags.deps) {
      const nameOfAutomation = automationId => readCachedEntity(ctx.home, 'WORKFLOW_DEFINITION', automationId)?.entity?.name ?? null;
      const view = workflowDependencies(snapshot, { callers: automationCallers(ctx.home, id), nameOfAutomation });
      return { data: view, text: renderWorkflowDependencies(view),
        message: `${view.calls.length} calls, ${view.objects.length} objects, called by ${view.calledBy.dataSources.length + view.calledBy.automations.length} in the cache.` };
    }
    const view = workflowView(snapshot);
    return { data: view, text: renderWorkflow(view), message: `${view.automation.nodeCount} nodes of ${view.automation.name ?? id} from the cache.` };
  }

  if (!PAGE_COMMANDS.has(command)) throw new UaError('USAGE', `Unknown cache command: ${command}.`);

  const appId = await resolvedAppId(ctx, required(flags['app-id'], 'Owning app id or name (--app-id)'), flags);

  // `cache ds` with no page lists every cached page's sources, so "which data
  // source calls X" does not need the page first. The global page holds the
  // app-level ones. (Any requested refresh already ran above, in resolvedAppId.)
  if (command === 'ds' && !args[0]) {
    const scanned = scanTargets(ctx.home, appId);
    const views = scanned.pages
      .map(entry => ({ pageName: entry.pageName, ...dataSourceView({ page: entry.page, dataSources: entry.dataSources, appDataSources: [] }, { pageId: entry.pageId, name: flags.name ?? null, id: flags.id ?? null }) }))
      .filter(view => view.dataSources.length);
    const count = views.reduce((sum, view) => sum + view.dataSources.length, 0);
    if ((flags.name || flags.id) && !count) {
      throw new UaError('NOT_FOUND', `No cached data source of ${appId} is ${flags.name ? `named ${flags.name}` : flags.id}. Run cache ds --app-id ${appId} for all of them.`);
    }
    const text = [`app ${appId} · ${count} data sources on ${views.length} pages · cache hit${scanned.stale.length ? ` · not scanned, stale or missing: ${scanned.stale.map(formatStale).join(', ')}` : ''}`,
      ...views.flatMap(view => [`page ${view.pageName ?? view.pageId} [${view.pageId}]`, ...renderDataSources(view).split('\n').slice(2)])].join('\n');
    return { data: { appId, pages: views, stale: scanned.stale }, text, message: `${count} data sources on ${views.length} pages of ${appId} from the cache.` };
  }

  const pageId = resolvePage(ctx.home, appId, required(args[0], 'Page id, slug or name'));

  if (command === 'diff') {
    const versions = listCachedVersions(ctx.home, 'e_component', pageId);
    if (versions.length < 2) throw new UaError('USAGE', `The cache holds ${versions.length} version(s) of ${pageId}: ${versions.join(', ') || 'none'}. A diff needs two.`);
    const [after, before] = flags.versions
      ? String(flags.versions).split(',').map(part => Number(part.trim())).sort((left, right) => right - left)
      : [versions[0], versions[1]];
    const snapshots = { before: readCachedEntityVersion(ctx.home, 'e_component', pageId, before), after: readCachedEntityVersion(ctx.home, 'e_component', pageId, after) };
    for (const [label, snapshot] of Object.entries(snapshots)) {
      if (!snapshot) throw new UaError('USAGE', `The cache has no ${label} version ${label === 'before' ? before : after} of ${pageId}. Cached versions: ${versions.join(', ')}.`);
    }
    const view = pageDiff(snapshots.before, snapshots.after, { pageId });
    return { data: { ...view, cachedVersions: versions }, text: renderDiff(view), message: `${view.added} added, ${view.removed} removed, ${view.changed} changed between versions ${before} and ${after}.` };
  }

  const tools = { page: 'get_page_outlines', outline: 'get_page_outlines', blocks: 'get_blocks', ds: 'get_data_sources', deps: 'get_dependency_graph',
    events: 'get_blocks and get_data_sources', form: 'list_form_fields', keys: 'get_page_outlines with view settings, get_data_sources and list_form_fields' };
  const cache = pageContext(ctx.home, appId, pageId);
  if (cache.status === 'miss') return { data: { cache }, message: missMessage(cache, tools[command], command) };
  // A stale hit still renders the normal view, with the staleness flagged: no
  // network call here (the file header says `--refresh` is the only one in
  // this area) — just the body already on disk, prefixed with why it may be
  // behind. A genuine miss (above) still refuses outright.
  const stale = cache.status === 'stale';
  const withStale = (result) => !stale ? result : { ...result,
    data: { ...result.data, cache: { status: 'stale', reason: cache.reason } },
    text: `STALE (${cache.reason}) — re-read with --refresh or ${tools[command]}.\n${result.text}` };

  if (command === 'page') {
    const view = pageSummary(cache, { pageId });
    return withStale({ data: view, text: renderPageSummary(view), message: `${view.page.blocks} blocks on ${view.page.name ?? pageId} from the cache.` });
  }
  if (command === 'outline') {
    const view = pageOutline(cache, { pageId, root: flags.root ?? null, depth: flags.depth === undefined ? Infinity : positiveInteger(flags.depth, 'depth', Infinity) });
    if (view.missingRoot) throw new UaError('USAGE', `Page ${pageId} has no block ${flags.root}.`);
    return withStale({ data: view, text: renderOutline(view), message: `${view.shown} of ${view.total} blocks of ${pageId} from the cache.` });
  }
  if (command === 'blocks') {
    // --ids is accepted as the plural alias of --id: both take the same
    // comma-separated list of block ids.
    const idFlag = flags.id ?? flags.ids ?? null;
    if (!flags.name && !idFlag && !flags.match && !flags.field) {
      throw new UaError('USAGE', `cache blocks needs --name, --id, --match or --field. Read the whole page with cache outline ${pageId} --app-id ${appId}.`);
    }
    // Every id an --id list names is shown: a brief that lists 26 ids means all 26.
    const view = findBlocks(cache, { pageId, name: flags.name ?? null, id: idFlag, match: flags.match ? validPattern(flags.match, '--match') : null,
      field: flags.field ?? null, limit: positiveInteger(flags.limit, 'limit', idFlag ? Infinity : 10) });
    if (!view.matched) {
      // A page function or variable is not a block, and no block read finds one.
      const named = flags.name ? pageKey(cache, flags.name) : null;
      if (named) throw new UaError('NOT_FOUND', `${flags.name} is a page ${named.kind} [${named.id}], not a block. Read it whole with cache keys ${pageId} --app-id ${appId} --name ${flags.name}.`);
      throw new UaError('NOT_FOUND', `No block of ${pageId} matches ${flags.name ?? idFlag ?? flags.match}. Run cache outline ${pageId} --app-id ${appId} for the names.`);
    }
    const missing = view.notFound.length ? ` Not on this page: ${view.notFound.join(', ')}.` : '';
    return withStale({ data: view, text: renderBlocks(view), message: `${view.shown} of ${view.matched} blocks from the cache.${missing}` });
  }
  if (command === 'ds') {
    const view = dataSourceView(cache, { pageId, name: flags.name ?? null, id: flags.id ?? null });
    if ((flags.name || flags.id) && !view.dataSources.length) {
      const all = dataSourceView(cache, { pageId }).dataSources.map(source => `${source.name ?? '(unnamed)'} [${source.id}]`).join(', ') || 'none';
      throw new UaError('NOT_FOUND', `No data source of ${pageId} is ${flags.name ? `named ${flags.name}` : flags.id}. Its data sources: ${all}.`);
    }
    return withStale({ data: view, text: renderDataSources(view), message: `${view.dataSources.length} data sources of ${pageId} from the cache.` });
  }
  if (command === 'events') {
    const view = eventView(cache, { pageId, name: flags.name ?? null });
    if (flags.name && !view.chains.length) throw new UaError('NOT_FOUND', `No block or data source named ${flags.name} has events on ${pageId}. Run cache events ${pageId} --app-id ${appId} for all of them.`);
    return withStale({ data: view, text: renderEvents(view), message: `${view.eventCount} events on ${pageId} from the cache.` });
  }
  if (command === 'form') {
    const view = formView(cache, { pageId, block: flags.block ?? null });
    if (!view.forms.length) throw new UaError('NOT_FOUND', `${flags.block ? `No Form block ${flags.block}` : 'No Form block'} on ${pageId}. Run cache outline ${pageId} --app-id ${appId} for the blocks.`);
    return withStale({ data: view, text: renderForms(view), message: `${view.forms.length} forms on ${pageId} from the cache.` });
  }
  if (command === 'keys') {
    if (flags.name) {
      const named = pageKey(cache, flags.name);
      if (!named) throw new UaError('NOT_FOUND', `No page function or variable of ${pageId} is named ${flags.name}. Run cache keys ${pageId} --app-id ${appId} for all of them.`);
      return withStale({ data: named, text: renderPageKey(named, cache), message: `Page ${named.kind} ${named.name ?? named.id} of ${pageId} from the cache.` });
    }
    const view = contextKeys(cache, { pageId, appId });
    return withStale({ data: view, text: renderContextKeys(view), message: `${view.variables.length} variables, ${view.dataSources.length} data sources and ${view.formFields.length} form fields on ${pageId} from the cache.` });
  }
  const view = dependencyGraph(cache, { pageId });
  return withStale({ data: view, text: renderDependencies(view), message: `${view.edges.length} edges on ${pageId} from the cache.` });
}
