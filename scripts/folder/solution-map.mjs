/** Reads the open solution's entity cache into the wiring snapshot, and writes the solution map from it. */
import path from 'node:path';
import { atomicFile, assertHome } from '../lib/session-paths.mjs';
import { buildWiring, renderSolutionMap } from '../lib/wiring.mjs';
import { renderSolutionChart } from '../lib/solution-chart.mjs';
import { listCachedEntities, readCachedAppContext, readCachedEntityContext, readCachedSolutionContext } from './entity-cache.mjs';
import { SOLUTION_CHART_FILE, SOLUTION_MAP_FILE, WIRING_FILE, associationAt } from './folder-layout.mjs';

const TYPES = Object.freeze({ app: 'e_interface', automation: 'WORKFLOW_DEFINITION', object: 'ENTITY_TYPE', agent: 'ai_agent' });

const nameOf = entity => entity?.name ?? entity?.properties?.name ?? null;

/** Every app, automation, object and AI agent the solution links or the cache holds, read the way `cache` reads them. */
export function readWiringSnapshot(home) {
  const solution = readCachedSolutionContext(home);
  const linked = solution.status === 'hit'
    ? { app: solution.apps, automation: solution.automations, object: solution.objects, agent: solution.agents }
    : { app: [], automation: [], object: [], agent: [] };
  const cached = listCachedEntities(home);
  const idsOf = kind => [...new Set([...linked[kind].map(item => item.id), ...cached.filter(item => item.entityType === TYPES[kind]).map(item => item.id)])];

  const apps = idsOf('app').map(id => {
    const context = readCachedAppContext(home, id);
    if (context.status !== 'hit') return { id, name: null, version: null, status: context.status, reason: context.reason ?? context.status, pages: [] };
    return {
      id, name: nameOf(context.interface), version: context.interface?.version ?? null, status: 'hit',
      pages: context.pages.map(entry => ({ id: entry.pageId, name: nameOf(entry.page), version: entry.page?.version ?? null,
        status: entry.status, reason: entry.reason ?? entry.status, page: entry.page ?? null, dataSources: entry.dataSources ?? [] })),
    };
  });
  const others = kind => idsOf(kind).map(id => {
    const context = readCachedEntityContext(home, TYPES[kind], id);
    return { id, name: nameOf(context.entity), version: context.version ?? null, status: context.status, reason: context.reason ?? context.status, entity: context.entity ?? null };
  });
  return {
    solution: solution.status === 'hit' ? solution.solution : null,
    apps, automations: others('automation'), objects: others('object'), agents: others('agent'),
  };
}

export function readWiring(home) {
  return buildWiring(readWiringSnapshot(home));
}

/** `.nebula/wiring.json`, `.nebula/solution-map.md` and `.nebula/solution-chart.md`, rewritten whole after every render. */
export function writeSolutionMap(home) {
  const target = assertHome(home);
  const snapshot = readWiringSnapshot(target);
  const wiring = buildWiring(snapshot);
  let tenant = null;
  try { tenant = associationAt(target)?.tenant ?? null; } catch { /* a conflicting solution record leaves the tenant unnamed */ }
  atomicFile(path.join(target, WIRING_FILE), JSON.stringify(wiring, null, 2) + '\n');
  const solution = { solutionId: snapshot.solution?.id ?? null, solutionName: snapshot.solution?.name ?? null, tenant };
  atomicFile(path.join(target, SOLUTION_MAP_FILE), renderSolutionMap(wiring, solution));
  atomicFile(path.join(target, SOLUTION_CHART_FILE), renderSolutionChart(wiring, solution));
  return wiring;
}
