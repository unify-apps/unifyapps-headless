// Data and naming rules decided from data sources, bindings, variables and folders:
// H1 identity parameters, H3 adaptation in inputs, H8 session storage, H9 minified customCSS,
// H10 constants/validator/one chain, H11 duplicate names, H15 public page reads.
import { makeFinding, walkStrings } from './rules.mjs';

const IDENTITY_PARAM = /^(?:user_?id|userid|user|e-?mail|user_?email|username|user_?name|full_?name|owner_?id|customer_?id|member_?id)$/iu;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/u;
const PLATFORM_ID = /^e_[0-9a-f]{24}$/u;
const isBinding = (value) => typeof value === 'string' && value.includes('{{');

function h1(context) {
  const findings = [];
  for (const source of context.sources) {
    const asBlock = { id: source.id, displayName: source.name ?? source.id };
    if (!source.bindingsKnown) { context.unverified('H1', `${source.name ?? source.id}: parameter bindings not read (cache ds --id ${source.id})`); continue; }
    for (const { name, value } of source.bindings) {
      const path = `inputs.parameters.${name}`;
      const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
      const fix = 'drop the parameter; the automation reads the signed-in user from User Variables';
      if (/userContext/u.test(text)) findings.push(makeFinding('H1', 'blocking', asBlock, path, `${name} is bound to userContext (${text.slice(0, 80)})`, fix));
      else if (EMAIL.test(text) && !isBinding(text)) findings.push(makeFinding('H1', 'blocking', asBlock, path, `${name} carries an email literal`, fix));
      else if (IDENTITY_PARAM.test(name) && !isBinding(text) && (PLATFORM_ID.test(text) || (text && !/^(?:true|false|\d+)$/u.test(text)))) findings.push(makeFinding('H1', 'blocking', asBlock, path, `${name} carries a user id literal ${text.slice(0, 40)}`, fix));
      else if (IDENTITY_PARAM.test(name) && isBinding(text)) findings.push(makeFinding('H1', 'advisory', asBlock, path, `${name} is bound to ${text.slice(0, 60)}; fine only when the person types it (sign-up), never for the signed-in user`, fix));
    }
  }
  return findings;
}

const ADAPTATION = /\.(?:filter|map|sort|reduce)\(/u;
function h3(context) {
  const findings = [];
  for (const block of context.blocks) {
    walkStrings({ component: block.component ?? {}, visibility: block.visibility ?? {} }, '', (path, text) => {
      if (!text.includes('{{')) return;
      const long = text.length > 200;
      if (!long && !ADAPTATION.test(text)) return;
      findings.push(makeFinding('H3', 'blocking', block, path, `${long ? `${text.length}-character binding` : `binding calls ${ADAPTATION.exec(text)[0]}…)`} in a block input`, "move the adaptation to a manual page function and bind {{ func_x['value'] }}"));
    });
  }
  return findings;
}

function h8(context) {
  const findings = [];
  const seen = new Set();
  const note = (block, path) => { if (!seen.has(`${block.id}:${path}`)) { seen.add(`${block.id}:${path}`); findings.push(makeFinding('H8', 'blocking', block, path, 'sessionStorage is a web concept; mobile apps have none', 'use an app variable for in-memory state, local storage for values that survive a restart, navigateBack inputs to return a result')); } };
  for (const block of context.blocks) walkStrings(block, '', (path, text) => { if (/sessionStorage/u.test(text)) note(block, path); });
  for (const chain of context.chains) walkStrings(chain.events, 'events', (path, text) => { if (/sessionStorage/u.test(text)) note({ id: chain.id, displayName: chain.name }, path); });
  for (const item of [...(context.set.keys?.variables ?? []), ...Object.values(context.info.pageFunctions ?? {})]) {
    walkStrings(item, '', (path, text) => { if (/sessionStorage/u.test(text)) note({ id: item.id, displayName: item.name }, path); });
  }
  return findings;
}

function h9(context) {
  return context.blocks.filter((block) => typeof block.additional?.customCSS === 'string' && !block.additional.customCSS.includes('\n') && block.additional.customCSS.length > 80)
    .map((block) => makeFinding('H9', 'advisory', block, 'additional.customCSS', `customCSS is one ${block.additional.customCSS.length}-character line`, 'store it pretty-printed so a human can read it'));
}

const UPPER_SNAKE = /^[A-Z][A-Z0-9_]+$/u;
function h10(context) {
  const findings = [];
  const page = { id: null, displayName: context.info.name ?? context.pageId };
  if (context.info.pageVariables) {
    const folders = context.info.folders ?? {};
    const loose = Object.values(context.info.pageVariables).filter((variable) => UPPER_SNAKE.test(variable?.name ?? '') && !/^constants/iu.test(folders[variable.parentId]?.name ?? ''));
    if (loose.length) findings.push(makeFinding('H10', 'advisory', page, 'properties.pageVariables', `constants outside a constants folder: ${loose.map((variable) => variable.name).join(', ')}`, 'keep constants in a constants folder of page variables'));
  } else context.unverified('H10', 'page folders not read (entity context page), so the constants folder is unknown');
  const validator = (context.set.keys?.functions ?? []).some((item) => /valid/iu.test(item.name ?? ''));
  for (const chain of context.chains.filter((item) => item.kind === 'block' && ['Button', 'Pressable', 'IconButton'].includes(item.componentType))) {
    const byEvent = new Map();
    for (const event of chain.events) byEvent.set(event.eventType, [...(byEvent.get(event.eventType) ?? []), event]);
    for (const [eventType, events] of byEvent) {
      const conditional = events.filter((event) => event.conditional);
      if (conditional.length >= 2) findings.push(makeFinding('H10', 'advisory', { id: chain.id, displayName: chain.name }, `events.${eventType}`, `${conditional.length} conditional actions on one ${eventType}: modes decided by runConditions`, 'one plain action chain per button; a button per mode instead of runConditions'));
      else if (!validator && conditional.some((event) => ['setPageVariable', 'showNotification'].includes(event.actionType))) findings.push(makeFinding('H10', 'advisory', { id: chain.id, displayName: chain.name }, `events.${eventType}`, 'inline validation in the chain and no validator function on the page', 'one manual validator returns { field: { valid, error }, canContinue }; captions, borders and buttons only read it'));
    }
  }
  return findings;
}

function duplicates(items) {
  const byName = new Map();
  for (const item of items) { const key = String(item.name ?? '').trim().toLowerCase(); if (key) byName.set(key, [...(byName.get(key) ?? []), item]); }
  return [...byName.values()].filter((list) => list.length > 1);
}
function h11(context) {
  const findings = [];
  const page = { id: null, displayName: context.info.name ?? context.pageId };
  const sets = [['data source', context.sources.map((source) => ({ name: source.name, id: source.id }))], ['variable', context.set.keys?.variables ?? []], ['function', context.set.keys?.functions ?? []], ['folder', Object.values(context.info.folders ?? {})]];
  for (const [kind, items] of sets) for (const list of duplicates(items)) findings.push(makeFinding('H11', 'blocking', page, kind, `${kind} name ${list[0].name} used ${list.length} times on the page (${list.map((item) => item.id).join(', ')})`, 'names are unique app-wide; qualify the name'));
  const appWide = context.set['app-ds'];
  if (appWide) {
    const all = (appWide.pages ?? []).flatMap((entry) => (entry.dataSources ?? []).map((source) => ({ name: source.name, id: source.id, pageId: entry.pageId })));
    for (const list of duplicates(all).filter((group) => new Set(group.map((item) => item.pageId)).size > 1 && group.some((item) => item.pageId === context.pageId))) {
      findings.push(makeFinding('H11', 'blocking', page, 'data source', `data source name ${list[0].name} also exists on ${list.filter((item) => item.pageId !== context.pageId).map((item) => item.pageId).join(', ')}`, 'names are unique app-wide; qualify the name'));
    }
  } else context.unverified('H11', 'app-wide names not read (cache ds --app-id <app>); only this page was checked');
  if (!context.info.folders) context.unverified('H11', 'page folders not read (entity context page); folder names not checked');
  return findings;
}

function h15(context) {
  const findings = [];
  if (context.info.isPublic === null) { context.unverified('H15', 'cache paths not read, so whether the page is public is unknown'); return findings; }
  if (context.info.folders) {
    const page = { id: null, displayName: context.info.name ?? context.pageId };
    for (const folder of Object.values(context.info.folders)) if (folder?.parentId && context.info.folders[folder.parentId]) findings.push(makeFinding('H15', 'blocking', page, `properties.folders.${folder.id}`, `folder ${folder.name} nests inside ${context.info.folders[folder.parentId].name}`, 'folders nest one level only'));
  }
  if (!context.info.isPublic) return findings;
  const own = new Set((context.set.keys?.variables ?? []).map((variable) => variable.id));
  const seen = new Set();
  const check = (block, path, text) => {
    for (const match of text.matchAll(/var_[A-Za-z0-9]+/gu)) {
      if (own.has(match[0]) || seen.has(`${block.id}:${match[0]}`)) continue;
      seen.add(`${block.id}:${match[0]}`);
      findings.push(makeFinding('H15', 'blocking', block, path, `public page reads ${match[0]}, which is not one of its own variables (an app-level one)`, 'keep the value on the page; public pages cannot read global-page variables'));
    }
  };
  for (const block of context.blocks) walkStrings({ component: block.component ?? {}, visibility: block.visibility ?? {}, events: block.events ?? [] }, '', (path, text) => check(block, path, text));
  for (const chain of context.chains.filter((item) => item.kind !== 'block')) walkStrings(chain.events, 'events', (path, text) => check({ id: chain.id, displayName: chain.name }, path, text));
  return findings;
}

// assets.json is the design board's record: [{ url, sha256, previousSha256? }]. Without it there is nothing to compare, so the rule stays quiet.
function h12(context) {
  const assets = Array.isArray(context.set.assets) ? context.set.assets : context.set.assets?.assets ?? null;
  if (!assets) return [];
  const findings = [];
  for (const asset of assets.filter((item) => item?.url && item.previousSha256 && item.sha256 && item.previousSha256 !== item.sha256)) {
    const block = context.blocks.find((item) => JSON.stringify(item).includes(asset.url));
    if (block) findings.push(makeFinding('H12', 'advisory', block, 'component.content', `${asset.url} changed bytes under the same name; phones and the CDN keep the old picture`, 're-upload under a new file name (content hash) and bind the new address'));
  }
  return findings;
}

export const DATA_RULES = [
  { id: 'H1', title: 'No user identity as a data-source parameter', severity: 'blocking', uaRule: null, run: h1 },
  { id: 'H3', title: 'Component inputs hold plain references', severity: 'blocking', uaRule: 'P2', run: h3 },
  { id: 'H8', title: 'No session storage on mobile', severity: 'blocking', uaRule: null, run: h8 },
  { id: 'H9', title: 'customCSS is pretty-printed', severity: 'advisory', uaRule: null, run: h9 },
  { id: 'H10', title: 'Constants folder, one validator, one chain per button', severity: 'advisory', uaRule: null, run: h10 },
  { id: 'H11', title: 'Names are unique app-wide', severity: 'blocking', uaRule: null, run: h11 },
  { id: 'H12', title: 'A changed asset gets a new file name', severity: 'advisory', uaRule: null, run: h12 },
  { id: 'H15', title: 'Public pages read no app-level variables; folders nest one level', severity: 'blocking', uaRule: null, run: h15 },
];
