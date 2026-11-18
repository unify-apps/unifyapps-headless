#!/usr/bin/env node
// The coverage gate of a web app review: reads the run folder the explorer wrote and answers whether
// every page the navigation reaches was walked, every control in each page's ledger was tried or carries
// a reason, every page was also opened directly by URL, and the run-wide passes (auth, notifications,
// URL and branding) left their record. Nothing is judged by reading; the files either hold it or not.
// Node 22, no packages, no browser.
//
//   node coverage.mjs check --run <RUN> [--width 1440] [--json]
//       exit 0 when complete, 1 with the list of what is missing, 2 on bad flags
//   node coverage.mjs slugs --run <RUN> [--json]
//       the address-bar leads of the URL and branding pass: every page whose slug says clone, copy or
//       test, ends in or carries a number, looks like a generated hash, or is a generic name, and every
//       title, name or logo in branding.md that still says Clone of, Copy, Untitled or a default (a whole
//       title of "app", "index" or "page" included); the notes column is never read; exit 0 always
//   node coverage.mjs slug <path>      the flags of one path, for a quick look
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The probes every page runs whatever its type (capture.md, Behaviour probes). A row whose `actual`
// starts with "not run:" carries its reason and counts.
export const REQUIRED_PROBES = Object.freeze(['hover', 'focus', 'back and reload', 'resize', 'direct open', 'console and network']);
// The files each page folder holds once it is final (capture.md, Run folder).
export const PAGE_FILES = Object.freeze(['DONE', 'ledger.md', 'probes.md', 'timings.md']);
// The run-wide records the explorer writes last, each with "not run: <reason>" when a pass did not run.
export const RUN_FILES = Object.freeze(['auth.md', 'notifications.md', 'branding.md']);
// design.md (written at the brief): `| page | screen | width | spec | picture |`, one row per page and width
// with a spec. Each row needs the page's design/<width>/gaps.json, or a Design probe row saying why not.
const DESIGN_FILE = 'design.md';
// An untried ledger row that carries no reason: an empty action, a dash, or the bare word.
const UNTRIED = /^(?:|-+|—|untried|not tried|skipped|todo)$/iu;
// An untried row with its reason after a colon or in brackets, or a surface already probed elsewhere.
const UNTRIED_WITH_REASON = /^(?:untried|not tried|skipped|off limits|not reached|same as)\b\s*[:(]?\s*\S/iu;
const YES = /^(?:yes|y|true|off limits)\b/iu;
// A navmap row for a page the explorer saw in the navigation but did not walk, with why.
const NOT_WALKED = /^not walked:\s*\S/iu;

// Slug flags (SKILL.md, URL and branding pass). A number counts from two digits anywhere, or one digit at
// the end after a separator (`orders-2`); a single digit inside a word (`b2b`, `3d`) does not.
const SLUG_WORDS = Object.freeze({ clone: /(?:^|[-_.])clone(?:d|s)?(?:[-_.]|$)|^clone/iu, copy: /(?:^|[-_.])cop(?:y|ies)(?:[-_.]|$)|^copy[-_]?of/iu, test: /(?:^|[-_.])(?:test|tmp|temp|dummy|sandbox|scratch|draft)\w*(?:[-_.]|$)/iu });
const NUMBER = /\d{2,}|\d$|[-_.]\d(?:[-_.]|$)/u;
const HASH = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|e_[0-9a-z]{8,}|(?=\w*\d)(?=\w*[a-z])[0-9a-z]{8,})$/iu;
const GENERIC = new Set(['page', 'new-page', 'newpage', 'untitled', 'index', 'screen', 'home1', 'page1', 'p1', 'default', 'blank', 'new']);
const DEFAULT_TITLE = /\b(?:clone of|copy of|untitled|new page|my app|new app|unnamed|lorem ipsum)\b|\(copy\)|\bcopy\s*\d*$/iu;
// A whole title that is a framework's or the builder's default, never a product's name.
const DEFAULT_WHOLE = /^(?:app|index|page|home|untitled|default|react app|vite app|new app|application)$/iu;
// branding.md columns that hold a path or free text, never a name a user reads.
const NOT_A_NAME = /^(?:page|address bar|url|path|notes?)$/iu;

const cells = (line) => line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|').map((cell) => cell.trim());
const isSeparator = (line) => /^\|?\s*:?-{2,}/u.test(line.trim());

/** The rows of a pipe table, header and separator left out, as arrays of cells. */
export function tableRows(text) {
  const rows = [];
  let header = null;
  for (const line of String(text ?? '').split('\n')) {
    if (!line.includes('|')) continue;
    if (isSeparator(line)) continue;
    const row = cells(line);
    if (!header) { header = row.map((cell) => cell.toLowerCase()); continue; }
    rows.push(row);
  }
  return { header: header ?? [], rows };
}

/** navmap.md: `NN | slug | URL path | page type | reached by | parent | notes`, with or without a header. */
export function readNavmap(text) {
  const pages = [];
  for (const line of String(text ?? '').split('\n')) {
    if (!line.includes('|') || isSeparator(line)) continue;
    const row = cells(line);
    if (!/^\d{2,}$/u.test(row[0] ?? '')) continue;
    const [number, slug, urlPath = '', type = '', reachedBy = '', parent = '', ...rest] = row;
    pages.push({ number, slug, folder: `${number}-${slug}`, path: urlPath, type, reachedBy, parent, notes: rest.join(' | ').trim() });
  }
  return pages;
}

/** ledger.md rows that were never tried and give no reason. */
export function untriedRows(text) {
  const { header, rows } = tableRows(text);
  const at = (name, fallback) => { const index = header.findIndex((cell) => cell.startsWith(name)); return index === -1 ? fallback : index; };
  const control = at('control', 0);
  const action = at('action', 3);
  const result = at('result', 4);
  const offLimits = at('off limits', 5);
  const untried = [];
  for (const row of rows) {
    const taken = row[action] ?? '';
    const outcome = row[result] ?? '';
    if (YES.test(row[offLimits] ?? '')) continue;
    if (UNTRIED_WITH_REASON.test(taken) || UNTRIED_WITH_REASON.test(outcome)) continue;
    if (UNTRIED.test(taken)) untried.push(row[control] ?? `row ${untried.length + 1}`);
  }
  return untried;
}

/** The probes probes.md records, lower-cased, with the ones marked "not run: <reason>" kept. */
export function probesRecorded(text) {
  const { rows } = tableRows(text);
  return rows.map((row) => (row[0] ?? '').toLowerCase()).filter(Boolean);
}

const missingProbes = (text) => {
  const seen = probesRecorded(text);
  return REQUIRED_PROBES.filter((probe) => !seen.some((name) => name.startsWith(probe) || (probe === 'focus' && name.startsWith('focus'))));
};

/** The flags of one address path: the last segment is the slug. */
export function slugFlags(urlPath) {
  const segments = String(urlPath ?? '').split(/[?#]/u)[0].split('/').filter(Boolean);
  const slug = segments.at(-1) ?? '';
  const flags = [];
  if (!slug) return { slug, flags: segments.length ? flags : ['empty'] };
  for (const [flag, pattern] of Object.entries(SLUG_WORDS)) if (pattern.test(slug)) flags.push(flag);
  if (HASH.test(slug)) flags.push('hash');
  else if (NUMBER.test(slug)) flags.push('number');
  if (GENERIC.has(slug.toLowerCase())) flags.push('generic');
  return { slug, flags };
}

/** Every title cell of branding.md that still reads as a default or a copy. */
export function brandingFlags(text) {
  const { header, rows } = tableRows(text);
  const found = [];
  rows.forEach((row) => {
    row.forEach((cell, index) => {
      if (index === 0 || !cell) return;
      const column = header[index] ?? `column ${index + 1}`;
      if (NOT_A_NAME.test(column)) return;
      if (DEFAULT_TITLE.test(cell) || DEFAULT_WHOLE.test(cell.trim())) found.push({ page: row[0], column, value: cell });
    });
  });
  return found;
}

/** The whole gate on one run folder. */
export function coverage(run, { width = 1440 } = {}) {
  const problems = [];
  const read = (...parts) => { try { return fs.readFileSync(path.join(run, ...parts), 'utf8'); } catch { return null; } };
  const exists = (...parts) => fs.existsSync(path.join(run, ...parts));
  const navmap = read('navmap.md');
  if (navmap === null) problems.push('navmap.md is missing');
  const pages = readNavmap(navmap ?? '');
  if (navmap !== null && !pages.length) problems.push('navmap.md lists no page');
  let walked = 0;
  for (const page of pages) {
    if (NOT_WALKED.test(page.notes)) continue;
    const folder = path.join('pages', page.folder);
    if (!exists(folder)) { problems.push(`${page.folder}: no page folder (walk it, or note it "not walked: <reason>" in navmap.md)`); continue; }
    walked += 1;
    for (const file of PAGE_FILES) if (!exists(folder, file)) problems.push(`${page.folder}: ${file} is missing`);
    for (const w of [width, 375]) for (const ext of ['png', 'yml', 'json']) if (!exists(folder, `screen-${w}.${ext}`)) problems.push(`${page.folder}: screen-${w}.${ext} is missing`);
    const ledger = read(folder, 'ledger.md');
    if (ledger !== null) {
      for (const control of untriedRows(ledger)) problems.push(`${page.folder}: control "${control}" untried without a reason`);
      if (!tableRows(ledger).rows.length) problems.push(`${page.folder}: ledger.md lists no control`);
    }
    const probes = read(folder, 'probes.md');
    if (probes !== null) for (const probe of missingProbes(probes)) problems.push(`${page.folder}: probe "${probe}" not recorded (run it, or record it "not run: <reason>")`);
    if (exists(folder, 'states')) {
      const states = fs.readdirSync(path.join(run, folder, 'states')).filter((name) => name.endsWith('.png') && !/-t\d+\.png$/u.test(name));
      const yml = new Set(fs.readdirSync(path.join(run, folder, 'states')).filter((name) => name.endsWith('.yml')).map((name) => name.slice(0, -4)));
      for (const shot of states) if (!yml.has(shot.slice(0, -4))) problems.push(`${page.folder}: state ${shot} has a screenshot but no snapshot (it was opened, not probed)`);
    }
  }
  for (const file of RUN_FILES) if (!exists(file)) problems.push(`${file} is missing (write it, with "not run: <reason>" when the pass did not run)`);
  // The explorer writes auth.md as "not run: pending" before its own check, since the auth pass comes last;
  // at the main thread's gate, after EXPLORE_DONE, a pending line means the pass never ran and never said why.
  if (exists('EXPLORE_DONE') && /^\s*not run:\s*pending\b/iu.test(read('auth.md') ?? '')) problems.push('auth.md still says "not run: pending": the auth pass neither ran nor gave its reason');
  const design = { rows: 0, compared: 0, couldNotMeasure: 0 };
  for (const row of designRows(read(DESIGN_FILE))) {
    design.rows += 1;
    const folder = path.join('pages', row.page);
    if (exists(folder, 'design', String(row.width), 'gaps.json')) { design.compared += 1; continue; }
    const probes = read(folder, 'probes.md') ?? '';
    const said = tableRows(probes).rows.find((cells) => /^design\b/iu.test(cells[0] ?? '') && String(cells[1] ?? '').includes(String(row.width)));
    if (said && /could not measure|not run/iu.test(said.join(' '))) { design.couldNotMeasure += 1; continue; }
    problems.push(`${row.page}: design pass at ${row.width} has no gaps.json and no Design probe row saying why`);
  }
  if (!exists('EXPLORE_DONE')) problems.push('EXPLORE_DONE is missing: the explorer has not finished');
  return { complete: problems.length === 0, pages: pages.length, walked, notWalked: pages.filter((page) => NOT_WALKED.test(page.notes)).length, design, problems };
}

/** design.md rows: the page folder, the store screen and the width that has a spec. */
export function designRows(text) {
  const { header, rows } = tableRows(text);
  if (!rows.length) return [];
  const at = (name, fallback) => { const index = header.findIndex((cell) => cell.startsWith(name)); return index === -1 ? fallback : index; };
  return rows.map((row) => ({ page: row[at('page', 0)] ?? '', screen: row[at('screen', 1)] ?? '', width: Number(row[at('width', 2)]), spec: row[at('spec', 3)] ?? '', picture: row[at('picture', 4)] ?? '' })).filter((row) => row.page && Number.isInteger(row.width));
}

/** The leads of the URL and branding pass from navmap.md and branding.md. */
export function slugLeads(run) {
  const read = (file) => { try { return fs.readFileSync(path.join(run, file), 'utf8'); } catch { return ''; } };
  const slugs = readNavmap(read('navmap.md')).map((page) => ({ page: page.folder, path: page.path, ...slugFlags(page.path) })).filter((lead) => lead.flags.length);
  const titles = brandingFlags(read('branding.md'));
  return { slugs, titles };
}

function usage(message) {
  const text = [message, 'usage: node coverage.mjs check --run <RUN> [--width 1440] [--json]', '       node coverage.mjs slugs --run <RUN> [--json]', '       node coverage.mjs slug <path>'].filter(Boolean).join('\n');
  process.stderr.write(`${text}\n`);
  process.exit(2);
}

function flagsOf(args) {
  const flags = {};
  const rest = [];
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at];
    if (!arg.startsWith('--')) { rest.push(arg); continue; }
    const name = arg.slice(2);
    if (name === 'json' || name === 'help') { flags[name] = true; continue; }
    const value = args[at + 1];
    if (value === undefined || value.startsWith('--')) usage(`--${name} needs a value`);
    flags[name] = value;
    at += 1;
  }
  return { flags, rest };
}

function main(argv) {
  const [command, ...args] = argv;
  if (!command || command === '--help' || command === '-h') usage();
  const { flags, rest } = flagsOf(args);
  if (flags.help) usage();
  if (command === 'slug') {
    if (!rest[0]) usage('slug takes a path');
    process.stdout.write(`${JSON.stringify(slugFlags(rest[0]))}\n`);
    return;
  }
  if (!['check', 'slugs'].includes(command)) usage(`unknown command ${command}`);
  if (typeof flags.run !== 'string') usage('--run <RUN> is required');
  const run = path.resolve(flags.run);
  if (!fs.existsSync(run) || !fs.statSync(run).isDirectory()) { process.stderr.write(`${run} is not a folder\n`); process.exit(2); }
  if (command === 'slugs') {
    const leads = slugLeads(run);
    if (flags.json) process.stdout.write(`${JSON.stringify(leads, null, 1)}\n`);
    else {
      for (const lead of leads.slugs) process.stdout.write(`${lead.page}  ${lead.path}  ${lead.flags.join(', ')}\n`);
      for (const title of leads.titles) process.stdout.write(`${title.page}  ${title.column}: "${title.value}"\n`);
      if (!leads.slugs.length && !leads.titles.length) process.stdout.write('no address or title lead\n');
    }
    return;
  }
  const width = flags.width === undefined ? 1440 : Number(flags.width);
  if (!Number.isInteger(width) || width < 320) usage('--width is a whole number of CSS px');
  const result = coverage(run, { width });
  if (flags.json) process.stdout.write(`${JSON.stringify(result, null, 1)}\n`);
  else {
    process.stdout.write(`${result.complete ? 'complete' : 'not complete'}: ${result.walked} of ${result.pages} pages walked, ${result.notWalked} noted not walked, design ${result.design.compared} compared of ${result.design.rows}\n`);
    for (const problem of result.problems) process.stdout.write(`- ${problem}\n`);
  }
  if (!result.complete) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
