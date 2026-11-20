/** Reads a solution folder's plans, chat tasks and open sessions for the session snapshot's progress table and plan propose. */
import { parsePlan } from '../lib/formats.mjs';
import { liveSessionIds } from '../lib/progress-table.mjs';
import { readRecords } from './local.mjs';
import { sessionsForSolution } from './session-registry.mjs';
import { associationAt, sessionStates } from './folder-layout.mjs';

/** Plan records, local or just read from the tenant, as the rows the progress table and plan propose read. */
export function planRows(records) {
  return (records ?? []).flatMap(record => {
    try {
      const { meta, tasks } = parsePlan(record.properties.plan);
      return [{ planId: record.id, title: meta.title, status: record.properties.status, createdAt: meta.createdAt ?? null,
        runningAt: meta.runningAt ?? null, endedAt: meta.endedAt ?? null,
        derivedFromPlanId: meta.derivedFromPlanId ?? null, owner: meta.owner ?? null, runner: meta.runner ?? null, tasks }];
    } catch { return []; }
  });
}

export function readPlans(home) {
  return planRows(readRecords(home, 'plan'));
}

export function readChatTasks(home) {
  return sessionStates(home).flatMap(state => [
    ...(state.tasks ?? []).map(task => ({ ...task, at: task.endedAt ?? task.updatedAt })),
    ...(state.currentTask ? [{ ...state.currentTask, status: 'current', at: state.currentTask.updatedAt }] : []),
  ].map(task => ({ ...task, sessionId: state.claudeSessionId })));
}

/** The open sessions on this machine for the folder's solution. An unreadable registry counts none open. */
export function readLiveSessions(home) {
  try {
    const association = associationAt(home);
    return association?.tenant ? liveSessionIds(sessionsForSolution(association.tenant, association.solutionId)) : new Set();
  } catch { return new Set(); }
}
