// The plan preview page plan propose shows before the one yes: the spec's change
// manifest, the entities it touches, their wiring, the tasks in order with their
// agents, and the steps that will ask first. Pure: no files, no network.
import { agentFor, isRelease, norm, waitsForYes } from "./contracts.mjs";

// The page holds tenant names a person or a planted instruction may have typed,
// so it runs no script and loads nothing: every value is escaped and the CSP
// allows only the inline style.
export const PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";

export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/gu,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CSS = `
:root{color-scheme:light dark;--bg:#fbfaf8;--fg:#1d1d1f;--muted:#6b6b70;--line:#e3e1dc;--card:#fff;--ask:#9a4d00;--ok:#1f6f43}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--fg:#ececef;--muted:#a1a1a8;--line:#2c2c31;--card:#1c1c20;--ask:#f0a35c;--ok:#6fcf97}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,system-ui,sans-serif}
main{max-width:960px;margin:0 auto;padding:32px 16px 64px}h1{font-size:26px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 10px}
.meta{color:var(--muted);margin:0 0 16px}.sum{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:13px;color:var(--muted);font-weight:600}
ul{margin:0;padding-left:20px}.ask{color:var(--ask);font-weight:600}.ok{color:var(--ok)}.none{color:var(--muted)}
.wrap{overflow-x:auto}code{font:13px ui-monospace,monospace}`;

// Tasks in the order they can run: a task comes after everything it waits on.
export function orderedTasks(tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const done = new Set(), out = [];
  const visit = (task, seen = new Set()) => {
    if (!task || done.has(task.id) || seen.has(task.id)) return;
    seen.add(task.id);
    for (const dep of task.dependsOn ?? []) visit(byId.get(dep), seen);
    done.add(task.id); out.push(task);
  };
  for (const task of tasks) visit(task);
  return out;
}

const sameEntity = (end, ref) => !!end && end.kind === ref.kind &&
  ((!!ref.id && String(end.id) === String(ref.id)) || (!!norm(ref.name) && norm(end.name) === norm(ref.name)));

/** Wiring edges that start or end at a touched entity. */
export function touchedEdges(wiring, touches) {
  const edges = Array.isArray(wiring?.edges) ? wiring.edges : [];
  return edges.filter((edge) => touches.some((ref) => sameEntity(edge.from, ref) || sameEntity(edge.to, ref)));
}

/** What will stop and ask once the plan runs: every delete, and each release the yes does not cover. */
export function askingSteps(tasks, askBeforeDeploy) {
  return orderedTasks(tasks).filter((task) => task.deletes || isRelease(task)).map((task) => ({
    id: task.id, kind: task.kind, entity: task.entity?.name ?? "",
    what: task.deletes ? `delete: ${task.deletes}` : `${task.kind} ${task.entity?.name ?? ""}`,
    asks: waitsForYes(task, askBeforeDeploy),
  }));
}

const endName = (end) => `${end?.kind ?? ""} ${end?.name ?? end?.id ?? ""}${end?.part ? ` (${end.part})` : ""}`;

/**
 * @param {{hash:string, spec:{title:string, requestedOutcome:string, touches:Array, releases:Array, sections:object},
 *   tasks:Array, wiring?:object, askBeforeDeploy?:boolean|{covered:Array}, derivedFrom?:string|null}} input
 */
export function buildPlanPreview({ hash, spec, tasks, wiring = null, askBeforeDeploy = true, derivedFrom = null }) {
  const e = escapeHtml;
  const ordered = orderedTasks(tasks);
  const number = new Map(ordered.map((task, index) => [task.id, index + 1]));
  const edges = touchedEdges(wiring, spec.touches);
  const asking = askingSteps(tasks, askBeforeDeploy);
  const touchRows = spec.touches.map((ref) => `<tr><td>${e(ref.kind)}</td><td>${e(ref.name)}</td><td>${ref.id ? `<code>${e(ref.id)}</code>` : "new"}</td></tr>`).join("");
  const edgeRows = edges.length
    ? edges.map((edge) => `<tr><td>${e(endName(edge.from))}</td><td>${e(edge.via)}</td><td>${e(endName(edge.to))}</td></tr>`).join("")
    : '<tr><td colspan="3" class="none">No cached wiring touches these entities.</td></tr>';
  const taskRows = ordered.map((task) => `<tr><td>${number.get(task.id)}</td><td>${e(task.title)}</td><td>${e(task.entity?.kind)} ${e(task.entity?.name)}</td>` +
    `<td>${e(agentFor(task))}</td><td>${task.dependsOn?.length ? task.dependsOn.map((dep) => e(number.get(dep) ?? dep)).join(", ") : "nothing"}</td></tr>`).join("");
  const askItems = asking.length
    ? asking.map((step) => `<li>${number.get(step.id)}. ${e(step.what)}: ${step.asks ? '<span class="ask">asks you first</span>' : '<span class="ok">covered by your yes to this plan</span>'}</li>`).join("")
    : '<li class="none">Nothing asks: this plan has no deploy, publish or delete.</li>';
  const readyLines = String(spec.sections?.["Ready when"] ?? "").split("\n").map((line) => line.replace(/^\s*-\s*/u, "").trim()).filter(Boolean);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plan preview</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>${e(spec.title)}</h1>
<p class="meta">Plan preview <code>${e(hash)}</code> · ${ordered.length} ${ordered.length === 1 ? "task" : "tasks"}</p>
${derivedFrom ? `<p class="meta">Replaces spec <code>${e(derivedFrom)}</code></p>
` : ""}<div class="sum"><p>${e(spec.requestedOutcome)}</p></div>
<h2>What it touches</h2>
<div class="wrap"><table><thead><tr><th>Kind</th><th>Name</th><th>Id</th></tr></thead><tbody>${touchRows}</tbody></table></div>
<h2>Wired to</h2>
<div class="wrap"><table><thead><tr><th>From</th><th>How</th><th>To</th></tr></thead><tbody>${edgeRows}</tbody></table></div>
<h2>Tasks in order</h2>
<div class="wrap"><table><thead><tr><th>#</th><th>What</th><th>Entity</th><th>Agent</th><th>Waits on</th></tr></thead><tbody>${taskRows}</tbody></table></div>
<h2>Steps that ask</h2>
<ul>${askItems}</ul>
<h2>Ready when</h2>
<ul>${readyLines.map((line) => `<li>${e(line)}</li>`).join("") || '<li class="none">None.</li>'}</ul>
</main>
</body>
</html>
`;
}
