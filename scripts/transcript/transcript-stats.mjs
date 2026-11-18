/** Read one Claude transcript and count what it did. The archive keeps every byte;
 * these numbers exist so a session can be found and compared without downloading it.
 * Nothing here throws on a malformed line: a transcript is a log, not a contract. */
import fs from 'node:fs';
import path from 'node:path';

const bump = (counts, key) => { counts[key] = (counts[key] ?? 0) + 1; };

/** Subagent transcripts sit in `<sessionId>/subagents/*.jsonl` beside the session log. */
function countSubagents(file) {
  const folder = path.join(path.dirname(file), path.basename(file, '.jsonl'), 'subagents');
  try { return fs.readdirSync(folder).filter(name => name.endsWith('.jsonl')).length; }
  catch { return 0; }
}

// A gap between two entries longer than this is the person away, not work; it counts as this much.
const ACTIVE_GAP_MS = 10 * 60_000;

export function transcriptStats(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch { return { transcriptFound: false }; }
  const toolCalls = {}, models = new Set();
  let entries = 0, userTurns = 0, assistantTurns = 0, toolErrors = 0, compactions = 0;
  let inputTokens = 0, cacheReadTokens = 0, outputTokens = 0, firstAt = null, lastAt = null, previousAt = null, activeMs = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || typeof entry !== 'object') continue;
    entries++;
    const at = typeof entry.timestamp === 'string' ? entry.timestamp : null;
    if (at && Number.isFinite(Date.parse(at))) {
      if (!firstAt || at < firstAt) firstAt = at;
      if (!lastAt || at > lastAt) lastAt = at;
      if (previousAt !== null) activeMs += Math.min(Math.max(Date.parse(at) - previousAt, 0), ACTIVE_GAP_MS);
      previousAt = Date.parse(at);
    }
    if (entry.isCompactSummary) compactions++;
    const message = entry.message ?? {};
    const content = Array.isArray(message.content) ? message.content : [];
    // A tool result is delivered as a user entry; only real typing is a user turn.
    const isToolResult = content.some(part => part?.type === 'tool_result');
    if (entry.type === 'user' && !isToolResult) userTurns++;
    if (entry.type === 'assistant') {
      assistantTurns++;
      if (typeof message.model === 'string' && message.model) models.add(message.model);
      const usage = message.usage ?? {};
      // The context a turn read is its new input plus what it wrote to and read from the cache.
      const cached = (Number(usage.cache_read_input_tokens ?? 0) || 0) + (Number(usage.cache_creation_input_tokens ?? 0) || 0);
      inputTokens += (Number(usage.input_tokens ?? 0) || 0) + cached;
      cacheReadTokens += cached;
      outputTokens += Number(usage.output_tokens ?? 0) || 0;
    }
    for (const part of content) {
      if (part?.type === 'tool_use' && typeof part.name === 'string') bump(toolCalls, part.name);
      if (part?.type === 'tool_result' && part.is_error) toolErrors++;
    }
  }
  const durationMinutes = firstAt && lastAt ? Math.round((Date.parse(lastAt) - Date.parse(firstAt)) / 60_000) : 0;
  return { transcriptFound: true, entries, userTurns, assistantTurns, toolCalls, toolErrors,
    subagents: countSubagents(file), compactions, models: [...models].sort(),
    inputTokens, cacheReadTokens, outputTokens, firstAt, lastAt, durationMinutes, activeMinutes: Math.round(activeMs / 60_000) };
}
