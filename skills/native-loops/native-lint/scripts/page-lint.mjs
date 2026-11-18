#!/usr/bin/env node
// Checks one page of a MOBILE app against the house rules H1–H17 from UnifyApps Headless cache reads.
// No tenant call unless --refresh; the views come from the UnifyApps Headless CLI or from saved files (--from).
import fs from 'node:fs';
import { fetchCacheSet, readCacheSet, pluginRoot } from './lib/cache-shapes.mjs';
import { RULES, navigationTargets, renderTable, runRules } from './lib/rules.mjs';

const HELP = `page-lint — the house rules on one page, from UnifyApps Headless cache reads.

Usage
  node page-lint.mjs <pageId> --app-id <app> [--ua-root <root>] [--refresh] [--app-wide] [--no-targets] [--json] [--rules H1,H2] [--out <file>]
  node page-lint.mjs <pageId> --from <dir> [--json] [--rules H1,H2] [--out <file>]

Inputs
  Live: UnifyApps Headless's CLI from the plugin this script ships in (bash <plugin>/scripts/run-node.sh <plugin>/scripts/ua.mjs
  cache <view> … --json), run from the solution folder. --ua-root <dir> points at another checkout (tests only).
  --from <dir>: page.json, outline.json, blocks.json, ds.json, events.json, keys.json; optional nav.json, paths.json,
  entity.json (entity context page), app-ds.json (cache ds --app-id), assets.json, targets/<pageId>/{outline,blocks,events}.json.

Options
  --refresh     Re-read the page from the tenant before the views (cache page --refresh).
  --app-wide    Also read cache ds --app-id <app> for H11 across pages.
  --no-targets  Do not read the pages this page navigates to (H7 and H16 then report unverified).
  --rules       Run only these rule ids. Rules: ${RULES.map((rule) => rule.id).join(', ')}.
  --json        Print the report as JSON (the shape of UnifyApps Headless's page-audit.mjs plus unverified and rules).
  --out <file>  Write the JSON report here as well.

Exit codes: 0 no blocking finding, 1 blocking findings, 2 the views could not be read.
`;

function parseArgs(argv) {
  const args = { pageId: null, appId: null, root: null, from: null, refresh: false, appWide: false, targets: true, json: false, rules: null, out: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    if (arg === '--json') { args.json = true; continue; }
    if (arg === '--refresh') { args.refresh = true; continue; }
    if (arg === '--app-wide') { args.appWide = true; continue; }
    if (arg === '--no-targets') { args.targets = false; continue; }
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

function readViews(args) {
  if (args.from) {
    const set = readCacheSet(args.from);
    for (const view of ['outline', 'blocks', 'events']) if (!set[view]) throw new Error(`${args.from}/${view}.json is missing.`);
    return set;
  }
  if (!args.appId) throw new Error('--app-id <app> is required without --from.');
  const root = pluginRoot(args.root);
  const set = fetchCacheSet({ root, pageId: args.pageId, appId: args.appId, refresh: args.refresh, appWide: args.appWide });
  if (args.targets) {
    const targets = navigationTargets(set, args.pageId).slice(0, 12);
    if (targets.length) Object.assign(set.targets, fetchCacheSet({ root, pageId: args.pageId, appId: args.appId, targets }).targets);
  }
  return set;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.pageId) { process.stdout.write(HELP); process.exitCode = args.help ? 0 : 2; return; }
  const unknown = (args.rules ?? []).filter((id) => !RULES.some((rule) => rule.id === id));
  if (unknown.length) throw new Error(`Unknown rule ids: ${unknown.join(', ')}.`);
  const set = readViews(args);
  const pageId = set.outline?.pageId ?? args.pageId;
  const report = runRules(set, pageId, { only: args.rules });
  if (args.out) fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : `${renderTable(report)}\n`);
  process.exitCode = report.summary.blocking ? 1 : 0;
}

try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
