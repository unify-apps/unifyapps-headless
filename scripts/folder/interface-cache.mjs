/** Current interface membership over immutable versioned entity snapshots. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicFile, assertHome, assertLocalPath, readJsonFile } from '../lib/session-paths.mjs';

const MANIFEST_SCHEMA_VERSION = 1;
const safePartPattern = /^[A-Za-z0-9_-]+$/u;
const keyOf = (entityType, id) => `${entityType}:${id}`;
function safePart(value, label) {
  const part = String(value ?? '').trim();
  if (!safePartPattern.test(part)) throw new Error(`A safe ${label} is required.`);
  return part;
}
function manifestFile(home, interfaceId) {
  const root = assertHome(home);
  return assertLocalPath(path.join(root, 'entity-manifests', 'interfaces', `${safePart(interfaceId, 'interface ID')}.json`), root);
}
function dirtyDirectory(home, interfaceId) {
  const root = assertHome(home);
  return assertLocalPath(path.join(root, 'entity-manifests', 'interface-dirty', safePart(interfaceId, 'interface ID')), root);
}
function dirtyFiles(home, interfaceId, pageId) {
  const directory = dirtyDirectory(home, interfaceId);
  if (!fs.existsSync(directory)) return [];
  const prefix = pageId ? `${safePart(pageId, 'page ID')}.` : '';
  return fs.readdirSync(directory).filter(name => name.startsWith(prefix) && name.endsWith('.json'));
}
function clearDirtyFiles(home, interfaceId, names) {
  const directory = dirtyDirectory(home, interfaceId);
  for (const name of names ?? []) {
    try { fs.unlinkSync(assertLocalPath(path.join(directory, name), directory)); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
}

export function readInterfaceManifest(home, interfaceId) {
  const manifest = readJsonFile(manifestFile(home, interfaceId), null);
  if (manifest?.schemaVersion !== MANIFEST_SCHEMA_VERSION || manifest.interfaceId !== interfaceId || !Array.isArray(manifest.members)) return null;
  return manifest;
}

function flattenTree(tree) {
  const members = [], seen = new Set();
  const visit = (node, parentKey = null) => {
    if (!node?.entityId || !node.entityType) return;
    const key = keyOf(node.entityType, node.entityId);
    if (!seen.has(key)) {
      seen.add(key);
      members.push({ key, entityType: node.entityType, id: node.entityId, parentKey });
    }
    for (const child of node.dependentEntities ?? []) visit(child, key);
  };
  visit(tree);
  return members;
}

function writeManifest(home, interfaceId, tree) {
  const previous = readInterfaceManifest(home, interfaceId);
  const members = flattenTree(tree);
  const currentKeys = new Set(members.map(member => member.key));
  const retiredKeys = [...new Set([
    ...(previous?.retiredKeys ?? []),
    ...(previous?.members?.map(member => member.key) ?? []),
  ])].filter(key => !currentKeys.has(key));
  const manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    interfaceId,
    validatedAt: new Date().toISOString(),
    retiredKeys,
    members,
  };
  atomicFile(manifestFile(home, interfaceId), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

// `get_app_entities` takes at most this many versions; an app whose copy holds
// more is read whole instead.
const MAX_KNOWN_VERSIONS = 5000;
// Apps read side by side.
const APPS_AT_ONCE = 4;

// The version of every member of the app the cache holds a copy of. The tenant
// answers only the entities newer than these, and every member of the app's
// current tree they leave out, so a member with no copy yet comes back whole.
function knownVersionsOf({ manifest, readEntity }) {
  return manifest.members.flatMap(member => {
    const version = readEntity(member.entityType, member.id)?.version;
    return Number.isFinite(version) ? [{ entityType: member.entityType, id: member.id, version }] : [];
  });
}

function cacheEntities(entities, cacheEntity) {
  let cached = 0;
  for (const entity of entities ?? []) {
    if (!entity?.id || !entity.entityType || !Number.isFinite(entity.version)) continue;
    cacheEntity(entity);
    cached++;
  }
  return cached;
}

/**
 * Re-reads one app: whole when the cache holds no manifest for it, otherwise
 * only what changed since its copies. Then rewrites the manifest from the app's
 * current tree, clears the edit markers that predate the read, and answers how
 * many entities it cached. An app that cannot be read keeps its copy marked
 * stale, and the read's own error is thrown.
 */
export async function refreshInterface({ home, service, interfaceId, cacheEntity, readEntity }) {
  const dirtyAtStart = dirtyFiles(home, interfaceId);
  try {
    const manifest = readInterfaceManifest(home, interfaceId);
    const knownVersions = manifest ? knownVersionsOf({ manifest, readEntity }) : null;
    const { tree, entities } = await service.getAppEntities({
      appId: interfaceId,
      ...(knownVersions && knownVersions.length <= MAX_KNOWN_VERSIONS ? { knownVersions } : {}),
    });
    const refreshed = cacheEntities(entities, cacheEntity);
    writeManifest(home, interfaceId, tree);
    clearDirtyFiles(home, interfaceId, dirtyAtStart);
    return refreshed;
  } catch (error) {
    // A copy the tenant would not re-validate must not read as current: it keeps
    // its last successful state on disk, but every reader answers `stale` until a
    // later refresh succeeds and clears this marker with the rest.
    try { markCachedInterfaceDirty(home, interfaceId); } catch { /* an unsafe id has no manifest to mark */ }
    throw error;
  }
}

/** Re-reads every app as `refreshInterface` does, a few at a time. An app that cannot be read is listed in `stale`. */
export async function refreshInterfaceCache(home, service, interfaceIds, { cacheEntity, readEntity }) {
  const uniqueIds = [...new Set(interfaceIds)];
  const outcomes = [];
  for (let start = 0; start < uniqueIds.length; start += APPS_AT_ONCE) {
    outcomes.push(...await Promise.all(uniqueIds.slice(start, start + APPS_AT_ONCE).map(async id => {
      try { return { refreshed: await refreshInterface({ home, service, interfaceId: id, cacheEntity, readEntity }) }; }
      catch (error) { return { stale: { id, type: 'e_interface', reason: error?.message ?? 'read failed' } }; }
    })));
  }
  const refreshed = outcomes.reduce((sum, outcome) => sum + (outcome.refreshed ?? 0), 0);
  const stale = outcomes.flatMap(outcome => (outcome.stale ? [outcome.stale] : []));

  const managedKeys = new Set(uniqueIds.flatMap(id => {
    const manifest = readInterfaceManifest(home, id);
    return [...(manifest?.members?.map(member => member.key) ?? []), ...(manifest?.retiredKeys ?? [])];
  }));
  return { refreshed, stale, managedKeys };
}

export function markCachedPageDirty(home, interfaceId, pageId) {
  const manifest = readInterfaceManifest(home, interfaceId);
  const page = manifest?.members.find(member => member.id === pageId && member.entityType.includes('component'));
  if (!manifest || !page) return false;
  const marker = path.join(dirtyDirectory(home, interfaceId), `${safePart(pageId, 'page ID')}.${randomUUID()}.json`);
  atomicFile(marker, `${JSON.stringify({ pageId, dirtyAt: new Date().toISOString() })}\n`);
  return true;
}

// An app-level write (navigation, settings, page paths, event actions, data
// sources, publish) names its pages in shapes the bridge does not parse, so it
// marks the whole app: a marker whose page part is the interface id, which no
// page id is. Every page of the app and the app itself read stale until the next
// interface refresh, which clears every marker of the app it validated.
export function markCachedInterfaceDirty(home, interfaceId) {
  if (!readInterfaceManifest(home, interfaceId)) return false;
  const marker = path.join(dirtyDirectory(home, interfaceId), `${safePart(interfaceId, 'interface ID')}.${randomUUID()}.json`);
  atomicFile(marker, `${JSON.stringify({ interfaceId, dirtyAt: new Date().toISOString() })}\n`);
  return true;
}
const interfaceDirty = (home, interfaceId) => dirtyFiles(home, interfaceId, interfaceId).length > 0;

/** The whole app from the manifest: the interface and every page with its data sources. A page an edit touched since the last refresh is listed `stale` with no body. */
export function readCachedInterfaceContext(home, interfaceId, readEntity) {
  const manifest = readInterfaceManifest(home, interfaceId);
  if (!manifest) return { status: 'miss', reason: 'interface-not-cached', interfaceId };
  if (interfaceDirty(home, interfaceId)) return { status: 'stale', reason: 'interface-edit', interfaceId };
  const interfaceMember = manifest.members.find(member => member.id === interfaceId && member.entityType.includes('interface'));
  const interfaceEntity = interfaceMember ? readEntity(interfaceMember.entityType, interfaceMember.id)?.entity ?? null : null;
  if (!interfaceEntity) return { status: 'miss', reason: 'incomplete', interfaceId };
  const pages = manifest.members
    .filter(member => member.entityType.includes('component'))
    .map(member => {
      const context = readCachedPageContext(home, interfaceId, member.id, readEntity);
      return context.status === 'hit'
        ? { pageId: member.id, status: 'hit', page: context.page, dataSources: context.dataSources }
        : { pageId: member.id, status: context.status, reason: context.reason };
    });
  return {
    status: 'hit',
    source: 'interface-cache',
    validatedAt: manifest.validatedAt,
    interface: interfaceEntity,
    pages,
    stalePages: pages.filter(page => page.status !== 'hit').map(page => page.pageId),
  };
}

// The page's body: the page itself, its data sources, and the owning app's own
// record (under `appInterface`, never `interface` — that name is for the app's
// OWN context, and a page context carries both its own record and the app's,
// so each needs a scope no reader can mistake). The page comes first, so a
// search for one key (`properties.customCode` sits on both the page and the
// app) finds the page's own before the app-wide one. Null when the page member
// is missing or its data is incomplete: a genuine miss, never a dirty marker.
function pageBody(manifest, interfaceId, pageId, readEntity) {
  const pageMember = manifest.members.find(member => member.id === pageId && member.entityType.includes('component'));
  if (!pageMember) return null;
  const sourcesUnder = member => manifest.members.filter(item => item.parentKey === member.key && item.entityType.includes('data_source'));
  const dataSourceMembers = sourcesUnder(pageMember);
  // App-level data sources hang off the app's global page, and every page can
  // bind to them. They travel with each page hit as `appDataSources`, so a
  // reader that trusts the hit sees the same sources the page tools show.
  const globalMember = manifest.members.find(member => member.id === `e_global_${interfaceId}` && member.entityType.includes('component'));
  const appSourceMembers = globalMember && globalMember.key !== pageMember.key ? sourcesUnder(globalMember) : [];
  const page = readEntity(pageMember.entityType, pageMember.id)?.entity;
  const dataSources = dataSourceMembers.map(member => readEntity(member.entityType, member.id)?.entity).filter(Boolean);
  const appDataSources = appSourceMembers.map(member => readEntity(member.entityType, member.id)?.entity).filter(Boolean);
  if (!page || dataSources.length !== dataSourceMembers.length || appDataSources.length !== appSourceMembers.length) return null;
  const interfaceMember = manifest.members.find(member => member.id === interfaceId && member.entityType.includes('interface'));
  return {
    source: 'interface-cache',
    validatedAt: manifest.validatedAt,
    page,
    dataSources,
    appDataSources,
    appInterface: interfaceMember ? readEntity(interfaceMember.entityType, interfaceMember.id)?.entity ?? null : null,
  };
}

export function readCachedPageContext(home, interfaceId, pageId, readEntity) {
  const manifest = readInterfaceManifest(home, interfaceId);
  if (!manifest) return { status: 'miss', reason: 'interface-not-cached', interfaceId, pageId };
  const pageMember = manifest.members.find(member => member.id === pageId && member.entityType.includes('component'));
  if (!pageMember) return { status: 'miss', reason: 'page-not-cached', interfaceId, pageId };
  if (dirtyFiles(home, interfaceId, pageId).length) return { status: 'stale', reason: 'page-edit', interfaceId, pageId };
  if (interfaceDirty(home, interfaceId)) return { status: 'stale', reason: 'interface-edit', interfaceId, pageId };
  const body = pageBody(manifest, interfaceId, pageId, readEntity);
  if (!body) return { status: 'miss', reason: 'incomplete', interfaceId, pageId };
  return { status: 'hit', ...body };
}

/**
 * The page's body even when a dirty marker makes it `stale`, for a caller that
 * will flag the staleness itself rather than refuse the read outright (`cache
 * page`/`outline`/etc with `--refresh` unused or declined). Null when the body
 * itself is not on disk — a genuine miss, which still refuses as before.
 */
export function readCachedPageBody(home, interfaceId, pageId, readEntity) {
  const manifest = readInterfaceManifest(home, interfaceId);
  if (!manifest) return null;
  return pageBody(manifest, interfaceId, pageId, readEntity);
}
