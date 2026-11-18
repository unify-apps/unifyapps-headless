// One probe per tool. Each returns a row in doctor.sh's shape (the source loops'
// setup table), plus `ok` and `group`:
//   { tool, group, present, ok, optional, version, detail, fixCommand, fixKind, data }
//   present  true installed · false not installed or not usable · null cannot be probed from a shell
//   ok       present and nothing wrong with it
//   fixKind  none | brew | npm | loops (this CLI) | long (a long download or build) | manual (the person's step)
// Probes never install, start or change anything.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { capacity } from './capacity.mjs';
import { clean, firstLine, portListening, runAsync, which } from './exec.mjs';
import { PLUGIN_ROOT, SCRIPTS_DIR, getPath, legacyHomePending, loopsHomePath, pluginVersion, readJson, wantedRuntime } from './paths.mjs';

export const PORTS = { 3001: 'argent tool-server', 8421: 'baguette farm' };
export const PREVIEW_BUNDLE_IDS = ['com.unifyapps.matrix', 'com.unifyapps.matrix.preview', 'com.unifyapps.matrix.internal', 'com.unifyapps.matrix.development'];
export const BAGUETTE_MIN = { xcode: 26, macos: 15 };

export const loopsCommand = (sub) => `node "${path.join(SCRIPTS_DIR, 'loops.mjs')}" ${sub}`;

function row(tool, group, fields) {
  const present = fields.present ?? null;
  return {
    tool,
    group,
    present,
    ok: fields.ok ?? present === true,
    optional: Boolean(fields.optional),
    version: fields.version ?? null,
    detail: fields.detail ?? '',
    fixCommand: fields.fixCommand ?? null,
    fixKind: fields.fixKind ?? 'none',
    ...(fields.data ? { data: fields.data } : {}),
  };
}

const major = (version) => {
  const match = /(\d+)/u.exec(String(version ?? ''));
  return match ? Number(match[1]) : null;
};

// --- toolchain ------------------------------------------------------------------------------

export async function probeNode() {
  const bin = which('node');
  if (!bin) {
    return row('node', 'toolchain', { present: false, detail: 'node is not on PATH; the loops need Node 22 or newer', fixCommand: nodeFix(), fixKind: fs.existsSync(path.join(os.homedir(), '.nvm', 'nvm.sh')) ? 'manual' : 'brew' });
  }
  const result = await runAsync('node', ['-v'], { timeout: 5000 });
  const version = clean(result.stdout).replace(/^v/u, '');
  let detail = `node ${version || '?'} at ${bin}`;
  const argent = which('argent');
  if (argent && path.dirname(argent) !== path.dirname(bin)) {
    detail += `; argent is installed under ${path.dirname(argent)}, not this node: switch nvm to that version or reinstall argent there (npm i -g @swmansion/argent@0.28.0)`;
  }
  const good = (major(version) ?? 0) >= 22;
  return row('node', 'toolchain', { present: true, ok: good, version, detail: good ? detail : `${detail}; Node 22 or newer is needed`, fixCommand: good ? null : nodeFix(), fixKind: good ? 'none' : 'manual' });
}

function nodeFix() {
  if (fs.existsSync(path.join(os.homedir(), '.nvm', 'nvm.sh'))) return 'nvm install 22 && nvm alias default 22';
  if (which('brew')) return 'brew install node@22 && brew link --overwrite --force node@22';
  return 'install Node 22 or newer from https://nodejs.org';
}

export async function probeXcode() {
  const selected = await runAsync('xcode-select', ['-p'], { timeout: 5000 });
  const dev = clean(selected.stdout);
  if (selected.status !== 0 || !dev) {
    return row('xcode', 'toolchain', { present: false, detail: 'no Xcode selected (xcode-select -p fails)', fixCommand: 'install Xcode 26 or newer from the App Store, then: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer', fixKind: 'manual' });
  }
  const result = await runAsync('xcodebuild', ['-version'], { timeout: 15_000 });
  const text = firstLine(result.stdout);
  const version = /Xcode\s+([\d.]+)/u.exec(text)?.[1] ?? null;
  if (result.status !== 0 || !version) {
    return row('xcode', 'toolchain', { present: false, detail: `xcodebuild -version failed at ${dev}: ${firstLine(result.stderr) || 'no answer'} (the license may need accepting: sudo xcodebuild -license accept)`, fixCommand: 'sudo xcodebuild -license accept', fixKind: 'manual', data: { dev } });
  }
  return row('xcode', 'toolchain', { present: true, version, detail: `Xcode ${version} at ${dev}`, data: { dev, major: major(version) } });
}

/** iOS runtimes from simctl: [{ identifier, version, isAvailable, deviceTypes[] }]. */
export function parseRuntimes(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return (parsed.runtimes ?? [])
    .filter((runtime) => (runtime.platform ?? (String(runtime.identifier).includes('iOS') ? 'iOS' : '')) === 'iOS')
    .map((runtime) => ({
      identifier: runtime.identifier,
      version: String(runtime.version ?? ''),
      isAvailable: runtime.isAvailable !== false,
      deviceTypes: (runtime.supportedDeviceTypes ?? []).map((type) => type.name),
    }));
}

export async function probeRuntime(config) {
  const wanted = wantedRuntime(config);
  const fix = `xcodebuild -downloadPlatform iOS -buildVersion ${wanted}`;
  const result = await runAsync('xcrun', ['simctl', 'list', 'runtimes', '-j'], { timeout: 20_000 });
  const runtimes = result.status === 0 ? parseRuntimes(result.stdout) : null;
  if (!runtimes) {
    return row('ios-runtime', 'toolchain', { present: false, detail: `xcrun simctl list runtimes failed: ${firstLine(result.stderr) || 'no answer'}`, fixCommand: 'install Xcode 26 or newer', fixKind: 'manual', data: { wanted } });
  }
  const available = runtimes.filter((runtime) => runtime.isAvailable);
  const versions = available.map((runtime) => runtime.version);
  const exact = available.find((runtime) => runtime.version === wanted);
  const ios18 = available.filter((runtime) => runtime.version.startsWith('18.'));
  const data = { wanted, available: versions, identifier: exact?.identifier ?? null, iPhone16Pro: Boolean(exact?.deviceTypes.includes('iPhone 16 Pro')) };
  if (exact) {
    const detail = `iOS ${wanted} runtime present (${exact.identifier}); iOS runtimes: ${versions.join(', ')}${data.iPhone16Pro ? '' : '; it offers no iPhone 16 Pro device type'}`;
    return row('ios-runtime', 'toolchain', { present: true, ok: data.iPhone16Pro, version: wanted, detail, data, fixCommand: data.iPhone16Pro ? null : 'install Xcode 16 or newer (the iPhone 16 Pro device type)', fixKind: data.iPhone16Pro ? 'none' : 'manual' });
  }
  const other = ios18.length ? `; other iOS 18 runtimes: ${ios18.map((runtime) => runtime.version).join(', ')} (set ios.runtime in LOOPS_HOME/config.json to use one)` : '';
  return row('ios-runtime', 'toolchain', { present: false, detail: `the iOS ${wanted} simulator runtime is missing (the pool pins it); iOS runtimes: ${versions.join(', ') || 'none'}${other}`, fixCommand: fix, fixKind: 'long', data });
}

export async function probeRosetta() {
  const arch = clean((await runAsync('uname', ['-m'], { timeout: 3000 })).stdout);
  if (arch && arch !== 'arm64') return row('rosetta', 'toolchain', { present: true, detail: 'Intel Mac: the x86_64 simulator build runs natively' });
  const result = await runAsync('arch', ['-x86_64', '/usr/bin/true'], { timeout: 5000 });
  if (result.status === 0) return row('rosetta', 'toolchain', { present: true, detail: "Rosetta present: the Preview app's x86_64 simulator build runs" });
  return row('rosetta', 'toolchain', { present: false, detail: "Rosetta is missing; the Preview app's simulator build is x86_64 and will not launch without it", fixCommand: 'softwareupdate --install-rosetta --agree-to-license', fixKind: 'manual' });
}

/** baguette's own facts; the verdict needs the Xcode row too (finishBaguette). */
export async function probeBaguetteRaw() {
  const bin = which('baguette');
  if (!bin) return { bin: null };
  const [version, list, macos] = await Promise.all([
    runAsync('baguette', ['--version'], { timeout: 5000 }),
    runAsync('baguette', ['list', '--json'], { timeout: 10_000 }),
    runAsync('sw_vers', ['-productVersion'], { timeout: 3000 }),
  ]);
  return { bin, version: firstLine(version.stdout) || null, listStatus: list.status, list: list.stdout, listError: firstLine(list.stderr), macos: firstLine(macos.stdout) || null };
}

/** baguette list --json: { available: [{ runtimeVersion, ... }], running: [...] } or JSON lines. */
export function baguetteSimulators(text) {
  const out = [];
  const take = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) value.forEach(take);
    else if (value.udid) out.push({ udid: value.udid, name: value.name ?? null, runtime: value.runtimeVersion ?? String(value.runtime ?? '').replace(/^iOS\s*/u, ''), state: value.state ?? null });
    else for (const key of ['available', 'running', 'simulators', 'devices']) take(value[key]);
  };
  try {
    take(JSON.parse(text));
  } catch {
    for (const line of String(text ?? '').split('\n')) {
      try {
        take(JSON.parse(line));
      } catch {
        // not JSON
      }
    }
  }
  const seen = new Set();
  return out.filter((sim) => (seen.has(sim.udid) ? false : seen.add(sim.udid)));
}

export function finishBaguette(raw, xcodeRow, config = {}) {
  if (!raw.bin) {
    return row('baguette', 'toolchain', { present: false, detail: 'baguette is not on PATH; it controls simulators headlessly and serves the farm view on :8421', fixCommand: 'brew install baguette', fixKind: which('brew') ? 'brew' : 'manual' });
  }
  const xcodeMajor = xcodeRow?.data?.major ?? null;
  const macosMajor = major(raw.macos);
  const needs = [];
  if (xcodeMajor != null && xcodeMajor < BAGUETTE_MIN.xcode) needs.push(`Xcode ${BAGUETTE_MIN.xcode}+ (found ${xcodeRow.version})`);
  if (macosMajor != null && macosMajor < BAGUETTE_MIN.macos) needs.push(`macOS ${BAGUETTE_MIN.macos}+ (found ${raw.macos})`);
  const sims = raw.listStatus === 0 ? baguetteSimulators(raw.list) : [];
  const ios18 = sims.filter((sim) => String(sim.runtime).startsWith('18.'));
  const input = getPath(config, 'baguette.input');
  const seesIos18 = ios18.length > 0;
  // Its input injection targets iOS 26; on the iOS 18 pool it is the viewer and the farm,
  // and argent drives input, unless config baguette.input=true says it was proven here.
  const mode = needs.length ? 'unusable' : seesIos18 ? (input === true ? 'input' : 'viewer') : 'viewer only';
  const base = `baguette ${raw.version ?? '?'} at ${raw.bin}`;
  if (needs.length) {
    return row('baguette', 'toolchain', { present: true, ok: false, version: raw.version, detail: `${base}; needs ${needs.join(' and ')}`, fixCommand: 'update Xcode / macOS', fixKind: 'manual', data: { mode, seesIos18, simulators: sims.length } });
  }
  let detail = `${base}; sees ${sims.length} simulators, ${ios18.length} on iOS 18`;
  if (raw.listStatus !== 0) detail += `; baguette list failed: ${raw.listError || 'no answer'}`;
  detail += mode === 'input' ? '; drives input (config baguette.input=true)'
    : mode === 'viewer' ? '; viewer and farm on the iOS 18 pool, argent drives input'
      : '; viewer only: it sees no iOS 18 simulator yet (pool up creates them), argent drives input';
  return row('baguette', 'toolchain', { present: true, ok: true, version: raw.version, detail, data: { mode, seesIos18, simulators: sims.length } });
}

export async function probeArgent({ cwd = process.cwd(), deep = false } = {}) {
  const bin = which('argent');
  if (!bin) return row('argent', 'toolchain', { present: false, detail: 'argent is not on PATH (install it under the node that is on PATH)', fixCommand: 'npm i -g @swmansion/argent@0.28.0', fixKind: 'npm' });
  const version = firstLine((await runAsync('argent', ['--version'], { timeout: 5000 })).stdout) || null;
  let detail = `argent ${version ?? '?'} at ${bin}`;
  if (fs.existsSync(path.join(os.homedir(), '.argent', 'link.json'))) detail += '; linked to a remote argent server (~/.argent/link.json)';
  if (!deep) return row('argent', 'toolchain', { present: true, version, detail });
  let mcp = null;
  const project = readJson(path.join(cwd, '.mcp.json'));
  if (project?.mcpServers?.argent) mcp = 'project .mcp.json';
  else if (which('claude')) {
    const out = await runAsync('claude', ['mcp', 'get', 'argent'], { timeout: 8000 });
    const text = clean(out.stdout, 2000);
    if (out.status === 0 && text && !/^No MCP server/imu.test(text)) mcp = /Scope:\s*(.+)/u.exec(text)?.[1]?.trim() || 'registered';
  }
  if (mcp) return row('argent', 'toolchain', { present: true, version, detail: `${detail}; MCP registered (${mcp})` });
  return row('argent', 'toolchain', { present: true, ok: false, version, detail: `${detail}; the argent MCP server is not registered`, fixCommand: 'claude mcp add --scope user argent -- argent mcp', fixKind: 'npm' });
}

export function probeArgentSkills({ cwd = process.cwd() } = {}) {
  const roots = [path.join(cwd, '.agents', 'skills'), path.join(cwd, '.claude', 'skills'), path.join(os.homedir(), '.claude', 'skills')];
  let count = 0;
  const where = [];
  for (const root of roots) {
    let names = [];
    try {
      names = fs.readdirSync(root).filter((name) => name.startsWith('argent-') && fs.existsSync(path.join(root, name, 'SKILL.md')));
    } catch {
      // none here
    }
    if (names.length) where.push(root);
    count += names.length;
  }
  if (count) return row('argent-skills', 'doctor', { present: true, detail: `${count} argent skills under ${where.join(', ')}` });
  return row('argent-skills', 'doctor', { present: false, optional: true, detail: 'no argent-* skill in .agents/skills, .claude/skills or ~/.claude/skills; argent init -y installs them (it also rewrites .mcp.json in the folder it runs in)', fixCommand: 'argent init -y', fixKind: 'manual' });
}

/** lsof holders of a listening TCP port: [{ pid, command }]. */
export async function portHolders(port) {
  const result = await runAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'], { timeout: 5000 });
  const holders = [];
  let current = null;
  for (const line of String(result.stdout).split('\n')) {
    if (line.startsWith('p')) {
      current = { pid: Number(line.slice(1)), command: null };
      holders.push(current);
    } else if (line.startsWith('c') && current) current.command = clean(line.slice(1), 80);
  }
  return holders;
}

export async function probeArgentServer() {
  if (!which('argent')) return row('argent-server', 'doctor', { present: null, optional: true, detail: 'argent is not installed (see the argent row)' });
  const status = await runAsync('argent', ['server', 'status', '--json'], { timeout: 5000 });
  let state = null;
  try {
    const text = String(status.stdout);
    state = JSON.parse(text.slice(text.indexOf('{')));
  } catch {
    state = null;
  }
  if (state?.running && state.healthy !== false) return row('argent-server', 'doctor', { present: true, optional: true, detail: `argent tool-server healthy on port ${state.port}` });
  const holder = (await portHolders(3001))[0];
  if (holder) {
    return row('argent-server', 'doctor', { present: false, optional: true, detail: `argent's tool-server is not running and its default port 3001 is held by "${holder.command}" (pid ${holder.pid}); start argent on another port`, fixCommand: 'argent server start --detach --port 0', fixKind: 'manual' });
  }
  return row('argent-server', 'doctor', { present: true, optional: true, detail: "argent's tool-server is not running; it starts on first use on port 3001, which is free" });
}

// --- live: ports and the file table ---------------------------------------------------------

/** Quick: which of the loop ports accept a connection. Doctor: who holds them. */
export async function probePorts({ deep = false } = {}) {
  const entries = await Promise.all(Object.keys(PORTS).map(async (port) => {
    const listening = await portListening(Number(port));
    const holders = deep && listening ? await portHolders(port) : [];
    return [port, { listening, role: PORTS[port], holder: holders[0] ?? null }];
  }));
  const ports = Object.fromEntries(entries);
  const detail = entries.map(([port, info]) => `${port} ${info.listening ? `in use${info.holder ? ` by ${info.holder.command} (pid ${info.holder.pid})` : ''}` : 'free'}`).join('; ');
  return row('ports', 'live', { present: true, optional: true, detail, data: { ports } });
}

export async function probeFileTable({ deep = false } = {}) {
  const result = await runAsync('sysctl', ['-n', 'kern.num_files', 'kern.maxfiles'], { timeout: 3000 });
  const [used, max] = String(result.stdout).trim().split(/\s+/u).map(Number);
  if (!Number.isFinite(used) || !Number.isFinite(max) || max <= 0) {
    return row('file-table', 'live', { present: null, optional: true, detail: 'kern.num_files is not readable here (macOS only)' });
  }
  const pct = Math.floor((used * 100) / max);
  let detail = `kern.num_files ${used} of ${max} (${pct}%)`;
  let watchers = [];
  if (deep) {
    const ps = await runAsync('ps', ['-axo', 'pid=,command='], { timeout: 5000 });
    watchers = String(ps.stdout).split('\n').filter((line) => /(^|[/ ])(bun|node|deno)( [^ ]+)* --watch( |$)/u.test(line)).map((line) => Number(line.trim().split(/\s+/u)[0])).filter(Number.isFinite);
    if (watchers.length) detail += `; processes under --watch: pid ${watchers.join(' ')} (each can hold tens of thousands of descriptors; run local servers without --watch)`;
  }
  const full = pct >= 80;
  return row('file-table', 'live', {
    present: !full, ok: !full, optional: true,
    detail: full ? `${detail}; above 80%, file watchers and MCP calls start failing` : detail,
    fixCommand: full ? 'stop the --watch processes (kill <pid>) and start those servers again without --watch' : null,
    fixKind: full ? 'manual' : 'none',
    data: { used, max, pct, watchers },
  });
}

// --- pool, preview app -----------------------------------------------------------------------

export function readPool(home) {
  const pool = readJson(path.join(home, 'pool.json'));
  return pool && Array.isArray(pool.devices) ? pool : null;
}

/** simctl list devices -j → Map udid → { state, name, runtime }. */
export function parseDevices(text) {
  const map = new Map();
  try {
    const parsed = JSON.parse(text);
    for (const [runtime, list] of Object.entries(parsed.devices ?? {})) {
      for (const device of list ?? []) map.set(device.udid, { state: device.state, name: device.name, runtime, isAvailable: device.isAvailable !== false });
    }
  } catch {
    return null;
  }
  return map;
}

export async function probePool({ home }) {
  const pool = readPool(home);
  const suggestion = loopsCommand('pool up');
  if (!pool || !pool.devices.length) {
    return row('sim-pool', 'pool', { present: false, detail: 'no simulator pool yet', fixCommand: suggestion, fixKind: 'loops', data: { devices: 0, ready: 0, booted: 0 } });
  }
  const result = await runAsync('xcrun', ['simctl', 'list', 'devices', '-j'], { timeout: 20_000 });
  const sims = parseDevices(result.stdout);
  const devices = pool.devices.map((device) => {
    const sim = sims?.get(device.udid);
    return { name: device.name, udid: device.udid, state: sim ? sim.state : sims ? 'missing' : 'unknown', appInstalled: device.appInstalled !== false, slim: device.slim?.state ?? null };
  });
  const ready = devices.filter((device) => device.state !== 'missing' && device.appInstalled).length;
  const booted = devices.filter((device) => device.state === 'Booted').length;
  const missingCount = devices.filter((device) => device.state === 'missing').length;
  const runtime = String(pool.runtime ?? '').replace(/^com\.apple\.CoreSimulator\.SimRuntime\./u, '');
  let detail = `${devices.length} pool simulators (${runtime || 'runtime ?'}): ${ready} ready, ${booted} booted`;
  if (missingCount) detail += `, ${missingCount} missing (pool up recreates them)`;
  // launchd's answer after each simulator's last boot; null when slimming is off or never checked
  const notSlim = devices.filter((device) => device.state !== 'missing' && device.slim && device.slim !== 'slim').length;
  if (notSlim) detail += `, ${notSlim} not slim (device-pool pool boot restarts them slim)`;
  if (!sims) detail += '; simctl gave no device list';
  return row('sim-pool', 'pool', {
    present: true, ok: ready > 0 && ready === devices.length,
    detail, fixCommand: ready === devices.length ? null : suggestion, fixKind: ready === devices.length ? 'none' : 'loops',
    data: { devices: devices.length, ready, booted, missing: missingCount, notSlim, runtime: pool.runtime ?? null, list: devices },
  });
}

export async function probePreview({ home, config }) {
  const pool = readPool(home);
  const app = pool?.app ?? null;
  const fix = loopsCommand('preview install --app <the Preview app>');
  if (!pool || !pool.devices.length) {
    const source = getPath(config, 'previewApp.path') || getPath(config, 'previewApp.url') || null;
    return row('preview-app', 'preview', { present: false, detail: `no pool yet: pool up installs the Preview app${source ? ` from ${source}` : ''}`, fixCommand: loopsCommand('pool up'), fixKind: 'loops' });
  }
  const installed = pool.devices.filter((device) => device.appInstalled !== false).length;
  if (!app || !installed) return row('preview-app', 'preview', { present: false, detail: 'the pool has no Preview app installed', fixCommand: fix, fixKind: 'loops' });
  let version = app.version ?? null;
  let checked = 'pool.json';
  // Prove it on a booted device when there is one: the app the simulator really holds.
  const sims = parseDevices((await runAsync('xcrun', ['simctl', 'list', 'devices', '-j'], { timeout: 20_000 })).stdout);
  const booted = pool.devices.find((device) => sims?.get(device.udid)?.state === 'Booted');
  if (booted && app.bundleId) {
    const container = await runAsync('xcrun', ['simctl', 'get_app_container', booted.udid, app.bundleId, 'app'], { timeout: 10_000 });
    const appPath = firstLine(container.stdout);
    if (container.status !== 0 || !appPath) {
      return row('preview-app', 'preview', { present: false, detail: `${app.bundleId} is not installed on ${booted.name} although pool.json says so`, fixCommand: fix, fixKind: 'loops' });
    }
    const plist = await runAsync('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(appPath, 'Info.plist')], { timeout: 5000 });
    if (plist.status === 0 && firstLine(plist.stdout)) {
      version = firstLine(plist.stdout);
      checked = booted.name;
    }
  }
  const detail = `${app.bundleId ?? 'Preview app'} ${version ?? '?'} (${app.kind ?? 'kind ?'}) on ${installed} of ${pool.devices.length} simulators; checked on ${checked}`;
  const all = installed === pool.devices.length;
  return row('preview-app', 'preview', { present: true, ok: all, version, detail, fixCommand: all ? null : fix, fixKind: all ? 'none' : 'loops', data: { bundleId: app.bundleId ?? null, kind: app.kind ?? null, installed } });
}

// --- doctor-only rows -----------------------------------------------------------------------

export async function probeTool(name, why, args = ['--version'], { optional = true } = {}) {
  if (!which(name)) return row(name, 'doctor', { present: false, optional, detail: `${name} is not on PATH; ${why}`, fixCommand: `brew install ${name}`, fixKind: 'brew' });
  const result = await runAsync(name, args, { timeout: 5000 });
  const line = firstLine(result.stdout || result.stderr);
  const version = /\d+(?:\.\d+)+/u.exec(line)?.[0] ?? (line || null);
  return row(name, 'doctor', { present: true, optional, version, detail: `${name} at ${which(name)}; ${why}` });
}

export function probeUa() {
  const version = pluginVersion();
  if (!version) return row('UnifyApps Headless', 'doctor', { present: false, detail: `no .claude-plugin/plugin.json under ${PLUGIN_ROOT}`, fixCommand: 'run the UnifyApps Headless installer again', fixKind: 'manual' });
  let local = version.endsWith('-local');
  try {
    local ||= fs.readFileSync(path.join(PLUGIN_ROOT, 'scripts', 'mcp-bridge.mjs'), 'utf8').includes('127.0.0.1');
  } catch {
    // not a full plugin copy
  }
  return row('UnifyApps Headless', 'doctor', { present: true, version, detail: `UnifyApps Headless ${version} at ${PLUGIN_ROOT}${local ? '; LOCAL build (tenant calls go to 127.0.0.1; a plugin update replaces it)' : ''}` });
}

// The device loops shipped before as their own repo, linked into
// ~/.claude/skills (native-app-*, native-create-page, …) or installed as the
// `loops` plugin. Both now duplicate the UnifyApps Headless loops, the skills they use and their blocks.
const LEGACY_SKILL = /^native-(app-|create-page$|add-feature$|fix-bug$|verify-worker$|setup-no-code-solution$|orchestrate$|audit$|fix-page$|test-and-fix$|platform-fix$|dry-run$|report-retake$|automation-change$)/u;

export function probeLegacyLoops({ home = os.homedir(), env = process.env } = {}) {
  const config = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  let links = [];
  try { links = fs.readdirSync(path.join(config, 'skills')).filter((name) => LEGACY_SKILL.test(name)); } catch { /* no skills folder */ }
  let plugin = false;
  try { plugin = /"loops@/u.test(fs.readFileSync(path.join(config, 'plugins', 'installed_plugins.json'), 'utf8')); } catch { /* no plugins file */ }
  if (!links.length && !plugin) return row('legacy-loops', 'doctor', { present: false, ok: true, optional: true, detail: 'no copy of the old native-agentic-loops skills' });
  const parts = [];
  if (links.length) parts.push(`${links.length} old skill link(s) in ${path.join(config, 'skills')} (${links.slice(0, 3).join(', ')}${links.length > 3 ? ', …' : ''})`);
  if (plugin) parts.push('the old `loops` plugin is installed');
  return row('legacy-loops', 'doctor', {
    present: true, ok: false, optional: true,
    detail: `${parts.join('; ')}: they duplicate the UnifyApps Headless loops, their skills and their blocks, so a session sees two of each; remove them`,
    fixCommand: links.length ? `rm ${links.map((name) => `"${path.join(config, 'skills', name)}"`).join(' ')}` : 'claude plugin uninstall loops',
    fixKind: 'manual',
  });
}

export function probeFigma() {
  return row('figma-mcp', 'doctor', { present: null, optional: true, detail: 'cannot be probed from a shell: call the Figma MCP whoami tool; when it is missing or answers with an auth error, sign in to Figma in the connectors settings' });
}

export function probeCapacity(config) {
  const result = capacity({ config });
  const { ramGb, perfCores, source } = result.machine;
  const detail = `${ramGb ?? '?'} GB RAM, ${perfCores ?? '?'} performance cores (${source}) → pool ${result.pool}${result.overridden.pool ? ' (config)' : ''}, agents ${result.agents}${result.overridden.agents ? ' (config)' : ''}`;
  return row('capacity', 'toolchain', { present: true, optional: true, detail, data: result });
}

export function probeLoopsHome() {
  const home = loopsHomePath();
  if (legacyHomePending()) {
    return row('loops-home', 'doctor', { present: true, optional: true, detail: `~/.agentic-loops waits to move to ${home}; the next pool or setup command moves it once` });
  }
  return row('loops-home', 'doctor', { present: true, optional: true, detail: `${home}${fs.existsSync(home) ? '' : ' (not created yet)'}` });
}

export function preferredRuntimeIdentifier(runtimeRow) {
  return runtimeRow?.data?.identifier ?? null;
}
