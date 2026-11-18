// `plan propose`: the one door for every new plan. It checks the spec text and
// its tasks with no network, reads the solution's plans from the tenant once for
// the overlap check only, shows a preview only with `--preview`, and keeps the
// checked text in the session state as `pendingSave`. `--save --hash` then saves
// exactly that text: spec draft, spec accept and plan create, each safe to run
// again after a failure. `--go` saves and starts the plan in one call.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DEFAULT_MODE, UaError, SPEC_FORMATS, askPolicy, isRelease, normalizeMode, parseSpecBody, releaseAction, specFormat, validateTasks } from '../lib/contracts.mjs';
import { parseFrontmatter } from '../lib/formats.mjs';
import { buildPlanPreview, askingSteps } from '../lib/plan-preview.mjs';
import { atomicFile } from '../lib/session-paths.mjs';
import { executionActor, readState, writeState } from '../workspace/local.mjs';
import { draftsFolder, openPreview, readWiringFile, writePreview } from '../workspace/plan-preview.mjs';
import { formatAge, lastActivityAt, maybeStopped } from '../lib/progress-table.mjs';
import { readSyncStatus, refreshCurrentIfStale } from '../workspace/solution-sync.mjs';
import { listCachedEntities, readCachedAppContext, readCachedPageContext } from '../workspace/entity-cache.mjs';
import { planRows, readLiveSessions, readPlans } from '../workspace/solution-work.mjs';
import { run as specRun } from './spec.mjs';

const bad = (message) => { throw new UaError('INVALID_PLAN', message); };
const usage = (message) => { throw new UaError('USAGE', message); };
// The spec a requirement change replaces is part of what the person saw, so it is in the hash.
const planHash = (md, tasksText, derivedFrom) => {
  const hash = createHash('sha256').update(md).update('\0').update(tasksText);
  if (derivedFrom) hash.update('\0').update(derivedFrom);
  return hash.digest('hex').slice(0, 16);
};
const derivedOf = (flags) => flags['derived-from'] === undefined ? null : String(flags['derived-from']).trim() || usage('--derived-from needs the spec id it replaces.');

function readText(file, flag) {
  try { return fs.readFileSync(file, 'utf8'); }
  catch { return usage(`Cannot read ${flag}.`); }
}

// A literal angle bracket in the person's words would read as raw HTML to the
// spec check, so such words go in a code span.
const safeLine = (text) => {
  const line = String(text ?? '').replace(/\s+/gu, ' ').trim();
  return /[<>]/u.test(line) ? `\`${line.replace(/`/gu, "'")}\`` : line;
};

const entityName = (task) => String(task.entity?.name ?? '').trim();

/** The minimal spec for tasks on existing entities, built from the request words. */
export function tinySpec(request, tasks) {
  const words = String(request ?? '').trim();
  if (!words) usage('--request needs the change in words.');
  const list = Array.isArray(tasks) ? tasks : [tasks];
  if (!list.length || list.some((task) => !task || typeof task !== 'object' || Array.isArray(task))) usage('--task is one task as a JSON object, or a JSON array of tasks.');
  const touches = [], readBacks = [], releases = [];
  for (const task of list) {
    if (task.deletes) bad('A short change deletes nothing. Plan a delete with plan propose --file.');
    const entity = task.entity ?? {};
    if (!entity.id || !entityName(task) || !entity.kind) bad('Each task of a short change is on an existing entity: give its entity kind, name and id.');
    const line = `- ${entity.kind} · ${entityName(task)} · ${entity.id}`;
    if (!touches.includes(line)) touches.push(line);
    const proof = String(task.proof ?? '').split('\n')[0];
    readBacks.push(`- Read-back: ${safeLine(proof) || 'the change reads back'}`);
    if (isRelease(task)) releases.push(`- ${releaseAction(task)} ${entityName(task)}`);
  }
  return [`# ${safeLine(words.split('\n')[0]).slice(0, 120)}`, '', '## Requested outcome', safeLine(words), '',
    '## Touches', ...touches, '', '## Ready when', ...readBacks, ...releases, ''].join('\n');
}

function source(ctx, flags) {
  const drafts = draftsFolder(ctx.home, ctx.sessionId);
  if (flags.request !== undefined || flags.task !== undefined) {
    if (flags.file !== undefined || flags['tasks-file'] !== undefined) usage('Use --file with --tasks-file, or --request with --task, not both.');
    let given;
    try { given = JSON.parse(String(flags.task ?? '')); } catch { usage('--task must be a task or an array of tasks, as JSON.'); }
    const md = tinySpec(flags.request, given);
    const tasksText = JSON.stringify(Array.isArray(given) ? given : [given], null, 2) + '\n';
    const hash = planHash(md, tasksText, derivedOf(flags));
    const file = path.join(drafts, `plan-${hash}.md`), tasksFile = path.join(drafts, `tasks-${hash}.json`);
    atomicFile(file, md); atomicFile(tasksFile, tasksText);
    return { md, tasksText, file, tasksFile, hash, tiny: true };
  }
  if (flags.file === undefined) usage('plan propose needs --file <md> (with --tasks-file <json>), or --request with --task.');
  const cwd = ctx.cwd ?? process.cwd();
  const file = path.resolve(cwd, String(flags.file));
  // The compaction and resume reminders name only --file: a plan already proposed
  // from that file brings its tasks file along.
  const pending = (readState(ctx.home, ctx.sessionId) ?? {}).pendingSave;
  const remembered = pending?.file === file ? pending.tasksFile : undefined;
  if (flags['tasks-file'] === undefined && !remembered) usage('plan propose --file needs --tasks-file <json>.');
  const tasksFile = flags['tasks-file'] === undefined ? remembered : path.resolve(cwd, String(flags['tasks-file']));
  const md = readText(file, '--file'), tasksText = readText(tasksFile, '--tasks-file');
  return { md, tasksText, file, tasksFile, hash: planHash(md, tasksText, derivedOf(flags)), tiny: false };
}

function checked(src, toolAccess) {
  let parsedMd;
  try { parsedMd = parseFrontmatter(src.md); } catch (error) { throw new UaError('INVALID_SPEC', error.message); }
  if (specFormat(parsedMd.meta) === SPEC_FORMATS.BRIEF) usage('This Markdown is marked mode: sonic, the old brief format. Write it with the spec headings and no mode in its frontmatter.');
  const spec = parseSpecBody(parsedMd.body, { checkPageDesign: true });
  let raw;
  try { raw = JSON.parse(src.tasksText); } catch { bad('The tasks file is not valid JSON.'); }
  const tasks = validateTasks(raw, parsedMd.body, { access: toolAccess?.() ?? null });
  // The yes to this plan covers the deploy and publish lines the preview shows by name.
  const releaseYes = spec.releases.map(({ action, ref }) => ({ action, kind: ref.kind, name: ref.name, ...(ref.id ? { id: ref.id } : {}) }));
  return { spec, tasks, releaseYes };
}

async function save(ctx, flags, src, { spec, tasks, releaseYes }, mode, { createPlan, latestPlanOf, startPlan }) {
  if (!flags.go) {
    const given = String(flags.hash ?? '').trim();
    if (!given) usage('--save needs --hash, the hash plan propose printed.');
    if (given !== src.hash) bad(`The change text changed since plan propose (it is now ${src.hash}, not ${given}). Run plan propose again.`);
  }
  // One solution sync for the whole chain: spec accept and plan start skip theirs.
  if (!ctx.refreshed) await refreshCurrentIfStale(ctx);
  ctx = { ...ctx, refreshed: true };
  const state = readState(ctx.home, ctx.sessionId) ?? ctx.state ?? {};
  let pending = state.pendingSave?.hash === src.hash ? state.pendingSave : null;
  // The mode is a label on this change's records only. It is never kept on the
  // session, so an in-depth plan does not mark later chat changes as zen.
  const recordMode = mode ?? pending?.mode ?? DEFAULT_MODE;
  const base = { file: src.file, tasksFile: src.tasksFile, hash: src.hash, mode: recordMode };
  const runState = { ...ctx.state, mode: recordMode };
  const derivedFrom = derivedOf(flags);
  let specId = pending?.specId ?? null;
  if (!specId) {
    // A rerun redrafts the same text; spec accept's receipt then finds a spec it
    // already created instead of making a second one.
    const draft = await specRun('draft', [], { title: spec.title, 'md-file': src.file }, { ...ctx, state: runState });
    const accepted = await specRun('accept', [], { draft: draft.data.slug, ...(derivedFrom ? { 'derived-from': derivedFrom } : {}) }, { ...ctx, state: runState, releaseYes });
    specId = accepted.data.specId;
    pending = { ...base, status: 'accepted', specId };
    writeState(ctx.home, { pendingSave: pending }, ctx.sessionId);
  }
  // The new plan carries lineage to the newest plan of the spec it replaces.
  const oldPlanId = derivedFrom ? await latestPlanOf?.(derivedFrom) : null;
  const created = await createPlan({ spec: specId, 'tasks-file': src.tasksFile,
    ...(oldPlanId ? { 'derived-from': oldPlanId } : {}), ...(flags['evidence-file'] !== undefined ? { 'evidence-file': flags['evidence-file'] } : {}) });
  writeState(ctx.home, { pendingSave: null }, ctx.sessionId);
  if (flags.go) {
    // A rerun after a --go that started the plan and then failed finds that plan
    // again, already running: that is the goal reached, not an error.
    const begun = await startPlan(ctx, created.data.planId, { alreadyStartedOk: Boolean(created.data.recovered) });
    const alreadyStarted = Boolean(begun?.data?.alreadyStarted);
    return { data: { saved: true, started: true, ...(alreadyStarted ? { alreadyStarted } : {}), specId, planId: created.data.planId, tasks: tasks.length, releaseYes,
      ...(created.data.recovered ? { recovered: true } : {}) },
      message: alreadyStarted ? `Change already started: ${spec.title}.` : `Change saved and started: ${spec.title}.` };
  }
  return { data: { saved: true, hash: src.hash, specId, planId: created.data.planId, tasks: tasks.length, releaseYes,
    ...(created.data.recovered ? { recovered: true } : {}) }, message: `Plan saved: ${spec.title}.` };
}

const sameName = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase() && String(a ?? '').trim() !== '';
// Ids decide when both sides have one; a new entity has only its name.
const sameEntity = (a, b) => a.kind === b.kind && (a.id && b.id ? a.id === b.id : sameName(a.name, b.name));

/**
 * Running plans of other sessions on this solution that touch an entity these tasks touch. A fact to show, never a refusal.
 * `fresh` is the plan records just read from the tenant; they replace the local copy of the same plan.
 */
export function findOverlaps(home, sessionId, tasks, { fresh = [], now = Date.now(), clientId = null } = {}) {
  const mine = tasks.map((task) => task.entity ?? {}).filter((entity) => entity.kind);
  const byId = new Map();
  try { for (const plan of readPlans(home)) byId.set(plan.planId, plan); } catch { /* no local copy */ }
  for (const plan of planRows(fresh)) byId.set(plan.planId, plan);
  const live = readLiveSessions(home);
  const overlaps = [];
  for (const plan of byId.values()) {
    const runner = plan.runner?.claudeSessionId;
    if (plan.status !== 'in_progress' || !runner || runner === sessionId) continue;
    const stopped = maybeStopped(plan, sessionId, { now, clientId, live }), ago = formatAge(now - lastActivityAt(plan));
    const person = plan.runner.email || `Session ${runner.slice(0, 8)}`;
    const shown = [];
    for (const task of plan.tasks ?? []) {
      const entity = task.entity ?? {};
      const match = mine.find((own) => sameEntity(own, entity));
      if (!match || shown.some((done) => sameEntity(done, entity))) continue;
      shown.push(entity);
      const name = entity.name ?? match.name ?? entity.id;
      overlaps.push({ sessionId: runner, ...(plan.runner.email ? { email: plan.runner.email } : {}), planId: plan.planId, kind: entity.kind, name,
        id: entity.id ?? match.id ?? null, ...(stopped ? { maybeStopped: true } : {}),
        message: `${person} is also changing ${entity.kind} "${name}" (plan ${plan.planId}, ${stopped ? `maybe stopped: no activity for ${ago}` : `last activity ${ago} ago`}).` });
    }
  }
  return overlaps;
}

const lower = (value) => String(value ?? '').trim().toLowerCase();
const APP_TYPES = ['WEB', 'MOBILE', 'DISPLAY'];
// A block named with its id in a task body: `saveButton (b_btn)`, "Save" [b_btn],
// or b_btn (saveButton). A bare name counts only when it looks like a block's
// own name (saveButton, filter_row), so "the button (b_btn)" is not read as one.
// The underscored alternative needs at least two characters before the first
// underscore, so a one-letter prefixed id -- an event id such as e_abc123, not
// a block's own name -- is never read as a name paired with the id beside it.
const NAME = "(?:[\\x60\"']([^\\x60\"'\\n]{1,60})[\\x60\"']|\\b([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*|[A-Za-z][A-Za-z0-9]+_[A-Za-z0-9_]+)\\b)";
const ID = "\\x60?(b_[A-Za-z0-9_]+)\\x60?";
const NAME_THEN_ID = new RegExp(`${NAME}\\s*[([]\\s*${ID}\\s*[)\\]]`, 'gu');
const ID_THEN_NAME = new RegExp(`${ID}\\s*[([]\\s*${NAME}\\s*[)\\]]`, 'gu');
// A page the task body names by its own id -- `Commission Amount Calculation
// (e_6a9fee...)` -- read so a block mentioned after it is checked against that
// page, not the task's own page. Any entity id works as the address; only an
// `e_` id is ever a page's own id, so this never catches a block id (`b_...`).
const PAGE_REF = /\be_[A-Za-z0-9]+\b/gu;
// Every block mention with where it sits in the text, kept unmerged so two
// mentions of the same block id under two different named pages stay apart.
function blockMentions(text) {
  const value = String(text ?? '');
  const mentions = [];
  const add = (id, name, index) => { if (id && name && !name.startsWith('b_')) mentions.push({ id, name: name.trim(), index }); };
  for (const match of value.matchAll(NAME_THEN_ID)) add(match[3], match[1] ?? match[2], match.index);
  for (const match of value.matchAll(ID_THEN_NAME)) add(match[1], match[2] ?? match[3], match.index);
  return mentions;
}
// The nearest page id the text named before this block mention, or null when
// the body never gave one and the task's own page is the only guess left.
function namedPageBefore(text, index) {
  let best = null;
  for (const match of String(text ?? '').matchAll(PAGE_REF)) {
    if (match.index <= index && (!best || match.index > best.index)) best = { id: match[0], index: match.index };
  }
  return best?.id ?? null;
}

/**
 * Facts in the tasks that the solution's cache says are wrong: a page id its
 * app does not hold, a block name that is not the name of the block id beside
 * it, and an app type the spec's READ row gives that the cached app does not
 * have. Warnings only, and only from a copy the cache holds as current: a miss
 * or a stale copy says nothing, since a live read is the builder's.
 */
export { blockMentions };
export function cacheWarnings(home, tasks, spec) {
  const warnings = [];
  let apps;
  try { apps = listCachedEntities(home).filter((snapshot) => snapshot.entityType === 'e_interface'); } catch { return warnings; }
  const appContext = new Map();
  const appOf = (id) => {
    if (!appContext.has(id)) { try { appContext.set(id, readCachedAppContext(home, id)); } catch { appContext.set(id, null); } }
    const context = appContext.get(id);
    return context?.status === 'hit' ? context : null;
  };
  const holder = (pageId) => apps.find((app) => appOf(app.id)?.pages.some((page) => page.pageId === pageId));
  for (const task of tasks) {
    const entity = task.entity ?? {};
    if (entity.kind !== 'page' || !entity.id) continue;
    const appId = entity.appId ?? holder(entity.id)?.id;
    const app = appId ? appOf(appId) : null;
    if (!app) continue;
    const appName = app.interface?.properties?.name ?? appId;
    if (!app.pages.some((page) => page.pageId === entity.id)) {
      const other = holder(entity.id);
      warnings.push(`${task.id} names page ${entity.name} [${entity.id}], which the cached app ${appName} [${appId}] does not hold${other ? `; the cached app ${other.entity?.properties?.name ?? other.id} [${other.id}] does` : ''}.`);
      continue;
    }
    const page = readCachedPageContext(home, appId, entity.id);
    if (page.status !== 'hit') continue;
    const blocks = page.page?.properties?.blocks ?? {};
    const text = `${task.body}\n${task.proof}`;
    const seen = new Set();
    for (const mention of blockMentions(text)) {
      const namedPageId = namedPageBefore(text, mention.index);
      const sameAsOwnPage = !namedPageId || namedPageId === entity.id;
      let pageLabel = entity.name, pageBlocks = blocks;
      if (!sameAsOwnPage) {
        const namedApp = holder(namedPageId);
        if (!namedApp) continue; // the named page is not in the cache; nothing to check it against
        const namedPage = readCachedPageContext(home, namedApp.id, namedPageId);
        if (namedPage.status !== 'hit') continue;
        pageLabel = namedPage.page?.properties?.name ?? namedPageId;
        pageBlocks = namedPage.page?.properties?.blocks ?? {};
      }
      const key = `${pageLabel} ${mention.id} ${lower(mention.name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const block = pageBlocks[mention.id];
      if (!block) warnings.push(`${task.id} names block ${mention.name} (${mention.id}), but the cached page ${pageLabel} has no block ${mention.id}.`);
      else if (block.displayName && lower(block.displayName) !== lower(mention.name)) {
        warnings.push(`${task.id} names block ${mention.name} (${mention.id}), but on the cached page ${pageLabel} ${mention.id} is ${block.displayName}.`);
      }
    }
  }
  // The READ table: | entity | id | read | fact | READ / INFERRED |. A row on a cached app whose fact names an app type.
  for (const line of (spec.sections?.['Current state (READ)'] ?? '').split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length < 5) continue;
    const said = APP_TYPES.find((type) => new RegExp(`\\b${type}\\b`, 'u').test(cells[4] ?? ''));
    if (!said) continue;
    const app = apps.find((item) => item.id === cells[2] || lower(item.entity?.properties?.name) === lower(cells[1]));
    const type = app ? appOf(app.id)?.interface?.properties?.manifest?.type : null;
    if (type && type !== said) warnings.push(`The READ row for ${cells[1]} says ${said}, but the cached app ${app.entity?.properties?.name ?? app.id} [${app.id}] is ${type}.`);
  }
  return warnings;
}

/** The solution's plans as the tenant holds them now. On a failed read, the local copy and one line saying how old it is. */
async function tenantPlans(ctx, readTenantPlans) {
  if (!readTenantPlans) return { fresh: [], note: null };
  try { return { fresh: await readTenantPlans(), note: null }; }
  catch {
    const sync = readSyncStatus(ctx.home);
    const at = sync?.endedAt ?? sync?.startedAt;
    return { fresh: [], note: `Could not check the tenant for other people's work; this uses the copy from ${at ?? 'the last refresh'}.` };
  }
}

const ownClientId = (ctx) => { try { return (ctx.actor ?? executionActor()).clientId ?? null; } catch { return null; } };

const withOverlaps = (out, overlaps, note, warnings = []) => (overlaps.length || note || warnings.length
  ? { ...out, data: { ...out.data, ...(overlaps.length ? { overlaps } : {}), ...(note ? { tenantCheck: note } : {}), ...(warnings.length ? { cacheWarnings: warnings } : {}) },
    message: [out.message, ...overlaps.map((item) => item.message), ...(note ? [note] : []),
      ...warnings.map((line) => `Cache check: ${line}`)].join('\n') } : out);

export async function propose(ctx, flags, { createPlan, toolAccess, latestPlanOf, startPlan, readTenantPlans } = {}) {
  if (flags.go && (flags.save || flags.hash !== undefined)) usage('--go saves by itself: leave out --save and --hash.');
  if (flags.go && flags.preview) usage('--go shows no preview: leave out --preview.');
  const mode = flags.mode === undefined ? null : normalizeMode(flags.mode);
  const src = source(ctx, flags);
  const result = checked(src, toolAccess);
  const { fresh, note } = await tenantPlans(ctx, readTenantPlans);
  const overlaps = findOverlaps(ctx.home, ctx.sessionId, result.tasks, { fresh, clientId: ownClientId(ctx) });
  const warnings = cacheWarnings(ctx.home, result.tasks, result.spec);
  if (flags.save || flags.go) return withOverlaps(await save(ctx, flags, src, result, mode, { createPlan, latestPlanOf, startPlan }), overlaps, note, warnings);
  if (flags.hash !== undefined) usage('--hash goes with --save.');
  if (flags['evidence-file'] !== undefined) usage('--evidence-file goes with --save or --go.');
  if (flags.preview && src.tiny) usage('A short change has no preview: use --file with --tasks-file.');
  const policy = askPolicy({ askBeforeDeploy: true, releaseYes: result.releaseYes });
  const asks = askingSteps(result.tasks, policy).map(({ id, what, asks: asking }) => ({ id, what, asks: asking }));
  let previewFile = null, opened = false;
  if (flags.preview) {
    const html = buildPlanPreview({ hash: src.hash, spec: result.spec, tasks: result.tasks, wiring: readWiringFile(ctx.home), askBeforeDeploy: policy, derivedFrom: derivedOf(flags) });
    previewFile = writePreview(ctx.home, ctx.sessionId, src.hash, html);
    opened = openPreview(previewFile, { drafts: draftsFolder(ctx.home, ctx.sessionId) });
  }
  writeState(ctx.home, { pendingSave: { file: src.file, tasksFile: src.tasksFile, hash: src.hash, status: 'proposed',
    ...(previewFile ? { previewPath: previewFile } : {}), ...(mode ? { mode } : {}) } }, ctx.sessionId);
  return withOverlaps({ data: { hash: src.hash, title: result.spec.title, ...(derivedOf(flags) ? { derivedFrom: derivedOf(flags) } : {}), tasks: result.tasks.length, previewPath: previewFile, opened, asks, tiny: src.tiny },
    message: src.tiny ? `Change checked: ${result.spec.title}. Run it with --go, or save it with --save --hash ${src.hash}.`
      : previewFile ? `Preview of ${result.spec.title}: ${previewFile}`
        : `Change checked: ${result.spec.title}. Save it with --save --hash ${src.hash}, or run it with --go.` }, overlaps, note, warnings);
}
