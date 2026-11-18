#!/usr/bin/env node
// collect.mjs gathers what a config review judges, into one run folder, and changes no app.
//   node collect.mjs --app-id <id> --run <folder> [--scope all|changed|pages] [--pages <id,…>] [--focus all|perf] [--max-review <n>]
// Run from the solution folder after `solution refresh --json`. It writes, under <run>/raw/:
//   platform.json  the platform's own verdicts on the pages in scope: page scores, failed page
//                  checks, page warnings, route problems and dangling references. Page scores and
//                  page and app checks come from get_best_practice_report, which refreshes the
//                  platform's cached page report, as the builder's score panel does. The failing
//                  checks of every automation the perf pages call come from
//                  get_workflow_best_practice_report.
//   script.json    rule-check over the cached config
//   reviewer-rules.md  the rules the page reviewer judges for this app type, speed rules left out
//   perf-rules.md  the speed rules the perf reviewer judges
//   runtime.json   what the config cannot show: each object's record count and each automation's
//                  last runs, for the objects and automations the perf pages reach
//   names.json     the builder name of every block, variable, function, data source and page id
//   plan.json      the pages in scope, which pages each reviewer takes, and what could not be read
// `--focus perf` runs the speed review alone, on every page in scope. A call that fails is listed
// under notVerified and the rest still run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openTools, forEachItem } from '../../../scripts/tool-calls.mjs';
import { homeForCwd } from '../../../scripts/workspace/session-registry.mjs';
import { readApp } from '../../app-best-practices/scripts/config-read.mjs';
import { blockTarget, dataSourceTarget } from '../../app-best-practices/scripts/checks/shared.mjs';
import { appliesTo, checkApp, loadRulebook } from '../../app-best-practices/scripts/rule-check.mjs';
import { inPerfLens, pageCalls, perfRules, perfRulesText, recordTotal, summarizeRuns, workflowIssues } from './perf.mjs';

export const MAX_REVIEW = 10;

/** Builder names for the stored ids a finding quotes (b_x, var_x, func_x, e_…), so the report page can show what the builder shows. */
export function configNames(app) {
  const names = {};
  const put = ({ id, name }) => { if (id && typeof name === 'string' && name.trim() && name !== id && !names[id]) names[id] = name.trim(); };
  for (const page of app.pages) {
    put(page);
    for (const id of Object.keys(page.blocks)) put(blockTarget(page, id));
    for (const [id, variable] of Object.entries(page.variables)) put({ id, name: variable?.name });
    for (const [id, fn] of Object.entries(page.functions)) put({ id, name: fn?.name });
    for (const source of [...page.dataSources, ...page.appDataSources]) put(dataSourceTarget(source));
  }
  return names;
}

/** The pages a review covers: every page that is not the global one, the picked ones, or the changed ones. */
export function resolveScope(components, { scope = 'all', pages = [], changed = null }) {
  const reviewable = components.filter(component => !component.global);
  if (scope === 'pages') {
    const unknown = pages.filter(id => !components.some(component => component.id === id));
    if (unknown.length) throw new Error(`not pages of this app: ${unknown.join(', ')}`);
    return { pages: reviewable.filter(component => pages.includes(component.id)), note: null };
  }
  if (scope === 'changed') {
    if (!changed) return { pages: reviewable, note: 'The published version could not be compared (never published, or the compare failed), so every page is in scope.' };
    const pages = reviewable.filter(component => changed.has(component.id));
    return { pages, note: pages.length ? null : 'No page changed since the last publish, so only the app pass runs.' };
  }
  return { pages: reviewable, note: null };
}

/**
 * Pages a version compare names as added or modified, given `pages` as `[{ id, dataSources }]`:
 * a changed data source counts for each page that holds it.
 */
export function changedPageIds(compare, pages) {
  const changed = new Set((compare?.differences ?? []).filter(item => item.kind !== 'removed').map(item => item.entityId));
  return new Set(pages.filter(page => changed.has(page.id) || page.dataSources.some(source => changed.has(source?.id))).map(page => page.id));
}

const chunksOf = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (unused, index) => list.slice(index * size, index * size + size));

/**
 * Page scores, failed checks and the calls that failed, from get_best_practice_report, ten pages a call. A failed row is filed under the page it was read for, or under the
 * app for the app's own checks, which every call repeats. Pages outside `inScope` are left out.
 * issues is null when no call came back.
 */
export function fromBestPracticeReports(chunkResults, appId, inScope) {
  const read = chunkResults.filter(result => result.ok);
  const failed = rows => (rows ?? []).filter(row => row.status === 'failed' && !row.ignored);
  const pages = read.flatMap(result => result.value.pages ?? []).filter(page => inScope.has(page.pageId));
  return {
    pageScores: pages.map(({ pageId, score, categories, passedChecks, totalChecks }) => ({ pageId, score, categories, passedChecks, totalChecks })),
    issues: read.length ? [
      ...failed(read[0].value.app?.failing).map(row => ({ ...row, entityId: appId })),
      ...pages.flatMap(page => failed(page.failing).map(row => ({ ...row, entityId: page.pageId }))),
    ] : null,
    unread: chunkResults.filter(result => !result.ok).map(result => ({ call: `the platform checks for ${result.item.join(', ')}`, error: result.error })),
  };
}

/** Lowest page score first, unscored last; the first `max` are reviewed now, the rest offered after. */
export function reviewOrder(pages, pageScores = [], max = MAX_REVIEW) {
  const scoreOf = new Map(pageScores.map(entry => [entry.pageId, entry.score]));
  const ordered = pages
    .map(page => ({ id: page.id, name: page.name, score: scoreOf.get(page.id) ?? null }))
    .sort((left, right) => (left.score ?? Infinity) - (right.score ?? Infinity));
  return { review: ordered.slice(0, max), later: ordered.slice(max) };
}

/**
 * Which pages each reviewer takes. A full review gives each page it reviews now a page reviewer
 * and a perf reviewer, plus the app pass. A speed review has a perf reviewer on every page in
 * scope and nothing else: its rule list is a sixth of the page reviewer's, so no page waits.
 */
export function reviewPlan(pages, pageScores, { focus = 'all', max = MAX_REVIEW } = {}) {
  if (focus === 'perf') {
    const { review } = reviewOrder(pages, pageScores, Infinity);
    return { review: [], appPass: false, perf: review, later: [] };
  }
  const { review, later } = reviewOrder(pages, pageScores, max);
  return { review, appPass: true, perf: review, later };
}

/** What the reviewer judges: every reviewer rule, plus the P0 script rules no script runs yet. */
export function reviewerRules(rules, appType) {
  const scripted = rule => rule.automated || (rule.pageAudit && appType === 'MOBILE');
  return [...rules.values()].filter(rule => appliesTo(rule, appType)
    && (rule.how === 'reviewer' || (rule.how === 'script' && !scripted(rule) && rule.sev === 'P0')));
}

export function reviewerRulesText(rules, areas) {
  const lines = ['# Rules to judge', '', 'Each finding names one of these keys, or none for a real defect no rule names.', ''];
  for (const area of areas) {
    const own = rules.filter(rule => rule.area === area.code);
    if (!own.length) continue;
    lines.push(`## ${area.name}`, '', ...own.map(rule => `- \`${rule.id}\` ${rule.sev}${rule.how === 'script' ? ', script' : ''}. ${rule.rule}.`), '');
  }
  return `${lines.join('\n')}`;
}

/**
 * What the config cannot show about the pages' speed: how many records each object they read
 * holds (get_records' total), how the last runs of each automation they call went
 * (list_workflow_runs), and the automations' own failing checks (get_workflow_best_practice_report).
 * A read that fails leaves its fact null and is listed under notVerified.
 */
export async function runtimeFacts(calls, { host, objectTools, automationTools, notVerified }) {
  const count = entry => objectTools.call('get_records', { host, objectId: entry.id, limit: 1 });
  // Counting an object of millions of records can fail once and answer the next time.
  const firstCounts = await forEachItem(calls.objects, count);
  const recounted = await forEachItem(firstCounts.filter(result => !result.ok).map(result => result.item), count);
  const counts = [...firstCounts.filter(result => result.ok), ...recounted];
  const runs = await forEachItem(calls.automations, entry => automationTools.call('list_workflow_runs', { runType: 'workflow', workflowId: entry.id }));
  const report = ids => automationTools.call('get_workflow_best_practice_report', { workflowIds: ids });
  const batches = await forEachItem(chunksOf(calls.automations.map(entry => entry.id), 10), report);
  // One automation the platform cannot score fails its whole batch, so a failed batch is asked again one by one.
  const retried = await forEachItem(batches.filter(result => !result.ok).flatMap(result => result.item.map(id => [id])), report);
  const reports = [...batches.filter(result => result.ok), ...retried];
  for (const result of counts) if (!result.ok) notVerified.push({ call: `the record count of ${result.item.id}`, error: result.error });
  for (const result of runs) if (!result.ok) notVerified.push({ call: `the last runs of automation ${result.item.id}`, error: result.error });
  for (const result of retried) if (!result.ok) notVerified.push({ call: `the platform checks of automation ${result.item[0]}`, error: result.error });
  const nameOf = new Map(reports.filter(result => result.ok).flatMap(result => result.value.workflows ?? []).map(workflow => [workflow.workflowId, workflow.workflowName]));
  return {
    runtime: {
      objects: counts.map(result => ({ ...result.item, records: result.ok ? recordTotal(result.value) : null })),
      automations: runs.map(result => ({ ...result.item, name: nameOf.get(result.item.id) ?? null, ...(result.ok ? summarizeRuns(result.value) : { runs: null }) })),
    },
    // null when no report came back, or no page calls an automation: those checks count as not read.
    workflowIssues: reports.some(result => result.ok) ? workflowIssues(reports, calls.automations) : null,
  };
}

function parseArgs(argv) {
  const args = { appId: null, run: null, scope: 'all', pages: [], focus: 'all', maxReview: MAX_REVIEW };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[(index += 1)];
    if (arg === '--app-id') args.appId = next();
    else if (arg === '--run') args.run = next();
    else if (arg === '--scope') args.scope = next();
    else if (arg === '--pages') args.pages = next().split(',').map(id => id.trim()).filter(Boolean);
    else if (arg === '--focus') args.focus = next();
    else if (arg === '--max-review') {
      args.maxReview = Number(next());
      if (!Number.isInteger(args.maxReview) || args.maxReview < 1) throw new Error('--max-review takes a whole number of pages, 1 or more');
    }
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!args.appId || !args.run) throw new Error('--app-id <id> and --run <folder> are required');
  if (!['all', 'changed', 'pages'].includes(args.scope)) throw new Error('--scope is all, changed or pages');
  if (!['all', 'perf'].includes(args.focus)) throw new Error('--focus is all or perf');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspace = homeForCwd(process.cwd());
  if (!workspace) throw new Error('No UnifyApps Headless solution folder here; run from the solution folder.');
  const host = workspace.tenant;
  const raw = path.join(path.resolve(args.run), 'raw');
  fs.mkdirSync(raw, { recursive: true });
  const notVerified = [];
  const builder = openTools('application-builder');
  const objectTools = openTools('object');
  const automationTools = openTools('automation-code');
  const attempt = async (call, run) => {
    try { return await run(); } catch (error) { notVerified.push({ call, error: String(error?.message ?? error).slice(0, 400) }); return null; }
  };

  try {
    const overview = await builder.call('get_app_overview', { host, interfaceId: args.appId });
    const components = (overview.components ?? []).map(component => ({ id: component.id, name: component.name, kind: component.kind, global: component.global === true, blockCount: component.blockCount }));
    const app = readApp(workspace.home, args.appId);
    fs.writeFileSync(path.join(raw, 'names.json'), `${JSON.stringify(configNames(app), null, 2)}\n`);
    const compare = args.scope === 'changed'
      ? await attempt('the published version, to find changed pages', () => builder.call('compare_interface_versions', { host, interfaceId: args.appId, base: { kind: 'published' }, compare: { kind: 'current' } }))
      : null;
    const scope = resolveScope(components, { scope: args.scope, pages: args.pages, changed: compare ? changedPageIds(compare, app.pages) : null });
    const pageIds = scope.pages.map(page => page.id);
    const inScope = new Set(pageIds);
    // An issue or finding on another page of the app belongs to that page's review, not this one.
    const isOtherPage = id => components.some(component => component.id === id) && !inScope.has(id);

    // The tool reads the app's own checks only beside a page, so a run with no page in scope asks with one.
    const asked = pageIds.length ? pageIds : components.filter(component => !component.global).slice(0, 1).map(component => component.id);
    const reports = await forEachItem(chunksOf(asked, 10), chunk => builder.call('get_best_practice_report', { host, interfaceId: args.appId, pageIds: chunk }));
    const { pageScores, issues, unread } = fromBestPracticeReports(reports, args.appId, inScope);
    notVerified.push(...unread);
    const warnings = await forEachItem(chunksOf(pageIds, 5), chunk => builder.call('get_page_warnings', { host, interfaceId: args.appId, pageIds: chunk }));
    const paths = await attempt('the page addresses', () => builder.call('get_page_paths', { host, interfaceId: args.appId }));
    const graphs = await forEachItem(pageIds, pageId => builder.call('get_dependency_graph', { host, interfaceId: args.appId, pageId }));
    for (const result of graphs) if (!result.ok) notVerified.push({ call: `the dependency graph of ${result.item}`, error: result.error });
    for (const result of warnings) if (!result.ok) notVerified.push({ call: `the page warnings for ${result.item.join(', ')}`, error: result.error });
    // null when no call came back, so the report counts those rules as not checked.
    const read = results => (results.some(result => result.ok) ? results.filter(result => result.ok) : null);

    const plan = reviewPlan(scope.pages, pageScores, { focus: args.focus, max: args.maxReview });
    const calls = pageCalls(app, plan.perf.map(page => page.id));
    const { runtime, workflowIssues: automationIssues } = await runtimeFacts(calls, { host, objectTools, automationTools, notVerified });
    fs.writeFileSync(path.join(raw, 'runtime.json'), `${JSON.stringify(runtime, null, 2)}\n`);

    const platform = {
      app: { id: args.appId, name: overview.name, type: overview.appType, access: overview.access },
      pageScores,
      issues,
      warnings: read(warnings)?.flatMap(result => result.value.pages ?? []).map(entry => ({ pageId: entry.pageId, name: entry.name, warnings: entry.warnings })) ?? null,
      pathProblems: paths ? (paths.problems ?? []).filter(problem => !isOtherPage(/'(e_[\w-]+)'/u.exec(problem.detail ?? '')?.[1])) : null,
      danglingRefs: read(graphs)?.map(result => ({ pageId: result.item, danglingRefs: result.value.danglingRefs ?? [] })) ?? null,
      workflowIssues: automationIssues,
    };
    fs.writeFileSync(path.join(raw, 'platform.json'), `${JSON.stringify(platform, null, 2)}\n`);

    const { rules, areas } = loadRulebook();
    const checked = await checkApp(app, { rules, pageIds });
    const script = { ...checked, findings: checked.findings.filter(item => !isOtherPage(item.page?.id)), skipped: app.skipped };
    fs.writeFileSync(path.join(raw, 'script.json'), `${JSON.stringify(script, null, 2)}\n`);

    // The speed rules go to the perf reviewer, so the page reviewer's list is shorter by them.
    const judged = plan.review.length ? reviewerRules(rules, app.type).filter(rule => !inPerfLens(rule)) : [];
    if (judged.length) fs.writeFileSync(path.join(raw, 'reviewer-rules.md'), reviewerRulesText(judged, areas));
    const speed = perfRules(rules, app.type);
    fs.writeFileSync(path.join(raw, 'perf-rules.md'), perfRulesText(speed, areas));

    fs.writeFileSync(path.join(raw, 'plan.json'), `${JSON.stringify({
      app: { id: args.appId, name: overview.name, type: app.type },
      focus: args.focus, scope: args.scope, scopeNote: scope.note, pages: scope.pages,
      ...plan,
      reviewerRules: judged.map(rule => rule.id),
      perfRules: speed.map(rule => rule.id),
      notVerified,
    }, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({
      run: path.resolve(args.run), focus: args.focus, pages: pageIds.length, review: plan.review.map(page => page.name),
      perf: plan.perf.map(page => page.name), later: plan.later.length,
      platformIssues: platform.issues?.length ?? null, automationIssues: platform.workflowIssues?.length ?? null,
      objects: runtime.objects.length, automations: runtime.automations.length,
      scriptFindings: script.findings.length, notVerified: notVerified.length,
    }, null, 2)}\n`);
  } finally {
    await Promise.all([builder.close(), objectTools.close(), automationTools.close()]);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 2; });
}
