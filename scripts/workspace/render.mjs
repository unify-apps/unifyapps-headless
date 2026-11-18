/** Render readable files in the current Claude session's workspace cache. */
import fs from 'node:fs';
import path from 'node:path';
import { slug, validateSpecHtml } from '../lib/contracts.mjs';
import { loadSpecHtmlAssets } from '../lib/spec-html.mjs';
import { parseFrontmatter, parsePlan, renderPlan as formatPlan, parseFeature, renderMemory as formatMemory } from '../lib/formats.mjs';
import { readPlanStatus, withPlanStatus } from '../lib/plan-status.mjs';
import { chainStatus, prdApps, renderPrdBody } from '../lib/prd.mjs';
import { assertHome, assertLocalPath as assertSafePath, atomicFile, readJsonFile, removeSafe } from '../lib/session-paths.mjs';
export { assertHome, assertLocalPath, atomicFile, readJsonFile, removeSafe } from '../lib/session-paths.mjs';
import { writeSolutionMap } from './solution-map.mjs';
import { GUIDE_NAME, writeSolutionGuide } from './solution-guide.mjs';
import { writeAgentTargets } from './agent-targets.mjs';

const idPattern = /^[A-Za-z0-9_-]+$/u;

function recordId(record) {
  const id = String(record?.id ?? '');
  if (!idPattern.test(id)) throw new Error('A safe tenant record id is required.');
  return id;
}

function fileStem(id, title) { return `${slug(title || id)}-${id}`; }

/** Whether a file in specs/ or plans/ is one UnifyApps Headless rendered for one of these record ids.
 * Every rendered name is `<title>-<id>.md` or `.html` (fileStem), so a file whose name
 * does not end in a known id was written by someone else and is never removed. */
export function isRenderedFor(name, ids) {
  const match = /^(.+)\.(?:md|html)$/u.exec(name);
  if (!match) return false;
  for (const id of ids) if (match[1].endsWith(`-${id}`)) return true;
  return false;
}

export function renderSpec(home, record) {
  const target = assertHome(home);
  const id = recordId(record);
  const props = record?.properties ?? {};
  const md = String(props.spec_md ?? '');
  let meta;
  try { meta = parseFrontmatter(md).meta; }
  catch { return null; }
  const stem = fileStem(id, meta.title);
  atomicFile(path.join(target, 'specs', `${stem}.md`), md);
  const htmlFile = path.join(target, 'specs', `${stem}.html`);
  let html = null, htmlSkipped = null;
  if (props.spec_html !== undefined && props.spec_html !== null) {
    const page = String(props.spec_html);
    // A record's page is written to disk only when it passes the check a draft passes: no script
    // but the plugin's own, nothing external. A record edited elsewhere cannot smuggle a page past it.
    const problem = page.trim() ? validateSpecHtml(page, { allowedScripts: [specAssets().js] }) : null;
    if (problem) { htmlSkipped = problem; try { removeSafe(htmlFile); } catch { /* nothing to remove */ } }
    else { atomicFile(htmlFile, page); html = htmlFile; }
  }
  return { id, md: path.join(target, 'specs', `${stem}.md`), html, ...(htmlSkipped ? { htmlSkipped } : {}) };
}

let specAssetsCache = null;
const specAssets = () => (specAssetsCache ??= loadSpecHtmlAssets());

export function renderPlan(home, record) {
  const target = assertHome(home);
  const id = recordId(record);
  let parsed;
  try { parsed = parsePlan(record?.properties?.plan ?? ''); }
  catch { return null; }
  const { meta, tasks } = parsed;
  if (meta.nebula !== 3) return null;
  // The platform's embedded JSON remains authoritative; regenerate a
  // readable trail from it and leave that JSON out of the local file.
  const statusText = readPlanStatus(record.properties.plan);
  const formatted = formatPlan(meta, tasks);
  const canonical = statusText ? withPlanStatus(formatted, statusText) : formatted;
  const readable = canonical.replace(/\n```json nebula-tasks\n[\s\S]*?\n```(?=\n|$)/u, '');
  const stem = fileStem(id, meta.title);
  const file = path.join(target, 'plans', `${stem}.md`);
  // Plans are Markdown-only. Remove any legacy or agent-created companion HTML
  // whenever this plan is rendered so it cannot survive as a plan artifact.
  removeSafe(path.join(target, 'plans', `${stem}.html`));
  atomicFile(file, readable);
  return file;
}

export function renderMemory(home, solutionRecord) {
  const target = assertHome(home);
  const file = path.join(target, 'memory.md');
  const memory = solutionRecord?.properties?.memory;
  atomicFile(file, memory ? String(memory) : formatMemory());
  return file;
}

const escapeCell = value => String(value ?? '').replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ');

function uaFeatures(docRecords) {
  if (!Array.isArray(docRecords)) return [];
  const bySlug = new Map();
  for (const record of docRecords) {
    const text = record?.properties?.document;
    if (typeof text !== 'string') continue;
    try {
      const meta = parseFeature(text)?.meta ?? {};
      if (meta.nebula !== 3 || typeof meta.slug !== 'string' || !meta.slug.trim() || typeof meta.name !== 'string' || !meta.name.trim()) continue;
      bySlug.set(slug(meta.slug), { meta, text });
    } catch { /* Malformed and foreign docs stay untouched in the record. */ }
  }
  return [...bySlug.entries()].map(([fileSlug, feature]) => ({ ...feature, fileSlug }))
    .sort((a, b) => a.meta.name.localeCompare(b.meta.name) || a.fileSlug.localeCompare(b.fileSlug));
}

function docFolders(feature) {
  const kinds = new Set((Array.isArray(feature.meta.entities) ? feature.meta.entities : [])
    .map(ref => String(ref?.kind ?? '').toLowerCase()));
  const folders = [];
  if (kinds.has('automation')) folders.push('automations');
  if (kinds.has('app') || kinds.has('application') || kinds.has('page')) folders.push('applications');
  return folders.length ? folders : ['features'];
}

/** The file names (without .md) UnifyApps Headless renders for these solution_document records. */
export function featureSlugs(docRecords) {
  return uaFeatures(docRecords).map(feature => feature.fileSlug);
}

/** Render feature docs. A doc page is removed only when its name is the slug of a
 * document UnifyApps Headless holds or a refresh just removed (removedSlugs); any other file stays. */
export function renderDocs(home, docRecords, { removedSlugs = [] } = {}) {
  const target = assertHome(home);
  const features = uaFeatures(docRecords);
  const known = new Set([...features.map(feature => feature.fileSlug), ...removedSlugs]);
  const folders = ['applications', 'automations', 'features'];
  const wanted = new Map(folders.map(folder => [folder, new Set()]));
  for (const feature of features) {
    feature.folders = docFolders(feature);
    for (const folder of feature.folders) wanted.get(folder).add(`${feature.fileSlug}.md`);
  }
  for (const folder of folders) {
    const directory = path.join(target, 'docs', folder);
    assertSafePath(directory);
    fs.mkdirSync(directory, { recursive: true });
    for (const name of fs.readdirSync(directory)) {
      if (name.endsWith('.md') && known.has(name.slice(0, -3)) && !wanted.get(folder).has(name)) removeSafe(path.join(directory, name));
    }
  }
  const lines = ['# Documentation', '', '| Document | Area | Summary | Entities | Plans |', '|---|---|---|---|---|'];
  for (const feature of features) {
    const entities = Array.isArray(feature.meta.entities) ? feature.meta.entities.map(ref => ref?.name).filter(Boolean).join(', ') : '';
    const plans = Array.isArray(feature.meta.planIds) ? feature.meta.planIds.join(', ') : '';
    const links = feature.folders.map(folder => `[${escapeCell(feature.meta.name)}](${folder}/${feature.fileSlug}.md)`).join(', ');
    lines.push(`| ${links} | ${feature.folders.join(', ')} | ${escapeCell(feature.meta.summary)} | ${escapeCell(entities)} | ${escapeCell(plans)} |`);
    for (const folder of feature.folders) atomicFile(path.join(target, 'docs', folder, `${feature.fileSlug}.md`), feature.text);
  }
  if (!features.length) lines.push('| _No documentation yet_ | | | | |');
  atomicFile(path.join(target, 'docs', 'README.md'), lines.join('\n') + '\n');
  return features.length;
}

const day = value => (typeof value === 'string' && value ? value.slice(0, 10) : 'an unknown date');

/** The file name an app's PRD renders to, or null when the app name gives none. */
export function prdFileName(app) {
  const stem = slug(app);
  return stem ? `${stem}.md` : null;
}

/** The PRD file names UnifyApps Headless renders for these solution_document records. */
export function prdFileNames(docRecords) {
  return prdApps(docRecords).map(prdFileName).filter(Boolean);
}

function prdPage(app) {
  const shown = app.current ?? app.drafts.at(-1) ?? null;
  const lines = ['<!-- UnifyApps Headless writes this file from the solution\'s PRD records on every refresh. Change the PRD through UnifyApps Headless, never here. -->', ''];
  if (!shown) {
    lines.push(`# ${app.title}: PRD`, '', `No version of this PRD passes its check. Run \`prd verify ${app.app}\`.`);
    return `${lines.join('\n')}\n`;
  }
  const meta = shown.meta;
  lines.push(`# ${app.title}: PRD v${shown.version}`, '');
  if (shown.status === 'approved') {
    const origin = [meta.basedOn ? `based on v${meta.basedOn}` : null, meta.restoredFrom ? `restored from v${meta.restoredFrom}` : null].filter(Boolean);
    lines.push(`Approved ${day(meta.approvedAt)} by ${meta.approvedBy ?? 'an unknown person'}${origin.length ? ` · ${origin.join(' · ')}` : ''}.`);
  } else lines.push(`Draft, not approved yet. Saved ${day(meta.savedAt ?? meta.createdAt)} by ${meta.savedBy ?? meta.author ?? 'an unknown person'}.`);
  const draft = app.drafts.at(-1);
  if (draft && draft !== shown) lines.push('', `> Draft v${draft.version} is open, saved ${day(draft.meta.savedAt ?? draft.meta.createdAt)} by ${draft.meta.savedBy ?? draft.meta.author ?? 'an unknown person'}.`);
  if (app.tampered.length) lines.push('', `> v${app.tampered.join(', v')} failed its check. Run \`prd verify ${app.app}\`.`);
  return `${lines.join('\n')}\n\n${renderPrdBody(shown.parts)}`;
}

/** Render each app's PRD into docs/prd/<app>.md: its newest approved version
 * that passes its check, else its open draft. A file is removed only when its
 * name is an app UnifyApps Headless holds a PRD for, or one a refresh just removed. */
export function renderPrds(home, docRecords, { removedApps = [] } = {}) {
  const target = assertHome(home);
  const apps = chainStatus(docRecords).filter(app => prdFileName(app.app));
  const directory = path.join(target, 'docs', 'prd');
  assertSafePath(directory);
  if (!apps.length && !fs.existsSync(directory)) return 0;
  fs.mkdirSync(directory, { recursive: true });
  const wanted = new Set(apps.map(app => prdFileName(app.app)));
  for (const app of apps) atomicFile(path.join(directory, prdFileName(app.app)), prdPage(app));
  const known = new Set([...wanted, ...removedApps.map(prdFileName).filter(Boolean)]);
  for (const name of fs.readdirSync(directory)) {
    if (known.has(name) && !wanted.has(name)) removeSafe(path.join(directory, name));
  }
  return apps.length;
}

function recordsIn(home, kind) {
  const target = assertHome(home);
  const folder = path.join(target, 'records', kind);
  assertSafePath(folder);
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter(name => name.endsWith('.json') && idPattern.test(name.slice(0, -5)))
    .sort().map(name => readJsonFile(path.join(folder, name), null)).filter(Boolean);
}

/** Rebuild the readable files from the cached records. It removes only files it
 * rendered itself: a name ending in the id of a record it holds, or of one a refresh
 * just removed (`removed`). Anything else in specs/, plans/ or docs/ is left alone. */
export function renderAll(home, { removed = {} } = {}) {
  const target = assertHome(home);
  const solution = readJsonFile(path.join(target, 'records', 'solution.json'), null);
  const specs = recordsIn(target, 'specs');
  const plans = recordsIn(target, 'plans');
  const docs = recordsIn(target, 'docs');
  for (const folder of ['specs', 'plans']) {
    const directory = path.join(target, folder);
    assertSafePath(directory); fs.mkdirSync(directory, { recursive: true });
  }
  const wantedSpecs = new Set(), wantedPlans = new Set();
  for (const spec of specs) if (!solution || spec.properties?.solutionId === solution.id) {
    const files = renderSpec(target, spec);
    if (files) { wantedSpecs.add(path.basename(files.md)); if (files.html) wantedSpecs.add(path.basename(files.html)); }
  }
  for (const plan of plans) if (!solution || plan.properties?.solutionId === solution.id) {
    const file = renderPlan(target, plan);
    if (file) wantedPlans.add(path.basename(file));
  }
  const known = {
    specs: [...specs.map(record => String(record.id)), ...(removed.specs ?? [])],
    plans: [...plans.map(record => String(record.id)), ...(removed.plans ?? [])],
  };
  for (const [folder, wanted] of [['specs', wantedSpecs], ['plans', wantedPlans]]) {
    const directory = path.join(target, folder);
    for (const name of fs.readdirSync(directory)) {
      if (!wanted.has(name) && isRenderedFor(name, known[folder])) removeSafe(path.join(directory, name));
    }
  }
  renderMemory(target, solution);
  const features = renderDocs(target, docs, { removedSlugs: removed.docSlugs ?? [] });
  const prds = renderPrds(target, docs, { removedApps: removed.prdApps ?? [] });
  // The map and chart are a convenience too: a failed write must not fail the command.
  try { writeSolutionMap(target); }
  catch (error) { process.stderr.write(`UnifyApps Headless could not update the solution map: ${error?.message ?? error}\n`); }
  if (solution) {
    // The guide is a convenience; a failed write must not fail the command that rendered.
    try { writeSolutionGuide(target); }
    catch (error) { process.stderr.write(`UnifyApps Headless could not update ${GUIDE_NAME}: ${error?.message ?? error}\n`); }
    // The skills and MCP pointers the other agents read. Also a convenience: a
    // folder short of them still works in Claude Code, which reads the plugin
    // itself rather than these copies.
    try { writeAgentTargets(target); }
    catch (error) { process.stderr.write(`UnifyApps Headless could not write the files for Codex, OpenCode and Copilot: ${error?.message ?? error}\n`); }
  }
  return { specs: specs.length, plans: plans.length, features, prds };
}
