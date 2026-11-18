/**
 * How a solution's cached entities are wired to each other: which page data
 * source runs which automation and reads which object, which block event
 * triggers it, and which automation calls another or touches an object.
 *
 * Pure. The workspace layer reads the cache and hands over a snapshot:
 * `{ apps: [{ id, name, version, status, reason, pages: [{ id, name, version,
 * status, reason, page, dataSources }] }], automations: [{ id, name, version,
 * status, reason, entity }], objects: [...], agents: [...] }`, where `status`
 * is the cache's `hit`, `miss` or `stale`.
 */
import { calledAutomationId, eventView } from './cache-views.mjs';

export const ENTITY_KINDS = Object.freeze({ APP: 'app', PAGE: 'page', AUTOMATION: 'automation', OBJECT: 'object', AGENT: 'ai-agent' });

export const EDGE_VIA = Object.freeze({
  DATA_SOURCE: 'data source',
  EVENT: 'event via data source',
  CALL_NODE: 'call node',
  STORAGE_READ: 'storage read',
  STORAGE_WRITE: 'storage write',
  INVOKE_AGENT: 'invoke agent node',
});

// A binding that names `['data']` with no key after it hands the whole output
// on, so every output field counts as read.
export const WHOLE_OUTPUT = '*';

const HIT = 'hit';
const STORAGE_APP = 'storage_by_unifyapps';
const INVOKE_AGENT_RESOURCE = 'ai_agents_by_unifyapps_invoke_agent';
const READ_OPERATION = /fetch|get|search|count|aggregate|find|list/iu;

const asObject = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const escapeRegExp = text => String(text).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

function walkStrings(value, visit) {
  if (typeof value === 'string') visit(value);
  else if (Array.isArray(value)) value.forEach(item => walkStrings(item, visit));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => walkStrings(item, visit));
}

/** The output keys a page reads from one data source, from every binding on the page outside that source. */
function fieldsReadFrom(sourceId, { page, dataSources }) {
  const pattern = new RegExp(`${escapeRegExp(sourceId)}\\s*(?:\\?\\.)?(?:\\[\\s*['"]data['"]\\s*\\]|\\.data\\b)(?:\\s*(?:\\?\\.)?\\[\\s*['"]([^'"\\]]+)['"]\\s*\\]|\\s*\\??\\.([A-Za-z_$][\\w$]*))?`, 'gu');
  const fields = new Set();
  const scan = text => { for (const match of text.matchAll(pattern)) fields.add(match[1] ?? match[2] ?? WHOLE_OUTPUT); };
  walkStrings(asObject(page).properties, scan);
  for (const source of dataSources ?? []) if (source?.id !== sourceId) walkStrings(asObject(source).properties, scan);
  return [...fields].sort();
}

/** The output keys later nodes read from one call node, as `<nodeId>.outputs.<key>`. */
function fieldsReadFromNode(nodeId, nodes) {
  const pattern = new RegExp(`${escapeRegExp(nodeId)}\\s*(?:\\.outputs\\b|\\[\\s*['"]outputs['"]\\s*\\])(?:\\.([A-Za-z_$][\\w$]*)|\\[\\s*['"]([^'"\\]]+)['"]\\s*\\])?`, 'gu');
  const fields = new Set();
  for (const node of nodes) {
    if (node?.id === nodeId) continue;
    walkStrings(asObject(node).inputs, text => { for (const match of text.matchAll(pattern)) fields.add(match[1] ?? match[2] ?? WHOLE_OUTPUT); });
  }
  return [...fields].sort();
}

export function buildWiring(snapshot = {}) {
  const apps = snapshot.apps ?? [], automations = snapshot.automations ?? [], objects = snapshot.objects ?? [], agents = snapshot.agents ?? [];
  const entities = [], edges = [], unknown = [];
  const names = new Map();
  const remember = (kind, item, extra = {}) => {
    names.set(`${kind}:${item.id}`, item.name ?? null);
    entities.push({ kind, id: item.id, name: item.name ?? null, version: item.version ?? null, stale: item.status !== HIT, ...extra });
    if (item.status !== HIT) unknown.push({ kind, id: item.id, name: item.name ?? null, reason: item.reason ?? item.status ?? 'not cached' });
  };
  for (const app of apps) {
    remember(ENTITY_KINDS.APP, app);
    for (const page of app.pages ?? []) {
      remember(ENTITY_KINDS.PAGE, page, { appId: app.id,
        dataSources: (page.dataSources ?? []).filter(source => source?.id).map(source => ({ id: source.id, name: source.properties?.name ?? null })) });
    }
  }
  for (const automation of automations) remember(ENTITY_KINDS.AUTOMATION, automation);
  for (const object of objects) remember(ENTITY_KINDS.OBJECT, object);
  for (const agent of agents) {
    remember(ENTITY_KINDS.AGENT, agent);
    // The tools an agent calls are separate entities that only get_agent reads,
    // so an agent may call an automation or read an object the cache cannot show.
    if (agent.status === HIT) unknown.push({ kind: ENTITY_KINDS.AGENT, id: agent.id, name: agent.name ?? null, reason: 'its tools are not in the cache (get_agent)' });
  }
  const target = (kind, id) => ({ kind, id, name: names.get(`${kind}:${id}`) ?? null });

  for (const app of apps) {
    if (app.status !== HIT) continue;
    for (const page of app.pages ?? []) {
      if (page.status !== HIT) continue;
      const context = { page: page.page, dataSources: page.dataSources ?? [], appDataSources: [] };
      const from = part => ({ kind: ENTITY_KINDS.PAGE, id: page.id, name: page.name ?? null, part });
      const callable = new Map();
      for (const source of context.dataSources) {
        const inputs = asObject(asObject(source?.properties).inputs);
        const label = `data source ${source?.properties?.name ?? source?.id}`;
        if (typeof inputs.automationId === 'string' && inputs.automationId) {
          callable.set(source.id, inputs.automationId);
          edges.push({ from: from(label), to: target(ENTITY_KINDS.AUTOMATION, inputs.automationId), via: EDGE_VIA.DATA_SOURCE, fields: fieldsReadFrom(source.id, context) });
        }
        if (typeof inputs.object_type === 'string' && inputs.object_type) {
          edges.push({ from: from(label), to: target(ENTITY_KINDS.OBJECT, inputs.object_type), via: EDGE_VIA.STORAGE_READ, fields: [] });
        }
      }
      // No event action runs an automation by itself: a block event or a data
      // source callback runs one through controlDataSource on a callable source.
      for (const chain of eventView(context, { pageId: page.id }).chains) {
        for (const event of chain.events) {
          const automationId = callable.get(asObject(event.payload).dataSourceId);
          if (!automationId) continue;
          const owner = chain.kind === 'block' ? 'block' : 'data source';
          edges.push({ from: from(`${owner} ${chain.name ?? chain.id} ${event.eventType ?? 'event'}`), to: target(ENTITY_KINDS.AUTOMATION, automationId), via: EDGE_VIA.EVENT, fields: [] });
        }
      }
    }
  }

  for (const automation of automations) {
    if (automation.status !== HIT) continue;
    const nodes = Array.isArray(automation.entity?.nodes) ? automation.entity.nodes : [];
    const from = node => ({ kind: ENTITY_KINDS.AUTOMATION, id: automation.id, name: automation.name ?? null, part: `node ${node.subTitle ?? node.title ?? node.id}` });
    for (const node of nodes) {
      const context = asObject(node?.context), inputs = asObject(node?.inputs);
      if (calledAutomationId(node)) {
        edges.push({ from: from(node), to: target(ENTITY_KINDS.AUTOMATION, calledAutomationId(node)), via: EDGE_VIA.CALL_NODE, fields: fieldsReadFromNode(node.id, nodes) });
      }
      if (context.appName === STORAGE_APP && typeof inputs.object_type === 'string' && inputs.object_type) {
        const operation = String(context.resourceName ?? '').replace(`${STORAGE_APP}_`, '');
        edges.push({ from: from(node), to: target(ENTITY_KINDS.OBJECT, inputs.object_type),
          via: READ_OPERATION.test(operation) ? EDGE_VIA.STORAGE_READ : EDGE_VIA.STORAGE_WRITE, fields: [] });
      }
      const agentId = asObject(inputs.parameters).aiAgentId;
      if (context.resourceName === INVOKE_AGENT_RESOURCE && typeof agentId === 'string' && agentId) {
        edges.push({ from: from(node), to: target(ENTITY_KINDS.AGENT, agentId), via: EDGE_VIA.INVOKE_AGENT, fields: fieldsReadFromNode(node.id, nodes) });
      }
    }
  }
  return { entities, edges, unknown };
}

const cell = value => String(value ?? '').replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ').trim();
const code = value => (value ? `\`${cell(value).replace(/`/gu, "'")}\`` : '');

/** The solution map: plain facts in tables. Names sit in backticks so none reads as a sentence. */
export function renderSolutionMap(wiring, { solutionId = null, solutionName = null, tenant = null } = {}) {
  const lines = ['# Solution map', '', `Solution: ${code(solutionName) || '—'} (${cell(solutionId) || '—'}) · tenant ${cell(tenant) || '—'}`, '',
    '## Entities', '', '| Kind | Name | Id | Version | Stale |', '|---|---|---|---|---|'];
  for (const entity of wiring.entities) lines.push(`| ${entity.kind} | ${code(entity.name)} | ${cell(entity.id)} | ${cell(entity.version)} | ${entity.stale ? 'yes' : 'no'} |`);
  if (!wiring.entities.length) lines.push('| — | | | | |');
  lines.push('', '## Wiring', '', '| From | Part | To | Via | Fields |', '|---|---|---|---|---|');
  for (const edge of wiring.edges) {
    lines.push(`| ${edge.from.kind} ${code(edge.from.name ?? edge.from.id)} | ${code(edge.from.part)} | ${edge.to.kind} ${code(edge.to.name ?? edge.to.id)} | ${edge.via} | ${edge.fields.map(code).join(', ')} |`);
  }
  if (!wiring.edges.length) lines.push('| — | | | | |');
  lines.push('', '## Not checked', '');
  for (const item of wiring.unknown) lines.push(`- ${item.kind} ${code(item.name ?? item.id)} (${cell(item.id)}): ${cell(item.reason)}`);
  if (!wiring.unknown.length) lines.push('- none');
  return lines.join('\n') + '\n';
}
