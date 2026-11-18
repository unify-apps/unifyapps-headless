// Visual spec HTML: derived whole from the technical Markdown by code, so every spec has the same
// document layout whatever its content. spec-model.mjs reads the Markdown, spec-diagram.mjs draws
// how the pieces connect, and this file writes the page: `spec draft`, `spec accept` and `spec
// revise` render it here and check the result with validateSpecHtml and validateSpecHtmlFormat.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RELATIONS } from "./contracts.mjs";
import { buildSpecModel, trunc } from "./spec-model.mjs";
import { diagramSvg } from "./spec-diagram.mjs";

export const SPEC_CSS_MARKER = "ua-spec-css v3";
const KNOWLEDGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "skills", "plan", "references");
/** The sections a spec page can have, in page order. Overview is always first; the rest appear when the spec gives them content. */
export const SPEC_SECTIONS = Object.freeze(["overview", "people", "changes", "journey", "rules", "failures", "check", "releases", "done"]);
const STATUS = { draft: "Draft · waiting for your decision", accepted: "Accepted final spec", revised: "Revised final spec" };
const SUBTITLE = {
  people: "Who uses what is being built.",
  changes: "Everything built or changed, and how the pieces connect. Open a row for the full detail.",
  journey: "What happens, in order, and who does it.",
  rules: "Applied every time.",
  failures: "What breaks, what people see, and what happens to the data.",
  check: "What this spec rests on. Assumptions first.",
  releases: "What UnifyApps Headless switches on after you accept.",
  done: "How you will know it works.",
};
const LABEL = {
  people: "Who it’s for",
  changes: "What changes",
  journey: "How it moves",
  rules: "Rules",
  failures: "When it goes wrong",
  check: "Before you accept",
  releases: "What goes live",
  done: "Done when",
};
const WEIGHT_TYPE = { lead: "Main part", support: "Secondary", quiet: "Only when needed", later: "One click away" };
const PILL_CLASS = { New: "new", Updated: "updated", "Read only": "readonly", Reused: "reused" };

/** The owner-editable look: the stylesheet, the UnifyApps mark and the one script. Restyling edits these files, not code. */
export function loadSpecHtmlAssets(root = KNOWLEDGE) {
  return {
    css: fs.readFileSync(path.join(root, "spec-visual.css"), "utf8").trim(),
    logo: fs.readFileSync(path.join(root, "unifyapps-logo.svg"), "utf8").trim(),
    js: fs.readFileSync(path.join(root, "spec-visual.js"), "utf8").trim(),
  };
}

// ---------- small HTML helpers ----------

/** Escapes text for an attribute or a text node. */
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/** Escapes text and turns `code` spans and **bold** into their tags. */
function inline(s) {
  return esc(s).replace(/`([^`]+)`/gu, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/gu, "<b>$1</b>");
}

/** A link to an entity's card. */
function link(ent) {
  return `<a href="#e-${esc(ent.id)}">${esc(ent.name)}</a>`;
}

/** The action pill (`New`, `Updated`, `Read only`, `Reused`). */
function pill(action) {
  return `<span class="pill pill--${PILL_CLASS[action] ?? "updated"}">${esc(action)}</span>`;
}

/** A titled block of a card body, or nothing when the body is empty. */
function block(title, body) {
  return body ? `<div><h4 class="blk-h">${esc(title)}</h4>${body}</div>` : "";
}

/** A facts list from `[label, html]` rows. */
function facts(rows) {
  if (!rows.length) return "";
  return `<dl class="facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
}

/** A table whose first cell of every row is a heading; `heads` null leaves the thead out. */
function table(heads, rows, { plain = false, stack = true } = {}) {
  if (!rows.length) return "";
  const classes = `tbl${plain ? " tbl--plain" : ""}${stack ? " tbl--stack" : ""}`;
  const thead = heads ? `<thead><tr>${heads.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>` : "";
  const cell = (c, i) => (i === 0 ? `<th>${c}</th>` : `<td${heads ? ` data-l="${esc(heads[i])}"` : ""}>${c}</td>`);
  const body = rows.map(cells => `<tr>${cells.map(cell).join("")}</tr>`).join("");
  return `<table class="${classes}">${thead}<tbody>${body}</tbody></table>`;
}

/** Two columns of a card body, or nothing when both are empty. */
function cols(left, right) {
  return left || right ? `<div class="ent-cols"><div>${left}</div><div>${right}</div></div>` : "";
}

/** A plain bullet list of inline text. */
function plainList(items) {
  return items.length ? `<ul class="plain-list">${items.map(i => `<li>${inline(i)}</li>`).join("")}</ul>` : "";
}

/** A relation note in quotes, with a leading space, or nothing. */
function noteOf(note, open = "“", close = "”") {
  return note ? ` ${open}${esc(note)}${close}` : "";
}

/** A one-paragraph note with no margin, as card bodies use it. */
function note(html) {
  return `<p class="note" style="margin:0">${html}</p>`;
}

/** A numbered list of steps. */
function stepsBlock(steps) {
  return steps.length ? block("What it does", `<ol class="steps-n">${steps.map(s => `<li>${inline(s)}</li>`).join("")}</ol>`) : "";
}

// ---------- entity cards ----------

/** `Calls X (“Submit”) · Reads A, B` and the reverse, for the row summary. */
function relationSummary(ent) {
  const parts = [];
  for (const [key, rel] of Object.entries(RELATIONS)) {
    if (!ent.relations[key].length) continue;
    const targets = ent.relations[key].map(r => esc(r.target.name) + noteOf(r.note, " (“", "”)")).join(", ");
    parts.push(`<b>${esc(rel.forward)}</b> ${targets}`);
  }
  for (const [key, rel] of Object.entries(RELATIONS)) {
    if (!ent.reverse[key].length) continue;
    const sources = ent.reverse[key].map(r => esc(r.source.name) + noteOf(r.note, " (“", "”)")).join(", ");
    parts.push(`<b>${esc(rel.reverse)}</b> ${sources}`);
  }
  return parts.join(" · ");
}

/** The "Connects to" chips: every relation of the entity, forward and reverse, as links. */
function connectsTo(ent) {
  const chips = [];
  for (const [key, rel] of Object.entries(RELATIONS)) {
    for (const r of ent.relations[key]) {
      chips.push(`<a href="#e-${esc(r.target.id)}"><span class="chip-k">${esc(rel.forward.toLowerCase())}</span>${esc(r.target.name)}</a>`);
    }
    for (const r of ent.reverse[key]) {
      chips.push(`<a href="#e-${esc(r.source.id)}"><span class="chip-k">${esc(rel.reverse.toLowerCase())}</span>${esc(r.source.name)}</a>`);
    }
  }
  return chips.length ? block("Connects to", `<div class="links">${chips.join("")}</div>`) : "";
}

/** "Deployed" or "Published", with "asks you first" when the release waits for a yes; null without a release. */
function liveFact(ent) {
  if (!ent.release) return null;
  return `${ent.release.action === "deploy" ? "Deployed" : "Published"}${ent.release.ask ? " · asks you first" : ""}`;
}

/** Removes and returns the first detail whose key is one of `keys` (case-insensitive), or null. */
function takeDetail(ent, ...keys) {
  const i = ent.details.findIndex(([k]) => keys.includes(k.toLowerCase()));
  return i < 0 ? null : ent.details.splice(i, 1)[0][1];
}

/** The details nobody took, as fact rows; a detail with no key is labelled by the entity kind. */
function restFacts(ent) {
  return ent.details.map(([k, v]) => [k || ent.kindLabel, inline(v)]);
}

/** One design region of a page: its name, its weight, what it shows and what it serves. */
function regionItem(r) {
  const head = `<div class="rg-head"><b class="rg-t">${esc(r.region)}</b>`
    + `<span class="rg-type">${esc(WEIGHT_TYPE[r.weight] ?? r.weight)}</span></div>`;
  const text = r.text ? `<p class="rg-text">${inline(r.text)}</p>` : "";
  const serves = r.serves ? `<p class="rg-line"><span class="rg-k">Serves</span><span>${inline(r.serves)}</span></p>` : "";
  return `<li class="rg rg--${esc(r.weight)}">${head}${text}${serves}</li>`;
}

/** One column of "How this page connects": the targets of one relation kind with their notes. */
function connectColumn(ent, title, key) {
  if (!ent.relations[key].length) return "";
  const items = ent.relations[key].map(r =>
    `<div class="cx-i"><p><span class="cx-n">${link(r.target)}</span><span class="cx-k">${esc(r.target.kindLabel)}</span></p>`
    + `${r.note ? `<p class="cx-w">${esc(r.note)}</p>` : ""}</div>`).join("");
  return `<div class="cx-col"><h5 class="cx-h">${title}</h5>${items}</div>`;
}

function pageBody(ent) {
  const forParts = (ent.job?.for ?? "").split(/,\s*/u).map(s => s.trim()).filter(Boolean);
  const rows = [];
  if (ent.address) rows.push(["Address", `<code>${esc(ent.address)}</code>`]);
  if (forParts.length) rows.push(["Used by", esc(forParts[0])]);
  if (forParts.length > 1) rows.push(["How often", esc(forParts.at(-1))]);
  if (ent.job?.mainAction) rows.push(["Main action", esc(ent.job.mainAction)]);
  const shows = takeDetail(ent, "shows");
  if (shows) rows.push(["Shows", inline(shows)]);
  rows.push(...restFacts(ent));
  const regions = ent.regions.length
    ? block("What’s on the page, top to bottom", `<ol class="regions">${ent.regions.map(regionItem).join("")}</ol>`)
    : "";
  const cx = connectColumn(ent, "Gets data from", "reads") + connectColumn(ent, "Runs", "calls") + connectColumn(ent, "Leads to", "opens");
  const connects = cx ? block("How this page connects", `<div class="cx">${cx}</div>`) : "";
  const answers = ent.job?.answers?.length
    ? block("Answers", `<ul class="qs">${ent.job.answers.map(q => `<li>${inline(q)}</li>`).join("")}</ul>`)
    : "";
  const stateRows = ent.states.map(([k, v]) => [esc(k), inline(v)]);
  let states = "";
  if (stateRows.length) states = block("States", table(null, stateRows, { plain: true, stack: false }));
  else if (ent.job?.states) states = block("States", note(inline(ent.job.states)));
  const signals = ent.job?.signals && !/^none\b/iu.test(ent.job.signals) ? block("Signals", note(inline(ent.job.signals))) : "";
  return facts(rows) + regions + connects + cols(answers, states + signals);
}

/** One input row: name, type, and Optional or its rule. */
function inputRow(i) {
  const rule = /optional|may be empty|blank/iu.test(i.rule)
    ? `<span class="opt">Optional</span>`
    : `<span class="req">${esc(i.rule || "Required")}</span>`;
  return [`<code>${esc(i.name)}</code>`, inline(i.type), rule];
}

/** One output row: name, then type and rule joined. */
function outputRow(o) {
  return [`<code>${esc(o.name)}</code>`, inline([o.type, o.rule].filter(Boolean).join(", "))];
}

function automationBody(ent) {
  const rows = [];
  const runsWhen = takeDetail(ent, "runs when", "trigger", "called from");
  if (runsWhen) rows.push(["Runs when", inline(runsWhen)]);
  else if (ent.reverse.calls.length) {
    rows.push(["Runs when", ent.reverse.calls.map(r => `${esc(r.note || "called")} on ${link(r.source)}`).join("; ")]);
  }
  const live = liveFact(ent);
  if (live) rows.push(["Live", esc(live)]);
  rows.push(...restFacts(ent));
  let inputs = "";
  if (ent.inputs) {
    inputs = block("Inputs", ent.inputs.length ? table(["Name", "Type", "Required"], ent.inputs.map(inputRow)) : note("None."));
  }
  const outputs = ent.outputs
    ? block("Returns", table(["Name", "Type"], ent.outputs.map(outputRow)))
    : "";
  const steps = stepsBlock(ent.steps);
  const answerRows = ent.answers.map(a => [`<span class="${a.ok ? "ans-ok" : "ans-no"}">${inline(a.label)}</span>`, inline(a.text)]);
  const answers = answerRows.length ? block("Answers it can give", table(null, answerRows, { plain: true, stack: false })) : "";
  return facts(rows) + inputs + cols(steps, answers || outputs) + (answers ? outputs : "") + connectsTo(ent);
}

function objectBody(ent) {
  const rows = [];
  const unique = takeDetail(ent, "unique");
  if (unique) rows.push(["Unique", inline(unique)]);
  const seed = takeDetail(ent, "seed", "seed rows");
  if (seed) rows.push(["Seed rows", inline(seed)]);
  if (ent.ref.id) rows.push(["Id", `<code>${esc(ent.ref.id)}</code>`]);
  rows.push(...restFacts(ent));
  const fields = ent.fields
    ? block("Fields", table(["Field", "Type", "Rule"], ent.fields.map(f => [`<code>${esc(f.name)}</code>`, esc(f.type), inline(f.rule)])))
    : "";
  const codeRow = r => [`<code>${esc(r.code)}</code>`, esc(r.label)];
  const codes = ent.codes.map(c => block(c.title, table(["Code", "Label"], c.rows.map(codeRow)))).join("");
  const indexes = ent.indexes.length
    ? block("Indexes", table(["Index", "Serves"], ent.indexes.map(i => [`<code>${esc(i.index)}</code>`, inline(i.serves)])))
    : "";
  return facts(rows) + fields + cols(codes, indexes) + connectsTo(ent);
}

function connectionBody(ent) {
  const rows = [];
  const usedFor = takeDetail(ent, "used for");
  if (usedFor) rows.push(["Used for", inline(usedFor)]);
  const fails = takeDetail(ent, "if it fails", "on failure");
  if (fails) rows.push(["If it fails", inline(fails)]);
  if (ent.ref.id) rows.push(["Id", `<code>${esc(ent.ref.id)}</code>`]);
  const message = takeDetail(ent, "message", "call");
  rows.push(...restFacts(ent));
  return facts(rows) + (message ? block("Message or call", note(inline(message))) : "") + connectsTo(ent);
}

/** One menu item after the plan: a link to its page when the spec touches it, tagged New when it is. */
function menuAfterItem(ent, model, i) {
  const page = model.ents.find(e => e.kind === "page" && e.name.toLowerCase() === i.toLowerCase());
  const fresh = page && page.action === "New" || !ent.menu.today.some(t => t.toLowerCase() === i.toLowerCase());
  return `<li${fresh ? ' class="mn-new"' : ""}>${page ? link(page) : esc(i)}${fresh ? '<span class="mn-tag">New</span>' : ""}</li>`;
}

/** The app's menu today beside its menu after the plan. */
function menuBlock(ent, model) {
  if (!ent.menu.today.length && !ent.menu.after.length) return "";
  const todayItems = ent.menu.today.map(i => `<li>${esc(i)}</li>`).join("") || "<li>—</li>";
  const afterItems = ent.menu.after.map(i => menuAfterItem(ent, model, i)).join("");
  const today = `<div class="mn"><p class="mn-h">Today</p><ul>${todayItems}</ul></div>`;
  const after = `<div class="mn mn--after"><p class="mn-h">After this plan</p><ul>${afterItems}</ul></div>`;
  return block("Menu, before and after", `<div class="menu-ba">${today}<span class="mn-arrow" aria-hidden="true">→</span>${after}</div>`);
}

function appBody(ent, model) {
  const menu = menuBlock(ent, model);
  const stays = ent.stays.length ? block("Stays the same", plainList(ent.stays)) : "";
  const today = ent.fact && !ent.menu.today.length ? block("Today", note(inline(ent.fact))) : "";
  let live = "";
  if (liveFact(ent)) {
    const when = ent.release.action === "publish" ? "When UnifyApps Headless publishes the app" : "When UnifyApps Headless deploys it";
    live = block("When it goes live", note(`${when}${ent.release.ask ? ", after your yes" : ""}.`));
  }
  const rest = facts(restFacts(ent));
  const id = ent.ref.id ? `<p class="ent-id">App id <code>${esc(ent.ref.id)}</code></p>` : "";
  return menu + cols(stays + today, live) + rest + id;
}

function genericBody(ent) {
  const rows = [];
  const live = liveFact(ent);
  if (live) rows.push(["Live", esc(live)]);
  if (ent.ref.id) rows.push(["Id", `<code>${esc(ent.ref.id)}</code>`]);
  rows.push(...restFacts(ent));
  return facts(rows) + stepsBlock(ent.steps) + connectsTo(ent);
}

/** The card body for an entity kind. The body builders take details off the entity, so the caller restores them. */
function bodyFor(ent, model) {
  switch (ent.kind) {
    case "page": return pageBody(ent);
    case "automation":
    case "ai-agent": return automationBody(ent);
    case "object":
    case "dataset": return objectBody(ent);
    case "connection": return connectionBody(ent);
    case "app": return appBody(ent, model);
    default: return genericBody(ent);
  }
}

/** One entity card: a flat row when it has no body, else a details row that opens on the body. */
function entityCard(ent, model) {
  const details = [...ent.details];
  const body = bodyFor(ent, model);
  ent.details = details;
  const kind = `<span class="ent-kind">${esc(ent.kindLabel)}${ent.address ? ` · <code>${esc(ent.address)}</code>` : ""}</span>`;
  const rel = relationSummary(ent);
  const sum = `${pill(ent.action)}<span class="ent-title"><span class="ent-name">${esc(ent.name)}</span>${kind}</span>`
    + `<span class="ent-why">${inline(ent.why)}</span>${rel ? `<span class="ent-rel">${rel}</span>` : ""}`;
  const attrs = `id="e-${esc(ent.id)}" data-node="${esc(ent.id)}" data-kind="${esc(ent.kind)}"`;
  if (!body.trim()) return `<div class="ent ent--flat" ${attrs}><div class="ent-sum">${sum}</div></div>`;
  return `<details class="ent" ${attrs}><summary class="ent-sum">${sum}</summary><div class="ent-body">${body}</div></details>`;
}

// ---------- page sections ----------

/** A page section with its heading and subtitle. */
function section(id, body) {
  const head = `<div class="sec-head"><div><h2 class="sec-h">${esc(LABEL[id])}</h2><span class="sec-sub">${esc(SUBTITLE[id])}</span></div></div>`;
  return `<section id="${id}">${head}${body}</section>`;
}

/** Who it's for: a role table when a person has a name, else a plain list. */
function peopleSection(m) {
  if (!m.people.length) return "";
  if (!m.people.some(p => p.name)) return plainList(m.people.map(p => p.does));
  const rows = m.people.map(p => [esc(p.name || "—"), `<span class="muted">${esc(p.count || "—")}</span>`, inline(p.does)]);
  return table(["Role", "How many", "What they do with it"], rows);
}

/** The diagram figure with its legend, or nothing when there is nothing to connect. */
function diagramFigure(m) {
  const dg = diagramSvg(m);
  if (!dg) return "";
  const legend = `<figcaption class="dg-legend">${dg.kinds.map(k => `<span><i class="lg lg--${k}"></i>${k}</span>`).join("")}`
    + `<span><i class="lg-dot"></i>New</span><span><i class="lg-dot lg-dot--upd"></i>Updated</span>`
    + `<span><i class="lg-dot lg-dot--ro"></i>Read only or reused</span></figcaption>`;
  return `<figure class="dg"><div class="dg-scroll">${dg.svg}</div>${legend}</figure>`;
}

/** A Contract entry that names no Touches entity, as a flat note row. */
function looseCard(l) {
  const title = `<span class="ent-title"><span class="ent-name">${inline(l.label || "—")}</span></span>`;
  const why = `<span class="ent-why">${inline(trunc(l.text || l.children.join("; "), 300))}</span>`;
  return `<div class="ent ent--flat"><div class="ent-sum"><span class="pill">Note</span>${title}${why}</div></div>`;
}

/** What changes: the diagram, one group of cards per entity kind, then the loose notes. */
function changesSection(m) {
  if (!m.groups.length) return "";
  const groups = m.groups.map(g =>
    `<div class="grp" data-kind="${esc(g.kind)}" data-label="${esc(g.filterLabel)}"><h3 class="grp-h">${esc(g.label)}</h3>`
    + `<div class="ents">${g.ents.map(e => entityCard(e, m)).join("\n")}</div></div>`).join("\n");
  const loose = m.loose.length
    ? `<div class="grp" data-kind="other" data-label="Other"><h3 class="grp-h">Also in the contract</h3>`
      + `<div class="ents">${m.loose.map(looseCard).join("")}</div></div>`
    : "";
  return diagramFigure(m) + groups + loose;
}

/** One journey step: who does it (a person or a linked automation) and what happens. */
function journeyStep(j) {
  const what = `${j.title ? `<b>${inline(j.title)}.</b> ` : ""}${inline(j.body)}`;
  if (!j.who) return `<li class="jstep jstep--plain"><span class="jstep-what">${what}</span></li>`;
  const name = j.auto ? link(j.auto) : esc(j.who);
  const kind = j.auto ? esc(j.auto.kindLabel) : "Person";
  const who = `<span class="jstep-who">${name}<span class="jstep-kind">${kind}</span></span>`;
  return `<li class="jstep${j.auto ? " jstep--auto" : ""}">${who}<span class="jstep-what">${what}</span></li>`;
}

function journeySection(m) {
  return m.journey.length ? `<ol class="journey">${m.journey.map(journeyStep).join("")}</ol>` : "";
}

function rulesSection(m) {
  if (!m.rules.length) return "";
  const rule = r => (r.t
    ? `<div class="rule"><dt>${inline(r.t)}</dt><dd>${inline(r.b)}</dd></div>`
    : `<div class="rule rule--plain"><dd>${inline(r.b)}</dd></div>`);
  return `<dl class="rules">${m.rules.map(rule).join("")}</dl>`;
}

/** When it goes wrong: a table when most failures have a title (three columns when any names the data), else a list. */
function failuresSection(m) {
  if (!m.failures.length) return "";
  const titled = m.failures.filter(f => f.t).length * 2 >= m.failures.length;
  if (!titled) return plainList(m.failures.map(f => (f.t ? `**${f.t}** ${f.sees}` : f.sees)));
  const three = m.failures.some(f => f.data);
  const heads = three ? ["What breaks", "What the person sees", "What happens to the data"] : ["What breaks", "What happens"];
  const rows = m.failures.map(f => (three
    ? [inline(f.t || "—"), inline(f.sees), `<span class="muted">${inline(f.data || "—")}</span>`]
    : [inline(f.t || "—"), inline(f.sees)]));
  return table(heads, rows);
}

/** One decision as a details row: title, source tag, a gist in the summary and the whole answer inside. */
function decisionRow(d) {
  return `<details class="dec" id="d-${esc(d.id).replace(/_/gu, "-")}"><summary><span class="dec-t">${esc(d.title)}</span>`
    + `<span class="tag tag--${esc(d.cls)}">${esc(d.tag)}</span>`
    + `<span class="dec-gist" aria-hidden="true">${inline(trunc(d.body, 160))}</span></summary>`
    + `<div class="dec-body">${inline(d.body)}</div></details>`;
}

/** One assumption: an INFERRED row of the READ table, tagged as not read. */
function assumptionItem(a) {
  return `<div class="assume-i"><b>${inline(a.title)} <span class="tag tag--assumed">Assumed, not read</span></b>${inline(a.body)}</div>`;
}

/** Before you accept: the assumptions, the decisions and what was left out on purpose. */
function checkSection(m) {
  if (!m.decisions.length && !m.assumptions.length) return "";
  const assume = m.assumptions.length
    ? `<div class="assume">${m.assumptions.map(assumptionItem).join("")}</div>`
    : "";
  const decs = m.decisions.length ? `<div class="decs">${m.decisions.map(decisionRow).join("")}</div>` : "";
  let left = "";
  if (m.leftOut) {
    const text = m.leftOut.replace(/^(?:excluded|out of scope|not included)\s*[:—-]?\s*/iu, "").replace(/^\w/u, c => c.toUpperCase());
    left = `<p class="left-out"><b>Left out on purpose:</b> ${inline(text)}</p>`;
  }
  return assume + decs + left;
}

/** What goes live: one row per deploy or publish, or a note that nothing is released. Always present. */
function releasesSection(m) {
  if (!m.releaseRows.length) return `<p class="note">Nothing is deployed or published.${m.rollout ? ` ${inline(m.rollout)}` : ""}</p>`;
  const rows = m.releaseRows.map(r =>
    `<li><span class="live-t">${esc(r.title)}</span>${r.gate ? `<span class="gate">${esc(r.gate)}</span>` : ""}`
    + `<span class="live-b">${esc(r.body)}</span></li>`).join("");
  return `<ol class="live">${rows}</ol>${m.rollout ? `<p class="note"><b>Rollout:</b> ${inline(m.rollout)}</p>` : ""}`;
}

/** Done when: the acceptance lines, what is not proven when done, and the open questions. */
function doneSection(m) {
  if (!m.acceptance.length && !m.notProven.length) return "";
  const done = m.acceptance.length ? `<ul class="done">${m.acceptance.map(a => `<li>${inline(a)}</li>`).join("")}</ul>` : "";
  const unproven = m.notProven.length
    ? `<h3 class="sub-h">Not proven when done</h3><ul class="unproven">${m.notProven.map(a => `<li>${inline(a)}</li>`).join("")}</ul>`
    : "";
  return `${done}${unproven}<p class="open-q"><b>Open questions:</b> ${inline(m.openQuestions)}</p>`;
}

/** The today / after strip of the overview, with the scope line when there is one. */
function todayAfter(m) {
  const scope = m.scopeShort ? `<div class="ta-scope"><b>Scope</b><span>${inline(m.scopeShort)}</span></div>` : "";
  if (m.today && m.after) {
    return `<div class="ta"><div class="ta-h ta-h--today">Today</div><div class="ta-gap"></div><div class="ta-h ta-h--after">After</div>`
      + `<div class="ta-today">${inline(m.today)}</div><div class="ta-arrow" aria-hidden="true">→</div>`
      + `<div class="ta-after">${inline(m.after)}</div>${scope}</div>`;
  }
  if (!m.after && !m.scopeShort) return "";
  const after = m.after ? `<div class="ta-h ta-h--after">After</div><div class="ta-after">${inline(m.after)}</div>` : "";
  return `<div class="ta ta--one">${after}${scope}</div>`;
}

function overviewSection(m) {
  return `<section id="overview"><p class="meta">${esc(m.meta)}</p><h1 class="title">${esc(m.title)}</h1>`
    + `<p class="lede">${inline(m.summary)}</p>${todayAfter(m)}</section>`;
}

/** The sections after the overview, in page order, each only when the spec gives it content. */
function bodySections(m) {
  const builders = [
    ["people", peopleSection],
    ["changes", changesSection],
    ["journey", journeySection],
    ["rules", rulesSection],
    ["failures", failuresSection],
    ["check", checkSection],
    ["releases", releasesSection],
    ["done", doneSection],
  ];
  const sections = [];
  for (const [id, build] of builders) {
    const body = build(m);
    if (body) sections.push({ id, body: section(id, body) });
  }
  return sections;
}

function renderModel(m, { css, logo, js }, status) {
  const sections = bodySections(m);
  const ids = ["overview", ...sections.map(s => s.id)];
  const nav = ids.map(id => `<a href="#${id}">${esc(id === "overview" ? "Overview" : LABEL[id])}</a>`).join("");
  const overview = overviewSection(m);
  const statusTag = `<span class="status" data-status="${esc(status)}">${esc(STATUS[status] ?? STATUS.draft)}</span>`;
  const appCrumb = m.app ? `<span aria-hidden="true">/</span><span>${esc(m.app.name)}</span>` : "";
  const crumbs = `<span class="crumbs"><b>UnifyApps Headless</b>${appCrumb}<span aria-hidden="true">/</span><span>Final spec</span></span>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.title)} · final spec</title>
<style>
${css}
</style>
</head>
<body>
<header class="topbar"><div class="topbar-in">${crumbs}${statusTag}</div></header>
<div class="shell">
<aside class="rail"><div class="rail-in">
<nav aria-label="Contents">${nav}</nav>
<div class="built"><span>Built with UnifyApps Headless</span>${logo}</div>
</div></aside>
<article class="doc">
${overview}
${sections.map(s => s.body).join("\n")}
</article>
</div>
<script>
${js}
</script>
</body>
</html>
`;
}

/**
 * The visual spec for one spec Markdown (frontmatter allowed). `status` names the line in the
 * top bar: `draft` (default), `accepted` or `revised`. Deterministic: the same Markdown, assets
 * and status give the same bytes, which the acceptance receipt relies on.
 */
export function renderSpecHtml(md, { status = "draft", assets = loadSpecHtmlAssets() } = {}) {
  return renderModel(buildSpecModel(md), assets, STATUS[status] ? status : "draft");
}

/** The visible text of an HTML fragment, tags dropped and whitespace collapsed. */
function text(fragment) {
  return fragment.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
}

/** Structural contract of the visual spec. Returns null when the HTML conforms, else the first problem. */
export function validateSpecHtmlFormat(html, { assets = loadSpecHtmlAssets() } = {}) {
  if (typeof html !== "string" || !html.trim()) return "Visual HTML is empty.";
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/giu)];
  if (scripts.length !== 1) return "Visual spec carries exactly one script, the plugin's own spec-visual.js.";
  if (scripts[0][1].trim() !== assets.js.trim()) return "Visual spec's script must be the plugin's own spec-visual.js, unchanged.";
  html = html.replace(/<!--[\s\S]*?-->/gu, "");
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/giu)].map(m => m[1]);
  if (!styles.some(css => css.includes(SPEC_CSS_MARKER))) {
    return "Visual spec must use the canonical stylesheet (spec-visual.css); render it with spec draft.";
  }
  if (!/<header class="topbar"/u.test(html)) return 'Visual spec needs <header class="topbar">.';
  const asides = html.match(/<aside\b/giu) ?? [];
  if (asides.length !== 1) return 'Visual spec needs exactly one <aside class="rail"> contents rail.';
  const aside = /<aside\b[^>]*>([\s\S]*?)<\/aside>/iu.exec(html)?.[1] ?? "";
  const nav = /<nav\b[^>]*aria-label="Contents"[^>]*>([\s\S]*?)<\/nav>/iu.exec(aside)?.[1];
  if (!nav) return 'The contents rail needs <nav aria-label="Contents">.';
  const hrefs = [...nav.matchAll(/<a\b[^>]*href="#([^"]*)"/giu)].map(m => m[1]);
  if (hrefs[0] !== "overview") return "The contents rail must start with #overview.";
  if (!/<div class="built"[^>]*>[\s\S]*?<svg\b[^>]*class="ua"/iu.test(aside)) {
    return 'The contents rail must end with <div class="built"> holding the UnifyApps mark.';
  }
  const articles = html.match(/<article\b/giu) ?? [];
  if (articles.length !== 1) return 'Visual spec needs exactly one <article class="doc">.';
  const article = /<article\b[^>]*>([\s\S]*?)<\/article>/iu.exec(html)?.[1] ?? "";
  const ids = [...article.matchAll(/<section\b[^>]*\bid="([^"]+)"/giu)].map(m => m[1]);
  if (ids[0] !== "overview") return 'The article must start with <section id="overview">.';
  if (!/<section\b[^>]*\bid="overview"[^>]*>[\s\S]*?<h1\b/iu.test(article)) {
    return "The overview section must hold the spec title in <h1>.";
  }
  const order = SPEC_SECTIONS.map(s => `#${s}`).join(", ");
  let last = -1;
  for (const id of ids) {
    const at = SPEC_SECTIONS.indexOf(id);
    if (at < 0) return `Unknown section #${id}; sections are ${order}.`;
    if (at <= last) return `Section #${id} is out of order or repeated; sections follow ${order}.`;
    last = at;
  }
  if (JSON.stringify(hrefs) !== JSON.stringify(ids)) return "The contents rail must list exactly the sections on the page, in order.";
  if (/class="proof"/iu.test(html)) return "Proof stays in the Markdown; remove proof blocks from the visual spec.";
  if (/<p class="read">\s*Read:/iu.test(html)) return "Remove tenant read lines from the visual spec; reads stay in the Markdown.";
  if (text(article).length === 0) return "The article is empty.";
  return null;
}

/** The smallest spec that renders a conforming page. Used by fixtures and QA; a real spec goes through spec draft. */
export function specHtmlSkeleton({ title, app = "Portal", kind = "web app", summary = "" } = {}) {
  const line = summary || "What this spec changes.";
  const md = `# ${title}

## Requested outcome
${line}

## Touches
- app · ${app} · app_fixture

## Current state (READ)
| entity | id | read | fact the plan depends on | READ / INFERRED |
|---|---|---|---|---|
| ${app} | app_fixture | app overview | ${kind} | READ |

## Contract
### app · ${app}
${line}

## Proof
| entity | read-back | expected line |
|---|---|---|
| ${app} | app overview | unchanged |

## Ready when
- ${line}

## Open questions
None
`;
  return renderSpecHtml(md);
}
