import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_MODE, UaError, SPEC_FORMATS, parseSpecBody, slug, specFormat, validateSpecHtml } from '../lib/contracts.mjs';
import { parseFrontmatter, renderFrontmatter } from '../lib/formats.mjs';
import { executionActor, readRecord, readRecords, cacheRecords, renderSpec, writeDraft, readDraft, draftSlugs, removeDraft, readAcceptanceReceipt, writeAcceptanceReceipt, clearAcceptanceReceipt, sessionHome, writeState } from '../workspace/local.mjs';
import { loadSpecHtmlAssets, renderSpecHtml, validateSpecHtmlFormat } from '../lib/spec-html.mjs';
import { refreshCurrent, refreshCurrentIfStale } from '../workspace/solution-sync.mjs';

const required = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new UaError('USAGE', `${name} is required.`);
  return value.trim();
};
const readFile = (name, label) => {
  const file = required(name, label);
  try { return fs.readFileSync(file, 'utf8'); }
  catch { throw new UaError('USAGE', `Cannot read ${label.toLowerCase()}.`); }
};
// The page's look and its one script ship with the plugin; the safety check allows that script and no other.
const SPEC_ASSETS = loadSpecHtmlAssets();
const htmlProblem = html => validateSpecHtml(html, { allowedScripts: [SPEC_ASSETS.js] }) ?? validateSpecHtmlFormat(html, { assets: SPEC_ASSETS });
// The visual page is optional and made only when asked for (--html). The CLI renders it from the
// Markdown and checks its own output, so a renderer fault never reaches a browser or the platform.
// `status` is the line in the page's top bar.
const finalHtml = (md, status) => {
  const html = renderSpecHtml(md, { status, assets: SPEC_ASSETS });
  const problem = htmlProblem(html);
  if (problem) throw new UaError('INVALID_SPEC', problem);
  return html;
};
const ownSolution = ctx => {
  const record = readRecord(ctx.home, 'solution');
  if (!record || record.id !== ctx.state?.solutionId || record.entityType !== 'e_solution') throw new UaError('NOT_STARTED');
  return record;
};
const ownSpec = (record, ctx) => {
  if (!record || record.entityType !== 'solution_spec' || record.properties?.solutionId !== ctx.state?.solutionId) {
    throw new UaError('NOT_FOUND', 'That spec is outside this solution.');
  }
  return record;
};
const specData = record => {
  const { meta, body } = parseFrontmatter(record.properties.spec_md);
  return { specId: record.id, meta, body, specHtml: record.properties.spec_html };
};

function sameAcceptedSpec(record, receipt) {
  return record?.entityType === 'solution_spec' && record.properties?.solutionId === receipt.solutionId &&
    record.properties?.spec_md === receipt.specMd && record.properties?.spec_html === receipt.specHtml;
}

async function recoverAcceptedSpec(service, receipt) {
  if (receipt.specId) {
    try {
      const record = await service.get('solution_spec', receipt.specId);
      if (!sameAcceptedSpec(record, receipt)) throw new UaError('INVALID_SPEC', 'The accepted spec receipt points to different content.');
      return record;
    } catch (error) {
      if (error?.code !== 'NOT_FOUND') throw error;
    }
  }
  const records = await service.search('solution_spec', 'solutionId', receipt.solutionId);
  return records.find(record => sameAcceptedSpec(record, receipt)) ?? null;
}

function openHtml(file) {
  if (process.env.UA_FAKE === '1') return false;
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
  const result = spawnSync(command, [file], { stdio: 'ignore', timeout: 5000, shell: false });
  return !result.error && result.status === 0;
}

// A draft or record marked `mode: sonic` with no format is the old brief format.
const briefFormat = md => { try { return specFormat(parseFrontmatter(md).meta) === SPEC_FORMATS.BRIEF; } catch { return false; } };
const OLD_BRIEF = 'This Markdown is marked mode: sonic, the old brief format. Write it with the spec headings (## Requested outcome, ## Touches, ## Contract, ## Ready when) and no mode in its frontmatter.';

/** `--execution plan`, a `fast accept` flag only. A brief is always followed by a plan, so `plan` is the one value. */
function executionChoice(flags) {
  if (flags.execution === undefined) return null;
  if (flags.execution !== 'plan') throw new UaError('USAGE', 'Use --execution plan, or leave --execution out: a brief is always followed by a plan.');
  return flags.execution;
}

export async function run(command, args = [], flags = {}, ctx = {}) {
  if (command === 'check') {
    const md = readFile(path.resolve(ctx.cwd ?? process.cwd(), required(flags['md-file'], 'Markdown file')), 'Markdown file');
    let report;
    try {
      const parsed = parseSpecBody(parseFrontmatter(md).body, { checkPageDesign: true });
      report = { ready: true, issues: [], warnings: parsed.warnings, requirements: parsed.requirements };
    } catch (error) {
      // A structural problem (raw HTML, a page-design gap, a bad Ready when
      // line) can throw AFTER the requirements checklist is already computed;
      // `parseSpecBody` attaches that result to the error rather than losing
      // it, so a caller still sees "the checklist was 12/12" alongside the
      // unrelated issue that blocks accept.
      report = { ready: false, issues: [{ id: 'spec', message: error.message }], warnings: [], requirements: error.requirements ?? null };
    }
    const checklistNote = report.requirements ? ` The requirements checklist was ${report.requirements.completed} of ${report.requirements.total} complete.` : '';
    return { data: report, message: !report.ready ? `The spec cannot be accepted yet: ${report.issues[0].message}${checklistNote}`
      : report.warnings.length ? `The spec can be accepted, with ${report.warnings.length} ${report.warnings.length === 1 ? 'warning' : 'warnings'}: ${report.warnings[0]}`
      : 'The spec can be accepted.', exitCode: report.ready ? 0 : 1 };
  }
  if (command === 'render') {
    // A local preview of the visual page while the Markdown is still a working file. No session, no platform.
    const base = ctx.cwd ?? process.cwd();
    const mdFile = path.resolve(base, required(flags['md-file'], 'Markdown file'));
    const md = readFile(mdFile, 'Markdown file');
    parseSpecBody(parseFrontmatter(md).body, { checkPageDesign: true, requireContract: true });
    const out = path.resolve(base, flags.out ? required(flags.out, 'Output file') : `${mdFile.replace(/\.md$/u, '')}.html`);
    const html = renderSpecHtml(md, { status: 'draft', assets: SPEC_ASSETS });
    const problem = htmlProblem(html);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
    return { data: { out, valid: !problem, problem: problem ?? null }, message: problem ? `Rendered ${out}, but the page fails its own check: ${problem}` : `Rendered ${out}.`, exitCode: problem ? 1 : 0 };
  }
  if (command === 'draft') {
    const title = required(flags.title, 'Title');
    const draftSlug = slug(title);
    const draftFolder = path.join(sessionHome(ctx.home, ctx.sessionId), 'drafts');
    const mdPath = path.join(draftFolder, `_draft-${draftSlug}.md`);
    // fast brief is the same draft as spec draft: new text has one format, the spec headings.
    const md = readFile(flags['md-file'], 'Markdown file');
    if (briefFormat(md)) throw new UaError('USAGE', OLD_BRIEF);
    const { warnings } = parseSpecBody(parseFrontmatter(md).body, { checkPageDesign: true, requireContract: flags.html === true });
    const html = flags.html === true ? finalHtml(md, 'draft') : '';
    writeDraft(ctx.home, draftSlug, { md, html }, ctx.sessionId);
    if (!html) return { data: { slug: draftSlug, mdPath, htmlPath: null, opened: false, warnings }, message: `Final spec for ${title} saved as a draft.` };
    const htmlPath = path.join(draftFolder, `_draft-${draftSlug}.html`);
    const opened = openHtml(htmlPath);
    return { data: { slug: draftSlug, mdPath, htmlPath, opened, warnings }, message: `Final spec for ${title} saved as a draft.` };
  }
  if (command === 'accept') {
    const draftSlug = required(flags.draft, 'Draft slug');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(draftSlug)) throw new UaError('USAGE', 'Invalid draft slug.');
    ownSolution(ctx);
    if (!ctx.refreshed) await refreshCurrentIfStale(ctx);
    const acceptedBy = ctx.actor ?? executionActor();
    let receipt = readAcceptanceReceipt(ctx.home, draftSlug, ctx.sessionId);
    const draft = readDraft(ctx.home, draftSlug, ctx.sessionId);
    if (!receipt && draft.md === null) {
      // Name the slug looked for and the drafts there are: spec draft makes the slug from the title and may shorten it.
      const found = draftSlugs(ctx.home, ctx.sessionId);
      throw new UaError('USAGE', `No draft named ${draftSlug} in this session. ` +
        (found.length ? `Drafts here: ${found.join(', ')}. Use the slug spec draft answered.` : 'This session has no drafts; run spec draft first.'));
    }
    const md = draft.md ?? receipt?.draftMd;
    if (typeof md !== 'string') throw new UaError('INVALID_SPEC', 'The unfinished acceptance receipt is incomplete.');
    // A draft made with --html gets its page again, rendered from the Markdown being accepted:
    // the draft's page file is never read, so a page edited by hand changes nothing.
    const wantsPage = !!(draft.html ?? receipt?.specHtml);
    // spec accept and fast accept are one path; only an unfinished draft from
    // before one format can still be an old brief.
    const format = briefFormat(md) ? SPEC_FORMATS.BRIEF : SPEC_FORMATS.SPEC;
    const mode = format === SPEC_FORMATS.BRIEF ? 'sonic' : ctx.state?.mode ?? DEFAULT_MODE;
    const withPage = format !== SPEC_FORMATS.BRIEF && wantsPage;
    const body = parseFrontmatter(md).body;
    const parsed = parseSpecBody(body, { format, checkPageDesign: true, requireContract: withPage });
    const html = withPage ? finalHtml(md, 'accepted') : '';
    if (flags['ask-before-deploy'] && flags['no-ask-before-deploy']) throw new UaError('USAGE', 'Use --ask-before-deploy or --no-ask-before-deploy, not both.');
    // A release goes without asking only when the person's yes covered it: the
    // Ready when lines plan propose showed by name (releaseYes), or every one with
    // --no-ask-before-deploy. An old brief draft keeps the Sonic default it was written under.
    const releaseYes = flags['ask-before-deploy'] === true ? null : ctx.releaseYes ?? receipt?.releaseYes ?? null;
    const askBeforeDeploy = flags['no-ask-before-deploy'] === true ? false
      : flags['ask-before-deploy'] === true ? true : receipt?.askBeforeDeploy ?? format !== SPEC_FORMATS.BRIEF;
    const derivedFromSpecId = flags['derived-from'] ? required(flags['derived-from'], 'Source spec ID') : receipt?.derivedFromSpecId ?? null;
    if (derivedFromSpecId) ownSpec(await ctx.service.get('solution_spec', derivedFromSpecId), ctx);
    const execution = executionChoice(flags);
    const service = ctx.service;
    if (receipt) {
      let savedBody;
      try { savedBody = parseFrontmatter(receipt.specMd).body; } catch { savedBody = null; }
      const matchesReceipt = receipt.solutionId === ctx.state.solutionId && receipt.slug === draftSlug && savedBody === body &&
          receipt.draftMd === md && receipt.specHtml === html &&
          receipt.askBeforeDeploy === askBeforeDeploy && JSON.stringify(receipt.releaseYes ?? null) === JSON.stringify(releaseYes) &&
          (receipt.derivedFromSpecId ?? null) === derivedFromSpecId && !!receipt.acceptedAt;
      if (!matchesReceipt) {
        // The receipt on disk no longer matches what is being accepted now (a later
        // spec draft, or a retry with a different --ask-before-deploy). Find out
        // whether that earlier receipt ever reached the platform before deciding
        // what to do with it: an already-created spec must not be silently retried
        // under a different id, but a receipt that never reached the platform is
        // not owed anything and must not block the changed draft forever.
        const created = await recoverAcceptedSpec(service, receipt);
        if (created) {
          throw new UaError('INVALID_SPEC',
            `An earlier draft of this slug was already accepted as spec ${created.id}. Accept the new draft with --derived-from ${created.id}.`);
        }
        clearAcceptanceReceipt(ctx.home, draftSlug, ctx.sessionId);
        receipt = null;
      }
    }
    if (!receipt) {
      const acceptedAt = new Date().toISOString();
      const meta = { nebula: 3, mode, format, title: parsed.title, touches: parsed.touches, askBeforeDeploy,
        ...(releaseYes ? { releaseYes } : {}), acceptedAt, acceptedBy, ...(derivedFromSpecId ? { derivedFromSpecId } : {}) };
      receipt = { solutionId: ctx.state.solutionId, slug: draftSlug, draftMd: md,
        specMd: renderFrontmatter(meta, body), specHtml: html,
        askBeforeDeploy, ...(releaseYes ? { releaseYes } : {}), acceptedAt, ...(derivedFromSpecId ? { derivedFromSpecId } : {}) };
      writeAcceptanceReceipt(ctx.home, draftSlug, receipt, ctx.sessionId);
    }
    let record = await recoverAcceptedSpec(service, receipt);
    if (!record) {
      // A create response may be lost after the server commits. The receipt
      // survives that failure and the next invocation searches exact content.
      record = await service.create('solution_spec', { solutionId: ctx.state.solutionId,
        spec_md: receipt.specMd, spec_html: receipt.specHtml }, { retry: false });
    }
    ownSpec(record, ctx);
    receipt = writeAcceptanceReceipt(ctx.home, draftSlug, { ...receipt, specId: record.id }, ctx.sessionId);
    cacheRecords(ctx.home, { specs: [record] });
    const cached = readRecord(ctx.home, 'solution');
    let updatedSolution = cached;
    if (!cached.properties?.description) {
      updatedSolution = await service.readMergeWrite('e_solution', ctx.state.solutionId, (properties, current) => {
        if (current.id !== ctx.state.solutionId) throw new UaError('NOT_STARTED');
        return properties.description ? {} : { description: parsed.requestedOutcome };
      });
      if (updatedSolution.id !== ctx.state.solutionId) throw new UaError('NOT_STARTED');
    }
    cacheRecords(ctx.home, { solution: updatedSolution });
    renderSpec(ctx.home, record);
    removeDraft(ctx.home, draftSlug, ctx.sessionId);
    clearAcceptanceReceipt(ctx.home, draftSlug, ctx.sessionId);
    if (execution) writeState(ctx.home, { execution }, ctx.sessionId);
    const stored = parseFrontmatter(receipt.specMd).meta;
    return { data: { specId: record.id, mode: stored.mode, format: specFormat(stored), title: parsed.title, touches: parsed.touches, askBeforeDeploy,
      releaseYes, derivedFromSpecId, execution }, message: `Spec accepted for ${parsed.title}.` };
  }
  if (command === 'revise') {
    const specId = required(args[0], 'Spec ID');
    ownSolution(ctx);
    const md = readFile(flags['md-file'], 'Markdown file');
    if (briefFormat(md)) throw new UaError('USAGE', OLD_BRIEF);
    const body = parseFrontmatter(md).body;
    const parsed = parseSpecBody(body, { checkPageDesign: true, requireContract: flags.html === true });
    const html = flags.html === true ? finalHtml(md, 'revised') : '';
    const note = required(flags.note, 'Revision note');
    await refreshCurrent(ctx);
    const revisedAt = new Date().toISOString();
    const updated = await ctx.service.readMergeWrite('solution_spec', specId, (properties, current) => {
      ownSpec(current, ctx);
      const previous = parseFrontmatter(properties.spec_md).meta;
      if (previous.nebula !== 3 || !previous.acceptedAt || !previous.acceptedBy) throw new UaError('INVALID_SPEC', 'Only an accepted UnifyApps Headless spec can be revised.');
      if (specFormat(previous) === SPEC_FORMATS.BRIEF) throw new UaError('USAGE', 'An old short brief is not revised. Accept a new spec with --derived-from.');
      const meta = { ...previous, title: parsed.title, touches: parsed.touches, revisedAt, revisionNote: note };
      return { spec_md: renderFrontmatter(meta, body), spec_html: html };
    });
    ownSpec(updated, ctx);
    cacheRecords(ctx.home, { specs: [updated] }); renderSpec(ctx.home, updated);
    return { data: specData(updated), message: `Technical spec revised for ${parsed.title}.` };
  }
  if (command === 'get') {
    const specId = required(args[0], 'Spec ID');
    const record = ownSpec(await ctx.service.get('solution_spec', specId), ctx);
    cacheRecords(ctx.home, { specs: [record] });
    const rendered = renderSpec(ctx.home, record);
    return { data: specData(record), message: rendered?.htmlSkipped ? `Spec ${specId}. Its page was not written to the folder: ${rendered.htmlSkipped}` : `Spec ${specId}.` };
  }
  if (command === 'list') {
    const data = readRecords(ctx.home, 'spec').filter(record => record.properties?.solutionId === ctx.state?.solutionId)
      .flatMap(record => { try { return [specData(record)]; } catch { return []; } });
    return { data, message: `${data.length} specs.` };
  }
  throw new UaError('USAGE', `Unknown spec command: ${command}.`);
}
