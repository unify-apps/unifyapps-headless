// One folder works in one tenant workspace. This file holds both halves of that:
// what a create carries so the new item lands in the solution's workspace, and
// which write is refused because the item it names lives in another workspace.
//
// Both halves are lists of tool names, because the workspace is not a field an
// agent can be trusted to remember: a create that leaves it out lands in Global,
// and an update that leaves it out MOVES the item to Global. The lists are
// checked against the live tool list by this repo's own checks.
//
// A kind whose record does not answer with its workspace is not gated: a refusal
// built on a read that could not say would block work that is allowed. Those
// kinds are listed in `UNCHECKED_KINDS` so the gap is visible rather than
// implied.

/**
 * A create that takes the workspace, and the argument it takes it as. Every name
 * here is a live tool input, checked by the gate checks in
 * `scripts/smoke-test.mjs`, because a key that does not exist is dropped by the
 * tool and the item lands in Global with nothing saying so.
 */
export const WORKSPACE_CREATE_ARGS = Object.freeze({
  create_app: 'projectId',
  create_global_module: 'projectId',
  create_package: 'projectId',
  create_code_app: 'projectId',
  apply_object_batch: 'project',
  save_api_group: 'workspaceId',
  save_client: 'workspaceId',
  save_api_settings: 'workspaceId',
});

/**
 * A create that carries the workspace on each item of a list instead. `existing`
 * is the key that marks an item as one that already exists: it keeps its own
 * workspace, and `save_knowledge_sets` takes the field only on a new set.
 *
 * `save_env_variables` is deliberately absent. Its workspace also sits per
 * variable, but the tool REFUSES a `workspaceId` on a variable that exists
 * ("a variable never moves to another workspace here"), and a save carries new
 * and existing variables together, so filling it in here would refuse saves that
 * work today. A new variable's workspace is passed by the caller.
 */
export const WORKSPACE_CREATE_ITEMS = Object.freeze({
  save_knowledge_sets: { list: 'knowledgeSets', key: 'projectId', existing: 'knowledgeSetId', numeric: false },
});

/**
 * A write that names an existing item, and where to read that item's workspace.
 *
 * `arg` is the argument holding the id; `path` builds the entity read. Only kinds
 * whose record carries `projectId` are here — checked live on a tenant for apps,
 * objects and automations.
 */
export const WORKSPACE_WRITE_TARGETS = Object.freeze({
  apply_page_edits: { arg: 'interfaceId', kind: 'app' },
  create_pages: { arg: 'interfaceId', kind: 'app' },
  create_data_sources: { arg: 'interfaceId', kind: 'app' },
  update_app_settings: { arg: 'appId', kind: 'app' },
  apply_navigation_edits: { arg: 'appId', kind: 'app' },
  set_navigation_style: { arg: 'appId', kind: 'app' },
  update_event_actions: { arg: 'interfaceId', kind: 'app' },
  set_app_theme: { arg: 'appId', kind: 'app' },
  set_theme_typography: { arg: 'appId', kind: 'app' },
  publish_app: { arg: 'appId', kind: 'app' },
  delete_object: { arg: 'objectId', kind: 'object' },
  compile_and_save_workflow: { arg: 'workflowId', kind: 'automation' },
  deploy_workflow: { arg: 'workflowId', kind: 'automation' },
  push_code_patch: { arg: 'appId', kind: 'app' },
  publish_code_app: { arg: 'appId', kind: 'app' },
});

/** Kinds whose record has not been shown to carry its workspace, so no write on one is gated yet. */
export const UNCHECKED_KINDS = Object.freeze(['ai agent', 'context graph', 'test suite', 'connector', 'API policy']);

/** The entity read that answers one kind's workspace. */
export function workspaceReadPath(kind, id) {
  const value = encodeURIComponent(String(id));
  if (kind === 'app') return `/api/entity/e_interface/${value}`;
  if (kind === 'object') return `/api/entity-type?entityType=${value}`;
  if (kind === 'automation') return `/api/workflow-definition/${value}`;
  return null;
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The create arguments with this folder's workspace filled in.
 *
 * A workspace the caller named is kept: a builder that was told to put something
 * somewhere specific is not overruled here, and the gate below refuses it if it
 * is the wrong workspace. Global adds nothing, because Global is the absence of a
 * workspace everywhere in the platform.
 */
export function withWorkspace(name, args, workspaceId) {
  if (!isObject(args) || !workspaceId || Number(workspaceId) === 0) return args;
  const items = WORKSPACE_CREATE_ITEMS[name];
  if (items) {
    const list = args[items.list];
    if (!Array.isArray(list)) return args;
    return { ...args, [items.list]: list.map((item) => (isObject(item) && !item[items.existing]
      && (item[items.key] === undefined || item[items.key] === null || item[items.key] === '')
      ? { ...item, [items.key]: items.numeric ? Number(workspaceId) : String(workspaceId) } : item)) };
  }
  const key = WORKSPACE_CREATE_ARGS[name];
  if (!key) return args;
  if (args[key] !== undefined && args[key] !== null && args[key] !== '') return args;
  // `create_app` and friends take a number; the object batch takes an id or a name.
  const value = key === 'project' ? String(workspaceId) : Number(workspaceId);
  return { ...args, [key]: value };
}

/** The steps of an object batch that change an object that already exists. */
const BATCH_EDIT_TOOLS = new Set(['apply_object_edits', 'update_object_settings']);

/**
 * Every existing item a write names, each with where to read its workspace.
 *
 * Usually one. An object batch is the exception: it can edit several objects in
 * one call, and those edits are exactly the writes that were proven to move an
 * object out of its workspace, so each one is checked.
 */
export function writeTargets(name, args) {
  if (!isObject(args)) return [];
  if (name === 'apply_object_batch') {
    const steps = Array.isArray(args.steps) ? args.steps : [];
    const ids = new Set();
    for (const step of steps) {
      if (!isObject(step) || !BATCH_EDIT_TOOLS.has(step.tool)) continue;
      const id = isObject(step.args) ? step.args.objectId : undefined;
      if (typeof id === 'string' && id.trim()) ids.add(id.trim());
    }
    return [...ids].map((id) => ({ kind: 'object', id, path: workspaceReadPath('object', id) }));
  }
  const target = WORKSPACE_WRITE_TARGETS[name];
  if (!target) return [];
  const id = args[target.arg];
  if (typeof id !== 'string' || !id.trim()) return [];
  return [{ kind: target.kind, id: id.trim(), path: workspaceReadPath(target.kind, id.trim()) }];
}

/** The one existing item a write names, or null when it names none this gate can read. */
export function writeTarget(name, args) {
  return writeTargets(name, args)[0] ?? null;
}

/** One workspace id as it is compared: Global, however it is spelled, is `0`. */
const workspaceKey = (workspaceId) => {
  const value = String(workspaceId ?? '').trim();
  return !value || Number(value) === 0 ? '0' : value;
};

/**
 * Whether a write on an item in `itemWorkspace` is allowed from a solution in
 * `solutionWorkspace`.
 *
 * A solution IN a workspace works on that workspace and nothing else: not another
 * workspace, and not an item that belongs to no workspace.
 *
 * A solution in NO workspace works on everything. Global is not a container
 * beside the workspaces, it is the view without one: the screens at `/p/0` list
 * every workspace's items as well as the ones in none (thousands of apps against
 * a handful for one workspace, measured on a tenant), so a folder opened there
 * reaches exactly what the person reaches.
 */
export function workspaceAllows(solutionWorkspaceId, itemWorkspaceId) {
  if (workspaceKey(solutionWorkspaceId) === '0') return true;
  return workspaceKey(solutionWorkspaceId) === workspaceKey(itemWorkspaceId);
}

/**
 * The creates that make a top-level asset and cannot say which workspace it goes
 * in, so it lands in Global.
 *
 * With one workspace exactly, an asset in Global is one this solution could
 * never change again, so these are refused up front rather than leaving a half
 * built thing nothing can finish. Each one is a live tool name with no
 * `projectId`, `workspaceId` or `project` input. Children of something that does
 * carry a workspace (a page of an app, an action of a connector, an API of a
 * group) are not here: they inherit their parent's.
 */
export const WORKSPACE_UNPLACEABLE_CREATES = Object.freeze([
  'create_agent',
  'create_context_graph',
  'create_connection',
  'create_dataset',
  'create_experiments',
  'create_metrics',
  'create_test_plan',
  'create_test_suite',
  'save_connector',
  'save_policy',
]);

/** Whether this create would land its asset in Global, with no way to say otherwise. */
export function landsOutsideWorkspace(name) {
  return WORKSPACE_UNPLACEABLE_CREATES.includes(name);
}
