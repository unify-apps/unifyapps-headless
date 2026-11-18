#!/usr/bin/env node
// Lints a tasks file or a builder brief before it is sent: UnifyApps Headless's own task rules plus the
// known traps that still apply to the installed versions. Reads files only; never calls a tenant.
import fs from 'node:fs';
import path from 'node:path';
import { validateTaskGraph, validateBody } from './lib/task-rules.mjs';
import { TRAPS, PLATFORMS, applies, onPlatform, readInstalled, lintTraps, applyFixes } from './lib/traps.mjs';

const HELP = `task-lint — refuse or rewrite a brief that walks into a known trap or breaks a UnifyApps Headless task rule.

Usage
  node task-lint.mjs <tasks.json | brief.md | -> [--platform MOBILE|WEB] [--installed <config.json>] [--json] [--fix] [--only T05,T08]

Input
  tasks.json   A plan task graph (an array, or { tasks: [...] }), the shape plan create takes.
  brief.md     Any other file: one builder brief, linted as text.
  -            Read stdin; --kind tasks|brief says which (default: tasks when it parses as JSON).

Options
  --platform   The app's platform, MOBILE (default) or WEB. On WEB the traps that hold only on the
               phone (T01, T03, T04, T09, T10, T17, T19, T22, T23) are skipped.
  --installed  The loops config to read known.platformPrs (and a pinned ua.version) from. Default
               $LOOPS_HOME/config.json; UnifyApps Headless's version is otherwise this plugin's own.
  --only       Run only these trap ids (UnifyApps Headless rules always run on a tasks file).
  --fix        Apply the safe rewrites (T06 camelCase names, T02 updates→edits, T08 boolean initialValue→string)
               and write <file>.linted.<ext>; the input is never changed in place.
  --json       Print { file, kind, platform, installed, findings, summary, fixed } instead of lines.

Output
  One line per finding: <id> · <task> line <n> · <detail> → <rewrite>
  Exit 1 when any finding blocks (every UnifyApps Headless rule, and the traps marked blocking); 0 otherwise.
`;

function platformOf(value) {
  const platform = String(value ?? '').toUpperCase();
  if (!PLATFORMS.includes(platform)) throw new Error(`--platform takes MOBILE or WEB, not "${value ?? ''}".`);
  return platform;
}

function parseArgs(argv) {
  const args = { file: null, installed: null, json: false, fix: false, only: null, kind: null, platform: 'MOBILE' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    if (arg === '--json') { args.json = true; continue; }
    if (arg === '--fix') { args.fix = true; continue; }
    if (arg === '--installed') { args.installed = argv[++index]; continue; }
    if (arg === '--only') { args.only = String(argv[++index] ?? '').split(',').map((id) => id.trim()).filter(Boolean); continue; }
    if (arg === '--kind') { args.kind = argv[++index]; continue; }
    if (arg === '--platform') { args.platform = platformOf(argv[++index]); continue; }
    if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}. Run with --help.`);
    args.file = arg;
  }
  return args;
}

function readInput(args) {
  const raw = args.file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(args.file, 'utf8');
  const looksJson = args.kind === 'tasks' || (args.kind !== 'brief' && (args.file === '-' ? /^\s*[[{]/u.test(raw) : args.file.endsWith('.json')));
  if (!looksJson) return { kind: 'brief', raw, tasks: null };
  const doc = JSON.parse(raw);
  const tasks = Array.isArray(doc) ? doc : doc?.tasks;
  if (!Array.isArray(tasks)) throw new Error(`${args.file}: expected a tasks array or { tasks: [...] }.`);
  return { kind: 'tasks', raw, tasks, doc };
}

const where = (finding) => {
  if (!finding.taskId) return finding.line ? `line ${finding.line}` : 'brief';
  if (finding.part === 'proof') return `${finding.taskId} proof`;
  return finding.line ? `${finding.taskId} line ${finding.line}` : finding.taskId;
};
const formatLine = (finding) => `${finding.trap} · ${where(finding)} · ${finding.detail} → ${finding.rewrite}`;

function uaFindings(input) {
  if (input.kind === 'tasks') {
    return validateTaskGraph(input.tasks).errors.map((error) => ({ trap: 'CLI', blocking: true, taskId: /^([tq]\d+)\b/u.exec(error)?.[1] ?? null, part: 'task', line: 0, detail: error, rewrite: 'fix it before plan propose/revise, which refuse the same thing' }));
  }
  // A brief is not a task graph; only the body rules that read as text apply to it.
  return validateBody(input.raw).filter((error) => !error.startsWith('body needs at least five lines'))
    .map((error) => ({ trap: 'CLI', blocking: true, taskId: null, part: 'brief', line: 0, detail: error, rewrite: 'fix it before the brief is sent' }));
}

function writeFixed(args, input) {
  const target = `${args.file}.linted${path.extname(args.file) || '.txt'}`;
  const applied = new Set();
  let text;
  if (input.kind === 'tasks') {
    const fixed = input.tasks.map((task) => {
      const body = applyFixes(Array.isArray(task.body) ? task.body.join('\n') : task.body ?? '');
      const proof = applyFixes(task.proof ?? '');
      [...body.applied, ...proof.applied].forEach((id) => applied.add(id));
      return { ...task, body: body.text, proof: proof.text };
    });
    text = JSON.stringify(Array.isArray(input.doc) ? fixed : { ...input.doc, tasks: fixed }, null, 2);
  } else {
    const fixed = applyFixes(input.raw);
    fixed.applied.forEach((id) => applied.add(id));
    text = fixed.text;
  }
  fs.writeFileSync(target, `${text}\n`);
  return { target, applied: [...applied] };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.file) { process.stdout.write(HELP); process.exitCode = args.help ? 0 : 1; return; }
  const installed = readInstalled(args.installed);
  const input = readInput(args);
  const traps = lintTraps(input.kind === 'tasks' ? input.tasks : input.raw, installed, { only: args.only, platform: args.platform });
  const findings = [...uaFindings(input), ...traps.findings];
  const summary = { blocking: findings.filter((finding) => finding.blocking).length, advisory: findings.filter((finding) => !finding.blocking).length,
    retired: traps.retired, applicable: TRAPS.filter((trap) => applies(trap, installed) && onPlatform(trap, args.platform)).map((trap) => trap.id) };
  const fixed = args.fix ? writeFixed(args, input) : null;
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ file: args.file, kind: input.kind, platform: args.platform, installed, findings, summary, fixed }, null, 2)}\n`);
  } else {
    for (const finding of findings) process.stdout.write(`${formatLine(finding)}\n`);
    process.stdout.write(`${summary.blocking} blocking, ${summary.advisory} advisory; traps retired for this install: ${summary.retired.join(', ') || 'none'}${fixed ? `; fixed ${fixed.applied.join(', ') || 'nothing'} into ${fixed.target}` : ''}\n`);
  }
  process.exitCode = summary.blocking ? 1 : 0;
}

try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
