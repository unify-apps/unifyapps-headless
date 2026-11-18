/** The work in one solution as a Markdown table: plans and chat tasks, who runs them, and what is left. Pure. */
import { cleanField } from './session-snapshot.mjs';

export const PROGRESS_EMPTY = 'No work yet.';
export const PROGRESS_STATUS = Object.freeze({ IN_PROGRESS: 'in progress', TO_DO: 'to do', DONE: 'done' });
const PLAN_STATUS = { in_progress: PROGRESS_STATUS.IN_PROGRESS, planned: PROGRESS_STATUS.TO_DO, failed: PROGRESS_STATUS.TO_DO,
  interrupted: PROGRESS_STATUS.TO_DO, implemented: PROGRESS_STATUS.DONE };
const ORDER = [PROGRESS_STATUS.IN_PROGRESS, PROGRESS_STATUS.TO_DO, PROGRESS_STATUS.DONE];
const OPEN_TASKS = ['running', 'pending', 'failed'];
const TOUCHES_SHOWN = 3;

// Another person's session is on another machine, so only the plan record says it still works;
// 2 hours covers a long builder run that writes nothing until its report.
export const RUNNER_IDLE_MS = 2 * 60 * 60 * 1000;

const STAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?/u;

/** The newest time the plan record shows any work: created, started, ended, or a task moved. NaN when it shows none. */
export function lastActivityAt(plan) {
  const times = [plan?.createdAt, plan?.runningAt, plan?.endedAt];
  for (const task of plan?.tasks ?? []) {
    times.push(task?.startedAt, task?.endedAt, task?.confirmedAt);
    for (const move of Array.isArray(task?.moves) ? task.moves : []) times.push(STAMP.exec(String(move))?.[0]);
  }
  const stamps = times.map(at => Date.parse(at ?? '')).filter(Number.isFinite);
  return stamps.length ? Math.max(...stamps) : NaN;
}

const idleFor = (at, now) => (Number.isFinite(at) ? now - at > RUNNER_IDLE_MS : true);

/** The ids of the sessions on this machine's registry that are still open, from `sessionsForSolution`. */
export const liveSessionIds = (sessions = []) => new Set(sessions.filter(entry => entry.available).map(entry => entry.sessionId));

/**
 * A running plan run by another session that may no longer run. The one liveness rule every reader uses.
 * This install's own runner stops at once when its session is gone from the local registry. A registry entry outlives
 * a closed session (its folder stays), so every runner, own or not, also stops after RUNNER_IDLE_MS of no activity.
 * @param {{now?:number, clientId?:string|null, live?:Set<string>}} [mine]  this install's clientId and its open sessions
 */
export function maybeStopped(plan, sessionId, { now = Date.now(), clientId = null, live = new Set() } = {}) {
  const runner = plan.runner?.claudeSessionId;
  if (plan.status !== 'in_progress' || runner === sessionId) return false;
  if (clientId && plan.runner?.clientId === clientId && !live.has(runner)) return true;
  return idleFor(lastActivityAt(plan), now);
}

/** `5 min`, `3 h`, `2 d`. */
export function formatAge(ms) {
  if (!Number.isFinite(ms)) return 'unknown time';
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
}

/** The runner as a person reads it: their email, or the short session id. */
export const personName = (runner, sessionId = runner?.claudeSessionId) => runner?.email || `session ${String(sessionId ?? '').slice(0, 8)}`;

const cell = (value, max = 80) => cleanField(value, max).replace(/\|/gu, '\\|') || '—';
const shortId = id => String(id).slice(0, 8);

function who(runnerId, { sessionId, runner, at, stopped, now }) {
  if (!runnerId) return '—';
  if (runnerId === sessionId) return 'you';
  const name = cell(personName(runner, runnerId), 60), ago = formatAge(now - at);
  return stopped ? `maybe stopped · ${name} · last activity ${ago} ago` : `${name} · ${ago} ago`;
}

function touches(tasks) {
  const seen = new Map();
  for (const task of tasks ?? []) {
    const entity = task?.entity;
    if (!entity?.kind || !(entity.id || entity.name)) continue;
    seen.set(`${entity.kind}:${entity.id ?? entity.name}`, `${entity.kind} "${entity.name ?? entity.id}"`);
  }
  const all = [...seen.values()];
  if (!all.length) return '—';
  const shown = all.slice(0, TOUCHES_SHOWN).map(text => cell(text, 60)).join(', ');
  return all.length > TOUCHES_SHOWN ? `${shown}, +${all.length - TOUCHES_SHOWN} more` : shown;
}

function nextCounts(tasks) {
  const parts = OPEN_TASKS.map(status => [status, (tasks ?? []).filter(task => task?.status === status).length])
    .filter(([, n]) => n).map(([status, n]) => `${n} ${status}`);
  return parts.join(', ') || '—';
}

/**
 * @param {object} input
 * @param {Array<{planId:string,title?:string,status?:string,createdAt?:string,runner?:{claudeSessionId?:string,email?:string},tasks?:Array}>} input.plans
 * @param {Array<{id?:string,request:string,status:'current'|'done'|'stopped',sessionId?:string,planId?:string,phase?:string,at?:string}>} input.chatTasks
 * @param {string|null} input.sessionId  the session reading the table; null for the shared folder guide
 * @param {number} input.now
 * @param {string|null} input.clientId  this install, so its own runners are judged by `live`
 * @param {Set<string>} input.live  open sessions on this machine, from liveSessionIds
 */
export function progressTable({ plans = [], chatTasks = [], sessionId = null, now = Date.now(), clientId = null, live = new Set(), doneLimit = 3, maxRows = Infinity } = {}) {
  const rows = [];
  for (const plan of plans) {
    const status = PLAN_STATUS[plan.status];
    if (!status) continue;
    const runnerId = plan.runner?.claudeSessionId ?? null;
    rows.push({ status, at: plan.createdAt ?? '', work: `${cell(plan.title || plan.planId)} (plan ${cell(plan.planId)})`,
      who: who(runnerId, { sessionId, runner: plan.runner, at: lastActivityAt(plan), stopped: maybeStopped(plan, sessionId, { now, clientId, live }), now }), touches: touches(plan.tasks), next: nextCounts(plan.tasks) });
  }
  const planIds = new Set(plans.map(plan => plan.planId));
  for (const task of chatTasks) {
    if (task.status === 'stopped' || (task.planId && planIds.has(task.planId))) continue;
    const current = task.status === 'current';
    const at = Date.parse(task.updatedAt ?? task.at ?? '');
    const stopped = current && task.sessionId !== sessionId && idleFor(at, now);
    rows.push({ status: current ? PROGRESS_STATUS.IN_PROGRESS : PROGRESS_STATUS.DONE, at: task.at ?? '', work: `${cell(task.request)} (chat)`,
      who: who(task.sessionId, { sessionId, at, stopped, now }), touches: '—', next: current && task.phase ? `phase ${cell(task.phase, 40)}` : '—' });
  }
  const ordered = ORDER.flatMap(status => {
    const group = rows.filter(row => row.status === status).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return status === PROGRESS_STATUS.DONE ? group.slice(0, doneLimit) : group;
  });
  if (!ordered.length) return PROGRESS_EMPTY;
  const shown = ordered.slice(0, maxRows);
  return ['| Work | Status | Who | Touches | Next |', '|---|---|---|---|---|',
    ...shown.map(row => `| ${row.work} | ${row.status} | ${row.who} | ${row.touches} | ${row.next} |`),
    ...(ordered.length > shown.length ? [`+${ordered.length - shown.length} more, see plans/`] : [])].join('\n');
}
