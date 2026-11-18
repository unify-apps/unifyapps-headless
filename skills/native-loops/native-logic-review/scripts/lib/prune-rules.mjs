// Prune rules R1–R8 (references/prune.md): config on one page that does nothing, does the same
// thing twice, or can never run. Only what UnifyApps Headless's app-verify config-review does not already list. Reads the same UnifyApps Headless cache views as native-lint's page-lint,
// through its cache-shapes.mjs, so both checks see one page the same way.
import { blocksOf, chainsOf, pageInfo, sourcesOf } from '../../../native-lint/scripts/lib/cache-shapes.mjs';

const CONTAINERS = new Set(['Stack', 'Card', 'Scrollable', 'View']);
const PRESSABLES = new Set(['Pressable', 'Button', 'IconButton', 'Link', 'Chip']);
const PLACEHOLDER = '__PLACEHOLDER__';

const finding = (rule, severity, item, kind, detail, fix) => ({
  rule, severity, kind, id: item?.id ?? null, name: item?.displayName ?? item?.name ?? item?.id ?? null, detail, fix,
});

const childIds = (block) => (block?.component?.content?.blockIds ?? []).filter((id) => id !== PLACEHOLDER);
const stable = (value) => JSON.stringify(value, (key, item) => (item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))) : item));

/** Every piece of text on the page that can refer to an id, each tagged with the id of what holds it, so a self-reference never counts as a use. */
function referenceTexts(set, info) {
  const texts = [];
  for (const block of blocksOf(set)) texts.push({ owner: block.id, text: JSON.stringify({ ...block, id: undefined }) });
  for (const chain of chainsOf(set)) texts.push({ owner: `chain:${chain.id}`, text: JSON.stringify(chain.events ?? []) });
  for (const source of sourcesOf(set)) texts.push({ owner: source.id, text: JSON.stringify({ bindings: source.bindings, dependsOn: source.dependsOn, inputs: source.source?.properties?.inputs }) });
  for (const fn of Object.values(info.pageFunctions ?? {})) texts.push({ owner: fn.id, text: String(fn.functionBody ?? '') });
  for (const variable of Object.values(info.pageVariables ?? {})) texts.push({ owner: variable.id, text: String(variable.initialValue ?? '') });
  return texts;
}

const usedBy = (texts, id) => texts.filter((entry) => entry.owner !== id && entry.text.includes(id)).map((entry) => entry.owner);

function triggeredSources(set) {
  const triggers = new Map();
  for (const chain of chainsOf(set)) {
    for (const event of chain.events ?? []) {
      const sourceId = event.payload?.dataSourceId;
      if (event.actionType === 'controlDataSource' && sourceId) triggers.set(sourceId, [...(triggers.get(sourceId) ?? []), { chain, event }]);
    }
  }
  return triggers;
}

export const PRUNE_RULES = [
  { id: 'R1', title: 'unused data source', run(ctx) {
    return ctx.sources.filter((source) => !source.onLoad && !(source.consumers ?? []).length && !ctx.triggers.has(source.id) && !usedBy(ctx.texts, source.id).length)
      .map((source) => finding('R1', 'prune', source, 'dataSource', 'not loaded on page load, no block reads it, no event triggers it, no binding names it', 'Delete the data source'));
  } },
  { id: 'R2', title: 'duplicate data source', run(ctx) {
    const seen = new Map();
    const out = [];
    for (const source of ctx.sources) {
      if (!source.automationId || !source.bindingsKnown) continue;
      const key = `${source.automationId}|${stable(source.bindings)}`;
      if (seen.has(key)) out.push(finding('R2', 'prune', source, 'dataSource', `calls automation ${source.automationId} with the same parameters as ${seen.get(key).name}`, `Bind its readers to ${seen.get(key).name} and delete it`));
      else seen.set(key, source);
    }
    return out;
  } },
  { id: 'R3', title: 'unused page function', run(ctx) {
    if (!ctx.info.pageFunctions) { ctx.unverified.push({ rule: 'R3', detail: 'page settings not read (entity context page)' }); return []; }
    return Object.values(ctx.info.pageFunctions).filter((fn) => !usedBy(ctx.texts, fn.id).length)
      .map((fn) => finding('R3', 'prune', fn, 'function', 'no block, event or other function calls it', 'Delete the function'));
  } },
  { id: 'R4', title: 'always hidden block', run(ctx) {
    return ctx.blocks.filter((block) => block.visibility?.value === false && !block.additional?.isRootBlock)
      .map((block) => finding('R4', 'prune', block, 'block', `visibility is the literal false; it and its ${countSubtree(ctx, block) - 1} child blocks never render`, 'Delete the block, or bind visibility to the state that should show it'));
  } },
  { id: 'R5', title: 'empty container', run(ctx) {
    return ctx.blocks.filter((block) => CONTAINERS.has(block.component?.componentType) && !block.additional?.isRootBlock && !childIds(block).length && !(block.dataSourceIds ?? []).length && !ctx.chainByBlock.has(block.id) && !hasFixedBox(block))
      .map((block) => finding('R5', 'prune', block, 'block', 'a container with no children, no data, no events and no fixed size', 'Delete the block'));
  } },
  { id: 'R6', title: 'repeated action', run(ctx) {
    const out = [];
    for (const chain of chainsOf(ctx.set)) {
      const seen = new Set();
      for (const event of chain.events ?? []) {
        const key = `${event.eventType}|${event.actionType}|${stable(event.payload ?? {})}|${event.conditional}`;
        if (seen.has(key)) out.push(finding('R6', 'prune', { id: event.id, name: chain.name }, 'event', `${chain.name} runs ${event.actionType} on ${event.eventType} twice with the same payload`, 'Delete the second action'));
        seen.add(key);
      }
    }
    return out;
  } },
  { id: 'R7', title: 'loaded twice on open', run(ctx) {
    return ctx.sources.filter((source) => source.onLoad && (ctx.triggers.get(source.id) ?? []).some(({ chain, event }) => chain.kind === 'page' && event.eventType === 'onPageLoad' && event.payload?.method !== 'refetch'))
      .map((source) => finding('R7', 'advisory', source, 'dataSource', 'runs on page load by its own setting and is also triggered by the onPageLoad event: two calls when the page opens', 'Keep one: drop the onPageLoad trigger, or turn off runQueryOnPageLoad'));
  } },
  { id: 'R8', title: 'pressable that does nothing', run(ctx) {
    return ctx.blocks.filter((block) => PRESSABLES.has(block.component?.componentType) && !(ctx.chainByBlock.get(block.id)?.events ?? []).length && !insideForm(ctx, block))
      .map((block) => finding('R8', 'blocking', block, 'block', 'looks tappable but has no event: a tap does nothing', 'Add the action it should run, or use a non-pressable block'));
  } },
];

function hasFixedBox(block) {
  const styles = block.component?.appearance?.styles ?? {};
  return ['height', 'minHeight', 'width'].some((side) => /\d+px/u.test(JSON.stringify(styles[side] ?? '')));
}


function countSubtree(ctx, block) {
  return 1 + childIds(block).reduce((sum, id) => sum + (ctx.byId.has(id) ? countSubtree(ctx, ctx.byId.get(id)) : 0), 0);
}

function insideForm(ctx, block) {
  for (let current = ctx.parentOf.get(block.id); current; current = ctx.parentOf.get(current)) if (ctx.byId.get(current)?.component?.componentType === 'Form') return true;
  return false;
}

export function runPrune(set, pageId, { only = null } = {}) {
  const info = pageInfo(set, pageId);
  const blocks = blocksOf(set);
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const parentOf = new Map();
  for (const block of blocks) for (const id of childIds(block)) parentOf.set(id, block.id);
  const ctx = {
    set, info, blocks, byId, parentOf, unverified: [],
    sources: sourcesOf(set),
    triggers: triggeredSources(set),
    chainByBlock: new Map(chainsOf(set).filter((chain) => chain.kind === 'block').map((chain) => [chain.id, chain])),
    texts: referenceTexts(set, info),
  };
  const rules = PRUNE_RULES.filter((rule) => !only || only.includes(rule.id));
  const findings = rules.flatMap((rule) => rule.run(ctx));
  const count = (severity) => findings.filter((item) => item.severity === severity).length;
  return {
    page: { id: info.id, name: info.name, version: info.version },
    summary: { blocking: count('blocking'), prune: count('prune'), advisory: count('advisory'), blocks: blocks.length, dataSources: ctx.sources.length, unverified: ctx.unverified.length },
    findings, unverified: ctx.unverified, rules: { ran: rules.map((rule) => rule.id) },
  };
}

export function renderTable(report) {
  const lines = [`Prune · ${report.page.name ?? report.page.id} v${report.page.version ?? '?'} · ${report.summary.blocking} blocking, ${report.summary.prune} prune, ${report.summary.advisory} advisory`, '', '| rule | severity | kind | name | id | detail | fix |', '| --- | --- | --- | --- | --- | --- | --- |'];
  for (const item of report.findings) lines.push(`| ${item.rule} | ${item.severity} | ${item.kind} | ${item.name} | ${item.id} | ${item.detail} | ${item.fix} |`);
  for (const item of report.unverified) lines.push(`| ${item.rule} | unverified | | | | ${item.detail} | |`);
  return lines.join('\n');
}
