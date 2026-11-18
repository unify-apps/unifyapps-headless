// Which tenant write calls must name the version they were built from. A tool
// that changes an existing item takes `expectedVersion` (or `expectedVersions`,
// one per item, or the older name `version`) and refuses when the stored
// version has moved, so a save built from an old read never wipes out a change
// someone else made since. The tool cannot refuse a call that leaves the
// version out, because the platform's own agents still call it that way. The
// bridge can: a call that changes an existing item and names no version is
// refused before it is sent.
//
// A rule counts only when the tenant's own schema for that tool has the input,
// so a tenant that does not serve it yet keeps working. Rules go by tool name,
// and the same name on another server is checked against that server's schema.
// Creates, dry runs and the tools where an update cannot be told from a first
// save (save_env_variables, set_guardrails, the namespace and metadata-field
// saves, connector authentications, save_api_settings, save_connector_settings,
// the context-graph source scope and discovery, and the theme saves
// set_app_theme, set_theme_typography, set_theme_custom_css,
// set_theme_component_variants and set_theme_component_style) are not listed;
// neither are the tools whose own schema already requires the version. A theme
// save takes the app id, and nothing in its arguments says whether the app
// already owns a theme or is about to fork the shared one — only get_app_theme's
// `ownedByApp` does, and that is a read this file cannot make. Requiring a
// version here refuses every first theme save. Pure: no files, no network.

const list = (value) => (Array.isArray(value) ? value : []);
const named = (value) => typeof value === 'string' && value.trim() !== '';
const isVersion = (value) => Number.isInteger(value) && value >= 0;
// A code app's version is the commit at the head of its branch.
const isCommit = named;

// A rule answers the inputs a call is missing, as paths. `inputs` are the keys
// it needs in the tool's schema, top level or inside one list's items.

/** One version for the call, always, or only when `id` names an existing item. */
const one = (id, key = 'expectedVersion', given = isVersion) => ({
  inputs: [key],
  missing: (args) => ((id === null || named(args[id])) && !given(args[key]) ? [key] : []),
});

/** One version on each item of `listKey` that names an existing item by `id` (every item when `id` is null). */
const each = (listKey, id, key = 'expectedVersion') => ({
  inputs: [`${listKey}[].${key}`],
  missing: (args) => list(args[listKey]).flatMap((item, at) =>
    (id === null || named(item?.[id])) && !isVersion(item?.[key]) ? [`${listKey}[${at}].${key}`] : []),
});

/** An `expectedVersions` entry for every id `ids(args)` names. */
const versions = (ids, key = 'expectedVersions') => ({
  inputs: [key],
  missing: (args) => {
    const map = args[key] && typeof args[key] === 'object' ? args[key] : {};
    const wanted = [...new Set(ids(args).filter(named))];
    if (wanted.length === 0) return map && Object.keys(map).length ? [] : [`${key} (one entry per item you change)`];
    return wanted.filter((id) => !isVersion(map[id])).map((id) => `${key}.${id}`);
  },
});

/** An `expectedVersions` map on each item of `listKey` that names an existing item by `id`. */
const eachVersions = (listKey, id) => ({
  inputs: [`${listKey}[].expectedVersions`],
  missing: (args) => list(args[listKey]).flatMap((item, at) => {
    if (!named(item?.[id])) return [];
    const map = item.expectedVersions;
    return map && typeof map === 'object' && Object.values(map).some(isVersion) ? [] : [`${listKey}[${at}].expectedVersions`];
  }),
});

const pageIdsOf = (args) => list(args.edits).map((edit) => edit?.pageId);
// The objects a batch changes that it did not create itself.
const batchObjectIds = (args) => {
  const created = new Set(list(args.steps).filter((step) => step?.tool === 'create_object').map((step) => step?.args?.id));
  return list(args.steps).filter((step) => step?.tool !== 'create_object').map((step) => step?.args?.objectId).filter((id) => !created.has(id));
};

export const VERSIONED_UPDATES = Object.freeze({
  // application-builder: pages and data sources
  apply_page_edits: versions((args) => [args.pageId]),
  update_pages: versions(pageIdsOf),
  update_page_contracts: versions(pageIdsOf),
  update_data_sources: versions((args) => list(args.edits).map((edit) => edit?.id)),
  update_event_actions: versions(() => []),
  update_page_paths: versions((args) => [args.interfaceId]),
  move_entities: versions((args) => list(args.items).map((item) => item?.toPageId)),
  copy_entities: versions((args) => list(args.items).map((item) => item?.toPageId)),
  // application-builder: the app record, publish and governance
  update_app_settings: one(null),
  set_app_visibility: one(null),
  apply_navigation_edits: one(null),
  set_navigation_style: one(null),
  apply_permission_edits: one(null),
  move_interface_to_package: one(null),
  publish_app: one(null),
  apply_user_edits: one('userId'),
  apply_team_edits: one('teamId'),
  apply_role_edits: one('roleId'),
  apply_role_permission_edits: one(null),
  apply_role_platform_permission_edits: one(null),
  apply_role_connector_permission_edits: one(null),
  apply_role_entity_type_permission_edits: one(null),
  // object
  apply_object_batch: { inputs: ['expectedVersions'], missing: (args) => (batchObjectIds(args).length ? versions(batchObjectIds).missing(args) : []) },
  apply_record_edits: { inputs: ['edits[].expectedVersion'], missing: (args) => list(args.edits).flatMap((edit, at) => (edit?.op === 'update' && named(edit.recordId) && !isVersion(edit.expectedVersion) ? [`edits[${at}].expectedVersion`] : [])) },
  save_entity_records: { inputs: ['edits[].expectedVersion'], missing: (args) => list(args.edits).flatMap((edit, at) => (edit?.op === 'update' && !isVersion(edit.expectedVersion) ? [`edits[${at}].expectedVersion`] : [])) },
  // automation-code
  compile_and_save_workflow: one('workflowId'),
  deploy_workflow: one(null),
  // agent-builder
  update_agent: one(null),
  update_tools: each('tools', null),
  save_skill: one('skillId'),
  save_task: one('taskId'),
  update_knowledge: each('items', null),
  save_knowledge_sets: each('knowledgeSets', 'knowledgeSetId'),
  publish_agent: one(null),
  // app-testing
  update_test_case: one(null),
  update_element: one(null),
  update_test_suite: one(null),
  update_test_plan: one(null),
  deliver_steps: one('testCaseId'),
  // connection and solution
  update_connection: one(null),
  update_solution: one(null),
  save_solution_record: one('id', 'version'),
  // evaluation keeps its older name, `version`
  update_dataset: one(null, 'version'),
  apply_experiment_edits: each('edits', 'experimentId', 'version'),
  update_metrics: each('metrics', null, 'version'),
  set_experiment_schedules: each('schedules', null, 'version'),
  // api-gateway
  save_api: one('apiId'),
  save_api_group: one('groupId'),
  save_policy: one('policyId'),
  save_client: one('clientId'),
  save_access_profile: one('profileId'),
  // connectors-sdk
  save_connector: one('connectorId'),
  save_connector_action: eachVersions('actions', 'actionId'),
  save_connector_trigger: eachVersions('triggers', 'triggerId'),
  publish_connector: one(null),
  // changeset and code-builder
  save_changeset: one('id'),
  send_changeset: one(null),
  export_changeset: one(null),
  update_code_app_settings: one(null),
  publish_code_app: one(null, 'expectedHead', isCommit),
  // context-graph rules that may be created or changed by the same tool
  save_context_graph_node_match_rule: one('ruleId'),
  save_context_graph_node_data_quality_rule: one('ruleId'),
  set_context_graph_node_match_rule_active: one(null),
});

// Whether the tool's schema has `path` ("key", or "listKey[].key").
function schemaHas(schema, path) {
  const [head, rest] = path.split('[].');
  const property = schema?.properties?.[head];
  if (!property) return false;
  if (rest === undefined) return true;
  const items = property.items ?? {};
  return [items, ...(items.oneOf ?? items.anyOf ?? [])].some((shape) => Boolean(shape?.properties?.[rest]));
}

/**
 * The refusal text for a call that changes an existing item without the version
 * it read, or null when the call may go. `schema` is the tenant's input schema
 * for the tool; without one, or without the input in it, nothing is required.
 */
export function missingVersionProblem(name, args, schema) {
  const rule = Object.hasOwn(VERSIONED_UPDATES, name) ? VERSIONED_UPDATES[name] : null;
  const a = args && typeof args === 'object' ? args : {};
  if (!rule || a.dryRun === true || !schema || !rule.inputs.every((input) => schemaHas(schema, input))) return null;
  const missing = rule.missing(a);
  if (missing.length === 0) return null;
  return `VERSION_REQUIRED: ${name} was not sent. It changes an item that already exists, but names no version for ${missing.join(', ')}. `
    + 'Pass the version you read the item at, as the tool\'s description of that input says where to find it. '
    + 'Without it the save could wipe out a change someone else made after you read it. '
    + 'When the tool then answers "Version changed", read the item again and redo only your change.';
}
