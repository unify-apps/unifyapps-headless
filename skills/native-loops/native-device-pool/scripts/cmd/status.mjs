// `status` and `config`.
import { getPath, listRecords, parseValue, readJson, setPath, stalenessReason, statePaths, writeConfig } from '../lib/state.mjs';
import { liveReservations, liveSessions, readPool } from './context.mjs';
import { ago, hhmm, section, shortId, table, usage } from './output.mjs';
import { listRequests } from './queue.mjs';

function records(dir) {
  return listRecords(dir).map(({ file, record }) => ({ file, record, stale: stalenessReason(record) }));
}

export async function status({ home }) {
  const paths = statePaths(home);
  const pool = readPool(home);
  const reservations = liveReservations(home);
  const sessions = liveSessions(home).map((session) => ({
    sessionId: session.sessionId, cwd: session.cwd, ownerPid: session.ownerPid, startedAt: session.startedAt, lastSeenAt: session.lastSeenAt, lastUdid: session.lastUdid,
    reservation: reservations.find((held) => held.sessionId === session.sessionId)?.udid ?? null,
  }));
  return {
    home,
    pool: pool ? { count: pool.devices.length, free: pool.devices.filter((device) => !reservations.some((held) => held.udid === device.udid)).length, app: pool.app?.kind ?? null } : null,
    sessions,
    reservations: reservations.map((held) => ({ udid: held.udid, name: held.name, sessionId: held.sessionId, task: held.task, profile: held.profile, acquiredAt: held.acquiredAt, expiresAt: held.expiresAt, renewals: held.renewals })),
    pageLocks: records(paths.pageLocks).filter(({ stale }) => !stale).map(({ record }) => ({ tenant: record.tenant, appId: record.appId, pageId: record.pageId, sessionId: record.sessionId, plan: record.plan, expiresAt: record.expiresAt })),
    locks: records(paths.locks).filter(({ stale }) => !stale).map(({ record }) => ({ name: record.name, sessionId: record.sessionId, task: record.task, expiresAt: record.expiresAt })),
    waiters: records(paths.queue).filter(({ stale }) => !stale).map(({ record }) => ({ sessionId: record.sessionId, task: record.task, since: record.acquiredAt, prefer: record.prefer })),
    queue: listRequests(home).filter((item) => item.status !== 'done').map((item) => ({ id: item.id, status: item.status, position: item.position, kind: item.verifyKind, ...(item.platform === 'web' ? { platform: 'web' } : {}), task: item.task, sessionId: item.sessionId, takenBy: item.takenBy?.sessionId ?? null, since: item.acquiredAt, runDir: item.runDir })),
  };
}

export function renderStatus(result) {
  return [
    `loops home: ${result.home}`,
    `pool: ${result.pool ? `${result.pool.count} sims, ${result.pool.free} free, app ${result.pool.app ?? 'none'}` : 'none (device-pool pool init)'}`,
    section('sessions', table(result.sessions, [
      { label: 'session', get: (row) => shortId(row.sessionId) }, { label: 'pid', key: 'ownerPid' }, { label: 'reservation', get: (row) => row.reservation ?? '-' },
      { label: 'seen', get: (row) => ago(row.lastSeenAt) }, { label: 'cwd', key: 'cwd' },
    ])),
    section('reservations', table(result.reservations, [
      { label: 'device', key: 'name' }, { label: 'udid', key: 'udid' }, { label: 'session', get: (row) => shortId(row.sessionId) }, { label: 'profile', key: 'profile' },
      { label: 'task', get: (row) => row.task ?? '-' }, { label: 'held', get: (row) => ago(row.acquiredAt) }, { label: 'expires', get: (row) => hhmm(row.expiresAt) },
    ])),
    section('page locks', table(result.pageLocks, [
      { label: 'tenant', key: 'tenant' }, { label: 'app', key: 'appId' }, { label: 'page', key: 'pageId' }, { label: 'session', get: (row) => shortId(row.sessionId) },
      { label: 'plan', get: (row) => row.plan ?? '-' }, { label: 'expires', get: (row) => hhmm(row.expiresAt) },
    ])),
    section('locks', table(result.locks, [
      { label: 'name', key: 'name' }, { label: 'session', get: (row) => shortId(row.sessionId) }, { label: 'task', get: (row) => row.task ?? '-' }, { label: 'expires', get: (row) => hhmm(row.expiresAt) },
    ])),
    section('waiters', table(result.waiters, [
      { label: '#', get: (row, index) => String(index + 1) }, { label: 'session', get: (row) => shortId(row.sessionId) }, { label: 'task', get: (row) => row.task ?? '-' }, { label: 'waiting', get: (row) => ago(row.since) },
    ])),
    section('device queue', table(result.queue, [
      { label: '#', get: (row) => (row.position ? String(row.position) : '-') }, { label: 'id', key: 'id' }, { label: 'status', key: 'status' }, { label: 'task', get: (row) => row.task ?? '-' },
      { label: 'from', get: (row) => shortId(row.sessionId) }, { label: 'by', get: (row) => (row.takenBy ? shortId(row.takenBy) : '-') }, { label: 'since', get: (row) => ago(row.since) },
    ])),
  ].join('\n');
}

export function configCommand({ home, config, action, args, values }) {
  if (action === 'get') {
    const [key] = args;
    const value = key ? getPath(config, key) : config;
    if (values.raw) return { raw: value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value) };
    return key ? { key, value: value ?? null } : config;
  }
  if (action !== 'set') throw usage('config takes get [key] or set key=value ...');
  if (!args.length) throw usage('config set needs key=value ...');
  for (const pair of args) {
    const at = pair.indexOf('=');
    if (at < 1) throw usage(`"${pair}" is not key=value`);
    setPath(config, pair.slice(0, at), parseValue(pair.slice(at + 1)));
  }
  writeConfig(home, config);
  return readJson(statePaths(home).config);
}
