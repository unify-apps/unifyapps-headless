// Thin wrappers over `xcrun simctl`, plus app-bundle detection. With
// LOOPS_FAKE_SIMCTL=1 every call goes to a fake whose state lives in
// <LOOPS_HOME>/fake-simctl.json, so tests and their spawned processes agree.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loopsHome, readJson, replaceJson } from './state.mjs';
import { readStore } from './sim-store.mjs';

export const FAKE = process.env.LOOPS_FAKE_SIMCTL === '1';

// Preview builds were only ever proven on iOS 18.x, and a 27.x runtime is a
// different UI generation that would move every measurement, so it is never
// picked by accident: it needs --runtime.
export const PREFERRED_IOS_MAJOR = '18';
// The runtime the loops pin by default; config.pool.runtime or --runtime picks another.
export const DEFAULT_RUNTIME_VERSION = '18.6';
export const DEVICE_TYPE_PREFIX = 'com.apple.CoreSimulator.SimDeviceType.';

function simctl(args, { ignore } = {}) {
  try {
    return execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).trim();
  } catch (error) {
    const text = `${error.stderr ?? ''}${error.stdout ?? ''}`.trim() || error.message;
    if (ignore && ignore.test(text)) return '';
    throw new Error(`xcrun simctl ${args.slice(0, 2).join(' ')} failed: ${text}`);
  }
}

// --- fake -------------------------------------------------------------------

const FAKE_RUNTIMES = [
  { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-27-0', version: '27.0', name: 'iOS 27.0', isAvailable: true, platform: 'iOS',
    supportedDeviceTypes: [{ identifier: `${DEVICE_TYPE_PREFIX}iPhone-17`, name: 'iPhone 17' }, { identifier: `${DEVICE_TYPE_PREFIX}iPhone-16-Pro`, name: 'iPhone 16 Pro' }] },
  { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-6', version: '18.6', name: 'iOS 18.6', isAvailable: true, platform: 'iOS',
    supportedDeviceTypes: [{ identifier: `${DEVICE_TYPE_PREFIX}iPhone-16-Pro`, name: 'iPhone 16 Pro' }, { identifier: `${DEVICE_TYPE_PREFIX}iPhone-16`, name: 'iPhone 16' }] },
  { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-4', version: '18.4', name: 'iOS 18.4', isAvailable: true, platform: 'iOS',
    supportedDeviceTypes: [{ identifier: `${DEVICE_TYPE_PREFIX}iPhone-16-Pro`, name: 'iPhone 16 Pro' }] },
];

function fakeFile() {
  return path.join(loopsHome(), 'fake-simctl.json');
}

function fakeState() {
  const stored = readJson(fakeFile());
  return stored && !stored.corrupt ? stored : { devices: [], runtimes: FAKE_RUNTIMES, calls: [] };
}

function fakeUpdate(fn) {
  const state = fakeState();
  const result = fn(state);
  replaceJson(fakeFile(), state);
  return result;
}

function fakeStoreDisabled(udid) {
  try {
    return [...readStore(udid)].filter(([, disabled]) => disabled).map(([label]) => label);
  } catch {
    return [];
  }
}

function fakeDevice(state, udid) {
  const device = state.devices.find((item) => item.udid === udid);
  if (!device) throw new Error(`fake simctl: no device ${udid}`);
  return device;
}

// --- devices and runtimes -----------------------------------------------------

export function listDevices() {
  if (FAKE) return fakeState().devices.map(({ apps, ...device }) => ({ ...device }));
  const parsed = JSON.parse(simctl(['list', 'devices', '-j']));
  const devices = [];
  for (const [runtime, list] of Object.entries(parsed.devices ?? {})) {
    for (const device of list) {
      devices.push({ udid: device.udid, name: device.name, state: device.state, runtime, deviceType: device.deviceTypeIdentifier, isAvailable: device.isAvailable !== false });
    }
  }
  return devices;
}

export function listRuntimes() {
  if (FAKE) return fakeState().runtimes;
  const parsed = JSON.parse(simctl(['list', 'runtimes', '-j']));
  return (parsed.runtimes ?? []).map((runtime) => ({
    identifier: runtime.identifier,
    version: runtime.version,
    name: runtime.name,
    isAvailable: runtime.isAvailable !== false,
    platform: runtime.platform,
    supportedDeviceTypes: (runtime.supportedDeviceTypes ?? []).map((type) => ({ identifier: type.identifier, name: type.name })),
  }));
}

const versionParts = (version) => String(version).split('.').map(Number);
function newerVersion(left, right) {
  const a = versionParts(left.version);
  const b = versionParts(right.version);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta) return delta;
  }
  return 0;
}

export function pickRuntime(model, wanted) {
  const runtimes = listRuntimes().filter((runtime) => runtime.isAvailable && runtime.platform === 'iOS');
  const listing = runtimes.map((runtime) => `${runtime.name} (${runtime.identifier})`).join(', ') || '(none)';
  if (wanted) {
    const runtime = runtimes.find((item) => [item.identifier, item.name, item.version].includes(wanted));
    if (!runtime) throw new Error(`runtime "${wanted}" is not installed. Installed: ${listing}`);
    return runtime;
  }
  const eligible = runtimes.filter((runtime) => versionParts(runtime.version)[0] === Number(PREFERRED_IOS_MAJOR) && deviceTypeId(runtime, model));
  if (!eligible.length) {
    throw new Error(`no iOS ${PREFERRED_IOS_MAJOR}.x runtime offers "${model}". Installed: ${listing}. Install iOS ${DEFAULT_RUNTIME_VERSION} with \`xcodebuild -downloadPlatform iOS -buildVersion ${DEFAULT_RUNTIME_VERSION}\`, or pass --runtime to pin one on purpose.`);
  }
  const pinned = eligible.find((runtime) => runtime.version === DEFAULT_RUNTIME_VERSION);
  return pinned ?? eligible.sort((left, right) => newerVersion(right, left))[0];
}

export function deviceTypeId(runtime, model) {
  if (model.startsWith(DEVICE_TYPE_PREFIX)) return model;
  return runtime.supportedDeviceTypes.find((type) => type.name === model)?.identifier ?? null;
}

export function create(name, deviceType, runtimeId) {
  if (FAKE) {
    return fakeUpdate((state) => {
      const udid = crypto.randomUUID().toUpperCase();
      state.devices.push({ udid, name, state: 'Shutdown', runtime: runtimeId, deviceType, isAvailable: true, apps: {} });
      return udid;
    });
  }
  return simctl(['create', name, deviceType, runtimeId]);
}

export function clone(udid, name) {
  if (FAKE) {
    return fakeUpdate((state) => {
      const source = fakeDevice(state, udid);
      const copy = { ...source, udid: crypto.randomUUID().toUpperCase(), name, state: 'Shutdown', apps: { ...source.apps } };
      state.devices.push(copy);
      return copy.udid;
    });
  }
  return simctl(['clone', udid, name]);
}

// `simctl boot` never opens the Simulator window, so this is the headless boot;
// bootstatus -b waits for the device to finish and boots it when needed.
export function boot(udid) {
  if (FAKE) {
    return fakeUpdate((state) => {
      const device = fakeDevice(state, udid);
      // like launchd_sim, the fake reads the disable store only when it starts, and an unreadable one disables nothing
      if (device.state !== 'Booted') device.liveDisabled = fakeStoreDisabled(udid);
      device.state = 'Booted';
    });
  }
  simctl(['boot', udid], { ignore: /current state: Booted/ });
  simctl(['bootstatus', udid, '-b']);
}

/** Booted, Shutdown, … as simctl says, or null for a simulator that does not exist. */
export function deviceState(udid) {
  return listDevices().find((device) => device.udid === udid)?.state ?? null;
}

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// `launchctl print-disabled system` inside a booted simulator: the services launchd keeps off.
// Recent launchd prints `"label" => disabled`, older builds `=> true`. Right after a boot launchd_sim
// can answer error 124 ("Domain is tearing down") for a few seconds, so that is retried.
export function printDisabled(udid) {
  if (FAKE) return new Set(fakeDevice(fakeState(), udid).liveDisabled ?? []);
  let output;
  for (const wait of [1000, 2000, 4000, null]) {
    try {
      output = simctl(['spawn', udid, 'launchctl', 'print-disabled', 'system']);
      break;
    } catch (error) {
      if (wait === null || !/code=124|tearing down/iu.test(error.message)) throw error;
      pause(wait);
    }
  }
  return parseDisabled(output);
}

/** The labels `launchctl print-disabled` lists as off. */
export function parseDisabled(output) {
  const disabled = new Set();
  for (const match of String(output).matchAll(/"([^"]+)"\s*=>\s*(disabled|true)\b/gu)) disabled.add(match[1]);
  return disabled;
}

export function rename(udid, name) {
  if (FAKE) return fakeUpdate((state) => { fakeDevice(state, udid).name = name; });
  simctl(['rename', udid, name]);
}

export function shutdown(udid) {
  if (FAKE) return fakeUpdate((state) => { fakeDevice(state, udid).state = 'Shutdown'; });
  simctl(['shutdown', udid], { ignore: /current state: Shutdown/ });
}

export function remove(udid) {
  if (FAKE) return fakeUpdate((state) => { state.devices = state.devices.filter((device) => device.udid !== udid); });
  simctl(['delete', udid]);
}

export function install(udid, appPath) {
  if (FAKE) {
    const { bundleId } = inspectApp(appPath);
    return fakeUpdate((state) => { fakeDevice(state, udid).apps[bundleId] = appPath; });
  }
  simctl(['install', udid, appPath]);
}

export function uninstall(udid, bundleId) {
  if (FAKE) return fakeUpdate((state) => { delete fakeDevice(state, udid).apps[bundleId]; });
  simctl(['uninstall', udid, bundleId], { ignore: /not installed|No such file|not found/i });
}

export function appContainer(udid, bundleId) {
  if (FAKE) return fakeState().devices.find((device) => device.udid === udid)?.apps?.[bundleId] ?? null;
  try {
    return simctl(['get_app_container', udid, bundleId, 'app']) || null;
  } catch {
    return null;
  }
}

export function launch(udid, bundleId) {
  if (FAKE) return fakeUpdate((state) => { state.calls.push(['launch', udid, bundleId]); });
  simctl(['launch', udid, bundleId]);
}

export function terminate(udid, bundleId) {
  if (FAKE) return fakeUpdate((state) => { state.calls.push(['terminate', udid, bundleId]); });
  simctl(['terminate', udid, bundleId], { ignore: /found nothing to terminate|not running/i });
}

export function openurl(udid, url) {
  if (FAKE) return fakeUpdate((state) => { state.calls.push(['openurl', udid, url]); });
  simctl(['openurl', udid, url]);
}

// --- app bundles ----------------------------------------------------------------

function plistValue(plist, key) {
  try {
    return execFileSync('plutil', ['-extract', key, 'raw', plist], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() || null;
  } catch {
    // plutil is macOS only; on Linux (CI) an XML plist is still readable as text.
    const text = fs.readFileSync(plist, 'utf8');
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`<key>${escaped}</key>\\s*<string>([^<]*)</string>`).exec(text)?.[1].trim() || null;
  }
}

// A Preview build embeds main.jsbundle; a development build has none and cannot run on its own.
export function inspectApp(appPath) {
  const plist = path.join(appPath, 'Info.plist');
  if (!fs.existsSync(plist)) throw new Error(`${appPath} is not an .app bundle (no Info.plist)`);
  return {
    path: appPath,
    bundleId: plistValue(plist, 'CFBundleIdentifier'),
    version: plistValue(plist, 'CFBundleShortVersionString'),
    build: plistValue(plist, 'CFBundleVersion'),
    kind: fs.existsSync(path.join(appPath, 'main.jsbundle')) ? 'release-embedded' : 'debug-metro',
  };
}

export function findAppBundle(root, depth = 4) {
  if (depth < 0 || !fs.existsSync(root)) return null;
  if (root.endsWith('.app') && fs.existsSync(path.join(root, 'Info.plist'))) return root;
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = findAppBundle(path.join(root, entry.name), depth - 1);
    if (found) return found;
  }
  return null;
}
