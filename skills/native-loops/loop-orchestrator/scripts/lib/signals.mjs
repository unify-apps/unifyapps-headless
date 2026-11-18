// The self-review signals of a loop run: what in the loop's own text, scripts or tools made the run slower or
// wrong (references/self-review.md). `add` records one in the run folder the moment the loop knows; `finish`
// appends the run's signals to the solution's ledger, counts each over the runs on this plugin version, and says
// which records are due (a bug or a feature request worth offering to report with /ua:give-feedback), already
// open, or skipped; `filed` marks a record the person reported, so the next run adds a count instead of offering it
// again. Files only; no network: nothing here sends a report.
import fs from 'node:fs';
import path from 'node:path';
import { pluginVersion as readPluginVersion, readJson, readJsonl, resolveRun, writeJson } from './paths.mjs';
import { usage } from './output.mjs';

// Each key: the record it becomes, how many distinct runs it must be seen in on one plugin version, and the
// feedback family the record takes unless --family says otherwise (give-feedback's families).
export const KEYS = Object.freeze({
  'tool-error': { kind: 'Self Bug Report', threshold: 2, family: 'tooling-transport' },
  'lint-trap-false': { kind: 'Self Bug Report', threshold: 2, family: 'guidance-planning' },
  'stage-retry': { kind: 'Self Bug Report', threshold: 3, family: 'guidance-planning' },
  'prose-gap': { kind: 'Self Feature Request', threshold: 2, family: 'guidance-planning' },
  'person-correction': { kind: 'Self Feature Request', threshold: 3, family: 'guidance-planning' },
  'parked-unsupported': { kind: 'Self Feature Request', threshold: 3, family: 'guidance-planning' },
  'router-miss': { kind: 'Self Feature Request', threshold: 3, family: 'guidance-planning' },
  'budget-miss': { kind: 'Self Feature Request', threshold: 3, family: 'guidance-planning' },
});
// How many records one solution files in one day, whatever the signals say.
export const DAILY_CAP = 3;

const clean = (value) => String(value ?? '').replace(/\s+/gu, ' ').trim();
// The identity of a signal across runs: the key, the loop, the stage, the tool and the reason in lower case
// without punctuation, so "Timeout at 375" and "timeout at 375." are one signal.
export function signalKey({ key, loop, stage, tool, reason }) {
  const norm = (s) => clean(s).toLowerCase().replace(/[^a-z0-9 ]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  return [key, norm(loop), norm(stage), norm(tool), norm(reason)].join('|');
}

export function signalsDir(solution) { return path.join(solution, '.nebula', 'loops', 'signals'); }
const ledgerFile = (solution) => path.join(signalsDir(solution), 'ledger.jsonl');
const openFile = (solution) => path.join(signalsDir(solution), 'open.json');
const runFile = (dir) => path.join(dir, 'signals.jsonl');

function loopNameOf(dir) {
  const board = readJson(path.join(dir, 'board.json'));
  return board?.loop ?? board?.command ?? board?.goal ?? path.basename(dir);
}

/** `signals add`: one line in the run's signals.jsonl. Pure apart from the append. */
export function addSignal({ run, solution, key, stage, tool = null, reason, loop = null, now = new Date().toISOString() }) {
  const target = resolveRun({ run, solution });
  if (!target) throw usage('signals add needs --run <run id or folder>');
  if (!KEYS[key]) throw usage(`--key must be one of ${Object.keys(KEYS).join(', ')}`);
  if (!clean(stage)) throw usage('signals add needs --stage <stage>');
  if (!clean(reason)) throw usage('signals add needs --reason "<one line>"');
  const entry = { at: now, key, loop: clean(loop) || loopNameOf(target.dir), stage: clean(stage), tool: clean(tool) || null, reason: clean(reason).slice(0, 240) };
  fs.mkdirSync(target.dir, { recursive: true });
  fs.appendFileSync(runFile(target.dir), `${JSON.stringify(entry)}\n`);
  return { data: { run: target.id, ...entry }, text: `${entry.key} · ${entry.loop} · ${entry.stage}${entry.tool ? ` · ${entry.tool}` : ''}: ${entry.reason}` };
}

/**
 * Pure: count each signal over distinct runs on one plugin version, and decide what is due. `immediate` is a
 * hard stop: the signals of `run` are due at once, whatever their count (the open record and the cap still hold).
 */
export function decide({ ledger, open, version, now, cap = DAILY_CAP, immediate = false, run = null }) {
  const today = String(now).slice(0, 10);
  const filedToday = Object.values(open).filter((o) => String(o.filedAt ?? '').slice(0, 10) === today).length;
  const byKey = new Map();
  for (const row of ledger) {
    if (row.version !== version) continue;
    const k = signalKey(row);
    if (!byKey.has(k)) byKey.set(k, { signalKey: k, key: row.key, loop: row.loop, stage: row.stage, tool: row.tool ?? null, reason: row.reason, runs: new Set() });
    byKey.get(k).runs.add(row.run);
  }
  const due = [], already = [], skipped = [];
  let budget = Math.max(0, cap - filedToday);
  for (const s of byKey.values()) {
    const rule = KEYS[s.key];
    const count = s.runs.size;
    const item = { signalKey: s.signalKey, key: s.key, kind: rule.kind, family: rule.family, loop: s.loop, stage: s.stage, tool: s.tool, reason: s.reason, runs: [...s.runs], count, threshold: rule.threshold, title: `${s.loop} · ${s.stage}${s.tool ? ` · ${s.tool}` : ''}: ${s.reason}` };
    const o = open[s.signalKey];
    if (o && o.version === version) { already.push({ ...item, record: o.record, filedAt: o.filedAt }); continue; }
    const hardStop = immediate && run && s.runs.has(run);
    if (count < rule.threshold && !hardStop) { skipped.push({ ...item, why: `seen in ${count} of ${rule.threshold} runs` }); continue; }
    if (budget <= 0) { skipped.push({ ...item, why: `over today's cap of ${cap} records` }); continue; }
    budget -= 1;
    due.push(item);
  }
  return { due, open: already, skipped };
}

/** The signals of every run folder under the solution's runs that `finish` has not merged yet (a killed run). */
function unmergedRuns(solution, exceptDir) {
  const runs = path.join(solution, '.nebula', 'loops', 'runs');
  if (!fs.existsSync(runs)) return [];
  return fs.readdirSync(runs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(runs, d.name))
    .filter((dir) => dir !== exceptDir && fs.existsSync(runFile(dir)) && !fs.existsSync(path.join(dir, 'signals.merged')));
}

/** `signals finish`: merge the run (and any killed run) into the ledger, write the run's self-review.json, answer what is due. */
export function finishSignals({ run, solution, immediate = false, now = new Date().toISOString(), version = readPluginVersion() }) {
  const target = resolveRun({ run, solution });
  if (!target) throw usage('signals finish needs --run <run id or folder>');
  fs.mkdirSync(signalsDir(solution), { recursive: true });
  const merged = [];
  for (const dir of [target.dir, ...unmergedRuns(solution, target.dir)]) {
    if (fs.existsSync(path.join(dir, 'signals.merged'))) continue;
    if (!fs.existsSync(runFile(dir))) { if (dir === target.dir) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'signals.merged'), `${now}\n`); } continue; }
    const rows = readJsonl(runFile(dir)).map((row) => ({ ...row, run: path.basename(dir), version, mergedAt: now }));
    for (const row of rows) fs.appendFileSync(ledgerFile(solution), `${JSON.stringify(row)}\n`);
    fs.writeFileSync(path.join(dir, 'signals.merged'), `${now}\n`);
    merged.push({ run: path.basename(dir), signals: rows.length });
  }
  const ledger = readJsonl(ledgerFile(solution));
  const open = readJson(openFile(solution), {});
  const result = decide({ ledger, open, version, now, immediate, run: target.id });
  const thisRun = ledger.filter((row) => row.run === target.id);
  const out = { run: target.id, version, immediate, signals: thisRun.length, merged, ...result };
  writeJson(path.join(target.dir, 'self-review.json'), out);
  const kinds = [...new Set(result.due.map((d) => d.kind))].join(', ');
  const text = thisRun.length === 0 && result.due.length === 0
    ? 'Loop review: nothing to improve from this run.'
    : `Loop review: ${thisRun.length} signal${thisRun.length === 1 ? '' : 's'} · due ${result.due.length}${kinds ? ` (${kinds})` : ''} · open ${result.open.length} · skipped ${result.skipped.length}`;
  return { data: out, text };
}

/** `signals filed`: the record for a signal key is open now. */
export function markFiled({ run, solution, signalKey: key, record, now = new Date().toISOString(), version = readPluginVersion() }) {
  if (!key || !record) throw usage('signals filed needs --key <signal key> and --record <record id>');
  fs.mkdirSync(signalsDir(solution), { recursive: true });
  const open = readJson(openFile(solution), {});
  open[key] = { record: String(record), filedAt: now, version, run: resolveRun({ run, solution })?.id ?? null };
  writeJson(openFile(solution), open);
  return { data: { signalKey: key, ...open[key] }, text: `filed ${record} for ${key}` };
}
