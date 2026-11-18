/** Groups a running plan's ready tasks into one batch per builder agent, app work into one batch per page, and code app work into one batch per app. Pure: it reads only the tasks. */
import { AGENTS_BY_KIND, agentFor, isRelease, norm, waitsForYes } from "./contracts.mjs";

// A page reviewer judges one page per batch.
export const BATCH_LIMITS = Object.freeze({ "fde-agent": 10, "automation-agent": 10, "agent-builder": 10, "app-agent": 10, "code-app-agent": 10, "graph-agent": 10, "page-reviewer": 1 });
// The most builder agents that run at once in one Claude session, of every kind
// and in every plan it runs. Each agent spends its own tokens: ten of each kind
// at once ran a session into its usage limit (HTTP 429) and stopped them all.
export const AGENTS_AT_ONCE = 6;
// With spread on, the person asked for parallel work: each fde, automation and
// agent-builder batch holds one task, so ready tasks go to more agents at once.
// App work is one page per batch already, and a review one task.
const SPREAD_KINDS = new Set(["fde-agent", "automation-agent", "agent-builder"]);

const planTag = (planId) => String(planId).replace(/[^A-Za-z0-9]/gu, "").slice(-6);
export const agentNameFor = (planId, agent, number) => `${planTag(planId)}-${agent}-${number}`;

export function isAgentName(planId, agent, name) {
  const prefix = `${planTag(planId)}-${agent}-`;
  return typeof name === "string" && name.startsWith(prefix) && /^[1-9]\d*$/u.test(name.slice(prefix.length));
}

const numberOf = (name) => Number(/-(\d+)$/u.exec(name)?.[1] ?? 0);
const taskOrder = (a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)) || a.id.localeCompare(b.id);

// A deploy or publish releases finished work, and a task that deletes is asked
// about first, so each waits for its dependencies to be done and never rides
// in the batch that builds them. A task joins
// through an in-batch dependency only when that dependency is not a contract
// point: every pending task of another agent that waits on it directly also
// waits on the joining task. Otherwise the dependency reports alone and
// unblocks that other agent without waiting for the rest of the chain.
function canJoin(task, { done, inBatch, askBeforeDeploy, splitsAt }) {
  if (isRelease(task) || task.deletes) return task.dependsOn.every(done) && !waitsForYes(task, askBeforeDeploy);
  return task.dependsOn.every((id) => done(id) || (inBatch.has(id) && !splitsAt(id, task)));
}

function contractPoints(pending, byId) {
  const agentOf = agentFor;
  const waiters = new Map();
  for (const task of pending) for (const id of task.dependsOn) {
    if (!waiters.has(id)) waiters.set(id, []);
    waiters.get(id).push(task);
  }
  const reach = new Map();
  const upstream = (task) => {
    if (reach.has(task.id)) return reach.get(task.id);
    const seen = new Set();
    const stack = [...task.dependsOn];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(byId.get(id)?.dependsOn ?? []));
    }
    reach.set(task.id, seen);
    return seen;
  };
  return (depId, task) => {
    const dep = byId.get(depId);
    return (waiters.get(depId) ?? []).some((waiter) => agentOf(waiter) !== agentOf(dep) && !upstream(waiter).has(task.id));
  };
}

function growBatch(candidates, options, limit) {
  const batch = [];
  const inBatch = new Set();
  let grew = true;
  while (grew && batch.length < limit) {
    grew = false;
    for (const task of candidates) {
      if (batch.length >= limit) break;
      if (inBatch.has(task.id) || !canJoin(task, { ...options, inBatch })) continue;
      // A task with an open question waits for its answer alone, so it never
      // holds back the other ready tasks of its agent.
      if (batch.length && (task.question || batch[0].question)) continue;
      batch.push(task);
      inBatch.add(task.id);
      grew = true;
    }
  }
  return batch;
}

// App work goes one page at a time: a layout and a bind of the same page, the
// app task of one app, or the publish tasks of one app. A task with no entity
// name is its own page.
function pageOf(task) {
  const entityName = norm(task.entity?.name);
  if (!entityName) return `task:${task.id}`;
  return task.kind === "publish" || task.kind === "app" ? `app:${entityName}` : `page:${entityName}`;
}

// Code app work goes one app at a time: its tasks share the app's checkout and
// its branch, a change and the publish after it alike.
const codeAppOf = (task) => (norm(task.entity?.name) ? `code:${norm(task.entity.name)}` : `task:${task.id}`);

function groupsOf(candidates, keyOf) {
  const groups = new Map();
  for (const task of candidates) {
    const key = keyOf(task);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  return [...groups.values()];
}

// An app agent keeps its page. A retry goes back to the agent it last ran on,
// and a bind goes back to the agent that built its page's layout, so the bind
// starts with the sheets, ids and page it already read. Either way that agent
// must be idle and no task was handed back twice. Anything else, an app task
// and a publish too, starts a new agent, so each page gets a clean context.
function appAgentFor(batch, { planId, claimed, next, tasks }) {
  const reusable = (name) => isAgentName(planId, "app-agent", name) && !claimed.has(name) &&
    batch.every((task) => (task.handBacks ?? 0) < 2);
  const last = new Set(batch.map((task) => task.agentName));
  const [only] = last;
  if (last.size === 1 && reusable(only)) return only;
  if (batch.some((task) => task.agentName || task.kind === "publish" || task.kind === "app")) return next;
  const pages = new Set(batch.map(pageOf));
  const layoutAgents = new Set(tasks.filter((task) => task.kind === "page-layout" && task.status === "done" && pages.has(pageOf(task)))
    .map((task) => task.agentName));
  const [builder] = layoutAgents;
  return layoutAgents.size === 1 && reusable(builder) ? builder : next;
}

// One app builder keeps one app. A later task of that app, a retry or its
// publish goes back to the agent that last worked on it, which already holds
// the checkout and what it read, when that agent is idle and no task was
// handed back twice. Anything else starts a new agent.
function codeAgentFor(batch, { planId, claimed, next, tasks }) {
  if (batch.some((task) => (task.handBacks ?? 0) >= 2)) return next;
  const app = codeAppOf(batch[0]);
  const last = tasks.filter((task) => isAgentName(planId, "code-app-agent", task.agentName) && codeAppOf(task) === app)
    .sort((a, b) => String(a.startedAt ?? "").localeCompare(String(b.startedAt ?? ""))).at(-1)?.agentName;
  return last && !claimed.has(last) ? last : next;
}

// A task whose builder reported waiting (it started a long platform run) is not
// ready again until its checkAfter time.
export const waitsUntil = (task, now = Date.now()) => (task.checkAfter && Date.parse(task.checkAfter) > now ? task.checkAfter : null);

// noResume: this Claude session has no SendMessage, so an agent that ran
// cannot take more work. Every batch then gets a new agent name, never a
// finished agent's name, whose bridge state would not match the new agent.
// othersBusy: the agents this session runs for its other plans, which count
// toward AGENTS_AT_ONCE too. full: a ready batch waits for a free agent.
export function pickBatches(tasks, { planId, askBeforeDeploy = false, spawned = [], noResume = false, spread = false, othersBusy = [], now = Date.now() } = {}) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const done = (id) => byId.get(id)?.status === "done";
  const pending = tasks.filter((task) => task.status === "pending" && !waitsUntil(task, now)).sort(taskOrder);
  const splitsAt = contractPoints(pending, byId);
  const ready = pending.filter((task) => task.dependsOn.every(done));
  const manual = ready.filter((task) => AGENTS_BY_KIND[task.kind] === "user");
  const needsYes = ready.filter((task) => waitsForYes(task, askBeforeDeploy));
  const runningTasks = tasks.filter((task) => task.status === "running");
  const busy = [...new Set(runningTasks.filter((task) => task.agentName).map((task) => task.agentName))].sort();
  // A code app with a task running is in someone's hands: nothing else of it starts.
  const codeAppsBusy = new Set(runningTasks.filter((task) => agentFor(task) === "code-app-agent").map(codeAppOf));
  const batches = [];
  const taken = new Set();
  let running = busy.length + new Set(othersBusy).size;
  let full = false;
  for (const agent of Object.keys(BATCH_LIMITS)) {
    const claimed = new Set(busy.filter((name) => isAgentName(planId, agent, name)));
    const used = new Set([...tasks.map((task) => task.agentName).filter((name) => isAgentName(planId, agent, name))]);
    const limit = spread && SPREAD_KINDS.has(agent) ? 1 : BATCH_LIMITS[agent];
    for (;;) {
      const candidates = pending.filter((task) => agentFor(task) === agent && !taken.has(task.id));
      const options = { done, askBeforeDeploy, splitsAt };
      const firstOf = (groups) => groups.map((group) => growBatch(group, options, limit)).find((found) => found.length) ?? [];
      const batch = agent === "app-agent" ? firstOf(groupsOf(candidates, pageOf))
        : agent === "code-app-agent" ? firstOf(groupsOf(candidates.filter((task) => !codeAppsBusy.has(codeAppOf(task))), codeAppOf))
          : growBatch(candidates, options, limit);
      if (!batch.length) break;
      if (running >= AGENTS_AT_ONCE) { full = true; break; }
      const next = agentNameFor(planId, agent, Math.max(0, ...[...used, ...claimed].map(numberOf)) + 1);
      let agentName;
      // A review is worth having because its agent did not see the page before:
      // every review, a second round too, gets a new one.
      if (noResume || agent === "page-reviewer") agentName = next;
      else if (agent === "app-agent") agentName = appAgentFor(batch, { planId, claimed, next, tasks });
      else if (agent === "code-app-agent") agentName = codeAgentFor(batch, { planId, claimed, next, tasks });
      else {
        // Two hand-backs mean that agent could not finish; its context is not trusted again.
        const fresh = batch.some((task) => (task.handBacks ?? 0) >= 2);
        const idle = [...used].filter((name) => !claimed.has(name)).sort((a, b) => numberOf(a) - numberOf(b));
        agentName = fresh || !idle.length ? next : idle[0];
      }
      claimed.add(agentName);
      used.add(agentName);
      running += 1;
      for (const task of batch) taken.add(task.id);
      if (agent === "code-app-agent") codeAppsBusy.add(codeAppOf(batch[0]));
      batches.push({ agent, agentName, resume: spawned.includes(agentName), tasks: batch });
    }
  }
  return { batches, needsYes, manual, busy, full };
}
