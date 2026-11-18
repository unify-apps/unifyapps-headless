#!/usr/bin/env node
// Fill a run's receipt metrics from the files the run left behind, and render the
// ledgers across runs. Reads only; every number names the file it came from.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loopsHome } from '../../native-device-pool/scripts/lib/home.mjs';

const HELP = `Usage:
  node metrics.mjs collect --run DIR [--plan ID --solution-dir DIR] [--argent-log FILE] [--json]
  node metrics.mjs analyze [--runs DIR] [--solution-dir DIR] [--since YYYY-MM-DD] [--json]

collect  Read state.json, questions.jsonl, evidence.md, visual/pass-*/gaps.json, handoff.md and
         receipt.json in the run folder, the UnifyApps Headless plan record when --plan is given, and the
         argent call log between the run's start and end; write receipt.json.metrics.
analyze  Render the runs ledger, totals, refusals, environment failures and (with a solution
         folder) the UnifyApps Headless plan ledger, as Markdown or JSON.

Options:
  --run DIR           The run folder (holds receipt.json).
  --plan ID           The UnifyApps Headless plan the run owned.
  --solution-dir DIR  The UnifyApps Headless solution folder (holds records/plans/*.json).
  --argent-log FILE   argent's call log. Default ~/.argent/mcp-calls.log.
  --runs DIR          Where runs live. Default <solution>/.nebula/loops/runs (the --solution-dir, else the
                      current folder) when it exists, else $LOOPS_HOME/runs.
  --since DATE        Only runs started on or after this date.
  --json              Print JSON instead of Markdown.

Exit codes: 0 ok, 1 usage or a missing run folder.`;

const ENV_FAILURE_PATTERNS = [
  ['tenant_5xx', /HTTP 5\d\d|RoleMappingService|remote call failure/i],
  ['bridge_down', /fetch failed/i],
  ['auth_expired', /AUTH_EXPIRED|Signed out of/i],
  ['hid_dead', /HID transport is dead/i],
  ['preview_missing', /not installed|app vanished|Preview app .* missing/i],
];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function countBy(items, keyOf) {
  const counts = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (key === undefined || key === null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

// evidence.md rows: | # | stage | finding | kind | artefact | version | taken | verdict | by | (the counts read the first eight)
function readEvidence(runDir) {
  const rows = readLines(path.join(runDir, 'evidence.md'))
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 8)
    .map(([, phase, finding, kind, artefact, version, taken, verdict]) => ({ phase, finding, kind, artefact, version, taken, verdict }));
  return {
    rows: rows.length,
    byKind: countBy(rows, (row) => row.kind || 'none'),
    unverified: rows.filter((row) => /^unverified/i.test(row.verdict)).length,
    manual: rows.filter((row) => /^manual/i.test(row.verdict)).length,
  };
}

function readPasses(runDir) {
  // visual/ holds the visual check's passes; a run from before the rename has pixel/.
  const passesDir = ['visual', 'pixel'].map((name) => path.join(runDir, name)).find((dir) => fs.existsSync(dir));
  if (!passesDir) return [];
  return fs.readdirSync(passesDir)
    .filter((name) => /^pass-\d+$/.test(name))
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
    .map((name) => {
      const gaps = readJson(path.join(passesDir, name, 'gaps.json'));
      const summary = gaps?.summary ?? {};
      return { n: Number(name.slice(5)), gaps: (summary.off ?? 0) + (summary.missing ?? 0), off: summary.off ?? 0, missing: summary.missing ?? 0, accepted: summary.accepted ?? 0, verdict: summary.verdict ?? null };
    });
}

function readQuestions(runDir) {
  const rows = readLines(path.join(runDir, 'questions.jsonl')).map((line) => readJson !== null && safeParse(line)).filter(Boolean);
  const seconds = rows.map((row) => Number(row.seconds)).filter((value) => Number.isFinite(value));
  return { asked: rows.length, recommended: rows.filter((row) => row.recommended === true).length, medianSeconds: median(seconds), rows };
}

function safeParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// The plan record keeps its tasks inside the Markdown as a fenced `json nebula-tasks` block.
function readPlanTasks(solutionDir, planId) {
  const record = readJson(path.join(solutionDir, 'records', 'plans', `${planId}.json`));
  if (!record) return null;
  const markdown = record.properties?.plan ?? '';
  const match = markdown.match(/```json nebula-tasks\n([\s\S]*?)```/);
  const tasks = match ? safeParse(match[1]) ?? [] : [];
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/);
  const revisionLine = frontmatter?.[1].split('\n').find((line) => line.startsWith('revisionHistory:'));
  const revisions = revisionLine ? safeParse(revisionLine.slice('revisionHistory:'.length).trim()) ?? [] : [];
  return { tasks, revisions, status: record.properties?.status ?? null };
}

function taskMetrics(plan) {
  if (!plan) return { total: null, retried: null, handedBack: null, refusals: [] };
  const tasks = plan.tasks;
  const errors = tasks.flatMap((task) => (task.moves ?? []).map((move) => move.error).filter(Boolean));
  const refusals = Object.entries(countBy(errors, (error) => String(error).slice(0, 120))).map(([message, count]) => ({ message, count }));
  return {
    total: tasks.length,
    retried: tasks.filter((task) => (task.attempts ?? 0) > 1).length,
    handedBack: tasks.filter((task) => (task.handBacks ?? 0) > 0).length,
    refusals,
  };
}

function readArgentWindow(logFile, startedAt, endedAt) {
  if (!startedAt) return { total: 0, errors: 0, images: 0, byTool: {} };
  const start = Date.parse(startedAt);
  const end = endedAt ? Date.parse(endedAt) : Date.now();
  const events = readLines(logFile).map(safeParse).filter((event) => event && event.event && event.ts);
  const inWindow = events.filter((event) => { const at = Date.parse(event.ts); return at >= start && at <= end; });
  const results = inWindow.filter((event) => event.event === 'tool_result');
  return {
    total: inWindow.filter((event) => event.event === 'tool_called').length,
    errors: results.filter((event) => event.isError).length,
    images: results.filter((event) => JSON.stringify(event.result ?? {}).includes('image/png')).length,
    byTool: countBy(inWindow.filter((event) => event.event === 'tool_called'), (event) => event.name),
  };
}

function readEnvFailures(runDir, plan) {
  const text = ['measure.log', 'health.log', 'run.log']
    .map((name) => { try { return fs.readFileSync(path.join(runDir, name), 'utf8'); } catch { return ''; } })
    .join('\n') + '\n' + (plan?.tasks ?? []).flatMap((task) => (task.moves ?? []).map((move) => move.error ?? '')).join('\n');
  return ENV_FAILURE_PATTERNS
    .map(([kind, pattern]) => ({ kind, count: (text.match(new RegExp(pattern.source, pattern.flags + 'g')) ?? []).length }))
    .filter((entry) => entry.count > 0);
}

export function collect({ runDir, planId, solutionDir, argentLog }) {
  const receiptFile = path.join(runDir, 'receipt.json');
  const receipt = readJson(receiptFile) ?? {};
  const state = readJson(path.join(runDir, 'state.json')) ?? {};
  const plan = planId && solutionDir ? readPlanTasks(solutionDir, planId) : null;
  const tasks = taskMetrics(plan);
  const phases = state.phases ?? receipt.phases ?? [];
  const startedAt = state.startedAt ?? receipt.startedAt ?? phases[0]?.startedAt ?? null;
  const endedAt = state.endedAt ?? receipt.endedAt ?? phases.at(-1)?.endedAt ?? null;
  const metrics = {
    mode: state.mode ?? receipt.mode ?? 'interactive',
    startedAt,
    endedAt,
    phases,
    passes: readPasses(runDir),
    builderBatches: receipt.builderBatches ?? state.builderBatches ?? (plan ? new Set(plan.tasks.flatMap((task) => (task.moves ?? []).filter((move) => move.status === 'running').map((move) => move.at))).size : null),
    tasks: { total: tasks.total, retried: tasks.retried, handedBack: tasks.handedBack },
    revisions: (plan?.revisions ?? []).map((revision) => ({ impact: revision.impact, reason: revision.reason })),
    refusals: tasks.refusals,
    envFailures: readEnvFailures(runDir, plan),
    questions: readQuestions(runDir),
    deviceCalls: readArgentWindow(argentLog, startedAt, endedAt),
    evidence: readEvidence(runDir),
    handoff: fs.existsSync(path.join(runDir, 'handoff.md')),
    tokensApprox: receipt.tokensApprox ?? null,
    publishes: receipt.publishes ?? state.publishes ?? 0,
    outcome: state.outcome ?? receipt.outcome ?? 'unknown',
    needs: state.needs ?? receipt.needs ?? null,
    collectedAt: new Date().toISOString(),
  };
  receipt.metrics = metrics;
  fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n');
  return metrics;
}

function hours(startedAt, endedAt) {
  if (!startedAt || !endedAt) return null;
  return Math.round(((Date.parse(endedAt) - Date.parse(startedAt)) / 36e5) * 100) / 100;
}

function cell(value) {
  return value === null || value === undefined ? '—' : String(value);
}

export function analyze({ runsDir, solutionDir, since }) {
  const runs = fs.existsSync(runsDir)
    ? fs.readdirSync(runsDir).map((name) => ({ name, dir: path.join(runsDir, name), receipt: readJson(path.join(runsDir, name, 'receipt.json')) })).filter((run) => run.receipt?.metrics)
    : [];
  const cutoff = since ? Date.parse(since) : 0;
  const rows = runs
    .map((run) => ({ name: run.name, dir: run.dir, loop: run.receipt.route ?? run.receipt.loop ?? run.name.split('-')[0], page: run.receipt.inputs?.page ?? run.receipt.page ?? '—', ...run.receipt.metrics }))
    .filter((row) => !row.startedAt || Date.parse(row.startedAt) >= cutoff)
    .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  const refusals = {};
  for (const row of rows) for (const refusal of row.refusals ?? []) refusals[refusal.message] = (refusals[refusal.message] ?? 0) + refusal.count;
  const envFailures = {};
  for (const row of rows) for (const failure of row.envFailures ?? []) envFailures[failure.kind] = (envFailures[failure.kind] ?? 0) + failure.count;
  const waits = {};
  for (const row of rows) for (const phase of row.phases ?? []) {
    const key = phase.waitingOn ?? 'working';
    waits[key] = (waits[key] ?? 0) + (hours(phase.startedAt, phase.endedAt) ?? 0);
  }
  const plans = solutionDir ? planLedger(solutionDir, cutoff) : null;
  return { runs: rows, refusals, envFailures, waits, plans };
}

function planLedger(solutionDir, cutoff) {
  const dir = path.join(solutionDir, 'records', 'plans');
  if (!fs.existsSync(dir)) return null;
  const plans = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => {
    const record = readJson(path.join(dir, name));
    const parsed = readPlanTasks(solutionDir, name.replace(/\.json$/, ''));
    const markdown = record?.properties?.plan ?? '';
    const title = markdown.match(/^title:\s*"?(.*?)"?$/m)?.[1] ?? name;
    const created = record?.createdTime ? new Date(record.createdTime).toISOString() : null;
    return {
      id: name.replace(/\.json$/, ''), title, created, status: parsed?.status,
      tasks: parsed?.tasks.length ?? 0, retried: parsed?.tasks.filter((task) => (task.attempts ?? 0) > 1).length ?? 0,
      revisions: parsed?.revisions.length ?? 0,
      unverifiedDevice: (markdown.match(/Unverified:.*(device|simulator|Preview app)/gi) ?? []).length,
    };
  }).filter((plan) => !plan.created || Date.parse(plan.created) >= cutoff).sort((a, b) => String(a.created).localeCompare(String(b.created)));
  return {
    plans,
    totals: {
      plans: plans.length,
      tasks: plans.reduce((sum, plan) => sum + plan.tasks, 0),
      retried: plans.reduce((sum, plan) => sum + plan.retried, 0),
      revisions: plans.reduce((sum, plan) => sum + plan.revisions, 0),
      unverifiedDevice: plans.reduce((sum, plan) => sum + plan.unverifiedDevice, 0),
    },
  };
}

function renderMarkdown(report) {
  const lines = ['# Loop runs', '', '| run | loop | page | started | hours | mode | outcome | passes (last gaps) | batches | retried | refusals | env failures | questions (asked · recommended · median s) | evidence (unverified) |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const row of report.runs) {
    const passes = row.passes?.length ? `${row.passes.length} (${row.passes.at(-1).gaps})` : '—';
    const questions = row.questions ? `${row.questions.asked} · ${row.questions.recommended} · ${cell(row.questions.medianSeconds)}` : '—';
    const refusals = (row.refusals ?? []).reduce((sum, refusal) => sum + refusal.count, 0);
    const failures = (row.envFailures ?? []).reduce((sum, failure) => sum + failure.count, 0);
    lines.push(`| ${row.name} | ${row.loop} | ${row.page} | ${cell(row.startedAt)} | ${cell(hours(row.startedAt, row.endedAt))} | ${row.mode} | ${row.outcome} | ${passes} | ${cell(row.builderBatches)} | ${cell(row.tasks?.retried)} | ${refusals} | ${failures} | ${questions} | ${row.evidence?.rows ?? '—'} (${row.evidence?.unverified ?? '—'}) |`);
  }
  lines.push('', '## Where the time went (hours by what a phase waited on)', '');
  for (const [key, value] of Object.entries(report.waits)) lines.push(`- ${key}: ${Math.round(value * 100) / 100}`);
  lines.push('', '## Refusals', '');
  const refusals = Object.entries(report.refusals).sort((a, b) => b[1] - a[1]).slice(0, 15);
  lines.push(...(refusals.length ? refusals.map(([message, count]) => `- ${count}× ${message}`) : ['- none recorded']));
  lines.push('', '## Environment failures', '');
  const failures = Object.entries(report.envFailures).sort((a, b) => b[1] - a[1]);
  lines.push(...(failures.length ? failures.map(([kind, count]) => `- ${kind}: ${count}`) : ['- none recorded']));
  if (report.plans) {
    lines.push('', '## UnifyApps Headless plans', '', `${report.plans.totals.plans} plans, ${report.plans.totals.tasks} tasks, ${report.plans.totals.retried} retried, ${report.plans.totals.revisions} revisions, ${report.plans.totals.unverifiedDevice} unverified device lines`, '', '| plan | created | status | tasks | retried | revisions | unverified device |', '|---|---|---|---|---|---|---|');
    for (const plan of report.plans.plans) lines.push(`| ${plan.title} (${plan.id.slice(-6)}) | ${cell(plan.created)} | ${cell(plan.status)} | ${plan.tasks} | ${plan.retried} | ${plan.revisions} | ${plan.unverifiedDevice} |`);
  }
  return lines.join('\n');
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      run: { type: 'string' }, plan: { type: 'string' }, 'solution-dir': { type: 'string' }, 'argent-log': { type: 'string' },
      runs: { type: 'string' }, since: { type: 'string' }, json: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const command = positionals[0];
  if (values.help || !command) { console.log(HELP); process.exit(values.help ? 0 : 1); }
  const home = loopsHome();
  if (command === 'collect') {
    if (!values.run || !fs.existsSync(values.run)) { console.error('collect needs --run DIR that exists'); process.exit(1); }
    const metrics = collect({ runDir: values.run, planId: values.plan, solutionDir: values['solution-dir'], argentLog: values['argent-log'] || path.join(os.homedir(), '.argent', 'mcp-calls.log') });
    console.log(values.json ? JSON.stringify(metrics, null, 2) : `metrics written: ${metrics.outcome} · passes ${metrics.passes.length} · device calls ${metrics.deviceCalls.total} · evidence rows ${metrics.evidence.rows} (${metrics.evidence.unverified} unverified) · questions ${metrics.questions.asked}`);
    return;
  }
  if (command === 'analyze') {
    const report = analyze({ runsDir: values.runs || defaultRunsDir({ solutionDir: values['solution-dir'], home }), solutionDir: values['solution-dir'], since: values.since });
    console.log(values.json ? JSON.stringify(report, null, 2) : renderMarkdown(report));
    return;
  }
  console.log(HELP);
  process.exit(1);
}

/** A UnifyApps Headless loop run folder lives in the solution (`.nebula/loops/runs/`); older runs sit under LOOPS_HOME. */
export function defaultRunsDir({ solutionDir = null, cwd = process.cwd(), home = loopsHome() } = {}) {
  const inSolution = path.join(path.resolve(solutionDir ?? cwd), '.nebula', 'loops', 'runs');
  return fs.existsSync(inSolution) ? inSolution : path.join(home, 'runs');
}

// Compare real paths: Node resolves the main module through symlinks, argv[1] does not.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) main();
