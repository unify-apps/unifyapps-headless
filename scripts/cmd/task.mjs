// The current task of a Claude session, kept in its state.json so a compaction or
// a resume knows what is being done, what is done and what the person approved.
import crypto from 'node:crypto';
import { UaError } from '../lib/contracts.mjs';
import { makeWorkFolder, writeState } from '../workspace/local.mjs';
import { withDecision, withQuestion, withEntity } from '../lib/ledger.mjs';

export const TASK_HISTORY_MAX = 20;
const TASK_STATUSES = ['done', 'stopped'];

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
function json(value, flag) {
  if (value === undefined) return undefined;
  try { return JSON.parse(value); } catch { throw new UaError('USAGE', `--${flag} must be JSON.`); }
}
function list(value, flag) {
  const parsed = json(value, flag);
  if (parsed !== undefined && !Array.isArray(parsed)) throw new UaError('USAGE', `--${flag} must be a JSON array.`);
  return parsed;
}
// A read-back proves a piece only when it names what the piece changed, the
// same rule plan report keeps for a builder's `ok` entry.
const namesEntity = (line, entity) => line.toLowerCase().includes(entity.toLowerCase());
const sameEntity = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const ended = (task, status, now) => ({ ...task, status, endedAt: now, updatedAt: now });
const history = (state, task) => [...(state.tasks ?? []), task].slice(-TASK_HISTORY_MAX);
// A platform id such as e_b61210e4 or d_a1b2c3; task update --done takes a name or an id.
const looksLikeId = (value) => /^[a-z]+_[0-9a-f]{4,}$/u.test(String(value ?? ''));
const targetFor = (current, entity) => (current?.targets ?? []).find((target) => sameEntity(target?.name, entity) || (target?.id && sameEntity(target.id, entity)));

export async function run(command, args, flags, ctx) {
  const state = ctx.state ?? {};
  const save = (patch) => writeState(ctx.home, patch, ctx.sessionId);
  const now = new Date().toISOString();
  const current = state.currentTask ?? null;
  if (command === 'get') {
    return { data: { currentTask: current, tasks: state.tasks ?? [] }, message: current ? `Current task: ${current.request}` : 'No current task.' };
  }
  if (command === 'begin') {
    // The request is kept as typed, never trimmed or collapsed.
    if (!text(flags.request)) throw new UaError('USAGE', 'Missing --request.');
    const id = `t_${crypto.randomBytes(6).toString('hex')}`;
    const task = { id, request: flags.request, outcome: text(flags.outcome), targets: list(flags.targets, 'targets') ?? [],
      references: list(flags.references, 'references') ?? [], waiting: null, tenant: state.tenant ?? null, solutionId: state.solutionId ?? null,
      mode: state.mode ?? null, phase: null, approvals: [], sent: [], done: [], planId: null,
      evidence: `.sessions/${ctx.sessionId}/reads/task-${id}.json`, startedAt: now, updatedAt: now };
    const tasks = current ? history(state, ended(current, 'stopped', now)) : state.tasks ?? [];
    save({ currentTask: task, tasks });
    return { data: { currentTask: task, ...(current ? { stopped: current.id } : {}) }, message: `Task ${id} started.` };
  }
  if (command === 'note') {
    // The session ledger: decisions, entities and open questions a compaction must not drop.
    // No current task is required: a decision can outlive the task it was made in.
    if (!text(flags.decision) && !text(flags.question)) throw new UaError('USAGE', 'Give --decision or --question.');
    let ledger = state.ledger;
    if (text(flags.decision)) ledger = withDecision(ledger, flags.decision.trim());
    if (text(flags.question)) ledger = withQuestion(ledger, flags.question.trim());
    save({ ledger });
    return { data: { ledger }, message: 'Noted.' };
  }
  if (!current) throw new UaError('USAGE', 'No current task. Run task begin first.');
  if (command === 'update') {
    const next = { ...current, updatedAt: now };
    if (flags.outcome !== undefined) next.outcome = text(flags.outcome);
    if (flags.phase !== undefined) next.phase = text(flags.phase);
    if (flags.plan !== undefined) next.planId = text(flags.plan);
    if (flags.waiting !== undefined) next.waiting = json(flags.waiting, 'waiting');
    if (text(flags.approval)) next.approvals = [...(current.approvals ?? []), flags.approval.trim()];
    let workFolder;
    if (flags.sent !== undefined) {
      // A piece handed to a builder agent. Kept until its read-back is recorded,
      // so a resume after a crash knows what may be half written.
      const entity = text(flags.entity);
      if (!text(flags.sent) || !entity) throw new UaError('USAGE', '--sent needs what was sent and --entity, the name or id of what it changes.');
      const agent = text(flags.agent);
      if (agent) workFolder = makeWorkFolder(ctx.home, agent, ctx.sessionId);
      next.sent = [...(current.sent ?? []).filter((piece) => !sameEntity(piece.entity, entity)),
        { what: flags.sent.trim(), entity, agent, ...(workFolder ? { workFolder } : {}), at: now }];
    }
    let ledger;
    if (flags.done !== undefined) {
      const entity = text(flags.entity), readBack = text(flags['read-back']);
      if (!text(flags.done) || !entity || !readBack) throw new UaError('USAGE', '--done needs what now exists, --entity (its name or id) and --read-back (the line of the read that shows it).');
      if (!namesEntity(readBack, entity)) throw new UaError('USAGE', `The read-back does not name ${entity}. A piece is done when a read of ${entity} shows it: give the line of that read.`);
      next.done = [...(current.done ?? []), { what: flags.done.trim(), entity, readBack, at: now }];
      next.sent = (next.sent ?? current.sent ?? []).filter((piece) => !sameEntity(piece.entity, entity));
      // The ledger's entities fill from the same place, so no extra call is needed to keep it current.
      const target = targetFor(current, entity);
      ledger = withEntity(state.ledger, { kind: target?.kind ?? null, id: target?.id ?? (looksLikeId(entity) ? entity : null),
        name: target?.name ?? entity, status: 'done' });
    }
    save({ currentTask: next, ...(ledger ? { ledger } : {}) });
    return { data: { currentTask: next, ...(workFolder ? { workFolder } : {}) }, message: workFolder ? `Task ${next.id} updated. Work folder: ${workFolder}` : `Task ${next.id} updated.` };
  }
  if (command === 'end') {
    const status = flags.status ?? 'done';
    if (!TASK_STATUSES.includes(status)) throw new UaError('USAGE', '--status must be done or stopped.');
    const task = ended(current, status, now);
    save({ currentTask: null, tasks: history(state, task) });
    return { data: { task }, message: `Task ${task.id} ${status}.` };
  }
  throw new UaError('USAGE', `Unknown task command ${command}.`);
}
