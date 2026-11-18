// Which tenant tool calls delete something, and the one-line summary a person
// reads before saying yes. Only the delete gate's own lists count
// (DELETE_TOOL_NAMES, DELETE_OPS and DELETE_VALUES), so the bridge and the builder rules
// name the same calls. Pure: no files, no network.
import crypto from 'node:crypto';
import { DELETE_OPS, DELETE_TOOL_NAMES, DELETE_VALUES } from './contracts.mjs';

// Bridge-only or read-shaping keys: they never change what the call does.
const IGNORED_KEYS = new Set(['knowledgeTokens', 'agent', 'have', 'dryRun']);

// The connectors-sdk deletes. Their dry run is the default, so only `dryRun: false` deletes.
const CONNECTOR_DELETES = Object.freeze({
  delete_connector: { breaks: () => 'its connections and the automations that use it stop working' },
  delete_connector_action: { what: 'action', ids: 'actionIds', breaks: (one) => `automations with a step that runs ${one ? 'it' : 'them'} fail there` },
  delete_connector_trigger: { what: 'trigger', ids: 'triggerIds', breaks: (one) => `automations ${one ? 'it starts' : 'they start'} no longer start` },
  delete_connector_authentication: { what: 'authentication', ids: 'types', breaks: (one) => `after the next publish no new connection can choose ${one ? 'it' : 'them'}` },
});
const deleteOpOf = (tool) => DELETE_OPS.find((entry) => entry.tool === tool);
const edits = (args) => (Array.isArray(args?.edits) ? args.edits : []);
// The edits a delete op can sit in: the call's own, or, for a batch tool, the
// edits of each step of the named kind.
function opEdits(name, args) {
  const entry = deleteOpOf(name);
  if (!entry) return [];
  if (!entry.step) return edits(args);
  const steps = Array.isArray(args?.steps) ? args.steps : [];
  return steps.filter((step) => step?.tool === entry.step).flatMap((step) => edits(step?.args));
}
const deleteEdits = (name, args) => opEdits(name, args).filter((edit) => edit?.op === deleteOpOf(name)?.op);
// The one value of a top-level input that makes a context-graph write irreversible.
const deleteValueOf = (name, args) => DELETE_VALUES.find((entry) => entry.tool === name && args?.[entry.field] === entry.value);
const words = (name) => name.replace(/_/gu, ' ').replace(/^./u, (ch) => ch.toUpperCase());
const named = (value) => (value === undefined || value === null || value === '' ? null : String(value));
const list = (value) => (Array.isArray(value) ? value : value === undefined ? [] : [value]);

// The graph deletes name what goes by its own id; the generic fallback would show the graph instead.
const GRAPH_DELETE_TARGETS = {
  delete_context_graph_node: 'nodeId',
  delete_context_graph_edge: 'edgeId',
  delete_context_graph_source: 'sourceId',
  delete_context_graph_node_match_rule: 'ruleId',
  delete_context_graph_node_data_quality_rule: 'ruleId',
  delete_context_graph_records: 'ids',
};

function summaryOf(name, args) {
  const a = args ?? {};
  if (name === 'delete_pages') {
    const pages = list(a.pageIds ?? a.pageNames);
    return pages.length === 1 ? `Delete page "${pages[0]}" in app ${a.interfaceId ?? ''}`.trim() : `Delete ${pages.length} pages in app ${a.interfaceId ?? ''}`.trim();
  }
  if (name === 'delete_data_sources') {
    const sources = list(a.ids ?? a.dataSourceIds);
    return sources.length === 1 ? `Delete data source "${sources[0]}" in app ${a.interfaceId ?? ''}`.trim() : `Delete ${sources.length} data sources in app ${a.interfaceId ?? ''}`.trim();
  }
  if (name === 'delete_object') return `Delete object ${a.objectId ?? ''} and all its records`.replace(/  +/gu, ' ');
  if (name === 'apply_object_batch') {
    // The platform drops the field from the schema only: rows already stored
    // keep the old value, but nothing reads it any more.
    const steps = (Array.isArray(a.steps) ? a.steps : []).filter((step) => step?.tool === 'apply_object_edits');
    // The same field name can appear once per object the batch touches; the
    // summary says each field once, the same way the object list already does.
    const fields = [...new Set(deleteEdits(name, a).flatMap((edit) => list(edit?.fields)).map(String))];
    const objects = [...new Set(steps.map((step) => step?.args?.objectId).filter(Boolean))];
    return `Remove field${fields.length === 1 ? '' : 's'} ${fields.join(', ')} from object ${objects.join(', ') || '?'}`;
  }
  if (name === 'update_page_paths') {
    const paths = deleteEdits(name, a).map((edit) => edit?.path ?? edit?.pageId ?? '?');
    return `Delete page path${paths.length === 1 ? '' : 's'} ${paths.join(', ')} in app ${a.interfaceId ?? '?'}`;
  }
  if (name === 'delete_knowledge_sets') {
    // The screen's delete: the agents lose the sets, and the sets' sources stay behind.
    const sets = list(a.knowledgeSetIds).map(String);
    const agents = Number.isInteger(a.expectedAgentCount) ? `, which ${a.expectedAgentCount} agent${a.expectedAgentCount === 1 ? '' : 's'} lose` : '';
    return `Delete knowledge set${sets.length === 1 ? '' : 's'} ${sets.join(', ')}${agents}; their sources stay`;
  }
  if (name === 'delete_env_variables') {
    // Every name, never a count: the yes covers exactly these, and a real call may name more than its dry run did.
    const names = list(a.names).map(String);
    return `Delete environment variable${names.length === 1 ? '' : 's'} ${names.join(', ') || '?'}: everything that reads ${names.length === 1 ? 'it' : 'them'} gets an empty value`;
  }
  if (CONNECTOR_DELETES[name]) {
    // Every id or type, never a count: the yes covers exactly these, as for the environment variables.
    const { what, ids, breaks } = CONNECTOR_DELETES[name];
    const targets = ids ? list(a[ids]).map(String) : [];
    const plural = targets.length === 1 ? '' : 's';
    const of = targets.length ? ` ${targets.join(', ')}` : '';
    return name === 'delete_connector'
      ? `Delete custom connector ${a.connectorId ?? '?'} with its authentications, actions and triggers: ${breaks(true)}`
      : `Delete ${what}${plural}${of} of custom connector ${a.connectorId ?? '?'}: ${breaks(targets.length === 1)}`;
  }
  const value = deleteValueOf(name, a);
  if (value) return `${value.what} in graph ${a.graphId ?? '?'}`;
  if (GRAPH_DELETE_TARGETS[name]) {
    const ids = list(a[GRAPH_DELETE_TARGETS[name]]).map(String);
    const where = [a.nodeId && name !== 'delete_context_graph_node' ? `of node ${a.nodeId}` : '', a.graphId ? `in graph ${a.graphId}` : ''].filter(Boolean).join(' ');
    return `${words(name)}: ${ids.join(', ') || '?'}${where ? ` ${where}` : ''}`;
  }
  if (name === 'remove_app_signing_keys') {
    return `Remove the ${a.platform ?? '?'} signing keys of app ${a.appId ?? '?'}: builds that need them stop until new keys are set, and a store refuses an update signed with different keys`;
  }
  if (name === 'apply_interface_version_diff') return `Overwrite app ${a.interfaceId ?? '?'} with parts of a ${a.source?.kind ?? 'saved'} version`;
  if (deleteOpOf(name)) {
    const count = deleteEdits(name, a).length;
    return `Delete records in object ${a.objectId ?? '?'} (${count} delete ${count === 1 ? 'edit' : 'edits'})`;
  }
  const target = named(a.agentId) ?? named(a.objectId) ?? named(a.interfaceId) ?? named(a.connectionId) ?? named(a.solutionId)
    ?? named(a.graphId) ?? named(a.datasetId) ?? named(a.userId) ?? named(a.teamId) ?? named(a.roleId) ?? named(a.id)
    ?? named(list(a.ids ?? a.dataSourceIds ?? a.elementIds ?? a.testCaseIds)[0]);
  return target ? `${words(name)}: ${target}` : words(name);
}

/** `{ summary }` when the call deletes something, else null. A dry run never does. */
export function destructiveCall(name, args) {
  if (typeof name !== 'string' || args?.dryRun === true) return null;
  if (CONNECTOR_DELETES[name] && args?.dryRun !== false) return null;
  const hit = DELETE_TOOL_NAMES.includes(name) || deleteEdits(name, args).length > 0 || Boolean(deleteValueOf(name, args));
  return hit ? { summary: summaryOf(name, args) } : null;
}

function canonical(value, top = true) {
  // An array's own order is sorted away too: the same delete sent with its ids or
  // edits in a different order (a different caller building the same call, say)
  // is still the same delete, and must hash to the same confirmation id.
  if (Array.isArray(value)) {
    const items = value.map((item) => canonical(item, false));
    return items.map((item) => JSON.stringify(item)).map((text, index) => [text, items[index]])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, item]) => item);
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).filter((key) => !(top && IGNORED_KEYS.has(key))).sort().map((key) => [key, canonical(value[key], false)]));
}

/**
 * One hash per exact call on one tenant, so a yes covers that call and nothing
 * else. Some delete tools carry no host (`delete_connection {connectionId}`),
 * so the tenant is part of the key: a yes on one tenant never matches another.
 */
export const callKey = (name, args, tenant = '') => crypto.createHash('sha256').update(`${String(tenant).toLowerCase()}\n${name}\n${JSON.stringify(canonical(args ?? {}))}`).digest('hex');
