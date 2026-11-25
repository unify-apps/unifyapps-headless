/** Pull platform solution snapshots into only the caller's session cache. */
import fs from 'node:fs';
import path from 'node:path';
import { UaError } from '../lib/contracts.mjs';
import { validateSnapshot, reconcileRecords } from './local.mjs';
import { refreshLinkedEntities } from './entity-cache.mjs';
import { syncSolutionSkills } from './skill-sync.mjs';
import { callSolutionTool } from '../platform/solution-mcp.mjs';
import { SYNC_FILE } from './folder-layout.mjs';

// The refusals that end the read: a sign-in that ran out, and a person the
// tenant refuses UnifyApps Headless's tools to (the direct read would slip past that
// check). Everything else a tool call can fail with (an older llm-tools without
// the tool, a route not served, a 5xx, a timeout) sends the read to the direct
// entity API, which is the path every tenant served before the tool existed,
// with its own retries and errors.
const FINAL_REFUSALS = new Set(['AUTH_EXPIRED', 'PERMISSION_REQUIRED']);

/** The same five reads, made by the tenant's `get_solution` tool. Null when the tenant cannot make them. */
async function fetchThroughTool({ service, solutionId, sessionId }) {
  let toolAnswer;
  try { toolAnswer = await callSolutionTool(service.host, 'get_solution', { id: solutionId }, { sessionId, solutionId, home: service.home }); }
  catch (error) {
    if (FINAL_REFUSALS.has(error?.code)) throw error;
    return null;
  }
  // The tool read the tenant and found no such solution: the direct reads would say the same.
  if (toolAnswer?.result === 'not_found') throw new UaError('NOT_FOUND', undefined, { host: service.host, id: solutionId });
  if (toolAnswer?.ok !== true || !toolAnswer.solution) return null;
  const snapshot = { solution: toolAnswer.solution, plans: toolAnswer.plans, specs: toolAnswer.specs, docs: toolAnswer.documents, assets: toolAnswer.assets };
  // A bundle in another shape than the cache takes (a list missing, a record
  // without its text) is not this tenant's answer to trust: read it directly.
  try { validateSnapshot(snapshot, solutionId); } catch { return null; }
  return snapshot;
}

// The entity API's own reads (`direct`), for a tenant whose llm-tools has no
// `get_solution` yet, and for a local solution's workspace store.
async function fetchDirect({ service, solutionId }) {
  const direct = { direct: true };
  const solution = await service.get('e_solution', solutionId, direct);
  if (solution?.id !== solutionId || solution.entityType !== 'e_solution') throw new UaError('NOT_FOUND', 'The solution record was not returned.');
  const [plans, specs, docs, assets] = await Promise.all([
    service.search('solution_builder_plan', 'solutionId', solutionId, direct),
    service.search('solution_spec', 'solutionId', solutionId, direct),
    service.search('solution_document', 'solutionId', solutionId, direct),
    service.search('solution_linked_assets', 'solution_id', solutionId, direct),
  ]);
  const snapshot = { solution, plans, specs, docs, assets };
  validateSnapshot(snapshot, solutionId);
  return snapshot;
}

/**
 * The solution with its specs, plans, documents and asset rows. A service built
 * for a platform tenant (`serviceFor`) names its host, and the read is then one
 * `get_solution` call on the tenant's `solution` MCP server, made here and not
 * by Claude because the answer belongs on disk: one solution held 76 plans and
 * 620 KB of plan text. A tenant that cannot answer it is read directly, as before;
 * a local solution's service names no host and is always read from its store.
 */
export async function fetchSolution(service, solutionId, { sessionId } = {}) {
  const fromTool = service.host ? await fetchThroughTool({ service, solutionId, sessionId }) : null;
  return fromTool ?? fetchDirect({ service, solutionId });
}

export function readSyncStatus(home) {
  try { return JSON.parse(fs.readFileSync(path.join(home, SYNC_FILE), 'utf8')); } catch { return null; }
}

/** Never fails the refresh it describes: the status file is a note for the next session start. */
export function writeSyncStatus(home, value) {
  try {
    const file = path.join(home, SYNC_FILE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
    fs.renameSync(temp, file);
  } catch { /* a read-only folder still refreshes */ }
}

/** How a failed refresh is recorded. */
export function failureStatus(code) {
  if (['AUTH_EXPIRED', 'NO_SESSION'].includes(code)) return { status: 'failed', reason: 'sign-in expired' };
  return { status: 'failed', reason: code ?? 'ERROR' };
}

/**
 * How long a finished refresh is reused instead of run again. A command that
 * follows setup, or follows another command of the same chain, reads what the
 * last one pulled rather than pulling the whole solution a second time.
 * Short enough that a change made on the tenant meanwhile is picked up by the
 * next command, and the cache was never proof of a write in any case: a builder
 * reads back live, and a write this session sent marks its own entities stale.
 */
export const REFRESH_REUSE_MS = 90_000;

/**
 * True when a successful refresh of this solution finished within the reuse
 * window. A status from another solution or tenant never counts, so switching
 * solutions in a folder always pulls.
 */
export function refreshIsFresh(home, state, { now = Date.now(), withinMs = REFRESH_REUSE_MS } = {}) {
  const status = readSyncStatus(home);
  if (status?.status !== 'ok' || !status.endedAt) return false;
  if (status.solutionId !== state?.solutionId) return false;
  if ((status.tenant ?? null) !== (state?.tenant ?? null)) return false;
  const endedAt = Date.parse(status.endedAt);
  // A status stamped in the future is a clock that moved: pull rather than trust it.
  return Number.isFinite(endedAt) && endedAt <= now && now - endedAt < withinMs;
}

/** `refreshCurrent`, unless one finished moments ago. Returns whether it ran. */
export async function refreshCurrentIfStale(ctx, options) {
  if (refreshIsFresh(ctx?.home, ctx?.state, options)) return { refreshed: false };
  await refreshCurrent(ctx);
  return { refreshed: true };
}

export async function refreshCurrent(ctx) {
  if (!ctx?.service || !ctx.home || !ctx.state?.solutionId) throw new UaError('NOT_STARTED');
  const startedAt = new Date().toISOString();
  const base = { startedAt, pid: process.pid, solutionId: ctx.state.solutionId, tenant: ctx.state.tenant ?? null };
  writeSyncStatus(ctx.home, { status: 'running', ...base, endedAt: null, changed: null, failed: null, error: null, reason: null });
  try {
    const { claudeSessionId: sessionId } = ctx.state;
    const records = await fetchSolution(ctx.service, ctx.state.solutionId, { sessionId });
    const counts = reconcileRecords(ctx.home, records);
    const entities = await refreshLinkedEntities(ctx.home, ctx.service, records.solution, records.assets);
    const skills = await syncSolutionSkills({ cwd: ctx.cwd, tenant: ctx.state.storage === 'local' ? null : ctx.state.tenant, solutionId: ctx.state.solutionId, assets: records.assets });
    writeSyncStatus(ctx.home, { status: 'ok', ...base, solutionName: records.solution?.properties?.name ?? null, endedAt: new Date().toISOString(),
      changed: entities.refreshed, failed: entities.stale.length, error: null, reason: null });
    return { records, counts, entities, skills };
  } catch (error) {
    writeSyncStatus(ctx.home, { ...base, ...failureStatus(error?.code), endedAt: new Date().toISOString(), changed: null, failed: null,
      error: { code: error?.code ?? 'ERROR', message: error?.message ?? 'The refresh failed.' } });
    throw error;
  }
}
