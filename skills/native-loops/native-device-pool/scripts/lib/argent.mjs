// Run one argent tool from Node: `argent run <tool> --args '<json>'`, JSON back.
// Builders without the argent MCP drive the device this way from Bash, and the
// protocol scripts use the same call, so tool names stay the MCP names.
import { spawnSync } from 'node:child_process';

// argent prints its result as JSON on stdout, but an update banner or a log
// line can come first; parse from the first line that starts a JSON value.
export function extractJson(text) {
  const source = String(text ?? '');
  const starts = [];
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if ((char === '{' || char === '[') && (index === 0 || source[index - 1] === '\n')) starts.push(index);
  }
  if (!starts.length) {
    const first = source.search(/[[{]/);
    if (first >= 0) starts.push(first);
  }
  for (const start of starts) {
    try {
      return JSON.parse(source.slice(start).trim());
    } catch {
      // keep looking: this start belonged to a banner line, not the result
    }
  }
  return undefined;
}

export function runArgent(tool, args = {}, { timeoutMs = 120000, bin = process.env.ARGENT_BIN || 'argent' } = {}) {
  const result = spawnSync(bin, ['run', tool, '--args', JSON.stringify(args)], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 256 << 20,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    const error = result.error.code === 'ENOENT'
      ? 'argent is not on PATH (install: npx @swmansion/argent@0.28.0 init -y)'
      : result.error.code === 'ETIMEDOUT' ? `argent run ${tool} gave no answer in ${timeoutMs} ms` : result.error.message;
    return { ok: false, data: null, error, status: null };
  }
  const data = extractJson(result.stdout);
  const stderr = (result.stderr ?? '').trim();
  if (result.status !== 0) {
    return { ok: false, data: data ?? null, error: stderr || (result.stdout ?? '').trim() || `argent run ${tool} exited ${result.status}`, status: result.status };
  }
  if (data === undefined) {
    return { ok: false, data: null, error: `argent run ${tool} printed no JSON`, raw: result.stdout, status: result.status };
  }
  return { ok: true, data, error: null, status: 0, stderr: stderr || undefined };
}

export function argentAvailable(bin = process.env.ARGENT_BIN || 'argent') {
  const result = spawnSync(bin, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return result.status === 0 ? (result.stdout ?? '').trim() : null;
}
