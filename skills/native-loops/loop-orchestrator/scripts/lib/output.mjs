// Exit codes, errors, flag parsing and printing shared by every command.
import { parseArgs } from 'node:util';

export const EXIT = Object.freeze({
  OK: 0, // done; a check found nothing wrong
  FAIL: 1, // a check found something wrong, a validation failed, or a wrapped command failed
  USAGE: 2, // bad command, flag or value
  CONSENT: 3, // setup has installs to run and no --yes
  MISSING: 4, // a needed tool, block script, run folder or cache entry is not there
});

export class LoopsError extends Error {
  constructor(message, { exit = EXIT.FAIL, code = 'ERROR', data } = {}) {
    super(message);
    this.exit = exit;
    this.code = code;
    this.data = data;
  }
}

export const usage = (message) => new LoopsError(message, { exit: EXIT.USAGE, code: 'USAGE' });
export const missing = (message, data) => new LoopsError(message, { exit: EXIT.MISSING, code: 'MISSING', data });
export const failed = (message, data) => new LoopsError(message, { exit: EXIT.FAIL, code: 'FAILED', data });

// Every command takes these. --session is the calling session's id: the commands that pass it on
// (to UnifyApps Headless's CLI or device-pool) read it, and the rest accept it so one command line fits them all.
const COMMON = {
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  solution: { type: 'string' },
  session: { type: 'string' },
};

/** parseArgs with the common flags; an unknown flag is a usage error. */
export function parse(args, options = {}) {
  try {
    const { values, positionals } = parseArgs({ args, options: { ...COMMON, ...options }, allowPositionals: true, strict: true });
    return { values, positionals };
  } catch (error) {
    throw usage(error.message.replace(/\. To specify a positional.*$/su, '.'));
  }
}

export function intFlag(value, name, { min = 1, max = 10_000 } = {}) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw usage(`--${name} takes a whole number from ${min} to ${max}`);
  return number;
}

/** Print a result: JSON (data) with --json, else its text. */
export function emit(result, { json }) {
  if (json) process.stdout.write(`${JSON.stringify(result.data ?? {}, null, 2)}\n`);
  else if (result.text != null && result.text !== '') process.stdout.write(`${result.text}\n`);
}

export function plural(count, word, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}

export function duration(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** A plain text table; every cell is cleaned to one line. */
export function table(headers, rows) {
  const cells = [headers, ...rows].map((row) => row.map((cell) => String(cell ?? '').replace(/\s+/gu, ' ')));
  const widths = headers.map((_, index) => Math.min(60, Math.max(...cells.map((row) => row[index]?.length ?? 0))));
  return cells
    .map((row) => row.map((cell, index) => (cell.length > widths[index] ? `${cell.slice(0, widths[index] - 1)}…` : cell.padEnd(widths[index]))).join('  ').trimEnd())
    .join('\n');
}
