#!/usr/bin/env node
// tickets.mjs turns a review's findings into tickets, one per finding, and keeps the ledger
// that stops the same finding being filed twice. It calls nothing and sends nothing: the person
// files the tickets in their own tracker and hands the keys back here.
//   node tickets.mjs contract --run <run folder> --team <team id> --owner <email> [--project <id>] [--page-owner <email>] [--automation-owner <email>] [--host <tracker host>] [--prefix <text>]
//   node tickets.mjs plan --run <run folder> [--min P0|P1|P2|P3] [--include-low]
//   node tickets.mjs record --run <run folder> --filed <file>
// The contract and the ledger live beside the app's runs, in reviews/<app id>/tickets.json.
// plan writes <run>/tickets/plan.json; record writes each filed key into the ledger and report.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrub } from './page.mjs';

const SEVERITIES = ['P0', 'P1', 'P2', 'P3'];
// A tracker's own words; P0 is a wait the person meets in normal use, not an outage, so it is high.
const PRIORITY = { P0: 'high', P1: 'medium', P2: 'low', P3: 'low' };
const SOURCE = { platform: "the platform's checks", script: 'the rule script', reviewer: 'a reviewer agent' };
// A ticket list reads well up to about 120 characters, well under any tracker's own limit.
const TITLE_MAX = 120;

const readJson = file => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const ledgerPath = runDir => path.join(path.dirname(runDir), 'tickets.json');
/** A title that fits: the finding's first clause when it carries the point, else whole words up to `max`. */
export function clip(text, max) {
  if (text.length <= max) return text;
  const clause = /^(.{40,}?)(?:[;:]\s|, so |, which |\. )/u.exec(text)?.[1];
  if (clause && clause.length <= max) return clause;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/u, '').replace(/[,;:]$/u, '')}…`;
}

/**
 * The same finding in a later run gets the same fingerprint: its rule and what it is on, a target,
 * a page, or every place it was found. A finding no rule names is keyed by its area and target, as
 * the report merges it, since its title is a reviewer's own words and changes from run to run.
 */
export function fingerprint(appId, item) {
  const on = item.places ? 'all' : item.target?.id ?? item.page?.id ?? 'app';
  return `nebula-app-config-review/${appId}/${item.rule ?? `${String(item.area ?? 'other').toLowerCase()}-no-rule`}/${on}`;
}

const placeLine = place => `- ${place.page?.label ?? place.page?.name ?? 'The whole app'}${place.target?.name ? `: ${place.target.kind} \`${place.target.name}\`` : ''}${place.target?.id ? ` (\`${place.target.id}\`)` : ''}${place.evidence ? ` — ${place.evidence}` : ''}`;

/** The ticket's markdown: what is wrong, where, the evidence, the fix, and the lines a later run matches on. */
export function describe(item, { report, print }) {
  const places = item.places ?? [{ page: item.page, target: item.target, evidence: item.evidence }];
  const found = [`Found by ${SOURCE[item.source] ?? item.source}`, `${item.confidence} confidence`, item.doubleChecked ? 'double-checked by a second model' : null].filter(Boolean).join(', ');
  return scrub([
    `**What is wrong**`, '', item.title, '',
    `**Where** (${places.length} place${places.length === 1 ? '' : 's'})`, '', ...places.map(placeLine), '',
    ...(item.fix ? ['**Fix**', '', item.fix, ''] : []),
    `**Severity** ${item.severity}${item.rule ? ` · rule \`${item.rule}\`` : ''}`, '',
    `${found}. ${report.focus === 'perf' ? 'Speed review' : 'Config review'} ${report.run} of ${report.app.name} (\`${report.app.id}\`), finding ${item.ref}.`, '',
    `Fingerprint: ${print}`,
  ].join('\n'));
}

/** Which owner a finding goes to: an automation's to the automation owner, the rest to the page owner. */
const ownerOf = (item, owners) => {
  const automation = item.area === 'AUTO' || /automation/u.test(item.target?.kind ?? '') || (item.places ?? []).some(place => /automation/u.test(place.target?.kind ?? ''));
  return (automation ? owners.automation : owners.page) ?? owners.default;
};

/**
 * One ticket per finding at or above `min`, low confidence left out unless asked: those need a
 * person to read them first. A fingerprint the ledger holds is `check`: the session reads that
 * ticket and comments on it while it is open, or files a regression when it was closed.
 */
export function planTickets(report, ledger, { min = 'P3', includeLow = false } = {}) {
  const contract = ledger?.contract ?? null;
  const cut = SEVERITIES.indexOf(min);
  const tickets = [];
  const skipped = [];
  for (const item of report.findings) {
    if (SEVERITIES.indexOf(item.severity) > cut) { skipped.push({ ref: item.ref, reason: `below ${min}` }); continue; }
    if (item.confidence === 'low' && !includeLow) { skipped.push({ ref: item.ref, reason: 'low confidence: a person reads it first' }); continue; }
    const print = fingerprint(report.app.id, item);
    const filed = ledger?.filed?.[print] ?? null;
    tickets.push({
      ref: item.ref,
      fingerprint: print,
      severity: item.severity,
      action: filed ? 'check' : 'create',
      filed,
      issue: {
        team: contract?.team ?? null,
        ...(contract?.project ? { project: contract.project } : {}),
        title: clip(`${contract?.prefix ?? ''}${report.app.name}: ${scrub(item.title)}`, TITLE_MAX),
        idempotencyKey: `${print}/${report.run}`,
        priority: contract?.priorities?.[item.severity] ?? PRIORITY[item.severity],
        assignees: [contract ? ownerOf(item, contract.owners) : null].filter(Boolean),
        description: describe(item, { report, print }),
      },
      comment: filed ? scrub(`Seen again in review run ${report.run} (finding ${item.ref}, ${item.severity}): ${item.places ? `${item.places.length} places` : item.evidence}`) : null,
    });
  }
  return { run: report.run, app: report.app, host: contract?.host ?? null, contract, tickets, skipped };
}

/** Each filed or commented ticket into the ledger by fingerprint, and onto its finding in the report. */
export function recordFiled(ledger, report, filed, { now = new Date().toISOString() } = {}) {
  const next = { ...ledger, filed: { ...(ledger?.filed ?? {}) } };
  const byRef = new Map(filed.map(entry => [entry.ref, entry]));
  for (const entry of filed) next.filed[entry.fingerprint] = { key: entry.key, id: entry.id ?? null, url: entry.url ?? null, run: report.run, at: now };
  const findings = report.findings.map(item => (byRef.has(item.ref) ? { ...item, ticket: { key: byRef.get(item.ref).key, url: byRef.get(item.ref).url ?? null } } : item));
  return { ledger: next, report: { ...report, findings } };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index].replace(/^--/u, '');
    if (key === 'include-low') args.includeLow = true;
    else args[key.replace(/-(\w)/gu, (unused, letter) => letter.toUpperCase())] = rest[(index += 1)];
  }
  if (!['contract', 'plan', 'record'].includes(command) || !args.run) throw new Error('usage: tickets.mjs contract|plan|record --run <run folder> …');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = path.resolve(args.run);
  const ledger = readJson(ledgerPath(runDir)) ?? {};
  if (args.command === 'contract') {
    if (!args.team || !args.owner) throw new Error('contract needs --team <team id> and --owner <email>');
    const contract = { host: args.host ?? null, team: args.team, project: args.project ?? null, prefix: args.prefix ?? '',
      owners: { default: args.owner, page: args.pageOwner ?? null, automation: args.automationOwner ?? null } };
    writeJson(ledgerPath(runDir), { ...ledger, contract });
    process.stdout.write(`${JSON.stringify({ contract: ledgerPath(runDir) })}\n`);
    return;
  }
  const report = readJson(path.join(runDir, 'report.json'));
  if (!report) throw new Error(`${runDir}/report.json is missing: run report.mjs first`);
  if (args.command === 'plan') {
    if (args.min && !SEVERITIES.includes(args.min)) throw new Error('--min is P0, P1, P2 or P3');
    const plan = planTickets(report, ledger, { min: args.min ?? 'P3', includeLow: args.includeLow });
    writeJson(path.join(runDir, 'tickets', 'plan.json'), plan);
    const count = action => plan.tickets.filter(ticket => ticket.action === action).length;
    process.stdout.write(`${JSON.stringify({ plan: path.join(runDir, 'tickets', 'plan.json'), contract: Boolean(plan.contract), create: count('create'), check: count('check'), skipped: plan.skipped.length })}\n`);
    return;
  }
  const filed = readJson(path.resolve(args.filed ?? ''));
  if (!Array.isArray(filed)) throw new Error('record needs --filed <file>: a JSON list of { ref, fingerprint, key, id, url }');
  const next = recordFiled(ledger, report, filed);
  writeJson(ledgerPath(runDir), next.ledger);
  writeJson(path.join(runDir, 'report.json'), next.report);
  process.stdout.write(`${JSON.stringify({ recorded: filed.length, ledger: ledgerPath(runDir) })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
}
