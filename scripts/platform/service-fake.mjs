// Persistent fake platform, used only with UA_FAKE=1 or explicit injection.
// It runs the shared file store and adds the failure knobs tests need:
//   UA_FAKE_AUTH=dead            every call answers 401
//   UA_FAKE_FAIL=<n>             the first n calls fail on the network
//   UA_FAKE_MISSING_TYPES=a,b    the entity-type endpoint reports these lifecycle types missing
//   UA_FAKE_CREATE_FAIL=a,b      creating these types answers HTTP 500
//   UA_FAKE_LOG=<file>           each call is appended to this file, one line each
//   UA_FAKE_RECORD_CUT=1         a created nebula_session keeps only half its remarks and drops transcriptStats.parts
// `apps` in the store file seeds the apps it serves, as `{ [appId]: { tree, entities } }`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UaError, normalizeTenant, LIFECYCLE_TYPES } from '../lib/contracts.mjs';
import { fileEntityApi } from './entity-store.mjs';

const list = (value) => String(value ?? '').split(',').map(item => item.trim()).filter(Boolean);
export function fakeEntityApi(host, options = {}) {
  const home = options.home ?? process.env.UA_HOME ?? path.join(os.homedir(), '.unifyapps-solutions');
  const file = path.join(home, 'session', 'fake', `${normalizeTenant(host)}.json`);
  let remaining = options.failures ?? Number(process.env.UA_FAKE_FAIL ?? 0);
  const userId = options.userId ?? Number(process.env.UA_FAKE_USER_ID ?? 1);
  const missing = new Set(options.missingTypes ?? list(process.env.UA_FAKE_MISSING_TYPES));
  const createFail = new Set(options.createFail ?? list(process.env.UA_FAKE_CREATE_FAIL));
  const store = fileEntityApi(file, { userId, knownTypes: LIFECYCLE_TYPES.filter(type => !missing.has(type)) });
  return async (pathname, body, method = body === undefined ? 'GET' : 'POST') => {
    if (process.env.UA_FAKE_LOG) fs.appendFileSync(process.env.UA_FAKE_LOG, `${method} ${pathname} ${JSON.stringify(body ?? null)}\n`);
    if (process.env.UA_FAKE_AUTH === 'dead') return { status: 401, ok: false, body: { message: 'Signed out' } };
    if (remaining > 0) { remaining--; throw new TypeError('Fake network failure'); }
    if (method === 'POST' && pathname === '/api/entity' && createFail.has(body?.entityType)) {
      return { status: 500, ok: false, body: { message: 'Internal error' } };
    }
    // The tenant no longer declares `linkedEntities` on a solution and refuses a write that carries it.
    if (method === 'POST' && (pathname === '/api/entity' || pathname === '/api/entity/update') &&
        body?.entityType === 'e_solution' && body.properties && 'linkedEntities' in body.properties) {
      return { status: 500, ok: false, body: { message: 'Non Empty Validations in Validating entity e_solution with validationResult add additionalProperties linkedEntities' } };
    }
    if (process.env.UA_FAKE_RECORD_CUT === '1' && method === 'POST' && (pathname === '/api/entity' || pathname === '/api/entity/update') && body?.entityType === 'nebula_session') {
      const { parts: _dropped, ...stats } = body.properties?.transcriptStats ?? {};
      return store(pathname, { ...body, properties: { ...body.properties, remarks: String(body.properties?.remarks ?? '').slice(0, 10), transcriptStats: stats } }, method);
    }
    return seededAppRead({ file, pathname, body }) ?? store(pathname, body, method);
  };
}

// The two app reads, over the apps seeded in the store file: the dependents read
// answers each app's tree (an unknown app an empty one, as the platform does),
// and `bulk-fetch` each entity of a seeded app newer than the version asked for.
function seededAppRead({ file, pathname, body }) {
  if (pathname !== '/api/entity/entity-dependents-with-assets' && pathname !== '/api/entity/bulk-fetch') return null;
  let apps;
  try { apps = JSON.parse(fs.readFileSync(file, 'utf8')).apps ?? {}; } catch { apps = {}; }
  if (pathname === '/api/entity/entity-dependents-with-assets') {
    return { status: 200, ok: true, body: {
      dependencyTrees: Object.fromEntries(body.entityIds.map((id) => [id, apps[id]?.tree ?? {}])),
      entities: body.includeAllEntities ? body.entityIds.flatMap((id) => apps[id]?.entities ?? []) : [],
    } };
  }
  const everything = Object.values(apps).flatMap((app) => app.entities ?? []);
  const newer = {};
  for (const { entityType, entityIdVersions } of body.entities) {
    for (const { entityId, currentVersion } of entityIdVersions) {
      const entity = everything.find((item) => item.entityType === entityType && item.id === entityId);
      if (entity && entity.version > currentVersion) (newer[entityType] ??= {})[entityId] = entity;
    }
  }
  // Like the platform, nothing newer is `{}`, with no map at all.
  return { status: 200, ok: true, body: Object.keys(newer).length ? { entityTypeVsEntities: newer } : {} };
}

/**
 * The reads a real tenant answers through `get_definition`, `get_definitions` and `get_app_entities`, made on a fake
 * platform's own paths, since it has no MCP tools: `serviceFor` adds them under `UA_FAKE=1`, and
 * the tests that stand in for a tenant use them too. A real tenant's service never has these.
 */
export function fakeEntityReads({ host, api, retry = (operation) => operation() }) {
  const read = (pathname, body) => retry(async () => {
    let response;
    try { response = await api(pathname, body, body === undefined ? 'GET' : 'POST'); }
    catch (cause) {
      if (cause instanceof UaError) throw cause;
      throw new UaError('PLATFORM_UNREACHABLE', undefined, { host });
    }
    const status = response?.status ?? 200;
    const payload = response?.body;
    if (!(response?.ok ?? (status >= 200 && status < 300))) {
      // The platform answers a missing entity type with HTTP 500 "... not found".
      const missing = status === 404 || (status >= 500 && /\bnot found\b/iu.test(String(payload?.message ?? '')));
      const code = status === 401 || status === 403 ? 'AUTH_EXPIRED' : missing ? 'NOT_FOUND' : 'PLATFORM_UNREACHABLE';
      throw new UaError(code, undefined, { host, status });
    }
    if (!payload || typeof payload !== 'object') {
      // The entity-type path answers a type the tenant lacks with HTTP 200 and an empty body.
      throw new UaError(pathname.startsWith('/api/entity-type?') ? 'NOT_FOUND' : 'PLATFORM_UNREACHABLE', undefined, { host, status });
    }
    return payload.entity ?? payload;
  });
  const part = (value) => encodeURIComponent(String(value));

  // Objects and automations each have their own read path; any other type is a plain entity.
  const getVersioned = async (type, id) => {
    const record = await read(type === 'ENTITY_TYPE' ? `/api/entity-type?entityType=${part(id)}`
      : type === 'WORKFLOW_DEFINITION' ? `/api/workflow-definition/${part(id)}` : `/api/entity/${part(type)}/${part(id)}`);
    return { ...record, id: record?.id ?? id, entityType: record?.entityType ?? type };
  };

  // Many definitions of one kind, as `get_definitions` answers: each id read on
  // its own path, then only those newer than the version named for it. An id
  // left out of `knownVersions` always comes back, so an entity with no copy yet
  // is read even at version 0. A read that finds nothing is `gone`; one that
  // breaks is `failed`, and the rest of the batch still answers.
  const getDefinitions = async ({ type, ids, knownVersions }) => {
    const held = new Map((knownVersions ?? []).map((known) => [known.id, known.version]));
    const definitions = [], gone = [], failed = [];
    await Promise.all(ids.map(async (id) => {
      let record;
      try { record = await getVersioned(type, id); }
      catch (error) {
        if (error?.code === 'NOT_FOUND') gone.push(id);
        else failed.push({ ok: false, id, result: 'error', message: error?.message ?? 'read failed' });
        return;
      }
      if (!record || record.id === undefined) { gone.push(id); return; }
      const version = record.version, have = held.get(id);
      if (typeof version === 'number' && have !== undefined && version <= have) return;
      definitions.push(record);
    }));
    return { definitions, gone, failed };
  };

  // The app's tree, then every entity, or only those newer than the versions held (-1 for one
  // with no copy yet), as `get_app_entities` answers.
  const getAppEntities = async ({ appId, knownVersions }) => {
    const answer = await read('/api/entity/entity-dependents-with-assets',
      { entityType: 'e_interface', entityIds: [appId], includeAllEntities: !knownVersions, snapshotEntityTypes: [] });
    const tree = Object.values(answer?.dependencyTrees ?? {}).find((item) => item?.entityId === appId);
    if (!tree) throw new UaError('NOT_FOUND', `App ${appId} answered no dependency tree.`);
    if (!knownVersions) return { tree, entities: answer.entities ?? [] };
    const held = new Map(knownVersions.map((known) => [`${known.entityType}:${known.id}`, known.version]));
    const groups = new Map();
    const visit = (node) => {
      if (!node?.entityId || !node.entityType) return;
      const ids = groups.get(node.entityType) ?? new Map();
      ids.set(node.entityId, held.get(`${node.entityType}:${node.entityId}`) ?? -1);
      groups.set(node.entityType, ids);
      for (const child of node.dependentEntities ?? []) visit(child);
    };
    visit(tree);
    const entities = [...groups].sort(([left], [right]) => left.localeCompare(right)).map(([entityType, ids]) => ({ entityType,
      entityIdVersions: [...ids].map(([entityId, currentVersion]) => ({ entityId, currentVersion })) }));
    const changes = await read('/api/entity/bulk-fetch', { entities });
    return { tree, entities: Object.values(changes?.entityTypeVsEntities ?? {}).flatMap((byId) => Object.values(byId ?? {})) };
  };

  return { getVersioned, getDefinitions, getAppEntities };
}
