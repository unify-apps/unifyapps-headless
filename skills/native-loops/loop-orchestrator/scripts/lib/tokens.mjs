// Token use of a session, summed from Claude Code's transcripts — only when asked.
//   <projects>/<cwd slug>/<session>.jsonl                 the main session
//   <projects>/<cwd slug>/<session>/subagents/*.jsonl     each subagent, with <name>.meta.json
//                                                         ({ agentType, description, toolUseId })
// An assistant message is logged once per content block, each line carrying the message's
// usage so far: lines are deduplicated by message id, keeping the largest value of each field.
// Counted: input, output, cache read and cache creation tokens, per agent, per agent type and
// per stage (a subagent's stage comes from the run log's dispatch events: toolUseId or description),
// plus Skill calls, Agent calls by type, and loops CLI calls seen in Bash commands.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { missing } from './output.mjs';

const FIELDS = { input: 'input_tokens', output: 'output_tokens', cacheRead: 'cache_read_input_tokens', cacheCreation: 'cache_creation_input_tokens' };
const zero = () => ({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0, messages: 0 });
const add = (sum, usage) => {
  for (const key of Object.keys(FIELDS)) sum[key] += usage[key];
  sum.total += usage.input + usage.output + usage.cacheRead + usage.cacheCreation;
  sum.messages += 1;
  return sum;
};
const LOOPS_CALL = /loops\.mjs["']?\s+([a-z][a-z-]*)(?:\s+([a-z][a-z-]*))?/u;
const SUBCOMMANDS = { pool: ['up', 'status', 'add', 'adopt', 'watch'], preview: ['install'], issues: ['lint', 'merge', 'split'], queue: ['add', 'status'], log: ['append', 'tokens', 'report', 'share'], perf: ['render'] };

/** The Claude projects folder of a working directory (both slug forms Claude Code has used). */
export function projectFolders(cwd, root = process.env.LOOPS_CLAUDE_PROJECTS || path.join(os.homedir(), '.claude', 'projects')) {
  const resolved = path.resolve(cwd);
  let real = resolved;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    // keep the path as given
  }
  const slugs = [resolved, real].flatMap((dir) => [dir.replace(/[^A-Za-z0-9]/gu, '-'), dir.replace(/\//gu, '-')]);
  return [...new Set(slugs)].map((slug) => path.join(root, slug));
}

export function findTranscript({ session, transcript, cwd = process.cwd() }) {
  if (transcript) {
    const file = path.resolve(transcript);
    if (!fs.existsSync(file)) throw missing(`no transcript at ${file}`);
    return file;
  }
  const id = session ?? process.env.CLAUDE_CODE_SESSION_ID ?? null;
  if (!id) throw missing('no session: pass --session <id> or --transcript <file> (CLAUDE_CODE_SESSION_ID is not set)');
  if (!/^[A-Za-z0-9_-]+$/u.test(id)) throw missing(`invalid session id ${id}`);
  const fromEnv = process.env.UA_TRANSCRIPT_PATH;
  if (fromEnv && path.basename(fromEnv) === `${id}.jsonl` && fs.existsSync(fromEnv)) return fromEnv;
  for (const folder of projectFolders(cwd)) {
    const file = path.join(folder, `${id}.jsonl`);
    if (fs.existsSync(file)) return file;
  }
  throw missing(`no transcript for session ${id} under ${projectFolders(cwd).join(' or ')}`);
}

function readLines(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry && typeof entry === 'object') out.push(entry);
    } catch {
      // a log line cut short
    }
  }
  return out;
}

const inWindow = (timestamp, { since, until }) => {
  if (!since && !until) return true;
  const at = Date.parse(timestamp ?? '');
  if (!Number.isFinite(at)) return true;
  if (since && at < Date.parse(since)) return false;
  if (until && at > Date.parse(until)) return false;
  return true;
};

/** Pure over entries: { usage by message, skills, agentCalls, loopCalls, first, last }. */
export function scanEntries(entries, window = {}) {
  const messages = new Map();
  const toolUses = new Set();
  const skills = {};
  const agentCalls = {};
  const loopCalls = {};
  let first = null;
  let last = null;
  for (const entry of entries) {
    if (!inWindow(entry.timestamp, window)) continue;
    const message = entry.message ?? {};
    if (entry.type === 'assistant' && message.usage) {
      const id = message.id ?? entry.requestId ?? entry.uuid;
      const usage = Object.fromEntries(Object.entries(FIELDS).map(([key, field]) => [key, Number(message.usage[field]) || 0]));
      const previous = messages.get(id);
      messages.set(id, previous ? Object.fromEntries(Object.keys(FIELDS).map((key) => [key, Math.max(previous[key], usage[key])])) : usage);
      if (typeof entry.timestamp === 'string') {
        if (!first || entry.timestamp < first) first = entry.timestamp;
        if (!last || entry.timestamp > last) last = entry.timestamp;
      }
    }
    for (const part of Array.isArray(message.content) ? message.content : []) {
      if (part?.type !== 'tool_use' || toolUses.has(part.id)) continue;
      toolUses.add(part.id);
      const input = part.input ?? {};
      if (part.name === 'Skill' && typeof input.skill === 'string') skills[input.skill] = (skills[input.skill] ?? 0) + 1;
      if ((part.name === 'Agent' || part.name === 'Task') && input.subagent_type !== undefined) {
        const type = String(input.subagent_type || 'general-purpose');
        agentCalls[type] = (agentCalls[type] ?? 0) + 1;
      }
      if (part.name === 'Bash' && typeof input.command === 'string') {
        const match = LOOPS_CALL.exec(input.command);
        if (match) {
          const name = match[2] && SUBCOMMANDS[match[1]]?.includes(match[2]) ? `${match[1]} ${match[2]}` : match[1];
          loopCalls[name] = (loopCalls[name] ?? 0) + 1;
        }
      }
    }
  }
  return { messages, skills, agentCalls, loopCalls, first, last };
}

const merge = (target, source) => {
  for (const [key, count] of Object.entries(source)) target[key] = (target[key] ?? 0) + count;
  return target;
};

/**
 * Sum one session. dispatches: [{ toolUseId, description, stage, agent }] from the run log.
 * window: { since, until } ISO times (the run's first and last event), or empty for the whole session.
 */
export function sumSession(file, { dispatches = [], window = {} } = {}) {
  const sessionId = path.basename(file, '.jsonl');
  const agents = [];
  const skills = {};
  const agentCalls = {};
  const loopCalls = {};
  const main = scanEntries(readLines(file), window);
  agents.push({ agent: 'main', type: 'main', description: null, stage: 'orchestrator', ...main });
  const folder = path.join(path.dirname(file), sessionId, 'subagents');
  let names = [];
  try {
    names = fs.readdirSync(folder).filter((name) => name.endsWith('.jsonl')).sort();
  } catch {
    names = [];
  }
  const byToolUse = new Map(dispatches.filter((item) => item.toolUseId).map((item) => [item.toolUseId, item]));
  const byDescription = new Map(dispatches.filter((item) => item.description).map((item) => [item.description, item]));
  for (const name of names) {
    const meta = (() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(folder, name.replace(/\.jsonl$/u, '.meta.json')), 'utf8'));
      } catch {
        return {};
      }
    })();
    const scan = scanEntries(readLines(path.join(folder, name)), window);
    if (!scan.messages.size) continue;
    const dispatch = byToolUse.get(meta.toolUseId) ?? byDescription.get(meta.description) ?? null;
    agents.push({ agent: name.replace(/\.jsonl$/u, ''), type: meta.agentType ?? 'unknown', description: meta.description ?? null, stage: dispatch?.stage ?? 'unassigned', ...scan });
  }
  // A message id counts once across files.
  const counted = new Set();
  const out = agents.map((item) => {
    const sum = zero();
    for (const [id, usage] of item.messages) {
      if (counted.has(id)) continue;
      counted.add(id);
      add(sum, usage);
    }
    merge(skills, item.skills);
    merge(agentCalls, item.agentCalls);
    merge(loopCalls, item.loopCalls);
    return { agent: item.agent, type: item.type, description: item.description, stage: item.stage, first: item.first, last: item.last, ...sum };
  });
  return { sessionId, agents: out, skills, agentCalls, loopCalls };
}

/** Totals by agent type and by stage across sessions. */
export function summarizeTokens(sessions, { window = {} } = {}) {
  const totals = zero();
  const byType = {};
  const byStage = {};
  const skills = {};
  const agentCalls = {};
  const loopCalls = {};
  const agents = [];
  for (const session of sessions) {
    for (const item of session.agents) {
      const usage = { input: item.input, output: item.output, cacheRead: item.cacheRead, cacheCreation: item.cacheCreation };
      for (const [bucket, key] of [[byType, item.type], [byStage, item.stage]]) {
        bucket[key] ??= { ...zero(), agents: 0 };
        for (const field of Object.keys(FIELDS)) bucket[key][field] += usage[field];
        bucket[key].total += item.total;
        bucket[key].messages += item.messages;
        bucket[key].agents += 1;
      }
      for (const field of Object.keys(FIELDS)) totals[field] += usage[field];
      totals.total += item.total;
      totals.messages += item.messages;
      agents.push({ session: session.sessionId, ...item });
    }
    merge(skills, session.skills);
    merge(agentCalls, session.agentCalls);
    merge(loopCalls, session.loopCalls);
  }
  return { sessions: sessions.map((session) => session.sessionId), window, totals, byType, byStage, agents, skills, agentCalls, loopCalls };
}

export function renderTokens(result) {
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const lines = [`Tokens for ${result.sessions.join(', ')}${result.window.since ? ` (${result.window.since} → ${result.window.until ?? 'end'})` : ''}:`,
    `  total ${fmt(result.totals.total)} · input ${fmt(result.totals.input)} · output ${fmt(result.totals.output)} · cache read ${fmt(result.totals.cacheRead)} · cache creation ${fmt(result.totals.cacheCreation)}`];
  lines.push('By agent type:');
  for (const [type, sum] of Object.entries(result.byType).sort((left, right) => right[1].total - left[1].total)) lines.push(`  ${type}: ${fmt(sum.total)} (${sum.agents} agents)`);
  lines.push('By stage:');
  for (const [stage, sum] of Object.entries(result.byStage).sort((left, right) => right[1].total - left[1].total)) lines.push(`  ${stage}: ${fmt(sum.total)}`);
  const top = (map) => Object.entries(map).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([name, count]) => `${name} ×${count}`).join(', ') || '—';
  lines.push(`Skills: ${top(result.skills)}`, `Agents started: ${top(result.agentCalls)}`, `Loops CLI: ${top(result.loopCalls)}`);
  return lines.join('\n');
}
