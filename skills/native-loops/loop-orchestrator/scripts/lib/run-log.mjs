// The run log: <solution>/.nebula/loops/runs/<run-id>/run-log.jsonl, one redacted JSON event per
// line, appended during a run (cheap: no report, no token sum until asked).
//
// Every event: { ts (ISO, added when missing), run (added), type, ...fields }. The types the
// report reads (others are kept as they are):
//   run.start     { goal, platform, scope, focus }          run.end    { outcome }
//   stage.start   { stage }                                 stage.end  { stage, outcome }
//   dispatch      { stage, agent (type), job, description, toolUseId, prompt }
//   report        { stage, agent, job, toolUseId, summary, report }
//   skill         { name, stage }                           loop       { name, stage }   (a loops CLI call)
//   approval      { approval (plan|deploy|code|publish|…), question, answer, recommended, seconds }
//   reservation   { action: reserve|release, udid, name, waitMs }
//   queue         { action: add|take|done|fail, id, kind, waitMs }
//   issue         { id | ids[], status: found|fixed|reopened|verified|open|regressed|platform|escalated, page, severity }
//   publish | deploy | commit | writeback   { app | automation | files, version }
//   error         { stage, error, retried }
// Redaction runs before the write (redact.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { nowMs } from './exec.mjs';
import { missing, usage } from './output.mjs';
import { readJson, readJsonl } from './paths.mjs';
import { loadSecretList, redactValue } from './redact.mjs';

export const logFile = (run) => path.join(run.dir, 'run-log.jsonl');

export function parseEventArg(text) {
  if (text == null || text === '') throw usage('log append needs the event as JSON: log append \'{"type":"stage.start","stage":"audit"}\' (or - to read stdin)');
  let event;
  try {
    event = JSON.parse(text);
  } catch (error) {
    throw usage(`the event is not JSON: ${error.message}`);
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw usage('the event must be a JSON object');
  if (typeof event.type !== 'string' || !event.type.trim()) throw usage('the event needs a "type" (stage.start, dispatch, approval, issue, …)');
  return event;
}

/** Redact and append. Returns the line written. */
export function appendEvent(run, event, { home } = {}) {
  if (!run) throw usage('no run: pass --run <id> or set LOOPS_RUN_ID');
  const secrets = loadSecretList(home);
  const stamped = { ts: event.ts ?? new Date(nowMs()).toISOString(), run: run.id, ...event };
  const clean = redactValue(stamped, secrets);
  const line = JSON.stringify(clean);
  fs.mkdirSync(run.dir, { recursive: true });
  fs.appendFileSync(logFile(run), `${line}\n`);
  return clean;
}

export function readEvents(run) {
  const file = logFile(run);
  if (!fs.existsSync(file)) throw missing(`no run-log.jsonl in ${run.dir}`);
  return readJsonl(file).filter((event) => event && typeof event.type === 'string');
}

const ms = (iso) => {
  const at = Date.parse(iso ?? '');
  return Number.isFinite(at) ? at : null;
};
const count = (map, key, by = 1) => {
  map[key] = (map[key] ?? 0) + by;
};
const sortedCounts = (map) => Object.entries(map).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([name, value]) => ({ name, count: value }));

export const DONE_STATUSES = new Set(['fixed', 'verified', 'passed', 'accepted', 'platform-limit-confirmed']);

/** Pure: the run report's data from the run log's events (+ tokens.json, + board.json). */
export function runReportData({ runId, events, tokens = null, board = null }) {
  const sorted = [...events].sort((left, right) => String(left.ts ?? '').localeCompare(String(right.ts ?? '')));
  const start = sorted.find((event) => event.type === 'run.start');
  const end = [...sorted].reverse().find((event) => event.type === 'run.end');
  const firstTs = sorted[0]?.ts ?? null;
  const lastTs = sorted.at(-1)?.ts ?? null;
  const startedAt = start?.ts ?? firstTs;
  const endedAt = end?.ts ?? lastTs;

  const stages = new Map();
  const stage = (name) => {
    if (!stages.has(name)) stages.set(name, { name, startedAt: null, endedAt: null, outcome: null, dispatches: 0, reports: 0, errors: 0, agents: {} });
    return stages.get(name);
  };
  const agents = {};
  const skills = {};
  const loops = {};
  const approvals = [];
  const issues = new Map();
  const reopened = {};
  const reservations = { count: 0, devices: {}, waits: [] };
  const queue = { added: 0, taken: 0, done: 0, failed: 0, byKind: {}, waits: [] };
  const releases = {};
  const errors = [];
  const reserved = new Map();
  for (const event of sorted) {
    const at = ms(event.ts);
    switch (event.type) {
      case 'stage.start': {
        const item = stage(event.stage ?? 'unnamed');
        item.startedAt ??= event.ts;
        break;
      }
      case 'stage.end': {
        const item = stage(event.stage ?? 'unnamed');
        item.endedAt = event.ts;
        item.outcome = event.outcome ?? item.outcome;
        break;
      }
      case 'dispatch': {
        const type = event.agent ?? 'unknown';
        agents[type] ??= { type, dispatches: 0, reports: 0 };
        agents[type].dispatches += 1;
        if (event.stage) {
          const item = stage(event.stage);
          item.dispatches += 1;
          count(item.agents, type);
        }
        break;
      }
      case 'report': {
        const type = event.agent ?? 'unknown';
        agents[type] ??= { type, dispatches: 0, reports: 0 };
        agents[type].reports += 1;
        if (event.stage) stage(event.stage).reports += 1;
        break;
      }
      case 'skill': count(skills, event.name ?? 'unknown'); break;
      case 'loop': case 'cli': count(loops, event.name ?? event.command ?? 'unknown'); break;
      case 'approval': approvals.push({ approval: event.approval ?? 'approval', at: event.ts ?? null, answer: event.answer ?? null, recommended: typeof event.recommended === 'boolean' ? event.recommended : null, seconds: Number.isFinite(event.seconds) ? event.seconds : null }); break;
      case 'error': {
        errors.push({ at: event.ts ?? null, stage: event.stage ?? null, text: String(event.error ?? event.message ?? '').slice(0, 300), retried: event.retried ?? null });
        if (event.stage) stage(event.stage).errors += 1;
        break;
      }
      case 'reservation': {
        const device = event.name ?? event.udid ?? 'device';
        if (event.action === 'reserve') {
          reservations.count += 1;
          reservations.devices[device] ??= { name: device, holds: 0, heldMs: 0 };
          reservations.devices[device].holds += 1;
          if (at != null) reserved.set(device, at);
          if (Number.isFinite(event.waitMs)) reservations.waits.push(event.waitMs);
        } else if (event.action === 'release' && reserved.has(device) && at != null) {
          reservations.devices[device] ??= { name: device, holds: 0, heldMs: 0 };
          reservations.devices[device].heldMs += at - reserved.get(device);
          reserved.delete(device);
        }
        break;
      }
      case 'queue': {
        const action = event.action ?? 'add';
        const key = { add: 'added', take: 'taken', fail: 'failed' }[action] ?? action;
        if (typeof queue[key] === 'number') queue[key] += 1;
        if (event.kind) {
          queue.byKind[event.kind] ??= { added: 0, taken: 0, done: 0, failed: 0 };
          if (key in queue.byKind[event.kind]) queue.byKind[event.kind][key] += 1;
        }
        if (Number.isFinite(event.waitMs)) queue.waits.push(event.waitMs);
        break;
      }
      case 'issue': {
        const ids = Array.isArray(event.ids) ? event.ids : event.id ? [event.id] : [];
        for (const id of ids) {
          const record = issues.get(id) ?? { id, first: event.status, status: event.status, attempts: 0, page: event.page ?? null, severity: event.severity ?? null };
          record.status = event.status ?? record.status;
          if (event.status === 'reopened') {
            record.attempts += 1;
            count(reopened, id);
          }
          issues.set(id, record);
        }
        break;
      }
      case 'publish': case 'deploy': case 'commit': case 'writeback': count(releases, event.type); break;
      default: break;
    }
  }
  const stageList = [...stages.values()].map((item) => {
    const durationMs = ms(item.startedAt) != null && ms(item.endedAt) != null ? ms(item.endedAt) - ms(item.startedAt) : null;
    const tokenSum = tokens?.byStage?.[item.name] ?? null;
    return { ...item, durationMs, agents: sortedCounts(item.agents), tokens: tokenSum ? { total: tokenSum.total, input: tokenSum.input, output: tokenSum.output, cacheRead: tokenSum.cacheRead, cacheCreation: tokenSum.cacheCreation } : null };
  }).sort((left, right) => String(left.startedAt ?? '~').localeCompare(String(right.startedAt ?? '~')) || left.name.localeCompare(right.name));
  const agentList = Object.values(agents).map((item) => {
    const sum = tokens?.byType?.[item.type] ?? null;
    return { ...item, tokens: sum ? sum.total : null };
  }).sort((left, right) => right.dispatches - left.dispatches || left.type.localeCompare(right.type));
  const issueList = [...issues.values()];
  const issueFlow = {
    found: issueList.length,
    fixed: issueList.filter((item) => DONE_STATUSES.has(item.status)).length,
    reopened: Object.keys(reopened).length,
    reopens: Object.values(reopened).reduce((sum, value) => sum + value, 0),
    open: issueList.filter((item) => !DONE_STATUSES.has(item.status)).length,
    maxAttempts: issueList.reduce((max, item) => Math.max(max, item.attempts), 0),
    byStatus: Object.fromEntries(sortedCounts(issueList.reduce((map, item) => (count(map, item.status ?? 'unknown'), map), {})).map((item) => [item.name, item.count])),
    bySeverity: Object.fromEntries(sortedCounts(issueList.reduce((map, item) => (count(map, item.severity ?? 'unknown'), map), {})).map((item) => [item.name, item.count])),
  };
  const stats = (list) => ({ count: list.length, totalMs: list.reduce((sum, value) => sum + value, 0), maxMs: list.length ? Math.max(...list) : 0 });
  const tokenTotals = tokens?.totals ?? null;
  const skillCounts = sortedCounts(tokens?.skills ? { ...skills, ...Object.fromEntries(Object.entries(tokens.skills).map(([name, value]) => [name, Math.max(value, skills[name] ?? 0)])) } : skills);
  const loopCounts = sortedCounts(tokens?.loopCalls ? { ...loops, ...Object.fromEntries(Object.entries(tokens.loopCalls).map(([name, value]) => [name, Math.max(value, loops[name] ?? 0)])) } : loops);
  return {
    schema: 'loops.run-report/1',
    run: {
      id: runId, goal: start?.goal ?? null, scope: start?.scope ?? null, focus: start?.focus ?? null, outcome: end?.outcome ?? null,
      startedAt, endedAt, durationMs: ms(startedAt) != null && ms(endedAt) != null ? ms(endedAt) - ms(startedAt) : null, events: sorted.length,
    },
    totals: {
      stages: stageList.length, dispatches: agentList.reduce((sum, item) => sum + item.dispatches, 0), agentTypes: agentList.length,
      skillCalls: skillCounts.reduce((sum, item) => sum + item.count, 0), loopCalls: loopCounts.reduce((sum, item) => sum + item.count, 0),
      approvals: approvals.length, errors: errors.length, publishes: releases.publish ?? 0, deploys: releases.deploy ?? 0, tokens: tokenTotals?.total ?? null,
    },
    tokens: tokenTotals ? { total: tokenTotals.total, input: tokenTotals.input, output: tokenTotals.output, cacheRead: tokenTotals.cacheRead, cacheCreation: tokenTotals.cacheCreation, sessions: tokens.sessions ?? [] } : null,
    stages: stageList,
    agents: agentList,
    skills: skillCounts,
    loops: loopCounts,
    simulators: {
      reservations: reservations.count,
      devices: Object.values(reservations.devices).sort((left, right) => left.name.localeCompare(right.name)),
      reservationWaits: stats(reservations.waits),
      queue: { added: queue.added, taken: queue.taken, done: queue.done, failed: queue.failed, byKind: queue.byKind, waits: stats(queue.waits) },
    },
    issues: issueFlow,
    approvals,
    errors,
    releases: sortedCounts(releases),
    board: board?.jobs ? { jobs: board.jobs.length, issuesOpen: board.jobs.reduce((sum, job) => sum + (Number(job.issuesOpen) || 0), 0), publish: board.publish ?? null } : null,
  };
}

export function loadRunInputs(run) {
  const events = readEvents(run);
  const tokens = readJson(path.join(run.dir, 'tokens.json'));
  const board = readJson(path.join(run.dir, 'board.json'));
  return { events, tokens, board };
}

/** Dispatches and the run window, for the token sum. */
export function dispatchesOf(events) {
  return events.filter((event) => event.type === 'dispatch').map((event) => ({ toolUseId: event.toolUseId ?? null, description: event.description ?? null, stage: event.stage ?? null, agent: event.agent ?? null }));
}

/** From the first event to run.end; an open run has no end yet. */
export function windowOf(events) {
  const times = events.map((event) => event.ts).filter((ts) => Number.isFinite(Date.parse(ts ?? ''))).sort();
  if (!times.length) return {};
  const end = events.filter((event) => event.type === 'run.end' && event.ts).map((event) => event.ts).sort().at(-1);
  return end ? { since: times[0], until: end } : { since: times[0] };
}
