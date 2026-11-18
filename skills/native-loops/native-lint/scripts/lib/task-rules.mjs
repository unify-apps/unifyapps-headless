// The task rules UnifyApps Headless's `plan propose`, `plan create` and `plan revise` enforce,
// copied from this plugin's own scripts so a brief this lint passes is never refused
// there. Each regex and constant cites the file it mirrors (line numbers as copied;
// the plugin's tests compare the copies with the originals):
//   C = scripts/lib/contracts.mjs, R = scripts/lib/spec-requirements.mjs,
//   M = scripts/lib/spec-markdown.mjs.
// Only the rules that need no spec body are here. The spec-bound ones (releases
// in ## Ready when, page jobs and reviews, new app ids, tool access) run in
// UnifyApps Headless itself; references/task-lint.md lists them.

// M:17-21 — mask complete same-line code spans so `todo` in a span is a value, not a gap.
export function withoutCodeSpans(text) {
  return String(text).replace(/(?<![\\`])((?:\\\\)*)(`+)(?!`)[^\n]*?(?<!`)\2(?!`)/gu, '$1 named value ');
}

// R:28-31 — quoted values are literal copy, never a placeholder.
function withoutQuotedValues(text) {
  return withoutCodeSpans(text)
    .replace(/"[^"]*"|“[^”]*”|‘[^’]*’|(?<![\p{L}\p{N}])'[^'\n]+'(?![\p{L}\p{N}])/gu, ' named value ');
}

// R:35-36
const GAP_MARKS = /\b(?:TBD|TBC|TODO)\b/u;
const GAP_WORDS = /\bto be (?:decided|determined|confirmed|defined)\b|\b(?:handle errors|similar to|wire it up|fill in)\b/iu;

// R:39-44 — the first placeholder in a task body or proof, or null.
export function placeholderIn(text) {
  const visible = withoutQuotedValues(String(text ?? ''));
  const found = [GAP_MARKS.exec(visible), GAP_WORDS.exec(visible)].filter(Boolean).sort((left, right) => left.index - right.index)[0];
  return found ? found[0] : null;
}

// C:558-559 — a hand-written field count beside a list drifts from it.
const HAND_COUNT = /\b\d+\s+(?:[A-Za-z_-]+\s+){0,2}?(?:fields?|columns?|indexes|indices|index)\b/iu;
const COUNTED_KINDS = new Set(['object', 'record']);

// C:141-157
export const AGENTS_BY_KIND = Object.freeze({
  object: 'fde-agent', record: 'fde-agent',
  automation: 'automation-agent', 'automation-shell': 'automation-agent', deploy: 'automation-agent',
  app: 'app-agent', 'page-layout': 'app-agent', 'page-bind': 'app-agent', publish: 'app-agent',
  'page-review': 'page-reviewer',
  'ai-agent': 'agent-builder',
  dataset: 'agent-builder', metric: 'agent-builder', experiment: 'agent-builder',
  api: 'fde-agent',
  'code-app': 'code-app-agent', 'code-publish': 'code-app-agent',
  'env-variable': 'fde-agent',
  connector: 'fde-agent',
  governance: 'fde-agent',
  graph: 'graph-agent',
  manual: 'user',
});

// C:515
const BACKEND_KINDS = new Set(['object', 'record', 'automation', 'automation-shell', 'deploy', 'ai-agent', 'dataset', 'metric', 'experiment', 'api', 'env-variable', 'connector']);

// C:195-207
export const DELETE_TOOL_NAMES = Object.freeze([
  'delete_object', 'delete_pages', 'apply_interface_version_diff',
  'delete_data_sources', 'delete_elements', 'delete_test_cases',
  'delete_test_suites', 'delete_test_plans',
  'delete_connection', 'delete_solution',
  'delete_dataset', 'delete_dataset_conversation', 'delete_dataset_scenario',
  'delete_dataset_items', 'delete_metrics', 'delete_experiments',
  'delete_experiment_runs',
  'delete_api_group', 'delete_api', 'delete_policy', 'delete_client', 'delete_access_profile',
  'rotate_access_profile_key',
]);

// C:838-840 — fields the CLI adds to a stored task; a tasks file may carry them back.
const CLI_TASK_FIELDS = ['job', 'design', 'appLook', 'needsDesignReport', 'layoutId', 'reviewedTaskId', 'reviewRounds', 'closeOnFix', 'closingResult', 'earlierFindings', 'earlierQualities', 'reviewFindings',
  'status', 'attempts', 'agent', 'agentName', 'answer', 'confirmedAt', 'question', 'error', 'handBacks', 'builderNotes',
  'checkAfter', 'waits', 'moves', 'startedAt', 'endedAt', 'result'];

// C:406-414
const norm = (value) => String(value ?? '').trim().replace(/\s+/gu, ' ').toLowerCase();
function refsMatch(left, right) {
  if (!left || !right) return false;
  if (left.id && right.id) return String(left.id) === String(right.id);
  return left.kind === right.kind && !!norm(left.name) && norm(left.name) === norm(right.name);
}

// C:563-566
const idsIn = (value) => String(value ?? '').split(/[\s,;]+/u).filter(Boolean);

// C:568-580
function waitsOn(task, targets, byId) {
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

// C:852-853 — a body given as a list of lines means those lines joined.
export function normaliseTask(task) {
  if (!task || typeof task !== 'object') return task;
  const own = Object.fromEntries(Object.entries(task).filter(([key]) => !CLI_TASK_FIELDS.includes(key)));
  return Array.isArray(own.body) && own.body.every((line) => typeof line === 'string') ? { ...own, body: own.body.join('\n') } : own;
}

/** The body-only rules, for a single task body or a brief paragraph: C:908 and C:910-912. */
export function validateBody(body, { kind = null } = {}) {
  const text = Array.isArray(body) ? body.join('\n') : body;
  const errors = [];
  if (typeof text !== 'string' || text.trim().split(/\r?\n/u).length < 5) errors.push('body needs at least five lines.');
  const gap = placeholderIn(text);
  if (gap) errors.push(`body has a placeholder: "${gap}". Write the real value; a literal such as a picklist code goes in a code span or quotes.`);
  const count = COUNTED_KINDS.has(kind) ? HAND_COUNT.exec(String(text ?? '')) : null;
  if (count) errors.push(`body states a count, "${count[0]}". A count written next to a list drifts from it; say "every field the body lists" instead of a number.`);
  return errors;
}

function perTaskErrors(task, ids, byId, settled = new Set()) {
  const errors = [];
  const bad = (message) => errors.push(message);
  const id = task.id;
  if (!Object.hasOwn(AGENTS_BY_KIND, task.kind)) bad(`Invalid kind for ${id}: ${task.kind}. One of: ${Object.keys(AGENTS_BY_KIND).join(', ')}.`); // C:887
  // The title check, skipped for a task the plan already settled, the way the plugin skips it:
  // a check added after a plan was made never blocks that plan's revise or audit.
  if (!settled.has(id) && (typeof task.title !== 'string' || !task.title.trim())) {
    bad(`${id} needs a title, the one-line name the builder's brief and the plan preview show.`);
  }
  if (!task.entity || !norm(task.entity.name) || !task.entity.kind) bad(`${id} needs a named entity: write { "kind": "<what it builds>", "name": "<its name>" }, with "id" too when it already exists.`); // C:888
  for (const key of ['id', 'appId']) { // C:889-892
    const several = idsIn(task.entity?.[key]);
    if (several.length > 1) bad(`${id} entity ${key} "${task.entity[key]}" names ${several.length} ids. A task builds one entity: give each entity its own task and id.`);
  }
  if (!Array.isArray(task.dependsOn)) { bad(`${id} dependsOn must be an array.`); return errors; } // C:893
  for (const dep of task.dependsOn) { // C:894-897
    if (!ids.has(dep)) bad(`${id} depends on unknown task ${dep}.`);
    if (dep === id) bad(`${id} cannot depend on itself.`);
  }
  // C:902-904, without a spec: a page named in ## Touches with an id counts as existing there; here only entity.id does.
  if (task.kind === 'page-bind' && !task.dependsOn.length && !task.entity?.id) {
    bad(`${id} page-bind is on the new page ${String(task.entity?.name ?? '').trim()}, so it depends on the page-layout that creates it (or names the page's id in entity.id).`);
  }
  if (task.kind === 'page-layout') for (const dep of task.dependsOn) { // C:905-907
    if (BACKEND_KINDS.has(byId.get(dep)?.kind)) bad(`${id} page-layout cannot wait on backend task ${dep}; put that link on the page-bind.`);
  }
  if (typeof task.body !== 'string' || task.body.trim().split(/\r?\n/u).length < 5) bad(`${id} body needs at least five lines.`); // C:908
  if (typeof task.proof !== 'string' || !task.proof.trim()) bad(`${id} needs a proof read-back.`); // C:909
  for (const part of ['body', 'proof']) { // C:910-914
    const gap = placeholderIn(task[part]);
    if (gap) bad(`${id} ${part} has a placeholder: "${gap}". Write the real value; a literal such as a picklist code goes in a code span or quotes.`);
    const count = COUNTED_KINDS.has(task.kind) ? HAND_COUNT.exec(String(task[part] ?? '')) : null;
    if (count) bad(`${id} ${part} states a count, "${count[0]}". A count written next to a list drifts from it; say "every field the body lists" instead of a number.`);
  }
  if (task.deletes !== undefined && (typeof task.deletes !== 'string' || !task.deletes.trim())) bad(`${id} deletes must say in plain words what the task deletes.`); // C:925-927
  if (task.deletes !== undefined && AGENTS_BY_KIND[task.kind] === 'user') bad(`${id} is manual: the person does it, so it takes no deletes.`); // C:929
  const deleteTool = !task.deletes && DELETE_TOOL_NAMES.find((name) => new RegExp(`\\b${name}\\b`, 'u').test(String(task.body ?? ''))); // C:930-933
  if (deleteTool) bad(`${id} body calls ${deleteTool}, which deletes. Say what it deletes in "deletes", so the person is asked before the task is sent.`);
  if (task.kind === 'app' && task.entity?.kind !== 'app') bad(`${id} app task needs an entity of kind "app": { "kind": "app", "name": "<the app name>", "id": "<the app id>" }.`); // C:934
  if (task.kind === 'deploy' || task.kind === 'publish') { // C:937-948, minus the ## Ready when match
    if (/\b(?:deployed|deployment|entity|expected)?[ \t]*version[ \t]*[:=]?[ \t]*\d/iu.test(`${task.body}\n${task.proof}`)) {
      bad(`${id} ${task.kind} names a fixed version number. Every save moves the version, so compare with the version its first read returns.`);
    }
    const kinds = task.kind === 'deploy' ? ['automation'] : ['app', 'ai-agent'];
    if (!kinds.includes(task.entity?.kind)) bad(`${id} ${task.kind} needs an entity of kind ${kinds.join(' or ')}, named exactly as in ## Ready when.`);
  }
  return errors;
}

/**
 * The graph rules of C:846-998 that need no spec: ids, kinds, entities,
 * dependencies, bodies, proofs, placeholders, counts, deletes, release shapes,
 * shell chains (C:583-591), cycles (C:962-972) and same-kind clashes (C:973-980).
 * Returns every error instead of the first, so one run fixes a whole file.
 */
export function validateTaskGraph(input) {
  const errors = [];
  if (!Array.isArray(input)) { // C:847
    const keys = input && typeof input === 'object' ? Object.keys(input) : [];
    const wrapper = ['tasks', 'plan', 'taskGraph', 'graph'].find((name) => Array.isArray(input?.[name]));
    const held = input === null ? 'null' : keys.length ? `an object with the keys ${keys.slice(0, 8).join(', ')}` : typeof input === 'object' ? 'an empty object' : `a ${typeof input}`;
    return { ok: false, errors: [`The tasks file holds ${held}, not a JSON array of tasks.`
      + (wrapper ? ` The file wraps the array in "${wrapper}": write the array itself as the whole file.` : '')] };
  }
  if (!input.length) return { ok: false, errors: ['The tasks file holds an empty array, so the plan has nothing to build. Write one task per piece of work.'] }; // C:848
  // Read before normaliseTask drops the state keys: a task the file carries back
  // as done or skipped keeps the words the plan stored, so a check added since
  // it ran is not applied to it.
  const settled = new Set(input.filter((task) => task?.status === 'done' || task?.status === 'skipped').map((task) => task.id));
  const tasks = input.map(normaliseTask);
  const ids = new Set();
  for (const task of tasks) { // C:857-866
    const id = task?.id ?? 'missing';
    if (!/^[tq]\d+$/u.test(task?.id ?? '')) { errors.push(`Task id must be t<n>, or q<n> for a quality fix task: ${id}.`); continue; }
    if (task.id.startsWith('q') && task.audit !== true) errors.push(`${id} is a quality fix task, so it keeps audit: true.`);
    if (task.id.startsWith('q') && task.kind !== 'page-bind') errors.push(`${id} is a ${task.kind} task. A q<n> quality fix task is a page-bind.`);
    if (task.id.startsWith('t') && task.audit === true) errors.push(`${id} has audit: true, which only a q<n> quality fix task carries.`);
    if (ids.has(task.id)) errors.push(`Duplicate task id: ${id}.`);
    ids.add(task.id);
  }
  const valid = tasks.filter((task) => task && /^[tq]\d+$/u.test(task.id ?? ''));
  const byId = new Map(valid.map((task) => [task.id, task]));
  for (const task of valid) errors.push(...perTaskErrors(task, ids, byId, settled));
  const withDeps = valid.filter((task) => Array.isArray(task.dependsOn));
  for (const shell of withDeps.filter((task) => task.kind === 'automation-shell')) { // C:583-591
    for (const logic of withDeps.filter((task) => task.kind === 'automation' && refsMatch(task.entity, shell.entity))) {
      if (!waitsOn(logic, new Set([shell.id]), byId)) errors.push(`${logic.id} automation must depend on ${shell.id}, the automation-shell that creates ${String(shell.entity?.name ?? '').trim()}.`);
    }
  }
  const visited = new Set(); // C:962-972
  const visiting = new Set();
  const visit = (id) => {
    if (visiting.has(id)) { errors.push(`Task dependencies contain a cycle at ${id}.`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) if (byId.has(dep)) visit(dep);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
  for (let later = 0; later < withDeps.length; later++) for (let earlier = 0; earlier < later; earlier++) { // C:973-980
    const [laterTask, earlierTask] = [withDeps[later], withDeps[earlier]];
    if (laterTask.kind !== earlierTask.kind || !refsMatch(laterTask.entity, earlierTask.entity)) continue;
    if (waitsOn(laterTask, new Set([earlierTask.id]), byId) || waitsOn(earlierTask, new Set([laterTask.id]), byId)) continue;
    errors.push(`Duplicate ${laterTask.kind} task on ${laterTask.entity?.name}: ${laterTask.id} and ${earlierTask.id} would run at once. Make ${laterTask.id} depend on ${earlierTask.id}, or do both in one task.`);
  }
  return { ok: !errors.length, errors: [...new Set(errors)] };
}
