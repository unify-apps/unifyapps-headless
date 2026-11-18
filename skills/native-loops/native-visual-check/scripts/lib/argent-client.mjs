// The argent calls measure.mjs makes, behind one client: `argent run <tool>` through the device
// block's helper (or the local fallback), screenshots straight to disk, and a scripted runner for
// tests (--runner or LOOPS_FAKE_ARGENT: a module exporting runArgent and, optionally, screenshot)
// that answers the same calls without a simulator.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

function extractJsonFallback(text) {
  const source = String(text ?? '');
  for (let index = 0; index < source.length; index += 1) {
    if ((source[index] === '{' || source[index] === '[') && (index === 0 || source[index - 1] === '\n')) {
      try { return JSON.parse(source.slice(index).trim()); } catch { /* a banner line, keep looking */ }
    }
  }
  return undefined;
}

// The device block owns the argent helper; without it this file carries the minimum.
export async function loadArgentLib(runnerPath = process.env.LOOPS_FAKE_ARGENT || null) {
  if (runnerPath) {
    const lib = await import(pathToFileURL(path.resolve(runnerPath)).href);
    if (typeof lib.runArgent !== 'function') throw Object.assign(new Error(`runner ${runnerPath} does not export runArgent`), { exitCode: 2 });
    return { ...lib, fake: true };
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const sibling = path.resolve(here, '../../../native-device-pool/scripts/lib/argent.mjs');
  if (fs.existsSync(sibling)) {
    try { const lib = await import(pathToFileURL(sibling).href); if (typeof lib.runArgent === 'function') return lib; } catch { /* fall through to the local copy */ }
  }
  return {
    extractJson: extractJsonFallback,
    runArgent(tool, args = {}, { timeoutMs = 120000, bin = process.env.ARGENT_BIN || 'argent' } = {}) {
      const result = spawnSync(bin, ['run', tool, '--args', JSON.stringify(args), '--json'], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
      if (result.error) return { ok: false, data: null, error: result.error.code === 'ENOENT' ? 'argent is not on PATH' : result.error.message };
      const data = extractJsonFallback(result.stdout);
      if (result.status !== 0) return { ok: false, data: data ?? null, error: (result.stderr ?? '').trim() || `argent run ${tool} exited ${result.status}` };
      return data === undefined ? { ok: false, data: null, error: `argent run ${tool} printed no JSON` } : { ok: true, data, error: null };
    },
  };
}

export function makeClient(lib, passDir) {
  const bin = process.env.ARGENT_BIN || 'argent';
  const log = (line) => fs.appendFileSync(path.join(passDir, 'measure.log'), `${new Date().toISOString()} ${line}\n`);
  return {
    log,
    call(tool, args, { timeoutMs = 120000 } = {}) {
      const result = lib.runArgent(tool, args, { timeoutMs, bin });
      log(`${tool} ${JSON.stringify(args).slice(0, 160)} → ${result.ok ? `ok${result.data?.status ? ` (${result.data.status})` : ''}` : `FAIL ${result.error}`}`);
      return result;
    },
    screenshot(udid, file) {
      let ok;
      if (lib.fake) ok = typeof lib.screenshot === 'function' ? Boolean(lib.screenshot(udid, file)) : false;
      else {
        const result = spawnSync(bin, ['run', 'screenshot', '--args', JSON.stringify({ udid, scale: 1.0, includeImageInContext: false }), '--json', '--out', file], { encoding: 'utf8', timeout: 120000, maxBuffer: 64 << 20 });
        ok = result.status === 0 && fs.existsSync(file);
        if (!ok) log(`screenshot stderr: ${(result.stderr || result.stdout || '').trim().slice(0, 200)}`);
      }
      log(`screenshot → ${ok ? file : 'FAIL'}`);
      return ok;
    },
    sleep(ms) { if (!lib.fake) spawnSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`]); },
    serverRestart() { spawnSync(bin, ['server', 'stop'], { encoding: 'utf8' }); const started = spawnSync(bin, ['server', 'start', '--detach'], { encoding: 'utf8' }); log(`argent server restart → exit ${started.status}`); },
  };
}

export function idle(client, udid) {
  return client.call('await-screen-idle', { udid, minStableMs: 400, timeoutMs: 20000 }, { timeoutMs: 40000 });
}

/** native-describe-screen with each recovery used once: restart-app, server restart, bounded waits. */
export function describeWithRecovery(client, ctx) {
  const used = ctx.recoveries;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = client.call('native-describe-screen', { udid: ctx.udid, bundleId: ctx.bundleId }, { timeoutMs: 90000 });
    if (!result.ok) throw Object.assign(new Error(`native-describe-screen failed: ${result.error}`), { exitCode: 5 });
    const status = result.data?.status ?? 'ok';
    if (status === 'ok') return result.data;
    if (status === 'restart_required' && !used.restart) { used.restart = true; client.call('restart-app', { udid: ctx.udid, bundleId: ctx.bundleId }); idle(client, ctx.udid); continue; }
    if (status === 'service_stale' && !used.server) { used.server = true; client.serverRestart(); client.sleep(3000); continue; }
    if (status === 'connect_pending' && (used.pending ?? 0) < 5) { used.pending = (used.pending ?? 0) + 1; client.sleep(2000); continue; }
    throw Object.assign(new Error(`native devtools unavailable: ${status}: ${result.data?.message ?? ''}`), { exitCode: 5 });
  }
  throw Object.assign(new Error('native-describe-screen never answered ok'), { exitCode: 5 });
}

/** The describe tool's {description, source}; null when it fails, the native list then stands alone. */
export function readAx(client, ctx) {
  const result = client.call('describe', { udid: ctx.udid }, { timeoutMs: 60000 });
  return result.ok && typeof result.data?.description === 'string' ? result.data : null;
}
