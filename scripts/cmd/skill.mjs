// `skill sessions`: the Claude Code sessions /ua:identify-loops reads, each as
// its raw transcript and a digest. `skill publish`: a skill folder written to
// the tenant as one skill entity with its files, and linked to the solution.
import fs from 'node:fs';
import path from 'node:path';
import { UaError } from '../lib/contracts.mjs';
import { assertLocalPath, atomicFile, sessionIdPattern } from '../lib/session-paths.mjs';
import { sessionHome } from '../workspace/local.mjs';
import { readSkillFolder } from '../workspace/skill-folder.mjs';
import { linkEntityRefs } from '../workspace/entity-cache.mjs';
import { projectsRoot, sessionDigest } from '../transcript/session-digest.mjs';
import { SKILL_ENTITY, publishSkill } from '../platform/skills.mjs';
import { makeApi, makeDownload } from '../platform/ua-tenant.mjs';
import { callTenantTool } from '../platform/tenant-mcp.mjs';

const SESSIONS_MAX = 5;

/** The transcript file for a session id, or a .jsonl path the person gave. */
export function transcriptFor(token, { root = projectsRoot() } = {}) {
  const text = String(token ?? '').trim();
  if (text.endsWith('.jsonl')) {
    const file = path.resolve(text);
    if (!fs.existsSync(file)) throw new UaError('USAGE', `No transcript at ${file}.`);
    return { id: path.basename(file, '.jsonl'), file };
  }
  if (!sessionIdPattern.test(text)) throw new UaError('USAGE', `Not a session id or a .jsonl file: ${JSON.stringify(text)}.`);
  const dirs = fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()) : [];
  for (const dir of dirs) {
    const file = path.join(root, dir.name, `${text}.jsonl`);
    if (fs.existsSync(file)) return { id: text, file };
  }
  throw new UaError('USAGE', `No transcript for session ${text} under ${root}. Give the .jsonl file instead.`);
}

function sessions(args, ctx) {
  const tokens = args.length ? args : [ctx.sessionId];
  if (tokens.length > SESSIONS_MAX) throw new UaError('USAGE', `Give at most ${SESSIONS_MAX} sessions at once.`);
  const out = path.join(sessionHome(ctx.home, ctx.sessionId), 'identify-loops');
  const found = tokens.map((token) => {
    const { id, file } = transcriptFor(token, { root: ctx.projectsRoot });
    const { text, numbers } = sessionDigest(file);
    const digest = assertLocalPath(path.join(out, `${id}.md`), ctx.home);
    atomicFile(digest, text);
    return { id, transcript: file, digest, current: id === ctx.sessionId, prompts: numbers.prompts, toolCalls: numbers.toolCalls, minutes: numbers.minutes };
  });
  return {
    data: { sessions: found },
    message: `Read ${found.length} session${found.length === 1 ? '' : 's'}: ${found.map((one) => `${one.id} (${one.prompts} prompts, ${one.toolCalls} tool calls)`).join(', ')}.`,
  };
}

/** The skill linked to this solution under `name`, as `{ id, version }`, or null. */
async function linkedSkillNamed(ctx, api, name) {
  const rows = await ctx.service.search('solution_linked_assets', 'solution_id', ctx.state.solutionId);
  const ids = rows.filter((row) => row?.properties?.asset_class === SKILL_ENTITY && row.properties.state !== 'REMOVED').map((row) => row.properties.asset_id);
  for (const id of new Set(ids)) {
    const skill = await api(`/api/entity/${SKILL_ENTITY}/${id}`);
    if (skill.ok && skill.body?.properties?.name?.trim() === name) return { id, version: skill.body.version };
  }
  return null;
}

async function publish(flags, ctx) {
  if (!flags.folder) throw new UaError('USAGE', '--folder <skill folder> is required.');
  if (ctx.state.storage === 'local') throw new UaError('USAGE', 'This solution keeps its records in this folder, so it has no skills on the tenant. Open a solution stored on the platform to publish a skill to it.');
  const folder = readSkillFolder(path.resolve(flags.folder));
  const tenant = { tenant: ctx.state.tenant };
  const api = ctx.api ?? makeApi(tenant);
  const download = ctx.download ?? makeDownload(tenant);
  const callTool = ctx.callTool ?? ((name, args) => callTenantTool({
    host: ctx.state.tenant, route: '/mcp/agent-builder', name, args,
    sessionId: ctx.sessionId, solutionId: ctx.state.solutionId, home: ctx.home, cwd: ctx.cwd, answerRefusals: true,
  }));
  let existing = null;
  if (flags['skill-id']) {
    const skill = await api(`/api/entity/${SKILL_ENTITY}/${flags['skill-id']}`);
    if (!skill.ok) throw new UaError('NOT_FOUND', `No skill ${flags['skill-id']} on ${ctx.state.tenant}.`, { id: flags['skill-id'] });
    existing = { id: skill.body.id, version: skill.body.version };
  } else {
    existing = await linkedSkillNamed(ctx, api, folder.name);
    // Someone else's loop may hold the name; replacing it is the person's call.
    if (existing && !flags.replace) {
      throw new UaError('SKILL_EXISTS', `A skill named ${folder.name} is already linked to this solution (${existing.id}, version ${existing.version}). Ask the person whether to replace it, then run again with --replace, or rename the skill.`, { id: existing.id, version: existing.version });
    }
  }
  const result = await publishSkill({ callTool, api, download }, folder, { existing });
  if (!result.ok) throw new UaError('SKILL_PUBLISH_FAILED', `Could not publish ${folder.name}: ${result.error}.`, { id: result.id ?? null });
  await linkEntityRefs(ctx, [{ kind: 'skill', id: result.id }]);
  return {
    data: { skill: { ...result, tenant: ctx.state.tenant, solutionId: ctx.state.solutionId, linked: true } },
    message: `${result.created ? 'Published' : 'Updated'} skill ${result.name} (${result.id}, version ${result.version}) with ${result.files.length} file${result.files.length === 1 ? '' : 's'}, read back and linked to the solution. Run solution refresh to load it here as /${result.name}.`,
  };
}

export async function run(command, args = [], flags = {}, ctx) {
  if (!ctx?.service || !ctx.home || !ctx.state?.solutionId) throw new UaError('NOT_STARTED');
  if (command === 'sessions') return sessions(args, ctx);
  if (command === 'publish') return publish(flags, ctx);
  throw new UaError('USAGE', `Unknown skill command ${command}.`);
}
