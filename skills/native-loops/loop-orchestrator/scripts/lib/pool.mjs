// The simulator pool, over native-device-pool's device-pool: create it at the laptop's size on the
// pinned iOS runtime, show it, grow it, adopt a simulator, and start the baguette farm view.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { blockError, devicePool } from './blocks.mjs';
import { capacity } from './capacity.mjs';
import { nowMs, portListening, run, which } from './exec.mjs';
import { invalidate } from './health.mjs';
import { failed, missing, table, usage } from './output.mjs';
import { readJson, readLoopsConfig, wantedRuntime, writeJson } from './paths.mjs';
import { parseDevices, parseRuntimes, readPool } from './probes.mjs';
import { poolName } from '../../../native-device-pool/scripts/lib/names.mjs';

export const FARM_PORT = 8421;
export const farmUrl = (port = FARM_PORT) => `http://127.0.0.1:${port}/farm`;

/** A runtime version (18.6) or identifier → the identifier simctl knows. */
export function resolveRuntime(wanted) {
  if (/^com\.apple\.CoreSimulator\.SimRuntime\./u.test(wanted)) return wanted;
  const result = run('xcrun', ['simctl', 'list', 'runtimes', '-j'], { timeout: 20_000 });
  const runtimes = result.status === 0 ? parseRuntimes(result.stdout) : null;
  if (!runtimes) throw missing(`xcrun simctl list runtimes failed: ${result.stderr.trim() || 'no answer'} (is Xcode installed?)`);
  const hit = runtimes.find((runtime) => runtime.isAvailable && runtime.version === wanted);
  if (!hit) {
    const have = runtimes.filter((runtime) => runtime.isAvailable).map((runtime) => runtime.version).join(', ') || 'none';
    throw missing(`the iOS ${wanted} simulator runtime is not installed (have: ${have}); run loops setup, or: xcodebuild -downloadPlatform iOS -buildVersion ${wanted}`);
  }
  return hit.identifier;
}

function poolInit({ home, count, runtime, previewApp, session }) {
  const args = ['pool', 'init', '--count', String(count), '--runtime', runtime];
  if (previewApp) args.push('--preview-app', previewApp);
  const result = devicePool(args, { home, session, showProgress: true });
  invalidate(home, ['pool', 'preview']);
  if (result.status !== 0) throw failed(`pool init failed: ${blockError(result)}`, result.json ?? undefined);
  return result.json ?? {};
}

export function poolUp({ home, count, runtime, previewApp, session }) {
  const config = readLoopsConfig(home);
  const size = count ?? capacity({ config }).pool;
  const runtimeId = resolveRuntime(runtime ?? wantedRuntime(config));
  const result = poolInit({ home, count: size, runtime: runtimeId, previewApp, session });
  return { data: { count: size, runtime: runtimeId, pool: result }, text: renderPool(result, `Pool of ${size} on ${runtimeId.replace(/^.*SimRuntime\./u, '')}`) };
}

export function poolStatus({ home, session }) {
  const result = devicePool(['pool', 'status'], { home, session });
  if (result.status !== 0) throw failed(`pool status failed: ${blockError(result)}`);
  return { data: result.json, text: renderPool(result.json, 'Pool') };
}

export function renderPool(status, title) {
  const devices = status?.devices ?? [];
  if (!devices.length) return `${title}: no simulators.`;
  const app = status.app ? `${status.app.bundleId ?? '?'} ${status.app.version ?? ''} (${status.app.kind ?? '?'})`.trim() : 'no app recorded';
  const rows = devices.map((device) => [device.name, device.simState ?? device.state ?? '', device.appInstalled ? 'yes' : 'no', device.reservation ? device.reservation.task ?? 'reserved' : '—', device.currentApp?.version ?? '—']);
  return [`${title} · ${app}`, table(['simulator', 'state', 'app', 'reservation', 'shows'], rows)].join('\n');
}

const currentSize = (pool) => (pool?.devices?.length ? Math.max(...pool.devices.map((device) => Number(device.index) || 0), pool.devices.length) : 0);

export function poolAdd({ home, session }) {
  const pool = readPool(home);
  if (!pool?.devices?.length) throw missing('there is no pool yet: run pool up first');
  const next = currentSize(pool) + 1;
  const result = poolInit({ home, count: next, runtime: pool.runtime ?? resolveRuntime(wantedRuntime(readLoopsConfig(home))), session });
  return { data: { count: next, pool: result }, text: renderPool(result, `Pool grown to ${next}`) };
}

/** Rename a simulator that already exists to ua-sim-<n+1>, then let pool init adopt it. */
export function poolAdopt({ home, udid, session }) {
  if (!udid) throw usage('pool adopt needs the simulator udid: pool adopt <udid>');
  const pool = readPool(home);
  if (pool?.devices?.some((device) => device.udid === udid)) throw usage(`${udid} is already in the pool`);
  const listed = run('xcrun', ['simctl', 'list', 'devices', '-j'], { timeout: 20_000 });
  const sims = parseDevices(listed.stdout);
  const sim = sims?.get(udid);
  if (!sim) throw missing(`no simulator ${udid} (xcrun simctl list devices)`);
  const next = currentSize(pool) + 1;
  const name = poolName(next);
  if (sim.state !== 'Shutdown') run('xcrun', ['simctl', 'shutdown', udid], { timeout: 60_000 });
  const renamed = run('xcrun', ['simctl', 'rename', udid, name], { timeout: 20_000 });
  if (renamed.status !== 0) throw failed(`xcrun simctl rename failed: ${renamed.stderr.trim()}`);
  const runtime = pool?.runtime ?? sim.runtime;
  const result = poolInit({ home, count: next, runtime, session });
  return { data: { adopted: udid, name, count: next, pool: result }, text: renderPool(result, `Adopted ${udid} as ${name}`) };
}

const farmFile = (home) => path.join(home, 'baguette-serve.json');

/** Start `baguette serve` in the background (once) and give the farm URL. */
export async function poolWatch({ home, port = FARM_PORT, stop = false }) {
  const record = readJson(farmFile(home));
  if (stop) {
    if (!record?.pid) return { data: { stopped: false }, text: 'No baguette farm started by the loops.' };
    try {
      process.kill(record.pid);
    } catch {
      // already gone
    }
    fs.rmSync(farmFile(home), { force: true });
    return { data: { stopped: true, pid: record.pid }, text: `Stopped the baguette farm (pid ${record.pid}).` };
  }
  const url = farmUrl(port);
  if (await portListening(port)) {
    return { data: { url, started: false, pid: record?.pid ?? null }, text: `Simulator farm: [${url}](${url}) (already running)` };
  }
  if (!which('baguette')) throw missing('baguette is not installed: run loops setup (brew install baguette)');
  fs.mkdirSync(path.join(home, 'logs'), { recursive: true });
  const log = fs.openSync(path.join(home, 'logs', 'baguette-serve.log'), 'a');
  const child = spawn('baguette', ['serve', '--port', String(port)], { detached: true, stdio: ['ignore', log, log] });
  child.unref();
  writeJson(farmFile(home), { pid: child.pid, port, startedAt: new Date(nowMs()).toISOString() });
  for (let waited = 0; waited < 5000; waited += 250) {
    if (await portListening(port)) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const up = await portListening(port);
  if (!up) throw failed(`baguette serve did not answer on :${port} within 5 s; see ${path.join(home, 'logs', 'baguette-serve.log')}`);
  return { data: { url, started: true, pid: child.pid }, text: `Simulator farm: [${url}](${url})` };
}
