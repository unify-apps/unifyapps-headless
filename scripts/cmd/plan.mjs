/** M6 plan commands. The plan string is always re-parsed inside a merge. */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { AGENTS_BY_KIND, DEFAULT_MODE, ENTITY_TYPES, UaError, actorsMatch, agentFor, askPolicy, PAGE_DESIGN, idsIn, isRelease, mergeRefs, norm, parseSpecBody, refsMatch, samePage, specFormat, toolAccess, validateTasks, waitsForYes, waitsOn } from "../lib/contracts.mjs";
import { propose } from "./plan-propose.mjs";
import { AGENTS_AT_ONCE, BATCH_LIMITS, isAgentName, pickBatches, waitsUntil } from "../lib/batches.mjs";
import { dispatchMessage, confirmQuestion, reportCommand, memoryCommand, sendCalls } from "../lib/dispatch-message.mjs";
import { knownEnvironment } from "../platform/user-context.mjs";
import { isUaPlan, parseFrontmatter, parseMemory, parsePlan, renderFrontmatter, renderPlan } from "../lib/formats.mjs";
import { addSectionLines } from "../lib/spec-markdown.mjs";
import { readPlanStatus, statusLine, withPlanStatus } from "../lib/plan-status.mjs";
import { batchFiles, cacheRecords, executionActor, lastBatchFiles, readRecord, readState, renderPlan as renderLocalPlan, renderSpec, sessionHome, writeBatchMessage, writeState } from "../workspace/local.mjs";
import { refreshCurrentIfStale } from "../workspace/solution-sync.mjs";
import { readChatTasks, readLiveSessions, readPlans } from "../workspace/solution-work.mjs";
import { callTenantTool } from "../platform/tenant-mcp.mjs";
import { cachedIdFor, checkpointEntityRef, isSafeEntityPart, readCachedEntity, versionedTargets } from "../workspace/entity-cache.mjs";
import { runsByItself } from "../lib/cache-views.mjs";
import { carriedAudits, fixesFor, openPageTaskIds, qualityDue, validateQualityTasks } from "../lib/quality.mjs";
import { entityTable } from "../lib/entity-links.mjs";
import { MAX_REVIEW_FIXES, designReportProblem, findingLine, polishLines, reviewProblem } from "../lib/page-jobs.mjs";

const PLAN = ENTITY_TYPES.PLAN;
const SPEC = ENTITY_TYPES.SPEC;
const SOLUTION = ENTITY_TYPES.SOLUTION;
const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DISPATCH_TEMPLATE = path.join(PLUGIN_ROOT, "skills", "ua-change", "references", "dispatch-template.md");
// What each builder can call: its agent file's `tools:` line and the tool list
// the plugin ships. Read once; an unreadable file skips the check.
let toolAccessCache;
function builderToolAccess() {
  if (toolAccessCache !== undefined) return toolAccessCache;
  try {
    const agents = [...new Set(Object.values(AGENTS_BY_KIND))].filter((agent) => agent !== "user");
    const files = Object.fromEntries(agents.map((agent) => [agent, fs.readFileSync(path.join(PLUGIN_ROOT, "agents", `${agent}.md`), "utf8")]));
    const { servers } = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "scripts", "lib", "tool-servers.json"), "utf8"));
    toolAccessCache = toolAccess(files, servers);
  } catch {
    toolAccessCache = null;
  }
  return toolAccessCache;
}
const now = () => new Date().toISOString();
const sid = (ctx) => ctx.state?.solutionId;
const actor = (ctx) => ctx.actor ?? executionActor();
// Another person sees a plan's owner and runner by email; the lock checks still compare clientId and session.
const withEmail = (ctx, who) => (ctx.state?.userEmail ? { ...who, email: ctx.state.userEmail } : { ...who });
const session = (ctx) => ctx.state?.claudeSessionId ?? process.env.CLAUDE_CODE_SESSION_ID ?? "";
const bad = (message) => { throw new UaError("INVALID_PLAN", message); };
const tableFor = (ctx, tasks) => entityTable(ctx.state?.tenant, tasks);
// A run that stopped before its report is not a failed build: a usage limit, an
// HTTP 429 or a stall stops the agent, and its writes may already have landed.
const STOPPED_BEFORE_REPORT = "The last run stopped before its report. Earlier writes may have landed; read by name before you create.";
// A stop the router marks as the usage limit (HTTP 429) says nothing about the
// task: it is handed back and never counts toward the hand-backs that fail it.
const STOPPED_FOR_USAGE_LIMIT = "The last run stopped at the usage limit before its report. Earlier writes may have landed; read by name before you create.";
// The last few status moves of a task: when, to what, and which command made the
// move. A task offered again while its agent still worked (R024-4) could not be
// traced, because nothing said who had set it back; a refused report now says so.
const MOVES_KEPT = 4;
function moved(task, at, by) {
  task.moves = [...(Array.isArray(task.moves) ? task.moves : []), `${at.slice(0, 19)}Z ${task.status} by ${by}`].slice(-MOVES_KEPT);
}

// A reply names a task, never its body: the builder reads the body from its message file.
const brief = (task) => ({ id: task.id, title: task.title, status: task.status, ...(task.status === "running" ? { agentName: task.agentName } : {}) });

function rememberSessionPlan(ctx, planId) {
  const state = readState(ctx.home, ctx.sessionId) ?? ctx.state ?? {};
  writeState(ctx.home, { planIds: [...new Set([...(state.planIds ?? []), planId])] }, ctx.sessionId);
}

function rememberAgentNames(ctx, names) {
  const state = readState(ctx.home, ctx.sessionId) ?? ctx.state ?? {};
  writeState(ctx.home, { agentNames: [...new Set([...(state.agentNames ?? []), ...names])] }, ctx.sessionId);
}

// What pickBatches needs from this session: the agents it started, whether it
// can resume one at all (--no-resume: this session has no SendMessage), whether
// the person asked for this plan's work spread over more agents (--spread), and
// the agents its other plans still run, which count toward AGENTS_AT_ONCE.
function sessionAgents(ctx, planId) {
  const state = readState(ctx.home, ctx.sessionId) ?? {};
  return { spawned: state.agentNames ?? [], noResume: state.noResume === true,
    spread: (state.spreadPlans ?? []).includes(planId), othersBusy: otherPlansBusy(ctx, planId, state) };
}

// The agents still at work for this session's other running plans, read from
// the local copy of each plan, so the cap needs no tenant read.
function otherPlansBusy(ctx, planId, state = readState(ctx.home, ctx.sessionId) ?? {}) {
  const names = new Set();
  for (const id of state.planIds ?? []) {
    if (id === planId) continue;
    const record = readRecord(ctx.home, "plan", id);
    if (record?.properties?.status !== "in_progress") continue;
    let parsed;
    try { parsed = parsePlan(record.properties.plan); } catch { continue; }
    if (parsed.meta.runner?.claudeSessionId !== session(ctx)) continue;
    for (const task of parsed.tasks) if (task.status === "running" && task.agentName) names.add(task.agentName);
  }
  return [...names];
}

// --agent-ids "<agentName>=<agentId>,…": the agentId each Agent() call returned.
// Where a session has SendMessage, it reaches a finished builder by that id;
// by name only where Agent() keeps the name. A newer id for a name replaces the old.
function rememberAgentIds(ctx, value) {
  if (value === undefined) return;
  const pairs = String(value).split(",").map((pair) => pair.trim()).filter(Boolean).map((pair) => {
    // An agent id may be a bare id or <name>@session-<id>, as Agent() returns it in some versions.
    const match = /^([A-Za-z0-9][\w-]*)=([A-Za-z0-9][\w.@-]*)$/u.exec(pair);
    if (!match) throw new UaError("USAGE", `--agent-ids takes <agentName>=<agentId> pairs, separated by commas; "${pair}" is not one.`);
    return [match[1], match[2]];
  });
  if (!pairs.length) throw new UaError("USAGE", "--agent-ids takes <agentName>=<agentId> pairs, separated by commas.");
  const state = readState(ctx.home, ctx.sessionId) ?? ctx.state ?? {};
  writeState(ctx.home, { agentIds: { ...(state.agentIds ?? {}), ...Object.fromEntries(pairs) } }, ctx.sessionId);
}

function taskIds(value) {
  const ids = String(value ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (!ids.length) bad("A task id is required.");
  if (new Set(ids).size !== ids.length) bad("A task id is listed twice.");
  return ids;
}

function ensureBelongs(record, ctx, type) {
  if (!record || record.entityType !== type || record.properties?.solutionId !== sid(ctx)) {
    throw new UaError("NOT_FOUND", undefined, { host: ctx.state?.tenant });
  }
  if (type === PLAN && !isUaPlan(record)) {
    throw new UaError("NOT_FOUND", undefined, { host: ctx.state?.tenant });
  }
  return record;
}

function ensureOwner(meta, ctx) {
  const who = actor(ctx);
  if (!who || !actorsMatch(meta.owner, who)) bad("Only the plan owner can change this plan.");
}

function ensurePlannedActor(meta, ctx, { transferred = false } = {}) {
  const who = actor(ctx);
  if (transferred) {
    if (actorsMatch(meta.runner, who) && meta.runner?.claudeSessionId === session(ctx)) return;
    bad("Only the resumed plan's runner can start it.");
  }
  if (actorsMatch(meta.owner, who)) return;
  bad("Only the plan owner can start a new plan.");
}

function ensureRunner(meta, ctx) {
  const who = actor(ctx);
  if (!who || !actorsMatch(meta.runner, who) || meta.runner?.claudeSessionId !== session(ctx)) {
    bad("Only this plan's current runner can change its tasks or finish it.");
  }
}

function cachePlan(ctx, record) {
  cacheRecords(ctx.home, { plans: [record] });
  renderLocalPlan(ctx.home, record);
  return record;
}

async function fetchPlan(ctx, id) {
  const record = ensureBelongs(await ctx.service.get(PLAN, id), ctx, PLAN);
  cachePlan(ctx, record);
  return { record, ...parsePlan(record.properties.plan) };
}

async function mutatePlan(ctx, id, change) {
  const updated = await ctx.service.readMergeWrite(PLAN, id, async (properties, record) => {
    ensureBelongs(record, ctx, PLAN);
    const parsed = parsePlan(properties.plan);
    const patch = await change({ ...parsed, status: properties.status, properties, record });
    if (!patch || typeof patch !== "object") bad("Plan mutation returned no change.");
    // Every plan maps to exactly one spec; a spec may have several plans.
    // Keep specId as a top-level column on every write.
    const specId = patch.specId ?? properties.specId ?? parsed.meta.specId;
    return { ...patch, ...(specId ? { specId } : {}), plan: renderPlan(parsed.meta, parsed.tasks) };
  });
  return cachePlan(ctx, updated);
}

function readJson(ctx, file, description) {
  if (!file || typeof file !== "string") bad(`${description} is required.`);
  let value;
  try { value = JSON.parse(fs.readFileSync(path.resolve(ctx.cwd ?? process.cwd(), file), "utf8")); }
  catch (error) { bad(`Cannot read ${description}: ${error.message}`); }
  return value;
}

function validateEvidence(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) bad("Review evidence must be a JSON array of strings.");
  return value;
}

function sameTaskIntent(intended, recorded) {
  if (intended.length !== recorded.length) return false;
  const byId = new Map(recorded.map((task) => [task.id, task]));
  return intended.every((task) => {
    const old = byId.get(task.id);
    return !!old && task.title === old.title && task.kind === old.kind && task.body === old.body && task.proof === old.proof &&
      (task.deletes ?? "") === (old.deletes ?? "") &&
      !!task.visual === !!old.visual && task.entity.kind === old.entity?.kind && norm(task.entity.name) === norm(old.entity?.name) &&
      (!task.entity.id || !old.entity.id || String(task.entity.id) === String(old.entity.id)) &&
      JSON.stringify([...task.dependsOn].sort()) === JSON.stringify([...(old.dependsOn ?? [])].sort());
  });
}

async function plansForSpec(ctx, specId) {
  const records = await ctx.service.search(PLAN, "solutionId", sid(ctx));
  return records.filter(isUaPlan).flatMap((record) => {
    try {
      const parsed = parsePlan(record.properties.plan);
      const linked = record.properties.specId ?? parsed.meta.specId;
      return linked === specId ? [{ record, ...parsed }] : [];
    } catch { return []; }
  });
}

const createdStamp = (record) => {
  try { return Date.parse(parsePlan(record.properties.plan).meta.createdAt) || Number(record.createdTime) || 0; }
  catch { return Number(record.createdTime) || 0; }
};

async function repairSolutionPointer(ctx, plan, { newlyCreated = false } = {}) {
  const targetTime = createdStamp(plan);
  const solution = await ctx.service.readMergeWrite(SOLUTION, sid(ctx), async (properties, latest) => {
    if (latest.id !== sid(ctx)) throw new UaError("NOT_FOUND", undefined, { host: ctx.state?.tenant });
    for (const id of new Set([properties.planId].filter((value) => value && value !== plan.id))) {
      let pointer;
      try { pointer = await ctx.service.get(PLAN, id); }
      catch (error) { if (error.code === "NOT_FOUND") continue; throw error; }
      if (!isUaPlan(pointer) && !newlyCreated) return {};
      if (pointer.properties?.solutionId !== sid(ctx)) continue;
      const pointerTime = createdStamp(pointer);
      if (pointerTime > targetTime || pointerTime === targetTime && pointer.id > plan.id) return {};
    }
    return { planId: plan.id }; // approvedPlanId is never written: the platform owns it.
  });
  cacheRecords(ctx.home, { solution });
  return solution;
}

async function repairPlanPointers(ctx, specId, plan, { newlyCreated = false } = {}) {
  const savedMeta = parsePlan(plan.properties.plan).meta;
  const needsUserId = plan.ownerUserId != null && String(savedMeta.owner?.userId ?? "") !== String(plan.ownerUserId);
  if (needsUserId || plan.properties.specId !== specId) {
    plan = await mutatePlan(ctx, plan.id, ({ meta }) => {
      if (needsUserId) meta.owner = { ...meta.owner, userId: plan.ownerUserId };
      return { specId };
    });
  }
  const targetTime = createdStamp(plan);
  const patchedSpec = await ctx.service.readMergeWrite(SPEC, specId, async (properties, latest) => {
    ensureBelongs(latest, ctx, SPEC);
    const { meta, body } = parseFrontmatter(properties.spec_md);
    const planIds = [...new Set([...(Array.isArray(meta.planIds) ? meta.planIds : []), meta.planId, plan.id].filter(Boolean))];
    const currentLatest = meta.latestPlanId ?? meta.planId;
    let makeLatest = !currentLatest || currentLatest === plan.id;
    if (!makeLatest) {
      try {
        const pointer = ensureBelongs(await ctx.service.get(PLAN, currentLatest), ctx, PLAN);
        const pointerSpec = pointer.properties.specId ?? parsePlan(pointer.properties.plan).meta.specId;
        const pointerTime = createdStamp(pointer);
        makeLatest = pointerSpec !== specId || pointerTime < targetTime || pointerTime === targetTime && pointer.id < plan.id;
      } catch (error) {
        if (error.code !== "NOT_FOUND") throw error;
        makeLatest = true;
      }
    }
    meta.planIds = planIds;
    if (makeLatest) {
      meta.latestPlanId = plan.id;
      meta.planId = plan.id; // Compatibility pointer for older plugin versions.
    }
    return { spec_md: renderFrontmatter(meta, body) };
  });
  const solution = await repairSolutionPointer(ctx, plan, { newlyCreated });
  cacheRecords(ctx.home, { solution, specs: [patchedSpec], plans: [plan] });
  renderSpec(ctx.home, patchedSpec);
  renderLocalPlan(ctx.home, plan);
  return plan;
}

// A plan create can answer an error after the tenant saved the plan, and the
// tenant's list can show that plan only minutes later. So the create keeps a
// receipt in the session state before it posts: the creationId it sent, what it
// sent, and the plan id once the tenant answers. Running the same create again
// finds that plan by the receipt instead of posting a second one.
const CREATE_LIST_WAIT_MS = 10 * 60 * 1000;
const createKey = (specId, tasks, extraMeta) => createHash("sha256")
  .update(JSON.stringify({ specId, tasks, derivedFromPlanId: extraMeta.derivedFromPlanId ?? null })).digest("hex");
const createReceipts = (ctx) => (readState(ctx.home, ctx.sessionId) ?? ctx.state ?? {}).planCreates ?? {};
function saveCreateReceipt(ctx, specId, receipt) {
  const { [specId]: _old, ...others } = createReceipts(ctx);
  writeState(ctx.home, { planCreates: receipt ? { ...others, [specId]: receipt } : others }, ctx.sessionId);
}

// The plan an earlier create of this spec saved, by its id when the tenant
// answered with one, or else by its creationId in the plan list.
async function receiptPlan(ctx, specId, receipt) {
  if (receipt.planId) {
    try { return ensureBelongs(await ctx.service.get(PLAN, receipt.planId), ctx, PLAN); }
    catch (error) { if (error.code !== "NOT_FOUND") throw error; return null; }
  }
  return (await plansForSpec(ctx, specId)).find((candidate) => candidate.meta.creationId === receipt.creationId)?.record ?? null;
}

const unconfirmedCreate = (ctx, title, minutes) => new UaError("PLATFORM_UNREACHABLE",
  `The tenant answered an error while saving the plan for ${title}, and it may have saved the plan anyway. ` +
  `Run the same plan create again in a minute: it finds that plan instead of making a second one. ` +
  `If the tenant still lists no such plan after ${minutes} more minutes, plan create makes it.`, { host: ctx.state?.tenant });

async function persistNewPlan(ctx, { specId, parsedSpec, tasks, evidence = [], extraMeta = {} }) {
  const who = actor(ctx);
  const key = createKey(specId, tasks, extraMeta);
  const earlier = createReceipts(ctx)[specId];
  if (earlier) {
    const saved = await receiptPlan(ctx, specId, earlier);
    if (saved) {
      const repaired = await repairPlanPointers(ctx, specId, saved, { newlyCreated: true });
      saveCreateReceipt(ctx, specId, null);
      // The same create again: that saved plan is the answer. Other tasks make a new plan beside it.
      if (earlier.key === key) return repaired;
    } else {
      const waited = Date.now() - Date.parse(earlier.startedAt);
      if (waited < CREATE_LIST_WAIT_MS) throw unconfirmedCreate(ctx, parsedSpec.meta.title, Math.ceil((CREATE_LIST_WAIT_MS - waited) / 60000));
      saveCreateReceipt(ctx, specId, null);
    }
  }
  const creationId = randomUUID();
  const meta = {
    nebula: 3, specId, mode: parsedSpec.meta.mode ?? ctx.state?.mode ?? DEFAULT_MODE, title: parsedSpec.meta.title, owner: withEmail(ctx, who),
    askBeforeDeploy: parsedSpec.meta.askBeforeDeploy !== false,
    ...(Array.isArray(parsedSpec.meta.releaseYes) ? { releaseYes: parsedSpec.meta.releaseYes } : {}),
    touches: mergeRefs(parsedSpec.meta.touches ?? [], tasks.map((task) => task.entity)),
    reviewEvidence: evidence, revision: 1, revisionHistory: [], creationId,
    // plan revise holds a plan to the graph rules it was made under; one with
    // no mark was made before page designs (validateTasks' pageDesign).
    pageDesign: PAGE_DESIGN.BIND_THEN_REVIEW,
    ...extraMeta, createdAt: now(),
  };
  const properties = { solutionId: sid(ctx), specId, status: "planned", plan: renderPlan(meta, tasks) };
  saveCreateReceipt(ctx, specId, { creationId, key, startedAt: now() });
  let plan;
  try {
    plan = await ctx.service.create(PLAN, properties, { retry: false });
  } catch (error) {
    if (error.code !== "PLATFORM_UNREACHABLE") { saveCreateReceipt(ctx, specId, null); throw error; }
    for (let scan = 0; scan < 3 && !plan; scan++) {
      try {
        const existing = await plansForSpec(ctx, specId);
        plan = existing.find((candidate) => candidate.meta.creationId === creationId)?.record;
      } catch (lookupError) {
        if (lookupError.code !== "PLATFORM_UNREACHABLE") throw lookupError;
        if (scan === 2) throw lookupError;
      }
      if (!plan && scan < 2) await new Promise((resolve) => setTimeout(resolve, [1000, 3000][scan]));
    }
    // Unknown outcome: the receipt stays, so a second POST cannot duplicate it.
    if (!plan) throw unconfirmedCreate(ctx, parsedSpec.meta.title, CREATE_LIST_WAIT_MS / 60000);
  }
  saveCreateReceipt(ctx, specId, { creationId, key, startedAt: meta.createdAt, planId: plan.id });
  const repaired = await repairPlanPointers(ctx, specId, plan, { newlyCreated: true });
  saveCreateReceipt(ctx, specId, null);
  return repaired;
}

async function incompletePlanForCreate(ctx, specId, parsedSpec, tasks) {
  const candidates = await plansForSpec(ctx, specId);
  if (!candidates.length) return null;
  const linked = new Set([...(Array.isArray(parsedSpec.meta.planIds) ? parsedSpec.meta.planIds : []),
    parsedSpec.meta.planId].filter(Boolean));
  const solution = await ctx.service.get(SOLUTION, sid(ctx));
  candidates.sort((a, b) => createdStamp(b.record) - createdStamp(a.record) || b.record.id.localeCompare(a.record.id));
  return candidates.find((candidate) => {
    if (candidate.meta.title !== parsedSpec.meta.title || !sameTaskIntent(tasks, candidate.tasks)) return false;
    const ownerMissing = candidate.record.ownerUserId != null &&
      String(candidate.meta.owner?.userId ?? "") !== String(candidate.record.ownerUserId);
    const specPointerMissing = !linked.has(candidate.record.id);
    const solutionPointerMissing = !solution.properties?.planId && linked.has(candidate.record.id);
    return ownerMissing || specPointerMissing || solutionPointerMissing;
  })?.record ?? null;
}

async function create(ctx, flags) {
  const specId = flags.spec;
  if (!specId) bad("--spec is required.");
  const spec = ensureBelongs(await ctx.service.get(SPEC, specId), ctx, SPEC);
  const parsedSpec = parseFrontmatter(spec.properties.spec_md ?? "");
  if (parsedSpec.meta.nebula !== 3 || !parsedSpec.meta.acceptedAt) bad("Plan needs an accepted spec.");
  const rawTasks = readJson(ctx, flags["tasks-file"], "--tasks-file");
  const tasks = validateTasks(rawTasks, parsedSpec.body, { format: specFormat(parsedSpec.meta), access: builderToolAccess() });
  const evidence = flags["evidence-file"] ? validateEvidence(readJson(ctx, flags["evidence-file"], "--evidence-file")) : [];
  const incomplete = await incompletePlanForCreate(ctx, specId, parsedSpec, tasks);
  if (incomplete) {
    const repaired = await repairPlanPointers(ctx, specId, incomplete);
    if (createReceipts(ctx)[specId]?.creationId === parsePlan(incomplete.properties.plan).meta.creationId) saveCreateReceipt(ctx, specId, null);
    rememberSessionPlan(ctx, repaired.id);
    return { data: { planId: repaired.id, tasks: tasks.length, recovered: true }, message: `Plan ready: ${parsedSpec.meta.title}.` };
  }
  let extraMeta = {};
  if (flags["derived-from"]) {
    const source = await fetchPlan(ctx, flags["derived-from"]);
    ensureOwner(source.meta, ctx);
    extraMeta = {
      derivedFromPlanId: source.record.id, supersedesPlanId: source.record.id,
      derivedFromPlanStatus: source.record.properties.status,
      carriedForward: source.tasks.filter((task) => task.status === "done").map(carriedTask),
      reconciliationRequired: source.tasks.filter((task) => task.status === "running").map(unsettledTask),
    };
  }
  const plan = await persistNewPlan(ctx, { specId, parsedSpec, tasks, evidence, extraMeta });
  rememberSessionPlan(ctx, plan.id);
  return { data: { planId: plan.id, tasks: tasks.length }, message: `Plan ready: ${parsedSpec.meta.title}.` };
}

function counts(tasks) {
  const result = { pending: 0, running: 0, done: 0, failed: 0, skipped: 0 };
  for (const task of tasks) if (Object.hasOwn(result, task.status)) result[task.status]++;
  return result;
}

// One line the router can say as it is: how far the build is and who is out.
function progressLine(tasks, at = Date.now()) {
  const tally = counts(tasks);
  const minutes = (task) => (task.startedAt ? `, ${Math.max(0, Math.floor((at - Date.parse(task.startedAt)) / 60000))} min` : "");
  const running = tasks.filter((task) => task.status === "running")
    .map((task) => `${task.title} (${task.agentName ?? "no agent"}${minutes(task)})`);
  const failed = tasks.filter((task) => task.status === "failed").map((task) => task.id);
  const later = tasks.filter((task) => task.status === "pending" && waitsUntil(task, at)).map((task) => `${task.id} at ${task.checkAfter.slice(11, 16)} UTC`);
  return [`${tally.done} of ${tasks.length} done`, ...(running.length ? [`running: ${running.join(", ")}`] : []),
    `waiting: ${tally.pending}`, ...(later.length ? [`checks again: ${later.join(", ")}`] : []), ...(failed.length ? [`failed: ${failed.join(", ")}`] : [])].join(" · ");
}

const requiredFlag = (value, flag) => {
  const clean = String(value ?? "").trim();
  if (!clean) bad(`${flag} is required.`);
  return clean;
};

const sameOneTaskIntent = (left, right) => sameTaskIntent([left], [right]);

// A done or skipped task is settled: plan revise keeps it as the plan stored it.
const SETTLED = new Set(["done", "skipped"]);
// The tasks whose words are not checked again: every done task, and a skipped one
// the tasks file leaves out. A skipped task the file sends may run again, so it is checked.
const settledIds = (tasks, raw) => {
  const sent = new Set(Array.isArray(raw) ? raw.map((task) => task?.id) : []);
  return new Set(tasks.filter((task) => task.status === "done" || (task.status === "skipped" && !sent.has(task.id))).map((task) => task.id));
};

// The first field a caller's copy of a task changes, for the refusal that names it.
function changedField(next, old) {
  const pairs = [["title", next.title, old.title], ["kind", next.kind, old.kind], ["body", next.body, old.body], ["proof", next.proof, old.proof],
    ["deletes", next.deletes ?? "", old.deletes ?? ""], ["entity", `${next.entity.kind} ${norm(next.entity.name)}`, `${old.entity?.kind} ${norm(old.entity?.name)}`],
    ["dependsOn", JSON.stringify([...next.dependsOn].sort()), JSON.stringify([...(old.dependsOn ?? [])].sort())]];
  return pairs.find(([, a, b]) => a !== b)?.[0] ?? "entity id";
}

// Where a task sits in the graph: its kind, its entity and what it waits on.
// Its title, body and proof are words, not graph. An entity id that a done task
// reported (the app became spotify-clone-2, say) names the same entity.
function sameGraphPlace(task, old, reportedIds) {
  const sameId = !task.entity.id || !old.entity.id || String(task.entity.id) === String(old.entity.id) || reportedIds.has(String(task.entity.id));
  return task.kind === old.kind && task.entity.kind === old.entity?.kind && norm(task.entity.name) === norm(old.entity?.name) && sameId &&
    JSON.stringify([...task.dependsOn].sort()) === JSON.stringify([...(old.dependsOn ?? [])].sort());
}

function reportedIdsOf(tasks) {
  return new Set(tasks.filter((task) => task.status === "done").flatMap((task) => [task.entity?.id, ...Object.values(task.result?.ids ?? {})])
    .filter((id) => typeof id === "string" || typeof id === "number").map(String));
}

function revisionStats(previous, intended) {
  const before = new Map(previous.map((task) => [task.id, task]));
  const after = new Map(intended.map((task) => [task.id, task]));
  const added = intended.filter((task) => !before.has(task.id));
  const removed = previous.filter((task) => !after.has(task.id));
  const changed = intended.filter((task) => before.has(task.id) && !sameOneTaskIntent(task, before.get(task.id)));
  // A task whose words alone changed (a wording fix, an id an earlier task
  // reported) keeps its place in the graph, so it does not count as a graph change.
  const reportedIds = reportedIdsOf(previous);
  const graphChanged = changed.filter((task) => !sameGraphPlace(task, before.get(task.id), reportedIds));
  const remaining = previous.filter((task) => !SETTLED.has(task.status));
  const changedRemaining = [...removed, ...graphChanged].filter((task) => !SETTLED.has(before.get(task.id)?.status));
  const priorKinds = new Set(previous.map((task) => task.entity?.kind));
  const newSurfaceKinds = [...new Set(added.map((task) => task.entity?.kind).filter((kind) => !priorKinds.has(kind)))];
  return { added, removed, changed, graphChanged, remaining, changedRemaining, newSurfaceKinds };
}

// What a pending task learned while the plan ran. plan revise keeps it when the
// task keeps its place in the graph.
const PENDING_STATE = ["answer", "confirmedAt", "question", "attempts", "agentName", "error", "handBacks", "usageStops", "builderNotes", "checkAfter", "waits", "reviewFindings", "reviewRounds", "earlierFindings", "earlierQualities", "closeOnFix", "closingResult"];

// plan revise keeps every done and skipped task from the stored plan, so the
// tasks file holds only the tasks still to do and may name a done task in
// dependsOn. A settled task the file still lists is put back from the stored plan
// the same way.
function withDoneTasks(stored, raw) {
  if (!Array.isArray(raw)) return raw;
  const sent = new Set(raw.map((task) => task?.id));
  const kept = stored.filter((task) => SETTLED.has(task.status) && !sent.has(task.id))
    // A graph task's node and edge lists travel too: the coverage check counts what a done stage built.
    .map(({ id, title, kind, entity, dependsOn, body, proof, visual, deletes, audit, graphNodes, graphEdges }) => ({ id, title, kind, entity: { ...entity }, dependsOn: [...dependsOn], body, proof, visual,
      ...(deletes === undefined ? {} : { deletes }), ...(audit === true ? { audit } : {}),
      ...(graphNodes ? { graphNodes: [...graphNodes] } : {}), ...(graphEdges ? { graphEdges: [...graphEdges] } : {}) }));
  // t tasks first, then the quality fix tasks plan audit added, each by its own number.
  const rank = (task) => {
    const match = /^([tq])(\d+)$/u.exec(String(task?.id ?? ""));
    return match ? [match[1] === "t" ? 0 : 1, Number(match[2])] : [2, 0];
  };
  return [...kept, ...raw].sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1]);
}

function revisedTasks(previous, intended, impact) {
  if (previous.some((task) => task.status === "running")) bad("Wait for running tasks to return before revising this plan.");
  const nextById = new Map(intended.map((task) => [task.id, task]));
  for (const task of previous.filter((item) => item.status === "done")) {
    // The stored copy holds the id the task reported, which the caller's copy may
    // not, and what the CLI worked out from the spec when it was built (visual,
    // job, design, look, its review's layout), which a later spec revise may change.
    const next = nextById.get(task.id);
    if (next && !sameOneTaskIntent({ ...next, visual: task.visual, entity: { ...next.entity, id: undefined } }, task)) {
      bad(`Completed task ${task.id} cannot be rewritten: the tasks file changes its ${changedField(next, task)}. ` +
        "Leave done tasks out of the tasks file; plan revise keeps them as they are.");
    }
  }
  const stats = revisionStats(previous, intended);
  if (impact === "absorbed") {
    const existingLimit = Math.max(1, Math.ceil(stats.remaining.length / 2));
    if (stats.added.length > 2 || stats.changedRemaining.length > existingLimit) {
      bad("This graph change is too large to absorb silently. Use --impact major after the user chooses how to proceed.");
    }
    if (stats.newSurfaceKinds.length) bad("A new surface type cannot be absorbed silently.");
    // A release that is new or changes its place in the graph needs the person; new
    // words on one that stays do not, and nor does a wait on a task this revise
    // adds: that only holds the release until the added work is done.
    const addedIds = new Set(stats.added.map((task) => task.id));
    const beforeById = new Map(previous.map((task) => [task.id, task]));
    const onlyWaitsLonger = (task) => {
      const old = beforeById.get(task.id);
      if (!old) return false;
      const extra = task.dependsOn.filter((id) => !(old.dependsOn ?? []).includes(id));
      return (old.dependsOn ?? []).every((id) => task.dependsOn.includes(id)) && extra.length > 0 && extra.every((id) => addedIds.has(id)) &&
        sameGraphPlace({ ...task, dependsOn: old.dependsOn ?? [] }, old, reportedIdsOf(previous));
    };
    const sensitive = [...stats.added, ...stats.graphChanged.filter((task) => !onlyWaitsLonger(task))]
      .some((task) => isRelease(task) || task.kind === "automation-shell");
    if (sensitive) bad("Deploy or publish changes cannot be absorbed silently.");
    // A delete is asked about before it is sent; a new one needs the person too.
    const before = new Map(previous.map((task) => [task.id, task]));
    if (intended.some((task) => task.deletes && task.deletes !== before.get(task.id)?.deletes)) bad("A new delete cannot be absorbed silently.");
  }
  const done = new Map(previous.filter((task) => task.status === "done").map((task) => [task.id, task]));
  // A skipped task sent back unchanged stays skipped; sent with new words, it runs again.
  const skipped = new Map(previous.filter((task) => task.status === "skipped").map((task) => [task.id, task]));
  const keptSkipped = (task) => skipped.has(task.id) && sameOneTaskIntent({ ...task, visual: skipped.get(task.id).visual,
    entity: { ...task.entity, id: undefined } }, skipped.get(task.id));
  const pending = new Map(previous.filter((task) => task.status === "pending").map((task) => [task.id, task]));
  const reportedIds = reportedIdsOf(previous);
  // A pending task that keeps its place in the graph keeps what the run learned
  // about it: the person's answer and yes, an open question, its attempts and
  // agent, and the entity id a layout a review sent back already reported.
  const carried = (task) => {
    const old = pending.get(task.id);
    if (!old || !sameGraphPlace(task, old, reportedIds)) return task;
    const kept = Object.fromEntries(PENDING_STATE.filter((key) => old[key] !== undefined).map((key) => [key, structuredClone(old[key])]));
    const entity = !task.entity.id && old.entity?.id ? { ...task.entity, id: old.entity.id } : task.entity;
    return { ...task, ...kept, entity };
  };
  return {
    tasks: intended.map((task) => done.has(task.id) ? structuredClone(done.get(task.id))
      : keptSkipped(task) ? structuredClone(skipped.get(task.id)) : carried(task)),
    stats: { added: stats.added.length, removed: stats.removed.length, changed: stats.changed.length,
      previousRemaining: stats.remaining.length },
    removed: stats.removed.filter((task) => !SETTLED.has(task.status)).map((task) => `${task.id} ${task.title}`),
  };
}

// The plan's accepted spec, and the task graph check plan revise and plan audit
// both run against it.
// Checks a task list against an accepted spec the way plan create does; `settled` names the
// tasks whose words are not checked again.
const checkAgainst = (parsedSpec) => (tasks, meta, settled = new Set()) => validateTasks(tasks, parsedSpec.body,
  { format: specFormat(parsedSpec.meta), access: builderToolAccess(), pageDesign: Number(meta.pageDesign) || PAGE_DESIGN.NONE, settled });

async function specCheck(ctx, current) {
  const specId = current.record.properties.specId ?? current.meta.specId;
  const spec = ensureBelongs(await ctx.service.get(SPEC, specId), ctx, SPEC);
  const parsedSpec = parseFrontmatter(spec.properties.spec_md ?? "");
  return { specId, spec, parsedSpec, check: checkAgainst(parsedSpec) };
}

function ensurePlanEditor(meta, status, ctx) {
  if (status === "planned") ensureOwner(meta, ctx);
  else if (status === "in_progress") ensureRunner(meta, ctx);
  else bad("Only a planned or in-progress plan can be revised.");
}

// --ready-when "deploy <name>; publish <name>": releases the accepted spec does
// not name, found during the run. Each line releases an entity a deploy or
// publish task of the tasks file names; one Touches does not hold yet gets its
// Touches line too, in the form "- <kind> · <name> · <id or new>".
function readyWhenAdditions(value, rawTasks, { touches: specTouches, releases: specReleases }) {
  const lines = String(value).split(/[;\n]/u).map((line) => line.trim().replace(/^-\s*/u, "")).filter(Boolean);
  if (!lines.length) bad('--ready-when takes "deploy <automation>" or "publish <app>" lines, separated by semicolons.');
  const touches = [];
  const releases = [];
  for (const line of lines) {
    const match = /^(deploy|publish)\s+(.+)$/iu.exec(line);
    if (!match) bad(`--ready-when line "${line}" is not "deploy <automation>" or "publish <app>".`);
    const action = match[1].toLowerCase();
    const task = (Array.isArray(rawTasks) ? rawTasks : []).find((item) => item?.kind === action && norm(item.entity?.name) === norm(match[2]));
    if (!task) bad(`--ready-when line "${line}" names no ${action} task in the tasks file. Name the ${action === "deploy" ? "automation" : "app or AI agent"} as its task's entity does.`);
    const { kind, name, id } = task.entity;
    // A line the spec already holds (a revise run again) is not added twice.
    if (!specReleases.some((item) => item.action === action && item.ref.kind === kind && norm(item.ref.name) === norm(name))) releases.push(`- ${action} ${name.trim()}`);
    if (!specTouches.some((ref) => ref.kind === kind && norm(ref.name) === norm(name))) touches.push(`- ${kind} · ${name.trim()} · ${id ?? "new"}`);
  }
  if (!releases.length) bad("The accepted spec already names every --ready-when line. Run plan revise without --ready-when.");
  return { releases: [...new Set(releases)], touches: [...new Set(touches)] };
}

async function revise(ctx, planId, flags) {
  const impact = requiredFlag(flags.impact, "--impact");
  if (!["absorbed", "major"].includes(impact)) bad("--impact must be absorbed or major.");
  const reason = requiredFlag(flags.reason, "--reason");
  const rawTasks = readJson(ctx, flags["tasks-file"], "--tasks-file");
  const evidence = flags["evidence-file"] ? validateEvidence(readJson(ctx, flags["evidence-file"], "--evidence-file")) : [];
  // A release the accepted spec does not name is added only with the person's
  // own yes, which the spec keeps with who gave it.
  const addsReleases = flags["ready-when"] !== undefined;
  if (addsReleases && impact !== "major") bad("--ready-when adds a release, which is never absorbed silently: use --impact major after the person's yes.");
  if (flags["release-yes"] !== undefined && !addsReleases) bad("--release-yes goes with --ready-when.");
  const releaseYes = addsReleases ? requiredFlag(flags["release-yes"], "--release-yes") : null;
  const current = await fetchPlan(ctx, planId);
  ensurePlanEditor(current.meta, current.record.properties.status, ctx);
  const read = await specCheck(ctx, current);
  const { specId } = read;
  let { spec, parsedSpec } = read;
  let added = null;
  if (addsReleases) {
    if (specFormat(parsedSpec.meta) !== "spec") bad("An old short brief takes no new release. Accept a new spec with --derived-from.");
    added = readyWhenAdditions(flags["ready-when"], rawTasks, parseSpecBody(parsedSpec.body, { format: specFormat(parsedSpec.meta) }));
    const body = addSectionLines(added.touches.length ? addSectionLines(parsedSpec.body, "Touches", added.touches) : parsedSpec.body, "Ready when", added.releases);
    parsedSpec = { ...parsedSpec, body };
  }
  // Built on each call: parsedSpec is read again once the added releases are written.
  const intendedFor = (stored, meta) => checkAgainst(parsedSpec)(withDoneTasks(stored, rawTasks), meta, settledIds(stored, rawTasks));
  intendedFor(current.tasks, current.meta); // refuse a bad graph before any write
  if (added) {
    // The spec keeps each added line with the person's words and who said yes.
    const yes = { lines: [...added.touches, ...added.releases], yes: releaseYes, by: withEmail(ctx, actor(ctx)), at: now(), planId };
    spec = await ctx.service.readMergeWrite(SPEC, specId, (properties) => {
      const stored = parseFrontmatter(properties.spec_md ?? "");
      let body = added.touches.length ? addSectionLines(stored.body, "Touches", added.touches) : stored.body;
      body = addSectionLines(body, "Ready when", added.releases);
      const touches = parseSpecBody(body, { format: specFormat(stored.meta) }).touches;
      return { spec_md: renderFrontmatter({ ...stored.meta, touches, readyWhenAdded: [...(Array.isArray(stored.meta.readyWhenAdded) ? stored.meta.readyWhenAdded : []), yes] }, body) };
    });
    cacheRecords(ctx.home, { specs: [spec] });
    renderSpec(ctx.home, spec);
    parsedSpec = parseFrontmatter(spec.properties.spec_md ?? "");
  }
  let revision;
  let stats;
  let removed = [];
  await mutatePlan(ctx, planId, ({ meta, tasks, status }) => {
    ensurePlanEditor(meta, status, ctx);
    const merged = revisedTasks(tasks, intendedFor(tasks, meta), impact);
    tasks.splice(0, tasks.length, ...merged.tasks);
    revision = Number(meta.revision ?? 1) + 1;
    stats = merged.stats;
    removed = merged.removed;
    meta.revision = revision;
    meta.revisionHistory = [...(Array.isArray(meta.revisionHistory) ? meta.revisionHistory : []), {
      revision, at: now(), impact, reason, ...merged.stats,
    }];
    meta.reviewEvidence = [...new Set([...(Array.isArray(meta.reviewEvidence) ? meta.reviewEvidence : []), ...evidence])];
    meta.touches = mergeRefs(parsedSpec.meta.touches ?? [], tasks.map((task) => task.entity));
    return {};
  });
  // A task the file leaves out is removed, so the reply names each one.
  const gone = removed.length ? ` Removed, because the tasks file left them out: ${removed.join("; ")}.` : "";
  const releases = added ? ` Added to the accepted spec with the person's yes: ${[...added.touches, ...added.releases].map((line) => line.replace(/^-\s*/u, "")).join("; ")}.` : "";
  return { data: { planId, revision, impact, stats, removed, ...(added ? { readyWhenAdded: added.releases, touchesAdded: added.touches } : {}) },
    message: `${impact === "absorbed" ? "Plan updated." : "Plan revised."}${gone}${releases}` };
}

// The app type from the newest cached snapshot of a page task's app, stale or
// not: a builder's write marks the cache stale, which is exactly when the
// quality hold must hold, and no page edit changes an app's type. A page task
// whose entity names no app id counts the app id its result reported, as
// taskLinkRef does. A task with neither, or a name where the id goes, names no
// cached app, so it answers null: unknown is not MOBILE.
function appTypes(ctx) {
  return (task) => {
    const appId = task.entity?.appId || task.result?.ids?.app;
    return isSafeEntityPart(appId) ? readCachedEntity(ctx.home, "e_interface", appId)?.entity?.properties?.manifest?.type ?? null : null;
  };
}

const DECISIONS = ["fix-by-hand", "accept-and-publish", "finish-without-publishing"];
const ACCEPTED_SHAPE = `{ findings: [<declined advisory findings>], decision: null or one of ${DECISIONS.join(", ")}, words: null or the person's words }`;
const badFile = (message) => { throw new UaError("USAGE", message); };

// plan ready settles an audit on summary.blocking and accepted.decision, so a
// count that is not a number, or a decision in the wrong place, would hold or
// release the publish by mistake.
function auditFindings(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) badFile("--file must be a JSON object with pages, summary, findings and accepted.");
  if (!Array.isArray(raw.pages) || raw.pages.some((page) => !page?.id)) badFile("--file pages must be an array of { id, name }.");
  for (const key of ["blocking", "advisory"]) {
    if (!Number.isInteger(raw.summary?.[key]) || raw.summary[key] < 0) badFile(`--file summary.${key} must be the count of open ${key} findings.`);
  }
  if (!Array.isArray(raw.findings)) badFile("--file findings must be an array.");
  // A fix task is written per page, so every finding names the page it is on.
  const pageIds = raw.pages.map((page) => page.id);
  const stray = raw.findings.findIndex((finding) => !pageIds.includes(finding?.page));
  if (stray >= 0) badFile(`--file findings[${stray}].page must be the id of one of pages (${pageIds.join(", ")}).`);
  // A page the script could not audit goes out only on the person's yes, kept
  // on that page alone: a decision in accepted would settle every page's open
  // blocking findings with it.
  for (const page of raw.pages.filter((entry) => entry.unaudited !== undefined)) {
    const { reason, words } = page.unaudited ?? {};
    if (typeof reason !== "string" || !reason.trim() || typeof words !== "string" || !words.trim()) {
      badFile(`--file pages: ${page.id} unaudited must be { reason: <why the script could not audit it>, words: <the person's own words> }.`);
    }
    if (raw.findings.some((finding) => finding.page === page.id)) badFile(`--file pages: ${page.id} is unaudited, so findings cannot name it.`);
  }
  const blocking = raw.findings.filter((finding) => finding.severity === "blocking").length;
  if (raw.summary.blocking !== blocking) {
    badFile(`--file summary.blocking is ${raw.summary.blocking}, but findings holds ${blocking} blocking finding${blocking === 1 ? "" : "s"}.`);
  }
  const { accepted } = raw;
  if (!accepted || typeof accepted !== "object" || Array.isArray(accepted) || !Array.isArray(accepted.findings) ||
      !(accepted.decision === null || DECISIONS.includes(accepted.decision)) ||
      !(accepted.words === null || typeof accepted.words === "string")) {
    badFile(`--file accepted must be ${ACCEPTED_SHAPE}.`);
  }
  // A decision is the person's, so it is stored with what they said.
  if (accepted.decision !== null && !accepted.words?.trim()) badFile("--file accepted.words must be the person's own words when accepted.decision is set.");
  return { pages: raw.pages, summary: raw.summary, findings: raw.findings, accepted };
}

// A fix task waits on every task already building its page: its layout, its
// bind, its review, and an earlier fix task of the same file. A task with no
// page id yet (one skipped before it ran) is matched by the page's name, so the
// plan never holds two binds of one page that could run at once, and a fix
// never runs while a review could still send the page back. Other work on the
// page (a manual check after the publish, say) is not page building, and
// waiting on it could loop through the publish.
const PAGE_WORK = new Set(["page-layout", "page-bind", "page-review"]);
const withPageWork = (raw, tasks) => ({ ...raw, dependsOn: [...new Set([...raw.dependsOn, ...tasks
  .filter((task) => PAGE_WORK.has(task.kind) && samePage(task, raw))
  .map((task) => task.id)])] });

// The plan's tasks with each publish not yet done of an app the audit covers
// waiting on the fix tasks on that app's pages, and the fix tasks. A deploy,
// an AI agent's publish and another app's publish never wait on them, and a
// publish that already ran is left as it ran: the audit names it in
// publishedBefore instead.
function auditedGraph(tasks, rawTasks, meta, publishes) {
  const fixes = [];
  for (const raw of rawTasks) fixes.push(withPageWork(raw, [...tasks, ...fixes]));
  const added = fixes.map((task) => task.id);
  const ofCoveredApp = (task) => publishes.includes(task.id);
  const existing = tasks.map((task) => (ofCoveredApp(task) && task.status !== "done"
    ? { ...task, dependsOn: [...new Set([...task.dependsOn, ...fixesFor(task, fixes, tasks, meta)])] } : task));
  const publishedBefore = tasks.filter((task) => ofCoveredApp(task) && task.status === "done").map((task) => task.id);
  return { existing, fixes, added, publishedBefore };
}

// Every line a task needs, and no word a task check reads: the graph check of
// plan audit compares the plan's structure only.
const STRUCTURE_BODY = "1. Read.\n2. Change.\n3. Check.\n4. Read back.\n5. Report.";
const structureOnly = (task) => ({ ...task, body: STRUCTURE_BODY, proof: "Read back." });

// The fix tasks as the plan stores them. Their own words are checked on their
// own, so a problem an older task of the plan already has cannot hide one of
// theirs. The graph is checked whole, and only a problem the stored plan did
// not already have refuses the audit: a plan made under older rules still gets
// its pass recorded, and its publish is never held for good. Every cycle runs
// through a fix task, since only its edges are new, so each is looked for there.
function checkedFixes(check, meta, tasks, graph) {
  if (!graph.fixes.length) return [];
  const added = new Set(graph.added);
  const alone = check(graph.fixes.map((task) => ({ ...task, dependsOn: task.dependsOn.filter((id) => added.has(id)) })),
    { ...meta, pageDesign: PAGE_DESIGN.NONE });
  const all = [...graph.existing, ...graph.fixes];
  const byId = new Map(all.map((task) => [task.id, task]));
  const looped = graph.fixes.find((task) => waitsOn(task, new Set([task.id]), byId));
  if (looped) bad(`Task dependencies contain a cycle at ${looped.id}.`);
  const problem = (list) => {
    try { check(list.map(structureOnly), meta); return null; }
    catch (error) { if (error.code !== "INVALID_PLAN") throw error; return error.message; }
  };
  const now = problem(all);
  if (now && now !== problem(tasks)) bad(now);
  return alone.map((task, i) => ({ ...task, dependsOn: [...graph.fixes[i].dependsOn] }));
}

// plan audit records one page quality pass and puts its fix tasks ahead of every
// publish still to run. It is the one revision the absorbed and major rules
// leave alone, because validateQualityTasks bounds what it may add; the graph it
// makes is still checked like any other.
async function audit(ctx, planId, flags) {
  const pass = auditFindings(readJson(ctx, flags.file, "--file"));
  const rawTasks = flags["tasks-file"] === undefined ? [] : readJson(ctx, flags["tasks-file"], "--tasks-file");
  const current = await fetchPlan(ctx, planId);
  ensurePlanEditor(current.meta, current.record.properties.status, ctx);
  // Only fix tasks are checked against the spec, so an audit with none never reads it.
  const { check } = Array.isArray(rawTasks) && rawTasks.length ? await specCheck(ctx, current) : { check: null };
  const appTypeOf = appTypes(ctx);
  const prepare = (tasks, meta) => {
    const open = openPageTaskIds(tasks);
    if (open.length) bad(`The page quality pass runs when no page task is pending or running; ${open.join(", ")} still are.`);
    const { pages, covered, publishes } = qualityDue(tasks, meta, appTypeOf);
    const missing = pages.filter((page) => !pass.pages.some((item) => item.id === page.id)).map((page) => page.id);
    if (missing.length) {
      badFile(`--file pages leave out ${missing.join(", ")}. The pass audits every page of the done MOBILE page tasks: ${pages.map((page) => page.id).join(", ")}.`);
    }
    validateQualityTasks(rawTasks, pages, tasks.map((task) => task.id));
    const graph = auditedGraph(tasks, rawTasks, meta, publishes);
    return { ...graph, covered, fixes: checkedFixes(check, meta, tasks, graph) };
  };
  prepare(current.tasks, current.meta); // refuse a bad file before any write
  const at = now();
  let entry;
  await mutatePlan(ctx, planId, ({ meta, tasks, status }) => {
    ensurePlanEditor(meta, status, ctx);
    const { existing, fixes, added, publishedBefore, covered } = prepare(tasks, meta);
    tasks.splice(0, tasks.length, ...existing, ...fixes);
    const revision = Number(meta.revision ?? 1) + 1;
    entry = { revision, at, pages: pass.pages, coveredTasks: covered, summary: pass.summary, findings: pass.findings, accepted: pass.accepted,
      tasks: added, publishedBefore };
    meta.revision = revision;
    meta.audits = [...(Array.isArray(meta.audits) ? meta.audits : []), entry];
    meta.revisionHistory = [...(Array.isArray(meta.revisionHistory) ? meta.revisionHistory : []), { revision, at, impact: "quality", added }];
    return {};
  });
  const { revision, pages, coveredTasks, summary, tasks, publishedBefore } = entry;
  return { data: { planId, revision, audit: { at, pages, coveredTasks, summary, tasks, publishedBefore } },
    message: tasks.length ? `Audit recorded; ${tasks.join(", ")} added ahead of the publish.` : "Audit recorded." };
}

// A carried task names the done task, its kind, whether it was a quality fix, and
// the ids it reported, so the new plan's page quality pass still covers the page
// work it did. Its read-backs and notes stay on the source plan
// (derivedFromPlanId), so a chain of plans does not copy them again and again.
const carriedTask = (task) => ({ taskId: task.id, title: task.title, kind: task.kind, audit: task.audit === true, entity: task.entity,
  ids: task.result?.ids ?? {}, endedAt: task.endedAt ?? null });
const unsettledTask = (task) => ({ taskId: task.id, title: task.title, entity: task.entity,
  instruction: "Read the live entity before deciding whether this task's write landed." });

async function fork(ctx, planId, flags) {
  const reason = requiredFlag(flags.reason, "--reason");
  const source = await fetchPlan(ctx, planId);
  const sourceStatus = source.record.properties.status;
  if (sourceStatus === "in_progress") ensureRunner(source.meta, ctx);
  else ensureOwner(source.meta, ctx);
  const specId = source.record.properties.specId ?? source.meta.specId;
  const spec = ensureBelongs(await ctx.service.get(SPEC, specId), ctx, SPEC);
  const parsedSpec = parseFrontmatter(spec.properties.spec_md ?? "");
  if (parsedSpec.meta.nebula !== 3 || !parsedSpec.meta.acceptedAt) bad("A replacement plan needs an accepted spec.");
  const tasks = validateTasks(readJson(ctx, flags["tasks-file"], "--tasks-file"), parsedSpec.body, { format: specFormat(parsedSpec.meta), access: builderToolAccess() });
  const evidence = flags["evidence-file"] ? validateEvidence(readJson(ctx, flags["evidence-file"], "--evidence-file")) : [];
  const carriedForward = source.tasks.filter((task) => task.status === "done").map(carriedTask);
  const reconciliationRequired = source.tasks.filter((task) => task.status === "running").map(unsettledTask);
  // A page quality pass the source settled stays settled for the work the fork carries.
  const audits = carriedAudits(source.tasks, source.meta, carriedForward.map((entry) => entry.taskId), planId);
  const plan = await persistNewPlan(ctx, { specId, parsedSpec, tasks, evidence, extraMeta: {
    derivedFromPlanId: planId, supersedesPlanId: planId, derivedFromPlanStatus: sourceStatus,
    forkReason: reason, carriedForward, reconciliationRequired, ...(audits.length ? { audits } : {}),
  } });
  if (sourceStatus === "in_progress") {
    await mutatePlan(ctx, planId, ({ meta, tasks, status }) => {
      if (status !== "in_progress") bad("The source plan changed before it could be superseded.");
      ensureRunner(meta, ctx);
      meta.supersededByPlanId = plan.id;
      meta.interruptedBy = { planId: plan.id, title: parsedSpec.meta.title, clientId: actor(ctx).clientId, at: now() };
      meta.endedAt = now();
      return { status: "interrupted" };
    });
  }
  return { data: { planId: plan.id, specId, derivedFromPlanId: planId, carriedForward: carriedForward.length,
    reconciliationRequired: reconciliationRequired.length }, message: `Replacement plan ready: ${parsedSpec.meta.title}.` };
}

async function interrupt(ctx, planId, flags) {
  const reason = requiredFlag(flags.reason, "--reason");
  let statusBefore;
  await mutatePlan(ctx, planId, ({ meta, tasks, status }) => {
    statusBefore = status;
    if (status === "planned") ensureOwner(meta, ctx);
    else if (status === "in_progress") ensureRunner(meta, ctx);
    else bad("Only a planned or in-progress plan can be interrupted.");
    meta.interruptionReason = reason;
    meta.endedAt = now();
    return { status: "interrupted" };
  });
  return { data: { planId, status: "interrupted", statusBefore, reason }, message: "Plan interrupted." };
}

async function start(ctx, planId, { transferred = false, alreadyStartedOk = false } = {}) {
  const mine = await fetchPlan(ctx, planId);
  if (alreadyStartedOk && mine.record.properties.status === "in_progress") {
    return { data: { planId, status: "in_progress", alreadyStarted: true }, message: "Plan already started." };
  }
  ensurePlannedActor(mine.meta, ctx, { transferred });
  if (mine.record.properties.status !== "planned") bad("Only a planned plan can start. Use resume for a stopped plan.");
  const runningAt = now();
  await mutatePlan(ctx, planId, ({ meta, status }) => {
    ensurePlannedActor(meta, ctx, { transferred });
    if (status !== "planned") bad("Plan changed before it could start.");
    meta.runningAt = runningAt;
    meta.runner = { ...withEmail(ctx, actor(ctx)), claudeSessionId: session(ctx) };
    delete meta.blockedBy;
    delete meta.interruptedBy;
    delete meta.endedAt;
    delete meta.failureReason;
    return { status: "in_progress" };
  });
  rememberSessionPlan(ctx, planId);
  return { data: { status: "in_progress" }, message: `Building ${mine.meta.title}.` };
}

async function resume(ctx, planId) {
  const current = await fetchPlan(ctx, planId);
  const status = current.record.properties.status;
  const stale = status === "in_progress" && current.meta.runner?.claudeSessionId !== session(ctx);
  if (!(status === "failed" || status === "interrupted" || stale)) {
    bad("This plan cannot resume from its current state.");
  }
  if (stale) ensureOwner(current.meta, ctx);
  await mutatePlan(ctx, planId, ({ meta, tasks, status: latest }) => {
    const isStale = latest === "in_progress" && meta.runner?.claudeSessionId !== session(ctx);
    if (!(latest === "failed" || latest === "interrupted" || isStale)) bad("Plan changed before resume.");
    if (isStale) ensureOwner(meta, ctx);
    // skipDependents' own cascade skip (a task that waited on one that failed)
    // carries this error, set nowhere else: that task never made its own
    // choice, so a resume reopens it along with the task it waited on. A
    // skipped task with any other error is the person's own decline
    // (plan task --status skipped), and a resume is not a retry of that
    // decision: it stays skipped unless someone explicitly asks to retry it.
    const cascadeSkipped = (task) => task.status === "skipped" && /^skipped: depends on /u.test(String(task.error ?? ""));
    for (const task of tasks) {
      if (task.status !== "done") { delete task.handBacks; delete task.question; delete task.confirmedAt; delete task.checkAfter; delete task.waits; }
      if (task.status === "failed" || task.status === "pending" || cascadeSkipped(task)) {
        task.status = "pending"; task.attempts = 0; delete task.error; delete task.startedAt; delete task.endedAt;
      } else if (task.status === "running") {
        task.status = "pending"; task.attempts = 0; delete task.startedAt; delete task.endedAt;
        task.result = { ids: {}, readBack: [], unverified: [], notes: ["Prior session stopped before proof; read back before retry."] };
        moved(task, now(), "plan resume");
      }
    }
    meta.runner = { ...withEmail(ctx, actor(ctx)), claudeSessionId: session(ctx) };
    delete meta.blockedBy;
    delete meta.interruptedBy;
    delete meta.runningAt;
    delete meta.endedAt;
    delete meta.failureReason;
    return { status: "planned" };
  });
  return start(ctx, planId, { transferred: true });
}

async function markFailed(ctx, planId, flags) {
  const reason = String(flags.reason ?? "").trim();
  if (!reason) bad("--reason is required.");
  const updated = await mutatePlan(ctx, planId, ({ meta, tasks, status }) => {
    ensureOwner(meta, ctx);
    if (status !== "in_progress" || meta.runner?.claudeSessionId === session(ctx)) bad("Only a stale plan you own can be marked failed.");
    for (const task of tasks) if (task.status === "running") {
      task.status = "failed"; task.error = "Prior session stopped before proof."; task.endedAt = now();
    }
    meta.failureReason = reason;
    meta.endedAt = now();
    return { status: "failed" };
  });
  return { data: { status: updated.properties.status, failureReason: reason }, message: `Plan marked failed: ${reason}` };
}

const QUALITY_PENDING = " · page quality pending";
const qualityLine = (planId, pages) =>
  `Run the page quality pass on ${pages.map((page) => page.name).join(", ")}, then record it with plan audit ${planId} --file <json> [--tasks-file <json>].`;

// The publishes the page quality pass holds right now, and why, for a command
// that would start or finish one.
function qualityHold(tasks, meta, appTypeOf, planId) {
  const { hold, pages, publishes } = qualityDue(tasks, meta, appTypeOf);
  const names = pages.map((page) => page.name).join(", ");
  return { held: new Set(hold ? publishes : []),
    why: (id) => `${id} is held for the page quality pass on ${names}: run the pass and record it with plan audit ${planId} --file <json> before this publish goes out.` };
}

// While the hold stands, no publish of an app it covers goes out, neither as a
// yes to ask for nor in a batch: a publish the person already confirmed, or one
// the plan sends without asking, comes out of pickBatches in a batch. Another
// app's or an AI agent's publish is not held. `quality` names the pages only
// once the pass is the one step left: no page work or review open, and nothing
// else to send, ask or wait for. Until then the rest of the plan runs as usual,
// so the pass never sits beside a call the router would skip to run it.
function holdForQuality(picked, tasks, meta, appTypeOf) {
  const { hold, ask, pages, publishes } = qualityDue(tasks, meta, appTypeOf);
  if (!hold) return { picked, hold, quality: null, heldForQuality: [] };
  const isHeld = (task) => publishes.includes(task.id);
  const others = (list) => list.filter((task) => !isHeld(task));
  const heldForQuality = [...picked.needsYes, ...picked.batches.flatMap((batch) => batch.tasks)].filter(isHeld).map((task) => task.id);
  const batches = picked.batches.map((batch) => ({ ...batch, tasks: others(batch.tasks) })).filter((batch) => batch.tasks.length);
  const rest = { ...picked, needsYes: others(picked.needsYes), batches };
  const alone = !rest.batches.length && !rest.needsYes.length && !rest.manual.length &&
    !tasks.some((task) => task.status === "running" || (task.status === "pending" && waitsUntil(task)));
  return { picked: rest, hold, quality: ask && alone ? { pages } : null, heldForQuality };
}

async function ready(ctx, planId) {
  const { record, meta, tasks } = await fetchPlan(ctx, planId);
  const status = record.properties.status;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const withUpstream = (task) => ({ task, upstream: task.dependsOn.filter((id) => byId.get(id)?.status === "done").map((id) => {
    const dep = byId.get(id);
    return { id: dep.id, title: dep.title, entity: dep.entity, result: dep.result };
  }) });
  const open = status === "in_progress";
  const { picked, hold, quality, heldForQuality } = open
    ? holdForQuality(pickBatches(tasks, { planId, askBeforeDeploy: askPolicy(meta), ...sessionAgents(ctx, planId) }), tasks, meta, appTypes(ctx))
    : { picked: { batches: [], needsYes: [], manual: [], busy: [] }, hold: false, quality: null, heldForQuality: [] };
  const memory = open ? await solutionMemory(ctx) : { corrections: [], decisions: [] };
  // Without --mark nothing is sent, so next holds only the pass, once it is the one step left.
  const data = { status, statusText: readPlanStatus(record.properties.plan), interruptedBy: meta.interruptedBy ?? null, counts: counts(tasks),
    progress: progressLine(tasks) + (hold ? QUALITY_PENDING : ""),
    batches: picked.batches.map((batch) => ({ ...batch, tasks: batch.tasks.map(withUpstream) })),
    needsYes: picked.needsYes.map(withUpstream), manual: picked.manual.map(withUpstream), busy: picked.busy, heldForQuality,
    next: quality ? [qualityLine(planId, quality.pages)] : [],
    memory, askBeforeDeploy: askPolicy(meta), tenant: ctx.state.tenant, planTitle: meta.title, entityTable: tableFor(ctx, tasks) };
  return { data, message: open ? `${picked.batches.length} batches ready.` : `Plan is ${status}.`, ...(open ? {} : { exitCode: 5 }) };
}

async function solutionMemory(ctx) {
  const solution = await ctx.service.get(SOLUTION, sid(ctx));
  const stored = parseMemory(solution.properties?.memory);
  return { corrections: [...stored.corrections], decisions: [...stored.decisions] };
}

// The plan's spec (a Zen spec or a Sonic brief), for the lines a message quotes.
// A spec that cannot be found leaves those lines out; it never stops a send.
async function planSpec(ctx, record, meta) {
  const specId = record.properties.specId ?? meta.specId;
  let spec;
  try { spec = specId ? await ctx.service.get(SPEC, specId) : null; }
  catch (error) { if (error.code !== "NOT_FOUND") throw error; }
  if (!spec) return { body: "", file: null };
  let body = "";
  try { body = parseFrontmatter(spec.properties?.spec_md ?? "").body; } catch { /* nothing to quote */ }
  return { body, file: renderSpec(ctx.home, spec)?.md ?? null };
}

// The tasks that wait on one task, directly or through another.
function waitersOf(id, tasks) {
  const found = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const task of tasks) if (!found.has(task.id) && task.dependsOn.some((dep) => found.has(dep))) { found.add(task.id); grew = true; }
  }
  found.delete(id);
  return tasks.filter((task) => found.has(task.id) && task.status === "pending");
}

// What a No to a yes question costs: the task itself and every task that waits
// on it are skipped, so the question says so before the person answers.
function ifNo(task, tasks) {
  const waiters = waitersOf(task.id, tasks);
  const rest = !waiters.length ? "" : `${waiters.length > 1 ? ` and the ${waiters.length} tasks that wait` : " and the 1 task that waits"} on it (${waiters.map((item) => item.id).join(", ")})`;
  const keep = task.deletes ? ` To do the task but keep what it would delete, revise ${task.id} without "deletes".` : "";
  return `No skips ${task.id} "${task.title}"${rest}.${keep}`;
}

// What a deploy then starts by itself, read from the newest cached copy of its
// automation: the save the deploy ships. A copy the cache does not hold says nothing.
function deployStartsWork(ctx, task, tasks) {
  if (task.kind !== "deploy" || !ctx?.home) return null;
  try {
    const id = knownEntityId(task, tasks)?.id ?? cachedIdFor(ctx.home, "WORKFLOW_DEFINITION", task.entity?.name);
    const snapshot = id ? readCachedEntity(ctx.home, "WORKFLOW_DEFINITION", id) : null;
    return snapshot ? runsByItself(snapshot.entity) : null;
  } catch { return null; }
}

// A publish ships the app's whole draft, not only this plan's pages. Before the
// person says yes, the question names what else it ships: the pages changed
// since the last publish that no task of this plan built, and the other
// sessions working on the same app. One tenant read, compare_interface_versions
// of the latest publish with the draft; a failed read is one line, never a stop.
const sameApp = (entity, appId, appName) => !!entity && (
  (entity.kind === "app" && ((appId && String(entity.id) === String(appId)) || norm(entity.name) === norm(appName))) ||
  (entity.kind === "page" && ((appId && String(entity.appId) === String(appId)) || (!!entity.app && norm(entity.app) === norm(appName)))));

function othersOnApp(ctx, planId, appId, appName) {
  const others = [];
  let plans = [];
  try { plans = readPlans(ctx.home); } catch { /* no local copy */ }
  for (const plan of plans) {
    const runner = plan.runner?.claudeSessionId;
    if (plan.planId === planId || plan.status !== "in_progress" || !runner || runner === session(ctx)) continue;
    if (!(plan.tasks ?? []).some((task) => task.status !== "done" && task.status !== "skipped" && sameApp(task.entity, appId, appName))) continue;
    others.push(`${plan.runner.email || `session ${runner.slice(0, 8)}`} (plan ${plan.planId})`);
  }
  const live = readLiveSessions(ctx.home);
  let chats = [];
  try { chats = readChatTasks(ctx.home); } catch { /* no session files */ }
  for (const task of chats) {
    if (task.status !== "current" || task.sessionId === session(ctx) || !live.has(task.sessionId)) continue;
    if ((task.targets ?? []).some((target) => sameApp(target, appId, appName) || (target?.id && appId && String(target.id) === String(appId)))) {
      others.push(`session ${String(task.sessionId).slice(0, 8)} (a chat change)`);
    }
  }
  return [...new Set(others)];
}

async function publishShips(ctx, task, tasks, planId) {
  if (task.kind !== "publish" || task.entity?.kind !== "app" || !ctx?.home) return [];
  const appName = task.entity.name;
  const appId = knownEntityId(task, tasks)?.id ?? null;
  const lines = [];
  if (appId) {
    // Pages this plan built: their planned ids and the ids their tasks reported.
    const ours = new Set(tasks.filter((item) => sameApp(item.entity, appId, appName))
      .flatMap((item) => [item.entity?.id, item.result?.ids?.entity, item.result?.ids?.page]).filter(Boolean).map(String));
    const touchesApp = tasks.some((item) => item.kind === "app" && sameApp(item.entity, appId, appName));
    try {
      const answer = await (ctx.callTenantTool ?? callTenantTool)({ host: ctx.state.tenant, route: "/mcp/application-builder", name: "compare_interface_versions",
        args: { interfaceId: appId, base: { kind: "published" }, compare: { kind: "current" } }, sessionId: session(ctx), solutionId: sid(ctx) });
      const differences = Array.isArray(answer?.differences) ? answer.differences : null;
      if (!differences) throw new Error("no differences in the answer");
      const pageName = (id) => {
        if (id === `e_global_${appId}`) return "the app's shared page";
        try { return readCachedEntity(ctx.home, "e_component", id)?.entity?.properties?.name ?? id; } catch { return id; }
      };
      const pages = differences.filter((item) => String(item.entityType ?? "").includes("component") && !ours.has(String(item.entityId)))
        .map((item) => `${pageName(item.entityId)}${item.kind === "added" ? " (new)" : item.kind === "removed" ? " (removed)" : ""}`);
      if (pages.length) lines.push(`It also ships ${pages.length === 1 ? "a page" : `${pages.length} pages`} this plan did not change, changed since the last publish: ${[...new Set(pages)].join(", ")}.`);
      if (!touchesApp && differences.some((item) => String(item.entityType ?? "").includes("interface"))) {
        lines.push("It also ships changes to the app's own settings, theme or menu that this plan did not make.");
      }
    } catch {
      lines.push("Could not check what else the draft holds since the last publish.");
    }
  }
  const others = othersOnApp(ctx, planId, appId, appName);
  if (others.length) lines.push(`Also working on ${appName} now: ${others.join(", ")}; their unpublished edits ship too.`);
  return lines;
}

// What only the person can answer: a yes for a release, a builder's question, a manual task.
async function askFor(picked, held, host, tasks = [], ctx = null, planId = null) {
  const yes = [];
  for (const task of picked.needsYes) {
    const ships = await publishShips(ctx, task, tasks, planId);
    yes.push({ id: task.id, title: task.title, type: "yes",
      question: [confirmQuestion(task, host, { startsWork: deployStartsWork(ctx, task, tasks) }), ...ships].join(" "), ifNo: ifNo(task, tasks) });
  }
  return [
    ...yes,
    ...held.flatMap((batch) => batch.tasks.filter((task) => task.question)
      .map((task) => ({ id: task.id, title: task.title, type: "question", question: task.question }))),
    // A manual task is work the person does, so its steps go with it. Its
    // entity goes with it too, so askLine's done instruction can name it in
    // the read-back it tells the router to write.
    ...picked.manual.map((task) => ({ id: task.id, title: task.title, type: "manual", question: task.title, steps: task.body, entity: task.entity })),
  ];
}

function askLine(planId, item) {
  const skip = `plan task ${planId} ${item.id} --status skipped --error "user declined optional action" --json`;
  if (item.type === "yes") return `Ask the person: ${item.question} (${item.id}), and say: ${item.ifNo} Yes: plan confirm ${planId} ${item.id} --json. No: ${skip}.`;
  if (item.type === "question") {
    return `Ask the person: ${item.question} (${item.id}). Record the answer: plan task ${planId} ${item.id} --answer "<answer>" --json. A declined optional action: ${skip}.`;
  }
  // A manual task's own entity, when it has one, must be named in its
  // read-back, the same as a builder's report: a fixed "user confirmed" for
  // every manual task said nothing about what was actually done. A pure
  // decision or investigation task names no entity, so it keeps the generic line.
  const readBack = item.entity?.name ? JSON.stringify(`${item.entity.name}: <what the person did, naming it>`) : '"user confirmed"';
  return `Ask the person to do ${item.id} "${item.title}" (its steps are in ask). Done: write {"ids":{},"readBack":[${readBack}],"unverified":[],"notes":[]} ` +
    `to a file, then plan task ${planId} ${item.id} --status done --result-file <file> --json. Declined: ${skip}.`;
}

// The exact next calls, in order, so the router copies instead of deciding.
function nextSteps(planId, { status, calls = [], ask = [], notSent = [], busy = [], othersBusy = [], tally, wake = null, quality = null }) {
  if (status !== "in_progress") return [`The plan is ${status}; nothing is sent.`];
  const next = [...calls, ...ask.map((item) => askLine(planId, item))];
  // A task that waits on a long platform run comes back at its checkAfter time.
  const seconds = wake ? Math.max(60, Math.ceil((Date.parse(wake) - Date.now()) / 1000)) : 0;
  const waitLine = `Wait until ${clock(wake ?? "")}: run sleep ${seconds} in the background, then run plan ready ${planId} --mark --json again.`;
  if (calls.length) return wake ? [...next, waitLine] : next;
  if (busy.length) {
    next.push(`Wait for the running agents to finish (${busy.join(", ")}). If no agent is running them, run plan reclaim ${planId} --agent-name <name> --json.`,
      ...(wake ? [waitLine] : []));
  }
  // Every agent this session may run at once works for its other plans.
  else if (othersBusy.length) next.push(`Wait for the running agents of your other plan to finish (${othersBusy.join(", ")}), then run plan ready ${planId} --mark --json again.`);
  else if (notSent.length) next.push(`Run plan ready ${planId} --mark --json again.`);
  else if (wake && !tally.running) next.push(waitLine);
  else if (tally.running) next.push(`Run plan reclaim ${planId} --json, then plan ready ${planId} --mark --json.`);
  // The held publish is still pending, so the plan is neither finished nor stuck
  // until plan audit settles the pass. holdForQuality asks for it only when
  // nothing else is left, so it is the one step.
  else if (quality) return [qualityLine(planId, quality.pages)];
  else if (!tally.pending) next.push(`Run plan finish ${planId} --json.`);
  else if (!ask.length) next.push(`Run plan finish ${planId} --failed --reason "No task can start." --json.`);
  return next;
}

// Writes one batch's whole message file, with the report command its builder runs.
function writeMessage(ctx, { planId, meta, template, spec, memory, agentName, batchTasks, allTasks, files }) {
  const command = reportCommand({ folder: ctx.home, pluginRoot: PLUGIN_ROOT, planId, agentName,
    reportFile: files.reportFile, sessionId: ctx.sessionId });
  const readMemoryCommand = memoryCommand({ folder: ctx.home, pluginRoot: PLUGIN_ROOT, sessionId: ctx.sessionId });
  writeBatchMessage(ctx.home, files.messageFile, dispatchMessage({ template, host: ctx.state.tenant, planId, planTitle: meta.title,
    agentName, tasks: batchTasks, allTasks, specBody: spec.body, specFile: spec.file, memory,
    askBeforeDeploy: askPolicy(meta), reportFile: files.reportFile, workFolder: files.workFolder, command, readMemoryCommand, sessionId: ctx.sessionId }),
  ctx.sessionId, files.workFolder);
}

/**
 * plan ready --mark: the same pick as plan ready, then every batch that needs no
 * answer is marked running in one write and gets its message file. The reply is
 * small and names the exact calls that send each file.
 */
async function readyAndMark(ctx, planId, flags = {}) {
  rememberAgentIds(ctx, flags["agent-ids"]);
  // Once a session says it has no SendMessage, it keeps saying so: every later batch starts a new agent.
  if (flags["no-resume"]) writeState(ctx.home, { noResume: true }, ctx.sessionId);
  // Once the person asks for this plan's work spread over more agents, every later mark spreads it.
  if (flags.spread) {
    const state = readState(ctx.home, ctx.sessionId) ?? {};
    writeState(ctx.home, { spreadPlans: [...new Set([...(state.spreadPlans ?? []), planId])] }, ctx.sessionId);
  }
  const { record, meta, tasks } = await fetchPlan(ctx, planId);
  const status = record.properties.status;
  const closed = (planStatus, list) => ({ data: { status: planStatus, counts: counts(list), progress: progressLine(list), send: [], ask: [],
    notSent: [], busy: [], next: nextSteps(planId, { status: planStatus }) }, message: `Plan is ${planStatus}.`, exitCode: 5 });
  if (status !== "in_progress") return closed(status, tasks);
  ensureRunner(meta, ctx);
  const agents = sessionAgents(ctx, planId);
  const { picked, hold, quality, heldForQuality } = holdForQuality(
    pickBatches(tasks, { planId, askBeforeDeploy: askPolicy(meta), ...agents }), tasks, meta, appTypes(ctx));
  // A batch with an open question waits for the answer; its question goes to the person.
  const held = picked.batches.filter((batch) => batch.tasks.some((task) => task.question));
  const sendable = picked.batches.filter((batch) => !held.includes(batch));
  const ask = await askFor(picked, held, ctx.state.tenant, tasks, ctx, planId);
  let marked = [];
  let notSent = [];
  let after = tasks;
  if (sendable.length) {
    // Read everything a message needs before the mark, so a failed read leaves no task running.
    const template = fs.readFileSync(DISPATCH_TEMPLATE, "utf8");
    const [memory, spec] = await Promise.all([solutionMemory(ctx), planSpec(ctx, record, meta)]);
    const at = now();
    try {
      await mutatePlan(ctx, planId, ({ meta: latest, tasks: current, status: latestStatus }) => {
        if (latestStatus !== "in_progress") throw new UaError("PLAN_INTERRUPTED", "This build stopped.", { status: latestStatus });
        ensureRunner(latest, ctx);
        marked = [];
        notSent = [];
        const quality = qualityHold(current, latest, appTypes(ctx), planId);
        for (const batch of sendable) {
          const ids = batch.tasks.map((task) => task.id);
          // markRunning checks everything before it changes anything, so a refused batch stays as it was.
          try { markRunning(current, ids, batch.agentName, { planId, meta: latest, at, quality, othersBusy: agents.othersBusy }); marked.push(batch); }
          catch (error) {
            if (error.code !== "INVALID_PLAN") throw error;
            notSent.push({ agentName: batch.agentName, taskIds: ids, reason: error.message });
          }
        }
        after = structuredClone(current);
        return {};
      });
    } catch (error) {
      if (error.code !== "PLAN_INTERRUPTED") throw error;
      return closed(error.details?.status ?? "interrupted", tasks);
    }
    if (marked.length) rememberAgentNames(ctx, marked.map((batch) => batch.agentName));
    const byId = new Map(after.map((task) => [task.id, task]));
    marked = marked.map((batch) => {
      const batchTasks = batch.tasks.map((task) => byId.get(task.id));
      const files = batchFiles(ctx.home, batch.agentName, ctx.sessionId);
      writeMessage(ctx, { planId, meta, template, spec, memory, agentName: batch.agentName, batchTasks, allTasks: after, files });
      return { ...batch, tasks: batchTasks, ...files };
    });
  }
  // The file paths travel only in next: each is about 125 characters, and three
  // per batch would double the reply. The builder's message names its report file.
  const send = marked.map((batch) => ({ agent: batch.agent, agentName: batch.agentName, resume: batch.resume,
    taskIds: batch.tasks.map((task) => task.id) }));
  const agentIds = readState(ctx.home, ctx.sessionId)?.agentIds ?? {};
  // The environment the tenant last answered when this process read it. A plan
  // kept in local storage reads no tenant, so its prompts name the tenant
  // without its environment.
  const environment = knownEnvironment(ctx.state.tenant);
  const calls = marked.flatMap((batch) => sendCalls({ ...batch, agentId: agentIds[batch.agentName],
    host: ctx.state.tenant, environment, askBeforeDeploy: askPolicy(meta), pluginRoot: PLUGIN_ROOT,
    description: `${batch.agentName}: ${String(batch.tasks[0].entity?.name ?? batch.tasks[0].title).replaceAll('"', "'")}` }));
  const tally = counts(after);
  const data = { status, counts: tally, progress: progressLine(after) + (hold ? QUALITY_PENDING : ""), send, ask, notSent, busy: picked.busy,
    ...(picked.full ? { full: true, othersBusy: agents.othersBusy } : {}),
    heldForQuality, next: nextSteps(planId, { status, calls, ask, notSent, busy: picked.busy, othersBusy: picked.full ? agents.othersBusy : [], tally, quality,
      wake: after.map((task) => (task.status === "pending" ? waitsUntil(task) : null)).filter(Boolean).sort()[0] ?? null }) };
  return { data, message: `${send.length} batches to send, ${ask.length} to ask. ${tally.done} of ${after.length} done.` };
}

// A PNG's width in pixels, read from its header, or null when the file is no
// PNG. Only a file page-shot could have written is opened: one in this
// session's work folder, never a pipe or a device, whose read would wait.
function shotWidth(file, workFolder) {
  try {
    const real = fs.realpathSync(file);
    const inside = path.relative(fs.realpathSync(workFolder), real);
    if (!inside || inside.split(path.sep)[0] === ".." || path.isAbsolute(inside) || !fs.statSync(real).isFile()) return null;
    const fd = fs.openSync(real, "r");
    const head = Buffer.alloc(24);
    try { fs.readSync(fd, head, 0, 24, 0); } finally { fs.closeSync(fd); }
    return head.toString("latin1", 1, 4) === "PNG" && head.toString("latin1", 12, 16) === "IHDR" ? head.readUInt32BE(16) : null;
  } catch { return null; }
}

// A review that asks for fixes sends the task it judged (the page's bind, or
// its layout when the page has no bind) back to the builder that made it, with
// the findings in its next message, and waits for the new shots. Neither move
// is a failed attempt: the page was built, and the review ran. The fix and the
// review after it each start with two tries, whatever the first round spent.
// Only the findings that block go back; polish waits for the person. When this
// was the last round the review runs no more: it closes, with this report, once
// the work it sent back is done (closeReviewsOf).
function sendWorkBack(work, review, result, at, reporter) {
  const { findings, qualities } = result.review;
  const lastRound = (review.reviewRounds ?? 0) + 1 >= MAX_REVIEW_FIXES;
  Object.assign(work, { status: "pending", reviewFindings: findings.filter((finding) => finding.severity !== "polish"), attempts: 0 });
  delete work.endedAt;
  if (lastRound) review.closingResult = result;
  // The next review sees these scores, so a quality the fix made worse is found.
  Object.assign(review, { status: "pending", reviewRounds: (review.reviewRounds ?? 0) + 1, attempts: 0, ...(lastRound ? { closeOnFix: true } : {}),
    earlierFindings: [...(review.earlierFindings ?? []), ...findings], earlierQualities: qualities,
    result: { ids: {}, readBack: [], unverified: [], notes: [] } });
  delete review.endedAt;
  moved(work, at, `${reporter}: the page-review ${review.id} asked for fixes`);
}

// A review whose last round sent this task back runs no more: the builder fixed
// what blocked and checked its own shots, so the review closes with the report
// it made, its polish kept for the person.
function closeReviewsOf(work, tasks, at, reporter) {
  const closed = [];
  for (const review of tasks.filter((item) => item.kind === "page-review" && item.closeOnFix && item.status === "pending" && (item.reviewedTaskId ?? item.layoutId) === work.id)) {
    const { closingResult } = review;
    Object.assign(review, { status: "done", endedAt: at, result: { ...closingResult,
      readBack: [...(closingResult?.readBack ?? []), `${review.entity.name}: the builder fixed what blocked and checked its own shots; one review round, not run again`] } });
    delete review.closeOnFix; delete review.closingResult;
    moved(review, at, `${reporter}: ${work.id} fixed what the review found`);
    closed.push(review.id);
  }
  return closed;
}

function resultValue(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !raw.ids || typeof raw.ids !== "object" || Array.isArray(raw.ids) ||
      !Array.isArray(raw.readBack) || !Array.isArray(raw.unverified) || !Array.isArray(raw.notes)) bad("Task result needs ids, readBack, unverified and notes.");
  if (raw.change !== undefined && !["created", "updated", "deleted"].includes(raw.change)) bad("Task result change must be created, updated or deleted.");
  return { ids: { ...raw.ids }, readBack: [...raw.readBack], unverified: [...raw.unverified], notes: [...raw.notes],
    ...(raw.change ? { change: raw.change } : {}), ...(raw.design !== undefined ? { design: raw.design } : {}),
    ...(raw.review !== undefined ? { review: raw.review } : {}) };
}

// Skips every pending task that waits on failedId, directly or through others,
// and returns the ids it skipped.
function skipDependents(tasks, failedId, at) {
  const affected = new Set([failedId]);
  const skipped = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) if (!affected.has(task.id) && task.dependsOn.some((id) => affected.has(id))) {
      affected.add(task.id);
      if (task.status === "pending") { task.status = "skipped"; task.error = `skipped: depends on ${failedId}`; task.endedAt = at; skipped.push(task.id); }
      changed = true;
    }
  }
  return skipped;
}

function taskLinkRef(task, tasks) {
  const appId = task.result?.ids?.app || task.entity?.appId || tasks.find((item) => item !== task && item.entity?.kind === "page" &&
    refsMatch(item.entity, task.entity) && item.result?.ids?.app)?.result.ids.app;
  return { ...task.entity, ...(appId ? { appId } : {}) };
}

async function checkpointTaskEntity(ctx, ref, source) {
  if (!versionedTargets(ref).length) return;
  await checkpointEntityRef(ctx, ref, { source });
}

function markRunning(tasks, ids, name, { planId, meta, at, quality = { held: new Set() }, othersBusy = [] }) {
  const byId = new Map(tasks.map((item) => [item.id, item]));
  const batch = ids.map((id) => byId.get(id) ?? bad(`Task ${id} does not exist.`));
  // The kind decides the agent; an older plan can still carry another name in task.agent.
  const agent = agentFor(batch[0]);
  if (!Object.hasOwn(BATCH_LIMITS, agent)) bad("Only builder tasks run in batches. A manual task goes straight to done or skipped.");
  if (batch.some((task) => agentFor(task) !== agent)) bad("A batch holds tasks for one agent.");
  if (!isAgentName(planId, agent, name)) bad(`${name} is not a name for ${agent} in this plan.`);
  if (batch.length > BATCH_LIMITS[agent]) bad(`A ${agent} batch holds at most ${BATCH_LIMITS[agent]} tasks.`);
  const inCall = new Set(ids);
  for (const task of batch) {
    if (task.status !== "pending") bad(`${task.id} cannot start from ${task.status}.`);
    const asked = isRelease(task) || !!task.deletes;
    if (!task.dependsOn.every((id) => byId.get(id)?.status === "done" || (!asked && inCall.has(id)))) bad(`${task.id} is waiting for upstream tasks.`);
    if (waitsForYes(task, askPolicy(meta))) bad(`${task.id} needs the person's yes first. Use plan confirm.`);
    if (quality.held.has(task.id)) bad(quality.why(task.id));
    if (waitsUntil(task, Date.parse(at))) bad(`${task.id} waits for a long run until ${task.checkAfter}.`);
    if ((task.attempts ?? 0) >= 2) bad(`${task.id} has already used two attempts.`);
  }
  const busy = new Set(tasks.filter((item) => item.status === "running" && item.agentName).map((item) => item.agentName));
  if (busy.has(name)) bad(`${name} is still working.`);
  if (new Set([...busy, ...othersBusy]).size >= AGENTS_AT_ONCE) bad(`All ${AGENTS_AT_ONCE} agents this session may run at once are busy.`);
  for (const task of batch) {
    Object.assign(task, { status: "running", attempts: (task.attempts ?? 0) + 1, agentName: name, startedAt: at });
    delete task.question;
    delete task.checkAfter;
    moved(task, at, `a mark for ${name}`);
  }
  return batch;
}

// --answer records the person's answer to a builder's question, or their new
// words for a task waiting for its retry (they changed a permission, say). It
// replaces any older answer; the next message for that task carries it. A task
// plan ready --mark just marked running has a message that may not be sent yet,
// so that message file is written again with the answer in it.
async function answerTask(ctx, planId, ids, flags) {
  if (flags.status !== undefined) bad("--answer takes no --status.");
  if (ids.length !== 1) bad("--answer takes one task.");
  const answer = requiredFlag(flags.answer, "--answer");
  const current = await fetchPlan(ctx, planId);
  if (current.record.properties.status !== "in_progress") return { data: { planStatus: current.record.properties.status, tasks: [] }, message: `Plan is ${current.record.properties.status}.`, exitCode: 5 };
  ensureRunner(current.meta, ctx);
  let answered;
  let after;
  let statusAfter;
  try {
    const updated = await mutatePlan(ctx, planId, ({ meta, tasks, status }) => {
      if (status !== "in_progress") throw new UaError("PLAN_INTERRUPTED", "This build stopped.", { status });
      ensureRunner(meta, ctx);
      const task = tasks.find((item) => item.id === ids[0]) ?? bad(`Task ${ids[0]} does not exist.`);
      if (task.status !== "pending" && task.status !== "running") bad(`${task.id} takes an answer only while pending or running; it is ${task.status}.`);
      task.answer = answer;
      delete task.question;
      answered = structuredClone(task);
      after = structuredClone(tasks);
      return {};
    });
    statusAfter = updated.properties.status;
  } catch (error) {
    if (error.code === "PLAN_INTERRUPTED") return { data: { planStatus: error.details?.status ?? "interrupted", tasks: [] }, message: "This build stopped.", exitCode: 5 };
    throw error;
  }
  const files = answered.status === "running" ? lastBatchFiles(ctx.home, answered.agentName, ctx.sessionId) : null;
  // The delete and release gate is a separate yes that only plan confirm saves, so an
  // answer alone leaves that task in `ask`; say so instead of reading as cleared.
  const gateOpen = waitsForYes(answered, askPolicy(current.meta));
  const gateNote = gateOpen ? ` Its ${answered.deletes ? "delete" : "release"} still waits for the person's yes: plan confirm ${planId} ${answered.id} --json saves it.` : "";
  if (!files) return { data: { planStatus: statusAfter, tasks: [brief(answered)], ...(gateOpen ? { gateOpen: true } : {}) }, message: `Saved the answer for ${answered.id}.${gateNote}` };
  const [memory, spec] = await Promise.all([solutionMemory(ctx), planSpec(ctx, current.record, current.meta)]);
  writeMessage(ctx, { planId, meta: current.meta, template: fs.readFileSync(DISPATCH_TEMPLATE, "utf8"), spec, memory, agentName: answered.agentName,
    batchTasks: after.filter((task) => task.status === "running" && task.agentName === answered.agentName), allTasks: after, files });
  return { data: { planStatus: statusAfter, tasks: [brief(answered)], messageFile: files.messageFile },
    message: `Saved the answer for ${answered.id} and wrote it into the message of ${answered.agentName}. ` +
      `If that message was already sent, tell ${answered.agentName} the answer with SendMessage.` };
}

async function taskCommand(ctx, planId, ids, flags) {
  if (flags.answer !== undefined) return answerTask(ctx, planId, ids, flags);
  const requested = flags.status;
  if (!["running", "done", "failed", "skipped"].includes(requested)) bad("--status must be running, done, failed or skipped.");
  if ((requested === "done" || requested === "failed") && ids.length !== 1) bad(`${requested} takes one task.`);
  const name = requested === "running" ? requiredFlag(flags["agent-name"], "--agent-name") : null;
  const current = await fetchPlan(ctx, planId);
  if (current.record.properties.status !== "in_progress") return { data: { planStatus: current.record.properties.status, tasks: [] }, message: `Plan is ${current.record.properties.status}.`, exitCode: 5 };
  ensureRunner(current.meta, ctx);
  const supplied = flags["result-file"] ? resultValue(readJson(ctx, flags["result-file"], "--result-file")) : null;
  const existing = current.tasks.find((item) => item.id === ids[0]);
  if (!existing) bad(`Task ${ids[0]} does not exist.`);
  const idProblem = supplied ? entityIdProblem(existing, supplied, current.tasks) : null;
  if (idProblem) bad(`${existing.id}: ${idProblem}`);
  // A manual task never runs under a builder, so this is its only done path —
  // unlike a builder's report (below), which already runs readBackProblem.
  // Held to the same standard: a canned, entity-less confirmation is refused
  // the same way an unnamed read-back in a builder's report is. A manual
  // task naming no entity (a pure decision or investigation) stays exempt.
  const readBackIssue = supplied && existing.kind === "manual" && existing.entity?.name ? readBackProblem(existing, supplied) : null;
  if (readBackIssue) bad(`${existing.id}: ${readBackIssue}`);
  // A cache/link write can fail after completion was recorded. The same result
  // can repair both without changing the plan's task trail.
  if (requested === "done" && existing.status === "done") {
    if (supplied && JSON.stringify(supplied) !== JSON.stringify(existing.result)) bad(`${existing.id} is already done with a different result.`);
    // A task whose result deleted its entity has nothing left to read back; the
    // entity is gone on the tenant, so checkpointing it only throws NOT_FOUND.
    if (existing.result?.change !== "deleted") {
      await checkpointTaskEntity(ctx, taskLinkRef(existing, current.tasks), { sessionId: session(ctx), planId, taskId: existing.id, phase: "write-readback" });
    }
    return { data: { planStatus: "in_progress", tasks: [brief(existing)] }, message: `${existing.id} done.` };
  }
  const at = now();
  let changed = [];
  let alsoSkipped = [];
  let linkRef;
  let skipCheckpoint = false;
  let statusAfter;
  try {
    const updated = await mutatePlan(ctx, planId, ({ meta, tasks, status }) => {
      if (status !== "in_progress") throw new UaError("PLAN_INTERRUPTED", "This build stopped.", { status });
      ensureRunner(meta, ctx);
      alsoSkipped = [];
      // A held publish goes out only after the pass; skipping it is how the person finishes without publishing.
      const quality = qualityHold(tasks, meta, appTypes(ctx), planId);
      if (requested === "running") changed = markRunning(tasks, ids, name, { planId, meta, at, quality, othersBusy: otherPlansBusy(ctx, planId) });
      else {
        changed = ids.map((id) => tasks.find((item) => item.id === id) ?? bad(`Task ${id} does not exist.`));
        // A running task belongs to its agent; only plan report or plan reclaim settles it.
        for (const task of changed) if (task.status === "running") bad(`${task.id} is running under ${task.agentName}. Record it with plan report, or take it back with plan reclaim.`);
        for (const task of changed) if (task.status !== "pending") bad(`${task.id} cannot be ${requested} from ${task.status}.`);
        if (requested === "done") for (const task of changed) if (quality.held.has(task.id)) bad(quality.why(task.id));
        for (const task of changed) {
          // An earlier id in this same call can already have skipped a later
          // one through its dependency chain; leave that task as it landed.
          if (task.status !== "pending") continue;
          task.endedAt = at;
          if (requested === "done") {
            task.status = "done";
            moved(task, at, "plan task");
            delete task.error;
            if (supplied) task.result = supplied;
            if (task.result?.ids?.entity) task.entity.id = String(task.result.ids.entity);
            // Page IDs belong to the page. Its app ID must be explicit in a
            // result or a prior task; never substitute the page ID for app.
            linkRef = taskLinkRef(task, tasks);
            skipCheckpoint = task.result?.change === "deleted";
          } else {
            task.status = requested;
            task.error = String(flags.error ?? (requested === "failed" ? "Task failed." : "Task skipped."));
            moved(task, at, "plan task");
            alsoSkipped.push(...skipDependents(tasks, task.id, at));
          }
        }
      }
      changed = structuredClone(changed);
      return {};
    });
    statusAfter = updated.properties.status;
  } catch (error) {
    if (error.code === "PLAN_INTERRUPTED") return { data: { planStatus: error.details?.status ?? "interrupted", tasks: [] }, message: "This build stopped.", exitCode: 5 };
    throw error;
  }
  if (requested === "running") rememberAgentNames(ctx, [name]);
  if (requested === "done" && !skipCheckpoint) await checkpointTaskEntity(ctx, linkRef, { sessionId: session(ctx), planId, taskId: ids[0], phase: "write-readback" });
  // A skip or a failure takes every task that waits on it along; the reply names them.
  alsoSkipped = alsoSkipped.filter((id) => !ids.includes(id));
  return { data: { planStatus: statusAfter, tasks: changed.map(brief), ...(requested === "skipped" || requested === "failed" ? { alsoSkipped } : {}) },
    message: `${changed.map((task) => task.id).join(", ")} ${requested}${requested === "running" ? ` on ${name}` : ""}.` +
      (alsoSkipped.length ? ` Also skipped, because they wait on it: ${alsoSkipped.join(", ")}.` : "") };
}

function namesEntity(task, result) {
  const text = norm(result.readBack.join(" "));
  return [task.entity?.name, ...Object.values(result.ids)].map(norm).filter(Boolean).some((name) => text.includes(name));
}

// A task naming no entity (a pure decision or investigation, which only a
// manual task may be) has nothing to name in its read-back, so it is exempt.
// Every other task's read-back must name its own entity or one of its ids —
// a generic confirmation is never repaired into passing; it is refused, with
// the fix it needs (not applied for it) in the message.
function readBackProblem(task, result) {
  if (!result.readBack.length) return "An ok report needs a read-back line.";
  if (!task.entity?.name) return null;
  if (namesEntity(task, result)) return null;
  const prefix = result.ids.entity ? `${task.entity.name} ${result.ids.entity}` : task.entity.name;
  return `The read-back does not name ${task.entity.name} or one of its ids. Prefix a line with "${prefix}: ", e.g. "${prefix}: ${result.readBack[0]}".`;
}

// An object or automation is built to stay fast, and its builder's speed skill
// ends the task with a `speed:` note: the reads, their indexes and the timings.
function speedNoteProblem(task, result) {
  if (!["object", "automation"].includes(task.kind) || task.deletes || result.change === "deleted") return null;
  if (result.notes.some((note) => /^speed:/iu.test(String(note).trim()))) return null;
  const skill = task.kind === "object" ? "object-performance" : "automation-performance";
  return `An ok ${task.kind} entry needs a speed: note in notes, as the ${skill} skill gives it.`;
}

// Why a report entry is not recorded, in words the builder can act on.
function refusalReason(task, name) {
  if (!task) return "no such task in this plan";
  const holder = task.status === "running" && task.agentName && task.agentName !== name ? ` under ${task.agentName}` : "";
  const last = task.status !== "running" && Array.isArray(task.moves) && task.moves.length ? ` (last move: ${task.moves.at(-1)})` : "";
  return `not running under ${name}: it is ${task.status}${holder}${last}`;
}

const clock = (iso) => `${iso.slice(11, 16)} UTC`;

const shortText = (value) => {
  const text = String(value ?? "").replace(/\s+/gu, " ").trim();
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
};

// One line that says what the report changed, task by task.
function recordedLine(outcome, tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const why = (id) => shortText(byId.get(id)?.error);
  const parts = [
    ...(outcome.done.length ? [`${outcome.done.join(", ")} done`] : []),
    ...outcome.retry.map((id) => `${id} to retry (${why(id)})`),
    ...outcome.failed.map((id) => `${id} failed (${why(id)})`),
    ...outcome.waiting.map((id) => (byId.get(id)?.question ? `${id} needs an answer (${shortText(byId.get(id).question)})`
      : byId.get(id)?.checkAfter ? `${id} checks again at ${clock(byId.get(id).checkAfter)} (${why(id)})` : `${id} handed back (${why(id)})`)),
    ...(outcome.skipped.length ? [`${outcome.skipped.join(", ")} skipped`] : []),
    ...outcome.sentBack.map((id) => `${id} sent back to its builder with the review's findings`),
    ...outcome.refused.map((item) => `${item.id} refused (${item.reason})`),
  ];
  return `Recorded: ${parts.join("; ") || "nothing"}. ${counts(tasks).done} of ${tasks.length} done.`;
}

// The id the plan already holds for a task's entity: the id the task was planned
// with, or the id a done task reported for the same entity (same kind and name,
// and for a page the same app). A record task's entity is its object.
function knownEntityId(task, tasks) {
  if (task.entity?.id) return { id: String(task.entity.id), from: null };
  // A done task whose own job was to delete something still carries that entity's
  // kind, name and id on its `entity` field, for the record. A rebuild plan's later
  // task of the same name must never bind to that id: the row it names is gone.
  const same = (item) => item !== task && item.status === "done" && !item.deletes && item.entity?.id && item.entity.kind === task.entity?.kind &&
    norm(item.entity.name) === norm(task.entity.name) && (!item.entity.app || !task.entity.app || norm(item.entity.app) === norm(task.entity.app));
  const found = tasks.find(same);
  return found ? { id: String(found.entity.id), from: found.id } : null;
}

// Whether `reported` is already the id of a DIFFERENT entity elsewhere in the
// plan (another task's planned id, or the id a done task reported), of any
// kind. Checked only when this task's own entity has no known id yet, so a
// brand-new entity with no prior id or done task of its own (an automation,
// an app, a page, a module — not only an object) still has its reported id
// caught against the rest of the graph, the same way a known id is checked.
function idBelongsToAnother(task, tasks, reported) {
  const holds = (item) => item !== task && norm(item.entity?.name) !== norm(task.entity?.name) &&
    [item.entity?.id, item.result?.ids?.entity].some((id) => id != null && String(id) === reported);
  const other = tasks.find(holds);
  return other ? { id: reported, task: other } : null;
}

// ids.entity names the task's own entity. Once the plan holds that entity's id,
// any other id is something else the task made or read (a block, a data source,
// a row), and writing it over the entity would point the link and the local copy
// at the wrong item. It is refused while the builder can still fix its report.
// The one exception is a new object: its planned id was only the id it asked for.
function entityIdProblem(task, result, tasks) {
  const several = severalIdsProblem(task, result);
  if (several) return several;
  const reported = result.ids.entity === undefined || result.ids.entity === null || result.ids.entity === "" ? null : String(result.ids.entity);
  // ids.entity takes one bare id. A value such as "<objectId>/records" is a
  // workaround for a record task's shared id, not a real id, and is refused
  // outright rather than stored as the entity's id.
  if (reported && reported.includes("/")) {
    return `ids.entity takes one bare id, not "${reported}". Put the object's id alone in ids.entity, and the ids of the rows it wrote in ids.records.`;
  }
  const rows = "A record task's entity is its object";
  if (task.kind === "record" && reported && result.ids.object && String(result.ids.object) !== reported) {
    return `${rows}: put its id ${result.ids.object} in ids.entity and the ids of the rows it wrote in ids.records.`;
  }
  const known = reported ? knownEntityId(task, tasks) : null;
  if (known && known.id !== reported && (known.from || task.kind !== "object" || result.change !== "created")) {
    const fix = task.kind === "record" ? `${rows}: put ${known.id} in ids.entity and the ids of the rows it wrote in ids.records.`
      : task.entity.kind === "page" ? "Put the page id in ids.entity and the app id in ids.app."
        : `Put ${known.id} in ids.entity and any other id under its own key in ids.`;
    return `Reports ${reported} in ids.entity, but ${task.entity.kind} ${task.entity.name} is ${known.id}${known.from ? ` (from ${known.from})` : ""}. ${fix}`;
  }
  if (known) return null;
  // No known id for this entity yet (a brand-new entity, nothing planned, no
  // earlier done task of the same kind and name): still refuse a reported id
  // that is plainly someone else's, whatever kind this task is.
  if (!reported) return null;
  const clash = idBelongsToAnother(task, tasks, reported);
  if (!clash) return null;
  return `Reports ${reported} in ids.entity, but that is ${clash.task.entity.kind} ${clash.task.entity.name}'s id (${clash.task.id}), not ${task.entity.kind} ${task.entity.name}'s own id. Put ${task.entity.name}'s own id in ids.entity.`;
}

// A layout and its bind report the same page id, and so do two tasks that name
// the same entity (build an agent, then evaluate it); two different entities never may.
function entityClashes(batch, entries, byId) {
  const clashes = new Map();
  const seen = new Map();
  // A record task's entity is its object, whatever kind its entity names.
  const kindOf = (task) => (task.kind === "record" ? "object" : task.entity.kind);
  // A record task and the object task that seeds it legitimately report the
  // same object id (ids.entity is the object's id for both): not a clash when
  // the record task's own dependsOn reaches that object task, whatever name
  // each task's entity carries.
  const recordSeededBy = (a, b) => {
    const [record, object] = a.kind === "record" && b.kind === "object" ? [a, b]
      : b.kind === "record" && a.kind === "object" ? [b, a] : [];
    return Boolean(record && object && waitsOn(record, new Set([object.id]), byId));
  };
  const sameEntity = (a, b) => kindOf(a) === kindOf(b) &&
    (norm(a.entity.name) === norm(b.entity.name) || (!!a.entity.id && !!b.entity.id && String(a.entity.id) === String(b.entity.id)) || recordSeededBy(a, b));
  for (const task of batch) {
    const id = entries.get(task.id)?.status === "ok" ? entries.get(task.id).ids?.entity : null;
    if (!id) continue;
    const first = seen.get(String(id));
    if (!first) seen.set(String(id), task);
    else if (!sameEntity(first, task)) clashes.set(task.id, `Reports the same entity id as ${first.id}.`);
  }
  return clashes;
}

// ids.entity is one id. Several joined into it (a task that built 14 objects)
// would point the link and the local copy at an id that does not exist.
function severalIdsProblem(task, result) {
  const ids = idsIn(result.ids.entity);
  if (ids.length < 2) return null;
  const shown = ids.length > 4 ? `${ids.slice(0, 4).join(", ")}, …` : ids.join(", ");
  return `ids.entity takes one id, and this entry names ${ids.length} (${shown}). ` +
    `Put the id of ${task.entity.name} in ids.entity, and any other id under its own key in ids.`;
}

// The tasks list a report file holds, or null when it holds none.
const reportTasks = (raw) => (raw && typeof raw === "object" && Array.isArray(raw.tasks) ? raw.tasks : null);

// The report file the builder's own message named. The builder writes it and runs
// plan report on it; the router records {} or the json block of a reply instead.
function ownReportFile(ctx, name) {
  try { return lastBatchFiles(ctx.home, name, ctx.sessionId)?.reportFile ?? null; } catch { return null; }
}

// .sessions/<sessionId>/work/, which holds every builder's own work folder and
// so every shot page-shot took in this session.
function sessionWorkFolder(ctx) {
  try { return path.join(sessionHome(ctx.home, ctx.sessionId), "work"); } catch { return undefined; }
}

// The builder's own report, when it wrote one. The router records {} for a builder
// that stopped early; a builder writes its file before it runs plan report, so the
// file can be there when the run is not.
function ownReportTasks(ctx, name) {
  const file = ownReportFile(ctx, name);
  if (!file || !fs.existsSync(file)) return null;
  try { return reportTasks(JSON.parse(fs.readFileSync(file, "utf8"))); } catch { return null; }
}

const samePath = (a, b) => {
  const real = (file) => { try { return fs.realpathSync(file); } catch { return path.resolve(file); } };
  return !!a && !!b && real(a) === real(b);
};

// declined: the person said no to this task (a release, say). It is skipped with
// everything that waits on it, the same as a declined optional action.
// waiting: the task started a platform run that takes longer than one message
// can wait (a load of an hour, say). It comes back after checkAfter minutes, with
// the builder's note in Last attempt, so the next builder reads the run's result.
const REPORT_STATUSES = ["ok", "failed", "not_started", "auth_expired", "needs_confirmation", "declined", "waiting"];
const MAX_WAIT_MINUTES = 120;
const MAX_WAITS = 12;

async function report(ctx, planId, flags) {
  const name = requiredFlag(flags["agent-name"], "--agent-name");
  const given = reportTasks(readJson(ctx, flags["report-file"], "--report-file"));
  // The builder runs plan report on its own report file and can still fix it, so a
  // wrong entry there refuses the whole report and leaves the batch running. A
  // report the router records for a builder that stopped cannot be fixed by anyone.
  const ownFile = ownReportFile(ctx, name);
  const fixable = !!given && samePath(path.resolve(ctx.cwd ?? process.cwd(), flags["report-file"]), ownFile);
  const workFolder = sessionWorkFolder(ctx);
  // No tasks list means the builder stopped before it could report. Its own report
  // file, when it wrote one, is its report; every task that file does not settle
  // gets its attempt back, because a stop is not a failed build.
  const stoppedEarly = !given;
  const usageLimit = flags["usage-limit"] === true;
  if (usageLimit && !stoppedEarly) bad("--usage-limit goes with a {} report, for a builder that stopped at the usage limit before its report.");
  const list = given ?? ownReportTasks(ctx, name);
  const current = await fetchPlan(ctx, planId);
  const closed = { data: { planStatus: current.record.properties.status }, message: `Plan is ${current.record.properties.status}.`, exitCode: 5 };
  if (current.record.properties.status !== "in_progress") return closed;
  ensureRunner(current.meta, ctx);
  const at = now();
  let outcome;
  let links;
  let tasksAfter;
  let statusAfter;
  try {
    const updated = await mutatePlan(ctx, planId, ({ meta, tasks, status }) => {
      if (status !== "in_progress") throw new UaError("PLAN_INTERRUPTED", "This build stopped.", { status });
      ensureRunner(meta, ctx);
      outcome = { done: [], retry: [], waiting: [], failed: [], skipped: [], refused: [], sentBack: [] };
      const byId = new Map(tasks.map((task) => [task.id, task]));
      const batch = tasks.filter((task) => task.status === "running" && task.agentName === name);
      if (!batch.length) bad(`No running batch for ${name}. If this report was already recorded, there is nothing to do.`);
      const entries = new Map();
      for (const entry of list ?? []) {
        const id = String(entry?.id ?? "");
        if (entries.has(id)) outcome.refused.push({ id, reason: "listed twice in the report" });
        else if (batch.some((task) => task.id === id)) entries.set(id, entry);
        else outcome.refused.push({ id, reason: refusalReason(byId.get(id), name) });
      }
      outcome.planChanges = [...entries].flatMap(([id, entry]) => (Array.isArray(entry?.notes) ? entry.notes : [])
        .filter((note) => typeof note === "string" && note.startsWith("plan_change:")).map((note) => ({ id, note })));
      // A failed or handed-back entry sets no result, so its feedback: and
      // feature: notes are kept on the task for plan finish to return.
      for (const [id, entry] of entries) {
        const task = byId.get(id);
        for (const note of Array.isArray(entry?.notes) ? entry.notes : []) {
          if (typeof note !== "string" || !/^(feedback|feature):/u.test(note)) continue;
          task.builderNotes = [...new Set([...(task.builderNotes ?? []), note])];
        }
      }
      const reporter = stoppedEarly ? `the router's {} for ${name}` : fixable ? `${name}'s own report` : `the router's report for ${name}`;
      const finalFailures = [];
      const declined = [];
      const failAttempt = (task, error) => {
        task.error = error;
        if ((task.attempts ?? 0) >= 2) { task.status = "failed"; task.endedAt = at; finalFailures.push(task.id); outcome.failed.push(task.id); }
        else { task.status = "pending"; outcome.retry.push(task.id); }
      };
      const giveBack = (task) => {
        task.status = "pending";
        task.attempts = Math.max(0, (task.attempts ?? 1) - 1);
        outcome.waiting.push(task.id);
      };
      // A hand-back gives the attempt back. Two are forgiven; a third means the task
      // cannot be done as written, so it counts as a failed attempt.
      const handBack = (task, error, tooMany) => {
        task.handBacks = (task.handBacks ?? 0) + 1;
        if (task.handBacks > 2) failAttempt(task, tooMany);
        else { task.error = error; giveBack(task); }
      };
      const clashes = entityClashes(batch, entries, byId);
      // Check every entry before anything changes: a wrong entry in the builder's
      // own report refuses the whole report, so no attempt is spent on its format.
      const results = new Map();
      const problems = new Map();
      for (const task of batch) {
        const entry = entries.get(task.id);
        if (!entry) { if (!stoppedEarly) problems.set(task.id, "Missing from the agent's report."); continue; }
        if (!REPORT_STATUSES.includes(entry.status)) { problems.set(task.id, `Unknown report status: ${entry.status}.`); continue; }
        if (entry.status === "waiting" && !(Number(entry.checkAfter) > 0)) {
          problems.set(task.id, `A waiting entry needs checkAfter: the minutes to wait before its result is read, 1 to ${MAX_WAIT_MINUTES}.`);
          continue;
        }
        if (entry.status !== "ok") continue;
        let result;
        try { result = resultValue(entry); } catch (error) { problems.set(task.id, error.message); continue; }
        const problem = readBackProblem(task, result) ?? speedNoteProblem(task, result) ?? entityIdProblem(task, result, tasks) ?? clashes.get(task.id) ??
          (task.needsDesignReport ? designReportProblem(result.design, {
            imageWidth: (file) => shotWidth(path.resolve(ctx.cwd ?? process.cwd(), file), workFolder),
            regions: task.design ?? [], shotFolder: workFolder,
          }) : null) ??
          (task.kind === "page-review" ? reviewProblem(result.review) : null);
        if (problem) problems.set(task.id, problem);
        else results.set(task.id, result);
      }
      if (fixable && problems.size) {
        throw new UaError("INVALID_PLAN", `Nothing was recorded, and the batch is still running. ${[...problems].map(([id, problem]) => `${id}: ${problem}`).join(" ")} ` +
          `Fix ${ownFile} and run the same plan report command again.`, { problems: Object.fromEntries(problems) });
      }
      // Snapshot what an ok entry overwrites, so a later revert (dependency not
      // done) can put the task back exactly as it was, not just mark it failed.
      const priorState = new Map();
      for (const task of batch) {
        const entry = entries.get(task.id);
        if (!entry && stoppedEarly && usageLimit) {
          task.usageStops = (task.usageStops ?? 0) + 1;
          task.error = STOPPED_FOR_USAGE_LIMIT;
          giveBack(task);
          continue;
        }
        if (!entry && stoppedEarly) { handBack(task, STOPPED_BEFORE_REPORT, "Stopped before its report too many times."); continue; }
        if (problems.has(task.id)) { failAttempt(task, problems.get(task.id)); continue; }
        if (entry.status === "ok") {
          const result = results.get(task.id);
          priorState.set(task.id, { result: task.result, entityId: task.entity.id });
          Object.assign(task, { status: "done", endedAt: at, result });
          delete task.error;
          if (result.ids.entity) task.entity.id = String(result.ids.entity);
          for (const closed of closeReviewsOf(task, tasks, at, reporter)) outcome.done.push(closed);
          if (task.kind === "page-review" && result.review.verdict === "fix") {
            const work = byId.get(task.reviewedTaskId ?? task.layoutId);
            if (work && (task.reviewRounds ?? 0) < MAX_REVIEW_FIXES) {
              sendWorkBack(work, task, result, at, reporter);
              outcome.sentBack.push(work.id);
              continue;
            }
            // Out of rounds: the review is done, and what it still saw stays in view.
            result.unverified = [...result.unverified, ...result.review.findings.map((finding) => `design (review): ${findingLine(finding)}`)];
          }
          outcome.done.push(task.id);
        } else if (entry.status === "failed") failAttempt(task, String(entry.error || "Task failed."));
        else if (entry.status === "not_started") handBack(task, String(entry.error || "Not started."), "Handed back without starting too many times.");
        else if (entry.status === "auth_expired") { task.error = "Sign-in expired."; giveBack(task); }
        else if (entry.status === "needs_confirmation") {
          // The question also stays as the last attempt, with any id the try made,
          // so the next message tells the builder what this task already did.
          task.question = String(entry.error || "The agent needs an answer.");
          const made = entry.ids && typeof entry.ids === "object" && Object.keys(entry.ids).length ? ` Made so far: ids ${JSON.stringify(entry.ids)}.` : "";
          task.error = `Asked the person: ${task.question}${made}`;
          giveBack(task);
        }
        else if (entry.status === "waiting") {
          task.waits = (task.waits ?? 0) + 1;
          if (task.waits > MAX_WAITS) { failAttempt(task, `Waited ${MAX_WAITS} times; the run did not finish.`); continue; }
          const minutes = Math.min(MAX_WAIT_MINUTES, Number(entry.checkAfter));
          task.checkAfter = new Date(Date.parse(at) + minutes * 60000).toISOString();
          task.error = String(entry.error || "Started a long run. Read its result.");
          giveBack(task);
        } else if (entry.status === "declined") {
          Object.assign(task, { status: "skipped", error: String(entry.error || "The person declined it."), endedAt: at });
          declined.push(task.id);
        }
      }
      let reverted = true;
      while (reverted) {
        reverted = false;
        for (const task of batch.filter((item) => item.status === "done")) {
          const waiting = task.dependsOn.find((id) => byId.get(id)?.status !== "done");
          if (!waiting) continue;
          outcome.done = outcome.done.filter((id) => id !== task.id);
          const prior = priorState.get(task.id);
          if (prior) {
            if (prior.result === undefined) delete task.result; else task.result = prior.result;
            if (prior.entityId === undefined) delete task.entity.id; else task.entity.id = prior.entityId;
          }
          delete task.endedAt;
          const why = `Reported ok before ${waiting} was done. Read it back before you build on it.`;
          // A dependency of this same batch that waits for an answer is not this
          // task's failure, so it keeps its attempt.
          const dependency = byId.get(waiting);
          if (dependency?.agentName === name && dependency.status === "pending" && !outcome.retry.includes(waiting)) {
            task.error = why;
            giveBack(task);
          } else failAttempt(task, why);
          reverted = true;
        }
      }
      const skippedBefore = new Set(tasks.filter((task) => task.status === "skipped" && !declined.includes(task.id)).map((task) => task.id));
      for (const id of [...finalFailures, ...declined]) skipDependents(tasks, id, at);
      outcome.skipped = tasks.filter((task) => task.status === "skipped" && !skippedBefore.has(task.id)).map((task) => task.id);
      // A task freshly skipped by another task's failure cannot also count as
      // waiting for an answer or due for retry.
      const skippedNow = new Set(outcome.skipped);
      outcome.retry = outcome.retry.filter((id) => !skippedNow.has(id));
      outcome.waiting = outcome.waiting.filter((id) => !skippedNow.has(id));
      for (const task of batch) moved(task, at, reporter);
      links = outcome.done.map((id) => ({ taskId: id, ref: taskLinkRef(byId.get(id), tasks) }));
      tasksAfter = structuredClone(tasks);
      return {};
    });
    statusAfter = updated.properties.status;
  } catch (error) {
    if (error.code === "PLAN_INTERRUPTED") return { ...closed, data: { planStatus: error.details?.status ?? "interrupted" } };
    throw error;
  }
  // The report is saved by now. A failed refresh of the local copy must not read
  // as a failed report, or the builder runs the command again and is refused.
  const warnings = [];
  for (const { taskId, ref } of links) {
    try { await checkpointTaskEntity(ctx, ref, { sessionId: session(ctx), planId, taskId, phase: "write-readback" }); }
    catch (error) { warnings.push(`Could not refresh the local copy of ${ref.name} (${taskId}): ${shortText(error.message)}`); }
  }
  const { planChanges, ...settled } = outcome;
  const saved = warnings.length ? ` ${warnings.join(" ")} The report is saved; do not run the command again.` : "";
  return { data: { planStatus: statusAfter, ...settled, counts: counts(tasksAfter), progress: progressLine(tasksAfter), planChanges, warnings,
    ...(stoppedEarly && list ? { fromReportFile: true } : {}) },
    message: recordedLine(outcome, tasksAfter) + saved };
}

async function confirm(ctx, planId, ids) {
  const current = await fetchPlan(ctx, planId);
  if (current.record.properties.status !== "in_progress") return { data: { planStatus: current.record.properties.status, confirmed: [] }, message: `Plan is ${current.record.properties.status}.`, exitCode: 5 };
  ensureRunner(current.meta, ctx);
  const at = now();
  const updated = await mutatePlan(ctx, planId, ({ meta, tasks, status }) => {
    if (status !== "in_progress") bad("Plan changed before the yes was saved.");
    ensureRunner(meta, ctx);
    for (const id of ids) {
      const task = tasks.find((item) => item.id === id);
      if (!task || task.status !== "pending" || !(isRelease(task) || task.deletes)) bad(`${id}: only a pending deploy, publish or task that deletes takes a yes.`);
      task.confirmedAt = at;
    }
    return {};
  });
  return { data: { planStatus: updated.properties.status, confirmed: ids }, message: `Saved the yes for ${ids.join(", ")}.` };
}

async function reclaim(ctx, planId, flags) {
  const name = flags["agent-name"] === undefined ? null : requiredFlag(flags["agent-name"], "--agent-name");
  const current = await fetchPlan(ctx, planId);
  if (current.record.properties.status !== "in_progress") return { data: { planStatus: current.record.properties.status, reclaimed: [] }, message: `Plan is ${current.record.properties.status}.`, exitCode: 5 };
  ensureRunner(current.meta, ctx);
  let reclaimed = [];
  const updated = await mutatePlan(ctx, planId, ({ meta, tasks, status }) => {
    if (status !== "in_progress") bad("Plan changed before its tasks were taken back.");
    ensureRunner(meta, ctx);
    reclaimed = [];
    for (const task of tasks.filter((item) => item.status === "running" && (!name || item.agentName === name))) {
      task.status = "pending";
      task.attempts = Math.max(0, (task.attempts ?? 1) - 1);
      task.error = STOPPED_BEFORE_REPORT;
      delete task.startedAt;
      moved(task, now(), `plan reclaim${name ? ` of ${name}` : ""}`);
      reclaimed.push(task.id);
    }
    return {};
  });
  return { data: { planStatus: updated.properties.status, reclaimed }, message: `Took back ${reclaimed.length} tasks.` };
}

const isClosed = (status) => ["interrupted", "failed", "implemented"].includes(status);
const taskFailures = (tasks) => tasks.filter((task) => task.status === "failed")
  .map((task) => `${task.id} ${task.title}: ${task.error ?? task.status}`).join("\n");

function finishResult(ctx, record) {
  const { meta, tasks } = parsePlan(record.properties.plan);
  const status = record.properties.status;
  const statusText = readPlanStatus(record.properties.plan);
  const failureReason = status === "failed" ? (statusText?.startsWith("Failed: ")
    ? statusText.slice("Failed: ".length) : meta.failureReason ?? taskFailures(tasks)) : null;
  return { data: { status, failureReason, counts: counts(tasks), statusText, entityTable: tableFor(ctx, tasks), notes: builderNotes(tasks) },
    message: `Plan ${status}.` };
}

// The builders' feedback: and feature: notes from every report, each once. The
// router sees no report of its own now, so Finish takes them from here. A plan
// recorded before builderNotes existed has them only in its results.
function builderNotes(tasks) {
  const notes = { feedback: [], feature: [], polish: [] };
  for (const task of tasks) for (const note of [...(task.builderNotes ?? []), ...(Array.isArray(task.result?.notes) ? task.result.notes : [])]) {
    const kind = typeof note === "string" ? ["feedback", "feature"].find((prefix) => note.startsWith(`${prefix}:`)) : null;
    if (kind && !notes[kind].includes(note)) notes[kind].push(note);
  }
  // The polish each page's review found, which Finish offers to the person.
  for (const task of tasks.filter((item) => item.kind === "page-review" && item.status === "done")) {
    for (const line of polishLines(task.entity?.name ?? "page", task.result?.review)) if (!notes.polish.includes(line)) notes.polish.push(line);
  }
  return notes;
}

async function finish(ctx, planId, flags) {
  const userRequested = !!flags["user-requested"];
  const failed = !!flags.failed;
  const reason = statusLine(flags.reason);
  if (userRequested && failed) bad("Use either --user-requested or --failed, not both.");
  if (failed && !reason) bad("--reason is required for a hard failure.");
  if (reason && !userRequested && !failed) bad("--reason needs --user-requested or --failed.");
  const current = await fetchPlan(ctx, planId);
  if (isClosed(current.record.properties.status)) return finishResult(ctx, current.record);

  // A concurrent close must win without even a redundant version write. The
  // sentinel exits the merge before transport, including on a conflict retry.
  const alreadyClosed = new Error("Plan already closed.");
  let closedRecord;
  let updated;
  try {
    updated = await ctx.service.readMergeWrite(PLAN, planId, (properties, record) => {
      ensureBelongs(record, ctx, PLAN);
      if (isClosed(properties.status)) { closedRecord = record; throw alreadyClosed; }
      if (properties.status !== "in_progress") bad("Only a started plan can finish.");
      const { meta, tasks } = parsePlan(properties.plan);
      ensureRunner(meta, ctx);
      const tally = counts(tasks);
      let statusText;
      let status = "implemented";
      if (userRequested) {
        statusText = `Finished at the user's request.${reason ? ` ${reason}` : ""}`;
      } else if (failed || tally.failed) {
        status = "failed";
        statusText = `Failed: ${reason || taskFailures(tasks)}`;
      } else {
        if (tally.pending || tally.running) bad("Plan has unfinished tasks.");
        statusText = tally.skipped ? "Finished. Remaining optional work was skipped." : "Finished. All tasks completed.";
      }
      const specId = properties.specId ?? meta.specId;
      return { status, ...(specId ? { specId } : {}), plan: withPlanStatus(properties.plan, statusText) };
    });
  } catch (error) {
    if (error !== alreadyClosed) throw error;
    updated = closedRecord;
  }
  return finishResult(ctx, cachePlan(ctx, updated));
}

async function get(ctx, planId) {
  const { record, meta, tasks, markdown } = await fetchPlan(ctx, planId);
  return { data: { meta, tasks, markdown, status: record.properties.status, statusText: readPlanStatus(record.properties.plan), entityTable: tableFor(ctx, tasks) }, message: `${meta.title}: ${record.properties.status}.` };
}

async function list(ctx, flags) {
  const status = flags.status;
  if (status && !["planned", "in_progress", "implemented", "failed", "interrupted"].includes(status)) bad("Unknown plan status.");
  const rows = await ctx.service.search(PLAN, "solutionId", sid(ctx));
  const plans = rows.filter((row) => isUaPlan(row) && (!status || row.properties.status === status))
    .map((row) => {
      try { const { meta, tasks } = parsePlan(row.properties.plan); return { planId: row.id, title: meta.title, status: row.properties.status,
        specId: row.properties.specId ?? meta.specId, revision: meta.revision ?? 1,
        derivedFromPlanId: meta.derivedFromPlanId ?? null, supersededByPlanId: meta.supersededByPlanId ?? null,
        owner: meta.owner, runner: meta.runner ?? null, createdAt: meta.createdAt, touches: meta.touches,
        counts: counts(tasks) }; }
      catch { return null; }
    }).filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || a.planId.localeCompare(b.planId));
  cacheRecords(ctx.home, { plans: rows.filter(isUaPlan) });
  return { data: { plans }, message: `${plans.length} plans.` };
}

export async function run(command, args = [], flags = {}, ctx) {
  if (!ctx?.service || !sid(ctx)) throw new UaError("NOT_STARTED");
  // These commands need the solution's own records current, not the whole
  // solution pulled again: a pass that finished moments ago is reused, so the
  // chain setup → propose → save → start reads the tenant once, not four times.
  if (["create", "revise", "fork", "interrupt", "start", "resume"].includes(command)) await refreshCurrentIfStale(ctx);
  const planId = args[0];
  if (command === "create") return create(ctx, flags);
  if (command === "propose") return propose(ctx, flags, { createPlan: (createFlags) => create(ctx, createFlags), toolAccess: builderToolAccess,
    readTenantPlans: () => ctx.service.search(PLAN, "solutionId", sid(ctx)),
    startPlan: (startCtx, id, options) => start(startCtx, id, options),
    latestPlanOf: async (specId) => (await plansForSpec(ctx, specId)).sort((a, b) => createdStamp(b.record) - createdStamp(a.record))[0]?.record.id ?? null });
  if (command === "list") return list(ctx, flags);
  if (!planId) bad("A plan id is required.");
  if (command === "get") return get(ctx, planId);
  if (command === "revise") return revise(ctx, planId, flags);
  if (command === "audit") return audit(ctx, planId, flags);
  if (command === "fork") return fork(ctx, planId, flags);
  if (command === "interrupt") return interrupt(ctx, planId, flags);
  if (command === "start") return start(ctx, planId);
  if (command === "resume") return resume(ctx, planId);
  if (command === "mark-failed") return markFailed(ctx, planId, flags);
  if (command === "ready") {
    if (!flags.mark && flags["agent-ids"] !== undefined) bad("--agent-ids goes with --mark.");
    if (!flags.mark && flags["no-resume"]) bad("--no-resume goes with --mark.");
    if (!flags.mark && flags.spread) bad("--spread goes with --mark.");
    return flags.mark ? readyAndMark(ctx, planId, flags) : ready(ctx, planId);
  }
  // Ids may come as one comma list or as separate words: t1,t2 and t1 t2 mean the same.
  if (command === "task") return taskCommand(ctx, planId, taskIds(args.slice(1).join(",")), flags);
  if (command === "report") return report(ctx, planId, flags);
  if (command === "confirm") return confirm(ctx, planId, taskIds(args.slice(1).join(",")));
  if (command === "reclaim") return reclaim(ctx, planId, flags);
  if (command === "finish") return finish(ctx, planId, flags);
  throw new UaError("USAGE", `Unknown plan command: ${command}.`);
}
