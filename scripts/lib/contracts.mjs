/** Shared UnifyApps Headless v3 contracts. Every function in this module is pure. */
import { specSections, markdownLines } from './spec-markdown.mjs';
import { assessRequirements, placeholderIn } from './spec-requirements.mjs';
import { pageDesignProblem, readDesignBlocks, readJobLines, readLookLines, readStateLines } from './page-jobs.mjs';
import { graphContractProblem, graphPlanProblem } from './graph-contract.mjs';

export const ENTITY_TYPES = Object.freeze({
  SOLUTION: "e_solution",
  PLAN: "solution_builder_plan",
  SPEC: "solution_spec",
  DOCUMENT: "solution_document",
  SESSION: "nebula_session",
  LINKED_ASSET: "solution_linked_assets",
});
/** The record types UnifyApps Headless keeps per solution. A tenant that lacks any of them stores the whole lifecycle locally. */
export const LIFECYCLE_TYPES = Object.freeze(Object.values(ENTITY_TYPES));
// Every e_solution UnifyApps Headless creates carries this tag, so the platform can tell UnifyApps Headless's solutions from its own.
export const SOLUTION_TAG = "UnifyApps Headless";
export const SOLUTION_ID = /^e_[a-z0-9]+$/;
/** The surface a reported issue belongs to, and what each one covers.
 *
 * One closed list, because the whole point of a family is that two agents
 * reporting the same kind of issue land in the same bucket: a free-form slug
 * would let them label one issue two ways, and the batch that groups by family
 * would never compare them. Growing the list is a change here, never a guess
 * at the call site. It is a coarse bucket and never an identity — two unrelated
 * issues share a family, so a family only bounds what a fixer has to read.
 *
 * `miscellaneous` is the honest answer when nothing fits, and it is the one
 * family that must name a suggested family of its own: that is how the list
 * learns what it is missing. */
export const ISSUE_FAMILIES = Object.freeze({
  "automation": "Compiler schemas, callable defaults, sandbox behavior, run inspection, deployment",
  "app-page": "Page functions, form edits, localization, layout, preview behavior",
  "guidance-planning": "Contradictory instructions, incorrect proof requirements, plan revisions",
  "object-data": "Filters, lookups, unique indexes, partial bulk writes",
  "tooling-transport": "Oversized replies, missing tools, output files, malformed CLI output",
  "agent-ai": "Agent capabilities, publishing, instructions, response schemas",
  "session-cli": "Stale cache, entity context, CLI input/output differences",
  "auth-permissions": "Auto-mode refusals, relayed approval not recognized",
  "miscellaneous": "Nothing above fits. Name the family it should have with --suggested-family",
});
export const MISC_FAMILY = "miscellaneous";
/** Where a report stands with whoever is fixing it. The daily fixer filters on
 * this and on `family`, so both are top-level fields and never keys inside
 * `transcriptStats`: a Storage fetch filters server-side only on plain field
 * names, and a filter shape it does not understand is ignored with no error —
 * which would answer the wrong set rather than fail. The fixer's own prose and
 * its PR link are read only after that filter has already narrowed the set, so
 * those may live wherever is convenient.
 *
 * `reported` is the only value this plugin writes. Every other value is the
 * fixer's to set, and the list is here so both sides spell them the same. */
export const RESOLUTION_STATUSES = Object.freeze([
  "reported",      // saved by /ua:give-feedback; nothing has looked at it
  "in_progress",   // a fixer has claimed it this run
  "in_review",     // a fix PR is open; not merged
  "done",          // the fix is merged on the default branch
  "duplicate",     // the same issue is already reported, in review or done
  "already_fixed", // the code no longer has it; the reporter was on an older version
  "needs_human",   // not decidable from the code, or no safe fix
  "cancelled",     // not relevant any more, or holds nothing a fixer can act on
]);
export const INITIAL_RESOLUTION = "reported";

/** The classification, as the labelled lines that open a report's remarks.
 *
 * `nebula_session` declares no column for a family, a suggested family or a
 * plan, and the platform drops an undeclared key while still answering
 * created — so storing them as columns would lose them silently. They go in
 * the remarks instead, as lines a reader and a parser can both take: the daily
 * fixer reads `Family:` out of `properties_remarks` to group by.
 *
 * One line each, no blank values, always in this order, always first. */
export function classificationLines({ family, suggestedFamily, planId } = {}) {
  return [
    family && `Family: ${family}`,
    suggestedFamily && `Suggested-Family: ${suggestedFamily}`,
    planId && `Plan: ${planId}`,
  ].filter(Boolean).join("\n");
}

/** The classification back out of a report's remarks, for whoever reads one. */
export function parseClassification(remarks) {
  const text = typeof remarks === "string" ? remarks : "";
  const one = (label) => text.match(new RegExp(`^${label}:[ \\t]*(.+)$`, "mu"))?.[1]?.trim() || undefined;
  const family = one("Family");
  return {
    ...(family && Object.hasOwn(ISSUE_FAMILIES, family) && { family }),
    ...(one("Suggested-Family") && { suggestedFamily: one("Suggested-Family") }),
    ...(one("Plan") && { planId: one("Plan") }),
  };
}

export const FAMILY_NAMES = Object.freeze(Object.keys(ISSUE_FAMILIES));

/** The family a report is filed under, checked against the one list.
 * Throws USAGE rather than filing an unclassified or misspelt report. */
export function issueClassification({ family, suggestedFamily } = {}) {
  const name = String(family ?? "").trim();
  if (!name) throw new UaError("USAGE", `A report needs --family, one of: ${FAMILY_NAMES.join(", ")}.`);
  if (!Object.hasOwn(ISSUE_FAMILIES, name)) {
    throw new UaError("USAGE", `Unknown family ${JSON.stringify(name)}. Use one of: ${FAMILY_NAMES.join(", ")}.`);
  }
  const suggested = String(suggestedFamily ?? "").trim().slice(0, 200);
  if (name === MISC_FAMILY && !suggested) {
    throw new UaError("USAGE", `--family ${MISC_FAMILY} needs --suggested-family, a short name for the family it should have.`);
  }
  if (name !== MISC_FAMILY && suggested) {
    throw new UaError("USAGE", `--suggested-family belongs only to --family ${MISC_FAMILY}; ${name} is already a family.`);
  }
  return { family: name, ...(suggested && { suggestedFamily: suggested }) };
}

// Where lifecycle records live: on the tenant, or in the workspace store when the tenant cannot hold them.
export const STORAGES = Object.freeze(["platform", "local"]);
export function normalizeStorage(value, { required = false } = {}) {
  const storage = String(value ?? "").trim().toLowerCase();
  if (!storage && !required) return null;
  if (!STORAGES.includes(storage)) throw new UaError("USAGE", "Storage must be platform or local.");
  return storage;
}
export const PLAN_STATUSES = Object.freeze(["planned", "in_progress", "implemented", "failed", "interrupted"]);
// Zen thinks deeply (full spec, checklist, review). Sonic reads, writes one brief, asks once, builds.
export const MODES = Object.freeze(["zen", "sonic"]);
export function normalizeMode(value, { required = true } = {}) {
  const mode = String(value ?? "").trim().toLowerCase();
  if (!mode && !required) return null;
  if (!MODES.includes(mode)) throw new UaError("USAGE", "Mode must be zen or sonic.");
  return mode;
}
// The mode is kept only on spec and plan records, so it is always set:
// sonic by default, zen for a /ua:plan plan. No rule branches on it.
export const DEFAULT_MODE = "sonic";
// Spec records made before one plan format: a Sonic brief (`## Goal`,
// `## Changes`) keeps its own parser so it still plans and resumes. New text is
// always written with the spec headings.
export const SPEC_FORMATS = Object.freeze({ SPEC: "spec", BRIEF: "brief" });
export const specFormat = (meta = {}) => meta?.format ?? (meta?.mode === "sonic" ? SPEC_FORMATS.BRIEF : SPEC_FORMATS.SPEC);
const SONIC_HEADINGS = ["Goal", "Touches", "Changes", "Ready when"];
export const TASK_STATUSES = Object.freeze(["pending", "running", "done", "failed", "skipped"]);
export const AGENTS_BY_KIND = Object.freeze({
  object: "fde-agent", record: "fde-agent",
  automation: "automation-agent", "automation-shell": "automation-agent", deploy: "automation-agent",
  app: "app-agent", "page-layout": "app-agent", "page-bind": "app-agent", publish: "app-agent",
  "page-review": "page-reviewer",
  "ai-agent": "agent-builder",
  // The evaluation that grades an agent is built by the agent builder too.
  dataset: "agent-builder", metric: "agent-builder", experiment: "agent-builder",
  // API Platform work (API Groups, APIs, policies, clients, access profiles, settings) is the fde-agent's.
  api: "fde-agent",
  "code-app": "code-app-agent", "code-publish": "code-app-agent",
  // Environment variables are stored records the fde-agent writes on the object server.
  "env-variable": "fde-agent",
  // Custom connectors are built by the fde-agent on the connectors-sdk server.
  connector: "fde-agent",
  // Governance (users, teams, roles and what each role grants) is the fde-agent's too: a platform
  // entity that is neither an automation nor an app.
  governance: "fde-agent",
  graph: "graph-agent",
  manual: "user",
});
/** The agent that does a task. The kind decides it, except that a publish of
 * an AI agent goes to the agent builder: an app's publish is the app agent's. */
export const agentFor = (task) => (task?.kind === "publish" && task.entity?.kind === "ai-agent" ? "agent-builder" : AGENTS_BY_KIND[task?.kind]);

/** The kinds that release finished work: each waits until what it releases is
 * done, then for the person's yes when the plan asks first. A code-publish
 * publishes a Code Builder app. */
export const RELEASE_KINDS = Object.freeze(["deploy", "publish", "code-publish"]);
export const isRelease = (task) => RELEASE_KINDS.includes(task?.kind);
/** The word ## Ready when uses for a release task: deploy, or publish for an
 * app, an AI agent or a code app. */
export const releaseAction = (task) => (task?.kind === "deploy" ? "deploy" : isRelease(task) ? "publish" : null);

/**
 * A task waits for the person's yes through plan confirm before it is sent:
 * a release when the plan asks first, and a task that names what it deletes
 * (`deletes`) always, in both modes, so its builder never has to stop and ask.
 */
export function waitsForYes(task, askBeforeDeploy) {
  if (task.confirmedAt) return false;
  if (task.deletes) return true;
  if (!isRelease(task)) return false;
  return askBeforeDeploy?.covered ? !releaseCovered(task, askBeforeDeploy.covered) : !!askBeforeDeploy;
}

/** The release rule a stored spec or plan carries. `releaseYes` lists the
 * Ready when lines the preview showed by name when the person said yes; a
 * record from before it keeps its plain `askBeforeDeploy`. */
export function askPolicy(meta = {}) {
  if (meta.askBeforeDeploy === false) return false;
  return Array.isArray(meta.releaseYes) ? { covered: meta.releaseYes } : true;
}

/** A release the person's yes covers: the same action on the same Touches entry, by name or id. */
export function releaseCovered(task, covered = []) {
  const action = task.kind === "deploy" ? "deploy" : "publish";
  return covered.some((line) => line?.action === action && line.kind === task.entity?.kind &&
    ((!!norm(line.name) && norm(line.name) === norm(task.entity?.name)) || (!!line.id && !!task.entity?.id && String(line.id) === String(task.entity.id))));
}

// MCP tool names that delete an entity outright — an object, a record, a page,
// a data source, and so on — taken from the servers' own names in
// the live tool list. The builder's rules are made from this list
// (deleteGateText), so the two never differ. Deleting a block, a page
// variable, a page function or a folder is routine page editing, not deleting
// an entity, so those stay off this list. `apply_interface_version_diff`
// deletes no entity but overwrites an app with parts of another version, which
// cannot be undone either, so it is asked about the same way.
export const DELETE_TOOL_NAMES = Object.freeze([
  "delete_object", "delete_pages", "apply_interface_version_diff",
  "delete_data_sources", "delete_elements", "delete_test_cases",
  "delete_test_suites", "delete_test_plans",
  "delete_connection", "delete_solution", "delete_changeset",
  "delete_dataset", "delete_dataset_conversation", "delete_dataset_scenario",
  "delete_dataset_items", "delete_metrics", "delete_experiments",
  "delete_experiment_runs",
  "delete_api_group", "delete_api", "delete_policy", "delete_client", "delete_access_profile",
  "delete_env_variables",
  "delete_connector", "delete_connector_action", "delete_connector_trigger", "delete_connector_authentication",
  "delete_knowledge_sets",
  // Governance (Settings > Users, Teams and Roles). Listed before a tenant
  // serves the tools (the live-names check's § PENDING_TOOLS), on
  // purpose: these reach UnifyApps Headless through the application-builder bridge, which a
  // builder agent already holds, so the gate has to be closed the day they
  // deploy rather than one change later. A name on this list that no tenant
  // serves only ever refuses a call nothing can make yet.
  "delete_user", "delete_team", "delete_role",
  // Not a delete by name, but each destroys something for its holder outright
  // and cannot be undone: the old key for every caller at once, and the
  // password the user signs in with.
  "rotate_access_profile_key", "reset_user_password",
  // A mobile app's signing keys: a store refuses an update signed with other keys, so taking
  // them off the release service is gated like a delete.
  "remove_app_signing_keys",
  // The context-graph server: a graph, its types, a source, a node's rules,
  // graph records, and the workflow tests it composes.
  "delete_context_graph", "delete_context_graph_node", "delete_context_graph_edge",
  "delete_context_graph_source",
  "delete_context_graph_node_match_rule", "delete_context_graph_node_data_quality_rule",
  "delete_context_graph_records", "delete_test",
]);

// The only tools a tenant bridge passes on for a folder that is connected to a
// tenant with no solution open (`solution connect`). Reads only, by server, from
// the live tool list, and a test checks every name
// is live and none reads like a write. A tool not named here is refused, so a
// tool the tenant adds later stays closed until someone reviews it. Left out on
// purpose: `run_lookup`, `run_connector_operation`, `get_csp` and
// `get_data_source_resource_shape` (they may call an outside
// system), `prepare_data_source` (it writes), `derive_matrix_url`, and
// `get_deployed_app_namespace` and `list_deployments` (reads, but their names
// hold "deploy", which the write-word check refuses).
export const TENANT_ONLY_READ_TOOLS = Object.freeze(Object.fromEntries(Object.entries({
  "application-builder": ["compare_interface_versions", "get_app_builder_knowledge", "get_app_builder_knowledge_map",
    "get_app_namespace", "get_app_overview", "get_app_theme", "get_blocks", "get_color_tokens", "get_context_keys",
    "get_country_code_options", "get_data_source_options", "get_data_source_output_schemas",
    "get_data_sources", "get_dependency_graph",
    "get_form_field_lookup_options", "get_form_field_validation_options", "get_icon_options", "get_interaction_options",
    "get_interface_version", "get_module_options", "get_navigation", "get_page_outlines", "get_page_paths",
    "get_permission_group_options", "get_slot_options", "get_style_options", "get_template_component_options",
    "get_theme_component_schema", "get_theme_options", "get_typography_size_options", "list_app_namespaces",
    "list_form_fields", "list_interface_versions", "search_app"],
  object: ["describe_entity", "find_users_and_groups", "get_app_builder_knowledge", "get_entity_records", "get_objects",
    "get_records", "search"],
  "automation-code": ["describe_callable_workflow", "describe_storage_object", "fetch_storage_records",
    "find_workflow_examples", "get_code_sandbox_restrictions", "get_connection_schema", "get_dsl_reference",
    "get_operation_schema", "get_workflow_dependencies", "inspect_workflow_run", "list_apps", "list_connections",
    "list_workflow_runs", "open_workflow", "search_operations", "search_workflows"],
  "agent-builder": ["check_knowledge_status", "describe_entity", "find_users_and_groups", "get_agent", "list_agents",
    "list_app_actions", "list_apps", "list_capabilities", "list_connections", "list_models",
    "list_tasks", "read_guardrails", "read_trace"],
  "app-testing": ["fetch_execution_failure_reasons", "fetch_failed_executions", "fetch_test_case_last_execution",
    "fetch_test_cases", "fetch_test_plans", "fetch_test_suites", "get_element", "get_test_case", "get_test_plan",
    "get_test_plan_execution", "get_test_suite", "get_test_suite_execution", "list_test_users", "search_elements"],
  connection: ["get_connection_schema", "list_connections"],
  solution: ["find_entity_solutions", "search_solutions"],
}).map(([server, names]) => [server, Object.freeze(new Set(names))])));

/** Whether a tenant-only bridge for `/mcp/<server>` may pass `name` on. */
export const isTenantOnlyRead = (server, name) => TENANT_ONLY_READ_TOOLS[server]?.has(name) === true;

/** How long a folder's tenant binding keeps another tenant out of the folder. */
export const TENANT_BINDING_HOLD_MS = 24 * 60 * 60 * 1000;

// One op of a write tool that also creates and changes. Its tool is not on the
// list above, because its other ops are routine. `step` names the step of a
// batch tool the op sits in (`steps[].tool`, its ops in `steps[].args.edits`);
// without it the ops are the call's own `edits`.
// - `apply_record_edits` `delete`: stored rows, by id or by filter. It took over
//   from `delete_records_by_filter`, which the object server stopped serving on
//   2026-10-06.
// - `apply_object_batch` `remove_fields`: a field. Stored rows keep the old
//   value, but no page, automation or read sees it again.
// - `update_page_paths` `delete`: a page's address, so every link to it breaks.
// Index ops stay off: an index holds no data and can be built again.
export const DELETE_OPS = Object.freeze([
  { tool: "apply_record_edits", op: "delete" },
  { tool: "apply_object_batch", step: "apply_object_edits", op: "remove_fields" },
  { tool: "update_page_paths", op: "delete" },
]);

// One value of one top-level input of a context-graph write tool whose other
// values are routine: a staged MDM `DELETE` event removes golden records, and a
// golden-record review `MERGE` or `REJECT` cannot be undone. `field` is the
// tool's real input name, so the rule a builder reads names an input that exists.
export const DELETE_VALUES = Object.freeze([
  { tool: "stage_mdm_records", field: "recordEventType", value: "DELETE", what: "Delete golden records through a staged MDM DELETE event" },
  { tool: "review_context_graph_matched_record", field: "type", value: "MERGE", what: "Merge a staged record into a golden record (cannot be undone)" },
  { tool: "review_context_graph_matched_record", field: "type", value: "REJECT", what: "Reject a staged record (cannot be undone)" },
  { tool: "review_context_graph_rejected_records", field: "requestType", value: "REJECT", what: "Reject rejected records for good (cannot be undone)" },
].map((entry) => Object.freeze(entry)));

/**
 * The delete gate as the builder's rules state it, made from the two lists
 * above so the prose and the code never differ. Every call through these
 * tools and ops needs the person's yes first, with no exception for rows the
 * task's own steps created: `destructiveCall` in destructive.mjs gates every
 * one of them the same way, and the only call it ever lets through unasked is
 * `dryRun: true`, which deletes nothing.
 */
export function deleteGateText() {
  const ops = DELETE_OPS.map(({ tool, step, op }) => `\`${tool}\` with ${step ? `a \`${step}\` step holding ` : ""}op \`${op}\``);
  const values = DELETE_VALUES.map(({ tool, field, value }) => `\`${tool}\` with ${field} \`${value}\``);
  return [...DELETE_TOOL_NAMES.map((name) => `\`${name}\``), ...ops, ...values].join(", ");
}

/**
 * The bridge's refusal of a delete, until the person says
 * yes. The `(d_…)` id in the question is how the AskUserQuestion hook finds
 * the call to approve, so the router and the builders copy it as is.
 */
export const confirmRequiredText = (id, summary, { failedYes = false } = {}) =>
  `CONFIRM_REQUIRED (${id}): ${summary}. A delete cannot be undone. Ask the person with AskUserQuestion: put "${summary} (${id})" in the question text, exactly as written here, offer "Yes, go ahead" first and "No" second. Several deletes may share one question: list each one's "summary (id)" exactly, and a yes approves all of them only when every one is shown; a no drops them all. A builder agent reports this as needs_confirmation with this line. After a yes, make the exact same call again.`
  + (failedYes ? ' A yes was recorded for this id but the question did not quote the summary exactly, so it did not count — ask again with the text below, word for word.' : '');

const detail = (details, ...keys) => keys.map((key) => String(details?.[key] ?? "").trim());

export function errorMessage(code, details = {}) {
  if (code === "AUTH_EXPIRED") return `Signed out of ${detail(details, "host")[0]}. Sign in again to continue.`;
  if (code === "PERMISSION_REQUIRED") {
    const [host, tool, email] = detail(details, "host", "tool", "email");
    const who = email || "the signed-in person";
    return `${host} refused ${tool || "the call"}: you don't have access to this tool. UnifyApps Headless's tool calls there need the AGENT_LLM_TOOLS permission on ${who}'s role (VIEW to read, and CREATE, EDIT and DELETE to build, or ALL). UnifyApps Headless cannot tell from this refusal alone whether the role truly lacks it or the tenant just failed to read the role's permissions just then. If the role does not have it, a tenant admin must add it. Either way, if ${who} already holds it, the call can be sent once more after a minute.`;
  }
  if (code === "NOT_STARTED") return "Run /ua:setup first.";
  if (code === "NOT_FOUND") return `Not found on ${detail(details, "host")[0]}, or no access.`;
  if (code === "TENANT_MISMATCH") {
    const [urlHost, tenant] = detail(details, "urlHost", "tenant");
    return `That ${detail(details, "what")[0] || "solution"} is on ${urlHost}, not ${tenant}. Pick the tenant again or paste a URL on ${tenant}.`;
  }
  if (code === "FOLDER_SOLUTION_MISMATCH") {
    return "This folder is already associated with a solution. Please create a new folder somewhere else and start a Claude session in that. If you want to proceed, this will override everything about the previous folder.";
  }
  if (code === "NO_SOLUTION") return "No solution is open in this folder. Open or create one first.";
  if (code === "TENANT_BINDING_CONFLICT") {
    return `This folder is connected to ${detail(details, "tenant")[0]}. Use that tenant here, or use another folder.`;
  }
  if (code === "FOLDER_CONTENT_CONFLICT") {
    return "This folder already contains files UnifyApps Headless would need to manage. Please use a new folder so those files are not overwritten.";
  }
  if (code === "WORKSPACE_MISMATCH") {
    const [name, assetWorkspace, solutionWorkspace] = detail(details, "asset", "assetWorkspace", "solutionWorkspace");
    return `${name || "That item"} is in ${assetWorkspace || "another workspace"}, and this solution works in ${solutionWorkspace || "a different workspace"}. UnifyApps Headless works only on what is in its own workspace. Open a solution in ${assetWorkspace || "that workspace"}, in its own folder, to work on it.`;
  }
  if (code === "PLAN_INTERRUPTED") {
    return "This build stopped because the plan was interrupted.";
  }
  if (code === "PLATFORM_UNREACHABLE") {
    return `Cannot reach ${detail(details, "host")[0]} to record progress. Try again later; the plan can be continued.`;
  }
  if (code === "INVALID_SPEC" || code === "INVALID_PLAN") return String(details?.message ?? details?.reason ?? "Invalid content.");
  return String(details?.message ?? code);
}

export class UaError extends Error {
  constructor(code, message, details = {}) {
    const supplied = typeof message === "string" ? message : undefined;
    const resolvedDetails = supplied === undefined && message && typeof message === "object" ? message : details;
    super(supplied ?? errorMessage(code, resolvedDetails));
    this.name = "UaError";
    this.code = code;
    this.details = resolvedDetails;
  }
}

/** A tenant's workspaces (the platform calls them projects). A solution works in
 * exactly one of them. The workspace never travels in a payload: it is this
 * request header, and a request that leaves it off lands in Global — which is
 * why an edit that means to keep an item where it is still has to send it. */
export const WORKSPACE_HEADER = "x-ua-project-id";
/** Global is not a stored workspace. It is id 0, which the platform's own client
 * turns into "send no header at all"; a header of 0 matches nothing. */
export const GLOBAL_WORKSPACE_ID = "0";
export const GLOBAL_WORKSPACE_NAME = "Global";
/** The header value for one workspace, or undefined when nothing should be sent. */
export function workspaceHeaderValue(workspaceId) {
  const value = String(workspaceId ?? "").trim();
  if (!value || Number(value) === 0 || !/^\d+$/u.test(value)) return undefined;
  return value;
}
/** The workspace a request should carry, as headers to spread into a call. */
export function workspaceHeaders(workspaceId) {
  const value = workspaceHeaderValue(workspaceId);
  return value ? { [WORKSPACE_HEADER]: value } : {};
}


export function normalizeTenant(value) {
  const input = String(value ?? "").trim();
  if (!input) return "";
  if (/\\|@/u.test(input) || /:\/\//u.test(input) && !/^https?:\/\//iu.test(input)) {
    throw new UaError("USAGE", "Invalid tenant host.");
  }
  const authority = input.replace(/^https?:\/\//iu, "").split(/[/?#]/u, 1)[0];
  if (authority.includes(":")) throw new UaError("USAGE", "Invalid tenant host.");
  let url;
  try { url = new URL(/^https?:\/\//iu.test(input) ? input : `https://${input}`); }
  catch { throw new UaError("USAGE", "Invalid tenant host."); }
  const host = url.hostname.toLowerCase();
  if (!/^https?:$/u.test(url.protocol) || url.username || url.password || url.port || host.length > 253 ||
      !host.split(".").every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label))) {
    throw new UaError("USAGE", "Invalid tenant host.");
  }
  return host;
}

export function norm(value) {
  return String(value ?? "").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function refsMatch(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id) return String(a.id) === String(b.id);
  return a.kind === b.kind && !!norm(a.name) && norm(a.name) === norm(b.name) && sameApp(a, b);
}

// Two pages of one name in two apps are two pages. The app's name decides first,
// since an app id can change when a report finds the planned one taken. An
// entity that names no app matches any app.
function sameApp(a, b) {
  if (a.app && b.app) return norm(a.app) === norm(b.app);
  if (a.appId && b.appId) return String(a.appId) === String(b.appId);
  return true;
}

export function mergeRefs(...lists) {
  const result = [];
  for (const ref of lists.flat()) {
    if (!ref || !ref.kind || !norm(ref.name)) continue;
    const index = result.findIndex((item) => refsMatch(item, ref));
    if (index < 0) result.push({ ...ref });
    else result[index] = { ...result[index], ...ref, id: ref.id || result[index].id };
  }
  return result;
}

// An AI agent is linked, cached and refreshed the way an object or an automation
// is. Its platform type is `ai_agent` (`AGENT_ENTITY` in
// `scripts/platform/skills.mjs`); there is no `e_ai_agent`.
export function toLinkedEntity(ref) {
  if (!ref) return null;
  let type;
  let id = ref.id;
  if (ref.kind === "object") type = "ENTITY_TYPE";
  else if (ref.kind === "automation") type = "WORKFLOW_DEFINITION";
  // a code app has an interface record like any app; that record is what a solution lists
  else if (ref.kind === "app" || ref.kind === "code-app") type = "e_interface";
  else if (ref.kind === "ai-agent") type = "ai_agent";
  else if (ref.kind === "connection") type = "CONNECTION";
  else if (ref.kind === "skill") type = "e_skill_ai_agent";
  else if (ref.kind === "page") {
    type = "e_interface";
    id = ref.appId || ref.app?.id || ref.appInfo?.id;
  }
  if (!type || !id) return null;
  return { id: String(id), type, state: "COMPLETED" };
}

export function slug(value) {
  const words = String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").split("-").filter(Boolean);
  let output = "";
  for (const word of words) {
    const next = output ? `${output}-${word}` : word;
    if (next.length > 48) break;
    output = next;
  }
  return output || (words[0] || "item").slice(0, 48);
}

function decodeHtml(text) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", colon: ":", tab: "\t", newline: "\n" };
  return String(text).replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z]+);?/giu, (match, code) => {
    if (code[0] !== "#") return named[code.toLowerCase()] ?? match;
    const hex = code[1]?.toLowerCase() === "x";
    const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : match;
  });
}

function cssLoadsResource(css) {
  const normalized = String(css).replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/\\([0-9a-f]{1,6})(?:[\t\n\r\f ]|\r\n)?|\\([^\n\r\f])/giu, (_, hex, escaped) => {
      if (escaped) return escaped;
      const point = Number.parseInt(hex, 16);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    }).toLowerCase();
  return /@(?:import|namespace)\b|\b(?:url|(?:-webkit-)?image-set)\s*\(/u.test(normalized);
}

export function validateSpecHtml(html, { allowedScripts = [] } = {}) {
  if (typeof html !== "string" || !html.trim()) return "Visual HTML is empty.";
  // The one script a page may carry is the plugin's own: a plain <script> whose body is exactly an
  // allowed text, matched before anything is decoded (a decoded body would not compare). It is
  // taken out here, once; a second copy, any other script and every other tag below are refused.
  let stripped = html;
  if (allowedScripts.length) {
    const allowed = new Set(allowedScripts.map((text) => String(text).trim()));
    let seen = 0;
    stripped = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu, (whole, attrs, body) => {
      const plain = attrs.trim() === "" || /^type\s*=\s*["']?text\/javascript["']?$/iu.test(attrs.trim());
      if (!plain || !allowed.has(body.trim()) || ++seen > 1) return whole;
      return "";
    });
  }
  // Text inside a <code> element that holds no raw "<" is inert in a browser however it is
  // encoded, and the renderer escapes every code span, so a spec that mentions "<img src>" or
  // "<script>" in one is not read as markup here. The tag and its attributes are still checked.
  stripped = stripped.replace(/(<code\b[^>]*>)([^<]*)(<\/code\s*>)/giu, "$1$3");
  const source = decodeHtml(stripped).replace(/\0/gu, "");
  // Keep `>` inside quoted attribute values within the same tag. Otherwise a
  // harmless-looking alt value could hide a following resource attribute.
  for (const tag of source.match(/<(?:"[^"]*"|'[^']*'|[^'">])*>/gsu) ?? []) {
    const name = /^<\s*\/?\s*([a-z][\w:-]*)/iu.exec(tag)?.[1]?.toLowerCase();
    if (["script", "iframe", "object", "embed"].includes(name)) return `<${name}> is not allowed in the visual spec.`;
    if (["link", "base"].includes(name)) return `<${name}> is not allowed in the self-contained visual spec.`;
    // A broad attribute scanner is deliberate: malformed or quote-obfuscated
    // markup is rejected rather than passed to a browser for interpretation.
    const attrs = tag.slice((/^<\s*\/?\s*[a-z][\w:-]*/iu.exec(tag)?.[0] ?? "").length, -1);
    if (/(?:^|[\s/])on[a-z]+\s*=/iu.test(attrs)) return "Event-handler attributes are not allowed in the visual spec.";
    if (/(?:^|[\s/])srcset\s*=/iu.test(attrs)) return "srcset is not allowed in the self-contained visual spec.";
    if (name === "meta" && /(?:^|[\s/])http-equiv\s*=\s*(?:"\s*refresh\s*"|'\s*refresh\s*'|refresh(?:\s|\/|$))/iu.test(attrs)) {
      return "Meta refresh is not allowed in the visual spec.";
    }
    const inlineStyle = /(?:^|[\s/])style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu;
    for (const match of attrs.matchAll(inlineStyle)) if (cssLoadsResource(match[1] ?? match[2] ?? match[3])) {
      return "CSS resource loading is not allowed in the visual spec.";
    }
    const url = /(?:^|[\s/])(?:src|href|xlink:href|poster|background|action|formaction)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu;
    for (const match of attrs.matchAll(url)) {
      const value = decodeHtml(match[1] ?? match[2] ?? match[3]).replace(/[\u0000-\u0020\u007f]+/gu, "").toLowerCase();
      if (value && !value.startsWith('#')) return "External resource or navigation values are not allowed in the self-contained visual spec.";
    }
  }
  for (const match of source.matchAll(/<style\b[^>]*>([\s\S]*?)(?:<\/style\s*>|$)/giu)) {
    if (cssLoadsResource(match[1])) return "CSS resource loading is not allowed in the visual spec.";
  }
  return null;
}

function invalidSpec(message) { throw new UaError("INVALID_SPEC", message); }
function invalidPlan(message) { throw new UaError("INVALID_PLAN", message); }

// A plan with a problem in each of six tasks learned one problem per revise, so
// it cost six revises. `eachTask` checks every task and keeps the first problem
// each one has; `refuseAll` names them all in one refusal. A task keeps only its
// first, because the rules after it read the value that one broke. Problems are
// gathered inside one phase and never across two: a later phase reads what an
// earlier one guarantees, so a finding it made over a broken plan would be a guess.
function eachTask(tasks, check) {
  const problems = [];
  for (const [at, task] of tasks.entries()) {
    try { check(task, at); }
    catch (error) {
      if (error?.code !== "INVALID_PLAN") throw error;
      problems.push(error.message);
    }
  }
  return problems;
}

// One problem reads exactly as it always did. Several are counted and numbered:
// the CLI prints a message as one line, so a marker that survives being joined
// up beats a line break it loses.
function refuseAll(problems) {
  if (!problems.length) return;
  invalidPlan(problems.length === 1 ? problems[0]
    : `${problems.length} problems. Fix all of them at once: `
      + problems.map((problem, index) => `(${index + 1}) ${problem}`).join(" "));
}


// A layout builds the page itself; only its bind connects the page to backend work.
const BACKEND_KINDS = new Set(["object", "record", "automation", "automation-shell", "deploy", "ai-agent", "dataset", "metric", "experiment", "api", "env-variable", "connector"]);

/** What each builder can call: the servers on its agent file's `tools:` line,
 * and any one tool that line names as `mcp__plugin_ua_<server>__<tool>`.
 * `toolServers` maps each server to its tools (scripts/lib/tool-servers.json). */
export function toolAccess(agentFiles, toolServers) {
  const servers = new Map();
  for (const [server, tools] of Object.entries(toolServers ?? {})) {
    for (const tool of tools) servers.set(tool, [...(servers.get(tool) ?? []), server]);
  }
  const agents = {};
  for (const [agent, text] of Object.entries(agentFiles ?? {})) {
    const grants = { servers: new Set(), tools: new Set() };
    const line = /^tools:\s*(.+)$/mu.exec(String(text))?.[1] ?? "";
    for (const [, server, tool] of line.matchAll(/mcp__plugin_ua_([A-Za-z0-9-]+)(?:__([A-Za-z0-9_]+))?/gu)) {
      if (tool) grants.tools.add(tool);
      else grants.servers.add(server);
    }
    agents[agent] = grants;
  }
  return { servers, agents };
}

// A builder can call only the tools on its own servers, so a body or proof that
// names another builder's tool ("search_workflows" in an app-agent publish)
// cannot be carried out. A word that is no known tool is not checked. Every mention
// counts, a causal clause included: telling an instruction from an explanation
// would be a guess, and the error says how to reword it instead.
function foreignTool(text, agent, access) {
  const grants = access?.agents?.[agent];
  if (!grants) return null;
  for (const [tool] of String(text ?? "").matchAll(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gu)) {
    const on = access.servers.get(tool);
    if (!on || grants.tools.has(tool) || on.some((server) => grants.servers.has(server))) continue;
    return { tool, on };
  }
  return null;
}

// A total written by hand next to a list ("shows 17 fields" beside 16 names)
// drifts from the list, and the builder can never meet it. An object or record
// task says "every field the body lists" instead, so no count is written at all.
// Rows are left out: a seed of generated rows has a count and no list.
const HAND_COUNT = /\b\d+\s+(?:[A-Za-z_-]+\s+){0,2}?(?:fields?|columns?|indexes|indices|index)\b/iu;
const COUNTED_KINDS = new Set(["object", "record"]);

/** The ids one entity id field holds: a platform id is one word, so a comma,
 * semicolon or space means several ids were joined into it. */
export function idsIn(value) {
  return String(value ?? "").split(/[\s,;]+/u).filter(Boolean);
}

// True when `task` waits on any of `targets`, directly or through other tasks.
export function waitsOn(task, targets, byId) {
  const seen = new Set();
  const stack = [...task.dependsOn];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    if (targets.has(id)) return true;
    stack.push(...(byId.get(id)?.dependsOn ?? []));
  }
  return false;
}

// A code app's tasks share one checkout and one branch, and the engine refuses a
// publish while the branch is held, so a publish waits on every change of its app.
function checkCodePublishes(tasks, byId) {
  for (const publish of tasks.filter((task) => task.kind === "code-publish")) {
    const changes = tasks.filter((task) => task.kind === "code-app" && refsMatch(task.entity, publish.entity));
    const missing = changes.filter((task) => !waitsOn(publish, new Set([task.id]), byId));
    if (missing.length) invalidPlan(`${publish.id} code-publish publishes ${publish.entity.name.trim()} while ${missing.map((task) => task.id).join(", ")} still changes it. Make ${publish.id} depend on ${missing.length > 1 ? "them" : "it"}.`);
  }
}

// A shell creates the automation its logic task later fills in, so the
// logic task on the same automation must wait on the shell or both create it.
function checkShellChains(tasks, byId) {
  for (const shell of tasks.filter((task) => task.kind === "automation-shell")) {
    for (const logic of tasks.filter((task) => task.kind === "automation" && refsMatch(task.entity, shell.entity))) {
      if (!waitsOn(logic, new Set([shell.id]), byId)) {
        invalidPlan(`${logic.id} automation must depend on ${shell.id}, the automation-shell that creates ${shell.entity.name.trim()}.`);
      }
    }
  }
}

/** Two tasks on one page: the same page by id, or by name when one has no id
 * yet, and never two apps' pages of one name. */
export const samePage = (a, b) => refsMatch(a.entity, b.entity) && (!a.entity.app || !b.entity.app || norm(a.entity.app) === norm(b.entity.app));

// The task a page-review judges, of the same page it depends on: the page's
// bind when it waits on one (the page as users see it, with real data), else
// its layout.
const reviewedWork = (review, byId) => {
  const deps = review.dependsOn.map((id) => byId.get(id)).filter((dep) => dep && samePage(dep, review));
  return deps.find((dep) => dep.kind === "page-bind") ?? deps.find((dep) => dep.kind === "page-layout");
};

/** How a plan orders a page's review, by the `pageDesign` mark in its meta. */
export const PAGE_DESIGN = Object.freeze({ NONE: 0, REVIEW_BEFORE_BIND: 1, BIND_THEN_REVIEW: 2 });

// A page with a job is judged by a second agent that did not build it.
// Since BIND_THEN_REVIEW the review judges the bound page: the builder binds it
// right after its layout (in the same run when the data is ready), then the
// review sees what users see, and a fix goes back to that bind. A plan made
// under REVIEW_BEFORE_BIND keeps that order: the review waits on the layout,
// and every task that uses the layout waits on the review. A quality fix task
// (audit: true) is never the bind a review judges: plan audit adds it after the
// review, waiting on it, and no review judges the fix.
function checkPageReviews(tasks, byId, pageJobs, version) {
  for (const review of tasks.filter((task) => task.kind === "page-review")) {
    if (review.entity.kind !== "page" || !pageJobs.has(norm(review.entity.name))) {
      invalidPlan(`${review.id} page-review needs a page with a job line; ${review.entity.name.trim()} has none.`);
    }
  }
  for (const layout of tasks.filter((task) => task.kind === "page-layout" && pageJobs.has(norm(task.entity.name)))) {
    const page = layout.entity.name.trim();
    const bind = version >= PAGE_DESIGN.BIND_THEN_REVIEW
      ? tasks.find((task) => task.kind === "page-bind" && task.audit !== true && samePage(task, layout) && waitsOn(task, new Set([layout.id]), byId)) : null;
    const pageReviews = new Set(tasks.filter((task) => task.kind === "page-review" && samePage(task, layout)).map((task) => task.id));
    if (bind && waitsOn(bind, pageReviews, byId)) {
      invalidPlan(`${bind.id} page-bind waits on the page-review of ${page}, but the review judges the bound page: make ${bind.id} depend on ${layout.id}, and the page-review depend on ${bind.id}.`);
    }
    const judged = bind ?? layout;
    const review = tasks.find((task) => task.kind === "page-review" && reviewedWork(task, byId) === judged);
    if (!review) {
      invalidPlan(bind
        ? `${layout.id} page-layout builds ${page}, which has a job and is bound by ${bind.id}, so it needs a page-review task on ${page} that depends on ${bind.id}: a second agent judges the bound page, with real data, from its shots.`
        : `${layout.id} page-layout builds ${page}, which has a job, so it needs a page-review task on ${page} that depends on ${layout.id}: a second agent judges the page from its shots before anything builds on it.`);
    }
    if (!bind) {
      // A bind the layout itself waits on came first (a follow-up layout on a
      // page whose bind is done), so it cannot also wait on this layout's review.
      for (const pageBind of tasks.filter((task) => task.kind === "page-bind" && samePage(task, layout) && !waitsOn(layout, new Set([task.id]), byId))) {
        if (!waitsOn(pageBind, new Set([review.id]), byId)) invalidPlan(`${pageBind.id} page-bind must depend on ${review.id}, the page-review of ${page}.`);
      }
    }
    for (const user of tasks.filter((task) => task !== review && task !== bind && task.dependsOn.includes(layout.id))) {
      if (!waitsOn(user, new Set([review.id]), byId)) {
        invalidPlan(`${user.id} depends on ${layout.id}, the page-layout of ${page}, so it must also depend on ${review.id}, the page-review of ${page}: a review that asks for fixes sends ${layout.id} back to its builder.`);
      }
    }
    for (const publish of tasks.filter((task) => task.kind === "publish" && layout.entity.app && task.entity.kind === "app" && norm(task.entity.name) === norm(layout.entity.app))) {
      if (!waitsOn(publish, new Set([review.id]), byId)) invalidPlan(`${publish.id} publish must wait on ${review.id}, the page-review of ${page}.`);
    }
  }
}

// A new app's id becomes its sub-domain, so create_app takes only lowercase
// letters, digits and single hyphens, with no hyphen at either end.
export const APP_ID_PATTERN = /^(?!-)(?!.*--)[a-z0-9-]+(?<!-)$/u;

// A new app is a `## Touches` app line with no id. A task names an app by its
// page's `entity.app`, or by its entity when that is the app itself.
const appNamedBy = (entity) => (entity.kind === "page" ? entity.app : entity.kind === "app" ? entity.name : null);
// The new apps a builder creates. A new app whose every task is manual is made
// by the person (a code app, say), so no app task and no fixed id are asked for.
const newApps = (touches, tasks) => {
  const manualOnly = (name) => {
    const named = tasks.filter((task) => norm(appNamedBy(task.entity)) === name);
    return named.length > 0 && named.every((task) => AGENTS_BY_KIND[task.kind] === "user");
  };
  return new Map(touches.filter((ref) => ref.kind === "app" && !ref.id && !manualOnly(norm(ref.name))).map((ref) => [norm(ref.name), ref.name.trim()]));
};

// A new global module is an app whose app task says `entity.module: true`. The
// tool that creates one takes no id and answers the id it made, so the plan
// cannot fix it: the app task reports it, and its pages read it in Built so far.
const moduleApps = (tasks) => new Set(tasks.filter((task) => task.kind === "app" && task.entity?.module === true).map((task) => norm(task.entity.name)));

// The plan fixes a new app's id once (`app · <name> · new` in Touches), so every
// task of that app names the same id, a retry finds the app its first try made,
// and no builder invents one. A page carries it in `entity.appId`; the app task
// that creates the app, and a publish of it, in `entity.id`. A new global module
// is the one exception: no task names its id.
function checkNewAppIds(tasks, touches) {
  const planned = newApps(touches, tasks);
  const modules = moduleApps(tasks);
  const chosen = new Map();
  for (const task of tasks) {
    const app = appNamedBy(task.entity);
    if (!app || !planned.has(norm(app))) continue;
    const key = task.entity.kind === "page" ? "appId" : "id";
    const id = String(task.entity[key] ?? "").trim();
    if (modules.has(norm(app))) {
      if (id) invalidPlan(`${task.id} gives the new global module ${app.trim()} the id "${id}", but no one can choose a module's id: the platform makes it when its app task creates the module. Leave entity.${key} out; the app task reports the id, and every later task reads it in Built so far.`);
      continue;
    }
    if (!id) invalidPlan(`${task.id} is on the new app ${app.trim()}, so entity.${key} needs the app id this plan fixes for it, such as "${slug(app)}". A new global module takes no id: say entity.module: true on its app task instead.`);
    if (!APP_ID_PATTERN.test(id)) invalidPlan(`${task.id} app id "${id}" cannot be an app id: it becomes the app's sub-domain, so it takes lowercase letters, digits and single hyphens, such as "${slug(app)}".`);
    const earlier = chosen.get(norm(app));
    if (earlier && earlier.id !== id) invalidPlan(`${task.id} gives the new app ${app.trim()} the id "${id}", but ${earlier.task} gives "${earlier.id}". Fix the app id once and use it in every task of that app.`);
    chosen.set(norm(app), { id, task: task.id });
  }
}

// One app task creates a new app before any of its pages, so the layouts of
// that app wait on it and then build side by side. An app task on an app that
// already exists stores a look change, so it needs that app's id, and that
// app's layouts wait on it too, to build in the new look.
function checkAppTasks(tasks, byId, touches, settled = new Set()) {
  const planned = newApps(touches, tasks);
  for (const task of tasks.filter((item) => item.kind === "app" && !planned.has(norm(item.entity.name)))) {
    const known = touches.some((ref) => ref.kind === "app" && ref.id && norm(ref.name) === norm(task.entity.name));
    if (!task.entity.id && !known) {
      invalidPlan(`${task.id} app task is on ${task.entity.name.trim()}, which ## Touches does not mark new, so entity.id needs that app's id. For a new app, write "app · ${task.entity.name.trim()} · new" in ## Touches.`);
    }
  }
  // A publish releases what the app task stored, so it waits on it.
  for (const appTask of tasks.filter((item) => item.kind === "app")) {
    for (const publish of tasks.filter((item) => item.kind === "publish" && item.entity.kind === "app" && norm(item.entity.name) === norm(appTask.entity.name))) {
      if (!waitsOn(publish, new Set([appTask.id]), byId)) invalidPlan(`${publish.id} publish of ${publish.entity.name.trim()} must wait on ${appTask.id}, its app task.`);
    }
  }
  const naming = new Map();
  for (const task of tasks) {
    const app = norm(appNamedBy(task.entity));
    if (!planned.has(app)) continue;
    if (!naming.has(app)) naming.set(app, []);
    naming.get(app).push(task);
  }
  for (const [app, named] of naming) {
    const name = planned.get(app);
    const creators = named.filter((task) => task.kind === "app");
    if (!creators.length) {
      const id = named.map((task) => (task.entity.kind === "page" ? task.entity.appId : task.entity.id)).find(Boolean) ?? slug(name);
      invalidPlan(`${named.map((task) => task.id).join(", ")} ${named.length > 1 ? "are" : "is"} on the new app ${name}, and no task creates it. ` +
        `Add one app task, kind "app" with entity { "kind": "app", "name": "${name}", "id": "${id}" }, and make every page-layout of ${name} depend on it.`);
    }
    // A done (settled) creator already built the app; it is not competing with
    // a later app task that only stores a look change on what it already made.
    const unsettledCreators = creators.filter((task) => !settled.has(task.id));
    if (unsettledCreators.length > 1) {
      invalidPlan(`${unsettledCreators.map((task) => task.id).join(", ")} are app tasks on the new app ${name}, but only one may create it. Keep one, and make every page-layout of ${name} depend on it.`);
    }
  }
  for (const appTask of tasks.filter((item) => item.kind === "app")) {
    const name = appTask.entity.name.trim();
    const what = planned.has(norm(name)) ? "creates it" : "stores its look";
    const appId = appTask.entity.id ?? touches.find((ref) => ref.kind === "app" && ref.id && norm(ref.name) === norm(name))?.id;
    const ofApp = (task) => task.kind === "page-layout" && (norm(task.entity.app) === norm(name) ||
      (!!appId && !!task.entity.appId && String(task.entity.appId) === String(appId)));
    for (const layout of tasks.filter(ofApp)) {
      if (!waitsOn(layout, new Set([appTask.id]), byId)) {
        invalidPlan(`${layout.id} page-layout is on ${planned.has(norm(name)) ? "the new app " : ""}${name}, so it depends on ${appTask.id}, the app task that ${what}.`);
      }
    }
  }
}

/** The relation bullets a Contract heading may carry, the kinds each may name, and the words the page uses for them both ways. */
export const RELATIONS = Object.freeze({
  calls: { key: "Calls", kinds: ["automation", "ai-agent"], forward: "Calls", reverse: "Called by" },
  opens: { key: "Opens", kinds: ["page"], forward: "Opens", reverse: "Opened from" },
  reads: { key: "Reads", kinds: ["object", "dataset", "knowledge-set"], forward: "Reads", reverse: "Read by" },
  writes: { key: "Writes", kinds: ["object", "dataset"], forward: "Writes", reverse: "Written by" },
  uses: { key: "Uses", kinds: ["connection", "connector"], forward: "Uses", reverse: "Used by" },
});

/** "Submit invoice (Submit), Decide invoice" → [{ name, note }]: names split at commas outside parentheses, a parenthesis is the note. */
export function relationItems(text) {
  const out = [];
  let depth = 0, cur = "";
  const strip = (value) => String(value).trim().replace(/^["'`]+|["'`]+$/gu, "");
  const push = () => {
    const part = cur.trim(); cur = "";
    if (!part) return;
    const match = /^(.*?)\s*\(([^()]*)\)\s*$/u.exec(part);
    // `raw` keeps the item as typed: "Portal (beta)" is an entity's whole name before it is a name with a note.
    out.push(match ? { name: strip(match[1]), note: match[2].trim(), raw: strip(part) } : { name: strip(part), note: "", raw: strip(part) });
  };
  for (const ch of String(text ?? "")) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) push(); else cur += ch; }
  push();
  return out.filter((item) => item.name && !/^(none|nothing|—|-)$/iu.test(item.name));
}

/** The `### <kind> · <name>` blocks of a Contract: each heading with the lines under it, and the lines before the first heading. */
export function contractBlocks(contractLines) {
  const blocks = [], preamble = [];
  let current = null;
  for (const { line, code } of markdownLines((contractLines ?? []).join("\n"))) {
    const heading = code ? null : /^ {0,3}###\s+(?:([a-z_-]+)\s*·\s*)?(.+?)\s*$/iu.exec(line);
    if (heading) {
      // "### object · Invoice · OBJ_invoice" mirrors a Touches line: the last part may be the id, so both readings are kept.
      const rest = heading[2].trim(), parts = rest.split(/\s*·\s*/u);
      const names = [...new Set((parts.length > 1 ? [rest, parts.slice(0, -1).join(" · ")] : [rest]).flatMap((n) => [n, n.replace(/\s*\([^()]*\)\s*$/u, "").trim()]))];
      current = { kind: (heading[1] ?? "").toLowerCase(), name: names.at(-1), names, heading: rest, id: parts.length > 1 ? parts.at(-1).replace(/^["'`]+|["'`]+$/gu, "") : "", lines: [] };
      blocks.push(current); continue;
    }
    (current ? current.lines : preamble).push(line);
  }
  return { blocks, preamble };
}

/**
 * Why a relation bullet names something the spec does not have, or null. Each of `Calls`,
 * `Opens`, `Reads`, `Writes` and `Uses` may name only Touches entities of its kinds, so an arrow
 * on the page never points at nothing and a name typed wrong is caught where it was written.
 */
export function relationsProblem(contractLines, touches) {
  const { blocks, preamble } = contractBlocks(contractLines);
  const scopes = [
    { lines: preamble, loose: true },
    ...blocks.map((b) => ({ lines: b.lines, where: `under ### ${b.kind ? `${b.kind} · ` : ""}${b.heading}` })),
  ];
  const names = (item) => [norm(item.raw), norm(item.name)];
  for (const scope of scopes) {
    // A bullet inside a fenced or indented code block is an example, not a relation.
    for (const { line, code } of markdownLines(scope.lines.join("\n"))) {
      if (code) continue;
      const bullet = /^\s*[-*]\s+(Calls|Opens|Reads|Writes|Uses):\s*(.*)$/iu.exec(line);
      if (!bullet) continue;
      const word = bullet[1][0].toUpperCase() + bullet[1].slice(1).toLowerCase();
      const relation = RELATIONS[word.toLowerCase()];
      // A relation draws its arrow from the entity whose heading it sits under; one before the first heading belongs to nobody.
      if (scope.loose) return `"${word}: ${bullet[2].trim()}" sits before the first ### heading in ## Contract. Move it under the "### <kind> · <name>" heading of the entity it belongs to.`;
      for (const item of relationItems(bullet[2])) {
        const found = (t) => names(item).some((name) => norm(t.name) === name || (t.id && norm(t.id) === name));
        if (touches.some((t) => relation.kinds.includes(t.kind) && found(t))) continue;
        const other = touches.find(found);
        return other
          ? `"${word}: ${item.raw}" ${scope.where} names the ${other.kind} ${other.name}, but ${word} may name only ${relation.kinds.join(" or ")} entities from ## Touches.`
          : `"${word}: ${item.raw}" ${scope.where} names no entity in ## Touches. Add it there (kind · name · id) or take it off the line.`;
      }
    }
  }
  return null;
}

/**
 * Why `## Contract` lacks a heading for a Touches entity, or null. Every entity gets
 * `### <kind> · <name>` (or its id) with a one-line description under it; the visual
 * spec's change table is built from these, and a page and an automation that share a
 * name are told apart by the kind.
 */
export function contractHeadingsProblem(contractLines, touches) {
  const headings = contractBlocks(contractLines).blocks.filter((b) => b.kind).map((b) => ({ kind: b.kind, names: b.names.map(norm), id: norm(b.id) }));
  const matches = (h, t) => h.kind === t.kind && (h.names.includes(norm(t.name)) || (t.id && (h.names.includes(norm(t.id)) || h.id === norm(t.id))));
  const missing = touches.filter((t) => !headings.some((h) => matches(h, t)));
  if (!missing.length) return null;
  const first = missing[0];
  const who = missing.length === 1 ? `${first.name} has none` : `${missing.length} have none, starting with ${first.name}`;
  return `every Touches entity needs its own "### <kind> · <name>" heading with a one-line description under it; ${who}. Add "### ${first.kind} · ${first.name}" and describe it in one line.`;
}

/** `checkPageDesign` is for the commands that write a spec or brief: a spec
 * accepted before page designs had no job, design or look lines, and a plan
 * made from it must still parse. Only a title, `## Requested outcome`,
 * `## Touches` and `## Ready when` are required; a 12-row checklist, when the
 * spec has one, is assessed and its gaps come back as `warnings`, never a refusal. */
export function parseSpecBody(body, { format = SPEC_FORMATS.SPEC, checkPageDesign = false, requireContract = false } = {}) {
  if (format === SPEC_FORMATS.BRIEF) return parseSonicBrief(body, { checkPageDesign });
  if (typeof body !== "string") invalidSpec("Technical spec is empty.");
  const { title, sections, duplicates, rawHtml, rawHtmlMatch } = specSections(body);
  const invalid = message => { throw new UaError('INVALID_SPEC', message); };
  if (!title) invalid("Technical spec needs a title.");
  if (duplicates.length) invalid(`Duplicate spec section: ${duplicates.join(', ')}.`);
  for (const heading of ["Requested outcome", "Touches", "Ready when"]) {
    if (!sections[heading]) invalid(sections.Goal || sections.Changes
      ? `Technical spec needs ## ${heading}. ## Goal and ## Changes are the old brief format: write the goal under ## Requested outcome and the page design lines under ## Contract.`
      : `Technical spec needs ## ${heading}.`);
  }
  const requestedOutcome = sections["Requested outcome"].join("\n").trim().split(/\n\s*\n/u)[0]?.trim();
  if (!requestedOutcome) invalid("Requested outcome is empty.");
  const touches = parseTouches(sections.Touches, invalid, "Technical spec");
  const checklist = sections['Requirements checklist'];
  const requirements = checklist ? assessRequirements(checklist.join('\n'), touches) : null;
  const warnings = requirements?.issues.map(issue => `${issue.id}: ${issue.message}`) ?? [];
  // Everything below can still throw after the checklist above is already
  // computed. A later throw must not lose that result, so a caller (`spec
  // check`) can report "the checklist was 12/12" alongside the structural
  // problem instead of discarding it.
  try {
    if (rawHtml) invalid(`Technical specs must use visible Markdown: "${rawHtmlMatch}" looks like raw HTML or an unfilled <placeholder>. Fill in every <…> placeholder, or wrap literal angle brackets in a code span.`);
    const designGap = checkPageDesign && pageDesignProblem(sections.Contract?.join("\n"), touches);
    if (designGap) invalid(`## Contract: ${designGap}`);
    const releases = parseReleases(sections["Ready when"], touches, invalid);
    // The visual page has one card per Touches entity, from its own `### <kind> · <name>`
    // heading, and an arrow per relation bullet. A spec that asks for the page is refused
    // without them; any other spec write only warns, since a spec needs no Contract at all.
    if (requireContract || checkPageDesign) {
      const contract = sections.Contract ?? [];
      for (const gap of [contractHeadingsProblem(contract, touches), relationsProblem(contract, touches)].filter(Boolean)) {
        if (requireContract) invalid(`## Contract: ${gap}`);
        warnings.push(`contract: ${gap}`);
      }
    }
    const graphGap = graphContractProblem((sections.Contract ?? []).join("\n"));
    if (graphGap) invalid(`Context graph: ${graphGap}`);
    return { title, touches, releases, requestedOutcome, requirements, warnings, sections: Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, value.join("\n").trim()])) };
  } catch (error) {
    if (error instanceof UaError) error.requirements = requirements;
    throw error;
  }
}

// One `## Touches` line is `- kind · name · id`, the same in a Zen spec and a
// Sonic brief. A name may itself hold ` · ` ("Reading List · Save Book"), and an
// id never does, so the kind is the first part, the id the last, and the name
// everything between.
const TOUCH_KINDS = ["object", "automation", "code-app", "app", "page", "connection", "ai-agent", "knowledge-set", "dataset", "metric", "experiment",
  "api_group", "api", "client", "access_profile", "policy", "env_variable", "connector", "graph",
  // Governance. A role carries what it grants, so a Touches line names the role, not each tab.
  "user", "team", "role"];
const TOUCH_LINE = new RegExp(`^\\s*-\\s*(${TOUCH_KINDS.join("|")})\\s*·\\s*(.+)\\s*·\\s*(.*?)\\s*$`, "iu");

// A read can spell a kind its own way (get_agent answers `entityType: "ai_agent"`),
// so a refused line names the form and every kind it takes.
function parseTouches(lines, invalid, owner) {
  const touches = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = TOUCH_LINE.exec(line);
    if (!match || !match[2].trim() || !match[3]) {
      invalid(`Invalid Touches line: ${line.trim()}. Write "- <kind> · <name> · <id or new>", with the kind one of: ${TOUCH_KINDS.join(", ")}.`);
    }
    const ref = { kind: match[1].toLowerCase(), name: match[2].trim() };
    const token = match[3].trim().replace(/^["'`]+|["'`]+$/gu, "");
    if (norm(token) !== "new") ref.id = token;
    touches.push(ref);
  }
  if (!touches.length) invalid(`${owner} needs at least one Touches line.`);
  return touches;
}

const unquote = (value) => String(value ?? "").trim().replace(/^["'`]+|["'`]+$/gu, "").trim();

// A `## Ready when` line that releases something is `deploy <automation>` or
// `publish <app>` (an app, an AI agent or a code app), and it names one
// `## Touches` entry by its name or its id; a
// name may carry its id in brackets, `publish Portal (portal-app)`. The lines are
// read here, when the spec or brief is written, so a line no task can match
// ("deploy all thirteen automations") is refused then, not at plan create.
function parseReleases(lines, touches, invalid) {
  const releases = [];
  for (const line of lines) {
    const match = /^\s*-\s*(deploy|publish)\s+(.+?)\s*$/iu.exec(line);
    if (!match) continue;
    const action = match[1].toLowerCase();
    const kinds = action === "deploy" ? ["automation"] : ["app", "ai-agent", "code-app"];
    const bracket = /^(.*?)\s*\(([^()]+)\)$/u.exec(match[2]);
    const names = [match[2], bracket?.[1], bracket?.[2]].map(unquote).filter(Boolean).map(norm);
    const ref = touches.find((item) => kinds.includes(item.kind) &&
      names.some((name) => name === norm(item.name) || (item.id && name === norm(item.id))));
    if (!ref) {
      invalid(`## Ready when line "${line.trim()}" names no ${kinds[0]} in ## Touches. Write one "${action} <${kinds[0]} name>" line for each ${kinds[0]} it releases, with the name its Touches line gives.`);
    }
    releases.push({ action, ref });
  }
  return releases;
}

/** A Sonic brief: Goal, Touches, Changes, Ready when. No checklist, no proof table, no HTML. */
function parseSonicBrief(body, { checkPageDesign = false } = {}) {
  if (typeof body !== "string") invalidSpec("The brief is empty.");
  const { title, sections, duplicates, rawHtml, rawHtmlMatch } = specSections(body);
  const invalid = (message) => { throw new UaError("INVALID_SPEC", message, { mode: "sonic" }); };
  if (!title) invalid("The brief needs a title.");
  if (duplicates.length) invalid(`Duplicate brief section: ${duplicates.join(", ")}.`);
  for (const heading of SONIC_HEADINGS) if (!sections[heading]?.join("\n").trim()) invalid(`The brief needs ## ${heading} with content.`);
  if (rawHtml) invalid(`The brief still has a placeholder or raw HTML: "${rawHtmlMatch}". Fill in every <…> placeholder, or wrap literal angle brackets in a code span.`);
  const requestedOutcome = sections.Goal.join("\n").trim().split(/\n\s*\n/u)[0]?.trim();
  const touches = parseTouches(sections.Touches, invalid, "The brief");
  const designGap = checkPageDesign && pageDesignProblem(sections.Changes?.join("\n"), touches);
  if (designGap) invalid(`## Changes: ${designGap}`);
  const releases = parseReleases(sections["Ready when"], touches, invalid);
  const requirements = { ready: true, completed: 0, total: 0, items: [], issues: [], mode: "sonic" };
  // A Sonic brief has no Contract; its Context graph part sits under Changes.
  const graphGap = graphContractProblem((sections.Changes ?? []).join("\n"));
  if (graphGap) invalid(`Context graph: ${graphGap}`);
  return { title, touches, releases, requestedOutcome, requirements, mode: "sonic",
    sections: Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, value.join("\n").trim()])) };
}

// The task fields plan create works out from the spec, the ones plan report
// sets while a page is reviewed, and the state a run keeps on a task. A tasks
// file never sets them: a `confirmedAt` there would skip the person's yes to a
// deploy, a publish or a delete. plan revise carries a pending task's own state
// across from the stored plan, never from the file.
// A refusal says what the file holds, so a caller fixes the right line instead
// of guessing which field is wrong. `describeJson` names the value's shape, and
// the keys of an object, since the usual mistake is a wrapper or a typo in a key.
const TASK_SHAPE = 'Each task is an object with id, title, kind, entity, dependsOn, body and proof; run `ua plan create --help` for every field.';
function describeJson(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (typeof value !== "object") return `a ${typeof value} (${JSON.stringify(value)?.slice(0, 40) ?? String(value)})`;
  const keys = Object.keys(value);
  return keys.length ? `an object with the keys ${keys.slice(0, 8).join(", ")}` : "an empty object";
}
// `{ "tasks": [ … ] }` is the mistake this check meets most, so the refusal says what to do with it.
function wrappedTasks(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const key = ["tasks", "plan", "taskGraph", "graph"].find((name) => Array.isArray(value[name]));
  return key ? ` The file wraps the array in "${key}": write the array itself as the whole file.` : "";
}

const CLI_TASK_FIELDS = ["job", "design", "appLook", "appState", "needsDesignReport", "layoutId", "reviewedTaskId", "reviewRounds", "closeOnFix", "closingResult", "earlierFindings", "earlierQualities", "reviewFindings",
  "status", "attempts", "agent", "agentName", "answer", "confirmedAt", "question", "error", "handBacks", "usageStops", "builderNotes",
  "checkAfter", "waits", "moves", "startedAt", "endedAt", "result"];

/** `access` is `toolAccess(...)`: when given, a task naming a tool its builder
 * cannot call is refused. `pageDesign` is the plan's mark (PAGE_DESIGN): a plan
 * keeps the graph rules it was made under. NONE, a plan made before page
 * designs, has no app task and no page-review asked for. */
export function validateTasks(tasks, specBody, { format = SPEC_FORMATS.SPEC, access = null, pageDesign = PAGE_DESIGN.BIND_THEN_REVIEW, settled = new Set() } = {}) {
  if (!Array.isArray(tasks)) invalidPlan(`The tasks file holds ${describeJson(tasks)}, not a JSON array of tasks. ${TASK_SHAPE}${wrappedTasks(tasks)}`);
  if (!tasks.length) invalidPlan(`The tasks file holds an empty array, so the plan has nothing to build. Write one task per piece of work. ${TASK_SHAPE}`);
  tasks = tasks.map((task) => {
    if (!task || typeof task !== "object") return task;
    const own = Object.fromEntries(Object.entries(task).filter(([key]) => !CLI_TASK_FIELDS.includes(key)));
    // A body or proof written as a list of lines means the same as those lines joined.
    for (const part of ["body", "proof"]) {
      if (Array.isArray(own[part]) && own[part].every((line) => typeof line === "string")) own[part] = own[part].join("\n");
    }
    // "deletes": null says the task deletes nothing, the same as leaving the key out.
    if (own.deletes === null) delete own.deletes;
    return own;
  });
  let spec;
  try { spec = parseSpecBody(specBody, { format }); }
  catch (error) { invalidPlan(error.message); }
  // A Sonic brief has no Contract; its Context graph part sits under Changes.
  const graphGap = graphPlanProblem(tasks, spec.sections[format === SPEC_FORMATS.BRIEF ? "Changes" : "Contract"] ?? "");
  if (graphGap) invalidPlan(`Context graph: ${graphGap}`);
  const ids = new Set();
  refuseAll(eachTask(tasks, (task, at) => {
    // Named by its place in the file, because an entry that is not an object has no id to name it by.
    if (!task || typeof task !== "object" || Array.isArray(task)) invalidPlan(`Task ${at + 1} of the tasks file is ${describeJson(task)}, not a task. ${TASK_SHAPE}`);
    // q<n> is a quality fix task plan audit added; a plan holding one must still pass plan revise.
    if (!/^[tq]\d+$/u.test(task?.id ?? "")) invalidPlan(`Task id must be t<n>, or q<n> for a quality fix task: ${task?.id ?? "missing"} (task ${at + 1} of the file).`);
    // Recorded before the other id rules, so a copy of a task that breaks one of them is still named as a duplicate.
    const duplicate = ids.has(task.id);
    ids.add(task.id);
    // The flag and the id travel together, so a revise cannot turn a fix task into ordinary page work.
    if (task.id.startsWith("q") && task.audit !== true) invalidPlan(`${task.id} is a quality fix task, so it keeps audit: true.`);
    if (task.id.startsWith("q") && task.kind !== "page-bind") invalidPlan(`${task.id} is a ${task.kind} task. A q<n> quality fix task is a page-bind.`);
    if (task.id.startsWith("t") && task.audit === true) invalidPlan(`${task.id} has audit: true, which only a q<n> quality fix task carries.`);
    if (duplicate) invalidPlan(`Duplicate task id: ${task.id}.`);
  }));
  const byId = new Map(tasks.map((task) => [task.id, task]));
  // A deploy or publish task releases one Touches entry, by its name or its id,
  // and a Ready when line must name that entry.
  const released = (action, entity) => spec.releases.some(({ action: lineAction, ref }) => lineAction === action && ref.kind === entity.kind &&
    ((!!norm(ref.name) && norm(ref.name) === norm(entity.name)) || (!!ref.id && !!entity.id && String(ref.id) === String(entity.id))));
  const visualEntities = new Set((spec.sections.Proof ?? "").split("\n").map((line) => {
    const cells = line.split("|").map((cell) => cell.trim());
    return cells.length >= 4 && /\[visual\]\s*$/iu.test(cells.at(-2)) ? norm(cells[1]) : null;
  }).filter(Boolean));
  // A page with a job line gets it and its design regions on its layout and
  // review tasks, and its app's look when the plan wrote one; the app task gets
  // the look too. Each builder reads them in its message, not from memory.
  const designSection = spec.sections[format === SPEC_FORMATS.BRIEF ? "Changes" : "Contract"];
  const pageJobs = readJobLines(designSection);
  const pageDesigns = readDesignBlocks(designSection);
  const appLooks = [...readLookLines(designSection).values()].filter((look) => look.seeds && !look.none);
  // The values an app's pages share go to every layout and bind of that app, so
  // pages built side by side use the same names in the same store.
  const appStates = [...readStateLines(designSection).values()].filter((state) => state.values.length);
  // A page that already exists: its task names its id, or a Touches line does.
  const existingPages = new Set(spec.touches.filter((ref) => ref.kind === "page" && ref.id).map((ref) => norm(ref.name)));
  const unreleased = [];
  refuseAll(eachTask(tasks, (task) => {
    if (!Object.hasOwn(AGENTS_BY_KIND, task.kind)) invalidPlan(`Invalid kind for ${task.id}: ${task.kind}. One of: ${Object.keys(AGENTS_BY_KIND).join(", ")}.`);
    // Unchecked until now, so a task with no title reached the builder's brief,
    // the preview table and the person's approval box as "undefined". A settled
    // task is not checked: its words can no longer change, and a check added
    // after a plan was made never blocks that plan's revise or audit.
    if (!settled.has(task.id) && (typeof task.title !== "string" || !task.title.trim())) {
      const says = task.title === undefined ? "the key is missing" : typeof task.title === "string" ? "it is blank" : describeJson(task.title);
      invalidPlan(`${task.id} needs a title: ${says}. It is the one-line name the builder's brief, the plan preview and the progress table show.`);
    }
    if (!task.entity || !norm(task.entity.name) || !task.entity.kind) {
      invalidPlan(`${task.id} needs a named entity: ${task.entity === undefined ? "the key is missing" : describeJson(task.entity)}. Write { "kind": "<what it builds>", "name": "<its name>" }, with "id" too when it already exists, and "app" and "appId" on a page.`);
    }
    for (const key of ["id", "appId"]) {
      const several = idsIn(task.entity[key]);
      if (several.length > 1) invalidPlan(`${task.id} entity ${key} "${task.entity[key]}" names ${several.length} ids. A task builds one entity: give each entity its own task and id.`);
    }
    if (!Array.isArray(task.dependsOn)) invalidPlan(`${task.id} dependsOn must be an array.`);
    for (const dep of task.dependsOn) {
      if (!ids.has(dep)) invalidPlan(`${task.id} depends on unknown task ${dep}.`);
      if (dep === task.id) invalidPlan(`${task.id} cannot depend on itself.`);
    }
    // A bind on a new page needs the layout that creates the page. A bind on an
    // existing page has no layout to wait for, and needs nothing when it binds
    // only to what already exists.
    if (task.kind === "page-bind" && !task.dependsOn.length && !task.entity.id && !existingPages.has(norm(task.entity.name))) {
      invalidPlan(`${task.id} page-bind is on the new page ${task.entity.name.trim()}, so it depends on the page-layout that creates it.`);
    }
    if (task.kind === "page-layout") for (const dep of task.dependsOn) {
      if (BACKEND_KINDS.has(byId.get(dep)?.kind)) invalidPlan(`${task.id} page-layout cannot wait on backend task ${dep}; put that link on the page-bind.`);
    }
    if (typeof task.body !== "string" || task.body.trim().split(/\r?\n/u).length < 5) invalidPlan(`${task.id} body needs at least five lines, as one string or a list of lines.`);
    if (typeof task.proof !== "string" || !task.proof.trim()) invalidPlan(`${task.id} needs a proof read-back, as one string or a list of lines.`);
    // A done task's words were checked when it was planned. The rules may have
    // grown since, and its words can no longer change, so only the graph is checked again.
    if (!settled.has(task.id)) for (const part of ["body", "proof"]) {
      const gap = placeholderIn(task[part]);
      if (gap) invalidPlan(`${task.id} ${part} has a placeholder: "${gap}". Write the real value; a literal such as a picklist code goes in a code span or quotes.`);
      const count = COUNTED_KINDS.has(task.kind) ? HAND_COUNT.exec(task[part]) : null;
      if (count) invalidPlan(`${task.id} ${part} states a count, "${count[0]}". A count written next to a list drifts from it; say "every field the body lists" instead of a number.`);
      // agentFor, not the kind's default: an ai-agent publish runs on agent-builder.
      const foreign = foreignTool(task[part], agentFor(task), access);
      if (foreign) {
        invalidPlan(`${task.id} ${part} names ${foreign.tool}, which the ${agentFor(task)} cannot call: it is on ${foreign.on.join(", ")}. ` +
          "Any mention counts, an explanation of why included: say what must be true when the task is done, name that work in words " +
          "(\"saving that automation\", not the tool), and let the builder pick its own tools.");
      }
    }
    // A planned delete is asked about before its task is sent, so it must be named.
    if (task.deletes !== undefined && (typeof task.deletes !== "string" || !task.deletes.trim())) {
      invalidPlan(`${task.id} deletes must say in plain words what the task deletes.`);
    }
    const manual = AGENTS_BY_KIND[task.kind] === "user";
    if (task.deletes !== undefined && manual) invalidPlan(`${task.id} is manual: the person does it, so it takes no deletes.`);
    // A manual task is the person's own work, so naming a delete tool asks no one.
    const deleteTool = !task.deletes && !manual && !settled.has(task.id) && DELETE_TOOL_NAMES.find((name) => new RegExp(`\\b${name}\\b`, "u").test(task.body));
    if (deleteTool) {
      invalidPlan(`${task.id} body names ${deleteTool}, which deletes. Say what it deletes in "deletes", so the person is asked before the task is sent. ` +
        "Any mention counts, a \"do not call\" included: when the task deletes nothing, describe the work without the tool name.");
    }
    if (task.kind === "app" && task.entity.kind !== "app") invalidPlan(`${task.id} app task needs an entity of kind "app": { "kind": "app", "name": "<the app name>", "id": "<the app id>" }.`);
    // A shell deploys its automation early, so it needs the same authorisation as the real deploy.
    if (task.kind === "automation-shell" && (task.entity.kind !== "automation" || !released("deploy", task.entity))) {
      unreleased.push(`${task.id} automation-shell deploys its automation, so ## Ready when needs deploy ${task.entity.name.trim()}`);
    }
    if (isRelease(task)) {
      // A version read at plan time is out of date by dispatch: every save moves it.
      if (!settled.has(task.id) && /\b(?:deployed|deployment|entity|expected)?[ \t]*version[ \t]*[:=]?[ \t]*\d/iu.test(`${task.body}\n${task.proof}`)) {
        invalidPlan(`${task.id} ${task.kind} names a fixed version number. Every save moves the version, so compare with the version its first read returns.`);
      }
      // A deploy releases an automation; a publish releases an app or an AI agent;
      // a code-publish releases a code app, named by a publish line.
      const kinds = task.kind === "deploy" ? ["automation"] : task.kind === "code-publish" ? ["code-app"] : ["app", "ai-agent"];
      const words = task.kind === "deploy" ? "automation" : task.kind === "code-publish" ? "code app" : "app or AI agent";
      const action = releaseAction(task);
      if (!kinds.includes(task.entity.kind) || !released(action, task.entity)) {
        unreleased.push(`${task.id} ${task.kind} needs the exact ${words} name in ## Ready when: a "${action} ${task.entity.name.trim()}" line, with the ${words} also in ## Touches`);
      }
    }
    if (task.kind === "code-app" && task.entity.kind !== "code-app") {
      invalidPlan(`${task.id} code-app builds a Code Builder app, so its entity kind is code-app.`);
    }
  }));
  // Every release the accepted spec does not name, in one refusal, so a plan
  // that needs three new lines learns all three at once.
  if (unreleased.length) {
    invalidPlan(`${unreleased.join(". ")}. Only the person can add a release: with their yes, plan revise --impact major --ready-when "<line>; <line>" --release-yes "<their words>" adds the lines to the accepted spec.`);
  }
  checkNewAppIds(tasks, spec.touches);
  if (pageDesign) checkAppTasks(tasks, byId, spec.touches, settled);
  checkShellChains(tasks, byId);
  if (pageDesign) checkPageReviews(tasks, byId, pageJobs, pageDesign);
  checkCodePublishes(tasks, byId);
  // The task each review judges takes the shots and writes the design report.
  const reviewed = new Set(tasks.filter((task) => task.kind === "page-review").map((review) => reviewedWork(review, byId)?.id).filter(Boolean));
  const visited = new Set();
  const visiting = new Set();
  const visit = (id) => {
    if (visiting.has(id)) invalidPlan(`Task dependencies contain a cycle at ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of byId.get(id).dependsOn) visit(dep);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
  // Two tasks of one kind on one entity (build an agent, then evaluate it) are
  // fine when one waits on the other; at the same time they would clash.
  for (let i = 0; i < tasks.length; i++) for (let j = 0; j < i; j++) {
    const [later, earlier] = [tasks[i], tasks[j]];
    if (later.kind !== earlier.kind || !refsMatch(later.entity, earlier.entity)) continue;
    if (waitsOn(later, new Set([earlier.id]), byId) || waitsOn(earlier, new Set([later.id]), byId)) continue;
    invalidPlan(`Duplicate ${later.kind} task on ${later.entity.name}: ${later.id} and ${earlier.id} would run at once. ` +
      `Make ${later.id} depend on ${earlier.id}, or do both in one task.`);
  }
  return tasks.map((task) => {
    const onPage = ["page-layout", "page-review"].includes(task.kind) || (task.kind === "page-bind" && reviewed.has(task.id));
    const job = onPage ? pageJobs.get(norm(task.entity.name)) : null;
    const design = onPage ? pageDesigns.get(norm(task.entity.name)) : null;
    // A page that names no app takes the plan's only look; a page of another app never does.
    const namesNoApp = !task.entity.app && !task.entity.appId;
    const look = task.kind === "app" ? appLooks.find((item) => norm(item.name) === norm(task.entity.name))
      : job && (appLooks.find((item) => norm(item.name) === norm(task.entity.app)) ?? (namesNoApp && appLooks.length === 1 ? appLooks[0] : null));
    const state = ["page-layout", "page-bind"].includes(task.kind)
      ? appStates.find((item) => norm(item.name) === norm(task.entity.app)) ?? (namesNoApp && appStates.length === 1 ? appStates[0] : null) : null;
    const judged = task.kind === "page-review" ? reviewedWork(task, byId) : null;
    // A review reads the layout's shots and opens no browser of its own.
    const visual = task.kind === "page-review" ? false : task.visual === true || visualEntities.has(norm(task.entity.name)) || !!job;
    return {
      ...task, entity: { ...task.entity }, dependsOn: [...task.dependsOn],
      agent: agentFor(task), status: "pending", attempts: 0, visual,
      ...(job ? { job: job.line } : {}),
      ...(design ? { design: design.regions } : {}),
      ...(job && (pageDesign >= PAGE_DESIGN.BIND_THEN_REVIEW ? reviewed.has(task.id) : task.kind === "page-layout") ? { needsDesignReport: true } : {}),
      ...(look ? { appLook: look.line } : {}),
      ...(state ? { appState: state.line } : {}),
      ...(judged ? { reviewedTaskId: judged.id } : {}),
      result: { ids: {}, readBack: [], unverified: [], notes: [] },
    };
  });
}

export function actorsMatch(a, b) {
  return typeof a?.clientId === "string" && !!a.clientId && a.clientId === b?.clientId;
}
