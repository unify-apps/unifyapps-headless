const APP = '/mcp/application-builder';
const AGENT = '/mcp/agent-builder';
const list = (value) => Array.isArray(value) ? value.slice(0, 2_000) : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\r\n]/u.test(value) ? value : null;
/** The entity an id key names, where that key is not the tool's own noun. One
 * entry per key the platform answers with; a kind whose key is `<noun>Id` and
 * whose tool is `<verb>_<noun>` needs no entry at all. */
const ID_KEYS = Object.freeze({
  groupId: 'api_group', apiGroupId: 'api_group', apiId: 'api', clientId: 'client',
  profileId: 'access_profile', accessProfileId: 'access_profile', policyId: 'policy',
  datasetId: 'dataset', metricId: 'metric', experimentId: 'experiment',
});
const keyedId = (item) => Object.entries(object(item)).find(([key, value]) => Object.hasOwn(ID_KEYS, key) && id(value));
const itemId = (item) => id(typeof item === 'string' ? item : item?.id ?? item?.entityId ?? keyedId(item)?.[1]);
const text = (value) => typeof value === 'string' && value ? value.slice(0, 200) : undefined;
const version = (value) => typeof value === 'string' && value ? value.slice(0, 200)
  : typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;

export const ENTITY_READERS = Object.freeze({
  '/mcp/object': {
    apply_object_batch: [], apply_record_edits: ['objectId'], delete_object: ['objectId'],
  },
  '/mcp/automation-code': { compile_and_save_workflow: [], deploy_workflow: [] },
  [APP]: {
    create_app: [], create_global_module: [], create_package: [], apply_page_edits: ['pageId', 'interfaceId'], create_pages: ['interfaceId'], create_modules: ['interfaceId'],
    delete_pages: ['interfaceId'], update_pages: ['interfaceId'], update_page_contracts: ['interfaceId'], copy_pages: ['interfaceId', 'toInterfaceId'],
    create_data_sources: ['interfaceId'], update_data_sources: ['interfaceId'], delete_data_sources: ['interfaceId'],
    publish_app: ['appId'], update_app_settings: ['appId'], set_app_visibility: ['appId'],
    set_app_theme: ['appId'], set_theme_typography: ['appId'], set_theme_component_style: ['appId'], set_theme_custom_css: ['appId'],
    apply_navigation_edits: ['appId'], apply_permission_edits: ['appId'],
  },
  [AGENT]: {
    ...Object.fromEntries(['create_agent', 'update_agent', 'deploy_agent', 'publish_agent',
      'add_app_action', 'add_knowledge', 'add_tools', 'attach_knowledge_sets', 'attach_skills', 'detach_knowledge_sets',
      'detach_skills', 'remove_deployment', 'remove_knowledge', 'remove_tools', 'save_task', 'set_guardrails']
      .map((name) => [name, name === 'create_agent' ? [] : ['agentId']])),
    save_knowledge_sets: [], delete_knowledge_sets: ['knowledgeSetIds'], publish_knowledge_sets: ['knowledgeSetIds'],
  },
  '/mcp/connection': { create_connection: [], clone_connection: [], update_connection: ['connectionId'], delete_connection: ['connectionId'] },
  '/mcp/code-builder': { create_code_app: [] },
  '/mcp/solution': { create_solution: [], update_solution: ['id'], delete_solution: ['id'] },
  '/mcp/changeset': {
    save_changeset: ['id'], send_changeset: ['id'], export_changeset: ['id'],
    revert_changeset_to_draft: ['id'], clone_changeset: ['id'], delete_changeset: ['id'],
  },
});

/** Servers whose write tools answer one envelope for every entity kind, so a
 * kind the platform adds later is read without an adapter of its own:
 * `api-gateway` answers `{saved, readBack}`, `evaluation` `{ok, created |
 * updated | deleted}`. Both name the kind twice over — in the id key they
 * return and in the tool's own noun — which is what makes the reading generic. */
export const GENERIC_SERVERS = Object.freeze(['/mcp/api-gateway', '/mcp/evaluation']);
const WRITE_VERBS = Object.freeze(['create', 'save', 'update', 'delete', 'deploy', 'publish',
  'clone', 'attach', 'detach', 'add', 'remove', 'set', 'import']);
/** Write-named tools that change no entity of their own: a call, a token, an
 * export, a run, an upload, a preview. */
const NOT_AN_ENTITY = Object.freeze(['call_api', 'create_oauth_token', 'rotate_access_profile_key',
  'export_openapi', 'export_dataset_test_cases', 'export_experiment_run', 'start_experiment_runs',
  'stop_experiment_runs', 'delete_experiment_runs', 'test_metric', 'upload_import_file',
  'upload_public_file', 'parse_import_columns', 'create_element', 'create_elements']);

const writeVerb = (tool) => WRITE_VERBS.find((verb) => typeof tool === 'string' && tool.startsWith(`${verb}_`));
const writesAnEntity = (tool) => Boolean(writeVerb(tool)) && !NOT_AN_ENTITY.includes(tool);
const genericTool = (server, tool) => GENERIC_SERVERS.includes(server) && writesAnEntity(tool);
/** `create_metrics` is a metric, `save_access_profile` an access profile. */
const classOfTool = (tool, verb) => tool.slice(verb.length + 1).replace(/s$/u, '') || null;
const idInArgs = (args) => Boolean(keyedId(args)) || Boolean(id(args.id));
const operationOfVerb = (verb, args) => {
  if (verb === 'delete') return 'delete';
  if (verb === 'deploy' || verb === 'publish') return verb;
  if (verb === 'create' || verb === 'clone') return 'create';
  // One `save_<kind>` tool creates or edits: the id it was given says which.
  if (verb === 'save') return idInArgs(args) ? 'update' : 'create';
  return 'update';
};

/** The one reader for a generic server. An id key it knows names the class; a
 * key it does not know falls back to the tool's own noun, so a future
 * `save_api_quota` answering `{saved, readBack: {quotaId}}` reads as
 * `api_quota` with no change here. */
function genericChanges(tool, payload, args, isError) {
  const verb = writeVerb(tool);
  if (!verb) return [];
  // A reply that names what moved and moved nothing is a confirmed no-op.
  if (Array.isArray(payload.changed) && !payload.changed.length) return [];
  const fallback = classOfTool(tool, verb);
  const rows = [];
  // The entity's own key wins over a parent's (`save_api` answers `apiId` and
  // the `groupId` it sits in), then a key this file maps, then any `<noun>Id`,
  // which is what carries a kind nobody has named here yet.
  const own = `${fallback?.replace(/_([a-z])/gu, (_, letter) => letter.toUpperCase())}Id`;
  const add = (source, operation) => {
    const entry = object(source);
    if (Array.isArray(entry.changed) && !entry.changed.length) return;
    const keys = Object.entries(entry).filter(([, value]) => id(value));
    const keyed = keys.find(([key]) => key === own) ?? keys.find(([key]) => Object.hasOwn(ID_KEYS, key))
      ?? keys.find(([key]) => /Id$/u.test(key));
    const entityId = id(entry.id) ?? id(entry.entityId) ?? keyed?.[1];
    const entityClass = keyed && Object.hasOwn(ID_KEYS, keyed[0]) ? ID_KEYS[keyed[0]] : fallback;
    const row = entityClass ? change(entityClass, entityId, operation, entry) : null;
    if (row) rows.push(row);
  };
  if (payload.saved === true) add(payload.readBack ?? payload, operationOfVerb(verb, args));
  if (payload.ok === true && !isError) {
    for (const [field, operation] of [['created', 'create'], ['updated', 'update'], ['deleted', 'delete']]) {
      for (const entry of successfulItems(payload[field], payload)) add(entry, operation);
    }
    if (!rows.length) add(payload, operationOfVerb(verb, args));
  }
  return rows;
}

function change(entityClass, entityId, operation, entry = {}, parentEntityId) {
  if (!id(entityId)) return null;
  return { entityClass, entityId, operation,
    ...(text(entry.name ?? entry.displayName) && { entityName: text(entry.name ?? entry.displayName) }),
    ...(id(parentEntityId) && { parentEntityId }) };
}

function successfulItems(items, payload) {
  if (Array.isArray(payload.written) && payload.written.length === 0) return [];
  const written = list(payload.written);
  const writtenIds = new Set(written.map(itemId).filter(Boolean));
  const writtenIndexes = new Set(written.map((item) => typeof item === 'number' ? item : item?.index).filter(Number.isInteger));
  const failedIds = new Set([...list(payload.failed), ...list(payload.notWritten), ...list(payload.notStarted)].map(itemId).filter(Boolean));
  return list(items).filter((item, index) => {
    const entityId = itemId(item);
    if (!entityId || failedIds.has(entityId) || item?.ok === false || item?.succeeded === false) return false;
    if (writtenIds.size && !writtenIds.has(entityId)) return false;
    // A partial response may return only survivors. Their compact positions are
    // not the request indexes. Restrict by position only for an unfiltered list.
    if (writtenIndexes.size && (Number.isInteger(item?.index) || items.length > writtenIndexes.size)) {
      return writtenIndexes.has(item?.index ?? index);
    }
    return true;
  });
}

function pageChanges(payload, args) {
  const created = list(payload.created).filter((entry) => itemId(entry) && (entry.componentType || !entry.entityType));
  const deleted = list(payload.deleted).filter((entry) => itemId(entry) && (entry.componentType || !entry.entityType));
  const updated = list(payload.updated).filter((entry) => itemId(entry) && (entry.componentType || !entry.entityType));
  const parents = new Set([...created, ...deleted].map((entry) => id(entry?.parentId)).filter(Boolean));
  const counts = new Map();
  for (const entry of updated) counts.set(itemId(entry), (counts.get(itemId(entry)) ?? 0) + 1);
  const steps = list(args.steps);
  const blockVerbs = new Set(['create_block', 'delete_blocks', 'duplicate_blocks', 'move_blocks', 'rename_blocks', 'update_blocks']);
  const blockOnly = steps.length > 0 && steps.every((step) => blockVerbs.has(step?.tool));
  const directTargets = new Set();
  for (const step of steps) {
    if (!['move_blocks', 'rename_blocks', 'update_blocks'].includes(step?.tool)) continue;
    const input = object(step.args);
    for (const value of [input.blockId, ...list(input.blockIds),
      ...list(input.edits).map((edit) => edit?.blockId), ...list(input.moves).map((move) => move?.blockId)]) {
      if (id(value)) directTargets.add(value);
    }
  }
  const directlyChanged = new Set([...created, ...deleted].map(itemId));
  for (const entry of updated) {
    const entityId = itemId(entry);
    const direct = entry.directlyChanged === true || entry.direct === true || directTargets.has(entityId);
    // Live delete replies carry string ids, with no deleted parentId. In a
    // confirmed block-only batch the canonical args identify direct targets;
    // unrequested updated containers are parent maintenance. Args never add
    // an id: every counted update must already exist in the successful reply.
    if (blockOnly && !direct) continue;
    if (counts.get(entityId) === 1 && parents.has(entityId) && !direct) continue;
    directlyChanged.add(entityId);
  }
  if (!directlyChanged.size) return [];
  const row = change('page', payload.pageId ?? args.pageId, 'update', payload, args.interfaceId);
  return row ? [{ ...row, childCount: directlyChanged.size }] : [];
}

function objectChanges(payload) {
  if (!(payload.wrote === true || payload.ok === true || Array.isArray(payload.written))) return [];
  return successfulItems(payload.objects, payload).flatMap((entry) => {
    if (!['create', 'update'].includes(entry.write)) return [];
    const row = change('object', itemId(entry), entry.write, entry);
    return row ? [row] : [];
  });
}

function recordChanges(payload, args) {
  const groups = new Map();
  for (const result of list(payload.results)) {
    if (!['create', 'update', 'delete'].includes(result?.op)) continue;
    const landed = result.op === 'update' ? result.updated : result.op === 'delete' ? result.deleted : undefined;
    const count = Number.isSafeInteger(landed) && landed >= 0 ? landed
      : result.ok === true && id(result.recordId) ? 1 : 0;
    if (!count) continue;
    const objectId = id(result.objectId ?? payload.objectId ?? args.objectId);
    if (!objectId) continue;
    const group = groups.get(objectId) ?? { count: 0, createsOnly: true };
    group.count += count;
    group.createsOnly &&= result.op === 'create';
    groups.set(objectId, group);
  }
  return [...groups].map(([entityId, group]) => ({ entityClass: 'object', entityId,
    operation: group.createsOnly ? 'seed' : 'update', childCount: group.count }));
}

function entryChanges(payload, args, entityClass, field, operation) {
  return successfulItems(payload[field], payload).flatMap((entry) => {
    const type = typeof entry?.entityType === 'string' ? entry.entityType.toLowerCase().replace(/^e_/u, '') : '';
    if (entityClass === 'page' && type && !['page', 'component', 'module', 'template_component'].includes(type)) return [];
    const row = change(entityClass, itemId(entry), operation, object(entry), args.toInterfaceId ?? args.interfaceId);
    return row ? [row] : [];
  });
}

function confirmed(payload) {
  return payload.wrote === true || payload.saved === true || payload.updated === true || payload.deleted === true
    || payload.created === true || payload.deployed === true || payload.published === true
    || list(payload.landed).length > 0;
}

// The knowledge tools change several items per call and answer what landed even when some failed
// (`ok: false` with the rows under `details`): a created, changed, deleted or published set, and an
// agent or a set that gained or lost sources or sets.
const KNOWLEDGE_WRITES = new Set(['save_knowledge_sets', 'delete_knowledge_sets', 'publish_knowledge_sets',
  'add_knowledge', 'remove_knowledge', 'attach_knowledge_sets', 'detach_knowledge_sets']);
function knowledgeChanges(tool, payload, args) {
  const body = payload.ok === false ? object(payload.details) : payload;
  if (tool === 'save_knowledge_sets') {
    return list(body.saved).map((set) => change('knowledge_set', set?.id, set?.action === 'created' ? 'create' : 'update', set)).filter(Boolean);
  }
  if (tool === 'delete_knowledge_sets') {
    return body.dryRun === true ? [] : list(body.deleted).map((setId) => change('knowledge_set', setId, 'delete')).filter(Boolean);
  }
  if (tool === 'publish_knowledge_sets') return list(body.published).map((set) => change('knowledge_set', set?.id, 'publish')).filter(Boolean);
  const landed = list(body.added ?? body.removed ?? body.attached ?? body.detached).length > 0;
  if (!landed) return [];
  const owner = args.knowledgeSetId ? change('knowledge_set', args.knowledgeSetId, 'update') : change('ai_agent', args.agentId, 'update');
  return [owner].filter(Boolean);
}

function adapter(server, tool, payload, args, isError) {
  if (server === '/mcp/object') {
    if (tool === 'apply_object_batch') return objectChanges(payload);
    if (tool === 'apply_record_edits') return recordChanges(payload, args);
    if (tool === 'delete_object' && payload.deleted === true) {
      return [change('object', payload.objectId ?? args.objectId, 'delete', payload)].filter(Boolean);
    }
  }
  if (server === '/mcp/automation-code') {
    if (tool === 'compile_and_save_workflow' && id(payload.workflowId) && version(payload.version) !== undefined
      && (!isError || payload.saved === true || payload.wrote === true)) {
      const row = change('automation', payload.workflowId, payload.created === true ? 'create' : 'update', payload);
      return [{ ...row, version: version(payload.version) }];
    }
    if (tool === 'deploy_workflow' && id(payload.workflowId) && version(payload.deployedVersion) !== undefined && (!isError || payload.deployed === true)) {
      return [{ ...change('automation', payload.workflowId, 'deploy', payload), version: version(payload.deployedVersion) }];
    }
  }
  if (server === APP) {
    if (tool === 'create_app') return payload.created === true && id(payload.appId)
      ? [change('app', payload.appId, 'create', payload.entity?.properties ?? payload)] : [];
    // A global module and a package are interface records of their own, as an app is.
    if (tool === 'create_global_module' || tool === 'create_package') {
      const interfaceId = tool === 'create_package' ? payload.packageId : payload.moduleId;
      return payload.created === true && id(interfaceId) ? [change('app', interfaceId, 'create', payload.entity?.properties ?? payload)] : [];
    }
    if (tool === 'apply_page_edits') return pageChanges(payload, args);
    if (tool === 'copy_pages') {
      const entries = list(payload.pageCopies).map((entry) => ({ ...entry, id: entry.pageId }));
      return entryChanges({ ...payload, created: entries }, args, 'page', 'created', 'create');
    }
    if (['create_pages', 'create_modules', 'delete_pages', 'update_pages', 'update_page_contracts'].includes(tool)) {
      const operation = tool === 'delete_pages' ? 'delete' : tool.startsWith('update_') ? 'update' : 'create';
      return entryChanges(payload, args, 'page', operation === 'delete' ? 'deleted' : operation === 'update' ? 'updated' : 'created', operation);
    }
    if (['create_data_sources', 'update_data_sources', 'delete_data_sources'].includes(tool)) {
      const operation = tool === 'create_data_sources' ? 'create' : tool === 'delete_data_sources' ? 'delete' : 'update';
      return entryChanges(payload, args, 'data_source', operation === 'create' ? 'created' : operation === 'delete' ? 'deleted' : 'updated', operation);
    }
    if (tool === 'publish_app') {
      if (payload.alreadyLive === true || payload.outcomeUnknown === true || isError) return [];
      if (typeof payload.liveUrl !== 'string' && payload.published !== true) return [];
      return [change('app', payload.appId ?? args.appId, 'publish', payload)].filter(Boolean);
    }
    if (confirmed(payload)) return [change('app', payload.appId ?? payload.interfaceId ?? args.appId ?? args.interfaceId, 'update', payload)].filter(Boolean);
  }
  if (server === AGENT) {
    if (KNOWLEDGE_WRITES.has(tool)) return knowledgeChanges(tool, payload, args);
    if (tool === 'create_agent' && !isError && payload.ok !== false) {
      const created = payload.ok === true && payload.entityType === 'ai_agent' ? object(payload.agent) : {};
      const agentId = id(created.id ?? payload.agentId);
      return agentId ? [change('ai_agent', agentId, 'create', created.id ? created : payload)] : [];
    }
    // An agent made before a capability, a guardrail or its core setup failed
    // still exists: the reply moves it under `details`.
    if (tool === 'create_agent' && payload.ok === false) {
      const details = object(payload.details);
      const created = id(object(details.agent).id) ? object(details.agent) : object(details.created);
      return id(created.id) ? [change('ai_agent', created.id, 'create', created)] : [];
    }
    if (!confirmed(payload)) return [];
    const operation = tool === 'deploy_agent' ? 'deploy' : tool === 'publish_agent' ? 'publish' : 'update';
    return [change('ai_agent', payload.agentId ?? payload.agent?.id ?? args.agentId, operation, payload.agent ?? payload)].filter(Boolean);
  }
  if (server === '/mcp/solution') {
    const operation = tool === 'create_solution' ? 'create' : tool === 'delete_solution' ? 'delete' : 'update';
    if (payload.result !== (operation === 'delete' ? 'deleted' : 'saved') || isError) return [];
    if (operation === 'update' && !list(payload.changed).length) return [];
    return [change('solution', payload.id ?? args.id, operation, payload)].filter(Boolean);
  }
  if (server === '/mcp/connection') {
    if (payload.pending) return [];
    const operation = tool === 'create_connection' || tool === 'clone_connection' ? 'create' : tool === 'delete_connection' ? 'delete' : 'update';
    // A create or a clone answers the connection it read back, `{ connection: { id, name, … } }`.
    const createdId = id(payload.connectionId) ?? id(object(payload.connection).id);
    if (operation === 'create' && !isError && payload.ok !== false && createdId) return [change('connection', createdId, 'create', payload.connection ?? payload)];
    if (operation === 'create') return [];
    if (confirmed(payload)) return [change('connection', payload.connectionId ?? args.connectionId, operation, payload)].filter(Boolean);
  }
  if (server === '/mcp/code-builder' && tool === 'create_code_app') {
    return payload.ok === true && !isError && id(payload.appId) ? [change('app', payload.appId, 'create', payload)] : [];
  }
  if (server === '/mcp/changeset') {
    // Every changeset tool answers {ok, result}; only a result that names a landed write counts.
    if (isError || payload.ok !== true) return [];
    const landed = { save_changeset: 'saved', clone_changeset: 'saved', revert_changeset_to_draft: 'saved',
      send_changeset: 'sent', export_changeset: 'exported', delete_changeset: 'deleted' }[tool];
    if (!landed || payload.result !== landed) return [];
    const operation = tool === 'delete_changeset' ? 'delete' : tool === 'send_changeset' || tool === 'export_changeset' ? 'publish'
      : tool === 'clone_changeset' || (tool === 'save_changeset' && !args.id) ? 'create' : 'update';
    const record = object(payload.changeset);
    return [change('changeset', payload.id ?? args.id, operation, record.name ? record : payload)].filter(Boolean);
  }
  if (genericTool(server, tool)) return genericChanges(tool, payload, args, isError);
  return [];
}

/** Returns confirmed domain changes and bounded extraction diagnostics. Replies
 * from other RPC ids and unfamiliar/unstructured success shapes cannot qualify. */
export function extractEntityChanges({ server, tool, args = {}, replies, requestId, maxParseBytes = 256 * 1024 }) {
  const empty = { changes: [], unclassified: 0, skipped: 0, unregistered: 0 };
  // A write-named tool no reader covers is counted rather than ignored, so a
  // server or an entity kind added later shows as a named gap, not as silence.
  if (!Object.hasOwn(ENTITY_READERS[server] ?? {}, tool ?? '') && !genericTool(server, tool)) {
    return { ...empty, unregistered: writesAnEntity(tool) ? 1 : 0 };
  }
  if (args?.dryRun === true) return empty;
  let parsedBytes = 0, skipped = 0, understood = false;
  const changes = [];
  outer: for (const reply of list(replies).slice(0, 32)) {
    if (reply?.id !== requestId || reply.error || !reply.result) continue;
    const result = reply.result;
    const payloads = [];
    if (result.structuredContent && typeof result.structuredContent === 'object') payloads.push(result.structuredContent);
    else for (const content of list(result.content).slice(0, 16)) {
      if (content?.type !== 'text' || typeof content.text !== 'string') continue;
      // UTF-8 is at least one byte per character. Reject huge strings before
      // byteLength/JSON.parse; the total parse budget spans all text blocks.
      if (content.text.length > maxParseBytes || (parsedBytes += Buffer.byteLength(content.text)) > maxParseBytes) { skipped++; continue; }
      try { payloads.push(JSON.parse(content.text)); } catch {}
    }
    for (const raw of payloads) {
      const payload = object(raw);
      if (payload.wrote === false || payload.dryRun === true) { understood = true; continue; }
      const found = adapter(server, tool, payload, object(args), result.isError === true);
      if (found.length) {
        understood = true;
        const room = 2_000 - changes.length;
        changes.push(...found.slice(0, room));
        if (found.length > room) skipped += found.length - room;
        if (changes.length === 2_000) break outer;
      }
      else if (payload.ok === false || payload.saved === false || payload.deleted === false || payload.alreadyLive === true
        || payload.outcomeUnknown === true || result.isError === true
        // A reply that names what moved and moved nothing is understood, not unread.
        || (Array.isArray(payload.changed) && payload.changed.length === 0)) understood = true;
    }
  }
  const creates = new Set(changes.filter((row) => row.operation === 'create').map((row) => `${row.entityClass}:${row.entityId}`));
  const unique = new Map();
  for (const row of changes) {
    if (row.operation === 'update' && creates.has(`${row.entityClass}:${row.entityId}`)) continue;
    unique.set(`${row.entityId}:${row.operation}`, row);
  }
  return { changes: [...unique.values()], unclassified: understood ? 0 : 1, skipped, unregistered: 0 };
}

// The kinds a `solution_linked_assets` row can hold, by the class a change names.
const LINKED_KINDS = Object.freeze({ object: 'object', automation: 'automation', app: 'app', ai_agent: 'ai-agent', connection: 'connection' });

/** The entities a successful tool call created that a solution lists, as `{ kind, id }` refs. */
export function createdEntityRefs(input) {
  return extractEntityChanges(input).changes
    .filter((row) => row.operation === 'create' && Object.hasOwn(LINKED_KINDS, row.entityClass))
    .map((row) => ({ kind: LINKED_KINDS[row.entityClass], id: row.entityId }));
}
