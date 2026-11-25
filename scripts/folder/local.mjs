/** Shared flat workspace cache plus per-Claude-session transient state. No tenant calls live here. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeTenant, UaError } from '../lib/contracts.mjs';
import { defaultTenantMcpUrl } from '../lib/mcp-url.mjs';
import { assertHome, assertLocalPath, atomicFile, featureSlugs, readJsonFile, removeSafe, renderAll, renderSpec, renderPlan, renderMemory, renderDocs, renderPrds } from './render.mjs';
import { prdApps } from '../lib/prd.mjs';
import { UA_HOME, removeFolderSafe, validatedSessionId } from '../lib/session-paths.mjs';
import { readConfig, readRegistry, solutionKey } from './session-registry.mjs';

export { normalizeTenant, renderAll, renderSpec, renderPlan, renderMemory, renderDocs, renderPrds };
export { UA_HOME, canonicalCwd, validatedSessionId } from '../lib/session-paths.mjs';
export { paths, solutionKey, readConfig, writeConfig, readRegistry, registerSession, registerSignIn, signInForFolder, homeForCwd, tenantForFolder, sessionForFolder, solutionsForTenant, sessionsForSolution } from './session-registry.mjs';
export { ensureFolderSelection, folderAssociations } from './folder-layout.mjs';
const clientFile = path.join(UA_HOME, 'session', 'client.json');
const idPattern = /^[A-Za-z0-9_-]+$/u;

export function executionActor() {
  const directory = assertLocalPath(path.dirname(clientFile));
  const saved = readJsonFile(clientFile, null);
  if (saved && typeof saved.clientId === 'string' && saved.clientId.trim()) {
    fs.chmodSync(directory, 0o700);
    fs.chmodSync(clientFile, 0o600);
    return { clientId: saved.clientId };
  }
  const actor = { clientId: randomUUID() };
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertLocalPath(directory);
  fs.chmodSync(directory, 0o700);
  // Publish a complete file exclusively. A racing first command reads the
  // winner instead of replacing the token used by its new plan's owner.
  const candidate = assertLocalPath(path.join(directory, `.client.${randomUUID()}.tmp`));
  try {
    fs.writeFileSync(candidate, JSON.stringify(actor, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    try { fs.linkSync(candidate, assertLocalPath(clientFile)); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  } finally { fs.rmSync(candidate, { force: true }); }
  const winner = readJsonFile(clientFile, null);
  if (!winner || typeof winner.clientId !== 'string' || !winner.clientId.trim()) throw new Error('The local execution actor file is invalid.');
  fs.chmodSync(clientFile, 0o600);
  return { clientId: winner.clientId };
}

export function tenantMcp(host) {
  const tenant = normalizeTenant(host);
  const saved = readConfig().tenantMcpUrls[tenant];
  return saved ? { mode: 'saved', url: saved } : { mode: 'default', url: defaultTenantMcpUrl(tenant) };
}

function checkedHome(home) { return assertHome(home); }

function resolvedSessionId(home, sessionId, fallback) {
  const candidate = sessionId ?? fallback ?? process.env.CLAUDE_CODE_SESSION_ID;
  if (candidate) return validatedSessionId(candidate);
  const folder = path.join(checkedHome(home), '.sessions');
  if (fs.existsSync(folder)) {
    const ids = fs.readdirSync(folder, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name);
    if (ids.length === 1) return validatedSessionId(ids[0]);
  }
  throw new UaError('NOT_STARTED');
}

export function sessionHome(home, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  const id = resolvedSessionId(home, sessionId);
  return assertLocalPath(path.join(checkedHome(home), '.sessions', id), checkedHome(home));
}

// The message files of one builder agent under .sessions/: the number its next
// message takes, the number of its last message in this session, and the files
// for a number. The next number goes past every message of that agent in any
// session of this workspace, so `<agentName>-<k>.md` is the only file of that name
// under .sessions/: a builder whose prompt path was mistyped can still find it.
// workFolder, .sessions/<sessionId>/work/<agentName>/, is the one place for the
// builder's own files: builders side by side share Claude's scratchpad and /tmp.
function agentBatches(home, agentName, sessionId) {
  if (!/^[A-Za-z0-9-]+$/u.test(String(agentName ?? ''))) throw new Error('Invalid agent name.');
  const folder = assertLocalPath(path.join(sessionHome(home, sessionId), 'batches'));
  const pattern = new RegExp(`^${agentName}-(\\d+)\\.md$`, 'u');
  const numbersIn = (batches) => (fs.existsSync(batches) ? fs.readdirSync(batches) : []).map(name => Number(pattern.exec(name)?.[1] ?? 0));
  const sessions = path.dirname(path.dirname(folder));
  const everywhere = (fs.existsSync(sessions) ? fs.readdirSync(sessions) : []).flatMap(session => numbersIn(path.join(sessions, session, 'batches')));
  const files = (number) => {
    const stem = path.join(folder, `${agentName}-${number}`);
    const workFolder = assertLocalPath(path.join(sessionHome(home, sessionId), 'work', agentName));
    return { messageFile: `${stem}.md`, reportFile: `${stem}.report.json`, workFolder };
  };
  return { next: Math.max(0, ...everywhere) + 1, last: Math.max(0, ...numbersIn(folder)), files };
}

/** The next message file for one builder agent under .sessions/<sessionId>/batches/, the report file beside it, and its work folder. */
export function batchFiles(home, agentName, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  const { next, files } = agentBatches(home, agentName, sessionId);
  return files(next);
}

/** The message and report file of the last batch written for one builder agent in this session, or null when it has none.
 * An agent holds one batch at a time, so while it has running tasks these are that batch's files. */
export function lastBatchFiles(home, agentName, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  const { last, files } = agentBatches(home, agentName, sessionId);
  return last ? files(last) : null;
}

/** Makes and returns one builder's own work folder, .sessions/<sessionId>/work/<agentName>/, for a piece sent from chat. */
export function makeWorkFolder(home, agentName, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  if (!/^[A-Za-z0-9-]+$/u.test(String(agentName ?? ''))) throw new UaError('USAGE', 'An agent name holds only letters, digits and hyphens.');
  const folder = assertLocalPath(path.join(sessionHome(home, sessionId), 'work', agentName), path.join(sessionHome(home, sessionId), 'work'));
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  return folder;
}

export function writeBatchMessage(home, messageFile, text, sessionId = process.env.CLAUDE_CODE_SESSION_ID, workFolder = null) {
  const folder = path.join(sessionHome(home, sessionId), 'batches');
  atomicFile(assertLocalPath(messageFile, folder), String(text));
  // The builder's own work folder exists before it is sent, so its first write lands.
  if (workFolder) fs.mkdirSync(assertLocalPath(workFolder, path.join(sessionHome(home, sessionId), 'work')), { recursive: true, mode: 0o700 });
  return messageFile;
}

export function readState(home, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  let id;
  try { id = resolvedSessionId(home, sessionId); }
  catch {
    const legacy = path.join(checkedHome(home), 'state.json');
    return readJsonFile(legacy, null);
  }
  const file = path.join(sessionHome(home, id), 'state.json');
  return readJsonFile(file, null);
}

export function writeState(home, patch = {}, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  const id = resolvedSessionId(home, sessionId, patch.claudeSessionId);
  const file = path.join(sessionHome(home, id), 'state.json');
  const next = { ...(readState(home, id) ?? {}), ...patch };
  atomicFile(file, JSON.stringify(next, null, 2) + '\n');
  return next;
}

export function assertStarted(home, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  if (!home) throw new UaError('NOT_STARTED');
  const state = readState(home, sessionId);
  if (!state?.tenant || !state?.solutionId || !state?.key) throw new UaError('NOT_STARTED');
  if (!sessionId || state.claudeSessionId !== sessionId ||
    state.key !== solutionKey(state.solutionName, state.tenant, state.solutionId)) throw new UaError('NOT_STARTED');
  return state;
}

/** Clear this session's own state files before a different solution is opened in it, so
 * the new state starts clean. Only files UnifyApps Headless writes for itself go: state.json,
 * checkpoint.json and the acceptance receipts. Questionnaires, drafts, batch messages,
 * reports and any other working file stay. */
export function resetSessionState(home, { sessionId = process.env.CLAUDE_CODE_SESSION_ID } = {}) {
  const target = sessionHome(home, sessionId);
  if (!fs.existsSync(target)) return;
  removeSafe(path.join(target, 'state.json'));
  removeSafe(path.join(target, 'checkpoint.json'));
  removeFolderSafe(path.join(target, 'acceptance'));
}

function recordFile(home, kind, id) {
  const target = checkedHome(home);
  if (kind === 'solution') return path.join(target, 'records', 'solution.json');
  if (!['spec', 'plan', 'doc', 'asset'].includes(kind) || !idPattern.test(String(id ?? ''))) throw new Error('Invalid record kind or id.');
  const folder = { spec: 'specs', plan: 'plans', doc: 'docs', asset: 'assets' }[kind];
  return path.join(target, 'records', folder, `${id}.json`);
}

function cacheOne(home, kind, record) {
  if (!record || !idPattern.test(String(record.id ?? ''))) throw new Error('A record id is required.');
  const expected = { solution: 'e_solution', spec: 'solution_spec', plan: 'solution_builder_plan', doc: 'solution_document', asset: 'solution_linked_assets' }[kind];
  if (record.entityType && record.entityType !== expected) throw new Error(`Expected a ${expected} record.`);
  const file = recordFile(home, kind, record.id);
  const current = readJsonFile(file, null);
  // Responses from concurrent sessions can finish out of order. Never let an
  // older platform version replace a newer shared solution/plan/spec cache.
  if (Number.isFinite(current?.version) && Number.isFinite(record.version) && current.version > record.version) return;
  atomicFile(file, JSON.stringify(record, null, 2) + '\n');
}

export function cacheRecords(home, { solution, specs, plans, docs, assets } = {}) {
  checkedHome(home);
  if (solution) cacheOne(home, 'solution', solution);
  for (const record of specs ?? []) cacheOne(home, 'spec', record);
  for (const record of plans ?? []) cacheOne(home, 'plan', record);
  for (const record of docs ?? []) cacheOne(home, 'doc', record);
  for (const record of assets ?? []) cacheOne(home, 'asset', record);
}

/** Replace the fetched child-record sets during a full refresh. Local drafts
 * are kept. The ids (and doc slugs) of the records it removes go to renderAll, so it
 * can remove the readable files it rendered for them and nothing else. */
export function reconcileRecords(home, { solution, specs, plans, docs, assets = [] } = {}) {
  const target = checkedHome(home);
  validateSnapshot({ solution, specs, plans, docs, assets }, readRecord(home, 'solution')?.id);
  cacheRecords(target, { solution, specs, plans, docs, assets });
  const removed = { specs: [], plans: [], docSlugs: [], prdApps: [] };
  for (const [kind, records] of [['spec', specs], ['plan', plans], ['doc', docs], ['asset', assets]]) {
    const folder = path.join(target, 'records', { spec: 'specs', plan: 'plans', doc: 'docs', asset: 'assets' }[kind]);
    assertLocalPath(folder);
    if (!fs.existsSync(folder)) continue;
    const wanted = new Set(records.map(record => String(record.id)));
    for (const name of fs.readdirSync(folder)) {
      const id = name.slice(0, -5);
      if (!name.endsWith('.json') || !idPattern.test(id) || wanted.has(id)) continue;
      if (kind === 'doc') {
        const record = readJsonFile(path.join(folder, name), null);
        removed.docSlugs.push(...featureSlugs([record]));
        removed.prdApps.push(...prdApps([record]));
      }
      else if (kind !== 'asset') removed[`${kind}s`].push(id);
      removeSafe(path.join(folder, name));
    }
  }
  return renderAll(target, { removed });
}

export function readRecord(home, kind, id) {
  if (kind === 'solution') return readJsonFile(recordFile(home, kind), null);
  if (!id) return null;
  return readJsonFile(recordFile(home, kind, id), null);
}

export function readRecords(home, kind) {
  const target = checkedHome(home);
  if (kind === 'solution') { const one = readRecord(home, 'solution'); return one ? [one] : []; }
  const folder = path.join(target, 'records', { spec: 'specs', plan: 'plans', doc: 'docs', asset: 'assets' }[kind] ?? '');
  if (!['spec', 'plan', 'doc', 'asset'].includes(kind)) throw new Error('Invalid record kind.');
  assertLocalPath(folder);
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter(name => idPattern.test(name.slice(0, -5)) && name.endsWith('.json'))
    .sort().map(name => readJsonFile(path.join(folder, name), null)).filter(Boolean);
}

export function writeDraft(home, draftSlug, { md, html } = {}, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  const target = sessionHome(home, sessionId);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(String(draftSlug ?? ''))) throw new Error('Invalid draft slug.');
  if (md !== undefined) atomicFile(path.join(target, 'drafts', `_draft-${draftSlug}.md`), String(md));
  if (html !== undefined) atomicFile(path.join(target, 'drafts', `_draft-${draftSlug}.html`), String(html));
}

export function readDraft(home, draftSlug, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  acceptanceFile(home, draftSlug, sessionId);
  const folder = path.join(sessionHome(home, sessionId), 'drafts');
  const readOne = extension => {
    const file = assertLocalPath(path.join(folder, `_draft-${draftSlug}.${extension}`));
    try { return fs.readFileSync(file, 'utf8'); }
    catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  };
  return { md: readOne('md'), html: readOne('html') };
}

/** The slugs of the drafts this session holds, for an error that names them. */
export function draftSlugs(home, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  const folder = path.join(sessionHome(home, sessionId), 'drafts');
  try {
    return [...new Set(fs.readdirSync(folder).map((name) => /^_draft-(.+)\.md$/u.exec(name)?.[1]).filter(Boolean))].sort();
  } catch { return []; }
}

export function removeDrafts(home, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  const folder = path.join(sessionHome(home, sessionId), 'drafts');
  assertLocalPath(folder);
  if (!fs.existsSync(folder)) return;
  for (const name of fs.readdirSync(folder)) {
    if (/^_draft-[a-z0-9-]+\.(?:md|html)$/u.test(name)) removeSafe(path.join(folder, name));
  }
}

export function removeDraft(home, draftSlug, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  acceptanceFile(home, draftSlug, sessionId);
  const folder = path.join(sessionHome(home, sessionId), 'drafts');
  const files = ['md', 'html'].map(extension => path.join(folder, `_draft-${draftSlug}.${extension}`));
  for (const file of files) assertLocalPath(file);
  for (const file of files) removeSafe(file);
}

/** Acceptance receipts survive a disposable home rebuild in session storage.
 * They make interrupted creates discoverable without platform schema fields. */
function acceptanceFile(home, draftSlug, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(String(draftSlug ?? ''))) throw new Error('Invalid draft slug.');
  return path.join(sessionHome(home, sessionId), 'acceptance', `${draftSlug}.json`);
}

export function readAcceptanceReceipt(home, draftSlug, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  return readJsonFile(acceptanceFile(home, draftSlug, sessionId), null);
}

export function writeAcceptanceReceipt(home, draftSlug, receipt, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  atomicFile(acceptanceFile(home, draftSlug, sessionId), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

export function clearAcceptanceReceipt(home, draftSlug, sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  removeSafe(acceptanceFile(home, draftSlug, sessionId));
}

/** Validate all records before replacing any part of the current cache. */
export function validateSnapshot({ solution, specs, plans, docs, assets = [] } = {}, expectedId) {
  if (!solution || solution.entityType !== 'e_solution' || !idPattern.test(String(solution.id ?? '')) ||
      (expectedId && solution.id !== expectedId) || !Array.isArray(specs) || !Array.isArray(plans) || !Array.isArray(docs) || !Array.isArray(assets)) {
    throw new Error('A full solution snapshot is required to reconcile records.');
  }
  for (const [kind, records] of [['spec', specs], ['plan', plans], ['doc', docs]]) {
    const expected = { spec: 'solution_spec', plan: 'solution_builder_plan', doc: 'solution_document' }[kind];
    const seen = new Set();
    for (const record of records) {
      const id = String(record?.id ?? '');
      if (!idPattern.test(id) || seen.has(id) || record.entityType !== expected || record.properties?.solutionId !== solution.id ||
          (kind === 'doc' && typeof record.properties?.document !== 'string')) {
        throw new Error(`Invalid ${kind} record in full snapshot.`);
      }
      seen.add(id);
    }
  }
  const assetIds = new Set();
  for (const record of assets) {
    const properties = record?.properties;
    if (!idPattern.test(String(record?.id ?? '')) || assetIds.has(record.id) || record.entityType !== 'solution_linked_assets' ||
        properties?.solution_id !== solution.id ||
        (properties.asset_id !== undefined && typeof properties.asset_id !== 'string') ||
        (properties.asset_class !== undefined && typeof properties.asset_class !== 'string') ||
        (properties.state !== undefined && typeof properties.state !== 'string')) {
      throw new Error('Invalid linked asset record in full snapshot.');
    }
    assetIds.add(record.id);
  }
}
