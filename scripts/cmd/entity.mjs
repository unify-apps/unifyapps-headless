import fs from 'node:fs';
import path from 'node:path';
import { UaError } from '../lib/contracts.mjs';
import { assertLocalPath, atomicFile } from '../lib/session-paths.mjs';
import { sessionHome } from '../workspace/local.mjs';
import {
  checkpointEntityRef,
  checkpointEntityRefs,
  listCachedEntities,
  readCachedAppContext,
  readCachedEntityContext,
  readCachedPageContext,
  readCachedSolutionContext,
  cachedIdFor,
} from '../workspace/entity-cache.mjs';
import { readInterfaceManifest } from '../workspace/interface-cache.mjs';
import { entityUrl, previewUrl, rowsTable } from '../lib/entity-links.mjs';

function required(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new UaError('USAGE', `${label} is required.`);
  return text;
}

// The kinds `entity read` caches. Records and every other platform type are
// read live through their own tools.
const READ_KINDS = new Set(['object', 'automation', 'ai-agent', 'app', 'page', 'code-app']);

function entityRef(args, flags) {
  const kind = required(args[0], 'Entity kind');
  const id = required(args[1], 'Entity ID');
  if (!READ_KINDS.has(kind)) throw new UaError('USAGE', `entity read takes ${[...READ_KINDS].join(', ')}, not ${kind}.`);
  if (kind === 'page' && !flags['app-id']) throw new UaError('USAGE', 'A page is read through its app: add --app-id <app id>.');
  return {
    kind,
    id,
    ...(flags.name ? { name: flags.name } : {}),
    ...(flags['app-id'] ? { appId: flags['app-id'] } : {}),
  };
}

const LINKABLE_KINDS = new Set(['object', 'record', 'automation', 'app', 'code-app', 'page', 'connection', 'ai-agent', 'knowledge-set', 'dataset', 'metric', 'experiment', 'api_group', 'api', 'client', 'access_profile', 'policy', 'env_variable', 'connector', 'graph', 'solution', 'changeset']);

function linkRef(args, flags) {
  const kind = required(args[0], 'Entity kind');
  const id = required(args[1], 'Entity ID');
  if (!LINKABLE_KINDS.has(kind)) throw new UaError('USAGE', `No link format for entity kind: ${kind}.`);
  return {
    kind, id,
    ...(flags['app-id'] ? { appId: flags['app-id'] } : {}),
    ...(flags['object-id'] ? { objectId: flags['object-id'] } : {}),
    ...(flags['group-id'] ? { groupId: flags['group-id'] } : {}),
    ...(flags['client-id'] ? { clientId: flags['client-id'] } : {}),
  };
}

const summaries = snapshots => snapshots.map(snapshot => ({
  entityType: snapshot.entityType,
  id: snapshot.id,
  version: snapshot.version,
  cachedAt: snapshot.cachedAt,
}));

// Every context kind reads the cache only. The live tool to fall back on is the
// surface that owns the kind, named in the message so a router or builder can
// follow it without a lookup. An entity is named by its id or by its name: a
// task that creates one has only the name, and a name the cache does not hold
// answers miss, the same as an id it does not hold.
const SAFE_ID = /^[A-Za-z0-9_-]+$/u;
// The entity, of any cached type, a SAFE_ID-shaped token already names — or null.
const cachedOfAnyType = (home, token) => (SAFE_ID.test(String(token ?? '').trim())
  ? listCachedEntities(home).find(snapshot => snapshot.id === token) : null);
// The id a token names: a cached entity's id or name, else the token itself when it
// can be an id — UNLESS that id is already cached as a different entity type (a
// theme id passed as --app-id, say): that is not a plausible never-cached id of
// THIS type, so it answers null here too, and the caller names the real kind
// instead of an ordinary, never-cached miss.
const idFor = (home, entityType, token, options) => {
  const cached = cachedIdFor(home, entityType, token, options);
  if (cached) return cached;
  const other = cachedOfAnyType(home, token);
  if (other && other.entityType !== entityType) return null;
  return SAFE_ID.test(token) ? token : null;
};
const notCached = (home, entityType, name) => {
  const wrongType = cachedOfAnyType(home, name);
  return wrongType && wrongType.entityType !== entityType
    ? { status: 'miss', reason: 'wrong-entity-type', entityType, name, actualEntityType: wrongType.entityType }
    : { status: 'miss', reason: 'not-cached', entityType, name };
};
const appPages = (home, appId) => new Set((readInterfaceManifest(home, appId)?.members ?? []).filter(member => member.entityType.includes('component')).map(member => member.id));
const readByIdOrName = (entityType, label, read) => (home, token, flags) => {
  const id = idFor(home, entityType, required(token, `${label} id or name`));
  return id ? { id, cache: read(home, id, flags) } : { cache: notCached(home, entityType, token) };
};
const refOf = (kind) => (id) => ({ kind, id });
const CONTEXT_KINDS = {
  solution: { label: 'Solution', read: (home) => ({ cache: readCachedSolutionContext(home) }), fallback: 'solution refresh and the surface tools' },
  app: { label: 'App', fallback: 'the application-builder app tools', ref: refOf('app'), read: readByIdOrName('e_interface', 'App', (home, id) => readCachedAppContext(home, id)) },
  page: { label: 'Page', fallback: 'the application-builder page tools', ref: (id, appId) => ({ kind: 'page', id, appId }), read: (home, token, flags) => {
    const appToken = required(flags['app-id'], 'Owning app id or name (--app-id)');
    // Resolved strictly, with no fallback to the raw token: an app-id the
    // cache does not know (wrong, or simply never read) is refused by name
    // here, rather than passed through to come back as the page's own,
    // harder to read, "interface-not-cached" miss.
    const appId = cachedIdFor(home, 'e_interface', appToken);
    if (!appId) return { cache: { status: 'miss', reason: 'app-id-unresolved', entityType: 'e_interface', name: appToken } };
    const id = idFor(home, 'e_component', required(token, 'Page id or name'), { among: appPages(home, appId) });
    return id ? { id, appId, cache: readCachedPageContext(home, appId, id) } : { cache: notCached(home, 'e_component', token) };
  } },
  object: { label: 'Object', fallback: 'the object tools', ref: refOf('object'), read: readByIdOrName('ENTITY_TYPE', 'Object', (home, id) => readCachedEntityContext(home, 'ENTITY_TYPE', id)) },
  automation: { label: 'Automation', fallback: 'the automation-code tools', ref: refOf('automation'), read: readByIdOrName('WORKFLOW_DEFINITION', 'Automation', (home, id) => readCachedEntityContext(home, 'WORKFLOW_DEFINITION', id)) },
  // The cached record holds the agent itself; its tools, skills, tasks and
  // knowledge are separate entities that only `get_agent` answers.
  'ai-agent': { label: 'AI agent', fallback: 'the agent-builder tools', ref: refOf('ai-agent'), read: readByIdOrName('ai_agent', 'AI agent', (home, id) => readCachedEntityContext(home, 'ai_agent', id)) },
};

// `--save` is a builder's read before it writes. The cache knows only UnifyApps Headless's
// own writes, so an edit made in the builder or a publish made elsewhere leaves
// a copy that looks current. Before that read answers, the one app or entity is
// read again from the tenant (an app as a version delta, so an unchanged app
// costs one small call). A plain read stays offline. A failed check answers
// stale, except a sign-in that ran out or a refused tenant, which a write would
// hit too.
const ENDS_THE_READ = new Set(['AUTH_EXPIRED']);
async function checkLive(ctx, ref) {
  try {
    await checkpointEntityRef(ctx, ref, { source: 'cache-refresh', link: false });
    return null;
  } catch (error) {
    if (ENDS_THE_READ.has(error?.code)) throw error;
    return error?.message ?? 'read failed';
  }
}

// A page answer is about 140 KB and an app about 900 KB: more than one Bash reply
// shows, so a reader has to put it in a file first. Builders that run side by
// side share one scratchpad, and two of them picking the same file name read
// each other's page. `--save` writes the answer to a file named after the
// entity, in this Claude session's own folder, and prints only who it is.
function contextFile(ctx, kind, id) {
  const name = kind === 'solution' ? 'solution' : `${kind}-${String(id ?? '')}`;
  if (!/^[A-Za-z0-9_-]+$/u.test(name)) throw new UaError('USAGE', `Cannot save a context named ${name}.`);
  return assertLocalPath(path.join(sessionHome(ctx.home, ctx.sessionId), 'reads', `${name}.json`), ctx.home);
}
function saveContext(ctx, kind, id, cache) {
  const file = contextFile(ctx, kind, id);
  atomicFile(file, `${JSON.stringify({ cache }, null, 2)}\n`);
  return file;
}
// A miss or stale answer saves nothing, so the file an earlier hit saved under
// the same name would still be there, holding the copy from before the write,
// and a reader that opens it takes it as current. It goes when the answer does.
function removeSavedContext(ctx, kind, id) {
  let file;
  try { file = contextFile(ctx, kind, id); } catch { return null; }
  try { fs.unlinkSync(file); return file; }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

// The body a hit names, so the short reply says whose copy the file holds.
const bodyOf = (cache) => cache.page ?? cache.interface ?? cache.entity ?? null;
function savedSummary(cache) {
  const body = bodyOf(cache);
  return {
    status: cache.status,
    source: cache.source,
    ...(body ? { id: body.id ?? null, name: body.properties?.name ?? body.name ?? null, version: body.version ?? cache.version ?? null } : {}),
    ...(cache.validatedAt ? { validatedAt: cache.validatedAt } : {}),
    ...(cache.cachedAt ? { cachedAt: cache.cachedAt } : {}),
    ...(cache.page ? { blocks: Object.keys(cache.page.properties?.blocks ?? {}).length } : {}),
    ...(cache.stalePages?.length ? { stalePages: cache.stalePages } : {}),
    ...(cache.stale?.length ? { stale: cache.stale } : {}),
  };
}

export async function run(command, args = [], flags = {}, ctx) {
  if (!ctx?.service || !ctx.home || !ctx.state?.solutionId) throw new UaError('NOT_STARTED');
  if (command === 'list') {
    const entities = listCachedEntities(ctx.home).map(snapshot => ({ entityType: snapshot.entityType, id: snapshot.id,
      version: snapshot.version, cachedAt: snapshot.cachedAt, source: snapshot.source, ref: snapshot.ref ?? null }));
    return { data: { entities }, message: `${entities.length} linked entity snapshots.` };
  }
  if (command === 'link' && flags.refs !== undefined) {
    // Every entity of a change in one call, with the table a plan shows, so the
    // links never need a shell loop (zsh does not split a quoted "kind id").
    let refs;
    try { refs = JSON.parse(flags.refs); } catch { throw new UaError('USAGE', '--refs must be a JSON list of {kind, id, name?, appId?, objectId?, groupId?, clientId?, status?}.'); }
    if (!Array.isArray(refs) || !refs.length) throw new UaError('USAGE', '--refs must be a JSON list of {kind, id, name?, appId?, objectId?, groupId?, clientId?, status?}.');
    const links = refs.map((ref) => {
      const one = linkRef([ref?.kind, ref?.id], { 'app-id': ref?.appId, 'object-id': ref?.objectId, 'group-id': ref?.groupId, 'client-id': ref?.clientId });
      const url = entityUrl(ctx.state?.tenant, one);
      if (!url) throw new UaError('USAGE', `No link for ${one.kind} ${one.id}: needs appId (page), objectId (record), groupId (api) or clientId (access_profile).`);
      const preview = previewUrl(ctx.state?.tenant, one);
      return { ...one, name: String(ref.name ?? ref.id), url, ...(preview ? { preview } : {}) };
    });
    const entityTable = rowsTable(links.map((link, i) => ({ name: link.name, kind: link.kind, status: String(refs[i].status ?? '✅'), url: link.url, preview: link.preview })));
    return { data: { links, entityTable }, message: entityTable };
  }
  if (command === 'link') {
    const ref = linkRef(args, flags);
    const url = entityUrl(ctx.state?.tenant, ref);
    if (!url) throw new UaError('USAGE', `No link for ${ref.kind} ${ref.id}: needs --app-id (page) or --object-id (record).`);
    const preview = previewUrl(ctx.state?.tenant, ref);
    return { data: { url, ...(preview ? { preview } : {}) }, message: preview ? `${url}\nPreview: ${preview}` : url };
  }
  if (command === 'context') {
    // Own keys only: a plain object also answers to `toString` and `constructor`.
    const kind = Object.hasOwn(CONTEXT_KINDS, args[0] ?? '') ? CONTEXT_KINDS[args[0]] : null;
    if (!kind) throw new UaError('USAGE', `Entity context takes ${Object.keys(CONTEXT_KINDS).join(', ')}: entity context <kind> [<id> | --name <name>] [--app-id <id>].`);
    if (flags.name !== undefined && args[1] !== undefined) throw new UaError('USAGE', 'Name the entity by its id or by --name, not both.');
    const token = flags.name ?? args[1];
    let { id, cache, appId } = kind.read(ctx.home, token, flags);
    let liveCheckFailed = null;
    if (flags.save && kind.ref && id && cache.status !== 'miss') {
      liveCheckFailed = await checkLive(ctx, kind.ref(id, appId));
      ({ id, cache } = kind.read(ctx.home, token, flags));
      if (liveCheckFailed && cache.status === 'hit') cache = { status: 'stale', reason: 'live-check-failed', entityType: cache.entityType ?? bodyOf(cache)?.entityType ?? null, id };
      if (liveCheckFailed) cache = { ...cache, liveCheckError: liveCheckFailed };
    }
    const { label } = kind;
    const partial = cache.status === 'hit' && (cache.stalePages?.length || cache.stale?.length);
    const store = cache.source === 'interface-cache' ? 'local interface cache' : 'local cache';
    // A miss whose cause is the owning app, not the page itself (a wrong or
    // simply unread --app-id), says so and names the fix: reading the app is
    // what fills the cache this miss is about.
    const appCauseMiss = args[0] === 'page' && (cache.reason === 'app-id-unresolved' || cache.reason === 'interface-not-cached');
    const message = cache.status === 'hit'
      ? `${label} context loaded from the ${store}${partial ? '; the stale entries need a live read' : ''}.`
      : cache.reason === 'wrong-entity-type'
      ? `${cache.name} is a cached ${cache.actualEntityType}, not a ${label.toLowerCase()}. Pass its own kind of id.`
      : `${label} cache is ${cache.status}; use ${kind.fallback}.${appCauseMiss ? ` Run entity read app ${flags['app-id'] ?? appId} to fill the cache, then try again.` : ''}`;
    if (flags.save && cache.status === 'hit') {
      const file = saveContext(ctx, args[0], id, cache);
      const checked = kind.ref ? ' Checked against the tenant just now.' : '';
      return { data: { cache: { ...savedSummary(cache), ...(kind.ref ? { checkedLive: true } : {}) }, file }, message: `${message}${checked} Saved to ${file}.` };
    }
    // A miss over the owning app, not the page, says nothing about whether
    // the page's own previously saved read is still good: it is left alone,
    // rather than removed for a problem that was never about the page.
    const removed = flags.save && !appCauseMiss ? removeSavedContext(ctx, args[0], id ?? args[1]) : null;
    if (removed) return { data: { cache, removed }, message: `${message} Removed ${removed}, which held the copy from before.` };
    return { data: { cache }, message };
  }
  const ref = entityRef(args, flags);
  if (command === 'read') {
    // Several existing entities, as a comma list of ids or one id per argument,
    // are read and linked in one command, so linking what already exists needs
    // no plan task. An id after the first was once dropped without a word.
    const ids = args.slice(1).flatMap(arg => String(arg).split(',')).map(id => id.trim()).filter(Boolean);
    if (!ids.length) throw new UaError('USAGE', 'Entity ID is required.');
    if (ids.length > 1) {
      if (flags.name) throw new UaError('USAGE', '--name names one entity. Leave it out when you read several ids.');
      const result = await checkpointEntityRefs(ctx, ids.map(id => ({ ...ref, id })), { source: flags.source ?? 'read' });
      const failed = result.failed.map(item => ({ id: item.ref.id, error: item.error?.message ?? 'read failed' }));
      return {
        data: { entities: summaries(result.snapshots), linked: result.linked, failed },
        // Count each half from what happened: a line that said "cached and
        // linked" over an empty `linked` once recorded a link that never was.
        message: `${ids.length - failed.length} of ${ids.length} entities cached, ${result.linked.length} linked to the solution.${failed.length ? ` Not read: ${failed.map(item => `${item.id} (${item.error})`).join('; ')}.` : ''}`,
        ...(failed.length ? { exitCode: 1 } : {}),
      };
    }
    const result = await checkpointEntityRef(ctx, { ...ref, id: ids[0] }, { source: flags.source ?? 'read' });
    const message = result.linked ? 'Entity version cached and linked to the solution.' : 'Entity version cached; not linked to the solution.';
    return { data: { entities: summaries(result.snapshots), linked: result.linked }, message };
  }
  throw new UaError('USAGE', `Unknown entity command: ${command}.`);
}
