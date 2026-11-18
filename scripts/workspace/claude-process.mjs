// Which Claude session a Claude Code process runs right now. Claude Code keeps
// an MCP server running across /clear and /resume with the session id it
// started with, so a bridge cannot tell from its own environment which session
// is calling it. The SessionStart hook can: it writes the session id under the
// pid of the Claude Code process that ran it, and a bridge, which Claude Code
// starts as its own child, reads it back by its parent pid.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { UA_HOME, atomicFile, sessionIdPattern } from '../lib/session-paths.mjs';

const folder = () => path.join(UA_HOME, 'session', 'claude-processes');
const validPid = pid => Number.isInteger(pid) && pid > 1;
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };

// A hook runs under a shell that Claude Code starts (`sh -c "bash run-node.sh ..."`),
// and a shell that runs one command may or may not exec it. So the hook's parent
// is either Claude Code itself or that shell, and then the shell's parent is.
export function parentOfShell(pid) {
  if (process.platform === 'win32') return null;
  try {
    const [ppid, ...name] = execFileSync('ps', ['-o', 'ppid=,comm=', '-p', String(pid)], { encoding: 'utf8', timeout: 1000 }).trim().split(/\s+/u);
    return /(?:^|\/)-?(?:ba|z|da|k)?sh$/u.test(name.join(' ')) ? Number(ppid) : null;
  } catch { return null; }
}

/** Called by the SessionStart hook: from now on this Claude Code process runs `sessionId`. */
export function recordClaudeProcess(sessionId, { parent = process.ppid, shellParent = parentOfShell } = {}) {
  if (!sessionIdPattern.test(sessionId ?? '')) return;
  const dir = folder();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const at = new Date().toISOString();
  for (const pid of new Set([parent, shellParent(parent)].filter(validPid))) atomicFile(path.join(dir, `${pid}.json`), JSON.stringify({ sessionId, at }) + '\n');
  // A pid is reused once its process ends, so a dead process's file goes.
  for (const name of fs.readdirSync(dir)) {
    const pid = Number(name.replace(/\.json$/u, ''));
    if (validPid(pid) && !alive(pid)) fs.rmSync(path.join(dir, name), { force: true });
  }
}

/** The session the Claude Code process `pid` (by default this process's parent) runs now, or null.
 * A record written before this process started is never used: it may be a dead
 * process's whose pid came back before a SessionStart pruned it, and a bridge
 * that started after its session's own hook already holds that id from Claude Code. */
export function claudeProcessSession(pid = process.ppid, { since = Date.now() - process.uptime() * 1000 } = {}) {
  if (!validPid(pid)) return null;
  try {
    const { sessionId, at } = JSON.parse(fs.readFileSync(path.join(folder(), `${pid}.json`), 'utf8'));
    return sessionIdPattern.test(sessionId ?? '') && Date.parse(at) >= since ? sessionId : null;
  } catch { return null; }
}
