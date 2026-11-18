#!/usr/bin/env node
// CLI for the native fix, build, scope, create-test and run-test loops and their helpers.
// Node 22+, no dependencies. It wraps the native-* block
// scripts (native-device-pool's device-pool for the pool and the device queue) and UnifyApps Headless's own CLI
// (the cache, for page dependencies and the app's platform), and renders the two fixed report templates and the shot sheets.
//
// Commands (every one takes --json, --session <id> and --help, which prints that command's lines;
// --solution <dir> where a solution folder matters):
//   health [--quick|--fresh] [--platform web|mobile]   cached machine check (LOOPS_HOME/health.json, or
//                                     health-web.json on WEB); --quick prints one line
//   doctor [check ...] [--only a,b] [--platform web|mobile]   every probe, fresh, with fixes,
//                                     pool size (MOBILE) or browsers (WEB) and agent limit
//   setup [--yes] [--only a,b] [--count n] [--app p | --url u] [--platform web|mobile]
//                                     install what is missing; without --yes lists each install and exits 3
//                                     (ids: rosetta, ios-runtime, baguette, argent, argent-mcp, preview, pool;
//                                     on WEB only browser: Playwright's Chrome for Testing)
//                                     health, doctor, setup and capacity take the platform from --platform, else
//                                     app.type of <solution>/.nebula/loops/profile.json, else MOBILE
//   preview install (--app <path> | --url <url>) [--print] [--skip-install]
//                                     the Preview app's simulator build the person gives, installed on the pool
//   preview install --platform android --device <serial> (--app <file.apk> | --url <url>)
//                                     the Preview app's .apk the person gives, installed with adb
//   pool up [--count n] [--runtime 18.6] [--preview-app x] | status | add | adopt <udid> | watch [--port 8421] [--stop]
//   platform <app-id>                  MOBILE or WEB, from the app's manifest type (UnifyApps Headless cache), and the
//                                     app's kind: no-code, or code (a Code Builder app, manifest mode `code`)
//   target <ask...> --verb <scope|build|fix|test|review> [--mode discover|build|run] [--whole]
//          [--kind app|automation|ai-agent|content|object|unknown] [--app <name>] [--new] [--platform web|mobile]
//                                     what the ask is about (a ticket, a design link, a cached app, agent or
//                                     automation by id, name or URL, or words) and which specific loop runs
//                                     it; the generic commands call it first. --kind is what Claude read the
//                                     ask to be (references/which-loop.md): with it, no hint words are read
//   signals add --run <run> --key <k> --stage <s> [--tool t] --reason "<one line>" [--loop <name>]
//         | finish --run <run> [--now]  the self-review (references/self-review.md): a signal recorded during the
//         | filed --run <run> --key <signal key> --record <id>    run; at the end, the run merged into
//                                     <solution>/.nebula/loops/signals/ledger.jsonl and the records due by threshold
//   impact <app-id> [--page|--module|--card|--template <id> | --nav | --nav-item <id>]
//                                     impact analysis: the pages a change reaches (UnifyApps Headless cache); a WEB
//                                     app adds its paths, menu and app shell (--nav, --nav-item: WEB only)
//   issues lint <files...> | merge <files...> [--out f] | split <files...> --jobs n [--impact impact.json] [--shared ids] [--out-dir d] [--all] [--allow-unproven]
//                                     split gives a reported issue (triage, reproduce, test-author) with no proof (device
//                                     cell not config, device or run, and no steps) no draft job: it goes to the
//                                     person-unproven job with the one question that unblocks it
//   queue add --kind retest|replay|visual-check|touch-feedback|interaction|performance|acceptance|realtime|capture|loading|a11y|responsive
//             --page <id> [--platform mobile|web] [...]
//         | status [--kind k] [--status s] [--platform mobile|web]
//                                     --platform says whose device serves a request (mobile when absent): touch-feedback
//                                     is the MOBILE check, interaction the WEB one, a11y and responsive WEB only;
//                                     retest and replay need --issues, a replay's issues their recorded steps;
//                                     acceptance and realtime need --steps, a steps file inside the run folder
//                                     whose Effects: and Watch: lines are well formed, a realtime one with a
//                                     Watch: block; capture needs --side before|after, a before one --issues
//   cache-export <app-id> <page-id> --run <run>   R/cache/<page>/blocks.json and outline.json for the test runners
//   board [<run>] [--html]             board.md (and board.html) from <run>/board.json
//   board --check                      warn on every run folder with no board.json
//   scope tickets-check <tickets.json> --prd <prd.md> [--previous <tickets part | json>] [--previous-prd <prd.md>]
//                                     the scope loop's slicing: T0 first, every must and should requirement in one
//                                     ticket, every screen built once (at most 5 a ticket), acceptance on each,
//                                     dependencies that reach T0 and never loop; with --previous, slice ids kept
//                                     stable, and with --previous-prd each kept slice changed or unchanged
//   scope tickets-render <tickets.json> --prd <prd.md> --version <n> --app-name <name> [--app-id id]
//             [--solution-name n] [--solution-id id] [--keys <keys.json>] [--out f] [--files <dir>]
//                                     each ticket's title and Markdown body, its layer, and whether every
//                                     ticket it depends on is filed (--keys: { "T0": { "key", "url" } });
//                                     --files writes one <slice>.md per ticket and an index.md in build order,
//                                     for the person to file in their issue tracker
//   run start --goal <fix|build|scope|test-author|audit|triage|setup|report> --scope <text> [--platform MOBILE|WEB] [--kind code]
//             [--request <text>] [--run <id>]
//                                     make the run folder: board.json (goal, platform, scope, limits), board.md, run.start
//   run job-state --run <run> --job <job> --step <text> [--agent n] [--undo <file>] [--attempt n] [--request id]
//                                     <run>/jobs/<job>/state.json, rewritten at every step of a job
//   run resume                         unfinished runs, each job's last step, data changes not yet restored
//   signed-in                          the signed-in pool simulator (profile preferredDevice.udid) and the
//                                     commands that copy its state to the other pool simulators
//   log append --run <run> <event-json | ->       one redacted event into the run log, <run>/run-log.jsonl
//   log tokens|report|share <run>      token sums (tokens.json) · report.html · anonymised summary
//                                     (<run>: an id under .nebula/loops/runs, a folder, or --run / LOOPS_RUN_ID)
//   perf render <perf.json | its folder> [--out f]   perf-report.html beside perf.json
//   shots add --run <run> --id <shot id> --side before|after|design --file <png> --page <id> [--page-name n]
//             [--issues a,b] [--state text] [--title text] [--version "draft vN"] [--status verified|still open|regressed]
//             [--by who] [--order n]
//                                     copy one side of a screen into <run>/shots/<id>/ and merge shot.json; a fix
//                                     run's after shot needs --status
//   shots compose [--run <run>] [--goal fix|build] [--open]
//                                     <run>/shots/sheets/: one BEFORE | AFTER sheet per verified fix (fix), or one
//                                     sheet per built page plus an overview (build); --open shows them (macOS)
//   shots list [--run <run>]           every shot of the run and its sides
//   capacity [--platform web|mobile]   this laptop's RAM and performance cores → pool size and agent limit;
//                                     on WEB also the browsers free memory allows (capacity.browsers caps them)
//
// Exit codes: 0 ok · 1 a check or validation failed, or a wrapped command failed · 2 usage ·
//             3 setup needs consent (run again with --yes) · 4 something needed is missing
//             (a tool, block script, run folder, transcript or cache entry).
//             health --quick always exits 0 and prints nothing on an error.
//
// State: LOOPS_HOME (default ${UA_HOME:-~/.unifyapps-solutions}/loops). Runs:
// <solution>/.nebula/loops/runs/<run-id>/. Test seams: LOOPS_FAKE_BUILDS, LOOPS_FAKE_EXEC, LOOPS_FAKE_EXEC_LOG,
// LOOPS_NOW, LOOPS_XCODE_APP, LOOPS_DEVICE_POOL, LOOPS_UA_CLI, LOOPS_CLAUDE_PROJECTS; the WEB check reads
// Chrome for Testing from PLAYWRIGHT_BROWSERS_PATH (Playwright's own variable) when it is set.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBoard } from './lib/board.mjs';
import { checkBoards, resumeReport, startRun, writeJobState } from './lib/runs.mjs';
import { signedInPlan } from './lib/signed-in.mjs';
import { capacity } from './lib/capacity.mjs';
import { cacheExport } from './lib/cache-export.mjs';
import { computeImpact } from './lib/impact.mjs';
import { checksFor, renderDoctor, runDoctor } from './lib/doctor-checks.mjs';
import { checkHealth, platformFor } from './lib/health.mjs';
import { browserCapacity } from './lib/web-probes.mjs';
import { assertLintClean, lintIssues, mergeIssues, readLists, renderLint, renderSplit, sharedFromImpact, splitJobs, writeJobs } from './lib/issues.mjs';
import { EXIT, LoopsError, emit, intFlag, parse, plural, usage } from './lib/output.mjs';
import { loopsHome, readJson, resolveRun, solutionDir, writeJson, writeText } from './lib/paths.mjs';
import { renderPerf } from './lib/perf.mjs';
import { checkTickets, readKeys, readPrevious, renderTickets } from './lib/scope.mjs';
import { appPlatform } from './lib/platform.mjs';
import { resolveTarget } from './lib/target.mjs';
import { addSignal, finishSignals, markFiled } from './lib/signals.mjs';
import { poolAdd, poolAdopt, poolStatus, poolUp, poolWatch } from './lib/pool.mjs';
import { previewInstall } from './lib/preview.mjs';
import { QUEUE_OPTIONS, queueAdd, queueStatus } from './lib/queue.mjs';
import { fill, readTemplate } from './lib/render.mjs';
import { runSetup } from './lib/setup.mjs';
import { scrubList, shareSummary } from './lib/share.mjs';
import { addShot, composeShots, listShots } from './lib/shots.mjs';
import { findTranscript, renderTokens, sumSession, summarizeTokens } from './lib/tokens.mjs';
import { appendEvent, dispatchesOf, loadRunInputs, logFile, parseEventArg, runReportData, windowOf } from './lib/run-log.mjs';

const HELP = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
  .split('\n').slice(1).filter((line) => line.startsWith('//')).map((line) => line.replace(/^\/\/ ?/u, '')).join('\n')
  .split('\nState:')[0];

/** Pure: the help lines of one command. A command's entry starts at two spaces with its name; its
 *  continuation lines are indented further. Every entry for the command is kept (run start, run resume). */
export function helpFor(command, help = HELP) {
  const lines = help.split('\n');
  const start = lines.findIndex((line) => line.startsWith('Commands'));
  const end = lines.findIndex((line, index) => index > start && /^\S/u.test(line) && !line.startsWith('Commands') && !/^--solution/u.test(line));
  const body = lines.slice(start, end < 0 ? undefined : end);
  const header = body.filter((line, index) => index === 0 || (/^\S/u.test(line) && index === 1));
  const kept = [];
  let keep = false;
  for (const line of body.slice(header.length)) {
    if (/^ {2}\S/u.test(line)) keep = line.trim().split(/\s+/u)[0] === command;
    if (keep) kept.push(line);
  }
  return [...header, ...kept].join('\n').trimEnd();
}

const sub = (rest, allowed, name) => {
  const [action, ...args] = rest;
  if (!action || !allowed.includes(action)) throw usage(`${name} takes one of: ${allowed.join(', ')}`);
  return [action, args];
};

const needRun = (values, solution) => {
  const run = resolveRun({ run: values.run, solution });
  if (!run) throw usage('no run: pass --run <id or folder>, or set LOOPS_RUN_ID');
  return run;
};

const PLATFORM_OPTION = { platform: { type: 'string' } };
const machinePlatform = (values) => platformFor({ flag: values.platform ?? null, solution: solutionDir(values.solution) });

async function health(args) {
  const { values } = parse(args, { quick: { type: 'boolean' }, fresh: { type: 'boolean' }, ...PLATFORM_OPTION });
  const platformName = machinePlatform(values);
  const home = await loopsHome();
  const result = await checkHealth({ home, fresh: values.fresh, platform: platformName });
  if (values.quick && !values.json) return { text: result.line, exit: EXIT.OK };
  const suggested = !result.capacity ? '' : platformName === 'WEB' ? `Suggested: browsers ${result.capacity.browsers}, agents ${result.capacity.agents}.` : `Suggested: pool ${result.capacity.pool}, agents ${result.capacity.agents}.`;
  const text = [result.line, ...result.problems.map((problem) => `- ${problem.short}: ${problem.detail}${problem.fixCommand ? ` → ${problem.fixCommand}` : ''}`),
    suggested].filter(Boolean).join('\n');
  return { data: result, text, exit: values.quick || result.ok ? EXIT.OK : EXIT.FAIL };
}

const list = (text) => String(text ?? '').split(',').map((item) => item.trim()).filter(Boolean);

async function doctor(args) {
  const { values, positionals } = parse(args, { only: { type: 'string' }, ...PLATFORM_OPTION });
  const platformName = machinePlatform(values);
  const checks = checksFor(platformName);
  const only = [...positionals, ...list(values.only)];
  const unknown = only.filter((check) => !checks.includes(check));
  if (unknown.length) throw usage(`unknown check(s)${platformName === 'WEB' ? ' for WEB' : ''}: ${unknown.join(', ')}. Checks: ${checks.join(', ')}`);
  const home = await loopsHome();
  const result = await runDoctor({ home, only: only.length ? only : null, platform: platformName });
  return { data: result, text: renderDoctor(result), exit: result.ok ? EXIT.OK : EXIT.FAIL };
}

async function setup(args) {
  const { values } = parse(args, {
    yes: { type: 'boolean' }, only: { type: 'string' }, session: { type: 'string' }, count: { type: 'string' },
    app: { type: 'string' }, url: { type: 'string' }, ...PLATFORM_OPTION,
  });
  const platformName = machinePlatform(values);
  const sources = ['app', 'url'].filter((key) => values[key]);
  if (sources.length > 1) throw usage(`setup takes one Preview app source: --${sources.join(' or --')}, not both`);
  const source = sources.length ? { [sources[0]]: sources[0] === 'url' ? values.url : path.resolve(values[sources[0]]) } : null;
  const home = await loopsHome();
  const only = values.only ? list(values.only) : null;
  return runSetup({ home, yes: values.yes, only, session: values.session, source, count: intFlag(values.count, 'count', { max: 20 }) ?? null, platform: platformName });
}

async function preview(rest) {
  const [, args] = sub(rest, ['install'], 'preview');
  const { values } = parse(args, {
    app: { type: 'string' }, url: { type: 'string' },
    platform: { type: 'string' }, device: { type: 'string' },
    print: { type: 'boolean' }, 'skip-install': { type: 'boolean' }, session: { type: 'string' },
  });
  const home = await loopsHome();
  return previewInstall(values, { home, session: values.session });
}

async function pool(rest) {
  const [action, args] = sub(rest, ['up', 'status', 'add', 'adopt', 'watch'], 'pool');
  const { values, positionals } = parse(args, {
    count: { type: 'string' }, runtime: { type: 'string' }, 'preview-app': { type: 'string' }, session: { type: 'string' },
    port: { type: 'string' }, stop: { type: 'boolean' },
  });
  const home = await loopsHome();
  switch (action) {
    case 'up': return poolUp({ home, count: intFlag(values.count, 'count', { max: 20 }), runtime: values.runtime, previewApp: values['preview-app'], session: values.session });
    case 'status': return poolStatus({ home, session: values.session });
    case 'add': return poolAdd({ home, session: values.session });
    case 'adopt': return poolAdopt({ home, udid: positionals[0], session: values.session });
    default: return poolWatch({ home, port: intFlag(values.port, 'port', { min: 1024, max: 65535 }), stop: values.stop });
  }
}

function impact(args) {
  const { values, positionals } = parse(args, {
    page: { type: 'string' }, module: { type: 'string' }, card: { type: 'string' }, template: { type: 'string' },
    nav: { type: 'boolean' }, 'nav-item': { type: 'string' }, session: { type: 'string' },
  });
  const given = ['page', 'module', 'card', 'template', 'nav', 'nav-item'].filter((key) => values[key]);
  if (given.length > 1) throw usage('pass one of --page, --module, --card, --template, --nav or --nav-item');
  const target = given.length ? { id: given[0] === 'nav' ? 'navigation' : values[given[0]], kind: given[0] } : null;
  return computeImpact({ appId: positionals[0], target, solution: solutionDir(values.solution), session: values.session });
}

function platform(args) {
  const { values, positionals } = parse(args, { session: { type: 'string' } });
  return appPlatform({ appId: positionals[0], solution: solutionDir(values.solution), session: values.session });
}

// The self-review signals of a run (references/self-review.md): add during the run, finish at its end, filed per record.
function signals(rest) {
  const [action, args] = sub(rest, ['add', 'finish', 'filed'], 'signals');
  const { values } = parse(args, { run: { type: 'string' }, key: { type: 'string' }, stage: { type: 'string' }, tool: { type: 'string' }, reason: { type: 'string' }, loop: { type: 'string' }, record: { type: 'string' }, now: { type: 'boolean' } });
  const solution = solutionDir(values.solution);
  if (action === 'add') return addSignal({ run: values.run, solution, key: values.key, stage: values.stage, tool: values.tool ?? null, reason: values.reason, loop: values.loop ?? null });
  if (action === 'filed') return markFiled({ run: values.run, solution, signalKey: values.key, record: values.record });
  return finishSignals({ run: values.run, solution, immediate: Boolean(values.now) });
}

// What an ask is about and which specific loop runs it, for the generic commands (/ua:scope-loop and the rest).
function target(args) {
  const { values, positionals } = parse(args, { verb: { type: 'string' }, mode: { type: 'string' }, whole: { type: 'boolean' }, kind: { type: 'string' }, app: { type: 'string' }, new: { type: 'boolean' }, platform: { type: 'string' }, session: { type: 'string' } });
  return resolveTarget({ ask: positionals.join(' '), verb: values.verb, mode: values.mode ?? null, whole: Boolean(values.whole), kind: values.kind ?? null, app: values.app ?? null, isNew: Boolean(values.new), platform: values.platform ?? null, solution: solutionDir(values.solution), session: values.session });
}

function issues(rest) {
  const [action, args] = sub(rest, ['lint', 'merge', 'split'], 'issues');
  const { values, positionals } = parse(args, { jobs: { type: 'string' }, impact: { type: 'string' }, shared: { type: 'string' }, out: { type: 'string' }, 'out-dir': { type: 'string' }, all: { type: 'boolean' }, 'allow-unproven': { type: 'boolean' } });
  const lists = readLists(positionals);
  if (action === 'lint') {
    const result = lintIssues(lists);
    return { data: result, text: renderLint(result), exit: result.errors ? EXIT.FAIL : EXIT.OK };
  }
  assertLintClean(lists);
  if (action === 'merge') {
    const merged = mergeIssues(lists);
    if (values.out) writeText(path.resolve(values.out), merged.markdown);
    return { data: { issues: merged.issues.length, out: values.out ? path.resolve(values.out) : null }, text: values.out ? `Merged ${merged.issues.length} issues into ${path.resolve(values.out)}.` : merged.markdown.trimEnd() };
  }
  const jobs = intFlag(values.jobs, 'jobs', { max: 50 });
  if (!jobs) throw usage('issues split needs --jobs <n>');
  let shared = { shared: new Set(), dependents: new Map(), names: new Map() };
  if (values.impact) {
    const impactData = readJson(path.resolve(values.impact));
    if (!impactData) throw usage(`${path.resolve(values.impact)} is not the JSON of loops impact <app> --json`);
    shared = sharedFromImpact(impactData);
  }
  for (const id of (values.shared ?? '').split(',').map((item) => item.trim()).filter(Boolean)) shared.shared.add(id);
  const split = splitJobs(lists.flatMap((parsed) => parsed.rows), { jobs, ...shared, all: values.all, allowUnproven: values['allow-unproven'] });
  const outDir = path.resolve(values['out-dir'] ?? path.join(path.dirname(lists[0].file), 'jobs'));
  const result = writeJobs({ split, outDir, header: lists[0].header });
  return { data: result, text: renderSplit(result) };
}

function cacheExportCommand(args) {
  const { values, positionals } = parse(args, { run: { type: 'string' }, session: { type: 'string' } });
  const solution = solutionDir(values.solution);
  return cacheExport({ appId: positionals[0], pageId: positionals[1], run: resolveRun({ run: values.run, solution }), solution, session: values.session });
}

async function queue(rest) {
  const [action, args] = sub(rest, ['add', 'status'], 'queue');
  const { values } = parse(args, QUEUE_OPTIONS);
  const home = await loopsHome();
  const solution = solutionDir(values.solution);
  const run = resolveRun({ run: values.run, solution });
  return action === 'add' ? queueAdd(values, { home, run }) : queueStatus(values, { home, run });
}

function board(args) {
  const { values, positionals } = parse(args, { run: { type: 'string' }, html: { type: 'boolean' }, check: { type: 'boolean' } });
  if (values.check) return checkBoards({ solution: solutionDir(values.solution) });
  return renderBoard({ run: needRun({ run: values.run ?? positionals[0] }, solutionDir(values.solution)), html: values.html });
}

async function runCommand(rest) {
  const [action, args] = sub(rest, ['start', 'job-state', 'resume'], 'run');
  const { values } = parse(args, {
    goal: { type: 'string' }, scope: { type: 'string' }, platform: { type: 'string' }, kind: { type: 'string' }, request: { type: 'string' }, run: { type: 'string' },
    job: { type: 'string' }, step: { type: 'string' }, agent: { type: 'string' }, undo: { type: 'string' }, attempt: { type: 'string' }, 'request-id': { type: 'string' },
  });
  const solution = solutionDir(values.solution);
  if (action === 'resume') return resumeReport({ solution });
  if (action === 'start') {
    return startRun({ solution, home: await loopsHome(), goal: values.goal, platform: values.platform, kind: values.kind ?? null, scope: values.scope, request: values.request ?? null, run: values.run ?? null });
  }
  return writeJobState({ run: needRun(values, solution), job: values.job, step: values.step, agent: values.agent, undo: values.undo, attempt: intFlag(values.attempt, 'attempt', { min: 0 }), request: values['request-id'] ?? values.request });
}

async function signedIn(args) {
  const { values } = parse(args, {});
  const result = signedInPlan({ solution: solutionDir(values.solution), home: await loopsHome() });
  return { data: result.data, text: result.text, exit: result.ok ? EXIT.OK : EXIT.FAIL };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function log(rest) {
  const [action, args] = sub(rest, ['append', 'tokens', 'report', 'share'], 'log');
  const { values, positionals } = parse(args, { run: { type: 'string' }, session: { type: 'string' }, transcript: { type: 'string' }, out: { type: 'string' } });
  const solution = solutionDir(values.solution);
  const home = await loopsHome();
  // tokens, report and share take the run as --run or as their one argument.
  if (action !== 'append' && !values.run && positionals[0]) values.run = positionals[0];
  if (action === 'append') {
    const run = needRun(values, solution);
    const raw = positionals[0] === '-' ? await readStdin() : positionals[0];
    const event = appendEvent(run, parseEventArg(raw), { home });
    return { data: event, text: '' };
  }
  if (action === 'tokens') {
    const run = resolveRun({ run: values.run, solution });
    const inputs = run && fs.existsSync(logFile(run)) ? loadRunInputs(run) : { events: [] };
    const window = windowOf(inputs.events);
    const dispatches = dispatchesOf(inputs.events);
    const fromEvents = inputs.events.map((event) => event.session).filter((id) => typeof id === 'string');
    const ids = [...new Set([...(values.session ?? '').split(',').map((id) => id.trim()).filter(Boolean), ...fromEvents])];
    const files = values.transcript ? [findTranscript({ transcript: values.transcript })]
      : (ids.length ? ids : [null]).map((id) => findTranscript({ session: id ?? undefined }));
    const result = summarizeTokens(files.map((file) => sumSession(file, { dispatches, window })), { window });
    if (run) writeJson(path.join(run.dir, 'tokens.json'), result);
    return { data: result, text: `${renderTokens(result)}${run ? `\nSaved ${path.join(run.dir, 'tokens.json')}` : ''}` };
  }
  const run = needRun(values, solution);
  const inputs = loadRunInputs(run);
  const report = runReportData({ runId: run.id, ...inputs });
  if (action === 'share') return shareSummary(report, scrubList({ home, solution }));
  const out = values.out ? path.resolve(values.out) : path.join(run.dir, 'report.html');
  writeText(out, fill(readTemplate('run-report.html'), report));
  return { data: { file: out, totals: report.totals }, text: `Run report: ${out}` };
}

function perf(rest) {
  const [, args] = sub(rest, ['render'], 'perf');
  const { values, positionals } = parse(args, { out: { type: 'string' } });
  return renderPerf({ input: positionals[0], out: values.out });
}

function shots(rest) {
  const [action, args] = sub(rest, ['add', 'compose', 'list'], 'shots');
  const { values } = parse(args, {
    run: { type: 'string' }, id: { type: 'string' }, side: { type: 'string' }, file: { type: 'string' }, page: { type: 'string' },
    'page-name': { type: 'string' }, issues: { type: 'string' }, state: { type: 'string' }, title: { type: 'string' },
    version: { type: 'string' }, status: { type: 'string' }, by: { type: 'string' }, order: { type: 'string' },
    goal: { type: 'string' }, open: { type: 'boolean' },
  });
  const run = needRun(values, solutionDir(values.solution));
  if (action === 'list') return listShots({ runDir: run.dir });
  if (action === 'compose') return composeShots({ runDir: run.dir, runId: run.id, goal: values.goal, open: values.open });
  return addShot({
    runDir: run.dir, id: values.id, side: values.side, file: values.file, page: values.page, pageName: values['page-name'],
    issues: values.issues, state: values.state, title: values.title, version: values.version, status: values.status,
    by: values.by, order: intFlag(values.order, 'order', { min: 0 }),
  });
}

async function capacityCommand(args) {
  const { values } = parse(args, PLATFORM_OPTION);
  const platformName = machinePlatform(values);
  const home = await loopsHome();
  const config = readJson(path.join(home, 'config.json'), {});
  const result = capacity({ config });
  const machine = `${result.machine.ramGb ?? '?'} GB RAM, ${result.machine.perfCores ?? '?'} performance cores`;
  if (platformName === 'WEB') {
    const browsers = browserCapacity(config);
    return { data: { platform: 'WEB', machine: result.machine, agents: result.agents, suggested: { agents: result.suggested.agents }, overridden: { agents: result.overridden.agents }, browsers }, text: `${machine} → agents ${result.agents}; ${browsers.freeGb} GB free → ${browsers.browsers} browsers (cap ${browsers.cap})` };
  }
  return { data: result, text: `${machine} → pool ${result.pool} ${result.slim ? 'slim' : 'stock'} simulators, agents ${result.agents}` };
}

const readFile = (file, label) => {
  try { return fs.readFileSync(path.resolve(file), 'utf8'); }
  catch { throw usage(`${label} ${file} could not be read`); }
};

function scope(rest) {
  const [action, args] = sub(rest, ['tickets-check', 'tickets-render'], 'scope');
  const { values, positionals } = parse(args, {
    prd: { type: 'string' }, previous: { type: 'string' }, 'previous-prd': { type: 'string' }, version: { type: 'string' },
    'app-name': { type: 'string' }, 'app-id': { type: 'string' }, 'solution-name': { type: 'string' }, 'solution-id': { type: 'string' },
    keys: { type: 'string' }, out: { type: 'string' }, files: { type: 'string' },
  });
  if (!positionals[0] || !values.prd) throw usage(`scope ${action} <tickets.json> --prd <prd.md>`);
  let plan;
  try { plan = JSON.parse(readFile(positionals[0], 'tickets file')); }
  catch (error) { if (error instanceof LoopsError) throw error; throw usage(`${positionals[0]} is not JSON`); }
  const prdText = readFile(values.prd, 'PRD file');
  if (action === 'tickets-check') {
    let result;
    try {
      result = checkTickets({ plan, prdText, previous: values.previous ? readPrevious(readFile(values.previous, 'previous tickets')) : null,
        previousPrdText: values['previous-prd'] ? readFile(values['previous-prd'], 'previous PRD') : null });
    } catch (error) { throw usage(error.message); }
    const { counts, slices } = result;
    const moved = values.previous ? `\nKept ${slices.kept.length} (${slices.changed.length} changed), new ${slices.new.length}, dropped ${slices.dropped.length}.` : '';
    const text = result.ok
      ? `${plural(counts.tickets, 'ticket')} cover ${plural(counts.requirements, 'requirement')} and build ${plural(counts.screens, 'screen')}; ${counts.later} for later.${moved}${result.warnings.map((line) => `\n- ${line}`).join('')}`
      : `${plural(result.errors.length, 'problem')}:\n${result.errors.map((line) => `- ${line}`).join('\n')}`;
    return { data: result, text, exit: result.ok ? EXIT.OK : EXIT.FAIL };
  }
  const version = intFlag(values.version, 'version');
  if (!version || !values['app-name']) throw usage('scope tickets-render needs --version <n> and --app-name <name>');
  let keys = {};
  if (values.keys) {
    try { keys = readKeys(JSON.parse(readFile(values.keys, 'keys file'))); }
    catch (error) { if (error instanceof LoopsError) throw error; throw usage(`${values.keys} is not JSON`); }
  }
  let tickets;
  try {
    tickets = renderTickets({ plan, prdText, prdVersion: version, appName: values['app-name'], appId: values['app-id'] ?? null,
      solutionName: values['solution-name'] ?? null, solutionId: values['solution-id'] ?? null, keys });
  } catch (error) { throw usage(error.message); }
  const out = values.out ? path.resolve(values.out) : null;
  if (out) writeJson(out, tickets);
  // One file per ticket, so the person files them wherever the team keeps its
  // work. The body is what a tracker shows; the index is the build order.
  const files = values.files ? path.resolve(values.files) : null;
  if (files) {
    fs.mkdirSync(files, { recursive: true });
    for (const ticket of tickets) {
      fs.writeFileSync(path.join(files, `${ticket.slice}.md`), `${ticket.title}\n\n${ticket.description}`);
    }
    const rows = tickets.map((ticket) => `- \`${ticket.slice}.md\` · layer ${ticket.layer} · ${keys[ticket.slice]?.key ?? (ticket.ready ? 'ready to file' : `waits for ${ticket.waitsFor.join(', ')}`)} · ${ticket.title}`);
    fs.writeFileSync(path.join(files, 'index.md'), `# Tickets to file, in build order\n\n${rows.join('\n')}\n`);
  }
  const text = tickets.map((ticket) => `${ticket.slice} · layer ${ticket.layer} · ${keys[ticket.slice]?.key ? `filed ${keys[ticket.slice].key}` : ticket.ready ? 'ready' : `waits for ${ticket.waitsFor.join(', ')}`} · ${ticket.title}`).join('\n');
  const wrote = [out ? `Wrote ${out}.` : null, files ? `Wrote ${tickets.length + 1} files in ${files}.` : null].filter(Boolean).join(' ');
  return { data: { tickets, out, files }, text: wrote ? `${text}\n${wrote}` : text };
}

const COMMANDS = { health, doctor, setup, preview, pool, platform, target, signals, impact, issues, scope, queue, 'cache-export': cacheExportCommand, board, run: runCommand, 'signed-in': signedIn, log, perf, shots, capacity: capacityCommand };

export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const json = argv.includes('--json');
  const quick = command === 'health' && argv.includes('--quick') && !json;
  if (!command || command === 'help' || command === '-h' || command === '--help') {
    process.stdout.write(`${HELP}\n`);
    return EXIT.OK;
  }
  try {
    const handler = COMMANDS[command];
    if (!handler) throw usage(`unknown command "${command}". Run loops.mjs --help.`);
    if (rest.includes('--help') || rest.includes('-h')) {
      process.stdout.write(`${helpFor(command)}\n`);
      return EXIT.OK;
    }
    const result = await handler(rest);
    emit(result, { json });
    return result.exit ?? EXIT.OK;
  } catch (error) {
    if (quick) return EXIT.OK; // the session-start line: silent on any error
    const loops = error instanceof LoopsError ? error : new LoopsError(error?.usage ? error.message : `${error?.message ?? error}`, { exit: error?.usage ? EXIT.USAGE : EXIT.FAIL });
    if (json) process.stdout.write(`${JSON.stringify({ error: { code: loops.code, message: loops.message }, ...(loops.data && typeof loops.data === 'object' ? loops.data : {}) }, null, 2)}\n`);
    else if (loops.exit === EXIT.CONSENT) process.stdout.write(`${loops.message}\nRun setup --yes after the person agrees (or --only <ids>).\n`);
    else process.stderr.write(`loops: ${loops.message}\n`);
    return loops.exit;
  }
}

const self = fs.realpathSync(fileURLToPath(import.meta.url));
let invoked = null;
try {
  invoked = process.argv[1] ? fs.realpathSync(process.argv[1]) : null;
} catch {
  invoked = null;
}
if (invoked === self) process.exitCode = await main();
