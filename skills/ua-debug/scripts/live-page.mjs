#!/usr/bin/env node
// Reads a no-code WEB page's live state, its Pulse events and the value of a binding, through the
// page's own `window.__uaPulse` reader, in UnifyApps Headless's browser (app-verify's browser.mjs,
// after `open-page`). Every input travels as JSON data inside the eval source, never as shell text,
// so a binding's quotes and a condition object need no escaping. Node 22, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { extractJson, run } from '../../web-loops/web-browser/scripts/lib/driver.mjs';

const HELP = `Usage: node live-page.mjs <browser folder> <command> [flags]

start [--keep-on-reload]      turn full capture on; prints { capturing, lastSeq, keepOnReload }
                              --keep-on-reload: capture again from the first write after a reload, in this tab
stop                          turn capture off and forget --keep-on-reload
events [--since N] [--kinds a,b] [--out file]
                              events with id > N; kinds: event action componentMethod stateChange dataSource error log
repeats [--since N] [--idle-ms MS] [--min N]
                              what changed again and again; --idle-ms starts capture, waits MS with no input, then counts
state [--scope S] [--keys a,b] [--out file]
                              no --scope: the scopes; with it, that scope's live store
evaluate --input <file.json>  { expression | condition | functionBody, blockId?, overrides?, allowWrites? } (builder link only)

Exit codes: 0 answered · 1 the browser command failed · 2 usage · 3 the page has no reader
(not a builder or preview link, or the tenant runs an older build) · 4 the page did not answer in
time (its main thread is busy: a hang) · 7 the tenant would not say its environment (browser.mjs's own exit).`;

const READ_TIMEOUT_MS = 20000;
const REPEAT_MIN = 10;

class Exit extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** The eval source: calls one reader method with `input` as JSON data. */
export function readerSource(method, input) {
  return `async () => { const reader = window.__uaPulse; if (!reader) return { noReader: true }; if (typeof reader[${JSON.stringify(method)}] !== 'function') return { noMethod: ${JSON.stringify(method)} }; return await reader[${JSON.stringify(method)}](${JSON.stringify(input ?? {})}); }`;
}

/**
 * Groups events by what they touched and keeps the ones seen at least `min` times: a page that
 * nobody touches records nothing, so a group that keeps growing while idle is a loop.
 */
export function countRepeats(events, min = REPEAT_MIN) {
  const groups = new Map();
  for (const event of events) {
    const what = event.kind === 'dataSource' ? `${event.dsId}:${event.phase}` : event.kind === 'action' ? event.actionType : event.entity?.id ?? '';
    const key = `${event.kind}|${event.entity?.type ?? ''}|${what}|${event.scope}`;
    const group = groups.get(key) ?? { kind: event.kind, entity: event.entity ?? null, what, scope: event.scope, count: 0, firstAt: event.timestamp, lastAt: event.timestamp };
    group.count += 1;
    group.lastAt = event.timestamp;
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.count >= min)
    .map((group) => ({ ...group, perSecond: Number((group.count / Math.max((group.lastAt - group.firstAt) / 1000, 1)).toFixed(1)) }))
    .sort((left, right) => right.count - left.count);
}

function call(folder, method, input, env) {
  const result = run(folder, ['eval', readerSource(method, input), '--raw'], { timeoutMs: READ_TIMEOUT_MS, env });
  if (result.status !== 0) {
    const timedOut = /ETIMEDOUT|timed out/iu.test(`${result.error ?? ''} ${result.message}`);
    if (timedOut) throw new Exit(`the page did not answer in ${READ_TIMEOUT_MS / 1000} s, so its main thread is busy: the page hangs. Read the config for a loop (live-page.md, A page that hangs).`, 4);
    throw new Exit(`eval: ${result.message}`, result.status === 7 ? 7 : 1);
  }
  const value = extractJson(result.stdout);
  if (value?.noReader) throw new Exit('this page has no window.__uaPulse reader: open the builder or preview link of a WEB app with open-page. A tenant on an older build has none; read the config instead.', 3);
  if (value?.noMethod) throw new Exit(`the reader on this page has no ${value.noMethod}(): evaluate works on the builder link only (…/builder/…), not the preview link.`, 3);
  return value;
}

const list = (text) => (text ? text.split(',').map((item) => item.trim()).filter(Boolean) : undefined);
const sleep = (ms) => new Promise((done) => { setTimeout(done, ms); });

function print(value, out) {
  if (!out) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(value, null, 2)}\n`);
  const summary = Array.isArray(value.events) ? { out, events: value.events.length, lastSeq: value.lastSeq, evicted: value.evicted, missed: value.missed, capturing: value.capturing } : { out };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const [folder, command, ...rest] = argv;
  if (!folder || !command || folder === '--help' || command === '--help') throw new Exit(HELP, 2);
  const { values } = parseArgs({
    args: rest,
    options: {
      since: { type: 'string' }, kinds: { type: 'string' }, out: { type: 'string' }, scope: { type: 'string' },
      keys: { type: 'string' }, input: { type: 'string' }, 'idle-ms': { type: 'string' }, min: { type: 'string' },
      'keep-on-reload': { type: 'boolean' },
    },
  });
  const since = values.since === undefined ? undefined : Number(values.since);
  if (command === 'start') return print(call(folder, 'start', { keepOnReload: values['keep-on-reload'] === true }, env));
  if (command === 'stop') return print(call(folder, 'stop', {}, env));
  if (command === 'events') return print(call(folder, 'events', { since, kinds: list(values.kinds) }, env), values.out);
  if (command === 'state') return print(call(folder, 'state', { scope: values.scope, keys: list(values.keys) }, env), values.out);
  if (command === 'repeats') {
    let from = since;
    let startedHere = false;
    const idleMs = values['idle-ms'] === undefined ? undefined : Number(values['idle-ms']);
    if (idleMs !== undefined) {
      startedHere = !call(folder, 'events', { since: Number.MAX_SAFE_INTEGER }, env).capturing;
      from = call(folder, 'start', {}, env).lastSeq;
      await sleep(idleMs);
    }
    const read = call(folder, 'events', { since: from }, env);
    if (startedHere) call(folder, 'stop', {}, env);
    const spanMs = read.events.length ? read.events.at(-1).timestamp - read.events[0].timestamp : 0;
    return print({ since: from ?? 0, idleMs, total: read.events.length, spanMs, evicted: read.evicted, missed: read.missed, repeats: countRepeats(read.events, values.min ? Number(values.min) : REPEAT_MIN) });
  }
  if (command === 'evaluate') {
    if (!values.input) throw new Exit('usage: evaluate --input <file.json>', 2);
    let input;
    try { input = JSON.parse(fs.readFileSync(values.input, 'utf8')); } catch (error) { throw new Exit(`--input: ${error.message}`, 2); }
    return print(call(folder, 'evaluate', input, env));
  }
  throw new Exit(`unknown command ${command}\n\n${HELP}`, 2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    if (Number.isInteger(error.code)) process.exit(error.code);
    process.exit(String(error.code).startsWith('ERR_PARSE_ARGS') ? 2 : 1);
  });
}
