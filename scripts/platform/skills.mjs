// Platform skills: read one from a tenant, and write it into a folder.
//
// A skill on the platform is two entities. `e_skill_ai_agent` holds the
// SKILL.md and nothing else; its tools are separate `e_action_ai_agent` rows
// that point back with `properties.skillId`. The skill carries no tool ids —
// the platform's own editor queries for them the same way this does.
//
// Two callers share this. The build runs it so a release ships the folder;
// `scripts/skills-cli.mjs skill fetch` runs it on a user's machine so a skill
// can be refreshed without a release.
//
// Nothing about an input or output SCHEMA is written here. A wrapped tool's
// input schema is the automation's trigger (`/api/workflow-definition/<id>`,
// the START node's `inputs.setup`) and a direct tool's is the platform
// action's own. Both are read when needed, which is what keeps them current.
import fs from "node:fs";
import path from "node:path";
import { scanFetchedSkill } from "../lib/skill-scan.mjs";

export const SKILL_ENTITY = "e_skill_ai_agent";
export const TOOL_ENTITY = "e_action_ai_agent";
// An agent is type `ai_agent` — NOT `e_ai_agent`, which does not exist and
// answers HTTP 500 "ENTITY_TYPE with id e_ai_agent not found".
export const AGENT_ENTITY = "ai_agent";

/** `Read Object` → `read-object`, the tool's filename. */
export const toolFileName = (name) =>
  String(name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tool";

// Does this tool change anything? Decided once, here, from the first word of
// its name, and written into the file where a person can read and correct it —
// rather than recomputed by a pattern match on every call. Across the 26 tools
// of storage-object-manager this splits 14 writes and 12 reads with nothing
// left over, and `Export records` lands correctly on the read side.
// An unknown verb counts as a write, so a tool nobody classified is refused
// rather than run.
const WRITE_VERBS = new Set(["create", "update", "delete", "import", "share", "add", "remove", "set"]);
const READ_VERBS = new Set(["read", "get", "fetch", "export", "ask", "list", "search", "find", "count"]);
export const isWriteTool = (name, readTools = []) => {
  const clean = String(name ?? "").trim().toLowerCase();
  if (readTools.some((n) => String(n).trim().toLowerCase() === clean)) return false;
  const first = clean.split(/\s+/)[0] ?? "";
  if (READ_VERBS.has(first)) return false;
  return true;   // write verbs, and anything unrecognised
};

/** What a skill folder says about itself, or null when there is no folder. */
export function readSkillMeta(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, "skill.json"), "utf8")); }
  catch { return null; }
}

/**
 * What a refetch WOULD change, without writing anything.
 *
 * The platform teams edit these daily, so the dry run has to answer "did
 * anything move", not just "here is what exists". Compares the SKILL.md itself
 * rather than a version number: a version can change with no text change, and
 * the text is what an agent reads.
 */
/**
 * The SKILL.md a fetched skill is written as: the platform's text, with
 * `user-invocable:` added to its frontmatter.
 *
 * A skill fetched for an agent is hidden (`false`). Claude Code lists every
 * plugin skill in the person's `/` menu unless it says so, and such a skill is
 * knowledge for Claude and the builder agents, never a command a person types.
 * Claude can still load it, and an agent can still preload it.
 *
 * A skill linked straight to the solution is the person's own choice of what
 * this folder can do, so `invocable` makes it typeable: `syncLinkedSkills`
 * passes `true` and the skill shows in the `/` menu as `/<folder name>`.
 *
 * Either way the platform's own frontmatter wins when it already sets the key,
 * so a skill author can hide or show one skill whatever the caller asked for.
 */
export function fetchedSkillDocument(text, { invocable = false } = {}) {
  const document = String(text ?? "");
  const head = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(document);
  if (!head || /^user-invocable:/mu.test(head[1])) return document;
  return document.replace(/^---\r?\n/u, (open) => `${open}user-invocable: ${invocable ? "true" : "false"}\n`);
}

export function compareSkill(root, { skill, tools }, { invocable = false } = {}) {
  const name = skill.properties?.name?.trim();
  const dir = path.join(root, toolFileName(name));
  const meta = readSkillMeta(dir);
  if (!meta) return { name, state: "new" };
  // A folder holding a different skill is not "same", however alike the text.
  // The platform gives one skill's name to another, and then the only honest
  // answer is that the whole folder is being replaced. A folder with no id
  // (a copy shipped with the plugin) claims no skill, so it is compared by text.
  if (meta.id && meta.id !== skill.id) {
    return { name, state: "changed", changes: [`a different skill: ${meta.id} -> ${skill.id}`], version: [meta.version, skill.version] };
  }
  let onDisk = "";
  try { onDisk = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"); } catch {}
  const changes = [];
  // The same `invocable` the write would use, or every sync of a solution-linked
  // skill reports a change that is only this function's own default.
  const expectedDocument = fetchedSkillDocument(skill.properties?.skill, { invocable });
  if (onDisk !== expectedDocument) {
    changes.push(`SKILL.md ${onDisk.length} -> ${expectedDocument.length} chars`);
  }
  // Attached files, without downloading any: the manifest's `size` is the
  // exact byte length of the file, so the one on disk proves itself.
  const wantFiles = skillFiles(skill);
  const haveFiles = meta.files ?? [];
  const movedFiles = wantFiles.filter((file) => {
    if (!haveFiles.includes(file.relativePath)) return true;
    try { return fs.statSync(path.join(dir, file.relativePath)).size !== file.size; } catch { return true; }
  }).map((file) => file.relativePath);
  const goneFiles = haveFiles.filter((p) => !wantFiles.some((file) => file.relativePath === p));
  if (movedFiles.length || goneFiles.length) {
    changes.push(`files ${haveFiles.length} -> ${wantFiles.length} (${[...movedFiles, ...goneFiles].join(", ")})`);
  }
  return { name, state: changes.length ? "changed" : "same", changes, version: [meta.version, skill.version] };
}

/** The hand-kept corrections in `skills/read-tools.json`, or none. That file is
 *  SOURCE — a fetch overwrites every other file under skills/, never this one. */
export function readToolOverrides(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, "read-tools.json"), "utf8")).readTools ?? []; }
  catch { return []; }
}

/**
 * The files attached to a skill: where each one goes, and where to read it.
 *
 * A skill's references are a third thing beside the SKILL.md and the tools.
 * `properties.files` is a cloud manifest — one entry per file, holding the
 * path inside the folder (`references/cache-config.md`), a download path on
 * the tenant, and the size in bytes. An entry with no destination is dropped,
 * because there is nowhere to put it.
 */
export function skillFiles(skill) {
  const rows = Array.isArray(skill?.properties?.files) ? skill.properties.files : [];
  return rows.map((row) => ({
    relativePath: String(row?.relativePath ?? row?.fileObject?.name ?? "").trim().replace(/^[/\\]+/, ""),
    from: String(row?.fileObject?.path ?? "").trim(),
    size: Number(row?.fileObject?.size ?? 0),
  })).filter((file) => file.relativePath);
}

// The platform names these paths, so they are not trusted to stay inside the
// folder. A `..` would write anywhere on the machine, and a file called
// SKILL.md, skill.json or tools/x.json would replace what the fetch itself
// owns. Both are refused rather than written.
const OURS = new Set(["SKILL.md", "skill.json"]);
function fileTarget(dir, relativePath) {
  const folder = path.resolve(dir);
  const target = path.resolve(folder, relativePath);
  if (!target.startsWith(folder + path.sep)) {
    throw new Error(`skill file "${relativePath}" would be written outside skills/${path.basename(dir)}/`);
  }
  const inside = path.relative(folder, target);
  if (OURS.has(inside) || inside.split(path.sep)[0] === "tools") {
    throw new Error(`skill file "${relativePath}" would overwrite ${inside}, which the fetch writes itself`);
  }
  return target;
}

/** One skill and its tools, straight off the tenant. */
export async function readSkill(api, skillId) {
  const skill = await api(`/api/entity/${SKILL_ENTITY}/${skillId}`);
  if (!skill.ok) return { ok: false, status: skill.status, error: `could not read skill ${skillId}` };
  const tools = await api(`/api/entity/${TOOL_ENTITY}`, {
    filter: { op: "EQUAL", field: "properties_skillId", values: [skillId] },
    page: { limit: 500, offset: 0 },
  });
  if (!tools.ok) return { ok: false, status: tools.status, error: `could not read the tools for ${skillId}` };
  return { ok: true, skill: skill.body, tools: tools.body?.objects ?? [] };
}

/**
 * The text of every file attached to a skill. A dry run reads them too, so
 * lib/skill-scan.mjs checks every file before an apply would write it.
 *
 * `download` reads one file — `makeDownload` in ua-tenant.mjs. One file that
 * will not come down fails the whole skill, because a folder short of a
 * reference file is the thing this is here to prevent.
 */
export async function readSkillFiles(download, skill) {
  const files = [];
  for (const file of skillFiles(skill)) {
    if (!file.from) return { ok: false, status: 0, error: `attached file "${file.relativePath}" has no download path` };
    const got = await download(file.from);
    if (!got.ok) return { ok: false, status: got.status, error: `could not download "${file.relativePath}"` };
    files.push({ relativePath: file.relativePath, text: got.text });
  }
  return { ok: true, files };
}

/**
 * Write one skill folder (`workspace/skill-folder.mjs` read it) to the tenant,
 * and prove it by reading it back the way a fetch would.
 *
 * Three writes, because no one tool takes a whole skill: `save_skill` the
 * SKILL.md, `upload_file` each file beside it, then the skill entity's
 * `properties.files` manifest set to exactly those files. The manifest is
 * the only thing that says which files a skill has, so a republish that drops
 * a file drops it from the skill too.
 *
 * `callTool(name, args)` calls one agent-builder tool through the bridge and
 * answers its JSON. `existing` is `{ id, version }` to update a skill in
 * place; without it a new skill is made.
 */
export async function publishSkill({ callTool, api, download }, folder, { existing = null } = {}) {
  const saved = await callTool("save_skill", {
    name: folder.name, description: folder.description, body: folder.body,
    ...(existing ? { skillId: existing.id, expectedVersion: existing.version } : {}),
  });
  const id = saved?.skill?.id;
  if (saved?.ok === false || !id) return { ok: false, error: `save_skill failed: ${saved?.message ?? saved?.error ?? "no skill id came back"}` };
  const manifest = [];
  for (const file of folder.files) {
    const up = await callTool("upload_file", {
      fileName: path.posix.basename(file.relativePath), contentType: file.contentType,
      contentBase64: Buffer.from(file.text, "utf8").toString("base64"),
    });
    if (up?.ok === false || !up?.file?.url) return { ok: false, id, error: `upload of ${file.relativePath} failed: ${up?.message ?? up?.error ?? "no file url came back"}. The skill now holds the new SKILL.md with its old files; publish again with --replace to finish` };
    manifest.push({
      relativePath: file.relativePath,
      fileObject: { name: up.file.fileName ?? path.posix.basename(file.relativePath), path: up.file.url, size: up.file.size ?? file.size, sourceType: "CLOUD_STORAGE", fileType: up.file.fileExtension ?? path.extname(file.relativePath).slice(1) },
    });
  }
  const current = await api(`/api/entity/${SKILL_ENTITY}/${id}`);
  if (!current.ok) return { ok: false, id, error: `could not read skill ${id} after save_skill` };
  const record = current.body;
  const updated = await api("/api/entity/update", {
    id, entityType: SKILL_ENTITY, version: record.version,
    // The platform clears the tags of an update that leaves them out.
    ...(Array.isArray(record.tags) ? { tags: record.tags } : {}),
    properties: { ...record.properties, files: manifest },
  });
  if (!updated.ok) return { ok: false, id, error: `could not attach the files to skill ${id} (HTTP ${updated.status})` };

  // The read-back is a fetch: the same reads `solution refresh` makes to put
  // this skill into a folder. Anything it would not write the same is a failure.
  const back = await readSkill(api, id);
  if (!back.ok) return { ok: false, id, error: back.error };
  const attached = await readSkillFiles(download, back.skill);
  if (!attached.ok) return { ok: false, id, error: attached.error };
  const differs = [];
  if (back.skill.properties?.skill !== folder.body) differs.push("SKILL.md");
  for (const file of folder.files) {
    if (attached.files.find((one) => one.relativePath === file.relativePath)?.text !== file.text) differs.push(file.relativePath);
  }
  if (attached.files.length !== folder.files.length) differs.push(`${attached.files.length} files read back, ${folder.files.length} sent`);
  if (differs.length) return { ok: false, id, error: `the skill read back differs from the folder: ${differs.join(", ")}` };
  return { ok: true, id, name: folder.name, version: back.skill.version, files: folder.files.map((file) => file.relativePath), created: !existing };
}

/**
 * Write `<root>/<name>/` — SKILL.md, skill.json, tools/<one file each>, and
 * every attached file at the path the platform gave it.
 *
 * The folder is OUTPUT: a tool or a file the platform no longer has is
 * removed, so a deleted one cannot linger after a refresh. Nothing here is
 * hand-edited.
 */
export function writeSkillFolder(root, { skill, tools, files = [] }, { tenant, fromAgent, invocable = false } = {}) {
  const readTools = readToolOverrides(root);
  const props = skill.properties ?? {};
  const name = props.name?.trim();
  if (!name) throw new Error(`skill ${skill.id} has no name`);
  const dir = path.join(root, toolFileName(name));
  // The platform renames and adds skills whenever it likes, so one day a new
  // one will be called what another source already owns. Overwriting it would
  // silently replace a working skill, so refuse and let a person decide.
  const existing = readSkillMeta(dir);
  // A folder synced from the platform's source repository ships with a release; a platform fetch would undo that merge.
  if (existing?.source === "upstream") {
    throw new Error(`skills/${toolFileName(name)}/ is synced from the platform's source repository, not fetched from the platform. Update the plugin to get a newer copy.`);
  }
  // A folder with no id is a copy shipped with the plugin: it claims no skill,
  // so a fetch may fill it.
  if (existing?.id && existing.id !== skill.id) {
    throw new Error(
      `skills/${toolFileName(name)}/ already holds ${existing.id}` +
      `${existing.fromAgent ? ` (from agent ${existing.fromAgent})` : ""}, and ${skill.id} wants the same folder. ` +
      "Two skills cannot share a folder name — rename one on the platform.");
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), fetchedSkillDocument(props.skill, { invocable }));

  // Tool rows are not written. Each is a direct `/api/workflow/execute/node`
  // call, which would reach the tenant outside the MCP bridges; a tools/ folder
  // an older fetch wrote goes too.
  fs.rmSync(path.join(dir, "tools"), { recursive: true, force: true });

  // The attached files, each at the path the platform gave it. A reference
  // file is what the platform's own agent reads, so a folder without them is
  // short by however many bytes they hold. A caller that skipped the download
  // is refused here rather than writing that short folder quietly.
  const wanted = skillFiles(skill);
  if (wanted.length !== files.length) {
    throw new Error(
      `skill ${name} has ${wanted.length} attached file(s) and ${files.length} were supplied. ` +
      "Read them with readSkillFiles before writing the folder.");
  }
  const writtenFiles = [];
  for (const file of files) {
    const target = fileTarget(dir, file.relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.text ?? "");
    writtenFiles.push(path.relative(path.resolve(dir), target).split(path.sep).join("/"));
  }
  // Prune: a file the platform dropped goes with the refresh. Only the ones a
  // previous fetch wrote are touched, and an emptied folder goes with them.
  for (const stale of existing?.files ?? []) {
    if (writtenFiles.includes(stale)) continue;
    let gone;
    try { gone = fileTarget(dir, stale); } catch { continue; }
    fs.rmSync(gone, { force: true });
    for (let folder = path.dirname(gone); folder !== path.resolve(dir); folder = path.dirname(folder)) {
      if (fs.existsSync(folder) && fs.readdirSync(folder).length === 0) fs.rmdirSync(folder); else break;
    }
  }

  // `tenant` and `fromAgent` name where a fetch on this machine came from, so a
  // refetch can tell one copy from another and prune an agent's own folders.
  // A skill that ships with the plugin carries neither: a release records no
  // tenant.
  fs.writeFileSync(path.join(dir, "skill.json"), JSON.stringify({
    id: skill.id,
    name,
    description: props.description ?? "",
    tenant: tenant ?? null,
    // Which agent brought this skill, when one did. It is what lets a refetch
    // remove a skill the agent no longer has — see pruneAgentSkills.
    fromAgent: fromAgent ?? null,
    version: skill.version ?? null,
    fetchedAt: new Date().toISOString(),
    tools: 0,
    writeTools: tools.filter((t) => isWriteTool(t.properties?.name, readTools)).length,
    // The attached files this fetch wrote. It is the list, not a count,
    // because the next fetch deletes the ones that are no longer here.
    files: writtenFiles,
  }, null, 2) + "\n");

  return { dir, name, tools: 0, files: writtenFiles };
}

/**
 * Remove any skill folder this agent brought that is not one of `keep`.
 *
 * `keep` is the agent's skills as they are RIGHT NOW: one `{ dir, id }` per
 * skill, where `dir` is the folder name the platform's name maps to. A folder
 * survives only when both match. Name alone is not enough and id alone is not
 * enough, because the platform does three different things:
 *
 *   - drops a skill        — no `dir` matches, so the folder goes
 *   - renames one, same id — the id matches but the old `dir` does not
 *   - swaps one, same name — the `dir` matches but the old id does not
 *
 * Without this a dropped skill lives on here for ever, because Claude Code
 * indexes a skill by its folder name and keeps loading the stale one. Only
 * folders stamped with this agent's id are touched, so the skills fetched on
 * their own — storage-object-manager, connection-manager — are safe.
 *
 * Callers run this BEFORE writing, or the last two cases collide with a folder
 * that is about to be removed and `writeSkillFolder` stops the whole fetch.
 */
export function pruneAgentSkills(root, agentId, keep) {
  const kept = new Map((keep ?? []).map((one) => [one.dir, one.id]));
  const removed = [];
  for (const dir of fs.readdirSync(root)) {
    const meta = path.join(root, dir, "skill.json");
    if (!fs.existsSync(meta)) continue;
    let stamp;
    try { stamp = JSON.parse(fs.readFileSync(meta, "utf8")); } catch { continue; }
    if (stamp.fromAgent !== agentId) continue;
    if (kept.has(dir) && kept.get(dir) === stamp.id) continue;
    fs.rmSync(path.join(root, dir), { recursive: true, force: true });
    removed.push(dir);
  }
  return removed;
}

/**
 * Every skill linked straight to one solution (a `solution_linked_assets` row
 * with `asset_class: "e_skill_ai_agent"`), fetched and written into `root`,
 * which no longer carries one this call did not just see.
 *
 * Mirrors `skills-cli.mjs skill agent`, for a solution instead of an agent: a
 * skill that fails to read or comes back flagged is left exactly as it is on
 * disk — never half-written, never removed for a read it could not finish.
 * There is no person here to pass `--accept-flagged`, so a flagged skill is
 * always skipped, not held back for a retry.
 *
 * These skills are typeable, unlike a skill fetched for an agent: someone put
 * each one on this solution for this folder's work, so each shows in the `/`
 * menu as `/<folder name>` and the person can run it outright instead of
 * hoping Claude picks it up. The platform's own frontmatter still wins, so a
 * skill that says `user-invocable: false` stays hidden.
 */
export async function syncLinkedSkills(root, { api, download }, { solutionId, skillIds, tenant } = {}) {
  const stamp = `solution:${solutionId}`;
  const fetched = [], flagged = [], failed = [];
  for (const skillId of new Set(skillIds ?? [])) {
    const got = await readSkill(api, skillId);
    if (!got.ok) { failed.push({ skillId, error: got.error }); continue; }
    const attached = await readSkillFiles(download, got.skill);
    if (!attached.ok) { failed.push({ skillId, error: attached.error }); continue; }
    const findings = scanFetchedSkill({ ...got, files: attached.files });
    if (findings.length) { flagged.push({ skillId, name: got.skill.properties?.name?.trim() ?? skillId, findings }); continue; }
    fetched.push({ skill: got.skill, tools: got.tools, files: attached.files });
  }
  // A skill this run could not read or had to skip keeps its folder from the
  // last successful sync — the prune below only drops what fetched cleanly.
  const keep = fetched.map(({ skill }) => ({ dir: toolFileName(skill.properties?.name), id: skill.id }));
  const removed = pruneAgentSkills(root, stamp, keep);
  const written = fetched.map((one) => writeSkillFolder(root, one, { tenant, fromAgent: stamp, invocable: true }));
  return { written, removed, flagged, failed };
}

/**
 * One agent and the skills attached to it.
 *
 * An agent does not list its skills. Each SKILL carries `accessibleTo`, a list
 * of strings like `ai_agent/<agentId>`, and that is the only link. So the query
 * runs from the skill side. It must: two skills on this tenant are both called
 * `files-and-attachments` and belong to different agents, so a fetch by name
 * would pick the wrong one.
 *
 * The agent's own tools are read too, but only to report them. Every tool this
 * agent has is an MCP wrapper (`mcp_servers_list_tools` / `mcp_servers_invoke_tool`)
 * whose real tools live behind one endpoint, so the plugin adds that endpoint to
 * `plugin.json` instead of copying 13 tool rows it would then have to keep in step.
 */
export async function readAgent(api, agentId) {
  const agent = await api(`/api/entity/${AGENT_ENTITY}/${agentId}`);
  if (!agent.ok) return { ok: false, status: agent.status, error: `could not read agent ${agentId}` };
  const skills = await api(`/api/entity/${SKILL_ENTITY}`, {
    filter: { op: "EQUAL", field: "properties_accessibleTo", values: [`ai_agent/${agentId}`] },
    page: { limit: 500, offset: 0 },
  });
  if (!skills.ok) return { ok: false, status: skills.status, error: `could not read the skills for ${agentId}` };
  const tools = await api(`/api/entity/${TOOL_ENTITY}`, {
    filter: { op: "EQUAL", field: "properties_aiAgentId", values: [agentId] },
    page: { limit: 500, offset: 0 },
  });
  return { ok: true, agent: agent.body, skills: skills.body?.objects ?? [], tools: tools.body?.objects ?? [] };
}

/**
 * Write `<root>/agents/<file>` — our frontmatter, then the platform's
 * instructions verbatim.
 *
 * The whole file is OUTPUT. `name` and `description` come from the build's own
 * skill list because Claude Code reads them and the platform has no field for
 * either. `skills:` PRELOADS each named SKILL.md into the subagent's
 * context at start, so it names only what every task of this agent uses
 * (`preloadSkills`); every other skill the platform attaches is still fetched
 * into skills/ and reachable through the Skill tool on demand. `tools:` is the
 * allowlist a builder gets — the core tools plus its own tenant bridges — and
 * `disallowedTools:` names what it never needs (Artifact, Agent). Both narrow
 * this subagent only; the main session keeps everything.
 */
export function writeAgentFile(root, { agent, skills }, { file, name, description, tenant, preloadSkills = [], rulesFile, tools = [], disallowedTools = [], dropSections = [], moveSections = [] } = {}) {
  const instructions = agent.properties?.instructions ?? "";
  if (!instructions.trim()) throw new Error(`agent ${agent.id} has no instructions`);
  const cut = cutSections(instructions, { dropSections, moveSections });
  const folders = [...new Set(preloadSkills)].sort();
  // The platform prompt knows nothing about UnifyApps Headless's plan gate, its tenants or
  // what the person sees, so those rules are OURS and go first. They are a file
  // rather than a string here because a person edits them.
  const out = path.join(root, file);
  // builder/ does not ship, so an installed plugin keeps the rules already in the agent file.
  const rulesPath = rulesFile ? path.join(root, rulesFile) : "";
  const rules = !rulesFile ? ""
    : fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, "utf8").trim()
    : (fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "").match(/\n## UnifyApps Headless rules\n\n([\s\S]*?)\n\n---\n/)?.[1].trim() ?? "";
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    `skills: [${folders.join(", ")}]`,
    ...(tools.length ? [`tools: ${tools.join(", ")}`] : []),
    ...(disallowedTools.length ? [`disallowedTools: ${disallowedTools.join(", ")}`] : []),
    "---",
    "",
    `<!-- GENERATED. The prompt below is fetched from ${tenant ?? "the tenant"} · ${AGENT_ENTITY}/${agent.id} · version ${agent.version ?? "?"}.`,
    "     Do not edit by hand: the build writes this file again and overwrites it.",
    `     The rules at the top are ours and live in ${rulesFile ?? "(none)"}. -->`,
    // An installed plugin has no build-time skill list, so a refresh reads the cut back from here.
    ...(dropSections.length || moveSections.length ? [`<!-- Sections cut: ${JSON.stringify({ dropSections, moveSections })} -->`] : []),
    ...(rules ? ["", "## UnifyApps Headless rules", "", rules] : []),
    "",
    "---",
    "",
    cut.prompt.trimEnd(),
    "",
  ].join("\n"));
  for (const moved of cut.moved) {
    const target = path.join(root, moved.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, [
      `<!-- GENERATED from ${AGENT_ENTITY}/${agent.id} · version ${agent.version ?? "?"} by writeAgentFile. Do not edit by hand. -->`,
      "",
      `# ${moved.headings[0]}`,
      "",
      "## Contents",
      "",
      ...moved.headings.map((heading) => `- ${heading}`),
      "",
      moved.text.trimEnd(),
      "",
    ].join("\n"));
  }
  return { file: out, name, skills: folders, chars: instructions.length, kept: cut.prompt.length, rules: rules.length, moved: cut.moved.map((moved) => moved.file) };
}

/**
 * Cut an agent prompt by its `## ` headings, to keep what loads into every call small.
 *
 * A heading that starts with a `dropSections` entry is left out. A heading that
 * starts with a `moveSections[].headings` entry goes to that entry's `file`, and
 * the prompt keeps one short section in its place that names the file and when
 * to read it. Every entry must match a heading, so a heading the platform
 * renames stops the fetch instead of quietly coming back.
 */
export function cutSections(instructions, { dropSections = [], moveSections = [] } = {}) {
  const sections = [];
  let current = { heading: "", lines: [] };
  let fenced = false;
  for (const line of instructions.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (!fenced && line.startsWith("## ")) {
      if (current.lines.length) sections.push(current);
      current = { heading: line.slice(3).trim(), lines: [] };
    }
    current.lines.push(line);
  }
  sections.push(current);
  const startsWith = (heading, list) => list.some((start) => heading.startsWith(start));
  for (const start of [...dropSections, ...moveSections.flatMap((move) => move.headings)]) {
    if (!sections.some((section) => section.heading.startsWith(start))) throw new Error(`no "## ${start}" section in the agent prompt to cut`);
  }
  const moved = moveSections.map((move) => ({ ...move, headings: [], text: "" }));
  const kept = [];
  for (const section of sections) {
    const text = section.lines.join("\n");
    if (section.heading && startsWith(section.heading, dropSections)) continue;
    const index = moveSections.findIndex((move) => section.heading && startsWith(section.heading, move.headings));
    if (index < 0) { kept.push(text); continue; }
    if (!moved[index].headings.length) kept.push(`\0move:${index}`);
    moved[index].headings.push(section.heading);
    moved[index].text += `${text.trimEnd()}\n\n`;
  }
  const prompt = kept.map((text) => {
    const index = /^\0move:(\d+)$/.exec(text)?.[1];
    if (index === undefined) return text;
    const move = moved[Number(index)];
    return [`## ${move.headings[0]}`, "", `These ${move.headings.length} sections are in \`${move.file}\`, to keep this prompt short: ${move.headings.join("; ")}.${move.when ? ` ${move.when}` : ""}`, ""].join("\n");
  }).join("\n");
  return { prompt, moved };
}
