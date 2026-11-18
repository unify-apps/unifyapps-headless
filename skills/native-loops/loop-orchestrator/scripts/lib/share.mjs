// `log share`: a short anonymised summary of a run for the person's /ua:give-feedback
// remarks. give-feedback already uploads the redacted session transcripts (every brief and
// report), so this adds only the shape of the run: goal, stage timings, agents per type, skill
// and loop call counts, issue flow, approvals, simulator use and token totals. No names, hosts,
// ids, prompts or answers' text: fixed fields only, then a scrub of every string against
// patterns, the solution's loops profile and LOOPS_HOME/scrub.list (one literal per line).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { duration } from './output.mjs';
import { readJson } from './paths.mjs';

const SAFE_NAME = /^[A-Za-z0-9:_. ,-]{1,60}$/u;
const KNOWN_CHECKS = new Set(['ui', 'touch-feedback', 'perf', 'security', 'data', 'logic']);
// An approval id is a short word or two (plan, publish, write-back), never free text.
const APPROVAL_ID = /^[a-z][a-z-]{1,29}$/u;
const KNOWN_GOALS = new Set(['setup', 'audit', 'fix', 'build', 'scope', 'triage', 'report']);

export function scrubList({ home, solution }) {
  const items = [];
  try {
    items.push(...fs.readFileSync(path.join(home, 'scrub.list'), 'utf8').split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#')));
  } catch {
    // none
  }
  const profile = solution ? readJson(path.join(solution, '.nebula', 'loops', 'profile.json')) : null;
  for (const value of [profile?.tenant, profile?.solution?.id, profile?.solution?.name, profile?.app?.id, profile?.app?.name, profile?.app?.endpoint]) {
    if (typeof value === 'string' && value.length >= 3) items.push(value);
  }
  if (solution) items.push(path.basename(solution));
  return [...new Set(items)].sort((left, right) => right.length - left.length);
}

export function scrub(text, list = []) {
  let out = String(text);
  for (const item of list) out = out.split(item).join('[scrubbed]');
  return out
    .replace(/https?:\/\/[^\s)]+/giu, '[url]')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/gu, '[email]')
    .replace(/\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|ai|dev|app|cloud|co|in|ae|uk|us)\b/giu, '[host]')
    .replace(/\be_[A-Za-z0-9_]{6,}\b/gu, '[id]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, '[uuid]');
}

const safe = (name) => (SAFE_NAME.test(String(name ?? '')) ? String(name) : 'other');
const answerOf = (answer) => {
  const text = String(answer ?? '').trim().toLowerCase();
  if (/^(yes|y|ok|approve|approved|go|publish)/u.test(text)) return 'yes';
  if (/^(no|n|stop|reject|cancel|skip)/u.test(text)) return 'no';
  return text ? 'other' : 'none';
};

export function anonymousRunId(runId, goal) {
  const stamp = /(\d{8}-\d{4,6})/u.exec(runId ?? '')?.[1];
  const prefix = KNOWN_GOALS.has(goal) ? goal : 'run';
  return stamp ? `${prefix}-${stamp}` : `${prefix}-${crypto.createHash('sha256').update(String(runId)).digest('hex').slice(0, 8)}`;
}

/** Pure: report data → the anonymised summary { data, text }. */
export function shareSummary(report, list = []) {
  const goal = KNOWN_GOALS.has(report.run.goal) ? report.run.goal : report.run.goal ? 'other' : null;
  const focus = Array.isArray(report.run.focus) ? report.run.focus.filter((check) => KNOWN_CHECKS.has(check)) : typeof report.run.focus === 'string' ? report.run.focus.split(/[,\s]+/u).filter((check) => KNOWN_CHECKS.has(check)) : [];
  const scopeSize = Array.isArray(report.run.scope) ? report.run.scope.length : report.run.scope ? 1 : 0;
  const data = {
    run: anonymousRunId(report.run.id, report.run.goal),
    goal, focus, scopeSize,
    outcome: report.run.outcome ? safe(report.run.outcome) : null,
    durationMs: report.run.durationMs,
    events: report.run.events,
    stages: report.stages.map((stage) => ({ name: safe(stage.name), durationMs: stage.durationMs, dispatches: stage.dispatches, agents: stage.agents.map((item) => ({ name: safe(item.name), count: item.count })), tokens: stage.tokens?.total ?? null })),
    agents: report.agents.map((item) => ({ type: safe(item.type), dispatches: item.dispatches, reports: item.reports, tokens: item.tokens })),
    skills: report.skills.map((item) => ({ name: safe(item.name), count: item.count })),
    loops: report.loops.map((item) => ({ name: safe(item.name), count: item.count })),
    issues: { found: report.issues.found, fixed: report.issues.fixed, reopened: report.issues.reopened, reopens: report.issues.reopens, open: report.issues.open, maxAttempts: report.issues.maxAttempts },
    approvals: report.approvals.map((item) => ({ approval: APPROVAL_ID.test(item.approval) ? item.approval : 'approval', answer: answerOf(item.answer) })),
    simulators: { reservations: report.simulators.reservations, devices: report.simulators.devices.length, queue: report.simulators.queue, maxReservationWaitMs: report.simulators.reservationWaits.maxMs },
    tokens: report.tokens ? { total: report.tokens.total, input: report.tokens.input, output: report.tokens.output, cacheRead: report.tokens.cacheRead, cacheCreation: report.tokens.cacheCreation } : null,
  };
  const n = (value) => Number(value ?? 0).toLocaleString('en-US');
  const lines = [
    'Loops run summary (anonymised)',
    `- run ${data.run} · goal ${data.goal ?? '—'}${data.focus.length ? ` (${data.focus.join(', ')})` : ''} · scope ${data.scopeSize} · ${duration(data.durationMs)} · outcome ${data.outcome ?? 'open'} · ${data.events} events`,
    `- stages: ${data.stages.map((stage) => `${stage.name} ${duration(stage.durationMs)} (${stage.dispatches} dispatches${stage.tokens != null ? `, ${n(stage.tokens)} tokens` : ''})`).join('; ') || '—'}`,
    `- agents: ${data.agents.map((item) => `${item.type} ×${item.dispatches}`).join(', ') || '—'}`,
    `- skills: ${data.skills.map((item) => `${item.name} ×${item.count}`).join(', ') || '—'}`,
    `- loops CLI: ${data.loops.map((item) => `${item.name} ×${item.count}`).join(', ') || '—'}`,
    `- issues: found ${data.issues.found} · fixed ${data.issues.fixed} · reopened ${data.issues.reopened} (${data.issues.reopens} reopens, max ${data.issues.maxAttempts} attempts) · open ${data.issues.open}`,
    `- approvals: ${data.approvals.map((item) => `${item.approval} ${item.answer}`).join(' · ') || '—'}`,
    `- simulators: ${data.simulators.reservations} reservations on ${data.simulators.devices} devices · queue ${data.simulators.queue.added} added, ${data.simulators.queue.done} done, ${data.simulators.queue.failed} failed · max reservation wait ${duration(data.simulators.maxReservationWaitMs)}`,
    `- tokens: ${data.tokens ? `${n(data.tokens.total)} (input ${n(data.tokens.input)}, output ${n(data.tokens.output)}, cache read ${n(data.tokens.cacheRead)}, cache creation ${n(data.tokens.cacheCreation)})` : 'not summed (run log tokens first)'}`,
  ];
  const text = scrub(lines.join('\n'), list);
  return { data: JSON.parse(scrub(JSON.stringify(data), list)), text };
}
