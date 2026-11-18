// The device queue. A run that reaches a device phase while every simulator is reserved
// leaves one request here and carries on with the work that needs no device. Whoever gets a
// simulator next serves it: the run itself when its background wait returns, or a test runner
// session draining the queue. A request is work, not a reservation: it has no owner pid and
// survives the session that wrote it; only its take is bound to a session.
import fs from 'node:fs';
import path from 'node:path';
import { createExclusive, isPidAlive, listRecords, makeRecord, readJson, replaceJson, statePaths, withLock } from '../lib/state.mjs';
import { isSafeId, upsertSession } from './context.mjs';
import { CommandError, EXIT, busy, refused, usage } from './output.mjs';

// The device-queue kinds of the loop orchestrator's test-and-fix stage, drained by one test runner
// per device (a simulator on MOBILE, a browser folder on WEB). visual-check: measure against the
// run's design spec. retest: re-measure the issues of an issue log after a fix attempt. replay: run
// the recorded steps of the reproduced issues in an issue log again (an argent flow on MOBILE, the
// steps file in a browser on WEB), check the expected result and, for saved data, the record
// read-only. touch-feedback (MOBILE): a press-and-hold shot per tappable. interaction (WEB): the
// hover, focus and keyboard check. performance: a light profile step (the audit's performance
// check). a11y and responsive: the WEB checks of web-browser (names, labels, contrast, headings,
// ARIA; overflow, cut text, overlap and the navigation per width). acceptance: do the steps of one
// acceptance line of a feature, then check the screen and, read-only, the records and automation runs
// its Effects: block names. realtime: two devices, device 1 does the steps and device 2 must show each
// Watch: line in time. capture: screenshots only, to show the person what changed (--side before: the
// states of the issues in --issues, before a fix job writes; --side after: the page as built).
// loading: record the page opening fresh and find bands left blank and content that moves when the
// data arrives. data-layer: reserved.
export const QUEUE_KINDS = ['visual-check', 'retest', 'replay', 'touch-feedback', 'interaction', 'performance', 'acceptance', 'realtime', 'capture', 'loading', 'a11y', 'responsive', 'data-layer'];
// The kinds a test runner serves from an issue log, which the request must name (--issues).
const ISSUE_KINDS = ['retest', 'replay'];
// The kinds a test runner serves from a steps file inside the run folder (--steps).
const STEPS_KINDS = ['acceptance', 'realtime'];
// A capture says which side of the change it shoots; a before capture names the issues whose states it shoots.
const CAPTURE_SIDES = ['before', 'after'];
export const QUEUE_STATUSES = ['queued', 'running', 'done', 'failed'];
// Whose device serves a request. A mobile test runner never takes a web request and a web one never
// a mobile one. A request added without --platform carries no platform field, as it always did, and
// reads as mobile.
export const QUEUE_PLATFORMS = ['mobile', 'web'];
export const platformOf = (record) => (record?.platform === 'web' ? 'web' : 'mobile');
// The one check that differs by platform: touch feedback on a phone, the interaction check in a browser.
const PLATFORM_KIND = { mobile: { interaction: 'touch-feedback' }, web: { 'touch-feedback': 'interaction' } };
// The checks that only a browser can make.
const WEB_ONLY_KINDS = ['a11y', 'responsive'];
// The checks only a phone makes: WEB has no loading check, so no browser test runner can serve one.
const MOBILE_ONLY_KINDS = ['loading'];
const noWebCheck = (kind) => usage(`WEB has no ${kind} check: a ${kind} request is MOBILE only`);
/** --platform as the queue takes it ('mobile' or 'web'), or null when not given. */
function platformFlag(value) {
  if (value == null) return null;
  const platform = String(value).trim().toLowerCase();
  if (!QUEUE_PLATFORMS.includes(platform)) throw usage(`--platform must be one of ${QUEUE_PLATFORMS.join(', ')}`);
  return platform;
}
const TAKE_TTL_SEC = 3600;

// Queue files written before the loops renamed their words read the same: the old kinds, the
// claimed status and its claimedBy field map to the new ones.
const OLD_KINDS = { recheck: 'retest', 'pixel-pass': 'visual-check', 'perf-probe': 'performance' };
export function normalizeRequest(record) {
  if (!record || typeof record !== 'object' || record.corrupt) return record;
  let next = record;
  const kind = record.verifyKind === 'press' ? (platformOf(record) === 'web' ? 'interaction' : 'touch-feedback') : OLD_KINDS[record.verifyKind];
  if (kind) next = { ...next, verifyKind: kind };
  if (next.status === 'claimed') next = { ...next, status: 'running' };
  if ('claimedBy' in next) {
    const { claimedBy, ...rest } = next;
    next = { ...rest, takenBy: rest.takenBy ?? claimedBy ?? null };
  }
  return next;
}

/** An old kind name as a filter (--kind recheck) means the new one. */
function kindFlag(value, platform = null) {
  if (value == null) return null;
  const kind = value === 'press' ? (platform === 'web' ? 'interaction' : 'touch-feedback') : OLD_KINDS[value] ?? value;
  if (!QUEUE_KINDS.includes(kind)) throw usage(`--kind must be one of ${QUEUE_KINDS.join(', ')}`);
  return kind;
}

const queueDir = (home) => statePaths(home).verifyQueue;
const fileFor = (home, id) => path.join(queueDir(home), `${id}.json`);
const iso = (now) => new Date(now).toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A take is dead when its TTL passed or the taking Claude process is gone.
function takeIsStale(record, now) {
  const taken = record.takenBy;
  if (!taken) return false;
  if (taken.expiresAt && Date.parse(taken.expiresAt) < now) return true;
  if (taken.ownerPid != null && !isPidAlive(taken.ownerPid)) return true;
  return false;
}

function withEvent(record, event, now) {
  return { ...record, history: [...(record.history ?? []), { at: iso(now), ...event }] };
}

function requests(home) {
  return listRecords(queueDir(home))
    .filter(({ record }) => record && !record.corrupt && record.kind === 'verify')
    .map(({ file, record }) => ({ file, record: normalizeRequest(record) }));
}

// A request taken by a session that died goes back to the queue, so a test runner killed
// mid-check never strands it. Every command that reads the queue runs this first.
export function reconcile(home, now = Date.now()) {
  const requeued = [];
  for (const { file, record } of requests(home)) {
    if (record.status !== 'running' || !takeIsStale(record, now)) continue;
    replaceJson(file, withEvent({ ...record, status: 'queued', takenBy: null }, { event: 'requeued', reason: 'take stale', taken: record.takenBy }, now));
    requeued.push(record.id);
  }
  return requeued;
}

export function listRequests(home, { status = null, mine = null, run = null, kind = null, platform = null } = {}) {
  const wanted = platformFlag(platform);
  const wantedKind = kindFlag(kind, wanted);
  const wantedStatus = status === 'claimed' ? 'running' : status;
  reconcile(home);
  const runDir = run ? path.resolve(run) : null;
  const all = requests(home).map(({ record }) => record);
  const queued = all.filter((record) => record.status === 'queued');
  return all
    .map((record) => ({ ...record, position: record.status === 'queued' ? queued.findIndex((item) => item.id === record.id) + 1 : null }))
    .filter((record) => (!wantedStatus || record.status === wantedStatus) && (!mine || record.sessionId === mine) && (!runDir || record.runDir === runDir) && (!wantedKind || record.verifyKind === wantedKind)
      && (!wanted || platformOf(record) === wanted));
}

function loadRequest(home, id) {
  if (!isSafeId(id)) throw usage('queue needs a request id (as `queue list` prints it)');
  const record = readJson(fileFor(home, id));
  if (!record || record.corrupt) throw usage(`no queue request ${id}`);
  return normalizeRequest(record);
}

function assertTaker(record, sessionId, force, verb) {
  if (record.status !== 'running') throw refused(`queue request ${record.id} is ${record.status}, not running`, { error: 'NOT_TAKEN', status: record.status });
  if (record.takenBy?.sessionId !== sessionId && !force) {
    throw refused(`queue request ${record.id} is taken by session ${record.takenBy?.sessionId}; pass --force to ${verb} it anyway`, { error: 'NOT_OWNER' });
  }
}

export function addRequest({ home, sessionId, values }) {
  const platform = platformFlag(values.platform);
  const kind = values.kind ?? 'visual-check';
  if (!QUEUE_KINDS.includes(kind)) throw usage(`--kind must be one of ${QUEUE_KINDS.join(', ')}`);
  const wrongKind = PLATFORM_KIND[platform ?? 'mobile'][kind];
  if (wrongKind) throw usage(`on ${platform === 'web' ? 'WEB' : 'MOBILE'} that check is --kind ${wrongKind}, not ${kind}`);
  if (WEB_ONLY_KINDS.includes(kind) && platform !== 'web') throw usage(`${kind} is a web check: add --platform web`);
  if (MOBILE_ONLY_KINDS.includes(kind) && platform === 'web') throw noWebCheck(kind);
  if (!values.run) throw usage('queue add needs --run <run folder>');
  const runDir = path.resolve(values.run);
  if (!fs.existsSync(runDir)) throw usage(`${runDir} does not exist`);
  if (!values.page) throw usage('queue add needs --page <page id>');
  const pass = values.pass == null ? null : Number(values.pass);
  if (pass != null && (!Number.isInteger(pass) || pass < 1)) throw usage('--pass must be a whole number from 1');
  const version = values.version ?? 'draft';
  if (!['draft', 'published'].includes(version)) throw usage('--version must be draft or published');
  const issues = values.issues ? path.resolve(values.issues) : null;
  if (ISSUE_KINDS.includes(kind) && !issues) throw usage(kind === 'replay'
    ? 'a replay request needs --issues <issue log whose issues carry their recorded steps>'
    : 'a retest request needs --issues <issue log the test runner re-measures>');
  if (issues && !fs.existsSync(issues)) throw usage(`${issues} does not exist`);
  const side = captureSide(kind, values.side, issues);
  const steps = stepsFile(kind, values.steps, runDir);
  upsertSession(home, sessionId, {});
  const now = Date.now();
  const id = `${iso(now).replace(/[-:.TZ]/g, '').slice(0, 17)}-${sessionId.slice(0, 8)}`;
  const record = makeRecord({
    kind: 'verify', id, sessionId, cwd: process.cwd(), ownerPid: null, ttlSec: null,
    task: values.task ?? `${kind} ${values['page-name'] ?? values.page}${pass ? ` pass ${pass}` : ''}`,
    status: 'queued', verifyKind: kind, ...(platform ? { platform } : {}), runDir, runId: path.basename(runDir),
    page: { id: values.page, name: values['page-name'] ?? null },
    pass,
    regions: values.regions ? values.regions.split(',').map((item) => item.trim()).filter(Boolean) : [],
    expect: { version },
    app: { id: values.app ?? null, endpoint: values.endpoint ?? null, bundleId: values['bundle-id'] ?? null },
    testUser: values['test-user'] ?? null,
    signInFlow: values['sign-in-flow'] ?? null,
    plan: values.plan ?? null,
    solutionDir: values['solution-dir'] ? path.resolve(values['solution-dir']) : null,
    issues,
    steps,
    side,
    note: values.note ?? null,
    attempts: 0, takenBy: null, result: null, failure: null,
    history: [{ at: iso(now), event: 'queued' }],
  }, now);
  if (!createExclusive(fileFor(home, id), record)) throw new Error(`queue request ${id} already exists; try again`);
  const position = listRequests(home, { status: 'queued' }).findIndex((item) => item.id === id) + 1;
  return { ...record, position };
}

function captureSide(kind, value, issues) {
  if (kind !== 'capture') {
    if (value != null) throw usage(`--side is for a capture request; a ${kind} request takes no side`);
    return null;
  }
  if (!CAPTURE_SIDES.includes(value)) throw usage(`a capture request needs --side ${CAPTURE_SIDES.join('|')}`);
  if (value === 'before' && !issues) throw usage('a before capture needs --issues <issue log whose states it shoots>');
  return value;
}

// An acceptance or realtime request names its steps file, which must sit inside the run folder (a
// test runner reads only the run folder); a realtime one needs a Watch: block with a device 2 line.
// No other kind takes a steps file. The loops CLI checks each Effects: and Watch: line's shape.
function stepsFile(kind, value, runDir) {
  if (!STEPS_KINDS.includes(kind)) {
    if (value != null) throw usage(`--steps is for the ${STEPS_KINDS.join(' and ')} checks; a ${kind} request takes no steps file`);
    return null;
  }
  if (!value) throw usage(`a${kind === 'acceptance' ? 'n' : ''} ${kind} request needs --steps <steps file in the run folder>`);
  const file = path.resolve(value);
  if (!fs.existsSync(file)) throw usage(`${file} does not exist`);
  const real = fs.realpathSync(file);
  const inside = path.relative(fs.realpathSync(runDir), real);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw usage(`${file} is not inside the run folder ${runDir}`);
  if (kind === 'realtime') {
    const lines = fs.readFileSync(real, 'utf8').split(/\r?\n/u).map((line) => line.trim());
    const start = lines.indexOf('Watch:');
    if (start < 0 || !lines.slice(start + 1).some((line) => /^- device 2 shows \S/u.test(line))) {
      throw usage(`${file} has no Watch: block with a "- device 2 shows <expected> within <n> s" line`);
    }
  }
  return real;
}

export async function takeRequest({ home, sessionId, values, id = null }) {
  return withLock(home, 'verify-queue', async () => {
    // --platform: the taker's device. A simulator test runner (the default) and a browser one each
    // take only their own platform's requests, by age or by id.
    const named = platformFlag(values.platform);
    const platform = named ?? 'mobile';
    const kind = kindFlag(values.kind, platform);
    if (platform === 'web' && MOBILE_ONLY_KINDS.includes(kind)) throw noWebCheck(kind);
    const queued = listRequests(home, { status: 'queued' });
    // --kind: a test runner takes only the work it knows how to do, so a request of another kind
    // at the head of the queue never blocks it (nor is taken and handed back in a loop).
    const target = id ? queued.find((item) => item.id === id)
      : queued.find((item) => platformOf(item) === platform && (!kind || item.verifyKind === kind));
    if (id && !target) {
      const existing = loadRequest(home, id);
      throw busy(`queue request ${id} is ${existing.status}${existing.takenBy ? ` by session ${existing.takenBy.sessionId}` : ''}`, { error: 'NOT_QUEUED', status: existing.status });
    }
    if (id && platformOf(target) !== platform) {
      throw refused(`queue request ${id} is a ${platformOf(target)} request; a ${platform} test runner never takes it (take it with --platform ${platformOf(target)})`, { error: 'WRONG_PLATFORM', platform: platformOf(target) });
    }
    if (!target) throw busy(`no queued ${named ? `${named} ` : ''}request${kind ? ` of kind ${kind}` : ''}`, { error: 'QUEUE_EMPTY' });
    const session = upsertSession(home, sessionId, {});
    const now = Date.now();
    const takenBy = { sessionId, ownerPid: session.ownerPid ?? null, udid: values.udid ?? null, at: iso(now), expiresAt: iso(now + TAKE_TTL_SEC * 1000) };
    const { position, ...record } = target;
    const updated = withEvent({ ...record, status: 'running', takenBy, attempts: (record.attempts ?? 0) + 1 }, { event: 'taken', sessionId, udid: takenBy.udid }, now);
    replaceJson(fileFor(home, record.id), updated);
    return updated;
  }, { ttlSec: 10, waitMs: 3000, sessionId, task: 'queue take' });
}

export function doneRequest({ home, sessionId, id, values }) {
  const record = loadRequest(home, id);
  assertTaker(record, sessionId, values.force, 'finish');
  if (!values.result) throw usage('queue done needs --result <folder holding the measurement>');
  const resultDir = path.resolve(values.result);
  if (!fs.existsSync(resultDir)) throw usage(`${resultDir} does not exist`);
  const now = Date.now();
  const counts = {};
  for (const key of ['gaps', 'off', 'missing']) if (values[key] != null) counts[key] = Number(values[key]);
  const result = { dir: resultDir, summary: values.summary ?? null, shown: values.shown ?? null, ...counts, by: sessionId, at: iso(now) };
  const updated = withEvent({ ...record, status: 'done', result, doneAt: iso(now), takenBy: null }, { event: 'done', sessionId }, now);
  replaceJson(fileFor(home, id), updated);
  return updated;
}

export function failRequest({ home, sessionId, id, values }) {
  const record = loadRequest(home, id);
  assertTaker(record, sessionId, values.force, 'fail');
  if (!values.reason) throw usage('queue fail needs --reason "<what stopped it>"');
  const now = Date.now();
  const updated = withEvent({ ...record, status: 'failed', failure: { reason: values.reason, by: sessionId, at: iso(now) }, takenBy: null }, { event: 'failed', sessionId, reason: values.reason }, now);
  replaceJson(fileFor(home, id), updated);
  return updated;
}

export function requeueRequest({ home, sessionId, id, values }) {
  const record = loadRequest(home, id);
  if (record.status === 'queued') return record;
  if (record.status === 'running') assertTaker(record, sessionId, values.force, 'requeue');
  const now = Date.now();
  const updated = withEvent({ ...record, status: 'queued', takenBy: null, failure: null }, { event: 'requeued', sessionId }, now);
  replaceJson(fileFor(home, id), updated);
  return updated;
}

export function cancelRequest({ home, sessionId, id, values }) {
  const record = loadRequest(home, id);
  const foreignOwner = record.sessionId !== sessionId;
  const foreignTaker = record.status === 'running' && record.takenBy?.sessionId !== sessionId;
  if ((foreignOwner || foreignTaker) && !values.force) {
    throw refused(`queue request ${id} belongs to session ${record.sessionId}${foreignTaker ? ` and is being served by session ${record.takenBy.sessionId}` : ''}; pass --force to cancel it anyway`, { error: 'NOT_OWNER' });
  }
  fs.unlinkSync(fileFor(home, id));
  return { cancelled: id, status: record.status };
}

// Blocks until the request is done, failed or the wait runs out. A run starts this in the
// background so the session is woken when a test runner has measured for it.
export async function awaitRequest({ home, config, id, values }) {
  const waitSec = Number(values.wait ?? 3600);
  const pollMs = Math.max(50, Number(values.poll ?? config.reservation.pollSec) * 1000);
  const deadline = Date.now() + waitSec * 1000;
  for (;;) {
    reconcile(home);
    const record = loadRequest(home, id);
    if (record.status === 'done') return record;
    if (record.status === 'failed') throw new CommandError(EXIT.ERROR, `queue request ${id} failed: ${record.failure?.reason ?? '?'}`, record);
    if (Date.now() >= deadline) {
      const position = listRequests(home, { status: 'queued' }).findIndex((item) => item.id === id) + 1;
      throw busy(`queue request ${id} is still ${record.status} after ${waitSec}s`, { error: 'STILL_PENDING', status: record.status, position: position || null });
    }
    await sleep(pollMs);
  }
}

// Called from the session-end hook: a session that ends mid-request hands it back.
export function releaseTakenRequests(home, sessionId, reason) {
  const released = [];
  const now = Date.now();
  for (const { file, record } of requests(home)) {
    if (record.status !== 'running' || record.takenBy?.sessionId !== sessionId) continue;
    replaceJson(file, withEvent({ ...record, status: 'queued', takenBy: null }, { event: 'requeued', reason }, now));
    released.push(record.id);
  }
  return released;
}
