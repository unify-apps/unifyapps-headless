/** Builds the message a builder agent reads for one batch, and the calls that send it. Pure: it takes the values and returns the text. The words of the rules and the report steps come from dispatch-template.md, passed in as text. */
import { deleteGateText, isRelease, norm, releaseAction, waitsForYes } from "./contracts.mjs";
import { specSections } from "./spec-markdown.mjs";
import { MAX_REVIEW_FIXES, findingLine, planLineKinds, qualitiesLine, regionLine } from "./page-jobs.mjs";

// The spec sections a task's lines come from. A spec has READ rows, a Contract
// and Business rules; an old stored brief has Changes and Rules; both have Touches.
const SPEC_SECTIONS = ["Current state (READ)", "Contract", "Business rules", "Changes", "Rules", "Touches"];

/** One `## <name>` section of dispatch-template.md, without its heading. */
export function templateSection(template, name) {
  const lines = specSections(template).sections[name];
  if (!lines) throw new Error(`dispatch-template.md has no ## ${name} section.`);
  return lines.join("\n").trim();
}

// The page names the spec's `## Touches` lines give, longest first, so a
// heading that names "Deal Tab · Documents" is not read as "Deal Tab".
function touchedPages(sections) {
  return (sections.Touches ?? []).map((line) => /^\s*-\s*page\s*·\s*(.+)\s*·\s*.*$/iu.exec(line)?.[1]).filter(Boolean)
    .map(norm).sort((a, b) => b.length - a.length);
}

// The page each line of a section sits under: the page a `###` sub-heading
// names, or null for a line under no page heading.
function pageScopes(lines, pages) {
  let scope = null;
  return lines.map((line) => {
    const heading = /^ {0,3}#{3,6}\s+(.+?)\s*$/u.exec(line);
    if (heading) scope = pages.find((page) => norm(heading[1]).includes(page)) ?? null;
    return scope;
  });
}

/** The spec lines that name one entity, each with the section it came from,
 * leaving out the job, design, look and state lines in `shown` ("job", "design", "look", "state").
 * For a page, a line under another page's `###` heading is that page's, even
 * when it names this one (a link to it), so it is left out. */
export function specLinesFor(sections, name, shown = new Set(), kind = null) {
  const wanted = norm(name);
  if (!wanted) return [];
  const pages = kind === "page" ? touchedPages(sections) : [];
  return SPEC_SECTIONS.flatMap((section) => {
    const lines = sections[section] ?? [];
    const kinds = planLineKinds(lines);
    const scopes = pageScopes(lines, pages);
    return lines.filter((line, i) => line.trim() && !shown.has(kinds[i]) && norm(line).includes(wanted) && (!scopes[i] || scopes[i] === wanted))
      .map((line) => `${section}: ${line.trim()}`);
  });
}

/** The one command a builder runs to record its own report. */
export function reportCommand({ folder, pluginRoot, planId, agentName, reportFile, sessionId }) {
  return `cd "${folder}" && bash "${pluginRoot}/scripts/run-node.sh" "${pluginRoot}/scripts/ua.mjs" plan report ${planId} ` +
    `--agent-name ${agentName} --report-file "${reportFile}" --session ${sessionId} --json`;
}

/** The command a builder runs to read solution memory in full, instead of it being inlined. */
export function memoryCommand({ folder, pluginRoot, sessionId }) {
  return `cd "${folder}" && bash "${pluginRoot}/scripts/run-node.sh" "${pluginRoot}/scripts/ua.mjs" memory get --session ${sessionId} --json`;
}

const entityText = (entity = {}) => {
  const app = entity.app || entity.appId ? ` · app ${[entity.app, entity.appId && `[${entity.appId}]`].filter(Boolean).join(" ")}` : "";
  return `entity ${entity.kind} ${entity.name}${entity.id ? ` [${entity.id}]` : ""}${entity.module === true ? " (a new global module)" : ""}${app}`;
};

const idsLine = (dep) => `- ${dep.id} ${dep.entity?.kind} ${dep.entity?.name}: ids ${JSON.stringify(dep.result?.ids ?? {})}`;

function builtLine(dep) {
  const result = dep.result ?? {};
  const readBack = Array.isArray(result.readBack) ? result.readBack : [];
  const handover = (Array.isArray(result.notes) ? result.notes : []).filter((note) => typeof note === "string" && note.startsWith("handover:"));
  return [idsLine(dep), ...(readBack.length ? [`read back: ${readBack.join(" | ")}`] : []), ...handover].join(" · ");
}

// What a task was built on. A review sees only the ids of the task it judges,
// for the page id it reports: the builder's own read-back would tell it what to see.
function builtSoFar(task, byId) {
  if (task.kind === "page-review") {
    const judged = byId.get(task.reviewedTaskId ?? task.layoutId);
    return judged?.status === "done" ? [idsLine(judged)] : [];
  }
  // Its own dependencies, and any other done task its body or proof names by id
  // ("take from t15 how it treated …"), each once.
  const named = [...new Set(`${task.body ?? ""}\n${task.proof ?? ""}`.match(/\bt\d+\b/gu) ?? [])]
    .filter((id) => id !== task.id && !task.dependsOn.includes(id));
  return [...task.dependsOn, ...named].map((id) => byId.get(id)).filter((dep) => dep?.status === "done").map(builtLine);
}

const KIND_WORDS = { "ai-agent": "AI agent", dataset: "evaluation dataset", metric: "evaluation metric", experiment: "evaluation experiment", api: "API Platform", "env-variable": "environment variable", connector: "custom connector", "code-app": "code app" };
const kindWord = (kind) => KIND_WORDS[kind] ?? kind;
// The prompt sits inside "…" in the call the router copies, so its own words never carry a double quote or a line break.
const flat = (text) => String(text ?? "").replaceAll('"', "'").replace(/\s+/gu, " ").trim();

// What a yes covers: the release, and what the task deletes. The question
// names the entity's kind too: "deploy the automation Intake flow". A
// code-publish is a publish: "publish the code app Field Reports".
const yesWhat = (task, { kind = false } = {}) => [
  isRelease(task) && `${releaseAction(task)} ${kind ? `the ${kindWord(task.entity?.kind)} ` : ""}${task.entity?.name}`,
  task.deletes && `delete ${flat(task.deletes)}`,
].filter(Boolean).join(" and ");

/** The question the person answers before plan confirm saves their yes. It names the tenant, so their yes names what the builder will do there.
 * `startsWork` says what a deployed automation then does by itself (it runs every 15 minutes), so a yes to a deploy is a yes to that too. */
export function confirmQuestion(task, host, { startsWork = null } = {}) {
  const text = yesWhat(task, { kind: true });
  const runs = startsWork && task.kind === "deploy" ? ` Once deployed it ${startsWork}.` : "";
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} on ${host}?${runs}`;
}

// A release or a planned delete that may go ahead carries its yes, so the
// builder never asks again because its body says to wait for one. The same
// words go in the message file and in the prompt that sends it.
function givenYes(task, { host, askBeforeDeploy }) {
  if (!isRelease(task) && !task.deletes) return null;
  const yes = `yes, ${yesWhat(task)}.`;
  if (task.confirmedAt) return `${yes} The person said yes to '${confirmQuestion(task, host)}' through plan confirm`;
  if (!waitsForYes(task, askBeforeDeploy)) return `${yes} The spec the person accepted names it under Ready when, so it is already approved`;
  return null;
}

// A page-review sees the job, the design, the look and the shots of the task
// it judges (the page's bind, or its layout), never the builder's own answers
// about them. A task a review sent back sees what the review found.
function reviewLines(task, byId) {
  if (task.kind === "page-review") {
    const judged = byId.get(task.reviewedTaskId ?? task.layoutId);
    const shots = Array.isArray(judged?.result?.design?.shots) ? judged.result.design.shots : [];
    return [
      `Review round: ${(task.reviewRounds ?? 0) + 1} of ${Math.max(MAX_REVIEW_FIXES, (task.reviewRounds ?? 0) + 1)}`,
      "Shots:", ...(shots.length ? shots.map((shot) => `${shot.file} (${shot.width}px wide)`) : [`none: the ${judged?.kind ?? "page"} task reported no shots`]),
      ...(task.earlierFindings?.length ? ["Earlier findings, which the builder was asked to fix:", ...task.earlierFindings.map(findingLine)] : []),
      ...(task.earlierQualities ? [`Earlier scores: ${qualitiesLine(task.earlierQualities)}`] : []),
    ];
  }
  if (task.reviewFindings?.length) return ["Review found, in your last shots:", ...task.reviewFindings.map(findingLine)];
  return [];
}

function taskBlock(task, { inBatch, byId, sections, specFile, askBeforeDeploy, host }) {
  const needs = task.dependsOn.filter((id) => inBatch.has(id));
  const shown = new Set([task.job && "job", task.design?.length && "design", task.appLook && "look", task.appState && "state"].filter(Boolean));
  const fromSpec = specLinesFor(sections, task.entity?.name, shown, task.entity?.kind);
  const built = builtSoFar(task, byId);
  return [
    `Task ${task.id} "${task.title}" (${task.kind}) · ${entityText(task.entity)}`,
    // An id a task of this list makes is not in Built so far yet: it is in your own report of that task.
    `Needs: ${needs.length ? `${needs.join(", ")} (in this list: take their ids from what you made for them, not from Built so far)` : "nothing in this list"}`,
    "Body, verbatim:",
    task.body,
    ...(task.job ? [`Job: ${task.job}`] : []),
    ...(task.design?.length ? ["Design, regions in page order:", ...task.design.map(regionLine)] : []),
    ...(task.appLook ? [`App look: ${task.appLook}`] : []),
    ...(task.appState ? [`App state, the values pages share (use these names and stores, never your own): ${task.appState}`] : []),
    ...reviewLines(task, byId),
    ...(task.graphNodes?.length ? [`Graph nodes: ${task.graphNodes.join(", ")}`] : []),
    ...(task.graphEdges?.length ? [`Graph edges: ${task.graphEdges.join(", ")}`] : []),
    `Proof: ${task.proof}${task.needsDesignReport ? " [visual: shots at two widths, see Rules]" : task.visual ? " [visual: take a screenshot]" : ""}`,
    "From the spec:",
    ...(fromSpec.length ? fromSpec : ["none name this entity"]),
    ...(specFile ? [`Full spec: ${specFile}`] : []),
    "Built so far, read back:",
    ...(built.length ? built : ["none"]),
    `Last attempt: ${task.error || "none"}`,
    `Answer from the person: ${answerLine(task, { host, askBeforeDeploy })}`,
  ].join("\n");
}

function answerLine(task, options) {
  const yes = givenYes(task, options);
  return [task.answer, yes && `${yes}; do not ask again.`].filter(Boolean).join(" · ") || "none";
}

const memoryText = (items = []) => (items.length ? items.join("; ") : "none");

// A solution's memory grows for as long as the solution lives, with no cap on
// either section: inlining it all made a batch message mostly a copy of a
// record the builder could read live instead. Past this many characters, the
// message names the command to read it in full and inlines only the most
// recent few of each section.
const MAX_INLINE_MEMORY_CHARS = 4000;
const RECENT_MEMORY_ITEMS = 3;

function memoryLine(memory = {}, readMemoryCommand) {
  const corrections = memory.corrections ?? [];
  const decisions = memory.decisions ?? [];
  const full = `Memory — corrections: ${memoryText(corrections)} · decisions: ${memoryText(decisions)}`;
  if (full.length <= MAX_INLINE_MEMORY_CHARS) return full;
  const recent = (items) => memoryText(items.slice(-RECENT_MEMORY_ITEMS));
  return [`Memory — ${corrections.length} correction(s), ${decisions.length} decision(s), too long to inline. Read it in full with:`,
    readMemoryCommand,
    `Most recent — corrections: ${recent(corrections)} · decisions: ${recent(decisions)}`].join("\n");
}

/**
 * The full message for one batch. Every message is the full message, also for
 * an agent that already ran, so a resume that fails can go to a new agent as is.
 */
export function dispatchMessage({ template, host, planId, planTitle, agentName, tasks, allTasks, specBody = "", specFile = null,
  memory = {}, askBeforeDeploy = true, reportFile, workFolder, command, readMemoryCommand, sessionId = "" }) {
  const inBatch = new Set(tasks.map((task) => task.id));
  const byId = new Map(allTasks.map((task) => [task.id, task]));
  const sections = specSections(specBody).sections;
  const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`<${key}>`, value), text);
  return [
    [`Tenant ${host} · plan ${planId} "${planTitle}" · you are ${agentName}.`,
      "INTERACTIVE: false. Nobody can answer a question while you work.",
      `You have ${tasks.length} tasks. Do them in the order listed. A task runs after every task of this list named in its "Needs".`].join("\n"),
    ...tasks.map((task) => taskBlock(task, { inBatch, byId, sections, specFile, askBeforeDeploy, host })),
    memoryLine(memory, readMemoryCommand),
    `Rules:\n${fill(templateSection(template, "Rules"), { planId, sessionId, workFolder, deleteTools: deleteGateText() })}`,
    `Report:\n${fill(templateSection(template, "Report"), { reportFile, reportCommand: command, agentName })}`,
  ].join("\n\n") + "\n";
}

/**
 * The prompt that sends one batch. Claude Code's auto mode judges a builder's
 * calls by this prompt and never reads the message file, so the prompt itself
 * names the tenant and the environment it answered, each task's kind and
 * entity, and each yes the person gave. Without them auto mode saw a deploy
 * nobody asked for, on a tenant it did not know, and refused it.
 */
export function sendPrompt({ agentName, host, environment, tasks, askBeforeDeploy = true, messageFile, pluginRoot }) {
  // The environment is known when this process has already read the tenant's
  // user-context; a plan kept in local storage reads no tenant.
  const environmentInfo = environment
    ? `It answered environment '${flat(environment)}' at GET /api/user-context.`
    : "No environment label is available.";
  const tenant = `You work on the UnifyApps tenant ${host}. ${environmentInfo}`;
  const said = (task) => [
    givenYes(task, { host, askBeforeDeploy }),
    task.answer && `the person answered '${flat(task.answer).slice(0, 300)}'`,
  ].filter(Boolean).map(flat);
  const taskText = tasks.map((task) => {
    const yes = said(task);
    return `${task.id} ${task.kind}: ${kindWord(task.entity?.kind)} ${flat(task.entity?.name)}${task.entity?.id ? ` [${task.entity.id}]` : ""}` +
      (yes.length ? ` (${yes.join("; ")})` : "");
  });
  // The file's commands run code from the plugin's folder, outside the working
  // folder; auto mode refused them as code nobody asked for while only the file named them.
  const cli = `Its commands run UnifyApps Headless's own CLI in ${pluginRoot}/scripts: cache reads, and the plan report command that records your report.`;
  // The router copies this path by hand, and one wrong letter of the session
  // id sends the builder nowhere. The file's name is the only one like it.
  const fileName = messageFile.split("/").at(-1);
  return [`You are ${agentName}, a UnifyApps Headless builder agent.`, tenant, `Your tasks: ${taskText.join("; ")}.`,
    `Read ${messageFile} and do what it says. If that path does not open, ${fileName} is the only file of that name under .sessions in your working folder.`,
    cli].join(" ");
}

/**
 * The exact calls that send one marked batch, ready to copy. A builder that
 * already ran is sent to by the agentId its Agent() call returned, which
 * SendMessage takes; by its name only when no id is known: a name reaches a
 * finished agent only in the Claude Code versions that keep it (2.1.268 does;
 * the ones in the 29-30 Sept 2026 bug reports did not). If the send fails,
 * the same file goes to a new agent. A session with no SendMessage at all says
 * so once (plan ready --no-resume), and then no batch is a resume.
 */
export function sendCalls({ agent, agentName, agentId, resume, messageFile, description, host, environment, tasks, askBeforeDeploy, pluginRoot }) {
  const prompt = sendPrompt({ agentName, host, environment, tasks, askBeforeDeploy, messageFile, pluginRoot });
  const start = (text) => `Agent(subagent_type: "ua:${agent}", name: "${agentName}", description: "${description}", prompt: ${text})`;
  if (!resume) return [start(`"${prompt}"`)];
  // The prompt is long, so the fallback names it instead of carrying it twice.
  return [`SendMessage(to: "${agentId || agentName}", message: "${prompt}")`, `If that send fails: ${start("the same message")}`];
}
