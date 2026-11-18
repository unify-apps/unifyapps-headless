#!/usr/bin/env node
// Finds config on one page that can be pruned (R1–R8), from UnifyApps Headless cache reads.
// No tenant call unless --refresh; the views come from the UnifyApps Headless CLI or from saved files (--from).
import fs from 'node:fs';
import { fetchCacheSet, readCacheSet, pluginRoot } from '../../native-lint/scripts/lib/cache-shapes.mjs';
import { PRUNE_RULES, renderTable, runPrune } from './lib/prune-rules.mjs';

const HELP = `prune — what one page holds that does nothing, runs twice or can never run.

Usage
  node prune.mjs <pageId> --app-id <app> [--ua-root <root>] [--refresh] [--json] [--rules R1,R2] [--out <file>]
  node prune.mjs <pageId> --from <dir> [--json] [--rules R1,R2] [--out <file>]

Inputs are the same views native-lint's page-lint reads (see its references/page-lint.md).
Rules: ${PRUNE_RULES.map((rule) => `${rule.id} ${rule.title}`).join('; ')}.

Exit codes: 0 no blocking finding, 1 blocking findings, 2 the views could not be read.
`;

function parseArgs(argv) {
  const args = { pageId: null, appId: null, root: null, from: null, refresh: false, json: false, rules: null, out: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    if (arg === '--json') { args.json = true; continue; }
    if (arg === '--refresh') { args.refresh = true; continue; }
    if (arg === '--app-id') { args.appId = argv[++index]; continue; }
    if (arg === '--ua-root') { args.root = argv[++index]; continue; }
    if (arg === '--from') { args.from = argv[++index]; continue; }
    if (arg === '--out') { args.out = argv[++index]; continue; }
    if (arg === '--rules') { args.rules = String(argv[++index] ?? '').split(',').map((id) => id.trim().toUpperCase()).filter(Boolean); continue; }
    if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}. Run with --help.`);
    args.pageId = arg;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.pageId) { process.stdout.write(HELP); process.exitCode = args.help ? 0 : 2; return; }
  const unknown = (args.rules ?? []).filter((id) => !PRUNE_RULES.some((rule) => rule.id === id));
  if (unknown.length) throw new Error(`Unknown rule ids: ${unknown.join(', ')}.`);
  let set;
  if (args.from) {
    set = readCacheSet(args.from);
    for (const view of ['blocks', 'events', 'ds']) if (!set[view]) throw new Error(`${args.from}/${view}.json is missing.`);
  } else {
    if (!args.appId) throw new Error('--app-id <app> is required without --from.');
    set = fetchCacheSet({ root: pluginRoot(args.root), pageId: args.pageId, appId: args.appId, refresh: args.refresh });
  }
  const report = runPrune(set, set.outline?.pageId ?? args.pageId, { only: args.rules });
  if (args.out) fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : `${renderTable(report)}\n`);
  process.exitCode = report.summary.blocking ? 1 : 0;
}

try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
