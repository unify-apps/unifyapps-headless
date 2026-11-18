// reserve / renew / release / reap / who: one simulator per session, held as
// one reservation file whose name is the device udid.
import path from 'node:path';
import { appendLog, createExclusive, listRecords, makeRecord, reap, readJson, renewRecord, replaceJson, statePaths } from '../lib/state.mjs';
import {
  allReservations, dropReservation, dropTickets, findDevice, liveReservations, liveTickets, loadPool, loadSession,
  reservationFile, sessionFile, updatePool, upsertSession,
} from './context.mjs';
import * as simctl from '../lib/simctl.mjs';
import { slimEnabled } from '../lib/slim.mjs';
import { bringUpToDate } from '../lib/upgrade.mjs';
import { busy, refused, usage } from './output.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One profile: the Preview app with its JavaScript bundle inside. A build without one
// (debug-metro) shows only its launcher, so the pool refuses to hand it out.
export function profileFor(values, pool) {
  const profile = values.profile ?? 'release';
  if (profile !== 'release') throw usage(`--profile must be release, not "${profile}"`);
  if (pool.app?.kind === 'debug-metro') {
    throw usage('the pool has a development build with no JavaScript bundle inside. Install the Preview app with: device-pool pool install --preview-app <path|url>');
  }
  return profile;
}

function orderedCandidates(pool, prefer, lastUdid) {
  const rank = (device) => {
    if (device.udid === prefer) return 0;
    if (device.udid === lastUdid) return 1;
    return 2;
  };
  return [...pool.devices].sort((left, right) => {
    const byRank = rank(left) - rank(right);
    if (byRank) return byRank;
    const byApp = Number(right.appInstalled !== false) - Number(left.appInstalled !== false);
    if (byApp) return byApp;
    return String(left.state?.lastReleasedAt ?? '').localeCompare(String(right.state?.lastReleasedAt ?? ''));
  });
}

async function describeReservation(reservation, pool) {
  const device = findDevice(pool, reservation.udid);
  return {
    deviceId: reservation.deviceId,
    udid: reservation.udid,
    name: reservation.name,
    index: reservation.index,
    bundleId: reservation.bundleId,
    scheme: reservation.scheme,
    profile: reservation.profile,
    provider: reservation.provider,
    task: reservation.task,
    acquiredAt: reservation.acquiredAt,
    expiresAt: reservation.expiresAt,
    renewals: reservation.renewals,
    appInstalled: device?.appInstalled ?? null,
    currentApp: device?.state?.currentApp ?? null,
    deepLinkPromptSeen: device?.state?.deepLinkPromptSeen ?? false,
  };
}

// The simulator is this session's now, so one an earlier version left stock or named loops-<n> is
// brought up to date here: renamed and slimmed, a booted one by one restart of about 10 s. It
// happens once per simulator, and a failure never costs the reservation.
async function bringReservedUpToDate(home, config, reservation, pool) {
  const device = findDevice(pool, reservation.udid);
  if (!device) return { reservation, upgraded: null };
  try {
    const sim = simctl.listDevices().find((row) => row.udid === reservation.udid);
    const update = bringUpToDate(device, { slim: slimEnabled(config), sim });
    if (!update.changed) return { reservation, upgraded: null };
    await updatePool(home, (current) => {
      const held = findDevice(current, reservation.udid);
      if (!held) return;
      held.name = update.name;
      if (update.restarted) {
        held.lastBootAt = new Date().toISOString();
        held.slim = update.slim;
      }
    });
    const renamed = update.name !== reservation.name ? { ...reservation, name: update.name } : reservation;
    if (renamed !== reservation) replaceJson(reservationFile(home, reservation.udid), renamed);
    return { reservation: renamed, upgraded: { restarted: update.restarted, name: update.name, slim: update.slim?.state ?? null } };
  } catch (error) {
    return { reservation, upgraded: { error: String(error.message).slice(0, 300) } };
  }
}

export function holdersAndWaiters(home, pool) {
  const reservations = liveReservations(home);
  return {
    holders: reservations.map((held) => ({ udid: held.udid, name: held.name, sessionId: held.sessionId, task: held.task, profile: held.profile, acquiredAt: held.acquiredAt, expiresAt: held.expiresAt })),
    waiters: liveTickets(home).map(({ record }) => ({ sessionId: record.sessionId, task: record.task, since: record.acquiredAt })),
    free: pool.devices.filter((device) => !reservations.some((held) => held.udid === device.udid)).map((device) => device.udid),
  };
}

export async function reserve({ home, config, sessionId, values }) {
  reap(home);
  const pool = loadPool(home);
  if (!pool.devices?.length) throw usage('the pool has no devices; run device-pool pool init');
  const profile = profileFor(values, pool);
  const ttlSec = Number(values.ttl ?? config.reservation.ttlSec);
  const waitSec = Number(values.wait ?? config.reservation.waitSec ?? 0);
  const task = values.task ?? null;
  const session = upsertSession(home, sessionId, {});
  const cwd = process.cwd();

  const mine = liveReservations(home).find((held) => held.sessionId === sessionId);
  if (mine) {
    const renewed = renewRecord({ ...mine, task: task ?? mine.task }, { ttlSec });
    replaceJson(reservationFile(home, mine.udid), renewed);
    dropTickets(home, sessionId);
    return { ...(await describeReservation(renewed, pool)), outcome: 'renewed' };
  }

  const tryReserve = () => {
    const now = Date.now();
    for (const device of orderedCandidates(pool, values.prefer, session.lastUdid)) {
      const reservation = makeRecord({
        kind: 'reservation', id: device.udid, sessionId, cwd, ownerPid: session.ownerPid, task, ttlSec,
        deviceId: device.udid, udid: device.udid, name: device.name, index: device.index, profile, provider: 'local-simctl',
        bundleId: pool.app?.bundleId ?? config.previewApp.bundleId, scheme: pool.app?.scheme ?? config.previewApp.scheme,
      }, now);
      if (createExclusive(reservationFile(home, device.udid), reservation)) return reservation;
    }
    return null;
  };

  let reservation = tryReserve();
  let waited = 0;
  if (!reservation && waitSec > 0) {
    const started = Date.now();
    reservation = await waitForReservation({ home, config, sessionId, session, pool, values, task, waitSec, tryReserve });
    // Round up: a session that queued and was served within half a second still waited.
    waited = Math.ceil((Date.now() - started) / 1000);
  }
  if (!reservation) {
    const detail = holdersAndWaiters(home, pool);
    throw busy(`all ${pool.devices.length} pool simulators are reserved${waitSec ? ` (waited ${waited}s)` : ''}`, { error: 'POOL_EXHAUSTED', waited, ...detail });
  }
  const brought = await bringReservedUpToDate(home, config, reservation, pool);
  reservation = brought.reservation;
  replaceJson(sessionFile(home, sessionId), { ...(loadSession(home, sessionId) ?? session), lastUdid: reservation.udid });
  appendLog(home, 'reservation.log', [`reserve ${reservation.udid} ${reservation.name} session=${sessionId} profile=${profile} task=${JSON.stringify(task ?? '')} waited=${waited}s${brought.upgraded ? ` upgraded=${JSON.stringify(brought.upgraded)}` : ''}`]);
  return { ...(await describeReservation(reservation, pool)), outcome: 'reserved', waited, ...(brought.upgraded ? { upgraded: brought.upgraded } : {}) };
}

// A ticket keeps the session's place across retries: the loops call reserve
// with --wait 90 up to six times, and a ticket that outlives one call is found
// again by the next. A ticket at rank r may reserve once r+1 devices are free,
// so an older waiter is never passed by a younger one.
async function waitForReservation({ home, config, sessionId, session, pool, values, task, waitSec, tryReserve }) {
  const queueDir = statePaths(home).queue;
  const ticketTtl = waitSec + 120;
  const ensureTicket = () => {
    const existing = liveTickets(home).find(({ record }) => record.sessionId === sessionId);
    if (existing) {
      replaceJson(existing.file, renewRecord(existing.record, { ttlSec: ticketTtl }));
      return existing.file;
    }
    const stamp = Date.now();
    const file = path.join(queueDir, `${stamp}-${sessionId}.json`);
    createExclusive(file, makeRecord({
      kind: 'ticket', id: `${stamp}-${sessionId}`, sessionId, cwd: process.cwd(), ownerPid: session.ownerPid, task, ttlSec: ticketTtl,
      prefer: values.prefer ?? null, profile: values.profile ?? null,
    }, stamp));
    return file;
  };
  const deadline = Date.now() + waitSec * 1000;
  const pollMs = Math.max(50, Number(config.reservation.pollSec) * 1000);
  for (;;) {
    reap(home);
    const ticketFile = ensureTicket();
    const rank = liveTickets(home).findIndex(({ file }) => file === ticketFile);
    const free = pool.devices.length - liveReservations(home).filter((held) => findDevice(pool, held.udid)).length;
    if (rank >= 0 && free > rank) {
      const reservation = tryReserve();
      if (reservation) {
        dropTickets(home, sessionId);
        return reservation;
      }
    }
    if (Date.now() >= deadline) return null;
    await sleep(Math.min(pollMs * (0.7 + 0.6 * Math.random()), Math.max(50, deadline - Date.now())));
  }
}

export function renew({ home, config, sessionId, values }) {
  const mine = liveReservations(home).filter((held) => held.sessionId === sessionId && (!values.udid || held.udid === values.udid));
  if (!mine.length) throw refused(values.udid ? `this session holds no reservation on ${values.udid}` : 'this session holds no reservation; run device-pool reserve');
  const ttlSec = Number(values.ttl ?? config.reservation.ttlSec);
  const maxHoldMs = Number(config.reservation.maxHoldSec) * 1000;
  const renewed = [];
  for (const reservation of mine) {
    const held = Date.now() - Date.parse(reservation.acquiredAt);
    if (held > maxHoldMs) {
      throw refused(`the reservation on ${reservation.name} has been held ${(held / 3600000).toFixed(1)} h, past reservation.maxHoldSec (${config.reservation.maxHoldSec}s). Release it and reserve again.`, { udid: reservation.udid, heldSec: Math.round(held / 1000) });
    }
    const next = renewRecord(reservation, { ttlSec });
    replaceJson(reservationFile(home, reservation.udid), next);
    renewed.push({ udid: next.udid, name: next.name, expiresAt: next.expiresAt, renewals: next.renewals });
  }
  return { renewed };
}

export async function release({ home, sessionId, values }) {
  const reservations = allReservations(home);
  let targets;
  if (values.all) {
    if (!values.force) throw usage('release --all needs --force: it evicts every session on this machine');
    targets = reservations;
  } else if (values.udid) {
    targets = reservations.filter(({ file }) => path.basename(file, '.json') === values.udid);
  } else {
    targets = reservations.filter(({ record }) => record?.sessionId === sessionId);
  }
  const released = [];
  const evicted = [];
  for (const { file, record, stale } of targets) {
    const foreign = !stale && record.sessionId !== sessionId;
    if (foreign && !values.force) {
      throw refused(`${record.name} (${record.udid}) is reserved by session ${record.sessionId}${record.task ? ` for "${record.task}"` : ''}; --force evicts them`, { holder: record });
    }
    const udid = record?.udid ?? path.basename(file, '.json');
    await dropReservation(home, { ...(record ?? {}), udid }, { by: sessionId, reason: foreign ? 'evicted' : stale ? `stale:${stale}` : 'released' });
    (foreign ? evicted : released).push({ udid, name: record?.name ?? null, sessionId: record?.sessionId ?? null, task: record?.task ?? null });
  }
  dropTickets(home, sessionId);
  return { released, evicted, note: targets.length ? undefined : 'nothing to release' };
}

export function who({ home, udid }) {
  const record = readJson(reservationFile(home, udid));
  if (!record) return { udid, free: true };
  const { stale } = allReservations(home).find(({ file }) => path.basename(file, '.json') === udid) ?? { stale: 'corrupt' };
  return { udid, free: Boolean(stale), stale, reservation: record };
}

export function reapCommand({ home }) {
  const reaped = reap(home);
  return { reaped: reaped.map((item) => ({ kind: item.kind, file: path.relative(home, item.file), reason: item.reason, sessionId: item.sessionId })) };
}

export function queueEntries(home) {
  return listRecords(statePaths(home).queue).map(({ file, record }) => ({ file, record }));
}
