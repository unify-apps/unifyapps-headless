#!/usr/bin/env node
// WEB runtime perf of a page's saved draft in the UnifyApps Headless browser: per fresh open and per
// interaction, LCP, CLS, INP, long tasks, TTFB, DOMContentLoaded and load, resources, images,
// data-source calls and the JS heap; then perf.json (loops.perf/1, platform web) and issue
// findings. Tracing is refused in a signed-in browser, so it reads buffered PerformanceObservers
// through eval. Node 22, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BrowserError, calls, command, evalIn, openPage } from '../../web-browser/scripts/lib/driver.mjs';
import { DEVICE_SIZES, planFor, setWidth } from '../../web-browser/scripts/lib/breakpoints.mjs';
import { UsageError, main } from '../../web-browser/scripts/lib/cli.mjs';
import { CHECK_CODES, evidencePath, numberIssues, pageCell, writeOutputs } from '../../web-browser/scripts/lib/issues.mjs';
import { collectStep, installProbe, markStep } from './lib/probe.mjs';
import { buildStep } from './lib/step.mjs';
import { buildWebPerf, checkPerf, findingsPointer, perfFindings, WEB_METRICS } from './lib/perf-doc.mjs';

const HELP = `Usage:
  node profile.mjs open --browser <folder> --url <preview url> --step <name> --out <dir> [--width 1440] [--runs 1]
                        [--page-id e_…] [--quiet-ms 600] [--cap-ms 10000]
  node profile.mjs step --browser <folder> --step <name> --out <dir> --do "<command>" [--do "<command>"]...
                        [--runs 1] [--quiet-ms 600] [--cap-ms 10000]
  node profile.mjs build --run <dir> [--out <dir>/perf.json] [--app <id>] [--app-name N] [--page <id>]... [--scope page|app]
                        [--run-id <id>] [--thresholds <file>] [--now <iso>] [--json]
  node profile.mjs findings --perf <perf.json> --out <findings.json> [--check perf] [--group 1] [--start 1]
                        [--page-name N] [--page-id e_…] [--issues <file.md>] [--run <run folder>]

open      Loads the page fresh with open-page (each run a new document; the first run on an empty cache
          is "cold"), starts buffered observers, waits until the page is quiet and writes
          <out>/<step>.<run>.web-step.json: TTFB, FCP, LCP (and its block), DOMContentLoaded, load, CLS,
          long tasks and TBT, resources, images, data-source calls (browser.mjs calls), heap, DOM and block counts.
          --width first puts the preview at a platform size (page-shot: ${DEVICE_SIZES.map((size) => size.width).join(', ')}) and the window back to
          that size's height. The phone width is the responsive check's, not a timed open.
step      Marks the page, runs each --do as a browser.mjs command on the open page (click <ref>, fill <ref> <text>,
          press <key>, select, check, hover, type, mousewheel, wait-for <text>), waits until it is quiet and
          writes the step file: INP (event timing), CLS, long tasks, the calls and resources it made, heap growth.
          Never a step that deletes or submits a real record.
build     perf.json (schema loops.perf/1, "platform": "web") from the run folder's step files, checked
          with the orchestrator's checkPerf against the WEB metrics:
            ${Object.keys(WEB_METRICS).join(', ')}
findings  The metrics past their pass threshold as issues (warn minor, fail major; check perf, ids PF<group>-<nn>)
          with rank, metric and gain: the findings.json feed a fix run takes. It also sets "findings" in the
          perf.json it read (path, count, kinds), so the report shows them; run it after build.

Exit codes: 0 done · 1 a browser command failed, or build's check found problems · 2 usage ·
3-7 open-page's own (3 no browser, 4 no load, 5 wrong page or signed out, 6 no block, 7 the tenant would not say its environment
failed or the tenant would not say its environment).`;

const DO_VERBS = new Set(['click', 'dblclick', 'hover', 'fill', 'type', 'press', 'select', 'check', 'uncheck', 'mousewheel', 'wait-for', 'go-back', 'drag', 'keydown', 'keyup']);

/** `fill e12 "Walk one"` → ['fill', 'e12', 'Walk one']. Double or single quotes group words. */
export function splitCommand(text) {
  const out = [];
  let current = '';
  let quote = null;
  let started = false;
  for (const char of String(text)) {
    if (quote) {
      if (char === quote) quote = null; else current += char;
    } else if (char === '"' || char === "'") { quote = char; started = true; }
    else if (/\s/u.test(char)) { if (started || current) { out.push(current); current = ''; started = false; } }
    else { current += char; started = true; }
  }
  if (quote) throw new UsageError(`unclosed quote in --do "${text}"`);
  if (started || current) out.push(current);
  return out;
}

/** The recorded data-source calls; a browser that records none (no open-page yet) gives none, with a note. */
function recordedCalls(folder, env, notes) {
  try { return calls(folder, { env }); } catch (error) { notes.push(`data-source calls not read: ${error.message}`); return []; }
}

const stepFile = (out, step, run) => path.join(out, `${step.replace(/[^\w.-]+/gu, '-')}.${run}.web-step.json`);
const writeStep = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`); };
const positive = (value, fallback, flag) => {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!(n > 0)) throw new UsageError(`${flag} takes a positive number`);
  return n;
};

function stepCommon(values) {
  if (!values.browser || !values.step || !values.out) throw new UsageError('needs --browser <folder>, --step <name> and --out <dir>');
  return { folder: path.resolve(values.browser), out: path.resolve(values.out), runs: positive(values.runs, 1, '--runs'), quietMs: positive(values['quiet-ms'], 600, '--quiet-ms'), capMs: positive(values['cap-ms'], 10000, '--cap-ms') };
}

async function openCommand(values, env) {
  const common = stepCommon(values);
  if (!values.url) throw new UsageError('open needs --url <preview url>');
  const width = values.width ? Number(values.width) : null;
  if (width && planFor(width).via !== 'page-shot') throw new UsageError(`--width takes a platform size (${DEVICE_SIZES.map((size) => size.width).join(', ')}), not ${values.width}: the phone width is the responsive check's`);
  if (width) {
    const first = openPage(common.folder, values.url, { env });
    if (!first.ok) throw new BrowserError(`open-page: ${first.message}`, first.code, 'open-page');
    const set = setWidth(common.folder, width, { env });
    if (!set.ok) throw new BrowserError(`width ${width}: ${set.message}`, 1, 'width');
    // page-shot leaves the window as tall as the page; an open is timed in a window of the device's height.
    const height = set.height ?? planFor(width).height;
    if (height) command(common.folder, ['resize', width, height], { env });
  }
  const files = [];
  let last = null;
  for (let run = 1; run <= common.runs; run++) {
    const startedAt = new Date().toISOString();
    const opened = openPage(common.folder, values.url, { env });
    if (!opened.ok) throw new BrowserError(`open-page: ${opened.message}`, opened.code, 'open-page');
    evalIn(common.folder, installProbe, {}, { env });
    const raw = evalIn(common.folder, collectStep, { since: 'navigation', images: true, quietMs: common.quietMs, capMs: common.capMs }, { env, timeoutMs: common.capMs + 60000 });
    const notes = [];
    const recorded = recordedCalls(common.folder, env, notes);
    last = buildStep({ raw, calls: recorded, step: values.step, kind: 'open', run, startedAt, pageId: values['page-id'] ?? opened.pageIds?.[0] ?? null, width, notes });
    const file = stepFile(common.out, values.step, run);
    writeStep(file, last);
    files.push(file);
  }
  return { step: values.step, kind: 'open', files, metrics: last.metrics, cache: last.cache, notes: last.notes };
}

async function stepCommand(values, env) {
  const common = stepCommon(values);
  const actions = (values.do ?? []).map(splitCommand);
  if (!actions.length) throw new UsageError('step needs at least one --do "<browser.mjs command>"');
  for (const action of actions) if (!DO_VERBS.has(action[0])) throw new UsageError(`--do takes ${[...DO_VERBS].join(', ')}; not ${action[0]}`);
  const files = [];
  let last = null;
  for (let run = 1; run <= common.runs; run++) {
    evalIn(common.folder, installProbe, {}, { env });
    const marked = evalIn(common.folder, markStep, {}, { env });
    if (marked?.error) throw new BrowserError(marked.error, 1, 'eval');
    const startedAt = new Date().toISOString();
    for (const action of actions) command(common.folder, action, { env, timeoutMs: 60000 });
    const raw = evalIn(common.folder, collectStep, { since: 'mark', images: false, quietMs: common.quietMs, capMs: common.capMs }, { env, timeoutMs: common.capMs + 60000 });
    const notes = [`did: ${actions.map((action) => action.join(' ')).join(' → ')}`];
    const recorded = recordedCalls(common.folder, env, notes);
    last = buildStep({ raw, calls: recorded, step: values.step, kind: 'interaction', run, startedAt, pageId: values['page-id'] ?? null, notes });
    const file = stepFile(common.out, values.step, run);
    writeStep(file, last);
    files.push(file);
  }
  return { step: values.step, kind: 'interaction', files, metrics: last.metrics, notes: last.notes };
}

async function buildCommand(values) {
  if (!values.run) throw new UsageError('build needs --run <dir>');
  if (!fs.existsSync(values.run)) throw new UsageError(`${values.run} does not exist`);
  const thresholds = values.thresholds ? JSON.parse(fs.readFileSync(values.thresholds, 'utf8')) : undefined;
  const doc = buildWebPerf(values.run, { app: values.app, appName: values['app-name'], pages: values.page, scope: values.scope, runId: values['run-id'], thresholds, now: values.now });
  const out = values.out ?? path.join(values.run, 'perf.json');
  fs.writeFileSync(out, `${JSON.stringify(doc, null, 1)}\n`);
  const problems = checkPerf(doc, { runDir: values.run });
  const summary = { out, platform: doc.platform, verdict: doc.verdict, metrics: Object.keys(doc.metrics).length, unmeasured: doc.unmeasured.map((item) => item.metric), steps: doc.steps.length, problems };
  if (problems.length) throw Object.assign(new Error(`perf.json written with problems:\n  ${problems.join('\n  ')}`), { summary });
  return summary;
}

async function findingsCommand(values) {
  if (!values.perf || !values.out) throw new UsageError('findings needs --perf <perf.json> and --out <findings.json>');
  const perf = JSON.parse(fs.readFileSync(values.perf, 'utf8'));
  const found = perfFindings(perf);
  const check = values.check ?? 'perf';
  if (check !== 'perf') throw new UsageError(`--check takes perf; not ${check}`);
  const runDir = values.run ? path.resolve(values.run) : null;
  const perfDir = path.dirname(path.resolve(values.perf));
  // Evidence in perf.json is relative to its folder; issues are relative to the run folder.
  const withEvidence = found.map((finding) => ({ ...finding, evidence: runDir ? `${evidencePath(path.join(perfDir, finding.evidence.split('#')[0]), runDir)}#${finding.evidence.split('#')[1] ?? ''}` : finding.evidence }));
  const page = { name: values['page-name'] ?? null, id: values['page-id'] ?? perf.pages?.[0]?.id ?? null };
  const issues = numberIssues(withEvidence, { check, code: CHECK_CODES[check] ?? 'PF', group: values.group ?? '1', start: values.start ? Number(values.start) : 1, page });
  const feed = issues.map((issue, index) => ({ ...issue, rank: withEvidence[index].rank, metric: withEvidence[index].metric, gain: withEvidence[index].gain }));
  fs.mkdirSync(path.dirname(path.resolve(values.out)), { recursive: true });
  fs.writeFileSync(values.out, `${JSON.stringify(feed, null, 2)}\n`);
  // perf.json points at its findings (the report reads them through it): set the pointer here, so build then findings needs no second build.
  perf.findings = findingsPointer(perfDir, path.resolve(values.out), feed);
  fs.writeFileSync(values.perf, `${JSON.stringify(perf, null, 1)}\n`);
  const written = writeOutputs({ issues, page: pageCell(page), md: values.issues ?? null, title: `Issues — ${check} (WEB) · ${values['page-name'] ?? perf.pages?.[0]?.id ?? 'page'}`, header: [['Stage', `${check} (WEB)`], ['Browser', `Chrome for Testing (the UnifyApps Headless browser) · preview route, saved draft · ${perf.device?.model ?? '?'}`], ['Perf', path.basename(values.perf)]] });
  return { findings: values.out, ...written, issues: feed.length, verdict: perf.verdict, perf: values.perf };
}

export async function runProfile(argv, { env = process.env } = {}) {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: {
      browser: { type: 'string' }, url: { type: 'string' }, step: { type: 'string' }, out: { type: 'string' }, width: { type: 'string' }, runs: { type: 'string' },
      'page-id': { type: 'string' }, 'page-name': { type: 'string' }, 'quiet-ms': { type: 'string' }, 'cap-ms': { type: 'string' }, do: { type: 'string', multiple: true },
      run: { type: 'string' }, app: { type: 'string' }, 'app-name': { type: 'string' }, page: { type: 'string', multiple: true }, scope: { type: 'string' }, 'run-id': { type: 'string' },
      thresholds: { type: 'string' }, now: { type: 'string' }, perf: { type: 'string' }, check: { type: 'string' }, group: { type: 'string' }, start: { type: 'string' }, issues: { type: 'string' },
      json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    },
  });
  const [verb] = positionals;
  if (values.help || !verb) return { help: HELP };
  if (verb === 'open') return openCommand(values, env);
  if (verb === 'step') return stepCommand(values, env);
  if (verb === 'build') return buildCommand(values);
  if (verb === 'findings') return findingsCommand(values);
  throw new UsageError(`unknown command "${verb}" (open, step, build or findings)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exit(await main(() => runProfile(process.argv.slice(2))));
}
