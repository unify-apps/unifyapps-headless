// Issues in the orchestrator's one shape (loop-orchestrator's references/formats.md § Issue
// log): JSON with the keys below, and the Markdown issue log `loops issues lint|merge|split`
// read. Pure, except writeOutputs.
import fs from 'node:fs';
import path from 'node:path';

export const KEYS = ['id', 'page', 'region', 'check', 'rule', 'severity', 'kind', 'expected', 'actual', 'evidence', 'fix', 'owner', 'device', 'status', 'attempt'];
export const TITLES = ['id', 'page (name · id)', 'region / element', 'check', 'rule', 'severity', 'kind', 'expected', 'actual', 'evidence', 'fix hint', 'owner', 'device', 'status', 'attempt'];
// The touch feedback check (MOBILE) and the interaction check (WEB) are one check per platform: both PR.
export const CHECK_CODES = Object.freeze({ ui: 'UI', 'touch-feedback': 'PR', interaction: 'PR', perf: 'PF', security: 'SC', data: 'DA', logic: 'LG', a11y: 'AY', responsive: 'RS', triage: 'TR' });
export const SEVERITIES = ['critical', 'major', 'minor'];

/** `<code><group>-<nn>`, e.g. PR2-03. */
export function issueId(code, group, n) {
  return `${code}${group}-${String(n).padStart(2, '0')}`;
}

/** `<Page> · <pageId>`; a finding outside the page root (the app's navigation, header) is `app shell`. */
export function pageCell({ name = null, id = null, shell = false } = {}) {
  if (shell) return 'app shell';
  if (name && id) return `${name} · ${id}`;
  return id ?? name ?? 'app shell';
}

/** `<display name or type> b_…`, the block a finding sits in; `what` is the element inside it. */
export function regionCell({ blockId = null, blockType = null, what = null }, displayNames = new Map()) {
  const named = blockId ? displayNames.get(blockId) ?? blockType : null;
  const blockPart = blockId ? `${named ? `${named} ` : ''}${blockId}` : null;
  return [what, blockPart].filter(Boolean).join(' in ') || '—';
}

/** Block id → display name from a `ua cache blocks --json` export ({ blocks: [...] } or a list). */
export function displayNamesFrom(json) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.blocks) ? json.blocks : Object.values(json?.properties?.blocks ?? {});
  return new Map(list.filter((block) => block?.id).map((block) => [block.id, block.displayName ?? null]));
}

export function readDisplayNames(file) {
  if (!file) return new Map();
  return displayNamesFrom(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/**
 * Findings → issues. A finding carries rule, severity, kind, expected, actual, evidence, fix and
 * where it is ({ blockId, blockType, what, inPage }); the run gives the check, the id code and
 * group, the page and the device column.
 */
export function numberIssues(findings, { check, code = CHECK_CODES[check] ?? 'W', group = 1, start = 1, page = {}, displayNames = new Map(), device = 'device', owner = 'page' } = {}) {
  return findings.map((finding, index) => ({
    id: issueId(code, group, start + index),
    page: pageCell({ ...page, shell: finding.inPage === false }),
    region: regionCell(finding, displayNames),
    check,
    rule: finding.rule,
    severity: finding.severity,
    kind: finding.kind,
    expected: finding.expected,
    actual: finding.actual,
    evidence: finding.evidence,
    fix: finding.fix ?? '—',
    owner: finding.owner ?? owner,
    device,
    status: 'open',
    attempt: 0,
  }));
}

export function counts(issues) {
  const out = { issues: issues.length, critical: 0, major: 0, minor: 0 };
  for (const issue of issues) if (SEVERITIES.includes(issue.severity)) out[issue.severity] += 1;
  return out;
}

const cell = (value) => String(value ?? '').replace(/\|/gu, '\\|').replace(/\s*\n\s*/gu, ' ').trim() || '—';

const tableHead = (page) => ['', `## ${page === 'app shell' ? 'Cross-page (app shell)' : page}`, '', `| ${TITLES.join(' | ')} |`, `|${TITLES.map(() => '---').join('|')}|`];

/**
 * The issue log: `# title`, the header lines, then one table per page (the app shell first) and
 * a footer of counts per page. `header` is [[key, value], …]. A check that found nothing still
 * writes the table's header under `page` (the page cell): zero rows is a valid log.
 */
export function renderIssueLog({ title, header = [], issues, notReached = [], page: checkedPage = null }) {
  const lines = [`# ${title}`, ...header.map(([key, value]) => `- ${key}: ${value}`)];
  const groups = new Map();
  for (const issue of issues) {
    if (!groups.has(issue.page)) groups.set(issue.page, []);
    groups.get(issue.page).push(issue);
  }
  const pages = [...groups.keys()].sort((left, right) => (left === 'app shell' ? -1 : right === 'app shell' ? 1 : 0));
  for (const page of pages) {
    lines.push(...tableHead(page));
    for (const issue of groups.get(page)) lines.push(`| ${KEYS.map((key) => cell(issue[key])).join(' | ')} |`);
  }
  if (!issues.length) lines.push(...tableHead(checkedPage ?? 'Page'), '', 'No issues: every check passed.');
  lines.push('', '## Footer', '');
  for (const page of pages) {
    const c = counts(groups.get(page));
    lines.push(`- ${page}: ${c.critical} critical · ${c.major} major · ${c.minor} minor`);
  }
  lines.push(`- Not reached: ${notReached.length ? notReached.join('; ') : 'none'}`);
  return `${lines.join('\n')}\n`;
}

/** Writes issues as JSON and as an issue log, when asked; answers the paths written. */
export function writeOutputs({ issues, json = null, md = null, title, header = [], notReached = [], page = null }) {
  const written = {};
  if (json) {
    fs.mkdirSync(path.dirname(path.resolve(json)), { recursive: true });
    fs.writeFileSync(json, `${JSON.stringify(issues, null, 2)}\n`);
    written.json = json;
  }
  if (md) {
    fs.mkdirSync(path.dirname(path.resolve(md)), { recursive: true });
    fs.writeFileSync(md, renderIssueLog({ title, header, issues, notReached, page }));
    written.issues = md;
  }
  return written;
}

/** A path for the evidence column: relative to the run folder when one is given. */
export function evidencePath(file, run = null) {
  if (!file) return null;
  const rel = run ? path.relative(path.resolve(run), path.resolve(file)) : file;
  return rel.split(path.sep).join('/');
}
