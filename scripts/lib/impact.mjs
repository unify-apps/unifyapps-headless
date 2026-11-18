/**
 * What a change to one entity affects, from the wiring `buildWiring` returns,
 * and which builder agent owns each fix. Pure.
 */
import { ENTITY_KINDS, WHOLE_OUTPUT } from './wiring.mjs';

export const CHANGE_KINDS = Object.freeze({ OUTPUT: 'output', INPUT: 'input', FIELD_RENAME: 'field-rename', FIELD_DELETE: 'field-delete', DELETE: 'delete', LOGIC: 'logic' });

export const OWNER_BY_KIND = Object.freeze({
  [ENTITY_KINDS.APP]: 'app-agent',
  [ENTITY_KINDS.PAGE]: 'app-agent',
  [ENTITY_KINDS.AUTOMATION]: 'automation-agent',
  [ENTITY_KINDS.OBJECT]: 'fde-agent',
  [ENTITY_KINDS.AGENT]: 'agent-builder',
});

export const CERTAINTY = Object.freeze({ FOUND: 'found', NO_CHANGE: 'no-change', UNKNOWN: 'unknown' });

const CALLER_KINDS = new Set([ENTITY_KINDS.APP, ENTITY_KINDS.PAGE, ENTITY_KINDS.AUTOMATION, ENTITY_KINDS.AGENT]);

function verdict(edge, change, targetKind) {
  const uses = `${edge.via} ${edge.from.part ?? ''}`.trim();
  if (change === CHANGE_KINDS.LOGIC) return [CERTAINTY.NO_CHANGE, `${uses}; only the logic inside changes, its inputs and outputs stay the same`];
  if (!change) return [CERTAINTY.FOUND, `uses it through ${uses}`];
  if (change === CHANGE_KINDS.DELETE) return [CERTAINTY.FOUND, `uses it through ${uses}, which breaks when it is deleted`];
  // A deleted field breaks every use a rename breaks, but the fix removes the use instead of renaming it.
  const fix = change === CHANGE_KINDS.FIELD_DELETE ? '; breaks if it uses the deleted field, fix by removing that use' : '';
  if (targetKind === ENTITY_KINDS.OBJECT) return [CERTAINTY.FOUND, `${uses} of the object${fix}`];
  if (change === CHANGE_KINDS.INPUT) return [CERTAINTY.FOUND, `passes its inputs through ${uses}`];
  if (!edge.fields.length) return [CERTAINTY.NO_CHANGE, `${uses} reads none of its output fields`];
  const fields = edge.fields.includes(WHOLE_OUTPUT) ? 'its whole output' : `output ${edge.fields.join(', ')}`;
  return [CERTAINTY.FOUND, `${uses} reads ${fields}${fix}`];
}

/**
 * One row per entity part that uses the target, with no row dropped: a caller
 * the change leaves alone is `no-change`, and every entity the wiring could not
 * check that might use it is `unknown`. With no `change`, every user is listed.
 */
export function impactOf(wiring, { kind, id }, change = null) {
  if (change !== null && !Object.values(CHANGE_KINDS).includes(change)) throw new Error(`Unknown change kind: ${change}.`);
  const rows = [];
  const seen = new Set();
  const add = (entity, part, why, certainty) => {
    const key = `${entity.kind}:${entity.id}:${part ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ entity: { kind: entity.kind, id: entity.id, name: entity.name ?? null }, part: part ?? null, why, owner: OWNER_BY_KIND[entity.kind] ?? null, certainty });
  };
  for (const edge of wiring.edges) {
    if (edge.to.kind !== kind || edge.to.id !== id) continue;
    const [certainty, why] = verdict(edge, change, kind);
    add(edge.from, edge.from.part, why, certainty);
  }
  // Pages and apps hold no inbound wiring, so only an automation, an object or an AI agent can have callers the cache missed.
  if (kind === ENTITY_KINDS.AUTOMATION || kind === ENTITY_KINDS.OBJECT || kind === ENTITY_KINDS.AGENT) {
    for (const item of wiring.unknown) {
      if (!CALLER_KINDS.has(item.kind) || (item.kind === kind && item.id === id)) continue;
      add(item, null, `not checked: ${item.reason}`, CERTAINTY.UNKNOWN);
    }
  }
  return rows;
}
