// Issue logs in the shared Markdown format (references/formats.md "Issue log"): a header of
// "- Key: value" lines, then one table per page (a "Cross-page (app shell)" table first). The
// columns, in this order (the first nine are required, the others optional):
//   | id | page (name · id) | region / element | check | rule | severity | kind | expected | actual |
//   | evidence | fix hint | cause | owner | device | status | attempt | steps |
// (an older log's `pass` and `round` header cells still read as `check` and `attempt`). `steps` is
// the recorded test of a reproduced issue: `flow:<argent flow name>` and/or `steps:<steps file in
// the run folder>`, joined by " · ", which a `replay` retest runs again. `cause` is the layer the
// issue lives in (CAUSES): what the person reads to see why it broke, and what decides its owner.
//   lint   every issue well formed (exit 1 on an error)
//   merge  several logs into one, the same issue in two logs kept once; one id on two different
//          issues fails ISSUE_ID_COLLISION naming both, so no issue is ever dropped
//   split  issues into jobs. Page issues go into page jobs by page (never two jobs on one page);
//          the app shell, each module or card (owner module:<id> / card:<id>, or a page that
//          impact says several pages use) and each automation (owner automation:<id>: an
//          automation job, saved and test-run by the automation agent and deployed once its test
//          run passes), each AI agent (owner agent:<id>: published only on the agent publish
//          approval) and each object (owner object:<id>: changed only on the object approval) get a
//          job of their own, as do the owners platform and person; owner
//          none and issues already settled (fixed, verified, accepted, escalated,
//          platform-limit-confirmed) stay out unless --all. An issue with no proof (not reproduced
//          on a device, no config read-back: a triage, reproduce or test-author issue whose device
//          cell is not config, device or run, and with no recorded steps) gets no draft job: it
//          goes to the person job with the one question that would unblock it, unless --allow-unproven.
import fs from 'node:fs';
import path from 'node:path';
import { EXIT, LoopsError, failed, plural, usage } from './output.mjs';
import { writeJson, writeText } from './paths.mjs';

export const COLUMNS = ['id', 'page', 'region', 'severity', 'kind', 'expected', 'actual', 'evidence', 'fix'];
export const OPTIONAL_COLUMNS = ['check', 'rule', 'cause', 'owner', 'device', 'status', 'attempt', 'steps'];
export const ORDER = ['id', 'page', 'region', 'check', 'rule', 'severity', 'kind', 'expected', 'actual', 'evidence', 'fix', 'cause', 'owner', 'device', 'status', 'attempt', 'steps'];
export const TITLES = { id: 'id', page: 'page (name · id)', region: 'region / element', check: 'check', rule: 'rule', severity: 'severity', kind: 'kind',
  expected: 'expected', actual: 'actual', evidence: 'evidence', fix: 'fix hint', cause: 'cause', owner: 'owner', device: 'device', status: 'status', attempt: 'attempt', steps: 'steps' };
export const SEVERITIES = ['critical', 'major', 'minor'];
export const KINDS = ['layout', 'spacing', 'typography', 'colour', 'component', 'state', 'navigation', 'touch-feedback', 'interaction', 'crash', 'data', 'identity', 'performance', 'logic', 'bundle', 'platform-limit'];
export const STATUSES = ['open', 'fixed', 'verified', 'still open', 'regressed', 'new', 'platform-limit-confirmed', 'not retested', 'accepted', 'escalated', 'stale-build'];
// stale-build waits for a retest on the current build, so no job takes it (ticket-sources.md).
export const SETTLED = ['fixed', 'verified', 'accepted', 'escalated', 'platform-limit-confirmed', 'stale-build'];
// The layer an issue lives in (formats.md § Cause): config is a block's or page's look and content,
// event a block's event chain, state a variable, page input, storage or binding.
export const CAUSES = ['config', 'event', 'data source', 'state', 'automation', 'object', 'agent', 'access', 'platform', 'environment'];
export const CHECKS = ['ui', 'touch-feedback', 'interaction', 'perf', 'security', 'data', 'logic', 'triage', 'reproduce', 'test-author', 'a11y', 'responsive'];
const OWNER = /^(?:page|platform|person|none|(?:module|card|automation|agent|object):\S+)$/u;
// run: proven by automation test runs alone, for an issue with no screen (the reproduce stage § No screen).
const DEVICE = /^(?:config|device|run|queued:[a-z-]+)$/u;
// One part of a steps cell: an argent flow or a steps file in the run folder.
const STEP_PART = /^(flow|steps):(\S+)$/u;
const ID = /^[A-Za-z][A-Za-z0-9]*-(?:R)?\d{2,}[a-z]?$/u;
const PAGE_ID = /\be_[A-Za-z0-9_]+\b/u;
const EMPTY = new Set(['', '—', '-', '–', 'n/a']);

/** One header cell → its column key, or null. */
export function columnKey(text) {
  const cell = text.trim().toLowerCase();
  if (cell === 'id' || cell === '#') return 'id';
  if (cell.startsWith('page')) return 'page';
  if (cell.startsWith('region') || cell.startsWith('element')) return 'region';
  if (cell.startsWith('severity')) return 'severity';
  if (cell.startsWith('kind')) return 'kind';
  if (cell.startsWith('expected')) return 'expected';
  if (cell.startsWith('actual')) return 'actual';
  if (cell.startsWith('evidence')) return 'evidence';
  if (cell.startsWith('fix')) return 'fix';
  if (cell === 'status') return 'status';
  if (cell === 'check' || cell === 'pass') return 'check';
  if (cell === 'rule') return 'rule';
  if (cell === 'cause') return 'cause';
  if (cell === 'owner') return 'owner';
  if (cell === 'device') return 'device';
  if (cell === 'attempt' || cell === 'round') return 'attempt';
  if (cell === 'steps' || cell.startsWith('steps ')) return 'steps';
  return null;
}

/**
 * A steps cell → { flow, steps, problems }. `flow:repro-rp1-01 · steps:repro/RP1-01/steps.md`:
 * the argent flow a MOBILE replay runs and the steps file every replay reads (a path in the run
 * folder, relative to it). An empty cell or a dash is no recorded test.
 */
export function parseSteps(text) {
  const cell = String(text ?? '').trim();
  const result = { flow: null, steps: null, problems: [] };
  if (EMPTY.has(cell.toLowerCase())) return result;
  for (const part of cell.split(/\s*(?:·|,|;)\s*/u).filter(Boolean)) {
    const match = STEP_PART.exec(part);
    if (!match) {
      result.problems.push(`"${part}" is not flow:<argent flow name> or steps:<file in the run folder>`);
      continue;
    }
    const [, key, value] = match;
    if (result[key]) result.problems.push(`two ${key}: parts`);
    else if (key === 'flow' && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) result.problems.push(`flow name "${value}" holds more than letters, digits, dots, dashes and underscores`);
    else if (key === 'steps' && (path.isAbsolute(value) || value.split(/[\\/]/u).includes('..'))) result.problems.push(`steps file "${value}" is not a path inside the run folder`);
    else result[key] = value;
  }
  if (result.flow && !result.steps) result.problems.push('a flow needs its steps file too (steps:<file>): the expected result and the data live there');
  return result;
}

/** Pure: the issues of parsed logs that carry a recorded test (a steps cell with a steps file). */
export const issuesWithSteps = (parsedLists) => parsedLists.flatMap((parsed) => parsed.rows).filter((row) => parseSteps(row.cells.steps).steps);

/** Cells of one Markdown table line; `\|` stays inside a cell. */
export function splitRow(line) {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  const cells = [];
  let current = '';
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '\\' && text[index + 1] === '|') {
      current += '|';
      index++;
    } else if (text[index] === '|') {
      cells.push(current.trim());
      current = '';
    } else current += text[index];
  }
  cells.push(current.trim());
  return cells;
}

const isSeparator = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/u.test(line);

/** "Home · e_abc" → { name, id, key }. The app shell and cross-page issues share one key. */
export function parsePage(text) {
  const cell = String(text ?? '').trim();
  const id = PAGE_ID.exec(cell)?.[0] ?? null;
  const name = cell.split(/\s+·\s+/u)[0].replace(PAGE_ID, '').trim() || null;
  const shell = !id && /app shell|cross-page|all pages|every page/iu.test(cell);
  return { name, id, key: id ?? (shell ? 'app-shell' : (name ?? '').toLowerCase().replace(/[^a-z0-9]+/gu, '-')) };
}

/** Parse one issue log. { file, header: [{key, value, line}], tables: [{ title, columns, rows }], rows, problems } (a row is one issue). */
export function parseIssues(text, file = '(text)') {
  const lines = String(text).split('\n');
  const header = [];
  const tables = [];
  const problems = [];
  let title = null;
  let heading = null;
  let table = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const number = index + 1;
    if (/^#\s/u.test(line) && !title) title = line.replace(/^#\s+/u, '').trim();
    if (/^#{2,6}\s/u.test(line)) heading = line.replace(/^#+\s+/u, '').trim();
    const bullet = /^-\s+([^:]{1,40}):\s*(.*)$/u.exec(line);
    if (bullet && !tables.length && !table) header.push({ key: bullet[1].trim(), value: bullet[2].trim(), line: number });
    if (!line.trim().startsWith('|')) {
      table = null;
      continue;
    }
    const cells = splitRow(line);
    if (!table) {
      if (!isSeparator(lines[index + 1] ?? '')) continue; // a lone pipe line is not a table
      const columns = cells.map(columnKey);
      if (!columns.includes('id') || !columns.includes('page')) {
        table = { skip: true };
        continue;
      }
      table = { title: heading, columns, rows: [], line: number };
      tables.push(table);
      const absent = COLUMNS.filter((key) => !columns.includes(key));
      if (absent.length) problems.push({ file, line: number, level: 'error', message: `table header lacks column(s): ${absent.join(', ')}` });
      const order = columns.filter((key) => ORDER.includes(key));
      if (!absent.length && order.join() !== ORDER.filter((key) => order.includes(key)).join()) problems.push({ file, line: number, level: 'warning', message: `columns are not in the shared order (${ORDER.join(', ')})` });
      index++; // the separator
      continue;
    }
    if (table.skip) continue;
    const row = { file, line: number, cells: {} };
    table.columns.forEach((key, column) => {
      if (key) row.cells[key] = cells[column] ?? '';
    });
    if (cells.length !== table.columns.length) problems.push({ file, line: number, level: 'error', id: row.cells.id, message: `${cells.length} cells, the header has ${table.columns.length} (escape a | inside a cell as \\|)` });
    row.page = parsePage(row.cells.page);
    table.rows.push(row);
  }
  return { file, title, header, tables, rows: tables.flatMap((item) => item.rows ?? []), problems };
}

/** Lint parsed logs: { problems[], issues, errors, warnings }. */
export function lintIssues(parsedLists, { allowDuplicates = false } = {}) {
  const problems = parsedLists.flatMap((parsed) => parsed.problems);
  const seen = new Map();
  for (const parsed of parsedLists) {
    if (!parsed.tables.length) problems.push({ file: parsed.file, line: 1, level: 'error', message: 'no issue table (a header row with id and page columns, then a --- separator)' });
    if (!parsed.header.length) problems.push({ file: parsed.file, line: 1, level: 'warning', message: 'no header lines (- Simulator: …, - App version seen: …, - Time: …) before the first table' });
    // A retest or replay result names how the version it ran on was proven; "unproven" is a valid answer, a missing line is not.
    const simulator = parsed.header.find((item) => item.key.toLowerCase() === 'simulator');
    if (/^retest-/u.test(path.basename(parsed.file)) && simulator && !/^none\b/iu.test(simulator.value) && !parsed.header.some((item) => item.key.toLowerCase() === 'version proof')) {
      problems.push({ file: parsed.file, line: 1, level: 'error', message: 'no "- Version proof: <how the version was proven | unproven>" header line (a retest says what proves the version it ran on)' });
    }
    for (const row of parsed.rows) {
      const { cells } = row;
      const at = { file: row.file, line: row.line, id: cells.id };
      const error = (message) => problems.push({ ...at, level: 'error', message });
      const warn = (message) => problems.push({ ...at, level: 'warning', message });
      if (!cells.id) error('no id');
      else if (!ID.test(cells.id)) warn(`id ${cells.id} is not <group>-<nn> (V1-09, V3-R06)`);
      if (cells.id) {
        const earlier = seen.get(cells.id);
        // merge and split take the same issue from several logs on purpose: a duplicate in one log is still an error.
        if (earlier && (!allowDuplicates || earlier.file === row.file)) error(`duplicate id ${cells.id} (first at ${earlier.file}:${earlier.line})`);
        else seen.set(cells.id, row);
      }
      if (EMPTY.has((cells.page ?? '').trim())) error('no page');
      else if (!row.page.id && row.page.key !== 'app-shell') warn(`page "${cells.page}" carries no page id (Name · e_…)`);
      const severity = (cells.severity ?? '').toLowerCase();
      if (!SEVERITIES.includes(severity)) error(`severity "${cells.severity ?? ''}" is not one of ${SEVERITIES.join(', ')}`);
      const kind = (cells.kind ?? '').toLowerCase();
      if (!KINDS.includes(kind)) warn(`kind "${cells.kind ?? ''}" is not one of ${KINDS.join(', ')}`);
      if (EMPTY.has((cells.evidence ?? '').trim().toLowerCase())) error('no evidence (an issue without evidence is not written)');
      if (EMPTY.has((cells.expected ?? '').trim())) warn('no expected value');
      if (EMPTY.has((cells.actual ?? '').trim())) warn('no actual value');
      if ('status' in cells && cells.status && !STATUSES.some((status) => cells.status.toLowerCase().startsWith(status))) warn(`status "${cells.status}" is not one of ${STATUSES.join(', ')}`);
      if ('check' in cells && cells.check && !CHECKS.includes(cells.check.toLowerCase())) warn(`check "${cells.check}" is not one of ${CHECKS.join(', ')}`);
      if ('owner' in cells && cells.owner && !EMPTY.has(cells.owner) && !OWNER.test(cells.owner)) error(`owner "${cells.owner}" is not page, module:<id>, card:<pageId>, automation:<id>, agent:<id>, object:<id>, platform, person or none`);
      if ('cause' in cells && cells.cause && !EMPTY.has(cells.cause) && !CAUSES.includes(cells.cause.toLowerCase())) warn(`cause "${cells.cause}" is not one of ${CAUSES.join(', ')}`);
      const owned = ownerOf(row).kind;
      const cause = String(cells.cause ?? '').toLowerCase();
      if ((cause === 'agent' && owned !== 'agent') || (owned === 'agent' && cause && !EMPTY.has(cause) && cause !== 'agent')) warn(`cause ${cause || '—'} and owner ${cells.owner} disagree: an AI agent's instructions, tools or knowledge are owned by agent:<id>`);
      if (owned === 'object' && cause && !EMPTY.has(cause) && cause !== 'object') warn(`owner ${cells.owner} takes object issues (a field, its type, a picklist value); cause is ${cause}`);
      if ('device' in cells && cells.device && !EMPTY.has(cells.device) && !DEVICE.test(cells.device)) warn(`device "${cells.device}" is not config, run, queued:<kind> or device`);
      if ('attempt' in cells && cells.attempt && !EMPTY.has(cells.attempt) && !/^\d+$/u.test(cells.attempt)) error(`attempt "${cells.attempt}" is not a whole number`);
      for (const message of parseSteps(cells.steps).problems) error(`steps: ${message}`);
      const reproduced = (cells.check ?? '').toLowerCase() === 'reproduce';
      if (reproduced && !parseSteps(cells.steps).steps && !/^escalated/iu.test(cells.status ?? '')) warn('a reproduced issue carries its recorded steps (steps:<file>), which its replay retest runs');
    }
  }
  const errors = problems.filter((problem) => problem.level === 'error').length;
  return { problems, issues: parsedLists.reduce((sum, parsed) => sum + parsed.rows.length, 0), errors, warnings: problems.length - errors };
}

export function renderLint(result) {
  const lines = result.problems.map((problem) => `${problem.level === 'error' ? '✗' : '!'} ${path.basename(problem.file)}:${problem.line}${problem.id ? ` ${problem.id}` : ''} — ${problem.message}`);
  lines.push(`${plural(result.issues, 'issue')}: ${plural(result.errors, 'error')}, ${plural(result.warnings, 'warning')}.`);
  return lines.join('\n');
}

const escapeCell = (text) => String(text ?? '').replace(/\|/gu, '\\|').replace(/\n/gu, ' ');

/** Issues → Markdown tables, one per page (app shell first), with a footer of counts. */
export function renderIssueList({ title, header = [], rows }) {
  const columns = ORDER.filter((key) => COLUMNS.includes(key) || rows.some((row) => row.cells[key]));
  const headings = columns.map((key) => TITLES[key]);
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.page.key)) groups.set(row.page.key, []);
    groups.get(row.page.key).push(row);
  }
  const keys = [...groups.keys()].sort((left, right) => (left === 'app-shell' ? -1 : right === 'app-shell' ? 1 : 0));
  const lines = [`# ${title}`, ...header.map((item) => `- ${item.key}: ${item.value}`)];
  const footer = [];
  for (const key of keys) {
    const pageRows = groups.get(key);
    const first = pageRows[0].page;
    lines.push('', `## ${key === 'app-shell' ? 'Cross-page (app shell)' : `${first.name ?? key}${first.id ? ` · ${first.id}` : ''}`}`, '');
    lines.push(`| ${headings.join(' | ')} |`, `|${headings.map(() => '---').join('|')}|`);
    for (const row of pageRows) lines.push(`| ${columns.map((column) => escapeCell(row.cells[column] ?? '')).join(' | ')} |`);
    const counts = SEVERITIES.map((severity) => `${pageRows.filter((row) => (row.cells.severity ?? '').toLowerCase() === severity).length} ${severity}`).join(' · ');
    footer.push(`- ${key === 'app-shell' ? 'App shell' : first.name ?? key}: ${counts}`);
  }
  lines.push('', '## Counts', '', ...footer);
  return `${lines.join('\n')}\n`;
}

export function readLists(files) {
  if (!files.length) throw usage('name at least one issue log file');
  return files.map((file) => {
    const resolved = path.resolve(file);
    if (!fs.existsSync(resolved)) throw usage(`${resolved} does not exist`);
    return parseIssues(fs.readFileSync(resolved, 'utf8'), resolved);
  });
}

/** The same issue in two logs (every cell equal) is kept once. One id on two different issues is
 *  never resolved by dropping one: it fails ISSUE_ID_COLLISION with both sources, so the agents that
 *  wrote them renumber (each request to a different runner gets its own start range). */
export function mergeIssues(parsedLists) {
  const kept = new Map();
  const collisions = [];
  for (const parsed of parsedLists) {
    for (const row of parsed.rows) {
      const id = row.cells.id || `${row.file}:${row.line}`;
      const earlier = kept.get(id);
      if (!earlier) {
        kept.set(id, row);
        continue;
      }
      if (JSON.stringify(earlier.cells) !== JSON.stringify(row.cells)) collisions.push({ id, first: `${earlier.file}:${earlier.line}`, second: `${row.file}:${row.line}` });
    }
  }
  if (collisions.length) {
    const lines = collisions.map((item) => `- ${item.id}: ${item.first} and ${item.second}`);
    throw new LoopsError(`Two different issues share ${collisions.length === 1 ? 'an id' : `${collisions.length} ids`}; renumber one side and merge again:\n${lines.join('\n')}`, { exit: EXIT.FAIL, code: 'ISSUE_ID_COLLISION', data: { collisions } });
  }
  const header = [...(parsedLists[0]?.header ?? []), { key: 'Merged from', value: parsedLists.map((parsed) => path.basename(parsed.file)).join(', ') }];
  const rows = [...kept.values()];
  return { issues: rows, markdown: renderIssueList({ title: `Issues — merged (${plural(parsedLists.length, 'log')})`, header, rows }) };
}

/** An issue's owner column: { kind: page|module|card|automation|agent|object|platform|person|none, id }. */
export function ownerOf(row) {
  const owner = String(row.cells.owner ?? '').trim();
  if (!owner || EMPTY.has(owner.toLowerCase()) || owner === 'page') return { kind: 'page', id: null };
  const at = owner.indexOf(':');
  const kind = (at < 0 ? owner : owner.slice(0, at)).toLowerCase();
  const id = at < 0 ? null : owner.slice(at + 1).trim() || null;
  return ['module', 'card', 'automation', 'agent', 'object', 'platform', 'person', 'none'].includes(kind) ? { kind, id } : { kind: 'page', id: null };
}

/** Issues people report (a ticket, a list, a chat) are only as good as their proof; an audit check brings its own evidence. */
export const REPORTED_CHECKS = ['triage', 'reproduce', 'test-author'];
export const PROVEN_DEVICE = ['config', 'device', 'run'];

/**
 * Pure: null when the issue may get a draft job, else the one question that would unblock it. A reported
 * issue is proven when its device cell says config (a read-back of the cause), device (reproduced on a
 * simulator) or run (automation test runs), or when it carries recorded steps. A log without the check
 * or device column is not judged.
 */
export function proofQuestion(row) {
  if (!('device' in row.cells) || !REPORTED_CHECKS.includes(String(row.cells.check ?? '').trim().toLowerCase())) return null;
  if (PROVEN_DEVICE.includes(String(row.cells.device ?? '').trim().toLowerCase()) || parseSteps(row.cells.steps).steps) return null;
  return 'On which steps does it happen on the device, or which setting read back from the app shows the cause?';
}

const OWNER_JOBS = {
  platform: 'renderer fixes no page setting can make (the platform job)',
  person: 'steps only the person or the client side can take',
};
const UNPROVEN_JOB = 'no draft job: not reproduced on a device and no config read-back yet; each issue goes to the person with the one question that would unblock it';
const AUTOMATION_JOB = 'an automation job: saved and test-run by the automation agent, deployed once its test run passes, its callers retested';
const AGENT_JOB = 'an AI agent job: changed and tested by the agent builder, published only on the agent publish approval, the pages that chat with it retested';
const OBJECT_JOB = 'an object job: changed by the fde agent only on the object approval, the pages and automations that use it retested';

/**
 * Pure: issues → jobs. shared: page ids that impact says several pages use (modules, card pages);
 * dependents: Map id → the pages to retest after a fix to it; all: keep settled issues too.
 */
export function splitJobs(rows, { jobs = 1, shared = new Set(), dependents = new Map(), names = new Map(), all = false, allowUnproven = false } = {}) {
  const skipped = [];
  const own = new Map();
  const pages = new Map();
  const ownJob = (name, reason, retest = []) => {
    if (!own.has(name)) own.set(name, { name, reason, rows: [], retest, questions: [] });
    return own.get(name);
  };
  const seen = new Set();
  for (const row of rows) {
    const id = row.cells.id;
    if (id && seen.has(id)) continue; // the same issue from two logs: the first one counts
    if (id) seen.add(id);
    const status = String(row.cells.status ?? '').trim().toLowerCase();
    if (!all && SETTLED.some((settled) => status.startsWith(settled))) {
      skipped.push({ id, reason: `status ${status}` });
      continue;
    }
    const owner = ownerOf(row);
    if (owner.kind === 'none') {
      skipped.push({ id, reason: 'owner none' });
      continue;
    }
    const question = allowUnproven || owner.kind === 'person' || owner.kind === 'platform' ? null : proofQuestion(row);
    if (question) {
      const job = ownJob('person-unproven', UNPROVEN_JOB);
      job.rows.push(row);
      job.questions.push({ id, question });
      continue;
    }
    if (owner.kind === 'automation') {
      // One job per automation: each has its own test runs, deploy and callers.
      ownJob(owner.id ? `automation-${slug(names.get(owner.id) ?? owner.id)}` : 'automation', owner.id ? `${AUTOMATION_JOB} (${owner.id})` : AUTOMATION_JOB).rows.push(row);
      continue;
    }
    if (owner.kind === 'agent' || owner.kind === 'object') {
      // One job per AI agent or object, like an automation: each has its own release and its own users.
      const reason = owner.kind === 'agent' ? AGENT_JOB : OBJECT_JOB;
      ownJob(owner.id ? `${owner.kind}-${slug(names.get(owner.id) ?? owner.id)}` : owner.kind, owner.id ? `${reason} (${owner.id})` : reason).rows.push(row);
      continue;
    }
    if (OWNER_JOBS[owner.kind]) {
      ownJob(owner.kind, OWNER_JOBS[owner.kind]).rows.push(row);
      continue;
    }
    if (owner.kind === 'module' || owner.kind === 'card') {
      const target = owner.id ?? row.page.id ?? row.page.key;
      ownJob(`${owner.kind}-${slug(names.get(target) ?? target)}`, `the ${owner.kind} ${target}: fixed once, its dependent pages retested`, dependents.get(target) ?? []).rows.push(row);
      continue;
    }
    if (row.page.key === 'app-shell') {
      ownJob('app-shell', 'issues on every page (navigation, status bar, theme)').rows.push(row);
      continue;
    }
    if (row.page.id && shared.has(row.page.id)) {
      ownJob(`shared-${slug(names.get(row.page.id) ?? row.page.name ?? row.page.id)}`, `a module or card page used by several pages: fixed once, its dependents retested`, dependents.get(row.page.id) ?? []).rows.push(row);
      continue;
    }
    if (!pages.has(row.page.key)) pages.set(row.page.key, { key: row.page.key, id: row.page.id, name: row.page.name ?? names.get(row.page.id) ?? null, rows: [] });
    pages.get(row.page.key).rows.push(row);
  }
  const rest = [...pages.values()].sort((left, right) => right.rows.length - left.rows.length || String(left.key).localeCompare(String(right.key)));
  const count = Math.max(1, Math.min(rest.length, jobs - own.size));
  const buckets = Array.from({ length: rest.length ? count : 0 }, (_, index) => ({ name: `job-${index + 1}`, reason: 'pages packed by issue count', rows: [], size: 0, retest: [] }));
  for (const page of rest) {
    const bucket = buckets.reduce((best, item) => (item.size < best.size ? item : best), buckets[0]);
    bucket.rows.push(...page.rows);
    bucket.size += page.rows.length;
  }
  const pagesOf = (jobRows) => {
    const seen = new Map();
    for (const row of jobRows) {
      if (!seen.has(row.page.key)) seen.set(row.page.key, { key: row.page.key, id: row.page.id, name: row.page.name ?? names.get(row.page.id) ?? null, issues: 0 });
      seen.get(row.page.key).issues += 1;
    }
    return [...seen.values()];
  };
  const notes = own.size > jobs ? [`${own.size} jobs are forced (app shell, modules, cards, automations, AI agents, objects, platform, person), more than the ${jobs} asked for`] : [];
  return {
    jobs: [...own.values(), ...buckets].map((job) => ({
      name: job.name,
      reason: job.reason,
      pages: pagesOf(job.rows),
      issues: job.rows.length,
      ids: job.rows.map((row) => row.cells.id),
      retest: job.retest ?? [],
      questions: job.questions ?? [],
      _rows: job.rows,
    })),
    skipped,
    notes,
  };
}

const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 40) || 'page';

/** impact --json output → { shared, dependents, names }. */
export function sharedFromImpact(impact) {
  const shared = new Set();
  const dependents = new Map();
  const names = new Map();
  for (const item of impact?.shared ?? []) {
    if (item.name) names.set(item.id, item.name);
    if ((item.usedBy ?? []).length > 1) {
      shared.add(item.id);
      dependents.set(item.id, [...item.usedBy]);
    }
  }
  return { shared, dependents, names };
}

export function writeJobs({ split, outDir, header }) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const job of split.jobs) {
    const file = path.join(outDir, `issues-${job.name}.md`);
    const jobHeader = [...header, { key: 'Job', value: `${job.name} (${job.reason})` }, ...(job.retest.length ? [{ key: 'Retest after a fix', value: job.retest.join(', ') }] : []),
      ...job.questions.map((item) => ({ key: `Question ${item.id}`, value: item.question }))];
    writeText(file, renderIssueList({ title: `Issues — ${job.name} (${job.pages.map((page) => page.name ?? page.key).join(', ')})`, header: jobHeader, rows: job._rows }));
    files.push(file);
  }
  const jobs = split.jobs.map(({ _rows, ...job }, index) => ({ ...job, file: path.basename(files[index]) }));
  writeJson(path.join(outDir, 'jobs.json'), { jobs, skipped: split.skipped, notes: split.notes });
  return { jobs, skipped: split.skipped, files, notes: split.notes, outDir };
}

export function renderSplit(result) {
  const lines = [`${plural(result.jobs.length, 'job')} in ${result.outDir}:`];
  for (const job of result.jobs) {
    lines.push(`  ${job.name}: ${plural(job.issues, 'issue')} on ${job.pages.map((page) => page.name ?? page.key).join(', ')}${job.retest.length ? ` · retest after: ${job.retest.length} pages` : ''}`);
  }
  if (result.skipped.length) lines.push(`Left out: ${result.skipped.map((item) => `${item.id} (${item.reason})`).join(', ')}`);
  for (const note of result.notes) lines.push(`Note: ${note}`);
  return lines.join('\n');
}

export function assertLintClean(parsedLists) {
  const lint = lintIssues(parsedLists, { allowDuplicates: true });
  if (lint.errors) throw failed(`the logs have ${plural(lint.errors, 'error')}; run issues lint`, lint);
  return lint;
}
