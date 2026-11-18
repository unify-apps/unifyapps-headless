// Named locks (publish-<appId>) and page locks (<tenant>/<appId>/<pageId>):
// the same envelope and staleness rule as a reservation, keyed by name instead
// of by device.
import fs from 'node:fs';
import path from 'node:path';
import { createExclusive, listRecords, makeRecord, readJson, renewRecord, replaceJson, stalenessReason, statePaths } from '../lib/state.mjs';
import { isSafeId, upsertSession } from './context.mjs';
import { busy, refused, usage } from './output.mjs';

function takeOrRenew({ file, sessionId, build, ttlSec, what }) {
  const existing = readJson(file);
  const stale = stalenessReason(existing);
  if (existing && !stale) {
    if (existing.sessionId !== sessionId) {
      throw busy(`${what} is held by session ${existing.sessionId}${existing.task ? ` for "${existing.task}"` : ''} until ${existing.expiresAt}`, { error: 'HELD', holder: existing });
    }
    const renewed = renewRecord(existing, { ttlSec });
    replaceJson(file, renewed);
    return { outcome: 'renewed', record: renewed };
  }
  if (existing && stale) {
    try {
      fs.unlinkSync(file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const record = build();
  if (createExclusive(file, record)) return { outcome: 'acquired', record };
  const holder = readJson(file);
  throw busy(`${what} was taken by session ${holder?.sessionId ?? '-'} a moment ago`, { error: 'HELD', holder });
}

function give({ file, sessionId, force, what }) {
  const existing = readJson(file);
  if (!existing) return { released: false, note: `${what} was not held` };
  if (!stalenessReason(existing) && existing.sessionId !== sessionId && !force) {
    throw refused(`${what} is held by session ${existing.sessionId}; --force evicts them`, { holder: existing });
  }
  fs.unlinkSync(file);
  return { released: true, evicted: existing.sessionId !== sessionId ? existing : undefined };
}

export function lockCommand({ home, config, sessionId, action, name, values }) {
  if (!name || !isSafeId(name)) throw usage('lock needs a name made of letters, digits, dot, dash or underscore');
  const file = path.join(statePaths(home).locks, `${name}.json`);
  const what = `lock "${name}"`;
  if (action === 'status') {
    const record = readJson(file);
    return record ? { name, held: !stalenessReason(record), stale: stalenessReason(record), lock: record } : { name, held: false };
  }
  if (action === 'release') return give({ file, sessionId, force: values.force, what });
  if (action !== 'acquire') throw usage('lock takes acquire, release or status');
  const session = upsertSession(home, sessionId, {});
  const ttlSec = Number(values.ttl ?? config.locks.publishTtlSec);
  const result = takeOrRenew({
    file, sessionId, ttlSec, what,
    build: () => makeRecord({ kind: 'lock', id: name, name, sessionId, cwd: process.cwd(), ownerPid: session.ownerPid, task: values.task ?? null, ttlSec }),
  });
  return { name, outcome: result.outcome, expiresAt: result.record.expiresAt };
}

export function pageLockFile(home, tenant, appId, pageId) {
  return path.join(statePaths(home).pageLocks, tenant, appId, `${pageId}.json`);
}

export function pageLockCommand({ home, config, sessionId, action, tenant, appId, pageId, values }) {
  if (action === 'list') {
    const pageLocks = listRecords(statePaths(home).pageLocks)
      .filter(({ record }) => !stalenessReason(record))
      .map(({ record }) => record)
      .filter((record) => (!tenant || record.tenant === tenant) && (!appId || record.appId === appId));
    return { pageLocks };
  }
  if (![tenant, appId, pageId].every(isSafeId)) throw usage('page-lock needs <tenant> <appId> <pageId>, each made of letters, digits, dot, dash or underscore');
  const file = pageLockFile(home, tenant, appId, pageId);
  const what = `page ${pageId} of ${appId} on ${tenant}`;
  if (action === 'release') return give({ file, sessionId, force: values.force, what });
  if (action !== 'acquire') throw usage('page-lock takes acquire, release or list');
  const session = upsertSession(home, sessionId, {});
  const ttlSec = Number(values.ttl ?? config.locks.pageLockTtlSec);
  const result = takeOrRenew({
    file, sessionId, ttlSec, what,
    build: () => makeRecord({
      kind: 'page-lock', id: `${tenant}/${appId}/${pageId}`, tenant, appId, pageId, plan: values.plan ?? null,
      sessionId, cwd: process.cwd(), ownerPid: session.ownerPid, task: values.task ?? null, ttlSec,
    }),
  });
  if (values.plan && result.outcome === 'renewed' && result.record.plan !== values.plan) {
    replaceJson(file, { ...result.record, plan: values.plan });
  }
  return { tenant, appId, pageId, outcome: result.outcome, plan: values.plan ?? result.record.plan ?? null, expiresAt: result.record.expiresAt };
}
