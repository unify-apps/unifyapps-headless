/**
 * Shaped views over cached platform entities: the small answers the surface
 * tools give, computed from a local snapshot instead of a tenant call.
 *
 * Pure. Every function takes entity documents the workspace layer already read
 * and returns data plus its text rendering. Nothing here touches the disk, the
 * network or a session, so a view can be tested against a fixture entity.
 *
 * The cache holds whole entities, which is why reading one costs what a tool
 * call saves: one page of an app is ~140 KB of JSON and a whole app ~900 KB.
 * Every view below answers one question and carries only what that answer needs.
 */

const asObject = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const properties = entity => asObject(asObject(entity).properties);
const blocksOf = page => asObject(properties(page).blocks);
const nameOf = entity => asObject(entity).name ?? properties(entity).name ?? null;
const componentTypeOf = block => asObject(asObject(block).component).componentType ?? null;
const iso = value => (Number.isFinite(value) ? new Date(value).toISOString() : null);

// Everything about an AI agent that lives outside its own record, with the tool
// that owns each. The cached record is the agent itself; what it can use is not
// in it. `cache agent` repeats these so a reader does not take a field the
// record never had for an empty one.
export const AGENT_LIVE_ONLY = Object.freeze([
  ['the tools, skills and knowledge attached to an agent', 'get_agent, list_capabilities, get_knowledge_sets, check_knowledge_status'],
  ["an agent's tasks", 'list_tasks'],
  ["an agent's guardrails", 'read_guardrails'],
  ["an agent's deployments and test runs", 'list_deployments, read_trace'],
]);

/** What the cache never holds, and the tool that owns each. Answering these from a snapshot would invent them. */
export const MCP_ONLY = Object.freeze([
  ...AGENT_LIVE_ONLY,
  ['style and typography options', 'get_style_options, get_typography_size_options'],
  ['colour tokens', 'get_color_tokens'],
  ['icon options', 'get_icon_options'],
  ['knowledge sheets', 'get_app_builder_knowledge, get_app_builder_knowledge_map'],
  ['object records', 'get_records (object), fetch_storage_records (automation-code)'],
  ['automation runs', 'list_workflow_runs, inspect_workflow_run'],
  ['connections', 'list_connections'],
  ['evaluation datasets, metrics, experiments and runs', 'list_datasets, get_metrics, get_experiments, experiment_scorecard (evaluation)'],
  ['API Platform groups, APIs, clients, access profiles and policies', 'list_api_groups, list_apis, list_clients, list_policies (api-gateway)'],
  ['environment variables', 'list_env_variables, get_env_variables (object)'],
  ['custom connectors, their actions, triggers and authentications', 'list_custom_connectors, get_connector (connectors-sdk)'],
  ['published version history of an app', 'list_interface_versions'],
  ['changesets, outbound and inbound', 'list_changesets, get_changeset, list_inbound_changesets (changeset)'],
  ['data source output schemas', 'get_data_source_output_schemas, get_data_source_resource_shape'],
  ['dangling references on a page', 'get_dependency_graph'],
  ['interaction, slot and template options', 'get_interaction_options, get_slot_options, get_template_component_options'],
]);

const header = parts => parts.filter(Boolean).join(' · ');

/** Every view starts with this line, so no reader can mistake a snapshot for a live read. */
export function provenanceLine({ kind, id, version = null, cachedAt = null, validatedAt = null, status = 'hit' }) {
  return header([
    `${kind} ${id}`,
    Number.isFinite(version) ? `version ${version}` : null,
    validatedAt ? `validated ${validatedAt}` : null,
    cachedAt && !validatedAt ? `cached ${cachedAt}` : null,
    `cache ${status}`,
  ]);
}

// What no app read returns today: whether the code builder owns the app
// (`manifest.mode` is `code`; every other app is config, which the no-code
// tools write), and who may open it (`security.type`, PRIVATE when no setting
// was saved). A parent app or a package can still govern the access.
function appAccess(app) {
  const props = properties(app);
  const saved = asObject(props.security).type;
  return {
    mode: asObject(props.manifest).mode === 'code' ? 'code' : 'config',
    access: saved ?? 'PRIVATE',
    accessSaved: Boolean(saved),
    accessFromParent: Boolean(props.parentInterfaceId || asObject(props.package).security),
  };
}

/** get_app_overview: the pages of an app with their counts, plus what the app deploys. */
export function appOverview(context, { interfaceId }) {
  const app = context.interface;
  const deployment = asObject(app?.deploymentState);
  const slugs = asObject(properties(app).interfacePageIdVsSlugMap);
  const details = asObject(properties(app).entityDetailsMap);
  const logo = asObject(asObject(properties(app).metadata).logo);
  // The address get_page_paths gives: the page's folder path plus its slug, from
  // the app's own map. A page's own `slug` can lag behind a path change, and a
  // slug alone makes two nested pages look like they share one address.
  const addresses = new Map(pagePaths(context, { interfaceId }).pages.map(page => [page.id, page.path]));
  const slugOf = (id, page) => asObject(details[id]).slug ?? slugs[id] ?? properties(page).slug ?? null;
  const addressOf = (id, slug) => addresses.get(id) ?? (slug ? `/${slug}` : null);
  const pages = (context.pages ?? []).map((entry) => {
    if (entry.status !== 'hit') {
      const slug = slugOf(entry.pageId, null);
      return { id: entry.pageId, status: entry.status, reason: entry.reason ?? null, slug, address: addressOf(entry.pageId, slug) };
    }
    const page = entry.page;
    const slug = slugOf(entry.pageId, page);
    return {
      id: entry.pageId,
      status: 'hit',
      name: nameOf(page),
      slug,
      address: addressOf(entry.pageId, slug),
      blocks: Object.keys(blocksOf(page)).length,
      variables: Object.keys(asObject(properties(page).pageVariables)).length,
      dataSources: (entry.dataSources ?? []).map(source => ({ id: source.id, name: nameOf(source) })),
    };
  });
  return {
    app: {
      id: interfaceId,
      name: nameOf(app),
      type: asObject(properties(app).manifest).type ?? null,
      // `code` for a Code Builder app (its source lives in git); absent on a no-code app.
      mode: asObject(properties(app).manifest).mode ?? null,
      device: asObject(properties(app).deviceDetails).base ?? null,
      ...appAccess(app),
      version: app?.version ?? null,
      deployed: { version: deployment.version ?? null, entityVersion: deployment.entityVersion ?? null, at: iso(deployment.deployedAt), notes: deployment.deploymentNotes ?? null },
      // The general settings update_app_settings writes: a reader that saw no
      // logo here took it as unset and overwrote two the person had uploaded.
      logo: { logoSmall: logo.small ?? null, logoLarge: logo.large ?? null, favicon: logo.favicon ?? null },
      validatedAt: context.validatedAt ?? null,
    },
    pages,
    stalePages: context.stalePages ?? [],
  };
}

export function renderAppOverview(view) {
  const { app } = view;
  const lines = [
    provenanceLine({ kind: 'app', id: app.id, version: app.version, validatedAt: app.validatedAt }),
    `${app.name ?? '(unnamed)'} — ${app.type ?? 'unknown type'}${app.device ? ` (${app.device})` : ''}`,
    `mode ${app.mode}${app.mode === 'code' ? ' (the code builder owns it and rewrites what other tools change)' : ''} · access ${app.access}${app.accessSaved ? '' : ' (no setting saved)'}${app.accessFromParent ? ', a parent app or package may govern it' : ''}`,
    `deployed version ${app.deployed.version ?? '—'} (entity version ${app.deployed.entityVersion ?? '—'})${app.deployed.at ? ` at ${app.deployed.at}` : ''}`,
    `general settings: ${Object.entries(app.logo).map(([key, value]) => `${key} ${value ?? 'not set'}`).join(', ')}`,
    `${view.pages.length} pages`,
  ];
  for (const page of view.pages) {
    lines.push(page.status === 'hit'
      ? `  ${page.name ?? '(unnamed)'} [${page.id}] ${page.address ?? '/?'} — ${page.blocks} blocks, ${page.variables} variables, ${page.dataSources.length} data sources${page.dataSources.length ? `: ${page.dataSources.map(source => source.name ?? source.id).join(', ')}` : ''}`
      : `  ${page.address ? `${page.address} ` : ''}[${page.id}] — ${page.status}${page.reason ? ` (${page.reason})` : ''}, use the application-builder page tools`);
  }
  return lines.join('\n');
}

/** Page names by id from an app hit, so an app-level view can say which page an id is. */
const pageNamesOf = context => Object.fromEntries((context.pages ?? []).filter(entry => entry.status === 'hit').map(entry => [entry.pageId, nameOf(entry.page)]));

// The default is a page id, a path such as `/` when the app opens on its root,
// or a condition the builder set: `{defaultValue, conditionalValueFilters}`.
// get_navigation leaves a condition out, so this is the one read that shows it.
function defaultPageOf(value, pageNames) {
  if (!value) return null;
  if (typeof value === 'object') {
    const id = value.defaultValue ?? null;
    const otherPages = (Array.isArray(value.conditionalValueFilters) ? value.conditionalValueFilters : []).map(rule => rule?.propertyValue).filter(Boolean);
    return { condition: true, id, name: id ? pageNames[id] ?? null : null, otherPages };
  }
  return String(value).startsWith('/') ? { path: value } : { id: value, name: pageNames[value] ?? null };
}

/** get_navigation: the app's menu, the page each item opens, the default page and how each device shows the bar. */
export function appNavigation(context, { interfaceId }) {
  const navigation = asObject(properties(context.interface).navigation);
  const pageNames = pageNamesOf(context);
  const item = (entry) => {
    const children = entry?.items ?? entry?.children;
    return {
      id: entry?.id ?? null, name: entry?.name ?? null, type: entry?.type ?? null, icon: entry?.icon ?? null,
      ...(entry?.pageId ? { pageId: entry.pageId, pageName: pageNames[entry.pageId] ?? null } : {}),
      ...(entry?.slug ? { slug: entry.slug } : {}), ...(entry?.url ? { url: entry.url } : {}), ...(entry?.moduleId ? { moduleId: entry.moduleId } : {}),
      ...(Array.isArray(children) ? { items: children.map(item) } : {}),
    };
  };
  return {
    app: { id: interfaceId, name: nameOf(context.interface), version: context.interface?.version ?? null, validatedAt: context.validatedAt ?? null },
    defaultPage: defaultPageOf(navigation.defaultPageId, pageNames),
    primary: (Array.isArray(navigation.primary) ? navigation.primary : []).map(item),
    secondary: (Array.isArray(navigation.secondary) ? navigation.secondary : []).map(item),
    // moduleId: the MODULE that draws this size's bar instead of the platform (set_navigation_style), else null.
    devices: Object.entries(asObject(navigation.appearance)).map(([device, look]) => ({
      device, navigator: asObject(asObject(look).navigationBar).navigatorType ?? null, position: asObject(asObject(look).navigationBar).position ?? null,
      moduleId: asObject(asObject(look).navigationBar).navigatorModuleId ?? null,
    })),
  };
}

const defaultPageLine = (page) => {
  if (!page) return '—';
  if (page.path) return page.path;
  const named = `${page.name ?? '(not cached)'} [${page.id}]`;
  return page.condition ? `set by a condition; otherwise ${named}; other pages: ${page.otherPages.join(', ') || '—'}` : named;
};

export function renderNavigation(view, interfaceId) {
  const line = (entry, depth) => [
    `${'  '.repeat(depth)}${entry.type ?? '?'} ${entry.name ?? '(unnamed)'} [${entry.id}]${entry.icon ? ` icon ${entry.icon}` : ''}${entry.pageId ? ` -> ${entry.pageName ?? '(page not cached)'} [${entry.pageId}]` : ''}${entry.slug ? ` /${entry.slug}` : ''}${entry.url ? ` -> ${entry.url}` : ''}${entry.moduleId ? ` -> module ${entry.moduleId}` : ''}`,
    ...(entry.items ?? []).flatMap(child => line(child, depth + 1)),
  ];
  return [
    provenanceLine({ kind: 'app', id: interfaceId, version: view.app.version, validatedAt: view.app.validatedAt }),
    `default page: ${defaultPageLine(view.defaultPage)}`,
    `primary (${view.primary.length})`, ...view.primary.flatMap(entry => line(entry, 1)),
    `secondary (${view.secondary.length})`, ...view.secondary.flatMap(entry => line(entry, 1)),
    `devices: ${view.devices.map(device => `${device.device} ${device.navigator ?? '?'}${device.position ? ` ${device.position}` : ''}${device.moduleId ? ` drawn by module ${device.moduleId}` : ''}`).join(', ') || '—'}`,
  ].join('\n');
}

/**
 * get_page_paths: the folder tree in `paths`, with each page placed at its
 * folder's path plus its own slug. It also names what a reviewer looks for —
 * a page no folder holds, and two pages at one path.
 */
export function pagePaths(context, { interfaceId }) {
  const props = properties(context.interface);
  const tree = asObject(props.paths);
  const details = asObject(props.entityDetailsMap);
  const slugs = asObject(props.interfacePageIdVsSlugMap);
  const pageNames = pageNamesOf(context);
  const childIds = new Set(Object.values(tree).flatMap(node => (Array.isArray(node?.children) ? node.children : [])));
  const roots = Object.values(tree).filter(node => node?.id && !childIds.has(node.id));
  const join = (base, segment) => `${String(base ?? '/').replace(/\/+$/u, '')}/${segment}`;
  const folders = [];
  const pages = [];
  const visited = new Set();
  const walk = (node, depth) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    folders.push({ id: node.id, segment: node.segment ?? null, path: node.path ?? null, depth });
    for (const child of Array.isArray(node.children) ? node.children : []) {
      if (tree[child]) { walk(tree[child], depth + 1); continue; }
      const slug = asObject(details[child]).slug ?? slugs[child] ?? null;
      pages.push({ id: child, name: pageNames[child] ?? null, type: asObject(details[child]).type ?? null, slug, folder: node.id,
        path: slug ? join(node.path, slug) : null, isPublic: asObject(details[child]).isPublic ?? null, global: child.startsWith('e_global_'), depth: depth + 1 });
    }
  };
  for (const root of roots) walk(root, 0);
  const placed = new Set(pages.map(page => page.id));
  const known = new Set([...Object.keys(details), ...Object.keys(slugs), ...(context.pages ?? []).map(entry => entry.pageId)]);
  // The global page holds app-level sources and is never a route, so no folder holding it is not a finding.
  const unplaced = [...known].filter(id => !placed.has(id) && !id.startsWith('e_global_')).sort()
    .map(id => ({ id, name: pageNames[id] ?? null, slug: asObject(details[id]).slug ?? slugs[id] ?? null }));
  const byPath = new Map();
  for (const page of pages.filter(entry => entry.path && !entry.global)) byPath.set(page.path, [...(byPath.get(page.path) ?? []), page.id]);
  return {
    app: { id: interfaceId, name: nameOf(context.interface), version: context.interface?.version ?? null, validatedAt: context.validatedAt ?? null },
    folders, pages, unplaced,
    duplicates: [...byPath].filter(([, ids]) => ids.length > 1).map(([pagePath, ids]) => ({ path: pagePath, pages: ids })),
  };
}

export function renderPagePaths(view, interfaceId) {
  const lines = [provenanceLine({ kind: 'app', id: interfaceId, version: view.app.version, validatedAt: view.app.validatedAt }),
    `${view.pages.length} pages in ${view.folders.length} folders`];
  for (const folder of view.folders) {
    lines.push(`${'  '.repeat(folder.depth + 1)}folder ${folder.path ?? folder.segment ?? '?'} [${folder.id}]`);
    for (const page of view.pages.filter(entry => entry.folder === folder.id)) {
      lines.push(`${'  '.repeat(page.depth + 1)}${page.global ? '(global page) ' : ''}${page.path ?? '(no slug)'} — ${page.name ?? '(not cached)'} [${page.id}]${page.isPublic ? ' public' : ''}${page.type && page.type !== 'PAGE' ? ` ${page.type}` : ''}`);
    }
  }
  lines.push(`in no folder: ${view.unplaced.map(page => `${page.name ?? page.slug ?? '?'} [${page.id}]`).join(', ') || '—'}`);
  lines.push(`same path twice: ${view.duplicates.map(entry => `${entry.path} (${entry.pages.join(', ')})`).join('; ') || '—'}`);
  return lines.join('\n');
}

/** Labels ids the way the page does: a block, a data source, a variable or a function by its name. */
function pageLabeller(context) {
  const blocks = blocksOf(context.page);
  const sources = [...(context.dataSources ?? []), ...(context.appDataSources ?? [])];
  const named = { ...asObject(properties(context.page).pageVariables), ...asObject(properties(context.page).pageFunctions) };
  return (id) => {
    if (blocks[id]) return `${blocks[id].displayName ?? id}[${id}]`;
    const source = sources.find(item => item.id === id);
    if (source) return `${nameOf(source) ?? id}[${id}]`;
    if (named[id]) return `${named[id]?.name ?? id}[${id}]`;
    return id;
  };
}

/** What one action does, in one phrase: its target by name, the method it calls, the value it sets. */
function describeAction(action, label) {
  const payload = asObject(asObject(action).payload);
  const targets = Object.entries(payload).filter(([key, value]) => typeof value === 'string' && /Id$/u.test(key)).map(([, value]) => label(value));
  const operation = asObject(payload.operationDetails);
  if (operation.operation) return `${operation.operation} ${targets.join(', ')}${'value' in operation ? ` = ${JSON.stringify(operation.value)}` : ''}`;
  const method = payload.methodName ?? payload.method ?? null;
  const target = `${targets.join(', ')}${method ? (targets.length ? `.${method}` : method) : ''}`;
  return [target, payload.title ? `"${payload.title}"` : null, payload.url ?? null].filter(Boolean).join(' ');
}

/** update_event_actions' read side: every event chain on the page — its own interactions.events, block events and data source callbacks — in order. */
export function eventView(context, { pageId, name = null }) {
  const label = pageLabeller(context);
  const shape = (event, branch = null) => ({
    id: event?.id ?? null, actionId: asObject(event?.action).id ?? null, eventType: event?.eventType ?? null, actionType: asObject(event?.action).actionType ?? null,
    target: describeAction(event?.action, label), conditional: Boolean(asObject(event?.action).runCondition), payload: asObject(event?.action).payload ?? null,
    branch,
  });
  const followOns = actions => (Array.isArray(actions) ? actions : []);
  // A controlDataSource (or any) action's own follow-on chain — onSuccessActions
  // on success, onErrorActions on failure — is walked too, each nested action
  // shaped as its own entry so a chain that both triggers a data source and
  // reacts to it is one read, not just its first step.
  const flatten = (event, branch = null) => {
    const action = asObject(event?.action);
    return [shape(event, branch),
      ...followOns(action.onSuccessActions).flatMap(next => flatten({ id: event?.id ?? null, eventType: event?.eventType ?? null, action: next }, 'success')),
      ...followOns(action.onErrorActions).flatMap(next => flatten({ id: event?.id ?? null, eventType: event?.eventType ?? null, action: next }, 'error'))];
  };
  const chains = [];
  const pageEvents = asObject(properties(context.page).interactions).events;
  if (Array.isArray(pageEvents) && pageEvents.length) {
    chains.push({ kind: 'page', id: context.page?.id ?? pageId, name: nameOf(context.page), componentType: 'Page', events: pageEvents.flatMap(event => flatten(event)) });
  }
  for (const block of Object.values(blocksOf(context.page))) {
    if (!Array.isArray(block?.events) || !block.events.length) continue;
    chains.push({ kind: 'block', id: block.id, name: block.displayName ?? null, componentType: componentTypeOf(block), events: block.events.flatMap(event => flatten(event)) });
  }
  for (const [scope, list] of [['page', context.dataSources ?? []], ['app', context.appDataSources ?? []]]) {
    for (const source of list) {
      const callbacks = asObject(properties(source).callbacks);
      const events = Object.values(callbacks).filter(Array.isArray).flat();
      if (events.length) chains.push({ kind: 'data-source', scope, id: source.id, name: nameOf(source), componentType: 'DataSource', events: events.flatMap(event => flatten(event)) });
    }
  }
  // One block or source by name or id, then every chain its actions lead to —
  // a button's submitForm reaches the form, the form's trigger reaches the data
  // source, the source's callbacks — so "what happens on click" is one read.
  let shown = chains;
  if (name) {
    const byId = new Map(chains.map(chain => [chain.id, chain]));
    const start = chains.find(chain => chain.name === name || chain.id === name);
    shown = [];
    const queue = start ? [start] : [];
    while (queue.length) {
      const chain = queue.shift();
      if (shown.includes(chain)) continue;
      shown.push(chain);
      for (const event of chain.events) {
        for (const [key, value] of Object.entries(asObject(event.payload))) {
          if (typeof value === 'string' && /Id$/u.test(key) && byId.has(value)) queue.push(byId.get(value));
        }
      }
    }
  }
  return { pageId, version: context.page?.version ?? null, validatedAt: context.validatedAt ?? null, name, chains: shown,
    eventCount: shown.reduce((sum, chain) => sum + chain.events.length, 0) };
}

export function renderEvents(view) {
  const lines = [provenanceLine({ kind: 'page', id: view.pageId, version: view.version, validatedAt: view.validatedAt }),
    `${view.eventCount} events on ${view.chains.length} chains of the page, its blocks and data sources${view.name ? `, from ${view.name} and what its actions lead to` : ''}`];
  for (const chain of view.chains) {
    lines.push(`  ${chain.componentType ?? '?'} ${chain.name ?? ''} [${chain.id}]${chain.scope ? ` ${chain.scope}` : ''}`);
    for (const event of chain.events) lines.push(`    ${event.branch ? `  on ${event.branch}: ` : ''}${event.eventType ?? '?'} ${event.actionType ?? '?'}${event.target ? ` ${event.target}` : ''}${event.conditional ? ' (if condition)' : ''} [${event.id}${event.actionId ? ` · action ${event.actionId}` : ''}]`);
  }
  return lines.join('\n');
}

/** list_form_fields: each Form block's fields in their order, with type, label, widget and lookup, and the binding that reads each. */
export function formView(context, { pageId, block = null }) {
  const label = pageLabeller(context);
  const sourceIds = [...(context.dataSources ?? []), ...(context.appDataSources ?? [])].map(source => source.id).filter(Boolean);
  // A lookup names its source inside an expression; every source id it mentions, known to the page or not, is named.
  const mentioned = text => [...new Set([...sourceIds.filter(id => text.includes(id)), ...(text.match(/\be_[A-Za-z0-9_-]+/gu) ?? [])])];
  const forms = Object.values(blocksOf(context.page))
    .filter(item => componentTypeOf(item) === 'Form' && (!block || item.id === block || item.displayName === block));
  return {
    pageId, version: context.page?.version ?? null, validatedAt: context.validatedAt ?? null,
    forms: forms.map((form) => {
      const content = asObject(asObject(form.component).content);
      const schema = asObject(asObject(content.schema).schema);
      const layout = asObject(asObject(content.schema).layout);
      const fields = asObject(schema.properties);
      const required = new Set(Array.isArray(schema.required) ? schema.required : []);
      const order = Array.isArray(layout['ui:order']) ? layout['ui:order'].filter(name => fields[name]) : [];
      const names = [...order, ...Object.keys(fields).filter(name => !order.includes(name))];
      return {
        id: form.id, displayName: form.displayName ?? null, source: content.source ?? null, fieldsType: content.fieldsType ?? null,
        submitEvents: (form.events ?? []).filter(event => event?.eventType === 'onSubmit').length,
        fields: names.map((name) => {
          const field = asObject(fields[name]);
          const ui = asObject(layout[name]);
          const lookup = asObject(asObject(field.foreignKey).reference).dataSource ?? ui['ua:dataSourceMapping'] ?? null;
          return {
            name, label: ui['ui:label'] ?? field.title ?? null, type: field.type ?? null, format: field.format ?? null,
            fieldType: ui['ua:fieldType'] ?? null, widget: ui['ui:widget'] ?? null, required: required.has(name),
            ...(field.enum ? { values: field.enum } : {}), ...('minimum' in field ? { minimum: field.minimum } : {}), ...('maximum' in field ? { maximum: field.maximum } : {}),
            lookupSources: lookup ? mentioned(String(lookup)).map(label) : [],
            binding: `{{ ${form.id}['data']['${name}'] }}`,
          };
        }),
      };
    }),
  };
}

export function renderForms(view) {
  const lines = [provenanceLine({ kind: 'page', id: view.pageId, version: view.version, validatedAt: view.validatedAt }), `${view.forms.length} forms`];
  for (const form of view.forms) {
    lines.push(`  Form ${form.displayName ?? ''} [${form.id}] — ${form.fields.length} fields, source ${form.source ?? '?'}, ${form.submitEvents} onSubmit actions`);
    if (!form.fields.length) lines.push(`    no fields in the cached schema; list_form_fields reads fields a ${form.source ?? 'non-custom'} source supplies`);
    for (const field of form.fields) {
      lines.push(`    ${field.name}: ${field.fieldType ?? field.type ?? '?'}${field.format ? ` (${field.format})` : ''}${field.required ? ' required' : ''} "${field.label ?? ''}"${field.values ? ` one of ${field.values.join('|')}` : ''}${'minimum' in field ? ` min ${field.minimum}` : ''}${'maximum' in field ? ` max ${field.maximum}` : ''}${field.lookupSources.length ? ` lookup ${field.lookupSources.join(', ')}` : ''} · ${field.binding}`);
    }
  }
  return lines.join('\n');
}

/**
 * The names a binding on a page can read that a snapshot holds: the page
 * variables and functions, the data sources and the form fields, each with the
 * expression that reads it. This is not what get_context_keys answers: that
 * tool lists the keys no code declares (the two browser storages, page inputs
 * and params, the user's attributes, environment variable names). What a data
 * source returns and the keys a block exposes of itself (its knowledge sheet
 * lists them) are not in the snapshot either, and the rendering says so.
 */
export function contextKeys(context, { pageId, appId = null }) {
  const props = properties(context.page);
  const named = (map, prefix) => Object.values(asObject(map)).map(item => ({ id: item?.id ?? null, name: item?.name ?? null, type: item?.type ?? null,
    ...(item && 'initialValue' in item ? { initialValue: item.initialValue } : {}), binding: `{{ ${item?.id}['value'] }}`, kind: prefix }));
  return {
    pageId, appId, version: context.page?.version ?? null, validatedAt: context.validatedAt ?? null,
    variables: named(props.pageVariables, 'variable'),
    functions: named(props.pageFunctions, 'function'),
    dataSources: [...(context.dataSources ?? []).map(source => ({ source, scope: 'page' })), ...(context.appDataSources ?? []).map(source => ({ source, scope: 'app' }))]
      .map(({ source, scope }) => ({ id: source.id, name: nameOf(source), scope, binding: `{{ ${source.id}['data'] }}`, loading: `{{ ${source.id}['isLoading'] }}` })),
    formFields: formView(context, { pageId }).forms.flatMap(form => form.fields.map(field => ({ form: form.displayName ?? form.id, name: field.name, binding: field.binding }))),
  };
}

/** One page function or variable, by its name or id, whole: a function's body is in no other cache read. */
export function pageKey(context, token) {
  const props = properties(context.page);
  for (const [kind, map] of [['function', props.pageFunctions], ['variable', props.pageVariables]]) {
    const found = Object.entries(asObject(map)).find(([id, item]) => id === token || item?.id === token || item?.name === token);
    if (found) return { kind, id: found[1]?.id ?? found[0], name: found[1]?.name ?? null, item: found[1] };
  }
  return null;
}

export function renderPageKey(view, context) {
  return [provenanceLine({ kind: 'page', id: context.page?.id, version: context.page?.version, validatedAt: context.validatedAt }),
    `page ${view.kind} ${view.name ?? view.id} [${view.id}] · {{ ${view.id}['value'] }}`,
    JSON.stringify(view.item, null, 2)].join('\n');
}

export function renderContextKeys(view) {
  const lines = [provenanceLine({ kind: 'page', id: view.pageId, version: view.version, validatedAt: view.validatedAt })];
  lines.push(`variables (${view.variables.length})`, ...view.variables.map(item => `  ${item.name ?? item.id}: ${item.type ?? '?'}${'initialValue' in item ? ` = ${item.initialValue}` : ''} · ${item.binding}`));
  if (view.functions.length) {
    lines.push(`functions (${view.functions.length}) — the body of one: cache keys ${view.pageId}${view.appId ? ` --app-id ${view.appId}` : ''} --name <name>`,
      ...view.functions.map(item => `  ${item.name ?? item.id} · ${item.binding}`));
  }
  lines.push(`data sources (${view.dataSources.length})`, ...view.dataSources.map(item => `  ${item.name ?? item.id} ${item.scope} · ${item.binding} · ${item.loading}`));
  lines.push(`form fields (${view.formFields.length})`, ...view.formFields.map(item => `  ${item.form}.${item.name} · ${item.binding}`));
  lines.push('Not in the cache: the keys inside each data source\'s data (get_data_source_output_schemas), the keys a block exposes of itself, such as a table\'s selected row (the block\'s knowledge sheet), and session and local storage keys, page inputs and params, user attributes and environment variable names (get_context_keys).');
  return lines.join('\n');
}

/** The one page, as counts and names: what get_page_outlines answers before the tree. */
export function pageSummary(context, { pageId }) {
  const page = context.page;
  const blocks = blocksOf(page);
  const counts = {};
  for (const block of Object.values(blocks)) {
    const type = componentTypeOf(block) ?? 'unknown';
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return {
    page: {
      id: pageId,
      name: nameOf(page),
      slug: properties(page).slug ?? null,
      componentType: properties(page).componentType ?? null,
      version: page?.version ?? null,
      validatedAt: context.validatedAt ?? null,
      blocks: Object.keys(blocks).length,
    },
    componentTypes: Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([type, count]) => ({ type, count })),
    variables: Object.values(asObject(properties(page).pageVariables)).map(variable => ({ id: variable?.id ?? null, name: variable?.name ?? null, type: variable?.type ?? null })),
    layoutSlots: Object.entries(asObject(properties(page).layout)).filter(([, value]) => value).map(([slot]) => slot),
    dataSources: (context.dataSources ?? []).map(source => ({ id: source.id, name: nameOf(source) })),
    appDataSources: (context.appDataSources ?? []).map(source => ({ id: source.id, name: nameOf(source) })),
  };
}

export function renderPageSummary(view) {
  const { page } = view;
  const names = list => (list.length ? list.map(item => item.name ?? item.id).join(', ') : '—');
  return [
    provenanceLine({ kind: 'page', id: page.id, version: page.version, validatedAt: page.validatedAt }),
    `${page.name ?? '(unnamed)'} /${page.slug ?? '?'} — ${page.blocks} blocks, slots: ${view.layoutSlots.join(', ') || '—'}`,
    `component types: ${view.componentTypes.map(entry => `${entry.type} ${entry.count}`).join(', ') || '—'}`,
    `page data sources: ${names(view.dataSources)}`,
    `app data sources: ${names(view.appDataSources)}`,
    `variables (${view.variables.length}): ${view.variables.map(variable => `${variable.name ?? variable.id}:${variable.type ?? '?'}`).join(', ') || '—'}`,
  ].join('\n');
}

const childrenByParent = (blocks) => {
  const children = new Map();
  for (const block of Object.values(blocks)) {
    const parent = block?.parentId ?? null;
    children.set(parent, [...(children.get(parent) ?? []), block]);
  }
  return children;
};

// The page draws a block's children in its content.blockIds order, then the
// ones its slots name; a child nothing names comes last, in stored order.
const childrenInStoredOrder = (block, kids) => {
  const named = [...(asObject(asObject(block?.component).content).blockIds ?? [])];
  walkStrings(asObject(block?.component).slots, '', (_, value) => named.push(value));
  const rank = (child) => { const index = named.indexOf(child.id); return index === -1 ? Infinity : index; };
  return [...kids].sort((left, right) => rank(left) - rank(right));
};

/** get_page_outlines view=tree: the parentId tree as componentType + displayName. */
export function pageOutline(context, { pageId, root = null, depth = Infinity }) {
  const blocks = blocksOf(context.page);
  const children = childrenByParent(blocks);
  const known = new Set(Object.keys(blocks));
  // A block whose parent is missing from the page is a root too: the tree must
  // show every block, or a reader concludes a block does not exist.
  const roots = root
    ? (blocks[root] ? [blocks[root]] : [])
    : Object.values(blocks).filter(block => !block?.parentId || !known.has(block.parentId));
  const nodes = [];
  const walk = (block, level) => {
    nodes.push({ id: block.id, level, componentType: componentTypeOf(block), displayName: block.displayName ?? null,
      parentId: block.parentId ?? null, dataSourceIds: block.dataSourceIds ?? [], hidden: block?.visibility?.value === false });
    if (level + 1 > depth) return;
    for (const child of childrenInStoredOrder(block, children.get(block.id) ?? [])) walk(child, level + 1);
  };
  for (const block of roots) walk(block, 0);
  return { pageId, validatedAt: context.validatedAt ?? null, version: context.page?.version ?? null, total: Object.keys(blocks).length, shown: nodes.length, nodes, missingRoot: Boolean(root) && !blocks[root] };
}

export function renderOutline(view) {
  const lines = [provenanceLine({ kind: 'page', id: view.pageId, version: view.version, validatedAt: view.validatedAt }), `${view.shown} of ${view.total} blocks`];
  for (const node of view.nodes) {
    const label = [node.componentType ?? '?', node.displayName, `[${node.id}]`, node.hidden ? '(hidden)' : null,
      node.dataSourceIds.length ? `ds:${node.dataSourceIds.join(',')}` : null].filter(Boolean).join(' ');
    lines.push(`${'  '.repeat(node.level + 1)}${label}`);
  }
  return lines.join('\n');
}

const pathAt = (value, path) => path.split('.').reduce((current, key) => (current == null ? current : current[key]), value);

/** get_blocks, but resolving a displayName as well as an id — the cache knows both, the tool takes ids only. */
export function findBlocks(context, { pageId, name = null, id = null, match = null, field = null, limit = 10 }) {
  const blocks = blocksOf(context.page);
  // Several ids, comma separated, read a block and its children in one call.
  const ids = id ? String(id).split(',').map(part => part.trim()).filter(Boolean) : null;
  const wanted = (block) => {
    if (ids) return ids.includes(block.id);
    if (name) return String(block.displayName ?? '') === name;
    if (match) return new RegExp(match, 'iu').test(String(block.displayName ?? '')) || new RegExp(match, 'iu').test(String(componentTypeOf(block) ?? ''));
    return true;
  };
  const found = Object.values(blocks).filter(wanted);
  const shaped = found.slice(0, limit).map(block => (field
    ? { id: block.id, displayName: block.displayName ?? null, componentType: componentTypeOf(block), field, value: pathAt(block, field) ?? pathAt(block.component, field) ?? null }
    : block));
  // get_blocks names an id it cannot find, so a stale id in a brief shows at the first read.
  const foundIds = new Set(found.map(block => block.id));
  const notFound = ids ? ids.filter(wantedId => !foundIds.has(wantedId)) : [];
  return { pageId, validatedAt: context.validatedAt ?? null, version: context.page?.version ?? null, matched: found.length, shown: shaped.length, field, notFound, blocks: shaped };
}

export function renderBlocks(view) {
  const lines = [provenanceLine({ kind: 'page', id: view.pageId, version: view.version, validatedAt: view.validatedAt }), `${view.shown} of ${view.matched} matching blocks${view.field ? ` — field ${view.field}` : ''}`];
  for (const block of view.blocks) lines.push(JSON.stringify(block, null, 2));
  if (view.matched > view.shown) lines.push(`${view.matched - view.shown} more; narrow with --name or raise --limit.`);
  if (view.notFound?.length) lines.push(`Not on this page: ${view.notFound.join(', ')}.`);
  return lines.join('\n');
}

const BINDING_FIELDS = Object.freeze(['dpOn', 'dataSourceIds']);

// Every string, number and boolean, as text, with its path.
function walkLeaves(value, path, visit) {
  if (['string', 'number', 'boolean'].includes(typeof value)) { visit(path, String(value)); return; }
  if (Array.isArray(value)) { value.forEach((item, index) => walkLeaves(item, `${path}[${index}]`, visit)); return; }
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) walkLeaves(item, path ? `${path}.${key}` : key, visit);
}
const lastKey = path => String(path).replace(/\[\d+\]$/u, '').split('.').at(-1);

// The block itself or the nearest block above it whose visibility is a fixed
// false: a match there is sample or placeholder content no one sees.
function hiddenAncestor(blocks, block) {
  const seen = new Set();
  for (let current = block; current && !seen.has(current.id); current = blocks[current.parentId]) {
    seen.add(current.id);
    if (current?.visibility?.value === false) return current;
  }
  return null;
}

function walkStrings(value, path, visit) {
  if (typeof value === 'string') { visit(path, value); return; }
  if (Array.isArray(value)) { value.forEach((item, index) => walkStrings(item, `${path}[${index}]`, visit)); return; }
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) walkStrings(item, path ? `${path}.${key}` : key, visit);
}

/**
 * search_app over the cache: every block of every cached page whose text, name,
 * binding or config matches. The tool can do this one app at a time and the
 * whole answer is a round trip; here it is a scan of files already on disk, and
 * it can cross apps.
 */
export function grepPages(pages, { pattern, flags = 'iu', field = null, limit = 50, perBlock = 3, includeDataSources = true }) {
  const regex = new RegExp(pattern, flags);
  const hits = [];
  let matched = 0;
  const snippet = value => (value.length > 200 ? `${value.slice(0, 200)}…` : value);
  const record = (hit) => {
    matched++;
    if (hits.length < limit) hits.push(hit);
  };
  // Every matching path is a hit, but one block that mentions the pattern in
  // forty places must not fill the answer: the first `perBlock` of them stand
  // for it and the count still reports the rest.
  const scan = (scope, base) => {
    let taken = 0;
    // A key is page text too: `contentStyle` is a key with the value `solid`,
    // and a grep for the key found nothing while a block held it.
    walkLeaves(scope, '', (path, value) => {
      if (taken >= perBlock || !(regex.test(value) || regex.test(lastKey(path)))) return;
      taken++;
      const at = path || '(self)';
      record({ ...base, at, value: snippet(value), kind: base.kind ?? (BINDING_FIELDS.some(name => at.startsWith(name)) ? 'binding' : 'block') });
    });
  };
  for (const entry of pages) {
    const blocks = blocksOf(entry.page);
    for (const block of Object.values(blocks)) {
      const scope = field ? { [field]: pathAt(block, field) ?? pathAt(block.component, field) } : block;
      const hiddenBy = hiddenAncestor(blocks, block);
      scan(scope, { appId: entry.appId, pageId: entry.pageId, pageName: entry.pageName ?? null, blockId: block.id,
        displayName: block.displayName ?? null, componentType: componentTypeOf(block),
        ...(hiddenBy ? { hiddenBy: { id: hiddenBy.id, name: hiddenBy.displayName ?? null } } : {}) });
    }
    if (field) continue;
    // A function body or a variable's initial value is page text too: a grep
    // that skipped them answered 0 matches for a phrase sitting in a function.
    const props = properties(entry.page);
    for (const [kind, map, key] of [['function', props.pageFunctions, 'functionId'], ['variable', props.pageVariables, 'variableId']]) {
      for (const [id, item] of Object.entries(asObject(map))) {
        scan(item, { appId: entry.appId, pageId: entry.pageId, pageName: entry.pageName ?? null, [key]: item?.id ?? id,
          displayName: item?.name ?? null, componentType: kind === 'function' ? 'PageFunction' : 'PageVariable', kind });
      }
    }
    if (!includeDataSources) continue;
    for (const source of entry.dataSources ?? []) {
      scan(properties(source), { appId: entry.appId, pageId: entry.pageId, pageName: entry.pageName ?? null, dataSourceId: source.id,
        displayName: nameOf(source), componentType: 'DataSource', kind: 'data-source' });
    }
  }
  return { pattern, field, matched, shown: hits.length, hits };
}

/** One scanTargets stale entry as text. A whole-app miss (appId === id) has no single page to point at, so it
 * names only the status; a stale page names its app too, with the exact command to refresh just that one. */
export function formatStale(entry) {
  if (typeof entry === 'string') return entry; // defensive: an older caller that never threaded appId
  if (!entry.appId || entry.appId === entry.id) return `${entry.id} (${entry.status})`;
  return `${entry.id} (${entry.status}); refresh one with cache page --app-id ${entry.appId} ${entry.id} --refresh`;
}

export function renderGrep(view, { scanned }) {
  const lines = [`grep /${view.pattern}/${view.field ? ` in ${view.field}` : ''} — ${view.matched} matches in ${scanned.pages} cached pages of ${scanned.apps} apps${scanned.stale.length ? `; ${scanned.stale.length} stale or missing: ${scanned.stale.map(formatStale).join(', ')}` : ''}`];
  for (const hit of view.hits) {
    const hidden = hit.hiddenBy ? (hit.hiddenBy.id === hit.blockId ? '(always hidden)' : `(always hidden: inside ${hit.hiddenBy.name ?? hit.hiddenBy.id} [${hit.hiddenBy.id}])`) : null;
    lines.push([`${hit.pageName ?? hit.pageId} [${hit.pageId}]`, hit.componentType ?? '?', hit.displayName,
      `[${hit.blockId ?? hit.dataSourceId ?? hit.functionId ?? hit.variableId}]`, hidden, `${hit.at}: ${hit.value}`].filter(Boolean).join(' '));
  }
  if (view.matched > view.shown) lines.push(`${view.matched - view.shown} more; raise --limit.`);
  return lines.join('\n');
}

/**
 * get_data_sources: each source with what on the page consumes it — a block, a
 * page function or a page variable. With `name` or `id`, only that source, in
 * full: what each parameter is bound to, and the whole stored source.
 *
 * A consumer is anything whose own stored config names the source, the same
 * text match the prune rules use, not a block's `dataSourceIds` alone: a page
 * function reads a source in its body, and a binding written
 * `(e_x || ({}))['data']` stores no id list at all, so both read as "consumed
 * by nothing" and a builder could delete a source something depends on.
 */
export function dataSourceView(context, { pageId, name = null, id = null }) {
  const pageProps = properties(context.page);
  const candidate = (item, itemId, componentType, displayName) => ({ id: itemId, displayName, componentType,
    text: JSON.stringify({ ...asObject(item), id: undefined }) });
  const candidates = [
    ...Object.values(blocksOf(context.page)).map(block => candidate(block, block.id, componentTypeOf(block), block.displayName ?? null)),
    ...Object.entries(asObject(pageProps.pageFunctions)).map(([key, item]) => candidate(item, item?.id ?? key, 'PageFunction', item?.name ?? null)),
    ...Object.entries(asObject(pageProps.pageVariables)).map(([key, item]) => candidate(item, item?.id ?? key, 'PageVariable', item?.name ?? null)),
  ];
  const consumers = (sourceId) => candidates.filter(item => item.id !== sourceId && item.text.includes(sourceId))
    .map(({ text, ...item }) => item);
  const chosen = Boolean(name || id);
  const wanted = source => !chosen || (id && source.id === id) || (name && String(nameOf(source) ?? '').toLowerCase() === String(name).toLowerCase());
  const shape = (source, scope) => {
    const props = properties(source);
    const parameters = asObject(asObject(props.inputs).parameters);
    return {
      id: source.id, name: nameOf(source), scope, type: props.type ?? null,
      automationId: asObject(props.inputs).automationId ?? null,
      parameters: Object.keys(parameters),
      dependsOn: (props.dpOn ?? []).map(dependency => dependency?.id).filter(Boolean),
      callbacks: Object.keys(asObject(props.callbacks)),
      consumers: consumers(source.id),
      ...(chosen ? { bindings: Object.entries(parameters).map(([key, value]) => ({ name: key, value })), source } : {}),
    };
  };
  return {
    pageId, validatedAt: context.validatedAt ?? null,
    dataSources: [
      ...(context.dataSources ?? []).filter(wanted).map(source => shape(source, 'page')),
      ...(context.appDataSources ?? []).filter(wanted).map(source => shape(source, 'app')),
    ],
  };
}

const PAGE_KEY_TYPES = new Set(['PageFunction', 'PageVariable']);

export function renderDataSources(view) {
  const lines = [provenanceLine({ kind: 'page', id: view.pageId, validatedAt: view.validatedAt }), `${view.dataSources.length} data sources`];
  for (const source of view.dataSources) {
    lines.push(`  ${source.name ?? source.id} [${source.id}] ${source.scope} ${source.type ?? ''}${source.automationId ? ` automation ${source.automationId}` : ''}`);
    if (source.bindings) lines.push(`    parameters:${source.bindings.length ? '' : ' —'}`, ...source.bindings.map(binding => `      ${binding.name} = ${JSON.stringify(binding.value)}`));
    else lines.push(`    parameters: ${source.parameters.join(', ') || '—'}`);
    lines.push(`    depends on: ${source.dependsOn.join(', ') || '—'}${source.callbacks.length ? ` · callbacks: ${source.callbacks.join(', ')}` : ''}`);
    lines.push(`    consumed by: ${source.consumers.map(consumer => `${consumer.displayName ?? consumer.id}[${consumer.id}]${PAGE_KEY_TYPES.has(consumer.componentType) ? ` ${consumer.componentType}` : ''}`).join(', ') || 'nothing on this page names it'}`);
    if (source.source) lines.push(JSON.stringify(source.source, null, 2));
  }
  return lines.join('\n');
}

const DEPS_NOT_COVERED = 'Dangling references (a binding to a block, source or variable the page no longer has) are not covered here; read them with get_dependency_graph.';

/** get_dependency_graph: the edges a page's blocks and sources declare. */
export function dependencyGraph(context, { pageId }) {
  const blocks = blocksOf(context.page);
  const label = (id) => {
    const block = blocks[id];
    if (block) return `${block.displayName ?? id}[${id}]`;
    const source = [...(context.dataSources ?? []), ...(context.appDataSources ?? [])].find(item => item.id === id);
    return source ? `${nameOf(source) ?? id}[${id}]` : id;
  };
  const edges = [];
  for (const block of Object.values(blocks)) {
    for (const dependency of block.dpOn ?? []) {
      const from = typeof dependency === 'string' ? dependency : dependency?.id;
      if (from) edges.push({ from, to: block.id, via: 'dpOn', paths: Array.isArray(dependency?.p) ? dependency.p : [] });
    }
    for (const sourceId of block.dataSourceIds ?? []) edges.push({ from: sourceId, to: block.id, via: 'dataSourceIds', paths: [] });
  }
  for (const source of [...(context.dataSources ?? []), ...(context.appDataSources ?? [])]) {
    for (const dependency of properties(source).dpOn ?? []) {
      if (dependency?.id) edges.push({ from: dependency.id, to: source.id, via: 'dataSource.dpOn', paths: Array.isArray(dependency.p) ? dependency.p : [] });
    }
  }
  return { pageId, validatedAt: context.validatedAt ?? null, edges: edges.map(edge => ({ ...edge, fromLabel: label(edge.from), toLabel: label(edge.to) })),
    notCovered: DEPS_NOT_COVERED };
}

export function renderDependencies(view) {
  const lines = [provenanceLine({ kind: 'page', id: view.pageId, validatedAt: view.validatedAt }), `${view.edges.length} edges`];
  for (const edge of view.edges) lines.push(`  ${edge.fromLabel} -> ${edge.toLabel} (${edge.via})${edge.paths.length ? ` ${edge.paths.join(', ')}` : ''}`);
  lines.push(view.notCovered);
  return lines.join('\n');
}

// A picklist stores one of its codes: `oneOf: [{const, title}]` beside format
// `single-select` (on `items` for a list of them). A lookup names the object it
// points at in `foreignKey.reference`, as `ENTITY_ID:<objectId>`. Both are what
// a spec and a record write need, and both read as a plain string without this.
const choicesOf = (field) => {
  const list = Array.isArray(field?.oneOf) ? field.oneOf : Array.isArray(field?.items?.oneOf) ? field.items.oneOf : null;
  return list ? list.filter((choice) => choice && typeof choice === 'object' && 'const' in choice).map((choice) => ({ code: choice.const, title: choice.title ?? null })) : null;
};
const lookupOf = (field) => {
  const reference = field?.foreignKey?.reference ?? field?.items?.foreignKey?.reference;
  return typeof reference === 'string' && reference ? reference.replace(/^ENTITY_ID:/u, '') : null;
};

/** describe_storage_object / get_objects: the fields, their flags and the indexes. */
export function objectView(snapshot) {
  const entity = snapshot.entity;
  const schema = asObject(asObject(entity.schema).schema);
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const metadata = asObject(entity.metadata);
  const uniqueFields = new Set(Array.isArray(metadata.uniqueKeyFields) ? metadata.uniqueKeyFields : []);
  return {
    object: { id: entity.id, name: entity.name ?? null, plural: entity.pluralName ?? null, description: entity.description ?? null,
      version: snapshot.version, cachedAt: snapshot.cachedAt, fieldCount: entity.columnCounts ?? Object.keys(asObject(schema.properties)).length },
    fields: Object.entries(asObject(schema.properties)).map(([name, field]) => {
      const choices = choicesOf(field), lookup = lookupOf(field);
      return {
        name, type: field?.type ?? null, title: field?.title ?? null, required: required.has(name),
        // A key decides whether a planned value can be written at all (an
        // auto-generated primary key takes none), so the view never hides it.
        ...(field?.primaryKey === true ? { primaryKey: true } : {}),
        ...(field?.uniqueKey === true || uniqueFields.has(name) ? { uniqueKey: true } : {}),
        searchable: field?.searchable ?? false, filterable: field?.filterable ?? false, sortable: field?.sortable ?? false,
        ...(field?.enum ? { values: field.enum } : {}), ...(field?.format ? { format: field.format } : {}),
        ...(choices ? { choices } : {}),
        ...(lookup ? { lookup, lookupEnforced: field?.foreignKeyConstraintEnforced === true } : {}),
      };
    }),
    indexes: (metadata.customIndexDefinitions ?? []).map(index => ({ name: index?.name ?? null, status: index?.status ?? null,
      fields: (index?.indexFieldMetadataList ?? []).map(entry => entry?.field).filter(Boolean) })),
    flags: { auditable: metadata.auditable ?? null, cacheable: metadata.cacheable ?? null, captureReporting: metadata.captureReporting ?? null },
  };
}

export function renderObject(view) {
  const lines = [
    provenanceLine({ kind: 'object', id: view.object.id, version: view.object.version, cachedAt: view.object.cachedAt }),
    `${view.object.name ?? '(unnamed)'} — ${view.fields.length} fields${view.object.description ? `: ${view.object.description}` : ''}`,
  ];
  for (const field of view.fields) {
    const flags = [field.searchable && 'searchable', field.filterable && 'filterable', field.sortable && 'sortable'].filter(Boolean);
    lines.push(`  ${field.name}: ${field.type ?? '?'}${field.format ? ` (${field.format})` : ''}${field.required ? ' required' : ''}`
      + `${field.primaryKey ? ' primary key' : ''}${field.uniqueKey ? ' unique' : ''}`
      + `${field.values ? ` one of ${field.values.join('|')}` : ''}`
      + `${field.choices ? ` codes ${field.choices.map((choice) => `${choice.code}${choice.title && choice.title !== choice.code ? ` "${choice.title}"` : ''}`).join(', ')}` : ''}`
      + `${field.lookup ? ` lookup to ${field.lookup}${field.lookupEnforced ? ' (enforced)' : ''}` : ''}`
      + `${flags.length ? ` (${flags.join(', ')})` : ''}`);
  }
  lines.push(`indexes: ${view.indexes.map(index => `${index.name}(${index.fields.join(', ')})${index.status && index.status !== 'SUCCESS' ? ` ${index.status}` : ''}`).join(', ') || '—'}`);
  return lines.join('\n');
}

const nodesOf = entity => (Array.isArray(asObject(entity).nodes) ? entity.nodes : []);
const triggerOf = entity => nodesOf(entity).find(node => node?.trigger) ?? null;
// The trigger node declares both halves of the contract: `setup` is what a
// caller passes in, `result` is what every answer hands back.
const triggerSchema = (trigger, half) => asObject(asObject(asObject(trigger).inputs)[half]);

/** open_workflow (the nodes and the trigger) and search_workflows (what is deployed), from the snapshot. */
// An AI agent's own record: what it is, which models it runs on, and the
// switches a tenant actually sets. Its tools, skills, tasks and knowledge are
// separate entities the record does not carry, so the view says so rather than
// showing an empty list the reader would take as "none attached".
const MODEL_FIELDS = Object.freeze([
  ['topicSelection', 'topicExecutionSettings', 'topicSelectionModel'],
  ['topicExecution', 'topicExecutionSettings', 'topicExecutionModel'],
  ['answerGeneration', 'responseGenerationSettings', 'answerGenerationModel'],
  ['queryRephrasing', 'preProcessingSettings', 'queryRephrasingModel'],
  ['ranking', 'preProcessingSettings', 'rankingModel'],
  ['embedding', 'indexingSettings', 'embeddingModel'],
]);
// The record holds dozens of booleans and leaves most of them out; only the
// ones a tenant set are worth a line, and `true` and `false` both count as set.
const SWITCH_FIELDS = Object.freeze(['archived', 'mcpEnabled', 'disableDefaultTools', 'defaultToolsNotNeeded', 'deferToolLoading',
  'secureRuns', 'summarise', 'shouldSummarise', 'appendSummaryMessage', 'disableUserContext', 'useSessionIdAuth', 'useAgentCore',
  'enableCostCalculation', 'enableDocumentVisionByDefault', 'fileUploadFlowDisabled', 'indexAttachmentDisabled',
  'disableAsyncFileIndexing', 'feedbackIndexingEnabled', 'dateTimeGroundingDisabled', 'suppressPlatformProtocol',
  'userConnectionRuntimeCheck']);
const PREVIEW_CHARS = 240;
const preview = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return { chars: text.length, lines: text.split('\n').length,
    text: text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text };
};

// `defaultTools` and `multiAgentConfig` are maps of switches, not lists: only
// the ones turned on are worth naming, and a map that is present with
// everything off must not read as "none configured".
const switchedOn = (value) => Object.entries(asObject(value)).filter(([, on]) => on === true).map(([key]) => key);

export function agentView(snapshot) {
  const entity = snapshot.entity;
  const properties = asObject(entity.properties);
  const deployment = asObject(entity.deploymentState);
  return {
    agent: {
      id: entity.id, name: properties.name ?? null, description: properties.description ?? null,
      type: properties.agentType ?? null, version: snapshot.version, cachedAt: snapshot.cachedAt,
      // `visibility` is `{ type: PRIVATE }` on the agents that have it at all.
      visibility: typeof properties.visibility === 'string' ? properties.visibility : asObject(properties.visibility).type ?? null,
      deployed: { version: deployment.version ?? null, entityVersion: deployment.entityVersion ?? null, at: iso(deployment.deployedAt) },
      deployedOn: Array.isArray(properties.deployedOn) ? properties.deployedOn : [],
      multiAgent: properties.multiAgentConfig === undefined ? null
        : { enabled: switchedOn(properties.multiAgentConfig), configured: Object.keys(asObject(properties.multiAgentConfig)) },
    },
    role: properties.role ?? null,
    goal: preview(properties.goal),
    // The "Enable memory" switch and the conversation starters, as get_agent
    // shows them. Null when the cached record does not hold them, so an older
    // copy is never read as "memory off" or "no starters".
    memory: properties.longTermMemorySettings === undefined ? null : asObject(properties.longTermMemorySettings).enabled === true,
    conversationStarters: Array.isArray(properties.conversationStarters) ? properties.conversationStarters : null,
    instructions: preview(properties.instructions),
    models: Object.fromEntries(MODEL_FIELDS.map(([label, group, key]) => [label, asObject(properties[group])[key] ?? null])),
    defaultTools: Array.isArray(properties.defaultTools)
      ? properties.defaultTools.map(tool => (typeof tool === 'string' ? tool : tool?.name ?? tool?.id ?? null)).filter(Boolean)
      : switchedOn(properties.defaultTools),
    switches: Object.fromEntries(SWITCH_FIELDS.filter(key => properties[key] !== undefined).map(key => [key, properties[key]])),
    liveOnly: AGENT_LIVE_ONLY,
  };
}

export function renderAgent(view) {
  const { agent } = view;
  const lines = [
    provenanceLine({ kind: 'ai-agent', id: agent.id, version: agent.version, cachedAt: agent.cachedAt }),
    `${agent.name ?? '(unnamed)'} — ${agent.type ?? 'unknown type'}${agent.description ? `: ${agent.description}` : ''}`,
    `deployed version ${agent.deployed.version ?? '—'} (entity version ${agent.deployed.entityVersion ?? '—'})${agent.deployed.at ? ` at ${agent.deployed.at}` : ''}`
      + `${agent.deployedOn.length ? ` · on ${agent.deployedOn.join(', ')}` : ''}${agent.visibility ? ` · ${agent.visibility}` : ''}`,
    agent.multiAgent ? `multi-agent: ${agent.multiAgent.enabled.join(', ') || `configured (${agent.multiAgent.configured.join(', ')}), none on`}` : null,
    view.role ? `role: ${view.role}` : null,
    view.goal ? `goal: ${view.goal.text}` : null,
    view.memory === null ? null : `memory: ${view.memory ? 'on' : 'off'}`,
    view.conversationStarters === null ? null
      : `conversation starters (${view.conversationStarters.length}): ${view.conversationStarters.join(' · ') || '—'}`,
    view.instructions
      ? `instructions (${view.instructions.chars} chars, ${view.instructions.lines} lines): ${view.instructions.text}`
      : 'instructions: none saved',
    `models: ${Object.entries(view.models).filter(([, id]) => id).map(([label, id]) => `${label} ${id}`).join(', ') || '—'}`,
    `default tools on: ${view.defaultTools.join(', ') || '—'}`,
    `switches: ${Object.entries(view.switches).map(([key, value]) => `${key}=${value}`).join(', ') || '—'}`,
    'not in this record, read live:',
    ...view.liveOnly.map(([subject, tools]) => `  ${subject} — ${tools}`),
  ].filter(Boolean);
  return lines.join('\n');
}

export function workflowView(snapshot) {
  const entity = snapshot.entity;
  const nodes = Array.isArray(entity.nodes) ? entity.nodes : [];
  const trigger = nodes.find(node => node?.trigger) ?? null;
  return {
    automation: { id: entity.id, name: entity.name ?? null, description: entity.description ?? null, version: snapshot.version,
      // `deployedVersion` counts deploys (1 after the first, whatever was saved);
      // the saved version that is live is the deployment's `workflowVersion`,
      // which search_workflows calls `definitionVersion`.
      cachedAt: snapshot.cachedAt, deployedVersion: entity.deployedVersion ?? null, deployed: asObject(entity.deploymentState).status ?? null,
      definitionVersion: asObject(entity.deploymentState).workflowVersion ?? null,
      deployedAt: iso(asObject(entity.deploymentState).deployedAt), nodeCount: nodes.length, edgeCount: Array.isArray(entity.edges) ? entity.edges.length : 0 },
    trigger: trigger ? { id: trigger.id, type: asObject(trigger.trigger).type ?? trigger.type ?? null, title: trigger.title ?? null,
      inputs: Object.keys(asObject(triggerSchema(trigger, 'setup').properties)),
      outputs: Object.keys(asObject(triggerSchema(trigger, 'result').properties)) } : null,
    nodes: nodes.map(node => ({ id: node?.id ?? null, index: node?.index ?? null, type: node?.type ?? null, title: node?.title ?? null,
      subTitle: node?.subTitle ?? null, resource: asObject(node?.context).resourceName ?? null, app: asObject(node?.context).appName ?? null, skipped: node?.skip ?? false })),
    edges: Array.isArray(entity.edges) ? entity.edges.map(edge => ({ from: edge?.fromNodeId ?? edge?.sourceNodeId ?? edge?.from ?? null, to: edge?.toNodeId ?? edge?.targetNodeId ?? edge?.to ?? null })) : [],
  };
}

export function renderWorkflow(view) {
  const { automation } = view;
  const lines = [
    provenanceLine({ kind: 'automation', id: automation.id, version: automation.version, cachedAt: automation.cachedAt }),
    `${automation.name ?? '(unnamed)'} — ${automation.nodeCount} nodes, ${automation.edgeCount} edges`,
    automation.deployedVersion == null && automation.definitionVersion == null ? 'live: not deployed in the cached copy'
      : `live: saved version ${automation.definitionVersion ?? '?'} (definitionVersion)${automation.deployedAt ? ` deployed at ${automation.deployedAt}` : ''}; deployedVersion ${automation.deployedVersion ?? '—'} counts deploys, not saves`,
    automation.description ? `${automation.description}` : null,
    view.trigger ? `trigger ${view.trigger.type ?? '?'} ${view.trigger.title ?? ''} [${view.trigger.id}]${view.trigger.inputs.length ? ` inputs: ${view.trigger.inputs.join(', ')}` : ''}${view.trigger.outputs.length ? ` · outputs: ${view.trigger.outputs.join(', ')}` : ''}` : 'trigger: none in the cached draft',
  ].filter(Boolean);
  for (const node of view.nodes) lines.push(`  ${String(node.index ?? '?').padStart(3, ' ')} ${node.type ?? '?'} ${node.title ?? ''} [${node.id}]${node.resource ? ` ${node.app ?? ''}/${node.resource}` : ''}${node.skipped ? ' (skipped)' : ''}`);
  return lines.join('\n');
}

// A field's type may be a list (`["object", "null"]`), and an array keeps its
// fields under `items`: both hold fields a planner checks a path against, and a
// contract that printed only `rows: array` read as "declared without fields".
const typesOf = field => (Array.isArray(field?.type) ? field.type : [field?.type]);
const schemaFields = (schema) => {
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  return Object.entries(asObject(schema.properties)).map(([name, field]) => {
    const items = asObject(field?.items);
    const inner = typesOf(field).includes('object') && field.properties ? field
      : typesOf(field).includes('array') && items.properties ? items : null;
    return {
      name, type: Array.isArray(field?.type) ? field.type.join(',') : field?.type ?? null, required: required.has(name),
      ...(field?.format ? { format: field.format } : {}), ...(field?.enum ? { values: field.enum } : {}),
      ...(inner ? { fields: schemaFields(inner), ...(inner === items ? { itemFields: true } : {}) } : {}),
    };
  });
};

// What an automation does by itself once it is deployed, from its trigger node:
// a schedule runs on its cadence, a webhook or an app event on each call or
// event. A callable or an API trigger runs only when something calls it, so it
// answers null. The schedule node keeps its settings in its inputs: cron is the
// mode (INTERVAL or EXPRESSION), and interval with frequency, or the expression
// with its timezone.
const FREQUENCY_WORDS = Object.freeze({ SECONDS: 'second', MINUTES: 'minute', HOURS: 'hour', DAYS: 'day', WEEKS: 'week', MONTHS: 'month' });
const ON_CALL_APPS = new Set(['callables', 'custom_http_endpoint', 'internal_http_endpoint']);
export function runsByItself(entity) {
  const trigger = triggerOf(entity);
  if (!trigger) return null;
  const app = asObject(trigger.context).appName ?? null;
  const type = String(asObject(trigger.trigger).type ?? '').toUpperCase();
  const inputs = asObject(trigger.inputs);
  if (app === 'schedule' || type.includes('SCHEDUL')) {
    if (inputs.cron === 'EXPRESSION' && inputs.expression) {
      return `runs by itself on the schedule ${inputs.expression}${inputs.timezone && !String(inputs.timezone).includes('{{') ? ` (${inputs.timezone})` : ''}`;
    }
    const unit = FREQUENCY_WORDS[String(inputs.frequency ?? '').toUpperCase()];
    const every = Number(inputs.interval);
    if (unit && every > 0) return `runs by itself every ${every === 1 ? unit : `${every} ${unit}s`}`;
    return 'runs by itself on a schedule';
  }
  if (app === 'webhooks' || type.includes('WEBHOOK')) return 'runs by itself on every call to its webhook address';
  if (type === 'CALLABLE' || ON_CALL_APPS.has(app) || !app) return null;
  return `runs by itself on each ${app} event "${trigger.title ?? asObject(trigger.context).resourceName ?? 'event'}"`;
}

/** describe_callable_workflow: what a caller passes in and what every answer hands back, from the trigger node. */
export function workflowContract(snapshot) {
  const entity = snapshot.entity;
  const trigger = triggerOf(entity);
  const answers = nodesOf(entity).filter(node => asObject(node?.context).resourceName === 'callables_return_to_automation')
    .map(node => ({ id: node.id, title: node.subTitle ?? node.title ?? null, keys: Object.keys(asObject(asObject(node.inputs).result)) }));
  // There is no separately cached copy of the deployed definition: this contract is
  // built from the last-synced draft, which can hold an input or output the
  // deployed automation does not accept yet. `definitionVersion` is the saved
  // version that IS deployed (search_workflows' own name for it); when it differs
  // from the cached `version`, the draft moved since the deploy, and the caller must
  // say so rather than quote this contract as what live calls accept.
  const definitionVersion = asObject(entity.deploymentState).workflowVersion ?? null;
  return {
    automation: { id: entity.id, name: entity.name ?? null, version: snapshot.version, cachedAt: snapshot.cachedAt,
      definitionVersion, deployedAt: iso(asObject(entity.deploymentState).deployedAt),
      aheadOfDeploy: definitionVersion != null && snapshot.version != null && String(definitionVersion) !== String(snapshot.version) },
    trigger: trigger ? { id: trigger.id, type: asObject(trigger.trigger).type ?? null, resource: asObject(trigger.context).resourceName ?? null } : null,
    inputs: schemaFields(triggerSchema(trigger, 'setup')),
    outputs: schemaFields(triggerSchema(trigger, 'result')),
    answers,
  };
}

const renderField = (field, depth = 1) => [
  `${'  '.repeat(depth)}${field.name}: ${field.type ?? '?'}${field.format ? ` (${field.format})` : ''}${field.required ? ' required' : ''}${field.values ? ` one of ${field.values.join('|')}` : ''}${field.itemFields ? `, each item has ${field.fields.length} fields:` : ''}`,
  ...(field.fields ?? []).flatMap(child => renderField(child, depth + 1)),
];

export function renderContract(view) {
  const { automation } = view;
  const lines = [
    provenanceLine({ kind: 'automation', id: automation.id, version: automation.version, cachedAt: automation.cachedAt }),
    `${automation.name ?? '(unnamed)'} — trigger ${view.trigger?.type ?? 'none in the cached draft'}`,
    automation.aheadOfDeploy ? `This contract is the cached DRAFT (version ${automation.version}), not the deployed definition (version ${automation.definitionVersion}, deployed ${automation.deployedAt ?? 'unknown when'}): it can show an input or output the live automation does not accept yet. Deploy it, or check search_workflows, before quoting this as what a caller must send.` : null,
    `inputs (${view.inputs.length})${view.inputs.length ? '' : ': none declared'}`,
    ...view.inputs.flatMap(field => renderField(field)),
    `outputs (${view.outputs.length})${view.outputs.length ? '' : ': none declared'}`,
    ...view.outputs.flatMap(field => renderField(field)),
  ].filter(Boolean);
  if (view.answers.length) {
    lines.push(`${view.answers.length} answers`);
    for (const answer of view.answers) lines.push(`  [${answer.id}] ${answer.title ?? ''}${answer.keys.length ? ` — ${answer.keys.join(', ')}` : ''}`);
  }
  return lines.join('\n');
}

const STORAGE_APP = 'storage_by_unifyapps';

// A node that calls another automation, one item at a time or a batch of items.
const CALL_AUTOMATION_RESOURCES = new Set(['callables_call_automation', 'callables_call_automation_batch']);
/** The automation id a node calls, or null when it calls none. */
export function calledAutomationId(node) {
  const id = asObject(node?.inputs).automationId;
  return CALL_AUTOMATION_RESOURCES.has(asObject(node?.context).resourceName) && typeof id === 'string' && id ? id : null;
}

/**
 * get_workflow_dependencies: what an automation calls and reads, from its nodes,
 * and what calls it, from the callers the command found in the cache. Names are
 * resolved through `nameOfAutomation`, which returns null for one the cache
 * does not hold.
 */
export function workflowDependencies(snapshot, { callers = { dataSources: [], automations: [], stale: [] }, nameOfAutomation = () => null } = {}) {
  const entity = snapshot.entity;
  const nodes = nodesOf(entity);
  const calls = nodes.filter(node => calledAutomationId(node))
    .map(node => ({ node: node.id, title: node.subTitle ?? node.title ?? null, automationId: calledAutomationId(node) }))
    .map(call => ({ ...call, name: call.automationId ? nameOfAutomation(call.automationId) : null }));
  const objects = new Map();
  for (const node of nodes) {
    const context = asObject(node?.context);
    const objectType = asObject(node?.inputs).object_type;
    if (context.appName !== STORAGE_APP || !objectType) continue;
    const operation = String(context.resourceName ?? '').replace(`${STORAGE_APP}_`, '');
    objects.set(objectType, [...new Set([...(objects.get(objectType) ?? []), operation])]);
  }
  const apps = new Map();
  for (const node of nodes) {
    const app = asObject(node?.context).appName;
    if (app) apps.set(app, (apps.get(app) ?? 0) + 1);
  }
  const connections = [...new Set(nodes.flatMap(node => [asObject(node?.inputs).connectionId, asObject(node?.context).connectionId]).filter(value => typeof value === 'string' && value))];
  return {
    automation: { id: entity.id, name: entity.name ?? null, version: snapshot.version, cachedAt: snapshot.cachedAt },
    calls,
    objects: [...objects].map(([id, operations]) => ({ id, operations })),
    apps: [...apps].map(([name, nodeCount]) => ({ name, nodes: nodeCount })),
    appsUsed: Array.isArray(entity.appsUsed) ? entity.appsUsed : [],
    connections,
    calledBy: callers,
  };
}

export function renderWorkflowDependencies(view) {
  const { automation } = view;
  const lines = [
    provenanceLine({ kind: 'automation', id: automation.id, version: automation.version, cachedAt: automation.cachedAt }),
    `${automation.name ?? '(unnamed)'}`,
    `calls ${view.calls.length} automations${view.calls.length ? ':' : ''}`,
    ...view.calls.map(call => `  ${call.name ?? '(not cached)'} [${call.automationId ?? '?'}] from node ${call.node}`),
    `objects: ${view.objects.map(object => `${object.id} (${object.operations.join(', ')})`).join(', ') || '—'}`,
    `node apps: ${view.apps.map(app => `${app.name} ${app.nodes}`).join(', ') || '—'}`,
    `connections: ${view.connections.join(', ') || '—'}`,
    `called by ${view.calledBy.dataSources.length} data sources and ${view.calledBy.automations.length} automations in the cache${view.calledBy.stale.length ? `; not scanned, stale or missing: ${view.calledBy.stale.map(formatStale).join(', ')}` : ''}`,
    ...view.calledBy.dataSources.map(source => `  data source ${source.name ?? source.id} [${source.id}] on ${source.pageName ?? source.pageId} [${source.pageId}] of app ${source.appId}`),
    ...view.calledBy.automations.map(caller => `  automation ${caller.name ?? caller.id} [${caller.id}]${caller.status !== 'hit' ? ` (${caller.status})` : ''}`),
    'Callers outside this solution\'s cache are not listed; get_workflow_dependencies reads the tenant.',
  ];
  return lines.join('\n');
}

/** Every leaf of a block as path -> JSON, so a diff names the one key that changed instead of printing its parent object. */
function leaves(value, prefix = '', into = new Map()) {
  if (value === null || typeof value !== 'object') { into.set(prefix || '(self)', JSON.stringify(value) ?? 'undefined'); return into; }
  const entries = Array.isArray(value) ? value.map((item, index) => [`[${index}]`, item]) : Object.entries(value);
  if (!entries.length) into.set(prefix || '(self)', Array.isArray(value) ? '[]' : '{}');
  for (const [key, item] of entries) leaves(item, prefix ? `${prefix}${key.startsWith('[') ? key : `.${key}`}` : key, into);
  return into;
}

/** Two cached versions of one page, block by block: what a plan changed. No tool answers this. */
export function pageDiff(before, after, { pageId, perBlock = 12 }) {
  const left = blocksOf(before.entity ?? before);
  const right = blocksOf(after.entity ?? after);
  const ids = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  const changes = [];
  for (const id of ids) {
    const from = left[id];
    const to = right[id];
    if (!from) { changes.push({ id, change: 'added', componentType: componentTypeOf(to), displayName: to.displayName ?? null }); continue; }
    if (!to) { changes.push({ id, change: 'removed', componentType: componentTypeOf(from), displayName: from.displayName ?? null }); continue; }
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    const fromLeaves = leaves(from);
    const toLeaves = leaves(to);
    const fields = [...new Set([...fromLeaves.keys(), ...toLeaves.keys()])].sort()
      .filter(path => fromLeaves.get(path) !== toLeaves.get(path))
      .map(path => ({ path, before: fromLeaves.get(path) ?? null, after: toLeaves.get(path) ?? null }));
    changes.push({ id, change: 'changed', componentType: componentTypeOf(to), displayName: to.displayName ?? null,
      fields: fields.slice(0, perBlock), moreFields: Math.max(0, fields.length - perBlock) });
  }
  return {
    pageId,
    before: { version: (before.version ?? before.entity?.version) ?? null, cachedAt: before.cachedAt ?? null, blocks: Object.keys(left).length },
    after: { version: (after.version ?? after.entity?.version) ?? null, cachedAt: after.cachedAt ?? null, blocks: Object.keys(right).length },
    added: changes.filter(change => change.change === 'added').length,
    removed: changes.filter(change => change.change === 'removed').length,
    changed: changes.filter(change => change.change === 'changed').length,
    changes,
  };
}

export function renderDiff(view) {
  const lines = [
    `page ${view.pageId} — version ${view.before.version ?? '?'} (${view.before.blocks} blocks) -> version ${view.after.version ?? '?'} (${view.after.blocks} blocks) · cache`,
    `${view.added} added, ${view.removed} removed, ${view.changed} changed`,
  ];
  for (const change of view.changes) {
    lines.push(`  ${[change.change, change.componentType ?? '?', change.displayName, `[${change.id}]`].filter(Boolean).join(' ')}`);
    for (const field of change.fields ?? []) lines.push(`      ${field.path}: ${field.before ?? '—'} -> ${field.after ?? '—'}`);
    if (change.moreFields) lines.push(`      ${change.moreFields} more changed keys in this block`);
  }
  return lines.join('\n');
}

export function renderLimits() {
  return ['The cache never holds these. No script here can answer them; the tool named owns each.',
    ...MCP_ONLY.map(([subject, tools]) => `  ${subject} — ${tools}`)].join('\n');
}
