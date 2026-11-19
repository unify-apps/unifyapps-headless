#!/usr/bin/env node
// page-audit.mjs audits one cached MOBILE page against the app-page-quality rulebook.
//   node page-audit.mjs <pageId> --app-id <interfaceId> [--home <folder>] [--json] [--no-images] [--scale <n>]
//   node page-audit.mjs --fixture <file> [--json] [--scale <n>]
// Fixture mode reads the `{ interface, page, dataSources, appDataSources }` shape straight
// from a file and never touches the network or a solution home. Workspace mode reads that
// same shape out of the local interface cache by id, and probes image headers over the
// network unless --no-images is given.
// Exit 0: every rule ran and the report is printed, whatever it found. Exit 2: a rule threw
// (the report is printed, its `errors` name each one), or workspace mode could not audit the
// page at all. Exit 1: fixture mode could not audit the file at all.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkPage } from './walk.mjs';
import { runRules, structureFindings } from './rules-structure.mjs';
import { sourceFacts, dataFindings, candidateLists } from './rules-data.mjs';
import { collectImageAddresses, probeImages, imageFindings, isUnprobedFinding, REFUSALS } from './images.mjs';
import { buildReport, renderReport } from './report.mjs';
import { readCachedPageContext } from '../../../scripts/folder/entity-cache.mjs';
import { homeForCwd } from '../../../scripts/folder/session-registry.mjs';
import { readState, sessionHome } from '../../../scripts/folder/local.mjs';
import { approveFolder } from '../../../scripts/lib/session-paths.mjs';

/** The Global Constraints values, quoted in references/rulebook.md's Thresholds table. */
export const THRESHOLDS = Object.freeze({
  bindingChars: 200,
  onLoadAdvisory: 2,
  onLoadBlocking: 5,
  imageMinRatio: 1,
  imageMaxRatio: 2,
  imageAdvisoryBytes: 200_000,
  imageBlockingBytes: 500_000,
  tapMinPt: 44,
  listRows: 50,
  firstScreenBlocks: 160,
  deferMs: [150, 300],
});

/** One step that is not a rule but feeds the rules (the data sources, the candidates): a throw is recorded like a rule's, and `fallback` stands in. */
function guarded(errors, rule, run, fallback) {
  try {
    return run();
  } catch (error) {
    errors.push({ rule, message: error?.message ?? String(error) });
    return fallback;
  }
}

/**
 * `auditContext(context, { scale, probe, thresholds }) → Report`. `context` is the `hit`
 * shape of `readCachedPageContext`: `{ page, dataSources, appDataSources, appInterface }`.
 * A `--fixture` file may still use the older key `interface` for the same record; both are
 * read. `scale` is the point→pixel multiplier P4 judges image sizes against. `probe` is
 * `{ fetchImpl, tenant, cacheFile }` to fetch and measure every image address, or `null` to
 * skip the network entirely (`--no-images`, and every `--fixture` run) — `report.images` is
 * `[]` and P4 never fires when it is skipped. Each rule runs on its own: one that throws is
 * listed in `report.errors` and the rest still run. Throws only when the page cannot be
 * audited at all (not MOBILE, no `root_id`).
 */
export async function auditContext(context, { scale = 3, probe = null, thresholds = THRESHOLDS } = {}) {
  const appInterface = context?.appInterface ?? context?.interface;
  const appType = appInterface?.properties?.manifest?.type;
  if (appType !== 'MOBILE') throw new Error('app-page-quality audits MOBILE apps only');

  const walk = walkPage(context.page);
  const errors = [];
  const sources = guarded(errors, 'data sources', () => sourceFacts(context, walk), []);
  // ctx.pageEvents is raw page.properties.events — rules-data.mjs normalizes it itself (X5's
  // deferral check), the same way walkPage already normalizes every block's own events.
  const ruleCtx = {
    sources,
    functions: context.page?.properties?.pageFunctions ?? {},
    variables: context.page?.properties?.pageVariables ?? {},
    thresholds,
    pageEvents: context.page?.properties?.events ?? [],
    errors,
  };

  let probed = new Map();
  let p4 = [];
  if (probe && typeof probe === 'object') {
    const addresses = guarded(errors, 'P4', () => collectImageAddresses(walk, { pageVariables: context.page?.properties?.pageVariables ?? {} }), []);
    probed = await probeImages(addresses, probe).catch(error => {
      if (REFUSALS.has(error?.code)) throw error;
      errors.push({ rule: 'P4', message: error?.message ?? String(error) });
      return new Map();
    });
    p4 = runRules([['P4', () => imageFindings(addresses, probed, { scale, thresholds })]], ruleCtx);
  }
  const findings = [...structureFindings(walk, ruleCtx), ...dataFindings(walk, ruleCtx), ...p4];
  const candidates = guarded(errors, 'candidates', () => candidateLists(walk, ruleCtx), null);
  const images = [...probed.entries()].map(([url, result]) => ({ url, ...result }));

  return buildReport({
    page: context.page,
    app: appInterface,
    walk,
    findings,
    candidates,
    images,
    thresholds,
    onLoadSources: sources.filter(source => source.onLoad).length,
    unprobed: p4.filter(isUnprobedFinding).length,
    errors,
  });
}

/** `exitCodeOf(report) → 0 | 2`: 2 when a rule threw, so the page was not fully audited; findings never change it. */
export const exitCodeOf = report => ((report?.errors ?? []).length > 0 ? 2 : 0);

function parseArgs(argv) {
  const args = { fixture: null, pageId: null, appId: null, home: null, json: false, scale: 3, noImages: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--fixture') args.fixture = argv[(index += 1)];
    else if (arg === '--app-id') args.appId = argv[(index += 1)];
    else if (arg === '--home') args.home = argv[(index += 1)];
    else if (arg === '--json') args.json = true;
    else if (arg === '--scale') args.scale = Number(argv[(index += 1)]);
    else if (arg === '--no-images') args.noImages = true;
    else if (!arg.startsWith('--') && !args.pageId) args.pageId = arg;
  }
  return args;
}

/**
 * The workspace `home` this run reads from, plus the tenant and image-cache file a probe
 * needs. `--home` always wins; otherwise this falls back to the Claude session registered for
 * the current folder. `readState`/`sessionHome` both resolve a per-session folder, so without
 * a session id there is nothing for either to key off: every session-less run shares one
 * `local` image cache and reports no tenant, rather than guessing at one or throwing.
 */
function resolveWorkspace(args) {
  const home = args.home ? approveFolder(args.home) : homeForCwd(process.cwd())?.home ?? null;
  if (!home) return { home: null, tenant: null, cacheFile: null };
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
  if (!sessionId) return { home, tenant: null, cacheFile: path.join(home, '.sessions', 'local', 'audits', 'images.json') };
  return { home, tenant: readState(home, sessionId)?.tenant ?? null, cacheFile: path.join(sessionHome(home, sessionId), 'audits', 'images.json') };
}

function printReport(report, json) {
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${renderReport(report)}\n`);
}

async function runFixture(args) {
  const context = JSON.parse(fs.readFileSync(path.resolve(args.fixture), 'utf8'));
  // A fixture read is offline by construction: --no-images is accepted but has no effect,
  // since a fixture run never builds a probe regardless of the flag.
  void args.noImages;
  return auditContext(context, { scale: args.scale, probe: null });
}

async function runWorkspace(args) {
  if (!args.pageId) throw new Error('<pageId> is required');
  if (!args.appId) throw new Error('--app-id <interfaceId> is required');
  const { home, tenant, cacheFile } = resolveWorkspace(args);
  if (!home) throw new Error('No UnifyApps Headless workspace here; pass --home.');

  const context = readCachedPageContext(home, args.appId, args.pageId);
  if (context.status === 'stale') throw new Error(`Run solution refresh: the cached page is stale (${context.reason}).`);
  if (context.status === 'miss') throw new Error(`The page ${context.pageId} is not in the cache (${context.reason}).`);

  const probe = args.noImages ? null : { fetchImpl: fetch, tenant, cacheFile };
  return auditContext(context, { scale: args.scale, probe });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const report = await (args.fixture ? runFixture(args) : runWorkspace(args));
    printReport(report, args.json);
    process.exitCode = exitCodeOf(report);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = args.fixture ? 1 : 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
