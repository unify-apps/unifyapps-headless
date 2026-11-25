/**
 * `impact <kind> <entity>`: what else a change to one entity affects, and which
 * builder agent owns each fix. Reads the entity cache only; no network.
 */
import { UaError } from '../lib/contracts.mjs';
import { CHANGE_KINDS, CERTAINTY, impactOf } from '../lib/impact.mjs';
import { ENTITY_KINDS } from '../lib/wiring.mjs';
import { readWiring } from '../folder/solution-map.mjs';
import { cachedApps, entityIdFor, resolveApp, resolvePage } from './cache.mjs';

const ENTITY_TYPE_BY_KIND = Object.freeze({
  [ENTITY_KINDS.AUTOMATION]: 'WORKFLOW_DEFINITION',
  [ENTITY_KINDS.OBJECT]: 'ENTITY_TYPE',
  [ENTITY_KINDS.AGENT]: 'ai_agent',
});

/** A page by id, slug or name: in the app `--app-id` names, or in the one cached app that has it. */
function resolvePageAnywhere(home, token, appToken) {
  if (appToken) return resolvePage(home, resolveApp(home, appToken), token);
  const found = cachedApps(home).flatMap(app => { try { return [resolvePage(home, app.id, token)]; } catch { return []; } });
  const unique = [...new Set(found)];
  if (unique.length === 1) return unique[0];
  throw new UaError('USAGE', unique.length ? `More than one cached page matches ${token}: ${unique.join(', ')}. Add --app-id.` : `No cached page matches ${token}. Add --app-id to see that app's pages.`);
}

function resolveId(home, kind, token, flags) {
  if (kind === ENTITY_KINDS.APP) return resolveApp(home, token);
  if (kind === ENTITY_KINDS.PAGE) return resolvePageAnywhere(home, token, flags['app-id']);
  return entityIdFor(home, ENTITY_TYPE_BY_KIND[kind], token) ?? token;
}

const label = entity => `${entity.kind} ${entity.name ?? entity.id} [${entity.id}]`;

export async function run(command, args = [], flags = {}, ctx) {
  if (!ctx?.home || !ctx.state?.solutionId) throw new UaError('NOT_STARTED');
  const token = String(args[0] ?? '').trim();
  if (!token) throw new UaError('USAGE', `The ${command} id or name is required.`);
  const change = flags.change ?? null;
  if (change !== null && !Object.values(CHANGE_KINDS).includes(change)) {
    throw new UaError('USAGE', `--change takes one of ${Object.values(CHANGE_KINDS).join(', ')}.`);
  }
  const id = resolveId(ctx.home, command, token, flags);
  const wiring = readWiring(ctx.home);
  const entity = wiring.entities.find(item => item.kind === command && item.id === id) ?? { kind: command, id, name: null, stale: null };
  const rows = impactOf(wiring, { kind: command, id }, change);
  const count = certainty => rows.filter(row => row.certainty === certainty).length;
  const counts = { found: count(CERTAINTY.FOUND), noChange: count(CERTAINTY.NO_CHANGE), unknown: count(CERTAINTY.UNKNOWN) };
  const text = [
    `${label(entity)} · change ${change ?? 'any'} · from the cache, no tenant call${entity.stale ? ' · this entity\'s cached copy is stale' : ''}`,
    `${counts.found} affected, ${counts.noChange} not affected, ${counts.unknown} not checked`,
    ...rows.map(row => `  ${row.certainty} · ${label(row.entity)}${row.part ? ` · ${row.part}` : ''} · ${row.why} · owner ${row.owner ?? '—'}`),
  ].join('\n');
  return { data: { entity, change, rows, counts }, text, message: `${counts.found} affected, ${counts.noChange} not affected, ${counts.unknown} not checked for ${entity.name ?? id}.` };
}
