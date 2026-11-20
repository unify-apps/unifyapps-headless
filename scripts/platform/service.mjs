// The entity transport. It has no output, browser, or cache side effects.
import { tenantFetch } from './tenant-fetch.mjs';
import { UaError, normalizeTenant, LIFECYCLE_TYPES, workspaceHeaders } from '../lib/contracts.mjs';
import { fakeEntityApi, fakeEntityReads } from './service-fake.mjs';
import { localEntityApi, mirrorLocalRecord } from './entity-store.mjs';
import { callTenantTool } from './tenant-mcp.mjs';

const OWN_RECORD_TYPES = new Set(LIFECYCLE_TYPES);
// The entity types `get_definition` reads, by the kind it names each.
const DEFINITION_KINDS = Object.freeze({ ENTITY_TYPE: 'object', WORKFLOW_DEFINITION: 'automation', ai_agent: 'ai-agent' });
const PLATFORM_ID = /^[A-Za-z0-9_-]+$/u;
/** The one record type that lives in a workspace; every other one UnifyApps Headless writes is Global. */
const SOLUTION_TYPE = 'e_solution';
// Fields a type no longer declares. An update sends the record's whole
// properties back, and a solution linked before 2026-10-02 still holds
// `linkedEntities`, which the tenant now refuses as an extra property on every
// solution write. Links live in `solution_linked_assets` rows instead.
const DROPPED_FIELDS = Object.freeze({ e_solution: ['linkedEntities'] });

/** The properties an update sends: the record's own, the patch over them, and no dropped field. */
function propertiesForUpdate(record, patchProperties) {
  const properties = { ...record.properties, ...patchProperties };
  for (const field of DROPPED_FIELDS[record.entityType] ?? []) delete properties[field];
  return properties;
}

/**
 * A real tenant's records and entities, read and written through its MCP tools:
 * UnifyApps Headless's own records with `get_entity_records` (object route) and
 * `save_solution_record`, objects, automations and AI agents with
 * `get_definition` and `get_definitions`, and an app with `get_app_entities`. A refusal throws the
 * code the entity API's own refusal did, so callers act on it as before.
 */
function toolService({ host, callTool, retry, beforeWrite, sessionId, solutionId, home }) {
  callTool ??= ({ name, args, route }) => callTenantTool({ host, route, name, args, sessionId, solutionId, home, answerRefusals: true });
  const call = ({ name, args, operation = 'GET', route, retried = true, write = false }) => {
    const perform = async () => {
      if (write) beforeWrite();
      const answer = await callTool({ name, args, route });
      if (answer?.ok !== false) return answer;
      // The object route gives the status under `details` and the sentence as `error`.
      const status = answer.status ?? answer.details?.status ?? (answer.result === 'not_found' ? 404 : undefined);
      const message = answer.message ?? answer.error;
      const missing = status === 404 || (status >= 500 && /\bnot found\b/iu.test(String(message ?? '')));
      const code = answer.result === 'stale' ? 'VERSION_CONFLICT' : status === 401 || status === 403 ? 'AUTH_EXPIRED'
        : missing ? 'NOT_FOUND' : status === undefined || status >= 500 ? 'PLATFORM_UNREACHABLE' : 'VERSION_CONFLICT';
      const error = new UaError(code, code === 'PLATFORM_UNREACHABLE' ? `${name} failed: ${message ?? 'tool error.'}` : undefined, { host, status });
      error.status = status;
      error.operation = operation;
      throw error;
    };
    return retried ? retry(perform) : perform();
  };
  const ownType = (type) => {
    if (!OWN_RECORD_TYPES.has(type)) throw new UaError('USAGE', `UnifyApps Headless reads and writes its own records only, not ${type}.`);
    return type;
  };
  const platformId = (id) => {
    if (typeof id !== 'string' || !PLATFORM_ID.test(id)) throw new UaError('USAGE', `Not an entity id: ${JSON.stringify(id)}.`);
    return id;
  };
  const saved = (answer) => {
    if (!answer?.record?.id) throw new UaError('PLATFORM_UNREACHABLE', 'save_solution_record answered without the record.', { host });
    return answer.record;
  };
  const objectRoute = '/mcp/object';
  return {
    get: async (type, id) => {
      const answer = await call({ name: 'get_entity_records', args: { entityType: ownType(type), ids: [platformId(id)] }, route: objectRoute });
      const record = answer.records?.find((item) => item?.id === id);
      if (!record) throw new UaError(answer.missing?.includes(id) ? 'NOT_FOUND' : 'PLATFORM_UNREACHABLE', undefined, { host });
      return record;
    },
    search: async (type, col, value) => {
      const records = [], cursors = new Set();
      let cursor;
      for (;;) {
        const answer = await call({ name: 'get_entity_records', route: objectRoute,
          args: { entityType: ownType(type), where: { [col]: value }, limit: 100, ...(cursor === undefined ? {} : { cursor }) } });
        if (!Array.isArray(answer.records)) throw new UaError('PLATFORM_UNREACHABLE', undefined, { host });
        records.push(...answer.records);
        cursor = answer.nextCursor;
        if (cursor === undefined || cursor === null) return records;
        if (cursors.has(cursor)) throw new UaError('PAGINATION_ERROR', 'Platform search did not advance to the next page.');
        cursors.add(cursor);
      }
    },
    // Not retried unless asked: a lost response can follow a committed create.
    create: async (type, properties, { tags, retry: retried = false } = {}) => saved(await call({ name: 'save_solution_record',
      args: { recordType: ownType(type), properties, ...(tags ? { tags } : {}) }, operation: 'POST', write: true, retried })),
    // On the version read, so a write that raced another is refused as stale.
    update: async (record, patchProperties) => {
      if (!record?.id || !record.entityType || !Number.isFinite(record.version)) throw new UaError('USAGE', 'A versioned entity record is required.');
      return saved(await call({ name: 'save_solution_record', operation: 'update', write: true, args: {
        recordType: ownType(record.entityType), id: platformId(record.id), version: record.version,
        ...(Array.isArray(record.tags) ? { tags: record.tags } : {}),
        properties: propertiesForUpdate(record, patchProperties),
      } }));
    },
    getVersioned: async (type, id) => {
      if (!DEFINITION_KINDS[type]) throw new UaError('USAGE', `get_definition reads objects, automations and AI agents, not ${type}.`);
      const { definition: record } = await call({ name: 'get_definition', args: { kind: DEFINITION_KINDS[type], id: platformId(id) } });
      if (!record) throw new UaError('PLATFORM_UNREACHABLE', `get_definition answered no ${type} ${id}.`, { host });
      return { ...record, id: record.id ?? id, entityType: record.entityType ?? type };
    },
    /**
     * Many definitions of one kind, each only when it is newer than the version
     * named for it. An id left out of `knownVersions` always comes back, which is
     * how an entity with no local copy yet is read, including one still at
     * version 0. `gone` names an id the tenant would not give: either it is
     * deleted or this sign-in cannot see it, the same ambiguity `get_definition`
     * answers `not_found` for, so a caller must not treat it as proof of a
     * delete. `failed` names a read that broke rather than missed, one entry per
     * id, and the rest of the batch still comes back.
     */
    getDefinitions: async ({ type, ids, knownVersions }) => {
      if (!DEFINITION_KINDS[type]) throw new UaError('USAGE', `get_definitions reads objects, automations and AI agents, not ${type}.`);
      // Not retried: a page the tool refuses is read one entity at a time by the
      // caller, so three more tries of the same batch only delay that.
      const answer = await call({ name: 'get_definitions', retried: false, args: { kind: DEFINITION_KINDS[type],
        ids: ids.map(platformId),
        ...(knownVersions?.length ? { knownVersions: knownVersions.map(({ id, version }) => ({ id: platformId(id), version })) } : {}) } });
      // `gone` and `failed` are left out of the reply when they are empty, so
      // each is read as a list only when the tenant sent one.
      const failed = Array.isArray(answer.failed) ? answer.failed : [];
      // The tool keeps the whole batch `ok`, so a sign-in that ran out reaches
      // the caller only inside `failed`. Reading one entity at a time raised
      // AUTH_EXPIRED here, and the person was asked to sign in again; without
      // this the same tenant answer would quietly mark every copy stale.
      const signedOut = failed.find(item => item?.status === 401 || item?.status === 403);
      if (signedOut) throw new UaError('AUTH_EXPIRED', undefined, { host, status: signedOut.status });
      const definitions = (Array.isArray(answer.definitions) ? answer.definitions : [])
        .map(record => ({ ...record, id: record.id, entityType: record.entityType ?? type }));
      // `gone` names ids. A row rather than a plain id still answers for one, so
      // the id is taken from either, and an entry neither shape is dropped
      // rather than read as the id `undefined`.
      const gone = (Array.isArray(answer.gone) ? answer.gone : [])
        .map(item => (typeof item === 'string' ? item : item?.id))
        .filter(id => typeof id === 'string' && id);
      return { definitions, gone, failed };
    },
    getAppEntities: async ({ appId, knownVersions }) => {
      const answer = await call({ name: 'get_app_entities', args: { appId: platformId(appId), ...(knownVersions ? { knownVersions } : {}) } });
      if (!answer.tree) throw new UaError('PLATFORM_UNREACHABLE', `get_app_entities answered no tree for app ${appId}.`, { host });
      return { tree: answer.tree, entities: Array.isArray(answer.entities) ? answer.entities : [] };
    },
  };
}

/**
 * @param callTool `({ name, args, route }) => answer`, one tenant tool call; tests pass their own.
 *   An injected `api` (the fake platform, the local store, a test) stands in for a tenant and is
 *   called on the entity API's own paths; a real tenant is reached through its tools.
 */
export function createService({ host, api, callTool, retry = (operation) => operation(), beforeWrite = () => {}, sessionId, solutionId, home, workspaceId } = {}) {
  host = host ? normalizeTenant(host) : 'platform';
  // A caller that supplies both an `api` and a `callTool` gets the tool path with
  // that api behind it, which is how the workspace repair below is tested without
  // a tenant: the repair writes through the entity API, the tools do not.
  const viaTools = api && !callTool ? null : toolService({ host, callTool, retry, beforeWrite, sessionId, solutionId, home });
  // The entity API's own record paths, below, serve the local store
  // (`localEntityApi`, a file in the working folder that answers them in process,
  // for a tenant that cannot hold UnifyApps Headless's records), the fake platform the tests
  // run on, and a real tenant through `direct` alone: setup's two fallbacks, the
  // solution read when `get_solution` cannot answer and the CLI create. Every
  // other call to a real tenant goes through `viaTools`.
  if (!api) {
    if (host === 'platform') throw new UaError('USAGE', 'A tenant is required.');
    api = async (pathname, body, method, { workspaceId } = {}) => tenantFetch(host, pathname, {
      method, signal: AbortSignal.timeout(30_000),
      // A write with no workspace header lands in Global, whatever the record
      // says, so a record that lives in a workspace sends it on every write.
      headers: { 'content-type': 'application/json', ...workspaceHeaders(workspaceId) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const request = (pathname, body, method = body === undefined ? 'GET' : 'POST', options = {}) => {
    const perform = async () => {
    if (pathname === '/api/entity' || pathname === '/api/entity/update') beforeWrite();
    let response;
    try { response = await api(pathname, body, method, { workspaceId: options.workspaceId }); }
    catch (cause) {
      if (cause instanceof UaError) throw cause;
      throw new UaError('PLATFORM_UNREACHABLE', undefined, { host });
    }
    const status = response?.status ?? 200;
    let payload;
    try { payload = typeof response?.json === 'function' ? await response.json() : response?.body; }
    catch { payload = null; }
    const ok = response?.ok ?? (status >= 200 && status < 300);
    if (!ok) {
      const staleVersion = pathname === '/api/entity/update' && payload?.errorCode === 5001 && Number.isFinite(payload.currentVersion) && Number.isFinite(payload.requestVersion) && payload.currentVersion !== payload.requestVersion;
      // The platform answers a missing entity type with HTTP 500 "... not found".
      const missing = status === 404 || (status >= 500 && /\bnot found\b/iu.test(String(payload?.message ?? '')));
      const code = staleVersion ? 'VERSION_CONFLICT' : status === 401 || status === 403 ? 'AUTH_EXPIRED'
        : missing ? 'NOT_FOUND'
          : status >= 500 ? 'PLATFORM_UNREACHABLE' : 'VERSION_CONFLICT';
      const error = new UaError(code, undefined, { host, status });
      error.status = status;
      error.operation = pathname === '/api/entity/update' ? 'update' : method;
      throw error;
    }
    if (!payload || typeof payload !== 'object') throw new UaError('PLATFORM_UNREACHABLE', undefined, { host });
    return payload.entity ?? payload;
    };
    return options.retry === false ? perform() : retry(perform);
  };
  const part = (value) => {
    if (typeof value !== 'string' || !value.trim()) throw new UaError('USAGE', 'An entity type and ID are required.');
    return encodeURIComponent(value);
  };
  const get = (type, id) => request(`/api/entity/${part(type)}/${part(id)}`);
  // A lost response can follow a committed create. Replaying this POST can
  // duplicate records; callers recover using their saved receipt or pointer.
  const create = (type, properties, { tags, ...options } = {}) => request('/api/entity',
    { entityType: type, ...(tags ? { tags } : {}), properties }, 'POST', { retry: false, ...options });
  // `workspaceId` is the workspace the record must still be in afterwards, not a
  // move: only the solution record carries one. UnifyApps Headless's other record
  // types stay in Global, so they pass nothing and the header is left off.
  const update = (record, patchProperties, { workspaceId } = {}) => {
    if (!record?.id || !record.entityType || !Number.isFinite(record.version)) {
      throw new UaError('USAGE', 'A versioned entity record is required.');
    }
    return request('/api/entity/update', {
      id: record.id, entityType: record.entityType, version: record.version,
      // The platform clears the tags of an update that leaves them out, so send the record's own.
      ...(Array.isArray(record.tags) ? { tags: record.tags } : {}),
      properties: propertiesForUpdate(record, patchProperties),
    }, 'POST', { workspaceId });
  };
  const search = async (type, col, value) => {
    const records = [], cursors = new Set();
    let cursor;
    for (;;) {
      const page = { limit: 100, ...(cursor === undefined ? {} : { cursor }) };
      const result = await request(`/api/entity/${part(type)}`, {
        filter: { field: `properties_${col}`, op: 'EQUAL', values: [value] }, page,
      });
      if (!Array.isArray(result.objects)) throw new UaError('PLATFORM_UNREACHABLE', undefined, { host });
      records.push(...result.objects);
      if (!result.hasMore) return records;
      cursor = result.cursor?.next;
      const key = JSON.stringify(cursor);
      if (cursor === undefined || cursor === null || cursors.has(key)) {
        throw new UaError('PAGINATION_ERROR', 'Platform search did not advance to the next page.');
      }
      cursors.add(key);
    }
  };
  // `direct` keeps the entity API for a real tenant too: setup's two fallbacks for a
  // tenant without the solution tools (the solution read and the CLI create).
  const service = viaTools ? {
    ...viaTools,
    get: (type, id, { direct } = {}) => (direct ? get(type, id) : viaTools.get(type, id)),
    search: (type, col, value, { direct } = {}) => (direct ? search(type, col, value) : viaTools.search(type, col, value)),
    create: (type, properties, options = {}) => (options.direct ? create(type, properties, options) : viaTools.create(type, properties, options)),
    update: async (record, patch, options = {}) => {
      if (options.direct) return update(record, patch, { workspaceId: options.workspaceId });
      const saved = await viaTools.update(record, patch);
      return keptInWorkspace(record, saved);
    },
  } : { get, create, update, search };

  /**
   * Put the solution record back in its workspace when the tenant's own write
   * dropped it.
   *
   * `save_solution_record` sends no workspace header, and a header-less write
   * moves the record to Global — measured on a test tenant, where one memory line
   * took a solution out of its workspace. Until the tenant's tools keep the
   * workspace themselves, this reads the answer back and repairs it with the
   * direct entity API, which does send the header. It runs only for the solution
   * record of a folder that works in a workspace; everything else UnifyApps
   * Headless writes belongs in Global and is left alone.
   */
  async function keptInWorkspace(record, saved) {
    if (!workspaceId || Number(workspaceId) === 0) return saved;
    if (record?.entityType !== SOLUTION_TYPE) return saved;
    if (String(saved?.projectId ?? '') === String(workspaceId)) return saved;
    const current = await get(SOLUTION_TYPE, record.id);
    if (String(current?.projectId ?? '') === String(workspaceId)) return current;
    const repaired = await update(current, {}, { workspaceId });
    if (String(repaired?.projectId ?? '') === String(workspaceId)) return repaired;
    throw new UaError('WORKSPACE_MISMATCH', undefined, { asset: `The solution ${record.id}`,
      assetWorkspace: 'Global', solutionWorkspace: `workspace ${workspaceId}` });
  }
  const readMergeWrite = async (type, id, mergeFn, { attempts = 3 } = {}) => {
    if (!Number.isInteger(attempts) || attempts < 1) throw new UaError('USAGE', 'Merge attempts must be positive.');
    for (let attempt = 0; attempt < attempts; attempt++) {
      const current = await service.get(type, id);
      const patch = await mergeFn(structuredClone(current.properties), current);
      try { return await service.update(current, patch); }
      catch (error) {
        // Auth and network failures are not evidence of a stale version.
        if (['AUTH_EXPIRED', 'PLATFORM_UNREACHABLE'].includes(error.code) || error.operation !== 'update' || !error.status) throw error;
        if (attempt === attempts - 1) throw new UaError('VERSION_CONFLICT', 'The record changed while saving. Try again.', { host, id });
      }
    }
  };
  return { ...service, readMergeWrite };
}

/** Lifecycle records go to the workspace store; every other entity type still reads from the tenant. */
export function withLocalStorage(platform, local) {
  const lifecycle = new Set(LIFECYCLE_TYPES);
  const pick = (type) => lifecycle.has(type) ? local : platform;
  return {
    get: (type, id) => pick(type).get(type, id),
    getVersioned: (type, id) => platform.getVersioned(type, id),
    getAppEntities: (...args) => platform.getAppEntities(...args),
    create: (type, properties, options) => pick(type).create(type, properties, options),
    update: (record, patch, options) => pick(record?.entityType).update(record, patch, options),
    search: (type, col, value) => pick(type).search(type, col, value),
    readMergeWrite: (type, id, mergeFn, options) => pick(type).readMergeWrite(type, id, mergeFn, options),
  };
}

/** Platform mode keeps a copy of every lifecycle record in the working folder, so a
 * solution stays readable when its tenant is not. The tenant remains the source of
 * truth: reads never come from the copy, and a copy that cannot be written never
 * fails the platform write that produced it. */
export function withMirroredStorage(platform, mirror) {
  const lifecycle = new Set(LIFECYCLE_TYPES);
  const copy = async (record) => {
    if (record?.id && lifecycle.has(record.entityType)) {
      try { await mirror(record); } catch { /* The copy is a backup, not the record. */ }
    }
    return record;
  };
  return {
    ...platform,
    create: async (type, properties, options) => copy(await platform.create(type, properties, options)),
    update: async (record, patch) => copy(await platform.update(record, patch)),
    readMergeWrite: async (type, id, mergeFn, options) => copy(await platform.readMergeWrite(type, id, mergeFn, options)),
  };
}

export function serviceFor(host, { retry, beforeWrite, storage = 'platform', home, sessionId, solutionId, workspaceId } = {}) {
  host = normalizeTenant(host);
  const fakeApi = process.env.UA_FAKE === '1' ? fakeEntityApi(host) : null;
  // A fake platform has no MCP tools, so it adds the definition and app reads itself.
  const platform = fakeApi
    ? { ...createService({ host, api: fakeApi, retry, beforeWrite }), ...fakeEntityReads({ host, api: fakeApi, retry }) }
    : createService({ host, retry, beforeWrite, home, sessionId, solutionId, workspaceId });
  if (storage === 'local') {
    if (!home) throw new UaError('USAGE', 'Local storage needs a folder.');
    return withLocalStorage(platform, createService({ host, api: localEntityApi(home), retry, beforeWrite }));
  }
  // A platform tenant's service names its host: `solution-sync` then reads the
  // solution through the tenant's `solution` MCP server. A local-storage service
  // and a hand-built one (a test's, with its own api) name none and read directly.
  if (!home) return { ...platform, host };
  return { ...withMirroredStorage(platform, (record) => mirrorLocalRecord(home, record)), host, home };
}
