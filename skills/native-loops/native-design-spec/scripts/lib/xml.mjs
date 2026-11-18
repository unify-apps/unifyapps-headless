// A small tokenizer for the Figma metadata XML: elements with attributes, nesting and self-closing tags.
// Unknown tags and attributes pass through. Returns { tag, attrs, children, text } trees.

const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/\s*([A-Za-z_][\w.:-]*)\s*>|<([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))*)\s*(\/?)>/g;
const ATTR = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

function parseAttrs(text) {
  const attrs = {};
  for (const match of text.matchAll(ATTR)) attrs[match[1]] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  return attrs;
}

export function parseXml(source) {
  const root = { tag: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  let last = 0;
  const addText = (end) => {
    const raw = source.slice(last, end);
    if (raw.trim()) stack[stack.length - 1].text += decodeEntities(raw.trim());
  };
  for (const match of source.matchAll(TOKEN)) {
    addText(match.index);
    last = match.index + match[0].length;
    const [whole, closeTag, openTag, attrText, selfClose] = match;
    if (closeTag !== undefined) {
      // A stray close tag is ignored rather than failing the whole read.
      const open = stack.findLastIndex((node) => node.tag === closeTag);
      if (open > 0) stack.length = open;
      continue;
    }
    if (openTag === undefined) continue; // comment, processing instruction, cdata, doctype
    const node = { tag: openTag, attrs: parseAttrs(attrText), children: [], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!selfClose && !whole.endsWith('/>')) stack.push(node);
  }
  addText(source.length);
  return root;
}

// The first element of the document, usually the frame or section the metadata was fetched for.
export function rootElement(document) {
  return document.children.find((node) => node.tag && node.tag[0] !== '#') ?? null;
}

export function* walk(node, depth = 0, parent = null) {
  yield { node, depth, parent };
  for (const child of node.children) yield* walk(child, depth + 1, node);
}

export function countNodes(node) {
  let count = 0;
  for (const _entry of walk(node)) count++;
  return count;
}
