#!/usr/bin/env node
// The device pool: simulators, one reservation per session, page locks, named
// locks, the device queue and the guard hooks, over LOOPS_HOME (default <UA_HOME>/loops, ~/.unifyapps-solutions/loops).
// Zero dependencies, Node 22+.
import { existsSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loopsHome, readConfig, ensureHome, statePaths } from './lib/state.mjs';
import { handleHook, HOOK_EVENTS } from './lib/hooks.mjs';
import { CommandError, EXIT, ago, emit, hhmm, shortId, table, usage } from './cmd/output.mjs';
import { resolveSessionId } from './cmd/context.mjs';
import { holdersAndWaiters, release, renew, reapCommand, reserve, who } from './cmd/reservation.mjs';
import { lockCommand, pageLockCommand } from './cmd/locks.mjs';
import { poolBoot, poolInit, poolInstall, poolRemove, poolSet, poolShutdown, poolStatus } from './cmd/pool.mjs';
import { configCommand, renderStatus, status } from './cmd/status.mjs';
import { QUEUE_KINDS, addRequest, awaitRequest, cancelRequest, doneRequest, failRequest, listRequests, requeueRequest, takeRequest } from './cmd/queue.mjs';
import { loadPool } from './cmd/context.mjs';

const HELP = `Usage: device-pool <command> [options]

Pool
  pool init [--count N] [--model "iPhone 16 Pro"] [--runtime ID] [--preview-app <path|url>] [--clone-from UDID] [--skip-install]
                                           N: --count, else config pool.size, else the existing pool's size.
                                           Runtime: --runtime, else config pool.runtime, else iOS 18.6, else the newest 18.x.
                                           Each new or cloned simulator is slimmed before its first boot: the
                                           background services a test device does not need stay off.
                                           config pool.slim=false keeps them on; pool boot applies either.
  pool status | boot | shutdown | remove   [--udid U | --all] [--force]
  pool install [--udid U | --all] [--preview-app <path|url>]
  pool set <udid> key=value ...            dotted keys under the device's state, e.g. currentApp.endpoint=https://...

Reservation (one simulator per session)
  reserve [--prefer U] [--task "<loop> <page>"] [--profile release] [--wait SEC] [--ttl SEC]
  renew [--udid U] [--ttl SEC]
  release [--udid U] [--all --force]
  reap                                     drop expired, dead-owner and corrupt records
  who <udid>

Coordination
  lock acquire|release|status <name> [--ttl SEC]
  page-lock acquire|release <tenant> <appId> <pageId> [--plan P] [--ttl SEC]
  page-lock list [tenant [appId]]
  status                                   sessions, reservations, page locks, locks, waiters, device queue

Device queue (the loops' device checks: a simulator on MOBILE, a browser folder on WEB)
  queue add --run DIR --page ID [--page-name N] [--kind ${QUEUE_KINDS.join('|')}]
            [--platform mobile|web] [--pass N] [--regions a,b]
            [--version draft|published] [--app ID --endpoint URL --bundle-id ID] [--test-user U] [--sign-in-flow F]
            [--plan P] [--solution-dir DIR] [--issues FILE] [--steps FILE] [--side before|after] [--note TEXT]
                                           (retest and replay need --issues; acceptance and realtime need --steps,
                                           a steps file inside the run folder, and realtime its Watch: block;
                                           capture needs --side, and a before capture --issues;
                                           no --platform is a simulator's request; touch-feedback is the
                                           MOBILE check, interaction the WEB one, a11y and responsive WEB only)
  queue list [--status queued|running|done|failed] [--kind K] [--platform mobile|web] [--mine] [--run DIR]
  queue take [ID] [--kind K] [--platform mobile|web] [--udid U]
                                           the oldest queued request (of kind K, or ID) of the test runner's
                                           platform (default mobile) for this session; another platform's ID is refused
  queue done ID --result DIR [--summary L] [--gaps N --off N --missing N] [--shown "draft vN"]
  queue fail ID --reason TEXT | queue requeue ID | queue cancel ID [--force]
  queue await ID [--wait SEC] [--poll SEC]  block until done (0), failed (1) or still pending (3)
  config get [key] [--raw] | config set key=value ...
  hook session-start|session-end|stop|pre-tool|post-tool|pretool-bash   (stdin: the Claude Code hook JSON;
                                           without a pool every hook exits 0 at once and writes nothing)

Options
  --session ID   The Claude session. Default: $LOOPS_SESSION_ID, else $CLAUDE_CODE_SESSION_ID. Never a value from memory.
  --json         JSON output (the default when stdout is not a terminal).
  --force        Evict another session's reservation, lock or page lock, or shut down its device.
  -h, --help     This help.

State lives in $LOOPS_HOME (default $UA_HOME/loops, i.e. ~/.unifyapps-solutions/loops; a legacy ~/.agentic-loops
is moved there once; leases/ and claims/ from before become reservations/ and page-locks/). LOOPS_FAKE_SIMCTL=1
swaps simctl for an in-memory fake (tests).

Exit codes: 0 ok, 1 error, 2 usage, 3 busy (POOL_EXHAUSTED, HELD), 4 refused (not the owner, past maxHoldSec).`;

const OPTIONS = {
  session: { type: 'string' },
  task: { type: 'string' },
  prefer: { type: 'string' },
  profile: { type: 'string' },
  wait: { type: 'string' },
  ttl: { type: 'string' },
  udid: { type: 'string' },
  all: { type: 'boolean' },
  force: { type: 'boolean' },
  json: { type: 'boolean' },
  raw: { type: 'boolean' },
  count: { type: 'string' },
  model: { type: 'string' },
  runtime: { type: 'string' },
  'preview-app': { type: 'string' },
  'clone-from': { type: 'string' },
  'skip-install': { type: 'boolean' },
  plan: { type: 'string' },
  run: { type: 'string' },
  kind: { type: 'string' },
  platform: { type: 'string' },
  page: { type: 'string' },
  'page-name': { type: 'string' },
  pass: { type: 'string' },
  regions: { type: 'string' },
  version: { type: 'string' },
  app: { type: 'string' },
  endpoint: { type: 'string' },
  'bundle-id': { type: 'string' },
  'test-user': { type: 'string' },
  'sign-in-flow': { type: 'string' },
  'solution-dir': { type: 'string' },
  note: { type: 'string' },
  issues: { type: 'string' },
  steps: { type: 'string' },
  side: { type: 'string' },
  status: { type: 'string' },
  mine: { type: 'boolean' },
  result: { type: 'string' },
  summary: { type: 'string' },
  gaps: { type: 'string' },
  off: { type: 'string' },
  missing: { type: 'string' },
  shown: { type: 'string' },
  reason: { type: 'string' },
  poll: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
};

function renderReservation(result) {
  return `${result.outcome}: ${result.name} (${result.udid}) ${result.profile}, ${result.bundleId}, expires ${hhmm(result.expiresAt)}${result.task ? ` · task "${result.task}"` : ''}`;
}

function renderPoolStatus(result) {
  const app = result.app ? `${result.app.bundleId} ${result.app.kind} v${result.app.version ?? '?'} (${result.app.build ?? '?'})${result.app.sha256 ? ` sha ${result.app.sha256.slice(0, 12)}` : ''}` : 'none';
  return `${result.model} on ${result.runtime}\napp: ${app}\n${table(result.devices, [
    { label: '#', key: 'index' }, { label: 'name', key: 'name' }, { label: 'udid', key: 'udid' }, { label: 'sim', key: 'simState' },
    { label: 'app', get: (row) => (row.appInstalled ? 'installed' : 'missing') },
    { label: 'slim', get: (row) => (row.slimChecked && row.slimChecked !== row.slim ? `${row.slim} (live: ${row.slimChecked})` : row.slim) },
    { label: 'reservation', get: (row) => (row.reservation ? `${shortId(row.reservation.sessionId)} ${row.reservation.profile} until ${hhmm(row.reservation.expiresAt)}${row.reservation.task ? ` (${row.reservation.task})` : ''}` : 'free') },
    { label: 'current app', get: (row) => (row.currentApp?.endpoint ? `${row.currentApp.endpoint} ${row.currentApp.version ?? ''}`.trim() : '-') },
  ])}`;
}

function renderRequest(request) {
  const where = request.status === 'queued' ? `position ${request.position ?? '?'}` : request.status === 'running' ? `by ${shortId(request.takenBy?.sessionId)}${request.takenBy?.udid ? ` on ${request.takenBy.udid}` : ''}` : request.status === 'done' ? `result ${request.result?.dir}${request.result?.summary ? ` · ${request.result.summary}` : ''}` : `${request.failure?.reason ?? ''}`;
  return `${request.id} ${request.status}: ${request.task}${request.platform === 'web' ? ' [web]' : ''} (${request.runId}) ${where}`;
}

function renderRequestList(requests) {
  // A platform column appears only when a web request is listed, so a queue of simulator requests prints as before.
  const platform = requests.some((row) => row.platform === 'web') ? [{ label: 'platform', get: (row) => (row.platform === 'web' ? 'web' : 'mobile') }] : [];
  return table(requests, [
    { label: '#', get: (row) => (row.position ? String(row.position) : '-') }, { label: 'id', key: 'id' }, { label: 'status', key: 'status' }, { label: 'kind', key: 'verifyKind' },
    ...platform,
    { label: 'task', get: (row) => row.task ?? '-' }, { label: 'from', get: (row) => shortId(row.sessionId) }, { label: 'by', get: (row) => (row.takenBy ? shortId(row.takenBy.sessionId) : '-') },
    { label: 'since', get: (row) => ago(row.acquiredAt) }, { label: 'run', get: (row) => row.runId },
  ]);
}

function exhaustedTable(payload) {
  return [
    'pool exhausted',
    table(payload.holders, [
      { label: 'device', key: 'name' }, { label: 'udid', key: 'udid' }, { label: 'session', get: (row) => shortId(row.sessionId) },
      { label: 'task', get: (row) => row.task ?? '-' }, { label: 'held', get: (row) => ago(row.acquiredAt) }, { label: 'expires', get: (row) => hhmm(row.expiresAt) },
    ]),
    payload.waiters.length ? `waiting: ${payload.waiters.map((row) => `${shortId(row.sessionId)}${row.task ? ` (${row.task})` : ''}`).join(', ')}` : 'no other waiters',
  ].join('\n');
}

async function runHook(event, home, config) {
  if (!HOOK_EVENTS.includes(event)) return;
  let input = null;
  try {
    const text = await new Promise((resolve, reject) => {
      let buffer = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => { buffer += chunk; });
      process.stdin.on('end', () => resolve(buffer));
      process.stdin.on('error', reject);
    });
    input = JSON.parse(text);
  } catch {
    return;
  }
  const output = await handleHook(event, input, { home, config });
  if (output) process.stdout.write(`${output}\n`);
}

async function main(argv) {
  const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return EXIT.OK;
  }
  const home = loopsHome();
  if (command === 'hook') {
    // Every UnifyApps Headless session runs these hooks; without a pool there is nothing to guard.
    if (!HOOK_EVENTS.includes(rest[0]) || !existsSync(statePaths(home).pool)) return EXIT.OK;
    let hookConfig;
    try {
      hookConfig = readConfig(home);
    } catch {
      return EXIT.OK; // a broken config.json never fails a tool call
    }
    await runHook(rest[0], home, hookConfig);
    return EXIT.OK;
  }
  ensureHome(home);
  const config = readConfig(home);
  const json = Boolean(values.json) || !process.stdout.isTTY;

  const sessionId = () => resolveSessionId(values);

  switch (command) {
    case 'pool': {
      const [action, ...args] = rest;
      switch (action) {
        case 'init': emit(await poolInit({ home, config, sessionId: values.session ?? process.env.LOOPS_SESSION_ID ?? null, values }), { json, render: () => renderPoolStatus(poolStatus({ home })) }); return EXIT.OK;
        case 'status': emit(poolStatus({ home }), { json, render: renderPoolStatus }); return EXIT.OK;
        case 'boot': emit(await poolBoot({ home, config, values }), { json }); return EXIT.OK;
        case 'shutdown': emit(await poolShutdown({ home, sessionId: values.session ?? process.env.LOOPS_SESSION_ID ?? null, values }), { json }); return EXIT.OK;
        case 'remove': emit(await poolRemove({ home, values }), { json }); return EXIT.OK;
        case 'install': emit(await poolInstall({ home, config, values }), { json }); return EXIT.OK;
        case 'set': emit(await poolSet({ home, udid: args[0], pairs: args.slice(1) }), { json }); return EXIT.OK;
        default: throw usage(`pool takes init, status, boot, shutdown, remove, install or set, not "${action ?? ''}"`);
      }
    }
    case 'reserve': {
      try {
        emit(await reserve({ home, config, sessionId: sessionId(), values }), { json, render: renderReservation });
      } catch (error) {
        if (error instanceof CommandError && error.payload?.error === 'POOL_EXHAUSTED') process.stderr.write(`${exhaustedTable(error.payload)}\n`);
        throw error;
      }
      return EXIT.OK;
    }
    case 'renew': emit(renew({ home, config, sessionId: sessionId(), values }), { json }); return EXIT.OK;
    case 'release': emit(await release({ home, sessionId: sessionId(), values }), { json }); return EXIT.OK;
    case 'reap': emit(reapCommand({ home }), { json }); return EXIT.OK;
    case 'who': {
      if (!rest[0]) throw usage('who needs <udid>');
      emit(who({ home, udid: rest[0] }), { json });
      return EXIT.OK;
    }
    case 'lock': {
      const [action, name] = rest;
      emit(lockCommand({ home, config, sessionId: action === 'status' ? null : sessionId(), action, name, values }), { json });
      return EXIT.OK;
    }
    case 'page-lock': {
      const [action, tenant, appId, pageId] = rest;
      const needsSession = action !== 'list';
      emit(pageLockCommand({ home, config, sessionId: needsSession ? sessionId() : null, action, tenant, appId, pageId, values }), { json });
      return EXIT.OK;
    }
    case 'status': emit(await status({ home }), { json, render: renderStatus }); return EXIT.OK;
    case 'config': {
      const [action, ...args] = rest;
      const result = configCommand({ home, config, action, args, values });
      if (values.raw && action === 'get') {
        process.stdout.write(`${result.raw}\n`);
        return EXIT.OK;
      }
      emit(result, { json: true });
      return EXIT.OK;
    }
    case 'queue': {
      const [action, ...args] = rest;
      switch (action) {
        case 'add': emit(addRequest({ home, sessionId: sessionId(), values }), { json, render: renderRequest }); return EXIT.OK;
        case 'list': emit({ requests: listRequests(home, { status: values.status ?? null, mine: values.mine ? sessionId() : null, run: values.run ?? null, kind: values.kind ?? null, platform: values.platform ?? null }) }, { json, render: (result) => renderRequestList(result.requests) }); return EXIT.OK;
        case 'take': emit(await takeRequest({ home, sessionId: sessionId(), values, id: args[0] ?? null }), { json, render: renderRequest }); return EXIT.OK;
        case 'done': emit(doneRequest({ home, sessionId: sessionId(), id: args[0], values }), { json, render: renderRequest }); return EXIT.OK;
        case 'fail': emit(failRequest({ home, sessionId: sessionId(), id: args[0], values }), { json, render: renderRequest }); return EXIT.OK;
        case 'requeue': emit(requeueRequest({ home, sessionId: sessionId(), id: args[0], values }), { json, render: renderRequest }); return EXIT.OK;
        case 'cancel': emit(cancelRequest({ home, sessionId: sessionId(), id: args[0], values }), { json }); return EXIT.OK;
        case 'await': emit(await awaitRequest({ home, config, id: args[0], values }), { json, render: renderRequest }); return EXIT.OK;
        default: throw usage('queue takes add, list, take, done, fail, requeue, cancel or await');
      }
    }
    case 'exhausted': {
      emit(holdersAndWaiters(home, loadPool(home)), { json: true });
      return EXIT.OK;
    }
    default:
      throw usage(`unknown command "${command}". Run with --help.`);
  }
}

// Compare real paths: Node resolves the main module through symlinks (~/.claude/skills links), argv[1] does not.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      const json = Boolean(process.argv.includes('--json')) || !process.stdout.isTTY;
      if (error instanceof CommandError) {
        if (error.payload) process.stdout.write(`${JSON.stringify(json ? error.payload : { ...error.payload, message: error.message }, null, 2)}\n`);
        process.stderr.write(`${error.message}\n`);
        process.exit(error.exitCode);
      }
      if (error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' || error.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
        process.stderr.write(`${error.message}\n`);
        process.exit(EXIT.USAGE);
      }
      process.stderr.write(`${error.message}\n`);
      process.exit(EXIT.ERROR);
    },
  );
}
