/** Pure parsers and renderers for UnifyApps Headless's string columns. */

function splitFlow(value, delimiter = ",") {
  const parts = [];
  let quote = null, depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote) {
      if (char === quote && value[i - 1] !== "\\") quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "[" || char === "{") depth++;
    else if (char === "]" || char === "}") depth--;
    else if (char === delimiter && depth === 0) { parts.push(value.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function colonIndex(value) {
  let quote = null, depth = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote) { if (char === quote && value[i - 1] !== "\\") quote = null; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === "[" || char === "{") depth++;
    else if (char === "]" || char === "}") depth--;
    else if (char === ":" && depth === 0) return i;
  }
  return -1;
}

// Plans are read from tenant records other people can write. A key such as
// `__proto__` would swap the parsed object's prototype and fake its fields.
function yamlKey(key) {
  if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error(`Invalid YAML key: ${key}`);
  return key;
}

function scalar(value) {
  const source = value.trim();
  if (!source) return "";
  try { return JSON.parse(source); } catch { /* Standard YAML scalars follow. */ }
  if (source.startsWith("'") && source.endsWith("'")) return source.slice(1, -1).replace(/''/gu, "'");
  if (source === "true") return true;
  if (source === "false") return false;
  if (source === "null" || source === "~") return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(source)) return Number(source);
  if (source.startsWith("[") && source.endsWith("]")) {
    const inner = source.slice(1, -1).trim();
    return inner ? splitFlow(inner).map(scalar) : [];
  }
  if (source.startsWith("{") && source.endsWith("}")) {
    const inner = source.slice(1, -1).trim();
    const output = {};
    if (inner) for (const item of splitFlow(inner)) {
      const index = colonIndex(item);
      if (index < 0) throw new Error(`Invalid YAML object item: ${item}`);
      output[yamlKey(String(scalar(item.slice(0, index))))] = scalar(item.slice(index + 1));
    }
    return output;
  }
  // Comments are recognized only when separated by whitespace, so URLs and
  // a quoted arbitrary string are never silently shortened.
  return source.replace(/\s+#.*$/u, "");
}

function parseYaml(source) {
  const rows = source.replace(/\r\n?/gu, "\n").split("\n").map((line) => ({
    indent: /^ */u.exec(line)[0].length, text: line.trim(),
  })).filter((row) => row.text && !row.text.startsWith("#"));
  if (!rows.length) return {};
  let cursor = 0;
  const parseNode = (indent) => {
    const array = rows[cursor]?.text.startsWith("- ");
    const result = array ? [] : {};
    while (cursor < rows.length && rows[cursor].indent === indent && rows[cursor].text.startsWith("- ") === array) {
      const row = rows[cursor++];
      if (array) {
        const item = row.text.slice(2).trim();
        if (!item) result.push(cursor < rows.length && rows[cursor].indent > indent ? parseNode(rows[cursor].indent) : null);
        else {
          const index = colonIndex(item);
          if (index >= 0 && /:\s/u.test(item.slice(index, index + 2))) {
            const key = yamlKey(item.slice(0, index).trim());
            const rest = item.slice(index + 1).trim();
            const object = { [key]: rest ? scalar(rest) : (cursor < rows.length && rows[cursor].indent > row.indent ? parseNode(rows[cursor].indent) : null) };
            if (cursor < rows.length && rows[cursor].indent > indent) {
              const siblings = parseNode(rows[cursor].indent);
              if (siblings && !Array.isArray(siblings) && typeof siblings === "object") Object.assign(object, siblings);
            }
            result.push(object);
          } else result.push(scalar(item));
        }
      } else {
        const index = colonIndex(row.text);
        if (index < 0) throw new Error(`Invalid YAML line: ${row.text}`);
        const key = yamlKey(row.text.slice(0, index).trim());
        const rest = row.text.slice(index + 1).trim();
        result[key] = rest ? scalar(rest) : (cursor < rows.length && rows[cursor].indent > indent ? parseNode(rows[cursor].indent) : null);
      }
      if (cursor < rows.length && rows[cursor].indent < indent) break;
      if (cursor < rows.length && rows[cursor].indent > indent) throw new Error(`Unexpected YAML indent near ${rows[cursor].text}`);
    }
    return result;
  };
  const result = parseNode(rows[0].indent);
  if (cursor !== rows.length) throw new Error(`Unsupported YAML near ${rows[cursor].text}`);
  if (Array.isArray(result)) throw new Error("Frontmatter must be an object.");
  return result;
}

export function parseFrontmatter(text) {
  const source = String(text ?? "").replace(/\r\n?/gu, "\n");
  if (!source.startsWith("---\n")) return { meta: {}, body: source };
  const close = source.indexOf("\n---\n", 4);
  if (close < 0) throw new Error("Frontmatter has no closing --- line.");
  return { meta: parseYaml(source.slice(4, close)), body: source.slice(close + 5) };
}

export function renderFrontmatter(meta, body = "") {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new TypeError("Frontmatter meta must be an object.");
  const lines = Object.entries(meta).filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n${String(body ?? "")}`;
}

function escapeMd(value) {
  return String(value ?? "").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;")
    .replace(/\|/gu, "\\|").replace(/`/gu, "\\`");
}

const taskFence = /(?:^|\n)```json nebula-tasks\s*\n([\s\S]*?)\n```(?=\n|$)/u;

export function parsePlan(text) {
  const { meta, body } = parseFrontmatter(text);
  const match = taskFence.exec(body);
  if (!match) throw new Error("Plan is missing the json nebula-tasks block.");
  let tasks;
  try { tasks = JSON.parse(match[1]); } catch (error) { throw new Error(`Invalid nebula-tasks JSON: ${error.message}`); }
  if (!Array.isArray(tasks)) throw new Error("nebula-tasks must be an array.");
  const markdown = (body.slice(0, match.index) + body.slice(match.index + match[0].length)).trim();
  return { meta, tasks, markdown };
}

export function isUaPlan(record) {
  const caseId = record?.properties?.caseId;
  if (caseId === "claude_code") return true; // Plans saved by older plugin versions.
  if (caseId != null && caseId !== "") return false;
  try { return parsePlan(record?.properties?.plan).meta.nebula === 3; }
  catch { return false; }
}

export function renderPlan(meta, tasks) {
  if (!Array.isArray(tasks)) throw new TypeError("Plan tasks must be an array.");
  const lines = ["## Plan", "", `Goal: ${escapeMd(meta?.title)}`, "", "| id | kind | entity | dependsOn | status | attempts |", "|---|---|---|---|---|---:|"];
  for (const task of tasks) {
    lines.push(`| ${escapeMd(task.id)} | ${escapeMd(task.kind)} | ${escapeMd(task.entity?.name)} | ${escapeMd((task.dependsOn ?? []).join(", "))} | ${escapeMd(task.status)} | ${escapeMd(task.attempts ?? 0)} |`);
  }
  for (const task of tasks) {
    lines.push("", `### ${escapeMd(task.id)} · ${escapeMd(task.title)}`, "", `Body:`, ...String(task.body ?? "").split("\n").map((line) => escapeMd(line)), "", `Proof: ${escapeMd(task.proof)}`);
    const result = task.result ?? {};
    if (result.ids && Object.keys(result.ids).length) lines.push(`Result IDs: ${escapeMd(JSON.stringify(result.ids))}`);
    for (const item of result.readBack ?? []) lines.push(`Read back: ${escapeMd(item)}`);
    for (const item of result.unverified ?? []) lines.push(`Unverified: ${escapeMd(item)}`);
    for (const item of result.notes ?? []) lines.push(`Note: ${escapeMd(item)}`);
    if (task.error) lines.push(`Error: ${escapeMd(task.error)}`);
  }
  lines.push("", "```json nebula-tasks", JSON.stringify(tasks, null, 2), "```", "");
  return renderFrontmatter(meta, lines.join("\n"));
}

const memoryNames = ["Decisions", "Corrections", "Errors", "Notes"];

export function parseMemory(text) {
  const result = { decisions: [], corrections: [], errors: [], notes: [] };
  let section;
  for (const line of String(text ?? "").replace(/\r\n?/gu, "\n").split("\n")) {
    const heading = /^##\s+(Decisions|Corrections|Errors|Notes)\s*$/iu.exec(line);
    if (heading) { section = heading[1].toLowerCase(); continue; }
    if (/^#{1,6}\s+\S/u.test(line)) { section = undefined; continue; }
    if (section && /^\s*-\s+/u.test(line)) result[section].push(line.replace(/^\s*-\s+/u, ""));
  }
  return result;
}

export function renderMemory(sections = {}) {
  const lines = ["# Memory"];
  for (const name of memoryNames) {
    lines.push(`## ${name}`);
    for (const item of sections[name.toLowerCase()] ?? []) lines.push(`- ${String(item).replace(/\r?\n/gu, " ")}`);
  }
  return `${lines.join("\n")}\n`;
}

export function parseFeature(text) { return parseFrontmatter(text); }
export function renderFeature(meta, body) { return renderFrontmatter(meta, body); }
