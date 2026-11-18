// Readers more than one area's checks share: what a finding names, the walked blocks, the actions
// a page can run and the pages a URL reaches.

export { isPlainObject } from '../config-read.mjs';

export const listOf = value => (Array.isArray(value) ? value : []);
export const isBinding = value => typeof value === 'string' && value.includes('{{');
export const isBlank = value => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
// An id written into the config, not one a `{{ }}` binding picks at run time.
export const isFixedId = value => typeof value === 'string' && value.trim() !== '' && !isBinding(value);

// An empty socket: the builder stores '__PLACEHOLDER__', and the platform also treats 'null' as no child.
export const EMPTY_SOCKET_IDS = new Set(['__PLACEHOLDER__', 'null']);

export function blockTarget(page, id) {
  const fact = page.walk.facts.get(id);
  return { kind: 'block', id, name: fact?.name ?? page.blocks[id]?.displayName ?? id };
}

export const pageTarget = page => ({ kind: 'page', id: page.id, name: page.name });
export const pageRef = page => ({ id: page.id, name: page.name });
export const appTarget = app => ({ kind: 'app', id: app.id, name: app.name });
export const dataSourceTarget = source => ({ kind: 'dataSource', id: source.id, name: source.properties?.name ?? source.name ?? source.id });

/** The walked blocks' facts in walk order, or only those of `types`. An unreached block never renders. */
export const walkedFacts = (page, ...types) => page.walk.order.map(id => page.walk.facts.get(id)).filter(fact => !types.length || types.includes(fact.type));

export const descendants = (page, id) => walkedFacts(page).filter(fact => fact.ancestors.includes(id));

/**
 * Every place on the page that stores event handlers: the walked blocks, the page's own handlers,
 * and its data sources' callbacks (stored as arrays or as id-keyed objects, knowledge sheet
 * concepts/data-source-events).
 */
function eventOwners(page) {
  const indexed = (prefix, events) => listOf(events).map((event, index) => ({ path: `${prefix}[${index}]`, event }));
  const owners = page.walk.order.map(id => ({ target: blockTarget(page, id), events: indexed('events', page.blocks[id]?.events) }));
  owners.push({ target: pageTarget(page), events: indexed('interactions.events', page.events) });
  for (const source of page.dataSources) {
    const callbacks = source?.properties?.callbacks ?? {};
    const keyed = name => Object.entries(callbacks[name] ?? {}).map(([key, event]) => ({ path: `callbacks.${name}.${key}`, event }));
    const events = [...indexed('callbacks.successEvents', callbacks.successEvents), ...indexed('callbacks.failureEvents', callbacks.failureEvents), ...keyed('onSuccess'), ...keyed('onFailure')];
    owners.push({ target: dataSourceTarget(source), events });
  }
  return owners;
}

/**
 * Every action the page can run, as `{ target, path, eventType, targetId, branch, action }`, where
 * `target` names the block, page or data source that holds the handler. A switched-off handler runs
 * nothing, and a switched-off action skips its follow-ups too (ai-editing/action-nodes.md).
 */
export function liveActions(page) {
  const found = [];
  const visit = (handler, action, path, branch) => {
    if (!action || action.disabled === true) return;
    found.push({ ...handler, path, branch, action });
    listOf(action.onSuccessActions).forEach((next, index) => visit(handler, next, `${path}.onSuccessActions[${index}]`, 'success'));
    listOf(action.onErrorActions).forEach((next, index) => visit(handler, next, `${path}.onErrorActions[${index}]`, 'error'));
  };
  for (const { target, events } of eventOwners(page)) {
    for (const { path, event } of events) {
      if (event?.disabled !== true) visit({ target, eventType: event?.eventType ?? null, targetId: event?.targetId ?? null }, event?.action, `${path}.action`, 'main');
    }
  }
  return found;
}

/** One finding per target: the first evidence, with a count of the rest. */
export function oncePerTarget(findings) {
  const byTarget = new Map();
  for (const found of findings) {
    const entry = byTarget.get(found.target.id);
    if (entry) entry.more += 1;
    else byTarget.set(found.target.id, { found, more: 0 });
  }
  return [...byTarget.values()].map(({ found, more }) => (more ? { ...found, evidence: `${found.evidence} (and ${more} more here)` } : found));
}

/** The pages a URL reaches: placed on the app's address tree, not the global page, and typed PAGE (the slug map keeps only those). */
export const routedPages = app => app.pagePaths.pages.filter(entry => entry.path && !entry.global && (entry.type ?? 'PAGE') === 'PAGE');
