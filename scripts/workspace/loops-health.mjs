// The loops health line for SessionStart. The loops cover MOBILE and WEB apps, so a folder gets one
// only when its app is known: a loops profile (WEB when its app is WEB, MOBILE otherwise) or, with
// no profile, a cached interface whose manifest type is MOBILE or WEB (MOBILE when the folder holds
// both). Every other UnifyApps Headless folder stays silent and pays only a directory read. A MOBILE line that
// names something missing points at native-setup; a WEB one says the fix or build loop sets it up
// on a yes (`loops setup --platform web --yes --only browser`).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const loopsCli = path.join(pluginRoot, 'skills', 'native-loops', 'loop-orchestrator', 'scripts', 'loops.mjs');
const MAX_INTERFACES = 50;
const TIMEOUT_MS = 2500;

// 'MOBILE', 'WEB', or null when the folder holds no app the loops can run.
export function loopsPlatform(home) {
  const profile = path.join(home, '.nebula', 'loops', 'profile.json');
  if (fs.existsSync(profile)) {
    try { return String(JSON.parse(fs.readFileSync(profile, 'utf8'))?.app?.type ?? '').trim().toUpperCase() === 'WEB' ? 'WEB' : 'MOBILE'; }
    catch { return 'MOBILE'; }
  }
  const dir = path.join(home, 'entities', 'e_interface');
  let names;
  try { names = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort().slice(0, MAX_INTERFACES); }
  catch { return null; }
  let web = false;
  for (const name of names) {
    try {
      const type = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))?.entity?.properties?.manifest?.type;
      if (type === 'MOBILE') return 'MOBILE';
      if (type === 'WEB') web = true;
    } catch { /* an unreadable page file is skipped */ }
  }
  return web ? 'WEB' : null;
}

export const hasMobileApp = (home) => loopsPlatform(home) === 'MOBILE';

// One line from `loops.mjs health --quick` (`--platform web` in a WEB folder), or null. Never
// throws and never waits longer than TIMEOUT_MS: a slow or failing check must not hold the session.
export function loopsHealthLine(home, { run = execFileSync, cli = loopsCli } = {}) {
  const platform = home ? loopsPlatform(home) : null;
  if (!platform || !fs.existsSync(cli)) return null;
  try {
    const args = platform === 'WEB' ? [cli, 'health', '--platform', 'web', '--quick'] : [cli, 'health', '--quick'];
    const out = run(process.execPath, args, { cwd: home, timeout: TIMEOUT_MS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const line = String(out).trim().split('\n')[0];
    return line ? line.slice(0, 300) : null;
  } catch { return null; }
}
