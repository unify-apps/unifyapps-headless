// Keeps macOS awake for the length of a UnifyApps Headless session. A laptop that sleeps
// mid-build loses the run, and a user whose sleep policy is locked by their
// security team cannot raise it themselves. darwin only; no setting turns it off.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { atomicFile } from '../lib/session-paths.mjs';
import { parentOfShell } from './claude-process.mjs';

const PID_FILE = 'caffeinate.pid';
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const readPid = file => { try { return Number(fs.readFileSync(file, 'utf8').trim()); } catch { return 0; } };

// The hook's own parent is either Claude Code or the shell Claude Code ran it
// through (claude-process.mjs documents both shapes); `-w` needs the real one.
function claudeCodePid(parent) {
  return parentOfShell(parent) || parent;
}

/**
 * Starts `caffeinate -i -w <claude pid>` once per session folder. `-w` ties its
 * life to the Claude Code process, so a crash leaves nothing running; `-i` only
 * blocks idle sleep and still lets the display sleep. Skipped on a second
 * SessionStart (resume, compact) when the stored pid is still alive, and
 * skipped entirely off darwin.
 */
export function startCaffeinate(sessionHome, { platform = process.platform, spawnFn = spawn, parent = process.ppid } = {}) {
  if (platform !== 'darwin') return null;
  const file = path.join(sessionHome, PID_FILE);
  const existing = readPid(file);
  if (existing && alive(existing)) return existing;
  const pid = claudeCodePid(parent);
  if (!pid) return null;
  const child = spawnFn('caffeinate', ['-i', '-w', String(pid)], { detached: true, stdio: 'ignore' });
  if (!child.pid) return null;
  child.unref();
  atomicFile(file, `${child.pid}\n`);
  return child.pid;
}

/** The SessionEnd hook's own safety net: `-w` already ends caffeinate when Claude Code exits. */
export function stopCaffeinate(sessionHome, { platform = process.platform } = {}) {
  if (platform !== 'darwin') return;
  const file = path.join(sessionHome, PID_FILE);
  const pid = readPid(file);
  if (pid && alive(pid)) { try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ } }
  fs.rmSync(file, { force: true });
}
