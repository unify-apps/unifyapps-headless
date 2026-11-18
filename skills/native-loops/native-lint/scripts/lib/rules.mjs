// House rules H1–H17 (../../references/house-rules.md) over the UnifyApps Headless cache views
// in cache-shapes.mjs. The rules live in three families; this file is the registry, the shared
// readers and the runner. Output follows UnifyApps Headless's app-page-quality page-audit.mjs so a quality
// pass can consume both: a finding is { rule, severity, blockId, blockName, path, detail, fix }.
import { blocksOf, chainsOf, nodesOf, pageInfo, sourcesOf } from './cache-shapes.mjs';
import { STRUCTURE_RULES } from './rules-structure.mjs';
import { DATA_RULES } from './rules-data.mjs';
import { NAVIGATION_RULES } from './rules-navigation.mjs';

export const RULES = [...STRUCTURE_RULES, ...DATA_RULES, ...NAVIGATION_RULES].sort((left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)));

export const makeFinding = (rule, severity, block, path, detail, fix) => ({
  rule, severity, blockId: block?.id ?? null, blockName: block?.displayName ?? block?.name ?? block?.id ?? null, path, detail, fix,
});

export function walkStrings(value, path, visit) {
  if (typeof value === 'string') { visit(path, value); return; }
  if (Array.isArray(value)) { value.forEach((item, index) => walkStrings(item, `${path}[${index}]`, visit)); return; }
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) walkStrings(item, path ? `${path}.${key}` : key, visit);
}

const PX = /^(\d+(?:\.\d+)?)px$/u;
/** One side of a block's box in points: "304px" in appearance.styles (plain or { custom }) or a bare number in customStyles; null otherwise. */
export function fixedPoints(block, side) {
  const styled = block?.component?.appearance?.styles?.[side];
  const text = styled && typeof styled === 'object' ? styled.custom : styled;
  const px = typeof text === 'string' ? PX.exec(text.trim()) : null;
  if (px) return Number(px[1]);
  const custom = customStylesOf(block)[side];
  return typeof custom === 'number' ? custom : null;
}

/** additional.customCSS is the authored source; appearance.customStyles the stored fallback (the same precedence as page-audit walk.mjs). */
export function customStylesOf(block) {
  const raw = block?.additional?.customCSS;
  if (typeof raw === 'string') { try { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed; } catch { /* fall through */ } }
  return block?.component?.appearance?.customStyles ?? {};
}

/** The page as every rule reads it: blocks by id, the outline tree, the event chains and the sources, plus an `unverified` sink. */
export function buildContext(set, pageId) {
  const blocks = blocksOf(set);
  const nodes = nodesOf(set);
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map();
  for (const node of nodes) children.set(node.parentId ?? null, [...(children.get(node.parentId ?? null) ?? []), node]);
  const ancestors = (id) => {
    const chain = [];
    const seen = new Set([id]);
    let parent = nodeById.get(id)?.parentId ?? null;
    while (parent && !seen.has(parent) && nodeById.has(parent)) { seen.add(parent); chain.push(nodeById.get(parent)); parent = nodeById.get(parent).parentId ?? null; }
    return chain;
  };
  const descendants = (id) => {
    const out = [];
    const stack = [...(children.get(id) ?? [])];
    while (stack.length) { const node = stack.pop(); out.push(node); stack.push(...(children.get(node.id) ?? [])); }
    return out;
  };
  const unverified = [];
  return {
    set, pageId, info: pageInfo(set, pageId), blocks, byId, nodes, nodeById, children, ancestors, descendants,
    chains: chainsOf(set), sources: sourcesOf(set),
    // A rule that cannot decide records why instead of guessing; the report counts these apart, like page-audit's unprobed images.
    unverified: (rule, detail) => unverified.push({ rule, detail }),
    unverifiedList: unverified,
  };
}

/** Static page ids this page navigates to or back to; the live mode reads those pages for H7 and H16. */
export function navigationTargets(set, pageId) {
  const ids = new Set();
  for (const chain of chainsOf(set)) for (const event of chain.events ?? []) {
    const target = event.payload?.pageId;
    if (['navigateToPage', 'navigateBack'].includes(event.actionType) && typeof target === 'string' && target && !target.includes('{{') && target !== pageId) ids.add(target);
  }
  return [...ids];
}

function candidateLists(context) {
  const interactions = []; const navigation = []; const lists = []; const functionBound = [];
  for (const chain of context.chains.filter((item) => item.kind === 'block')) {
    interactions.push({ blockId: chain.id, blockName: chain.name, type: chain.componentType, actionTypes: [...new Set(chain.events.map((event) => event.actionType).filter(Boolean))] });
    for (const event of chain.events) if (event.actionType === 'navigateToPage') navigation.push({ blockId: chain.id, blockName: chain.name, targetPageId: event.payload?.pageId ?? null });
  }
  for (const block of context.blocks) {
    if (block.component?.componentType === 'Repeatable') lists.push({ blockId: block.id, blockName: block.displayName ?? block.id, paging: block.component.content?.paging ?? null, collectChildStates: block.component.content?.collectChildStates ?? null });
    walkStrings(block.component ?? {}, 'component', (path, text) => { const match = /func_[A-Za-z0-9]+/u.exec(text); if (match && text.includes('{{')) functionBound.push({ blockId: block.id, blockName: block.displayName ?? block.id, path, functionId: match[0] }); });
  }
  return { interactions, navigation, lists, writes: [], heavy: [], functionBound };
}

const order = (left, right) => (left.severity !== right.severity ? (left.severity === 'blocking' ? -1 : 1) : Number(left.rule.slice(1)) - Number(right.rule.slice(1)));

/** Runs the chosen rules and assembles the report in page-audit's shape, plus `unverified` and `rules`. */
export function runRules(set, pageId, { only = null } = {}) {
  const context = buildContext(set, pageId);
  const chosen = RULES.filter((rule) => !only || only.includes(rule.id));
  const findings = [];
  const skipped = [];
  for (const rule of chosen) {
    try { findings.push(...rule.run(context)); }
    catch (error) { skipped.push({ rule: rule.id, reason: error.message }); }
  }
  findings.sort(order);
  const blocking = findings.filter((finding) => finding.severity === 'blocking').length;
  return {
    page: { id: pageId, name: context.info.name, version: context.info.version },
    app: { id: context.info.appId, appType: context.info.appType },
    summary: { blocking, advisory: findings.length - blocking, blocks: set.outline?.total ?? context.blocks.length, onLoadSources: context.sources.filter((source) => source.onLoad).length, unverified: context.unverifiedList.length },
    findings,
    candidates: candidateLists(context),
    unverified: context.unverifiedList,
    rules: { ran: chosen.map((rule) => rule.id), skipped },
  };
}

export function renderTable(report) {
  const lines = [`page ${report.page.name ?? report.page.id} [${report.page.id}] version ${report.page.version ?? '?'} · ${report.summary.blocks} blocks · ${report.summary.blocking} blocking · ${report.summary.advisory} advisory · ${report.summary.unverified} unverified`,
    '', '| rule | severity | block | path | detail | fix |', '| --- | --- | --- | --- | --- | --- |'];
  const cell = (value) => String(value ?? '').replace(/\|/gu, '\\|').replace(/\n/gu, ' ');
  for (const finding of report.findings) lines.push(`| ${finding.rule} | ${finding.severity} | ${cell(finding.blockName)}${finding.blockId ? ` [${finding.blockId}]` : ''} | ${cell(finding.path)} | ${cell(finding.detail)} | ${cell(finding.fix)} |`);
  if (report.unverified.length) lines.push('', ...report.unverified.map((item) => `unverified: ${item.rule} · ${item.detail}`));
  if (report.rules.skipped.length) lines.push('', ...report.rules.skipped.map((item) => `skipped: ${item.rule} · ${item.reason}`));
  return lines.join('\n');
}
