/** The optional "### Context graph" part of a spec's ## Contract section (an old Sonic brief's ## Changes); its format is in skills/plan/references/spec-template.md. */
import { markdownLines } from "./spec-markdown.mjs";

const HEADING = "### Context graph";
const LOADING_PATHS = ["sourceObject", "extraction", "loader", "records"];
const SOURCE_MODES = ["none", "enrich_all", "discover"];
const NODE_CATEGORIES = ["core", "secondary", "derived"];
const MATCH_ACTIONS = ["AUTO_MERGE", "FLAG_FOR_REVIEW", "RELEVANCE_BASED"];
const EDGE_CREATION = ["matched", "defined"];
const set = (value) => value && value !== "—" ? value : ""; // "—" is the table's blank marker.

function parseTable(lines) {
  const rows = (lines ?? []).map((line) => line.trim()).filter((line) => line.startsWith("|"))
    .map((line) => line.replace(/^\||\|$/gu, "").split("|").map((cell) => cell.trim()));
  // Row 0 is the header, row 1 the --- separator; both are structural, not data.
  return rows.slice(2);
}

function subsections(contractText) {
  // Fenced examples and comments are not the spec's answer, so they are never read as tables.
  const lines = markdownLines(contractText).filter((entry) => !entry.code).map((entry) => entry.line);
  const start = lines.findIndex((line) => line.trim() === HEADING);
  if (start < 0) return null;
  const sections = Object.create(null);
  let current = null;
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,3}\s/u.test(line)) break; // The next part of the Contract ends this one.
    const heading = /^####\s+(.+?)\s*$/u.exec(line);
    if (heading) { current = heading[1].trim(); sections[current] = []; continue; }
    if (current) sections[current].push(line);
  }
  return sections;
}

/** Validates the Context graph part. Returns { present, nodes, edges, issues }: the planned node and edge names, and no issues when the part is absent. */
export function checkGraphContract(contractText) {
  const sections = subsections(contractText);
  if (!sections) return { present: false, nodes: [], edges: [], issues: [] };
  const issues = [];

  const questions = parseTable(sections["Acceptance questions"]).map(([key, question]) => ({ key, question }));
  const validQuestions = questions.filter((q) => q.key && q.question);
  const uniqueKeys = new Set(validQuestions.map((q) => q.key));
  if (validQuestions.length < 3 || uniqueKeys.size !== validQuestions.length || validQuestions.length !== questions.length) {
    issues.push({ code: "GRAPH_TOO_FEW_QUESTIONS", message: "Need at least 3 acceptance questions, each with a unique key and non-empty text." });
  }

  const nodes = parseTable(sections.Nodes).map(([node, key, loadedBy, ref]) => ({ node, key, loadedBy, ref }));
  if (!nodes.length) issues.push({ code: "GRAPH_MISSING_NODES", message: "At least one node is required." });
  const nodeNames = new Set();
  for (const node of nodes) {
    if (nodeNames.has(node.node)) issues.push({ code: "GRAPH_DUPLICATE_NODE", message: `Duplicate node: ${node.node}.` });
    nodeNames.add(node.node);
    if (!LOADING_PATHS.includes(node.loadedBy) || !node.ref) {
      issues.push({ code: "GRAPH_NODE_WITHOUT_LOADING_PATH", message: `Node ${node.node || "(unnamed)"} needs Loaded by in sourceObject, extraction, loader or records, and a Ref.` });
    }
    if (!set(node.key)) {
      issues.push({ code: "GRAPH_NODE_WITHOUT_KEY", message: `Node ${node.node || "(unnamed)"} needs a Key: the field that identifies a record, never its name.` });
    }
  }

  const edges = parseTable(sections.Edges).map(([edge, from, to, neededFor, , created]) => ({ edge, from, to, neededFor, created: set(created) }));
  const edgeNames = new Set();
  for (const edge of edges) {
    if (edgeNames.has(edge.edge)) issues.push({ code: "GRAPH_DUPLICATE_EDGE", message: `Duplicate edge: ${edge.edge}.` });
    edgeNames.add(edge.edge);
    if (!nodeNames.has(edge.from) || !nodeNames.has(edge.to)) {
      issues.push({ code: "GRAPH_EDGE_NODE_NOT_PLANNED", message: `Edge ${edge.edge || "(unnamed)"} names a node that is not in Nodes.` });
    }
    if (!uniqueKeys.has(edge.neededFor)) {
      issues.push({ code: "GRAPH_EDGE_WITHOUT_QUESTION", message: `Edge ${edge.edge || "(unnamed)"} Needed for must be an acceptance question key.` });
    }
    if (edge.created && !EDGE_CREATION.includes(edge.created)) {
      issues.push({ code: "GRAPH_EDGE_CREATION", message: `Edge ${edge.edge || "(unnamed)"} Created must be matched or defined.` });
    }
  }

  // Both optional tables name nodes from Nodes; the builder reads the rest of each row from the spec.
  const nodeSettings = parseTable(sections["Node settings"]).map(([node, category, , scd2]) => ({ node, category: set(category), scd2: set(scd2) }));
  // A defined edge finds its nodes by their key, which a node that keeps history (SCD Type 2) gives no stable value.
  const keepsHistory = new Set(nodeSettings.filter((row) => row.scd2 === "yes").map((row) => row.node));
  for (const edge of edges.filter((planned) => planned.created === "defined")) {
    if (keepsHistory.has(edge.from) || keepsHistory.has(edge.to)) {
      issues.push({ code: "GRAPH_DEFINED_EDGE_HISTORY", message: `Edge ${edge.edge} is defined, but a node it joins keeps history (SCD2 yes); make it matched or turn SCD2 off.` });
    }
  }
  for (const row of nodeSettings) {
    if (!nodeNames.has(row.node)) issues.push({ code: "GRAPH_NODE_SETTINGS_UNKNOWN_NODE", message: `Node settings name ${row.node || "(unnamed)"}, which is not in Nodes.` });
    if (row.category && !NODE_CATEGORIES.includes(row.category)) {
      issues.push({ code: "GRAPH_NODE_CATEGORY", message: `Node ${row.node || "(unnamed)"} Category must be core, secondary or derived.` });
    }
  }
  const rules = parseTable(sections.Rules).map(([node, , matchRule]) => ({ node, matchRule: set(matchRule) }));
  for (const rule of rules) {
    if (!nodeNames.has(rule.node)) issues.push({ code: "GRAPH_RULE_UNKNOWN_NODE", message: `Rules name ${rule.node || "(unnamed)"}, which is not in Nodes.` });
    if (rule.matchRule && !MATCH_ACTIONS.some((action) => rule.matchRule.includes(action))) {
      issues.push({ code: "GRAPH_MATCH_ACTION", message: `Node ${rule.node || "(unnamed)"} Match rule must say what a match does: AUTO_MERGE, FLAG_FOR_REVIEW or RELEVANCE_BASED.` });
    }
  }

  const sourceObjects = parseTable(sections["Source objects"]).map(([object, mode, discoverer, enricher]) => ({ object, mode, discoverer, enricher }));
  for (const source of sourceObjects) {
    const mode = set(source.mode);
    if (!mode) continue; // Not set: no mode to validate yet.
    if (!SOURCE_MODES.includes(mode)) {
      issues.push({ code: "GRAPH_SOURCE_MODE", message: `Source ${source.object || "(unnamed)"} mode must be none, enrich_all or discover.` });
    } else if (mode === "enrich_all" && !set(source.enricher)) {
      issues.push({ code: "GRAPH_SOURCE_MODE", message: `Source ${source.object} mode enrich_all needs an Enricher.` });
    } else if (mode === "discover" && (!set(source.discoverer) || !set(source.enricher))) {
      issues.push({ code: "GRAPH_SOURCE_MODE", message: `Source ${source.object} mode discover needs a Discoverer and an Enricher.` });
    }
  }

  return { present: true, nodes: nodes.map((node) => node.node), edges: edges.map((edge) => edge.edge), issues };
}

/** GRAPH_SPEC_MISSING, GRAPH_TASK_UNPLANNED and, for a graph the plan creates, GRAPH_NODE_UNCOVERED, GRAPH_EDGE_UNCOVERED and GRAPH_NO_CONSUMER, for `plan propose`. `tasks` are the raw (pre-validateTasks) task objects. */
export function checkGraphPlan(tasks, contractText) {
  const graphTasks = (tasks ?? []).filter((task) => task?.kind === "graph");
  if (!graphTasks.length) return [];
  const { present, nodes, edges } = checkGraphContract(contractText);
  if (!present) return [{ code: "GRAPH_SPEC_MISSING", message: "A plan with a graph task needs the spec's ### Context graph part." }];
  const nodeNames = new Set(nodes);
  const edgeNames = new Set(edges);
  const issues = [];
  for (const task of graphTasks) {
    for (const name of task.graphNodes ?? []) {
      if (!nodeNames.has(name)) issues.push({ code: "GRAPH_TASK_UNPLANNED", message: `${task.id} names a node not in the spec: ${name}.` });
    }
    for (const name of task.graphEdges ?? []) {
      if (!edgeNames.has(name)) issues.push({ code: "GRAPH_TASK_UNPLANNED", message: `${task.id} names an edge not in the spec: ${name}.` });
    }
  }
  // A graph task with no entity id creates the graph. Then the stages together must build
  // every node and edge the spec promised, and someone must be able to ask it questions.
  if (graphTasks.some((task) => !task.entity?.id)) {
    const builtNodes = new Set(graphTasks.flatMap((task) => task.graphNodes ?? []));
    const builtEdges = new Set(graphTasks.flatMap((task) => task.graphEdges ?? []));
    const missingNodes = [...nodeNames].filter((name) => !builtNodes.has(name));
    const missingEdges = [...edgeNames].filter((name) => !builtEdges.has(name));
    if (missingNodes.length) issues.push({ code: "GRAPH_NODE_UNCOVERED", message: `No graph task builds the spec's node ${missingNodes.join(", ")}.` });
    if (missingEdges.length) issues.push({ code: "GRAPH_EDGE_UNCOVERED", message: `No graph task builds the spec's edge ${missingEdges.join(", ")}.` });
    if (!(tasks ?? []).some((task) => task?.kind === "ai-agent")) {
      issues.push({ code: "GRAPH_NO_CONSUMER", message: "A new graph needs an ai-agent task for its consumer: a graph nobody can ask is incomplete." });
    }
  }
  return issues;
}

const describe = (issues) => issues.map((issue) => `${issue.code}: ${issue.message}`).join(" ");

/** The Context graph part's issues as one line, or "" when it is absent or sound. */
export const graphContractProblem = (contractText) => describe(checkGraphContract(contractText).issues);

/** The plan's graph issues as one line, or "" when it has none. */
export const graphPlanProblem = (tasks, contractText) => describe(checkGraphPlan(tasks, contractText));
