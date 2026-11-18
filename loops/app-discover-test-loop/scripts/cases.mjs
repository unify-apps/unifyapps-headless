#!/usr/bin/env node
// The cases of a WEB app's test design: check them, bring in what a discover loop's walk found, build
// and apply their review page, render the approved ones as the scenario list the Test Studio create loop
// reads, and record what that loop saved. Node 22, no dependencies. Reads and writes only the app's
// tests/<app slug>/ files.
//
//   node cases.mjs check  --cases <cases.json> [--json]
//   node cases.mjs import --cases <cases.json> --scenarios <firing>/scenarios.json [--firing <firing id>] [--json]
//                         (exit 1 when the check finds problems after the import)
//   node cases.mjs render --cases <cases.json> --out <cases.md> [--app <name>] [--url <app url>] [--json]
//   node cases.mjs review build --cases <cases.json> --out <review.html> [--open] [--json]
//   node cases.mjs review apply --cases <cases.json> --decisions <review-decisions.json> [--json]
//   node cases.mjs automation --cases <cases.json> --run <run.json> [--json]
//
// Exit codes: 0 done (check: every case passed) · 1 check found problems, or a file was unreadable · 2 usage.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';

export const DECISIONS = Object.freeze(['pending', 'approved', 'changes', 'rejected']);
export const PRIORITIES = Object.freeze(['P1', 'P2', 'P3']);
const ID = /^[A-Z][A-Z0-9]*-\d{3,}$/u;
// Words that let a case pass with the bug present (cases.md, "Expected results that can fail").
const WEAK = /\b(ideally|either|or truncates|ask reviewer|record if|should probably|may or may not|if possible)\b/iu;
// A source cites the PRD (R3, A3.1), a flow, a ticket, a live read or a walk of the app.
const SOURCE = /(\bR\d+\b|\bA\d+\.\d+\b|^(flow|ticket|live|walk):)/u;
// How many words a title may have: a title is a line of a review page, not a description.
const TITLE_WORDS = 14;

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const clean = (value) => String(value ?? '').replace(/\s+/gu, ' ').trim();

/** The content a decision applies to: a change to any of it needs a fresh decision. */
export function contentHash(c) {
  const facts = [c.title, c.page, c.preconditions, ...(Array.isArray(c.steps) ? c.steps : []), c.expected, c.source, c.priority].map(clean);
  return createHash('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, 16);
}

/** Problems with a case file, one line each; an empty list means ok. */
export function checkCases(doc) {
  const problems = [];
  const cases = Array.isArray(doc?.cases) ? doc.cases : null;
  if (!cases) return ['the file has no "cases" array'];
  if (!cases.length) return ['the file has no cases'];
  const seen = new Map();
  cases.forEach((c, index) => {
    const at = c?.id ? c.id : `case ${index + 1}`;
    if (!c || typeof c !== 'object') { problems.push(`${at}: not an object`); return; }
    if (!ID.test(String(c.id ?? ''))) problems.push(`${at}: id must be an upper-case prefix and a number, like ORD-001`);
    else if (seen.has(c.id)) problems.push(`${at}: duplicate id (also case ${seen.get(c.id) + 1})`);
    else seen.set(c.id, index);
    const title = clean(c.title);
    if (!title) problems.push(`${at}: title is empty`);
    else if (title.split(' ').length > TITLE_WORDS) problems.push(`${at}: title has more than ${TITLE_WORDS} words`);
    for (const field of ['page', 'feature', 'group']) if (!clean(c[field])) problems.push(`${at}: ${field} is empty`);
    if (!PRIORITIES.includes(c.priority)) problems.push(`${at}: priority must be one of ${PRIORITIES.join(', ')}`);
    const steps = Array.isArray(c.steps) ? c.steps.map(clean).filter(Boolean) : [];
    if (!steps.length) problems.push(`${at}: needs at least one step`);
    const expected = clean(c.expected);
    if (!expected) problems.push(`${at}: expected is empty`);
    else if (WEAK.test(expected)) problems.push(`${at}: expected uses a word that lets the case pass with the bug present ("${WEAK.exec(expected)[0]}")`);
    const source = clean(c.source);
    if (!source) problems.push(`${at}: source is empty`);
    else if (!SOURCE.test(source)) problems.push(`${at}: source names no PRD id (R3, A3.1), flow:, ticket:, live: or walk:`);
    if (c.decision !== undefined && !DECISIONS.includes(c.decision)) problems.push(`${at}: decision must be one of ${DECISIONS.join(', ')}`);
  });
  return problems;
}

/** Counts by decision, page and feature. */
export function counts(doc) {
  const out = { total: 0, pending: 0, approved: 0, changes: 0, rejected: 0, byPage: {}, byFeature: {} };
  for (const c of doc.cases ?? []) {
    out.total += 1;
    out[DECISIONS.includes(c.decision) ? c.decision : 'pending'] += 1;
    out.byPage[c.page] = (out.byPage[c.page] ?? 0) + 1;
    out.byFeature[c.feature] = (out.byFeature[c.feature] ?? 0) + 1;
  }
  return out;
}

// A description line that undoes what the scenario made: the walk writes these after the line it checks.
const TEARDOWN = /^(?:delete|remove|clean up|tear down|discard|archive|revert|restore|sign out|log out|close)\b/iu;
// An entity id in a URL path, which is no page name.
const ENTITY_ID = /^e_[0-9a-f]{24}$/u;
const PREFIX = /^[A-Z][A-Z0-9]*$/u;

// What a walked scenario checks and as whom, so a re-walk updates the case that checks the same thing
// instead of adding a second, and two scenarios that differ by role or by where they end stay two cases.
function walkFingerprint(s) {
  const covers = Array.isArray(s.covers) ? s.covers.map(clean).filter(Boolean).sort() : [];
  const roles = Array.isArray(s.roles) ? s.roles.map(clean).filter(Boolean) : [];
  const path = Array.isArray(s.path) ? s.path.map(clean).filter(Boolean) : [];
  const variant = s.variant?.class ? clean(s.variant.class) : '';
  const check = covers.length ? covers.join('+') : `title:${clean(s.title).toLowerCase()}`;
  return [check, `end:${path[path.length - 1] ?? ''}`, `as:${roles.join('+')}`, `variant:${variant}`].join('|');
}

/** The id prefix new cases take: the file's own, else the one most of its cases use, else the app's initials. */
export function idPrefix(doc) {
  const own = clean(doc.idPrefix).toUpperCase();
  if (PREFIX.test(own)) return own;
  const tally = new Map();
  for (const c of doc.cases ?? []) {
    const m = /^([A-Z][A-Z0-9]*)-\d+$/u.exec(String(c.id ?? ''));
    if (m) tally.set(m[1], (tally.get(m[1]) ?? 0) + 1);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) return top[0];
  const initials = clean(doc.app?.name).split(' ').map((w) => w[0] ?? '').join('').toUpperCase().replace(/[^A-Z0-9]/gu, '').slice(0, 4);
  return PREFIX.test(initials) ? initials : 'CASE';
}

function nextNumber(doc, prefix) {
  let max = 0;
  for (const c of doc.cases ?? []) {
    const m = new RegExp(`^${prefix}-(\\d+)$`, 'u').exec(String(c.id ?? ''));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/** The page a scenario starts on: the last path segment of its starting URL, resolved against the app's. */
function pageOf(startingUrl, appUrl, fallback) {
  let page = '';
  try {
    const u = appUrl ? new URL(String(startingUrl || ''), appUrl) : new URL(String(startingUrl));
    page = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '');
  } catch { page = ''; }
  return page && !ENTITY_ID.test(page) ? page : fallback;
}

/**
 * A walked scenario as a case. Its description is steps, then the line it checks, then the lines that
 * undo what it made; the check is the expected result, the lines after it the cleanup. An explicit
 * `expected` on the scenario wins.
 */
export function caseFromScenario(s, { firing, url = '' } = {}) {
  const lines = String(s.description ?? '').split('\n').map((l) => clean(l).replace(/^-\s*/u, '')).filter(Boolean);
  let at = lines.length - 1;
  while (at > 0 && TEARDOWN.test(lines[at])) at -= 1;
  const explicit = clean(s.expected);
  const expected = explicit || (at >= 0 ? lines[at] : '');
  let steps = explicit ? lines.filter((l) => !TEARDOWN.test(l)) : lines.slice(0, at);
  const cleanup = explicit ? lines.filter((l) => TEARDOWN.test(l)) : lines.slice(at + 1);
  if (!steps.length && expected) steps = [`Open ${clean(s.startingUrl) || url || 'the app'}`];
  const covers = Array.isArray(s.covers) ? s.covers.map(clean).filter(Boolean) : [];
  const roles = Array.isArray(s.roles) ? s.roles.map(clean).filter(Boolean) : [];
  return {
    module: clean(s.module), feature: clean(s.feature), group: clean(s.scenarioGroup) || 'General', page: pageOf(s.startingUrl, url, clean(s.feature) || 'Start'),
    title: clean(s.title), priority: PRIORITIES.includes(s.priority) ? s.priority : 'P1',
    preconditions: roles.length ? `As ${roles.join(', then ')}.` : '', steps, expected, cleanup,
    source: `walk: ${covers.length ? covers.join(', ') : 'the live app'}${s.variant?.class ? ` (${clean(s.variant.class)})` : ''}`,
    startingUrl: clean(s.startingUrl),
    walk: { firing, key: String(s.key ?? ''), fingerprint: walkFingerprint(s), covers, path: Array.isArray(s.path) ? s.path : [], ...(s.variant ? { variant: s.variant } : {}), ...(s.provision ? { provision: s.provision } : {}) },
  };
}

// What a re-walk compares: the reviewed content, plus the fields the scenario list carries that the hash skips.
const walkFacts = (c) => JSON.stringify([contentHash(c), c.startingUrl, c.module, c.feature, c.group, ...(Array.isArray(c.cleanup) ? c.cleanup : [])].map(clean));

/**
 * Brings a discover loop's scenarios into the case file as cases with `source: walk:`. A scenario that
 * checks what an existing walked case checks, as the same roles, updates that case, and a changed one
 * goes back to pending; the rest are added under the file's id prefix. A walked case this walk no longer
 * proposes is marked gone and goes back to pending. The walk's not-covered rows are kept under `walks`.
 */
export function importScenarios(doc, scenarios, { firing, now = new Date().toISOString() } = {}) {
  const list = Array.isArray(scenarios?.scenarios) ? scenarios.scenarios : [];
  const notCovered = Array.isArray(scenarios?.notCovered) ? scenarios.notCovered : [];
  const result = { firing, scenarios: list.length, added: [], updated: [], unchanged: [], gone: [], notCovered: notCovered.length };
  doc.cases = Array.isArray(doc.cases) ? doc.cases : [];
  const prefix = idPrefix(doc);
  let number = nextNumber(doc, prefix);
  const byPrint = new Map(doc.cases.filter((c) => c.walk?.fingerprint).map((c) => [c.walk.fingerprint, c]));
  const seen = new Set();
  for (const s of list) {
    const fresh = caseFromScenario(s, { firing, url: doc.app?.url });
    seen.add(fresh.walk.fingerprint);
    const existing = byPrint.get(fresh.walk.fingerprint);
    if (!existing) {
      const id = `${prefix}-${String(number).padStart(3, '0')}`;
      number += 1;
      doc.cases.push({ id, ...fresh, status: 'new', decision: 'pending', importedAt: now });
      result.added.push(id);
      continue;
    }
    const before = walkFacts(existing);
    Object.assign(existing, fresh);
    if (walkFacts(existing) === before) { result.unchanged.push(existing.id); continue; }
    existing.status = 'changed';
    existing.decision = 'pending';
    existing.importedAt = now;
    result.updated.push(existing.id);
  }
  for (const c of doc.cases) {
    if (!c.walk?.fingerprint || seen.has(c.walk.fingerprint) || c.status === 'gone') continue;
    c.status = 'gone';
    c.decision = 'pending';
    c.walk.goneSince = firing;
    result.gone.push(c.id);
  }
  doc.walks = (Array.isArray(doc.walks) ? doc.walks : []).filter((w) => w.firing !== firing);
  doc.walks.push({ firing, at: now, scenarios: list.length, added: result.added.length, updated: result.updated.length, gone: result.gone.length, notCovered });
  return result;
}

/**
 * The approved cases as the scenario list the create loop reads: `## module`, `### feature`,
 * `#### group`, numbered entries `**title** (id) — priority — starts at <url>`, the steps as a list
 * with the expected result last, and a facts line. The rest go under "Not in this list".
 */
export function renderScenarios(doc, { app = doc.app?.name ?? 'App', url = doc.app?.url ?? '' } = {}) {
  const lines = [];
  const all = doc.cases ?? [];
  const approved = all.filter((c) => c.decision === 'approved');
  const version = doc.prd?.version ? ` v${doc.prd.version}` : '';
  lines.push(`# ${app} — test cases from the PRD${version} (${approved.length} approved of ${all.length})`, '');
  const tree = new Map();
  for (const c of approved) {
    const module = clean(c.module) || app;
    if (!tree.has(module)) tree.set(module, new Map());
    const features = tree.get(module);
    const feature = clean(c.feature) || 'General';
    if (!features.has(feature)) features.set(feature, new Map());
    const groups = features.get(feature);
    const group = clean(c.group) || 'General';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(c);
  }
  let number = 0;
  for (const [module, features] of tree) {
    lines.push(`## ${module}`, '');
    for (const [feature, groups] of features) {
      lines.push(`### ${feature}`, '');
      for (const [group, cases] of groups) {
        lines.push(`#### ${group}`, '');
        for (const c of cases) {
          number += 1;
          lines.push(`${number}. **${clean(c.title)}** (${c.id}) — ${c.priority ?? 'P2'} — starts at ${clean(c.startingUrl) || url}  `);
          if (clean(c.preconditions)) lines.push(`   - Given: ${clean(c.preconditions)}`);
          for (const step of c.steps ?? []) if (clean(step)) lines.push(`   - ${clean(step)}`);
          lines.push(`   - Expected: ${clean(c.expected)}`);
          for (const step of c.cleanup ?? []) if (clean(step)) lines.push(`   - ${clean(step)}`);
          lines.push('');
          lines.push(`   Covers: ${clean(c.source)} · Page: ${clean(c.page)}`, '');
        }
      }
    }
  }
  const rest = all.filter((c) => c.decision !== 'approved');
  if (rest.length) {
    lines.push('## Not in this list', '');
    for (const c of rest) {
      const why = c.decision === 'rejected' ? 'rejected' : c.decision === 'changes' ? 'changes requested' : 'not yet reviewed';
      const note = clean(c.notes);
      lines.push(`- ${c.id} ${clean(c.title)} — ${why}${note ? `: ${note}` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/gu, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** One self-contained review page: every case, a decision and notes per case, filters, a download. */
export function renderReviewHtml(doc, { builtAt = new Date().toISOString() } = {}) {
  const app = clean(doc.app?.name) || 'App';
  const buildId = createHash('sha256').update(builtAt + JSON.stringify(doc.cases ?? [])).digest('hex').slice(0, 12);
  const cases = (doc.cases ?? []).map((c) => ({
    id: c.id, page: clean(c.page), feature: clean(c.feature), group: clean(c.group), title: clean(c.title), priority: c.priority ?? 'P2',
    preconditions: clean(c.preconditions), steps: (c.steps ?? []).map(clean).filter(Boolean), expected: clean(c.expected), source: clean(c.source),
    status: c.status ?? 'new', decision: DECISIONS.includes(c.decision) ? c.decision : 'pending', notes: clean(c.notes), hash: contentHash(c),
  }));
  const data = JSON.stringify({ app, buildId, builtAt, prdVersion: doc.prd?.version ?? null, cases }).replace(/<\/script/giu, '<\\/script');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(app)} test cases: review</title>
<style>
:root { color-scheme: light dark; --ink: #1b1b1b; --muted: #6b6b6b; --line: #d9d9d4; --page: #faf9f6; --card: #fff; --ok: #1a8f4a; --warn: #c27a00; --bad: #c2362b; }
@media (prefers-color-scheme: dark) { :root { --ink: #f1f1ee; --muted: #a8a8a2; --line: #3a3a37; --page: #141413; --card: #1e1e1c; } }
* { box-sizing: border-box; } body { margin: 0; font: 15px/1.45 system-ui, sans-serif; color: var(--ink); background: var(--page); }
header { position: sticky; top: 0; background: var(--card); border-bottom: 1px solid var(--line); padding: 12px 16px; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
header h1 { font-size: 17px; margin: 0; } header input, header select { font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--ink); }
header button { font: inherit; padding: 7px 12px; border-radius: 6px; border: 1px solid var(--line); background: var(--card); color: var(--ink); cursor: pointer; } header button.primary { background: var(--ink); color: var(--page); border-color: var(--ink); }
main { max-width: 980px; margin: 0 auto; padding: 16px; } .counts { color: var(--muted); margin: 0 0 12px; }
article { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 0 0 12px; }
article h2 { font-size: 16px; margin: 0 0 4px; } .meta { color: var(--muted); font-size: 13px; margin: 0 0 8px; } .meta b { color: var(--ink); font-weight: 600; }
ol { margin: 6px 0 8px 20px; padding: 0; } .expected { margin: 6px 0 10px; padding: 8px 10px; border-left: 3px solid var(--line); }
.decide { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; } .decide label { cursor: pointer; } textarea { width: 100%; min-height: 48px; margin-top: 8px; font: inherit; padding: 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--page); color: var(--ink); }
article[data-decision="approved"] { border-left: 4px solid var(--ok); } article[data-decision="changes"] { border-left: 4px solid var(--warn); } article[data-decision="rejected"] { border-left: 4px solid var(--bad); }
.tag { display: inline-block; font-size: 12px; padding: 1px 7px; border: 1px solid var(--line); border-radius: 999px; margin-left: 6px; color: var(--muted); }
section.coverage { background: var(--card); border: 1px dashed var(--line); border-radius: 10px; padding: 14px 16px; margin: 16px 0; }
@media (max-width: 600px) { main { padding: 12px; } header { padding: 10px 12px; } }
</style>
</head>
<body>
<header>
  <h1>${esc(app)}: test cases to review</h1>
  <input id="reviewer" placeholder="Your name" aria-label="Your name">
  <select id="page" aria-label="Page"><option value="">Every page</option></select>
  <select id="decision" aria-label="Decision"><option value="">Every decision</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="changes">Changes requested</option><option value="rejected">Rejected</option></select>
  <input id="search" placeholder="Search" aria-label="Search">
  <button id="download" class="primary" type="button">Download decisions</button>
</header>
<main>
  <p class="counts" id="counts"></p>
  <div id="list"></div>
  <section class="coverage">
    <h2 style="font-size:16px;margin:0 0 6px">Coverage feedback</h2>
    <p class="meta">What is missing, what should change, what is not worth testing. This goes to the agent with your decisions.</p>
    <textarea id="coverage" placeholder="Nothing yet"></textarea>
  </section>
</main>
<script id="data" type="application/json">${data}</script>
<script>
(() => {
  const D = JSON.parse(document.getElementById('data').textContent);
  const KEY = 'web-design-test-review:' + D.buildId;
  let state = { reviewer: '', coverage: '', decisions: {} };
  try { state = Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  for (const c of D.cases) if (!state.decisions[c.id]) state.decisions[c.id] = { decision: c.decision, notes: c.notes, hash: c.hash };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const pages = [...new Set(D.cases.map((c) => c.page))].sort();
  for (const p of pages) { const o = document.createElement('option'); o.value = p; o.textContent = p; $('page').appendChild(o); }
  $('reviewer').value = state.reviewer || ''; $('coverage').value = state.coverage || '';
  $('reviewer').addEventListener('input', (e) => { state.reviewer = e.target.value; save(); });
  $('coverage').addEventListener('input', (e) => { state.coverage = e.target.value; save(); });
  const labels = { pending: 'Pending', approved: 'Approve', changes: 'Changes requested', rejected: 'Reject' };
  function render() {
    const page = $('page').value, decision = $('decision').value, q = $('search').value.trim().toLowerCase();
    const list = $('list'); list.innerHTML = '';
    let shown = 0; const tally = { pending: 0, approved: 0, changes: 0, rejected: 0 };
    for (const c of D.cases) {
      const d = state.decisions[c.id]; tally[d.decision] = (tally[d.decision] || 0) + 1;
      if (page && c.page !== page) continue; if (decision && d.decision !== decision) continue;
      if (q && !(c.id + ' ' + c.title + ' ' + c.steps.join(' ') + ' ' + c.expected + ' ' + c.source).toLowerCase().includes(q)) continue;
      shown++;
      const a = document.createElement('article'); a.dataset.decision = d.decision;
      a.innerHTML = '<h2>' + esc(c.id) + ' · ' + esc(c.title) + '<span class="tag">' + esc(c.priority) + '</span><span class="tag">' + esc(c.status) + '</span></h2>'
        + '<p class="meta"><b>' + esc(c.page) + '</b> · ' + esc(c.feature) + ' · ' + esc(c.group) + ' · proves ' + esc(c.source) + '</p>'
        + (c.preconditions ? '<p class="meta">Given: ' + esc(c.preconditions) + '</p>' : '')
        + '<ol>' + c.steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>'
        + '<div class="expected"><b>Expected:</b> ' + esc(c.expected) + '</div>'
        + '<div class="decide">' + ['approved', 'changes', 'rejected', 'pending'].map((v) => '<label><input type="radio" name="d-' + esc(c.id) + '" value="' + v + '"' + (d.decision === v ? ' checked' : '') + '> ' + labels[v] + '</label>').join('') + '</div>'
        + '<textarea placeholder="Notes for the agent: what to change, or why it is rejected">' + esc(d.notes) + '</textarea>';
      a.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', (e) => { d.decision = e.target.value; a.dataset.decision = d.decision; save(); counts(); }));
      a.querySelector('textarea').addEventListener('input', (e) => { d.notes = e.target.value; save(); });
      list.appendChild(a);
    }
    counts(shown);
  }
  function counts(shown) {
    const t = { pending: 0, approved: 0, changes: 0, rejected: 0 };
    for (const c of D.cases) t[state.decisions[c.id].decision]++;
    $('counts').textContent = D.cases.length + ' cases' + (shown != null && shown !== D.cases.length ? ' (' + shown + ' shown)' : '') + ' · ' + t.approved + ' approved · ' + t.changes + ' changes requested · ' + t.rejected + ' rejected · ' + t.pending + ' pending' + (D.prdVersion ? ' · PRD v' + D.prdVersion : '');
  }
  ['page', 'decision', 'search'].forEach((id) => $(id).addEventListener('input', render));
  $('download').addEventListener('click', () => {
    const out = { app: D.app, buildId: D.buildId, builtAt: D.builtAt, reviewer: state.reviewer || 'unnamed', decidedAt: new Date().toISOString(), coverage: state.coverage || '', decisions: state.decisions };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'review-decisions.json'; document.body.appendChild(a); a.click(); a.remove();
  });
  window.addEventListener('beforeunload', (e) => { if (Object.values(state.decisions).some((d) => d.decision !== 'pending')) { e.preventDefault(); e.returnValue = ''; } });
  render();
})();
</script>
</body>
</html>
`;
}

/**
 * Writes the downloaded decisions into the case file. A decision lands only when the case's content
 * still hashes to what the page showed; otherwise the case stays pending and is listed as stale.
 */
export function applyDecisions(doc, decisions, { now = new Date().toISOString() } = {}) {
  const result = { applied: 0, stale: [], unknown: [], unchanged: 0, coverage: clean(decisions?.coverage), reviewer: clean(decisions?.reviewer) || 'unnamed' };
  const map = decisions?.decisions && typeof decisions.decisions === 'object' ? decisions.decisions : {};
  const ids = new Set((doc.cases ?? []).map((c) => c.id));
  for (const id of Object.keys(map)) if (!ids.has(id)) result.unknown.push(id);
  for (const c of doc.cases ?? []) {
    const d = map[c.id];
    if (!d || !DECISIONS.includes(d.decision)) { result.unchanged += 1; continue; }
    if (d.hash && d.hash !== contentHash(c)) { c.decision = 'pending'; result.stale.push(c.id); continue; }
    const same = c.decision === d.decision && clean(c.notes) === clean(d.notes);
    if (same) { result.unchanged += 1; continue; }
    c.decision = d.decision;
    c.notes = clean(d.notes);
    c.reviewer = result.reviewer;
    c.decidedAt = decisions.decidedAt ?? now;
    c.history = Array.isArray(c.history) ? c.history : [];
    c.history.push({ decision: d.decision, notes: c.notes, reviewer: result.reviewer, at: c.decidedAt, hash: contentHash(c) });
    result.applied += 1;
  }
  return result;
}

/** Records what the create loop did with each approved case, from its run file's entries. */
export function recordAutomation(doc, run) {
  const entries = Array.isArray(run?.entries) ? run.entries : Array.isArray(run?.scenarios) ? run.scenarios : [];
  const byKey = new Map(entries.map((e) => [String(e.key ?? e.id ?? ''), e]));
  const result = { saved: 0, authored: 0, parked: 0, missing: [] };
  for (const c of doc.cases ?? []) {
    if (c.decision !== 'approved') continue;
    const e = byKey.get(c.id);
    if (!e) { result.missing.push(c.id); continue; }
    c.automation = { firing: run.firingId ?? run.firing ?? null, state: e.state ?? null, testCaseId: e.testCaseId ?? e.caseId ?? null, name: e.name ?? null, parkedReason: e.parkedReason ?? null };
    if (e.state === 'saved') result.saved += 1;
    else if (e.state === 'authored') result.authored += 1;
    else if (e.state === 'parked') result.parked += 1;
  }
  return result;
}

function usage(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function openInBrowser(file) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [file]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : ['xdg-open', [file]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); return true; } catch { return false; }
}

export function main(argv = process.argv.slice(2)) {
  const [first, second] = argv;
  const sub = first === 'review' ? `review ${second}` : first;
  const rest = first === 'review' ? argv.slice(2) : argv.slice(1);
  const { values } = parseArgs({ args: rest, options: { cases: { type: 'string' }, out: { type: 'string' }, app: { type: 'string' }, url: { type: 'string' }, decisions: { type: 'string' }, run: { type: 'string' }, scenarios: { type: 'string' }, firing: { type: 'string' }, open: { type: 'boolean' }, json: { type: 'boolean' } }, strict: true });
  const print = (obj, text) => process.stdout.write(values.json ? `${JSON.stringify(obj)}\n` : `${text}\n`);
  if (!values.cases) usage('--cases <cases.json> is required');
  let doc;
  try { doc = readJson(resolve(values.cases)); } catch (error) { process.stderr.write(`cannot read ${values.cases}: ${error.message}\n`); process.exit(1); }
  const save = () => writeFileSync(resolve(values.cases), `${JSON.stringify(doc, null, 2)}\n`);
  switch (sub) {
    case 'check': {
      const problems = checkCases(doc);
      print({ ok: !problems.length, problems, counts: counts(doc) }, problems.length ? problems.join('\n') : 'ok');
      process.exit(problems.length ? 1 : 0);
      break;
    }
    case 'import': {
      if (!values.scenarios) usage('import needs --scenarios <scenarios.json> [--firing <firing id>]');
      const file = resolve(values.scenarios);
      if (!existsSync(file)) { process.stderr.write(`no file at ${values.scenarios}: the discover loop writes scenarios.json in its firing folder\n`); process.exit(1); }
      const firing = values.firing ?? basename(dirname(file));
      const result = importScenarios(doc, readJson(file), { firing });
      save();
      const problems = checkCases(doc);
      print({ ok: !problems.length, ...result, problems }, `imported ${result.scenarios} scenarios from walk ${firing}: ${result.added.length} added, ${result.updated.length} changed, ${result.unchanged.length} unchanged, ${result.gone.length} gone, ${result.notCovered} not-covered rows kept${problems.length ? `\nfix before the review:\n${problems.join('\n')}` : ''}`);
      process.exit(problems.length ? 1 : 0);
      break;
    }
    case 'render': {
      if (!values.out) usage('render needs --out <cases.md>');
      const text = renderScenarios(doc, { app: values.app, url: values.url });
      mkdirSync(dirname(resolve(values.out)), { recursive: true });
      writeFileSync(resolve(values.out), text);
      const c = counts(doc);
      print({ ok: true, out: values.out, ...c }, `wrote ${values.out}: ${c.approved} approved of ${c.total} (${c.rejected} rejected, ${c.changes} changes requested, ${c.pending} pending)`);
      break;
    }
    case 'review build': {
      if (!values.out) usage('review build needs --out <review.html>');
      const problems = checkCases(doc);
      if (problems.length) { process.stderr.write(`fix the cases first:\n${problems.join('\n')}\n`); process.exit(1); }
      mkdirSync(dirname(resolve(values.out)), { recursive: true });
      writeFileSync(resolve(values.out), renderReviewHtml(doc));
      const opened = values.open ? openInBrowser(resolve(values.out)) : false;
      print({ ok: true, out: values.out, opened, ...counts(doc) }, `wrote ${values.out}${opened ? ' and opened it' : ''}: download "review-decisions.json" from the page when the review is done`);
      break;
    }
    case 'review apply': {
      if (!values.decisions) usage('review apply needs --decisions <review-decisions.json>');
      if (!existsSync(resolve(values.decisions))) { process.stderr.write(`no file at ${values.decisions}: the reviewer downloads it from the review page\n`); process.exit(1); }
      const result = applyDecisions(doc, readJson(resolve(values.decisions)));
      save();
      const c = counts(doc);
      const lines = [`applied ${result.applied} decisions by ${result.reviewer}: ${c.approved} approved, ${c.changes} changes requested, ${c.rejected} rejected, ${c.pending} pending`];
      if (result.stale.length) lines.push(`stale (changed since the page was built, still pending): ${result.stale.join(', ')}`);
      if (result.unknown.length) lines.push(`unknown ids in the decisions: ${result.unknown.join(', ')}`);
      if (result.coverage) lines.push(`coverage feedback: ${result.coverage}`);
      print({ ok: true, ...result, counts: c }, lines.join('\n'));
      break;
    }
    case 'automation': {
      if (!values.run) usage('automation needs --run <run.json>');
      const result = recordAutomation(doc, readJson(resolve(values.run)));
      save();
      print({ ok: true, ...result }, `saved ${result.saved}, authored ${result.authored}, parked ${result.parked}${result.missing.length ? `, not in the run: ${result.missing.join(', ')}` : ''}`);
      break;
    }
    default:
      usage('usage: cases.mjs check|import|render|review build|review apply|automation --cases <cases.json> …');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) main();
