// Browser links for platform entities, and the entity table the chat shows when
// a plan finishes or the person asks what exists. Paths follow the platform's
// routes: `/p/<workspace>/…`, where `0` is Global. An entity still opens from
// `/p/0/` (the route reads the id, not the slug), but a link into the entity's
// own workspace is the one whose sidenav, settings and screens are the ones the
// person sees around it.
import { GLOBAL_WORKSPACE_ID, refsMatch, workspaceHeaderValue } from "./contracts.mjs";

const part = (value) => encodeURIComponent(String(value));
/** The `/p/<slug>` a link carries: the solution's workspace, else Global. */
const workspaceSlug = (workspaceId) => workspaceHeaderValue(workspaceId) ?? GLOBAL_WORKSPACE_ID;

export function entityUrl(host, ref = {}, { workspaceId } = {}) {
  if (!host || !ref.id) return null;
  const base = `https://${host}/p/${part(workspaceSlug(workspaceId))}`;
  const id = part(ref.id);
  switch (ref.kind) {
    case "object": return `${base}/objects/${id}/schema`;
    case "record": return ref.objectId ? `${base}/objects/${part(ref.objectId)}/records/view/${id}` : null;
    case "automation": return `${base}/automations/${id}/builder`;
    case "app": return `${base}/interfaces/${id}/builder`;
    case "code-app": return `${base}/interfaces/code-builder/${id}`;
    case "page": return ref.appId ? `${base}/interfaces/${part(ref.appId)}/builder/page/${id}` : null;
    case "connection": return `${base}/connections/edit/${id}/details`;
    case "ai-agent": return `${base}/ai-agents/${id}`;
    case "knowledge-set": return `${base}/knowledge-set/${id}/configuration/sources`;
    case "graph": return `${base}/context-graphs/${id}`;
    case "dataset": return `${base}/evaluation/datasets/${id}`;
    case "metric": return `${base}/evaluation/metrics/edit/${id}`;
    case "experiment": return `${base}/evaluation/experiments/${id}/runs`;
    case "api_group": return `${base}/api-platform/collections/${id}/endpoints`;
    case "api": return ref.groupId ? `${base}/api-platform/collections/${part(ref.groupId)}/endpoints/${id}` : null;
    case "client": return `${base}/api-platform/clients/${id}/details`;
    case "access_profile": return ref.clientId ? `${base}/api-platform/clients/${part(ref.clientId)}/details/edit/${id}` : null;
    case "policy": return `${base}/api-platform/policies/${id}/details`;
    case "env_variable": return `${base}/env-variables/edit/${id}`;
    case "connector": return `${base}/connectors/${id}`;
    case "solution": return `${base}/solutions/${id}`;
    // The changeset screens sit under Settings, outside any project.
    case "changeset": return `https://${host}/settings/change-sets/outbound/${id}/details`;
    default: return null;
  }
}

// The live view of a saved app or page, as the platform's preview routes draw it. The
// app route redirects to its default page's path; `page/<id>` redirects to that
// page's path. A
// code app's build is served by the code builder's engine at
// `/agent-api/preview/b/<app>/<branch>`, and `main` is the branch every app
// surface shows.
export function previewUrl(host, ref = {}, { workspaceId } = {}) {
  if (!host || !ref.id) return null;
  const base = `https://${host}/p/${part(workspaceSlug(workspaceId))}/interfaces`;
  if (ref.kind === "code-app") return `https://${host}/agent-api/preview/b/${part(ref.id)}/main`;
  if (ref.kind === "app") return `${base}/${part(ref.id)}/preview`;
  if (ref.kind === "page" && ref.appId) return `${base}/${part(ref.appId)}/preview/page/${part(ref.id)}`;
  return null;
}

const DELETED = "🗑️ Deleted";

function rowStatus(tasks) {
  const has = (status) => tasks.some((task) => task.status === status);
  if (has("running")) return "⏳ In progress";
  if (has("failed")) return "❌ Failed";
  if (has("pending")) return has("done") ? "⏳ In progress" : "⌛ Waiting";
  if (!has("done")) return "⏭️ Skipped";
  // A record task's change is about the rows it wrote; its object only gained data.
  const changes = tasks.map((task) => (task.kind === "record" && task.result?.change ? "updated" : task.result?.change));
  // A record task's delete removed rows, and its object is still there.
  if (changes.includes("deleted")) return DELETED;
  if (changes.includes("created")) return "✅ Created";
  if (changes.includes("updated")) return "✅ Updated";
  return "✅ Done";
}

// One row per entity. Several tasks can touch one entity (a page is laid out,
// then bound, then published), so the row takes the ids any of them found.
export function entityRows(host, tasks = []) {
  const groups = [];
  for (const task of tasks) {
    if (!task.entity || task.kind === "manual") continue;
    const group = groups.find((item) => refsMatch(item.entity, task.entity));
    if (group) { group.tasks.push(task); group.entity = { ...group.entity, ...task.entity, id: task.entity.id || group.entity.id }; }
    else groups.push({ entity: { ...task.entity }, tasks: [task] });
  }
  return groups.map(({ entity, tasks: owned }) => {
    const ids = Object.assign({}, ...owned.map((task) => task.result?.ids ?? {}));
    const ref = { ...entity, id: entity.id || ids.entity, appId: entity.appId || ids.app, objectId: entity.objectId || ids.object,
      groupId: entity.groupId || ids.group, clientId: entity.clientId || ids.client };
    const status = rowStatus(owned);
    // A deleted entity has no page left to open.
    if (status === DELETED) return { name: entity.name, kind: entity.kind, status, url: null };
    const preview = previewUrl(host, ref);
    return { name: entity.name, kind: entity.kind, status, url: entityUrl(host, ref), ...(preview ? { preview } : {}) };
  });
}

const cell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

export function entityTable(host, tasks = []) {
  return rowsTable(entityRows(host, tasks));
}

const links = (row) => [row.url && `[Open](${row.url})`, row.preview && `[Preview](${row.preview})`].filter(Boolean).join(" · ") || "—";

// Rows are `{ name, kind, status, url, preview? }`, as entityRows returns them.
export function rowsTable(rows = []) {
  if (!rows.length) return "";
  return [
    "| # | Entity | Kind | Status | Link |",
    "|---|---|---|---|---|",
    ...rows.map((row, index) => `| ${index + 1} | ${cell(row.name)} | ${cell(row.kind)} | ${row.status} | ${links(row)} |`),
  ].join("\n");
}
