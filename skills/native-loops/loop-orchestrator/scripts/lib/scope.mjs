// The scope loop's tickets: the check that a slicing of the app plan covers the
// PRD, and the Markdown body of each ticket. The PRD's format and outline come from
// UnifyApps Headless's own scripts/lib/prd.mjs, so the loop and `prd check` read one shape.
import { parsePrd, parseTicketsPart, prdOutline } from '../../../../../scripts/lib/prd.mjs';
import { placeholderIn } from '../../../../../scripts/lib/spec-requirements.mjs';

// A slice is one native-build-loop run. Past five new screens a run's visual
// checks and builders no longer fit one session's limits, so the slice is split.
export const MAX_SCREENS = 5;
const SLICE = /^T(\d+)$/u;

const strings = (value) => (Array.isArray(value) ? value : []).filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
const sliceNumber = (id) => Number(SLICE.exec(id)?.[1] ?? NaN);

/** The tickets planned for one PRD version, as the tickets stage writes them. */
export function readPlan(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.tickets)) throw new Error('A tickets file holds { "tickets": [...] }.');
  return {
    later: strings(plan.later),
    tickets: plan.tickets.map((ticket) => ({
      slice: String(ticket?.slice ?? ''), title: String(ticket?.title ?? '').trim(), goal: String(ticket?.goal ?? '').trim(),
      requirements: strings(ticket?.requirements), checks: strings(ticket?.checks), screens: strings(ticket?.screens),
      data: strings(ticket?.data), automations: strings(ticket?.automations), depends: strings(ticket?.depends), outOfScope: strings(ticket?.outOfScope),
    })),
  };
}

/** The tickets a previous version filed: a JSON array, or the text `prd get --part tickets` answers. */
export function readPrevious(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.tickets)) return parsed.tickets;
  } catch { /* a tickets part, not JSON */ }
  return parseTicketsPart(text);
}

const outlineOf = (prdText) => prdOutline(parsePrd(prdText).parts.prd);

/** What one ticket says once its ids are read in the PRD: the whole of what a build run gets. */
function resolved(ticket, outline) {
  const requirement = (id) => outline.requirements.find((item) => item.id === id);
  const screen = (id) => outline.screens.find((item) => item.id === id);
  return {
    title: ticket.title, goal: ticket.goal,
    requirements: ticket.requirements.map((id) => ({ id, priority: requirement(id)?.priority ?? null, text: requirement(id)?.text ?? null })),
    acceptance: ticket.requirements.flatMap((id) => requirement(id)?.acceptance ?? []).map((line) => ({ id: line.id, text: line.text })),
    checks: ticket.checks,
    screens: ticket.screens.map((id) => ({ id, name: screen(id)?.name ?? null, job: screen(id)?.job ?? null, frame: screen(id)?.frame ?? null })),
    data: ticket.data, automations: ticket.automations, depends: ticket.depends, outOfScope: ticket.outOfScope,
  };
}

/**
 * Whether a slicing holds together: T0 first, every must and should requirement
 * in exactly one ticket, every screen built by one ticket, at most MAX_SCREENS
 * each, an acceptance line on every ticket, dependencies that exist, reach T0 and
 * never loop. With the tickets a previous version filed, a kept slice id must
 * keep covering what it covered and a new one is numbered past every old one;
 * with that version's PRD too, each kept slice is `changed` or `unchanged`.
 */
export function checkTickets({ plan, prdText, previous = null, previousPrdText = null }) {
  const { tickets, later } = readPlan(plan);
  const outline = outlineOf(prdText);
  const errors = [], warnings = [];
  const requirementIds = new Map(outline.requirements.map((item) => [item.id, item]));
  const screenIds = new Set(outline.screens.map((item) => item.id));

  if (!tickets.length) errors.push('The tickets file has no ticket.');
  const ids = new Set();
  for (const ticket of tickets) {
    if (!SLICE.test(ticket.slice)) errors.push(`"${ticket.slice}" is not a slice id: use T0, T1 and so on.`);
    else if (ids.has(ticket.slice)) errors.push(`${ticket.slice} is used twice.`);
    ids.add(ticket.slice);
    if (!ticket.title) errors.push(`${ticket.slice} has no title.`);
    if (!ticket.goal) errors.push(`${ticket.slice} has no goal.`);
    const gap = placeholderIn([ticket.title, ticket.goal, ...ticket.checks, ...ticket.data, ...ticket.automations, ...ticket.outOfScope].join('\n'));
    if (gap) errors.push(`${ticket.slice} still has a gap: "${gap}".`);
  }
  if (tickets.length && tickets[0].slice !== 'T0') errors.push('The first ticket is T0, the foundation: data model, roles, navigation and look.');

  const owner = new Map();
  for (const ticket of tickets) {
    for (const id of ticket.requirements) {
      if (!requirementIds.has(id)) { errors.push(`${ticket.slice} names ${id}, which the PRD does not have.`); continue; }
      if (owner.has(id)) errors.push(`${id} is in ${owner.get(id)} and ${ticket.slice}; a requirement belongs to one ticket.`);
      else owner.set(id, ticket.slice);
    }
  }
  for (const id of later) {
    const requirement = requirementIds.get(id);
    if (!requirement) errors.push(`Later names ${id}, which the PRD does not have.`);
    else if (requirement.priority !== 'could') errors.push(`${id} is a ${requirement.priority}; only a could may wait for later.`);
    else if (owner.has(id)) errors.push(`${id} is in ${owner.get(id)} and in Later.`);
  }
  for (const requirement of outline.requirements) {
    if (owner.has(requirement.id) || later.includes(requirement.id)) continue;
    if (requirement.priority === 'could') warnings.push(`${requirement.id} (could) is in no ticket and not in Later.`);
    else errors.push(`${requirement.id} (${requirement.priority || 'no priority'}) is in no ticket.`);
  }

  const builtBy = new Map();
  for (const ticket of tickets) {
    if (ticket.screens.length > MAX_SCREENS) errors.push(`${ticket.slice} builds ${ticket.screens.length} screens; split it so each ticket builds at most ${MAX_SCREENS}.`);
    for (const id of ticket.screens) {
      if (!screenIds.has(id)) { errors.push(`${ticket.slice} builds ${id}, which the PRD does not have.`); continue; }
      if (builtBy.has(id)) errors.push(`${id} is built by ${builtBy.get(id)} and ${ticket.slice}; one ticket builds a screen, a later one names it under Out of scope or its goal.`);
      else builtBy.set(id, ticket.slice);
    }
    const acceptance = ticket.requirements.flatMap((id) => requirementIds.get(id)?.acceptance ?? []);
    if (!acceptance.length && !ticket.checks.length) errors.push(`${ticket.slice} has no acceptance line: give it a requirement with A lines, or checks.`);
  }
  for (const requirement of outline.requirements) {
    if (requirement.priority === 'could' && !owner.has(requirement.id)) continue;
    for (const id of requirement.screens) {
      if (screenIds.has(id) && !builtBy.has(id)) errors.push(`${id} is used by ${requirement.id} but no ticket builds it.`);
    }
  }

  for (const ticket of tickets) {
    for (const id of ticket.depends) {
      if (id === ticket.slice) errors.push(`${ticket.slice} depends on itself.`);
      else if (!ids.has(id)) errors.push(`${ticket.slice} depends on ${id}, which is not a ticket.`);
    }
  }
  if (tickets[0]?.slice === 'T0' && tickets[0].depends.length) errors.push('T0 depends on nothing.');
  const bySlice = new Map(tickets.map((ticket) => [ticket.slice, ticket]));
  const state = new Map();
  const visit = (slice, trail) => {
    if (state.get(slice) === 'done') return;
    if (state.get(slice) === 'open') { errors.push(`The dependencies loop: ${[...trail, slice].join(' → ')}.`); return; }
    state.set(slice, 'open');
    for (const next of bySlice.get(slice)?.depends ?? []) if (bySlice.has(next)) visit(next, [...trail, slice]);
    state.set(slice, 'done');
  };
  for (const ticket of tickets) visit(ticket.slice, []);
  const reachesFoundation = (slice, seen = new Set()) => slice === 'T0'
    || (!seen.has(slice) && (bySlice.get(slice)?.depends ?? []).some((next) => reachesFoundation(next, new Set([...seen, slice]))));
  for (const ticket of tickets.slice(1)) {
    if (ids.has('T0') && !reachesFoundation(ticket.slice)) errors.push(`${ticket.slice} does not depend on T0, directly or through another ticket.`);
  }

  const slices = { new: [], kept: [], dropped: [], changed: [], unchanged: [] };
  if (previous) {
    const before = new Map(previous.map((row) => [String(row?.slice ?? ''), row]));
    const highest = Math.max(-1, ...[...before.keys()].map(sliceNumber).filter(Number.isFinite));
    const previousOutline = previousPrdText ? outlineOf(previousPrdText) : null;
    for (const ticket of tickets) {
      const old = before.get(ticket.slice);
      if (!old) {
        slices.new.push(ticket.slice);
        if (sliceNumber(ticket.slice) <= highest) errors.push(`${ticket.slice} is new but numbered at or below T${highest}; a new slice takes T${highest + 1} or above, so no filed ticket's id is reused.`);
        continue;
      }
      slices.kept.push(ticket.slice);
      const oldRequirements = strings(old.requirements);
      if (ticket.slice !== 'T0' && oldRequirements.length && !oldRequirements.some((id) => ticket.requirements.includes(id))) {
        errors.push(`${ticket.slice} covered ${oldRequirements.join(', ')} and now covers ${ticket.requirements.join(', ') || 'none of them'}: a slice keeps its id only while it is the same feature. Give the new feature a new id.`);
      }
      if (previousOutline) {
        const same = JSON.stringify(resolved(ticket, outline)) === JSON.stringify(resolved(readPlan({ tickets: [old] }).tickets[0], previousOutline));
        slices[same ? 'unchanged' : 'changed'].push(ticket.slice);
      }
    }
    slices.dropped = [...before.keys()].filter((slice) => !ids.has(slice));
  }

  return {
    ok: errors.length === 0, errors, warnings, slices,
    counts: { tickets: tickets.length, requirements: owner.size, later: later.length, screens: builtBy.size },
  };
}

/** The order to file in: T0 alone, then each ticket once every ticket it depends on is filed. */
export function layers(tickets) {
  const placed = new Map();
  const depth = (ticket, seen = new Set()) => {
    if (placed.has(ticket.slice)) return placed.get(ticket.slice);
    if (seen.has(ticket.slice)) return 0;
    const parents = ticket.depends.map((id) => tickets.find((other) => other.slice === id)).filter(Boolean);
    const value = parents.length ? 1 + Math.max(...parents.map((parent) => depth(parent, new Set([...seen, ticket.slice])))) : 0;
    placed.set(ticket.slice, value);
    return value;
  };
  for (const ticket of tickets) depth(ticket);
  return placed;
}

const bullets = (lines) => lines.map((line) => `- ${line}`).join('\n');

// A ticket's description is Markdown, so a PRD's own text — a UI string
// quoting `PM_<machine>_<freq>.xlsx`, a required-field label ending `*` —
// must come back unchanged, not read as emphasis or a stripped literal.
const escapeMd = (text) => String(text ?? '').replace(/[_*~`]/gu, (char) => `\\${char}`);

/**
 * The title and Markdown body of each ticket (a `#` line is a section
 * title). A ticket is `ready` once every ticket it depends on
 * has a key in `keys`; the stage files the ready ones, adds their keys, and
 * renders again.
 */
export function renderTickets({ plan, prdText, prdVersion, appName, appId = null, solutionName = null, solutionId = null, keys = {} }) {
  const { tickets } = readPlan(plan);
  const meta = parsePrd(prdText).meta;
  // A PRD written to the template carries no frontmatter `app:` (the template
  // only asks for `title`/`appId`), so without this fallback every rendered
  // ticket's scope marker, idempotency key and build line fell back to the
  // literal strings "app"/"<app>", breaking cross-app re-run matching.
  const app = meta.app ?? appId ?? null;
  const outline = outlineOf(prdText);
  const depth = layers(tickets);
  return tickets.map((ticket) => {
    const view = resolved(ticket, outline);
    const missing = ticket.depends.filter((id) => !keys[id]?.key);
    const link = (id) => {
      const key = keys[id]?.key;
      const title = tickets.find((other) => other.slice === id)?.title ?? id;
      return key ? `${keys[id].url ? `[${key}](${keys[id].url})` : key} · ${id} ${title}` : `${id} ${title}`;
    };
    const sections = [
      ['Goal', escapeMd(view.goal)],
      ['App', [appName, 'MOBILE', appId ? `app ${appId}` : 'app made by T0', solutionName ? `solution ${solutionName}` : null].filter(Boolean).join(' · ')],
      ['Requirements', bullets(view.requirements.map((item) => `${item.id} (${item.priority}) · ${escapeMd(item.text)}`))],
      ['Acceptance', bullets([...view.acceptance.map((line) => `${line.id}: ${escapeMd(line.text)}`), ...view.checks.map((check, index) => `${ticket.slice}.${index + 1}: ${escapeMd(check)}`)])],
      ['Screens', bullets(view.screens.map((item) => [`${item.id} ${item.name}`, item.job ? `job: ${escapeMd(item.job)}` : null, `design: ${item.frame ?? 'none'}`].filter(Boolean).join(' · ')))],
      ['Data', bullets(view.data.map(escapeMd))],
      ['Automations and AI agents', bullets(view.automations.map(escapeMd))],
      ['Depends on', bullets(ticket.depends.map(link))],
      ['Out of scope', bullets(view.outOfScope.map(escapeMd))],
      ['Build it', `In a new UnifyApps Headless session, run \`/ua:native-build-loop\` with this ticket's link and its goal. The PRD it comes from: \`prd get ${app ?? '<app>'} --version ${prdVersion}\`.`],
    ].filter(([, body]) => body && body.trim());
    const body = [
      ...sections.map(([title, text]) => `# ${title}\n\n${text}`),
      '---',
      `Scope marker: nebula-scope/${app ?? 'app'}/${ticket.slice} · PRD v${prdVersion}`,
    ].join('\n\n');
    return {
      slice: ticket.slice, layer: depth.get(ticket.slice) ?? 0, ready: missing.length === 0, waitsFor: missing,
      title: `[${appName}] ${ticket.slice} · ${ticket.title}`, description: `${body}\n`,
      dependsOn: ticket.depends.map((id) => keys[id]).filter((entry) => entry?.url).map((entry) => ({ url: entry.url, title: entry.key })),
      ...(solutionId ? { idempotencyKey: `nebula-scope:${solutionId}:${app ?? 'app'}:${ticket.slice}` } : {}),
      requirements: ticket.requirements, depends: ticket.depends,
    };
  });
}

/** Filed keys, from `{ "T0": { "key", "url" } }` or the rows `prd tickets` takes. */
export function readKeys(value) {
  const rows = Array.isArray(value) ? value : Array.isArray(value?.tickets) ? value.tickets : null;
  if (rows) return Object.fromEntries(rows.filter((row) => row?.slice && row?.key).map((row) => [row.slice, { key: row.key, url: row.url ?? null }]));
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, entry]) => entry?.key).map(([slice, entry]) => [slice, { key: entry.key, url: entry.url ?? null }]));
}
