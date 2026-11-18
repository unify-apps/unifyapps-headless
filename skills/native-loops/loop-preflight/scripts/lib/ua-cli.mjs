// UnifyApps Headless's own CLI, run from the plugin these scripts ship in. The loops are part of UnifyApps Headless, so
// there is no plugin to find and no version to compare: the CLI next to this file is the one.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** scripts/lib → scripts → loop-preflight → skills → the plugin root. */
export const OWN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

const hasCli = (dir) => Boolean(dir) && fs.existsSync(path.join(dir, 'scripts', 'ua.mjs'));

/** The plugin root: an explicit folder (tests), else this plugin, else CLAUDE_PLUGIN_ROOT; null when none has the CLI. */
export function pluginRoot(explicit = null) {
  if (explicit) return hasCli(explicit) ? path.resolve(explicit) : null;
  if (hasCli(OWN_ROOT)) return OWN_ROOT;
  return hasCli(process.env.CLAUDE_PLUGIN_ROOT) ? path.resolve(process.env.CLAUDE_PLUGIN_ROOT) : null;
}

export function readVersion(root) {
  return String(JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version ?? '');
}

/** A local build (`-local` version, or a bridge pointed at a local tools server). */
export function isLocalBuild(root, version) {
  if (/-local$/u.test(version ?? '')) return true;
  try {
    return fs.readFileSync(path.join(root, 'scripts', 'mcp-bridge.mjs'), 'utf8').includes('127.0.0.1');
  } catch {
    return false;
  }
}

/** How to start the CLI: $UA_CLI_OVERRIDE (a fake for tests), else run-node.sh + ua.mjs, else node. */
export function uaInvocation(root) {
  const override = process.env.UA_CLI_OVERRIDE;
  if (override) {
    return /\.(?:mjs|cjs|js)$/u.test(override) ? { file: process.execPath, args: [override] } : { file: 'bash', args: [override] };
  }
  if (!root) return null;
  const runNode = path.join(root, 'scripts', 'run-node.sh');
  const cli = path.join(root, 'scripts', 'ua.mjs');
  return fs.existsSync(runNode) ? { file: 'bash', args: [runNode, cli] } : { file: process.execPath, args: [cli] };
}

export function parseJsonOutput(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { /* the payload may share stdout with a status line */ }
  const line = trimmed.split('\n').find((candidate) => candidate.startsWith('{') || candidate.startsWith('['));
  if (!line) return null;
  try { return JSON.parse(line); } catch { return null; }
}

/** Runs one UnifyApps Headless command and parses its --json payload. Never throws for a failed command. */
export async function runUa(root, args, { cwd, timeoutMs = 60000 } = {}) {
  const invocation = uaInvocation(root);
  if (!invocation) return { status: null, stdout: '', stderr: '', json: null, error: 'UA_MISSING' };
  try {
    const { stdout, stderr } = await execFileAsync(invocation.file, [...invocation.args, ...args],
      { cwd, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });
    return { status: 0, stdout, stderr, json: parseJsonOutput(stdout), error: null };
  } catch (error) {
    const stdout = error.stdout ?? '', stderr = error.stderr ?? '';
    let failure = null;
    if (error.code === 'ENOENT') failure = 'UA_MISSING';
    else if (error.killed || error.signal === 'SIGTERM') failure = 'TIMEOUT';
    return { status: typeof error.code === 'number' ? error.code : null, stdout, stderr, json: parseJsonOutput(stdout), error: failure };
  }
}
