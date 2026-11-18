// An app's PRD, kept as one solution_document per version on top of the
// feature-document format: frontmatter `nebula: 3, kind: prd, app: <slug>` and
// no `slug` key, so the feature commands never list it as a feature. The body
// holds three parts, versioned together: `# PRD`, `# App plan` and `# Tickets`.
// An approved version carries the sha of what it agreed to and the sha of the
// version before it, so an edit made after approval, outside UnifyApps Headless, shows.
// Pure code: no files, no network.
import crypto from 'node:crypto';
import { parseFrontmatter, renderFrontmatter } from './formats.mjs';
import { markdownLines, specSections } from './spec-markdown.mjs';
import { assessRequirements, placeholderIn } from './spec-requirements.mjs';

export const PRD_STATUSES = Object.freeze(['draft', 'approved', 'discarded']);
export const PRD_PARTS = Object.freeze([['prd', 'PRD'], ['plan', 'App plan'], ['tickets', 'Tickets']]);

/** The PRD's sections and the spec checklist row each one answers, so a PRD
 * and a later spec meet one readiness standard. `Current state` and `Open
 * questions` answer no row. */
export const PRD_SECTIONS = Object.freeze([
  ['Outcome', 'outcome'], ['Users and roles', 'users_access'], ['Scope', 'scope'], ['Journeys', 'workflow'],
  ['Requirements', 'acceptance'], ['Screens', 'ui_states'], ['Data', 'data'], ['Rules', 'rules'],
  ['Integrations', 'integrations'], ['Failures', 'failures'], ['Quality', 'constraints'], ['Rollout', 'rollout'],
]);
export const PRIORITIES = Object.freeze(['must', 'should', 'could']);

// What the sha covers besides the PRD and App plan parts. `appId`, `tracker` and
// the tickets part are filled once after approval, so they stay outside it;
// the tickets part has its own `ticketsSha`.
const SHA_FIELDS = ['app', 'title', 'version', 'status', 'basedOn', 'restoredFrom', 'approvedBy', 'approvedAt', 'prevSha'];
// A PRD is the scope a whole app is built against; both drafts reviewed side by
// side stay far below this many line pairs.
const MAX_DIFF_CELLS = 4_000_000;

const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

/** Line endings, trailing spaces and blank lines at either end never change a sha. */
export function canon(text) {
  return String(text ?? '').replace(/\r\n?/gu, '\n').split('\n').map(line => line.replace(/[ \t]+$/u, '')).join('\n')
    .replace(/^\n+|\n+$/gu, '');
}

export const isPrd = meta => meta?.nebula === 3 && meta.kind === 'prd' && typeof meta.app === 'string' && meta.app.trim() !== '';

/** `{ meta, parts: { prd, plan, tickets } }`. A body with no part heading is
 * read as the PRD part, so a bare PRD file can be checked and saved. */
export function parsePrd(text) {
  const { meta, body } = parseFrontmatter(text);
  const lines = body.split('\n'), marked = markdownLines(body);
  const parts = { prd: [], plan: [], tickets: [] };
  let current = null, found = false;
  lines.forEach((line, index) => {
    const heading = !marked[index]?.code && /^ {0,3}#\s+(.+?)\s*$/u.exec(line);
    const part = heading && PRD_PARTS.find(([, title]) => title.toLowerCase() === heading[1].toLowerCase());
    if (part) { current = part[0]; found = true; return; }
    if (current) parts[current].push(line);
  });
  if (!found) parts.prd = lines;
  return { meta, parts: Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, canon(value.join('\n'))])) };
}

/** The three parts under their `#` headings, with no frontmatter. */
export const renderPrdBody = (parts = {}) => `${PRD_PARTS.map(([key, title]) => `# ${title}\n\n${canon(parts[key])}`).join('\n\n')}\n`;

export const renderPrd = (meta, parts = {}) => renderFrontmatter(meta, renderPrdBody(parts));

export function prdSha(meta, parts) {
  const fields = JSON.stringify(SHA_FIELDS.map(key => [key, meta?.[key] ?? null]));
  return sha256(`${fields}\n${canon(parts?.prd)}\n\u0000\n${canon(parts?.plan)}`);
}

export const ticketsSha = parts => sha256(canon(parts?.tickets));

// The tickets part keeps every filed ticket as JSON below its table, so a later
// version can compare its slices with the ones already filed.
const TICKETS_FENCE = /(?:^|\n)```json nebula-tickets\s*\n([\s\S]*?)\n```(?=\n|$)/u;

/** The filed tickets a tickets part holds, or [] when it holds none. */
export function parseTicketsPart(text) {
  const match = TICKETS_FENCE.exec(String(text ?? '').replace(/\r\n?/gu, '\n'));
  if (!match) return [];
  try { const rows = JSON.parse(match[1]); return Array.isArray(rows) ? rows : []; } catch { return []; }
}

export const renderTicketsBlock = rows => `\`\`\`json nebula-tickets\n${JSON.stringify(rows, null, 2)}\n\`\`\``;

const oneLine = lines => lines.join(' ').replace(/\s+/gu, ' ').trim();
const ID_LINE = /^\s{0,3}(?:#{3,4}\s+|[-*]\s+)?([JRSQ])(\d+)\s*·\s*(.*?)\s*$/u;
const ACCEPTANCE_LINE = /^\s*[-*]\s+(A(\d+)\.(\d+))\s*[:·]\s*(.*?)\s*$/u;
const field = (name, line) => new RegExp(`^\\s*[-*]\\s+${name}\\s*:\\s*(.*?)\\s*$`, 'iu').exec(line)?.[1];
const idsIn = (text, letter) => [...String(text ?? '').matchAll(new RegExp(`\\b${letter}\\d+\\b`, 'gu'))].map(match => match[0]);

/** The ids a PRD part names: journeys, requirements with their priority and
 * acceptance lines, screens and open questions. */
export function prdOutline(prdText) {
  const { sections } = specSections(prdText);
  const lines = heading => sections[heading] ?? [];
  const idLines = (heading, letter) => lines(heading).map(line => ID_LINE.exec(line)).filter(match => match?.[1] === letter);

  const journeys = idLines('Journeys', 'J').map(match => ({ id: `J${match[2]}`, text: match[3] }));

  const requirements = [];
  const orphans = [];
  for (const line of lines('Requirements')) {
    const id = ID_LINE.exec(line);
    if (id?.[1] === 'R') {
      const [first, ...rest] = id[3].split('·').map(part => part.trim());
      const hasPriority = rest.length > 0;
      requirements.push({ id: `R${id[2]}`, number: Number(id[2]), priority: hasPriority ? first.toLowerCase() : '', text: hasPriority ? rest.join(' · ') : first,
        acceptance: [], screens: [], journeys: [] });
      continue;
    }
    const current = requirements.at(-1);
    const acceptance = ACCEPTANCE_LINE.exec(line);
    if (acceptance) {
      const item = { id: acceptance[1], requirement: Number(acceptance[2]), text: acceptance[4] };
      if (current) current.acceptance.push(item); else orphans.push(item);
      continue;
    }
    const screens = field('Screens?', line), journey = field('Journeys?', line);
    if (current && screens !== undefined) current.screens.push(...idsIn(screens, 'S'));
    if (current && journey !== undefined) current.journeys.push(...idsIn(journey, 'J'));
  }

  const screens = [];
  for (const line of lines('Screens')) {
    const id = ID_LINE.exec(line);
    if (id?.[1] === 'S') { screens.push({ id: `S${id[2]}`, name: id[3], job: null, frame: null }); continue; }
    const current = screens.at(-1);
    if (!current) continue;
    const job = field('Job', line), frame = field('Frame', line);
    if (job !== undefined) current.job = job;
    if (frame !== undefined) current.frame = /^none$/iu.test(frame) || !frame ? null : frame;
  }

  const questions = idLines('Open questions', 'Q').map((match) => {
    const parts = match[3].split('·').map(part => part.trim());
    const owner = parts.map(part => /^owner\s*:\s*(.+)$/iu.exec(part)?.[1]).find(Boolean) ?? null;
    const blocks = parts.flatMap(part => /^blocks?\s*:/iu.test(part) ? idsIn(part, 'R') : []);
    return { id: `Q${match[2]}`, text: parts[0], owner, blocks };
  });

  return { journeys, requirements, screens, questions, orphans };
}

/** Whether a PRD is ready to approve. Every section is answered the way a
 * spec's requirements checklist is (USER, or N/A where the row allows it; an
 * app's screens never may be N/A), and the ids hold together. */
export function checkPrd(text) {
  const prd = parsePrd(text).parts.prd;
  const { sections, duplicates } = specSections(prd);
  const outline = prdOutline(prd);
  const issues = [];

  const rows = PRD_SECTIONS.flatMap(([heading, id]) => {
    if (!Object.hasOwn(sections, heading)) return [];
    const answer = id === 'acceptance'
      ? outline.requirements.flatMap(item => item.acceptance.map(line => line.text)).join('; ')
      : oneLine(sections[heading]);
    if (!answer) return [];
    const notApplicable = /^N\/A\b\s*[—–-]?\s*/iu.exec(answer);
    return [notApplicable ? `- [x] ${id}: N/A — ${answer.slice(notApplicable[0].length)}` : `- [x] ${id}: USER — ${answer}`];
  });
  const assessed = assessRequirements(rows.join('\n'), [{ kind: 'app' }, { kind: 'page' }]);
  for (const item of assessed.items) {
    const heading = PRD_SECTIONS.find(([, id]) => id === item.id)[0];
    for (const message of item.issues) {
      issues.push({ id: item.id, section: heading, question: item.question,
        message: message === 'This requirement is missing.' ? `## ${heading} is missing or empty.` : `## ${heading}: ${message}` });
    }
  }
  for (const heading of duplicates) issues.push({ id: 'sections', section: heading, message: `## ${heading} appears twice; keep one.` });

  const seen = new Set();
  for (const item of [...outline.journeys, ...outline.requirements, ...outline.screens, ...outline.questions]) {
    if (seen.has(item.id)) issues.push({ id: 'ids', message: `${item.id} is used twice; give each its own number.` });
    seen.add(item.id);
  }
  if (!outline.requirements.length) issues.push({ id: 'requirements', section: 'Requirements', message: '## Requirements has no requirement line (### R1 · must · <what>).' });
  for (const item of outline.orphans) issues.push({ id: 'requirements', section: 'Requirements', message: `${item.id} sits above every requirement; move it under its R line.` });
  const journeyIds = new Set(outline.journeys.map(item => item.id)), screenIds = new Set(outline.screens.map(item => item.id));
  const usedScreens = new Set();
  for (const requirement of outline.requirements) {
    if (!PRIORITIES.includes(requirement.priority)) {
      issues.push({ id: 'requirements', section: 'Requirements', message: `${requirement.id}: priority must be must, should or could (got "${requirement.priority}").` });
    }
    if (!requirement.acceptance.length) issues.push({ id: 'requirements', section: 'Requirements', message: `${requirement.id} has no acceptance line (- A${requirement.number}.1: …).` });
    for (const line of requirement.acceptance) {
      if (line.requirement !== requirement.number) issues.push({ id: 'requirements', section: 'Requirements', message: `${line.id} sits under ${requirement.id}; number it A${requirement.number}.<n>.` });
    }
    for (const screen of requirement.screens) {
      usedScreens.add(screen);
      if (!screenIds.has(screen)) issues.push({ id: 'screens', section: 'Screens', message: `${screen} is named by a requirement but has no screen under ## Screens.` });
    }
    for (const journey of requirement.journeys) {
      if (!journeyIds.has(journey)) issues.push({ id: 'journeys', section: 'Journeys', message: `${journey} is named by ${requirement.id} but has no journey under ## Journeys.` });
    }
  }
  for (const screen of outline.screens) {
    if (!usedScreens.has(screen.id)) issues.push({ id: 'screens', section: 'Screens', message: `${screen.id} serves no requirement; name it on a requirement's Screens line or drop it.` });
  }
  for (const question of outline.questions) {
    if (!question.owner) issues.push({ id: 'questions', section: 'Open questions', message: `${question.id} needs an owner (· owner: who answers it).` });
  }
  const gap = placeholderIn(prd);
  if (gap) issues.push({ id: 'placeholder', message: `The PRD still has a gap: "${gap}".` });

  const priority = level => outline.requirements.filter(item => item.priority === level).length;
  return {
    ready: issues.length === 0, issues, outline,
    counts: { journeys: outline.journeys.length, requirements: { must: priority('must'), should: priority('should'), could: priority('could') },
      screens: outline.screens.length, questions: outline.questions.length },
  };
}

// Sections whose every change is a change of what the app is for, who it serves
// or how it must behave: always the person's decision.
const MAJOR_SECTIONS = ['Outcome', 'Users and roles', 'Scope', 'Rules', 'Integrations', 'Failures', 'Quality', 'Rollout'];
const sectionText = (sections, heading) => canon((sections[heading] ?? []).join('\n'));
const words = text => (canon(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
/** Whether `after` keeps every word `before` has, as many times: text was only added. */
function onlyAdded(before, after) {
  const left = new Map();
  for (const word of words(after)) left.set(word, (left.get(word) ?? 0) + 1);
  for (const word of words(before)) {
    if (!left.get(word)) return false;
    left.set(word, left.get(word) - 1);
  }
  return true;
}

/**
 * How much a new PRD changes the one it was written on: `none`, `minor` (an
 * acceptance line added or reworded under a requirement that stays, a screen
 * added, reworded or given a frame, data fields added, an open question
 * answered, the app plan updated) or `major` (a requirement or journey added or
 * removed, a priority changed, an acceptance line or screen removed, data taken
 * away, or any change to the outcome, roles, scope, rules, integrations,
 * failures, quality or rollout). A major change waits for the person's yes.
 */
export function classifyChange(beforeText, afterText) {
  const before = parsePrd(beforeText).parts, after = parsePrd(afterText).parts;
  const changes = [];
  const note = (level, what) => changes.push({ level, what });
  const was = specSections(before.prd).sections, now = specSections(after.prd).sections;
  for (const heading of MAJOR_SECTIONS) {
    if (sectionText(was, heading) !== sectionText(now, heading)) note('major', `## ${heading} changed`);
  }
  if (sectionText(was, 'Data') !== sectionText(now, 'Data')) {
    note(onlyAdded(sectionText(was, 'Data'), sectionText(now, 'Data')) ? 'minor' : 'major',
      onlyAdded(sectionText(was, 'Data'), sectionText(now, 'Data')) ? '## Data: fields added' : '## Data: something was taken away or replaced');
  }
  for (const heading of ['Current state', 'Open questions']) {
    if (sectionText(was, heading) !== sectionText(now, heading)) note('minor', `## ${heading} updated`);
  }

  const old = prdOutline(before.prd), fresh = prdOutline(after.prd);
  const byId = list => new Map(list.map(item => [item.id, item]));
  const compare = (kind, oldList, newList, { added, removed, changed, same = (a, b) => a.text === b.text }) => {
    const a = byId(oldList), b = byId(newList);
    for (const [id, item] of b) {
      if (!a.has(id)) note(added, `${kind} ${id} added: ${item.text ?? item.name ?? ''}`.trim());
      else if (!same(a.get(id), item)) note(changed, `${kind} ${id} reworded`);
    }
    for (const id of a.keys()) if (!b.has(id)) note(removed, `${kind} ${id} removed`);
  };
  compare('Journey', old.journeys, fresh.journeys, { added: 'major', removed: 'major', changed: 'minor' });
  compare('Screen', old.screens, fresh.screens, { added: 'minor', removed: 'major', changed: 'minor',
    same: (a, b) => a.name === b.name && a.job === b.job && a.frame === b.frame });
  const oldReqs = byId(old.requirements);
  for (const requirement of fresh.requirements) {
    const previous = oldReqs.get(requirement.id);
    if (!previous) { note('major', `Requirement ${requirement.id} added: ${requirement.text}`); continue; }
    if (previous.priority !== requirement.priority) note('major', `Requirement ${requirement.id}: priority ${previous.priority} became ${requirement.priority}`);
    if (previous.text !== requirement.text) note('minor', `Requirement ${requirement.id} reworded`);
    compare('Acceptance line', previous.acceptance, requirement.acceptance, { added: 'minor', removed: 'major', changed: 'minor' });
    if (previous.screens.join() !== requirement.screens.join()) note('minor', `Requirement ${requirement.id}: screens ${requirement.screens.join(', ') || 'none'}`);
  }
  for (const id of oldReqs.keys()) if (!fresh.requirements.some(item => item.id === id)) note('major', `Requirement ${id} removed`);
  if (canon(before.plan) !== canon(after.plan)) note('minor', '# App plan updated');

  const level = changes.some(change => change.level === 'major') ? 'major' : changes.length ? 'minor' : 'none';
  return { level, changes };
}

/** Every PRD version among these solution_document records. */
export function prdVersions(records) {
  return (records ?? []).flatMap((record) => {
    const text = record?.properties?.document;
    if (typeof text !== 'string') return [];
    try {
      const parsed = parsePrd(text);
      return isPrd(parsed.meta) ? [{ record, meta: parsed.meta, parts: parsed.parts }] : [];
    } catch { return []; }
  });
}

/**
 * Each app's versions, oldest first, with what failed its check:
 * `changed` (an approved version's content no longer matches its sha),
 * `rewritten` (the next approved version recorded a different sha for it),
 * `tickets-changed` (the tickets part differs from what the tickets step wrote),
 * `duplicate` (two records claim one version number). `knownShas` maps a
 * record id to the sha a trusted copy holds for it (this folder's backup): an
 * approved version whose sha differs was rewritten, which catches a rewrite of
 * the newest version too, the one no later version vouches for. `current` is
 * the newest approved version with no issue; `missing` names approved versions
 * a later one was based on that no record holds any more.
 */
export function chainStatus(records, { knownShas = {} } = {}) {
  const byApp = new Map();
  for (const entry of prdVersions(records)) {
    const app = entry.meta.app.trim();
    byApp.set(app, [...(byApp.get(app) ?? []), entry]);
  }
  return [...byApp.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([app, entries]) => {
    const versions = entries.map(entry => ({ version: Number(entry.meta.version), status: entry.meta.status, recordId: entry.record.id,
      recordVersion: entry.record.version ?? null, modifiedTime: entry.record.modifiedTime ?? null, lastModifiedBy: entry.record.lastModifiedBy ?? null,
      meta: entry.meta, parts: entry.parts, issues: [] }))
      .sort((a, b) => a.version - b.version || String(a.recordId).localeCompare(String(b.recordId)));
    const counts = new Map();
    for (const item of versions) counts.set(item.version, (counts.get(item.version) ?? 0) + 1);
    for (const item of versions) if (counts.get(item.version) > 1) item.issues.push('duplicate');

    const approved = versions.filter(item => item.status === 'approved');
    const missing = [];
    for (const item of approved) {
      if (!item.meta.sha || prdSha(item.meta, item.parts) !== item.meta.sha) item.issues.push('changed');
      else if (knownShas[item.recordId] && knownShas[item.recordId] !== item.meta.sha) item.issues.push('rewritten');
      const filled = canon(item.parts.tickets) !== '';
      if (item.meta.ticketsSha ? ticketsSha(item.parts) !== item.meta.ticketsSha : filled) item.issues.push('tickets-changed');
      if (item.meta.basedOn === null || item.meta.basedOn === undefined) continue;
      const previous = approved.find(other => other.version === Number(item.meta.basedOn));
      if (!previous) { missing.push(Number(item.meta.basedOn)); continue; }
      if ((item.meta.prevSha ?? null) !== (previous.meta.sha ?? null) && !previous.issues.includes('rewritten')) previous.issues.push('rewritten');
    }
    for (const item of versions) item.intact = item.issues.length === 0;
    const current = [...approved].reverse().find(item => item.intact) ?? null;
    const drafts = versions.filter(item => item.status === 'draft');
    return {
      app, title: (current ?? drafts.at(-1) ?? versions.at(-1)).meta.title ?? app, versions, current, newestApproved: approved.at(-1) ?? null, drafts,
      latestVersion: Math.max(0, ...versions.map(item => item.version).filter(Number.isFinite)),
      tampered: [...new Set(versions.filter(item => !item.intact).map(item => item.version))],
      missing: [...new Set(missing)],
    };
  });
}

/** One short line per app for `solution context`: never a body. */
export const prdIndex = (records, options) => chainStatus(records, options).map(app => ({
  app: app.app, title: app.title, version: app.current?.version ?? null, approvedAt: app.current?.meta.approvedAt ?? null,
  draft: app.drafts.at(-1)?.version ?? null,
  ...(app.tampered.length ? { tampered: app.tampered } : {}),
}));

export const prdApps = records => [...new Set(prdVersions(records).map(entry => entry.meta.app.trim()))].sort();

const textLines = text => {
  const value = String(text ?? '').replace(/\r\n?/gu, '\n');
  return value ? value.split('\n') : [];
};

/** A line diff: ` ` kept, `-` only in `before`, `+` only in `after`. */
export function diffLines(before, after) {
  const a = textLines(before), b = textLines(after);
  if (a.length * b.length > MAX_DIFF_CELLS) return [...a.map(line => `-${line}`), ...b.map(line => `+${line}`)];
  const width = b.length + 1;
  const common = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i * width + j] = a[i] === b[j] ? common[(i + 1) * width + j + 1] + 1 : Math.max(common[(i + 1) * width + j], common[i * width + j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push(` ${a[i]}`); i++; j++; }
    else if (common[(i + 1) * width + j] >= common[i * width + j + 1]) out.push(`-${a[i++]}`);
    else out.push(`+${b[j++]}`);
  }
  while (i < a.length) out.push(`-${a[i++]}`);
  while (j < b.length) out.push(`+${b[j++]}`);
  return out;
}
