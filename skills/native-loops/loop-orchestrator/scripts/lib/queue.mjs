// The device queue: native-device-pool's device-pool queue, under the loops' kinds.
//   retest          re-measure the issues a fix job says it fixed (needs --issues)
//   replay          replay the recorded steps of reproduced issues (the steps column: an argent flow
//                   on MOBILE, browser steps on WEB), check the expected result and, for saved data,
//                   the record read-only; then one look at the page for regressions (needs --issues,
//                   a log whose issues carry steps)
//   visual-check    measure a page against its design spec (per width on WEB)
//   touch-feedback  MOBILE: press-and-hold shots of every tappable (the touch feedback check)
//   interaction     WEB: hover, focus, pointer, keyboard reach and focus order (web-browser
//                   interaction.mjs, W1-W6), the interaction check
//   performance     a light timing of the page's open and main interactions (the performance check)
//   a11y            WEB only: names, labels, contrast, headings, ARIA (web-browser a11y.mjs)
//   responsive      WEB only: overflow, cut text, overlap, navigation per width (web-browser responsive.mjs)
//   acceptance      do the steps of one acceptance line of a feature, then check the screen and, read-only, the
//                   records and automation runs its Effects: block names (needs --steps, a steps file in the run)
//   realtime        two devices: device 1 does the steps, device 2 must show each Watch: line within its
//                   seconds (needs --steps, a steps file in the run with a Watch: block)
//   capture         screenshots only, judged by nothing, kept to show the person what changed (`loops shots`):
//                   --side before shoots the state of each issue in --issues before its fix job writes;
//                   --side after shoots the page as built, top to bottom, and each of --regions in view
//   loading         record the page opening fresh and find bands left blank and content that moves when
//                   the data arrives (native-loading-states' loading check)
// --platform web|mobile says whose device serves a request (default mobile): one test runner per
// simulator drains the mobile ones, one per browser folder the web ones, and neither takes the other's.
// Agents never wait for a device.
import fs from 'node:fs';
import path from 'node:path';
import { blockError, devicePool } from './blocks.mjs';
import { issuesWithSteps, parseIssues } from './issues.mjs';
import { failed, missing, plural, table, usage } from './output.mjs';

export const QUEUE_KINDS = ['retest', 'replay', 'visual-check', 'touch-feedback', 'interaction', 'performance', 'acceptance', 'realtime', 'capture', 'loading', 'a11y', 'responsive'];
// The checks only a browser can make: they are queued with --platform web.
export const WEB_KINDS = ['a11y', 'responsive'];
// The checks only a phone makes: WEB has no loading check.
export const MOBILE_KINDS = ['loading'];
// The kinds a test runner serves from a steps file (--steps), not from an issue log.
export const STEPS_KINDS = ['acceptance', 'realtime'];
// Which side of the change a capture shoots.
export const CAPTURE_SIDES = ['before', 'after'];
// How long device 2 has to show a Watch: line when the line gives no seconds.
export const WATCH_DEFAULT_SECONDS = 10;
export const QUEUE_PLATFORMS = ['mobile', 'web'];
export const QUEUE_STATUSES = ['queued', 'running', 'done', 'failed'];
const PASS_THROUGH = ['page-name', 'pass', 'regions', 'version', 'app', 'endpoint', 'bundle-id', 'test-user', 'sign-in-flow', 'plan', 'solution-dir', 'side', 'note'];

/** Pure: --platform as device-pool takes it ('mobile' or 'web'), or undefined when not given. */
export function platformArg(value) {
  if (value === undefined || value === null) return undefined;
  const platform = String(value).trim().toLowerCase();
  if (!QUEUE_PLATFORMS.includes(platform)) throw usage(`--platform must be one of ${QUEUE_PLATFORMS.join(', ')}`);
  return platform;
}

export const QUEUE_OPTIONS = {
  kind: { type: 'string' }, page: { type: 'string' }, issues: { type: 'string' }, steps: { type: 'string' }, run: { type: 'string' }, status: { type: 'string' }, platform: { type: 'string' },
  mine: { type: 'boolean' }, session: { type: 'string' },
  ...Object.fromEntries(PASS_THROUGH.map((key) => [key, { type: 'string' }])),
};

/** Pure: device-pool arguments for `queue add`. */
export function queueAddArgs(values, { runDir }) {
  const kind = values.kind;
  if (!kind) throw usage(`queue add needs --kind (${QUEUE_KINDS.join(', ')})`);
  if (!QUEUE_KINDS.includes(kind)) throw usage(`--kind must be one of ${QUEUE_KINDS.join(', ')}`);
  const platform = platformArg(values.platform);
  if (WEB_KINDS.includes(kind) && platform !== 'web') throw usage(`${kind} is a web check: add --platform web`);
  if (MOBILE_KINDS.includes(kind) && platform === 'web') throw usage(`WEB has no ${kind} check: a ${kind} request is MOBILE only`);
  if (!values.page) throw usage('queue add needs --page <page id>');
  if (!runDir) throw usage('queue add needs the run: --run <id or folder>, or LOOPS_RUN_ID');
  if (kind === 'retest' && !values.issues) throw usage('a retest needs --issues <issue log file>');
  if (kind === 'replay' && !values.issues) throw usage('a replay needs --issues <issue log whose issues carry their recorded steps>');
  if (STEPS_KINDS.includes(kind) && !values.steps) throw usage(`${kind === 'realtime' ? 'a realtime' : 'an acceptance'} check needs --steps <steps file in the run folder>`);
  if (values.steps !== undefined && !STEPS_KINDS.includes(kind)) throw usage(`--steps is for the ${STEPS_KINDS.join(' and ')} checks; a ${kind} request takes no steps file`);
  if (kind === 'capture' && !CAPTURE_SIDES.includes(values.side)) throw usage(`a capture needs --side ${CAPTURE_SIDES.join('|')}: before (the issues' states, before the fix) or after (the page as built)`);
  if (kind === 'capture' && values.side === 'before' && !values.issues) throw usage('a before capture needs --issues <the job\'s issue log>: it shoots the state each issue shows in');
  if (values.side !== undefined && kind !== 'capture') throw usage(`--side is for a capture; a ${kind} request takes no side`);
  const args = ['queue', 'add', '--kind', kind, '--run', runDir, '--page', values.page];
  if (platform) args.push('--platform', platform);
  for (const key of PASS_THROUGH) if (values[key] !== undefined) args.push(`--${key}`, values[key]);
  if (values.issues) args.push('--issues', path.resolve(values.issues));
  if (values.steps) args.push('--steps', path.resolve(values.steps));
  return args;
}

const BLOCK_HEADERS = ['Effects', 'Watch'];
const ITEM_SHAPES = {
  Effects: '`- record <object name> (<object id>) · <record id or filter> · <field> = <value>` or `- run <automation name> (<id>) · success|failed · after step <n>`',
  Watch: '`- device 2 shows <expected> within <n> s`',
};

/** Pure: the lines of one block (`Effects:` or `Watch:`) of a steps file, with their line numbers. */
function blockLines(lines, header) {
  const start = lines.findIndex((line) => line.trim() === `${header}:`);
  if (start < 0) return null;
  const items = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (!line.startsWith('- ')) break;
    items.push({ line, number: index + 1 });
  }
  return items;
}

/** Pure: one `Effects:` line, or null when it has neither shape. */
export function parseEffect(line) {
  const record = /^- record (.+?) \(([^()\s]+)\) · (.+?) · (.+?) = (.+)$/u.exec(line);
  if (record) return { kind: 'record', object: record[1].trim(), objectId: record[2], target: record[3].trim(), field: record[4].trim(), value: record[5].trim() };
  const run = /^- run (.+?) \(([^()\s]+)\) · (success|failed) · after step (\d+)$/u.exec(line);
  if (run) return { kind: 'run', automation: run[1].trim(), id: run[2], status: run[3], afterStep: Number(run[4]) };
  return null;
}

/** Pure: one `Watch:` line, or null. The window is the line's seconds, else WATCH_DEFAULT_SECONDS. */
export function parseWatch(line) {
  const match = /^- device 2 shows (.+?)(?: within (\d+) s)?$/u.exec(line);
  if (!match || !match[1].trim()) return null;
  return { expected: match[1].trim(), seconds: match[2] ? Number(match[2]) : WATCH_DEFAULT_SECONDS };
}

/**
 * Pure: what an acceptance or realtime check reads from its steps file (the reproduce stage's steps
 * format plus the optional `Effects:` and `Watch:` blocks). Refuses a file a test runner could not
 * serve: an Effects or Watch line in neither shape, a run line after a step the file does not have,
 * an acceptance file with nothing to check, a realtime file with no Watch line, and a Watch block
 * on an acceptance check.
 */
export function stepsChecks(text, file = '(text)', kind = 'acceptance') {
  const lines = String(text).split(/\r?\n/u);
  const steps = lines.filter((line) => /^\s*\d+\.\s+\S/u.test(line)).length;
  const blocks = Object.fromEntries(BLOCK_HEADERS.map((header) => [header, blockLines(lines, header)]));
  for (const header of BLOCK_HEADERS) {
    for (const item of blocks[header] ?? []) {
      const parsed = header === 'Effects' ? parseEffect(item.line) : parseWatch(item.line);
      if (!parsed) throw usage(`${file}:${item.number}: "${item.line}" is not ${header === 'Effects' ? 'an' : 'a'} ${header}: line; write ${ITEM_SHAPES[header]}`);
      if (parsed.kind === 'run' && (parsed.afterStep < 1 || parsed.afterStep > steps)) {
        throw usage(`${file}:${item.number}: "after step ${parsed.afterStep}", but the file has ${plural(steps, 'numbered step')}`);
      }
      if (header === 'Watch' && parsed.seconds < 1) throw usage(`${file}:${item.number}: a Watch: line gives device 2 at least 1 s`);
    }
  }
  const effects = (blocks.Effects ?? []).map((item) => parseEffect(item.line));
  const watch = (blocks.Watch ?? []).map((item) => parseWatch(item.line));
  const expect = lines.some((line) => /^\s*(?:\d+\.\s+)?Expect:\s*\S/u.test(line));
  if (kind === 'realtime' && !watch.length) throw usage(`${file} has no Watch: block with a \`- device 2 shows <expected> within <n> s\` line: a realtime check has nothing to watch`);
  if (kind === 'acceptance' && blocks.Watch) throw usage(`${file} has a Watch: block: queue it as --kind realtime`);
  if (kind === 'acceptance' && !expect && !effects.length) throw usage(`${file} has no Expect: line and no Effects: block: an acceptance check has nothing to check`);
  return { steps, expect, effects, watch };
}

/** The steps file must exist and sit inside the run folder: a test runner reads only R. */
export function stepsFileIn(runDir, file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) throw missing(`${resolved} does not exist`);
  const real = fs.realpathSync(resolved);
  const root = fs.existsSync(runDir) ? fs.realpathSync(runDir) : path.resolve(runDir);
  const inside = path.relative(root, real);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw usage(`${resolved} is not inside the run folder ${root}: write the steps file under R/accept/<feature>/<n>/`);
  return real;
}

/** Pure: device-pool arguments for `queue status`. */
export function queueListArgs(values, { runDir } = {}) {
  if (values.kind && !QUEUE_KINDS.includes(values.kind)) throw usage(`--kind must be one of ${QUEUE_KINDS.join(', ')}`);
  const platform = platformArg(values.platform);
  const args = ['queue', 'list'];
  if (values.status) args.push('--status', values.status);
  if (values.kind) args.push('--kind', values.kind);
  if (platform) args.push('--platform', platform);
  if (values.mine) args.push('--mine');
  if (runDir) args.push('--run', runDir);
  return args;
}

/** Pure: a replay's issue log must name at least one issue with a steps file; the ids it can replay. */
export function replayableIds(text, file = '(text)') {
  const rows = issuesWithSteps([parseIssues(text, file)]);
  if (!rows.length) throw usage(`${file} names no issue with recorded steps (the steps column, steps:<file>): a replay has nothing to run; queue a retest instead`);
  return rows.map((row) => row.cells.id);
}

export function queueAdd(values, { home, run }) {
  const args = queueAddArgs(values, { runDir: run?.dir });
  if (values.issues && !fs.existsSync(path.resolve(values.issues))) throw missing(`${path.resolve(values.issues)} does not exist`);
  if (values.kind === 'replay') replayableIds(fs.readFileSync(path.resolve(values.issues), 'utf8'), path.resolve(values.issues));
  if (STEPS_KINDS.includes(values.kind)) {
    const steps = stepsFileIn(run.dir, values.steps);
    stepsChecks(fs.readFileSync(steps, 'utf8'), steps, values.kind);
  }
  fs.mkdirSync(run.dir, { recursive: true });
  const result = devicePool(args, { home, session: values.session });
  if (result.status !== 0) throw failed(`queue add failed: ${blockError(result)}`, result.json ?? undefined);
  const record = result.json?.request ?? result.json ?? {};
  const on = values.platform ? ` (${platformArg(values.platform)})` : '';
  return { data: result.json, text: `Queued ${values.kind}${on} for ${values['page-name'] ?? values.page}${record.id ? ` (${record.id})` : ''}.` };
}

const requestsOf = (json) => (Array.isArray(json) ? json : json?.requests ?? json?.items ?? json?.queue ?? []);

export function queueStatus(values, { home, run }) {
  const result = devicePool(queueListArgs(values, { runDir: run?.dir }), { home, session: values.session });
  if (result.status !== 0) throw failed(`queue status failed: ${blockError(result)}`);
  const requests = requestsOf(result.json);
  const counts = {};
  for (const request of requests) {
    const kind = request.verifyKind ?? request.kind ?? '?';
    counts[kind] ??= Object.fromEntries(QUEUE_STATUSES.map((status) => [status, 0]));
    counts[kind][request.status] = (counts[kind][request.status] ?? 0) + 1;
  }
  const rows = Object.entries(counts).sort().map(([kind, by]) => [kind, ...QUEUE_STATUSES.map((status) => by[status] ?? 0)]);
  const text = requests.length ? `${plural(requests.length, 'request')}\n${table(['kind', ...QUEUE_STATUSES], rows)}` : 'The device queue is empty.';
  return { data: { counts, requests }, text };
}
