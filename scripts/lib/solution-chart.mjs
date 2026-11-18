/** The solution chart: the wiring as a Mermaid flowchart, with the tenant and every id. Pure. */
import { cleanField } from './session-snapshot.mjs';
import { ENTITY_KINDS } from './wiring.mjs';

export const CHART_FILE = '.nebula/solution-chart.md';
export const CHART_EMPTY = 'No entities linked yet.';
const DATA_SOURCE = 'data source';
const KIND_LABEL = { [ENTITY_KINDS.AGENT]: 'AI agent' };

// cleanField removes angle brackets; these other characters end or break a quoted Mermaid label.
const label = value => cleanField(value).replace(/["'`[\](){}|;#&\\]/gu, ' ').replace(/\s+/gu, ' ').trim();
const nodeText = (kind, name, id) => [`${KIND_LABEL[kind] ?? kind} ${label(name ?? id) || label(id)}`, label(id)].filter(Boolean).join(' · ');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Nodes and edges, with pages and data sources folded into their app when `fold` is set. */
function graph(wiring, fold) {
  const nodes = new Map(), edges = new Map();
  const add = (key, text) => { if (!nodes.has(key)) nodes.set(key, { id: `n${nodes.size + 1}`, text }); return nodes.get(key).id; };
  const appOf = new Map(), folded = new Map();
  for (const entity of wiring.entities ?? []) if (entity.kind === ENTITY_KINDS.PAGE && entity.appId) appOf.set(entity.id, entity.appId);
  if (fold) {
    for (const entity of wiring.entities ?? []) {
      if (entity.kind !== ENTITY_KINDS.PAGE || !entity.appId) continue;
      const counts = folded.get(entity.appId) ?? { pages: 0, sources: 0 };
      counts.pages += 1; counts.sources += (entity.dataSources ?? []).length;
      folded.set(entity.appId, counts);
    }
  }
  const keyOf = (kind, id) => `${kind}:${id}`;
  const link = (from, to, via) => { if (from !== to) edges.set(`${from}>${to}>${via ?? ''}`, { from, to, via }); };
  for (const entity of wiring.entities ?? []) {
    if (fold && entity.kind === ENTITY_KINDS.PAGE && entity.appId) continue;
    let text = nodeText(entity.kind, entity.name, entity.id);
    const counts = entity.kind === ENTITY_KINDS.APP ? folded.get(entity.id) : null;
    if (counts) text += ` · ${plural(counts.pages, 'page')}${counts.sources ? ` · ${plural(counts.sources, 'data source')}` : ''}`;
    const id = add(keyOf(entity.kind, entity.id), text);
    if (entity.kind !== ENTITY_KINDS.PAGE) continue;
    if (entity.appId) link(add(keyOf(ENTITY_KINDS.APP, entity.appId), nodeText(ENTITY_KINDS.APP, null, entity.appId)), id, null);
    for (const source of entity.dataSources ?? []) {
      link(id, add(`${entity.id}:${DATA_SOURCE} ${source.name ?? source.id}`, nodeText(DATA_SOURCE, source.name, source.id)), null);
    }
  }
  const endpoint = (end, part) => {
    if (fold && end.kind === ENTITY_KINDS.PAGE && appOf.has(end.id)) return nodes.get(keyOf(ENTITY_KINDS.APP, appOf.get(end.id)))?.id;
    const source = end.kind === ENTITY_KINDS.PAGE && String(part ?? '').startsWith(`${DATA_SOURCE} `) ? nodes.get(`${end.id}:${part}`) : null;
    return source?.id ?? add(keyOf(end.kind, end.id), nodeText(end.kind, end.name, end.id));
  };
  for (const edge of wiring.edges ?? []) {
    const from = endpoint(edge.from, edge.from?.part), to = endpoint(edge.to);
    if (from && to) link(from, to, edge.via ? label(edge.via) : null);
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

const nodeLine = node => `  ${node.id}["${node.text}"]`;
const edgeLine = edge => (edge.via ? `  ${edge.from} -->|${edge.via}| ${edge.to}` : `  ${edge.from} --- ${edge.to}`);

function render(head, nodeLines, edgeLines, tail) {
  return [head, '', '```mermaid', 'flowchart LR', ...nodeLines, ...edgeLines, '```', ...(tail ? [tail] : [])].join('\n') + '\n';
}

/**
 * @param {{entities?:Array,edges?:Array}} wiring  from buildWiring
 * @param {{tenant?:string,solutionId?:string,solutionName?:string}} solution
 * @param {{maxChars?:number}} options  over the cap, pages and data sources fold into their app, then lines are cut.
 */
export function renderSolutionChart(wiring = {}, { tenant = null, solutionId = null, solutionName = null } = {}, { maxChars = Infinity } = {}) {
  if (!(wiring.entities ?? []).length && !(wiring.edges ?? []).length) return `${CHART_EMPTY}\n`;
  const head = `Tenant ${cleanField(tenant, 120) || 'unknown'} · solution "${label(solutionName) || 'unnamed'}" (${label(solutionId) || 'no id'})`;
  const full = graph(wiring, false);
  const text = render(head, full.nodes.map(nodeLine), full.edges.map(edgeLine));
  if (text.length <= maxChars) return text;
  const tail = `Full chart: ${CHART_FILE}`;
  const small = graph(wiring, true);
  const nodeLines = small.nodes.map(nodeLine), edgeLines = small.edges.map(edgeLine);
  let size = render(head, nodeLines, edgeLines, tail).length;
  // Edges go first, then nodes, so every edge left still names nodes the chart draws.
  while (size > maxChars && (edgeLines.length || nodeLines.length)) size -= (edgeLines.length ? edgeLines.pop() : nodeLines.pop()).length + 1;
  return render(head, nodeLines, edgeLines, tail);
}
