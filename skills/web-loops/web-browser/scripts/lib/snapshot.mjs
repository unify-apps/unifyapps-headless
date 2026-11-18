// Reads the accessibility snapshot playwright-cli `snapshot` saves: one node per line,
//   - button "Save" [ref=e12] [cursor=pointer]
//   - heading "Leave requests" [level=1] [ref=e7]
//   - link "Home" [ref=f1e10]:        (f1… = inside the first iframe)
//     - /url: /p/0/…
// Pure.

const LINE = /^(\s*)- (.*)$/u;
const ATTR = /\[([a-z-]+)(?:=([^\]]*))?\]/gu;

/** One line's role, name, attributes and inline text. */
export function parseLine(rest) {
  let text = rest.trim();
  let hasChildren = false;
  // "role "name" [attrs]: inline text" or "role [attrs]:" (children follow)
  const roleMatch = /^([A-Za-z/][\w/-]*)/u.exec(text);
  if (!roleMatch) return null;
  const role = roleMatch[1];
  text = text.slice(role.length);
  if (role === '/url' || role === 'text' || role.startsWith('/')) {
    return { role, name: null, attrs: {}, text: text.replace(/^:\s*/u, '').trim() || null, hasChildren: false };
  }
  let name = null;
  const quoted = /^\s+"((?:[^"\\]|\\.)*)"/u.exec(text);
  if (quoted) {
    name = quoted[1].replace(/\\(.)/gu, '$1');
    text = text.slice(quoted[0].length);
  }
  const attrs = {};
  const attrPart = /^((?:\s*\[[^\]]*\])*)/u.exec(text)[1];
  for (const hit of attrPart.matchAll(ATTR)) attrs[hit[1]] = hit[2] === undefined ? true : hit[2];
  text = text.slice(attrPart.length).trim();
  let inline = null;
  if (text.startsWith(':')) {
    inline = text.slice(1).trim() || null;
    hasChildren = !inline;
  }
  return { role, name, attrs, text: inline, hasChildren };
}

/**
 * Snapshot text → nodes in document order: { i, depth, role, name, ref, frame, attrs, text,
 * parent }. `frame` is the iframe part of the ref (`f1`) or null. Lines that are not nodes are skipped.
 */
export function parseSnapshot(text) {
  const nodes = [];
  const stack = [];
  for (const raw of String(text ?? '').split('\n')) {
    const line = LINE.exec(raw);
    if (!line) continue;
    const parsed = parseLine(line[2]);
    if (!parsed) continue;
    const depth = Math.floor(line[1].length / 2);
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack.length ? stack[stack.length - 1] : null;
    const ref = typeof parsed.attrs.ref === 'string' ? parsed.attrs.ref : null;
    if (parsed.role === '/url' && parent) { parent.url = parsed.text; continue; }
    const node = {
      i: nodes.length, depth, role: parsed.role, name: parsed.name, ref, frame: ref ? (/^(f\d+)e\d+$/u.exec(ref) || [])[1] ?? null : null,
      attrs: parsed.attrs, text: parsed.text, parent: parent ? parent.i : null, url: null,
    };
    nodes.push(node);
    stack.push(node);
  }
  return nodes;
}

/** Roles a person operates; each needs an accessible name. */
export const CONTROL_ROLES = ['button', 'link', 'checkbox', 'radio', 'switch', 'textbox', 'searchbox', 'combobox', 'listbox', 'slider', 'spinbutton', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'treeitem'];

/** The text a node and its children show, for a node with no name of its own. */
export function shownText(nodes, node) {
  const parts = [];
  if (node.text) parts.push(node.text);
  for (const child of nodes) if (child.parent === node.i) parts.push(child.name ?? '', shownText(nodes, child));
  return parts.join(' ').replace(/\s+/gu, ' ').trim();
}

/** Controls with no accessible name, clickable nodes with no control role, and the headings in order. */
export function snapshotFindings(nodes) {
  const unnamed = [];
  const clickable = [];
  const headings = [];
  for (const node of nodes) {
    const named = Boolean(node.name && node.name.trim());
    if (CONTROL_ROLES.includes(node.role) && !named) unnamed.push(node);
    if (node.role === 'img' && !named) unnamed.push(node);
    if (node.attrs.cursor === 'pointer' && ['generic', 'paragraph', 'text', 'listitem', 'cell', 'row', 'group', 'img', 'none'].includes(node.role)) {
      // Only the outermost of a clickable run: a child of a clickable generic is the same target.
      const parent = node.parent === null ? null : nodes[node.parent];
      if (!(parent && parent.attrs.cursor === 'pointer')) clickable.push(node);
    }
    if (node.role === 'heading') headings.push({ level: Number(node.attrs.level) || null, name: node.name, ref: node.ref });
  }
  return { unnamed, clickable, headings };
}
