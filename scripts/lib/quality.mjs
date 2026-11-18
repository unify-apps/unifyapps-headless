/** The page quality pass: which page work an audit must cover, when an audit
 * is settled, and what plan audit may add. Pure: the caller reads the cache. */
import { UaError, norm, samePage } from "./contracts.mjs";

const PAGE_KINDS = new Set(["page-layout", "page-bind"]);
// A review can send its page's bind or layout back to the builder, so the page
// is not finished while one is open: the pass waits for it, and so does an audit.
const OPEN_KINDS = new Set([...PAGE_KINDS, "page-review"]);
const isPageTask = (task) => PAGE_KINDS.has(task.kind);
const refuse = (message) => { throw new UaError("INVALID_PLAN", message); };

/** The page tasks, page reviews and quality fix tasks included, still pending or running. */
export function openPageTaskIds(tasks) {
  return tasks.filter((task) => OPEN_KINDS.has(task.kind) && (task.status === "pending" || task.status === "running")).map((task) => task.id);
}

// A fork names the source plan's done tasks in meta.carriedForward instead of
// copying them, and the new plan numbers its own tasks from t1 again, so a
// carried task gets an id none of the new plan's tasks can have.
const asCarried = (id) => `carried:${id}`;
const carriedTasks = (meta) => (Array.isArray(meta?.carriedForward) ? meta.carriedForward : []).map((entry) => ({
  id: asCarried(entry.taskId), kind: entry.kind, status: "done", audit: entry.audit, entity: entry.entity, result: { ids: entry.ids },
  ...(entry.endedAt ? { endedAt: entry.endedAt } : {}),
}));

// The id of a task's page: its own, the one its result reported, or the one
// another task of the same page holds. A layout may report its page under
// ids.page, and plan task copies only ids.entity onto the task.
const ownPageId = (task) => task.entity?.id || task.result?.ids?.entity || task.result?.ids?.page || null;
function pageIdOf(task, tasks) {
  const own = ownPageId(task);
  if (own) return String(own);
  const known = tasks.find((item) => item !== task && item.entity?.kind === "page" && samePage(item, task) && ownPageId(item));
  return known ? String(ownPageId(known)) : null;
}

/** D: the done page-layout and page-bind tasks of MOBILE apps, a fork's
 * carried ones included and quality fix tasks left out. `appTypeOf(task)`
 * answers the cached type of the task's app, or null. A task whose page id no
 * task knows is left out, as one of an unknown app is: a findings file cannot
 * name its page, so it neither holds a publish nor demands a page. */
export function coveredTaskIds(tasks, appTypeOf, meta = {}) {
  const all = [...tasks, ...carriedTasks(meta)];
  return all.filter((task) => isPageTask(task) && task.status === "done" && task.audit !== true &&
    appTypeOf(task) === "MOBILE" && pageIdOf(task, all) !== null).map((task) => task.id);
}

// The app a page task is on, by id and by name, as the task or its result says.
const appOf = (task) => ({ id: task?.entity?.appId || task?.result?.ids?.app || null, name: task?.entity?.app || null });

// A publish releases an app's pages when it names that app: by id when both
// say one, else by name. When the page's app cannot be told, every app
// publish is held, and an AI agent's publish never is.
function releasesApp(publish, app) {
  if (publish.kind !== "publish" || publish.entity?.kind !== "app") return false;
  if (app.id && publish.entity.id) return String(app.id) === String(publish.entity.id);
  if (app.name) return norm(app.name) === norm(publish.entity.name);
  return true;
}

// When a task last moved to done: its endedAt, or its newest move to done.
function doneAt(task) {
  const move = (Array.isArray(task?.moves) ? task.moves : []).findLast((line) => /^\S+ done by /u.test(String(line)));
  return Date.parse(task?.endedAt ?? String(move ?? "").slice(0, 20)) || 0;
}
// A covered task done again after an audit (its review sent it back, say)
// changed the page that audit read, so the audit covers it no more.
const redoneSince = (task, at) => !!task && !!at && doneAt(task) > Date.parse(at);

/** Every fix task the entry added is done, and nothing blocking is left open
 * unless the person chose to publish with it. Fixing by hand runs the pass
 * again first, and finishing without publishing skips the publish instead.
 * `tasks` may hold a fork's carried tasks, so a carried audit settles too. */
export function auditSettled(entry, tasks) {
  const done = new Set(tasks.filter((task) => task.status === "done").map((task) => task.id));
  return entry.tasks.every((id) => done.has(id)) && (entry.summary.blocking === 0 || entry.accepted?.decision === "accept-and-publish");
}

/** `hold`: D is not empty, a publish of an app that owns a page in D is still
 * pending, and no settled audit covers all of D as it is now, so that publish
 * does not go out. `ask`: the hold stands and no page task or page review is
 * pending or running, so the pass can run; plan ready asks for it once nothing
 * else is left to send, ask or wait for. The two differ while page work of
 * another app is still open: a publish that waits only on its own app's pages
 * is ready then, and must not go out unaudited. `pages` and `covered` describe
 * D, and `publishes` names every publish task, of any status, of an app that
 * owns a page in D: the ones the hold holds and plan audit makes wait. */
export function qualityDue(tasks, meta, appTypeOf) {
  const all = [...tasks, ...carriedTasks(meta)];
  const covered = coveredTaskIds(tasks, appTypeOf, meta);
  const byId = new Map(all.map((task) => [task.id, task]));
  const pages = [];
  for (const id of covered) {
    const task = byId.get(id);
    const pageId = pageIdOf(task, all);
    if (!pages.some((page) => page.id === pageId)) pages.push({ id: pageId, name: task.entity.name });
  }
  const apps = covered.map((id) => appOf(byId.get(id)));
  const publishes = tasks.filter((task) => apps.some((app) => releasesApp(task, app))).map((task) => task.id);
  const publishPending = tasks.some((task) => task.status === "pending" && publishes.includes(task.id));
  const settled = (meta.audits ?? []).some((entry) => auditSettled(entry, all) &&
    covered.every((id) => entry.coveredTasks.includes(id) && !redoneSince(byId.get(id), entry.at)));
  const hold = covered.length > 0 && publishPending && !settled;
  return { hold, ask: hold && openPageTaskIds(tasks).length === 0, pages, covered, publishes };
}

/** The fix tasks a publish waits on: those on the pages of the app it
 * releases. The app is read from a done page task of the same page, whose app
 * the audit found MOBILE, or else from the fix task itself. A fix whose app
 * cannot be told makes every app publish wait. */
export function fixesFor(publish, fixes, tasks, meta = {}) {
  const all = [...tasks, ...carriedTasks(meta)];
  return fixes.filter((fix) => {
    const page = all.find((task) => isPageTask(task) && task.status === "done" && pageIdOf(task, all) === String(fix.entity?.id));
    const fromPage = appOf(page);
    return releasesApp(publish, fromPage.id || fromPage.name ? fromPage : appOf(fix));
  }).map((fix) => fix.id);
}

/** The settled audits of the plan a fork replaces, with each id renamed the
 * way the fork names a carried task, so a pass the person already settled
 * (their accept-and-publish words included) stays settled for the work the
 * fork carries. An audit with a fix task the fork does not carry stays behind. */
export function carriedAudits(tasks, meta, carriedIds, planId) {
  const all = [...tasks, ...carriedTasks(meta)];
  const carried = new Set(carriedIds);
  return (Array.isArray(meta?.audits) ? meta.audits : [])
    .filter((entry) => auditSettled(entry, all) && entry.tasks.every((id) => carried.has(id)) && entry.coveredTasks.some((id) => carried.has(id)))
    .map((entry) => ({ ...entry, coveredTasks: entry.coveredTasks.filter((id) => carried.has(id)).map(asCarried),
      tasks: entry.tasks.map(asCarried), carriedFrom: planId }));
}

/** What only plan audit asks of a task it adds: a page-bind fix marked
 * audit: true, on a page the audit covers, with a new q<n> id, no delete, and
 * dependsOn naming known tasks. The rest of the task, and the graph it makes,
 * is checked by validateTasks. Throws INVALID_PLAN naming the rule that failed. */
export function validateQualityTasks(tasks, pages, existingIds) {
  if (!Array.isArray(tasks)) refuse("The tasks file must be a JSON array of quality fix tasks.");
  const existing = new Set(existingIds);
  const inFile = new Set(tasks.map((task) => task?.id));
  const pageIds = new Set(pages.map((page) => page.id));
  const seen = new Set();
  for (const task of tasks) {
    const id = task?.id ?? "missing";
    if (!/^q\d+$/u.test(id) || existing.has(id) || seen.has(id)) {
      refuse(`A quality fix task id must be q<n> and not used yet in this plan or this file: ${id}.`);
    }
    seen.add(id);
    if (task.kind !== "page-bind") refuse(`${id} is a ${task.kind} task. plan audit adds only page-bind quality fixes.`);
    if (task.audit !== true) refuse(`${id} needs audit: true. plan audit adds only quality fix tasks.`);
    if (task.entity?.kind !== "page" || !pageIds.has(task.entity.id)) {
      refuse(`${id} is on ${task.entity?.id ?? "no page id"}, which is not a page this audit covers (${[...pageIds].join(", ") || "none"}).`);
    }
    if (task.deletes !== undefined) refuse(`${id} has deletes. A quality fix task never deletes.`);
    if (!Array.isArray(task.dependsOn) || task.dependsOn.some((dep) => dep === id || (!existing.has(dep) && !inFile.has(dep)))) {
      refuse(`${id} dependsOn must be an array of other task ids in this plan or this file: ${JSON.stringify(task.dependsOn)}.`);
    }
  }
}
