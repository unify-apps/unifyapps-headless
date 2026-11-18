// A file-backed entity API with the platform's wire shape. The local solution
// store and the UA_FAKE platform both run on it; neither prints or opens a browser.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { withFileLock } from '../lib/session-paths.mjs';

const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, body: structuredClone(body) });
const ENTITY_TYPE_PREFIX = '/api/entity-type?entityType=';
// Like the platform, a create or an update keeps exactly the tags it was sent, so
// an update that leaves them out clears them.
const tagsFrom = (body) => Array.isArray(body?.tags) ? { tags: [...body.tags] } : {};

/** Holds the store's lock for one read-modify-write of the whole file. `work`
 * must be synchronous: the lock is a blocking file lock, so a call that yielded
 * while holding it would stall every other call in this process. */
function withStore(file, work) {
  return withFileLock(file, () => {
    let state = { records: {}, counters: {} };
    try { state = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const save = () => {
      const temp = `${file}.${randomUUID()}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(temp, file);
    };
    return work(state, save);
  });
}

/**
 * @param file JSON store: `{ records: { [id]: record }, counters: { [type]: n } }`.
 * @param options.idFor `(type, n) => id` for created records.
 * @param options.userId `ownerUserId` / `lastModifiedBy` stamped on writes; null when there is no backend user.
 * @param options.knownTypes entity types the entity-type endpoint answers for without a seeded ENTITY_TYPE record.
 */
export function fileEntityApi(file, { idFor = (type, n) => `e_${type}_${n}`, userId = null, knownTypes = [] } = {}) {
  const known = new Set(knownTypes);
  return (pathname, body, method = body === undefined ? 'GET' : 'POST') => withStore(file, (state, save) => {
    const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (method === 'GET' && pathname.startsWith(ENTITY_TYPE_PREFIX)) {
      const id = decodeURIComponent(pathname.slice(ENTITY_TYPE_PREFIX.length));
      const record = state.records[id];
      if (record?.entityType === 'ENTITY_TYPE') return reply(200, record);
      if (known.has(id)) return reply(200, { id, entityType: 'ENTITY_TYPE', version: 1, properties: { name: id } });
      // The platform answers a type it lacks with HTTP 200 and an empty body.
      return { status: 200, ok: true, body: '' };
    }
    if (method === 'POST' && pathname === '/api/entity' && body?.entityType) {
      const type = body.entityType;
      const n = (state.counters[type] ?? 0) + 1;
      state.counters[type] = n;
      const now = Date.now();
      const record = { id: idFor(type, n), entityType: type, version: 1, ...tagsFrom(body),
        properties: structuredClone(body.properties), createdTime: now, modifiedTime: now,
        ownerUserId: userId, lastModifiedBy: userId };
      state.records[record.id] = record;
      save();
      return reply(200, record);
    }
    if (method === 'POST' && pathname === '/api/entity/update') {
      const previous = state.records[body?.id];
      if (!previous || previous.entityType !== body.entityType) return reply(404, { message: 'Entity not found' });
      if (previous.version !== body.version) return reply(409, { message: 'Version conflict' });
      const { tags: _previousTags, ...kept } = previous;
      const record = { ...kept, version: previous.version + 1, ...tagsFrom(body), properties: structuredClone(body.properties),
        modifiedTime: Date.now(), lastModifiedBy: userId };
      state.records[record.id] = record;
      save();
      return reply(200, record);
    }
    if (method === 'GET' && parts[0] === 'api' && parts[1] === 'workflow-definition' && parts.length === 3) {
      const record = state.records[parts[2]];
      return record?.entityType === 'WORKFLOW_DEFINITION' ? reply(200, record) : reply(404, { message: 'Entity not found' });
    }
    if (parts[0] !== 'api' || parts[1] !== 'entity') return reply(404, { message: 'Entity not found' });
    const type = parts[2];
    if (method === 'GET' && parts.length === 4) {
      const record = state.records[parts[3]];
      return record?.entityType === type ? reply(200, record) : reply(404, { message: 'Entity not found' });
    }
    if (method === 'POST' && parts.length === 3) {
      const filter = body?.filter;
      if (filter && (filter.op !== 'EQUAL' || !filter.field?.startsWith('properties_'))) {
        return reply(400, { message: 'Unsupported filter' });
      }
      const rows = Object.values(state.records).filter((r) => r.entityType === type && (!filter ||
        filter.values.some((v) => JSON.stringify(r.properties[filter.field.slice(11)]) === JSON.stringify(v))));
      const offset = Number(body?.page?.cursor ?? 0);
      const limit = Math.min(100, Math.max(1, Number(body?.page?.limit ?? 100)));
      const objects = rows.slice(offset, offset + limit);
      const hasMore = offset + objects.length < rows.length;
      return reply(200, { objects, hasMore, cursor: hasMore ? { next: String(offset + objects.length) } : {}, type: 'HITS' });
    }
    return reply(404, { message: 'Entity not found' });
  });
}

/** The workspace store for a solution whose tenant cannot hold lifecycle records. */
export const LOCAL_STORE_FILE = path.join('records', 'local-store.json');
export const localIdFor = () => `e_local${randomUUID().replace(/-/g, '').slice(0, 10)}`;
export function localEntityApi(home) {
  return fileEntityApi(path.join(home, LOCAL_STORE_FILE), { idFor: localIdFor });
}

/** Copy one record into the workspace store under the id it already carries, so
 * a platform-stored solution keeps a readable copy in the folder. */
export function mirrorLocalRecord(home, record) {
  if (!record?.id || !record.entityType) return record;
  return withStore(path.join(home, LOCAL_STORE_FILE), (state, save) => {
    state.records[record.id] = structuredClone(record);
    save();
    return record;
  });
}
