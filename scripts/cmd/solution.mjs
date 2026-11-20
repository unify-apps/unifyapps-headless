import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MODE, GLOBAL_WORKSPACE_NAME, UaError, normalizeTenant, normalizeStorage, norm, actorsMatch, SOLUTION_TAG, SOLUTION_ID } from '../lib/contracts.mjs';
import { GLOBAL_WORKSPACE, isGlobalWorkspace, resolveWorkspace, workspaceOf } from '../platform/workspaces.mjs';
import { isUaPlan, parseMemory, renderMemory, parseFeature, parsePlan } from '../lib/formats.mjs';
import { isPrd, prdIndex } from '../lib/prd.mjs';
import { serviceFor } from '../platform/service.mjs';
import { fetchUserIdentity, knownEnvironment } from '../platform/user-context.mjs';
import { withRetry } from '../lib/retry.mjs';
import { paths, solutionKey, canonicalCwd, readConfig, registerSession, registerSignIn, solutionsForTenant, sessionsForSolution, readState, writeState, resetSessionState, reconcileRecords, readRecord, readRecords, validatedSessionId, assertStarted, writeConfig, ensureFolderSelection } from '../folder/local.mjs';
import { assertTenantBindingFree, connectTenantBinding, moveSessionHere, sessionForFolder } from '../folder/session-registry.mjs';
import { fetchSolution, readSyncStatus, refreshCurrent, refreshCurrentIfStale, writeSyncStatus } from '../folder/solution-sync.mjs';
import { setupTenantMcp } from '../platform/tenant-mcp.mjs';
import { linkedAssetRefs, listCachedEntities, refreshLinkedEntities, solutionLinks } from '../folder/entity-cache.mjs';
import { syncSolutionSkills } from '../folder/skill-sync.mjs';
import { readInterfaceManifest } from '../folder/interface-cache.mjs';
import { checkTenantStorage, isLocalId } from '../platform/storage-check.mjs';
import { bunPresence, pdfToolsPresence } from '../platform/local-tools.mjs';
import { entityUrl, rowsTable } from '../lib/entity-links.mjs';
import { liveSessionIds, maybeStopped } from '../lib/progress-table.mjs';
import { parseEntityInput, extractLinks } from '../lib/entity-target.mjs';
import { callSolutionTool } from '../platform/solution-mcp.mjs';
import { claimHandoff, claimedHandoffIdentity, claudeApp, consumeHandoff, handoffFolder, handoffIdentity, folderHoldsSolution, HANDOFF_REQUEST_MAX, pinHandoff, readHandoff, releaseHandoff, validHandoffEntity, writeHandoff } from '../folder/handoff.mjs';

const required = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new UaError('USAGE', `${label} is required.`);
  return value.trim();
};
const tenantFrom = (flags) => normalizeTenant(required(flags.tenant, 'Tenant'));
/**
 * One workspace id with the name the person would recognise. The name is a
 * courtesy: a tenant that cannot list workspaces just now still opens the
 * solution, with the id standing in for the name.
 */
const namedWorkspace = async (tenant, workspaceId) => {
  if (isGlobalWorkspace(workspaceId)) return { ...GLOBAL_WORKSPACE };
  const id = String(workspaceId);
  try { return await resolveWorkspace(tenant, id); }
  catch { return workspaceOf({ workspaceId: id }); }
};
/**
 * The workspace a create was asked for. No `--workspace` means Global, which is
 * what a tenant with no workspaces, and every folder set up before this, uses.
 * A named workspace is resolved on the tenant, so a typo is refused here rather
 * than silently creating the solution somewhere else.
 */
const workspaceFrom = async (tenant, flags) => {
  const asked = flags.workspace === undefined ? '' : String(flags.workspace).trim();
  if (!asked || isGlobalWorkspace(asked)) return { ...GLOBAL_WORKSPACE };
  return resolveWorkspace(tenant, asked);
};
const featuresFor = (records) => records.flatMap((record) => {
  const text = record?.properties?.document;
  // A PRD is a document too, but never a feature: it has no slug.
  try { const doc = parseFeature(text); return doc.meta.nebula === 3 && doc.meta.slug && !isPrd(doc.meta) ? [doc] : []; } catch { return []; }
});
// One short line of facts per plan. A plan's full frontmatter carries its touches
// and the done work it carried forward, and 76 plans of one solution came to
// 620 KB; `plan get` reads one plan in full when it is needed.
const planInfo = (record) => {
  try {
    const { meta, tasks } = parsePlan(record.properties.plan);
    return { planId: record.id, title: meta.title, status: record.properties.status, mode: meta.mode ?? 'zen',
      specId: record.properties.specId ?? meta.specId ?? null, createdAt: meta.createdAt ?? null, runningAt: meta.runningAt ?? null, endedAt: meta.endedAt ?? null, derivedFromPlanId: meta.derivedFromPlanId ?? null,
      ...(isUaPlan(record) ? {} : { foreign: true }), owner: meta.owner, runner: meta.runner, tasks };
  }
  catch { return { planId: record.id, title: record.id, status: record.properties?.status, foreign: true, createdAt: new Date(record.createdTime ?? 0).toISOString() }; }
};
const taskCounts = (tasks = []) => Object.fromEntries(['pending', 'running', 'done', 'failed', 'skipped'].map((status) => [status, tasks.filter((task) => task.status === status).length]));
/** A local id names its own storage; otherwise the tenant's last storage check decides, and platform is the default. */
function storageFor(host, id, flags) {
  const explicit = normalizeStorage(flags.storage);
  if (explicit) return explicit;
  if (isLocalId(id)) return 'local';
  return readConfig().tenantStorage[host]?.storage ?? 'platform';
}
// The folders on this machine that already hold a solution, so setup can send
// the person to one instead of opening a second copy by accident.
// sessionsForSolution throws a plain Error on an id that is not a solution id;
// such an id has no folder. Any other error is real and goes up.
const foldersFor = (host, id) => {
  let sessions;
  try { sessions = sessionsForSolution(host, id); }
  catch (error) { if (error?.message === 'Invalid solution id.') return []; throw error; }
  return [...new Set(sessions.map((entry) => entry.cwd))].filter((folder) => folder && fs.existsSync(folder));
};
const MAX_NAME_MATCHES = 10;
// Solutions on the tenant whose name holds `name`, exact names first, so setup
// can open the one the person meant instead of creating a second with that name.
// A tenant with local storage has no solution records, so only this machine's
// folders can answer; a failed search is a warning, never a guess.
async function solutionsNamed(host, name, sessionId) {
  const wanted = norm(name), warnings = [];
  let rows;
  // search_solutions already dedupes, marks exact, puts exact names first and
  // stops at 10; only this machine's own list needs that done here.
  if (readConfig().tenantStorage[host]?.storage === 'local') {
    const local = solutionsForTenant(host).filter((row) => norm(row.name).includes(wanted));
    rows = [...new Map(local.map((row) => [row.id, { id: row.id, name: row.name, exact: norm(row.name) === wanted }])).values()]
      .sort((a, b) => Number(b.exact) - Number(a.exact)).slice(0, MAX_NAME_MATCHES);
  } else {
    try {
      const found = await callSolutionTool(host, 'search_solutions', { name: name.trim() }, { sessionId });
      if (found?.result !== 'ok' || !Array.isArray(found.matches)) throw new Error(found?.message ?? 'the search gave no answer.');
      rows = found.matches.map((row) => ({ id: row.id, name: row.name ?? null, exact: row.exact === true }));
    } catch (error) {
      if (['AUTH_EXPIRED', 'PERMISSION_REQUIRED'].includes(error?.code)) throw error;
      warnings.push(error?.details?.missingTool ? `${host} does not have the solution search yet, so UnifyApps Headless could not check the name "${name}".`
        : `Could not search ${host} for solutions named "${name}": ${error.message}`); rows = [];
    }
  }
  return { matches: rows.map((row) => ({ ...row, folders: foldersFor(host, row.id) })), warnings };
}
const folderService = (host, storage, cwd, sessionId, solutionId) => serviceFor(host, { retry: withRetry, storage, home: canonicalCwd(cwd), sessionId, solutionId });
// What the person typed after `/ua:setup`, kept on the session so a compaction,
// a resume or a saved session still knows what they came to do. Text only: it is
// never a command. Kept word for word, with the same cap and flag as a handoff's request.
const openingRequestFrom = (value) => {
  const text = typeof value === 'string' && value.trim() ? value : null;
  return { request: text ? text.slice(0, HANDOFF_REQUEST_MAX) : null, requestTruncated: !!text && text.length > HANDOFF_REQUEST_MAX };
};
// The handoff this open uses up: the one this session claimed, else the one in the
// folder when the command started. A handoff written later is left for its own session.
function handoffToConsume(ctx) {
  const claimed = ctx.sessionId ? claimedHandoffIdentity(ctx.cwd, ctx.sessionId) : null;
  if (claimed) return claimed;
  return readHandoff(ctx.cwd, Date.now(), undefined, ctx.sessionId).state === 'claimed' ? null : handoffIdentity(ctx.cwd);
}
async function open(host, id, ctx, { overrideFolder = false, storage = 'platform', created = false, request = null, requestTruncated = false } = {}) {
  const sessionId = validatedSessionId(ctx.sessionId ?? process.env.CLAUDE_CODE_SESSION_ID);
  const service = ctx.service ?? folderService(host, storage, ctx.cwd, sessionId, id);
  const logHeaders = { sessionId };
  let records;
  try { records = await fetchSolution(service, id, logHeaders); }
  catch (error) {
    if (error?.code !== 'NOT_FOUND' || storage !== 'local') throw error;
    throw new UaError('NOT_FOUND', `Solution ${id} is stored locally and is not in this folder. Open the folder where it was created.`, { host, id });
  }
  // A record setup just made through the `create_solution` tool arrives here with
  // `--created` (the CLI create passes it too). A pending handoff file that named
  // this solution by name now names it by id, so a rerun after a failure below
  // opens this record instead of creating a second one.
  if (created) pinHandoff(ctx.cwd, id);
  const name = records.solution.properties.name;
  const key = solutionKey(name, host, id);
  // The workspace is the solution record's own, never a choice made here: the
  // record already lives somewhere, and everything this folder builds has to land
  // beside it. A local solution has no workspace at all.
  const workspace = storage === 'local' ? { ...GLOBAL_WORKSPACE } : await namedWorkspace(host, records.solution.projectId);
  ensureFolderSelection(ctx.cwd, { tenant: host, solutionId: id, override: overrideFolder });
  // The `create_solution` tool adds the `UnifyApps Headless` tag itself, as the
  // CLI create does. A tenant whose platform predates that leaves it off, so the
  // one missing tag is added here, once the folder is settled, so the write and
  // its local mirror land where they belong. The tag does not change the name or
  // the key. A record that already carries it is not written.
  let tagged = false;
  if (created && storage !== 'local') {
    const currentTags = Array.isArray(records.solution.tags) ? records.solution.tags : [];
    if (!currentTags.includes(SOLUTION_TAG)) {
      await service.update({ ...records.solution, tags: [...currentTags, SOLUTION_TAG] }, {});
      records = await fetchSolution(service, id, logHeaders);
      tagged = true;
    }
  }
  const home = paths(ctx.cwd, key, sessionId).home;
  const movedFrom = moveSessionHere(sessionId, ctx.cwd, { tenant: host, solutionId: id });
  let previous = null;
  try { previous = readState(home, sessionId); } catch { /* Fresh start rebuilds a corrupt disposable state. */ }
  const continuingSameSession = previous?.tenant === host && previous?.solutionId === id && previous?.claudeSessionId === sessionId;
  // The same session reopening its own solution keeps everything it had: its mode, the
  // agents it started and its opening request, so a second /ua:setup loses nothing.
  if (!continuingSameSession) resetSessionState(home, { sessionId });
  const counts = reconcileRecords(home, records);
  const openStartedAt = new Date().toISOString();
  const entities = await refreshLinkedEntities(home, service, records.solution, records.assets);
  const skills = await syncSolutionSkills({ cwd: ctx.cwd, tenant: storage === 'local' ? null : host, solutionId: id, assets: records.assets });
  // Who is signed in, read once here and kept on this folder's session state, so
  // a plan or PRD this session writes names its author. An unreadable identity is
  // left out, never waited for.
  const identity = await (ctx.identity ?? fetchUserIdentity)(host);
  const sessionMode = (continuingSameSession ? previous?.mode : null) ?? DEFAULT_MODE;
  writeState(home, { claudeSessionId: sessionId, tenant: host, solutionId: id, solutionName: name, key, mode: sessionMode, storage,
    // Global is stored as nothing, so a folder from before workspaces reads the same as one that chose Global.
    workspaceId: workspace.global ? undefined : workspace.id, workspaceName: workspace.global ? undefined : workspace.name,
    // Names only the request typed on this exact open/create; it never accumulates
    // across calls, so an open with none clears whatever an earlier call recorded.
    openingRequest: request, openingRequestTruncated: requestTruncated || undefined,
    userEmail: identity?.email, userId: identity?.userId,
    // The environment the tenant answered on this open, so a builder's prompt
    // can name it: Claude Code's auto mode judges the builder's calls by that
    // prompt alone.
    ...(knownEnvironment(host) ? { environment: knownEnvironment(host) } : {}),
    startedAt: new Date().toISOString(),
    planIds: continuingSameSession && Array.isArray(previous.planIds) ? previous.planIds : [] }, sessionId);
  registerSession({ sessionId, cwd: ctx.cwd, tenant: host, solutionId: id, solutionName: name, storage,
    workspaceId: workspace.global ? undefined : workspace.id, workspaceName: workspace.global ? undefined : workspace.name });
  // This open just pulled the whole solution, so it records the sync status a
  // typed `solution refresh` would have. Without this the status file still
  // describes an older pass, and the session start that opened the folder waits
  // out its whole window for a refresh it no longer needs to run. Written last, once the
  // session's state is saved: the session start stops waiting on it.
  writeSyncStatus(home, { status: 'ok', startedAt: openStartedAt, pid: process.pid, solutionId: id, tenant: host,
    solutionName: name, endedAt: new Date().toISOString(), changed: entities.refreshed, failed: entities.stale.length,
    error: null, reason: null });
  // A local solution lives only in this folder, so it has no platform link.
  const url = storage === 'local' ? null : entityUrl(host, { kind: 'solution', id }, { workspaceId: workspace.id });
  const entityTable = url ? rowsTable([{ name, kind: 'solution', status: created ? '✅ Created' : '✅ Opened', url }]) : '';
  return { data: { key, id, name, home, mode: sessionMode, storage, workspace, openingRequest: request, ...(requestTruncated ? { openingRequestTruncated: true } : {}), claudeSessionId: sessionId, plans: records.plans.length, specs: records.specs.length, features: counts.features,
    linkedEntities: entities,
    ...(skills.written.length || skills.removed.length || skills.flagged.length || skills.failed.length
      ? { skills: { fetched: skills.written.length, removed: skills.removed.length, flagged: skills.flagged.length, failed: skills.failed.length } } : {}),
    url, entityTable, ...(created ? { created: true, tagged } : {}), ...(movedFrom ? { movedFrom } : {}) },
  message: `Working on ${name} on ${host}${storage === 'local' ? ', stored in this folder' : ''}.${movedFrom ? ` This Claude session now works in this folder, not ${movedFrom}.` : ''}` };
}
/** The solutions on `tenant` that hold `target`, or `localOnly` when that tenant keeps solutions in folders. Reads only. */
async function findEntitySolutions(tenant, target, sessionId) {
  if (readConfig().tenantStorage[tenant]?.storage === 'local') {
    return { entity: null, candidates: [], notFound: false, direct: [], suggested: [], warnings: [], localOnly: true };
  }
  const input = target.kind === 'name' ? { name: target.name }
    : { kind: target.kind, id: target.id, ...(target.appId ? { appId: target.appId } : {}) };
  // The shared message talks about recording plan progress, which find never does.
  const cannotReach = (details) => new UaError('PLATFORM_UNREACHABLE', `Cannot reach ${tenant} to search its solutions. Try again in a few minutes.`, details);
  let found;
  try { found = await callSolutionTool(tenant, 'find_entity_solutions', input, { sessionId }); }
  catch (error) {
    if (error?.details?.missingTool) throw new UaError('PLATFORM_UNREACHABLE', `${tenant} does not have the solution search yet, so UnifyApps Headless could not check which solutions hold it.`, error.details);
    if (error?.code === 'PLATFORM_UNREACHABLE') throw cannotReach(error.details);
    throw error;
  }
  if (found?.result !== 'ok') throw cannotReach({ host: tenant, reason: found?.message ?? null });
  if (!Array.isArray(found.direct) || !Array.isArray(found.suggested)) throw cannotReach({ host: tenant, reason: 'the search answer has no solution lists' });
  found = { entity: found.entity ?? null, candidates: found.candidates ?? [], notFound: Boolean(found.notFound),
    direct: found.direct, suggested: found.suggested.map((row) => ({ ...row, via: Array.isArray(row.via) ? row.via : [] })), warnings: found.warnings ?? [] };
  const withFolders = (rows) => rows.map((row) => ({ ...row, folders: foldersFor(tenant, row.id) }));
  return { ...found, direct: withFolders(found.direct), suggested: withFolders(found.suggested) };
}
export const LOCATE_STATUS = Object.freeze({
  IN_THIS_SOLUTION: 'in-this-solution', UNLINKED_SAME_TENANT: 'unlinked-same-tenant', IN_OTHER_SOLUTION: 'in-other-solution',
  OTHER_TENANT: 'other-tenant', NOT_FOUND: 'not-found', LOOKUP_FAILED: 'lookup-failed', NO_SOLUTION_HERE: 'no-solution-here', INVALID_LINK: 'invalid-link',
});
const LOCATABLE_KINDS = new Set(['app', 'page', 'object', 'automation']);
/**
 * Which solution holds an entity on another tenant. Reads only, and never signs in:
 * without a sign-in there the answer is `unknown`, and the new session finds out.
 */
async function lookElsewhere(link, sessionId) {
  const host = normalizeTenant(link.host);
  if (!LOCATABLE_KINDS.has(link.kind)) return { status: 'unknown', reason: `solution find cannot look up a ${link.kind}` };
  let found;
  try { found = await findEntitySolutions(host, { kind: link.kind, id: link.id, appId: link.appId }, sessionId); }
  catch (error) {
    return { status: 'unknown', reason: error?.code === 'AUTH_EXPIRED' ? 'signed-out' : error?.message ?? String(error) };
  }
  if (found.localOnly || found.warnings.length || found.candidates.length) return { status: 'unknown', reason: found.warnings[0] ?? 'the search was not complete' };
  if (found.notFound) return { status: 'not-found', entity: found.entity };
  if (found.direct.length) return { status: 'in-solution', entity: found.entity, solutions: found.direct.map(({ id, name, folders }) => ({ id, name: name ?? null, folders })) };
  return { status: 'unlinked', entity: found.entity };
}
// A bare id (no host, so no builder-link pattern to read a kind from) names
// no kind on its own and extractLinks gives it `unknown`. Before refusing it
// as unknown, the workspace cache already knows every linked entity's own
// type, from its own versioned snapshot: e_component is a page (its app comes
// from whichever cached app's interface manifest lists it as a member),
// e_interface an app, ai_agent an agent. A cache miss (never cached here, or
// no workspace cache at all) leaves the id unknown.
function appIdForPage(home, pageId) {
  for (const app of listCachedEntities(home).filter((item) => item.entityType === 'e_interface')) {
    let manifest;
    try { manifest = readInterfaceManifest(home, app.id); } catch { continue; }
    if (manifest?.members?.some((member) => member.id === pageId && member.entityType.includes('component'))) return app.id;
  }
  return null;
}
function resolveUnknownKind(id, home) {
  if (!home) return null;
  let snapshots;
  try { snapshots = listCachedEntities(home); } catch { return null; }
  const snapshot = snapshots.find((item) => item.id === id);
  if (!snapshot) return null;
  if (snapshot.entityType === 'e_interface') return { kind: 'app' };
  if (snapshot.entityType === 'ai_agent') return { kind: 'agent' };
  if (snapshot.entityType === 'e_component') return { kind: 'page', appId: appIdForPage(home, id) };
  return null;
}

async function locateLink(link, ctx, here) {
  const tenant = here.tenant;
  // The host a link parsed to is on the link object whether or not the rest
  // of it could be classified, so a tenant mismatch is checked regardless of
  // `link.valid` — an unrecognized host (a production tenant's own hostname,
  // say) must not lose this comparison just because nothing else about the
  // link could be read.
  const otherTenant = tenant && link.host && normalizeTenant(link.host) !== tenant;
  if (!link.valid) {
    const invalidRow = { raw: link.raw, host: link.host, kind: link.kind, id: link.id, ...(link.appId ? { appId: link.appId } : {}) };
    const reason = otherTenant ? `${link.reason} (and this host does not match ${tenant} either)` : link.reason;
    return { ...invalidRow, status: LOCATE_STATUS.INVALID_LINK, reason };
  }
  const resolved = link.kind === 'unknown' && link.id ? resolveUnknownKind(link.id, ctx.home) : null;
  const target = resolved ? { ...link, kind: resolved.kind, appId: resolved.appId ?? link.appId } : link;
  const row = { raw: target.raw, host: target.host, kind: target.kind, id: target.id, ...(target.appId ? { appId: target.appId } : {}) };
  // A bare id names no host, so it is read as this folder's tenant.
  if (otherTenant) return { ...row, status: LOCATE_STATUS.OTHER_TENANT, tenant, elsewhere: await lookElsewhere(target, ctx.sessionId) };
  if (!LOCATABLE_KINDS.has(target.kind)) {
    const reason = target.kind === 'unknown' ? `the kind of ${target.id} could not be told from an id alone, and the workspace cache does not have it either`
      : `solution find cannot look up a ${target.kind}`;
    return { ...row, status: LOCATE_STATUS.INVALID_LINK, reason };
  }
  // `here` already carries the fallback a brand-new session needs — ctx.state is read
  // only once the session opens the solution, so checking the raw ctx.state here voted
  // NO_SOLUTION_HERE for a subfolder that `here` (sessionForFolder) knows is a member.
  if (!here.tenant || !here.id) return { ...row, status: LOCATE_STATUS.NO_SOLUTION_HERE };
  let found;
  try { found = await findEntitySolutions(tenant, { kind: target.kind, id: target.id, appId: target.appId }, ctx.sessionId); }
  catch (error) { return { ...row, status: LOCATE_STATUS.LOOKUP_FAILED, error: { code: error?.code ?? 'ERROR', message: error?.message ?? String(error) } }; }
  if (found.localOnly) {
    return { ...row, status: LOCATE_STATUS.LOOKUP_FAILED, error: { code: 'LOCAL_STORAGE', message: `${tenant} keeps solutions in folders, not on the tenant, so UnifyApps Headless cannot search them.` } };
  }
  const entity = found.entity;
  // A direct row naming this solution is proof even when another part of the search failed.
  if (found.direct.some((solution) => solution.id === here.id)) return { ...row, entity, status: LOCATE_STATUS.IN_THIS_SOLUTION };
  if (found.notFound) return { ...row, entity, status: LOCATE_STATUS.NOT_FOUND };
  if (found.warnings.length || found.candidates.length) {
    const message = found.warnings.length ? found.warnings.map(String).join(' ') : 'The search matched several apps.';
    return { ...row, entity, status: LOCATE_STATUS.LOOKUP_FAILED, error: { code: 'PARTIAL_SEARCH', message } };
  }
  // Connected: an entity of this solution uses it or is used by it.
  const connected = found.suggested.some((solution) => solution.id === here.id);
  if (found.direct.length) {
    return { ...row, entity, connected, status: LOCATE_STATUS.IN_OTHER_SOLUTION, solutions: found.direct.map(({ id, name, folders }) => ({ id, name: name ?? null, folders })) };
  }
  const other = found.suggested.find((solution) => solution.id !== here.id);
  const via = other?.via[0];
  const suggested = other && via ? { id: other.id, name: other.name ?? other.id,
    reason: `Has the ${via.kind} "${via.name ?? via.id}", which ${via.link === 'itUses' ? `this ${target.kind} uses` : `uses this ${target.kind}`}.` } : null;
  return { ...row, entity, connected, ...(suggested ? { suggested } : {}), status: LOCATE_STATUS.UNLINKED_SAME_TENANT };
}
export async function run(command, args, flags, ctx) {
  if (command === 'resolve') {
    const tenant = tenantFrom(flags), text = required(args[0], 'Solution URL, ID or name');
    const match = /^https?:\/\/([^/]+)\/p\/[^/]+\/solutions\/([^/?#]+)/i.exec(text);
    let data;
    if (match) {
      const host = normalizeTenant(match[1]);
      if (host !== tenant) throw new UaError('TENANT_MISMATCH', { urlHost: host, tenant });
      let id; try { id = decodeURIComponent(match[2]); } catch { throw new UaError('USAGE', 'Invalid solution URL.'); }
      if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new UaError('USAGE', 'Invalid solution ID.');
      data = { kind: 'url', host, id };
    } else if (SOLUTION_ID.test(text)) data = { kind: 'id', id: text };
    else data = { kind: 'name', name: text, ...(await solutionsNamed(tenant, text, ctx.sessionId)) };
    if (data.id) return { data, message: `Solution ${data.id}.` };
    const exact = data.matches.filter((row) => row.exact).length;
    return { data, message: data.matches.length
      ? `${data.matches.length} ${data.matches.length === 1 ? 'solution matches' : 'solutions match'} "${data.name}" on ${tenant}${exact ? `, ${exact} by exact name` : ''}.`
      : `No solution named "${data.name}" on ${tenant}.` };
  }
  if (command === 'handoff') {
    const tenant = tenantFrom(flags);
    const id = typeof flags.id === 'string' ? flags.id.trim() : '', name = typeof flags.name === 'string' ? flags.name.trim() : '';
    if (Boolean(id) === Boolean(name)) throw new UaError('USAGE', 'Give exactly one of --id or --name.');
    if (id && !SOLUTION_ID.test(id)) throw new UaError('USAGE', 'Invalid solution ID.');
    const folder = handoffFolder(required(flags.folder, 'Folder'));
    fs.mkdirSync(folder, { recursive: true });
    if (folderHoldsSolution(folder)) throw new UaError('USAGE', `${folder} already holds a UnifyApps Headless solution. Choose another folder.`);
    // Kept word for word, whitespace included: the new session reads it as typed.
    const given = flags.request;
    const rawRequest = typeof given === 'string' && given.trim() ? given : null;
    const request = rawRequest ? rawRequest.slice(0, HANDOFF_REQUEST_MAX) : null, entity = typeof flags.entity === 'string' && flags.entity.trim() ? flags.entity.trim() : null;
    if (entity && !validHandoffEntity(entity, tenant)) throw new UaError('USAGE', `${entity} is not an entity link, id or name on ${tenant}.`);
    const body = { version: 1, tenant, ...(id ? { solutionId: id } : { solutionName: name }), ...(entity ? { entity } : {}), ...(request ? { request } : {}),
      ...(rawRequest && rawRequest.length > HANDOFF_REQUEST_MAX ? { requestTruncated: true } : {}),
      id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    writeHandoff(folder, body);
    return { data: { folder }, message: `Ready to continue in ${folder}.` };
  }
  if (command === 'handoff-claim') {
    if (!ctx.sessionId) throw new UaError('USAGE', 'A Claude session ID is required. Start UnifyApps Headless from Claude or supply --session <id>.');
    if (flags.release) {
      const released = releaseHandoff(ctx.cwd, ctx.sessionId);
      return { data: { released }, message: released ? 'Handoff released.' : 'This session holds no handoff claim here.' };
    }
    const result = claimHandoff(ctx.cwd, ctx.sessionId);
    return { data: result, message: ({ valid: 'Handoff claimed.', claimed: 'Another session already claimed this handoff.',
      missing: 'No handoff for this folder.', expired: 'The handoff for this folder has expired.', invalid: `The handoff for this folder is not valid: ${result.reason}.` })[result.state] };
  }
  if (command === 'find') {
    const tenant = tenantFrom(flags);
    const data = await findEntitySolutions(tenant, parseEntityInput(required(flags.entity, 'Entity link, id or name'), tenant), ctx.sessionId);
    if (data.localOnly) return { data, message: `${tenant} keeps solutions in folders, not on the tenant, so UnifyApps Headless cannot search them.` };
    const solutions = (count) => `${count} ${count === 1 ? 'solution' : 'solutions'}`;
    const message = data.candidates.length ? `${data.candidates.length} apps match; choose one.`
      : data.notFound ? (data.entity ? `No ${data.entity.kind} ${data.entity.id} on ${tenant}.` : `Nothing on ${tenant} has that id or app name.`)
        : data.warnings.length ? `Could not fully search ${tenant}: ${String(data.warnings[0]).replace(/\.?$/u, ".")} Found so far: ${solutions(data.direct.length)}, and ${data.suggested.length} more with a linked app, object or automation.`
        : `In ${solutions(data.direct.length)}. ${data.suggested.length} more ${data.suggested.length === 1 ? 'solution has' : 'solutions have'} an app, object or automation linked to it.`;
    return { data, message };
  }
  if (command === 'locate') {
    const links = extractLinks(required(flags.link, 'Link'));
    if (!links.length) throw new UaError('USAGE', 'No entity link or id found in --link.');
    const results = [];
    // A new session has not opened the folder's solution yet; the folder still names the tenant.
    const folder = ctx.state ? null : sessionForFolder(ctx.cwd);
    const current = ctx.state ? { id: ctx.state.solutionId, name: ctx.state.solutionName ?? ctx.state.solutionId, tenant: ctx.state.tenant }
      : { id: folder?.solutionId, name: folder?.solutionName, tenant: folder?.tenant };
    for (const link of links) {
      results.push(await locateLink(link, ctx, current));
    }
    const counts = Object.values(LOCATE_STATUS).map((status) => [status, results.filter((row) => row.status === status).length]).filter(([, n]) => n);
    return { data: { tenant: ctx.state?.tenant ?? null, solutionId: ctx.state?.solutionId ?? null, results },
      message: `${counts.map(([status, n]) => `${n} ${status}`).join(', ')}.` };
  }
  if (command === 'storage-check') {
    const host = tenantFrom(flags);
    const previous = readConfig().tenantStorage[host] ?? null;
    // This runs right after every verified sign-in, so it is where the tenant
    // bridges learn the tenant: a sign-in entry for this Claude session and folder,
    // with no solution, lists their tools while setup still runs. A production
    // tenant gets no entry; outside Claude, with no session id, nothing is written.
    const registerThisSignIn = () => {
      if (!ctx.sessionId) return false;
      registerSignIn({ sessionId: ctx.sessionId, cwd: ctx.cwd, tenant: host });
      return true;
    };
    // Local to this machine, not this tenant: whether a long PDF requirements
    // file will actually be readable, checked once up front here rather than
    // only discovered when a PDF read fails mid-task. Never folded into
    // checkTenantStorage itself, which stays tenant-record-existence only.
    const localTools = { pdf: pdfToolsPresence(), bun: bunPresence() };
    let result;
    try { result = await checkTenantStorage(serviceFor(host, { retry: withRetry, sessionId: ctx.sessionId, home: canonicalCwd(ctx.cwd) })); }
    catch (error) {
      if (error?.code === 'AUTH_EXPIRED' || !error?.code) throw error;
      // An unreachable probe decides nothing: keep the last answer, or the platform default.
      const fallback = previous ?? { storage: 'platform', missing: [], checkedAt: null };
      return { data: { ...fallback, checked: [], checkError: { code: error.code, message: error.message }, signInRegistered: registerThisSignIn(), localTools },
        message: error.code === 'PERMISSION_REQUIRED' ? error.message
          : `Could not check ${host} for solution records; continuing with ${fallback.storage} storage.` };
    }
    writeConfig({ tenantStorage: { [host]: { storage: result.storage, missing: result.missing, checkedAt: result.checkedAt } } });
    return { data: { ...result, signInRegistered: registerThisSignIn(), localTools }, message: result.storage === 'local'
      ? `${host} has no solution records (${result.missing.join(', ')} missing); UnifyApps Headless keeps solution files in this folder.`
      : `${host} holds solution records.` };
  }
  if (command === 'connect') {
    const host = tenantFrom(flags);
    const binding = connectTenantBinding({ sessionId: ctx.sessionId, cwd: ctx.cwd, tenant: host });
    const said = { connected: `Connected this folder to ${host}.`, joined: `This session joined ${host} in this folder.`,
      replaced: `Connected this folder to ${host}, in place of ${binding.replacedTenant}.` }[binding.action];
    return { data: binding, message: `${said}${binding.solutionId ? ' A solution is open here too.' : ' No solution is open: tenant tools answer reads only.'}` };
  }
  if (command === 'mcp-setup') {
    // Not a startup step: run only after a tenant tool call fails, to verify the
    // current base or store a replacement URL. The bridge reads the saved or
    // default base per call, so no per-session verification stamp exists.
    const host = tenantFrom(flags);
    if (!ctx.state && ctx.tenantBinding) {
      if (host !== ctx.tenantBinding.tenant) throw new UaError('TENANT_MISMATCH', { urlHost: host, tenant: ctx.tenantBinding.tenant });
      const result = await setupTenantMcp(host, { url: flags.url, writeConfig });
      // Rewrites sessions.json, which tells running bridges the tool base may have changed.
      connectTenantBinding({ sessionId: ctx.sessionId, cwd: ctx.cwd, tenant: host });
      return { data: { ...result, verified: true, verifiedAt: new Date().toISOString() }, message: `Tools ready for ${host}.` };
    }
    if (host !== ctx.state?.tenant) throw new UaError('TENANT_MISMATCH', { urlHost: host, tenant: ctx.state?.tenant });
    const result = await setupTenantMcp(host, {
      url: flags.url,
      writeConfig: patch => writeConfig(patch, { beforeWrite: () => assertStarted(ctx.home, ctx.sessionId) }),
    });
    assertStarted(ctx.home, ctx.sessionId);
    const verifiedAt = new Date().toISOString();
    // Notify already-running bridges that the tool base may have changed.
    registerSession({ sessionId: ctx.sessionId, cwd: ctx.cwd, tenant: host, solutionId: ctx.state.solutionId,
      solutionName: ctx.state.solutionName ?? readRecord(ctx.home, 'solution').properties.name,
      // This rewrite exists to tell running bridges the tool base moved; it must
      // not drop the workspace they read from the same row.
      workspaceId: ctx.state.workspaceId, workspaceName: ctx.state.workspaceName });
    return { data: { ...result, verified: true, verifiedAt }, message: `Tools ready for ${host}.` };
  }
  if (command === 'open') {
    const tenant = tenantFrom(flags), id = required(flags.id, 'Solution ID');
    assertTenantBindingFree({ sessionId: ctx.sessionId, cwd: ctx.cwd, tenant });
    const handoff = handoffToConsume(ctx);
    // `--created`: setup made the record a moment ago through the `create_solution`
    // tool and opens it here, so the table says Created and the tag is checked.
    const result = await open(tenant, id, { ...ctx, service: undefined },
      { overrideFolder: !!flags['override-folder'], storage: storageFor(tenant, id, flags), created: Boolean(flags.created), ...openingRequestFrom(flags.request) });
    consumeHandoff(ctx.cwd, handoff);
    return result;
  }
  if (command === 'create') {
    const tenant = tenantFrom(flags), name = required(flags.name, 'Solution name');
    assertTenantBindingFree({ sessionId: ctx.sessionId, cwd: ctx.cwd, tenant });
    const handoff = handoffToConsume(ctx);
    const sameName = solutionsForTenant(tenant).filter((s) => norm(s.name) === norm(name)).map(({ key, id }) => ({ key, id }));
    ensureFolderSelection(ctx.cwd, { tenant, override: !!flags['override-folder'] });
    const storage = storageFor(tenant, null, flags);
    // `--prepare`: the checks above and nothing else. Setup runs it before it calls
    // the `create_solution` tool, so a folder that cannot take a solution is refused
    // before any record exists on the tenant. `via` says which path makes the record:
    // the tool, with exactly these arguments (the tool adds the `UnifyApps Headless` tag itself),
    // or this command without `--prepare` for a tenant whose solutions live in the
    // folder, where no tool can write.
    // The workspace the solution is made in. `create_solution` takes no workspace,
    // so anything but Global is created here instead, where the request can carry
    // the workspace header.
    const workspace = await workspaceFrom(tenant, flags);
    if (flags.prepare) {
      const via = storage === 'local' || !workspace.global ? 'cli' : 'tool';
      const throughTool = via === 'tool';
      return { data: { prepared: true, via, storage, name, sameName, workspace,
        ...(throughTool ? { tool: { server: 'solution', name: 'create_solution', arguments: { name } } } : {}) },
      message: throughTool ? `Ready to create "${name}" on ${tenant} through create_solution.`
        : workspace.global ? `Ready to create "${name}" in this folder.`
          : `Ready to create "${name}" on ${tenant} in the ${workspace.name} workspace.` };
    }
    const service = folderService(tenant, storage, ctx.cwd, ctx.sessionId);
    let record;
    // Through the entity API itself: this create is the fallback for a tenant without `create_solution`, the local store's own, and every create into a workspace.
    try { record = await service.create('e_solution', { name, description: '', memory: renderMemory({}) }, { tags: [SOLUTION_TAG], direct: true, workspaceId: workspace.id }); }
    catch (error) {
      // A tenant that answers but cannot create the record can still keep this solution in the folder.
      if (storage === 'platform' && error?.code === 'PLATFORM_UNREACHABLE' && error.status >= 500) error.details = { ...error.details, localFallback: true };
      throw error;
    }
    // A 200 is a claim about the call, not about where the record landed: a
    // workspace that did not take refuses here, while the only thing made is one
    // empty solution record, rather than after a folder has been built on it.
    if (storage !== 'local' && !workspace.global && String(record.projectId ?? '') !== workspace.id) {
      throw new UaError('WORKSPACE_MISMATCH', undefined, { asset: `The new solution "${name}"`,
        assetWorkspace: record.projectId ? `workspace ${record.projectId}` : GLOBAL_WORKSPACE_NAME, solutionWorkspace: workspace.name });
    }
    pinHandoff(ctx.cwd, record.id);
    const result = await open(tenant, record.id, { ...ctx, service }, { overrideFolder: !!flags['override-folder'], storage, created: true, ...openingRequestFrom(flags.request) });
    consumeHandoff(ctx.cwd, handoff);
    return { ...result, data: { ...result.data, sameName } };
  }
  if (command === 'refresh') {
    const { records, counts, entities, skills } = await refreshCurrent(ctx);
    return { data: { id: ctx.state.solutionId, plans: records.plans.length, specs: records.specs.length, features: counts.features,
      linkedEntities: entities,
      ...(skills.written.length || skills.removed.length || skills.flagged.length || skills.failed.length
        ? { skills: { fetched: skills.written.length, removed: skills.removed.length, flagged: skills.flagged.length, failed: skills.failed.length } } : {}) },
    message: 'Solution refreshed.' };
  }
  if (command === 'context') {
    // A plan (or anything else) created on the platform in another session or
    // chat only reaches this folder's local cache through a refresh. Every
    // other command that reads it either writes the cache itself or already
    // refreshes first; context did neither, so it stayed stale until some
    // other command happened to refresh it, or the person ran solution
    // refresh by hand. The attempt is best-effort and skipped once the last
    // sync was itself refused for production: context is a read of this
    // folder's own copy, and it keeps answering from that copy rather than
    // repeat an attempt the gate already refused once, word for word, at the
    // CLI level no catch here can soften.
    if (!ctx.refreshed && readSyncStatus(ctx.home)?.reason !== 'production') {
      try { await refreshCurrentIfStale(ctx); } catch { /* answer from the local copy */ }
    }
    const record = readRecord(ctx.home, 'solution');
    if (!record) throw new UaError('NOT_STARTED');
    const p = record.properties;
    const memory = parseMemory(p.memory), lines = p.memory ? p.memory.split(/\r?\n/).length : 0;
    const features = featuresFor(readRecords(ctx.home, 'doc')).map(({ meta }) => ({ slug: meta.slug, name: meta.name, summary: meta.summary, entities: meta.entities }));
    const prds = prdIndex(readRecords(ctx.home, 'doc').filter(doc => doc.properties?.solutionId === record.id));
    const plans = readRecords(ctx.home, 'plan').map(planInfo).sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    const supersededPlanIds = new Set(plans.map(plan => plan.derivedFromPlanId).filter(Boolean));
    const otherSessions = sessionsForSolution(ctx.state.tenant, ctx.state.solutionId, { excludeSessionId: ctx.state.claudeSessionId });
    let resumable = null;
    for (const plan of plans) {
      if (plan.foreign || supersededPlanIds.has(plan.planId)) continue;
      const reason = ['failed', 'interrupted'].includes(plan.status) ? plan.status
        : plan.status === 'planned' ? (actorsMatch(plan.owner, ctx.actor) ? 'not-started' : null)
          : actorsMatch(plan.owner, ctx.actor) && maybeStopped(plan, ctx.state.claudeSessionId, { clientId: ctx.actor?.clientId, live: liveSessionIds(otherSessions) }) ? 'stale-running' : null;
      if (reason) { resumable = { planId: plan.planId, title: plan.title, status: plan.status, reason, mode: plan.mode ?? 'zen', specId: plan.specId, counts: taskCounts(plan.tasks) }; break; }
    }
    // The workspace decides where every build lands and which items may be
    // changed at all, so it sits beside the tenant rather than behind its own
    // command. A folder from before workspaces were asked for reads as Global.
    const workspace = ctx.state.storage === 'local' ? { ...GLOBAL_WORKSPACE } : workspaceOf(ctx.state);
    return { data: { app: claudeApp(), tenant: ctx.state.tenant ?? null, workspace, environment: ctx.state.environment ?? null, mode: ctx.state.mode ?? null, execution: ctx.state.execution ?? null, storage: ctx.state.storage ?? 'platform', openingRequest: ctx.state.openingRequest ?? null, ...(ctx.state.openingRequestTruncated ? { openingRequestTruncated: true } : {}), solution: { id: record.id, name: p.name, description: p.description, status: p.status ?? null, linkedEntities: solutionLinks(record, readRecords(ctx.home, 'asset')), linkedAssets: linkedAssetRefs(readRecords(ctx.home, 'asset')) },
      memory: { ...memory, lines }, features, prds, plans: plans.map(({ owner, runner, tasks, runningAt, endedAt, ...index }) => index), sessionPlanIds: Array.isArray(ctx.state.planIds) ? ctx.state.planIds : [], resumable, otherSessions, memoryOverCap: lines > 500 },
    message: `Working on ${p.name}${workspace.global ? '' : ` in the ${workspace.name} workspace`}.` };
  }
  throw new UaError('USAGE', `Unknown solution command: ${command}.`);
}
