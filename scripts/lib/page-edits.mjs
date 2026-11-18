/** Checks the arguments of an `apply_page_edits` call before the bridge sends it: the JSON, then the step list. Pure. */

const MOST_STEPS = 40;
// Seen in real runs: 7 of 24 create_block steps set it here, and all 7 were dropped.
const VISIBILITY_AT_TOP = 'The server drops a `visibility` key here, so the block stays visible. '
  + 'Put it in `props` instead: {"path": "visibility", "value": {"value": false}}, or the condition object as the value.';

/** Parses JSON text. A mistake comes back as its line, column and the lines around it. */
export function parseJsonText(text) {
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    const { line, column } = positionOf(text, error.message);
    const reason = error.message.replace(/\s*in JSON at position \d+.*$/u, '').replace(/\s*\(line \d+ column \d+\)$/u, '');
    return { line, column, problem: `Line ${line}, column ${column}: ${reason}.\n${linesAround(text, line)}` };
  }
}

function positionOf(text, message) {
  const given = /\(line (\d+) column (\d+)\)/u.exec(message);
  if (given) return { line: Number(given[1]), column: Number(given[2]) };
  const at = /at position (\d+)/u.exec(message);
  const index = at ? Number(at[1]) : text.length;
  const before = text.slice(0, index).split('\n');
  return { line: before.length, column: before.at(-1).length + 1 };
}

function linesAround(text, line) {
  const lines = text.split('\n');
  const first = Math.max(1, line - 2), last = Math.min(lines.length, line + 2);
  const width = String(last).length;
  const out = [];
  for (let n = first; n <= last; n++) out.push(`${n === line ? '>' : ' '} ${String(n).padStart(width)} | ${lines[n - 1]}`);
  return out.join('\n');
}

/**
 * The problems in a call's arguments, each with the JSON path it sits at.
 *
 * `schema` is the tool's live input schema from the tenant, so the step count
 * and the verb list stay the server's own. Only the step list is checked here,
 * plus a `create_block` visibility the server would drop without a word; the
 * server checks the rest of each verb's own `args`.
 */
export function pageEditProblems(args, schema = {}) {
  const problems = [];
  for (const key of schema.required ?? []) {
    if (args?.[key] === undefined) problems.push({ path: [key], message: `\`${key}\` is missing.` });
  }
  const steps = args?.steps;
  if (steps === undefined) return problems;
  if (!Array.isArray(steps)) return [...problems, { path: ['steps'], message: '`steps` must be a list of {tool, args} steps.' }];
  const stepSchema = schema.properties?.steps ?? {};
  const most = stepSchema.maxItems ?? MOST_STEPS;
  const verbs = stepSchema.items?.properties?.tool?.enum;
  if (steps.length === 0) problems.push({ path: ['steps'], message: `\`steps\` is empty. Send 1 to ${most} steps.` });
  if (steps.length > most) problems.push({ path: ['steps'], message: `${steps.length} steps, but one call takes at most ${most}. Split them over two calls.` });
  steps.forEach((step, n) => {
    if (!isObject(step)) {
      problems.push({ path: ['steps', n], message: 'A step must be an object: {"tool": "<verb>", "args": {…}}.' });
      return;
    }
    if (typeof step.tool !== 'string') problems.push({ path: ['steps', n], message: 'This step has no `tool`.' });
    else if (verbs && !verbs.includes(step.tool)) problems.push({ path: ['steps', n, 'tool'], message: `"${step.tool}" is not a step verb. Use one of: ${verbs.join(', ')}.` });
    if (!isObject(step.args)) problems.push({ path: ['steps', n], message: 'This step needs an `args` object holding the verb\'s own input.' });
    else if (step.tool === 'create_block') {
      if (step.args.visibility !== undefined) problems.push({ path: ['steps', n, 'args', 'visibility'], message: VISIBILITY_AT_TOP });
      (Array.isArray(step.args.children) ? step.args.children : []).forEach((child, c) => {
        if (child?.visibility !== undefined) problems.push({ path: ['steps', n, 'args', 'children', c, 'visibility'], message: VISIBILITY_AT_TOP });
      });
    }
  });
  return problems;
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** `["steps", 3, "tool"]` → `steps[3].tool`. */
export function pathText(path) {
  return path.reduce((out, key) => (typeof key === 'number' ? `${out}[${key}]` : out ? `${out}.${key}` : key), '');
}

/** The line where the value at `path` starts, in JSON text that already parses. */
export function lineOfPath(text, path) {
  const want = JSON.stringify(path);
  let i = 0, line = 1, found;
  const skipSpace = () => {
    while (i < text.length && /\s/u.test(text[i])) { if (text[i] === '\n') line++; i++; }
  };
  const readString = () => {
    let out = '';
    for (i++; i < text.length && text[i] !== '"'; i++) out += text[i] === '\\' ? text[++i] : text[i];
    i++;
    return out;
  };
  const readValue = (at) => {
    skipSpace();
    if (found === undefined && JSON.stringify(at) === want) found = line;
    if (text[i] === '{') {
      i++; skipSpace();
      if (text[i] === '}') { i++; return; }
      for (;;) {
        skipSpace();
        const key = readString();
        skipSpace(); i++;
        readValue([...at, key]);
        skipSpace();
        if (text[i++] === '}') return;
      }
    }
    if (text[i] === '[') {
      i++; skipSpace();
      if (text[i] === ']') { i++; return; }
      for (let n = 0; ; n++) {
        readValue([...at, n]);
        skipSpace();
        if (text[i++] === ']') return;
      }
    }
    if (text[i] === '"') { readString(); return; }
    while (i < text.length && !/[\s,\]}]/u.test(text[i])) i++;
  };
  readValue([]);
  return found;
}
