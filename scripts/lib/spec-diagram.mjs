// The picture of how the pieces connect: pages, automations and objects as boxes in columns,
// the Contract's relation bullets as arrows. Positions are arithmetic (column x, row y), the
// order inside a column follows what each box connects to, and every edge is one SVG path.
// Pure string building; no layout library.
const BOX_W = 196;
const BOX_H = 54;
const PITCH = 68;
const COL_GAP = 86;
const TOP = 30;
const HEAD_Y = 14;
const CORRIDOR = 14;

const MIDDLE_LABEL = { automation: "Automations", "ai-agent": "AI agents" };
const RIGHT_LABEL = {
  object: "Objects",
  connection: "Connections",
  dataset: "Datasets",
  metric: "Metrics",
  experiment: "Experiments",
  api_group: "API groups",
  api: "APIs",
  access_profile: "Access profiles",
  policy: "Policies",
  "knowledge-set": "Knowledge sets",
  connector: "Connectors",
  client: "Clients",
  env_variable: "Environment variables",
};
const COLUMNS = [
  { kinds: ["page", "code-app"], label: (model, present) => present.map(k => (k === "page" ? `Pages${model.app ? ` · ${model.app.name}` : ""}` : "Code apps")).join(" · ") },
  { kinds: ["automation", "ai-agent"], label: (model, present) => present.map(k => MIDDLE_LABEL[k]).join(" · ") },
  {
    kinds: ["object", "knowledge-set", "connection", "connector", "dataset", "metric", "experiment", "api_group", "api", "client", "access_profile", "policy", "env_variable"],
    label: (model, present) => present.map(k => RIGHT_LABEL[k]).join(" · "),
  },
];
// `opens` is a page-to-page link and stays in the cards; the diagram shows what runs and what holds data.
const EDGES = { calls: "calls", writes: "writes", reads: "reads", uses: "uses" };
const ARROW = { calls: "#201f1e", writes: "#378f4e", reads: "#9f9993", uses: "#847347" };
const ACTION_CLASS = { New: "new", Updated: "updated", "Read only": "readonly", Reused: "reused" };

/** Escapes text for an attribute or a text node. */
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/** The node class for an entity action (`New` → `new`); an unknown action reads as updated. */
function cls(action) {
  return ACTION_CLASS[action] ?? "updated";
}

// Text sizes the stylesheet gives the diagram: a box's name, its kind line, a column head.
// The head is uppercase with 0.06em letter spacing.
const NAME_PX = 12.5, KIND_PX = 10.5, HEAD_PX = 10.5, HEAD_TRACK = 0.06;

/** A glyph's width in em for the page's sans serif at weight 500 to 600, rounded up so a cut never overflows. */
function glyphEm(ch) {
  if (/[iljtf.,:;'|!()\[\] ]/u.test(ch)) return 0.34;
  if (/[rI1\-/]/u.test(ch)) return 0.42;
  if (/[mwMW]/u.test(ch)) return 0.92;
  if (/[A-Z]/u.test(ch)) return 0.72;
  if (/[0-9]/u.test(ch)) return 0.62;
  if (ch === "_") return 0.6;
  return 0.6;
}

/** Text that fits `width` units at `px`, with an ellipsis at the end when it does not. */
function fit(text, width, px, { upper = false, track = 0 } = {}) {
  const em = (s) => [...s].reduce((sum, ch) => sum + glyphEm(upper ? ch.toUpperCase() : ch) + track, 0) * px;
  if (em(text) <= width) return text;
  const chars = [...text];
  while (chars.length && em(`${chars.join("").trimEnd()}…`) > width) chars.pop();
  return `${chars.join("").trimEnd()}…`;
}

/**
 * A box name that fits `width` units at `px`. A long name is cut in the middle, because entity
 * names often share a prefix (an app or team name) and their ends are what tell the boxes apart.
 */
function fitName(text, width, px) {
  const em = (s) => [...s].reduce((sum, ch) => sum + glyphEm(ch), 0) * px;
  if (em(text) <= width) return text;
  const chars = [...text];
  let head = Math.max(4, Math.floor(chars.length * 0.4)), tail = chars.length - head;
  const cut = () => `${chars.slice(0, head).join("").trimEnd()}…${chars.slice(chars.length - tail).join("").trimStart()}`;
  // Take from the longer side until it fits, so neither the start nor the end disappears.
  while (head + tail > 2 && em(cut()) > width) { if (tail >= head) tail--; else head--; }
  return cut();
}

/** The mean of a list of numbers (NaN for an empty list). */
function mean(list) {
  return list.reduce((a, b) => a + b, 0) / list.length;
}

/** A number as an SVG coordinate: one decimal, no trailing zero. */
function f(n) {
  return (Math.round(n * 10) / 10).toString();
}

/** The columns that hold at least one entity of the model, each with its nodes in Touches order. */
function columnsOf(model) {
  return COLUMNS
    .map(col => ({ ...col, nodes: model.ents.filter(e => col.kinds.includes(e.kind)) }))
    .filter(col => col.nodes.length);
}

/** The relations that run left to right between placed nodes, one edge each. */
function edgesOf(model, placed) {
  const edges = [];
  for (const from of model.ents) {
    if (!placed.has(from)) continue;
    for (const [key, verb] of Object.entries(EDGES)) {
      for (const { target, note } of from.relations[key] ?? []) {
        if (!placed.has(target) || placed.get(target) <= placed.get(from)) continue;
        edges.push({ from, to: target, kind: key, verb, note });
      }
    }
  }
  return edges;
}

/** Orders each column after the first by the mean row of what it connects to, so arrows stay short. */
function orderColumns(columns, edges) {
  columns.forEach((col, c) => {
    if (c === 0) return;
    const rowOf = new Map(columns[c - 1].nodes.map((n, i) => [n, i]));
    const score = (node) => {
      const rows = edges.filter(e => e.to === node && rowOf.has(e.from)).map(e => rowOf.get(e.from));
      return rows.length ? mean(rows) : Number.POSITIVE_INFINITY;
    };
    col.nodes = col.nodes
      .map((node, i) => ({ node, i, s: score(node) }))
      .sort((a, b) => (a.s - b.s) || (a.i - b.i))
      .map(x => x.node);
  });
}

/** Each node's box position: columns left to right, rows centred on the tallest column. */
function positionsOf(columns, maxRows) {
  const pos = new Map();
  columns.forEach((col, c) => {
    const offset = (maxRows - col.nodes.length) * PITCH / 2;
    col.nodes.forEach((node, i) => pos.set(node, { x: c * (BOX_W + COL_GAP), y: TOP + offset + i * PITCH, col: c }));
  });
  return pos;
}

/** Gives every edge that skips the middle column a corridor y above or below that column's boxes. */
function assignCorridors(edges, columns, pos) {
  const corridors = { above: 0, below: 0 };
  for (const edge of edges) {
    const a = pos.get(edge.from), b = pos.get(edge.to);
    if (b.col - a.col < 2) continue;
    const mid = columns[a.col + 1];
    const first = pos.get(mid.nodes[0]).y, last = pos.get(mid.nodes.at(-1)).y + BOX_H;
    const centre = (a.y + b.y) / 2 + BOX_H / 2;
    if (centre - first < last - centre) {
      corridors.above += 1;
      edge.corridor = first - 8 - CORRIDOR * corridors.above;
    } else {
      corridors.below += 1;
      edge.corridor = last + 8 + CORRIDOR * corridors.below;
    }
  }
}

/** The vertical shift that keeps the top corridor below the column heads, and the page height. */
function extentOf(edges, maxRows) {
  let shift = 0;
  let height = TOP + maxRows * PITCH - (PITCH - BOX_H) + 12;
  const corridorYs = edges.filter(e => e.corridor != null).map(e => e.corridor);
  const minY = Math.min(...corridorYs, TOP);
  if (minY < HEAD_Y + 10) shift = HEAD_Y + 10 - minY;
  const maxY = Math.max(...corridorYs, 0);
  height = Math.max(height, maxY + 12) + shift;
  return { shift, height };
}

/** Spreads the arrows that leave or enter one box along its edge, ordered by where the other end sits. */
function spreadEndpoints(edges, pos, shift) {
  const yOf = node => pos.get(node).y + shift;
  const outgoing = new Map(), incoming = new Map();
  for (const edge of edges) {
    (outgoing.get(edge.from) ?? outgoing.set(edge.from, []).get(edge.from)).push(edge);
    (incoming.get(edge.to) ?? incoming.set(edge.to, []).get(edge.to)).push(edge);
  }
  for (const [node, list] of outgoing) {
    list.sort((p, q) => (pos.get(p.to).col - pos.get(q.to).col) || (yOf(p.to) - yOf(q.to)));
    list.forEach((e, i) => { e.y1 = yOf(node) + BOX_H * (i + 1) / (list.length + 1); });
  }
  for (const [node, list] of incoming) {
    list.sort((p, q) => yOf(p.from) - yOf(q.from));
    list.forEach((e, i) => { e.y2 = yOf(node) + BOX_H * (i + 1) / (list.length + 1); });
  }
}

/** The SVG path of one edge: a curve, or a curve into its corridor, a line along it and a curve out. */
function edgePath(edge, columns, pos, shift) {
  const a = pos.get(edge.from), b = pos.get(edge.to);
  const x1 = a.x + BOX_W, x2 = b.x - 1, y1 = edge.y1, y2 = edge.y2;
  if (edge.corridor == null) {
    const xm = (x1 + x2) / 2;
    return `M${f(x1)} ${f(y1)} C${f(xm)} ${f(y1)} ${f(xm)} ${f(y2)} ${f(x2)} ${f(y2)}`;
  }
  const yc = edge.corridor + shift;
  const mid = columns[a.col + 1];
  const xa = mid.nodes.length ? pos.get(mid.nodes[0]).x : x1 + COL_GAP;
  const xb = xa + BOX_W;
  const c1 = (x1 + xa) / 2, c2 = (xb + x2) / 2;
  return `M${f(x1)} ${f(y1)} C${f(c1)} ${f(y1)} ${f(c1)} ${f(yc)} ${f(xa)} ${f(yc)} L${f(xb)} ${f(yc)} `
    + `C${f(c2)} ${f(yc)} ${f(c2)} ${f(y2)} ${f(x2)} ${f(y2)}`;
}

/** One arrowhead marker per edge kind. */
function markersSvg() {
  return Object.entries(ARROW).map(([kind, fill]) =>
    `<marker id="ah-${kind}" viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="7" markerHeight="7" orient="auto">`
    + `<path d="M0,0.6 L7.6,4 L0,7.4 z" fill="${fill}"/></marker>`).join("");
}

/** The column heads, labelled by the kinds each column holds. */
function headsSvg(columns, model) {
  return columns.map((col, c) => {
    const present = col.kinds.filter(k => col.nodes.some(n => n.kind === k));
    // A head stays inside its own column, so it never runs into the next one's.
    const room = c === columns.length - 1 ? BOX_W : BOX_W + COL_GAP - 16;
    const label = fit(col.label(model, present), room, HEAD_PX, { upper: true, track: HEAD_TRACK });
    return `<text class="dg-col" x="${c * (BOX_W + COL_GAP)}" y="${HEAD_Y}">${esc(label)}</text>`;
  }).join("");
}

/** Every edge as a group with its title and path. */
function edgesSvg(edges, columns, pos, shift) {
  return edges.map(e => {
    const title = `${esc(e.from.name)} ${e.verb} ${esc(e.to.name)}${e.note ? ` on “${esc(e.note)}”` : ""}`;
    return `<g class="dg-edge dg-edge--${e.kind}" data-from="${esc(e.from.id)}" data-to="${esc(e.to.id)}">`
      + `<title>${title}</title><path d="${edgePath(e, columns, pos, shift)}" marker-end="url(#ah-${e.kind})"/></g>`;
  }).join("");
}

/** Every node as a link to its card: a box, a dot, the name and the kind line. */
function nodesSvg(columns, pos, shift) {
  return columns.flatMap(col => col.nodes).map(node => {
    const { x, y: y0 } = pos.get(node), y = y0 + shift;
    const sub = node.kindLabel + (node.address ? ` · ${node.address}` : "");
    return `<a class="dg-node dg-node--${cls(node.action)}" href="#e-${esc(node.id)}" data-node="${esc(node.id)}" `
      + `data-group="${esc(node.kind)}"><title>${esc(node.name)} · ${esc(node.kindLabel)} · ${esc(node.action)}</title>`
      + `<rect x="${x}" y="${f(y)}" width="${BOX_W}" height="${BOX_H}" rx="8"/>`
      + `<rect class="dg-dot" x="${x + 12}" y="${f(y + 15)}" width="7" height="7" rx="2"/>`
      + `<text class="dg-name" x="${x + 26}" y="${f(y + 22)}">${esc(fitName(node.name, BOX_W - 26 - 10, NAME_PX))}</text>`
      + `<text class="dg-kind" x="${x + 26}" y="${f(y + 40)}">${esc(fit(sub, BOX_W - 26 - 10, KIND_PX))}</text></a>`;
  }).join("");
}

/** The diagram for a spec model, or null when there is nothing to connect (fewer than two boxes, or one column). */
export function diagramSvg(model) {
  const columns = columnsOf(model);
  const placed = new Map();
  columns.forEach((col, c) => col.nodes.forEach(node => placed.set(node, c)));
  if (placed.size < 2 || columns.length < 2) return null;
  const edges = edgesOf(model, placed);
  orderColumns(columns, edges);
  const maxRows = Math.max(...columns.map(col => col.nodes.length));
  const pos = positionsOf(columns, maxRows);
  assignCorridors(edges, columns, pos);
  const { shift, height } = extentOf(edges, maxRows);
  spreadEndpoints(edges, pos, shift);
  const width = (columns.length - 1) * (BOX_W + COL_GAP) + BOX_W;
  const svg = `<svg viewBox="0 0 ${width} ${f(height)}" role="img" aria-label="How the pieces connect" `
    + `xmlns="http://www.w3.org/2000/svg"><defs>${markersSvg()}</defs>${headsSvg(columns, model)}`
    + `${edgesSvg(edges, columns, pos, shift)}${nodesSvg(columns, pos, shift)}</svg>`;
  return {
    svg,
    width,
    height,
    nodes: placed.size,
    edges: edges.length,
    kinds: Object.keys(EDGES).filter(k => edges.some(e => e.kind === k)),
  };
}
