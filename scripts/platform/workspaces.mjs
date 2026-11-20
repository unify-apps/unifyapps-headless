// A tenant's workspaces, read the way the platform's own workspace switcher
// reads them: the `s_project` lookup, which answers the workspaces this person
// may open, not every workspace on the tenant.
//
// Global is not a stored workspace. The switcher puts it at the top of its own
// list as id 0, and so does this file, because a request for workspace 0 carries
// no header and matches nothing server-side.
//
// There is no MCP tool for any of this yet, so these are direct REST reads, like
// sign-in and the session log. The CLI and setup call them; a builder agent never
// does.
import { GLOBAL_WORKSPACE_ID, GLOBAL_WORKSPACE_NAME, UaError, normalizeTenant, WORKSPACE_HEADER } from '../lib/contracts.mjs';
import { tenantFetch } from './tenant-fetch.mjs';

/** One page of the lookup. The switcher asks for 30; a CLI list is read once, so it asks for more. */
const PAGE_SIZE = 100;
/** Pages read before giving up, so a tenant with thousands cannot turn one list into forever. */
const MAX_PAGES = 10;
/** What `EntityTypeVsAssetClass.Project` is on the wire. */
const LOOKUP_TYPE = 's_project';

export const GLOBAL_WORKSPACE = Object.freeze({ id: GLOBAL_WORKSPACE_ID, name: GLOBAL_WORKSPACE_NAME, global: true });

// The one read a test may stand in for: `workspaceOfEntity` decides whether a
// write or a link is refused, and the fake platform serves no entity routes.
let fetchEntity = tenantFetch;
export function __setTenantFetchForTest(replacement) { fetchEntity = replacement ?? tenantFetch; }

/** True when this id means Global, including the empty and absent cases. */
export const isGlobalWorkspace = (id) => !String(id ?? '').trim() || Number(id) === 0;

/** The workspace a solution works in, as the pair every message and link needs. */
export function workspaceOf(record) {
  const id = String(record?.workspaceId ?? '').trim();
  if (isGlobalWorkspace(id)) return { ...GLOBAL_WORKSPACE };
  return { id, name: String(record?.workspaceName ?? '').trim() || `Workspace ${id}`, global: false };
}

async function post(tenant, pathname, body, { cookie } = {}) {
  const host = normalizeTenant(tenant);
  let response;
  try {
    response = await tenantFetch(host, pathname, {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, { cookie });
  } catch (error) {
    if (error instanceof UaError) throw error;
    throw new UaError('PLATFORM_UNREACHABLE', undefined, { host });
  }
  if (response.status === 401 || response.status === 403) throw new UaError('AUTH_EXPIRED', { host });
  if (!response.ok) throw new UaError('PLATFORM_UNREACHABLE', undefined, { host, status: response.status });
  try { return await response.json(); }
  catch { throw new UaError('PLATFORM_UNREACHABLE', undefined, { host }); }
}

function row(object) {
  const id = String(object?.id ?? '').trim();
  if (!id || Number(id) === 0) return null;
  return { id, name: String(object?.name ?? '').trim() || `Workspace ${id}`, global: false };
}

/**
 * Every workspace this person may open, Global first.
 *
 * `listedAll` is false when the page cap was hit, so a name that matched nothing
 * is never reported as "no such workspace".
 */
export async function listWorkspaces(tenant, { cookie, search } = {}) {
  const query = String(search ?? '').trim();
  const workspaces = [];
  const seen = new Set();
  for (let page = 0; page < MAX_PAGES; page++) {
    const answer = await post(tenant, '/api/lookup', {
      type: 'ByQuery', lookupType: LOOKUP_TYPE, query,
      page: { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    }, { cookie });
    const objects = Array.isArray(answer?.response?.objects) ? answer.response.objects : [];
    for (const object of objects) {
      const workspace = row(object);
      if (workspace && !seen.has(workspace.id)) { seen.add(workspace.id); workspaces.push(workspace); }
    }
    if (objects.length < PAGE_SIZE) {
      const global = !query || GLOBAL_WORKSPACE_NAME.toLowerCase().includes(query.toLowerCase());
      return { workspaces: global ? [{ ...GLOBAL_WORKSPACE }, ...workspaces] : workspaces, listedAll: true };
    }
  }
  return { workspaces: [{ ...GLOBAL_WORKSPACE }, ...workspaces], listedAll: false };
}

const label = (workspace) => `${workspace.name} (id ${workspace.id})`;

/**
 * The one workspace a person meant, by id, by name, or by a name that contains
 * their words. A miss names the workspaces that do exist: an agent that cannot
 * find a workspace must ask, never invent one or build something named after it.
 */
export async function resolveWorkspace(tenant, wanted, { cookie } = {}) {
  const want = String(wanted ?? '').trim();
  if (!want) throw new UaError('USAGE', 'Name a workspace, or "global".');
  if (isGlobalWorkspace(want) || want.toLowerCase() === GLOBAL_WORKSPACE_NAME.toLowerCase()) return { ...GLOBAL_WORKSPACE };

  const { workspaces, listedAll } = await listWorkspaces(tenant, { cookie });
  const byId = workspaces.find((workspace) => workspace.id === want);
  if (byId) return byId;

  const lowered = want.toLowerCase();
  const byName = workspaces.find((workspace) => workspace.name.toLowerCase() === lowered);
  if (byName) return byName;

  const partial = workspaces.filter((workspace) => workspace.name.toLowerCase().includes(lowered));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new UaError('USAGE', `More than one workspace matches "${want}": ${partial.map(label).join(', ')}. Ask which one, then use its exact name or id.`);
  }
  const capped = listedAll ? '' : ` Only the first ${workspaces.length} could be listed, so try the exact workspace id.`;
  throw new UaError('NOT_FOUND', `No workspace named "${want}" on ${normalizeTenant(tenant)}. Available: ${workspaces.map(label).join(', ') || 'none'}.${capped}`);
}

/** Where one kind's record is read and written, for a workspace repair. */
const REPAIR_ROUTES = Object.freeze({
  app: { read: (id) => `/api/entity/e_interface/${encodeURIComponent(id)}`, write: () => '/api/entity/update' },
  object: { read: (id) => `/api/entity-type?entityType=${encodeURIComponent(id)}`, write: () => '/api/entity-type/update' },
  // An automation's create takes no workspace either, and its own update route
  // honours the header: the stored definition posted back carries it, and the
  // code reads back unchanged (measured on a test tenant).
  automation: {
    read: (id) => `/api/workflow-definition/${encodeURIComponent(id)}`,
    write: (id) => `/api/workflow-definition/update/${encodeURIComponent(id)}`,
  },
});

/**
 * Put one freshly created entity back in the workspace it was created for.
 *
 * A create can land its entity in the right workspace and then lose it: an app's
 * create makes a second write of its own (the domain mapping, the first page)
 * through a route that sends no workspace header, and a header-less write means
 * Global — measured on a test tenant, where an app created in a workspace read
 * back in Global at version 1. Until that route keeps the workspace itself, this
 * reads the entity back and repairs it.
 *
 * Answers `true` when the entity is in the wanted workspace afterwards, whether
 * it was already there or this put it back; `false` when it could not be read,
 * written or proved.
 */
export async function repairEntityWorkspace(tenant, kind, id, workspaceId, { cookie } = {}) {
  const route = REPAIR_ROUTES[kind];
  const wanted = String(workspaceId ?? '').trim();
  if (!route || !wanted || Number(wanted) === 0) return false;
  const host = normalizeTenant(tenant);
  const read = async () => {
    try {
      const response = await fetchEntity(host, route.read(id), { method: 'GET', signal: AbortSignal.timeout(30_000) }, { cookie });
      if (!response.ok) return undefined;
      const payload = await response.json();
      return payload && typeof payload === 'object' ? (payload.entity ?? payload) : undefined;
    } catch { return undefined; }
  };
  const record = await read();
  if (!record) return false;
  if (String(record.projectId ?? '') === wanted) return true;
  try {
    const response = await fetchEntity(host, route.write(id), {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: { 'content-type': 'application/json', [WORKSPACE_HEADER]: wanted },
      body: JSON.stringify(record),
    }, { cookie });
    if (!response.ok) return false;
  } catch { return false; }
  // A 200 is a claim about the call, not about where the entity now lives.
  const after = await read();
  return String(after?.projectId ?? '') === wanted;
}

/**
 * The workspace one entity sits in, read live.
 *
 * `projectId` rides on the record itself for every kind checked on a tenant
 * (objects, apps, automations, solutions); a record without one is in Global.
 * `undefined` means the read itself could not say, which is never treated as
 * Global: a refusal built on a failed read would block work that is allowed.
 */
export async function workspaceOfEntity(tenant, pathname, { cookie } = {}) {
  const host = normalizeTenant(tenant);
  let response;
  try {
    response = await fetchEntity(host, pathname, { method: 'GET', signal: AbortSignal.timeout(30_000) }, { cookie });
  } catch { return undefined; }
  if (!response.ok) return undefined;
  let payload;
  try { payload = await response.json(); } catch { return undefined; }
  if (!payload || typeof payload !== 'object') return undefined;
  const id = payload.projectId ?? payload.entity?.projectId;
  return isGlobalWorkspace(id) ? { ...GLOBAL_WORKSPACE } : { id: String(id), name: `Workspace ${id}`, global: false };
}
