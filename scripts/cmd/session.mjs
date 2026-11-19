import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classificationLines, INITIAL_RESOLUTION, issueClassification, UaError } from '../lib/contracts.mjs';
import { executionActor, canonicalCwd, readRecord, sessionHome } from '../folder/local.mjs';
import { packTranscript, uploadedFileField, uploadFile as uploadToTenant } from '../transcript/transcript-archive.mjs';
import { transcriptStats } from '../transcript/transcript-stats.mjs';
import { fetchUserIdentity } from '../platform/user-context.mjs';

/** The plugin version that produced this session, so a report can be placed in a release. */
function pluginVersion() {
  const file = new URL('../../package.json', import.meta.url);
  try { return String(JSON.parse(fs.readFileSync(file, 'utf8')).version ?? ''); }
  catch { return ''; }
}

const required = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new UaError('USAGE', `${label} is required.`);
  return value.trim();
};

/** The plan an issue came from, so a fixer can read that plan instead of
 * guessing. Only what the caller names: an id inferred from the session would
 * attribute an issue to whatever plan happened to run last. */
function planIdOf(flags) {
  if (flags['plan-id'] === undefined) return undefined;
  const id = required(flags['plan-id'], 'Plan id');
  if (id.length > 200 || /[\r\n]/u.test(id)) throw new UaError('USAGE', 'A plan id is one line of at most 200 characters.');
  return id;
}

export function projectLogFolder(cwd, projectsRoot = path.join(os.homedir(), '.claude', 'projects')) {
  return path.join(projectsRoot, path.resolve(String(cwd ?? process.cwd())).replace(/\//gu, '-'));
}

function transcriptFile(ctx) {
  const folder = projectLogFolder(ctx.cwd, ctx.transcriptRoot);
  const preferred = path.join(folder, `${ctx.state.claudeSessionId}.jsonl`);
  try { if (fs.lstatSync(preferred).isFile()) return preferred; } catch { /* Try the exact hook path below. */ }
  return hookTranscriptFile(ctx) ?? envTranscriptFile(ctx);
}

/** `hooks.mjs`'s SessionStart exports this path into the session's own shell
 * environment the moment it starts, so a later Bash call in the same session —
 * this CLI command included — has it even when a session with no prior
 * plugin command has no checkpoint for `hookTranscriptFile` to read, and the
 * guessed project-log path above is wrong (seen on the desktop app). */
function envTranscriptFile(ctx) {
  if (process.env.CLAUDE_CODE_SESSION_ID !== String(ctx.state.claudeSessionId ?? '')) return null;
  const transcriptPath = process.env.UA_TRANSCRIPT_PATH;
  if (typeof transcriptPath !== 'string' || !path.isAbsolute(transcriptPath)) return null;
  try { return fs.lstatSync(transcriptPath).isFile() ? transcriptPath : null; }
  catch { return null; }
}

function hookTranscriptFile(ctx) {
  const sessionId = String(ctx.state.claudeSessionId ?? '');
  if (!/^[A-Za-z0-9_-]+$/u.test(sessionId)) return null;
  const metadataFile = path.join(sessionHome(ctx.home, ctx.sessionId), 'checkpoint.json');
  let metadata;
  try { metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8')); }
  catch { return null; }
  if (metadata?.claudeSessionId !== sessionId || canonicalCwd(metadata.cwd ?? '') !== canonicalCwd(ctx.cwd ?? '')) return null;
  const transcriptPath = metadata.transcriptPath;
  if (typeof transcriptPath !== 'string' || !path.isAbsolute(transcriptPath)) return null;
  try { return fs.lstatSync(transcriptPath).isFile() ? transcriptPath : null; }
  catch { return null; }
}

const REMARKS_MAX_LINES = 200;
const markdown = (raw, limit) => String(raw).replace(/\r\n?/gu, '\n').trimEnd().split('\n').slice(0, limit).join('\n');

/** The person's own words about the issue or request. Optional, and either
 * inline or in a file, because a long report is easier to write to a file. */
function remarksText(flags) {
  if (flags['remarks-file'] !== undefined) {
    const file = required(flags['remarks-file'], 'Remarks file');
    try { return markdown(fs.readFileSync(file, 'utf8'), REMARKS_MAX_LINES); }
    catch { throw new UaError('USAGE', 'Cannot read the remarks file.'); }
  }
  return flags.remarks === undefined ? '' : markdown(flags.remarks, REMARKS_MAX_LINES);
}

/** Pack this session's transcript with its subagents and upload the archive.
 * The record carries a file reference, never transcript text: a real session is
 * far larger than a column should hold. A failed upload is reported on the record
 * and the archive stays in the session folder, because this command exists to
 * carry bad news and must not fail with it. */
async function transcriptArchive(ctx, file) {
  if (!file) return { transcriptFound: false };
  const sessionId = path.basename(file, '.jsonl');
  let packed;
  try { packed = packTranscript(path.dirname(file), sessionId, sessionHome(ctx.home, ctx.sessionId)); }
  catch (error) { return { transcriptFound: true, packError: error.message || 'The transcript could not be packed.' }; }
  if (!packed) return { transcriptFound: false };
  const stats = transcriptStats(file);
  const { file: archive, name, format, bytes, sha256, files } = packed;
  const base = { transcriptFound: true, ...stats, archiveName: name, archiveFormat: format, archiveBytes: bytes, archiveSha256: sha256, archiveFiles: files.length };
  const upload = ctx.uploadFile ?? uploadToTenant;
  try {
    const reference = await upload(ctx.state.tenant, archive, name);
    fs.rmSync(archive, { force: true });
    const zip = format === 'zip';
    return { stats: { ...base, uploadedAt: new Date().toISOString() }, files,
      session: uploadedFileField(reference, { name, bytes, fileType: zip ? 'zip' : 'gz', mimeType: zip ? 'application/zip' : 'application/gzip' }) };
  } catch (error) {
    return { stats: { ...base, uploadError: error.message || 'The archive could not be uploaded.' }, files, localPath: archive };
  }
}

/** The person this session belongs to, for the stats. The solution open saved it;
 * only a session opened before that saved nothing pays for the extra read. */
async function signedInPerson(ctx) {
  if (ctx.state.userEmail) return { email: ctx.state.userEmail, ...(ctx.state.userId ? { userId: ctx.state.userId } : {}) };
  const identity = await (ctx.identity ?? fetchUserIdentity)(ctx.state.tenant);
  return identity?.email ? { email: identity.email, ...(identity.userId ? { userId: identity.userId } : {}) } : {};
}

export async function run(command, args = [], flags = {}, ctx = {}) {
  if (command !== 'save') throw new UaError('USAGE', `Unknown session command: ${command}.`);
  const type = required(flags.type, 'Session type');
  // One report is one issue, so it carries one family. Checked before the
  // transcript is packed: an unclassified report must cost nothing.
  const { family, suggestedFamily } = issueClassification({ family: flags.family, suggestedFamily: flags['suggested-family'] });
  const planId = planIdOf(flags);
  // The nebula_session type declares no column for any of these, and a key it
  // does not declare is dropped with a created answer, so they go in the
  // remarks as labelled lines instead. Composed here, from the checked flags,
  // so the one place that validates a family is also the one that writes it:
  // a skill formatting its own line could drift from the list in code.
  // The caller's own text, checked for emptiness BEFORE the labelled lines are
  // added: composing first would make every report non-empty and a self report
  // with nothing in it would save instead of being refused.
  const body = remarksText(flags);
  const remarksOnly = flags['remarks-only'] === true;
  // --remarks-file or --remarks asked for the person's own words; an empty or
  // unwritten file, or an empty string, saves silently with none of them,
  // losing the whole report. Checked whether or not --remarks-only is also
  // set, since that flag only changes whether the transcript is packed too.
  const remarksRequested = flags['remarks-file'] !== undefined || flags.remarks !== undefined;
  if (remarksRequested && !body.trim()) {
    throw new UaError('USAGE', flags['remarks-file'] !== undefined
      ? 'The remarks file named by --remarks-file is empty or could not be read as text. Write the remarks to it first, or drop --remarks-file.'
      : '--remarks is empty. Pass real remarks text, or drop --remarks.');
  }
  if (remarksOnly && !body.trim()) throw new UaError('USAGE', 'Remarks are required with --remarks-only.');
  const remarks = [classificationLines({ family, suggestedFamily, planId }), body].filter(Boolean).join('\n');
  const cached = readRecord(ctx.home, 'solution');
  if (!cached || cached.id !== ctx.state?.solutionId || cached.entityType !== 'e_solution') throw new UaError('NOT_STARTED');
  executionActor();
  const archive = remarksOnly ? {} : await transcriptArchive(ctx, transcriptFile(ctx));
  // The stats name the tenant and the signed-in person, because numeric user ids
  // do not carry across tenants. The email is read once when the solution is opened;
  // a session opened by an older version has none saved, so it is read here instead.
  // A remarks-only self report reads no transcript, so this is all its stats hold.
  const who = await signedInPerson(ctx);
  const stats = { ...(remarksOnly ? {} : archive.stats ?? archive), tenant: ctx.state.tenant, ...who };
  const properties = {
    solutionId: ctx.state.solutionId,
    type,
    // Written once, here. The daily fixer moves it; nothing in the plugin does.
    resolutionStatus: INITIAL_RESOLUTION,
    ...(remarks ? { remarks } : {}),
    pluginVersion: pluginVersion(),
    // A session saved before the mode dialog has none; an invented one would lie.
    ...(ctx.state.mode ? { mode: ctx.state.mode } : {}),
    agentSessionId: ctx.state.claudeSessionId,
    ...(archive.session ? { session: archive.session } : {}),
    ...(stats ? { transcriptStats: stats } : {}),
  };
  const record = await ctx.service.create('nebula_session', properties);
  if (record.entityType !== 'nebula_session' || record.properties?.solutionId !== ctx.state.solutionId) {
    throw new UaError('NOT_FOUND', 'The session was not saved on this solution.');
  }
  // A tenant whose nebula_session type does not declare this key drops it and
  // still answers created. The report is saved either way, so this does not
  // fail, but it is named: a status that silently went missing would leave a
  // report the fixer cannot queue, and nobody would know why.
  const notStored = ['resolutionStatus']
    .filter((key) => properties[key] !== undefined && record.properties?.[key] === undefined);
  const sessionUrl = `https://${ctx.state.tenant}/p/0/solutions/${ctx.state.solutionId}/nebula-session/${record.id}`;
  return { data: { sessionId: record.id, sessionUrl, type, family, ...(suggestedFamily ? { suggestedFamily } : {}),
    ...(planId ? { planId } : {}), ...(notStored.length ? { fieldsNotStored: notStored } : {}),
    ...(remarks ? { remarksLines: remarks.split('\n').length } : {}),
    ...(remarksOnly ? { remarksOnly: true } : {
      transcriptFound: !!stats.transcriptFound, transcriptUploaded: !!archive.session,
      transcriptFiles: archive.files ?? [],
      ...(archive.localPath ? { transcriptArchivePath: archive.localPath } : {}),
      ...(stats.uploadError ? { transcriptUploadError: stats.uploadError } : {}),
    }) },
    message: 'Saved. Share it with the UnifyApps Headless developers if something went wrong.' };
}
