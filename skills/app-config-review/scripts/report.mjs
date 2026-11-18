#!/usr/bin/env node
// report.mjs writes a config review's report from its run folder.
//   node report.mjs --run <reviews/<app id>/<stamp>>
// Reads raw/plan.json, raw/platform.json, raw/script.json, raw/runtime.json, raw/pages/<pageId>.json
// and raw/verify/<pageId>.json from each page reviewer (raw/pages/app.json and raw/verify/app.json
// for the app pass), raw/perf/<pageId>.json and raw/perf-verify/<pageId>.json from each perf
// reviewer, and the last report of the same app beside this run. Writes report.json, report.md and
// report.html (the page people fix from) into the run folder and prints the verdict line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appliesTo, loadRulebook } from '../../app-best-practices/scripts/rule-check.mjs';
import { automationFindings, dedupe, groupRepeats, markNew, platformFindings, rank, reviewerFindings, scriptFindings } from './findings.mjs';
import { inPerfLens } from './perf.mjs';
import { renderPage } from './page.mjs';
import { renderReport } from './render.mjs';

/**
 * The branch criteria's verdict: any P0 blocks; a review that could not read what it needed
 * is not-evaluable; three or more P1 need polish; otherwise ready.
 */
export function verdict(findings, reasons) {
  if (findings.some(item => item.severity === 'P0')) return 'block-before-ship';
  if (reasons.length) return 'not-evaluable';
  if (findings.filter(item => item.severity === 'P1').length >= 3) return 'polish-before-ship';
  return 'ready';
}

/**
 * One row per area that applies to the app type. A rule counts as checked when the pass that
 * owns it ran: platform rules when the platform's failed checks were read, automated script
 * rules when rule-check ran them, the reviewer's rules when at least one page review came back.
 */
export function scorecard({ rules, areas, appType, findings, checked }) {
  return areas.map(area => {
    const own = [...rules.values()].filter(rule => rule.area === area.code && appliesTo(rule, appType));
    if (!own.length) return null;
    const ran = own.filter(rule => checked.has(rule.id)).length;
    const hits = findings.filter(item => item.area === area.code);
    const state = !ran && !hits.length ? 'Not checked'
      : hits.some(item => item.severity === 'P0') ? 'Critical'
        : hits.length ? 'Minor' : 'Clean';
    return { code: area.code, name: area.name, state, checked: ran, rules: own.length, findings: hits.map(item => item.ref) };
  }).filter(Boolean);
}

const average = values => {
  const scores = values.filter(Number.isFinite);
  return scores.length ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length) : null;
};

const readJson = file => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);

/**
 * What the config could not show, for the report: the automations the pages wait on, slowest
 * first, and the objects they read, largest first.
 */
export function runtimeSummary(runtime) {
  if (!runtime) return null;
  const automations = (runtime.automations ?? []).filter(entry => entry.runs)
    .sort((left, right) => (right.medianMs ?? -1) - (left.medianMs ?? -1));
  const objects = (runtime.objects ?? []).filter(entry => entry.records !== null)
    .sort((left, right) => right.records - left.records);
  return { automations, objects };
}
const uniqueBy = (items, key) => [...new Map(items.map(item => [key(item), item])).values()];
// A reviewer's notVerified is model output: a string, {call, error}, or its own field names.
const gapEntry = entry => (typeof entry === 'string' ? { call: entry, error: '' } : { call: String(entry?.call ?? entry?.what ?? ''), error: String(entry?.error ?? entry?.why ?? entry?.reason ?? '') });

/** The newest report.json of the same app in a sibling run folder older than this one. */
export function previousReport(runDir) {
  const parent = path.dirname(runDir);
  const here = path.basename(runDir);
  const older = fs.readdirSync(parent).filter(name => name < here && fs.existsSync(path.join(parent, name, 'report.json'))).sort();
  const last = older.length ? readJson(path.join(parent, older.at(-1), 'report.json')) : null;
  // A run folder outside reviews/<app>/ can sit next to another app's runs.
  const appId = readJson(path.join(runDir, 'raw', 'plan.json'))?.app?.id;
  return last && (!appId || last.app?.id === appId) ? last : null;
}

export function buildReport(runDir, { rulebook = loadRulebook(), previous = previousReport(runDir) } = {}) {
  const { rules, areas } = rulebook;
  const raw = name => readJson(path.join(runDir, 'raw', name));
  const plan = raw('plan.json');
  if (!plan) throw new Error(`${runDir}/raw/plan.json is missing: run collect.mjs first`);
  const platform = raw('platform.json') ?? {};
  const script = raw('script.json') ?? { findings: [], checked: [], errors: [] };
  const runtime = raw('runtime.json');
  const pagesById = new Map(plan.pages.map(page => [page.id, page.name]));

  const names = plan.pages.map(page => page.name);
  // A name two pages share is shown with the page id, so the reader can tell them apart.
  const label = page => (names.filter(name => name === page.name).length > 1 ? `${page.name} (${page.id})` : page.name);
  const focus = plan.focus ?? 'all';
  const reasons = [];
  // The page's purpose is the reviewer's; the double-check only keeps or drops its findings.
  const withCheck = (own, checkedReview) => (checkedReview ? { ...own, findings: checkedReview.findings ?? [], notVerified: [...(own.notVerified ?? []), ...(checkedReview.notVerified ?? [])] } : own);
  const reviews = [];
  // A plan written before speed reviews existed has no appPass, and always ran the app pass.
  for (const page of [...plan.review, ...(plan.appPass === false ? [] : [{ id: 'app', name: 'App' }])]) {
    const own = raw(`pages/${page.id}.json`);
    const checkedReview = raw(`verify/${page.id}.json`);
    if (!own) { reasons.push(`${label(page)} was not reviewed: the reviewer wrote no findings`); continue; }
    const review = withCheck(own, checkedReview);
    reviews.push({ page, review, doubleChecked: Boolean(checkedReview) });
    if (review.intent?.confidence === 'low') reasons.push(`${label(page)}: the reviewer could not tell what the page is for`);
  }
  const perfReviews = [];
  for (const page of plan.perf ?? []) {
    const own = raw(`perf/${page.id}.json`);
    const checkedReview = raw(`perf-verify/${page.id}.json`);
    if (!own) { reasons.push(`${label(page)} was not reviewed for speed: the perf reviewer wrote no findings`); continue; }
    perfReviews.push({ page, review: withCheck(own, checkedReview), doubleChecked: Boolean(checkedReview) });
  }
  if (perfReviews.length && !platform.workflowIssues && runtime?.automations?.length) reasons.push("the failing checks of the automations the pages call could not be read (get_workflow_best_practice_report)");
  if (!platform.issues) reasons.push("the platform's failed page checks could not be read (get_best_practice_report)");
  const unread = (script.skipped ?? []).filter(entry => pagesById.has(entry.pageId));
  for (const entry of unread) reasons.push(`${pagesById.get(entry.pageId)} could not be read from the cache (${entry.reason})`);

  const checked = new Set(script.checked ?? []);
  // The platform's checks on an app are the page checks (CHECK_nn), never the workflow or agent ones.
  const platformRead = check => (check?.startsWith('CHECK_') && platform.issues) || (check === 'get_page_warnings' && platform.warnings)
    || (check === 'get_page_paths' && platform.pathProblems) || (check === 'get_dependency_graph' && platform.danglingRefs)
    || (check?.startsWith('WF_CHECK_') && platform.workflowIssues);
  for (const rule of rules.values()) if (rule.how === 'platform' && platformRead(rule.check)) checked.add(rule.id);
  // A reviewer that could not tell a page's purpose skips the intent rules, so they count only when one could.
  const intentRead = reviews.some(({ page, review }) => page.id !== 'app' && review.intent?.confidence && review.intent.confidence !== 'low');
  if (reviews.length) for (const id of plan.reviewerRules ?? []) if (intentRead || rules.get(id)?.area !== 'INTENT') checked.add(id);
  if (perfReviews.length) for (const id of plan.perfRules ?? []) checked.add(id);

  const merged = dedupe([
    ...platformFindings(platform, rules, pagesById),
    ...automationFindings(platform, rules),
    ...scriptFindings(script, rules),
    ...reviews.flatMap(({ review, doubleChecked }) => reviewerFindings(review, rules).map(item => ({ ...item, doubleChecked }))),
    ...perfReviews.flatMap(({ review, doubleChecked }) => reviewerFindings(review, rules).map(item => ({ ...item, lens: 'perf', doubleChecked }))),
  ]);
  // A speed review reports what bears on speed only: the speed rules, the perf reviewers' own
  // findings, and the automation checks the platform files under performance.
  const speed = item => item.lens === 'perf' || inPerfLens(rules.get(item.rule)) || item.category === 'performance';
  const labelled = merged.filter(item => focus !== 'perf' || speed(item))
    .map(item => (item.page ? { ...item, page: { ...item.page, label: label(item.page) } } : item));
  const findings = rank(groupRepeats(markNew(labelled, previous))).map((item, index) => ({ ...item, ref: `F${index + 1}` }));
  const outcome = verdict(findings, reasons);
  const counts = Object.fromEntries(['P0', 'P1', 'P2', 'P3'].map(sev => [sev, findings.filter(item => item.severity === sev).length]));
  const places = findings.reduce((total, item) => total + (item.places?.length ?? 1), 0);
  const reviewOf = (list, page) => list.find(entry => entry.page.id === page.id)?.review ?? null;
  // A speed review scores the speed rules only, so an area outside them is not "Not checked".
  const scored = focus === 'perf' ? new Map([...rules].filter(([, rule]) => inPerfLens(rule))) : rules;
  return {
    app: plan.app,
    run: path.basename(runDir),
    focus,
    scope: plan.scope,
    scopeNote: plan.scopeNote,
    verdict: outcome,
    reasons,
    counts,
    places,
    scores: { average: average((platform.pageScores ?? []).map(entry => entry.score)), pages: platform.pageScores ?? [] },
    pages: plan.pages.map(page => ({
      ...page, label: label(page), score: (platform.pageScores ?? []).find(entry => entry.pageId === page.id)?.score ?? null,
      reviewed: Boolean(reviewOf(reviews, page) || reviewOf(perfReviews, page)),
      intent: reviewOf(reviews, page)?.intent ?? reviewOf(perfReviews, page)?.intent ?? null,
      load: typeof reviewOf(perfReviews, page)?.load === 'string' ? reviewOf(perfReviews, page).load : null,
    })),
    later: plan.later,
    runtime: runtimeSummary(runtime),
    scorecard: scorecard({ rules: scored, areas, appType: plan.app.type, findings, checked }),
    findings,
    // A page's double-check repeats most of what its reviewer could not read.
    notVerified: uniqueBy([...(plan.notVerified ?? []), ...(script.errors ?? []).map(error => ({ call: `rule ${error.rule}${error.page ? ` on ${error.page}` : ''}`, error: error.message })), ...[...reviews, ...perfReviews].flatMap(({ review }) => (review.notVerified ?? []).map(gapEntry))], entry => JSON.stringify(entry)),
    firstRun: !previous,
  };
}

function main() {
  const args = process.argv.slice(2);
  const runIndex = args.indexOf('--run');
  if (runIndex < 0) throw new Error('--run <folder> is required');
  const runDir = path.resolve(args[runIndex + 1]);
  const report = buildReport(runDir);
  fs.writeFileSync(path.join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(runDir, 'report.md'), renderReport(report));
  fs.writeFileSync(path.join(runDir, 'report.html'), renderPage(report, { names: readJson(path.join(runDir, 'raw', 'names.json')) ?? {} }));
  process.stdout.write(`${JSON.stringify({ verdict: report.verdict, counts: report.counts, report: path.join(runDir, 'report.md'), page: path.join(runDir, 'report.html') })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
}
