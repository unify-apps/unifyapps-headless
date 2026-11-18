// Page-setting and navigation rules: H6 status bar, H7 header icon vs transition, H16 navigateBack results,
// H17 a page that takes the Android back button lets the person leave.
import { makeFinding } from './rules.mjs';

function h6(context) {
  const page = { id: null, displayName: context.info.name ?? context.pageId };
  if (!context.info.settingsKnown) { context.unverified('H6', 'page settings not read (entity context page), so the status bar is unknown; cache page has no statusBar'); return []; }
  const statusBar = context.info.statusBar;
  if (statusBar && typeof statusBar === 'object' && statusBar.style) return [];
  return [makeFinding('H6', 'advisory', page, 'properties.statusBar', 'the page sets no status bar style', 'set properties.statusBar on the page; the app sets the default')];
}

const CROSS = /x-?close|xclose|\bclose\b|cross/iu;
const BACK = /chevron-?left|arrow-?(?:narrow-?)?left|\bback\b/iu;
const isSheet = (payload) => payload?.overridePageAnimation === true && payload?.pageTransitionBehavior === 'adaptive_sheet';

/** The header icon kind of a page from its outline and blocks: 'cross', 'back', null (none) or 'both'. */
function headerIcon(outline, blocks) {
  const nodes = outline?.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const underHeader = (node) => { let current = node; const seen = new Set(); while (current && !seen.has(current.id)) { if (current.id === 'header_id') return true; seen.add(current.id); current = byId.get(current.parentId); } return false; };
  const kinds = new Set();
  for (const node of nodes.filter((item) => ['Icon', 'IconButton'].includes(item.componentType) && underHeader(item))) {
    const block = (blocks?.blocks ?? []).find((item) => item.id === node.id);
    const icon = String(block?.component?.content?.icon ?? block?.component?.content?.name ?? node.displayName ?? '');
    if (CROSS.test(icon)) kinds.add('cross'); else if (BACK.test(icon)) kinds.add('back');
  }
  if (kinds.size === 2) return 'both';
  return kinds.size ? [...kinds][0] : null;
}

function targetViews(context, pageId) {
  if (pageId === context.pageId) return { outline: context.set.outline, blocks: context.set.blocks, events: context.set.events };
  const target = context.set.targets?.[pageId];
  return target && !target.error && target.outline ? target : null;
}

function h7(context) {
  const findings = [];
  for (const chain of context.chains) for (const event of chain.events ?? []) {
    if (event.actionType !== 'navigateToPage') continue;
    const target = event.payload?.pageId;
    if (typeof target !== 'string' || !target || target.includes('{{')) continue;
    const views = targetViews(context, target);
    if (!views) { context.unverified('H7', `target page ${target} not read (cache outline/blocks), so its header icon is unknown`); continue; }
    const icon = headerIcon(views.outline, views.blocks);
    if (!icon) continue;
    if (icon === 'both') { context.unverified('H7', `target page ${target} shows both a cross and a back icon; which one applies depends on state`); continue; }
    const sheet = isSheet(event.payload);
    const block = { id: chain.id, displayName: chain.name };
    const path = `events[${event.id}].action.payload.pageTransitionBehavior`;
    if (icon === 'cross' && !sheet) findings.push(makeFinding('H7', 'blocking', block, path, `opens ${target}, whose header shows a cross, as a push`, 'open it as a modal: overridePageAnimation true and pageTransitionBehavior adaptive_sheet, or change the icon to a back arrow'));
    if (icon === 'back' && sheet) findings.push(makeFinding('H7', 'blocking', block, path, `opens ${target}, whose header shows a back arrow, as an adaptive_sheet`, 'push it (no override), or change the icon to a cross'));
  }
  return findings;
}

function h16(context) {
  const findings = [];
  for (const chain of context.chains) for (const event of chain.events ?? []) {
    const payload = event.payload ?? {};
    if (event.actionType !== 'navigateBack' || payload.navigateToSpecificPage !== true) continue;
    const inputs = payload.pageInputs && typeof payload.pageInputs === 'object' ? Object.keys(payload.pageInputs) : [];
    if (!inputs.length) continue;
    const target = payload.pageId;
    const block = { id: chain.id, displayName: chain.name };
    if (typeof target !== 'string' || !target || target.includes('{{')) { context.unverified('H16', `${chain.name ?? chain.id} returns ${inputs.join(', ')} to a page chosen at run time (${String(target).slice(0, 60)}); its onPageFocus reader cannot be checked`); continue; }
    const views = targetViews(context, target);
    if (!views?.events) { context.unverified('H16', `target page ${target} events not read, so its onPageFocus reader is unknown`); continue; }
    const reads = (views.events.chains ?? []).some((item) => item.kind === 'page' && (item.events ?? []).some((pageEvent) => pageEvent.eventType === 'onPageFocus'));
    if (!reads) findings.push(makeFinding('H16', 'advisory', block, `events[${event.id}].action.payload.pageInputs`, `returns ${inputs.join(', ')} to ${target}, which has no onPageFocus event to read them`, 'declare the inputs on that page and read them in onPageFocus'));
  }
  return findings;
}

const LEAVES = new Set(['navigateBack', 'navigateToPage', 'navigate']);
const leaves = (event) => LEAVES.has(event.actionType) || (event.actionType === 'controlUser' && event.payload?.userControlAction === 'logout');

function h17(context) {
  const findings = [];
  for (const chain of context.chains.filter((item) => item.kind === 'page')) {
    const back = (chain.events ?? []).filter((event) => event.eventType === 'onPageBack');
    if (!back.length) continue;
    const exits = back.filter(leaves);
    // Declaring onPageBack takes the press whether or not an action runs, so a leave behind a
    // runCondition still leaves back dead wherever that condition is false (native.md rule 60).
    if (exits.length) {
      if (exits.every((event) => event.conditional)) context.unverified('H17', `${chain.name ?? chain.id} leaves its onPageBack chain only through a conditional action, so back works only where that condition holds`);
      continue;
    }
    findings.push(makeFinding('H17', 'advisory', { id: chain.id, displayName: chain.name }, `events[${back[0].id}]`, 'the page takes the Android back button (onPageBack) and no action in that chain navigates or signs out, so back does nothing on this page', 'end the onPageBack chain with navigateBack, or remove onPageBack if the page should simply close'));
  }
  return findings;
}

export const NAVIGATION_RULES = [
  { id: 'H6', title: 'Every page sets its status bar', severity: 'advisory', uaRule: null, run: h6 },
  { id: 'H7', title: 'A cross header opens as a sheet; a back arrow pushes', severity: 'blocking', uaRule: 'U8', run: h7 },
  { id: 'H16', title: 'A navigateBack result is read in onPageFocus', severity: 'advisory', uaRule: null, run: h16 },
  { id: 'H17', title: 'A page that takes the back button lets the person leave', severity: 'advisory', uaRule: null, run: h17 },
];
