#!/usr/bin/env node
// The skill surface: fetch a platform skill into the plugin, or say what is
// already here.
//
//   node scripts/skills-cli.mjs list                       what is in skills/
//   node scripts/skills-cli.mjs fetch <skillId> [--apply]  pull one skill from the tenant
//   --accept-flagged  write a skill or prompt that lib/skill-scan.mjs flagged
//   node scripts/skills-cli.mjs agent <agentId> [--apply]  pull an AGENT: its prompt and
//                                                          every skill the platform gives it
//
// Reads only. A fetch REPLACES the folder it writes, so it changes nothing on
// the platform and needs no plan — the gates guard platform writes, and this
// writes to disk.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTenant, makeApi, makeDownload, die } from "./platform/ua-tenant.mjs";
import { scanFetchedSkill, scanSkillText } from "./lib/skill-scan.mjs";
import { compareSkill, pruneAgentSkills, readAgent, readSkill, readSkillFiles, readSkillMeta, skillFiles, toolFileName, writeAgentFile, writeSkillFolder } from "./platform/skills.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = path.join(ROOT, "skills");
const argv = process.argv.slice(2);
// Running this as `skill fetch …` works too, so drop a leading group word
// when it is there; running this file directly works either way.
if (argv[0] === "skill") argv.shift();
const group = argv.shift();
const apply = (() => { const i = argv.indexOf("--apply"); if (i === -1) return false; argv.splice(i, 1); return true; })();
const acceptFlagged = (() => { const i = argv.indexOf("--accept-flagged"); if (i === -1) return false; argv.splice(i, 1); return true; })();
const detail = (s) => console.log(`  ${s}`);
let flagged = 0;
// Fetched text is loaded into Claude as instructions, so a risky pattern holds the write back.
// Returns true when the item may be written.
const checkScan = (label, findings) => {
  if (!findings.length) return true;
  console.error(`  FLAGGED  ${label} — ${findings.length} risky pattern${findings.length === 1 ? "" : "s"}${apply && !acceptFlagged ? ", not written" : ""}`);
  for (const f of findings) console.error(`    ${f.rule}  ${f.file}:${f.line}  ${f.excerpt}`);
  if (acceptFlagged) return true;
  flagged++;
  return false;
};
const tenantApi = () => {
  const tenant = resolveTenant(argv, { allowSolutionMismatch: true });
  // `download` reads a skill's attached reference files. They are not JSON and
  // the tenant does not serve them itself, so `api` cannot fetch them.
  return { tenant, api: makeApi(tenant), download: makeDownload(tenant) };
};

/**
 * The agent file for an id, read out of the file itself.
 *
 * Everything a refresh needs is already in there — `writeAgentFile` put it
 * there: the name and description in the frontmatter, the agent id, the
 * rules file and the sections cut from the prompt in the generated comments. So this works in an installed plugin,
 * where `builder/` is not present. The file is its own record.
 */
const OWNED_MARK = "Maintained in this repo; no longer fetched";
// The header of an agent file whose prompt and skills come from the platform's
// source repository rather than from a tenant.
const UPSTREAM_MARK = "merged from the platform's source repository";

const agentFileFor = (agentId) => {
  const dir = path.join(ROOT, "agents");
  if (!fs.existsSync(dir)) return null;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    if (!text.includes(`ai_agent/${agentId}`)) continue;
    return {
      writeTo: path.join("agents", file),
      agentName: text.match(/^name: (.+)$/m)?.[1].trim(),
      description: text.match(/^description: (.+)$/m)?.[1].trim(),
      rulesFile: text.match(/live in (\S+?)\. -->/)?.[1],
      skills: text.match(/^skills: \[(.+)\]$/m)?.[1].split(",").map((x) => x.trim()) ?? [],
      tools: text.match(/^tools: (.+)$/m)?.[1].split(",").map((x) => x.trim()) ?? [],
      disallowedTools: text.match(/^disallowedTools: (.+)$/m)?.[1].split(",").map((x) => x.trim()) ?? [],
      ...JSON.parse(text.match(/^<!-- Sections cut: (.+) -->$/m)?.[1] ?? "{}"),
    };
  }
  return null;
};

const listSkills = () => {
  if (!fs.existsSync(SKILLS)) return [];
  return fs.readdirSync(SKILLS).filter((d) => fs.existsSync(path.join(SKILLS, d, "skill.json")))
    .map((d) => ({ dir: d, ...JSON.parse(fs.readFileSync(path.join(SKILLS, d, "skill.json"), "utf8")) }));
};

const commands = {
  list() {
    const rows = listSkills();
    if (!rows.length) { console.log("No skills here yet."); detail(`fetch one: node scripts/skills-cli.mjs fetch <skillId> --apply`); return; }
    console.log(`${rows.length} skill${rows.length === 1 ? "" : "s"} in this plugin:`);
    for (const s of rows) {
      if (s.source === "upstream") { detail(`${s.name} · synced from the platform's source repository`); continue; }
      detail(`${s.name} · ${s.tools} tools (${s.writeTools} write) · from ${s.tenant ?? "the platform"}${s.fromAgent ? ` via agent ${s.fromAgent}` : ""}${s.fetchedAt ? ` · fetched ${String(s.fetchedAt).slice(0, 10)}` : ""}`);
      for (const file of s.files ?? []) detail(`  ${file}`);
    }
  },

  async fetch() {
    const skillId = argv.shift();
    if (!skillId) die("usage: skill fetch <skillId> [--apply] [--tenant <tenant>]");
    const { tenant, api, download } = tenantApi();
    const got = await readSkill(api, skillId);
    if (!got.ok) die(`${got.error} (HTTP ${got.status}) on ${tenant.tenant}`);
    const name = got.skill.properties?.name ?? skillId;
    const writes = got.tools.filter((t) => /^(create|update|delete|import|share|add|remove|set)\b/i.test(t.properties?.name ?? "")).length;

    const attached = await readSkillFiles(download, got.skill);
    if (!attached.ok) die(`${attached.error} (HTTP ${attached.status}) on ${tenant.tenant}`);
    const clean = checkScan(name, scanFetchedSkill({ ...got, files: attached.files }));
    if (!apply) {
      console.log(`Ready to write "${name}" from ${tenant.tenant}. Nothing is written yet.`);
      detail(`${(got.skill.properties?.skill ?? "").length} characters of SKILL.md · ${got.tools.length} tools (${writes} of them write) · ${skillFiles(got.skill).length} attached file(s)`);
      detail(`into skills/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/`);
      console.log("\n(dry run - nothing was written. Re-run with --apply.)");
      return;
    }

    if (!clean) die(`"${name}" was not written. Read the findings; re-run with --accept-flagged only if they are safe.`);
    const out = writeSkillFolder(SKILLS, { ...got, files: attached.files }, { tenant: tenant.tenant });
    console.log(`Fetched: "${out.name}" from ${tenant.tenant}, ${out.tools} tools, ${out.files.length} files.`);
    detail(`skills/${path.basename(out.dir)}/ · SKILL.md, skill.json, tools/`);
    for (const file of out.files) detail(`skills/${path.basename(out.dir)}/${file}`);
    // A write is a claim about the call. Read the folder back.
    const back = listSkills().find((s) => s.id === skillId);
    if (!back || back.tools !== out.tools) die(`Written, but reading it back does not match - do not ship this folder.\n  detail: expected ${out.tools} tools, read back ${back?.tools ?? "nothing"}`);
    // An attached file is the point of this fetch, so prove each one landed.
    for (const file of out.files) {
      if (!fs.existsSync(path.join(out.dir, file))) die(`Written, but ${file} is not on disk - do not ship this folder.`);
    }
  },
  // The platform teams change an agent's prompt and its skill list whenever
  // they like, so this exists to take those changes without waiting for a
  // plugin release. It is the same code the build runs.
  async agent() {
    const agentId = argv.shift();
    if (!agentId) die("usage: skill agent <agentId> [--apply] [--tenant <tenant>]");
    // An agent synced from the platform's source repository ships with a release; a platform refresh would undo that merge.
    const synced = agentFileFor(agentId);
    if (synced && fs.readFileSync(path.join(ROOT, synced.writeTo), "utf8").includes(UPSTREAM_MARK)) {
      die(`${synced.writeTo} and its skills are synced from the platform's source repository, not fetched from the platform. Update the plugin to get a newer copy.`);
    }
    const { tenant, api, download } = tenantApi();
    const got = await readAgent(api, agentId);
    if (!got.ok) die(`${got.error} (HTTP ${got.status}) on ${tenant.tenant}`);
    const name = got.agent.properties?.name ?? agentId;
    const instructions = got.agent.properties?.instructions ?? "";
    const here = listSkills().filter((s) => s.fromAgent === agentId);
    const dropped = here.filter((s) => !got.skills.some((p) => p.properties?.name?.trim() === s.name));
    // The file this writes is generated, so a hand edit to it is lost here. The
    // rules that are OURS live beside it and are put back on every write.
    const meta = agentFileFor(agentId);
    // An agent file maintained in this repo is never overwritten: the platform
    // record is history, and a refresh would undo the edits made since. Its
    // skills are still refreshed below. Its prompt is never written, so it is not scanned.
    const owned = !!meta && fs.readFileSync(path.join(ROOT, meta.writeTo), "utf8").includes(OWNED_MARK);

    console.log(`"${name}" on ${tenant.tenant}: ${instructions.length} characters of instructions, ${got.skills.length} skills.`);
    let clean = owned || checkScan(`${name} instructions`, scanSkillText(instructions).map((f) => ({ file: "instructions", ...f })));
    // Every skill is read and scanned before anything is removed or written.
    const fetched = [];
    for (const skill of got.skills) {
      const one = await readSkill(api, skill.id);
      const attached = await readSkillFiles(download, skill);
      const c = compareSkill(SKILLS, { skill, tools: one.ok ? one.tools : [] });
      detail(`${c.state === "same" ? "unchanged" : c.state}  ${c.name}${c.changes?.length ? ` — ${c.changes.join(", ")}` : ""}`);
      // A skill we could not read whole is NOT written, because a folder short
      // of its reference files is worse than the copy already on disk. The
      // prune below leaves that copy alone.
      if (!one.ok || !attached.ok) {
        const bad = one.ok ? attached : one;
        console.error(`  FAILED  ${skill.properties?.name?.trim() ?? skill.id} — ${bad.error} (HTTP ${bad.status})`);
        fetched.push({ skill, files: null });
        continue;
      }
      if (!checkScan(skill.properties?.name?.trim() ?? skill.id, scanFetchedSkill({ skill, tools: one.tools, files: attached.files }))) clean = false;
      fetched.push({ skill, tools: one.tools, files: attached.files });
    }
    for (const s of dropped) detail(`to remove  ${s.dir} — this agent no longer has it`);

    if (!apply) {
      console.log("\n(dry run - nothing was written. Re-run with --apply.)");
      return;
    }
    if (!meta) die(`no agent file here carries ${agentId}. A new agent is added to the build's skill list and fetched by the build.`);
    // One flagged part holds the whole agent back. The prune below deletes a
    // renamed skill's old folder, and a prompt kept without its new skills (or
    // the other way round) names skills it no longer has.
    if (!clean) die(`Nothing was written for "${name}": it was flagged. Read the findings; re-run with --accept-flagged only if they are safe.`);
    if (owned) detail(`skip  ${meta.writeTo} — maintained in this repo, not fetched`);
    // The skills: line is the preload list, and tools: / disallowedTools: the
    // pool; all three are ours and go back as they were.
    if (!owned) writeAgentFile(ROOT, got, { file: meta.writeTo, name: meta.agentName, description: meta.description, preloadSkills: meta.skills, rulesFile: meta.rulesFile, tools: meta.tools, disallowedTools: meta.disallowedTools, dropSections: meta.dropSections, moveSections: meta.moveSections, tenant: tenant.tenant });
    // A skill the agent dropped goes FIRST, before any write. The platform
    // renames a skill without changing its id, so the new name can be the
    // folder a dropped skill still holds. Writing first hits that folder and
    // stops the refresh.
    const keep = got.skills.map((skill) => ({ dir: toolFileName(skill.properties?.name), id: skill.id }));
    const removed = pruneAgentSkills(SKILLS, agentId, keep);
    let short = 0;
    for (const { skill, tools, files } of fetched) {
      if (!files) { short++; continue; }
      writeSkillFolder(SKILLS, { skill, tools, files }, { tenant: tenant.tenant, fromAgent: agentId });
    }
    console.log(`Refreshed "${name}" from ${tenant.tenant}: ${keep.length - short} skills${removed.length ? `, ${removed.length} removed` : ""}${short ? `, ${short} left as they were` : ""}.`);
    detail(`${meta.writeTo} · skills/`);
    // A write is a claim about the call. Read the file back. An owned file was not written.
    const back = fs.readFileSync(path.join(ROOT, meta.writeTo), "utf8");
    if (!owned && !back.includes(instructions.trimEnd().slice(0, 200))) {
      die("Written, but reading it back does not show the platform's prompt - do not ship this.");
    }
    if (short) die(`${short} skill${short === 1 ? "" : "s"} could not be read, so ${short === 1 ? "it was" : "they were"} left as they were. Re-run when the tenant answers.`);
  },
};

if (!group || !commands[group]) {
  console.log("usage: skills-cli.mjs list | fetch <skillId> | agent <agentId>   [--apply] [--accept-flagged] [--tenant <tenant>]");
  process.exit(group ? 1 : 0);
}
await commands[group]();
if (flagged) process.exit(1);
