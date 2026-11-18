// Calls into the block scripts this CLI wraps (native-device-pool's device-pool) and into
// UnifyApps Headless's own CLI. Tests swap them: LOOPS_DEVICE_POOL=<script.mjs>, LOOPS_UA_CLI=<script.mjs>
// (each run with this node).
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { missing } from './output.mjs';
import { BLOCKS, UA } from './paths.mjs';

function parseJsonOut(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // a status line after the JSON
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** device-pool <args> --json with LOOPS_HOME set. { status, json, stdout, stderr }. */
export function devicePool(args, { home, json = true, session, timeout = 30 * 60_000, showProgress = false } = {}) {
  const script = process.env.LOOPS_DEVICE_POOL || BLOCKS.devicePool;
  if (!fs.existsSync(script)) throw missing(`device-pool is not at ${script} (the native-device-pool skill is missing from this plugin)`);
  const full = [...args, ...(session ? ['--session', session] : []), ...(json ? ['--json'] : [])];
  const result = spawnSync(process.execPath, [script, ...full], {
    encoding: 'utf8', timeout, maxBuffer: 64 << 20,
    env: { ...process.env, ...(home ? { LOOPS_HOME: home } : {}) },
    stdio: ['ignore', 'pipe', showProgress ? 'inherit' : 'pipe'],
  });
  return { status: result.status ?? 1, json: json ? parseJsonOut(result.stdout) : null, stdout: result.stdout ?? '', stderr: result.stderr ?? (result.error?.message ?? ''), args: full };
}

/** One error line out of a failed block call. */
export function blockError(result) {
  const data = result.json;
  return data?.error?.message ?? data?.message ?? (String(result.stderr || result.stdout).trim().split('\n').filter(Boolean).at(-1) ?? `exit ${result.status}`);
}

/** UnifyApps Headless's CLI: `bash run-node.sh ua.mjs <args> --json` in the solution folder. */
export function ua(args, { cwd, session, timeout = 120_000 } = {}) {
  const override = process.env.LOOPS_UA_CLI;
  const full = [...args, ...(session ? ['--session', session] : []), '--json'];
  let command;
  let argv;
  if (override) {
    command = process.execPath;
    argv = [override, ...full];
  } else {
    if (!fs.existsSync(UA.cli)) throw missing(`UnifyApps Headless's CLI is not at ${UA.cli}`);
    command = 'bash';
    argv = [UA.runNode, UA.cli, ...full];
  }
  const result = spawnSync(command, argv, { cwd, encoding: 'utf8', timeout, maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  const json = parseJsonOut(result.stdout);
  return { status: result.status ?? 1, json, message: String(result.stderr ?? '').trim().split('\n').filter(Boolean).at(-1) ?? '', stdout: result.stdout ?? '' };
}
