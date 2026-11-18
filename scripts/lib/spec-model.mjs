// The visual spec's data, read from the spec Markdown alone. spec-html.mjs turns it into the page
// and spec-diagram.mjs into the picture of how the pieces connect. Pure: no files, no network.
import { RELATIONS, contractBlocks, parseSpecBody, relationItems, slug } from "./contracts.mjs";
import { parseFrontmatter } from "./formats.mjs";
import { markdownLines } from "./spec-markdown.mjs";
import { readJob } from "./page-jobs.mjs";

// ---------- text helpers ----------

/** Lowercases, trims, drops quotes, backticks and stars, and collapses spaces, for name matching. */
export function norm(s) {
  return String(s ?? "").trim().toLowerCase().replace(/[`"'*]/gu, "").replace(/\s+/gu, " ");
}

/** Capitalises the first letter of trimmed text. */
export function cap(s) {
  s = String(s ?? "").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Ends trimmed text with a full stop unless it already ends in punctuation. */
export function endDot(s) {
  s = String(s).trim();
  return s && !/[.!?…"”)]$/u.test(s) ? `${s}.` : s;
}

/** Cuts text to `n` characters at a word boundary, with an ellipsis. */
export function trunc(s, n = 150) {
  s = String(s).trim();
  return s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/u, "")}…`;
}

// Questionnaire references ("Round 1 Q6") are bookkeeping, not something a reviewer needs on the page.
function tidy(s) {
  return String(s ?? "").replace(/\s*\((?:(?:USER|READ)[:\s]*)?[^()]*Round \d[^()]*\)/gu, "").replace(/\s{2,}/gu, " ").trim();
}

/** The number of words in text. */
function words(s) {
  return String(s).trim().split(/\s+/u).filter(Boolean).length;
}

/** The lines of a Markdown section outside code fences. */
function visible(text) {
  return markdownLines(text).filter(l => !l.code).map(l => l.line);
}

/** The paragraphs of a Markdown section, each joined into one line. */
function paragraphs(text) {
  return visible(text).join("\n").trim().split(/\n\s*\n/u).map(p => p.replace(/\s*\n\s*/gu, " ").trim()).filter(Boolean);
}

/** The sentences of a paragraph, split after a full stop that a capital, digit or quote follows. */
function sentences(text) {
  return String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z0-9"“`])/u).map(s => s.trim()).filter(Boolean);
}

/** The clauses of a line, split at semicolons and arrows, each capitalised with a leading "and" or "then" dropped. */
function clauses(text) {
  return String(text ?? "").split(/;\s+|\s+→\s+/u).map(s => cap(s.trim().replace(/^(?:and|then)\s+/iu, ""))).filter(Boolean);
}

/** Trimmed text with one surrounding code span removed. */
function unquote(s) {
  return String(s).trim().replace(/^`([^`]*)`$/u, "$1");
}

/** A READ row starts with the read that settled it ("`cache app x`: fact"); the reviewer needs the fact. */
function stripReadLabel(s) {
  return String(s).replace(/^(?:`[^`]*`|[^:`]{1,40}?):\s+(?=\S)/u, m => (words(m) <= 5 ? "" : m));
}

/** Whether text names `name` as a whole word (case-insensitive). */
function mentions(text, name) {
  if (!name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "iu").test(text);
}

/** Split on commas that sit outside parentheses and quotes. */
export function topLevelSplit(text, sep = ",") {
  const parts = [];
  let depth = 0, quote = null, cur = "";
  for (const ch of String(text ?? "")) {
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "“" || ch === "`") {
      quote = ch === "“" ? "”" : ch;
      cur += ch;
      continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts.map(p => p.trim()).filter(Boolean);
}

/** Top-level list items with their nested children. Numbered or dashed. */
export function listItems(text) {
  const items = [];
  for (const line of visible(text)) {
    const top = /^(?: {0,1})(?:-|\*|\d+[.)])\s+(.*)$/u.exec(line);
    const sub = /^(?: {2,}|\t)(?:-|\*|\d+[.)])\s+(.*)$/u.exec(line);
    if (top) items.push({ text: top[1].trim(), children: [] });
    else if (sub && items.length) items.at(-1).children.push(sub[1].trim());
    else if (line.trim() && items.length && /^\s{2,}/u.test(line)) items.at(-1).text += ` ${line.trim()}`;
  }
  return items;
}

/** Items of a prose section: list items, else lines, else sentences of the one paragraph. */
export function items(text) {
  if (!text) return [];
  const list = listItems(text);
  if (list.length) return list;
  const lines = visible(text).map(l => l.trim()).filter(Boolean);
  if (lines.length > 1) return lines.map(t => ({ text: t, children: [] }));
  return sentences(lines[0] ?? "").map(t => ({ text: t, children: [] }));
}

/** `**Title** body`, `Title: body` or `Title — body` → { t, b }. A code span is never a title. */
export function splitTitle(text) {
  text = String(text).trim();
  let m = /^\*\*([^*]+)\*\*[:\s—–-]*\s*(.*)$/u.exec(text);
  if (m) return { t: m[1].trim(), b: m[2].trim() };
  m = /^([^:`]{2,60}?)\s*[:—–]\s+(.+)$/u.exec(text);
  if (m && words(m[1]) <= 7 && !/[.;]/u.test(m[1]) && !/^\d/u.test(m[2])) return { t: m[1].trim(), b: m[2].trim() };
  return { t: "", b: text };
}

/** The body rows of a Markdown table as cell arrays, without the header and the rule line. */
function tableRows(text) {
  return visible(text)
    .filter(l => /^\s*\|/u.test(l))
    .map(l => l.trim().replace(/^\||\|$/gu, "").split("|").map(c => c.trim()))
    .filter((row, i) => i !== 0 && !row.every(c => /^:?-{2,}:?$/u.test(c)));
}

/** One field of a field list: "`title` string (optional)", "name (type, rule)" or a bare name. */
function fieldRow(p) {
  const m = /^(.+?)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/u.exec(p);
  // "`title` string (optional)" and "`lines` list of …": a code-span name followed by its type.
  const coded = /^`([^`]+)`\s+(.+)$/u.exec(p);
  if (coded) {
    const opt = /\((optional|required[^)]*)\)\s*$/iu.exec(coded[2]);
    return { name: coded[1], type: opt ? coded[2].slice(0, opt.index).trim() : coded[2].trim(), rule: opt ? opt[1] : "" };
  }
  if (!m) return { name: unquote(p), type: "", rule: "" };
  const inner = topLevelSplit(m[2]);
  return { name: unquote(m[1]), type: inner[0] ?? "", rule: inner.slice(1).join(", ") };
}

/** "a (text, required), b (link X)" → [{ name, type, rule }], or null when the text is not a field list. */
export function fieldRows(text, { typed = true } = {}) {
  // Items are split at semicolons when the line has them, else at commas outside parentheses and quotes.
  const parts = (/;\s/u.test(text) ? text.split(/;\s+/u) : topLevelSplit(text)).map(p => p.replace(/\.$/u, "").trim()).filter(Boolean);
  const rows = parts.map(fieldRow);
  const withType = rows.filter(r => r.type).length;
  if (!rows.length || !rows.every(r => words(r.name) <= 5)) return null;
  // Under an explicit "Inputs:" or "Holds:" a plain list of names is a list; a sentence found by chance must look like fields to count.
  return typed ? (rows.length >= 2 && withType * 2 >= rows.length ? rows : null) : rows;
}

/** "CODE Label · CODE Label" → [{ code, label }]. */
function codeRows(text) {
  return topLevelSplit(text.replace(/\s+·\s+/gu, "|"), "|").map(p => {
    const m = /^(`[^`]+`|\S+)\s*(.*)$/u.exec(p.trim());
    return m ? { code: unquote(m[1]), label: m[2].trim() } : { code: p.trim(), label: "" };
  });
}

/** "a, b (serves X); c, for Y" → [{ index, serves }]. */
function indexRows(text) {
  return text.split(/;\s*/u).map(p => p.trim()).filter(Boolean).map(p => {
    let m = /^(.*?)\s*\((?:serves|for)\s+([^()]*)\)\s*$/iu.exec(p) ?? /^(.*?),\s*(?:serves|for)\s+(.*)$/iu.exec(p);
    return m ? { index: m[1].trim(), serves: m[2].trim() } : { index: p, serves: "" };
  });
}

const OK_ANSWER = /\b(ok true|saved|decided|sent|done|success|created|stored|updated|nothing due|approved)\b/iu;
const NO_ANSWER = /ok false|refus|fail|error|missing|already|cannot|not found|invalid|duplicate|forbidden|pending/iu;

/** One answer: "label: text", "label (text)" or "label text" → { label, body }. */
function splitAnswer(p) {
  const colon = /^([^:]{1,40}?):\s+(.+)$/u.exec(p);
  if (colon) return { label: colon[1], body: colon[2] };
  const paren = /^(\S+(?: \S+){0,3}?)\s+\((.+)\)$/u.exec(p);
  if (paren) return { label: paren[1], body: paren[2] };
  const first = /^(`[^`]+`|\S+)\s+(.*)$/u.exec(p);
  if (first && first[2]) return { label: first[1], body: first[2] };
  return { label: p, body: "" };
}

/** "label: text; label (when)" → [{ label, text, ok }]. */
function answerRows(text) {
  // Answers are split at semicolons when the line has them, else at commas outside parentheses and quotes.
  const parts = /;\s/u.test(text) ? text.split(/;\s+/u) : topLevelSplit(text);
  return parts.map(p => p.trim()).filter(Boolean).map((p, i) => {
    const { label, body } = splitAnswer(p);
    const ok = NO_ANSWER.test(label) && !OK_ANSWER.test(label) ? false : OK_ANSWER.test(label) || (i === 0 && !NO_ANSWER.test(label));
    return { label: unquote(label), text: body, ok };
  });
}

// Numbered steps split at their numbers (a semicolon inside one step stays); unnumbered ones split at semicolons.
function stepList(text, children = []) {
  let parts;
  if (children.length) parts = children;
  else if (/(^|\s)\d+[.)]\s/u.test(text)) parts = text.split(/\s+(?=\d+[.)]\s)/u);
  else parts = text.split(/;\s+/u);
  return parts.map(s => s.replace(/^\d+[.)]\s*/u, "").trim()).filter(Boolean);
}

// ---------- entity kinds ----------
export const KIND_LABEL = Object.freeze({
  app: "App",
  page: "Page",
  automation: "Automation",
  object: "Object",
  connection: "Connection",
  "ai-agent": "AI agent",
  dataset: "Dataset",
  metric: "Metric",
  experiment: "Experiment",
  api_group: "API group",
  api: "API",
  access_profile: "Access profile",
  policy: "Policy",
  "code-app": "Code app",
  "knowledge-set": "Knowledge set",
  client: "Client",
  env_variable: "Environment variable",
  connector: "Connector",
});
const PREFIX = { app: "app", page: "p", "code-app": "k", automation: "a", "ai-agent": "g", "knowledge-set": "n", object: "o", connection: "c",
  connector: "cn", dataset: "d", metric: "m", experiment: "x", env_variable: "e" };
// The card groups after the app and its pages, in page order; the first kind of each names its label.
const GROUPS = [
  ["code-app"],
  ["ai-agent"],
  ["knowledge-set"],
  ["automation"],
  ["object"],
  ["connection"],
  ["connector"],
  ["dataset", "metric", "experiment"],
  ["api_group", "api", "client", "access_profile", "policy"],
  ["env_variable"],
];
const GROUP_LABEL = {
  "ai-agent": "AI agents",
  automation: "Automations",
  object: "Objects",
  connection: "Connections",
  dataset: "Evaluations",
  api_group: "API Platform",
  "code-app": "Code apps",
  "knowledge-set": "Knowledge",
  connector: "Connectors",
  env_variable: "Environment variables",
};
const TAG = { USER: ["You said", "said"], READ: ["Read from the tenant", "read"], "N/A": ["Not needed here", "na"] };
const STATE_KEYS = [
  "loading", "empty", "error", "not found", "before first use", "submitting", "success", "duplicate", "refused", "saving",
];
const KNOWN_KEYS = new Set([
  "inputs", "holds", "fields", "indexes", "index", "steps", "what it does", "can answer", "answers", "results", "returns", "outputs",
  "menu today", "menu after", "stays the same", "unchanged", "called from", "trigger", "runs when", "calls", "opens", "reads", "writes", "uses",
  "unique", "seed", "seed rows", "used for", "message", "if it fails", "address", "path", "shows", ...STATE_KEYS,
]);
const ROWS_FOR = {
  page: ["ui_states"],
  app: ["ui_states"],
  object: ["data"],
  automation: ["integrations", "workflow"],
  connection: ["integrations"],
  "ai-agent": ["integrations"],
  dataset: ["data"],
  metric: ["data"],
  experiment: ["data"],
};
const KIND_WORDS = {
  page: ["page"],
  pages: ["page"],
  object: ["object"],
  objects: ["object"],
  table: ["object"],
  tables: ["object"],
  automation: ["automation"],
  automations: ["automation"],
  connection: ["connection"],
  connections: ["connection"],
  app: ["app"],
  application: ["app"],
};
const KIND_PREFIX_RE = new RegExp(`^(${Object.keys(KIND_LABEL).join("|")})\\s*·\\s*(.+)$`, "iu");
const ADDRESS_KEY_RE = /^(address|path)$/iu;

/** The frontmatter and body of a spec; Markdown with no readable frontmatter is all body. */
function specBody(md) {
  try {
    return parseFrontmatter(md);
  } catch {
    return { meta: {}, body: md };
  }
}

// ---------- entities ----------
// The functions below share one context: the Touches list, each touch's entity (`byTouch`), the
// app touch, and the ids already handed out. buildSpecModel makes it and passes it along.

/** A fresh entity for a Touches entry, with every list empty and every relation map ready. */
function newEntity(t, id) {
  return {
    ref: t,
    id,
    name: t.name,
    kind: t.kind,
    kindLabel: KIND_LABEL[t.kind] ?? t.kind,
    why: "",
    details: [],
    relations: Object.fromEntries(Object.keys(RELATIONS).map(k => [k, []])),
    reverse: Object.fromEntries(Object.keys(RELATIONS).map(k => [k, []])),
    inputs: null,
    outputs: null,
    steps: [],
    answers: [],
    fields: null,
    codes: [],
    indexes: [],
    states: [],
    menu: { today: [], after: [] },
    stays: [],
    job: null,
    regions: [],
    loose: [],
  };
}

/** A unique node id for a touch: a kind letter, the name's slug, and a counter when the slug is taken. */
function nodeId(ctx, t) {
  const base = `${PREFIX[t.kind] ?? "t"}-${slug(t.name) || "x"}`;
  let id = base, n = 2;
  while (ctx.used.has(id)) id = `${base}-${n++}`;
  ctx.used.add(id);
  return id;
}

/** The touch a label names, by name or id; "kind · name" fixes the kind, else `kinds` limits it. */
function findTouch(ctx, label, kinds) {
  const typed = KIND_PREFIX_RE.exec(String(label).trim());
  const n = norm(typed ? typed[2] : label);
  const allowed = typed ? [typed[1].toLowerCase()] : kinds;
  return ctx.touches.find(t => (!allowed || allowed.includes(t.kind)) && (norm(t.name) === n || (t.id && norm(t.id) === n)));
}

/** The touch with the longest name that text mentions, among `kinds` when given. */
function longestMatch(ctx, text, kinds) {
  return ctx.touches
    .filter(t => (!kinds || kinds.includes(t.kind)) && mentions(text, t.name))
    .sort((a, b) => b.name.length - a.name.length)[0];
}

/** The relation whose bullet key matches ("Calls" → calls), or undefined. */
function relationKey(key) {
  return Object.keys(RELATIONS).find(k => norm(RELATIONS[k].key) === norm(key));
}

/** Records a relation bullet's targets on the entity and the reverse on each target. */
function addRelation(ctx, ent, key, text) {
  for (const item of relationItems(text)) {
    // "Portal (beta)" is tried whole before its parenthesis is read as a note.
    const target = findTouch(ctx, item.raw, RELATIONS[key].kinds) ?? findTouch(ctx, item.name, RELATIONS[key].kinds) ?? findTouch(ctx, item.raw) ?? findTouch(ctx, item.name);
    if (!target || target === ent.ref) continue;
    const to = ctx.byTouch.get(target);
    ent.relations[key].push({ target: to, note: item.note });
    to.reverse[key].push({ source: ent, note: item.note });
  }
}

/** "`amount` — number, required — the line amount": a field written as its own bullet. True when it was one. */
function addFieldBullet(ent, text) {
  const field = /^`([^`]+)`\s*[—–-]+\s*(.+)$/u.exec(String(text).trim());
  if (!field) return false;
  const [type = "", ...rest] = field[2].split(/\s*[—–]\s*/u);
  const inner = topLevelSplit(type);
  (ent.fields ??= []).push({ name: field[1], type: inner[0] ?? "", rule: [inner.slice(1).join(", "), ...rest].filter(Boolean).join(" — ") });
  return true;
}

/** The key and value of a detail bullet: a title split, or a known key before a colon that splitTitle refused. */
function detailKeyValue(text) {
  let { t: key, b: value } = splitTitle(text);
  const direct = /^([^:`]{2,40}?):\s+([\s\S]+)$/u.exec(String(text).trim());
  if (!key && direct && KNOWN_KEYS.has(norm(direct[1]).replace(/\s*\([^)]*\)\s*$/u, ""))) {
    key = direct[1];
    value = direct[2];
  }
  return { key, value };
}

/** Stores a structured list under its known key. True when the key was one of them. */
function addKnownDetail(ent, k, key, value, children) {
  if (k === "inputs") {
    if (/^(none|nothing|—|-)\.?$/iu.test(value)) {
      ent.inputs = [];
      return true;
    }
    ent.inputs = fieldRows(value, { typed: false }) ?? ent.inputs;
    if (!ent.inputs) ent.details.push([key, value]);
    return true;
  }
  if (k === "holds" || k === "fields") {
    ent.fields = fieldRows(value, { typed: false }) ?? ent.fields;
    if (!ent.fields) ent.details.push([key, value]);
    return true;
  }
  if (/\bcodes$/u.test(k)) {
    ent.codes.push({ title: key, rows: codeRows(value) });
    return true;
  }
  if (k === "indexes" || k === "index") {
    ent.indexes.push(...indexRows(value));
    return true;
  }
  if (k === "steps" || k === "what it does") {
    ent.steps.push(...stepList(value, children));
    return true;
  }
  if (k === "can answer" || k === "answers") {
    ent.answers.push(...answerRows(value));
    return true;
  }
  if (k === "results" || k === "returns" || k === "outputs") {
    ent.outputs = fieldRows(value, { typed: false }) ?? ent.outputs;
    if (!ent.outputs) ent.details.push(["Returns", value]);
    return true;
  }
  if (k === "called from" || k === "trigger" || k === "runs when") {
    ent.details.push(["Runs when", value]);
    return true;
  }
  if (k === "menu today") {
    ent.menu.today = topLevelSplit(value);
    return true;
  }
  if (k === "menu after") {
    ent.menu.after = topLevelSplit(value);
    return true;
  }
  if (k === "stays the same" || k === "unchanged") {
    ent.stays.push(...topLevelSplit(value));
    return true;
  }
  if (STATE_KEYS.includes(k)) {
    ent.states.push([cap(key), value]);
    return true;
  }
  return false;
}

/** One `- Key: value` bullet under an entity: a relation, a structured list, a state, or a plain fact. */
function addDetail(ctx, ent, text, children = []) {
  if (addFieldBullet(ent, text)) return;
  const { key, value } = detailKeyValue(text);
  if (!value && !children.length) return;
  const k = norm(key).replace(/\s*\([^)]*\)\s*$/u, "");
  const rel = relationKey(key);
  if (rel) {
    addRelation(ctx, ent, rel, value);
    return;
  }
  if (addKnownDetail(ent, k, key, value, children)) return;
  const line = planLine(text, children);
  if (line) {
    placePlanLine(ctx, line, ent);
    return;
  }
  ent.details.push([key, value]);
  for (const c of children) {
    const sub = splitTitle(c);
    if (sub.b) ent.details.push([sub.t, sub.b]);
  }
}

/** A `job ·`, `design ·` or `app look ·` line, read into the entity it names. */
function planLine(text, children = []) {
  const m = /^(job|design|app look)\s*·\s*(.+?):\s*(.*)$/iu.exec(String(text).trim());
  return m ? { kind: m[1].toLowerCase(), name: m[2].trim(), rest: m[3].trim(), children } : null;
}

/** One design region line: "<weight> · <region>: <text> · serves <part>" → { weight, region, text, serves }. */
function readRegion(c) {
  const sep = c.indexOf("·");
  const weight = sep < 0 ? "support" : c.slice(0, sep).trim().toLowerCase();
  const rest = sep < 0 ? c : c.slice(sep + 1).trim();
  const serves = /\s+·\s+serves\s+(.*)$/iu.exec(rest);
  const body = serves ? rest.slice(0, serves.index) : rest;
  const colon = body.indexOf(":");
  return {
    weight,
    region: colon < 0 ? body.trim() : body.slice(0, colon).trim(),
    text: colon < 0 ? "" : body.slice(colon + 1).trim(),
    serves: serves ? serves[1].trim() : "",
  };
}

/** Puts a plan line on the page or app it names (else `fallback`). False when no entity takes it. */
function placePlanLine(ctx, line, fallback) {
  const target = findTouch(ctx, line.name, line.kind === "app look" ? ["app"] : ["page"])
    ?? longestMatch(ctx, line.name)
    ?? fallback?.ref;
  if (!target) return false;
  const ent = ctx.byTouch.get(target);
  if (line.kind === "job") {
    const { parts, answers } = readJob(line.rest);
    ent.job = { for: parts.for ?? "", answers, mainAction: parts["main action"] ?? "", states: parts.states ?? "", signals: parts.signals ?? "" };
  } else if (line.kind === "design") {
    ent.regions = line.children.map(readRegion);
  } else {
    ent.details.push(["Look", line.rest]);
  }
  return true;
}

/** Reads prose about an entity: the first clause becomes its one-liner (or its fields), the rest its details. */
function absorb(ctx, ent, text, children = []) {
  const parts = clauses(text);
  if (!ent.why) {
    const first = parts.shift() ?? "";
    const fields = fieldRows(first);
    if (fields && fields.length >= 3) {
      ent.fields = ent.fields ?? fields;
      ent.why = `${fields.length} fields: ${trunc(fields.map(f => f.name).join(", "), 110)}`;
    } else {
      ent.why = trunc(endDot(first), 170);
    }
  }
  for (const p of parts) addDetail(ctx, ent, p);
  for (const c of children) addDetail(ctx, ent, c);
}

/** The touch a Contract block heading names: by typed name, by id, by mention, or the app for a menu block. */
function blockTouch(ctx, block) {
  // A block headed "Navigation" or "Menu" is about the app.
  return block.names.map(n => findTouch(ctx, block.kind ? `${block.kind} · ${n}` : n) ?? findTouch(ctx, n)).find(Boolean)
    ?? (block.id ? findTouch(ctx, block.id) : null)
    ?? longestMatch(ctx, block.name)
    ?? (!block.kind && /^(navigation|menu|app menu)$/iu.test(block.name) ? ctx.app : null);
}

/** Reads a Contract written as `### kind · name` blocks; a block that names no entity goes to `loose`. */
function readContractBlocks(ctx, blocks, preamble, loose) {
  for (const block of blocks) {
    const t = blockTouch(ctx, block);
    const text = block.lines.join("\n");
    const paras = paragraphs(text.replace(/^\s*(?:-|\*)\s.*$/gmu, ""));
    const bullets = listItems(text);
    if (!t) {
      loose.push({ label: `${block.kind} · ${block.name}`, text: paras.join(" "), children: bullets.map(b => b.text) });
      continue;
    }
    const ent = ctx.byTouch.get(t);
    if (paras[0]) ent.why = trunc(paras[0], 170);
    // "### page · My Claims · path `/my-claims`": the heading's last part may carry the address.
    const headAddr = /^(?:path\s+|address\s+)?`?(\/[^`\s]+)`?$/iu.exec(block.id ?? "");
    if (headAddr && !ent.details.some(([k]) => ADDRESS_KEY_RE.test(k))) ent.details.push(["Address", headAddr[1]]);
    for (const b of bullets) addDetail(ctx, ent, b.text, b.children);
  }
  for (const entry of items(preamble.join("\n"))) {
    const line = planLine(entry.text, entry.children);
    if (line) placePlanLine(ctx, line);
    else loose.push({ label: entry.text.replace(/[(:,].*$/su, "").trim(), text: entry.text, children: entry.children });
  }
}

/** Reads a Contract written as a flat list; each item goes to the entity its label or text names, else to `loose`. */
function readContractItems(ctx, text, loose) {
  for (const entry of items(text)) {
    const line = planLine(entry.text, entry.children);
    if (line) {
      if (!placePlanLine(ctx, line)) {
        loose.push({ label: `${line.kind} · ${line.name}`, text: entry.text, children: entry.children });
      }
      continue;
    }
    const label = /^([^:]{1,60}?):\s/u.exec(entry.text)?.[1] ?? "";
    const rest = label ? entry.text.slice(label.length + 1).trim() : entry.text;
    const kinds = KIND_WORDS[norm(label)];
    let t = label ? findTouch(ctx, label) : null;
    if (!t && kinds) {
      // "Pages: the list page shows …; the detail page …": each clause goes to the page it mentions.
      let placed = false;
      for (const c of clauses(rest)) {
        const tt = longestMatch(ctx, c, kinds);
        if (tt) {
          absorb(ctx, ctx.byTouch.get(tt), c);
          placed = true;
        } else {
          loose.push({ label, text: c, children: [] });
        }
      }
      if (placed) continue;
    }
    if (!t) t = longestMatch(ctx, entry.text);
    if (!t) {
      loose.push({ label: label || entry.text.replace(/[(:,].*$/su, "").trim(), text: rest, children: entry.children });
      continue;
    }
    absorb(ctx, ctx.byTouch.get(t), rest, entry.children);
  }
}

/** Gives every loose note to the one page (or the one entity) of the spec, when there is exactly one. */
function absorbLooseIntoHome(ctx, loose, home) {
  if (!loose.length || !home) return;
  for (const l of loose.splice(0)) {
    const text = l.label && l.text && !l.text.startsWith(l.label) ? `${l.label}: ${l.text}` : l.text || l.label;
    absorb(ctx, home, text, l.children);
  }
}

/** An entity the Contract never describes is often described by name in a checklist row ("Invoice detail: PDF preview, …"). */
function describeFromChecklist(ctx, ents, req) {
  for (const ent of ents) {
    if (ent.why) continue;
    for (const id of ROWS_FOR[ent.kind] ?? []) {
      const parts = tidy(req[id]?.answer ?? "").split(/(?:;|\.)\s+(?=[A-Z0-9"“`/])/u);
      const hit = parts.find(p => {
        const { t } = splitTitle(p);
        return t && norm(t.replace(/^(?:USER|READ)\s*[—–-]\s*/u, "")) === norm(ent.name);
      });
      if (hit) {
        absorb(ctx, ent, splitTitle(hit).b);
        break;
      }
    }
  }
}

/** The address of an entity: its Address or path detail, else for a page the first `/path` its text mentions. */
function addressOf(ent) {
  const detail = ent.details.find(([k]) => ADDRESS_KEY_RE.test(k))?.[1];
  if (detail != null) return detail;
  if (ent.kind !== "page") return "";
  const text = `${ent.why} ${ent.details.map(d => d.join(" ")).join(" ")}`;
  // A slash inside a URL ("https://docs.example.com/guide") is not a page address.
  return text.match(/(?<![\w/:.])(\/[a-z0-9][a-z0-9_:/-]*)/iu)?.[1] ?? "";
}

/** An automation's one-liner from its "Runs when" detail, or "" when it has none. */
function whyFromRunsWhen(ent) {
  const runs = ent.details.find(([k]) => k === "Runs when")?.[1];
  if (!runs) return "";
  if (/^(when|on|from)\b/iu.test(runs)) return cap(`Runs ${runs}`);
  if (/^(the|a|an)\b/iu.test(runs)) return cap(`Called from ${runs}`);
  return cap(`Runs when ${runs}`);
}

/** A page's one-liner from its job: who it is for and its main action. */
function whyFromJob(job) {
  const forPart = job.for ? `for ${job.for}` : "";
  const actionPart = job.mainAction && !/^none\b/iu.test(job.mainAction) ? `main action: ${job.mainAction}` : "";
  return cap([forPart, actionPart].filter(Boolean).join("; ")) + ".";
}

/** The one-liner of an entity nothing described: by kind, by action, by its READ fact, or a plain note. */
function defaultWhy(ent, { pages, rel, fact }) {
  const t = ent.ref;
  if (t.kind === "app") {
    if (pages.length) return `Gets the ${pages.length === 1 ? "page" : "pages"} above${rel ? " and is published" : ""}.`;
    return rel ? "Published with this change." : "Changed by this spec.";
  }
  if (t.kind === "connection") return "Already connected; reused as it is.";
  if (ent.action === "Read only") return "Only read. Nothing in it changes.";
  return fact ? trunc(fact.fact) : "Named in Touches; the contract does not describe it on its own.";
}

/** Settles each entity's action, READ fact, release, address and one-liner once every Contract line is read. */
function finishEntities(ents, { pages, askFirst, releaseFor, factFor, readOnly }) {
  for (const ent of ents) {
    const t = ent.ref, rel = releaseFor(t), fact = factFor(t);
    ent.action = !t.id ? "New" : t.kind === "connection" ? "Reused" : readOnly(t) ? "Read only" : "Updated";
    ent.fact = fact?.fact ?? "";
    ent.release = rel ? { action: rel.action, ask: askFirst } : null;
    ent.address = unquote(addressOf(ent).replace(/[,.;].*$/u, "").trim());
    ent.details = ent.details.filter(([k]) => !ADDRESS_KEY_RE.test(k));
    // A page with only its job and design lines is described by its job.
    if (!ent.why && ["automation", "ai-agent"].includes(t.kind)) ent.why = whyFromRunsWhen(ent);
    if (!ent.why && ent.job) ent.why = whyFromJob(ent.job);
    if (!ent.why) ent.why = defaultWhy(ent, { pages, rel, fact });
  }
}

/** The card groups: the app with its pages first, then one group per kind family that has entities. */
function groupEntities(ents, { pageEnts }) {
  const groups = [];
  const apps = ents.filter(e => e.kind === "app");
  if (pageEnts.length || apps.length) {
    // A new app leads its pages; an existing app follows them. Every app gets its card, however many a spec touches.
    const appEnts = [...apps.filter(a => !a.ref.id), ...pageEnts, ...apps.filter(a => a.ref.id)];
    const label = apps.length === 1 ? `Application · ${apps[0].name}` : apps.length ? "Applications" : "Application";
    groups.push({ kind: "page", label, filterLabel: "Pages", ents: appEnts });
  }
  for (const kinds of GROUPS) {
    const rows = ents.filter(e => kinds.includes(e.kind));
    if (rows.length) groups.push({ kind: kinds[0], label: GROUP_LABEL[kinds[0]], filterLabel: GROUP_LABEL[kinds[0]], ents: rows });
  }
  // A kind no group names still gets its card: no Touches entity is ever left off the page.
  const placed = new Set(groups.flatMap(g => g.ents));
  const rest = ents.filter(e => !placed.has(e));
  if (rest.length) groups.push({ kind: "other", label: "Other", filterLabel: "Other", ents: rest });
  return groups;
}

// ---------- the other sections ----------

/** Who it's for: "Role · how many · what they do" list items, else the users_access answer split into clauses. */
function readPeople(S, answer) {
  const people = listItems(S["Who it's for"] ?? "").map(i => {
    const [name = "", count = "", ...rest] = i.text.split(/\s*·\s*/u);
    return rest.length ? { name, count, does: rest.join(" · ") } : { name, count: "", does: count };
  });
  if (people.length || !answer("users_access")) return people;
  return clauses(answer("users_access")).map(c => {
    const { t, b } = splitTitle(c);
    return { name: t, count: "", does: endDot(b) };
  });
}

/** Journey: "Step · who · what" lines, else the workflow row split at its arrows. */
function readJourney(S, answer, ents) {
  const automationByName = name => ents.find(e => ["automation", "ai-agent"].includes(e.kind) && norm(e.name) === norm(name)) ?? null;
  const journey = listItems(S["How it moves"] ?? S.Journey ?? "").map(i => {
    const [title = "", who = "", ...rest] = i.text.split(/\s*·\s*/u);
    if (rest.length) return { title, who, body: rest.join(" · "), auto: automationByName(who) };
    if (who) return { title, who: "", body: who, auto: null };
    const { t, b } = splitTitle(title);
    return { title: t, who: "", body: cap(b), auto: null };
  });
  if (journey.length || !answer("workflow")) return journey;
  const w = answer("workflow");
  const steps = w.includes("→") ? w.split(/\s*→\s*/u) : w.includes(";") ? w.split(/;\s*/u) : sentences(w);
  return steps.map(s => cap(s.replace(/^(?:then|and)\s+/iu, ""))).filter(Boolean).map(s => {
    const { t, b } = splitTitle(s);
    return { title: t, who: "", body: endDot(cap(b)), auto: null };
  });
}

/** Rules: the Business rules items and their children, else the rules answer split into clauses. */
function readRules(S, answer) {
  const ruleItems = items(S["Business rules"] ?? "");
  const ruleRows = [...ruleItems.map(i => i.text), ...ruleItems.flatMap(i => i.children)].map(splitTitle);
  return ruleRows.length ? ruleRows : clauses(answer("rules")).map(c => splitTitle(endDot(c)));
}

/** Failures: "What breaks: what the person sees · what happens to the data", else the failures answer. */
function readFailures(S, answer) {
  const failRows = items(S["When it goes wrong"] ?? S.Failures ?? "").map(i => {
    const { t, b } = splitTitle(i.text);
    const [sees = "", ...data] = b.split(/\s+·\s+/u);
    return { t, sees, data: data.join(" · ") };
  });
  if (failRows.length) return failRows;
  return clauses(answer("failures")).map(c => {
    const { t, b } = splitTitle(endDot(c));
    return { t, sees: b, data: "" };
  });
}

/** One row per deploy or publish line of Ready when, with the entity it releases. */
function readReleaseRows(releases, ctx, ents, askFirst) {
  return releases.map(r => {
    const ent = r.ref ? ctx.byTouch.get(r.ref) ?? ents.find(e => norm(e.name) === norm(r.ref.name)) : null;
    return {
      title: `${r.action === "deploy" ? "Deploy" : "Publish"} ${r.ref?.name ?? ""}`,
      body: r.action === "deploy" ? "Makes the automation live." : `People see the change in ${r.ref?.name ?? "the app"}.`,
      gate: askFirst ? "Asks you first" : "",
      ent,
    };
  });
}

/** The page's data, read from the spec Markdown alone. */
export function buildSpecModel(md) {
  const { meta: fm, body } = specBody(md);
  const spec = parseSpecBody(body);
  const S = spec.sections, touches = spec.touches, releases = spec.releases;
  // The 12-row checklist is optional: a spec without one has no decisions and no fallbacks from it.
  const checklist = spec.requirements?.items ?? [];
  const req = Object.fromEntries(checklist.map(i => [i.id, i]));
  /** A checklist answer, tidied; a READ answer loses the read that settled it. */
  const answer = (id) => {
    const item = req[id];
    if (!item?.answer) return "";
    const a = tidy(item.answer);
    return item.source === "READ" ? stripReadLabel(a) : a;
  };
  const askFirst = fm.askBeforeDeploy !== false && fm.askBeforeDeploy !== "false";

  const app = touches.find(t => t.kind === "app");
  const pages = touches.filter(t => t.kind === "page");
  // The platform reports a mobile app as appType MOBILE; the phrase "mobile app" counts too, the bare word does not ("no mobile UI").
  const mobile = /\bMOBILE\b|\bmobile app\b/u.test(`${S["Current state (READ)"]} ${answer("constraints")}`);
  const appKind = app ? (mobile ? "mobile app" : "web app") : "";
  const meta = [app?.name, appKind, "final spec"].filter(Boolean).join(" · ");

  // Overview
  const outcome = paragraphs(S["Requested outcome"]);
  const summary = outcome[0] ?? "";
  const readyLines = items(S["Ready when"]).map(i => i.text).filter(t => !/^(deploy|publish)\s/iu.test(t));
  const today = S.Today ? paragraphs(S.Today).join(" ") : outcome.slice(1).find(p => /^today\b/iu.test(p)) ?? "";
  const after = S.After ? paragraphs(S.After).join(" ") : readyLines.slice(0, 2).map(endDot).join(" ");
  const scopeText = paragraphs(S.Scope ?? "").join(" ");
  const scopeSentences = sentences(scopeText);
  const leftOut = S["Out of scope"]
    ? paragraphs(S["Out of scope"]).join(" ")
    : scopeSentences.find(s => /^(excluded|out of scope|not included|no other|nothing else)/iu.test(s)) ?? "";
  const scopeShort = scopeSentences.filter(s => s !== leftOut).slice(0, 2).join(" ");

  // People
  const people = readPeople(S, answer);

  // Current state facts by entity
  const facts = tableRows(S["Current state (READ)"]).map(r => ({
    entity: r[0] ?? "",
    id: r[1] ?? "",
    fact: r[3] ?? "",
    inferred: /inferred/iu.test(r[4] ?? ""),
  }));
  /** The READ (not inferred) fact for a touch, by name or id, unless the row says the entity was not found. */
  const factFor = t => facts.find(f =>
    !f.inferred
    && (norm(f.entity) === norm(t.name) || (t.id && norm(f.id) === norm(t.id)))
    && !/^(not found|missing|—|-)/iu.test(f.fact));

  // Entities: one per Touches entry, then the Contract read onto them.
  const ctx = { touches, app, byTouch: new Map(), used: new Set() };
  const ents = touches.map(t => newEntity(t, nodeId(ctx, t)));
  for (const ent of ents) ctx.byTouch.set(ent.ref, ent);

  const contractLines = (S.Contract ?? "").split("\n");
  const { blocks, preamble } = contractBlocks(contractLines);
  const loose = [];
  if (blocks.length) readContractBlocks(ctx, blocks, preamble, loose);
  else readContractItems(ctx, S.Contract ?? "", loose);
  const home = pages.length === 1 ? ctx.byTouch.get(pages[0]) : touches.length === 1 ? ents[0] : null;
  absorbLooseIntoHome(ctx, loose, home);
  describeFromChecklist(ctx, ents, req);

  /** The Ready when release line for a touch, by reference or by kind and name. */
  const releaseFor = t => releases.find(r => r.ref === t || (norm(r.ref?.name) === norm(t.name) && r.ref?.kind === t.kind));
  /** Whether the scope, or the scope and data answers, call an existing object read-only. */
  const readOnlyText = `${scopeText} ${answer("scope")} ${answer("data")}`;
  const readOnly = t => {
    if (t.kind !== "object" || !t.id) return false;
    const name = t.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(`${name}[^.;]*read[- ]only|read[- ]only[^.;]*${name}`, "iu").test(readOnlyText);
  };
  finishEntities(ents, { pages, askFirst, releaseFor, factFor, readOnly });
  const appEnt = app ? ctx.byTouch.get(app) : null;
  const pageEnts = pages.map(t => ctx.byTouch.get(t));
  const groups = groupEntities(ents, { pageEnts });

  const journey = readJourney(S, answer, ents);
  const rules = readRules(S, answer);
  const failures = readFailures(S, answer);

  const assumptions = facts.filter(f => f.inferred).map(f => ({ title: f.entity, body: f.fact }));
  const decisions = checklist.filter(i => i.answer).map(i => {
    const [tag, cls] = TAG[i.source] ?? ["", ""];
    return { id: i.id, title: i.label, tag, cls, body: cap(answer(i.id)) };
  });
  const releaseRows = readReleaseRows(releases, ctx, ents, askFirst);
  const rollout = cap(answer("rollout"));
  const acceptance = [...readyLines.map(endDot), ...clauses(answer("acceptance")).map(endDot)].filter((v, i, a) => a.indexOf(v) === i);
  const notProven = items(S["Not proven when done"] ?? "").map(i => i.text);
  const openQuestions = paragraphs(S["Open questions"] ?? "").join(" ") || "None";

  return {
    title: spec.title,
    app: app ? { name: app.name, id: app.id ?? "", ent: appEnt } : null,
    appKind,
    meta,
    summary,
    today,
    after,
    scopeShort,
    leftOut,
    people,
    ents,
    groups,
    loose,
    journey,
    rules,
    failures,
    assumptions,
    decisions,
    releaseRows,
    rollout,
    acceptance,
    notProven,
    openQuestions,
    askFirst,
  };
}
