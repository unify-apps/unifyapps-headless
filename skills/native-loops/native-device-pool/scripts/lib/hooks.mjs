// Claude Code hooks: the guards around argent calls and the session lifecycle.
// File reads only, never simctl. Every handler fails open (no output) on an
// internal error, except the stop-all check, which needs no state and runs
// before anything that could throw.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendLog, reap, renewRecord, replaceJson, statePaths } from './state.mjs';
import {
  findDevice, liveReservations, loadSession, ownedBy, readPool, releaseSession, reservationFile, sessionFile,
  updatePool, upsertSession,
} from '../cmd/context.mjs';
import { hhmm, shortId } from '../cmd/output.mjs';
import { releaseTakenRequests } from '../cmd/queue.mjs';

export const STOP_ALL = 'mcp__argent__stop-all-simulator-servers';
export const DESTRUCTIVE_TOOLS = new Set([
  'mcp__argent__stop-simulator-server',
  'mcp__argent__reinstall-app',
  'mcp__argent__restart-app',
  'mcp__argent__settings-permissions',
  'mcp__argent__screen-recording-start',
]);
export const UNRESERVED_WARNINGS_BEFORE_ASK = 3;
export const HOOK_EVENTS = ['session-start', 'session-end', 'stop', 'pre-tool', 'post-tool', 'pretool-bash'];
export const ARGENT_SERVER_STOP = 'argent server stop';

export function targetsOf(toolInput) {
  const targets = [];
  for (const key of ['udid', 'device_id']) {
    if (typeof toolInput?.[key] === 'string' && toolInput[key]) targets.push(toolInput[key]);
  }
  if (Array.isArray(toolInput?.devices)) {
    for (const device of toolInput.devices) if (typeof device === 'string' && device) targets.push(device);
  }
  return [...new Set(targets)];
}

const shortTool = (toolName) => String(toolName ?? '').replace(/^mcp__argent__/, '');
const holderText = (held) => `${held.name} (${held.udid}), reserved by session ${shortId(held.sessionId)}${held.task ? ` for "${held.task}"` : ''} until ${hhmm(held.expiresAt)}`;

export function isDestructive(toolName, toolInput) {
  return DESTRUCTIVE_TOOLS.has(toolName) || (toolName === 'mcp__argent__boot-device' && toolInput?.force === true);
}

// Pure: the decision table over what the call targets and who holds what.
export function decidePreTool({ toolName, toolInput, sessionId, pool, reservations, warnings }) {
  const targets = targetsOf(toolInput);
  const reservationOf = (udid) => reservations.find((held) => held.udid === udid) ?? null;
  const foreign = targets.map(reservationOf).filter((held) => held && !ownedBy(held.sessionId, sessionId));
  const own = targets.filter((udid) => ownedBy(reservationOf(udid)?.sessionId, sessionId));
  if (toolName === STOP_ALL) {
    if (!targets.length) {
      return { decision: 'deny', reason: 'stop-all-simulator-servers without `devices` tears down every session\'s simulator on this machine; one argent tool-server serves them all. Pass devices: [<udid>] naming only the devices this session used.' };
    }
    if (foreign.length) return { decision: 'deny', reason: `devices names a simulator another session is driving: ${foreign.map(holderText).join('; ')}. Name only your own devices.` };
    return { decision: 'allow', renew: own };
  }
  if (foreign.length) {
    const destructive = isDestructive(toolName, toolInput);
    return {
      decision: destructive ? 'deny' : 'ask',
      reason: `${shortTool(toolName)} targets ${foreign.map(holderText).join('; ')}.${destructive ? ' That would break their run.' : ''} Drive your own simulator: \`device-pool reserve\` (idempotent) tells you which one it is.`,
    };
  }
  const unreserved = targets.filter((udid) => findDevice(pool, udid) && !reservationOf(udid));
  if (unreserved.length) {
    const names = unreserved.map((udid) => `${findDevice(pool, udid).name} (${udid})`).join(', ');
    if (warnings >= UNRESERVED_WARNINGS_BEFORE_ASK) {
      return { decision: 'ask', reason: `${names} is a pool simulator with no reservation, and this session was warned ${warnings} times. Run \`device-pool reserve --prefer ${unreserved[0]}\` first so other sessions see it as taken.`, unreserved };
    }
    return {
      decision: 'allow', unreserved, renew: own,
      context: `[loops] ${names} is a pool simulator with no reservation. Run \`device-pool reserve --prefer ${unreserved[0]}\` before driving it, so other sessions see it as taken (warning ${warnings + 1} of ${UNRESERVED_WARNINGS_BEFORE_ASK}).`,
    };
  }
  return { decision: 'allow', renew: own };
}

// An argent MCP call the guard allows is approved outright (`explicitAllow`), so the person is not
// asked for every tap and screenshot: argent drives local simulators only, and the guard has already
// refused another session's device. A Bash command is never approved here, because anything chained
// after `argent` in it would be approved too; Bash keeps the person's own permission rules.
export function formatPreTool(decision, { explicitAllow = false } = {}) {
  if (decision.decision === 'allow' && !decision.context && !explicitAllow) return null;
  const output = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision.decision } };
  if (decision.reason) output.hookSpecificOutput.permissionDecisionReason = decision.reason;
  if (decision.context) output.hookSpecificOutput.additionalContext = decision.context;
  if (decision.decision !== 'allow') output.systemMessage = `[loops] ${decision.decision === 'deny' ? 'blocked' : 'asking'}: ${decision.reason}`;
  return JSON.stringify(output);
}

// --- the Bash guard: `argent run <tool> …` is the CLI twin of mcp__argent__<tool> -------

const SEPARATORS = new Set([';', '&&', '||', '|', '&', '\n', '(', ')']);

// A small shell lexer: words with '…', "…" and \ escapes resolved, and the
// separators that end a simple command. Good enough to find argent calls; it
// does not expand variables or substitutions (those stay as literal text).
export function shellWords(command) {
  const words = [];
  let word = null;
  let quote = null;
  const text = String(command ?? '');
  const push = () => {
    if (word !== null) words.push(word);
    word = null;
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote === "'") {
      if (char === "'") quote = null;
      else word += char;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === '\\' && index + 1 < text.length && '"\\$`'.includes(text[index + 1])) word += text[(index += 1)];
      else word += char;
      continue;
    }
    if (char === "'" || char === '"') {
      word ??= '';
      quote = char;
      continue;
    }
    if (char === '\\' && index + 1 < text.length) {
      if (text[index + 1] === '\n') { index += 1; continue; }
      word = (word ?? '') + text[(index += 1)];
      continue;
    }
    const two = text.slice(index, index + 2);
    if (two === '&&' || two === '||') {
      push();
      words.push({ sep: two });
      index += 1;
      continue;
    }
    if (SEPARATORS.has(char)) {
      push();
      words.push({ sep: char });
      continue;
    }
    if (char === ' ' || char === '\t') {
      push();
      continue;
    }
    word = (word ?? '') + char;
  }
  push();
  return words;
}

function simpleCommands(words) {
  const commands = [[]];
  for (const word of words) {
    if (typeof word === 'object') commands.push([]);
    else commands.at(-1).push(word);
  }
  return commands.filter((items) => items.length);
}

const isArgent = (word) => word === 'argent' || /\/argent$/.test(word);

function flagValue(words, index, name) {
  const word = words[index];
  if (word === `--${name}`) return { value: words[index + 1], next: index + 2 };
  if (word.startsWith(`--${name}=`)) return { value: word.slice(name.length + 3), next: index + 1 };
  return null;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Every argent call in a Bash command, as {toolName, toolInput} with the MCP
// tool name, so the MCP decision table applies unchanged. `--args` overrides
// the per-field flags, as it does in argent. `argent server stop` comes back as
// its own kind: it ends the one tool-server every session shares.
export function argentCallsIn(command) {
  if (!/argent/.test(String(command ?? ''))) return [];
  const calls = [];
  for (const words of simpleCommands(shellWords(command))) {
    const at = words.findIndex(isArgent);
    if (at === -1) continue;
    const [verb, sub] = [words[at + 1], words[at + 2]];
    if (verb === 'server' && sub === 'stop') {
      calls.push({ toolName: ARGENT_SERVER_STOP, toolInput: {}, unreadable: false });
      continue;
    }
    if (verb !== 'run' && verb !== 'flow') continue;
    const tool = verb === 'run' ? sub : 'flow-execute';
    if (!tool || tool.startsWith('-')) continue;
    const flags = {};
    let payload = null;
    let unreadable = false;
    for (let index = at + 3; index < words.length;) {
      const args = flagValue(words, index, 'args');
      if (args) {
        const parsed = args.value === '-' ? undefined : parseJson(args.value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed;
        else unreadable = true; // stdin or a shell expansion: the targets are not known here
        index = args.next;
        continue;
      }
      let matched = false;
      for (const [flag, key] of [['udid', 'udid'], ['device_id', 'device_id'], ['device-id', 'device_id'], ['device', 'device_id']]) {
        const found = flagValue(words, index, flag);
        if (found) {
          if (found.value) flags[key] = found.value;
          index = found.next;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      const devices = flagValue(words, index, 'devices-json');
      if (devices) {
        const parsed = parseJson(devices.value);
        if (Array.isArray(parsed)) flags.devices = parsed;
        else unreadable = true;
        index = devices.next;
        continue;
      }
      if (words[index] === '--force' || words[index] === '--force=true') flags.force = true;
      index += 1;
    }
    calls.push({ toolName: `mcp__argent__${tool}`, toolInput: payload ?? flags, unreadable });
  }
  return calls;
}

// True when a Bash command is argent calls and nothing else (`argent run|flow …`, joined by `;`, `&&`,
// `||` or new lines), so approving it approves no other program. Outside single quotes it refuses any
// `$`, backtick, redirect, pipe, background `&` or parenthesis; inside double quotes any `$` or backtick.
export function argentOnly(command) {
  const text = String(command ?? '');
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote === "'") { if (char === "'") quote = null; continue; }
    if (quote === '"') {
      if (char === '\\') { index += 1; continue; }
      if (char === '"') quote = null;
      else if (char === '$' || char === '`') return false;
      continue;
    }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === '\\') { index += 1; continue; }
    const two = text.slice(index, index + 2);
    if (two === '&&' || two === '||') { index += 1; continue; }
    if ('$`<>|&()'.includes(char)) return false;
  }
  if (quote) return false;
  const commands = simpleCommands(shellWords(text));
  return commands.length > 0 && commands.every((words) => isArgent(words[0]) && (words[1] === 'run' || words[1] === 'flow'));
}

const SEVERITY = { allow: 0, ask: 1, deny: 2 };

// Pure: one decision for a whole Bash command — the most severe of its calls.
export function decidePreBash({ command, sessionId, pool, reservations, warnings }) {
  const calls = argentCallsIn(command);
  if (!calls.length) return { decision: 'allow', calls: [] };
  const decisions = [];
  for (const call of calls) {
    if (call.toolName === ARGENT_SERVER_STOP) {
      const others = reservations.filter((held) => !ownedBy(held.sessionId, sessionId));
      decisions.push(others.length
        ? { decision: 'ask', reason: `argent server stop ends the one tool-server every session on this machine shares, and ${others.length} other session${others.length === 1 ? ' holds' : 's hold'} a simulator: ${others.map(holderText).join('; ')}. Stop it only when \`device-pool status\` shows no other session mid-phase.` }
        : { decision: 'allow' });
      continue;
    }
    const decision = decidePreTool({ toolName: call.toolName, toolInput: call.toolInput, sessionId, pool, reservations, warnings });
    if (decision.decision === 'allow' && call.unreadable && targetsOf(call.toolInput).length === 0 && pool) {
      decision.context = `[loops] could not read the device of \`argent run ${shortTool(call.toolName)}\` (--args from stdin or a shell variable). Name your reserved udid in the command so the guard can check it.`;
    }
    decisions.push(decision);
  }
  const worst = decisions.reduce((left, right) => (SEVERITY[right.decision] > SEVERITY[left.decision] ? right : left));
  const renew = [...new Set(decisions.flatMap((item) => item.renew ?? []))];
  const unreserved = [...new Set(decisions.flatMap((item) => item.unreserved ?? []))];
  const context = worst.decision === 'allow' ? decisions.map((item) => item.context).filter(Boolean).join(' ') || undefined : undefined;
  const reason = worst.reason ? `Bash: ${worst.reason}` : undefined;
  return { decision: worst.decision, reason, context, renew, unreserved, calls };
}

export async function handlePreBash(input, { home, config }) {
  const command = input.tool_input?.command;
  if (typeof command !== 'string' || !/argent/.test(command)) return null;
  const sessionId = input.session_id;
  const pool = readPool(home);
  if (!pool) return argentOnly(command) ? formatPreTool({ decision: 'allow' }, { explicitAllow: true }) : null;
  const session = loadSession(home, sessionId);
  const decision = decidePreBash({
    command, sessionId, pool, reservations: liveReservations(home),
    warnings: session?.unreservedWarnings ?? 0,
  });
  if (!decision.calls.length) return null;
  if (decision.renew?.length) renewOwn(home, config, sessionId, decision.renew);
  if (decision.unreserved?.length && decision.decision === 'allow') upsertSession(home, sessionId, { unreservedWarnings: (session?.unreservedWarnings ?? 0) + 1 }, { cwd: input.cwd ?? process.cwd() });
  if (decision.decision !== 'allow') appendLog(home, 'hooks.log', [`${decision.decision} Bash(${decision.calls.map((call) => shortTool(call.toolName)).join(',')}) session=${sessionId}`]);
  // A command that is argent calls and nothing else is approved outright, like the MCP tools.
  return formatPreTool(decision, { explicitAllow: argentOnly(command) });
}

function renewOwn(home, config, sessionId, udids) {
  for (const udid of udids) {
    const held = liveReservations(home).find((item) => item.udid === udid && ownedBy(item.sessionId, sessionId));
    if (held) replaceJson(reservationFile(home, udid), renewRecord(held, { ttlSec: Number(config.reservation.ttlSec) }));
  }
}


export async function handlePreTool(input, { home, config }) {
  const sessionId = input.session_id;
  const toolName = input.tool_name;
  const toolInput = input.tool_input ?? {};
  if (toolName === STOP_ALL && !targetsOf(toolInput).length) {
    return formatPreTool(decidePreTool({ toolName, toolInput, sessionId, pool: null, reservations: [], warnings: 0 }), { explicitAllow: true });
  }
  const session = loadSession(home, sessionId);
  const decision = decidePreTool({
    toolName, toolInput, sessionId,
    pool: readPool(home), reservations: liveReservations(home),
    warnings: session?.unreservedWarnings ?? 0,
  });
  if (decision.renew?.length) renewOwn(home, config, sessionId, decision.renew);
  if (decision.context) upsertSession(home, sessionId, { unreservedWarnings: (session?.unreservedWarnings ?? 0) + 1 }, { cwd: input.cwd ?? process.cwd() });
  if (decision.decision !== 'allow') appendLog(home, 'hooks.log', [`${decision.decision} ${toolName} session=${sessionId} targets=${targetsOf(toolInput).join(',') || '-'}`]);
  return formatPreTool(decision, { explicitAllow: true });
}

export async function handlePostTool(input, { home, config }) {
  const targets = targetsOf(input.tool_input);
  if (!targets.length) return null;
  const sessionId = input.session_id;
  renewOwn(home, config, sessionId, targets);
  const tool = shortTool(input.tool_name);
  const stamp = new Date().toISOString();
  if (['restart-app', 'reinstall-app', 'boot-device'].includes(tool) && readPool(home)) {
    await updatePool(home, (pool) => {
      for (const udid of targets) {
        const device = findDevice(pool, udid);
        if (!device) continue;
        if (tool === 'boot-device') device.lastBootAt = stamp;
        else {
          device.state.currentApp = null;
          device.state.lastRestartAt = stamp;
        }
      }
    }, { sessionId });
  }
  return null;
}

const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;

export function pluginRoot() {
  if (process.env.CLAUDE_PLUGIN_ROOT) return process.env.CLAUDE_PLUGIN_ROOT;
  // scripts/lib → scripts → native-device-pool → skills → plugin root
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
}

export async function statusLine({ home, config, sessionId }) {
  const pool = readPool(home);
  const reservations = liveReservations(home);
  const poolPart = pool
    ? `pool ${pool.devices.length} sims: ${pool.devices.filter((device) => !reservations.some((held) => held.udid === device.udid)).length} free`
    : 'no simulator pool (device-pool pool init)';
  const mine = reservations.find((held) => held.sessionId === sessionId);
  const youPart = mine ? `you: ${mine.name} (${mine.udid}) ${mine.profile}, expires ${hhmm(mine.expiresAt)}` : 'you: no reservation';
  return `[loops] ${poolPart} · ${youPart}`;
}

// Prints nothing on a plain start: the plugin's own SessionStart adds one cached
// health line (loops.mjs health --quick), and a second status line would
// repeat it. Only a compacted or resumed session that still holds a reservation is
// reminded not to trust the udid it remembers.
export async function handleSessionStart(input, { home, config, envFile = process.env.CLAUDE_ENV_FILE }) {
  const sessionId = input.session_id;
  // The event's cwd is authoritative: a record made by an earlier CLI call
  // carries that call's folder, not the session's.
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
  upsertSession(home, sessionId, { source: input.source ?? null, cwd }, { cwd });
  if (envFile) {
    fs.appendFileSync(envFile, `\nexport LOOPS_SESSION_ID=${shellQuote(sessionId)}\nexport LOOPS_HOME=${shellQuote(home)}\n`);
  }
  reap(home);
  if (!['compact', 'resume'].includes(input.source)) return null;
  const mine = liveReservations(home).find((held) => held.sessionId === sessionId);
  if (!mine) return null;
  return `[loops] you hold ${mine.name} (${mine.udid}) ${mine.profile} until ${hhmm(mine.expiresAt)}. Re-read your reservation with \`device-pool reserve\` (idempotent); never reuse a UDID from memory.`;
}

export async function handleSessionEnd(input, { home }) {
  const released = await releaseSession(home, input.session_id, { reason: 'session-end' });
  released.queueRequests = releaseTakenRequests(home, input.session_id, 'session-end');
  if (released.reservations.length || released.locks.length || released.pageLocks.length || released.tickets) {
    appendLog(home, 'hooks.log', [`session-end ${input.session_id} released ${JSON.stringify(released)}`]);
  }
  return null;
}

export async function handleStop(input, { home, config }) {
  if (!config.reservation.releaseOnStop) return null;
  const sessionId = input.session_id;
  const released = await releaseSession(home, sessionId, { reservations: true, locks: false, pageLocks: false, tickets: true, keepSession: true, reason: 'stop' });
  if (released.reservations.length) {
    const session = loadSession(home, sessionId);
    if (session) replaceJson(sessionFile(home, sessionId), { ...session, lastUdid: released.reservations.at(-1) });
  }
  return null;
}

const HANDLERS = {
  'session-start': handleSessionStart,
  'session-end': handleSessionEnd,
  stop: handleStop,
  'pre-tool': handlePreTool,
  'post-tool': handlePostTool,
  'pretool-bash': handlePreBash,
};

// Returns the text to print, or null. Throws only for the stop-all branch,
// which cannot throw: it reads nothing. Everything else fails open.
export async function handleHook(event, input, context) {
  const handler = HANDLERS[event];
  if (!handler || !input || typeof input.session_id !== 'string' || !/^[A-Za-z0-9._-]{1,200}$/.test(input.session_id)) return null;
  if (event === 'pre-tool' && input.tool_name === STOP_ALL && !targetsOf(input.tool_input).length) return handlePreTool(input, context);
  try {
    return await handler(input, context);
  } catch (error) {
    try {
      appendLog(context.home, 'hooks.log', [`error ${event}: ${error.message}`]);
    } catch {
      // the log folder may not exist; failing open is the point
    }
    return null;
  }
}

export const hookStateDir = (home) => statePaths(home).home;
