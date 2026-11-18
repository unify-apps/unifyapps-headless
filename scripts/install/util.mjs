import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** The first executable named `name` on PATH, then in `extraDirs`, or null. */
export function which(name, extraDirs = []) {
  const dirs = [...String(process.env.PATH ?? '').split(path.delimiter), ...extraDirs].filter(Boolean);
  for (const dir of dirs) {
    const file = path.join(dir, name);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      if (fs.statSync(file).isFile()) return file;
    } catch { /* not here */ }
  }
  return null;
}

/** Runs a command and returns its stdout; throws with its stderr on failure. */
export function run(file, args, { cwd, input } = {}) {
  try {
    return execFileSync(file, args, { cwd, input, encoding: 'utf8', stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], timeout: 300_000 });
  } catch (error) {
    const detail = String(error?.stderr || error?.stdout || error?.message || error).trim().split('\n').slice(-5).join('\n');
    throw new Error(`${path.basename(file)} ${args.join(' ')} failed: ${detail}`);
  }
}

/** The first line `<file> --version` prints, or null when the file does not run. */
export function versionOf(file) {
  try { return run(file, ['--version']).trim().split('\n')[0] || null; } catch { return null; }
}

/** Writes through a temp file renamed into place, so a reader never sees half a file. */
export function writeFileAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, text);
  fs.renameSync(temp, file);
}

export const home = () => os.homedir();
