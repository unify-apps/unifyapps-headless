// The permission rules UnifyApps Headless needs under Claude Code's auto mode, and the
// merge and check that `scripts/permissions.mjs` runs on a settings object.
// Pure: the caller reads and writes the file.
//
// A plugin cannot ship allow rules (a plugin's settings.json keeps only `agent`
// and `subagentStatusLine`), and auto mode refuses a session that edits its own
// permissions, so the person writes them once, from their own terminal.
//
// The Bash rules use a `*` where the version folder goes, so they match every
// installed version: rules pinned to `.../nebula/3.50.0/...` stopped matching
// once 3.52.0 installed (2026-10-12). Tested with `claude -p --setting-sources ""`:
// - `Bash(bash "<all>/*/scripts/run-node.sh" *)` ran the 3.50.0 and 3.52.0
//   copies, also after `cd "<folder>" &&`, and still refused another script in
//   the same folder.
// - A rule matches the command as typed, quotes included: the unquoted rule
//   refused the quoted command every skill and builder runs, so each rule comes
//   in both spellings.
// - A `*` mixed with the trailing `:*` form is matched as a literal prefix, so
//   these rules use `<command> *`, never `/*/...:*`.
//
// `run-node.sh` runs `node "$@"`, so a rule that accepts any arguments after it
// also accepts `run-node.sh -e "<any code>"`. Its rule therefore names the
// script too: the first argument must be a `.mjs` file in the same versions
// folder. The broad rule older releases wrote is RETIRED: `apply` takes it out.

/** Every UnifyApps Headless MCP server, allowed whole, so a tool a later release adds is
 * covered too: auto mode refused tools no single-tool rule named (2026-10-11,
 * `get_agent` in a publish builder). Must equal the servers in `.mcp.json`. */
export const MCP_SERVERS = Object.freeze([
  'agent-builder', 'api-gateway', 'app-testing', 'application-builder', 'automation-code',
  'changeset', 'code-builder', 'connection', 'connectors-sdk', 'context-graph', 'evaluation', 'object', 'playwright', 'solution',
]);

/** Calls that still stop for the person: `permissions.ask` wins over `allow`. */
export const ASK_RULES = Object.freeze([
  'mcp__plugin_ua_object__delete_object',
  'mcp__plugin_ua_object__delete_env_variables',
  'mcp__plugin_ua_solution__delete_solution',
  'mcp__plugin_ua_changeset__delete_changeset',
  'mcp__plugin_ua_connection__create_connection',
  'mcp__plugin_ua_connection__clone_connection',
  'mcp__plugin_ua_connection__update_connection',
  'mcp__plugin_ua_connection__disable_connection',
  'mcp__plugin_ua_connection__delete_connection',
  'mcp__plugin_ua_agent-builder__remove_deployment',
  'mcp__plugin_ua_application-builder__delete_pages',
  'mcp__plugin_ua_application-builder__delete_data_sources',
  'mcp__plugin_ua_application-builder__apply_interface_version_diff',
  'mcp__plugin_ua_code-builder__restore_code_version',
  'mcp__plugin_ua_connectors-sdk__delete_connector',
  'mcp__plugin_ua_connectors-sdk__delete_connector_action',
  'mcp__plugin_ua_connectors-sdk__delete_connector_trigger',
  'mcp__plugin_ua_connectors-sdk__delete_connector_authentication',
  'mcp__plugin_ua_api-gateway__create_oauth_token',
  'mcp__plugin_ua_api-gateway__rotate_access_profile_key',
  'mcp__plugin_ua_api-gateway__delete_api',
  'mcp__plugin_ua_api-gateway__delete_api_group',
  'mcp__plugin_ua_api-gateway__delete_client',
  'mcp__plugin_ua_api-gateway__delete_policy',
  'mcp__plugin_ua_api-gateway__delete_access_profile',
  'mcp__plugin_ua_evaluation__delete_dataset',
  'mcp__plugin_ua_evaluation__delete_dataset_items',
  'mcp__plugin_ua_evaluation__delete_dataset_conversation',
  'mcp__plugin_ua_evaluation__delete_dataset_scenario',
  'mcp__plugin_ua_evaluation__delete_experiments',
  'mcp__plugin_ua_evaluation__delete_experiment_runs',
  'mcp__plugin_ua_evaluation__delete_metrics',
  'mcp__plugin_ua_app-testing__create_or_update_test_user',
  'mcp__plugin_ua_app-testing__delete_test_cases',
  'mcp__plugin_ua_app-testing__delete_test_plans',
  'mcp__plugin_ua_app-testing__delete_test_suites',
  'mcp__plugin_ua_app-testing__delete_elements',
  'mcp__plugin_ua_context-graph__delete_context_graph',
  'mcp__plugin_ua_context-graph__delete_context_graph_node',
  'mcp__plugin_ua_context-graph__delete_context_graph_edge',
  'mcp__plugin_ua_context-graph__delete_context_graph_source',
  'mcp__plugin_ua_context-graph__delete_context_graph_node_match_rule',
  'mcp__plugin_ua_context-graph__delete_context_graph_node_data_quality_rule',
  'mcp__plugin_ua_context-graph__delete_context_graph_records',
  'mcp__plugin_ua_playwright__browser_run_code_unsafe',
]);

/** The commands a UnifyApps Headless skill runs by path, in both spellings: the
 * launcher with a plugin script as its first argument (with arguments after it,
 * and without, which ` *` does not match), and the CLI. */
function cliRules(versionsDir, version) {
  const launcher = `${versionsDir}/${version}/scripts/run-node.sh`;
  const script = `${versionsDir}/${version === '*' ? '' : `${version}/`}*.mjs`;
  const cli = `${versionsDir}/${version}/scripts/ua.mjs`;
  return [
    `Bash(bash ${launcher} ${script} *)`, `Bash(bash "${launcher}" "${script}" *)`,
    `Bash(bash ${launcher} ${script})`, `Bash(bash "${launcher}" "${script}")`,
    `Bash(node ${cli} *)`, `Bash(node "${cli}" *)`,
  ];
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** The `run-node.sh` rules older releases wrote, for any version folder, which
 * let the launcher run any arguments. */
function retiredRule(versionsDir) {
  return new RegExp(`^Bash\\(bash "?${escape(versionsDir)}/[^/"]+/scripts/run-node\\.sh"?(?: \\*|:\\*)\\)$`, 'u');
}

/** The rules for `permissions.allow`. `versionsDir` is the folder that holds every
 * installed version: `<claude config>/plugins/cache/unifyapps-headless/ua`. */
export function allowRules(versionsDir) {
  return [...MCP_SERVERS.map(server => `mcp__plugin_ua_${server}`), ...cliRules(versionsDir, '*')];
}

/** The allow rules in `settings` that UnifyApps Headless once wrote and now retires. */
export function retiredRules(settings, versionsDir) {
  const retired = retiredRule(versionsDir);
  return (settings?.permissions?.allow ?? []).filter(rule => typeof rule === 'string' && retired.test(rule));
}

/** Adds the missing rules and takes out the `retire` ones, the only rules it
 * ever removes; the rest keep their order. Returns a new object. */
export function mergeRules(settings, { allow, ask, retire = [] }) {
  const next = structuredClone(settings ?? {});
  const permissions = next.permissions && typeof next.permissions === 'object' ? next.permissions : (next.permissions = {});
  const added = {};
  for (const [key, rules] of Object.entries({ allow, ask })) {
    const have = Array.isArray(permissions[key]) ? permissions[key] : (permissions[key] = []);
    added[key] = rules.filter(rule => !have.includes(rule));
    have.push(...added[key]);
  }
  const removed = permissions.allow.filter(rule => retire.includes(rule));
  if (removed.length) permissions.allow = permissions.allow.filter(rule => !retire.includes(rule));
  return { settings: next, added, removed };
}

/** The allow and ask rules `settings` still lacks, and the retired rules it
 * still has. A rule counts as present when it is there as written, or, for the
 * running `version`, as an older rule pinned to that version (either
 * `<command> *` or `<command>:*`); an MCP server also counts when written as
 * `mcp__plugin_ua_<server>__*`. */
export function missingRules(settings, { versionsDir, version }) {
  const have = new Set(settings?.permissions?.allow ?? []);
  const asked = new Set(settings?.permissions?.ask ?? []);
  const pinned = version ? cliRules(versionsDir, version) : [];
  const present = (rule, index) => {
    if (have.has(rule) || have.has(`${rule}__*`)) return true;
    const own = pinned[index - MCP_SERVERS.length];
    return Boolean(own) && (have.has(own) || have.has(own.replace(/ \*\)$/u, ':*)')));
  };
  return {
    allow: allowRules(versionsDir).filter((rule, index) => !present(rule, index)),
    ask: ASK_RULES.filter(rule => !asked.has(rule)),
    retired: retiredRules(settings, versionsDir),
  };
}
