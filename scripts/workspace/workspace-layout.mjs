/** Flat workspace ownership and safe migration/override rules. */
import fs from 'node:fs';
import path from 'node:path';
import { UaError, normalizeTenant } from '../lib/contracts.mjs';
import {
  approveWorkspace, assertLocalPath, readJsonFile, removeFolderSafe, removeSafe, validatedSessionId,
} from '../lib/session-paths.mjs';
import { featureSlugs, isRenderedFor, prdFileNames } from './render.mjs';
import { LOCAL_STORE_FILE } from '../platform/entity-store.mjs';

const recordIdPattern = /^[A-Za-z0-9_-]{1,200}$/u;
const entityDirectoryPattern = /^[a-f0-9]{64}$/u;

/** The solution map every render writes, relative to the working folder. */
export const SOLUTION_MAP_FOLDER = '.nebula';
export const WIRING_FILE = path.join(SOLUTION_MAP_FOLDER, 'wiring.json');
export const SOLUTION_MAP_FILE = path.join(SOLUTION_MAP_FOLDER, 'solution-map.md');
export const SOLUTION_CHART_FILE = path.join(SOLUTION_MAP_FOLDER, 'solution-chart.md');
/** The last solution refresh and the last automatic update check, written by `solution-sync.mjs` and `session-sync.mjs`. */
export const SYNC_FILE = path.join(SOLUTION_MAP_FOLDER, 'sync.json');

export function sessionStates(home) {
  const directory = assertLocalPath(path.join(home, '.sessions'), home);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(item => {
    if (!item.isDirectory()) return [];
    try { validatedSessionId(item.name); } catch { return []; }
    let state;
    try { state = readJsonFile(path.join(directory, item.name, 'state.json'), null); }
    catch { return []; }
    return state && state.claudeSessionId === item.name ? [state] : [];
  });
}

export function associationAt(home, scope = 'root') {
  const solution = readJsonFile(path.join(home, 'records', 'solution.json'), null);
  if (solution && (!recordIdPattern.test(String(solution.id ?? '')) || solution.entityType && solution.entityType !== 'e_solution')) {
    throw new UaError('WORKSPACE_CONTENT_CONFLICT', undefined, { paths: ['records/solution.json'] });
  }
  const states = sessionStates(home);
  const stateIds = [...new Set(states.map(state => state.solutionId).filter(Boolean))];
  const solutionId = String(solution?.id ?? (stateIds.length === 1 ? stateIds[0] : ''));
  if (!solutionId) return null;
  const matchingStates = states.filter(state => state.solutionId === solutionId);
  const tenants = [...new Set(matchingStates.map(state => normalizeTenant(state.tenant)).filter(Boolean))];
  return {
    scope,
    home,
    tenant: tenants.length === 1 ? tenants[0] : null,
    solutionId,
    solutionName: String(solution?.properties?.name ?? matchingStates[0]?.solutionName ?? solutionId),
  };
}

export function workspaceAssociations(cwd) {
  const workspace = approveWorkspace(cwd);
  const root = associationAt(workspace);
  return root ? [root] : [];
}

/** Files a folder with no solution already holds at a path UnifyApps Headless writes to by a fixed
 * name, so opening a solution here would replace them. Other files in specs/, plans/
 * and docs/ are not listed: UnifyApps Headless never removes a file it did not render. */
function unassociatedConflicts(workspace) {
  const conflicts = [];
  const addFile = relative => { if (fs.existsSync(path.join(workspace, relative))) conflicts.push(relative); };
  const addMatches = (relative, predicate) => {
    const directory = path.join(workspace, relative);
    if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory()) return;
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (predicate(item)) conflicts.push(path.join(relative, item.name));
    }
  };
  addFile('memory.md');
  addFile(path.join('records', 'solution.json'));
  addFile(path.join('docs', 'README.md'));
  addFile('state.json');
  for (const relative of [path.join('records', 'specs'), path.join('records', 'plans'), path.join('records', 'docs'), path.join('records', 'assets')]) {
    addMatches(relative, item => item.isFile() && item.name.endsWith('.json') && recordIdPattern.test(item.name.slice(0, -5)));
  }
  addMatches('entities', item => item.isDirectory() && entityDirectoryPattern.test(item.name));
  return conflicts;
}

/** What a folder with no solution holds where UnifyApps Headless would add its own folders:
 * a code repository (`.git`), or a records/, specs/, plans/, docs/, entities/ or
 * entity-manifests/ folder that already has something in it. UnifyApps Headless overwrites
 * none of it, but its files would land among the person's own: a repository's
 * docs/ once got UnifyApps Headless's README.md, and git saw 11 new paths. */
function occupiedFolders(workspace) {
  const found = fs.existsSync(path.join(workspace, '.git')) ? ['.git'] : [];
  // `solution create` writes the local store (and its lock and temp files)
  // before the solution record lands, so that one is UnifyApps Headless's own.
  const uaOwn = name => name === '.DS_Store' || name.startsWith(path.basename(LOCAL_STORE_FILE));
  for (const name of ['records', 'specs', 'plans', 'docs', 'entities', 'entity-manifests']) {
    const folder = path.join(workspace, name);
    if (!fs.existsSync(folder)) continue;
    if (!fs.lstatSync(folder).isDirectory() || fs.readdirSync(folder).some(item => !uaOwn(item))) found.push(`${name}/`);
  }
  return found;
}

function sameSolution(association, tenant, solutionId) {
  return !!solutionId && association.solutionId === solutionId && (!association.tenant || association.tenant === tenant);
}

function removeMatching(directory, predicate) {
  if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory()) return;
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (item.isFile() && predicate(item.name)) removeSafe(path.join(directory, item.name));
  }
}

function removeIfEmpty(directory) {
  try { fs.rmdirSync(directory); }
  catch (error) { if (!['ENOENT', 'ENOTEMPTY'].includes(error?.code)) throw error; }
}

const recordIdsIn = directory => {
  if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory()) return [];
  return fs.readdirSync(directory).filter(name => name.endsWith('.json') && recordIdPattern.test(name.slice(0, -5))).map(name => name.slice(0, -5));
};

/** Remove the previous solution's UnifyApps Headless files from one solution home, and nothing else:
 * its records, the files rendered from them (named by record id or doc slug), its entity
 * cache folders, and the state files that bind a session to it. Questionnaires, drafts,
 * reports and every file UnifyApps Headless did not write stay where they are. */
function clearRootAssociation(workspace, association) {
  const solutionFile = path.join(workspace, 'records', 'solution.json');
  const hasSolutionRecord = fs.existsSync(solutionFile);
  const specIds = recordIdsIn(path.join(workspace, 'records', 'specs'));
  const planIds = recordIdsIn(path.join(workspace, 'records', 'plans'));
  const docRecords = recordIdsIn(path.join(workspace, 'records', 'docs'))
    .map(id => { try { return readJsonFile(path.join(workspace, 'records', 'docs', `${id}.json`), null); } catch { return null; } });
  const docSlugs = new Set(featureSlugs(docRecords));
  const prdFiles = new Set(prdFileNames(docRecords));

  for (const folder of ['specs', 'plans', 'docs', 'assets']) {
    removeMatching(path.join(workspace, 'records', folder), name => name.endsWith('.json') && recordIdPattern.test(name.slice(0, -5)));
  }
  if (hasSolutionRecord) removeSafe(solutionFile);

  removeMatching(path.join(workspace, 'specs'), name => isRenderedFor(name, specIds));
  removeMatching(path.join(workspace, 'plans'), name => isRenderedFor(name, planIds));
  for (const folder of ['applications', 'automations', 'features']) {
    removeMatching(path.join(workspace, 'docs', folder), name => name.endsWith('.md') && docSlugs.has(name.slice(0, -3)));
  }
  removeMatching(path.join(workspace, 'docs', 'prd'), name => prdFiles.has(name));
  if (hasSolutionRecord) {
    removeSafe(path.join(workspace, 'docs', 'README.md'));
    removeSafe(path.join(workspace, 'memory.md'));
    removeSafe(path.join(workspace, WIRING_FILE));
    removeSafe(path.join(workspace, SOLUTION_MAP_FILE));
    removeSafe(path.join(workspace, SOLUTION_CHART_FILE));
  }

  const entities = path.join(workspace, 'entities');
  if (fs.existsSync(entities) && fs.lstatSync(entities).isDirectory()) {
    for (const item of fs.readdirSync(entities, { withFileTypes: true })) {
      if (item.isDirectory() && entityDirectoryPattern.test(item.name)) removeFolderSafe(path.join(entities, item.name));
    }
  }
  clearEntityCache(workspace);

  const sessions = path.join(workspace, '.sessions');
  if (fs.existsSync(sessions) && fs.lstatSync(sessions).isDirectory()) {
    for (const item of fs.readdirSync(sessions, { withFileTypes: true })) {
      if (!item.isDirectory()) continue;
      let state;
      try { state = readJsonFile(path.join(sessions, item.name, 'state.json'), null); } catch { continue; }
      if (state?.solutionId !== association.solutionId) continue;
      removeSafe(path.join(sessions, item.name, 'state.json'));
      removeSafe(path.join(sessions, item.name, 'checkpoint.json'));
      removeFolderSafe(path.join(sessions, item.name, 'acceptance'));
      removeIfEmpty(path.join(sessions, item.name));
    }
  }

  for (const directory of [
    path.join(workspace, 'records', 'specs'), path.join(workspace, 'records', 'plans'), path.join(workspace, 'records', 'docs'), path.join(workspace, 'records', 'assets'), path.join(workspace, 'records'),
    path.join(workspace, 'specs'), path.join(workspace, 'plans'),
    path.join(workspace, 'docs', 'applications'), path.join(workspace, 'docs', 'automations'), path.join(workspace, 'docs', 'features'), path.join(workspace, 'docs', 'prd'),
    path.join(workspace, 'docs'), path.join(workspace, SOLUTION_MAP_FOLDER), entities, sessions,
  ]) removeIfEmpty(directory);
}

// The entity cache belongs to the solution that filled it, and to its tenant:
// after a switch to another tenant, a page id both tenants share (an app's
// global page, `e_global_<app id>`) answered a hit from the old tenant's copy.
// Only UnifyApps Headless's own names go: a snapshot `<id>_<version>.json` in a type folder,
// an app manifest, and a stale marker `<id>.<uuid>.json`.
const SAFE_PART = /^[A-Za-z0-9_-]+$/u;
const SNAPSHOT_FILE = /^[A-Za-z0-9_-]+_\d+\.json$/u;
const MANIFEST_FILE = /^[A-Za-z0-9_-]+\.json$/u;
const MARKER_FILE = /^[A-Za-z0-9_-]+\.[0-9a-f-]{36}\.json$/u;
function foldersIn(directory) {
  if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory()) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).filter(item => item.isDirectory() && SAFE_PART.test(item.name)).map(item => path.join(directory, item.name));
}
function clearEntityCache(workspace) {
  for (const folder of foldersIn(path.join(workspace, 'entities'))) {
    removeMatching(folder, name => SNAPSHOT_FILE.test(name));
    removeIfEmpty(folder);
  }
  const manifests = path.join(workspace, 'entity-manifests');
  removeMatching(path.join(manifests, 'interfaces'), name => MANIFEST_FILE.test(name));
  for (const markers of ['interface-dirty', 'entity-dirty']) {
    for (const folder of foldersIn(path.join(manifests, markers))) {
      removeMatching(folder, name => MARKER_FILE.test(name));
      removeIfEmpty(folder);
    }
  }
  for (const folder of ['interfaces', 'interface-dirty', 'entity-dirty']) removeIfEmpty(path.join(manifests, folder));
  removeIfEmpty(manifests);
}

export function ensureWorkspaceSelection(cwd, { tenant, solutionId = null, override = false } = {}) {
  const workspace = approveWorkspace(cwd);
  const host = normalizeTenant(tenant);
  const associations = workspaceAssociations(workspace);
  if (!associations.length) {
    const paths = unassociatedConflicts(workspace);
    if (paths.length) throw new UaError('WORKSPACE_CONTENT_CONFLICT', undefined, { paths });
    // After an override the person chose this folder knowing what is in it.
    const occupied = override ? [] : occupiedFolders(workspace);
    if (occupied.length) {
      const folders = occupied.filter(name => name.endsWith('/'));
      const what = [folders.length < occupied.length ? 'is a code repository' : null,
        folders.length ? `already has files in ${folders.join(', ')}` : null].filter(Boolean).join(', and it ');
      throw new UaError('WORKSPACE_CONTENT_CONFLICT',
        `This folder ${what}. UnifyApps Headless would add its own files there. Please use a new, empty folder for this solution.`,
        { paths: occupied });
    }
  }
  const conflicts = associations.filter(association => !sameSolution(association, host, solutionId));
  if (!conflicts.length) return { workspace, association: associations[0] ?? null, overridden: false };
  if (!override) {
    const current = conflicts[0];
    throw new UaError('WORKSPACE_SOLUTION_MISMATCH', undefined, {
      currentTenant: current.tenant,
      currentSolutionId: current.solutionId,
      currentSolutionName: current.solutionName,
    });
  }
  for (const association of conflicts) clearRootAssociation(workspace, association);
  if (!associationAt(workspace)) {
    const paths = unassociatedConflicts(workspace);
    if (paths.length) throw new UaError('WORKSPACE_CONTENT_CONFLICT', undefined, { paths });
  }
  return { workspace, association: null, overridden: true };
}
