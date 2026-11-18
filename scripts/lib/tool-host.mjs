// What every skill script shares about calling tenant MCP tools: the `host` argument the
// application-builder tools require (the bridge checks it but never adds it), and the shape of a
// refused call. Pure: no files, no network.

/** Tools whose every call names the tenant as `host`, unless the caller named one itself. */
export function withHost(tools, host) {
  return { ...tools, call: (name, args = {}) => tools.call(name, { host, ...args }) };
}

/**
 * A refused tool call answers `<tool>: <JSON>`, the JSON being
 * `{ errors: [{ errorCode, errorPayload: { message, issues? } }] }`. Answers that first error, or null.
 */
export function toolRefusal(error) {
  const text = String(error?.message ?? '');
  const start = text.indexOf('{');
  if (start < 0) return null;
  try { return JSON.parse(text.slice(start))?.errors?.[0] ?? null; } catch { return null; }
}

/** The refusal's first issue on `path` (`{path, message}`), or null. */
export function refusalIssue(error, path) {
  const issues = toolRefusal(error)?.errorPayload?.issues;
  return (Array.isArray(issues) && issues.find((issue) => issue?.path === path)) || null;
}
