#!/usr/bin/env node
/**
 * The deterministic half of the Test Studio loops (analyse-run, heal-run, author-run,
 * survey-run): classifies a run's failed case executions, groups them by cause, tags a
 * case against its history, keeps the loop ledger, writes the per-group report, and for
 * the survey run enumerates an app's journeys and proves a scenario list covers them. No
 * LLM, no network: every input is the JSON a platform tool already answered, or a file the
 * loop wrote.
 *
 *   node loop.mjs classify --in <evidence.json> [--out <file>]
 *       <evidence.json>: the result of fetch_run_executions or fetch_execution_failure_reasons
 *       ({ objects: [...] }) saved verbatim, or a plain array of rows. Rows that passed or have not
 *       settled are left out. Prints { reds, groups, sharedCause, residue, notRed, previewHosts };
 *       under a shared cause, read from the reds on the deployed app, each of those is environment.
 *   node loop.mjs history --in <executions.json> [--error-key <the red's summaryKey>] [--domain <the red's domain>]
 *       <executions.json>: the result of fetch_test_case_executions, newest first.
 *   node loop.mjs annotate --in <classified.json> --tags <tags.json> [--out <file>]
 *       <tags.json>: { "<executionId>": { historyTag?, verdict?, route?, evidence?, rerun? } }
 *       merged onto the matching reds; a red is `decided` once it carries a verdict.
 *   node loop.mjs ledger upsert --file <ledger.json> --row <json | @file>
 *   node loop.mjs ledger list --file <ledger.json> [--run <id>] [--case <id>] [--firing <id>]
 *   node loop.mjs ledger history --file <ledger.json> --case <id>
 *   node loop.mjs report --in <classified.json> --out <report.md> [--run <id>] [--firing <id>] [--mode platform|fallback]
 *                        [--ledger <loop-ledger.json>] [--stuck <stuck.json>] [--app-url <url>]
 *       the report: Still failing by cause (`<Family> — <cause in plain words>`, largest group first,
 *       each with its next step; --ledger brings the firing's heal and ticket rows in), then by outcome:
 *       Healed (from the firing's heal-loop ledger rows), App bugs (expected against observed), Test
 *       defects by kind, Runner issues (the stuck executions included), Environment, Flaky, AI
 *       dependency, Needs a person; every section present, `none` when empty
 *   node loop.mjs firing-id     prints a new firing id
 *   node loop.mjs test-user-check --pool <interfaceId> --context <user-context.json> --listed <list_test_users.json> [--expected <user id>]
 *       whether a browser is signed in as a test user of the pool: the user-context read's id must be
 *       in the list_test_users reply for that pool (and be --expected when given). Exits 1 with
 *       NOT_A_TEST_USER otherwise, including when the reply cannot prove it (another pool, a cut list).
 *   node loop.mjs pause --seconds <1-540>                       a foreground wait (never `sleep`)
 *   node loop.mjs newest --in <failed-executions.json>          the newest execution per case, one on
 *       the deployed app before a newer one on a branch preview
 *   node loop.mjs intake --in <classified.json> | --ledger <ledger.json> --firing <id> [--max-cases <n>] [--retry]
 *       which reds the heal run takes on, each with its job (heal | diagnose), and the skipped rows
 *       for the rest (a branch preview, infra, auth, a shared cause); past --max-cases the rest are
 *       skipped "run budget". --retry reads a heal firing's own rows: its environment and budget
 *       skips go on again, never a row on a branch preview, its
 *       flow-change proposals and failed updates go on as update jobs
 *   node loop.mjs heal-report --ledger <ledger.json> --firing <id> --out <heal-report.md> [--app <name>] [--shared <shared.json>]
 *       the heal firing's report: counts, Still failing by cause (`<Family> — <cause in plain words>`,
 *       largest group first, each with its next step), Healed, Updated, Flaky, Skipped, Needs choice,
 *       Rolled back, Proposed, Hook requests, Product checks, and the elements other cases share
 *   node loop.mjs causes --ledger <ledger.json> --firing <id> [--in <causes.json>] [--out <file>]
 *       without --in: the heal firing's rows whose root cause names a defect (app bug, backend, ui
 *       changed, feature missing, contradicts description), each with its finding and the cause it
 *       carries, for the session to name; with --in ({ "<executionId>": "<cause in plain words>" }):
 *       writes `cause` onto those rows, exit 1 with the problems when a cause is code, a case or
 *       ticket name, a step, an error or a family word instead of the defect
 *   node loop.mjs heal-tags --ledger <ledger.json> --firing <id> [--out <tags.json>]
 *       the firing's diagnoses (verdict, route, evidence, root cause, cause) as annotate tags for the
 *       analyse firing's classified.json
 *   node loop.mjs rung --dialect code|builder|platform --old '<locator>' --new '<locator>' [--scenario-named] [--old-rung-gone]
 *       { verdict: ok | lower | banned, oldRung, newRung, reason }
 *   node loop.mjs check-patch --in <patch.json>                 exit 1 with the problems
 *   node loop.mjs check-heal --ledger <ledger.json> --firing <id> [--patches <dir, one <key>.json each>]
 *   node loop.mjs tick --in <run.json> [--now <ISO>] [--load <1-min load> --cores <n>] [--failed-5xx <in a row>]
 *       the author run's watch: pastDeadline, cap, capChange, backoffMinutes, dispatch, budget, done;
 *       with run.runBudget {cases, minutes} reached, dispatch is empty and budget.park names the queued cases
 *   node loop.mjs journeys --in <journeys.json> [--max-edges 8] [--out <file>]
 *       every maximal journey of the survey run's graph: { journeys: [{ id, edges, nodes }], problems }
 *   node loop.mjs survey-check --journeys <journeys.json> --scenarios <scenarios.json> [--max-edges 8]
 *       the coverage layers (surfaces, transitions, behaviours, variants, journeys): exit 1 unless complete
 *   node loop.mjs survey-render --journeys <journeys.json> --scenarios <scenarios.json> --out <scenarios.md> [--header <line>] [--app <name>]
 *       the scenario list in app-test-author's shape (module, feature, scenario), its Coverage table
 *       computed, never typed; --app is the module of a scenario that names none;
 *       a graph with `requirements` (a PRD) adds the Requirements layer to both commands
 *   node loop.mjs survey-summary --journeys <journeys.json> --scenarios <scenarios.json> [--app <name>] [--max-edges 8] [--out <file>]
 *       the coverage summary the last message carries: each layer's share with a scenario, behaviours
 *       as the headline, then the not-covered items by fixed reason with counts and the rows' detail
 *   node loop.mjs survey-sheet --journeys <journeys.json> --scenarios <scenarios.json> --out <scenarios.xlsx> [--app-url <url>] [--app <app name>]
 *       the review sheet: a workbook (and the same rows as <scenarios>.csv) with one row per scenario,
 *       module by module and most important first within each, the description as bulleted steps, a
 *       bold frozen header and a Decision dropdown (Approved, Rejected, Changes required); prints the
 *       workbook as base64 for the Drive upload
 *   node loop.mjs survey-sheet-read --in <the sheet exported as CSV> [--out <decisions.json>]
 *       the reviewers' decisions: approved, rejected, changes (with the comment), pending, per scenario key
 *   node loop.mjs tickets-check --tickets <tickets.json> --in <classified.json>
 *       the ticket loop: every App bug in exactly one ticket or a not-ticketed row; exit 1 otherwise
 *   node loop.mjs tickets-list --tickets <tickets.json> --in <classified.json> --out <tickets-proposed.md> [--tracker-host <host>]
 *   node loop.mjs tickets-rows --tickets <tickets.json> --in <classified.json> --out <folder> [--firing <id>] [--run <id>]
 *       one ledger row per ticket, <folder>/ticket-<fingerprint>.json, with each case's failure facts
 *   node loop.mjs verify --ticket <ticket row json> --in <executions.json> [--comment-out <file>] [--run <id>] [--firing <id>] [--app-url <url>]
 *       the sign-off loop: fixed | rejected (same failure) | changed (a different failure) | incomplete, per case
 *   node loop.mjs tickets-render --tickets <tickets.json> --in <classified.json> --out <folder> [--run <id>] [--firing <id>]
 *                                [--app-url <url>] [--report <path>]
 *       one description per ticket, <folder>/<fingerprint>.md, from the tickets file alone
 *   node loop.mjs status --in <classified.json> --ledger <ledger.json> --firing <id> --out <status.md> [--app <name>] [--run <id>]
 *                        [--heal-firing <id>] [--tickets-firing <id>] [--tracker-host <host>]
 *       the firing's status document: every red's standing with its next step, the tickets with
 *       their links, and the reds by cause in plain words, largest group first
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildXlsx } from './sheet-xlsx.mjs';

export const CLASSES = Object.freeze({
  locator: 'locator',
  wrongElement: 'wrong_element',
  assertion: 'assertion',
  stepShape: 'step_shape',
  data: 'data',
  navigation: 'navigation',
  auth: 'auth',
  infra: 'infra',
  unknown: 'unknown',
});

export const ROUTES = Object.freeze({
  [CLASSES.locator]: 'heal',
  [CLASSES.wrongElement]: 'heal',
  [CLASSES.assertion]: 'agent',
  [CLASSES.stepShape]: 'update',
  [CLASSES.data]: 'update',
  [CLASSES.navigation]: 'agent',
  [CLASSES.auth]: 'environment',
  [CLASSES.infra]: 'infra',
  [CLASSES.unknown]: 'agent',
});

// taxonomy.md, Verdicts: the verdict a rule-decided class carries without an agent's read.
export const RULE_VERDICTS = Object.freeze({
  [CLASSES.locator]: 'Test defect (locator)',
  [CLASSES.wrongElement]: 'Test defect (locator)',
  [CLASSES.stepShape]: 'Test defect (step shape)',
  [CLASSES.data]: 'Test defect (data)',
  [CLASSES.auth]: 'Environment',
  [CLASSES.infra]: 'Environment',
});

// Order matters: the first signature that matches decides. Infrastructure and auth come
// before locator because a dead run service also times out "waiting for" things.
const SIGNATURES = [
  [CLASSES.infra, /DEADLINE_EXCEEDED|fail-fast|No platform_automation record|service unavailable|\b50[234]\b|ECONNREFUSED|ECONNRESET|ERR_CONNECTION_(REFUSED|RESET)|connection (refused|reset)|browser has been closed|Target page, context or browser has been closed/iu],
  [CLASSES.auth, /session[- ]mint|\b401\b|\b403\b|unauthori[sz]ed|login wall|sign[- ]in required|session (has )?expired/iu],
  [CLASSES.navigation, /page\.goto|net::ERR_|ERR_NAME_NOT_RESOLVED|navigation (to .* )?timeout|waitForURL|Navigation failed/iu],
  [CLASSES.data, /duplicate|already exists|unique constraint|record .* not found|no such record/iu],
  [CLASSES.stepShape, /detached from the DOM|not enabled|element is disabled|beforeunload|leave (this )?page|unsaved changes/iu],
  [CLASSES.locator, /strict mode violation|resolved to \d+ elements|waiting for (locator|getBy)|locator\(.*\) (was )?not found|element\(s\) not found|not attached to the DOM|waiting for element to be visible, enabled and stable|Timeout .*waiting for/iu],
  [CLASSES.assertion, /^\s*(Error:\s*)?expect\(|toHaveText|toBeVisible|toContainText|toHaveValue|toHaveCount|toBeHidden|toHaveURL|toBeChecked|Expected:|Received:|AssertionError|assert/iu],
];

const TIMED_OUT_STATUSES = new Set(['TIMED_OUT', 'timedOut', 'timedout']);
const FAILED_STEP_STATUSES = new Set(['failed', 'timedout', 'timedOut', 'interrupted']);

function parseJson(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** One aggregation row (`{ columns }`) or a plain object → its uppercase column map. */
export function columnsOf(row) {
  if (!row || typeof row !== 'object') return {};
  const columns = row.columns && typeof row.columns === 'object' ? row.columns : row;
  return columns;
}

export function rowsOf(input) {
  const value = parseJson(input);
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.objects)) return value.objects;
  if (value && Array.isArray(value.rows)) return value.rows;
  return [];
}

// OUTPUT and ARTIFACTS hold one result per browser the case ran on, keyed by the browser id. A
// run on several browsers can be red on one and green on another, so the evidence is read from
// the browser that failed, as Test Studio opens a result on it.
const BROWSER_IDS = ['CHROMIUM', 'FIREFOX', 'WEBKIT'];
const FAILED_RUN_STATUSES = new Set(['FAILED', 'ERROR', 'TIMED_OUT', 'CANCELLED']);

function legsOf(record) {
  const parsed = parseJson(record);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function legFailed(leg) {
  if (FAILED_RUN_STATUSES.has(String(leg?.status ?? ''))) return true;
  const failed = Number(leg?.testResults?.summary?.failed ?? 0);
  return failed > 0;
}

/** Each browser the case ran on with its status, in OUTPUT's order. A leg with no status takes the row's. */
export function browserResultsOf(columns) {
  const legs = legsOf(columns.OUTPUT);
  const parsed = parseJson(columns.BROWSERS);
  const listed = Array.isArray(parsed) ? parsed : [];
  const browsers = listed.length ? listed : Object.keys(legs).filter((key) => BROWSER_IDS.includes(key));
  return browsers.map((browser) => {
    const leg = legs[browser];
    const status = leg ? (legFailed(leg) ? 'FAILED' : String(leg.status ?? columns.STATUS ?? '')) : String(columns.STATUS ?? '');
    return { browser, status: status || null };
  });
}

/** The browser whose evidence explains the red: the first that failed, else the first. */
export function evidenceBrowserOf(columns) {
  const legs = legsOf(columns.OUTPUT);
  const keys = Object.keys(legs);
  return keys.find((key) => legFailed(legs[key])) ?? keys[0] ?? null;
}

const PASSED_RUN_STATUSES = new Set(['PASSED', 'SUCCESS']);

/**
 * The browsers a red failed on when Chromium did not fail it, else null: Chromium passed in the
 * same run, or the case does not run on Chromium at all. The heal loop's helpers walk in Chromium
 * only, where this red does not happen, so a replay there proves nothing about it.
 */
export function browserOnlyOf(red) {
  const results = Array.isArray(red?.browsers) ? red.browsers : [];
  const chromium = results.find((result) => result.browser === 'CHROMIUM');
  if (chromium && !PASSED_RUN_STATUSES.has(String(chromium.status ?? ''))) return null;
  const failed = results.filter((result) => result.browser !== 'CHROMIUM' && FAILED_RUN_STATUSES.has(String(result.status ?? ''))).map((result) => result.browser);
  return failed.length ? failed : null;
}

function legOf(record, browser) {
  const legs = legsOf(record);
  if (browser && legs[browser] !== undefined) return legs[browser];
  const keys = Object.keys(legs);
  return keys.length ? legs[keys[0]] : undefined;
}

function firstTest(columns) {
  const tests = legOf(columns.OUTPUT, evidenceBrowserOf(columns))?.testResults?.tests;
  return Array.isArray(tests) && tests.length ? tests[0] : undefined;
}

function stepDetailsOf(columns) {
  const browser = legOf(columns.ARTIFACTS, evidenceBrowserOf(columns));
  if (!browser || typeof browser !== 'object') return [];
  const byTest = Object.values(browser);
  for (const artifact of byTest) {
    if (artifact && Array.isArray(artifact.stepDetails)) return artifact.stepDetails;
  }
  return Array.isArray(browser.stepDetails) ? browser.stepDetails : [];
}

/** The first step that failed, by position (1-based) and title, with its own error and screenshot. */
export function failingStepOf(columns) {
  const test = firstTest(columns);
  const steps = Array.isArray(test?.steps) ? test.steps : [];
  const details = stepDetailsOf(columns);
  const source = steps.length ? steps : details;
  for (let position = 0; position < source.length; position += 1) {
    const step = source[position];
    if (FAILED_STEP_STATUSES.has(String(step?.status ?? ''))) {
      const detail = details[position] ?? {};
      return {
        position: position + 1,
        title: step.title ?? detail.title ?? '',
        error: step.error ?? detail.error ?? '',
        screenshot: detail.screenshot ?? step.screenshot ?? null,
        videoOffsetMs: detail.videoOffsetMs ?? null,
        total: source.length,
      };
    }
  }
  return null;
}

const CHECK_TITLE = /^\s*(verify\b|execute javascript and verify)/iu;

/** True when every verification of the case had passed before the red: the failing step is not
 * a check and no check follows it, so the red is in the teardown (durability.md, Verification
 * first). The report says so, and the heal loop's diagnosis starts from it. */
export function checksPassedBeforeOf(columns, failingStep) {
  if (!failingStep) return false;
  const test = firstTest(columns);
  const steps = Array.isArray(test?.steps) && test.steps.length ? test.steps : stepDetailsOf(columns);
  const titles = steps.map((step) => String(step?.title ?? ''));
  const lastCheck = titles.reduce((found, title, index) => (CHECK_TITLE.test(title) ? index : found), -1);
  const failingIndex = failingStep.position - 1;
  return lastCheck >= 0 && lastCheck < failingIndex && !CHECK_TITLE.test(titles[failingIndex] ?? '');
}

export function errorTextOf(columns) {
  const test = firstTest(columns);
  const fromTest = typeof test?.error === 'string' ? test.error : '';
  const summary = typeof columns.ERROR_SUMMARY === 'string' ? columns.ERROR_SUMMARY : '';
  return (fromTest || summary).trim();
}

/** A stable key for "the same error": ids, numbers, timings and quoted values collapsed. */
export function errorKeyOf(error) {
  const lines = String(error ?? '').split('\n');
  // The first line names the call; the locator sits in the call log a few lines down.
  const locatorLine = lines.slice(1).find((line) => /waiting for|resolved to|^\s*Locator:/iu.test(line));
  return [lines[0], locatorLine ?? '']
    .join(' ')
    .replace(/^\[[A-Z_]+\]\s*/u, '')
    .replace(/https?:\/\/\S+/gu, '<url>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}/giu, '<id>')
    .replace(/\d+(\.\d+)?\s*ms\b/gu, '<ms>')
    .replace(/\d+/gu, '#')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

/** Quoted text (an accessible name, a test id, a typed value) blanked, so a word inside it
 * ("Duplicate", "Leave page") never decides a class; the call around it still does. */
export function maskQuoted(text) {
  return String(text ?? '').replace(/'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/gu, "'…'");
}

export function classifyError(error, { status, failingStep } = {}) {
  // A whole execution that timed out with no failed step never reached the app's steps.
  if (TIMED_OUT_STATUSES.has(String(status ?? '')) && !failingStep) return CLASSES.infra;
  const text = maskQuoted(error);
  if (!text) return CLASSES.unknown;
  // An expect() failure names the locator it waited on whether or not the element was there.
  // It is a locator red only when the element was not found; when the call log shows the
  // locator resolved, or the error gives a received value, the element was there and the
  // expectation failed: an assertion red.
  const isExpect = /^\s*(Error:\s*)?expect\(/u.test(text);
  const elementFound = /resolved to \d* ?(<|elements?)|locator resolved to|Received( string| value)?:/iu.test(text) && !/element\(s\) not found/iu.test(text);
  for (const [cls, signature] of SIGNATURES) {
    if (isExpect && elementFound && cls === CLASSES.locator) continue;
    if (signature.test(text)) {
      // An expect() that timed out waiting for a locator is a missing element, which the
      // heal loop can settle live; an expect() with a value mismatch is an assertion.
      if (cls === CLASSES.assertion && !elementFound && /waiting for (locator|getBy)|element\(s\) not found/iu.test(text)) {
        return CLASSES.locator;
      }
      return cls;
    }
  }
  return CLASSES.unknown;
}

/** The host a run opened, read one way wherever it is compared: lowercase, with no scheme, port,
 * path or trailing dot; null when there is none. A run's `DOMAIN`, a link and a bare host all fit. */
export function runHost(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//iu.test(text) ? text : `https://${text}`).hostname.toLowerCase().replace(/\.$/u, '') || null;
  } catch {
    return null;
  }
}

/** A pull request's preview host: a run there tests the pull request, not the deployed app. */
export function isBranchPreview(domain) {
  return runHost(domain)?.endsWith('.vercel.app') === true;
}

/** One classified red per execution row. */
export function classifyRow(row) {
  const columns = columnsOf(row);
  const failingStep = failingStepOf(columns);
  // The failing step's own error first: a click on a missing element fails at the test
  // timeout, and only the step's call log ("waiting for getByTestId(...)") says so, while
  // the test-level error reads just "Test timeout of 300000ms exceeded". The signature order
  // still puts infra and auth first, so a dead run service is not taken for a locator.
  const error = [...new Set([failingStep?.error, errorTextOf(columns)].map((text) => String(text ?? '').trim()))]
    .filter(Boolean)
    .join('\n');
  const cls = classifyError(error, { status: columns.STATUS, failingStep });
  return {
    executionId: columns.ID ?? null,
    testCaseId: columns.TEST_CASE_ID ?? null,
    name: columns.NAME ?? null,
    status: columns.STATUS ?? null,
    suiteRunId: columns.TEST_SUITE_RUN_ID ?? null,
    planRunId: columns.TEST_PLAN_RUN_ID ?? null,
    startTime: columns.START_TIME ?? null,
    // The host the run opened, which is not always the one asked for: the platform runs a domain
    // it does not allow on the default one.
    domain: runHost(columns.DOMAIN),
    // The browser the evidence was read from, and each browser's result. A red on some browsers
    // and green on others is browser-specific: a replay in another browser cannot show it.
    browser: evidenceBrowserOf(columns),
    browsers: browserResultsOf(columns),
    class: cls,
    route: ROUTES[cls],
    failingStep,
    checksPassedBefore: checksPassedBeforeOf(columns, failingStep),
    error: error.slice(0, 2000),
    errorKey: errorKeyOf(error),
    // What a history row can be compared on: history reads carry only ERROR_SUMMARY.
    summaryKey: errorKeyOf(typeof columns.ERROR_SUMMARY === 'string' && columns.ERROR_SUMMARY ? columns.ERROR_SUMMARY : errorTextOf(columns)),
    decided: cls !== CLASSES.unknown && cls !== CLASSES.assertion && cls !== CLASSES.navigation,
    ...(RULE_VERDICTS[cls] ? { verdict: RULE_VERDICTS[cls], evidence: `rule: ${cls} signature in the error text` } : {}),
  };
}

/** Groups reds that share an error key and a failing step title, largest first. */
export function groupReds(reds) {
  const groups = new Map();
  for (const red of reds) {
    const key = `${red.errorKey}|${red.failingStep?.title ?? ''}`;
    const group = groups.get(key) ?? {
      key,
      class: red.class,
      route: red.route,
      errorKey: red.errorKey,
      stepTitle: red.failingStep?.title ?? null,
      stepPosition: red.failingStep?.position ?? null,
      executionIds: [],
      testCaseIds: [],
    };
    group.executionIds.push(red.executionId);
    if (red.testCaseId && !group.testCaseIds.includes(red.testCaseId)) group.testCaseIds.push(red.testCaseId);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => right.executionIds.length - left.executionIds.length);
}

/**
 * The circuit breaker: one cause took the run down when at least `minimum` reds (and a quarter
 * of them) share a group, or when half the run failed at a step within the first `earlySteps`.
 */
export function sharedCauseOf(reds, groups, { minimum = 3, earlySteps = 3, earlyMinimum = 3, totalInRun } = {}) {
  if (reds.length === 0) return null;
  const total = totalInRun ?? reds.length;
  const top = groups[0];
  if (top && top.executionIds.length >= minimum && top.executionIds.length >= reds.length / 4) {
    return { kind: 'same_error', group: top.key, count: top.executionIds.length, of: reds.length };
  }
  const early = reds.filter((red) => red.failingStep && red.failingStep.position <= earlySteps);
  if (early.length >= earlyMinimum && early.length * 2 >= total) {
    return { kind: 'early_failure', count: early.length, of: total, steps: earlySteps };
  }
  return null;
}

/** A row is a red unless its status says it passed or has not settled; a row with no status
 * is taken as the caller's red. */
const NOT_RED = new Set(['PASSED', 'passed', 'RUNNING', 'running', 'QUEUED', 'queued', 'SKIPPED', 'skipped']);

export function classify(input, options = {}) {
  const rows = rowsOf(input);
  const kept = rows.filter((row) => !NOT_RED.has(String(columnsOf(row).STATUS ?? '')));
  let reds = kept.map(classifyRow);
  let groups = groupReds(reds);
  // A shared cause is an event on the deployed app. A pull request's breakage on its preview is
  // the pull request's, however many cases share it, so it is read from the deployed reds only.
  const deployed = reds.filter((red) => !isBranchPreview(red.domain));
  const onDeployedOnly = deployed.length < reds.length;
  const found = deployed.length ? sharedCauseOf(deployed, onDeployedOnly ? groupReds(deployed) : groups, options) : null;
  const sharedCause = found && onDeployedOnly ? { ...found, onDeployedOnly } : found;
  if (sharedCause) {
    // taxonomy.md, Shared cause: every red is an environment event and nothing else runs.
    const evidence = sharedCause.kind === 'same_error'
      ? `shared cause: ${sharedCause.count} of ${sharedCause.of} reds${sharedCause.onDeployedOnly ? ' on the deployed app' : ''} share one error`
      : `shared cause: ${sharedCause.count} of ${sharedCause.of} cases failed within the first ${sharedCause.steps} steps`;
    reds = reds.map((red) => (deployed.includes(red) ? { ...red, ruleClass: red.class, route: 'environment', verdict: 'Environment', evidence, decided: true } : red));
    groups = groupReds(reds);
  }
  const residue = reds.filter((red) => !red.decided).map((red) => red.executionId);
  return { reds, groups, sharedCause, residue, notRed: rows.length - kept.length, previewHosts: previewHostsOf(reds) };
}

/** The branch-preview hosts a run's reds opened: a run with any is the pull request's, so its reds
 * are neither healed nor ticketed (taxonomy.md, Root causes). */
export function previewHostsOf(reds) {
  return [...new Set((reds ?? []).filter((red) => isBranchPreview(red.domain)).map((red) => red.domain))].sort();
}

/** The line a report and a status open with when some of a run's reds are a pull request's. */
export function previewLineOf(reds) {
  const onPreview = (reds ?? []).filter((red) => isBranchPreview(red.domain));
  if (!onPreview.length) return null;
  const ours = onPreview.filter(isPreviewRed).length;
  const ran = onPreview.length === reds.length ? (reds.length === 1 ? 'The red' : `All ${reds.length} reds`) : `${onPreview.length} of ${reds.length} reds`;
  const where = `${ran} ran on ${previewHostsOf(onPreview).join(', ')}, a branch preview`;
  const tail = `neither healed nor ticketed. Fix ${ours === 1 ? 'it' : 'them'} in the pull request, then run ${ours === 1 ? 'the case' : 'the cases'} again.`;
  if (!ours) return `${where}; an environment event stopped ${onPreview.length === 1 ? 'it' : 'them'}, not the pull request's code.`;
  if (ours === onPreview.length) return `${where}, and ${ours === 1 ? 'is' : 'are'} the pull request's: ${tail}`;
  return `${where}; ${ours} ${ours === 1 ? 'is' : 'are'} the pull request's: ${tail}`;
}

/** Merges per-execution annotations (history tag, verdict, route, evidence) onto a classification. */
export function annotate(classified, tags) {
  const reds = classified.reds.map((red) => {
    const extra = tags?.[red.executionId];
    if (!extra || typeof extra !== 'object') return red;
    const merged = { ...red, ...extra };
    merged.decided = red.decided || Boolean(merged.verdict);
    return merged;
  });
  const groups = groupReds(reds);
  return { ...classified, reds, groups, residue: reds.filter((red) => !red.decided).map((red) => red.executionId) };
}

const PASSED = new Set(['PASSED', 'passed']);
const FAILED = new Set(['FAILED', 'ERROR', 'TIMED_OUT', 'failed', 'error', 'timedOut']);

/**
 * A history tag from a case's executions, newest first (the current red first), first match
 * wins: first_run, always_failing (the 4 runs before all failed, with `errorKey` when given),
 * intermittent (3+ pass/fail flips), new_failure (the run before passed), else
 * repeat_failure (the run before failed, too few runs or a different error to say always).
 * A row's key is its ERROR_KEY when it carries one, else the key of its ERROR_SUMMARY.
 */
export function historyTag(executions, { errorKey, domain, window = 10, alwaysWindow = 5 } = {}) {
  // A case's history holds its runs on pull requests' previews too: a red is read against the
  // runs on its own side, the deployed app or a preview, when it says where it ran.
  const side = domain === undefined ? null : isBranchPreview(domain);
  const rows = rowsOf(executions).map(columnsOf).filter((row) => side === null || isBranchPreview(row.DOMAIN) === side);
  const settled = rows.filter((row) => PASSED.has(String(row.STATUS)) || FAILED.has(String(row.STATUS)));
  const recent = settled.slice(0, window);
  if (recent.length <= 1) return { tag: 'first_run', runs: recent.length };
  const previous = recent.slice(1);
  let flips = 0;
  for (let index = 1; index < recent.length; index += 1) {
    const now = PASSED.has(String(recent[index].STATUS));
    const before = PASSED.has(String(recent[index - 1].STATUS));
    if (now !== before) flips += 1;
  }
  const lastFew = previous.slice(0, alwaysWindow - 1);
  const allFailed = lastFew.length >= alwaysWindow - 1 && lastFew.every((row) => FAILED.has(String(row.STATUS)));
  const keyOf = (row) => (typeof row.ERROR_KEY === 'string' && row.ERROR_KEY ? row.ERROR_KEY : errorKeyOf(row.ERROR_SUMMARY));
  const sameError = !errorKey || lastFew.every((row) => keyOf(row) === errorKey);
  if (allFailed && sameError) return { tag: 'always_failing', runs: recent.length, flips };
  if (flips >= 3) return { tag: 'intermittent', runs: recent.length, flips };
  if (PASSED.has(String(previous[0].STATUS))) return { tag: 'new_failure', runs: recent.length, flips };
  return { tag: 'repeat_failure', runs: recent.length, flips };
}

// ---- ledger -------------------------------------------------------------------------

export function readLedger(file) {
  if (!fs.existsSync(file)) return { rows: [] };
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(parsed?.rows) ? parsed : { rows: [] };
}

export function writeLedger(file, ledger) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

/** One row per (loop, firingId, executionId); a later upsert replaces the earlier row's fields.
 * A second firing on the same execution (a heal retried after a rollback) keeps its own row. */
export function upsertRow(ledger, row) {
  if (!row || typeof row !== 'object') throw new Error('a ledger row must be an object');
  if (!row.loop || !row.executionId) throw new Error('a ledger row needs `loop` and `executionId`');
  const stamped = { ...row, updatedAt: new Date().toISOString() };
  const index = ledger.rows.findIndex((existing) => existing.loop === row.loop && existing.executionId === row.executionId
    && (existing.firingId ?? null) === (row.firingId ?? null));
  if (index === -1) ledger.rows.push(stamped);
  else ledger.rows[index] = { ...ledger.rows[index], ...stamped };
  return stamped;
}

/** A firing's rows are those stamped with its `firingId`, and its own `firing:<id>` and
 * `judge:<id>` rows even when an older writer left the stamp off. */
export function listRows(ledger, { run, testCaseId, firing } = {}) {
  const ofFiring = (row) => row.firingId === firing || row.executionId === `firing:${firing}` || row.executionId === `judge:${firing}`;
  return ledger.rows.filter(
    (row) => (!run || row.runId === run) && (!testCaseId || row.testCaseId === testCaseId) && (!firing || ofFiring(row)),
  );
}

/** The local history a firing already knows about a case, as executions newest first. */
export function ledgerHistory(ledger, testCaseId) {
  return ledger.rows
    .filter((row) => row.testCaseId === testCaseId && row.status && !String(row.executionId).includes(':'))
    .sort((left, right) => String(right.startTime ?? '').localeCompare(String(left.startTime ?? '')))
    .map((row) => ({ ID: row.executionId, STATUS: row.status, START_TIME: row.startTime, ERROR_SUMMARY: row.error ?? '', ERROR_KEY: row.summaryKey ?? '' }));
}


// ---- heal intake, the locator ladder, patches and the firing check -------------------

const STATUS_OF = (row) => String(columnsOf(row).STATUS ?? '');

/** The newest execution of each case, from `fetch_failed_executions` (newest first or not). A
 * failure on the deployed app wins over a newer one on a branch preview, which the heal loop sets
 * aside: so a case red on both is still healed. */
export function newestPerCase(input) {
  const best = new Map();
  const rank = (row) => [isBranchPreview(columnsOf(row).DOMAIN) ? 0 : 1, Number(columnsOf(row).START_TIME ?? 0)];
  for (const row of rowsOf(input)) {
    const columns = columnsOf(row);
    const key = columns.TEST_CASE_ID ?? columns.ID;
    const kept = best.get(key);
    const [deployed, time] = rank(row);
    const [keptDeployed, keptTime] = kept ? rank(kept) : [-1, 0];
    if (!kept || deployed > keptDeployed || (deployed === keptDeployed && time > keptTime)) best.set(key, row);
  }
  return [...best.values()];
}

/**
 * The root cause a heal-loop row ends with, when the case was not healed: a fixed vocabulary
 * (taxonomy.md, Root causes), each with the route that says who acts next and the next step the
 * report prints. The helper's diagnosis names one; `check-heal` refuses any other word.
 *
 * Every report heads a group `<label> — <cause>`: `label` is the family in a person's words, and
 * the cause is the defect in plain words when one was named (`causes`, or the analyse residue's
 * `cause` tag), else `summary`, the family's fixed description. A family marked `named` is one
 * whose cases share a defect worth naming (the same control misbehaving, the same service error,
 * the same surface gone): `check-heal` requires a `cause` on its rows, so a report never heads
 * forty app bugs with the family alone.
 */
export const ROOT_CAUSES = Object.freeze({
  'test design': { label: 'Test design', summary: 'timing, waits or step shape', route: 'update', next: 'an update job re-authors the steps: the wait, the step shape or the action the walk shows is needed' },
  'data isolation': { label: 'Test isolation / data', summary: 'shared or leftover test-user records', route: 'update', next: 'an update job makes the case create, find and count its own records' },
  'ui changed': { label: 'UI changed', summary: 'the elements moved or were redesigned', named: true, route: 'update', next: 'an update job re-authors the steps against the new UI, keeping every stated check' },
  'stale expectation': { label: 'Stale expectation', summary: 'the check expects the old behaviour', route: 'update', next: 'an update job changes the expected value to what the app now does' },
  'ai dependency': { label: 'AI dependency', summary: "the model's reply, its timing or its wording decides the outcome", route: 'ai', next: "set aside: the outcome is the model's reply, its timing or its wording; a stub or LLM mocking removes it" },
  transient: { label: 'Transient', summary: 'red did not reproduce', route: 'rerun', next: 'one platform re-run; green makes it flaky, red keeps it here with both ids' },
  'app bug': { label: 'App bug', summary: 'the app answered other than the description says', named: true, route: 'bug', next: 'a bug ticket (app-test-ticket-loop); the case is right' },
  backend: { label: 'Backend', summary: 'a service the app calls failed', named: true, route: 'bug', next: 'a ticket for the service the app named' },
  'contradicts description': { label: 'Description no longer holds', summary: 'the app no longer does what the description says', named: true, route: 'person', next: "a product-question ticket to the area's owner (app-test-ticket-loop): a regression to fix, or the cases rewritten or retired" },
  'feature missing': { label: 'Feature removed', summary: 'the surface or control is gone', named: true, route: 'person', next: 'a product-question ticket: removed on purpose, then the cases are retired; else a regression' },
  'needs choice': { label: 'Needs a choice', summary: 'two or more candidates for one element', route: 'person', next: 'a person picks between the candidates the row lists' },
  'no stable hook': { label: 'Fix found, but only a positional locator', summary: 'the app needs a static hook', route: 'hook', next: 'ask the app for a static hook (a data-testid) on the element, then heal' },
  'extension panel': { label: 'Extension panel', summary: "the failing step acts in an extension's side panel", route: 'person', next: 'an update run by a person: a helper cannot open an extension' },
  'browser specific': { label: 'Browser-specific', summary: 'red on Firefox or Safari, and green on Chromium in the same run or not run on Chromium', route: 'person', next: 'a person replays the case on the browser it failed on: the helpers walk in Chromium only' },
  environment: { label: 'Environment', summary: 'a sign-in, a cost or rate limit, or the tenant down', route: 'retry', next: 'retry with --retry <firing> once the event is over' },
  'not replayed': { label: 'Not replayed', summary: 'the budget, a shared cause, a missing sign-in or an infra red', route: 'retry', next: 'retry with --retry <firing>' },
  'branch preview': { label: 'Ran on a branch preview', summary: "the red came from a run on a pull request's preview, and the helpers replay on the deployed app", route: 'person', next: 'fix it in the pull request, then run the cases again' },
});

/** The families a red lands in before any live replay: a rule-decided locator red, an infra
 * red, and a red nobody decided. Same shape as a ROOT_CAUSES entry, without a route. */
export const FAMILIES = Object.freeze({
  locator: { label: 'Locator', summary: 'an element the step waits for was not found', next: 'the heal loop re-points the element' },
  runner: { label: 'Runner issue', summary: 'the run service, the browser or the queue', next: 'run again once the run service is back' },
  undecided: { label: 'Needs a person', summary: 'neither the rules nor the read decided', next: 'a person reads the evidence' },
  'preview blocked': { label: 'Environment, on a preview', summary: "the preview's sign-in, the runner or the tenant stopped the cases, not the pull request's code", next: 'run the cases again on the preview once the environment lets them through' },
});

/** The families whose rows carry a cause in plain words (policy.md, Naming a cause). */
export const NAMED_FAMILIES = Object.freeze(Object.keys(ROOT_CAUSES).filter((cause) => ROOT_CAUSES[cause].named));

/**
 * Why a cause is not a heading in plain words, or null when it is one. A cause names the defect
 * the way a person would head a report section ("the row-actions click opens the skill editor"):
 * never code, a locator, a step, an error text, a case or ticket name, or the family's own word.
 */
export function causeProblem(text) {
  const value = String(text ?? '').replace(/\s+/gu, ' ').trim();
  if (!value) return 'empty';
  if (/\n/u.test(String(text ?? ''))) return 'spans more than one line';
  if (value.length < 8) return 'under 8 characters';
  if (value.length > 90) return 'over 90 characters';
  if (/^(step \d|error[:\s]|timeout\b)/iu.test(value)) return 'names a step or an error, not the defect';
  if (/[`<>{}\[\]]|\$\(|data-block-id|getBy[A-Z]\w*\(|locator\(|expect\(|\bto(Be|Have|Contain)[A-Z]\w*\b/u.test(value)) return 'reads as code or a locator, not plain words';
  if (/\b[A-Z]{2,6}-\d{1,5}\b/u.test(value)) return 'names a test case or a ticket';
  if (/^(app bug|backend|ui changed|feature (removed|missing)|contradicts description|test design|data isolation|stale expectation)\b/iu.test(value)) return "repeats the family's word; say the defect";
  return null;
}

/** `causes` without --in: the heal firing's rows of a named family, each with its finding and
 * the cause it carries, sorted so rows with the same root cause and a like finding sit together. */
export function causesToName(ledger, firing) {
  const rows = listRows(ledger, { firing })
    .filter((row) => row.loop === 'heal-loop' && !String(row.executionId).includes(':'))
    .filter((row) => ROOT_CAUSES[rootCauseOf(row.rootCause)]?.named)
    .map((row) => ({ executionId: row.executionId, testCaseId: row.testCaseId ?? null, name: row.name ?? null, status: row.status, rootCause: rootCauseOf(row.rootCause), finding: row.finding ?? row.reason ?? null, cause: row.cause ?? null }))
    .sort((left, right) => left.rootCause.localeCompare(right.rootCause) || String(left.finding ?? '').localeCompare(String(right.finding ?? '')) || String(left.name ?? '').localeCompare(String(right.name ?? '')));
  return { firing, rows, named: rows.filter((row) => row.cause).length, unnamed: rows.filter((row) => !row.cause).length };
}

/** `causes --in`: writes each cause onto its heal-loop row of the firing. All or nothing: a
 * problem in any entry leaves the ledger untouched and is named with its execution id. */
export function nameCauses(ledger, firing, causes) {
  const problems = [];
  const rows = listRows(ledger, { firing }).filter((row) => row.loop === 'heal-loop' && !String(row.executionId).includes(':'));
  const byExecution = new Map(rows.map((row) => [row.executionId, row]));
  if (!causes || typeof causes !== 'object' || Array.isArray(causes)) return { named: 0, problems: ['causes must be an object { "<executionId>": "<cause>" }'] };
  const entries = Object.entries(causes);
  for (const [executionId, cause] of entries) {
    if (!byExecution.has(executionId)) problems.push(`${executionId}: no heal-loop case row in firing ${firing}`);
    const problem = causeProblem(cause);
    if (problem) problems.push(`${executionId}: cause ${JSON.stringify(cause)} ${problem}`);
  }
  const still = rows.filter((row) => ROOT_CAUSES[rootCauseOf(row.rootCause)]?.named && !row.cause && !(executionIdIn(entries, row.executionId)));
  for (const row of still) problems.push(`${row.executionId}: ${row.rootCause} with no cause named`);
  if (problems.length) return { named: 0, problems };
  for (const [executionId, cause] of entries) byExecution.get(executionId).cause = String(cause).replace(/\s+/gu, ' ').trim();
  return { named: entries.length, problems: [] };
}
const executionIdIn = (entries, executionId) => entries.some(([id]) => id === executionId);

/** The vocabulary word for a root cause as a helper or a person wrote it, or null. */
export function rootCauseOf(text) {
  const key = String(text ?? '').trim().toLowerCase().replace(/[—–-]+/gu, ' ').replace(/\s+/gu, ' ');
  return Object.keys(ROOT_CAUSES).find((cause) => cause === key) ?? null;
}

/**
 * Which reds the heal run takes on and what job each gets (policy.md, Before the browser
 * opens): `locator` and `wrong_element` go on as a heal; `assertion` as a heal marked
 * `needsLiveCheck`; every other class but `infra` and `auth` goes on as a diagnosis, where the
 * helper replays the case live and names the root cause. `infra` has nothing to replay, `auth`
 * is the environment, a red on a branch preview belongs to the pull request, and under a shared
 * cause nothing goes on.
 * `reds` are classify's reds, or analyse-run ledger rows (`ledger list --firing`).
 */
export function healIntake(reds, { sharedCause = null, maxCases = null } = {}) {
  const take = [];
  const skipped = [];
  for (const red of reds) {
    const cls = red.ruleClass ?? red.class;
    const entry = {
      executionId: red.executionId, testCaseId: red.testCaseId, name: red.name, class: cls, route: red.route,
      checksPassedBefore: red.checksPassedBefore === true,
      ...(red.historyTag ? { historyTag: red.historyTag } : {}),
      ...(Array.isArray(red.browsers) && red.browsers.length ? { browsers: red.browsers } : {}),
      ...(red.domain ? { domain: red.domain } : {}),
    };
    const browserOnly = browserOnlyOf(red);
    if (isPreviewRed(red)) skipped.push({ ...entry, rootCause: 'branch preview', reason: `ran on ${red.domain}, a branch preview: the helpers replay on the deployed app, and the red belongs to the pull request` });
    else if (sharedCause) skipped.push({ ...entry, rootCause: 'not replayed', reason: 'shared cause: the analyse-run firing recorded an environment event; no heal runs on it' });
    else if (browserOnly) skipped.push({ ...entry, rootCause: 'browser specific', failedOn: browserOnly, reason: `failed on ${browserOnly.join(', ')} and ${(red.browsers ?? []).some((result) => result.browser === 'CHROMIUM') ? 'passed on CHROMIUM in the same run' : 'does not run on CHROMIUM'}; the helpers walk in Chromium only, where it does not fail` });
    else if (cls === CLASSES.locator || cls === CLASSES.wrongElement) take.push({ ...entry, job: 'heal', needsLiveCheck: false });
    else if (cls === CLASSES.assertion) take.push({ ...entry, job: 'heal', needsLiveCheck: true });
    else if (cls === CLASSES.infra) skipped.push({ ...entry, rootCause: 'not replayed', reason: `${cls}, route ${red.route}: the run service failed before the case said anything; nothing to replay` });
    else if (cls === CLASSES.auth) skipped.push({ ...entry, rootCause: 'environment', reason: `${cls}, route ${red.route}: a sign-in or permission failure; fix the environment, then retry` });
    else take.push({ ...entry, job: 'diagnose', needsLiveCheck: true });
  }
  // The firing's budget: the first cases in the order given (newest first) are taken, the rest
  // are skipped with a reason a person can act on, so one firing never heals without end.
  if (Number(maxCases) > 0 && take.length > Number(maxCases)) {
    for (const entry of take.splice(Number(maxCases))) {
      skipped.push({ ...entry, rootCause: 'not replayed', reason: `run budget: ${maxCases} cases per firing; run the loop again for the rest` });
    }
  }
  return { take, skipped, sharedCause: sharedCause ?? null };
}

/**
 * `intake --retry`: the cases a heal firing of its own left for a later firing. Its rows that
 * were skipped or failed for a retryable root cause (the environment, the budget, a shared
 * cause, a sign-in) go on again with their job; its flow-change proposals, its update-route
 * diagnoses and its failed updates go on as update jobs, each carrying the diagnosis the
 * earlier firing recorded, so nothing is replayed twice to learn the same thing.
 */
export function healIntakeRetry(ledger, firing, { maxCases = null, hooks = false } = {}) {
  const rows = listRows(ledger, { firing }).filter((row) => row.loop === 'heal-loop' && !String(row.executionId).includes(':'));
  const take = [];
  const skipped = [];
  for (const row of rows) {
    const entry = {
      executionId: row.executionId, testCaseId: row.testCaseId, name: row.name, class: row.class ?? null, route: row.route ?? null,
      checksPassedBefore: row.checksPassedBefore === true, ...(row.historyTag ? { historyTag: row.historyTag } : {}),
      ...(row.domain ? { domain: row.domain } : {}),
    };
    // A red that ran on a branch preview is never replayed on the deployed app, whatever it was
    // skipped for: it waits on the pull request or on the preview itself.
    if (isBranchPreview(row.domain)) {
      if (['skipped', 'failed'].includes(row.status)) skipped.push({ ...entry, rootCause: row.rootCause ?? null, reason: `ran on ${row.domain}, a branch preview: --retry never takes it` });
      continue;
    }
    const cause = rootCauseOf(row.rootCause);
    const diagnosis = { rootCause: cause ?? row.rootCause ?? null, finding: row.finding ?? row.reason ?? null, fix: row.fix ?? row.flowChange ?? null };
    if (row.status === 'proposed' && row.flowChange) take.push({ ...entry, job: 'update', needsLiveCheck: false, diagnosis: { ...diagnosis, rootCause: cause ?? 'test design' } });
    else if (row.status === 'failed' && row.job === 'update') take.push({ ...entry, job: 'update', needsLiveCheck: false, diagnosis });
    else if (['skipped', 'failed'].includes(row.status) && cause && ROOT_CAUSES[cause].route === 'update') take.push({ ...entry, job: 'update', needsLiveCheck: false, diagnosis });
    // `hooks`: the app has shipped the static hooks the firing asked for, so each case that
    // waited on one goes on again as the job it had; the helper measures the new hook.
    else if (hooks && cause === 'no stable hook' && ['proposed', 'skipped'].includes(row.status)) {
      take.push({ ...entry, job: row.job === 'update' ? 'update' : 'heal', needsLiveCheck: row.class !== CLASSES.locator && row.class !== CLASSES.wrongElement, ...(row.job === 'update' ? { diagnosis } : {}) });
    } else if (['skipped', 'failed'].includes(row.status) && cause && ROOT_CAUSES[cause].route === 'retry') {
      const locatorRed = [CLASSES.locator, CLASSES.wrongElement, CLASSES.assertion].includes(row.class);
      take.push({ ...entry, job: row.job ?? (locatorRed ? 'heal' : 'diagnose'), needsLiveCheck: row.class !== CLASSES.locator && row.class !== CLASSES.wrongElement });
    }
    // Everything else is terminal: healed, updated, flaky, a bug, an AI dependency, a person's call.
  }
  if (Number(maxCases) > 0 && take.length > Number(maxCases)) {
    for (const entry of take.splice(Number(maxCases))) {
      skipped.push({ ...entry, rootCause: 'not replayed', reason: `run budget: ${maxCases} cases per firing; run the loop again for the rest` });
    }
  }
  return { take, skipped, sharedCause: null, retryOf: firing };
}

/** healIntake over an analyse-run firing's ledger rows, with that firing's own shared cause. */
export function healIntakeFromLedger(ledger, firing, options = {}) {
  const rows = listRows(ledger, { firing }).filter((row) => row.loop === 'analyse-run');
  const firingRow = rows.find((row) => row.executionId === `firing:${firing}`);
  const reds = rows.filter((row) => !String(row.executionId).includes(':'));
  return healIntake(reds, { sharedCause: firingRow?.sharedCause ?? null , ...options });
}

/** The strategy of a locator's last link: what identifies the element. */
export function strategyOf(locator) {
  const links = String(locator ?? '').match(/\.(getBy\w+|locator|frameLocator|nth|first|last)\((?:'[^']*'|"[^"]*"|`[^`]*`|[^()])*\)/gu) ?? [];
  const leaf = links.filter((link) => !link.startsWith('.frameLocator')).pop() ?? '';
  if (/^\.(nth|first|last)\(/u.test(leaf) || /nth-child|:nth-of-type/u.test(leaf)) return 'position';
  if (/^\.getByTestId\(/u.test(leaf) || /\[data-(testid|test-id|test|qa)=/u.test(leaf)) return 'test-hook';
  if (/^\.getBy(Role|Label)\(/u.test(leaf)) return 'role';
  if (/^\.getByText\(/u.test(leaf)) return 'text';
  if (/^\.getByPlaceholder\(/u.test(leaf)) return 'attribute';
  if (/\[class[~*^$|]?=|^\.locator\(['"`]\.[\w-]/u.test(leaf)) return 'banned';
  if (/\[data-block-runtime-block-id=|runTimeBlockKey/u.test(leaf)) return 'runtime-block-id';
  if (/\[data-block-id=/u.test(leaf)) return 'block-id';
  if (/\[data-nav-item=/u.test(leaf)) return 'nav-item';
  if (/\[data-block-type=/u.test(leaf)) return 'type';
  if (/\[id=/u.test(leaf)) return 'id';
  if (/\[[\w-]+=/u.test(leaf)) return 'attribute';
  if (/^\.locator\(['"`][a-z]+['"`]\)$/u.test(leaf)) return 'type';
  return 'unknown';
}

// Each dialect's durability ladder, best first (code-app-dialect.md, builder-app-dialect.md,
// platform-dialect.md). One entry may hold several strategies of equal rank.
const LADDERS = {
  code: [['test-hook'], ['role'], ['attribute', 'id'], ['text'], ['type', 'runtime-block-id', 'block-id', 'nav-item'], ['position']],
  builder: [['test-hook'], ['block-id', 'id'], ['role'], ['runtime-block-id'], ['type', 'attribute'], ['text'], ['position']],
  platform: [['test-hook'], ['nav-item'], ['role'], ['text'], ['block-id'], ['attribute', 'id', 'type', 'runtime-block-id'], ['position']],
};

/** A locator's rank on a dialect's ladder (0 is best). `scenarioNamed`: the builder carve-out,
 * where a role the scenario names by its visible label ranks with the block id. */
export function rungOf(locator, dialect, { scenarioNamed = false } = {}) {
  const strategy = strategyOf(locator);
  const ladder = LADDERS[dialect];
  if (!ladder) throw new Error(`unknown dialect ${dialect}: code, builder or platform`);
  if (strategy === 'banned' || strategy === 'unknown') return { strategy, rank: null };
  let rank = ladder.findIndex((level) => level.includes(strategy));
  if (dialect === 'builder' && scenarioNamed && strategy === 'role') rank = 1;
  return { strategy, rank: rank === -1 ? null : rank };
}

/** policy.md clause 3: the new locator sits at a rung no lower than the stored one. */
export function ladderVerdict({ dialect, oldLocator, newLocator, scenarioNamed = false, oldRungGone = false }) {
  const before = rungOf(oldLocator, dialect, { scenarioNamed });
  const after = rungOf(newLocator, dialect, { scenarioNamed });
  if (after.strategy === 'banned' || after.strategy === 'position' || after.rank === null) {
    return { verdict: 'banned', oldRung: before.strategy, newRung: after.strategy, reason: `a ${after.strategy} locator is never written` };
  }
  if (before.rank === null || after.rank <= before.rank || oldRungGone) {
    return { verdict: 'ok', oldRung: before.strategy, newRung: after.strategy, reason: oldRungGone && before.rank !== null && after.rank > before.rank ? 'the old rung no longer exists on the page' : '' };
  }
  return { verdict: 'lower', oldRung: before.strategy, newRung: after.strategy, reason: `${after.strategy} is lower than ${before.strategy} on the ${dialect} ladder` };
}

const PATCH_STEP_KEYS = ['elementId', 'pageUrl', 'oldLocator', 'locator', 'name', 'oldName', 'stepPosition', 'stepTitle', 'candidates', 'rung', 'oldRung'];
const PATCH_FORBIDDEN = ['action', 'value', 'assertions', 'expected', 'wait', 'retry', 'user', 'users', 'steps'];

/** The heal patch file (test-author-agent.md, Heal): { replay, healedSteps, steps: [...] }. */
export function validatePatch(patch) {
  const problems = [];
  if (!patch || typeof patch !== 'object') return ['the patch is not a JSON object'];
  if (patch.replay !== 'green') problems.push(`replay is ${JSON.stringify(patch.replay)}, not "green"`);
  const steps = patch.steps;
  if (!Array.isArray(steps) || steps.length === 0) problems.push('steps must be a non-empty array, one entry per healed step');
  else {
    if (patch.healedSteps !== steps.length) problems.push(`healedSteps ${patch.healedSteps} does not match ${steps.length} steps`);
    steps.forEach((step, index) => {
      const at = `steps[${index}]`;
      if (step.inline === true) {
        if (typeof step.selector !== 'string' || !step.selector) problems.push(`${at} is inline and has no selector`);
      } else {
        for (const key of PATCH_STEP_KEYS) if (step[key] === undefined || step[key] === '') problems.push(`${at} has no ${key}`);
      }
      if (step.candidates !== undefined && step.candidates !== 1) problems.push(`${at} saw ${step.candidates} candidates; only exactly one is written`);
      if (typeof step.pageUrl === 'string' && /^https?:\/\//u.test(step.pageUrl)) problems.push(`${at} pageUrl must be the page path, not a full URL`);
      for (const key of PATCH_FORBIDDEN) if (step[key] !== undefined) problems.push(`${at} changes ${key}; a heal changes only locator and name`);
      if (step.oldLocator !== undefined && step.oldLocator === step.locator) problems.push(`${at} new locator equals the stored one`);
    });
  }
  return problems;
}

export const HEAL_STATUSES = ['healed', 'updated', 'flaky', 'rolled_back', 'skipped', 'proposed', 'failed'];
const CONFIDENCE = ['lower', 'normal'];
const NEEDS_ROOT_CAUSE = ['skipped', 'proposed', 'failed', 'updated', 'flaky'];

/**
 * The parts of the heal run's exit condition a file can prove, clause by clause:
 * every case row terminal, healed rows complete, updated rows gated and read back, flaky rows
 * with their green re-run, every other row with a reason and a root cause from the vocabulary,
 * the firing row's counts, the judge row, and each healed row's old locator equal to its patch's.
 */
export function checkHealFiring(ledger, firing, patches = {}) {
  const rows = listRows(ledger, { firing }).filter((row) => row.loop === 'heal-loop');
  const cases = rows.filter((row) => !String(row.executionId).includes(':'));
  const problems = [];
  for (const row of cases) {
    const at = `case ${row.executionId}`;
    if (!HEAL_STATUSES.includes(row.status)) problems.push(`${at}: status ${row.status} is not one of ${HEAL_STATUSES.join(', ')}`);
    if (['skipped', 'proposed', 'failed', 'rolled_back'].includes(row.status) && !row.reason) problems.push(`${at}: ${row.status} with no reason`);
    if (NEEDS_ROOT_CAUSE.includes(row.status) && !rootCauseOf(row.rootCause)) problems.push(`${at}: ${row.status} with root cause ${JSON.stringify(row.rootCause ?? null)}, not one of ${Object.keys(ROOT_CAUSES).join(', ')}`);
    // Only intake sets a red aside as the pull request's, from the red's own host.
    if (rootCauseOf(row.rootCause) === 'branch preview' && !isBranchPreview(row.domain)) problems.push(`${at}: root cause branch preview, but the red did not run on a branch preview (its domain is ${row.domain ?? 'not recorded'})`);
    // A row of a named family carries the defect in plain words, so the reports head its group
    // with the cause and never with the family alone (policy.md, Naming a cause).
    if (NEEDS_ROOT_CAUSE.includes(row.status) && ROOT_CAUSES[rootCauseOf(row.rootCause)]?.named) {
      const problem = causeProblem(row.cause);
      if (problem) problems.push(`${at}: ${rootCauseOf(row.rootCause)} with ${row.cause === undefined ? 'no cause in plain words' : `cause ${JSON.stringify(row.cause)}: ${problem}`} (loop.mjs causes)`);
    }
    if (row.confidence !== undefined && !CONFIDENCE.includes(row.confidence)) problems.push(`${at}: confidence ${row.confidence} is not lower or normal`);
    if (row.status === 'updated') {
      const update = row.update ?? {};
      if (!(Number(update.attempts) >= 1)) problems.push(`${at}: updated with no update.attempts`);
      if (update.greenGate !== 'passed') problems.push(`${at}: updated without a passed green gate`);
      if (update.readBack !== true) problems.push(`${at}: updated without a read-back of the stored steps`);
      if (!(Number(update.stepsAfter) >= 1)) problems.push(`${at}: updated with no update.stepsAfter`);
      if (update.testCaseId && row.testCaseId && update.testCaseId !== row.testCaseId) problems.push(`${at}: the re-delivery saved ${update.testCaseId}, not this case`);
    }
    if (row.status === 'flaky') {
      if (rootCauseOf(row.rootCause) !== 'transient') problems.push(`${at}: flaky with root cause ${row.rootCause}, not transient`);
      if (!row.rerun?.executionId || !PASSED.has(String(row.rerun?.result ?? ''))) problems.push(`${at}: flaky without a passed re-run id`);
    }
    if (row.status === 'healed') {
      const patch = row.patch ?? {};
      for (const key of ['elementId', 'oldLocator', 'newLocator']) if (!patch[key]) problems.push(`${at}: healed row has no patch.${key}`);
      if (patch.oldLocator && patch.oldLocator === patch.newLocator) problems.push(`${at}: patch.oldLocator equals patch.newLocator; old is the stored locator the write replaced`);
      if (row.candidates !== 1) problems.push(`${at}: healed with candidates ${row.candidates}`);
      if (row.replay !== 'green') problems.push(`${at}: healed without a green replay`);
      if (!row.platformRunId) problems.push(`${at}: healed with no platformRunId`);
      const file = patches[row.executionId] ?? patches[row.testCaseId];
      const step = file?.steps?.find((item) => item.elementId === patch.elementId);
      if (file && !step) problems.push(`${at}: its patch file has no step for element ${patch.elementId}`);
      if (step && step.oldLocator !== patch.oldLocator) problems.push(`${at}: ledger old locator differs from the patch file's ${JSON.stringify(step.oldLocator)}`);
    }
  }
  const firingRow = rows.find((row) => row.executionId === `firing:${firing}`);
  if (!firingRow) problems.push(`no firing:${firing} row`);
  else {
    for (const status of HEAL_STATUSES) {
      const counted = firingRow.counts?.[status];
      const actual = cases.filter((row) => row.status === status).length;
      if (counted !== actual) problems.push(`firing row counts ${status} ${counted}, the case rows hold ${actual}`);
    }
  }
  if (!rows.some((row) => row.executionId === `judge:${firing}`)) problems.push(`no judge:${firing} row`);
  return { ok: problems.length === 0, problems };
}

/** The heal firing's report, from its ledger rows alone (SKILL.md, The firing, step 7). `shared`
 * maps an element id the firing wrote to the cases outside the firing that reference it. */
export function renderHealReport(ledgerRows, { firing, app, shared = {} } = {}) {
  const rows = ledgerRows.filter((row) => row.loop === 'heal-loop' && (!firing || row.firingId === firing));
  const cases = rows.filter((row) => !String(row.executionId).includes(':'));
  const firingRow = rows.find((row) => row.executionId === `firing:${firing}`);
  const count = (status) => cases.filter((row) => row.status === status).length;
  const label = (row) => `${row.name ?? row.testCaseId ?? row.executionId}${row.testCaseId ? ` (${row.testCaseId})` : ''}`;
  const step = (row) => (row.failingStep?.position ? `step ${row.failingStep.position}` : row.patch?.stepPosition ? `step ${row.patch.stepPosition}` : 'step ?');
  const flags = (row) => `${row.checksPassedBefore ? ' [checks passed; teardown red]' : ''}${row.aiDependent ? ' [AI-dependent]' : ''}`;
  const firstLineOf = (text, max = 300) => String(text ?? '').split('\n')[0].slice(0, max);
  const lines = [];
  lines.push(`# Heal report — firing ${firing ?? '?'}${app ? ` · ${app}` : ''} · healed ${count('healed')}, updated ${count('updated')}, flaky ${count('flaky')}, rolled back ${count('rolled_back')}, skipped ${count('skipped')}, proposed ${count('proposed')}, failed ${count('failed')}`, '');
  if (firingRow?.intake) lines.push(`${firingRow.intake.taken ?? '?'} cases taken on (${firingRow.intake.heal ?? 0} heal, ${firingRow.intake.diagnose ?? 0} diagnose, ${firingRow.intake.update ?? 0} update), ${firingRow.intake.skipped ?? 0} skipped at intake.${firingRow.sharedCause ? ' Shared cause: nothing replayed.' : ''}${firingRow.sharedEvent ? ` Shared event during the firing: ${firingRow.sharedEvent}; the cases not yet dispatched were skipped for a retry.` : ''}`, '');
  else if (firingRow?.reason) lines.push(firingRow.reason, '');

  // Still failing, by cause: every case the firing did not make green, headed by its cause in
  // plain words (`App bug — the row-actions click opens the skill editor`), the largest group
  // first, each group with the next step its root cause fixes. The document a person otherwise
  // writes by hand after a firing.
  const still = cases.filter((row) => !['healed', 'updated', 'flaky'].includes(row.status));
  const groups = groupByCause(still.map((row) => ({ row, title: causeTitleOf(null, row), family: statusCauseOf({}, row) })));
  lines.push(`## Still failing, by root cause (${groups.length} group${groups.length === 1 ? '' : 's'}, ${still.length} case${still.length === 1 ? '' : 's'})`, '');
  if (!groups.length) lines.push('none');
  else {
    lines.push('Each group is one cause in plain words, named from the replays. Largest group first, so the fix with the most reach comes first. Each group names its next step.', '');
    groups.forEach(({ title, family, members }, index) => {
      lines.push(`${index + 1}. **${title}** (${members.length} case${members.length === 1 ? '' : 's'}) — next: ${nextOf(family)}`);
      for (const { row } of members.sort((left, right) => String(left.row.name ?? '').localeCompare(String(right.row.name ?? '')))) {
        lines.push(`   - ${label(row)} — ${step(row)} — ${row.status}${flags(row)} — ${firstLineOf(row.finding ?? row.reason)}`);
      }
    });
  }

  const section = (title, list, render) => {
    lines.push('', `## ${title} (${list.length})`, '');
    if (!list.length) lines.push('none');
    for (const row of list) lines.push(render(row));
  };
  section('Healed', cases.filter((row) => row.status === 'healed'), (row) => {
    const patch = row.patch ?? {};
    return `- ${label(row)} — ${step(row)}, element ${patch.elementId ?? '?'}: \`${patch.oldLocator ?? '?'}\` → \`${patch.newLocator ?? '?'}\` — ${firstLineOf(row.reason, 200) || 'locator re-pointed'} — confidence ${row.confidence ?? 'normal'}${row.platformRunId ? ` — proof run ${row.platformRunId}` : ''}`;
  });
  section('Updated', cases.filter((row) => row.status === 'updated'), (row) => `- ${label(row)} — ${row.rootCause}${flags(row)} — ${firstLineOf(row.fix ?? row.finding ?? row.reason)} — re-delivered in ${row.update?.attempts ?? '?'} attempt${row.update?.attempts === 1 ? '' : 's'}, ${row.update?.stepsBefore ?? '?'} → ${row.update?.stepsAfter ?? '?'} steps, green gate passed`);
  section('Flaky', cases.filter((row) => row.status === 'flaky'), (row) => `- ${label(row)} — ${step(row)} — replayed green unchanged; re-run ${row.rerun?.executionId ?? '?'} passed`);
  section('Skipped', cases.filter((row) => row.status === 'skipped' && rootCauseOf(row.rootCause) !== 'needs choice'), (row) => `- ${label(row)} — ${step(row)} — ${row.rootCause}${flags(row)} — ${firstLineOf(row.reason)}`);
  section('Needs choice', cases.filter((row) => rootCauseOf(row.rootCause) === 'needs choice'), (row) => `- ${label(row)} — ${step(row)} — ${firstLineOf(row.reason)}${Array.isArray(row.options) && row.options.length ? ` — candidates: ${row.options.map((option) => `\`${typeof option === 'string' ? option : option.locator ?? JSON.stringify(option)}\``).join(', ')}` : ''}`);
  section('Rolled back', cases.filter((row) => row.status === 'rolled_back'), (row) => `- ${label(row)} — ${step(row)}, element ${row.patch?.elementId ?? '?'} — ${firstLineOf(row.reason)}`);
  section('Proposed', cases.filter((row) => row.status === 'proposed'), (row) => `- ${label(row)} — ${step(row)}${row.patch?.elementId ? `, element ${row.patch.elementId}` : ''} — ${row.rootCause} — ${firstLineOf(row.reason)}${row.patch?.oldLocator ? ` — \`${row.patch.oldLocator}\` → \`${row.patch.newLocator ?? '?'}\`` : ''}${row.flowChange ? ` — ${firstLineOf(row.flowChange)}` : ''}`);
  section('Hook requests', cases.filter((row) => rootCauseOf(row.rootCause) === 'no stable hook'), (row) => `- ${label(row)} — ${step(row)}${row.patch?.elementId ? `, element ${row.patch.elementId}` : ''} — ${firstLineOf(row.hook ?? row.finding ?? row.reason)}`);
  section('Product checks', cases.filter((row) => ['feature missing', 'contradicts description'].includes(rootCauseOf(row.rootCause))), (row) => `- ${label(row)} — ${row.rootCause} — ${firstLineOf(row.finding ?? row.reason)}`);
  const written = [...new Set(cases.flatMap((row) => (row.writes ?? []).map((write) => write.elementId)).filter(Boolean))];
  lines.push('', `## Elements written (${written.length})`, '');
  if (!written.length) lines.push('none');
  for (const elementId of written) {
    const others = shared?.[elementId];
    lines.push(`- ${elementId} — ${Array.isArray(others) && others.length ? `also used by ${others.join(', ')}: not replayed by this firing; the app's next scheduled run proves them` : 'no other case uses it'}`);
  }
  lines.push('');
  return lines.join('\n');
}

// The verdict and route an analyse firing gets from each heal-loop outcome, so its report and
// the ticket loop see what the live replays found.
const TAG_OF_CAUSE = {
  'test design': { verdict: 'Test defect (step shape)', route: 'update' },
  'data isolation': { verdict: 'Test defect (data)', route: 'update' },
  'ui changed': { verdict: 'Test defect (locator)', route: 'update' },
  'stale expectation': { verdict: 'Test defect (assertion)', route: 'update' },
  'ai dependency': { verdict: 'AI dependency', route: 'ai' },
  'app bug': { verdict: 'App bug', route: 'bug' },
  backend: { verdict: 'App bug', route: 'bug' },
  environment: { verdict: 'Environment', route: 'environment' },
  transient: { verdict: 'Unknown', route: 'agent' },
  // A product question: the case is held until a person says whether the change was meant.
  'contradicts description': { verdict: 'Product question', route: 'person' },
  'feature missing': { verdict: 'Product question', route: 'person' },
  'needs choice': { verdict: 'Test defect (locator)', route: 'heal' },
  'no stable hook': { verdict: 'Test defect (locator)', route: 'hook' },
  'extension panel': { verdict: 'Unknown', route: 'agent' },
  'browser specific': { verdict: 'Unknown', route: 'agent' },
  'branch preview': { verdict: 'Unknown', route: 'person' },
};

/** `heal-tags`: the firing's outcomes in `annotate`'s tags shape, keyed by execution id. */
export function healTags(ledgerRows, firing) {
  const tags = {};
  for (const row of ledgerRows.filter((item) => item.loop === 'heal-loop' && item.firingId === firing && !String(item.executionId).includes(':'))) {
    const cause = rootCauseOf(row.rootCause);
    const where = `heal firing ${firing}`;
    let tag = null;
    if (row.status === 'healed') tag = { verdict: 'Test defect (locator)', route: 'heal', evidence: `${where}: healed, proof run ${row.platformRunId ?? '?'}` };
    else if (row.status === 'updated') tag = { ...(TAG_OF_CAUSE[cause] ?? { verdict: 'Test defect (step shape)', route: 'update' }), evidence: `${where}: re-authored (${cause}); ${row.fix ?? row.finding ?? ''}`.trim() };
    else if (row.status === 'flaky') tag = { verdict: 'Flaky', route: 'flaky', evidence: `${where}: replayed green; re-run ${row.rerun?.executionId ?? '?'} passed`, rerun: row.rerun };
    else if (row.status === 'rolled_back') tag = { verdict: 'Test defect (locator)', route: 'heal', evidence: `${where}: rolled back; ${row.reason ?? ''}`.trim() };
    else if (cause === 'not replayed') continue;
    else if (cause && TAG_OF_CAUSE[cause]) tag = { ...TAG_OF_CAUSE[cause], evidence: `${where}: ${cause}; ${row.finding ?? row.reason ?? ''}`.trim() };
    if (!tag) continue;
    tags[row.executionId] = { ...tag, rootCause: cause ?? row.rootCause ?? null, ...(row.cause ? { cause: row.cause } : {}), ...(row.checksPassedBefore ? { checksPassedBefore: true } : {}) };
  }
  return tags;
}

// ---- the author run's watch ------------------------------------------------------------

/** stalls.md, Recovery: wait 1, 2, 5 and 10 minutes after the 1st to 4th tenant 5xx in a
 * row, then every 10 minutes, with no cap. */
export function backoffMinutes(consecutive) {
  if (!consecutive || consecutive < 1) return 0;
  return [1, 2, 5, 10][consecutive - 1] ?? 10;
}

/**
 * One tick of app-test-create-loop's watch, from its run file: which helpers are past their
 * deadline (re-dispatch once, then park), the helper cap (load and shared state), the 5xx
 * back-off, and which queued cases to dispatch now (most steps first). Pure: the caller acts.
 */
export function watchTick(run, { now = new Date(), load = null, cores = null, consecutive5xx = 0 } = {}) {
  const at = new Date(now).getTime();
  const entries = Array.isArray(run.scenarios) ? run.scenarios : [];
  const deadlineMs = Number(run.helperDeadlineMinutes ?? 45) * 60_000;
  const stallsOf = (key) => (run.stalls ?? []).filter((stall) => stall.key === key && stall.kind === 'helper past deadline').length;
  const pastDeadline = entries
    .filter((entry) => entry.state === 'authoring' && entry.dispatchedAt && at - new Date(entry.dispatchedAt).getTime() > deadlineMs)
    .map((entry) => ({ key: entry.key, helper: entry.helper, action: stallsOf(entry.key) >= 1 ? 'park' : 'redispatch', ...(stallsOf(entry.key) >= 1 ? { parkedReason: 'platform failure' } : {}) }));
  const contractCap = Number(run.contractHelperCap ?? run.helperCap ?? 8);
  // Load never takes the cap below this floor (run-contract.md, Helper cap; 6 by default), and
  // the floor never exceeds the contract's own cap.
  const floor = Math.min(contractCap, Math.max(1, Number(run.helperCapFloor ?? 6)));
  let cap = Number(run.helperCap ?? contractCap);
  let why = null;
  if (cap < floor) { cap = floor; why = 'helper cap floor'; }
  if (load !== null && cores) {
    if (load > cores && cap > floor) { cap = Math.max(floor, cap - 2); why = 'machine load'; }
    else if (load < cores / 2 && cap < contractCap) { cap = Math.min(contractCap, cap + 2); why = 'machine load'; }
  }
  // A shared-state case is held back until every other case has been dispatched and has
  // reported (parallel-authoring.md, Dispatch); only then does the cap drop to 1 for it. While
  // other cases are still queued or waiting, they run in parallel and the shared one waits.
  const othersPending = entries.some((entry) => !entry.sharedState && ['queued', 'waiting'].includes(entry.state));
  const sharedRunning = entries.find((entry) => entry.sharedState && entry.state === 'authoring');
  const shared = sharedRunning
    ?? (othersPending ? null : entries.find((entry) => entry.sharedState && ['queued', 'waiting'].includes(entry.state)));
  if (shared) { cap = 1; why = `shared state: ${shared.key}`; }
  const backoff = backoffMinutes(consecutive5xx);
  const inFlight = entries.filter((entry) => entry.state === 'authoring').length - pastDeadline.length;
  // The run budget (run-contract.md): once this many cases have been dispatched, or this many
  // minutes have passed since kickoff, nothing more is dispatched and every queued case is
  // parked, so a firing can never run away. No budget in the run file means no cap.
  const budget = run.runBudget && typeof run.runBudget === 'object' ? run.runBudget : null;
  const dispatched = entries.filter((entry) => entry.dispatchedAt).length;
  const minutesSinceKickoff = run.kickoffEndedAt ? (at - new Date(run.kickoffEndedAt).getTime()) / 60_000 : 0;
  const budgetWhy = budget
    ? (Number(budget.cases) > 0 && dispatched >= Number(budget.cases) ? `${budget.cases} cases`
      : Number(budget.minutes) > 0 && minutesSinceKickoff >= Number(budget.minutes) ? `${budget.minutes} minutes` : null)
    : null;
  const parkForBudget = budgetWhy
    ? entries.filter((entry) => entry.state === 'queued').map((entry) => ({ key: entry.key, parkedReason: `policy exclusion: run budget (${budgetWhy})` }))
    : [];
  let dispatch = [];
  if (!backoff && !budgetWhy) {
    const queued = entries.filter((entry) => entry.state === 'queued' && !entry.sharedState);
    // A shared-state case runs alone, after the others in flight have reported.
    const order = shared
      ? (inFlight === 0 ? [shared].filter((entry) => entry.state === 'queued') : [])
      : queued.sort((left, right) => Number(right.steps ?? 0) - Number(left.steps ?? 0));
    dispatch = order.slice(0, Math.max(0, cap - inFlight)).map((entry) => entry.key);
  }
  return {
    pastDeadline,
    cap,
    capChange: cap !== Number(run.helperCap ?? contractCap) ? { from: Number(run.helperCap ?? contractCap), to: cap, why } : null,
    backoffMinutes: backoff,
    dispatch,
    budget: budgetWhy ? { reached: true, why: budgetWhy, park: parkForBudget } : { reached: false },
    done: entries.length > 0 && entries.every((entry) => ['saved', 'authored', 'parked'].includes(entry.state)),
  };
}

// ---- report -------------------------------------------------------------------------

/** The outcome a red lands under in the report. A heal-loop row that healed the case wins;
 * then the verdict; then the class. `person` is what nobody decided. */
export const OUTCOMES = Object.freeze({
  healed: 'Healed',
  bugs: 'App bugs',
  defects: 'Test defects',
  runner: 'Runner issues',
  environment: 'Environment',
  flaky: 'Flaky',
  ai: 'AI dependency',
  person: 'Needs a person',
  preview: 'Ran on a branch preview',
  previewBlocked: 'Environment, on a preview',
});

/** What an expect() error says it wanted and what it got, when it says so. */
export function expectationOf(error) {
  const text = String(error ?? '');
  const expected = text.match(/^\s*Expected(?: substring| string| value| pattern| count)?:\s*(.+)$/mu)?.[1]?.trim() ?? null;
  const received = text.match(/^\s*Received(?: string| value| count)?:\s*(.+)$/mu)?.[1]?.trim() ?? null;
  return expected || received ? { expected, received } : null;
}

/** A red on a branch preview that the run service or the environment did not stop: the pull
 * request's to fix. A sign-in wall on a protected preview stays an environment event. */
export function isPreviewRed(red) {
  if (!isBranchPreview(red?.domain)) return false;
  if (red.class === CLASSES.infra || red.ruleClass === CLASSES.infra) return false;
  return red.verdict !== 'Environment' && red.route !== 'environment';
}

export function outcomeOf(red, healRow = null) {
  if (healRow?.status === 'healed') return 'healed';
  const verdict = String(red.verdict ?? '');
  if (verdict === 'Flaky') return 'flaky';
  if (isPreviewRed(red)) return 'preview';
  if (isBranchPreview(red.domain) && !isInfraRed(red) && (verdict === 'Environment' || red.route === 'environment')) return 'previewBlocked';
  if (verdict === 'AI dependency' || red.route === 'ai') return 'ai';
  if (verdict === 'App bug') return 'bugs';
  if (red.class === CLASSES.infra || red.ruleClass === CLASSES.infra) return 'runner';
  if (verdict === 'Environment' || red.route === 'environment') return 'environment';
  if (verdict.startsWith('Test defect') || red.route === 'heal' || red.route === 'update') return 'defects';
  return 'person';
}

const DEFECT_KIND = {
  [CLASSES.locator]: 'Locator',
  [CLASSES.wrongElement]: 'Locator',
  [CLASSES.stepShape]: 'Step shape',
  [CLASSES.data]: 'Data',
  [CLASSES.assertion]: 'Stale expectation',
};
const DEFECT_NEXT = {
  Locator: 'the heal loop re-points the element',
  'Step shape': 'an update run adds the readiness pair or the save before leaving',
  Data: 'an update run makes the case create its own records',
  'Stale expectation': 'an update run changes the expected value',
};

const firstLine = (text, max = 160) => String(text ?? '').split('\n')[0].slice(0, max);
const caseLabel = (red) => `${red.name ?? red.testCaseId ?? red.executionId} (${red.executionId})`;
const stepLabel = (red) => (red.failingStep?.title ? `step ${red.failingStep.position}. ${red.failingStep.title}` : 'no failing step recorded');
// A case run on more than one browser says which ones it failed on: a red on one browser is
// not the same finding as a red on all of them.
const browsersLabel = (red) => {
  const results = Array.isArray(red.browsers) ? red.browsers : [];
  if (results.length < 2) return '';
  const failed = results.filter((result) => FAILED_RUN_STATUSES.has(String(result.status ?? ''))).map((result) => result.browser);
  return failed.length ? ` [failed on ${failed.join(', ')} of ${results.map((result) => result.browser).join(', ')}]` : '';
};
const tag = (red) => `${red.historyTag ? ` [${red.historyTag}]` : ''}${red.checksPassedBefore ? ' [checks passed; teardown red]' : ''}${browsersLabel(red)}`;

/** The run report, by outcome. `heal` is the heal-loop ledger rows of this firing, by
 * execution id, so a case the chained heal fixed lands under Healed; `tickets` the bug-tickets
 * rows of the firing, whose title heads a group of app bugs no cause was named for; `stuck` the
 * executions still queued or running when the polling gave up; `appUrl` makes the next command
 * exact. */
export function renderReport(classified, { runId, firingId, mode, heal = [], tickets = [], stuck = [], appUrl } = {}) {
  const { reds, sharedCause, residue, notRed = 0 } = classified;
  const healByExecution = new Map((heal ?? []).filter((row) => row.executionId && !String(row.executionId).includes(':')).map((row) => [row.executionId, row]));
  const ticketByExecution = ticketIndex(tickets);
  const byOutcome = Object.fromEntries(Object.keys(OUTCOMES).map((key) => [key, []]));
  for (const red of reds) byOutcome[outcomeOf(red, healByExecution.get(red.executionId))].push(red);
  const lines = [];
  lines.push(`# Run analysis${runId ? ` — run ${runId}` : ''}`, '');
  lines.push(`${reds.length} failed case execution${reds.length === 1 ? '' : 's'}, ${notRed} passed or unsettled${firingId ? `, firing ${firingId}` : ''}.${mode ? ` Mode: ${mode}.` : ''}`);
  lines.push(Object.entries(OUTCOMES).filter(([key]) => !['preview', 'previewBlocked'].includes(key) || byOutcome[key].length).map(([key, name]) => `${name} ${byOutcome[key].length + (key === 'runner' ? stuck.length : 0)}`).join(' · ') + '.');
  const previewLine = previewLineOf(reds);
  if (previewLine) lines.push('', previewLine);
  if (sharedCause) {
    lines.push('');
    lines.push(`**Shared cause:** ${sharedCause.kind === 'same_error' ? `${sharedCause.count} of ${sharedCause.of} reds${sharedCause.onDeployedOnly ? ' on the deployed app' : ''} share one error (${sharedCause.group.split('|')[0]})` : `${sharedCause.count} of ${sharedCause.of} cases failed within the first ${sharedCause.steps} steps`}. Treated as an environment event: no heals this firing.`);
  }

  const section = (key, count, intro) => {
    lines.push('', `## ${OUTCOMES[key]} (${count})`, '');
    if (intro) lines.push(intro, '');
    if (!count) lines.push('none');
  };

  // What still fails after the heal, by cause in plain words, the largest group first: the fix
  // with the most reach comes first. A group's title is the cause the heal loop's replays or the
  // residue read named (`App bug — the row-actions click opens the skill editor`), else the
  // ticket that holds it, else its family (`Test design — timing, waits or step shape`); the
  // error text and the step stay on each case's line, never in the heading.
  const stillFailing = reds.filter((red) => !['healed', 'flaky'].includes(outcomeOf(red, healByExecution.get(red.executionId))));
  const groups = groupByCause(stillFailing.map((red) => {
    const healRow = healByExecution.get(red.executionId) ?? null;
    return { red, title: causeTitleOf(red, healRow, ticketByExecution.get(red.executionId) ?? null), family: statusCauseOf(red, healRow) };
  }));
  lines.push('', `## Still failing, by root cause (${groups.length} group${groups.length === 1 ? '' : 's'}, ${stillFailing.length} case${stillFailing.length === 1 ? '' : 's'})`, '');
  if (!groups.length) lines.push('none');
  else {
    lines.push('Each group is one cause in plain words: the defect the heal loop\'s replay or the screenshot read named, else the family of the failure. Largest group first, so the fix with the most reach comes first. A group headed by its family alone (`Locator — …`) has not been replayed live yet' + (stillFailing.some((red) => !isBranchPreview(red.domain)) ? '; `--heal` names what moved.' : '.'), '');
    groups.forEach(({ title, family, members }, index) => {
      lines.push(`${index + 1}. **${title}** (${members.length} case${members.length === 1 ? '' : 's'}) — next: ${nextOf(family)}`);
      // Same error, same step first, so the cases that share one element sit together.
      const sorted = members.sort((left, right) => String(left.red.errorKey ?? '').localeCompare(String(right.red.errorKey ?? '')) || String(left.red.failingStep?.title ?? '').localeCompare(String(right.red.failingStep?.title ?? '')) || String(left.red.name ?? '').localeCompare(String(right.red.name ?? '')));
      for (const { red } of sorted) lines.push(`   - ${caseLabel(red)}${tag(red)} — ${stepLabel(red)}${red.verdict ? ` — ${red.verdict}` : ''}`);
    });
  }

  // Healed: what the chained heal loop changed, and what still waits for it.
  const healed = byOutcome.healed;
  const waiting = reds.filter((red) => red.route === 'heal' && !healByExecution.has(red.executionId) && !isPreviewRed(red));
  section('healed', healed.length, healed.length ? 'The heal loop re-pointed each element below and proved the case green on the platform.' : null);
  for (const red of healed) {
    const row = healByExecution.get(red.executionId);
    const patch = row.patch ?? {};
    lines.push(`- ${caseLabel(red)} — step ${patch.stepPosition ?? red.failingStep?.position ?? '?'}${patch.elementId ? `, element ${patch.elementId}` : ''}: \`${patch.oldLocator ?? '?'}\` → \`${patch.newLocator ?? '?'}\`${row.confidence ? ` — confidence ${row.confidence}` : ''}${row.platformRunId ? ` — proof run ${row.platformRunId}` : ''}`);
  }
  if (waiting.length) {
    lines.push(healed.length ? '' : '', `Waiting for the heal loop: ${waiting.length} locator red${waiting.length === 1 ? '' : 's'} (${waiting.map((red) => red.name ?? red.executionId).join(', ')}).${firingId ? ` Run \`/ua:app-test-heal-loop --from ${firingId}${appUrl ? ` for ${appUrl}` : ' for <app URL>'}\`, or add \`--heal\` next time.` : ''}`);
  }

  // App bugs: the test did what its steps say; the app answered differently.
  const bugs = byOutcome.bugs;
  section('bugs', bugs.length, bugs.length ? 'The test did what its steps say and the app answered differently. Each entry says what the step expected and what the page showed; the case and step are where to reproduce it.' : null);
  for (const red of bugs) {
    const expectation = expectationOf(red.error);
    lines.push(`- **${caseLabel(red)}** — ${stepLabel(red)}${tag(red)}`);
    lines.push(`  - Expected: ${expectation?.expected ?? firstLine(red.failingStep?.title ? `the step "${red.failingStep.title}" to hold` : 'what the assertion states')}`);
    lines.push(`  - Observed: ${expectation?.received ?? firstLine(red.error) ?? 'see the screenshot'}`);
    if (red.evidence) lines.push(`  - Evidence: ${red.evidence}`);
    if (red.failingStep?.videoOffsetMs != null) lines.push(`  - Video: from ${Math.round(red.failingStep.videoOffsetMs / 1000)}s`);
    if (red.rerun) lines.push(`  - Re-run: ${typeof red.rerun === 'string' ? red.rerun : `${red.rerun.executionId ?? ''} ${red.rerun.result ?? red.rerun.status ?? ''}`.trim()}`);
  }

  // Test defects: the case, not the app, is wrong; grouped by kind with the next action.
  const defects = byOutcome.defects;
  section('defects', defects.length, defects.length ? 'The app behaved; the case needs a change. Grouped by what is wrong in the case.' : null);
  const kinds = new Map();
  for (const red of defects) {
    const kind = DEFECT_KIND[red.class] ?? (String(red.verdict ?? '').match(/Test defect \((.+)\)/u)?.[1] ?? 'Other');
    if (!kinds.has(kind)) kinds.set(kind, []);
    kinds.get(kind).push(red);
  }
  for (const [kind, list] of kinds) {
    lines.push(`### ${kind} (${list.length}) — next: ${DEFECT_NEXT[kind] ?? 'a person decides'}`);
    for (const red of list) {
      const row = healByExecution.get(red.executionId);
      const healNote = row ? ` — heal: ${row.status}${row.reason ? ` (${row.reason})` : ''}` : '';
      lines.push(`- ${caseLabel(red)} — ${stepLabel(red)}${tag(red)} — \`${red.errorKey || firstLine(red.error) || '(no error text)'}\`${healNote}`);
    }
  }

  // A branch preview's reds: the pull request's to fix, so neither healed nor ticketed. Shown only
  // when the run has some, so a run on the deployed app reads as before.
  if (byOutcome.preview.length) {
    section('preview', byOutcome.preview.length, 'Each case below failed on a pull request\'s preview. Fix it in the pull request, then run the case again.');
    for (const red of byOutcome.preview) lines.push(`- ${caseLabel(red)} on ${red.domain} — ${stepLabel(red)} — \`${red.errorKey || firstLine(red.error) || '(no error text)'}\``);
  }

  if (byOutcome.previewBlocked.length) {
    section('previewBlocked', byOutcome.previewBlocked.length, "An environment event stopped each case below on the preview: its sign-in, the runner or the tenant, not the pull request's code. Run the cases again on the preview once the environment lets them through.");
    for (const red of byOutcome.previewBlocked) lines.push(`- ${caseLabel(red)} on ${red.domain} — ${stepLabel(red)} — \`${firstLine(red.error) || red.class}\``);
  }

  // Runner issues: the run service, the browser or the queue failed, not the app or the case.
  const runner = byOutcome.runner;
  section('runner', runner.length + stuck.length, runner.length + stuck.length ? 'The run service, the browser or the queue failed before the case could say anything about the app. Nothing to fix in the app or the case: re-run when the service is back.' : null);
  for (const red of runner) lines.push(`- ${caseLabel(red)} — ${stepLabel(red)} — \`${firstLine(red.error) || 'timed out with no failing step'}\``);
  for (const item of stuck) lines.push(`- ${item.name ?? item.testCaseId ?? item.id ?? item.executionId} (${item.id ?? item.executionId}) — still ${item.status ?? 'queued or running'}${item.startTime ? ` since ${item.startTime}` : ''}: a platform problem, not a failure`);

  // Environment: a sign-in, a tenant or a shared outage behind the reds.
  const environment = byOutcome.environment;
  section('environment', environment.length, environment.length ? 'The tenant, a session or a shared outage failed the cases, not the app under test and not the cases.' : null);
  for (const red of environment) lines.push(`- ${caseLabel(red)} — ${stepLabel(red)}${tag(red)} — \`${firstLine(red.error) || red.evidence || red.class}\`${red.evidence && red.evidence !== red.error ? ` — ${red.evidence}` : ''}`);

  // Flaky: failed once, passed on the single re-run.
  const flaky = byOutcome.flaky;
  section('flaky', flaky.length, flaky.length ? 'Failed in the run and passed on the one re-run. Counted, not fixed; a case here three times is a case to look at.' : null);
  for (const red of flaky) lines.push(`- ${caseLabel(red)} — ${stepLabel(red)}${tag(red)} — re-run ${typeof red.rerun === 'string' ? red.rerun : red.rerun?.executionId ?? '?'} passed`);

  // AI dependency: the outcome was the model's reply, its timing or its wording, not the app's.
  const ai = byOutcome.ai;
  section('ai', ai.length, ai.length ? "The red is at a step whose outcome a model decides: whether a reply or an artifact arrives, when, or what it says. Not a defect of the case or the app; a stub or LLM mocking removes it. Counted so the number is known." : null);
  for (const red of ai) lines.push(`- ${caseLabel(red)} — ${stepLabel(red)}${tag(red)}${red.evidence ? ` — ${red.evidence}` : ''}`);

  // Needs a person: the rules and the read did not decide.
  const person = byOutcome.person;
  section('person', person.length, person.length ? 'Neither the rules nor the evidence read decided these. Each line says what was seen.' : null);
  for (const red of person) {
    const open = residue.includes(red.executionId) && !red.verdict ? 'not decided' : red.verdict ?? 'Unknown';
    lines.push(`- ${caseLabel(red)} — ${stepLabel(red)}${tag(red)} — ${open}: ${red.class} — \`${firstLine(red.error)}\`${red.evidence ? ` — ${red.evidence}` : ''}`);
  }
  lines.push('');
  return lines.join('\n');
}

// ---- the survey run: journeys and coverage -------------------------------------------

/** The reasons app-test-author's Phase 1 step 4 allows for a behaviour left without a
 * scenario, and the discover loop's `minor`: a P3 item or an off-core variant its contract's
 * Priorities field leaves out. A not-covered row's reason starts with one of these; anything else
 * is a problem. */
export const NOT_COVERED_REASONS = Object.freeze([
  'requires pre-existing data; no creation path',
  'out of scope',
  'not expressible',
  'needs another person on a public app',
  'could not reach',
  'outside the cap or the named areas',
  'covered by existing case',
  'minor',
]);

/** Edge kinds. `walked` is the default: an action the survey took and saw land. `nav` is a
 * global navigation control, reachable from every surface: it may only start a journey, or
 * every page would be a path to every other page. `untouched` is a control the survey never
 * exercised (Phase 1 step 2: emails, pays, deletes others' data, settings): it is never part
 * of a journey and must be accounted for in a not-covered row. */
const EDGE_KINDS = new Set(['walked', 'nav', 'untouched']);
const byId = (left, right) => String(left.id).localeCompare(String(right.id), 'en', { numeric: true });
const numeric = (left, right) => String(left).localeCompare(String(right), 'en', { numeric: true });

/** The variant classes each kind of inventory item owes a scenario, over and above its normal
 * use (journeys.md, The variant table). They are the kinds of scenario a checklist adds to a
 * control a walk only saw working once: odd data on an input, odd use of a form, the states of
 * a list. A kind not listed here (a link, a button, a state) has no variants. A variant item's
 * id is `<inventory id>/<class>`, so a scenario or a not-covered row can name it. */
export const VARIANT_TABLE = Object.freeze({
  input: ['odd-data:emoji', 'odd-data:rtl', 'odd-data:html', 'odd-data:spaces', 'odd-data:long'],
  form: ['odd-use:double-submit', 'odd-use:reload-midway', 'odd-use:back-midway'],
  submit: ['odd-use:double-click'],
  list: ['state:empty', 'state:one-item'],
  toggle: ['state:on-off-on'],
  select: ['state:first-option', 'state:last-option'],
  tab: ['state:kept-after-return'],
});
export const VARIANT_LABELS = Object.freeze({
  'odd-data:emoji': 'odd data · emoji text',
  'odd-data:rtl': 'odd data · right-to-left text',
  'odd-data:html': 'odd data · HTML typed as text',
  'odd-data:spaces': 'odd data · leading and trailing spaces',
  'odd-data:long': 'odd data · very long text',
  'odd-use:double-submit': 'odd use · double submit sends once',
  'odd-use:reload-midway': 'odd use · reload half-way through',
  'odd-use:back-midway': 'odd use · Back half-way through',
  'odd-use:double-click': 'odd use · double-click acts once',
  'state:empty': 'state · empty',
  'state:one-item': 'state · one item',
  'state:on-off-on': 'state · on, off, on again',
  'state:first-option': 'state · first option',
  'state:last-option': 'state · last option',
  'state:kept-after-return': 'state · kept after leaving and returning',
});
/** Every kind an inventory item may carry: the kinds with variants, the kinds without (`pager` is a
 * list's Next, Prev or page number, whose next page is a state the walk owes), and `chrome`, which
 * is a defect (platform chrome is listed on the graph, never numbered). */
export const INVENTORY_KINDS = Object.freeze([...Object.keys(VARIANT_TABLE), 'pager', 'link', 'button', 'state', 'chrome', 'other']);
const NORMAL_USE = 'normal use';
const variantLabel = (variant) => (variant ? `${VARIANT_LABELS[variant.class] ?? variant.class}` : NORMAL_USE);

function graphOf(input) {
  const problems = [];
  const nodes = new Map();
  for (const node of input?.nodes ?? []) {
    if (!node?.id) problems.push('a node has no id');
    else if (nodes.has(node.id)) problems.push(`node ${node.id} is listed twice`);
    else nodes.set(node.id, node);
  }
  const edges = new Map();
  for (const edge of input?.edges ?? []) {
    if (!edge?.id) { problems.push('an edge has no id'); continue; }
    if (edges.has(edge.id)) { problems.push(`edge ${edge.id} is listed twice`); continue; }
    if (!nodes.has(edge.from)) problems.push(`edge ${edge.id}: from ${edge.from} is not a node`);
    if (!nodes.has(edge.to)) problems.push(`edge ${edge.id}: to ${edge.to} is not a node`);
    if (edge.kind !== undefined && !EDGE_KINDS.has(edge.kind)) problems.push(`edge ${edge.id}: kind ${edge.kind} is not walked, nav or untouched`);
    edges.set(edge.id, { kind: 'walked', ...edge });
  }
  const entry = (input?.entry ?? []).filter((id) => nodes.has(id));
  if (!entry.length) problems.push('entry names no node of the graph');
  const inventory = new Set();
  const owner = new Map();
  const kinds = new Map();
  for (const node of nodes.values()) {
    for (const id of node.inventory ?? []) { inventory.add(id); owner.set(id, node.id); }
    // A kind per id, when the walk recorded one: it decides the id's variants, and `chrome`
    // marks an id that should not exist (traversal.md, Platform chrome).
    for (const [id, kind] of Object.entries(node.inventoryKinds ?? {})) {
      if (!(node.inventory ?? []).includes(id)) problems.push(`node ${node.id}: inventoryKinds names ${id}, which is not in its inventory`);
      else if (!INVENTORY_KINDS.includes(kind)) problems.push(`node ${node.id}: ${id} has kind ${kind}, not one of ${INVENTORY_KINDS.join(', ')}`);
      else kinds.set(id, kind);
    }
  }
  const chrome = (input?.chrome ?? []).filter((item, index) => {
    if (item?.hook || item?.label) return true;
    problems.push(`chrome ${index + 1} has neither a hook nor a label`);
    return false;
  });
  // The create calls the walk observed, each a recipe a scenario may provision its setup
  // record with instead of walking a slow or model-made creation (traversal.md, Creation
  // walks and the request log).
  const provisioning = new Map();
  for (const recipe of input?.provisioning ?? []) {
    if (!recipe?.id) problems.push('a provisioning recipe has no id');
    else if (provisioning.has(recipe.id)) problems.push(`provisioning ${recipe.id} is listed twice`);
    else if (!recipe.method) problems.push(`provisioning ${recipe.id} has no method`);
    else if (!recipe.path) problems.push(`provisioning ${recipe.id} has no path`);
    else provisioning.set(recipe.id, recipe);
  }
  // A PRD's requirements, when the survey contract gave one (journeys.md, The graph file):
  // each is a behaviour the app is meant to have, observed live or not.
  const requirements = new Map();
  for (const requirement of input?.requirements ?? []) {
    if (!requirement?.id) problems.push('a requirement has no id');
    else if (requirements.has(requirement.id)) problems.push(`requirement ${requirement.id} is listed twice`);
    else if (!String(requirement.text ?? '').trim()) problems.push(`requirement ${requirement.id} has no text`);
    else requirements.set(requirement.id, requirement);
  }
  return { nodes, edges, entry, inventory, owner, kinds, chrome, provisioning, requirements, problems };
}

/** One recipe as the render names it: `P1 (POST /api/entity, 184 s through the agent)`. */
function provisionLabel(recipe) {
  const facts = [`${recipe.method} ${recipe.path}`];
  if (recipe.durationMs) facts.push(`${Math.round(recipe.durationMs / 1000)} s${recipe.viaAgent ? ' through the agent' : ''}`);
  else if (recipe.viaAgent) facts.push('through the agent');
  return `${recipe.id} (${facts.join(', ')})`;
}

/** The variant items of a graph, in id order then table order: `S2.2/odd-data:emoji`. */
function variantItemsOf({ inventory, kinds }) {
  const items = [];
  for (const id of [...inventory].sort(numeric)) for (const variantClass of VARIANT_TABLE[kinds.get(id)] ?? []) items.push(`${id}/${variantClass}`);
  return items;
}

/** Every maximal simple journey from an entry node, at most `maxEdges` edges long. A journey
 * follows walked edges to nodes it has not visited and ends where none is left, or at the
 * cap; a nav edge is taken only as a journey's first edge; an untouched edge never. A journey
 * that is the prefix of another is not listed. The order is by edge id, so two runs over one
 * graph list the same journeys with the same ids. */
export function enumerateJourneys(input, { maxEdges = 8, maxJourneys = 2000 } = {}) {
  const { nodes, edges, entry, problems } = graphOf(input);
  const out = new Map();
  for (const edge of [...edges.values()].sort(byId)) {
    if (edge.kind === 'untouched') continue;
    if (!out.has(edge.from)) out.set(edge.from, []);
    out.get(edge.from).push(edge);
  }
  const found = [];
  let overflow = false;
  const extend = (pathEdges, visited, at) => {
    if (overflow) return;
    const next = (out.get(at) ?? []).filter((edge) => edge.kind !== 'nav' && !visited.has(edge.to));
    if (!next.length || pathEdges.length >= maxEdges) {
      if (found.length >= maxJourneys) { overflow = true; return; }
      found.push(pathEdges);
      return;
    }
    for (const edge of next) extend([...pathEdges, edge.id], new Set([...visited, edge.to]), edge.to);
  };
  for (const start of entry) {
    for (const edge of (out.get(start) ?? []).filter((edge) => edge.to !== start)) {
      extend([edge.id], new Set([start, edge.to]), edge.to);
    }
  }
  if (overflow) problems.push(`more than ${maxJourneys} journeys: lower --max-edges, or mark the global navigation edges kind nav`);
  const journeys = found.map((pathEdges, index) => ({
    id: `J${index + 1}`,
    edges: pathEdges,
    nodes: [edges.get(pathEdges[0]).from, ...pathEdges.map((id) => edges.get(id).to)],
  }));
  return { journeys, nodeCount: nodes.size, problems };
}

function reasonOf(row) {
  const reason = String(row?.reason ?? '');
  return NOT_COVERED_REASONS.find((fixed) => reason === fixed || reason.startsWith(`${fixed}:`) || reason.startsWith(`${fixed};`) || reason.startsWith(`${fixed} `)) ?? null;
}

/** Is every edge of a journey walked by some scenario? That is edge coverage, the stop condition
 * model-based testing uses: a route is covered once each of its steps has been taken, whichever
 * scenarios take them. Asking one scenario (or a chain joined end to start) to hold the whole
 * journey made every second route to a state a second scenario of the same check. */
function journeyCovered(journey, walkedEdges) {
  return journey.edges.every((edgeId) => walkedEdges.has(edgeId));
}

/** The coverage layers of a scenario list against the survey's graph: every surface
 * (node), transition (edge), behaviour (inventory id), variant (id/class, when the graph has
 * kinds) and journey is in a scenario, or in a not-covered row with a fixed reason; an item in
 * neither is missing, an item in both is a problem. A scenario checks one behaviour, and two
 * scenarios never make the same check on the same surface by different paths. `complete` is
 * true only when nothing is missing and there is no problem. */
export function surveyCoverage(graph, list, { maxEdges = 8, maxJourneys } = {}) {
  const { nodes, edges, inventory, owner, kinds, provisioning, requirements, problems } = graphOf(graph);
  const enumerated = enumerateJourneys(graph, { maxEdges, maxJourneys });
  problems.push(...enumerated.problems.filter((problem) => !problems.includes(problem)));
  const journeys = new Map(enumerated.journeys.map((journey) => [journey.id, journey]));
  const variants = new Set(variantItemsOf({ inventory, kinds }));
  const covered = { nodes: new Set(), edges: new Set(), inventory: new Set(), variants: new Set(), journeys: new Set(), requirements: new Set() };
  const accounted = { nodes: new Set(), edges: new Set(), inventory: new Set(), variants: new Set(), journeys: new Set(), requirements: new Set() };
  const keys = new Set();
  // The check each scenario makes: one behaviour, on one surface, as one set of roles, in one
  // variant. A second scenario with the same four is the same check reached another way.
  const checks = new Map();
  for (const scenario of list?.scenarios ?? []) {
    const key = String(scenario?.key ?? '');
    if (!key) problems.push('a scenario has no key');
    else if (keys.has(key)) problems.push(`scenario ${key} is listed twice`);
    keys.add(key);
    const path = Array.isArray(scenario?.path) ? scenario.path : [];
    path.forEach((edgeId, index) => {
      const edge = edges.get(edgeId);
      if (!edge) { problems.push(`scenario ${key}: path names unknown edge ${edgeId}`); return; }
      if (edge.kind === 'untouched') problems.push(`scenario ${key}: path takes untouched edge ${edgeId}`);
      const previous = index ? edges.get(path[index - 1]) : null;
      if (previous && previous.to !== edge.from) problems.push(`scenario ${key}: ${previous.id} ends at ${previous.to} but ${edge.id} starts at ${edge.from}`);
      covered.edges.add(edge.id);
      covered.nodes.add(edge.from);
      covered.nodes.add(edge.to);
    });
    for (const id of scenario?.covers ?? []) {
      if (nodes.has(id)) covered.nodes.add(id);
      else if (inventory.has(id)) covered.inventory.add(id);
      else if (requirements.has(id)) covered.requirements.add(id);
      else problems.push(`scenario ${key}: covers unknown id ${id}`);
    }
    // A PRD-only scenario describes a behaviour the walk did not see: it must name the
    // requirement it comes from, and it is the one kind of scenario allowed to walk no edge.
    if (scenario?.source === 'prd' && !(scenario.covers ?? []).some((id) => requirements.has(id))) {
      problems.push(`scenario ${key}: source prd but covers no requirement id`);
    }
    if (!path.length && !(scenario?.covers ?? []).length) problems.push(`scenario ${key}: covers nothing and walks no edge`);
    for (const recipe of scenario?.provision ?? []) if (!provisioning.has(recipe)) problems.push(`scenario ${key}: provision names unknown recipe ${recipe}`);
    // One behaviour per scenario, so a red names one thing (SKILL.md, Propose).
    const behaviours = (scenario?.covers ?? []).filter((id) => inventory.has(id));
    if (behaviours.length > 1) problems.push(`scenario ${key} checks ${behaviours.length} behaviours (${behaviours.join(', ')}); one per scenario`);
    for (const id of behaviours) if (kinds.get(id) === 'chrome') problems.push(`${id} is platform chrome; remove it from the inventory and list it under chrome`);
    // A variant is the same control checked with another kind of input or use; it names the id
    // it varies and a class the id's kind has.
    const variant = scenario?.variant;
    if (variant) {
      const kind = kinds.get(variant.of);
      if (!inventory.has(variant.of)) problems.push(`scenario ${key}: variant of unknown id ${variant.of}`);
      else if (!behaviours.includes(variant.of)) problems.push(`scenario ${key}: variant of ${variant.of}, but covers does not name it`);
      else if (!VARIANT_TABLE[kind]) problems.push(`scenario ${key}: ${variant.of} is ${kind ? `a ${kind}` : 'of no kind'}, which has no variants`);
      else if (!VARIANT_TABLE[kind].includes(variant.class)) problems.push(`scenario ${key}: ${variant.class} is not a variant class of kind ${kind}`);
      else covered.variants.add(`${variant.of}/${variant.class}`);
    }
    if (behaviours.length === 1) {
      const last = path.length ? edges.get(path.at(-1)) : null;
      const endsAt = last ? last.to : owner.get(behaviours[0]);
      const check = [behaviours[0], endsAt, (scenario?.roles ?? []).join(','), variant ? `${variant.of}/${variant.class}` : ''].join('|');
      if (checks.has(check)) problems.push(`scenario ${key} repeats scenario ${checks.get(check)}'s check of ${behaviours[0]} at ${endsAt} by another path`);
      else checks.set(check, key);
    }
  }
  for (const journey of journeys.values()) if (journeyCovered(journey, covered.edges)) covered.journeys.add(journey.id);
  (list?.notCovered ?? []).forEach((row, index) => {
    if (!reasonOf(row)) problems.push(`not-covered row ${index + 1}: reason "${row?.reason ?? ''}" does not start with a fixed reason`);
    const items = [...(row?.nodes ?? []), ...(row?.edges ?? []), ...(row?.ids ?? []), ...(row?.variants ?? []), ...(row?.journeys ?? []), ...(row?.requirements ?? [])];
    if (!items.length) problems.push(`not-covered row ${index + 1}: names no node, edge, id or journey`);
    for (const item of items) {
      const layer = nodes.has(item) ? 'nodes' : edges.has(item) ? 'edges' : inventory.has(item) ? 'inventory' : variants.has(item) ? 'variants' : journeys.has(item) ? 'journeys' : requirements.has(item) ? 'requirements' : null;
      if (!layer) { problems.push(`not-covered row ${index + 1}: ${item} is not in the graph`); continue; }
      if (covered[layer].has(item)) problems.push(`${item} is in a scenario and in a not-covered row`);
      accounted[layer].add(item);
    }
  });
  // An untouched edge, and a journey none of whose edges can be walked, need a row; a node
  // every path avoids needs a row too.
  const layerOf = (name, ids) => {
    const missing = ids.filter((id) => !covered[name].has(id) && !accounted[name].has(id));
    return { total: ids.length, covered: covered[name].size, notCovered: accounted[name].size, missing };
  };
  const layers = {
    nodes: layerOf('nodes', [...nodes.keys()].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))),
    edges: layerOf('edges', [...edges.keys()].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))),
    inventory: layerOf('inventory', [...inventory].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))),
    // The Variants layer exists only when the walk recorded kinds, so a graph without them reads as before.
    ...(variants.size ? { variants: layerOf('variants', [...variants]) } : {}),
    journeys: layerOf('journeys', [...journeys.keys()]),
    // The Requirements layer exists only when a PRD was given, so a run without one reads as before.
    ...(requirements.size ? { requirements: layerOf('requirements', [...requirements.keys()].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))) } : {}),
  };
  const complete = problems.length === 0 && Object.values(layers).every((layer) => layer.missing.length === 0);
  return { complete, layers, journeys: enumerated.journeys, problems };
}

const LAYER_NAMES = { nodes: 'Surfaces', edges: 'Transitions', inventory: 'Behaviours', variants: 'Variants', journeys: 'Journeys', requirements: 'Requirements' };
const layerNamesOf = (layers) => Object.entries(LAYER_NAMES).filter(([key]) => layers[key]);

/** The Coverage line the loop quotes: one clause per layer, in a fixed order. */
export function coverageLine(layers) {
  const clauses = layerNamesOf(layers).map(([key, name]) => `${layers[key].covered} of ${layers[key].total} ${name.toLowerCase()}`);
  const notCovered = Object.values(layers).reduce((sum, layer) => sum + layer.notCovered, 0);
  const missing = Object.values(layers).reduce((sum, layer) => sum + layer.missing.length, 0);
  return `Coverage: ${clauses.join(', ')} have a scenario; ${notCovered} not covered, each with a reason${missing ? `; ${missing} MISSING` : ''}.`;
}

const LAYER_SINGULAR = { Surfaces: 'surface', Transitions: 'transition', Behaviours: 'behaviour', Variants: 'variant', Journeys: 'journey', Requirements: 'requirement' };
const percentOf = (covered, total) => (total ? Math.round((covered / total) * 100) : 100);
const countOf = (count, name) => `${count} ${LAYER_SINGULAR[name]}${count === 1 ? '' : 's'}`;
const SUMMARY_DETAILS = 4;

/** What the person is told after a run: each layer's share with a scenario, behaviours as the
 * headline, and every not-covered item grouped by its fixed reason with the layers it falls in
 * and the details the rows gave. Computed by the same check as everything else. */
export function coverageSummary(graph, list, { app, maxEdges = 8, maxJourneys } = {}) {
  const coverage = surveyCoverage(graph, list, { maxEdges, maxJourneys });
  const { nodes, edges, inventory, kinds, requirements } = graphOf(graph);
  const variants = new Set(variantItemsOf({ inventory, kinds }));
  const journeyIds = new Set(coverage.journeys.map((journey) => journey.id));
  const layers = layerNamesOf(coverage.layers).map(([key, name]) => {
    const layer = coverage.layers[key];
    return { key, name, total: layer.total, covered: layer.covered, notCovered: layer.notCovered, missing: layer.missing.length, percent: percentOf(layer.covered, layer.total) };
  });
  const behaviours = coverage.layers.inventory;
  const headline = { name: 'behaviours', covered: behaviours.covered, total: behaviours.total, percent: percentOf(behaviours.covered, behaviours.total) };
  const layerOfItem = (item) => (nodes.has(item) ? 'Surfaces' : edges.has(item) ? 'Transitions' : inventory.has(item) ? 'Behaviours' : variants.has(item) ? 'Variants' : journeyIds.has(item) ? 'Journeys' : requirements.has(item) ? 'Requirements' : null);
  const grouped = new Map();
  for (const row of list?.notCovered ?? []) {
    const fixed = reasonOf(row) ?? String(row?.reason ?? '');
    const detail = String(row?.reason ?? '').slice(fixed.length).replace(/^[\s:;]+/u, '').trim();
    if (!grouped.has(fixed)) grouped.set(fixed, { reason: fixed, items: 0, layers: {}, details: [] });
    const entry = grouped.get(fixed);
    for (const item of [...(row?.nodes ?? []), ...(row?.edges ?? []), ...(row?.ids ?? []), ...(row?.variants ?? []), ...(row?.journeys ?? []), ...(row?.requirements ?? [])]) {
      const layer = layerOfItem(item);
      if (!layer) continue;
      entry.items += 1;
      entry.layers[layer] = (entry.layers[layer] ?? 0) + 1;
    }
    if (detail && !entry.details.includes(detail)) entry.details.push(detail);
  }
  const reasons = [...grouped.values()].sort((left, right) => right.items - left.items || left.reason.localeCompare(right.reason));
  return {
    complete: coverage.complete,
    app: app ?? null,
    layers,
    headline,
    reasons,
    notCovered: reasons.reduce((sum, row) => sum + row.items, 0),
    missing: layers.reduce((sum, layer) => sum + layer.missing, 0),
    problems: coverage.problems.length,
  };
}

/** The summary as the loop's last message and the report print it: one line of shares, then
 * one line per reason, most items first. */
export function renderCoverageSummary(summary) {
  const { headline } = summary;
  const others = summary.layers.filter((layer) => layer.key !== 'inventory').map((layer) => `${layer.covered} of ${layer.total} ${layer.name.toLowerCase()} (${layer.percent}%)`);
  const lines = [`Coverage of ${summary.app || 'the app'}: ${headline.covered} of ${headline.total} ${headline.name} (${headline.percent}%) have a scenario; ${others.join(', ')}.`];
  if (!summary.reasons.length) lines.push(summary.complete ? 'Not covered: nothing; every item has a scenario.' : 'Not covered: nothing is in a row yet.');
  else {
    lines.push(`Not covered: ${summary.notCovered} items, by reason:`);
    for (const row of summary.reasons) {
      const parts = Object.values(LAYER_NAMES).filter((name) => row.layers[name]).map((name) => countOf(row.layers[name], name));
      // Four details at most on one line: the report's table has every row.
      const shown = row.details.slice(0, SUMMARY_DETAILS);
      const more = row.details.length - shown.length;
      const details = shown.length ? `: ${shown.join('; ')}${more ? `; and ${more} more row${more === 1 ? '' : 's'} in the report` : ''}` : '';
      lines.push(`- ${row.reason} — ${row.items} (${parts.join(', ')})${details}`);
    }
  }
  if (!summary.complete) lines.push(`Check: not complete — ${summary.missing} items missing${summary.problems ? `, ${summary.problems} problems` : ''}.`);
  return `${lines.join('\n')}\n`;
}

/** The scenario list as app-test-author reads it: a run header, `## <Module>`, `### <Feature>`
 * and `#### <Scenario group>` headings with numbered entries, then the Coverage table and the
 * not-covered rows, both computed from the same check, so the table always adds up. A scenario
 * with no `module` (a file written before modules) is filed under `app`, the app's name. */
export function renderSurveyScenarios(graph, list, { header = '', app, maxEdges = 8, maxJourneys } = {}) {
  const coverage = surveyCoverage(graph, list, { maxEdges, maxJourneys });
  const { provisioning } = graphOf(graph);
  const lines = [];
  if (header) lines.push(header.trim(), '');
  const modules = new Map();
  const groupOf = (map, name) => {
    if (!map.has(name)) map.set(name, new Map());
    return map.get(name);
  };
  for (const scenario of list?.scenarios ?? []) {
    const features = groupOf(modules, scenario.module ?? app ?? 'Uncategorised');
    const groups = groupOf(features, scenario.feature ?? 'Uncategorised');
    const group = scenario.scenarioGroup ?? 'General';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(scenario);
  }
  let number = 0;
  for (const [module, features] of modules) {
    lines.push(`## ${module}`, '');
    for (const [feature, groups] of features) {
      lines.push(`### ${feature}`, '');
      for (const [group, scenarios] of groups) {
        lines.push(`#### ${group}`, '');
        for (const scenario of scenarios) {
          number += 1;
          const bits = [scenario.priority ?? 'P2', `starts at ${scenario.startingUrl ?? graph.appUrl ?? ''}`];
          lines.push(`${number}. **${scenario.title}** (${scenario.key}) — ${bits.join(' — ')}  `);
          for (const step of stepsOf(scenario.description)) lines.push(`   - ${step}`);
          lines.push('');
          const facts = [];
          if (scenario.source === 'prd') facts.push(`PRD only: ${(scenario.covers ?? []).filter((id) => /^R\d+$/u.test(id)).join(', ')} — not observed live, expected red until the app does this`);
          if (scenario.roles?.length) facts.push(`Roles: ${scenario.roles.join(', ')}`);
          if (scenario.variant) facts.push(`Variant: ${variantLabel(scenario.variant)}, of ${scenario.variant.of}`);
          if (scenario.provision?.length) facts.push(`Provision: ${scenario.provision.map((id) => (provisioning.has(id) ? provisionLabel(provisioning.get(id)) : id)).join(', ')}`);
          if (scenario.covers?.length) facts.push(`Covers: ${scenario.covers.join(', ')}`);
          if (scenario.path?.length) facts.push(`Path: ${scenario.path.join(' → ')}`);
          if (facts.length) lines.push(`   ${facts.join(' · ')}`);
          lines.push('');
        }
      }
    }
  }
  lines.push('## Coverage', '', '| Layer | Total | In a scenario | Not covered | Missing |', '|---|---|---|---|---|');
  for (const [key, name] of layerNamesOf(coverage.layers)) {
    const layer = coverage.layers[key];
    lines.push(`| ${name} | ${layer.total} | ${layer.covered} | ${layer.notCovered} | ${layer.missing.length ? layer.missing.join(', ') : '0'} |`);
  }
  lines.push('', coverageLine(coverage.layers), '');
  lines.push('## Not covered, and why', '');
  const rows = list?.notCovered ?? [];
  if (!rows.length) lines.push('Nothing: every surface, transition, behaviour and journey has a scenario.', '');
  else {
    const withRequirements = Boolean(coverage.layers.requirements);
    const withVariants = Boolean(coverage.layers.variants);
    const variantsOf = (row) => [...(row.variants ?? []), ...(row.ids ?? []).filter((id) => id.includes('/'))];
    const idsOf = (row) => (row.ids ?? []).filter((id) => !id.includes('/'));
    lines.push(`| Reason | Surfaces | Transitions | Behaviours |${withVariants ? ' Variants |' : ''} Journeys |${withRequirements ? ' Requirements |' : ''}`, `|---|---|---|---|${withVariants ? '---|' : ''}---|${withRequirements ? '---|' : ''}`);
    for (const row of rows) {
      const cell = (items) => (items?.length ? items.join(', ') : '—');
      lines.push(`| ${row.reason} | ${cell(row.nodes)} | ${cell(row.edges)} | ${cell(idsOf(row))} |${withVariants ? ` ${cell(variantsOf(row))} |` : ''} ${cell(row.journeys)} |${withRequirements ? ` ${cell(row.requirements)} |` : ''}`);
    }
    lines.push('');
  }
  if (graph?.chrome?.length) {
    lines.push('## Platform chrome, not surveyed', '');
    for (const item of graph.chrome) {
      const bits = [item.label ?? item.hook, item.label && item.hook ? `\`${item.hook}\`` : null, item.seenOn?.length ? `seen on ${item.seenOn.join(', ')}` : null].filter(Boolean);
      lines.push(`- ${bits[0]}${bits.length > 1 ? ` — ${bits.slice(1).join(', ')}` : ''}`);
    }
    lines.push('');
  }
  if (!coverage.complete) {
    const missing = layerNamesOf(coverage.layers).filter(([key]) => coverage.layers[key].missing.length)
      .map(([key, name]) => `- ${coverage.layers[key].missing.length} ${name.toLowerCase()} in no scenario and no row: ${coverage.layers[key].missing.join(', ')}`);
    lines.push('## Problems the check found', '', ...coverage.problems.map((problem) => `- ${problem}`), ...missing, '');
  }
  return { markdown: `${lines.join('\n').trimEnd()}\n`, coverage };
}

// ---- the discover loop's review sheet: one row per scenario, two columns for the reviewers --------

/** The columns of the review sheet, in order, and the one added after Title when the list names
 * more than one set of roles. The last two are the reviewers': Decision (one of
 * SHEET_DECISION_OPTIONS, or blank) and Comments (what to change, or why it was rejected).
 * Priority, starting URL, covers, path and source stay in `scenarios.json` and `scenarios.md`:
 * the sheet shows what a reviewer decides on, and its order says the priority. */
export const SURVEY_SHEET_COLUMNS = ['Key', 'Module', 'Feature', 'Scenario group', 'Title', 'Description', 'Decision', 'Comments'];
export const SURVEY_SHEET_ROLES_COLUMN = 'Roles';
/** Added after Scenario group when any scenario is a variant: the kind of scenario, `normal use`
 * or the variant's label, so a reviewer sees the odd-data and odd-use rows for what they are. */
export const SURVEY_SHEET_KIND_COLUMN = 'Kind';
export const SHEET_DECISION_OPTIONS = ['Approved', 'Rejected', 'Changes required'];
export const SHEET_DECISIONS = {
  approved: ['approved', 'approve', 'yes', 'ok', 'accept', 'accepted'],
  rejected: ['rejected', 'reject', 'no', 'decline', 'declined'],
  changes: ['changes required', 'changes requested', 'changes needed', 'needs changes', 'change', 'changes', 'rework'],
};
const SHEET_WIDTHS = { Key: 7, Module: 16, Feature: 18, 'Scenario group': 20, Kind: 22, Title: 32, Roles: 18, Description: 70, Decision: 18, Comments: 40 };
const PRIORITY_RANK = { P1: 1, P2: 2, P3: 3 };
const STEP_BULLET = '• ';

/** One CSV cell: quoted when it holds a comma, a quote or a line break, and prefixed with `'`
 * when it starts with a formula character, so a spreadsheet never runs text as a formula. */
export function csvCell(value) {
  let text = String(value ?? '').replace(/\r\n?/gu, '\n');
  if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return /[",\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

/** A scenario's description as its steps: one per line when it is written as lines (a leading
 * `-`, `*`, `•` or number is dropped), else one per sentence. The last step is the outcome. */
export function stepsOf(description) {
  const text = String(description ?? '').replace(/\r\n?/gu, '\n').trim();
  if (!text) return [];
  const lines = text.split('\n').map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/u, '').trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  return lines[0].split(/(?<=[.!?])\s+(?=[A-Z"'(])/u).map((part) => part.trim()).filter(Boolean);
}

/** The scenarios most important first: by priority (P1 before P2 before P3), then by how much
 * of the app passes through the surface the scenario checks (the number of journeys through the
 * surfaces that own its covered ids, or that its path lands on: a navigation everything goes
 * through outranks a corner), then by key. Deterministic, so two runs agree. */
export function orderByImportance(graph, list, { maxEdges = 8, maxJourneys } = {}) {
  const { nodes, edges } = graphOf(graph);
  const { journeys } = enumerateJourneys(graph, { maxEdges, maxJourneys });
  const through = new Map();
  for (const journey of journeys) for (const node of new Set(journey.nodes)) through.set(node, (through.get(node) ?? 0) + 1);
  const owner = new Map();
  for (const node of nodes.values()) for (const id of node.inventory ?? []) owner.set(id, node.id);
  const reachOf = (scenario) => {
    const checked = new Set();
    for (const id of scenario.covers ?? []) checked.add(nodes.has(id) ? id : owner.get(id));
    const last = (scenario.path ?? []).at(-1);
    if (last && edges.has(last)) checked.add(edges.get(last).to);
    checked.delete(undefined);
    return Math.max(0, ...[...checked].map((node) => through.get(node) ?? 0));
  };
  const keyOrder = (left, right) => String(left.key ?? '').localeCompare(String(right.key ?? ''), 'en', { numeric: true });
  return [...(list?.scenarios ?? [])]
    .map((scenario) => ({ scenario, priority: PRIORITY_RANK[scenario.priority] ?? 2, reach: reachOf(scenario) }))
    .sort((left, right) => left.priority - right.priority || right.reach - left.reach || keyOrder(left.scenario, right.scenario))
    .map((entry) => entry.scenario);
}

/** The review sheet: the scenarios module by module, in the order `scenarios.md` lists the
 * modules, and most important first within each (`orderByImportance`), one row each, the
 * description as bulleted steps, Decision and Comments empty. `csv` is the same rows as
 * text; `xlsx` the workbook Google Drive turns into a Sheet with a bold frozen header, wrapped
 * cells and a dropdown of SHEET_DECISION_OPTIONS on Decision. Every fact comes from the scenario
 * file; the sheet never carries the not-covered rows, which stay in `scenarios.md`. */
export function renderSurveySheet(graph, list, { appUrl, app, maxEdges = 8, maxJourneys } = {}) {
  const coverage = surveyCoverage(graph, list, { maxEdges, maxJourneys });
  // A scenario with no module (written before modules) is filed under the app.
  const moduleOf = (scenario) => scenario.module ?? app ?? 'Uncategorised';
  const byImportance = orderByImportance(graph, list, { maxEdges, maxJourneys });
  const modules = [...new Set((list?.scenarios ?? []).map(moduleOf))];
  const ordered = modules.flatMap((module) => byImportance.filter((scenario) => moduleOf(scenario) === module));
  const roleSets = new Set(ordered.map((scenario) => (scenario.roles ?? []).join(', ')));
  const withRoles = roleSets.size > 1;
  const withKind = ordered.some((scenario) => scenario.variant);
  const columns = SURVEY_SHEET_COLUMNS.flatMap((name) => {
    if (name === 'Scenario group' && withKind) return [name, SURVEY_SHEET_KIND_COLUMN];
    if (name === 'Title' && withRoles) return [name, SURVEY_SHEET_ROLES_COLUMN];
    return [name];
  });
  const rows = ordered.map((scenario) => {
    const cells = {
      Key: scenario.key, Module: moduleOf(scenario), Feature: scenario.feature ?? 'Uncategorised', 'Scenario group': scenario.scenarioGroup ?? 'General', Title: scenario.title,
      Kind: variantLabel(scenario.variant),
      Roles: (scenario.roles ?? []).join(', '),
      Description: stepsOf(scenario.description).map((step) => `${STEP_BULLET}${step}`).join('\n'),
      Decision: '', Comments: '',
    };
    return columns.map((name) => cells[name] ?? '');
  });
  const csv = `${[columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
  const xlsx = buildXlsx({ columns, rows, dropdown: { column: 'Decision', options: SHEET_DECISION_OPTIONS }, widths: SHEET_WIDTHS });
  return { csv, xlsx, coverage, count: ordered.length, columns, appUrl: appUrl ?? graph?.appUrl ?? '' };
}

/** A CSV text as rows of cells (RFC 4180: quoted cells may hold commas, quotes and line breaks). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text ?? '').replace(/^﻿/u, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = false;
      else if (char === '\r' && source[i + 1] === '\n') { cell += '\n'; i += 1; } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((cells) => cells.some((item) => item.trim() !== ''));
}

/** The reviewers' decisions, from the sheet exported as CSV: each row by its Key, with the
 * decision read case-insensitively (`approved`, `rejected`, `changes` for Changes required,
 * blank = `pending`), its comment, the row's current title and description (the bullets
 * dropped), which a reviewer may have edited in place, and its grouping (`module` is absent on
 * a sheet exported before the Module column). `reviewed` is false when no row carries a
 * decision: the sheet was never reviewed, and the create loop takes every scenario as it does
 * from `scenarios.md`. */
export function readSurveySheet(text) {
  const rows = parseCsv(text);
  const problems = [];
  const empty = { approved: 0, rejected: 0, changes: 0, pending: 0 };
  if (!rows.length) return { reviewed: false, scenarios: [], counts: { ...empty }, problems: ['the sheet is empty'] };
  const header = rows[0].map((name) => name.trim().toLowerCase());
  const column = (name) => header.indexOf(name.toLowerCase());
  for (const name of ['Key', 'Title', 'Decision', 'Comments']) if (column(name) < 0) problems.push(`no ${name} column`);
  if (problems.length) return { reviewed: false, scenarios: [], counts: { ...empty }, problems };
  const at = (cells, name) => (column(name) >= 0 ? String(cells[column(name)] ?? '').trim() : '');
  const seen = new Set();
  const scenarios = rows.slice(1).map((cells, index) => {
    const key = at(cells, 'Key');
    if (!key) problems.push(`row ${index + 2}: no key`);
    else if (seen.has(key)) problems.push(`row ${index + 2}: key ${key} appears twice`);
    seen.add(key);
    const word = at(cells, 'Decision').toLowerCase();
    let decision = 'pending';
    if (SHEET_DECISIONS.approved.includes(word)) decision = 'approved';
    else if (SHEET_DECISIONS.rejected.includes(word)) decision = 'rejected';
    else if (SHEET_DECISIONS.changes.includes(word)) decision = 'changes';
    else if (word) problems.push(`row ${index + 2} (${key}): decision "${at(cells, 'Decision')}" is none of ${SHEET_DECISION_OPTIONS.join(', ')}; read as pending`);
    const comments = at(cells, 'Comments');
    if (decision === 'changes' && !comments) problems.push(`row ${index + 2} (${key}): Changes required, but Comments does not say what to change`);
    return {
      key, decision, comments, title: at(cells, 'Title'), description: stepsOf(at(cells, 'Description')).join('\n'),
      module: at(cells, 'Module') || undefined, feature: at(cells, 'Feature'), scenarioGroup: at(cells, 'Scenario group'), priority: at(cells, 'Priority'),
      roles: at(cells, 'Roles').split(',').map((item) => item.trim()).filter(Boolean), startingUrl: at(cells, 'Starting URL'),
    };
  });
  const count = (decision) => scenarios.filter((item) => item.decision === decision).length;
  return { reviewed: scenarios.some((item) => item.decision !== 'pending'), scenarios, counts: { approved: count('approved'), rejected: count('rejected'), changes: count('changes'), pending: count('pending') }, problems };
}

// ---- the ticket loop: one ticket per root cause ---------------------------------

/** Why a confirmed App bug may be left without a ticket of this firing. */
export const NOT_TICKETED_REASONS = Object.freeze(['already filed', 'not confirmed', 'person declined']);
const FINGERPRINT = /^[a-z0-9]+(?:-[a-z0-9]+){1,11}$/u;

/** The App bug reds of a classification. */
export function confirmedBugs(classified) {
  return (classified?.reds ?? []).filter((red) => red.verdict === 'App bug');
}

/** The two kinds of ticket and the verdict each holds: a `bug` ticket asks a developer to fix
 * a confirmed App bug; a `product` ticket asks the area's owner whether a change was meant,
 * for the cases held because the app no longer does what their description says. */
export const TICKET_KINDS = Object.freeze({ bug: 'App bug', product: 'Product question' });

/** The reds a ticket run has to account for: every confirmed App bug and every Product question. */
export function ticketable(classified) {
  const verdicts = new Set(Object.values(TICKET_KINDS));
  // A red on a branch preview is the pull request's to fix before it merges, never a ticket.
  return (classified?.reds ?? []).filter((red) => verdicts.has(red.verdict) && !isPreviewRed(red));
}

/** A tickets file is complete when every App bug and Product question execution of the
 * firing is in exactly one ticket of its kind, or in a not-ticketed row with a fixed reason,
 * and every ticket carries what a person needs to act: a fingerprint, a title, the root cause,
 * expected and observed, at least one case and at least one piece of evidence. One ticket per
 * root cause, never per case: a ticket with one case is allowed, a case in two tickets is not. */
export function ticketsCheck(list, classified) {
  const problems = [];
  const bugs = ticketable(classified);
  const bugIds = new Set(bugs.map((red) => red.executionId));
  const previewOf = new Map((classified?.reds ?? []).filter(isPreviewRed).map((red) => [red.executionId, red.domain]));
  const notOurs = (executionId) => (previewOf.has(executionId)
    ? `${executionId} ran on a branch preview (${previewOf.get(executionId)}): its pull request fixes it; never ticketed`
    : `${executionId} is not a confirmed App bug or Product question of this firing`);
  const verdictOf = new Map(bugs.map((red) => [red.executionId, red.verdict]));
  const seenCase = new Map();
  const fingerprints = new Set();
  const tickets = Array.isArray(list?.tickets) ? list.tickets : [];
  tickets.forEach((ticket, index) => {
    const label = ticket?.fingerprint ? `ticket ${ticket.fingerprint}` : `ticket ${index + 1}`;
    if (!FINGERPRINT.test(String(ticket?.fingerprint ?? ''))) problems.push(`${label}: fingerprint must be 2 to 12 lowercase words joined by hyphens`);
    else if (fingerprints.has(ticket.fingerprint)) problems.push(`${label}: fingerprint is used twice`);
    fingerprints.add(ticket?.fingerprint);
    const title = String(ticket?.title ?? '').trim();
    if (!title) problems.push(`${label}: no title`);
    else if (title.length > 120) problems.push(`${label}: title over 120 characters`);
    for (const field of ['rootCause', 'expected', 'observed']) {
      if (!String(ticket?.[field] ?? '').trim()) problems.push(`${label}: no ${field}`);
    }
    if (!Array.isArray(ticket?.cases) || !ticket.cases.length) problems.push(`${label}: names no case`);
    if (!Array.isArray(ticket?.evidence) || !ticket.evidence.length) problems.push(`${label}: names no evidence`);
    if (ticket?.priority !== undefined && !['low', 'medium', 'high', 'urgent'].includes(ticket.priority)) problems.push(`${label}: priority must be low, medium, high or urgent`);
    const kind = ticket?.kind ?? 'bug';
    if (!TICKET_KINDS[kind]) problems.push(`${label}: kind must be ${Object.keys(TICKET_KINDS).join(' or ')}`);
    // A UI+BE ticket goes to the module's BE and UI owner both (ticket.md, Who is assigned);
    // every other layer has one owner.
    if (Array.isArray(ticket?.assignee)) {
      const names = ticket.assignee.map((name) => String(name ?? '').trim());
      if (ticket.layer !== 'UI+BE') problems.push(`${label}: only a UI+BE ticket has two assignees`);
      else if (names.length !== 2 || names.some((name) => !name) || names[0] === names[1]) problems.push(`${label}: a UI+BE ticket's assignee list names the BE owner and the UI owner, two different people`);
    }
    for (const executionId of ticket?.cases ?? []) {
      if (!bugIds.has(executionId)) problems.push(`${label}: ${notOurs(executionId)}`);
      else if (TICKET_KINDS[kind] && verdictOf.get(executionId) !== TICKET_KINDS[kind]) problems.push(`${label}: ${executionId} is a ${verdictOf.get(executionId)}, so it belongs in a ${verdictOf.get(executionId) === TICKET_KINDS.product ? 'product' : 'bug'} ticket`);
      if (seenCase.has(executionId)) problems.push(`${executionId} is in ${seenCase.get(executionId)} and ${label}`);
      seenCase.set(executionId, label);
    }
  });
  (list?.notTicketed ?? []).forEach((row, index) => {
    const reason = String(row?.reason ?? '');
    if (!NOT_TICKETED_REASONS.some((fixed) => reason === fixed || reason.startsWith(`${fixed} `) || reason.startsWith(`${fixed}:`))) {
      problems.push(`not-ticketed row ${index + 1}: reason "${reason}" does not start with one of ${NOT_TICKETED_REASONS.join(', ')}`);
    }
    if (!bugIds.has(row?.executionId)) problems.push(`not-ticketed row ${index + 1}: ${notOurs(row?.executionId)}`);
    if (seenCase.has(row?.executionId)) problems.push(`${row?.executionId} is in ${seenCase.get(row?.executionId)} and a not-ticketed row`);
    seenCase.set(row?.executionId, `not-ticketed row ${index + 1}`);
  });
  const missing = bugs.filter((red) => !seenCase.has(red.executionId)).map((red) => red.executionId);
  return {
    complete: problems.length === 0 && missing.length === 0,
    tickets: tickets.length,
    cases: { total: bugs.length, ticketed: tickets.reduce((sum, ticket) => sum + (ticket?.cases?.length ?? 0), 0), notTicketed: (list?.notTicketed ?? []).length, missing },
    problems,
  };
}

/** One ticket's description, in markdown a tracker takes (no headings: a bold line stands
 * for a section). Every fact comes from the tickets file and the classification. */
export function ticketBody(ticket, classified, { runId, firingId, appUrl, reportPath } = {}) {
  const byId = new Map((classified?.reds ?? []).map((red) => [red.executionId, red]));
  const lines = [];
  const product = ticket.kind === 'product';
  lines.push(product ? '**What changed**' : '**Root cause**', '', String(ticket.rootCause).trim(), '');
  lines.push(product ? '**The test cases expect**' : '**Expected**', '', String(ticket.expected).trim(), '');
  lines.push(product ? '**The app now**' : '**Observed**', '', String(ticket.observed).trim(), '');
  if (product) {
    lines.push('**Question**', '', String(ticket.question ?? '').trim() || 'Is this change intended? If yes, the held cases are rewritten to the new behaviour or retired; if not, it is a regression to fix.', '');
  }
  if (ticket.reproduce?.length) lines.push('**To reproduce**', '', ...ticket.reproduce.map((step, index) => `${index + 1}. ${step}`), '');
  if (ticket.related?.length) lines.push('**Related**', '', ...ticket.related.map((item) => `- ${item}`), '');
  lines.push(`**${product ? 'Held' : 'Failing'} test cases (${ticket.cases.length})**`, '');
  for (const executionId of ticket.cases) {
    const red = byId.get(executionId);
    const name = red?.name ?? red?.testCaseId ?? executionId;
    const step = red?.failingStep?.title ? ` — step ${red.failingStep.position}. ${red.failingStep.title}` : '';
    const id = red?.testCaseId ? ` (case ${red.testCaseId})` : '';
    lines.push(`- ${name}${step}${id}`);
  }
  lines.push('', '**Evidence**', '', ...ticket.evidence.map((item) => `- ${item}`), '');
  const facts = [];
  if (appUrl) facts.push(`App: ${appUrl}`);
  if (runId) facts.push(`Test Studio run: ${runId}`);
  if (firingId) facts.push(`Analysis firing: ${firingId}`);
  if (reportPath) facts.push(`Report: ${reportPath}`);
  facts.push(`Fingerprint: nebula-test-bug/${ticket.fingerprint}`);
  lines.push('---', '', ...facts.map((fact) => `- ${fact}`), '');
  lines.push('_Filed by UnifyApps Headless from an automated run analysis; the test cases above reproduce it._');
  return `${lines.join('\n')}\n`;
}

/** The proposed tickets as one Markdown page a person reads before the approval: a table of the
 * tickets (one row each, linking its rendered description), a table of the tickets that get a comment
 * instead (`already filed <key>` rows), the nitpicks left unfiled, and every other not-ticketed row with
 * its reason. The approval question itself carries only the counts and the choice. `label(id)` names a
 * case or issue; `idWord` heads its column (cases, issues). */
export function ticketsProposed(list, { label = (id) => String(id), idWord = 'cases', trackerHost = null, title = 'Proposed tickets' } = {}) {
  const cell = (value) => String(value ?? '').replace(/\|/gu, '\\|').replace(/\s*\n\s*/gu, ' ').trim();
  const firstSentence = (text) => { const words = cell(text); const end = words.search(/[.!?](\s|$)/u); return end === -1 ? words : words.slice(0, end + 1); };
  const table = (header, rows) => [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)].join('\n');
  const tickets = list?.tickets ?? [];
  const idsOf = (ids) => `${ids.map(label).join(', ')} (${ids.length})`;
  const lines = [`# ${title}`, ''];
  if (tickets.length) {
    const capital = idWord.charAt(0).toUpperCase() + idWord.slice(1);
    lines.push(table(['#', 'Title', 'Kind', 'Priority', 'Assignee', 'Module', capital, 'Root cause', 'Description'], tickets.map((ticket, index) => [
      index + 1, ticket.title, ticket.kind ?? 'bug', ticket.priority ?? '', Array.isArray(ticket.assignee) ? ticket.assignee.join(' + ') : ticket.assignee ?? '',
      [ticket.module, ticket.layer].filter(Boolean).join(' · '), idsOf(ticket.cases ?? []), firstSentence(ticket.rootCause), `[tickets/${ticket.fingerprint}.md](tickets/${ticket.fingerprint}.md)`,
    ])));
  } else lines.push('No ticket proposed.');
  const rows = list?.notTicketed ?? [];
  const byReason = (test) => rows.filter((row) => test(String(row?.reason ?? '')));
  const filed = new Map();
  for (const row of byReason((reason) => reason.startsWith('already filed'))) {
    const key = String(row.reason).replace(/^already filed\s*:?\s*/u, '').split(/\s/u)[0];
    if (!filed.has(key)) filed.set(key, []);
    filed.get(key).push(row.executionId);
  }
  if (filed.size) {
    lines.push('', '## Comments instead', '', 'These defects already have an open ticket; the run adds one comment to each.', '');
    lines.push(table(['Existing ticket', 'Link', 'Comment'], [...filed.entries()].map(([key, ids]) => [key, `https://${trackerHost}/issue/${key}/details`, `seen again in this run: ${idsOf(ids)}`])));
  }
  const nitpicks = byReason((reason) => reason.startsWith('nitpick'));
  if (nitpicks.length) {
    lines.push('', '## Nitpicks left unfiled', '', 'Listed in the report, filed only when asked.', '');
    lines.push(table([idWord.charAt(0).toUpperCase() + idWord.slice(1), 'Reason'], nitpicks.map((row) => [label(row.executionId), row.reason])));
  }
  const others = byReason((reason) => !reason.startsWith('already filed') && !reason.startsWith('nitpick'));
  if (others.length) {
    lines.push('', '## Not filed', '');
    lines.push(table([idWord.charAt(0).toUpperCase() + idWord.slice(1), 'Reason'], others.map((row) => [label(row.executionId), row.reason])));
  }
  return `${lines.join('\n')}\n`;
}

/** One ledger row per ticket, written before filing: the cases with the facts a later
 * verification compares a re-run against (class, error keys, failing step). The session upserts
 * the key, id, url and assignee onto the same row once the ticket exists. */
export function ticketRows(list, classified, { firingId, runId } = {}) {
  const byId = new Map((classified?.reds ?? []).map((red) => [red.executionId, red]));
  return (list?.tickets ?? []).map((ticket) => ({
    loop: 'bug-tickets',
    ...(firingId ? { firingId } : {}),
    ...(runId ? { runId } : {}),
    executionId: `ticket:${ticket.fingerprint}`,
    fingerprint: ticket.fingerprint,
    title: ticket.title,
    kind: ticket.kind ?? 'bug',
    priority: ticket.priority ?? null,
    module: ticket.module ?? null,
    layer: ticket.layer ?? null,
    assignee: ticket.assignee ?? null,
    cases: ticket.cases.map((executionId) => {
      const red = byId.get(executionId) ?? {};
      return {
        executionId, testCaseId: red.testCaseId ?? null, name: red.name ?? null, class: red.class ?? null,
        errorKey: red.errorKey ?? null, summaryKey: red.summaryKey ?? null,
        failingStep: red.failingStep ? { position: red.failingStep.position ?? null, title: red.failingStep.title ?? null } : null,
      };
    }),
  }));
}

// ---- the run's status: what every red came to, and which ticket holds the rest ------------

/** Where a red stands once the analyse, heal and ticket loops of a firing have run, and
 * the next step for each standing. `status` renders one table of these. */
export const STATUSES = Object.freeze({
  healed: { label: 'Healed', next: 'none: the platform run passed' },
  updated: { label: 'Updated', next: 'none: the green gate passed and the read-back matches' },
  flaky: { label: 'Passed on re-run', next: 'none: counted as flaky' },
  ai: { label: 'AI dependency', next: 'set aside until LLM calls can be mocked; counted on the AI dependency ticket' },
  bug: { label: 'Blocked by an app bug', next: 'run the cases again once their ticket is fixed' },
  product: { label: 'Held: product question', next: 'rewrite or retire the cases once their ticket is answered' },
  hook: { label: 'Waiting on a stable hook', next: 'the app adds the static hook; then the heal loop with `--retry <heal firing> --hooks`' },
  defect: { label: 'Test defect, not fixed', next: 'the heal loop (`--heal`), or an update run' },
  failed: { label: 'Fix failed', next: 'the heal loop with `--retry <heal firing>`' },
  retry: { label: 'Not replayed', next: 'the heal loop with `--retry <heal firing>` once the event is over; a missing sign-in needs setup first' },
  runner: { label: 'Runner issue', next: 'run again once the run service is back' },
  person: { label: 'Needs a person', next: 'a person decides from the finding' },
  preview: { label: 'Ran on a branch preview', next: 'fix it in the pull request, then run the cases again' },
  previewBlocked: { label: 'Environment, on a preview', next: 'run the cases again on the preview once the environment lets them through' },
});

/** The standing of one red: its heal-loop row decides when there is one, else its verdict. */
export function statusOf(red, healRow = null) {
  const status = baseStatusOf(red, healRow);
  // The heal loop's --retry never takes a preview's red: one an environment event stopped waits
  // for that event, one the run service stopped for the run service.
  if (status !== 'retry' || !isBranchPreview(red?.domain ?? healRow?.domain)) return status;
  return isInfraRed(red, healRow) ? 'runner' : 'previewBlocked';
}

function baseStatusOf(red, healRow) {
  if (healRow) {
    const cause = rootCauseOf(healRow.rootCause);
    if (healRow.status === 'healed') return 'healed';
    if (healRow.status === 'updated') return 'updated';
    if (healRow.status === 'flaky') return 'flaky';
    if (cause === 'branch preview') return 'preview';
    if (cause === 'ai dependency') return 'ai';
    if (cause === 'no stable hook' || (healRow.status === 'proposed' && !healRow.flowChange)) return 'hook';
    if (healRow.status === 'proposed') return 'defect';
    if (['failed', 'rolled_back'].includes(healRow.status)) return 'failed';
    if (cause === 'contradicts description' || cause === 'feature missing') return 'product';
    const route = cause ? ROOT_CAUSES[cause].route : null;
    if (route === 'bug') return 'bug';
    if (route === 'retry') return 'retry';
    if (route === 'update') return 'defect';
    return 'person';
  }
  const verdict = String(red.verdict ?? '');
  if (verdict === 'Flaky') return 'flaky';
  if (isPreviewRed(red)) return 'preview';
  if (verdict === 'AI dependency' || red.route === 'ai') return 'ai';
  if (verdict === TICKET_KINDS.bug) return 'bug';
  if (verdict === TICKET_KINDS.product) return 'product';
  if (red.class === CLASSES.infra || red.ruleClass === CLASSES.infra) return 'runner';
  if (verdict === 'Environment' || red.route === 'environment') return 'retry';
  if (red.route === 'hook') return 'hook';
  if (verdict.startsWith('Test defect') || red.route === 'heal' || red.route === 'update') return 'defect';
  return 'person';
}

const CAUSE_OF_VERDICT = {
  'App bug': 'app bug', 'AI dependency': 'ai dependency', Flaky: 'transient', Environment: 'environment',
  'Product question': 'contradicts description', 'Test defect (locator)': 'locator', 'Test defect (step shape)': 'test design',
  'Test defect (data)': 'data isolation', 'Test defect (assertion)': 'stale expectation',
};

/** The family a red is grouped under: the heal loop's root cause, else what its verdict
 * implies. A healed red's family is the locator the heal re-pointed. */
export function statusCauseOf(red, healRow = null) {
  const cause = baseStatusCauseOf(red, healRow);
  if (!isBranchPreview(red?.domain ?? healRow?.domain) || !['environment', 'not replayed'].includes(cause)) return cause;
  return isInfraRed(red, healRow) ? 'runner' : 'preview blocked';
}

// The heal report reads heal rows alone, so the class may come from the row.
const isInfraRed = (red, healRow) => [red?.class, red?.ruleClass, healRow?.class].includes(CLASSES.infra);

function baseStatusCauseOf(red, healRow) {
  if (healRow?.status === 'healed' || healRow?.status === 'rolled_back') return 'locator';
  const cause = rootCauseOf(healRow?.rootCause ?? red?.rootCause);
  if (cause) return cause;
  if (isPreviewRed(red)) return 'branch preview';
  if (red?.class === CLASSES.infra || red?.ruleClass === CLASSES.infra) return 'runner';
  return CAUSE_OF_VERDICT[red?.verdict] ?? 'undecided';
}

/** The next step a family's group prints. */
export function nextOf(family) {
  return ROOT_CAUSES[family]?.next ?? FAMILIES[family]?.next ?? 'a person decides';
}

/**
 * The heading a red's group carries in every report: `<family label> — <cause in plain words>`.
 * The cause is the heal row's `cause`, else the red's own (the analyse residue's tag), else,
 * for a named family, the title of the ticket that holds the red, else the family's summary:
 * `App bug — the row-actions click opens the skill editor`, `Test design — timing, waits or
 * step shape`, `Locator — an element the step waits for was not found`.
 */
export function causeTitleOf(red, healRow = null, ticket = null) {
  const family = statusCauseOf(red ?? {}, healRow);
  const meta = ROOT_CAUSES[family] ?? FAMILIES[family] ?? FAMILIES.undecided;
  // The heal row is the later, live verdict: its cause stands, or none; the analyse residue's
  // `cause` tag heads the group only for a red the heal did not replay.
  const named = String((healRow ? healRow.cause : red?.cause) ?? '').replace(/\s+/gu, ' ').trim();
  const fromTicket = meta.named && ticket?.title ? String(ticket.title).replace(/\s+/gu, ' ').trim() : '';
  return `${meta.label} — ${named || fromTicket || meta.summary}`;
}

/** Entries ({ title, family, … }) grouped by title, the largest group first, ties by title. */
export function groupByCause(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.title)) groups.set(entry.title, { title: entry.title, family: entry.family, members: [] });
    groups.get(entry.title).members.push(entry);
  }
  return [...groups.values()].sort((left, right) => right.members.length - left.members.length || left.title.localeCompare(right.title));
}

/** Execution id → the bug-tickets row that holds it, from that loop's `ticket:<fingerprint>` rows. */
function ticketIndex(ticketRowsOf) {
  const index = new Map();
  for (const row of ticketRowsOf ?? []) for (const item of row.cases ?? []) index.set(typeof item === 'string' ? item : item.executionId, row);
  return index;
}

const cell = (text, max = 160) => String(text ?? '').replace(/\s+/gu, ' ').trim().slice(0, max).replace(/\|/gu, '\\|') || '—';

/** The firing's status document: every red's standing, the tickets that hold the rest, and
 * the reds grouped by root cause, the largest group first. `rows` is the whole ledger; the heal
 * and tickets firings default to the analyse firing (a chained run shares one id). */
/** The ticket's link: the url the person gave with the key, else the tracker's issue page
 * built from `trackerHost` when the run was given one, so a table never shows a key a person
 * has to look up by hand. No host is assumed: without one the key stands alone. */
export function ticketUrlOf(row, trackerHost = null) {
  if (row?.filed?.url) return String(row.filed.url);
  if (row?.filed?.key && trackerHost) return `https://${trackerHost}/issue/${row.filed.key}/details`;
  return '';
}

export function renderStatus(classified, { rows = [], firing, healFiring, ticketsFiring, app, runId, trackerHost = null } = {}) {
  const reds = classified?.reds ?? [];
  const healFirings = String(healFiring ?? firing ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const healBy = new Map();
  for (const id of healFirings) {
    for (const row of rows.filter((item) => item.loop === 'heal-loop' && item.firingId === id && !String(item.executionId).includes(':'))) healBy.set(row.executionId, row);
  }
  const ticketRowsOf = rows.filter((row) => row.loop === 'bug-tickets' && row.firingId === (ticketsFiring ?? firing) && String(row.executionId).startsWith('ticket:'));
  const ticketOf = ticketIndex(ticketRowsOf);
  const keyOf = (row) => row?.filed?.key ?? (row ? 'not filed' : '—');

  const entries = reds.map((red) => {
    const healRow = healBy.get(red.executionId) ?? null;
    const ticket = ticketOf.get(red.executionId) ?? null;
    return { red, healRow, status: statusOf(red, healRow), family: statusCauseOf(red, healRow), title: causeTitleOf(red, healRow, ticket), ticket };
  });
  const count = (status) => entries.filter((entry) => entry.status === status).length;
  const lines = [];
  lines.push(`# ${app ?? 'App'} — status of ${runId ? `run ${runId}` : 'the run'}`, '');
  const firings = [`analyse firing ${firing}`];
  if (healFirings.some((id) => id !== firing) || healBy.size) firings.push(`heal firing ${healFirings.join(', ')}`);
  if (ticketRowsOf.length) firings.push(`tickets firing ${ticketsFiring ?? firing}`);
  lines.push(`${reds.length} failed case execution${reds.length === 1 ? '' : 's'} · ${firings.join(' · ')}`, '');
  const previewLine = previewLineOf(reds);
  if (previewLine) lines.push(previewLine, '');

  lines.push('## Summary', '', '| Status | Cases | Next step |', '|---|---|---|');
  for (const [key, { label, next }] of Object.entries(STATUSES)) {
    const n = count(key);
    if (n) lines.push(`| ${label} | ${n} | ${next} |`);
  }
  lines.push(`| **Total** | **${reds.length}** | |`, '');
  const fixed = count('healed') + count('updated') + count('flaky');
  const waiting = count('ai') + count('bug') + count('product');
  lines.push(`Fixed now: **${fixed}**. Waiting on a ticket: **${waiting}** (${count('ai')} AI dependency, ${count('bug')} app bug, ${count('product')} product question). Needing another step: **${reds.length - fixed - waiting}**.`, '');

  lines.push('## Tickets', '');
  if (!ticketRowsOf.length) lines.push('none', '');
  else {
    lines.push('| Ticket | New or existing | Title | Kind | Assignee | Status | Priority | Cases | Link |', '|---|---|---|---|---|---|---|---|---|');
    const kindLabel = { bug: 'app bug', product: 'product question', ai: 'AI dependency' };
    for (const row of [...ticketRowsOf].sort((left, right) => (right.cases?.length ?? 0) - (left.cases?.length ?? 0))) {
      const origin = row.existing ? 'existing (commented)' : row.filed?.key ? 'new' : 'not filed';
      lines.push(`| ${keyOf(row)} | ${origin} | ${cell(row.title, 120)} | ${kindLabel[row.kind ?? 'bug'] ?? row.kind} | ${cell([row.assigneeName ?? row.assignee].flat().filter(Boolean).join(', '))} | ${cell(row.filed?.status)} | ${cell(row.priority)} | ${row.cases?.length ?? 0} | ${ticketUrlOf(row, trackerHost) || '—'} |`);
    }
    lines.push('');
  }

  // Every group is one cause in plain words, the largest first: the breakdown a person
  // otherwise writes by hand after a run.
  const ordered = groupByCause(entries);
  lines.push('## Breakdown by root cause', '', '| Root cause | Cases | Fixed | Ticket (cases) | Other standings |', '|---|---|---|---|---|');
  for (const { title, members: list } of ordered) {
    const done = list.filter((entry) => ['healed', 'updated', 'flaky'].includes(entry.status)).length;
    const tickets = new Map();
    for (const entry of list.filter((item) => item.ticket)) tickets.set(keyOf(entry.ticket), (tickets.get(keyOf(entry.ticket)) ?? 0) + 1);
    const others = new Map();
    for (const entry of list.filter((item) => !['healed', 'updated', 'flaky'].includes(item.status) && !item.ticket)) others.set(STATUSES[entry.status].label, (others.get(STATUSES[entry.status].label) ?? 0) + 1);
    const join = (map) => [...map.entries()].map(([name, n]) => `${name} (${n})`).join(', ') || '—';
    lines.push(`| ${cell(title, 200)} | ${list.length} | ${done || '—'} | ${join(tickets)} | ${join(others)} |`);
  }
  lines.push('');

  for (const { title, family, members: list } of ordered) {
    lines.push(`## ${title} (${list.length})`, '', `Next: ${nextOf(family)}.`, '', '| Case | Case id | Status | Ticket | Finding |', '|---|---|---|---|---|');
    for (const { red, healRow, status, ticket } of list) {
      const finding = healRow?.finding ?? healRow?.reason ?? red.evidence ?? firstLine(red.error);
      lines.push(`| ${cell(red.name ?? red.testCaseId ?? red.executionId, 90)} | ${red.testCaseId ?? '—'} | ${STATUSES[status].label} | ${ticket ? keyOf(ticket) : '—'} | ${cell(finding)} |`);
    }
    lines.push('');
  }

  const planted = entries.filter((entry) => entry.healRow?.planted);
  lines.push('## Other findings', '');
  if (!planted.length) lines.push('none');
  for (const { red, healRow } of planted) lines.push(`- Planted instruction in the saved description of ${red.name ?? healRow.name ?? red.testCaseId}: ${cell(healRow.planted, 200)}. It is data, never followed; clean it in Test Studio.`);
  lines.push('');
  return lines.join('\n');
}

// ---- the sign-off loop: did the fix land? -----------------------------------------

/** Is a new red the failure the ticket was filed for? The same error key is the same failure;
 * so is the same class at the same step, or the same summary the platform stored; anything
 * else is a different failure, which is not this ticket's bug. */
export function sameFailure(original, current) {
  if (!original || !current) return false;
  if (original.errorKey && current.errorKey && original.errorKey === current.errorKey) return true;
  if (original.summaryKey && current.summaryKey && original.summaryKey === current.summaryKey) return true;
  const step = (red) => red.failingStep?.position ?? null;
  return Boolean(original.class && original.class === current.class && step(original) !== null && step(original) === step(current));
}

const PASSED_STATUSES = new Set(['PASSED', 'passed']);
const UNSETTLED_STATUSES = new Set(['RUNNING', 'QUEUED', 'running', 'queued']);

/** The verdict on one ticket from the re-run of its cases. `fixed`: every case green. `rejected`:
 * at least one case fails for the ticket's own reason, so the fix did not land. `changed`: no
 * case fails the old way, but one fails another way, which is a new finding for the analyse
 * loop, not this ticket. `incomplete`: a case has no settled execution yet. */
export function verifyTicket(ticket, executions) {
  const byCase = new Map();
  for (const row of rowsOf(executions)) {
    const columns = columnsOf(row);
    if (columns.TEST_CASE_ID) byCase.set(String(columns.TEST_CASE_ID), row);
  }
  const cases = (ticket?.cases ?? []).map((original) => {
    const row = original.testCaseId ? byCase.get(String(original.testCaseId)) : null;
    if (!row) return { testCaseId: original.testCaseId, name: original.name, result: 'missing' };
    const columns = columnsOf(row);
    const status = String(columns.STATUS ?? '');
    if (PASSED_STATUSES.has(status)) return { testCaseId: original.testCaseId, name: original.name, result: 'green', executionId: columns.ID ?? null };
    if (UNSETTLED_STATUSES.has(status)) return { testCaseId: original.testCaseId, name: original.name, result: 'unsettled', executionId: columns.ID ?? null };
    const current = classifyRow(row);
    const same = sameFailure(original, current);
    return {
      testCaseId: original.testCaseId, name: original.name, result: same ? 'same' : 'different', executionId: current.executionId,
      class: current.class, errorKey: current.errorKey, error: String(current.error ?? '').split('\n')[0].slice(0, 200),
      failingStep: current.failingStep ? { position: current.failingStep.position, title: current.failingStep.title } : null,
    };
  });
  const count = (result) => cases.filter((item) => item.result === result).length;
  const verdict = count('same') ? 'rejected' : (count('unsettled') || count('missing')) ? 'incomplete' : count('different') ? 'changed' : cases.length ? 'fixed' : 'incomplete';
  return { fingerprint: ticket?.fingerprint ?? null, ticketKey: ticket?.filed?.key ?? null, verdict, counts: { green: count('green'), same: count('same'), different: count('different'), unsettled: count('unsettled'), missing: count('missing') }, cases };
}

/** The comment the loop leaves for the ticket, in markdown, from the verdict alone. */
export function verifyComment(result, { runId, firingId, appUrl } = {}) {
  const lines = [];
  const facts = [runId ? `run ${runId}` : null, firingId ? `firing ${firingId}` : null].filter(Boolean).join(', ');
  if (result.verdict === 'fixed') lines.push(`**Verified fixed** by UnifyApps Headless${facts ? ` (${facts})` : ''}: every case this ticket names passed.`);
  else if (result.verdict === 'rejected') lines.push(`**QA rejected** by UnifyApps Headless${facts ? ` (${facts})` : ''}: the failure this ticket was filed for is still there.`);
  else if (result.verdict === 'changed') lines.push(`**Original failure gone** (${facts || 'this run'}): no case fails the way this ticket describes, but a different failure appeared. It is analysed on its own and gets its own ticket if it is a bug.`);
  else lines.push(`**Not yet verified** (${facts || 'this run'}): a case has no settled execution yet.`);
  lines.push('');
  for (const item of result.cases) {
    const label = `${item.name ?? item.testCaseId ?? 'case'}${item.executionId ? ` (execution ${item.executionId})` : ''}`;
    if (item.result === 'green') lines.push(`- ✅ ${label}: passed`);
    else if (item.result === 'same') lines.push(`- ❌ ${label}: same failure — step ${item.failingStep?.position ?? '?'}. ${item.failingStep?.title ?? ''} — \`${item.error}\``);
    else if (item.result === 'different') lines.push(`- ⚠️ ${label}: different failure — step ${item.failingStep?.position ?? '?'}. ${item.failingStep?.title ?? ''} — \`${item.error}\``);
    else lines.push(`- ⏳ ${label}: ${item.result}`);
  }
  if (appUrl) lines.push('', `App: ${appUrl}`);
  return `${lines.join('\n')}\n`;
}

// ---- CLI ----------------------------------------------------------------------------

// Under the 10-minute limit of one Bash call, with room for the call around it.
const MAX_PAUSE_SECONDS = 540;

/** A firing id: local `<YYYYMMDD-HHmm>-<4 random letters or digits>`, made here so no two
 * firings an agent names by hand collide or carry the wrong time. */
/** The answer a loop stops on when a browser is not signed in as a test user. */
export const NOT_A_TEST_USER = 'NOT_A_TEST_USER';

/**
 * Whether one browser is signed in as a test user of the subject's pool. `context` is the
 * user-context read's answer in that browser ({ status, userId }); `listed` is list_test_users'
 * reply on the subject's pool, asked with `userIds: [<that id>]` (or, on a tenant without the
 * filter, with a limit large enough for the whole pool). Fails closed: a reply for another pool,
 * one asked without the test-user filter, or a cut list that does not hold the id all refuse,
 * because none of them proves the user is a test user.
 */
export function testUserCheck({ pool, context, listed, expected } = {}) {
  const refuse = (reason) => ({ ok: false, code: NOT_A_TEST_USER, userId: context?.userId ?? null, pool: pool ?? null, reason });
  if (!pool) return refuse('no pool given: pass the subject\'s interfaceId, `__UA__PLATFORM__` for the platform');
  if (!context || context.status !== 200 || typeof context.userId !== 'string' || !context.userId) {
    return refuse(`the browser has no signed-in user (user-context status ${context?.status ?? 'missing'})`);
  }
  const { userId } = context;
  if (expected && userId !== expected) return refuse(`the browser is signed in as ${userId}, not the test user ${expected}`);
  if (!listed || listed.interfaceId !== pool) return refuse(`the listing is for pool ${listed?.interfaceId ?? 'unknown'}, not ${pool}`);
  if (listed.testUsersOnly === false) return refuse('the listing was asked with testUsersOnly false, so it does not prove a test user');
  const users = Array.isArray(listed.users) ? listed.users : [];
  const row = users.find((user) => user?.id === userId);
  if (row && row.testUser !== false) return { ok: true, userId, pool, name: row.name ?? row.username ?? userId };
  if (row) return refuse(`${userId} is listed with testUser false`);
  const cut = typeof listed.totalHits === 'number' && listed.totalHits > users.length;
  return refuse(cut
    ? `${userId} is not in the first ${users.length} of ${listed.totalHits} test users; ask list_test_users with userIds: ["${userId}"]`
    : `${userId} is not a test user of ${pool}`);
}

export function firingId(date = new Date(), random = Math.random) {
  const two = (value) => String(value).padStart(2, '0');
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const tail = Array.from({ length: 4 }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}-${tail}`;
}

function argsOf(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) flags[name] = true;
      else {
        flags[name] = next;
        index += 1;
      }
    } else positional.push(arg);
  }
  return { positional, flags };
}

function readInput(value) {
  if (typeof value !== 'string') throw new Error('--in <file> is required');
  return JSON.parse(fs.readFileSync(value, 'utf8'));
}

function readRow(value) {
  if (typeof value !== 'string') throw new Error('--row <json | @file> is required');
  return JSON.parse(value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf8') : value);
}

function emit(value, out) {
  const text = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
    process.stdout.write(`${JSON.stringify({ wrote: out })}\n`);
  } else process.stdout.write(text);
}

export function main(argv) {
  const { positional, flags } = argsOf(argv);
  const [command, sub] = positional;
  if (command === 'classify') {
    emit(classify(readInput(flags.in), { minimum: flags.minimum ? Number(flags.minimum) : undefined, totalInRun: flags.total ? Number(flags.total) : undefined }), flags.out);
  } else if (command === 'history') {
    emit(historyTag(readInput(flags.in), { errorKey: typeof flags['error-key'] === 'string' ? flags['error-key'] : undefined, domain: typeof flags.domain === 'string' ? flags.domain : undefined }), flags.out);
  } else if (command === 'annotate') {
    if (typeof flags.tags !== 'string') throw new Error('--tags <file> is required');
    emit(annotate(readInput(flags.in), readInput(flags.tags)), flags.out);
  } else if (command === 'ledger') {
    if (typeof flags.file !== 'string') throw new Error('--file <ledger.json> is required');
    const ledger = readLedger(flags.file);
    if (sub === 'upsert') {
      const row = upsertRow(ledger, readRow(flags.row));
      writeLedger(flags.file, ledger);
      emit(row);
    } else if (sub === 'list') {
      emit(listRows(ledger, { run: flags.run, testCaseId: flags.case, firing: flags.firing }));
    } else if (sub === 'history') {
      if (typeof flags.case !== 'string') throw new Error('--case <test case id> is required');
      emit(historyTag(ledgerHistory(ledger, flags.case)));
    } else throw new Error('usage: loop.mjs ledger upsert|list|history --file <ledger.json> …');
  } else if (command === 'newest') {
    emit(newestPerCase(readInput(flags.in)), flags.out);
  } else if (command === 'intake') {
    const maxCases = flags['max-cases'] ? Number(flags['max-cases']) : null;
    if (typeof flags.ledger === 'string') {
      if (typeof flags.firing !== 'string') throw new Error('--firing <id> is required with --ledger');
      if (flags.retry === true) emit(healIntakeRetry(readLedger(flags.ledger), flags.firing, { maxCases, hooks: flags.hooks === true }), flags.out);
      else emit(healIntakeFromLedger(readLedger(flags.ledger), flags.firing, { maxCases }), flags.out);
    } else {
      const classified = readInput(flags.in);
      emit(healIntake(classified.reds ?? [], { sharedCause: classified.sharedCause ?? null, maxCases }), flags.out);
    }
  } else if (command === 'rung') {
    for (const name of ['dialect', 'old', 'new']) if (typeof flags[name] !== 'string') throw new Error(`--${name} is required`);
    emit(ladderVerdict({ dialect: flags.dialect, oldLocator: flags.old, newLocator: flags.new, scenarioNamed: flags['scenario-named'] === true, oldRungGone: flags['old-rung-gone'] === true }));
  } else if (command === 'check-patch') {
    const problems = validatePatch(readInput(flags.in));
    emit({ ok: problems.length === 0, problems });
    if (problems.length) process.exitCode = 1;
  } else if (command === 'check-heal') {
    if (typeof flags.ledger !== 'string' || typeof flags.firing !== 'string') throw new Error('--ledger <file> --firing <id> are required');
    const patches = {};
    if (typeof flags.patches === 'string') {
      for (const file of fs.readdirSync(flags.patches).filter((name) => name.endsWith('.json'))) {
        patches[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(path.join(flags.patches, file), 'utf8'));
      }
    }
    const result = checkHealFiring(readLedger(flags.ledger), flags.firing, patches);
    emit(result);
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'heal-report') {
    if (typeof flags.ledger !== 'string' || typeof flags.firing !== 'string') throw new Error('--ledger <file> --firing <id> are required');
    const shared = typeof flags.shared === 'string' ? readInput(flags.shared) : {};
    emit(renderHealReport(readLedger(flags.ledger).rows, { firing: flags.firing, app: typeof flags.app === 'string' ? flags.app : undefined, shared }), flags.out);
  } else if (command === 'heal-tags') {
    if (typeof flags.ledger !== 'string' || typeof flags.firing !== 'string') throw new Error('--ledger <file> --firing <id> are required');
    emit(healTags(readLedger(flags.ledger).rows, flags.firing), flags.out);
  } else if (command === 'causes') {
    if (typeof flags.ledger !== 'string' || typeof flags.firing !== 'string') throw new Error('--ledger <file> --firing <id> are required');
    const ledger = readLedger(flags.ledger);
    if (typeof flags.in === 'string') {
      // All or nothing: the ledger is written only when every cause reads as a heading in plain words.
      const result = nameCauses(ledger, flags.firing, readInput(flags.in));
      if (result.problems.length) {
        emit(result);
        process.exitCode = 1;
      } else {
        writeLedger(flags.ledger, ledger);
        emit(result, flags.out);
      }
    } else emit(causesToName(ledger, flags.firing), flags.out);
  } else if (command === 'tick') {
    emit(watchTick(readInput(flags.in), {
      now: typeof flags.now === 'string' ? flags.now : new Date(),
      load: flags.load ? Number(flags.load) : null,
      cores: flags.cores ? Number(flags.cores) : null,
      consecutive5xx: flags['failed-5xx'] ? Number(flags['failed-5xx']) : 0,
    }));
  } else if (command === 'pause') {
    // A foreground wait. A headless or scheduled session exits when its turn ends with only a
    // background shell command running, and Claude Code refuses a bare `sleep` in the
    // foreground; a loop that must wait for time waits here.
    const seconds = Math.min(Math.max(Number(flags.seconds ?? 20), 1), MAX_PAUSE_SECONDS);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
    emit(`${JSON.stringify({ paused: seconds })}\n`);
  } else if (command === 'test-user-check') {
    for (const name of ['pool', 'context', 'listed']) if (typeof flags[name] !== 'string') throw new Error(`--${name} is required`);
    const readJson = (value) => JSON.parse(fs.readFileSync(value.startsWith('@') ? value.slice(1) : value, 'utf8'));
    const result = testUserCheck({ pool: flags.pool, context: readJson(flags.context), listed: readJson(flags.listed), expected: typeof flags.expected === 'string' ? flags.expected : undefined });
    emit(result);
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'firing-id') {
    emit(`${firingId()}\n`);
  } else if (command === 'report') {
    // --ledger brings the heal-loop rows of this firing in, so a case the chained heal fixed is
    // reported under Healed and its named cause heads its group, and the bug-tickets rows, whose
    // title heads a group no cause was named for; --stuck names the executions the polling gave up on.
    const firingRows = typeof flags.ledger === 'string' && typeof flags.firing === 'string' ? listRows(readLedger(flags.ledger), { firing: flags.firing }) : [];
    const heal = firingRows.filter((row) => row.loop === 'heal-loop');
    const tickets = firingRows.filter((row) => row.loop === 'bug-tickets' && String(row.executionId).startsWith('ticket:'));
    const stuck = typeof flags.stuck === 'string' ? readInput(flags.stuck) : [];
    emit(renderReport(readInput(flags.in), { runId: flags.run, firingId: flags.firing, mode: typeof flags.mode === 'string' ? flags.mode : undefined, heal, tickets, stuck, appUrl: typeof flags['app-url'] === 'string' ? flags['app-url'] : undefined }), flags.out);
  } else if (command === 'status') {
    if (typeof flags.in !== 'string' || typeof flags.ledger !== 'string' || typeof flags.firing !== 'string') throw new Error('--in <classified.json> --ledger <ledger.json> --firing <id> are required');
    const text = (name) => (typeof flags[name] === 'string' ? flags[name] : undefined);
    emit(renderStatus(readInput(flags.in), { rows: readLedger(flags.ledger).rows, firing: flags.firing, healFiring: text('heal-firing'), ticketsFiring: text('tickets-firing'), app: text('app'), runId: text('run'), trackerHost: text('tracker-host') ?? null }), flags.out);
  } else if (command === 'journeys') {
    emit(enumerateJourneys(readInput(flags.in), { maxEdges: flags['max-edges'] ? Number(flags['max-edges']) : undefined }), flags.out);
  } else if (command === 'survey-summary') {
    if (!flags.journeys || !flags.scenarios) throw new Error('usage: loop.mjs survey-summary --journeys <journeys.json> --scenarios <scenarios.json> [--app <name>] [--max-edges 8] [--out <file>]');
    const summary = coverageSummary(JSON.parse(fs.readFileSync(flags.journeys, 'utf8')), JSON.parse(fs.readFileSync(flags.scenarios, 'utf8')), { app: typeof flags.app === 'string' ? flags.app : undefined, maxEdges: flags['max-edges'] ? Number(flags['max-edges']) : undefined });
    const text = renderCoverageSummary(summary);
    if (typeof flags.out === 'string') fs.writeFileSync(flags.out, text);
    process.stdout.write(text);
  } else if (command === 'survey-sheet') {
    if (typeof flags.journeys !== 'string' || typeof flags.scenarios !== 'string' || typeof flags.out !== 'string') throw new Error('--journeys <journeys.json> --scenarios <scenarios.json> --out <scenarios.xlsx> are required');
    const { csv, xlsx, coverage, count, columns } = renderSurveySheet(JSON.parse(fs.readFileSync(flags.journeys, 'utf8')), JSON.parse(fs.readFileSync(flags.scenarios, 'utf8')), { appUrl: typeof flags['app-url'] === 'string' ? flags['app-url'] : undefined, app: typeof flags.app === 'string' ? flags.app : undefined, maxEdges: flags['max-edges'] ? Number(flags['max-edges']) : undefined });
    if (!coverage.complete) throw new Error('the check is not complete; the review sheet is made from a complete list only');
    // The workbook is what Drive converts into the Sheet; the CSV beside it is the same rows
    // as text, for a session with no Google Drive connector and for reading by eye.
    const csvOut = flags.out.replace(/\.xlsx$/iu, '') + '.csv';
    fs.mkdirSync(path.dirname(flags.out), { recursive: true });
    fs.writeFileSync(flags.out, xlsx);
    fs.writeFileSync(csvOut, csv);
    emit({ out: flags.out, csv: csvOut, base64: xlsx.toString('base64'), scenarios: count, columns, decisions: SHEET_DECISION_OPTIONS });
  } else if (command === 'survey-sheet-read') {
    if (typeof flags.in !== 'string') throw new Error('--in <the sheet exported as CSV> is required');
    emit(readSurveySheet(fs.readFileSync(flags.in, 'utf8')), flags.out);
  } else if (command === 'survey-check' || command === 'survey-render') {
    if (typeof flags.journeys !== 'string' || typeof flags.scenarios !== 'string') throw new Error(`--journeys <journeys.json> --scenarios <scenarios.json> are required`);
    const graph = JSON.parse(fs.readFileSync(flags.journeys, 'utf8'));
    const list = JSON.parse(fs.readFileSync(flags.scenarios, 'utf8'));
    const maxEdges = flags['max-edges'] ? Number(flags['max-edges']) : undefined;
    if (command === 'survey-check') {
      const result = surveyCoverage(graph, list, { maxEdges });
      emit({ complete: result.complete, line: coverageLine(result.layers), layers: result.layers, problems: result.problems, journeys: result.journeys.length }, flags.out);
      if (!result.complete) process.exitCode = 1;
    } else {
      if (typeof flags.out !== 'string') throw new Error('--out <scenarios.md> is required');
      const { markdown, coverage } = renderSurveyScenarios(graph, list, { header: typeof flags.header === 'string' ? flags.header : '', app: typeof flags.app === 'string' ? flags.app : undefined, maxEdges });
      emit(markdown, flags.out);
      if (!coverage.complete) process.exitCode = 1;
    }
  } else if (command === 'tickets-list') {
    if (typeof flags.tickets !== 'string' || typeof flags.in !== 'string' || typeof flags.out !== 'string') throw new Error('--tickets <tickets.json> --in <classified.json> --out <tickets-proposed.md> are required');
    const list = JSON.parse(fs.readFileSync(flags.tickets, 'utf8'));
    const byId = new Map((readInput(flags.in)?.reds ?? []).map((red) => [red.executionId, red]));
    const page = ticketsProposed(list, { label: (id) => byId.get(id)?.name ?? byId.get(id)?.testCaseId ?? id, idWord: 'cases', trackerHost: typeof flags['tracker-host'] === 'string' ? flags['tracker-host'] : null });
    fs.mkdirSync(path.dirname(path.resolve(flags.out)), { recursive: true });
    fs.writeFileSync(flags.out, page);
    emit({ wrote: flags.out, tickets: (list.tickets ?? []).length, notTicketed: (list.notTicketed ?? []).length });
  } else if (command === 'tickets-rows') {
    if (typeof flags.tickets !== 'string' || typeof flags.in !== 'string' || typeof flags.out !== 'string') throw new Error('--tickets <tickets.json> --in <classified.json> --out <folder> are required');
    const list = JSON.parse(fs.readFileSync(flags.tickets, 'utf8'));
    const rows = ticketRows(list, readInput(flags.in), { firingId: flags.firing, runId: flags.run });
    fs.mkdirSync(flags.out, { recursive: true });
    const written = rows.map((row) => { const file = path.join(flags.out, `ticket-${row.fingerprint}.json`); fs.writeFileSync(file, `${JSON.stringify(row, null, 2)}\n`); return file; });
    emit({ wrote: written });
  } else if (command === 'verify') {
    if (typeof flags.ticket !== 'string' || typeof flags.in !== 'string') throw new Error('--ticket <ticket row json> --in <executions.json> are required');
    const ticket = JSON.parse(fs.readFileSync(flags.ticket, 'utf8'));
    const result = verifyTicket(ticket, readInput(flags.in));
    if (typeof flags['comment-out'] === 'string') {
      fs.mkdirSync(path.dirname(flags['comment-out']), { recursive: true });
      fs.writeFileSync(flags['comment-out'], verifyComment(result, { runId: flags.run, firingId: flags.firing, appUrl: flags['app-url'] }));
      result.commentFile = flags['comment-out'];
    }
    emit(result, flags.out);
  } else if (command === 'tickets-check' || command === 'tickets-render') {
    if (typeof flags.tickets !== 'string' || typeof flags.in !== 'string') throw new Error('--tickets <tickets.json> --in <classified.json> are required');
    const list = JSON.parse(fs.readFileSync(flags.tickets, 'utf8'));
    const classified = readInput(flags.in);
    const result = ticketsCheck(list, classified);
    if (command === 'tickets-check') {
      emit(result, flags.out);
      if (!result.complete) process.exitCode = 1;
    } else {
      if (typeof flags.out !== 'string') throw new Error('--out <folder> is required');
      if (!result.complete) { emit(result); process.exitCode = 1; return; }
      fs.mkdirSync(flags.out, { recursive: true });
      const context = { runId: flags.run, firingId: flags.firing, appUrl: flags['app-url'], reportPath: flags.report };
      const written = [];
      for (const ticket of list.tickets) {
        const file = path.join(flags.out, `${ticket.fingerprint}.md`);
        fs.writeFileSync(file, ticketBody(ticket, classified, context));
        written.push(file);
      }
      emit({ wrote: written });
    }
  } else {
    throw new Error('usage: loop.mjs classify|history|annotate|ledger|report|firing-id|newest|intake|rung|check-patch|check-heal|heal-report|causes|heal-tags|status|tick|pause|journeys|survey-check|survey-render|survey-summary|survey-sheet|survey-sheet-read|tickets-check|tickets-render|tickets-list|tickets-rows|verify …');
  }
}

const invokedDirectly = (() => {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
