/**
 * Codex hook events, translated to the shape the plugin's own hook code reads.
 *
 * Codex and Claude Code agree on more than they differ. The payload a Codex
 * hook receives on stdin carries the same field names Claude's does —
 * `hook_event_name` (in the same CamelCase spelling), `session_id`, `cwd`,
 * `tool_name`, `tool_input`, `tool_response`, `tool_use_id`, `agent_type`,
 * `transcript_path`, `source`, `model`, `permission_mode` — and a hook answers
 * with the same `hookSpecificOutput` / `permissionDecision` /
 * `additionalContext` / `systemMessage` envelope, blocking the same way by
 * exiting 2 with a reason on stderr. So nothing here renames an event.
 *
 * Three things do differ, and this module is where each is handled:
 *
 *   the registration ids   a hook is registered under a snake_case event id
 *                          (`pre_tool_use`), while the payload still names the
 *                          event `PreToolUse`. CODEX_HOOK_EVENTS holds both.
 *   the tool names         Codex has no Write, Edit, Read or Grep tool. A file
 *                          change arrives as `apply_patch`, and everything else
 *                          — reading, searching, running anything — arrives as
 *                          `shell` or `unified_exec`. `claudeEvents` maps those
 *                          onto the Claude tool names the guard already knows,
 *                          and fans one patch out into one Write event per file
 *                          it touches, because the guard decides per file.
 *   the agent names        a Codex agent file cannot hold a colon or a hyphen
 *                          in its name, so the builders are installed as
 *                          `ua_fde_agent`. The guard keys on `ua:fde-agent`,
 *                          so the name is canonicalised here. Without this the
 *                          guard sees no builder and jails nobody.
 *
 * It also narrows what a hook may answer: Codex rejects an output a hook is not
 * allowed to give for that event (a PreToolUse hook may deny, but may not allow
 * or ask), and a rejected output is dropped whole — including the refusal it was
 * carrying. `codexOutput` takes the output the shared code produced and keeps
 * only the part Codex accepts for that event.
 *
 * Pure: no files, no network, no process. Everything here is a function of its
 * input, so the smoke test can replay a real Codex payload through it.
 */

/** The events the installer registers, as `registration id -> payload name`. */
export const CODEX_HOOK_EVENTS = Object.freeze({
  pre_tool_use: 'PreToolUse',
  post_tool_use: 'PostToolUse',
  session_start: 'SessionStart',
  pre_compact: 'PreCompact',
  permission_request: 'PermissionRequest',
  subagent_stop: 'SubagentStop',
});

/** Codex tools that run a command: all of them map to Claude's `Bash`. */
const SHELL_TOOLS = new Set(['shell', 'local_shell', 'unified_exec', 'exec', 'bash', 'run', 'container.exec']);
/** Codex's one file-writing tool. */
const PATCH_TOOLS = new Set(['apply_patch', 'patch']);
/** Our own MCP servers, named without the Claude prefix by other hosts. */
const UA_SERVERS = new Set(['object', 'automation-code', 'application-builder', 'agent-builder', 'api-gateway',
  'connectors-sdk', 'connection', 'context-graph', 'code-builder', 'evaluation', 'app-testing']);

/**
 * The builder name the guard keys on, from the name the host gave.
 *
 * Claude Code passes `ua:fde-agent` as it is. Codex passes `ua_fde_agent`,
 * because its agent names take neither a colon nor a hyphen, and the installer
 * writes them that way. Both mean the same builder.
 *
 * A name with no `ua` prefix is returned untouched, and so is not taken for a
 * builder. That is deliberate: OpenCode names its subagents `fde-agent`, with
 * no prefix, and so does every other agent a person may have installed. Reading
 * a bare name as one of ours would jail agents that are not ours. OpenCode
 * limits its subagents per action instead (`opencodeAgentEntry` in
 * `workspace/agent-targets.mjs`), so nothing there depends on this.
 */
export function canonicalAgent(agentType) {
  const name = String(agentType ?? '').trim();
  if (!name) return '';
  if (name.startsWith('ua:')) return name;
  const bare = name.replace(/^ua[_-]/u, '');
  if (bare === name && !/^ua[_:-]/u.test(name)) return name;
  return `ua:${bare.replace(/_/gu, '-')}`;
}

/** True when this caller is one of the plugin's builder agents, whatever the host calls it. */
export const isBuilder = (agentType) => canonicalAgent(agentType).startsWith('ua:');

/** The command text of a shell call, however this host spells its arguments. */
function commandText(args) {
  for (const key of ['command', 'cmd', 'script', 'input', 'commands']) {
    const value = args?.[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (Array.isArray(value) && value.length) {
      // A command array is argv (`["bash","-lc","…"]`) or a list of lines.
      return value.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' ');
    }
  }
  return '';
}

/** The patch text of an apply_patch call, however this host spells its argument. */
function patchText(args) {
  for (const key of ['input', 'patch', 'diff', 'content', 'arg']) {
    const value = args?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

/**
 * What one apply_patch call writes: a `{ file, content }` entry per file.
 *
 * The envelope is `*** Add File: <path>` / `*** Update File: <path>` /
 * `*** Delete File: <path>`, optionally followed by `*** Move to: <path>`, and
 * the lines after it up to the next header are that file's hunk. Both the old
 * and the new path of a move are returned, because a move writes to one and
 * removes the other, and the guard must weigh both.
 */
export function patchTargets(patch) {
  const lines = String(patch ?? '').split('\n');
  const targets = [];
  let current = null;
  for (const line of lines) {
    const header = /^\*\*\*\s+(Add|Update|Delete)\s+File:\s*(.+?)\s*$/u.exec(line);
    if (header) {
      current = { file: header[2], content: '' };
      targets.push(current);
      continue;
    }
    const moved = /^\*\*\*\s+Move\s+to:\s*(.+?)\s*$/u.exec(line);
    if (moved && current) {
      current = { file: moved[1], content: '' };
      targets.push(current);
      continue;
    }
    if (/^\*\*\*\s+(Begin|End)\s+Patch\s*$/u.test(line)) { current = null; continue; }
    if (current) current.content += `${line}\n`;
  }
  return targets;
}

/** The Claude tool name for an MCP tool call, when the server is one of ours. */
function mcpToolName(toolName) {
  const name = String(toolName ?? '');
  if (name.startsWith('mcp__plugin_ua_')) return name;
  const match = /^(?:mcp__)?([a-z0-9-]+)(?:__|\.)([a-z0-9_]+)$/u.exec(name);
  if (!match || !UA_SERVERS.has(match[1])) return null;
  return `mcp__plugin_ua_${match[1]}__${match[2]}`;
}

/**
 * One Codex hook payload as one or more Claude-shaped events.
 *
 * Several, not one, because a single apply_patch call writes several files and
 * the guard answers per file. The caller refuses the call when ANY of them is
 * refused. An event this does not recognise is passed through unchanged rather
 * than dropped: an unknown tool must still reach the guard, which fails closed
 * for a builder.
 */
export function claudeEvents(input) {
  if (!input || typeof input !== 'object') return [];
  const base = { ...input };
  if (base.agent_type !== undefined) base.agent_type = canonicalAgent(base.agent_type);
  base.host = 'codex';
  const tool = String(input.tool_name ?? '');
  const args = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};

  if (SHELL_TOOLS.has(tool)) {
    const command = commandText(args);
    return [{ ...base, tool_name: 'Bash', tool_input: { ...args, command }, codex_tool_name: tool }];
  }
  if (PATCH_TOOLS.has(tool)) {
    const patch = patchText(args);
    const targets = patchTargets(patch);
    // A patch this cannot read still has to be weighed, so it goes through as a
    // write with no path: the guard refuses a builder's write it cannot place.
    if (!targets.length) return [{ ...base, tool_name: 'Write', tool_input: { content: patch }, codex_tool_name: tool }];
    return targets.map((target) => ({ ...base, tool_name: 'Write',
      tool_input: { file_path: target.file, content: target.content }, codex_tool_name: tool }));
  }
  const mcp = mcpToolName(tool);
  if (mcp) return [{ ...base, tool_name: mcp, codex_tool_name: tool }];
  return [{ ...base, codex_tool_name: tool }];
}

/** The keys Codex accepts in a hook's answer, per event. Anything else is dropped. */
const ALLOWED_OUTPUT = Object.freeze({
  // A PreToolUse hook may refuse, and may say why. It may not allow, ask, or
  // suppress output: Codex rejects the whole answer when it does, taking any
  // refusal in it with it.
  PreToolUse: { top: ['systemMessage'], decision: ['deny'], context: false },
  PostToolUse: { top: ['systemMessage'], decision: [], context: true },
  SessionStart: { top: ['systemMessage'], decision: [], context: true },
  // The PreCompact answer carries no hookSpecificOutput at all.
  PreCompact: { top: ['systemMessage'], decision: [], context: false },
  PermissionRequest: { top: ['systemMessage'], decision: ['deny'], context: false },
  SubagentStop: { top: ['systemMessage'], decision: [], context: false },
});

/**
 * The part of a hook answer Codex accepts for this event.
 *
 * Returns null when nothing is left to say, so the caller writes nothing at all
 * rather than an empty object.
 */
export function codexOutput(eventName, output) {
  const rules = ALLOWED_OUTPUT[String(eventName ?? '')];
  if (!rules || !output || typeof output !== 'object') return null;
  const answer = {};
  for (const key of rules.top) if (typeof output[key] === 'string' && output[key]) answer[key] = output[key];
  const specific = output.hookSpecificOutput;
  if (specific && typeof specific === 'object') {
    const kept = { hookEventName: eventName };
    let any = false;
    const decision = specific.permissionDecision;
    if (decision && rules.decision.includes(decision) && typeof specific.permissionDecisionReason === 'string' && specific.permissionDecisionReason) {
      kept.permissionDecision = decision;
      kept.permissionDecisionReason = specific.permissionDecisionReason;
      any = true;
    }
    if (rules.context && typeof specific.additionalContext === 'string' && specific.additionalContext) {
      kept.additionalContext = specific.additionalContext;
      any = true;
    }
    if (any) answer.hookSpecificOutput = kept;
  }
  return Object.keys(answer).length ? answer : null;
}
