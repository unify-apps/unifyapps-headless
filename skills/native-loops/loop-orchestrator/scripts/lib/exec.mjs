// Every outside command, port, URL and clock read goes through here, so tests can
// swap the machine for a fake:
//
//   LOOPS_FAKE_EXEC=<file.json>   commands answer from the file, never from the machine:
//     { "commands": { "xcodebuild -version": { "stdout": "Xcode 26.0\n", "status": 0 },
//                     "baguette *": { "stdout": "0.2.4" } },          // "<cmd> *" matches any args
//       "which":    { "baguette": "/opt/homebrew/bin/baguette" },    // else: any command key starting with it
//       "ports":    { "8081": true },
//       "http":     { "http://localhost:8081/status": { "status": 200, "text": "packager-status:running" } },
//       "mtimes":   { "/Applications/Xcode.app": 1700000000000 } }
//     A command not in the file answers status 127 (not installed).
//   LOOPS_FAKE_EXEC_LOG=<file>    one line per command run (fake or real), for tests.
//   LOOPS_NOW=<ms|ISO>            the clock.
//   LOOPS_XCODE_APP=<path>        the Xcode bundle whose mtime invalidates the health cache.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';

let fakeCache;
function fake() {
  const file = process.env.LOOPS_FAKE_EXEC;
  if (!file) return null;
  if (fakeCache && fakeCache.file === file) return fakeCache.data;
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    data = {};
  }
  fakeCache = { file, data };
  return data;
}

function logCall(cmd, args) {
  const file = process.env.LOOPS_FAKE_EXEC_LOG;
  if (!file) return;
  try {
    fs.appendFileSync(file, `${[cmd, ...args].join(' ')}\n`);
  } catch {
    // a test log is best effort
  }
}

function fakeAnswer(data, cmd, args) {
  const commands = data.commands ?? {};
  const key = [cmd, ...args].join(' ');
  const hit = Object.hasOwn(commands, key) ? commands[key] : commands[`${cmd} *`];
  if (hit === undefined || hit === null) return { status: 127, stdout: '', stderr: `${cmd}: command not found`, missing: true };
  if (typeof hit === 'string') return { status: 0, stdout: hit, stderr: '', missing: false };
  return { status: hit.status ?? 0, stdout: hit.stdout ?? '', stderr: hit.stderr ?? '', missing: false, timedOut: Boolean(hit.timedOut) };
}

/** Run a command and capture it. Never throws. */
export function run(cmd, args = [], { timeout = 20_000, cwd, env, input } = {}) {
  logCall(cmd, args);
  const data = fake();
  if (data) return fakeAnswer(data, cmd, args);
  const result = spawnSync(cmd, args, { encoding: 'utf8', timeout, cwd, env, input, maxBuffer: 64 << 20, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  if (result.error) {
    const missing = result.error.code === 'ENOENT';
    return { status: missing ? 127 : 1, stdout: result.stdout ?? '', stderr: result.error.message, missing, timedOut: result.error.code === 'ETIMEDOUT' };
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '', missing: false, timedOut: result.signal === 'SIGTERM' && result.status == null };
}

/** The same as run(), without blocking, so independent probes run side by side. */
export function runAsync(cmd, args = [], { timeout = 20_000, cwd, env } = {}) {
  logCall(cmd, args);
  const data = fake();
  if (data) return Promise.resolve(fakeAnswer(data, cmd, args));
  return new Promise((resolve) => {
    execFile(cmd, args, { encoding: 'utf8', timeout, cwd, env, maxBuffer: 64 << 20 }, (error, stdout, stderr) => {
      if (!error) return resolve({ status: 0, stdout, stderr, missing: false });
      const missing = error.code === 'ENOENT';
      resolve({ status: missing ? 127 : typeof error.code === 'number' ? error.code : 1, stdout: stdout ?? '', stderr: stderr || error.message, missing, timedOut: Boolean(error.killed) });
    });
  });
}

/** Run with the terminal attached (installs and builds show their own progress). */
export function runInherit(cmd, args = [], { cwd, env } = {}) {
  logCall(cmd, args);
  const data = fake();
  if (data) {
    const answer = fakeAnswer(data, cmd, args);
    if (answer.stdout) process.stderr.write(answer.stdout);
    return { status: answer.status, missing: answer.missing };
  }
  // stdout of the child goes to our stderr: our stdout stays one clean result.
  const result = spawnSync(cmd, args, { cwd, env, stdio: ['ignore', 2, 2] });
  if (result.error) return { status: result.error.code === 'ENOENT' ? 127 : 1, missing: result.error.code === 'ENOENT', error: result.error.message };
  return { status: result.status ?? 1, missing: false };
}

/** The path of a command on PATH, or null. */
export function which(cmd) {
  const data = fake();
  if (data) {
    if (data.which && Object.hasOwn(data.which, cmd)) return data.which[cmd] || null;
    const keys = Object.keys(data.commands ?? {});
    return keys.some((key) => key === cmd || key.startsWith(`${cmd} `)) ? `/fake/bin/${cmd}` : null;
  }
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const file = path.join(dir, cmd);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      if (fs.statSync(file).isFile()) return file;
    } catch {
      // next
    }
  }
  return null;
}

/** Whether something accepts TCP connections on 127.0.0.1:<port>. */
export function portListening(port, { host = '127.0.0.1', timeout = 300 } = {}) {
  const data = fake();
  if (data) return Promise.resolve(Boolean(data.ports?.[String(port)]));
  return new Promise((resolve) => {
    const socket = net.connect({ port: Number(port), host });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeout, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** GET a local URL: { status, text } or null when nothing answers. */
export async function httpText(url, { timeout = 800 } = {}) {
  const data = fake();
  if (data) {
    const hit = data.http?.[url];
    return hit ? { status: hit.status ?? 200, text: hit.text ?? '' } : null;
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    return { status: response.status, text: (await response.text()).slice(0, 2000) };
  } catch {
    return null;
  }
}

export function mtimeMs(file) {
  const data = fake();
  if (data && data.mtimes && Object.hasOwn(data.mtimes, file)) return data.mtimes[file];
  try {
    return Math.floor(fs.statSync(file).mtimeMs);
  } catch {
    return null;
  }
}

export function nowMs() {
  const value = process.env.LOOPS_NOW;
  if (value) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

export function xcodeApp() {
  return process.env.LOOPS_XCODE_APP || '/Applications/Xcode.app';
}

/** Command output is data: control characters and ANSI codes never reach JSON or a line. */
export function clean(text, max = 400) {
  return String(text ?? '')
    .replace(/\u001b\[[0-9;]*[A-Za-z]/gu, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .trim()
    .slice(0, max);
}

export function firstLine(text) {
  return clean(text).split('\n').find((line) => line.trim())?.trim() ?? '';
}
