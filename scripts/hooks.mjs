#!/usr/bin/env node
// Local lifecycle checkpoints. Hooks never call the tenant or infer task results.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homeForCwd, readState, readRecords, renderAll, canonicalCwd, executionActor } from './folder/local.mjs';
import { approveFolder, atomicFile } from './lib/session-paths.mjs';
import { parsePlan } from './lib/formats.mjs';
import { spawn } from 'node:child_process';
import { readSyncStatus } from './folder/solution-sync.mjs';
import { tenantOnlyHome } from './folder/session-registry.mjs';
import { refreshSession, syncRunning } from './session-sync.mjs';
import { SYNC_FILE } from './folder/folder-layout.mjs';
import { readWiring } from './folder/solution-map.mjs';
import { readChatTasks, readLiveSessions, readPlans } from './folder/solution-work.mjs';
import { GUIDE_NAME, UA_CLI, pluginVersion, writeSolutionGuide } from './folder/solution-guide.mjs';
import { buildSessionSnapshot, pendingSaveLine } from './lib/session-snapshot.mjs';
import { loopsHealthLine } from './folder/loops-health.mjs';
import { approveDelete, dropDelete, pendingSummaryShown, recordFailedYes } from './folder/delete-yes.mjs';
import { recordClaudeProcess } from './folder/claude-process.mjs';
import { ledgerLine } from './lib/ledger.mjs';
import { startCaffeinate, stopCaffeinate } from './folder/caffeinate.mjs';
import { effortFor, modelFitNotice } from './folder/model-fit.mjs';
import { checkForUpdate, updateNotice } from './lib/update-check.mjs';

const eventNames = new Set(['SessionStart', 'PostToolUse', 'PreCompact']);
const scriptsFolder = path.dirname(fileURLToPath(import.meta.url));
const runtimeScript = path.join(scriptsFolder, 'runtime.sh');
const sessionSyncScript = path.join(scriptsFolder, 'session-sync.mjs');
const SYNC_NOT_STARTED = 'UnifyApps Headless could not start the session sync.';
const SYNC_SOURCES = new Set(['startup', 'clear', 'resume']);
const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
const validTranscriptPath = (value) => typeof value === 'string' && path.isAbsolute(value) && !/[\r\n\0]/u.test(value);
const shellQuote = (value) => `'${String(value).replace(/'/gu, "'\\''")}'`;
function writeCheckpoint(file, value) {
  atomicFile(file, JSON.stringify(value, null, 2) + '\n');
}
export function handleHook(event, { envFile = process.env.CLAUDE_ENV_FILE } = {}) {
  if (!event || !eventNames.has(event.hook_event_name) || !validId(event.session_id) || typeof event.cwd !== 'string') return null;
  const kind = event.hook_event_name;
  if (kind === 'PostToolUse' && (event.tool_name !== 'Bash' || !/(?:^|[\s/"'])ua\.mjs(?:[\s"']|$)/.test(event.tool_input?.command ?? ''))) return null;
  const cwd = canonicalCwd(event.cwd), sessionId = event.session_id;
  if (kind === 'SessionStart' && envFile) {
    // IDs are restricted above; the file belongs to Claude Code and append
    // preserves environment declarations installed by other plugins. Loading
    // the shared runtime makes UnifyApps Headless's private Node available to later Bash
    // calls even when the parent shell has no system-wide Node installation.
    // The file check matters after an update in the session: Claude Code
    // removes the old plugin folder, and every later Bash call would fail to load it.
    fs.appendFileSync(envFile, `\n[ -f ${shellQuote(runtimeScript)} ] && . ${shellQuote(runtimeScript)}\nexport CLAUDE_CODE_SESSION_ID='${sessionId}'\n`);
    if (validTranscriptPath(event.transcript_path)) {
      const quoted = event.transcript_path.replace(/'/gu, "'\\''");
      fs.appendFileSync(envFile, `export UA_TRANSCRIPT_PATH='${quoted}'\n`);
    }
  }
  // The hook event is authoritative. An inherited ID can belong to the
  // terminal's previous Claude session in the same workspace.
  const binding = homeForCwd(cwd, sessionId);
  if (!binding) return tenantOnlyReminder(event, cwd, sessionId);
  if (kind === 'SessionStart') try { startCaffeinate(binding.sessionHome); } catch { /* best effort: never blocks the session */ }
  const file = path.join(binding.sessionHome, 'checkpoint.json');
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first event */ }
  const state = readState(binding.home, sessionId);
  const active = state?.claudeSessionId === sessionId;
  const transcriptPath = validTranscriptPath(event.transcript_path) ? event.transcript_path
    : process.env.CLAUDE_CODE_SESSION_ID === sessionId && validTranscriptPath(process.env.UA_TRANSCRIPT_PATH) ? process.env.UA_TRANSCRIPT_PATH
      : previous.transcriptPath;
  const next = { claudeSessionId: sessionId, cwd,
    ...(validTranscriptPath(transcriptPath) ? { transcriptPath } : {}),
    updatedAt: new Date().toISOString(), event: kind };
  if (active) {
    if (kind === 'PostToolUse') renderAll(binding.home);
    const plans = readRecords(binding.home, 'plan').flatMap(record => {
      try { const p = parsePlan(record.properties.plan); return [{ planId: record.id, title: p.meta.title, status: record.properties.status,
        counts: Object.fromEntries(['pending', 'running', 'done', 'failed', 'skipped'].map(status => [status, p.tasks.filter(task => task.status === status).length])),
        running: p.tasks.filter(task => task.status === 'running').map(task => ({ id: task.id, agentName: task.agentName ?? null })) }]; }
      catch { return []; }
    });
    next.checkpoint = { key: state.key, home: binding.home, planIds: state.planIds, plans };
  }
  writeCheckpoint(file, next);
  if (kind === 'SessionStart' && active && ['compact', 'resume'].includes(event.source)) {
    // The mode is kept only for records, so a resume never routes by it: the solution guide decides per message.
    const modeLine = `(follow the solution guide in ${GUIDE_NAME} for each message)`;
    // Only plans this session runs; the shared cache also holds other sessions' plans.
    const running = (next.checkpoint.plans ?? []).filter(plan => (state.planIds ?? []).includes(plan.planId)
      && plan.status === 'in_progress' && plan.running.length).map(plan => plan.planId);
    const recover = !running.length ? ''
      : event.source === 'resume' ? ` Agents from before the restart cannot report. Call ${running.map(id => `plan reclaim ${id}`).join(' and ')} first.`
        : ' Agents sent before compaction keep working and still report; wait for their notifications before sending more.';
    // What the person typed after `/ua:setup` outlives a compaction, so the
    // session picks their request back up instead of asking what they wanted.
    // A changeset the session saved is its own trail: a resume continues it before anything else.
    const changesetTrace = fs.existsSync(path.join(binding.sessionHome, 'drafts', 'changeset.md'));
    const pending = state.openingRequest && !(state.planIds ?? []).length && !state.execution && !changesetTrace
      ? ` The person opened this session with: ${state.openingRequest}` : '';
    const building = (next.checkpoint.plans ?? []).some(plan => (state.planIds ?? []).includes(plan.planId) && plan.status === 'in_progress');
    const continueLine = changesetTrace && !running.length
      ? ` A changeset is in progress: read solution context with the UnifyApps Headless CLI, then continue from .sessions/${sessionId}/drafts/changeset.md with changeset-manager § Recovery (get_changeset for each id there); plan ready --mark has nothing to send.`
      : building
        ? ' Read solution context with the UnifyApps Headless CLI, then call plan ready --mark before sending more work. Recorded task results remain in the solution cache.'
        : ' Read solution context with the UnifyApps Headless CLI. Recorded task results remain in the solution cache.';
    const taskLine = currentTaskLine(state.currentTask);
    const ledgerText = ledgerLine(state.ledger);
    const saveLine = pendingSaveLine(state.pendingSave);
    return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext:
      `UnifyApps Headless is already started for this Claude session ${modeLine}.${recover}${pending}${taskLine}${ledgerText}${saveLine ? ` ${saveLine}` : ''}${continueLine}` } };
  }
  return null;
}

function currentTaskLine(task) {
  return task?.request ? ` Current task: ${String(task.request).slice(0, 300)}. Outcome: ${task.outcome ?? 'not set'}. Phase: ${task.phase ?? 'not set'}.`
    + ` Done: ${(task.done ?? []).length} writes. Approvals given: ${(task.approvals ?? []).join('; ') || 'none'}. Do not repeat a done write or ask an approval again.`
    + sentLine(task.sent) : '';
}

// Pieces handed to a builder whose read-back was never recorded. The builder
// is gone after a crash, and its write may have half landed.
function sentLine(sent) {
  const short = (value, size) => String(value ?? '').replace(/\s+/gu, ' ').slice(0, size);
  const pieces = (Array.isArray(sent) ? sent : []).slice(0, 10).map((piece) => `${short(piece?.what, 120)} (${short(piece?.entity, 80)})`);
  return pieces.length ? ` Sent to builders and not proven: ${pieces.join('; ')}. Read each one live before sending it again.` : '';
}

// A folder connected to a tenant with no solution keeps only the current task.
function tenantOnlyReminder(event, cwd, sessionId) {
  if (event.hook_event_name !== 'SessionStart' || !['compact', 'resume'].includes(event.source)) return null;
  let taskLine = '';
  try {
    const found = tenantOnlyHome(cwd, sessionId);
    if (found) taskLine = currentTaskLine(readState(found.home, sessionId)?.currentTask);
  } catch { return null; }
  if (!taskLine) return null;
  return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext:
    `UnifyApps Headless is connected to a tenant in this folder with no solution open.${taskLine}` } };
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function syncLine(status, running) {
  if (running || !status || status.status === 'running') return `UnifyApps Headless sync is still running; see ${SYNC_FILE}.`;
  if (status.status === 'ok') return `UnifyApps Headless synced ${status.solutionName ?? status.solutionId ?? 'the solution'} on ${status.tenant ?? 'the tenant'}: ${status.changed ?? 0} changed, ${status.failed ?? 0} failed.`;
  if (status.reason === 'restart needed') return 'UnifyApps Headless syncs the solution after the restart.';
  if (status.reason === 'sign-in expired') return `Sign-in expired for ${status.tenant ?? 'the tenant'}; sign in when the first task needs the tenant.`;
  return `UnifyApps Headless sync failed (${status.reason ?? 'unknown'}); see ${SYNC_FILE}.`;
}

/**
 * Starts the solution refresh in a detached child, then waits a short while for
 * it, because the person's first prompt waits for this hook. Runs only in a
 * folder UnifyApps Headless opened a solution in: the setup skill's description tells Claude
 * when to start setup anywhere else.
 */
export async function sessionSyncLines(event, { waitMs = Number(process.env.UA_SESSION_SYNC_WAIT_MS) || 15_000, execPath = process.execPath, script = sessionSyncScript } = {}) {
  if (event?.hook_event_name !== 'SessionStart' || !SYNC_SOURCES.has(event.source)) return [];
  if (!validId(event.session_id) || typeof event.cwd !== 'string') return [];
  // Tests run on the fake platform; only a test that asks for this path gets it.
  if (process.env.UA_FAKE === '1' && process.env.UA_SESSION_SYNC_TEST !== '1') return [];
  const folder = canonicalCwd(event.cwd);
  const session = refreshSession(folder, event.session_id);
  if (!session) return [];
  const home = session.path ?? folder;
  const started = Date.now();
  const alreadyRunning = syncRunning(home);
  let spawnFailed = false;
  const child = spawn(execPath, [script, folder, event.session_id], { cwd: folder, detached: true, stdio: 'ignore', env: process.env });
  child.on('error', () => { spawnFailed = true; });
  child.unref();
  // A status file written just before `started` can still look "recent"
  // under any grace window, but it belongs to an earlier call, not to the child we
  // just spawned. Require the finish time to be no earlier than our own `started`,
  // with no grace margin: nothing this child writes can finish before we recorded
  // `started`, so a value at or before it is always a leftover from an earlier call.
  // A grace margin here once let that leftover pass as "done" while the real child
  // was still writing into the folder (this raced a test's own cleanup: ENOTEMPTY).
  const fresh = (value, key) => value && Date.parse(value[key]) >= started;
  let sync = null;
  while (Date.now() - started < waitMs) {
    if (spawnFailed) return [SYNC_NOT_STARTED];
    sync = readSyncStatus(home);
    if (alreadyRunning || (sync && sync.status !== 'running' && fresh(sync, 'endedAt'))) break;
    await sleep(200);
  }
  if (spawnFailed) return [SYNC_NOT_STARTED];
  const lines = [syncLine(sync, alreadyRunning || !(sync && fresh(sync, 'endedAt')))];
  refreshGuide(home);
  const snapshot = snapshotFor(home, session, readSyncStatus(home), event.session_id);
  if (snapshot) lines.push(snapshot);
  // A resumed session's own reminder already names it.
  if (event.source !== 'resume' || session.sessionId !== event.session_id) {
    let saveLine = '';
    try { saveLine = pendingSaveLine(readState(home, session.sessionId)?.pendingSave); } catch { /* no state yet */ }
    if (saveLine) lines.push(saveLine);
  }
  return lines;
}

const GUIDE_VERSION = /<!-- nebula:start v([^ >]*) -->/u;

/** Only a UnifyApps Headless command re-rendered the guide, so after a reinstall the folder kept
 * the old one until then. The same copy moved to another machine or user keeps its
 * version but bakes an absolute CLI path that may no longer exist there either, so
 * that is checked on its own, not folded into the version check. */
function refreshGuide(home) {
  try {
    const text = fs.readFileSync(path.join(home, GUIDE_NAME), 'utf8');
    const stamped = GUIDE_VERSION.exec(text)?.[1];
    if (stamped !== undefined && (stamped !== pluginVersion() || !text.includes(UA_CLI))) writeSolutionGuide(approveFolder(home));
  } catch { /* no guide to refresh */ }
}

function snapshotFor(home, session, sync, sessionId) {
  try {
    let memory = '';
    try { memory = fs.readFileSync(path.join(home, 'memory.md'), 'utf8'); } catch { /* none */ }
    let wiring = {};
    try { wiring = readWiring(home) ?? {}; } catch { /* not rendered yet */ }
    const work = { plans: readPlans(home), chatTasks: readChatTasks(home), sessionId, live: readLiveSessions(home) };
    let actor = null;
    try { actor = executionActor(); } catch { /* no client id: no plan is this install's */ }
    return buildSessionSnapshot({ sync, solution: { id: session.solutionId, name: session.solutionName }, tenant: session.tenant, work, actor, memory, wiring });
  } catch { return null; }
}

// The person's own answer to a CONFIRM_REQUIRED question. A subagent's hook
// input names its agent_type, and a subagent never talks to the person, so
// only the main session's answers count.
export function recordApprovals(event) {
  if (event?.hook_event_name !== 'PostToolUse' || event.tool_name !== 'AskUserQuestion' || event.agent_type) return;
  const answers = event.tool_response?.answers;
  if (!answers || typeof answers !== 'object') return;
  for (const [question, answer] of Object.entries(answers)) {
    // One question may name several deletes, so a cleanup is one question.
    // A yes counts for all of them or for none: every id named must be
    // waiting and have its own summary in the question, so a list with one
    // hidden delete approves nothing. A "no" drops every id named.
    const ids = [...new Set([...question.matchAll(/\((d_[0-9a-f]{6})\)/gu)].map((match) => match[1]))];
    if (!ids.length) continue;
    // A "yes" that hid a summary approves nothing; the mismatch is recorded on
    // each pending id, not silently dropped, so the next refusal can say a yes
    // was seen but did not count.
    try {
      if (!/^yes/iu.test(String(answer ?? '').trim())) for (const id of ids) dropDelete(id);
      else if (ids.every((id) => pendingSummaryShown(id, question))) for (const id of ids) approveDelete(id, question);
      else for (const id of ids) recordFailedYes(id);
    } catch { /* a missed yes only asks again */ }
  }
}

// Shown to the person, never added to the context, and only in a folder UnifyApps Headless works in.
function modelNotice(event) {
  if (event.hook_event_name !== 'SessionStart' || !SYNC_SOURCES.has(event.source) || typeof event.model !== 'string') return null;
  try {
    const cwd = canonicalCwd(event.cwd);
    if (!homeForCwd(cwd, event.session_id) && !tenantOnlyHome(cwd, event.session_id)) return null;
    return modelFitNotice(event.model, effortFor(event.model, { cwd }));
  } catch { return null; }
}

export async function main() {
  try {
    const input = fs.readFileSync(0, 'utf8');
    if (Buffer.byteLength(input) > 1_048_576) return;
    const event = JSON.parse(input);
    recordApprovals(event);
    // The tenant bridges read this to name the session calling them after /clear or /resume.
    if (event?.hook_event_name === 'SessionStart') try { recordClaudeProcess(event.session_id); } catch { /* the bridge falls back to the folder's newest session */ }
    if (event?.hook_event_name === 'SessionEnd' && validId(event.session_id) && typeof event.cwd === 'string') {
      try {
        const binding = homeForCwd(canonicalCwd(event.cwd), event.session_id);
        if (binding) stopCaffeinate(binding.sessionHome);
      } catch { /* best effort: SessionEnd must still finish */ }
    }
    let output = handleHook(event);
    let lines = [];
    try { lines = await sessionSyncLines(event); }
    catch { lines = [SYNC_NOT_STARTED]; }
    let updateLine = null, updateRequired = false;
    if (event.hook_event_name === 'SessionStart' && (process.env.UA_FAKE !== '1' || process.env.UA_RELEASE_URL)) {
      const update = await checkForUpdate().catch(() => null);
      updateLine = updateNotice(update);
      updateRequired = update?.state === 'required';
      if (updateLine) lines.push(updateLine);
    }
    if (event.hook_event_name === 'SessionStart') {
      // A folder with a MOBILE or WEB app gets the loops health line (the UnifyApps Headless loops). It
      // reads only local state and the cached check.
      if (process.env.UA_FAKE !== '1' || process.env.UA_LOOPS_HEALTH_TEST === '1') {
        try {
          const binding = homeForCwd(canonicalCwd(event.cwd), event.session_id);
          const line = binding ? loopsHealthLine(binding.home) : null;
          if (line) lines.push(line);
        } catch { /* the health line is advice only */ }
      }
    }
    if (lines.length) {
      const before = output?.hookSpecificOutput?.additionalContext;
      output = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: [before, ...lines].filter(Boolean).join('\n') } };
    }
    const notice = [updateRequired ? updateLine : null, modelNotice(event)].filter(Boolean).join('\n');
    if (notice) output = { ...output, systemMessage: notice };
    if (output) process.stdout.write(JSON.stringify(output) + '\n');
  } catch (error) { process.stderr.write('UnifyApps Headless could not checkpoint local context. The saved platform records remain available.\n'); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
