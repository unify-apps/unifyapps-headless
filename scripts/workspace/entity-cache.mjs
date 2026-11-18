/** Versioned local snapshots of the platform entities linked to a solution. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { UaError, toLinkedEntity } from '../lib/contracts.mjs';
import { assertHome, assertLocalPath, atomicFile, readJsonFile } from '../lib/session-paths.mjs';
import { cacheRecords, readRecord, readRecords } from './local.mjs';
import {
  readCachedInterfaceContext,
  readCachedPageBody as readInterfacePageBody,
  readCachedPageContext as readInterfacePageContext,
  readInterfaceManifest,
  refreshInterface,
  refreshInterfaceCache,
} from './interface-cache.mjs';

export { markCachedInterfaceDirty, markCachedPageDirty } from './interface-cache.mjs';

const now = () => new Date().toISOString();
const entityPartPattern = /^[A-Za-z0-9_-]+$/u;
// The types the cache reads by id. An app comes back through its own read, with
// its pages and data sources; the cache reads no other kind.
const READ_BY_ID = new Set(['ENTITY_TYPE', 'WORKFLOW_DEFINITION', 'ai_agent']);

/** Whether a value can name a cached entity: the check every cache read makes first. */
export const isSafeEntityPart = (value) => entityPartPattern.test(String(value ?? '').trim());

// A snapshot is a copy of the tenant's own data, so one file that will not
// parse (a bad merge left conflict markers in it) is a miss, not a stop: it is
// named once per process and every other entity still reads.
const warnedFiles = new Set();
function readSnapshotFile(file) {
  try { return readJsonFile(file, null); }
  catch (error) {
    if (!(error?.cause instanceof SyntaxError)) throw error;
    // ua.mjs says it is the only module that prints, because a `--json`
    // caller needs stdout to hold exactly one JSON document: a write here that
    // lands on stderr mid-command can still turn up ahead of that document in
    // a combined capture (2>&1, or Claude Code's Bash tool, which reads both
    // from one pipe). So this warning, useful only to a person watching the
    // terminal, is skipped outright under --json.
    if (!warnedFiles.has(file)) {
      warnedFiles.add(file);
      if (!process.argv.includes('--json')) {
        process.stderr.write(`UnifyApps Headless skipped ${file}: it is not valid JSON. Delete it and run solution refresh to read it again from the tenant.\n`);
      }
    }
    return null;
  }
}

function safeEntityPart(value, label) {
  const part = String(value ?? '').trim();
  if (!isSafeEntityPart(part)) throw new UaError('USAGE', `A safe ${label} is required.`);
  return part;
}

const identity = (entityType, id) => `${safeEntityPart(entityType, 'entity type')}:${safeEntityPart(id, 'entity ID')}`;

function typeDirectory(home, entityType) {
  const root = assertHome(home);
  return assertLocalPath(path.join(root, 'entities', safeEntityPart(entityType, 'entity type')), root);
}

// A write that left this process for an object or an automation leaves a marker
// beside the snapshots, the way a page edit does in the interface manifest. The
// marker outlives any read that began before it, so a refresh that was already
// in flight cannot clear it: only a read started after the write does.
function dirtyDirectory(home, entityType) {
  const root = assertHome(home);
  return assertLocalPath(path.join(root, 'entity-manifests', 'entity-dirty', safeEntityPart(entityType, 'entity type')), root);
}
function dirtyEntityFiles(home, entityType, id) {
  const directory = dirtyDirectory(home, entityType);
  if (!fs.existsSync(directory)) return [];
  const prefix = `${safeEntityPart(id, 'entity ID')}.`;
  return fs.readdirSync(directory).filter(name => name.startsWith(prefix) && name.endsWith('.json'));
}
function clearDirtyEntityFiles(home, entityType, names) {
  const directory = dirtyDirectory(home, entityType);
  for (const name of names ?? []) {
    try { fs.unlinkSync(assertLocalPath(path.join(directory, name), directory)); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
}

export function markCachedEntityDirty(home, entityType, id) {
  if (!readCachedEntity(home, entityType, id)) return false;
  const marker = path.join(dirtyDirectory(home, entityType), `${safeEntityPart(id, 'entity ID')}.${randomUUID()}.json`);
  atomicFile(marker, `${JSON.stringify({ entityType, id, dirtyAt: now() })}\n`);
  return true;
}

function entityVersionFile(home, entityType, id, version) {
  const entityId = safeEntityPart(id, 'entity ID');
  if (!Number.isSafeInteger(version) || version < 0) throw new UaError('USAGE', 'A valid entity version is required.');
  return path.join(typeDirectory(home, entityType), `${entityId}_${version}.json`);
}

function normalizeRecord(record, entityType, id) {
  const normalized = { ...record, id: String(record?.id ?? id ?? '').trim(), entityType: String(record?.entityType ?? entityType ?? '').trim() };
  if (!normalized.id || !normalized.entityType || !Number.isFinite(normalized.version)) {
    throw new UaError('PLATFORM_UNREACHABLE', 'The platform did not return a versioned entity.');
  }
  safeEntityPart(normalized.entityType, 'entity type');
  safeEntityPart(normalized.id, 'entity ID');
  return normalized;
}

export function readCachedEntity(home, entityType, id) {
  const entityId = safeEntityPart(id, 'entity ID');
  const directory = typeDirectory(home, entityType);
  if (!fs.existsSync(directory)) return null;
  const versions = fs.readdirSync(directory).flatMap(name => {
    const prefix = `${entityId}_`;
    if (!name.startsWith(prefix) || !name.endsWith('.json')) return [];
    const rawVersion = name.slice(prefix.length, -'.json'.length);
    return /^\d+$/u.test(rawVersion) ? [{ name, version: Number(rawVersion) }] : [];
  }).filter(item => Number.isSafeInteger(item.version)).sort((a, b) => b.version - a.version);
  return versions.length ? readSnapshotFile(path.join(directory, versions[0].name)) : null;
}

/**
 * The newest cached version of every entity of one type, from one listing of
 * its directory. A refresh needs this for a whole page of ids, and
 * `readCachedEntity` would list the same directory once per id.
 */
function newestCachedVersions(home, entityType) {
  const directory = typeDirectory(home, entityType);
  const newest = new Map();
  if (!fs.existsSync(directory)) return newest;
  for (const name of fs.readdirSync(directory)) {
    const match = /^(.+)_(\d+)\.json$/u.exec(name);
    const version = Number(match?.[2]);
    if (!match || !Number.isSafeInteger(version)) continue;
    if (!(newest.get(match[1]) >= version)) newest.set(match[1], version);
  }
  return newest;
}

/** Every version of one entity the cache still holds, newest first. Each file is immutable, so this is the local history. */
export function listCachedVersions(home, entityType, id) {
  const entityId = safeEntityPart(id, 'entity ID');
  const directory = typeDirectory(home, entityType);
  if (!fs.existsSync(directory)) return [];
  const prefix = `${entityId}_`;
  return fs.readdirSync(directory).flatMap((name) => {
    if (!name.startsWith(prefix) || !name.endsWith('.json')) return [];
    const rawVersion = name.slice(prefix.length, -'.json'.length);
    return /^\d+$/u.test(rawVersion) && Number.isSafeInteger(Number(rawVersion)) ? [Number(rawVersion)] : [];
  }).sort((left, right) => right - left);
}

/** One named version of an entity, for comparing two snapshots. `null` when that version was never cached. */
export function readCachedEntityVersion(home, entityType, id, version) {
  const file = entityVersionFile(home, entityType, id, version);
  return fs.existsSync(file) ? readSnapshotFile(file) : null;
}

/**
 * Versions of one entity the cache keeps. Each version is its own file and
 * nothing replaces one, so a folder worked in for months holds every version of
 * every entity it ever read — and `readCachedEntity` lists the whole type
 * directory on every read, so each cache read slowly gets slower. Ten is well
 * above what `cache diff` needs (two, or the two a person names with
 * `--versions`) and still bounds the directory.
 */
export const KEPT_ENTITY_VERSIONS = 10;

// Removes the versions of one entity past the newest `keep`. A file that will
// not delete is left: the trim is housekeeping, and must never fail the read
// that just cached a snapshot.
function trimEntityVersions(home, entityType, id, keep = KEPT_ENTITY_VERSIONS) {
  const versions = listCachedVersions(home, entityType, id);
  if (versions.length <= keep) return 0;
  let removed = 0;
  for (const version of versions.slice(keep)) {
    try { fs.unlinkSync(entityVersionFile(home, entityType, id, version)); removed++; }
    catch (error) { if (error?.code !== 'ENOENT') break; }
  }
  return removed;
}

export function cacheEntity(home, record, { source = 'read', ref = null } = {}) {
  const entity = normalizeRecord(record, record?.entityType, record?.id);
  if (!Number.isSafeInteger(entity.version) || entity.version < 0) {
    throw new UaError('PLATFORM_UNREACHABLE', 'The platform returned an invalid entity version.');
  }
  const previous = readCachedEntity(home, entity.entityType, entity.id);
  // Each version is immutable and gets its own file. Concurrent reads can
  // therefore finish in any order without an older response becoming the
  // newest local state.
  const snapshot = {
    schemaVersion: 1,
    key: identity(entity.entityType, entity.id),
    entityType: entity.entityType,
    id: entity.id,
    version: entity.version,
    cachedAt: now(),
    source,
    ...(ref ? { ref } : {}),
    entity,
  };
  atomicFile(entityVersionFile(home, entity.entityType, entity.id, entity.version), `${JSON.stringify(snapshot, null, 2)}\n`);
  // Written first, trimmed after: a crash between the two leaves an extra old
  // version, never a missing current one.
  try { trimEntityVersions(home, entity.entityType, entity.id); } catch { /* housekeeping never fails a read */ }
  return { snapshot, ignoredOlderVersion: Number.isFinite(previous?.version) && previous.version > entity.version ? entity.version : null };
}

export function versionedTargets(ref = {}) {
  const id = ref.id ? String(ref.id) : '';
  if (ref.kind === 'object' && id) return [{ entityType: 'ENTITY_TYPE', id, ref }];
  if (ref.kind === 'automation' && id) return [{ entityType: 'WORKFLOW_DEFINITION', id, ref }];
  if (ref.kind === 'ai-agent' && id) return [{ entityType: 'ai_agent', id, ref }];
  if ((ref.kind === 'app' || ref.kind === 'code-app') && id) return [{ entityType: 'e_interface', id, ref }];
  // A page is read through its app, so it needs its app id.
  if (ref.kind === 'page' && id && ref.appId) return [{ entityType: 'e_component', id, ref }];
  return [];
}

const linkedAssetType = 'solution_linked_assets';

/**
 * Every entity linked to a solution: its `solution_linked_assets` rows, and the
 * old `linkedEntities` field of a solution linked before those rows existed
 * (2026-10-02). That field is read here and never written.
 */
export function solutionLinks(solution, assets = []) {
  return [
    ...(Array.isArray(solution?.properties?.linkedEntities) ? solution.properties.linkedEntities : []),
    ...linkedAssetRefs(assets),
  ].filter((ref, index, all) => all.findIndex(item => item?.id === ref?.id && item?.type === ref?.type) === index);
}

export function linkedAssetRefs(assets = []) {
  return assets.flatMap(record => {
    const properties = record?.properties;
    if (!entityPartPattern.test(String(properties?.asset_class ?? '')) ||
        !entityPartPattern.test(String(properties?.asset_id ?? ''))) return [];
    return [{ id: properties.asset_id, type: properties.asset_class, state: properties.state }];
  });
}

async function upsertLinkedAsset(ctx, linked, known = null) {
  const solutionId = ctx.state.solutionId;
  const matches = record => record.properties?.asset_id === linked.id && record.properties?.asset_class === linked.type;
  const find = async () => (await ctx.service.search(linkedAssetType, 'solution_id', solutionId)).find(matches);
  let record = known ? known.find(matches) : await find();
  if (!record) {
    try {
      record = await ctx.service.create(linkedAssetType, {
        asset_class: linked.type, asset_id: linked.id, solution_id: solutionId, state: linked.state,
      });
    } catch (error) {
      // A create may have committed before its response was lost, or another
      // session linked the same entity first, which the tenant's unique index
      // on solution, asset and class refuses. Re-read once before failing.
      try { record = await find(); } catch { /* Report the original write failure. */ }
      if (!record) throw error;
    }
  } else if (record.properties.state !== linked.state) {
    record = await ctx.service.readMergeWrite(linkedAssetType, record.id, () => ({ state: linked.state }));
  }
  cacheRecords(ctx.home, { assets: [record] });
  return record;
}

// Links every ref to the solution with its `solution_linked_assets` row: one
// read of the rows, then a row made for each missing one. Linking 600 existing
// objects is then one command, not 600 searches. The solution record itself is
// not written: its `linkedEntities` field is discontinued.
export async function linkEntityRefs(ctx, refs) {
  const linked = [...new Map(refs.map(toLinkedEntity).filter(Boolean).map(item => [`${item.type}:${item.id}`, item])).values()];
  if (!linked.length) return [];
  const known = linked.length > 1 ? await ctx.service.search(linkedAssetType, 'solution_id', ctx.state.solutionId) : null;
  for (const item of linked) await upsertLinkedAsset(ctx, item, known);
  return linked;
}

/** Reads every ref (a few at a time), caches each, and links the ones read in one pass. A ref that cannot be read is named, not linked. */
export async function checkpointEntityRefs(ctx, refs, { source = 'read', link = true, atOnce = 6 } = {}) {
  const results = new Array(refs.length);
  let next = 0;
  const worker = async () => {
    while (next < refs.length) {
      const index = next++;
      try { results[index] = { ref: refs[index], ...(await checkpointEntityRef(ctx, refs[index], { source, link: false })) }; }
      catch (error) { results[index] = { ref: refs[index], error }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(atOnce, refs.length) }, worker));
  const read = results.filter(result => !result.error);
  const linked = link ? await linkEntityRefs(ctx, read.map(result => result.ref)) : [];
  return { snapshots: read.flatMap(result => result.snapshots), linked, failed: results.filter(result => result.error) };
}

// The snapshot of an app, or of one page of it, that the app's read just left.
function appMemberSnapshot({ ctx, appId, target }) {
  const isApp = target.entityType === 'e_interface';
  const member = readInterfaceManifest(ctx.home, appId)?.members
    .find(item => item.id === target.id && item.entityType.includes(isApp ? 'interface' : 'component'));
  const snapshot = member ? readCachedEntity(ctx.home, member.entityType, member.id) : null;
  if (!snapshot) throw new UaError('NOT_FOUND', `${isApp ? 'App' : 'Page'} ${target.id} is not in app ${appId}.`, { host: ctx.state?.tenant, id: target.id });
  return snapshot;
}

export async function checkpointEntityRef(ctx, ref, { source = 'read', link = true } = {}) {
  const targets = versionedTargets(ref);
  if (!targets.length) throw new UaError('USAGE', 'This entity needs a platform ID before it can be cached.');
  // An app, or a page of it, is read with its app: the tree, then the version
  // deltas. A page or app write can add pages and data sources the manifest does
  // not list yet, so membership is current and the page and app markers clear
  // here, at report time, the way an object's or automation's do. An app the
  // tenant would not give throws, and its copy stays marked stale.
  const appId = ref.kind === 'app' || ref.kind === 'code-app' ? ref.id : ref.kind === 'page' ? ref.appId : null;
  if (appId) {
    const refreshed = await refreshInterface({
      home: ctx.home, service: ctx.service, interfaceId: String(appId),
      cacheEntity: entity => cacheEntity(ctx.home, entity, { source: 'solution-refresh' }),
      readEntity: (type, id) => readCachedEntity(ctx.home, type, id),
    });
    const snapshots = targets.map(target => appMemberSnapshot({ ctx, appId: String(appId), target }));
    const linked = link ? (await linkEntityRefs(ctx, [ref]))[0] ?? null : null;
    return { snapshots, linked, interfaces: { refreshed, stale: [] } };
  }
  const snapshots = await Promise.all(targets.map(async target => {
    const dirtyAtStart = dirtyEntityFiles(ctx.home, target.entityType, target.id);
    const record = await ctx.service.getVersioned(target.entityType, target.id);
    const { snapshot } = cacheEntity(ctx.home, record, { source, ref: target.ref });
    clearDirtyEntityFiles(ctx.home, target.entityType, dirtyAtStart);
    return snapshot;
  }));
  const linked = link ? (await linkEntityRefs(ctx, [ref]))[0] ?? null : null;
  return { snapshots, linked };
}

/**
 * How long a cached copy of an entity the solution does not link is still read
 * by a refresh. It covers an entity whose `solution_linked_assets` row is not
 * there yet: the bridge writes it when the tenant answers the create, and a
 * failed one waits for the reporting step. After that the link itself is what
 * keeps it current.
 */
export const UNLINKED_REFRESH_MS = 6 * 60 * 60 * 1000;

/**
 * Ids one `get_definitions` call names. The tool's own schema refuses a longer
 * list, so a kind with more
 * entities than this is read a page at a time rather than refused whole.
 */
export const MAX_DEFINITION_IDS = 200;

const recentlyCached = (snapshot, at) => {
  const cachedAt = Date.parse(snapshot?.cachedAt ?? '');
  return Number.isFinite(cachedAt) && Date.parse(at) - cachedAt < UNLINKED_REFRESH_MS;
};

export async function refreshLinkedEntities(home, service, solution, assets = []) {
  const refs = solutionLinks(solution, assets);
  const interfaceIds = refs.filter(ref => ref?.type === 'e_interface' && ref.id).map(ref => ref.id);
  const interfaces = await refreshInterfaceCache(home, service, interfaceIds, {
    cacheEntity: entity => cacheEntity(home, entity, { source: 'solution-refresh' }),
    readEntity: (type, id) => readCachedEntity(home, type, id),
  });
  // A copy whose entity is no longer linked to the solution is not read again:
  // a refresh would otherwise re-read everything the folder ever cached, for as
  // long as the folder lives, and its cost would only ever grow. Two kinds of
  // copy are still read, because neither is leftover: one a builder cached this
  // session before its link row existed (`recentlyCached`), and one a write
  // left marked stale, which has to be re-read to become current again.
  const cached = listCachedEntities(home)
    .filter(snapshot => !interfaces.managedKeys.has(snapshot.key))
    .filter(snapshot => recentlyCached(snapshot, now()) || dirtyEntityFiles(home, snapshot.entityType, snapshot.id).length)
    .map(snapshot => ({ id: snapshot.id, type: snapshot.entityType, ref: snapshot.ref }));
  const seen = new Set();
  // The id goes into a read that names many at once, where one the tenant
  // refuses would cost the whole batch, so it is sent trimmed. Dropping it
  // instead would leave its copy unread, and the cache, which trims too, would
  // keep serving that copy as current.
  const candidates = [...refs, ...cached].map(item => (typeof item?.id === 'string' ? { ...item, id: item.id.trim() } : item)).filter(item => {
    if (!READ_BY_ID.has(item?.type) || !item.id) return false;
    if (typeof item.id !== 'string' || !entityPartPattern.test(item.id)) return false;
    const key = identity(item.type, item.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // A tenant whose llm-tools predates `get_definitions` reads one entity at a
  // time, as every tenant did before it. That fallback is decided per page by
  // the tenant's own answer, inside `refreshDefinitions`.
  const definitions = service.getDefinitions
    ? await refreshDefinitions(home, service, candidates)
    : await refreshDefinitionsOneByOne(home, service, candidates);
  return {
    refreshed: interfaces.refreshed + definitions.refreshed,
    stale: [...interfaces.stale, ...definitions.stale],
  };
}

/**
 * Every candidate of one kind in one `get_definitions` call: the versions held
 * go out, and only what moved comes back. An id with no copy is left out of
 * `knownVersions`, so the tenant sends it whatever its version — including an
 * entity still at version 0, which a version of 0 in the list would have hidden.
 *
 * The markers of every id asked about are cleared, not only those that answered
 * with a record: an entity the tenant reports unchanged is current on disk, and
 * leaving its marker would strand that copy as `stale` for the rest of the
 * folder's life. The markers are read before the call and only those exact files
 * are cleared, so a write that lands mid-call keeps its own marker.
 */
async function refreshDefinitions(home, service, candidates) {
  const byType = new Map();
  for (const item of candidates) {
    const list = byType.get(item.type) ?? [];
    list.push(item);
    byType.set(item.type, list);
  }
  // A kind with more entities than the tool takes is read a page at a time. The
  // tool refuses a longer list outright, so a solution past the cap would
  // otherwise refresh nothing of that kind at all.
  const pages = [...byType].flatMap(([type, items]) => {
    const parts = [];
    for (let start = 0; start < items.length; start += MAX_DEFINITION_IDS) {
      parts.push([type, items.slice(start, start + MAX_DEFINITION_IDS)]);
    }
    return parts;
  });
  let refreshed = 0;
  const stale = [];
  await Promise.all(pages.map(async ([type, items]) => {
    const refOf = new Map(items.map(item => [item.id, item.ref ?? item]));
    const dirtyAtStart = new Map(items.map(item => [item.id, dirtyEntityFiles(home, type, item.id)]));
    const newest = newestCachedVersions(home, type);
    const knownVersions = items.flatMap(item => (newest.has(item.id) ? [{ id: item.id, version: newest.get(item.id) }] : []));
    let answer;
    try { answer = await service.getDefinitions({ type, ids: items.map(item => item.id), knownVersions }); }
    catch (error) {
      // A sign-in that ran out ends the whole refresh, as it did when each
      // entity was read on its own: no copy is marked for a tenant that would
      // answer nothing, and the person is asked to sign in again.
      if (error?.code === 'AUTH_EXPIRED') throw error;
      // Everything else — a tenant without the tool, a reply too large for one
      // call, a batch that ran out of time, a refused argument — says nothing
      // about the entities themselves. This page is read one entity at a time
      // instead, which is the read every tenant served before the tool existed.
      // Per page, so a kind the tenant cannot answer never skips the others,
      // and no copy is marked for a call that told us nothing.
      const perEntity = await refreshDefinitionsOneByOne(home, service, items);
      refreshed += perEntity.refreshed;
      stale.push(...perEntity.stale);
      dirtyAtStart.clear();
      return;
    }
    for (const record of answer.definitions) {
      try { cacheEntity(home, record, { source: 'solution-refresh', ref: refOf.get(record.id) ?? { id: record.id, type } }); refreshed++; }
      catch (error) {
        // Nothing reached disk for this one, so its marker is kept: clearing it
        // would serve the copy a write already changed as current.
        dirtyAtStart.delete(record.id);
        stale.push({ id: record.id, type, reason: error?.message ?? 'could not be cached' });
      }
    }
    // `gone` is not proof of a delete: the tenant answers it both for an id that
    // no longer exists and for one this sign-in cannot see. So the copy stays on
    // disk and is marked, the same as a failed read, and nothing is pruned here.
    for (const id of [...answer.gone, ...answer.failed.map(item => item?.id).filter(Boolean)]) {
      if (!dirtyAtStart.has(id)) continue;
      dirtyAtStart.delete(id);
      try { markCachedEntityDirty(home, type, id); } catch { /* an unsafe id has no snapshot to mark */ }
      const failure = answer.failed.find(item => item?.id === id);
      stale.push({ id, type, reason: failure?.message ?? 'the tenant would not read it' });
    }
    // Housekeeping: a marker that will not delete must not fail a refresh whose
    // entities already reached disk. The copy reads stale until the next pass.
    for (const [, names] of dirtyAtStart) {
      try { clearDirtyEntityFiles(home, type, names); } catch { /* the next refresh clears it */ }
    }
  }));
  return { refreshed, stale };
}

/** The read every tenant served before `get_definitions`: one call per entity. */
async function refreshDefinitionsOneByOne(home, service, candidates) {
  const results = await Promise.allSettled(candidates.map(async linked => {
    const dirtyAtStart = dirtyEntityFiles(home, linked.type, linked.id);
    const record = await service.getVersioned(linked.type, linked.id);
    const { snapshot } = cacheEntity(home, record, { source: 'solution-refresh', ref: linked.ref ?? linked });
    clearDirtyEntityFiles(home, linked.type, dirtyAtStart);
    return snapshot;
  }));
  // A read the tenant refused leaves its copy on disk but marks it stale, so the
  // last successful state is never served as current; the next read that
  // succeeds clears the marker.
  results.forEach((result, index) => {
    if (result.status !== 'rejected') return;
    try { markCachedEntityDirty(home, candidates[index].type, candidates[index].id); } catch { /* an unsafe id has no snapshot to mark */ }
  });
  return {
    refreshed: results.filter(result => result.status === 'fulfilled').length,
    stale: results.flatMap((result, index) => result.status === 'rejected' ? [{ ...candidates[index], reason: result.reason?.message ?? 'read failed' }] : []),
  };
}

export function readCachedPageContext(home, interfaceId, pageId) {
  return readInterfacePageContext(home, interfaceId, pageId, (type, id) => readCachedEntity(home, type, id));
}

export function readCachedPageBody(home, interfaceId, pageId) {
  return readInterfacePageBody(home, interfaceId, pageId, (type, id) => readCachedEntity(home, type, id));
}

export function readCachedAppContext(home, interfaceId) {
  return readCachedInterfaceContext(home, interfaceId, (type, id) => readCachedEntity(home, type, id));
}

/** One object or automation from its newest snapshot: `hit`, `miss`, or `stale` after a write this session sent. */
export function readCachedEntityContext(home, entityType, id) {
  const snapshot = readCachedEntity(home, entityType, id);
  if (!snapshot) return { status: 'miss', reason: 'entity-not-cached', entityType, id };
  if (dirtyEntityFiles(home, entityType, id).length) return { status: 'stale', reason: 'entity-write', entityType, id };
  return { status: 'hit', source: 'entity-cache', entityType, id, version: snapshot.version, cachedAt: snapshot.cachedAt, entity: snapshot.entity };
}

const nameOf = entity => entity?.name ?? entity?.properties?.name ?? null;
const fieldNames = object => Object.keys(object?.schema?.schema?.properties ?? object?.input?.schema?.properties ?? {});

/**
 * The id of one cached entity of a type, named by its id or by its name in any
 * letter case, or null when the cache holds neither. A task that creates an
 * entity has only its name, and must still be able to ask the cache first: the
 * answer is then a miss, never a usage error. `among` limits the search to the
 * ids of one app's pages. A name that fits several entities is a usage error
 * that names their ids.
 */
export function cachedIdFor(home, entityType, token, { among = null } = {}) {
  const text = String(token ?? '').trim();
  const allowed = id => !among || among.has(id);
  if (entityPartPattern.test(text) && allowed(text) && readCachedEntity(home, entityType, text)) return text;
  const wanted = text.toLowerCase();
  const found = wanted ? listCachedEntities(home).filter(snapshot => snapshot.entityType === entityType && allowed(snapshot.id)
    && [nameOf(snapshot.entity), snapshot.entity?.properties?.slug].some(value => String(value ?? '').trim().toLowerCase() === wanted)) : [];
  if (found.length > 1) throw new UaError('USAGE', `More than one cached ${entityType} is named ${text}: ${found.map(snapshot => snapshot.id).join(', ')}. Use its id.`);
  return found[0]?.id ?? null;
}

/** Everything the cache holds about the solution, as names and ids: the answer to "what is in this solution" without a tenant call. */
export function readCachedSolutionContext(home) {
  const solution = readRecord(home, 'solution');
  if (!solution) return { status: 'miss', reason: 'solution-not-cached' };
  const refs = solutionLinks(solution, readRecords(home, 'asset'));
  const stale = [];
  const apps = refs.filter(ref => ref?.type === 'e_interface' && ref.id).map(ref => {
    const context = readCachedAppContext(home, ref.id);
    if (context.status !== 'hit') return { id: ref.id, status: context.status, reason: context.reason };
    stale.push(...context.stalePages.map(pageId => `e_component:${pageId}`));
    return {
      id: ref.id,
      status: 'hit',
      name: nameOf(context.interface),
      version: context.interface.version ?? null,
      validatedAt: context.validatedAt,
      pages: context.pages.map(page => page.status === 'hit'
        ? { id: page.pageId, status: 'hit', name: nameOf(page.page), dataSources: page.dataSources.map(source => ({ id: source.id, name: nameOf(source) })) }
        : { id: page.pageId, status: page.status }),
    };
  });
  const others = refs.filter(ref => ref?.type && ref.type !== 'e_interface' && ref.id).map(ref => {
    const context = readCachedEntityContext(home, ref.type, ref.id);
    if (context.status !== 'hit') {
      if (context.status === 'stale') stale.push(identity(ref.type, ref.id));
      return { id: ref.id, type: ref.type, status: context.status, reason: context.reason };
    }
    const entity = context.entity;
    return {
      id: ref.id, type: ref.type, status: 'hit', name: nameOf(entity), version: context.version, cachedAt: context.cachedAt,
      ...(ref.type === 'ENTITY_TYPE' ? { fields: fieldNames(entity) } : {}),
      ...(ref.type === 'WORKFLOW_DEFINITION' ? { description: entity.description ?? null, deployed: entity.deploymentState?.status ?? null, nodes: Array.isArray(entity.nodes) ? entity.nodes.length : null } : {}),
      // An agent's models sit under per-stage settings, not one `model` field,
      // and its tools, skills, tasks and knowledge are separate entities. The
      // summary stays at the name and version; `cache agent` reads the record.
      ...(ref.type === 'ai_agent' ? { role: entity.properties?.role ?? null } : {}),
    };
  });
  return {
    status: 'hit',
    source: 'entity-cache',
    solution: { id: solution.id, name: solution.properties?.name ?? null },
    apps,
    objects: others.filter(item => item.type === 'ENTITY_TYPE'),
    automations: others.filter(item => item.type === 'WORKFLOW_DEFINITION'),
    agents: others.filter(item => item.type === 'ai_agent'),
    other: others.filter(item => !['ENTITY_TYPE', 'WORKFLOW_DEFINITION', 'ai_agent'].includes(item.type)),
    stale,
    cachedEntities: listCachedEntities(home).length,
  };
}

export function listCachedEntities(home) {
  const root = assertLocalPath(path.join(assertHome(home), 'entities'), assertHome(home));
  if (!fs.existsSync(root)) return [];
  const latest = new Map();
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    if (!item.isDirectory() || !entityPartPattern.test(item.name)) continue;
    const directory = path.join(root, item.name);
    for (const name of fs.readdirSync(directory)) {
      if (!name.endsWith('.json')) continue;
      const snapshot = readSnapshotFile(path.join(directory, name));
      if (snapshot?.schemaVersion !== 1 || snapshot.entityType !== item.name || !entityPartPattern.test(String(snapshot.id ?? '')) ||
        !Number.isSafeInteger(snapshot.version) || snapshot.version < 0 || name !== `${snapshot.id}_${snapshot.version}.json` ||
        snapshot.key !== `${snapshot.entityType}:${snapshot.id}`) continue;
      const previous = latest.get(snapshot.key);
      if (!previous || previous.version < snapshot.version) latest.set(snapshot.key, snapshot);
    }
  }
  return [...latest.values()].sort((a, b) => a.key.localeCompare(b.key));
}
