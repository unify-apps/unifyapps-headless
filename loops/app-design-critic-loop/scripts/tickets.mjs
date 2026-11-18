#!/usr/bin/env node
// The ticket stage of a web app review: the merged issues become one ticket per root cause, checked and
// rendered the way the Test Studio ticket loop files its tickets (app-test-ticket-loop's ticket reference),
// with issue ids in place of test case ids. Node 22, no packages, no network: the filing is the session's.
//
//   node tickets.mjs draft  --merged <RUN/merged.md> --out <RUN/tickets.json> [--nitpicks]
//       one ticket per root-cause key, its fields filled from the issues; nitpicks go to notTicketed
//       with the reason `nitpick` unless --nitpicks says the person wants them filed too
//   node tickets.mjs check  --tickets <RUN/tickets.json> --merged <RUN/merged.md> [--nitpicks] [--earlier <folder of runs>] [--json]
//       exit 0 when every critical, high and minor issue is in exactly one ticket or one not-ticketed row
//       and every ticket has its fields; --earlier names the fingerprints an earlier run of the folder filed
//   node tickets.mjs render --tickets <RUN/tickets.json> --merged <RUN/merged.md> --out <RUN/tickets> [--app-url <url>] [--run <id>] [--report <path>] [--tracker-host <host>]
//       one description per ticket, refused while the check is not complete, plus the proposed list
//       (tickets-proposed.md beside the folder): the tables the person reads before the approval
//   node tickets.mjs list   --tickets <RUN/tickets.json> --merged <RUN/merged.md> --out <RUN/tickets-proposed.md> [--tracker-host <host>]
//       the proposed list alone, for a rerun after the person dropped or renamed a ticket
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOT_TICKETED_REASONS, ticketsCheck, ticketsProposed } from '../../../skills/app-test-author/scripts/loop.mjs';

// A nitpick is listed in the report and left out of the tickets unless the person asks (SKILL.md, Tickets).
export const NITPICK_REASON = 'nitpick';
export const REASONS = Object.freeze([...NOT_TICKETED_REASONS, NITPICK_REASON]);
// The fingerprint line a review ticket carries, beside the test loops' `nebula-test-bug/` (ticket.md, Dedupe).
export const FINGERPRINT_PREFIX = 'nebula-review-bug';
// merged.md numbers its issues C1…, H1…, M1…, N1… (SKILL.md, Verify and merge).
const ISSUE_HEADING = /^#{3,4}\s+([CHMN]\d+)\s*[·:-]\s*(.+?)\s*$/u;
const FIELD = /^-\s+\*\*([^*]+?):\*\*\s*(.*)$/u;
const SEVERITY_PRIORITY = Object.freeze({ critical: 'high', high: 'medium', minor: 'low', nitpick: 'low' });
const FINGERPRINT_WORDS = 12;

/** The issues of merged.md: id, title, and every field line of the taxonomy issue shape. */
export function readMerged(text) {
  const issues = [];
  let current = null;
  let field = null;
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.replace(/\s+$/u, '');
    const heading = line.match(ISSUE_HEADING);
    if (heading) {
      current = { id: heading[1], title: heading[2].trim(), fields: {} };
      issues.push(current);
      field = null;
      continue;
    }
    if (!current) continue;
    if (/^#{1,2}\s/u.test(line)) { current = null; field = null; continue; }
    const match = line.match(FIELD);
    if (match) {
      field = match[1].trim().toLowerCase();
      current.fields[field] = match[2].trim();
      continue;
    }
    if (field && /^\s+\S/u.test(line)) current.fields[field] = `${current.fields[field]}\n${line.trim()}`.trim();
  }
  return issues.map((issue) => ({
    id: issue.id,
    title: issue.title,
    severity: (issue.fields.severity ?? severityOfId(issue.id)).toLowerCase(),
    category: issue.fields.category ?? '',
    pages: (issue.fields.pages ?? '').split(',').map((page) => page.trim()).filter(Boolean),
    width: issue.fields.width ?? '',
    sees: issue.fields['what the user sees'] ?? '',
    why: issue.fields['why it matters'] ?? '',
    evidence: issue.fields.evidence ?? '',
    steps: issue.fields['steps to see it'] ?? '',
    good: issue.fields['what good looks like'] ?? '',
    confidence: issue.fields.confidence ?? '',
    key: issue.fields['root cause key'] ?? `other:${issue.id.toLowerCase()}`,
  }));
}

const severityOfId = (id) => ({ C: 'critical', H: 'high', M: 'minor', N: 'nitpick' })[id[0]] ?? 'minor';
const isNitpick = (issue) => issue.severity === 'nitpick';
const slug = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
const pageName = (page) => page.replace(/^\d+-/u, '');

/** A fingerprint from the root-cause key and the first page: the same defect next run gets the same one. */
export function fingerprintOf(key, firstPage) {
  const words = `${slug(key.replace(/^other:/u, ''))}-${slug(pageName(firstPage ?? ''))}`.split('-').filter(Boolean);
  const unique = words.filter((word, index) => words.indexOf(word) === index).slice(0, FINGERPRINT_WORDS);
  return unique.length > 1 ? unique.join('-') : `${unique[0] ?? 'issue'}-review`;
}

const widthWords = (width) => (/^\d+$/u.test(String(width)) ? `${width} CSS px` : width === 'both' ? 'the design width and at 375 CSS px' : 'the design width');
const stepsOf = (text) => String(text ?? '').split(/\n|(?<=\S)\s+(?=\d+\.\s)/u).map((step) => step.replace(/^\d+\.\s*/u, '').trim()).filter(Boolean);
const evidenceOf = (issue) => String(issue.evidence ?? '').split(/;\s+|\n/u).map((item) => item.trim()).filter(Boolean).map((item) => `${issue.id}: ${item}`);

/** The first draft of tickets.json: one ticket per root-cause key, filled from its issues. */
export function draftTickets(issues, { nitpicks = false } = {}) {
  const groups = new Map();
  const notTicketed = [];
  for (const issue of issues) {
    if (isNitpick(issue) && !nitpicks) { notTicketed.push({ executionId: issue.id, reason: `${NITPICK_REASON}: listed in the report, not filed unless asked` }); continue; }
    if (!groups.has(issue.key)) groups.set(issue.key, []);
    groups.get(issue.key).push(issue);
  }
  const tickets = [...groups.entries()].map(([key, group]) => {
    const first = group[0];
    const firstPage = first.pages[0] ?? '';
    const pages = [...new Set(group.flatMap((issue) => issue.pages))];
    const worst = ['critical', 'high', 'minor', 'nitpick'].find((severity) => group.some((issue) => issue.severity === severity)) ?? 'minor';
    const withSteps = group.find((issue) => issue.steps);
    return {
      fingerprint: fingerprintOf(key, firstPage),
      title: `${pageName(firstPage) || 'App'}: ${first.title}`.slice(0, 120),
      rootCause: [`Root cause key ${key}, seen on ${pages.length} page${pages.length === 1 ? '' : 's'} (${pages.map(pageName).join(', ')}).`, first.why].filter(Boolean).join(' '),
      expected: first.good || 'See the issue.',
      observed: first.sees || 'See the issue.',
      reproduce: withSteps ? stepsOf(withSteps.steps) : [`Open ${pageName(firstPage) || 'the app'} at ${widthWords(first.width)}`, first.sees].filter(Boolean),
      cases: group.map((issue) => issue.id),
      evidence: group.flatMap(evidenceOf),
      kind: 'bug',
      layer: 'UI',
      priority: SEVERITY_PRIORITY[worst],
      module: pageName(firstPage) || 'App',
      severity: worst,
      widths: [...new Set(group.map((issue) => issue.width).filter(Boolean))],
    };
  });
  return { tickets, notTicketed };
}

/** The check: loop.mjs's ticketsCheck over the issues, plus the nitpick rule. */
export function checkTickets(list, issues, { nitpicks = false } = {}) {
  const ticketable = issues.filter((issue) => nitpicks || !isNitpick(issue));
  const classified = { reds: ticketable.map((issue) => ({ executionId: issue.id, verdict: 'App bug', name: `${issue.id} · ${issue.title}` })) };
  const nitpickRows = (list?.notTicketed ?? []).filter((row) => String(row?.reason ?? '').startsWith(NITPICK_REASON));
  const result = ticketsCheck({ ...list, notTicketed: (list?.notTicketed ?? []).filter((row) => !nitpickRows.includes(row)) }, classified);
  const problems = [...result.problems];
  if (!nitpicks) {
    const inTickets = new Set((list?.tickets ?? []).flatMap((ticket) => ticket.cases ?? []));
    const rowed = new Set(nitpickRows.map((row) => row.executionId));
    for (const issue of issues.filter(isNitpick)) {
      if (inTickets.has(issue.id)) problems.push(`${issue.id} is a nitpick: not ticketed unless the person asks (then run with --nitpicks)`);
      else if (!rowed.has(issue.id)) problems.push(`${issue.id} is a nitpick with no not-ticketed row (reason \`${NITPICK_REASON}\`)`);
    }
    for (const row of nitpickRows) if (!issues.some((issue) => issue.id === row.executionId && isNitpick(issue))) problems.push(`not-ticketed row ${row.executionId}: reason \`${NITPICK_REASON}\` but the issue is not a nitpick`);
  }
  const missing = result.cases.missing;
  return { complete: problems.length === 0 && missing.length === 0, tickets: result.tickets, issues: { total: issues.length, ticketable: ticketable.length, ticketed: result.cases.ticketed, notTicketed: (list?.notTicketed ?? []).length, missing }, problems };
}

/** Fingerprints an earlier run of this folder already filed, with their ticket keys. */
export function earlierFiled(folder, { except = null } = {}) {
  const filed = [];
  if (!folder || !fs.existsSync(folder)) return filed;
  for (const name of fs.readdirSync(folder)) {
    const file = path.join(folder, name, 'tickets.json');
    if (except && path.resolve(path.join(folder, name)) === path.resolve(except)) continue;
    if (!fs.existsSync(file)) continue;
    let list;
    try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    for (const ticket of list?.tickets ?? []) if (ticket?.filed?.key) filed.push({ fingerprint: ticket.fingerprint, key: ticket.filed.key, url: ticket.filed.url ?? null, status: ticket.filed.status ?? null, run: name });
  }
  return filed;
}

/** One ticket's description: bold lines for sections, never a heading. */
export function ticketBody(ticket, issues, { appUrl, runId, reportPath } = {}) {
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  const lines = ['**Root cause**', '', String(ticket.rootCause).trim(), '', '**Expected**', '', String(ticket.expected).trim(), '', '**Observed**', '', String(ticket.observed).trim(), ''];
  if (ticket.reproduce?.length) lines.push('**To reproduce**', '', ...ticket.reproduce.map((step, index) => `${index + 1}. ${step}`), '');
  if (ticket.related?.length) lines.push('**Related**', '', ...ticket.related.map((item) => `- ${item}`), '');
  lines.push(`**Review issues (${ticket.cases.length})**`, '');
  for (const id of ticket.cases) {
    const issue = byId.get(id);
    const where = issue ? [issue.pages.map(pageName).join(', '), issue.width].filter(Boolean).join(' at ') : '';
    lines.push(`- ${id} · ${issue?.title ?? id}${where ? ` — ${where}` : ''}${issue?.severity ? ` (${issue.severity})` : ''}`);
  }
  lines.push('', '**Evidence**', '', ...ticket.evidence.map((item) => `- ${item}`), '');
  const facts = [];
  if (appUrl) facts.push(`App: ${appUrl}`);
  if (runId) facts.push(`Review run: ${runId}`);
  if (reportPath) facts.push(`Report: ${reportPath}`);
  facts.push(`Fingerprint: ${FINGERPRINT_PREFIX}/${ticket.fingerprint}`);
  lines.push('---', '', ...facts.map((fact) => `- ${fact}`), '', '_Filed by UnifyApps Headless from a web app review; the issues above show it in the report._');
  return `${lines.join('\n')}\n`;
}

/** The proposed list: loop.mjs's page with issue ids named `C1 · <title>`. */
export function proposedPage(list, issues, { trackerHost = null } = {}) {
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  return ticketsProposed(list, { label: (id) => (byId.has(id) ? `${id} · ${byId.get(id).title}` : String(id)), idWord: 'issues', trackerHost, title: 'Proposed tickets from the review' });
}

function usage(message) {
  const text = [message,
    'usage: node tickets.mjs draft  --merged <merged.md> --out <tickets.json> [--nitpicks]',
    '       node tickets.mjs list   --tickets <tickets.json> --merged <merged.md> --out <tickets-proposed.md> [--tracker-host <host>]',
    '       node tickets.mjs check  --tickets <tickets.json> --merged <merged.md> [--nitpicks] [--earlier <folder>] [--json]',
    '       node tickets.mjs render --tickets <tickets.json> --merged <merged.md> --out <folder> [--app-url <url>] [--run <id>] [--report <path>] [--tracker-host <host>]'].filter(Boolean).join('\n');
  process.stderr.write(`${text}\n`);
  process.exit(2);
}

function flagsOf(args) {
  const flags = {};
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at];
    if (!arg.startsWith('--')) usage(`unexpected argument ${arg}`);
    const name = arg.slice(2);
    if (['json', 'help', 'nitpicks'].includes(name)) { flags[name] = true; continue; }
    const value = args[at + 1];
    if (value === undefined || value.startsWith('--')) usage(`--${name} needs a value`);
    flags[name] = value;
    at += 1;
  }
  return flags;
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { process.stderr.write(`cannot read ${file}: ${error.message}\n`); process.exit(1); } };
const readText = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch (error) { process.stderr.write(`cannot read ${file}: ${error.message}\n`); process.exit(1); } };

function main(argv) {
  const [command, ...args] = argv;
  if (!command || command === '--help' || command === '-h') usage();
  if (!['draft', 'check', 'render', 'list'].includes(command)) usage(`unknown command ${command}`);
  const flags = flagsOf(args);
  if (flags.help) usage();
  if (typeof flags.merged !== 'string') usage('--merged <merged.md> is required');
  const issues = readMerged(readText(flags.merged));
  if (!issues.length) { process.stderr.write(`${flags.merged} holds no issue heading (### C1 · <title>)\n`); process.exit(1); }
  if (command === 'draft') {
    if (typeof flags.out !== 'string') usage('--out <tickets.json> is required');
    const draft = draftTickets(issues, { nitpicks: Boolean(flags.nitpicks) });
    fs.mkdirSync(path.dirname(path.resolve(flags.out)), { recursive: true });
    fs.writeFileSync(flags.out, `${JSON.stringify(draft, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ wrote: flags.out, tickets: draft.tickets.length, notTicketed: draft.notTicketed.length })}\n`);
    return;
  }
  if (typeof flags.tickets !== 'string') usage('--tickets <tickets.json> is required');
  const list = readJson(flags.tickets);
  const trackerHost = typeof flags['tracker-host'] === 'string' ? flags['tracker-host'] : null;
  if (command === 'list') {
    if (typeof flags.out !== 'string') usage('--out <tickets-proposed.md> is required');
    fs.mkdirSync(path.dirname(path.resolve(flags.out)), { recursive: true });
    fs.writeFileSync(flags.out, proposedPage(list, issues, { trackerHost }));
    process.stdout.write(`${JSON.stringify({ wrote: flags.out, tickets: (list.tickets ?? []).length, notTicketed: (list.notTicketed ?? []).length })}\n`);
    return;
  }
  const result = checkTickets(list, issues, { nitpicks: Boolean(flags.nitpicks) });
  if (command === 'check') {
    if (typeof flags.earlier === 'string') {
      const mine = new Set((list.tickets ?? []).map((ticket) => ticket.fingerprint));
      result.alreadyFiled = earlierFiled(flags.earlier, { except: path.dirname(path.resolve(flags.tickets)) }).filter((row) => mine.has(row.fingerprint));
    }
    if (flags.json) process.stdout.write(`${JSON.stringify(result, null, 1)}\n`);
    else {
      process.stdout.write(`${result.complete ? 'complete' : 'not complete'}: ${result.tickets} tickets over ${result.issues.ticketed} of ${result.issues.ticketable} ticketable issues, ${result.issues.notTicketed} not ticketed\n`);
      for (const problem of result.problems) process.stdout.write(`- ${problem}\n`);
      for (const id of result.issues.missing) process.stdout.write(`- ${id} is in no ticket and no not-ticketed row\n`);
      for (const row of result.alreadyFiled ?? []) process.stdout.write(`- ${row.fingerprint} was filed as ${row.key} by run ${row.run}${row.status ? ` (${row.status})` : ''}\n`);
    }
    if (!result.complete) process.exitCode = 1;
    return;
  }
  if (typeof flags.out !== 'string') usage('--out <folder> is required');
  if (!result.complete) { process.stdout.write(`${JSON.stringify(result, null, 1)}\n`); process.exitCode = 1; return; }
  fs.mkdirSync(flags.out, { recursive: true });
  const written = [];
  for (const ticket of list.tickets) {
    const file = path.join(flags.out, `${ticket.fingerprint}.md`);
    fs.writeFileSync(file, ticketBody(ticket, issues, { appUrl: flags['app-url'], runId: flags.run, reportPath: flags.report }));
    written.push(file);
  }
  const proposed = path.join(path.dirname(path.resolve(flags.out)), 'tickets-proposed.md');
  fs.writeFileSync(proposed, proposedPage(list, issues, { trackerHost }));
  process.stdout.write(`${JSON.stringify({ wrote: written, proposed })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
