/**
 * Keeps `.claude/skills/` in step with the skills linked straight to the
 * solution, so a session opened in this folder can load one with the Skill
 * tool the same way it loads a builder's own skills here, or the person can
 * type it: each one is written user-invocable and shows in the `/` menu.
 */
import fs from 'node:fs';
import path from 'node:path';
import { makeApi, makeDownload } from '../platform/ua-tenant.mjs';
import { SKILL_ENTITY, syncLinkedSkills } from '../platform/skills.mjs';

export const CLAUDE_SKILLS_DIR = '.claude/skills';

/** The ids of the solution's `solution_linked_assets` rows whose `asset_class` is a skill, not removed. */
export function linkedSkillIds(assets = []) {
  return assets
    .filter((record) => record?.properties?.asset_class === SKILL_ENTITY && record.properties.state !== 'REMOVED')
    .map((record) => record.properties.asset_id)
    .filter(Boolean);
}

/**
 * Fetches those skills into `<cwd>/.claude/skills/` and removes any folder a
 * solution-link sync wrote that is no longer linked.
 *
 * Never runs under `UA_FAKE=1` or with no tenant: `readSkill` is a direct
 * tenant REST read, outside the MCP bridge, with no fake tenant of its own —
 * `mcp-bridge.mjs` refuses the same kind of call for the same reason. A local
 * solution has no platform skill entities to fetch either.
 *
 * Never throws: this runs on every solution open and most other commands
 * through `refreshCurrentIfStale`, and a skill sync is not something a sign-in
 * problem or an unreachable tenant should be allowed to fail those on. A
 * failure here is reported the same as a skill `readSkill` itself could not read.
 */
export async function syncSolutionSkills({ cwd, tenant, solutionId, assets = [] } = {}) {
  const skillIds = linkedSkillIds(assets);
  const empty = { written: [], removed: [], flagged: [], failed: [] };
  if (process.env.UA_FAKE === '1' || !tenant) return empty;
  try {
    const root = path.join(cwd, CLAUDE_SKILLS_DIR);
    fs.mkdirSync(root, { recursive: true });
    const api = makeApi({ tenant });
    const download = makeDownload({ tenant });
    return await syncLinkedSkills(root, { api, download }, { solutionId, skillIds, tenant });
  } catch (error) {
    return { ...empty, failed: skillIds.map((skillId) => ({ skillId, error: error?.message ?? String(error) })) };
  }
}
