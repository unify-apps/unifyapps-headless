// Shared helpers for the native-design-spec scripts. No npm dependencies.
import { mkdirSync, renameSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Print a plain error line instead of a stack trace for the person running a script.
export function installErrorLines() {
  for (const event of ['uncaughtException', 'unhandledRejection']) {
    process.on(event, (error) => { console.error('FAIL', error?.message ?? error); process.exit(1); });
  }
}

// Parses --key value, --flag and repeated keys (collected into arrays when listed in `repeat`).
// Positional arguments land in `_`.
export function parseArgs(argv, { flags = [], repeat = [] } = {}) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '-h') { out.help = true; continue; }
    if (!arg.startsWith('--')) { out._.push(arg); continue; }
    const key = arg.slice(2);
    if (flags.includes(key)) { out[key] = true; continue; }
    const value = argv[++index];
    if (value === undefined) throw new Error(`--${key} needs a value (see --help)`);
    if (repeat.includes(key)) (out[key] ||= []).push(value);
    else out[key] = value;
  }
  return out;
}

export function need(args, ...keys) {
  const missing = keys.filter((key) => args[key] === undefined);
  if (missing.length) throw new Error('missing ' + missing.map((key) => '--' + key).join(', ') + ' (see --help)');
}

export function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
export function readJsonIfExists(file, fallback = null) { return existsSync(file) ? readJson(file) : fallback; }

// Writes through a temp file and a rename, so a reader never sees a half-written file.
export function writeFileAtomic(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}
export function writeJsonAtomic(file, value) { writeFileAtomic(file, JSON.stringify(value, null, 2) + '\n'); }

// "Account / Dashboard | Dark" -> "account-dashboard-dark"
export function slug(text, fallback = 'node') {
  const out = String(text ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return out || fallback;
}

export const num = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// "402/440" or "0.9136" -> a number.
export function parseRatio(text) {
  const match = /^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/.exec(String(text));
  if (match) return Number(match[1]) / Number(match[2]);
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--scale wants a ratio like 402/440, got "${text}"`);
  return value;
}

export const ok = (stage, detail = '') => console.log(`OK ${stage}${detail ? ' ' + detail : ''}`);
export const fail = (stage, detail = '') => { console.log(`FAIL ${stage}${detail ? ' ' + detail : ''}`); process.exitCode = 1; };

// A run board's count of Figma calls and when Figma last rate-limited them. A board written before the rename
// kept the same object under `budget`; it is read from there once and written back as `figmaCalls`.
export function figmaCallsOf(board) {
  return board?.figmaCalls ?? board?.budget ?? { calls: 0, rateLimitedAt: null };
}
