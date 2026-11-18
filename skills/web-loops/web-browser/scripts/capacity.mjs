#!/usr/bin/env node
// How many WEB test runners (one Chrome for Testing browser each) this laptop runs at once: about one
// per GB of free memory, capped. The cap is --cap, else `capacity.browsers` in LOOPS_HOME/config.json,
// else 6. Node 22, no dependencies.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';

export const DEFAULT_CAP = 6;
export const GB_PER_BROWSER = 1;

/** Pure: browsers for this much free memory. At least 1 when a whole GB is free, never above the cap. */
export function browsersFor({ freeGb, perGb = GB_PER_BROWSER, cap = DEFAULT_CAP }) {
  if (!Number.isFinite(freeGb) || freeGb <= 0) return 1;
  return Math.max(1, Math.min(cap, Math.floor(freeGb / perGb)));
}

/** Pure: free memory from `vm_stat` (macOS): free, inactive, speculative and purgeable pages. */
export function freeFromVmStat(text) {
  const size = Number((/page size of (\d+) bytes/u.exec(text) || [])[1]) || 4096;
  const pages = (label) => Number((new RegExp(`Pages ${label}:\\s+(\\d+)`, 'u').exec(text) || [])[1]) || 0;
  const bytes = (pages('free') + pages('inactive') + pages('speculative') + pages('purgeable')) * size;
  return bytes > 0 ? bytes : null;
}

/** Pure: MemAvailable from /proc/meminfo (Linux). */
export function freeFromMeminfo(text) {
  const kb = Number((/MemAvailable:\s+(\d+) kB/u.exec(text) || [])[1]);
  return kb > 0 ? kb * 1024 : null;
}

export function readFreeMemory() {
  if (process.platform === 'darwin') {
    const run = spawnSync('vm_stat', [], { encoding: 'utf8', timeout: 3000 });
    const bytes = run.status === 0 ? freeFromVmStat(run.stdout) : null;
    if (bytes) return { bytes, source: 'vm_stat (free + inactive + speculative + purgeable)' };
  }
  if (process.platform === 'linux') {
    try { const bytes = freeFromMeminfo(fs.readFileSync('/proc/meminfo', 'utf8')); if (bytes) return { bytes, source: '/proc/meminfo MemAvailable' }; } catch { /* fall through */ }
  }
  return { bytes: os.freemem(), source: 'os.freemem()' };
}

function configCap(env = process.env) {
  const home = env.LOOPS_HOME ? path.resolve(env.LOOPS_HOME) : path.join(env.UA_HOME || path.join(os.homedir(), '.unifyapps-solutions'), 'loops');
  try {
    const value = JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf8'))?.capacity?.browsers;
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch { return null; }
}

export function capacity({ cap = null, env = process.env } = {}) {
  const free = readFreeMemory();
  const freeGb = Math.round((free.bytes / 2 ** 30) * 10) / 10;
  const limit = cap ?? configCap(env) ?? DEFAULT_CAP;
  return { freeGb, browsers: browsersFor({ freeGb, cap: limit }), cap: limit, capFrom: cap ? 'flag' : configCap(env) ? 'LOOPS_HOME/config.json capacity.browsers' : 'default', source: free.source };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const { values } = parseArgs({ options: { cap: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) {
    console.log('Usage: node capacity.mjs [--cap n] [--json]\nBrowsers this laptop runs at once: about one per GB of free memory, at most the cap (--cap, else capacity.browsers in LOOPS_HOME/config.json, else 6).');
    process.exit(0);
  }
  const result = capacity({ cap: values.cap ? Number(values.cap) : null });
  console.log(values.json ? JSON.stringify(result) : `${result.browsers} browser(s): ${result.freeGb} GB free (${result.source}), cap ${result.cap} (${result.capFrom})`);
}
