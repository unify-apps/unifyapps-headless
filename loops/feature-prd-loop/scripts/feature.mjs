#!/usr/bin/env node
// feature.mjs — the mechanical half of the PRD loop.
// usage: node feature.mjs firing-id
//        node feature.mjs ledger upsert --file <ledger.json> --row <json | @file>
//        node feature.mjs ledger list --file <ledger.json> [--firing <id>]
//        node feature.mjs ripple --targets <targets.json> [--home <solution folder>] [--out <file>] [--max-rows 200]
//        node feature.mjs impact-table --blast <blast-radius.json> [--out <file>]
//        node feature.mjs prd-check --prd <prd.md> --blast <blast-radius.json> --decisions <decisions.json>
// Touches only the files named and the solution folder's own entity cache. Reads
// no network, no tenant, no cookie.
// It will NOT write the PRD, rank a ripple row, or decide anything: `ripple`
// leaves `risk` and `mustNotBreak` null on purpose, and `prd-check` refuses a
// document that still holds them.
import fs from 'node:fs';
import path from 'node:path';
import { appNavigation, formView, objectView, workflowContract } from '../../../scripts/lib/cache-views.mjs';
import { approveFolder } from '../../../scripts/lib/session-paths.mjs';
import { EDGE_VIA, ENTITY_KINDS } from '../../../scripts/lib/wiring.mjs';
import { readCachedAppContext, readCachedEntityContext } from '../../../scripts/folder/entity-cache.mjs';
import { readWiring } from '../../../scripts/folder/solution-map.mjs';

// ---- layers -------------------------------------------------------------------------

/** Severity order. A row found twice keeps the more severe layer, so the list does not
 * depend on the order the queue happened to reach it in. `direct` is never overwritten:
 * a target is the change, not a consequence of it. */
const SEVERITY = {
  direct: 7, 'write-conflict': 6, contract: 5, schema: 4, 'shared-data': 3, 'nav-roles': 2, deploy: 1, semantic: 0,
};
const LAYERS = Object.keys(SEVERITY);

// A blast radius longer than this is not a list anyone reads to the end, so the walk
// stops and says how many rows it dropped. Never a silent truncation.
const DEFAULT_MAX_ROWS = 200;

// A change whose words name the trigger's shape is a contract change, which reaches
// every caller rather than only the pages that read it.
const CONTRACT_WORDS = /\b(input|inputs|output|outputs|trigger|parameter|parameters|contract|signature|payload)\b/i;

const keyOf = (kind, id) => `${kind}:${id}`;

// ---- what the cache holds beyond the wiring -------------------------------------------

/** The wiring has no form, menu, object-to-object or deploy edge. Each comes from the
 * cache view that owns it, read once per solution. */
function readExtras(home, wiring) {
  const appIds = wiring.entities.filter((entity) => entity.kind === ENTITY_KINDS.APP).map((entity) => entity.id);
  const forms = new Map();            // pageId -> [{ displayName, fields: [{ name, required }] }]
  const navByPage = new Map();        // pageId -> [{ id, label }]
  const notes = [];

  const flatten = (items, out = []) => {
    for (const item of items ?? []) {
      out.push(item);
      flatten(item.items, out);
    }
    return out;
  };

  for (const appId of appIds) {
    const context = readCachedAppContext(home, appId);
    if (context.status !== 'hit') { notes.push({ key: keyOf('app', appId), why: `the app is ${context.status} in the cache (${context.reason ?? context.status}), so its menu and forms were not read` }); continue; }
    for (const entry of context.pages ?? []) {
      if (entry.status !== 'hit' || !entry.page) continue;
      const view = formView({ page: entry.page, dataSources: entry.dataSources ?? [], appDataSources: [] }, { pageId: entry.pageId });
      if (view.forms.length) forms.set(entry.pageId, view.forms);
    }
    for (const item of flatten(appNavigation(context, { interfaceId: appId }).primary).concat(flatten(appNavigation(context, { interfaceId: appId }).secondary))) {
      const opens = item.pageId ?? item.page ?? item.opens;
      if (!opens) continue;
      if (!navByPage.has(opens)) navByPage.set(opens, []);
      navByPage.get(opens).push({ id: item.id ?? `${appId}:${item.label ?? 'item'}`, label: item.label ?? item.name ?? item.id });
    }
  }

  // Object to object: a lookup field is an edge the wiring never builds.
  const lookupsTo = new Map();        // objectId -> [{ id, name, field }]
  for (const entity of wiring.entities) {
    if (entity.kind !== ENTITY_KINDS.OBJECT) continue;
    const cache = readCachedEntityContext(home, 'ENTITY_TYPE', entity.id);
    if (cache.status !== 'hit') continue;
    for (const field of objectView({ entity: cache.entity, version: cache.version, cachedAt: cache.cachedAt }).fields) {
      if (!field.lookup) continue;
      if (!lookupsTo.has(field.lookup)) lookupsTo.set(field.lookup, []);
      lookupsTo.get(field.lookup).push({ id: entity.id, name: entity.name, field: field.name });
    }
  }

  // Indexes, so a changed field that is filtered or sorted on says so.
  const indexesOf = new Map();        // objectId -> [[field, …]]
  for (const entity of wiring.entities) {
    if (entity.kind !== ENTITY_KINDS.OBJECT) continue;
    const cache = readCachedEntityContext(home, 'ENTITY_TYPE', entity.id);
    if (cache.status !== 'hit') continue;
    indexesOf.set(entity.id, objectView({ entity: cache.entity, version: cache.version, cachedAt: cache.cachedAt }).indexes.map((index) => index.fields ?? []));
  }

  // Draft against deployed: a draft is not what anybody has.
  const draft = new Set();
  for (const entity of wiring.entities) {
    if (entity.kind !== ENTITY_KINDS.AUTOMATION) continue;
    const cache = readCachedEntityContext(home, 'WORKFLOW_DEFINITION', entity.id);
    if (cache.status !== 'hit') continue;
    if (workflowContract({ entity: cache.entity, version: cache.version, cachedAt: cache.cachedAt }).automation.aheadOfDeploy) draft.add(keyOf(ENTITY_KINDS.AUTOMATION, entity.id));
  }

  // An app-level data source that calls an automation builds no edge, so a page reached
  // only that way is invisible to the walk. Say it rather than let it read as complete.
  notes.push({ key: 'app data sources', why: 'the wiring builds no edge from an app-level data source, so a page that reaches a target only through one is not in this list' });

  return { forms, navByPage, lookupsTo, indexesOf, draft, notes };
}

// ---- the walk -----------------------------------------------------------------------

/** Edges point from the consumer to what it depends on, so the blast radius is the
 * reverse walk: everything that would have to change because the target did. */
function reverseIndex(edges) {
  const map = new Map();
  for (const edge of edges) {
    const key = keyOf(edge.to.kind, edge.to.id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(edge);
  }
  return map;
}

function forwardIndex(edges) {
  const map = new Map();
  for (const edge of edges) {
    const key = keyOf(edge.from.kind, edge.from.id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(edge);
  }
  return map;
}

/** The layer the first edge into a target earns. Later hops of the same chain inherit it:
 * a page two steps from a contract change is still a contract risk. */
function seedLayer(target, edge) {
  if (target.kind === ENTITY_KINDS.OBJECT) {
    if (edge.via === EDGE_VIA.STORAGE_WRITE) return 'write-conflict';
    return 'schema';
  }
  if (target.kind === ENTITY_KINDS.AUTOMATION) {
    return target.contractChange === true || CONTRACT_WORDS.test(String(target.change ?? '')) ? 'contract' : 'shared-data';
  }
  return 'shared-data';
}

/** One row's `reason`, in the words a reader of the PRD needs: whose part, what it does
 * to the entity upstream, and the output keys it binds when the edge names any. */
function reasonFor(edge, name) {
  const part = edge.from.part ? `its ${edge.from.part} ` : '';
  const keys = (edge.fields ?? []).length ? ` (${edge.fields.join(', ')})` : '';
  if (edge.via === EDGE_VIA.DATA_SOURCE) return `${part}reads ${name} through a data source${keys}`;
  if (edge.via === EDGE_VIA.EVENT) return `${part}runs ${name} from an event`;
  if (edge.via === EDGE_VIA.CALL_NODE) return `${part}calls ${name}${keys}`;
  if (edge.via === EDGE_VIA.STORAGE_READ) return `${part}reads ${name}`;
  if (edge.via === EDGE_VIA.STORAGE_WRITE) return `${part}writes ${name}`;
  return `${part}depends on ${name} (${edge.via})`;
}

export function ripple(wiring, targetFile, extras, { maxRows = DEFAULT_MAX_ROWS } = {}) {
  const targets = targetFile.targets ?? [];
  const byKey = new Map(wiring.entities.map((entity) => [keyOf(entity.kind, entity.id), entity]));
  const backward = reverseIndex(wiring.edges);
  const forward = forwardIndex(wiring.edges);
  const rows = new Map();
  const unknown = [];
  let dropped = 0;

  const nameOf = (kind, id) => byKey.get(keyOf(kind, id))?.name ?? id;
  const targetKeys = new Set(targets.filter((target) => target.id).map((target) => keyOf(target.kind, target.id)));

  const add = ({ kind, id, layer, reason, trail }) => {
    if (id === undefined || id === null) return false;
    const key = keyOf(kind, id);
    const existing = rows.get(key);
    if (existing) {
      if (existing.layer !== 'direct' && SEVERITY[layer] > SEVERITY[existing.layer]) {
        Object.assign(existing, { layer, reason, path: trail });
      }
      return false;
    }
    if (rows.size >= maxRows) { dropped += 1; return false; }
    const entity = byKey.get(key);
    rows.set(key, {
      key, kind, id, name: nameOf(kind, id), layer, reason, path: trail,
      draft: extras.draft.has(key), stale: entity?.stale === true,
      risk: null, mustNotBreak: null,
    });
    return true;
  };

  // 1. Direct — every target is the change itself.
  for (const target of targets) {
    if (!target.id) continue;
    add({ kind: target.kind, id: target.id, layer: 'direct', reason: target.why ?? 'named by the ask', trail: [`target:${keyOf(target.kind, target.id)}`] });
    if (!byKey.has(keyOf(target.kind, target.id))) {
      unknown.push({ key: keyOf(target.kind, target.id), why: 'the cache does not hold this target, so nothing downstream of it was walked; refresh it and run the ripple again' });
    }
  }

  /** One chain outward from a node, carrying the layer the first edge earned. */
  const walkBack = (start, layer, trail) => {
    const seen = new Set([keyOf(start.kind, start.id)]);
    const queue = [{ kind: start.kind, id: start.id, trail }];
    while (queue.length) {
      const node = queue.shift();
      for (const edge of backward.get(keyOf(node.kind, node.id)) ?? []) {
        const consumer = edge.from;
        const consumerKey = keyOf(consumer.kind, consumer.id);
        const nextTrail = [...node.trail, `${consumer.kind}:${consumer.id}`];
        add({
          kind: consumer.kind, id: consumer.id, layer,
          reason: reasonFor(edge, nameOf(node.kind, node.id)),
          trail: nextTrail,
        });
        if (seen.has(consumerKey)) continue;
        seen.add(consumerKey);
        queue.push({ kind: consumer.kind, id: consumer.id, trail: nextTrail });
      }
    }
  };

  for (const target of targets) {
    if (!target.id) continue;
    const origin = `target:${keyOf(target.kind, target.id)}`;

    // 2, 3, 4, 5 — everything that depends on the target, by the layer its first edge earns.
    for (const edge of backward.get(keyOf(target.kind, target.id)) ?? []) {
      const layer = seedLayer(target, edge);
      const consumer = edge.from;
      add({
        kind: consumer.kind, id: consumer.id, layer,
        reason: reasonFor(edge, nameOf(target.kind, target.id)),
        trail: [origin, `${consumer.kind}:${consumer.id}`],
      });
      walkBack(consumer, layer, [origin, `${consumer.kind}:${consumer.id}`]);
    }

    // 3. Write conflict — a new required field has no place in a form that already creates the object.
    if (target.kind === ENTITY_KINDS.OBJECT) {
      const added = (target.fields ?? []).filter((field) => field.required === true && (field.change === 'add' || field.change === 'alter'));
      for (const [pageId, forms] of extras.forms) {
        if (!rows.has(keyOf(ENTITY_KINDS.PAGE, pageId))) continue;
        for (const form of forms) {
          const names = new Set((form.fields ?? []).map((field) => field.name));
          // Only a form that submits can fail validation. A filter form reads the object
          // and writes nothing, so a field it lacks is not breakage.
          const missing = form.submitEvents > 0 ? added.filter((field) => !names.has(field.name)) : [];
          if (missing.length) {
            const row = rows.get(keyOf(ENTITY_KINDS.PAGE, pageId));
            if (row.layer !== 'direct' && SEVERITY['write-conflict'] > SEVERITY[row.layer]) row.layer = 'write-conflict';
            row.reason = `${row.reason}; its form ${form.displayName ?? form.id} has no field for the new required ${missing.map((field) => field.name).join(', ')}`;
          }
          const changed = (target.fields ?? []).filter((field) => names.has(field.name));
          if (changed.length) {
            const row = rows.get(keyOf(ENTITY_KINDS.PAGE, pageId));
            row.reason = `${row.reason}; its form ${form.displayName ?? form.id} lists ${changed.map((field) => field.name).join(', ')}`;
          }
        }
      }

      // 4. Schema — a lookup into the target, and a changed field that is indexed.
      for (const entry of extras.lookupsTo.get(target.id) ?? []) {
        add({ kind: ENTITY_KINDS.OBJECT, id: entry.id, layer: 'schema', reason: `looks ${nameOf(target.kind, target.id)} up through ${entry.field}`, trail: [origin, `object:${entry.id}`] });
        walkBack({ kind: ENTITY_KINDS.OBJECT, id: entry.id }, 'schema', [origin, `object:${entry.id}`]);
      }
      for (const columns of extras.indexesOf.get(target.id) ?? []) {
        const indexed = (target.fields ?? []).filter((field) => columns.includes(field.name));
        if (!indexed.length) continue;
        const row = rows.get(keyOf(ENTITY_KINDS.OBJECT, target.id));
        if (row) row.reason = `${row.reason}; ${indexed.map((field) => field.name).join(', ')} sits in an index (${columns.join(', ')}), so it is filtered or sorted on`;
      }
    }

    // 2. Shared data — the other pages on the same automations and objects as this page.
    if (target.kind === ENTITY_KINDS.PAGE) {
      for (const edge of forward.get(keyOf(ENTITY_KINDS.PAGE, target.id)) ?? []) {
        walkBack(edge.to, 'shared-data', [origin, `${edge.to.kind}:${edge.to.id}`]);
      }
      // 6. Navigation — whatever opens this page.
      for (const item of extras.navByPage.get(target.id) ?? []) {
        add({ kind: 'nav', id: item.id, layer: 'nav-roles', reason: `the menu item ${item.label} opens ${nameOf(target.kind, target.id)}`, trail: [origin, `nav:${item.id}`] });
      }
    }

    // An app target is its pages.
    if (target.kind === ENTITY_KINDS.APP) {
      for (const entity of wiring.entities) {
        if (entity.kind !== ENTITY_KINDS.PAGE || entity.appId !== target.id) continue;
        add({ kind: ENTITY_KINDS.PAGE, id: entity.id, layer: 'direct', reason: `a page of ${nameOf(target.kind, target.id)}, which the ask names whole`, trail: [origin, `page:${entity.id}`] });
      }
    }
  }

  // 6. Roles — the cache holds none, so the targets file carries what the live read found.
  const newPage = targets.some((target) => target.kind === ENTITY_KINDS.PAGE && (!target.id || target.change === 'add'));
  const roleTarget = targets.some((target) => target.kind === 'role');
  if (newPage || roleTarget) {
    const roles = targetFile.roles ?? [];
    for (const role of roles) {
      add({
        kind: 'role', id: role.id, layer: 'nav-roles',
        reason: newPage ? 'a new page is seen only by the roles it is granted to' : "the ask puts the feature behind a role, so every role's view of it is decided",
        trail: [`role:${role.id}`],
      });
    }
    if (!roles.length) unknown.push({ key: 'role:*', why: 'the feature turns on a role and `roles` in the targets file is empty; read the roles live and fill it, or carry who sees the feature as unverified' });
  }

  // Everything the wiring itself could not see.
  for (const entry of wiring.unknown ?? []) unknown.push({ key: keyOf(entry.kind, entry.id), why: entry.reason ?? 'not cached' });
  for (const entry of extras.notes) unknown.push(entry);
  for (const row of rows.values()) {
    if (row.stale) unknown.push({ key: row.key, why: 'the cache copy is stale, so what it depends on may be out of date' });
  }

  const counts = Object.fromEntries(LAYERS.map((layer) => [layer, 0]));
  for (const row of rows.values()) counts[row.layer] += 1;
  counts.deploy = [...rows.values()].filter((row) => row.draft).length;

  return {
    solution: wiring.entities.length ? { entities: wiring.entities.length, edges: wiring.edges.length } : { entities: 0, edges: 0 },
    targets: targets.length,
    rows: [...rows.values()],
    counts,
    truncated: { rows: dropped, reason: dropped ? `the walk stopped at --max-rows ${maxRows}; ${dropped} further rows were not written` : null },
    unknown,
  };
}

// ---- the impact table ----------------------------------------------------------------

const RISK_ORDER = { high: 0, medium: 1, low: 2 };
const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();

export function impactTable(blast) {
  const rows = [...(blast.rows ?? [])].sort((left, right) => {
    const byRisk = (RISK_ORDER[left.risk] ?? 3) - (RISK_ORDER[right.risk] ?? 3);
    if (byRisk !== 0) return byRisk;
    const bySeverity = (SEVERITY[right.layer] ?? 0) - (SEVERITY[left.layer] ?? 0);
    if (bySeverity !== 0) return bySeverity;
    return String(left.name).localeCompare(String(right.name));
  });
  const lines = [
    '| Entity | Kind | Layer | Risk | Why it is here | Must not break | Proof |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((row) => `| ${cell(row.name)}${row.draft ? ' (draft)' : ''} | ${cell(row.kind)} | ${cell(row.layer)} | ${cell(row.risk ?? '—')} | ${cell(row.reason)} | ${cell(row.mustNotBreak ?? '—')} | ${cell((row.path ?? []).join(' · '))} |`),
  ];
  if (blast.truncated?.rows) lines.push('', `**${blast.truncated.reason}.**`);
  if (blast.unknown?.length) {
    lines.push('', 'Unknown, and carried into the document unverified:');
    for (const entry of blast.unknown) lines.push(`- ${cell(entry.key)} — ${cell(entry.why)}`);
  }
  return `${lines.join('\n')}\n`;
}

// ---- the document check --------------------------------------------------------------

const HEADINGS = ['Summary', 'The ask', 'How the app works today', 'Requirements', 'Out of scope',
  'Decisions', 'Edge cases', 'Impact on the existing app', 'Open questions', 'Provenance', 'Review'];
const REQUIREMENT_LINES = ['What', 'Why', 'Decided by', 'Proof', 'Acceptance'];
const PLACEHOLDERS = /\b(TBD|TODO|FIXME|XXX)\b|\?\?\?/;

/** The document without its fenced code, so an example inside a fence is not read as text. */
const stripFences = (markdown) => markdown.replace(/```[\s\S]*?```/g, '');

function sectionsOf(markdown) {
  const sections = new Map();
  let current = null;
  for (const line of markdown.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading && !line.startsWith('###')) {
      current = heading[1];
      sections.set(current, []);
      continue;
    }
    if (current) sections.get(current).push(line);
  }
  return new Map([...sections].map(([name, lines]) => [name, lines.join('\n')]));
}

const tableRows = (body) => body.split('\n')
  .filter((line) => line.trim().startsWith('|') && !/^\s*\|[\s|:-]+\|\s*$/.test(line))
  .map((line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((part) => part.trim()))
  .filter((cells, position) => !(position === 0 && /^(Requirement|Entity|#|Source)$/i.test(cells[0] ?? '')));

export function prdCheck({ markdown, blast, decisions }) {
  const failures = [];
  const fail = (check, detail) => failures.push({ check, detail });
  const text = stripFences(markdown);
  const sections = sectionsOf(text);

  for (const heading of HEADINGS) {
    if (!sections.has(heading)) fail('headings', `the section \`## ${heading}\` is missing`);
  }
  for (const [name, body] of sections) {
    if (!HEADINGS.includes(name) || name === 'Requirements') continue;
    if (body.replace(/\s/g, '') === '') fail('empty section', `\`## ${name}\` is empty; write \`None.\` when there is nothing to say`);
  }

  // Requirements.
  const requirements = [...text.matchAll(/^###\s+(R(\d+))\s*[—–-]\s*(.+?)\s*$/gm)]
    .map((match, position, all) => {
      const next = all[position + 1];
      return { id: match[1], number: Number(match[2]), title: match[3], body: text.slice(match.index + match[0].length, next ? next.index : undefined) };
    });
  if (requirements.length === 0) fail('requirements', 'no requirement block was found; each is `### R<n> — <one line>`');
  requirements.forEach((requirement, position) => {
    if (requirement.number !== position + 1) fail('requirement numbering', `${requirement.id} is in position ${position + 1}; requirements run contiguously from R1 in reading order`);
    for (const label of REQUIREMENT_LINES) {
      if (!new RegExp(`\\*\\*${label}:\\*\\*`).test(requirement.body)) fail('requirement block', `${requirement.id} has no **${label}:** line`);
    }
  });

  // Edge cases, one requirement per row.
  const covered = new Set();
  for (const cells of tableRows(sections.get('Edge cases') ?? '')) {
    for (const found of (cells[0] ?? '').matchAll(/R\d+/g)) covered.add(found[0]);
  }
  for (const requirement of requirements) {
    if (!covered.has(requirement.id)) fail('edge cases', `${requirement.id} has no row in \`## Edge cases\`; every requirement carries at least one`);
  }

  // The impact table against the blast radius.
  const impactNames = new Set(tableRows(sections.get('Impact on the existing app') ?? '')
    .map((cells) => (cells[0] ?? '').replace(/\s*\(draft\)\s*$/, '').replace(/\\\|/g, '|').trim().toLowerCase())
    .filter(Boolean));
  for (const row of blast.rows ?? []) {
    const name = String(row.name ?? '').trim().toLowerCase();
    if (!impactNames.has(name)) fail('impact table', `${row.key} (${row.name}) is in the blast radius and not in the impact table; paste what \`impact-table\` prints, whole`);
    if (row.risk === null || row.risk === undefined) fail('ripple ranking', `${row.key} still holds \`risk: null\`; rank every row high, medium or low`);
    if (!row.mustNotBreak) fail('ripple ranking', `${row.key} has no \`mustNotBreak\` sentence naming the behaviour that has to keep working`);
  }
  const blastNames = new Set((blast.rows ?? []).map((row) => String(row.name ?? '').trim().toLowerCase()));
  for (const name of impactNames) {
    if (!blastNames.has(name)) fail('impact table', `the impact table holds a row the blast radius does not: \`${name}\``);
  }

  // Decisions.
  const decisionRows = new Map(tableRows(sections.get('Decisions') ?? '').map((cells) => [cells[0], cells]));
  for (const decision of decisions.decisions ?? []) {
    const row = decisionRows.get(decision.id);
    if (!row) { fail('decisions', `${decision.id} is in the ledger and not in the \`## Decisions\` table`); continue; }
    if ((row[3] ?? '').toLowerCase().includes('loop') && (row[4] ?? '').replace(/[—–\-\s]/g, '') === '') {
      fail('decisions', `${decision.id} is marked \`loop\` with no proof; a decision the loop made names the read that proves it, or it belongs to the person`);
    }
  }

  // Honesty.
  const provenance = sections.get('Provenance') ?? '';
  const saysUnverified = /unverified/i.test(text.replace(provenance, ''));
  if (saysUnverified && !tableRows(provenance).some((cells) => /unverified/i.test(cells[0] ?? ''))) {
    fail('provenance', 'the document says `unverified` and `## Provenance` has no `unverified` row naming what and why');
  }

  const placeholder = PLACEHOLDERS.exec(text);
  if (placeholder) fail('placeholder', `the document still holds \`${placeholder[0]}\``);
  const angle = /<[a-z][a-z0-9 ·\-]{2,38}>/.exec(text);
  if (angle) fail('placeholder', `the document still holds the unfilled \`${angle[0]}\``);

  return { ok: failures.length === 0, failures, requirements: requirements.length, edgeCaseRequirements: covered.size, blastRows: (blast.rows ?? []).length };
}

// ---- ledger -------------------------------------------------------------------------

export function readLedger(file) {
  if (!fs.existsSync(file)) return { rows: [] };
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(parsed?.rows) ? parsed : { rows: [] };
}

function writeLedger(file, ledger) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

/** One row per (loop, firingId, executionId); a later upsert replaces the earlier row's fields. */
export function upsertRow(ledger, row) {
  if (!row || typeof row !== 'object') throw new Error('a ledger row must be an object');
  if (!row.loop || !row.executionId) throw new Error('a ledger row needs `loop` and `executionId`');
  const stamped = { ...row, updatedAt: new Date().toISOString() };
  const index = ledger.rows.findIndex((existing) => existing.loop === row.loop && existing.executionId === row.executionId
    && (existing.firingId ?? null) === (row.firingId ?? null));
  if (index === -1) ledger.rows.push(stamped);
  else ledger.rows[index] = { ...ledger.rows[index], ...stamped };
  return stamped;
}

export function listRows(ledger, { firing } = {}) {
  if (!firing) return ledger.rows;
  return ledger.rows.filter((row) => row.firingId === firing || row.executionId === `firing:${firing}` || row.executionId === `review:${firing}`);
}

export function firingId(date = new Date(), random = Math.random) {
  const two = (value) => String(value).padStart(2, '0');
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const tail = Array.from({ length: 4 }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}-${tail}`;
}

// ---- the CLI ------------------------------------------------------------------------

function argsOf(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) flags[name] = true;
      else { flags[name] = next; index += 1; }
    } else positional.push(arg);
  }
  return { positional, flags };
}

function readJson(value, flag) {
  if (typeof value !== 'string') throw new Error(`${flag} <file> is required`);
  const file = value.startsWith('@') ? value.slice(1) : value;
  if (!fs.existsSync(file)) throw new Error(`${flag}: no file at ${file}`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${flag}: ${file} is not valid JSON — ${error.message}`);
  }
}

function readRow(value) {
  if (typeof value !== 'string') throw new Error('--row <json | @file> is required');
  return JSON.parse(value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf8') : value);
}

function emit(value, out) {
  const text = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  if (out && typeof out === 'string') {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
    process.stdout.write(`${JSON.stringify({ wrote: out })}\n`);
  } else process.stdout.write(text);
}

const USAGE = 'usage: feature.mjs firing-id | ledger upsert|list | ripple | impact-table | prd-check';

export function main(argv) {
  const { positional, flags } = argsOf(argv);
  const [command, sub] = positional;

  if (command === 'firing-id') {
    emit(`${firingId()}\n`);
  } else if (command === 'ledger') {
    if (typeof flags.file !== 'string') throw new Error('--file <ledger.json> is required');
    const ledger = readLedger(flags.file);
    if (sub === 'upsert') {
      const row = upsertRow(ledger, readRow(flags.row));
      writeLedger(flags.file, ledger);
      emit(row);
    } else if (sub === 'list') {
      emit(listRows(ledger, { firing: typeof flags.firing === 'string' ? flags.firing : undefined }));
    } else throw new Error('usage: feature.mjs ledger upsert|list --file <ledger.json>');
  } else if (command === 'ripple') {
    // The cache reader only trusts the folder the process started in, so a --home
    // elsewhere is approved once, by name, before anything is read.
    const home = typeof flags.home === 'string' ? approveFolder(flags.home) : process.cwd();
    const wiring = readWiring(home);
    if (!wiring.entities.length) throw new Error(`no cached entity was found under ${home}; run \`ua entity read\` on the app first, or pass --home <solution folder>`);
    const result = ripple(wiring, readJson(flags.targets, '--targets'), readExtras(home, wiring), {
      maxRows: flags['max-rows'] ? Number(flags['max-rows']) : undefined,
    });
    emit(result, flags.out);
    if (result.truncated.rows) process.stderr.write(`${result.truncated.reason}\n`);
  } else if (command === 'impact-table') {
    emit(impactTable(readJson(flags.blast, '--blast')), flags.out);
  } else if (command === 'prd-check') {
    if (typeof flags.prd !== 'string') throw new Error('--prd <prd.md> is required');
    if (!fs.existsSync(flags.prd)) throw new Error(`--prd: no file at ${flags.prd}`);
    const result = prdCheck({
      markdown: fs.readFileSync(flags.prd, 'utf8'),
      blast: readJson(flags.blast, '--blast'),
      decisions: readJson(flags.decisions, '--decisions'),
    });
    emit(result, flags.out);
    if (!result.ok) process.exitCode = 1;
  } else {
    throw new Error(USAGE);
  }
}

const invokedDirectly = (() => {
  try { return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname); }
  catch { return false; }
})();

if (invokedDirectly) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
