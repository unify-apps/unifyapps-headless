#!/usr/bin/env node
// The undo log of a run's data changes: one JSON line per change, written BEFORE the change, so a job that
// dies halfway leaves everything needed to put the record back. Append-only; a restore is one more line.
// Node 22, no packages. Format and rules: skills/native-loops/loop-test-data/references/undo-log.md.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const LOG_PATH = path.join('data', 'undo-log.jsonl');
export const OPS = ['update', 'create', 'delete'];

const HELP = `data-undo — the undo log of a run's data changes (<run>/data/undo-log.jsonl).

Usage
  node data-undo.mjs add --run <run> --object <object> --record <id> --field <field> (--before <json> | --before-absent)
                         [--parent <parent record id>] [--after <json>] [--op update|create|delete] [--job <job>] [--note <text>] [--json]
  node data-undo.mjs list    --run <run> [--pending] [--json]
  node data-undo.mjs plan    --run <run> [--json]
  node data-undo.mjs mark-restored --run <run> --id <entry id> --read-back <the live read that shows it> [--json]
  node data-undo.mjs check   --run <run> [--json]

Commands
  add            Write one entry. Run it BEFORE the change, and make the change only after it printed the id.
                 An update needs the value the field holds now (--before, as JSON), or --before-absent when
                 the field has no value. A create names the new record id (--op create, no --field needed).
  list           Every entry with its status (pending | restored), oldest first.
  plan           What to do, newest change first: one line per pending entry. A create is deleted through
                 UnifyApps Headless's own dialog; this script never deletes anything.
  mark-restored  Close an entry after the live read-back shows the before value. A read-back is required.
  check          Exit 1 while any entry is pending. The orchestrator runs it at the end of the run and on resume.

Options
  --run <run>    The run folder, or a run id with --solution <dir> (default: the folder holding .nebula/).
  --json         Print JSON.

Exit codes: 0 ok, 1 pending entries (check) or a refused entry, 2 usage.`;

export class UsageError extends Error {}

export function logFile(run) {
  return path.join(run, LOG_PATH);
}

function readEvents(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* a torn last line from a crash is skipped, never fatal */ }
  }
  return events;
}

/** Entries folded from the events: { id, ...fields, status: 'pending' | 'restored' }. */
export function entriesOf(run) {
  const entries = new Map();
  for (const event of readEvents(logFile(run))) {
    if (event.type === 'add') entries.set(event.id, { ...event, status: 'pending' });
    else if (event.type === 'restored' && entries.has(event.id)) {
      Object.assign(entries.get(event.id), { status: 'restored', restoredAt: event.at, readBack: event.readBack });
    }
  }
  return [...entries.values()];
}

function append(run, event) {
  const file = logFile(run);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`);
}

// Parallel jobs share one log: the next id and its append happen under one lock, so two adds never get the same id.
function withLock(run, fn) {
  const lock = `${logFile(run)}.lock`;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  for (let tries = 0; ; tries += 1) {
    try { fs.mkdirSync(lock); break; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let age = 0;
      try { age = Date.now() - fs.statSync(lock).mtimeMs; } catch { continue; }
      if (age > 10_000) { fs.rmSync(lock, { recursive: true, force: true }); continue; }
      if (tries > 400) throw new Error(`undo log is locked: ${lock}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try { return fn(); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

export function addEntry(run, input, { now = () => new Date() } = {}) {
  const op = input.op ?? 'update';
  if (!OPS.includes(op)) throw new UsageError(`--op must be one of ${OPS.join(', ')}`);
  for (const key of ['object', 'record']) if (!input[key]) throw new UsageError(`add needs --${key}`);
  if (op !== 'create' && !input.field) throw new UsageError(`an ${op} entry needs --field`);
  let before;
  if (op === 'create') before = null;
  else if (input.beforeAbsent) before = null;
  else if (input.before === undefined) throw new UsageError('add needs --before <json> (the value now), or --before-absent: nothing is changed without its before value');
  else {
    try { before = JSON.parse(input.before); } catch { before = input.before; }
  }
  let after;
  if (input.after !== undefined) {
    try { after = JSON.parse(input.after); } catch { after = input.after; }
  }
  return withLock(run, () => {
    const last = Math.max(0, ...entriesOf(run).map((entry) => Number(/^u_(\d+)$/u.exec(entry.id)?.[1] ?? 0)));
    const id = `u_${String(last + 1).padStart(3, '0')}`;
    const event = {
      type: 'add', id, at: now().toISOString(), op, object: input.object, record: String(input.record),
      parent: input.parent ?? null, field: input.field ?? null, before, beforeAbsent: Boolean(input.beforeAbsent) || undefined,
      after, job: input.job ?? null, note: input.note ?? null,
    };
    append(run, JSON.parse(JSON.stringify(event)));
    return event;
  });
}

export function markRestored(run, id, readBack, { now = () => new Date() } = {}) {
  const entry = entriesOf(run).find((item) => item.id === id);
  if (!entry) throw new UsageError(`no entry ${id} in ${logFile(run)}`);
  if (!readBack || !String(readBack).trim()) throw new UsageError('mark-restored needs --read-back: the live read that shows the before value');
  if (entry.status === 'restored') return entry;
  append(run, { type: 'restored', id, at: now().toISOString(), readBack: String(readBack) });
  return { ...entry, status: 'restored', readBack };
}

/** Newest change first, so a field changed twice returns to its first before value last. */
export function planOf(run) {
  return entriesOf(run).filter((entry) => entry.status === 'pending').reverse().map((entry) => {
    if (entry.op === 'create') return { id: entry.id, action: 'delete', text: `delete ${entry.object} record ${entry.record} (made by the run) through UnifyApps Headless's delete dialog, then read it back as gone` };
    if (entry.op === 'delete') return { id: entry.id, action: 'recreate', text: `${entry.object} record ${entry.record} was deleted by the run: the person decides; its before value is in the entry` };
    const was = entry.beforeAbsent ? 'no value (clear the field)' : JSON.stringify(entry.before);
    return { id: entry.id, action: 'set', text: `set ${entry.object}.${entry.field} of ${entry.record}${entry.parent ? ` (parent ${entry.parent})` : ''} back to ${was}, then read it back` };
  });
}

function resolveRun(values) {
  const token = values.run;
  if (token && (token.includes('/') || token.startsWith('.'))) return path.resolve(token);
  let solution = values.solution ? path.resolve(values.solution) : null;
  if (!solution) {
    let dir = process.cwd();
    for (;;) {
      if (fs.existsSync(path.join(dir, '.nebula'))) { solution = dir; break; }
      const parent = path.dirname(dir);
      if (parent === dir) { solution = process.cwd(); break; }
      dir = parent;
    }
  }
  if (!token) throw new UsageError('pass --run <run folder or id>');
  return path.join(solution, '.nebula', 'loops', 'runs', token);
}

const line = (entry) => `${entry.id} ${entry.status} ${entry.op} ${entry.object}.${entry.field ?? '(record)'} ${entry.record}${entry.parent ? ` parent ${entry.parent}` : ''}${entry.job ? ` job ${entry.job}` : ''}`;

export function main(argv, out = console.log) {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: {
      run: { type: 'string' }, solution: { type: 'string' }, object: { type: 'string' }, record: { type: 'string' }, field: { type: 'string' },
      before: { type: 'string' }, 'before-absent': { type: 'boolean' }, after: { type: 'string' }, parent: { type: 'string' }, op: { type: 'string' },
      job: { type: 'string' }, note: { type: 'string' }, id: { type: 'string' }, 'read-back': { type: 'string' },
      pending: { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    },
  });
  const [command] = positionals;
  if (values.help || !command) { out(HELP); return 0; }
  const run = resolveRun(values);
  const print = (data, text) => out(values.json ? JSON.stringify(data, null, 2) : text);
  if (command === 'add') {
    const entry = addEntry(run, {
      object: values.object, record: values.record, field: values.field, before: values.before, beforeAbsent: values['before-absent'],
      after: values.after, parent: values.parent, op: values.op, job: values.job, note: values.note,
    });
    print(entry, `${entry.id} written: change it now. After the run, restore with: ${planOf(run).find((item) => item.id === entry.id)?.text}`);
    return 0;
  }
  if (command === 'list') {
    const entries = entriesOf(run).filter((entry) => !values.pending || entry.status === 'pending');
    print({ file: logFile(run), entries }, entries.length ? entries.map(line).join('\n') : 'no entries');
    return 0;
  }
  if (command === 'plan') {
    const steps = planOf(run);
    print({ steps }, steps.length ? steps.map((step) => `${step.id}: ${step.text}`).join('\n') : 'nothing to restore');
    return 0;
  }
  if (command === 'mark-restored') {
    if (!values.id) throw new UsageError('mark-restored needs --id');
    const entry = markRestored(run, values.id, values['read-back']);
    print(entry, `${entry.id} restored`);
    return 0;
  }
  if (command === 'check') {
    const pending = entriesOf(run).filter((entry) => entry.status === 'pending');
    print({ ok: pending.length === 0, pending }, pending.length ? `${pending.length} change(s) not restored:\n${pending.map(line).join('\n')}` : 'every data change is restored');
    return pending.length ? 1 : 0;
  }
  throw new UsageError(`Unknown command "${command}". Run with --help.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = error instanceof UsageError || error.code?.startsWith?.('ERR_PARSE_ARGS') ? 2 : 1;
  }
}
