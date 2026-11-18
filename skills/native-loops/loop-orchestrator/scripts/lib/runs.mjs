// The run folder's own commands: `run start` (always writes board.json), `run job-state`, `run resume`,
// and the board check that warns on a run folder with no board.json.
import fs from 'node:fs';
import path from 'node:path';
import { renderBoard } from './board.mjs';
import { capacity } from './capacity.mjs';
import { nowMs } from './exec.mjs';
import { plural, usage } from './output.mjs';
import { KINDS, PLATFORMS } from './platform.mjs';
import { RUN_ID_PATTERN, readJson, readLoopsConfig, runsDir, writeJson } from './paths.mjs';
import { appendEvent } from './run-log.mjs';
import { readPool } from './probes.mjs';
import { entriesOf } from '../../../loop-test-data/scripts/data-undo.mjs';

export const GOALS = ['fix', 'build', 'scope', 'test-author', 'audit', 'triage', 'setup', 'report'];
const slug = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 40) || 'app';
const stamp = (at) => new Date(at).toISOString().replace(/[-:]/gu, '').replace(/^(\d{8})T(\d{4}).*$/u, '$1-$2');

/**
 * Limits a run keeps, as limits.md says: agents and pool from the machine, the rest from config.json.
 * The pool is never more than the simulators the pool has (`devices`), so a pool smaller than the
 * laptop takes plans no test runner that would only wait for a simulator.
 */
export function runLimits(config, { devices = null } = {}) {
  const sized = capacity({ config });
  const limits = config.limits ?? {};
  const pool = Number.isInteger(devices) && devices > 0 ? Math.min(sized.pool, devices) : sized.pool;
  return { agents: sized.agents, pool, maxAttempts: limits.maxAttempts ?? 4, jobMinutes: limits.jobMinutes ?? 50 };
}

export function startRun({ solution, home, goal, platform: named = 'MOBILE', kind: namedKind = null, scope, request = null, run = null, publish = null }) {
  if (!GOALS.includes(goal)) throw usage(`--goal must be one of ${GOALS.join(', ')}`);
  // Any case, as health, setup and queue take it: --platform web starts a WEB run.
  const platform = String(named).trim().toUpperCase();
  if (!PLATFORMS.includes(platform)) throw usage(`--platform must be ${PLATFORMS.join(' or ')}`);
  // `--kind code` marks a Code Builder app's run; the board carries it only then, so a
  // no-code run's board is what it always was.
  const kind = namedKind == null ? null : String(namedKind).trim().toLowerCase();
  if (kind != null && !KINDS.includes(kind)) throw usage(`--kind must be ${KINDS.join(' or ')}`);
  const kindField = kind === 'code' ? { kind } : {};
  if (!scope || !String(scope).trim()) throw usage('run start needs --scope "<pages or app>"');
  const id = run ?? `${goal}-${slug(scope)}-${stamp(nowMs())}`;
  if (!RUN_ID_PATTERN.test(id)) throw usage(`run id "${id}" may hold only letters, digits, ".", "_" and "-"`);
  const dir = path.join(runsDir(solution), id);
  const file = path.join(dir, 'board.json');
  const existing = readJson(file);
  if (existing) return { data: { id, dir, resumed: true, board: file }, text: `Run ${id} already has a board (finished: ${Boolean(existing.finished)}); resume it, do not restart.` };
  const board = { goal, platform, ...kindField, scope: String(scope), publish, platformQueue: 0, limits: runLimits(readLoopsConfig(home), { devices: readPool(home)?.devices?.length ?? null }), finished: false, jobs: [] };
  writeJson(file, board);
  appendEvent({ id, dir }, { type: 'run.start', goal, platform, ...kindField, scope: String(scope), request }, { home });
  renderBoard({ run: { id, dir } });
  return { data: { id, dir, resumed: false, board: file }, text: `Run ${id} started: ${path.join(dir, 'board.json')}` };
}

const JOB_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/u;

export function writeJobState({ run, job, step, agent = null, undo = null, attempt = null, request = null }) {
  if (!JOB_NAME.test(job ?? '')) throw usage('--job takes letters, digits, ".", "_" and "-"');
  if (!step || !String(step).trim()) throw usage('job-state needs --step "<what the job just did>"');
  const file = path.join(run.dir, 'jobs', job, 'state.json');
  const previous = readJson(file) ?? {};
  const state = {
    job, agent: agent ?? previous.agent ?? null, step: String(step), attempt: attempt ?? previous.attempt ?? null,
    undoLog: undo ?? previous.undoLog ?? null, requests: [...new Set([...(previous.requests ?? []), ...(request ? [request] : [])])],
    updatedAt: new Date(nowMs()).toISOString(),
  };
  writeJson(file, state);
  return { data: { file, state }, text: `${job}: ${state.step}` };
}

/** Pending undo entries of a run: the log is read by data-undo.mjs, the one owner of its format. */
export function pendingUndo(runDir) {
  return entriesOf(runDir).filter((entry) => entry.status === 'pending');
}

function jobStates(runDir) {
  const base = path.join(runDir, 'jobs');
  let names = [];
  try { names = fs.readdirSync(base); } catch { return []; }
  return names.map((name) => readJson(path.join(base, name, 'state.json'))).filter(Boolean);
}

/** Every run folder of the solution: board state, jobs' last steps, pending data changes. */
export function listRuns(solution) {
  const base = runsDir(solution);
  let names = [];
  try { names = fs.readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name); } catch { return []; }
  return names.sort().map((id) => {
    const dir = path.join(base, id);
    const board = readJson(path.join(dir, 'board.json'));
    return { id, dir, hasBoard: Boolean(board), finished: Boolean(board?.finished), goal: board?.goal ?? null, jobs: jobStates(dir), pendingUndo: pendingUndo(dir) };
  });
}

export function resumeReport({ solution }) {
  const runs = listRuns(solution);
  const open = runs.filter((item) => !item.hasBoard || !item.finished || item.pendingUndo.length);
  const now = nowMs();
  const lines = [];
  for (const item of open) {
    lines.push(`${item.id}${item.hasBoard ? '' : ' · NO board.json (the run start never wrote one)'}${item.finished ? ' · finished' : ' · unfinished'}`);
    for (const job of item.jobs) {
      const age = Math.max(0, Math.round((now - Date.parse(job.updatedAt ?? '')) / 60_000));
      lines.push(`  job ${job.job}: ${job.step}${Number.isFinite(age) ? ` (${age} min ago)` : ''}${job.undoLog ? ` · undo log ${job.undoLog}` : ''}`);
    }
    if (item.pendingUndo.length) lines.push(`  ${plural(item.pendingUndo.length, 'data change')} not restored: run data-undo.mjs plan --run ${item.dir}`);
  }
  return { data: { runs: open }, text: lines.length ? lines.join('\n') : 'no unfinished run' };
}

/** `loops board --check`: a run folder with no board.json is a run that skipped its start step. */
export function checkBoards({ solution }) {
  const missingBoard = listRuns(solution).filter((item) => !item.hasBoard);
  const text = missingBoard.length
    ? missingBoard.map((item) => `warning: ${item.dir} has no board.json (write it with loops run start)`).join('\n')
    : 'every run folder has a board.json';
  return { data: { ok: missingBoard.length === 0, missing: missingBoard.map((item) => item.dir) }, text };
}
