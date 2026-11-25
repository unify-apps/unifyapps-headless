// `prd`: an app's PRD, versioned on the tenant as one solution_document per
// version (scripts/lib/prd.mjs holds the format and the checks). A draft is
// saved over only by someone who read its current record version; an approved
// version is never written again except to record its tickets once; a restore
// makes a new draft and never rewrites history.
import fs from 'node:fs';
import path from 'node:path';
import { UaError, slug } from '../lib/contracts.mjs';
import { canon, chainStatus, checkPrd, classifyChange, diffLines, parsePrd, parseTicketsPart, prdIndex, prdSha, renderPrd, renderPrdBody, renderTicketsBlock, ticketsSha } from '../lib/prd.mjs';
import { LOCAL_STORE_FILE } from '../platform/entity-store.mjs';
import { readJsonFile } from '../lib/session-paths.mjs';
import { readRecord, readRecords, cacheRecords, renderPrds } from '../folder/local.mjs';
import { readSyncStatus, refreshCurrent, refreshCurrentIfStale } from '../folder/solution-sync.mjs';

const required = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new UaError('USAGE', `${label} is required.`);
  return value.trim();
};
const ownSolution = (ctx) => {
  const record = readRecord(ctx.home, 'solution');
  if (!record || record.id !== ctx.state?.solutionId || record.entityType !== 'e_solution') throw new UaError('NOT_STARTED');
  return record;
};
const appArg = (value) => {
  const app = slug(required(value, 'App'));
  if (!app) throw new UaError('USAGE', 'Name the app with letters or numbers, such as leave-management.');
  return app;
};
const versionFlag = (value, label = '--version') => {
  const number = Number(required(value === undefined ? undefined : String(value), label));
  if (!Number.isInteger(number) || number < 1) throw new UaError('USAGE', `${label} must be a version number such as 3.`);
  return number;
};
// A record's own version starts at 0 on the tenant, so 0 is a version a caller read.
const recordVersionFlag = (value) => {
  const number = Number(required(value === undefined ? undefined : String(value), '--record-version'));
  if (!Number.isInteger(number) || number < 0) throw new UaError('USAGE', '--record-version must be the record version prd get or prd save answered, such as 0 or 4.');
  return number;
};
const readInput = (ctx, file, label) => {
  const full = path.resolve(ctx.cwd ?? process.cwd(), required(file, label));
  try { return fs.readFileSync(full, 'utf8'); }
  catch { throw new UaError('USAGE', `${label} ${full} could not be read.`); }
};
const who = ctx => ctx.state?.userEmail ?? ctx.actor?.clientId ?? null;
const now = () => new Date().toISOString();
const ownRecords = ctx => readRecords(ctx.home, 'doc').filter(record => record.properties?.solutionId === ctx.state.solutionId);

/** The sha of every approved version as UnifyApps Headless last wrote it from this folder
 * (`records/local-store.json`), for the versions whose copy still passes its own check. */
// Where the tickets go. A PRD saved before the rename carries `atlas`; a new
// one carries `tracker`, and both are read here so an older record still
// answers.
const trackerOf = (meta) => meta?.tracker ?? meta?.atlas ?? null;

function backupShas(ctx) {
  const shas = {};
  for (const [id, record] of Object.entries(readJsonFile(path.join(ctx.home, LOCAL_STORE_FILE), null)?.records ?? {})) {
    if (typeof record?.properties?.document !== 'string') continue;
    try {
      const copy = parsePrd(record.properties.document);
      if (copy.meta.status === 'approved' && copy.meta.sha && prdSha(copy.meta, copy.parts) === copy.meta.sha) shas[id] = copy.meta.sha;
    } catch { /* not a PRD */ }
  }
  return shas;
}
const chainsOf = ctx => chainStatus(ownRecords(ctx), { knownShas: backupShas(ctx) });
const chainFor = (ctx, app) => chainsOf(ctx).find(item => item.app === app) ?? null;
const savedBy = item => item.meta.savedBy ?? item.meta.author ?? 'someone';

/** Reads answer from this folder's copy, pulled again unless a pull just ran. */
async function readFresh(ctx) {
  if (ctx.refreshed || readSyncStatus(ctx.home)?.reason === 'production') return;
  try { await refreshCurrentIfStale(ctx); } catch { /* answer from the local copy */ }
}

function stored(ctx, record) {
  if (record?.entityType !== 'solution_document' || record.properties?.solutionId !== ctx.state.solutionId) throw new UaError('NOT_STARTED');
  cacheRecords(ctx.home, { docs: [record] });
  renderPrds(ctx.home, readRecords(ctx.home, 'doc'));
  return record;
}

/** One write to one record, refused when the record moved past the version the caller read. */
const writeOver = (ctx, recordId, expected, change) => ctx.service.readMergeWrite('solution_document', recordId, (properties, current) => {
  if (properties.solutionId !== ctx.state.solutionId) throw new UaError('NOT_STARTED');
  if (expected !== undefined && current.version !== expected) {
    throw new UaError('VERSION_CONFLICT', `This PRD version changed since it was read (record version ${current.version}, read at ${expected}). Read it again and work from what it says now.`, { recordVersion: current.version });
  }
  return { document: change(parsePrd(properties.document)) };
}, { attempts: 1 });

const describe = item => ({
  version: item.version, status: item.status, intact: item.intact, issues: item.issues, title: item.meta.title ?? null,
  author: item.meta.author ?? null, createdAt: item.meta.createdAt ?? null, savedBy: item.meta.savedBy ?? null, savedAt: item.meta.savedAt ?? null,
  approvedBy: item.meta.approvedBy ?? null, approvedAt: item.meta.approvedAt ?? null, basedOn: item.meta.basedOn ?? null,
  restoredFrom: item.meta.restoredFrom ?? null, note: item.meta.note ?? null, ticketsAt: item.meta.ticketsAt ?? null,
  recordId: item.recordId, recordVersion: item.recordVersion, modifiedTime: item.modifiedTime, lastModifiedBy: item.lastModifiedBy,
});

const ISSUE_WORDS = {
  changed: 'its PRD or plan was changed after approval',
  rewritten: 'it was rewritten after a later version was approved on top of it',
  'tickets-changed': 'its tickets part differs from the one recorded',
  duplicate: 'another record claims the same version number',
};
const issueText = item => item.issues.map(issue => ISSUE_WORDS[issue] ?? issue).join('; ');

/** The text of one part, or of the PRD and the plan together. */
function partText(item, part) {
  if (!part) return renderPrdBody({ prd: item.parts.prd, plan: item.parts.plan, tickets: item.parts.tickets });
  const key = { prd: 'prd', plan: 'plan', tickets: 'tickets' }[part];
  if (!key) throw new UaError('USAGE', '--part must be prd, plan or tickets.');
  return item.parts[key];
}

/** The copy of a record UnifyApps Headless last wrote from this folder, when it still passes its check. */
function backupCopy(ctx, item) {
  const record = readJsonFile(path.join(ctx.home, LOCAL_STORE_FILE), null)?.records?.[item.recordId];
  if (typeof record?.properties?.document !== 'string') return null;
  try {
    const copy = parsePrd(record.properties.document);
    return copy.meta.version === item.version && copy.meta.sha && prdSha(copy.meta, copy.parts) === copy.meta.sha ? copy : null;
  } catch { return null; }
}

const ticketRows = (input) => {
  const rows = Array.isArray(input) ? input : input?.tickets;
  if (!Array.isArray(rows) || !rows.length) throw new UaError('USAGE', 'The tickets file needs a JSON array of tickets, or { "tickets": [...], "tracker": {...} }.');
  return rows;
};

/** The filed tickets, then each row of `rows`: a row for a slice already there replaces it. */
const mergeTickets = (filed, rows) => [...filed.filter(row => !rows.some(next => next.slice === row.slice)), ...rows];

function ticketsTable(rows) {
  const cell = value => String(value ?? '').replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ').trim();
  const list = value => (Array.isArray(value) ? value : value ? [value] : []).map(cell).filter(Boolean).join(', ');
  const issues = [];
  rows.forEach((row, index) => {
    if (!/^T\d+$/u.test(String(row?.slice ?? ''))) issues.push(`tickets[${index}].slice must be T0, T1 and so on.`);
    if (typeof row?.title !== 'string' || !row.title.trim()) issues.push(`tickets[${index}].title is required.`);
    if (typeof row?.key !== 'string' || !row.key.trim()) issues.push(`tickets[${index}].key must be the filed ticket's key.`);
  });
  if (issues.length) throw new UaError('USAGE', `The tickets file is invalid: ${issues.join(' ')}`);
  return ['| Slice | Title | Ticket | Depends on | Requirements |', '|---|---|---|---|---|',
    ...rows.map(row => `| ${cell(row.slice)} | ${cell(row.title)} | ${row.url ? `[${cell(row.key)}](${cell(row.url)})` : cell(row.key)} | ${list(row.depends) || '—'} | ${list(row.requirements) || '—'} |`),
    '', renderTicketsBlock(rows)].join('\n');
}

export async function run(command, args = [], flags = {}, ctx = {}) {
  if (command === 'check') {
    const report = checkPrd(readInput(ctx, flags.file, 'PRD file'));
    const data = { ready: report.ready, issues: report.issues, counts: report.counts };
    return { data, exitCode: report.ready ? 0 : 1,
      message: report.ready ? 'The PRD is ready to approve.' : `The PRD is not ready: ${report.issues.length} ${report.issues.length === 1 ? 'issue' : 'issues'}, first: ${report.issues[0].message}` };
  }

  ownSolution(ctx);

  if (command === 'list') {
    await readFresh(ctx);
    const data = prdIndex(ownRecords(ctx), { knownShas: backupShas(ctx) });
    return { data, message: data.length === 1 ? '1 PRD.' : `${data.length} PRDs.` };
  }

  if (command === 'get') {
    const app = appArg(args[0]);
    await readFresh(ctx);
    const chain = chainFor(ctx, app);
    if (!chain) throw new UaError('NOT_FOUND', `No PRD for ${app} in this solution. prd list shows the apps that have one.`);
    let item;
    if (flags.version !== undefined) {
      const wanted = versionFlag(flags.version);
      item = chain.versions.find(entry => entry.version === wanted);
      if (!item) throw new UaError('NOT_FOUND', `${app} has no version ${wanted}. prd history ${app} lists them.`);
    } else {
      item = chain.current;
      const draft = chain.drafts.at(-1);
      if (!item) throw new UaError('NOT_FOUND', draft ? `${app} has no approved PRD yet. Draft v${draft.version} is open: prd get ${app} --version ${draft.version}.` : `${app} has no PRD version that passes its check. Run prd verify ${app}.`, { draft: draft?.version ?? null });
    }
    const failed = chain.tampered.filter(version => version !== item.version);
    const notes = [
      failed.length ? `v${failed.join(', v')} failed ${failed.length === 1 ? 'its' : 'their'} check; prd verify ${app} says what changed and how to restore.` : null,
      !item.intact ? `This version failed its check: ${issueText(item)}.` : null,
      chain.drafts.length && chain.drafts.at(-1) !== item ? `Draft v${chain.drafts.at(-1).version} is open.` : null,
    ].filter(Boolean);
    return { data: { app, ...describe(item), appId: item.meta.appId ?? null, tracker: item.meta.tracker ?? item.meta.atlas ?? null,
      current: chain.current?.version ?? null, draft: chain.drafts.at(-1)?.version ?? null, tampered: chain.tampered, missing: chain.missing,
      text: partText(item, flags.part) },
    message: [`PRD ${item.meta.title ?? app} v${item.version} (${item.status}).`, ...notes].join(' ') };
  }

  if (command === 'history') {
    const app = appArg(args[0]);
    await readFresh(ctx);
    const chain = chainFor(ctx, app);
    if (!chain) throw new UaError('NOT_FOUND', `No PRD for ${app} in this solution.`);
    return { data: { app, current: chain.current?.version ?? null, tampered: chain.tampered, missing: chain.missing, versions: chain.versions.map(describe) },
      message: `${chain.versions.length} ${chain.versions.length === 1 ? 'version' : 'versions'} of ${app}.` };
  }

  if (command === 'diff') {
    const app = appArg(args[0]);
    const from = versionFlag(args[1], 'The first version'), to = versionFlag(args[2], 'The second version');
    await readFresh(ctx);
    const chain = chainFor(ctx, app);
    const pick = version => chain?.versions.find(entry => entry.version === version)
      ?? (() => { throw new UaError('NOT_FOUND', `${app} has no version ${version}.`); })();
    const lines = diffLines(partText(pick(from), flags.part), partText(pick(to), flags.part));
    const added = lines.filter(line => line.startsWith('+')).length, removed = lines.filter(line => line.startsWith('-')).length;
    return { data: { app, from, to, part: flags.part ?? null, added, removed, lines }, message: `v${from} → v${to}: ${added} lines added, ${removed} removed.` };
  }

  if (command === 'verify') {
    const wanted = args[0] === undefined ? null : appArg(args[0]);
    if (!ctx.refreshed) await refreshCurrent(ctx);
    const chains = chainsOf(ctx).filter(item => !wanted || item.app === wanted);
    if (wanted && !chains.length) throw new UaError('NOT_FOUND', `No PRD for ${wanted} in this solution.`);
    const report = item => ({
      app: item.app, current: item.current?.version ?? null, newest: item.newestApproved?.version ?? null, missing: item.missing,
      tampered: item.versions.filter(entry => !entry.intact).map(entry => ({ version: entry.version, issues: entry.issues, lastModifiedBy: entry.lastModifiedBy, modifiedTime: entry.modifiedTime, backup: !!backupCopy(ctx, entry) })),
    });
    // Refused while the newest approved version, the one teammates read, fails its check. Once a
    // newer approved version passes (a restore, or the next change), an older failed version stays
    // in the history and is reported: an approved version is never rewritten, so it cannot be fixed.
    const failing = chains.filter(item => item.newestApproved && !item.newestApproved.intact).map(report);
    const earlier = chains.filter(item => !failing.some(other => other.app === item.app) && (item.tampered.length || item.missing.length)).map(report);
    if (failing.length) {
      const first = failing[0], bad = first.tampered[0];
      const lines = failing.map(item => [
        ...item.tampered.map(entry => `PRD ${item.app} v${entry.version}: ${issueText(entry)}.`),
        ...item.missing.map(version => `PRD ${item.app} v${version} is gone; a later version was based on it.`),
      ].join(' '));
      const restore = bad ? (bad.backup ? ` This folder's backup holds v${bad.version} as it was approved: prd restore ${first.app} --version ${bad.version}.`
        : first.current ? ` v${first.current} is the newest version that passes: prd restore ${first.app} --version ${first.current}.` : '') : '';
      throw new UaError('PRD_TAMPERED', `${lines.join(' ')}${restore}`, { apps: failing });
    }
    const notes = earlier.map(item => [
      item.tampered.length ? `PRD ${item.app} v${item.tampered.map(entry => entry.version).join(', v')} failed ${item.tampered.length === 1 ? 'its' : 'their'} check` : null,
      item.missing.length ? `PRD ${item.app} v${item.missing.join(', v')} ${item.missing.length === 1 ? 'is' : 'are'} gone` : null,
    ].filter(Boolean).join('; ') + `; v${item.current}, the current version, passes.`);
    return { data: { apps: chains.map(item => ({ app: item.app, versions: item.versions.length, current: item.current?.version ?? null, drafts: item.drafts.map(entry => entry.version) })), earlier },
      message: !chains.length ? 'This solution has no PRD.' : earlier.length ? `The current version of every PRD passes its check. ${notes.join(' ')}` : 'Every PRD version passes its check.' };
  }

  if (command === 'classify') {
    const app = appArg(args[0]);
    const text = readInput(ctx, flags.file, 'PRD file');
    await readFresh(ctx);
    const chain = chainFor(ctx, app);
    const base = flags.base === undefined ? chain?.newestApproved : chain?.versions.find(entry => entry.version === versionFlag(flags.base, '--base'));
    if (!base) {
      return { data: { app, base: null, level: 'new', changes: [] }, message: `${app} has no approved PRD to compare with: this is its first, which the person approves.` };
    }
    const change = classifyChange(renderPrd(base.meta, base.parts), text);
    const counts = level => change.changes.filter(entry => entry.level === level).length;
    return { data: { app, base: base.version, ...change },
      message: change.level === 'none' ? `No change from v${base.version}.`
        : `A ${change.level} change from v${base.version}: ${counts('major')} major, ${counts('minor')} minor.${change.level === 'major' ? ' The person approves it.' : ''}` };
  }

  if (command === 'save') {
    const app = appArg(args[0]);
    const text = readInput(ctx, flags.file, 'PRD file');
    const input = parsePrd(text);
    const baseValue = required(flags.base === undefined ? undefined : String(flags.base), '--base');
    const base = baseValue === 'new' ? null : versionFlag(baseValue, '--base');
    await refreshCurrent(ctx);
    const chain = chainFor(ctx, app);
    const newest = chain?.newestApproved?.version ?? null;
    if (base !== newest) {
      throw new UaError('PRD_BASE_MOVED', newest === null
        ? `${app} has no approved PRD yet. Save it with --base new.`
        : `PRD ${app} is at v${newest}, not ${base === null ? 'new' : `v${base}`}. Read it with prd get ${app}, put your change on top of it, and save with --base ${newest}.`, { app, base, latest: newest });
    }
    const drafts = chain?.drafts ?? [];
    if (drafts.length > 1) {
      throw new UaError('PRD_DRAFT_OPEN', `${drafts.length} drafts of ${app} are open: ${drafts.map(item => `v${item.version} by ${savedBy(item)}`).join(', ')}. Keep one: prd discard ${app} --version <n> --record-version <r>.`, { app, drafts: drafts.map(describe) });
    }
    const parts = { prd: input.parts.prd, plan: input.parts.plan, tickets: '' };
    const stamp = now(), by = who(ctx);
    const draft = drafts[0];
    let record;
    if (draft) {
      if (flags['record-version'] === undefined) {
        throw new UaError('USAGE', `Draft v${draft.version} of ${app} is open, saved by ${savedBy(draft)} at ${draft.meta.savedAt ?? draft.meta.createdAt ?? 'an unknown time'} (record version ${draft.recordVersion}). Read it with prd get ${app} --version ${draft.version}, then save with --record-version ${draft.recordVersion}.`);
      }
      record = await writeOver(ctx, draft.recordId, recordVersionFlag(flags['record-version']), (current) => {
        if (current.meta.status !== 'draft') throw new UaError('PRD_APPROVED_LOCKED', `v${draft.version} of ${app} is no longer a draft.`);
        return renderPrd({ ...current.meta, title: input.meta.title ?? current.meta.title,
          ...(input.meta.appId ? { appId: input.meta.appId } : {}), ...(trackerOf(input.meta) ? { tracker: trackerOf(input.meta) } : {}),
          note: flags.note ?? current.meta.note ?? null, savedBy: by, savedAt: stamp }, { ...parts, tickets: current.parts.tickets });
      });
    } else {
      if (flags['record-version'] !== undefined) {
        throw new UaError('VERSION_CONFLICT', `No draft of ${app} is open any more: it was approved or discarded. prd history ${app} shows which.`);
      }
      const previous = chain?.newestApproved?.meta;
      // The tickets filed so far carry to the next version, so a change made after a build keeps them.
      parts.tickets = chain?.newestApproved?.parts.tickets ?? '';
      const title = input.meta.title ?? previous?.title;
      if (!title) throw new UaError('USAGE', 'A first PRD needs its app name as title in the file\'s frontmatter: title: "Leave Management".');
      const meta = { nebula: 3, kind: 'prd', app, appId: input.meta.appId ?? previous?.appId ?? null, title, version: (chain?.latestVersion ?? 0) + 1,
        status: 'draft', basedOn: newest, restoredFrom: null, note: flags.note ?? null, author: by, createdAt: stamp, savedBy: by, savedAt: stamp,
        tracker: trackerOf(input.meta) ?? previous?.tracker ?? previous?.atlas ?? null };
      record = await ctx.service.create('solution_document', { solutionId: ctx.state.solutionId, document: renderPrd(meta, parts) });
    }
    stored(ctx, record);
    const saved = parsePrd(record.properties.document).meta;
    const report = checkPrd(text);
    return { data: { app, version: saved.version, status: 'draft', recordId: record.id, recordVersion: record.version, ready: report.ready, issues: report.issues.length },
      message: `Saved draft v${saved.version} of the ${saved.title} PRD. ${report.ready ? 'It passes its check.' : `${report.issues.length} ${report.issues.length === 1 ? 'issue remains' : 'issues remain'}, first: ${report.issues[0].message}`}` };
  }

  if (command === 'approve') {
    const app = appArg(args[0]);
    const version = versionFlag(flags.version);
    const expected = recordVersionFlag(flags['record-version']);
    await refreshCurrent(ctx);
    const chain = chainFor(ctx, app);
    const item = chain?.versions.find(entry => entry.version === version);
    if (!item) throw new UaError('NOT_FOUND', `${app} has no version ${version}.`);
    if (item.status === 'approved') throw new UaError('PRD_APPROVED_LOCKED', `v${version} of ${app} is already approved.`);
    if (item.status !== 'draft') throw new UaError('USAGE', `v${version} of ${app} was discarded; it cannot be approved.`);
    const previous = chain.newestApproved;
    if ((item.meta.basedOn ?? null) !== (previous?.version ?? null)) {
      throw new UaError('PRD_BASE_MOVED', `Draft v${version} was written on ${item.meta.basedOn ? `v${item.meta.basedOn}` : 'no earlier version'}, but v${previous.version} was approved since. Put the change on top of v${previous.version} in a new draft.`, { app, base: item.meta.basedOn ?? null, latest: previous?.version ?? null });
    }
    // --minor approves without the person's question, so it holds only for a change
    // classifyChange calls minor against the version the draft was written on.
    let change = null;
    if (flags.minor) {
      if (!previous) throw new UaError('USAGE', `v${version} is the first PRD of ${app}: the person approves it.`);
      change = classifyChange(renderPrd(previous.meta, previous.parts), renderPrd(item.meta, item.parts));
      if (change.level === 'major') {
        const major = change.changes.filter(entry => entry.level === 'major');
        throw new UaError('PRD_MAJOR_CHANGE', `Draft v${version} of ${app} is a major change, which the person approves: ${major.map(entry => entry.what).join('; ')}. Ask them, then approve without --minor.`, { app, version, changes: change.changes });
      }
    }
    const stamp = now(), by = who(ctx);
    const record = await writeOver(ctx, item.recordId, expected, (current) => {
      if (current.meta.status !== 'draft') throw new UaError('PRD_APPROVED_LOCKED', `v${version} of ${app} is no longer a draft.`);
      const meta = { ...current.meta, status: 'approved', approval: flags.minor ? 'minor' : 'person', approvedBy: by, approvedAt: stamp,
        prevSha: previous?.meta.sha ?? null, appId: flags['app-id'] ?? current.meta.appId ?? null };
      delete meta.sha; delete meta.ticketsSha; delete meta.ticketsFrom;
      const parts = current.parts;
      // Tickets carried from the version before are sealed too, and stay open to one `prd tickets`.
      if (canon(parts.tickets)) Object.assign(meta, { ticketsSha: ticketsSha(parts), ticketsFrom: previous?.version ?? null });
      return renderPrd({ ...meta, sha: prdSha(meta, parts) }, parts);
    });
    stored(ctx, record);
    const title = parsePrd(record.properties.document).meta.title;
    return { data: { app, version, status: 'approved', approval: flags.minor ? 'minor' : 'person', recordId: record.id, recordVersion: record.version, approvedBy: by, approvedAt: stamp,
      ...(change ? { changes: change.changes } : {}) },
      message: `Approved v${version} of the ${title} PRD${flags.minor ? ' as a minor update' : ''}.` };
  }

  if (command === 'tickets') {
    const app = appArg(args[0]);
    const version = versionFlag(flags.version);
    let input;
    try { input = JSON.parse(readInput(ctx, flags.file, 'Tickets file')); }
    catch (error) { if (error instanceof UaError) throw error; throw new UaError('USAGE', 'The tickets file must contain JSON.'); }
    const rows = ticketRows(input);
    await refreshCurrent(ctx);
    const item = chainFor(ctx, app)?.versions.find(entry => entry.version === version);
    if (!item) throw new UaError('NOT_FOUND', `${app} has no version ${version}.`);
    if (item.status !== 'approved') throw new UaError('USAGE', `v${version} of ${app} is a ${item.status}; tickets are recorded on an approved version.`);
    const open = meta => !meta.ticketsSha || (meta.ticketsFrom !== null && meta.ticketsFrom !== undefined);
    if (!open(item.meta)) throw new UaError('PRD_APPROVED_LOCKED', `The tickets of v${version} of ${app} are already recorded. Changed tickets belong to a new version.`);
    if (!item.intact) throw new UaError('PRD_TAMPERED', `v${version} of ${app} failed its check: ${issueText(item)}. Run prd verify ${app}.`);
    const appId = flags['app-id'];
    if (appId && item.meta.appId && item.meta.appId !== appId) throw new UaError('USAGE', `v${version} already names app ${item.meta.appId}.`);
    const stamp = now(), by = who(ctx);
    let count = 0;
    const record = await writeOver(ctx, item.recordId, item.recordVersion, (current) => {
      if (!open(current.meta)) throw new UaError('PRD_APPROVED_LOCKED', `The tickets of v${version} of ${app} are already recorded.`);
      const all = flags.add ? mergeTickets(parseTicketsPart(current.parts.tickets), rows) : rows;
      count = all.length;
      const parts = { ...current.parts, tickets: ticketsTable(all) };
      const meta = { ...current.meta, appId: current.meta.appId ?? appId ?? null, tracker: trackerOf(current.meta) ?? input.tracker ?? input.atlas ?? null,
        ticketsSha: ticketsSha(parts), ticketsAt: stamp, ticketsBy: by };
      delete meta.ticketsFrom;
      return renderPrd(meta, parts);
    });
    stored(ctx, record);
    return { data: { app, version, tickets: count, recordId: record.id, recordVersion: record.version },
      message: `Recorded ${count} ${count === 1 ? 'ticket' : 'tickets'} on v${version} of the ${app} PRD.` };
  }

  if (command === 'restore') {
    const app = appArg(args[0]);
    const version = versionFlag(flags.version);
    await refreshCurrent(ctx);
    const chain = chainFor(ctx, app);
    if (!chain) throw new UaError('NOT_FOUND', `No PRD for ${app} in this solution.`);
    if (chain.drafts.length) {
      const draft = chain.drafts.at(-1);
      throw new UaError('PRD_DRAFT_OPEN', `Draft v${draft.version} of ${app} is open, saved by ${savedBy(draft)}. Approve or discard it before restoring.`, { app, drafts: chain.drafts.map(describe) });
    }
    const source = chain.versions.find(entry => entry.version === version && entry.status === 'approved');
    if (!source) throw new UaError('NOT_FOUND', `${app} has no approved version ${version}.`);
    let parts = source.parts, fromBackup = false;
    if (!source.intact) {
      const copy = backupCopy(ctx, source);
      if (!copy) {
        throw new UaError('PRD_TAMPERED', `v${version} of ${app} failed its check (${issueText(source)}) and this folder holds no good copy of it.${chain.current ? ` Restore v${chain.current.version}, the newest version that passes: prd restore ${app} --version ${chain.current.version}.` : ''}`, { app, version });
      }
      parts = copy.parts; fromBackup = true;
    }
    const stamp = now(), by = who(ctx);
    const newest = chain.newestApproved;
    const meta = { nebula: 3, kind: 'prd', app, appId: newest.meta.appId ?? source.meta.appId ?? null, title: source.meta.title, version: chain.latestVersion + 1,
      status: 'draft', basedOn: newest.version, restoredFrom: version, note: flags.note ?? `Restored from v${version}.`, author: by, createdAt: stamp,
      savedBy: by, savedAt: stamp, tracker: trackerOf(source.meta) ?? trackerOf(newest.meta) ?? null };
    const record = stored(ctx, await ctx.service.create('solution_document', { solutionId: ctx.state.solutionId,
      document: renderPrd(meta, { prd: canon(parts.prd), plan: canon(parts.plan), tickets: newest.parts.tickets }) }));
    return { data: { app, version: meta.version, status: 'draft', restoredFrom: version, fromBackup, recordId: record.id, recordVersion: record.version },
      message: `Draft v${meta.version} of the ${meta.title} PRD holds v${version}${fromBackup ? ', from this folder\'s backup' : ''}. Approve it to make it current.` };
  }

  if (command === 'discard') {
    const app = appArg(args[0]);
    const version = versionFlag(flags.version);
    const expected = recordVersionFlag(flags['record-version']);
    await refreshCurrent(ctx);
    const item = chainFor(ctx, app)?.versions.find(entry => entry.version === version && entry.status === 'draft');
    if (!item) throw new UaError('NOT_FOUND', `${app} has no open draft v${version}.`);
    const stamp = now(), by = who(ctx);
    const record = await writeOver(ctx, item.recordId, expected, (current) => {
      if (current.meta.status !== 'draft') throw new UaError('PRD_APPROVED_LOCKED', `v${version} of ${app} is no longer a draft.`);
      return renderPrd({ ...current.meta, status: 'discarded', discardedBy: by, discardedAt: stamp }, current.parts);
    });
    stored(ctx, record);
    return { data: { app, version, status: 'discarded', recordId: record.id, recordVersion: record.version }, message: `Discarded draft v${version} of the ${app} PRD.` };
  }

  throw new UaError('USAGE', `Unknown prd command: ${command}.`);
}
