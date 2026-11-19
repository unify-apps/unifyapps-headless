#!/usr/bin/env node
/**
 * The one hook Codex runs, for every event the installer registers.
 *
 * Claude Code starts a different script per event (`hooks/hooks.json`). Codex
 * gets one entry point instead, because its hook config is written into the
 * person's own Codex home rather than shipped inside the plugin: one command to
 * register, one trust decision for the person to make, one file to remove when
 * the plugin goes.
 *
 * No hook logic lives here. Every event is translated by
 * `codex/host-events.mjs` into the shape Claude's payload has, handed to the
 * same functions `hooks.mjs`, `tool-guard.mjs` and `notify.mjs` already run on
 * Claude Code, and the answer is narrowed to what Codex accepts for that event.
 * One behaviour, two hosts.
 *
 * The events, and what each one is here for:
 *
 *   PreToolUse          the builder jail: a builder's writes stay in the working
 *                       folder, its Bash cannot reach a sign-in or plant code,
 *                       and nothing but the person's own yes opens a delete
 *   PostToolUse         re-renders the local solution cache after a CLI call
 *   SessionStart        solution sync, the session snapshot, and the recovery
 *                       line a resumed or compacted session needs
 *   PreCompact          writes the checkpoint before the context is dropped
 *   PermissionRequest   a desktop notification when the main session is waiting
 *                       on the person, so an unattended run is found again
 *   SubagentStop        records that a builder finished, which is the signal the
 *                       plan run loop waits for; on Claude Code that arrives as
 *                       an agent notification, which Codex has no equivalent of
 *
 * A hook never fails a session: every step is wrapped, and this exits 0 whatever
 * happened. A broken guard is the one exception, and it fails closed inside
 * `tool-guard.mjs` for a builder before it reaches anything here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { claudeEvents, codexOutput, isBuilder } from './codex/host-events.mjs';

const scriptsFolder = path.dirname(fileURLToPath(import.meta.url));
const MAX_INPUT = 1_048_576;

/** Reads the hook payload from stdin, or null when there is nothing readable. */
function readInput() {
  try {
    const text = fs.readFileSync(0, 'utf8');
    if (Buffer.byteLength(text) > MAX_INPUT) return null;
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

/** Merges several answers into one: the refusal wins, context lines join. */
function mergeOutputs(outputs) {
  const kept = outputs.filter(Boolean);
  if (!kept.length) return null;
  const deny = kept.find((output) => output.hookSpecificOutput?.permissionDecision === 'deny');
  if (deny) return deny;
  const context = kept.map((output) => output.hookSpecificOutput?.additionalContext).filter(Boolean);
  const messages = kept.map((output) => output.systemMessage).filter(Boolean);
  const merged = {};
  if (context.length) merged.hookSpecificOutput = { hookEventName: kept[0].hookSpecificOutput?.hookEventName, additionalContext: context.join('\n') };
  if (messages.length) merged.systemMessage = messages.join(' ');
  return Object.keys(merged).length ? merged : null;
}

/** The builder jail, plus the device pool's guard on its reserved simulators. */
async function preToolUse(events) {
  const { denyReason } = await import('./tool-guard.mjs');
  for (const event of events) {
    let reason = null;
    try { reason = denyReason(event); }
    catch { reason = isBuilder(event.agent_type) ? 'UnifyApps Headless could not check this builder call, so it is refused.' : null; }
    if (reason) {
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
    }
  }
  // The pool only ever answers about argent's own tools; everything else returns
  // nothing and loads nothing. Its "allow" answers are dropped by `codexOutput`,
  // which Codex requires: a PreToolUse hook there may refuse but never approve.
  const first = events[0];
  const tool = String(first?.tool_name ?? '');
  if (tool.startsWith('mcp__argent__') || (tool === 'Bash' && /argent/u.test(String(first?.tool_input?.command ?? '')))) {
    try {
      const { deviceHook } = await import('../skills/native-loops/native-device-pool/scripts/plugin-hook.mjs');
      const text = await deviceHook(tool === 'Bash' ? 'pretool-bash' : 'pre-tool', first);
      if (text) return JSON.parse(text);
    } catch { /* the pool guard is advice for the pool; it never blocks a session by failing */ }
  }
  return null;
}

/** Everything the plugin does when a session opens, as `hooks.mjs` does it on Claude Code. */
async function sessionStart(event) {
  const hooks = await import('./hooks.mjs');
  const outputs = [];
  try {
    const { recordClaudeProcess } = await import('./workspace/claude-process.mjs');
    recordClaudeProcess(event.session_id);
  } catch { /* the bridge falls back to the folder's newest session */ }
  try { outputs.push(hooks.handleHook(event)); } catch { /* the checkpoint is best effort */ }
  let lines = [];
  try { lines = await hooks.sessionSyncLines(event); }
  catch { lines = ['UnifyApps Headless could not start the session sync.']; }
  try {
    const { homeForCwd, canonicalCwd } = await import('./workspace/local.mjs');
    const { loopsHealthLine } = await import('./workspace/loops-health.mjs');
    const binding = homeForCwd(canonicalCwd(event.cwd), event.session_id);
    const line = binding ? loopsHealthLine(binding.home) : null;
    if (line) lines.push(line);
  } catch { /* the health line is advice only */ }
  if (lines.length) outputs.push({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.filter(Boolean).join('\n') } });
  return mergeOutputs(outputs);
}

/**
 * A builder finished.
 *
 * The plan run loop decides what to send next from a builder's report, and on
 * Claude Code it learns a builder is done from that agent's notification. Codex
 * has none, so the stop is written down where the session can read it — one
 * line per builder, in the session's own folder — and named in a system message
 * for the session that is waiting.
 */
async function subagentStop(event) {
  const name = String(event.agent_type ?? '').trim() || 'a builder';
  try {
    const { homeForCwd, canonicalCwd } = await import('./workspace/local.mjs');
    const binding = homeForCwd(canonicalCwd(event.cwd), event.session_id);
    if (binding?.sessionHome) {
      const line = JSON.stringify({
        at: new Date().toISOString(),
        agentName: name,
        agentId: event.agent_id ?? null,
        transcriptPath: event.agent_transcript_path ?? null,
        lastMessage: String(event.last_assistant_message ?? '').slice(0, 4000),
      });
      fs.mkdirSync(binding.sessionHome, { recursive: true });
      fs.appendFileSync(path.join(binding.sessionHome, 'subagent-stops.jsonl'), `${line}\n`);
    }
  } catch { /* the stop line is a convenience; the report command remains the record */ }
  return { systemMessage: `${name} finished. Record its report with the plan report command its message named, then run plan ready --mark again.` };
}

/** A desktop notification, through the same script Claude Code's Notification hook runs. */
function permissionRequest(event) {
  // A subagent waiting is never the person's cue, and only the main session can
  // answer. `notify.mjs` makes the same check; this skips starting it at all.
  if (event.agent_id || event.agent_type) return null;
  const payload = JSON.stringify({
    hook_event_name: 'Notification',
    notification_type: 'permission_prompt',
    message: `Codex is waiting for you${event.tool_name ? ` on ${event.tool_name}` : ''}`,
    cwd: event.cwd,
    session_id: event.session_id,
  });
  try {
    const child = spawn(process.execPath, [path.join(scriptsFolder, 'notify.mjs')], { detached: true, stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', () => { /* no notifier: silent */ });
    child.stdin.end(payload);
    child.unref();
  } catch { /* never the session's problem */ }
  return null;
}

export async function handle(input) {
  const events = claudeEvents(input);
  if (!events.length) return null;
  const event = events[0];
  const name = String(event.hook_event_name ?? '');
  if (name === 'PreToolUse') return codexOutput(name, await preToolUse(events));
  if (name === 'SessionStart') return codexOutput(name, await sessionStart(event));
  if (name === 'SubagentStop') return codexOutput(name, await subagentStop(event));
  if (name === 'PermissionRequest') return codexOutput(name, permissionRequest(event));
  if (name === 'PostToolUse' || name === 'PreCompact') {
    const hooks = await import('./hooks.mjs');
    try { hooks.recordApprovals(event); } catch { /* a missed yes only asks again */ }
    let output = null;
    try { output = hooks.handleHook(event); } catch { /* the checkpoint is best effort */ }
    return codexOutput(name, output);
  }
  return null;
}

async function main() {
  const exit0 = () => process.exit(0);
  process.on('uncaughtException', exit0);
  process.on('unhandledRejection', exit0);
  const input = readInput();
  if (!input) return;
  let output = null;
  try { output = await handle(input); }
  catch { output = null; }
  if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
