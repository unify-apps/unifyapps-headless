#!/usr/bin/env node
// One cheap read through the UnifyApps Headless CLI before a builder attempt is spent: is the folder set up, is the
// sign-in alive, does the tenant (or the local bridge) answer. Reads only; never writes to the tenant.
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isLocalBuild, pluginRoot, readVersion, runUa } from './lib/ua-cli.mjs';

const HELP = `health — classify whether UnifyApps Headless can reach the solution and the tenant right now.

Usage
  node health.mjs check [--app <id>] [--json] [--retries 3] [--backoff 20000,60000] [--dir <folder>] [--root <dir>]

Options
  --app <id>        Also run "cache app <id> --refresh --json": the one tenant read. Without it only the
                    folder and the session are proven; the tenant is not touched.
  --json            Print {status, detail, triedAt[], nextAction, tries[]} as JSON.
  --retries <n>     Tries in all. Default 3. Only tenant_5xx and bridge_down are retried.
  --backoff <ms,ms> Waits between tries. Default 20000,60000. The last value repeats.
  --dir <folder>    The solution folder. Default: the current folder.
  --root <dir>      Another UnifyApps Headless checkout (tests). Default: the plugin this script ships in.
                    $UA_CLI_OVERRIDE replaces the CLI (tests).
  -h, --help        Show this help.

Statuses and next actions
  ok                none
  not_started       run /ua:setup
  auth_expired      sign in again
  tenant_5xx        wait
  bridge_down       start the local tools server (local build), else wait
  ua_missing    reinstall UnifyApps Headless: run the installer again (see the README)
  unknown           the message UnifyApps Headless printed

Exit codes: 0 ok, 1 anything else (the JSON still prints), 2 usage.`;

export const STATUS = Object.freeze({
  OK: 'ok', NOT_STARTED: 'not_started', AUTH_EXPIRED: 'auth_expired', TENANT_5XX: 'tenant_5xx',
  BRIDGE_DOWN: 'bridge_down', UA_MISSING: 'ua_missing', UNKNOWN: 'unknown',
});
const RETRIABLE = new Set([STATUS.TENANT_5XX, STATUS.BRIDGE_DOWN]);
const CODE_STATUS = {
  NOT_STARTED: STATUS.NOT_STARTED, NO_SOLUTION: STATUS.NOT_STARTED, AUTH_EXPIRED: STATUS.AUTH_EXPIRED,
  NO_SESSION: STATUS.AUTH_EXPIRED, PLATFORM_UNREACHABLE: STATUS.BRIDGE_DOWN,
};
const CODE_ACTION = { RESTART_NEEDED: 'type /reload-plugins' };
const BRIDGE_TEXT = /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|network error/iu;
const SERVER_TEXT = /\bHTTP\s*5\d\d\b|\bstatus\s*5\d\d\b|\b5\d\d\b.{0,40}(?:error|tenant|server)|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Time-?out/iu;

/** Status from one CLI result. Pure: tests call it with fixture outputs. */
export function classify(result) {
  if (!result || result.error === 'UA_MISSING') return { status: STATUS.UA_MISSING, detail: 'the UnifyApps Headless CLI is not installed' };
  const payloadError = result.json?.error;
  const text = [payloadError?.message, result.stderr, result.stdout].filter(Boolean).join('\n');
  const code = payloadError?.code ?? null;
  if (code && CODE_STATUS[code]) return { status: CODE_STATUS[code], code, detail: payloadError.message ?? code };
  if (result.status === 0 && !payloadError) return { status: STATUS.OK, detail: result.json?.message ?? 'answered' };
  if (BRIDGE_TEXT.test(text)) return { status: STATUS.BRIDGE_DOWN, code, detail: firstLine(text) };
  if (SERVER_TEXT.test(text)) return { status: STATUS.TENANT_5XX, code, detail: firstLine(text) };
  if (result.error === 'TIMEOUT') return { status: STATUS.BRIDGE_DOWN, code, detail: 'the command gave no answer in time' };
  return { status: STATUS.UNKNOWN, code, detail: firstLine(text) || `exit ${result.status}` };
}

const firstLine = (text) => String(text ?? '').trim().split('\n').find((line) => line.trim()) ?? '';

export function nextActionFor(status, { code, localBuild } = {}) {
  if (code && CODE_ACTION[code]) return CODE_ACTION[code];
  switch (status) {
    case STATUS.OK: return 'none';
    case STATUS.NOT_STARTED: return 'run /ua:setup';
    case STATUS.AUTH_EXPIRED: return 'sign in again';
    case STATUS.TENANT_5XX: return 'wait';
    case STATUS.BRIDGE_DOWN: return localBuild ? 'start the local tools server (local build)' : 'wait';
    case STATUS.UA_MISSING: return 'reinstall UnifyApps Headless: run the installer again (see the README)';
    default: return 'read the message';
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tryOnce(root, { app, cwd }) {
  const context = await runUa(root, ['solution', 'context', '--json'], { cwd });
  const verdict = classify(context);
  if (verdict.status !== STATUS.OK || !app) return { ...verdict, step: 'solution context' };
  const appRead = await runUa(root, ['cache', 'app', app, '--refresh', '--json'], { cwd, timeoutMs: 120000 });
  const appVerdict = classify(appRead);
  const version = appRead.json?.app?.version ?? null;
  return { ...appVerdict, step: 'cache app --refresh', app: { id: app, version, name: appRead.json?.app?.name ?? null } };
}

export async function check({ app = null, cwd = process.cwd(), root: rootArg, retries = 3, backoff = [20000, 60000], now = () => new Date() } = {}) {
  const root = pluginRoot(rootArg ?? null);
  const localBuild = root ? isLocalBuild(root, safeVersion(root)) : false;
  const tries = [], triedAt = [];
  for (let attempt = 0; attempt < Math.max(1, retries); attempt++) {
    triedAt.push(now().toISOString());
    const verdict = (!root && !process.env.UA_CLI_OVERRIDE)
      ? { status: STATUS.UA_MISSING, detail: 'no scripts/ua.mjs in the plugin folder', step: 'plugin root' }
      : await tryOnce(root, { app, cwd });
    tries.push(verdict);
    const last = attempt === Math.max(1, retries) - 1;
    if (!RETRIABLE.has(verdict.status) || last) break;
    await sleep(backoff[Math.min(attempt, backoff.length - 1)] ?? 0);
  }
  const final = tries[tries.length - 1];
  return {
    status: final.status, detail: final.detail, triedAt, nextAction: nextActionFor(final.status, { code: final.code, localBuild }),
    ...(final.app ? { app: final.app } : {}), tries,
  };
}

function safeVersion(root) {
  try { return readVersion(root); } catch { return ''; }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      app: { type: 'string' }, json: { type: 'boolean' }, retries: { type: 'string' }, backoff: { type: 'string' },
      dir: { type: 'string' }, root: { type: 'string' }, help: { type: 'boolean', short: 'h' },
    },
  });
  const [command] = positionals;
  if (values.help || !command) { console.log(HELP); return; }
  if (command !== 'check') { console.error(`Unknown command "${command}". Run with --help.`); process.exit(2); }
  const backoff = values.backoff ? values.backoff.split(',').map(Number) : [20000, 60000];
  if (backoff.some(Number.isNaN)) { console.error('--backoff takes milliseconds, comma separated.'); process.exit(2); }
  const result = await check({
    app: values.app ?? null, cwd: values.dir ? path.resolve(values.dir) : process.cwd(), root: values.root,
    retries: Number(values.retries ?? 3), backoff,
  });
  if (values.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`HEALTH ${result.status}: ${result.detail} → ${result.nextAction}${result.app?.version ? ` (app ${result.app.id} v${result.app.version})` : ''}`);
  process.exitCode = result.status === STATUS.OK ? 0 : 1;
}

// Compare real paths: Node resolves the main module through symlinks (~/.claude/skills links), argv[1] does not.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
