// The simulator pool: ua-sim-NN devices with the Preview app installed, and
// the one record of which app build they carry.
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { readJson, replaceJson, setPath, parseValue, statePaths, withLock, writeConfig } from '../lib/state.mjs';
import * as simctl from '../lib/simctl.mjs';
import { slimEnabled, slimState, verifySlim } from '../lib/slim.mjs';
import { legacyName, poolName } from '../lib/names.mjs';
import { bringUpToDate } from '../lib/upgrade.mjs';
import { findDevice, liveReservations, loadPool, readPool, updatePool } from './context.mjs';
import { refused, usage } from './output.mjs';

const now = () => new Date().toISOString();

// A slim store that cannot be written leaves the simulator as it was, never the pool unbuilt: the
// message goes into the device's record, beside what launchd answered after the boot.
const withError = (check, error) => (error ? { ...(check ?? { state: 'unknown' }), error } : check);
const storeState = (udid) => {
  try {
    return slimState(udid).state;
  } catch {
    return 'unknown';
  }
};

// --- app resolution --------------------------------------------------------------

// Every variant of the UnifyApps Preview app. A pool holds one of them at a time; which one
// follows the artifact installed last (config.previewApp.bundleId).
export const PREVIEW_BUNDLE_IDS = ['com.unifyapps.matrix', 'com.unifyapps.matrix.preview', 'com.unifyapps.matrix.internal', 'com.unifyapps.matrix.development'];

async function sha256Of(file) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

function extract(archive, dir) {
  if (archive.endsWith('.zip')) execFileSync('unzip', ['-q', '-o', archive, '-d', dir], { stdio: ['ignore', 'pipe', 'pipe'] });
  else if (/\.(tar\.gz|tgz|tar)$/.test(archive)) execFileSync('tar', ['-xf', archive, '-C', dir], { stdio: ['ignore', 'pipe', 'pipe'] });
  else throw new Error(`${archive} is not a .app, .zip, .tar.gz or .tgz`);
}

function pinnedApp(home, sha) {
  if (!sha) return null;
  return simctl.findAppBundle(path.join(statePaths(home).apps, sha));
}

async function placeArchive(home, archive, sha) {
  const dir = path.join(statePaths(home).apps, sha);
  const already = simctl.findAppBundle(dir);
  if (already) return already;
  fs.mkdirSync(dir, { recursive: true });
  const kept = path.join(dir, path.basename(archive));
  if (kept !== archive) fs.copyFileSync(archive, kept);
  extract(kept, dir);
  const app = simctl.findAppBundle(dir);
  if (!app) throw new Error(`${archive} holds no .app bundle`);
  return app;
}

function githubAsset(url) {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/([^/]+)\/([^/?#]+)$/.exec(url);
  return match ? { repo: match[1], tag: match[2], asset: match[3] } : null;
}

// A release asset of a private repository answers 404 to a plain GET; gh carries the person's
// login, so the download goes through it when the URL is a GitHub release asset.
async function fetchToFile(url, tmp) {
  const response = await fetch(url);
  if (response.ok && response.body) {
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tmp));
    return;
  }
  const asset = githubAsset(url);
  if (!asset) throw new Error(`GET ${url} answered ${response.status}`);
  const dir = fs.mkdtempSync(path.join(path.dirname(tmp), '.gh-'));
  const result = spawnSync('gh', ['release', 'download', asset.tag, '--repo', asset.repo, '--pattern', asset.asset, '--dir', dir], { encoding: 'utf8' });
  if (result.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    const why = (result.stderr || result.error?.message || '').trim() || 'gh is not installed';
    throw new Error(`GET ${url} answered ${response.status}, and gh could not download it (${why}). Sign in with gh auth login, or download the file and pass its path to --preview-app.`);
  }
  fs.renameSync(path.join(dir, asset.asset), tmp);
  fs.rmSync(dir, { recursive: true, force: true });
}

async function download(home, url, config) {
  const pinned = pinnedApp(home, config.previewApp.sha);
  if (pinned) return { appPath: pinned, sha256: config.previewApp.sha, cached: true };
  const apps = statePaths(home).apps;
  fs.mkdirSync(apps, { recursive: true });
  const tmp = path.join(apps, `.download.${process.pid}.tmp`);
  await fetchToFile(url, tmp);
  const sha = await sha256Of(tmp);
  const name = path.basename(new URL(url).pathname) || 'preview-app.tar.gz';
  const dir = path.join(apps, sha);
  fs.mkdirSync(dir, { recursive: true });
  const archive = path.join(dir, name);
  fs.renameSync(tmp, archive);
  return { appPath: await placeArchive(home, archive, sha), sha256: sha };
}

async function materialize(home, value, config) {
  if (/^https?:\/\//.test(value)) return download(home, value, config);
  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved)) throw new Error(`${resolved} does not exist`);
  if (fs.statSync(resolved).isDirectory()) {
    const app = simctl.findAppBundle(resolved);
    if (!app) throw new Error(`${resolved} holds no .app bundle`);
    return { appPath: app, sha256: null };
  }
  const sha = await sha256Of(resolved);
  return { appPath: await placeArchive(home, resolved, sha), sha256: sha };
}

function validated(info, source, sha256) {
  if (!PREVIEW_BUNDLE_IDS.includes(info.bundleId)) throw new Error(`${info.path} is ${info.bundleId ?? 'an app without a bundle id'}, not a UnifyApps Preview app (${PREVIEW_BUNDLE_IDS.join(', ')})`);
  if (info.kind === 'debug-metro') throw new Error(`${info.path} has no JavaScript bundle inside (a development build); the pool needs a Preview app build with main.jsbundle embedded`);
  return { ...info, source, sha256 };
}

// One Preview app per simulator: a second variant would stay installed beside the first and
// both would answer the matrix:// deep link, so the previous one goes first.
function replaceApp(udid, previous, app) {
  if (previous?.bundleId && previous.bundleId !== app.bundleId) simctl.uninstall(udid, previous.bundleId);
  simctl.install(udid, app.path);
}

// Order: an explicit path or URL, then the configured ones, then the app a
// booted simulator already carries.
export async function resolveApp({ home, config, previewApp }) {
  const explicit = [
    previewApp && { kind: 'arg', value: previewApp },
    config.previewApp.path && { kind: 'config-path', value: config.previewApp.path },
    config.previewApp.url && { kind: 'config-url', value: config.previewApp.url },
  ].filter(Boolean);
  for (const source of explicit) {
    const { appPath, sha256 } = await materialize(home, source.value, config);
    return validated(simctl.inspectApp(appPath), source, sha256);
  }
  const candidates = [...new Set([config.previewApp.bundleId, ...PREVIEW_BUNDLE_IDS].filter(Boolean))];
  for (const device of simctl.listDevices().filter((item) => item.state === 'Booted')) {
    for (const bundleId of candidates) {
      const container = simctl.appContainer(device.udid, bundleId);
      if (container) return validated(simctl.inspectApp(container), { kind: 'container', value: device.udid }, null);
    }
  }
  throw new Error('no Preview app found. Pass --preview-app <the Preview app\'s simulator .app, an archive of it, or an https URL to one>, or boot a simulator that has the Preview app.');
}

function appRecord(app, config) {
  return {
    bundleId: app.bundleId, scheme: config.previewApp.scheme, kind: app.kind, version: app.version, build: app.build,
    source: app.source, sha256: app.sha256, path: app.path, installedAt: now(),
  };
}

function rememberApp(home, config, app) {
  config.previewApp.bundleId = app.bundleId;
  config.previewApp.kind = app.kind;
  config.previewApp.sha = app.sha256 ?? config.previewApp.sha;
  if (app.source.kind === 'arg') {
    if (/^https?:\/\//.test(app.source.value)) config.previewApp.url = app.source.value;
    else config.previewApp.path = app.source.value;
  }
  writeConfig(home, config);
}

// --- init -----------------------------------------------------------------------

// How many simulators: --count, else config.pool.size (an older config's
// pool.count too), else the pool that already exists, else the laptop default
// of skills/native-loops/loop-orchestrator/scripts/lib/capacity.mjs when it is installed beside us.
async function laptopDefault() {
  try {
    const capacity = await import(new URL('../../../loop-orchestrator/scripts/lib/capacity.mjs', import.meta.url).href);
    for (const name of ['poolSize', 'defaultPoolSize', 'suggestPoolSize']) {
      if (typeof capacity[name] === 'function') {
        const size = await capacity[name]();
        const value = typeof size === 'object' && size ? size.poolSize ?? size.size ?? size.pool : size;
        if (Number.isInteger(value) && value > 0) return value;
      }
    }
    for (const name of ['capacity', 'computeCapacity', 'machineCapacity']) {
      if (typeof capacity[name] === 'function') {
        const result = await capacity[name]();
        const value = result?.poolSize ?? result?.pool?.size ?? result?.pool;
        if (Number.isInteger(value) && value > 0) return value;
      }
    }
  } catch {
    // not installed beside this skill: the caller passes --count
  }
  return null;
}

export async function poolSize({ home, config, values }) {
  if (values.count != null) return Number(values.count);
  const configured = config.pool.size ?? config.pool.count;
  if (configured != null) return Number(configured);
  const existing = readPool(home);
  if (existing?.devices?.length) return Math.max(...existing.devices.map((device) => device.index ?? 0));
  const fallback = await laptopDefault();
  if (fallback) return fallback;
  throw usage('pass --count N (the number of simulators), or set pool.size with `device-pool config set pool.size=N`');
}

export async function poolInit({ home, config, sessionId, values }) {
  const count = await poolSize({ home, config, values });
  if (!Number.isInteger(count) || count < 1) throw usage('--count must be a whole number of simulators');
  const model = values.model ?? config.pool.model;
  return withLock(home, 'pool-init', async () => {
    const paths = statePaths(home);
    const existing = readPool(home);
    const runtime = simctl.pickRuntime(model, values.runtime ?? config.pool.runtime ?? undefined);
    const deviceType = simctl.deviceTypeId(runtime, model);
    if (!deviceType) throw new Error(`${runtime.name} has no device type "${model}"`);
    const simDevices = simctl.listDevices();
    const slim = slimEnabled(config);
    const slimErrors = new Map();
    const reserved = new Set(liveReservations(home).map((held) => held.udid));
    const byName = (wanted) => simDevices.find((device) => device.name === wanted && device.runtime === runtime.identifier)
      ?? simDevices.find((device) => device.name === wanted);
    const devices = [];
    for (let index = 1; index <= count; index += 1) {
      const name = poolName(index);
      const known = existing?.devices?.find((device) => device.index === index) ?? null;
      const sim = (known && simDevices.find((device) => device.udid === known.udid)) ?? byName(name) ?? byName(legacyName(index));
      let udid;
      let createdFrom;
      if (sim) {
        udid = sim.udid;
        createdFrom = known?.udid === sim.udid ? known.createdFrom : 'adopted';
      } else if (values['clone-from']) {
        udid = simctl.clone(values['clone-from'], name);
        createdFrom = `clone:${values['clone-from']}`;
      } else {
        udid = simctl.create(name, deviceType, runtime.identifier);
        createdFrom = 'create';
      }
      // A new simulator and a clone start stock; one an earlier version made is stock and named
      // loops-<n>. Each is brought up to date before it boots, a booted one by a restart, unless
      // another session holds it: that one is brought up to date when it is next reserved.
      const simRow = sim ?? { state: 'Shutdown', name };
      const update = reserved.has(udid) ? null : bringUpToDate({ udid, index }, { slim, sim: simRow });
      if (update?.slim?.error) slimErrors.set(udid, update.slim.error);
      const sameDevice = known?.udid === udid;
      devices.push({
        udid, name: update?.name ?? simRow.name ?? name, index,
        createdAt: sameDevice ? known.createdAt : now(),
        createdFrom,
        appInstalled: sameDevice ? known.appInstalled : false,
        lastBootAt: sameDevice ? known.lastBootAt : null,
        slim: sameDevice ? known.slim ?? null : null,
        state: sameDevice ? known.state : { currentApp: null, deepLinkPromptSeen: false, lastRestartAt: null, lastReleasedAt: null },
      });
    }
    for (const extra of existing?.devices?.filter((device) => device.index > count) ?? []) devices.push(extra);

    let app = existing?.app ?? null;
    if (!values['skip-install']) {
      const resolved = await resolveApp({ home, config, previewApp: values['preview-app'] });
      app = appRecord(resolved, config);
      rememberApp(home, config, resolved);
    }
    for (const device of devices.filter((item) => item.index <= count)) {
      simctl.boot(device.udid);
      device.lastBootAt = now();
      device.slim = withError(slim ? verifySlim(device.udid) : null, slimErrors.get(device.udid));
      if (app && !values['skip-install']) {
        replaceApp(device.udid, existing?.app ?? null, app);
        device.appInstalled = true;
      }
    }
    const pool = {
      version: 1, createdAt: existing?.createdAt ?? now(), updatedAt: now(), model, runtime: runtime.identifier, app, devices,
    };
    replaceJson(paths.pool, pool);
    return pool;
  }, { ttlSec: 1800, waitMs: 1000, sessionId, task: 'pool init' });
}

// --- status and maintenance ------------------------------------------------------

export function poolStatus({ home }) {
  const pool = loadPool(home);
  const sims = new Map(simctl.listDevices().map((device) => [device.udid, device]));
  const reservations = new Map(liveReservations(home).map((held) => [held.udid, held]));
  return {
    model: pool.model,
    runtime: pool.runtime,
    app: pool.app ? { bundleId: pool.app.bundleId, kind: pool.app.kind, version: pool.app.version, build: pool.app.build, sha256: pool.app.sha256, source: pool.app.source } : null,
    devices: pool.devices.map((device) => {
      const held = reservations.get(device.udid) ?? null;
      return {
        index: device.index, name: device.name, udid: device.udid,
        simState: sims.get(device.udid)?.state ?? 'missing',
        appInstalled: device.appInstalled,
        reservation: held ? { sessionId: held.sessionId, task: held.task, profile: held.profile, expiresAt: held.expiresAt } : null,
        currentApp: device.state?.currentApp ?? null,
        deepLinkPromptSeen: device.state?.deepLinkPromptSeen ?? false,
        lastBootAt: device.lastBootAt,
        // the store says what the next boot brings; slimChecked is launchd's own answer after the last boot
        slim: storeState(device.udid),
        slimChecked: device.slim?.state ?? null,
      };
    }),
  };
}

function targetDevices(pool, values) {
  if (values.all) return pool.devices;
  if (!values.udid) throw usage('pass --udid <udid> or --all');
  const device = findDevice(pool, values.udid);
  if (!device) throw usage(`${values.udid} is not a pool device`);
  return [device];
}

function foreignReservationOn(home, udid, sessionId) {
  const held = liveReservations(home).find((item) => item.udid === udid);
  return held && held.sessionId !== sessionId ? held : null;
}

// Shut down and boot again; in between, the slim list is written (or, with pool.slim false, cleared),
// so this is also how a booted stock simulator becomes slim.
export async function poolBoot({ home, config, values }) {
  const pool = loadPool(home);
  const slim = slimEnabled(config);
  const sims = new Map(simctl.listDevices().map((device) => [device.udid, device]));
  const booted = [];
  const checks = {};
  const names = {};
  for (const device of targetDevices(pool, values)) {
    simctl.shutdown(device.udid);
    const update = bringUpToDate(device, { slim, sim: { state: 'Shutdown', name: sims.get(device.udid)?.name ?? device.name } });
    simctl.boot(device.udid);
    booted.push(device.udid);
    names[device.udid] = update.name;
    checks[device.udid] = withError(slim ? verifySlim(device.udid) : null, update.slim?.error);
  }
  await updatePool(home, (current) => {
    for (const udid of booted) {
      const device = findDevice(current, udid);
      if (!device) continue;
      device.lastBootAt = now();
      device.slim = checks[udid];
      if (names[udid]) device.name = names[udid];
    }
  });
  return { booted, slim: Object.fromEntries(booted.map((udid) => [udid, checks[udid]?.state ?? 'off'])) };
}

export async function poolShutdown({ home, sessionId, values }) {
  const pool = loadPool(home);
  const done = [];
  for (const device of targetDevices(pool, values)) {
    const foreign = foreignReservationOn(home, device.udid, sessionId);
    if (foreign && !values.force) throw refused(`${device.name} is reserved by session ${foreign.sessionId}; --force overrides`, { holder: foreign });
    simctl.shutdown(device.udid);
    done.push(device.udid);
  }
  return { shutdown: done };
}

export async function poolRemove({ home, values }) {
  const pool = loadPool(home);
  const reserved = new Map(liveReservations(home).map((held) => [held.udid, held]));
  const removed = [];
  for (const device of targetDevices(pool, values)) {
    const holder = reserved.get(device.udid);
    if (holder) throw refused(`${device.name} (${device.udid}) is reserved by session ${holder.sessionId}; release it first`, { holder });
    simctl.shutdown(device.udid);
    simctl.remove(device.udid);
    removed.push(device.udid);
  }
  await updatePool(home, (current) => {
    current.devices = current.devices.filter((device) => !removed.includes(device.udid));
  });
  return { removed };
}

export async function poolInstall({ home, config, values }) {
  const pool = loadPool(home);
  const resolved = await resolveApp({ home, config, previewApp: values['preview-app'] });
  const app = appRecord(resolved, config);
  rememberApp(home, config, resolved);
  const installed = [];
  const slim = slimEnabled(config);
  const sims = new Map(simctl.listDevices().map((device) => [device.udid, device]));
  const names = {};
  for (const device of values.udid || values.all ? targetDevices(pool, values) : pool.devices) {
    // a device this boots from cold comes up to date; a booted one keeps what it has
    const sim = sims.get(device.udid);
    if (sim?.state === 'Shutdown') names[device.udid] = bringUpToDate(device, { slim, sim }).name;
    simctl.boot(device.udid);
    replaceApp(device.udid, pool.app, app);
    installed.push(device.udid);
  }
  await updatePool(home, (current) => {
    current.app = app;
    for (const udid of installed) {
      const device = findDevice(current, udid);
      if (!device) continue;
      device.appInstalled = true;
      device.lastBootAt = now();
      device.state.currentApp = null;
      if (names[udid]) device.name = names[udid];
    }
  });
  return { installed, app: { bundleId: app.bundleId, kind: app.kind, version: app.version, build: app.build, sha256: app.sha256 } };
}

export async function poolSet({ home, udid, pairs }) {
  if (!udid) throw usage('pool set needs <udid> key=value ...');
  const parsed = pairs.map((pair) => {
    const at = pair.indexOf('=');
    if (at < 1) throw usage(`"${pair}" is not key=value`);
    return [pair.slice(0, at).replace(/^state\./, ''), parseValue(pair.slice(at + 1))];
  });
  if (!parsed.length) throw usage('pool set needs at least one key=value');
  return updatePool(home, (pool) => {
    const device = findDevice(pool, udid);
    if (!device) throw usage(`${udid} is not a pool device`);
    device.state ??= {};
    for (const [key, value] of parsed) setPath(device.state, key, value);
    // `since` dates the app the device shows; a caller that sets the endpoint rarely passes it
    if (parsed.some(([key]) => key.startsWith('currentApp.')) && device.state.currentApp && typeof device.state.currentApp === 'object' && !parsed.some(([key]) => key === 'currentApp.since')) {
      device.state.currentApp.since = now();
    }
    return { udid, state: device.state };
  });
}

export function poolExists(home) {
  return readJson(statePaths(home).pool) !== null;
}
