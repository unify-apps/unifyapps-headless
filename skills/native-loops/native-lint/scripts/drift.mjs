#!/usr/bin/env node
// The live-drift guard: a snapshot of a page (version plus a content hash per block) before a
// write, and a check after it that says whether the page moved, who moved it, and what to do.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fetchCacheSet, uaJson, readCacheSet, pluginRoot, blocksOf, nodesOf } from './lib/cache-shapes.mjs';

const HELP = `drift — snapshot a page before a write and check it afterwards.

Usage
  node drift.mjs snapshot <pageId> --app-id <app> [--ua-root <root>] [--from <dir>] --out snap.json
  node drift.mjs check <pageId> --app-id <app> --since snap.json [--plan <planId> | --plan-file <plan.json>]
                      [--targets <block ids, comma separated>] [--ua-root <root>] [--now <snap.json> | --from <dir>] [--json]

snapshot  cache page --refresh, cache outline and cache blocks (--match '.*') through the UnifyApps Headless CLI, or the saved
          views in --from. Writes { takenAt, pageId, appId, version, blockCount, order, blocks: { id: sha256 } }.
check     Takes a fresh snapshot the same way (or reads --now / --from) and compares it with --since:
          status  same | advanced-by-plan | foreign-edit | reverted | unknown | elsewhere
          who     from plan get <planId> (its runner and the task that touched the page) when a plan is given,
                  else from plan list (an in_progress plan whose touches name the page), else null.
          --targets names the blocks the write touches: a version bump that changed none of them is
          \`elsewhere\` (exit 0), not a foreign edit. Without it the version decides, as before.
          Prints one verdict line and the instruction; --json prints the whole result.

Exit codes: 0 same, advanced-by-plan or elsewhere, 1 foreign-edit or reverted, 2 unknown or the page could not be read.
`;

function parseArgs(argv) {
  const args = { command: null, pageId: null, appId: null, root: null, from: null, out: null, since: null, now: null, plan: null, planFile: null, targets: null, json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    if (arg === '--json') { args.json = true; continue; }
    const valued = { '--app-id': 'appId', '--ua-root': 'root', '--from': 'from', '--out': 'out', '--since': 'since', '--now': 'now', '--plan': 'plan', '--plan-file': 'planFile', '--targets': 'targets' };
    if (valued[arg]) { args[valued[arg]] = argv[++index]; continue; }
    if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}. Run with --help.`);
    if (!args.command) args.command = arg; else args.pageId = arg;
  }
  return args;
}

const stable = (value) => (Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value);
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

function snapshotOf(set, pageId, appId) {
  const blocks = blocksOf(set);
  return {
    takenAt: new Date().toISOString(), pageId, appId,
    version: set.page?.page?.version ?? set.outline?.version ?? set.blocks?.version ?? null,
    validatedAt: set.page?.page?.validatedAt ?? set.outline?.validatedAt ?? null,
    blockCount: blocks.length, order: nodesOf(set).map((node) => node.id),
    blocks: Object.fromEntries(blocks.map((block) => [block.id, hash(block)])),
  };
}

function takeSnapshot(args) {
  if (args.from) return snapshotOf(readCacheSet(args.from), args.pageId, args.appId);
  if (!args.appId) throw new Error('--app-id <app> is required without --from.');
  const root = pluginRoot(args.root);
  const set = fetchCacheSet({ root, pageId: args.pageId, appId: args.appId, refresh: true });
  return snapshotOf(set, args.pageId, args.appId);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const stamp = (value) => { const time = Date.parse(value ?? ''); return Number.isNaN(time) ? null : time; };

/** The plan's own task on this page that ran after the snapshot, if any, and its runner. */
function planAttribution(plan, planId, since, pageName) {
  if (!plan) return null;
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const onPage = tasks.filter((task) => task.entity?.kind === 'page' && (String(task.entity.id ?? '') === since.pageId || (pageName && String(task.entity.name ?? '').trim().toLowerCase() === pageName.trim().toLowerCase())));
  const after = onPage.filter((task) => ['done', 'running', 'failed'].includes(task.status) && (stamp(task.endedAt ?? task.startedAt) === null || stamp(task.endedAt ?? task.startedAt) >= stamp(since.takenAt)));
  const runner = plan.meta?.runner ?? null;
  const task = after[0] ?? null;
  return { plan: planId ?? plan.meta?.title ?? null, runner: runner ? { email: runner.email ?? null, claudeSessionId: runner.claudeSessionId ?? null } : null, task: task ? { id: task.id, title: task.title, status: task.status, agentName: task.agentName ?? null } : null, advanced: Boolean(task) };
}

function foreignPlans(root, since) {
  try {
    const plans = uaJson(root, ['plan', 'list', '--status', 'in_progress']).plans ?? [];
    return plans.filter((plan) => (plan.touches ?? []).some((ref) => ref.kind === 'page' && String(ref.id ?? '') === since.pageId)).map((plan) => ({ plan: plan.planId, title: plan.title, runner: plan.runner ? { email: plan.runner.email ?? null, claudeSessionId: plan.runner.claudeSessionId ?? null } : null }));
  } catch { return []; }
}

const INSTRUCTIONS = {
  same: 'no drift; continue',
  'advanced-by-plan': "the plan's own writes moved the page; continue",
  'foreign-edit': 'ask who edits this page before writing; re-read it and rebuild the brief on the fresh read',
  reverted: 're-read before trusting done tasks: the version went down, so every done task on this page is re-verified by a live read-back',
  elsewhere: 'the page version moved but none of the target blocks did; write them and report the version seen',
  unknown: 'the version is unchanged but the content differs (a stale cache copy); run cache page --refresh and snapshot again',
};

function check(args) {
  const since = readJson(args.since);
  const now = args.now ? readJson(args.now) : takeSnapshot({ ...args, pageId: args.pageId ?? since.pageId, appId: args.appId ?? since.appId });
  const both = Object.keys(since.blocks).filter((id) => id in now.blocks);
  const result = {
    pageId: since.pageId, versions: { before: since.version, now: now.version }, takenAt: { before: since.takenAt, now: now.takenAt },
    changedBlocks: both.filter((id) => since.blocks[id] !== now.blocks[id]),
    removedBlocks: Object.keys(since.blocks).filter((id) => !(id in now.blocks)),
    addedBlocks: Object.keys(now.blocks).filter((id) => !(id in since.blocks)),
    who: null,
  };
  const moved = result.changedBlocks.length + result.removedBlocks.length + result.addedBlocks.length > 0;
  if (now.version !== null && since.version !== null && now.version < since.version) result.status = 'reverted';
  else if (now.version === since.version) result.status = moved ? 'unknown' : 'same';
  else {
    let plan = null;
    let root = null;
    if (args.planFile) plan = readJson(args.planFile);
    else if (args.plan) { root = pluginRoot(args.root); plan = uaJson(root, ['plan', 'get', args.plan]); }
    const attribution = planAttribution(plan, args.plan, since, now.pageName ?? null);
    const targets = args.targets ? args.targets.split(',').map((id) => id.trim()).filter(Boolean) : null;
    const targetsMoved = targets ? targets.some((id) => result.changedBlocks.includes(id) || result.removedBlocks.includes(id) || !(id in now.blocks)) : true;
    if (attribution?.advanced) { result.status = 'advanced-by-plan'; result.who = attribution; }
    else if (!targetsMoved) { result.status = 'elsewhere'; result.targets = targets; }
    else {
      result.status = 'foreign-edit';
      if (!root && !args.planFile && (args.appId || since.appId)) { try { root = pluginRoot(args.root); } catch { root = null; } }
      const others = root ? foreignPlans(root, since) : [];
      result.who = others.length ? others[0] : attribution?.runner ? { ...attribution, note: 'the given plan ran no task on this page after the snapshot' } : null;
      result.otherPlans = others;
    }
  }
  result.instruction = INSTRUCTIONS[result.status];
  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !['snapshot', 'check'].includes(args.command)) { process.stdout.write(HELP); process.exitCode = args.help ? 0 : 2; return; }
  if (args.command === 'snapshot') {
    if (!args.pageId || !args.out) throw new Error('snapshot needs <pageId> and --out <file>.');
    const snap = takeSnapshot(args);
    fs.writeFileSync(args.out, `${JSON.stringify(snap, null, 2)}\n`);
    process.stdout.write(`snapshot ${snap.pageId} version ${snap.version ?? '?'} · ${snap.blockCount} blocks → ${args.out}\n`);
    return;
  }
  if (!args.since) throw new Error('check needs --since <snap.json>.');
  const result = check(args);
  const who = result.who ? ` · who: ${[result.who.plan, result.who.runner?.email, result.who.task?.id].filter(Boolean).join(' ')}` : '';
  const line = `${result.status} · ${result.pageId} version ${result.versions.before ?? '?'} → ${result.versions.now ?? '?'} · changed ${result.changedBlocks.length}, removed ${result.removedBlocks.length}, added ${result.addedBlocks.length}${who}\n${result.instruction}\n`;
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : line);
  process.exitCode = ['same', 'advanced-by-plan', 'elsewhere'].includes(result.status) ? 0 : result.status === 'unknown' ? 2 : 1;
}

try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
