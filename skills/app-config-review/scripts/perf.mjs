// The performance lens of a config review: which rules bear on speed, what the perf reviewer
// judges, which objects and automations each page in scope touches, and the read-only facts the
// config cannot show (how many records an object holds, how long an automation's runs take).
import { appliesTo } from '../../app-best-practices/scripts/rule-check.mjs';

/**
 * Rules outside the PERF area that decide how fast a page opens or answers: what runs on load,
 * how much each source fetches, what an interaction refetches, how the automations behind a page
 * spend their time, and what the person sees while they wait. Every PERF rule is in the lens too.
 */
export const PERF_LENS = Object.freeze([
  // What runs, how often and how much it fetches.
  'disable-run-page-load-automatic',
  'run-periodic-queries-more-often',
  'debounce-delay-onchange-data-source',
  'trigger-one-network-refresh-interaction',
  'list-fetches-set-paginateby-limit',
  'refetchonwindowfocus-off-mutations-reference-data',
  'merge-data-sources-fetching-same',
  'limit-matches-what-ui-shows',
  'mqtt-instead-polling-where-topic',
  'includetotalcount-paginator-shows-total',
  'fetch-unchanging-data-once-tap',
  'selection-driven-refetch-never-re',
  'runqueryonpageload-page-needs-data-before',
  'independent-sources-run-parallel-chained',
  'run-filter-search-sort-counts',
  'list-sources-limit-offset-exactly',
  'trigger-run-load-source-again',
  'after-write-refresh-sources-changed',
  'filter-rows-data-source-never',
  'fetch-value-page-needs-once',
  'dont-both-run-source-page',
  'dont-refetch-source-onpagefocus-already',
  'refresh-timer-triggers-regions-source',
  'feed-dashboard-tile-chart-one',
  'filter-long-lists-server-triggerinputcondition',
  'bind-infinite-repeatables-source-limit',
  'dont-rely-executiontype-debounce-throttle',
  'index-field-list-filters-sorts',
  // How much the page mounts.
  'tables-have-pagination-enabled',
  'dynamic-pagination-total-repeatables',
  'pagination-state-wired-data-source',
  'enable-pagination-repeatables',
  'paginate-nested-table-once-passes',
  'tally-block-types-first-flag',
  'embedded-module-id-resolves-live',
  'go-back-replace-instead-pushing',
  // What the person sees while they wait.
  'content-skeleton-loader-arc-spinner',
  'size-skeleton-real-blocks-box',
  'flip-small-toggle-favourite-writes',
  // The automations a page waits on.
  'keep-endpoint-fronted-automation-shorter',
  'count-database-external-calls-run',
  'fetch-matching-records-once-run',
  'fetch-distinct-values-instead-fetching',
  'replace-two-loops-over-one',
  'move-fetch-depend-iteration-out',
  'run-independent-checks-parallel-branches',
  'loop-over-list-rather-until',
  'pages-5-000-50-000',
  'download-file-once-before-loop',
  'replace-ai-step-doing-predictable',
  'keyset-paging-big-jobs-whose',
  'pass-ids-references-between-steps',
  'process-write-batch-you-go',
]);

const LENS = new Set(PERF_LENS);

/** True when a rule bears on speed: every PERF rule, and the lens rules of other areas. */
export const inPerfLens = rule => Boolean(rule) && (rule.area === 'PERF' || LENS.has(rule.id));

// A rule a script already runs, as collect.mjs's reviewerRules decides it.
const scripted = (rule, appType) => rule.automated || (rule.pageAudit && appType === 'MOBILE');

/**
 * What the perf reviewer judges: every lens rule for the app type that no tool checks in this
 * review. The platform's checks and the automated scripts already ran; a script rule no script
 * runs yet is judged here at every severity, so no speed rule is left with nobody to check it.
 */
export function perfRules(rules, appType) {
  return [...rules.values()].filter(rule => inPerfLens(rule) && appliesTo(rule, appType)
    && (rule.how === 'reviewer' || (rule.how === 'script' && !scripted(rule, appType))));
}

export function perfRulesText(rules, areas) {
  const lines = ['# Speed rules to judge', '',
    'Each finding names one of these keys, or none for a real cost no rule names.', ''];
  for (const area of areas) {
    const own = rules.filter(rule => rule.area === area.code);
    if (!own.length) continue;
    lines.push(`## ${area.name}`, '', ...own.map(rule => `- \`${rule.id}\` ${rule.sev}. ${rule.rule}.`), '');
  }
  return lines.join('\n');
}

const asObject = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const STORAGE_READS = new Set(['storage_by_unifyapps_fetch_records', 'storage_by_unifyapps_count_records']);
const CALL_AUTOMATION = new Set(['callables_call_automation', 'callables_call_automation_batch']);

/**
 * The storage objects the pages in scope read and the automations they call, each with the
 * pages and sources that reach it. An app-scoped source counts for every page in scope that holds it.
 */
export function pageCalls(app, pageIds) {
  const inScope = new Set(pageIds);
  const objects = new Map();
  const automations = new Map();
  const note = (map, id, page, source) => {
    if (!map.has(id)) map.set(id, { id, pages: [], sources: [] });
    const entry = map.get(id);
    if (!entry.pages.some(item => item.id === page.id)) entry.pages.push({ id: page.id, name: page.name });
    const name = asObject(source.properties).name ?? source.id;
    if (!entry.sources.some(item => item.id === source.id)) entry.sources.push({ id: source.id, name });
  };
  for (const page of app.pages.filter(item => inScope.has(item.id))) {
    for (const source of [...page.dataSources, ...page.appDataSources]) {
      const properties = asObject(source?.properties);
      const resource = asObject(properties.context).resourceName;
      const inputs = asObject(properties.inputs);
      if (STORAGE_READS.has(resource) && typeof inputs.object_type === 'string' && inputs.object_type) note(objects, inputs.object_type, page, source);
      if (CALL_AUTOMATION.has(resource) && typeof inputs.automationId === 'string' && inputs.automationId) note(automations, inputs.automationId, page, source);
    }
  }
  return { objects: [...objects.values()], automations: [...automations.values()] };
}

const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

/**
 * How an automation's last runs went, from list_workflow_runs: its rows carry STATUS, START_TIME,
 * END_TIME, EXECUTION_TIME (ms) and ID. A row with no time of its own is left out of the times.
 */
export function summarizeRuns(rows) {
  const list = Array.isArray(rows) ? rows : Array.isArray(rows?.runs) ? rows.runs : [];
  const timed = list.map(row => {
    const own = Number(row?.EXECUTION_TIME);
    const span = Number(row?.END_TIME) - Number(row?.START_TIME);
    return { id: row?.ID ?? null, ms: Number.isFinite(own) && own >= 0 ? own : Number.isFinite(span) && span >= 0 ? span : null, status: row?.STATUS ?? null };
  });
  const times = timed.map(run => run.ms).filter(ms => ms !== null);
  const slowest = timed.filter(run => run.ms !== null).sort((left, right) => right.ms - left.ms)[0] ?? null;
  return {
    runs: list.length,
    failed: timed.filter(run => run.status && !/^(COMPLETED|SUCCESS)/iu.test(run.status)).length,
    medianMs: median(times),
    maxMs: slowest?.ms ?? null,
    slowestRunId: slowest?.id ?? null,
  };
}

/** One object's record count, from get_records' `total`; null when the reply holds none. */
export function recordTotal(reply) {
  const total = Number(reply?.total);
  return Number.isFinite(total) && total >= 0 ? total : null;
}

/**
 * The platform's failing automation checks, from get_workflow_best_practice_report, as rows the
 * report maps like the page checks: each filed under its automation, with the pages that call it.
 * The report numbers an automation check `CHECK_<n>`, as it numbers a page check; the rulebook
 * keeps the automation ones as `WF_CHECK_<n>`, so the id is rewritten to match.
 */
export function workflowIssues(reports, automations) {
  const callers = new Map(automations.map(entry => [entry.id, entry.pages]));
  const ruleCheck = id => (typeof id === 'string' && id.startsWith('CHECK_') ? `WF_${id}` : id);
  return reports.filter(result => result.ok).flatMap(result => (result.value.workflows ?? []).flatMap(workflow => (workflow.failing ?? [])
    .filter(row => row.status !== 'passed' && !row.ignored)
    .map(row => ({ ...row, checkId: ruleCheck(row.checkId), automationId: workflow.workflowId, automationName: workflow.workflowName ?? workflow.workflowId, pages: callers.get(workflow.workflowId) ?? [] }))));
}
