#!/usr/bin/env node
// rule-check.mjs runs the rulebook's automated checks over one cached app and prints JSON.
//   node rule-check.mjs --app-id <id> [--pages <id,…>] [--session <id> | --home <folder>] [--out <file>]
//   node rule-check.mjs --fixture <file> [--out <file>]
// The builder gate adds a baseline taken before the first write and the ids it wrote:
//   node rule-check.mjs --app-id <id> --pages <id> --baseline <file> --touched <id,…>
// A fixture is `{ interface, pages: [{ page, dataSources, appDataSources }] }`.
// Exit 0: every check ran on every page asked for (and the gate passed). Exit 1: the gate found
// a new P0 or P1 on something it touched; this wins over 2. Exit 2: a check threw, a page could
// not be read (stale, missing, not of this app), or the app could not be read at all.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKS } from './checks.mjs';
import { appModel, readApp } from './config-read.mjs';
import { mobileAudit } from './mobile-audit.mjs';
import { homeForCwd } from '../../../scripts/workspace/session-registry.mjs';
import { approveWorkspace } from '../../../scripts/lib/session-paths.mjs';

const RULES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'rules.json');
const BLOCKING = new Set(['P0', 'P1']);

/** `loadRulebook() → { rules: Map<id, rule>, areas }` from the generated rules.json. */
export function loadRulebook() {
  const { rules, areas } = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
  return { rules: new Map(rules.map(rule => [rule.id, rule])), areas };
}

export const loadRules = () => loadRulebook().rules;

/** A rule for `both` applies to every app; `web` and `mobile` only to that app type. */
export function appliesTo(rule, appType) {
  if (rule.app === 'both') return true;
  return rule.app === (appType === 'MOBILE' ? 'mobile' : 'web');
}

export const findingKey = item => `${item.rule ?? item.title}|${item.page?.id ?? 'app'}|${item.target?.id ?? ''}`;

/** A check's `{ target, evidence, confidence?, severity?, fix? }` as a finding; the rule sets the rest. */
export function finding(rule, page, found) {
  return {
    rule: rule.id,
    title: rule.rule,
    area: rule.area,
    severity: found.severity ?? rule.sev,
    page: page ? { id: page.id, name: page.name } : found.page ?? null,
    target: found.target,
    evidence: found.evidence,
    fix: found.fix ?? null,
    confidence: found.confidence ?? 'high',
  };
}

/**
 * `runChecks(app, { rules, checks, pageIds }) → { checked, findings, errors }`. Each check runs
 * on its own: one that throws is listed in `errors` and the rest still run. A check whose rule
 * is not in the rulebook (left out, or for the other app type) does not run. `pageIds` limits
 * the page checks; app checks always see every page the app model holds.
 */
export function runChecks(app, { rules = loadRules(), checks = CHECKS, pageIds = null } = {}) {
  const pages = pageIds ? app.pages.filter(page => pageIds.includes(page.id)) : app.pages;
  const checked = [];
  const findings = [];
  const errors = [];
  for (const check of checks) {
    const rule = rules.get(check.id);
    if (!rule || !appliesTo(rule, app.type)) continue;
    checked.push(check.id);
    const targets = check.scope === 'app' ? [null] : pages;
    for (const page of targets) {
      try {
        const found = check.scope === 'app' ? check.run(app) : check.run(page, app);
        for (const item of found) findings.push(finding(rule, page, item));
      } catch (error) {
        errors.push({ rule: check.id, page: page?.id ?? null, message: error?.message ?? String(error) });
      }
    }
  }
  return { checked, findings, errors };
}

/** Every automated check over the app: rule-check's own, and on a MOBILE app the page audit too. */
export async function checkApp(app, { rules = loadRules(), pageIds = null } = {}) {
  const own = runChecks(app, { rules, pageIds });
  const audit = await mobileAudit(app, rules, pageIds);
  const audited = audit.hits.map(hit => finding(hit.rule, hit.page, hit.found));
  return { checked: [...own.checked, ...audit.checked], findings: [...own.findings, ...audited], errors: [...own.errors, ...audit.errors] };
}

/**
 * The builder gate: P0 and P1 findings on something the builder wrote (`touched` ids of blocks,
 * data sources, variables or functions) that the baseline before its first write did not have.
 */
export function gate(baseline, current, touched) {
  const before = new Set((baseline?.findings ?? []).map(findingKey));
  const wrote = new Set(touched);
  const blocking = current.findings.filter(item => BLOCKING.has(item.severity) && wrote.has(item.target?.id) && !before.has(findingKey(item)));
  return { pass: blocking.length === 0, blocking };
}

function parseArgs(argv) {
  const args = { appId: null, pages: null, home: null, session: null, fixture: null, out: null, baseline: null, touched: null };
  const list = value => String(value ?? '').split(',').map(item => item.trim()).filter(Boolean);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[(index += 1)];
    if (arg === '--app-id') args.appId = next();
    else if (arg === '--pages') args.pages = list(next());
    else if (arg === '--home') args.home = next();
    else if (arg === '--session') args.session = next();
    else if (arg === '--fixture') args.fixture = next();
    else if (arg === '--out') args.out = next();
    else if (arg === '--baseline') args.baseline = next();
    else if (arg === '--touched') args.touched = list(next());
    else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

function loadApp(args) {
  if (args.fixture) {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(args.fixture), 'utf8'));
    return appModel(fixture.interface, fixture.pages ?? []);
  }
  if (!args.appId) throw new Error('--app-id <interfaceId> or --fixture <file> is required');
  const home = args.home ? approveWorkspace(args.home) : homeForCwd(process.cwd(), args.session ?? process.env.CLAUDE_CODE_SESSION_ID)?.home;
  if (!home) throw new Error('No UnifyApps Headless solution folder here; run from one, or pass --home.');
  return readApp(home, args.appId, { pageIds: args.pages });
}

async function main() {
  let exitCode = 0;
  try {
    const args = parseArgs(process.argv.slice(2));
    const app = loadApp(args);
    const result = await checkApp(app);
    const report = {
      app: { id: app.id, name: app.name, type: app.type },
      pages: app.pages.map(page => ({ id: page.id, name: page.name, counts: page.counts })),
      skipped: app.skipped,
      ...result,
    };
    if (args.baseline) {
      if (!args.touched) throw new Error('--baseline needs --touched <ids it wrote>');
      // A page the task creates has no `before` run, so everything on it is the builder's.
      const baselineFile = path.resolve(args.baseline);
      report.gate = gate(fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : null, result, args.touched);
    }
    if (result.errors.length || app.skipped.length || !app.pages.length) exitCode = 2;
    if (report.gate && !report.gate.pass) exitCode = 1;
    const text = `${JSON.stringify(report, null, 2)}\n`;
    if (args.out) {
      fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
      fs.writeFileSync(path.resolve(args.out), text);
    }
    else process.stdout.write(text);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    exitCode = 2;
  }
  process.exitCode = exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
