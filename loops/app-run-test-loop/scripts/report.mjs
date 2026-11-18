#!/usr/bin/env node
// Turns one Test Studio run of a WEB app's suite or plan into one self-contained HTML report, from the
// triage loop's firing: its evidence.json (the answer of `fetch_run_executions`, saved verbatim) and the
// app's loop ledger, which holds the triage verdicts of this firing and every earlier run this loop
// reported, so the report shows the trend and the cases that flip between runs. Node 22, no dependencies;
// calls no tenant.
//
//   node report.mjs --firing <tests/<app slug>/loops/<firing id>> --ledger <tests/<app slug>/loop-ledger.json>
//                   [--app <name>] [--suite <name>] [--url <app url>] [--evidence <file>] [--copy <folder>] [--open] [--json]
//
// --firing holds evidence.json and gets report.html and summary.json. The ledger gets one `run-loop` row per
// execution and one `firing:<id>` row with the counts; the last 10 firings are drawn as the trend.
// --copy puts a dated copy of the report in that folder (such as ~/Downloads) and prints its path.
//
// Exit codes: 0 done · 1 a file was unreadable, the run has no executions, or the triage loop ran in fallback mode
// (its evidence then holds the reds only) · 2 usage.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { readLedger, upsertRow, writeLedger } from '../../../skills/app-test-author/scripts/loop.mjs';

// How many runs the trend draws, this one included; enough to see a trend, few enough to read.
const HISTORY_RUNS = 10;
// The ledger rows this loop writes; the triage loop's rows of the same firing carry the verdicts.
export const LOOP = 'run-loop';
const TRIAGE_LOOP = 'analyse-run';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const clean = (value) => String(value ?? '').replace(/\s+/gu, ' ').trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/gu, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** Test Studio's status words as four results: passed, failed, skipped, running (anything else is `other`). */
export function normalizeStatus(status) {
  const s = String(status ?? '').toUpperCase();
  if (/PASS|SUCCESS/u.test(s)) return 'passed';
  if (/FAIL|ERROR|TIMEOUT|TIMED_OUT/u.test(s)) return 'failed';
  if (/SKIP|CANCEL/u.test(s)) return 'skipped';
  if (/RUN|PEND|QUEUE|PROGRESS|CREATED|SCHEDULED/u.test(s)) return 'running';
  return 'other';
}

/** The first failed step of an execution's Playwright output, from any browser. */
export function failingStepOf(output) {
  for (const browser of Object.keys(output ?? {})) {
    const tests = output[browser]?.testResults?.tests ?? [];
    for (const t of tests) {
      const steps = Array.isArray(t.steps) ? t.steps : [];
      const index = steps.findIndex((step) => normalizeStatus(step.status) === 'failed');
      if (index >= 0) return { browser, index: index + 1, of: steps.length, title: clean(steps[index].title), error: clean(steps[index].error ?? t.error) };
      if (normalizeStatus(t.status) === 'failed') return { browser, index: null, of: steps.length, title: null, error: clean(t.error) };
    }
  }
  return null;
}

/** The rows of a saved `fetch_run_executions` answer (`objects[].columns`), one per execution, normalised. */
export function readExecutions(answer) {
  const objects = Array.isArray(answer) ? answer : Array.isArray(answer?.objects) ? answer.objects : Array.isArray(answer?.rows) ? answer.rows : [];
  return objects.map((o) => o?.columns ?? o).filter((c) => c && typeof c === 'object').map((c) => {
    const output = c.OUTPUT && typeof c.OUTPUT === 'object' ? c.OUTPUT : {};
    const browsers = Object.keys(output);
    const steps = browsers.reduce((n, b) => n + (output[b]?.testResults?.tests ?? []).reduce((m, t) => m + (t.steps?.length ?? 0), 0), 0);
    const durationMs = Number(c.PLAYWRIGHT_EXECUTION_TIME ?? c.EXECUTION_TIME ?? c.DURATION_MS ?? c.DURATION) || null;
    return {
      id: String(c.ID ?? ''), caseId: String(c.TEST_CASE_ID ?? ''), name: clean(c.NAME) || String(c.TEST_CASE_ID ?? ''), status: normalizeStatus(c.STATUS), rawStatus: String(c.STATUS ?? ''),
      startTime: Number(c.START_TIME) || null, durationMs, runId: String(c.TEST_SUITE_RUN_ID ?? ''), browsers, steps, error: clean(c.ERROR_SUMMARY), failingStep: failingStepOf(output), dataDriven: Boolean(c.IS_DATA_DRIVEN),
    };
  });
}

export function summarize(rows) {
  const counts = { total: rows.length, passed: 0, failed: 0, skipped: 0, running: 0, other: 0 };
  for (const r of rows) counts[r.status] += 1;
  const times = rows.map((r) => r.startTime).filter(Boolean);
  const ends = rows.map((r) => (r.startTime && r.durationMs ? r.startTime + r.durationMs : null)).filter(Boolean);
  return { ...counts, startedAt: times.length ? new Date(Math.min(...times)).toISOString() : null, endedAt: ends.length ? new Date(Math.max(...ends)).toISOString() : null, runId: rows.find((r) => r.runId)?.runId ?? null };
}

/** The ledger rows of one reported run: one per execution and one `firing:<id>` row with the counts. */
export function runRows(rows, summary, { firing, suite = null, at }) {
  const runId = summary.runId ?? null;
  const perCase = rows.map((r) => ({ loop: LOOP, firingId: firing, runId, executionId: r.id, testCaseId: r.caseId, name: r.name, status: r.status, startTime: r.startTime, durationMs: r.durationMs }));
  const counts = { total: summary.total, passed: summary.passed, failed: summary.failed, skipped: summary.skipped, unfinished: summary.running + summary.other };
  return [...perCase, { loop: LOOP, firingId: firing, runId, executionId: `firing:${firing}`, suite, at, ...counts }];
}

/** The runs this loop reported before this one, oldest first: the counts and each case's result. `before` is this run's start; a run reported later than it is not its past. */
export function runHistory(ledger, { firing, before = null, runs = HISTORY_RUNS } = {}) {
  const rows = (ledger?.rows ?? []).filter((r) => r.loop === LOOP && r.firingId && r.firingId !== firing);
  const firings = rows.filter((r) => r.executionId === `firing:${r.firingId}` && (!before || String(r.at ?? '') < before)).sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')));
  return firings.slice(-(runs - 1)).map((f) => {
    const cases = {};
    for (const r of rows) if (r.firingId === f.firingId && r.testCaseId && !String(r.executionId).includes(':')) cases[r.testCaseId] = r.status;
    return { firingId: f.firingId, runId: f.runId ?? null, suite: f.suite ?? null, at: f.at ?? null, total: f.total ?? 0, passed: f.passed ?? 0, failed: f.failed ?? 0, skipped: f.skipped ?? 0, cases };
  });
}

/** How the triage loop ran this firing, from its firing row: `platform mode`, `fallback mode …`, or null when it left no row. */
export function triageMode(ledger, { firing }) {
  const row = (ledger?.rows ?? []).find((r) => r.loop === TRIAGE_LOOP && r.firingId === firing && r.executionId === `firing:${firing}`);
  return row ? clean(row.mode) || null : null;
}

/** The triage loop's verdict per execution of this firing, from its ledger rows. */
export function triageVerdicts(ledger, { firing }) {
  const out = new Map();
  for (const r of ledger?.rows ?? []) {
    if (r.loop !== TRIAGE_LOOP || r.firingId !== firing || String(r.executionId).includes(':')) continue;
    out.set(String(r.executionId), { verdict: clean(r.verdict), route: clean(r.route), class: clean(r.class), cause: clean(r.cause), historyTag: clean(r.historyTag) });
  }
  return out;
}

/** Per case: how it did in the earlier runs, oldest first, so a case that flips between runs shows as flaky. */
export function caseTrends(history, rows) {
  const out = new Map();
  for (const r of rows) {
    const past = history.map((h) => h.cases?.[r.caseId] ?? null).filter(Boolean);
    const failed = past.filter((s) => s === 'failed').length;
    const passed = past.filter((s) => s === 'passed').length;
    out.set(r.caseId, { past, flaky: failed > 0 && passed > 0, newRed: r.status === 'failed' && past.length > 0 && failed === 0, alwaysRed: r.status === 'failed' && past.length > 0 && passed === 0 });
  }
  return out;
}

const fmtMs = (ms) => (ms == null ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const fmtAt = (iso) => (iso ? iso.replace('T', ' ').replace(/\.\d+Z$/u, ' UTC') : '');

/** The report: counts, the trend (the earlier runs, then this one), every case with its failing step and triage verdict, the reds first. */
export function renderHtml({ app = 'App', suite = '', url = '', rows, summary, history = [], verdicts = new Map(), generatedAt = new Date().toISOString() }) {
  const trends = caseTrends(history, rows);
  const order = { failed: 0, running: 1, other: 2, skipped: 3, passed: 4 };
  const sorted = [...rows].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  const current = { runId: summary.runId, at: summary.startedAt ?? generatedAt, total: summary.total, passed: summary.passed };
  const recent = [...history.slice(-(HISTORY_RUNS - 1)), current];
  const bars = recent.map((h) => {
    const total = Math.max(1, h.total ?? 0);
    const pct = Math.round(((h.passed ?? 0) / total) * 100);
    return `<div class="bar" title="${esc(h.runId ?? '')} · ${esc(fmtAt(h.at))} · ${h.passed}/${h.total} passed"><div style="height:${pct}%"></div><span>${pct}%</span></div>`;
  }).join('');
  const trendWord = (t) => (t.flaky ? '<span class="tag warn">flaky</span>' : t.newRed ? '<span class="tag bad">new red</span>' : t.alwaysRed ? '<span class="tag bad">red every run</span>' : '');
  const caseRows = sorted.map((r) => {
    const t = trends.get(r.caseId) ?? { past: [] };
    const dots = t.past.map((s) => `<i class="dot ${s}" title="${s}"></i>`).join('');
    const step = r.failingStep ? `${r.failingStep.index ? `step ${r.failingStep.index} of ${r.failingStep.of}: ` : ''}${esc(r.failingStep.title ?? '')}${r.failingStep.error ? `<br><small>${esc(r.failingStep.error.slice(0, 400))}</small>` : ''}` : (r.error ? `<small>${esc(r.error.slice(0, 400))}</small>` : '');
    const v = verdicts.get(r.id);
    const triage = v ? `<b>${esc(v.verdict || v.class)}</b>${v.cause ? `<br><small>${esc(v.cause)}</small>` : ''}${v.route ? `<br><small>next: ${esc(v.route)}</small>` : ''}` : (r.status === 'failed' ? '<small>not triaged</small>' : '');
    return `<tr class="${r.status}"><td><b class="status ${r.status}">${r.status}</b></td><td>${esc(r.name)}${trendWord(t)}<div class="dots">${dots}</div></td><td>${step}</td><td>${triage}</td><td>${fmtMs(r.durationMs)}</td><td>${esc(r.browsers.join(', '))}</td></tr>`;
  }).join('\n');
  const pct = summary.total ? Math.round((summary.passed / summary.total) * 100) : 0;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(app)} test run${suite ? `: ${esc(suite)}` : ''}</title>
<style>
:root { color-scheme: light dark; --ink: #1b1b1b; --muted: #6b6b6b; --line: #d9d9d4; --page: #faf9f6; --card: #fff; --ok: #1a8f4a; --warn: #c27a00; --bad: #c2362b; --skip: #8a8a84; }
@media (prefers-color-scheme: dark) { :root { --ink: #f1f1ee; --muted: #a8a8a2; --line: #3a3a37; --page: #141413; --card: #1e1e1c; } }
* { box-sizing: border-box; } body { margin: 0; font: 15px/1.45 system-ui, sans-serif; color: var(--ink); background: var(--page); }
main { max-width: 1100px; margin: 0 auto; padding: 16px; } h1 { font-size: 20px; margin: 0 0 4px; } .meta { color: var(--muted); margin: 0 0 16px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 0 0 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; } .card b { display: block; font-size: 26px; } .card span { color: var(--muted); font-size: 13px; }
.card.passed b { color: var(--ok); } .card.failed b { color: var(--bad); } .card.skipped b, .card.running b { color: var(--skip); }
.trend { display: flex; align-items: flex-end; gap: 6px; height: 90px; margin: 0 0 16px; padding: 10px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
.bar { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; } .bar div { width: 100%; background: var(--ok); border-radius: 4px 4px 0 0; min-height: 2px; } .bar span { font-size: 11px; color: var(--muted); }
table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; } th, td { text-align: left; padding: 8px 10px; border-top: 1px solid var(--line); vertical-align: top; } th { background: var(--page); font-weight: 600; font-size: 13px; }
.status { text-transform: capitalize; } .status.passed { color: var(--ok); } .status.failed { color: var(--bad); } .status.skipped, .status.running, .status.other { color: var(--skip); }
.tag { display: inline-block; font-size: 11px; padding: 0 6px; border-radius: 999px; margin-left: 6px; border: 1px solid currentColor; } .tag.warn { color: var(--warn); } .tag.bad { color: var(--bad); }
.dots { margin-top: 3px; } .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 3px; background: var(--skip); } .dot.passed { background: var(--ok); } .dot.failed { background: var(--bad); }
small { color: var(--muted); }
@media (max-width: 700px) { main { padding: 12px; } th:nth-child(5), td:nth-child(5), th:nth-child(6), td:nth-child(6) { display: none; } }
</style>
</head>
<body>
<main>
  <h1>${esc(app)}${suite ? ` · ${esc(suite)}` : ''}: ${pct}% passed</h1>
  <p class="meta">Run ${esc(summary.runId ?? '')}${summary.startedAt ? ` · started ${esc(fmtAt(summary.startedAt))}` : ''}${summary.endedAt ? ` · ended ${esc(fmtAt(summary.endedAt))}` : ''} · report ${esc(fmtAt(generatedAt))}${url ? ` · <a href="${esc(url)}">${esc(url)}</a>` : ''}</p>
  <div class="cards">
    <div class="card"><b>${summary.total}</b><span>cases</span></div>
    <div class="card passed"><b>${summary.passed}</b><span>passed</span></div>
    <div class="card failed"><b>${summary.failed}</b><span>failed</span></div>
    <div class="card skipped"><b>${summary.skipped}</b><span>skipped</span></div>
    <div class="card running"><b>${summary.running + summary.other}</b><span>unfinished</span></div>
  </div>
  ${recent.length > 1 ? `<div class="trend">${bars}</div>` : ''}
  <table>
    <thead><tr><th>Result</th><th>Case</th><th>Where it stopped</th><th>Triage</th><th>Time</th><th>Browser</th></tr></thead>
    <tbody>
${caseRows}
    </tbody>
  </table>
</main>
</body>
</html>
`;
}

function openInBrowser(file) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [file]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : ['xdg-open', [file]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); return true; } catch { return false; }
}

const slug = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'app';

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: { firing: { type: 'string' }, ledger: { type: 'string' }, app: { type: 'string' }, suite: { type: 'string' }, url: { type: 'string' }, evidence: { type: 'string' }, copy: { type: 'string' }, open: { type: 'boolean' }, json: { type: 'boolean' } }, strict: true });
  if (!values.firing || !values.ledger) { process.stderr.write('usage: report.mjs --firing <tests/<app slug>/loops/<firing id>> --ledger <tests/<app slug>/loop-ledger.json> [--app <name>] [--suite <name>] …\n'); process.exit(2); }
  const firingDir = resolve(values.firing);
  const firing = basename(firingDir);
  const evidenceFile = values.evidence ? resolve(values.evidence) : join(firingDir, 'evidence.json');
  let rows;
  try { rows = readExecutions(readJson(evidenceFile)); } catch (error) { process.stderr.write(`cannot read ${evidenceFile}: ${error.message}\n`); process.exit(1); }
  if (!rows.length) { process.stderr.write(`${evidenceFile} holds no executions: the triage loop saves the answer of fetch_run_executions there\n`); process.exit(1); }
  const ledgerFile = resolve(values.ledger);
  const ledger = readLedger(ledgerFile);
  const mode = triageMode(ledger, { firing });
  if (mode && /fallback/iu.test(mode)) { process.stderr.write(`the triage loop ran firing ${firing} in fallback mode, so ${evidenceFile} holds the reds only: no report can count the run\n`); process.exit(1); }
  const summary = summarize(rows);
  const generatedAt = new Date().toISOString();
  const history = runHistory(ledger, { firing, before: summary.startedAt ?? generatedAt });
  const verdicts = triageVerdicts(ledger, { firing });
  const html = renderHtml({ app: values.app, suite: values.suite, url: values.url, rows, summary, history, verdicts, generatedAt });
  mkdirSync(firingDir, { recursive: true });
  const report = join(firingDir, 'report.html');
  writeFileSync(report, html);
  for (const row of runRows(rows, summary, { firing, suite: values.suite ?? null, at: summary.startedAt ?? generatedAt })) upsertRow(ledger, row);
  writeLedger(ledgerFile, ledger);
  const out = { ok: true, report, firing, runId: summary.runId, ...summary, triaged: verdicts.size, reds: rows.filter((r) => r.status === 'failed').map((r) => ({ id: r.id, caseId: r.caseId, name: r.name, verdict: verdicts.get(r.id)?.verdict ?? null })) };
  writeFileSync(join(firingDir, 'summary.json'), `${JSON.stringify(out, null, 2)}\n`);
  if (values.copy) {
    const date = generatedAt.slice(0, 10);
    const copy = join(resolve(values.copy), `${slug(values.app ?? 'app')}-${slug(values.suite ?? 'run')}-TestStudio-${date}.html`);
    mkdirSync(resolve(values.copy), { recursive: true });
    copyFileSync(report, copy);
    out.copy = copy;
  }
  if (values.open) out.opened = openInBrowser(out.copy ?? report);
  process.stdout.write(values.json ? `${JSON.stringify(out)}\n` : `wrote ${report}: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped of ${summary.total}${out.copy ? `; copy at ${out.copy}` : ''}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) main();
