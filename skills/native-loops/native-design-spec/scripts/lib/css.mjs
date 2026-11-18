// Parses a Figma CSS "all layers" export and a get_design_context result into the same style records:
// [{ name, nodeId?, text?, textStyle?, source, props: { left, top, width, height, fontSize, lineHeight, fontWeight,
//   fontFamily, color, letterSpacing, textTransform, textAlign, leadingTrim, textEdge, borderRadius, background,
//   fill, gradient, image, boxShadow, shadow, opacity, filterBlur, backdropBlur, border, display, flexDirection,
//   gap, padding, nowrap } }]. Px values are numbers; colours are #RRGGBBAA.
import { normalizeColor, colorsIn } from './color.mjs';
import { parseTailwindClasses } from './tailwind.mjs';
import { decodeEntities } from './xml.mjs';

const NOTE_COMMENT = /^(auto layout|inside auto layout|identical to box height.*|or \d+(\.\d+)?%|note:.*|leading-trim.*|text-edge.*|text style.*)$/i;
const FONT_LINE = /^font-(family|style|weight|size)\s*:/i;

const px = (value) => { const match = /^(-?[\d.]+)px$/.exec(String(value).trim()); return match ? Number(match[1]) : null; };

// Splits "a, b(c, d), e" on the commas that are not inside parentheses.
export function splitTopLevel(text, separator = ',') {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of String(text)) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === separator && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function parseShadow(text) {
  if (!text || /^none$/i.test(text)) return null;
  const first = splitTopLevel(text)[0];
  const inset = /\binset\b/.test(first);
  const color = colorsIn(first)[0] ?? null;
  const numbers = first.replace(/(?:rgba?|hsla?)\([^)]*\)|#[0-9a-f]{3,8}|\binset\b/gi, '').trim().split(/\s+/).map(px);
  const [x = 0, y = 0, blur = 0, spread = 0] = numbers.map((value) => value ?? 0);
  return { x, y, blur, spread, color, inset, count: splitTopLevel(text).length };
}

export function parseRadius(text) {
  const parts = String(text).trim().split(/\s+/).map((part) => (/%$/.test(part) ? 9999 : px(part) ?? 0));
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  const [tl, tr = tl, br = tl, bl = tr] = parts;
  return [tl, tr, br, bl].every((value) => value === tl) ? tl : [tl, tr, br, bl];
}

export function parsePadding(text) {
  const parts = String(text).trim().split(/\s+/).map((part) => px(part) ?? 0);
  const [t, r = t, b = t, l = r] = parts;
  return [t, r, b, l];
}

// Raw declarations -> the shared record shape.
export function propsFromDeclarations(decl) {
  const props = {};
  const geometry = ['left', 'top', 'right', 'bottom', 'width', 'height'];
  for (const key of geometry) if (decl[key] !== undefined) { props[key] = px(decl[key]); if (props[key] === null) props[`${key}Raw`] = decl[key]; }
  if (decl['font-size']) props.fontSize = px(decl['font-size']);
  if (decl['line-height']) props.lineHeight = px(decl['line-height']);
  if (decl['font-weight']) props.fontWeight = /^\d+$/.test(decl['font-weight']) ? Number(decl['font-weight']) : ({ bold: 700, normal: 400 }[decl['font-weight']] ?? null);
  if (decl['font-family']) props.fontFamily = decl['font-family'].split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  if (decl.color) props.color = normalizeColor(decl.color);
  if (decl['letter-spacing']) props.letterSpacing = decl['letter-spacing'];
  if (decl['text-transform']) props.textTransform = decl['text-transform'];
  if (decl['text-align']) props.textAlign = decl['text-align'];
  if (decl['leading-trim']) props.leadingTrim = decl['leading-trim'];
  if (decl['text-edge']) props.textEdge = decl['text-edge'];
  if (decl['border-radius']) props.borderRadius = parseRadius(decl['border-radius']);
  if (decl.opacity) props.opacity = Number(decl.opacity);
  if (decl.background || decl['background-color']) {
    const background = decl.background ?? decl['background-color'];
    props.background = background;
    for (const layer of splitTopLevel(background)) {
      const color = normalizeColor(layer);
      if (color) props.fill ??= color;
      else if (/gradient\(/.test(layer)) props.gradient ??= layer;
      else if (/url\(/.test(layer)) props.image = true;
    }
  }
  if (decl['box-shadow']) { props.boxShadow = decl['box-shadow']; props.shadow = parseShadow(decl['box-shadow']); }
  if (decl.filter) { const blur = /blur\(([\d.]+)px\)/.exec(decl.filter); if (blur) props.filterBlur = Number(blur[1]); }
  if (decl['backdrop-filter']) { const blur = /blur\(([\d.]+)px\)/.exec(decl['backdrop-filter']); if (blur) props.backdropBlur = Number(blur[1]); }
  if (decl.border && !/^none$/.test(decl.border)) {
    const width = px(decl.border.split(/\s+/)[0]);
    props.border = { width: width ?? 1, color: colorsIn(decl.border)[0] ?? null };
  }
  if (decl.display) props.display = decl.display;
  if (decl['flex-direction']) props.flexDirection = decl['flex-direction'];
  if (decl.gap) props.gap = px(decl.gap.split(/\s+/)[0]);
  if (decl.padding) props.padding = parsePadding(decl.padding);
  if (decl['white-space'] === 'nowrap') props.nowrap = true;
  return props;
}

// A Figma "all layers" export: blocks that start with a `/* Layer name */` comment. Text-style comments
// (`/* English/Copy/16/Roman */`, followed by font lines) and note comments stay inside the layer.
export function parseCssExport(source) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const layers = [];
  let current = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    const comment = /^\/\*\s*(.*?)\s*\*\/$/.exec(line);
    if (comment) {
      const label = comment[1];
      if (NOTE_COMMENT.test(label)) continue;
      const nextLine = lines.slice(index + 1).map((text) => text.trim()).find((text) => text && !text.startsWith('/*'));
      if (current && nextLine && FONT_LINE.test(nextLine)) { current.textStyle = label; continue; }
      current = { name: decodeEntities(label), source: 'css', order: layers.length, decl: {} };
      layers.push(current);
      continue;
    }
    if (line.startsWith('.') && line.endsWith('{')) { if (current) current.selector = line.slice(0, -1).trim(); continue; }
    if (line === '}' || line === '{') continue;
    const declaration = /^([a-z-]+)\s*:\s*(.+?);?$/i.exec(line.replace(/\/\*.*?\*\//g, '').trim());
    if (!declaration) continue;
    if (!current) { current = { name: '', source: 'css', order: layers.length, decl: {} }; layers.push(current); }
    current.decl[declaration[1].toLowerCase()] = declaration[2].trim();
  }
  for (const layer of layers) {
    layer.props = propsFromDeclarations(layer.decl);
    layer.kindHint = layer.props.fontSize !== undefined || layer.textStyle ? 'text' : null;
    if (layer.kindHint === 'text') layer.text = layer.name;
    delete layer.decl;
  }
  return layers;
}

const TAG = /<([a-zA-Z][\w.]*)((?:\s+[\w:-]+(?:=(?:"[^"]*"|'[^']*'|\{[^}]*\}))?)*)\s*(\/?)>/g;
const ATTR = /([\w:-]+)(?:=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}))?/g;

function innerText(source, from, tag) {
  const close = source.indexOf(`</${tag}>`, from);
  if (close < 0) return '';
  return decodeEntities(source.slice(from, close).replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim());
}

// The React + Tailwind code get_design_context returns. Records carry data-node-id, data-name and, for
// <p>/<span>, the text. Component functions inside the result are read too; their node ids belong to the
// main component, so instance internals match by name or text rather than by id.
export function parseDesignContext(source) {
  const text = String(source);
  const records = [];
  for (const match of text.matchAll(TAG)) {
    const [whole, tag, attrText, selfClose] = match;
    if (!/className=/.test(attrText) && !/data-node-id=/.test(attrText)) continue;
    const attrs = {};
    for (const attr of attrText.matchAll(ATTR)) attrs[attr[1]] = attr[2] ?? attr[3] ?? attr[4] ?? '';
    const record = {
      name: attrs['data-name'] ?? null,
      nodeId: attrs['data-node-id'] ?? null,
      source: 'design-context',
      order: records.length,
      tag,
      props: parseTailwindClasses(attrs.className ?? ''),
    };
    if (!selfClose && /^(p|span|h[1-6]|a|button|label|li)$/.test(tag)) {
      const content = innerText(text, match.index + whole.length, tag);
      if (content) record.text = content;
    }
    if (tag === 'img') record.props.image = true;
    records.push(record);
  }
  // A cap-trimmed text is a <div data-node-id> with the font and leading-[0], and one <p> per paragraph
  // inside it carrying the words and the line height. The paragraphs fold into their node.
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (!record.nodeId || record.text !== undefined || record.tag === 'img') continue;
    const paragraphs = [];
    for (let next = index + 1; next < records.length && !records[next].nodeId && records[next].tag === 'p'; next++) paragraphs.push(records[next]);
    if (!paragraphs.length) continue;
    record.text = paragraphs.map((paragraph) => paragraph.text ?? '').filter(Boolean).join('\n');
    record.paragraphs = paragraphs.length;
    for (const [key, value] of Object.entries(paragraphs[0].props)) if (record.props[key] === undefined && ['fontSize', 'lineHeight', 'fontWeight', 'fontFamily', 'color', 'letterSpacing', 'textTransform', 'textAlign'].includes(key)) record.props[key] = value;
    for (const paragraph of paragraphs) paragraph.folded = true;
  }
  for (const record of records) record.kindHint = record.text !== undefined || record.props.fontSize !== undefined ? 'text' : record.tag === 'img' ? 'image' : null;
  // an <img> directly inside a node marks that node as an image
  for (let index = 0; index < records.length - 1; index++) {
    if (records[index + 1].tag === 'img' && records[index].nodeId) records[index].props.image = true;
  }
  return { records, textStyles: parseTextStyleTrailer(text), tooLarge: /sparse metadata response/i.test(text) || /^\s*<(frame|section|instance)\b/.test(text) };
}

// "These styles are contained in the design: Name: Font(family: ..., weight: 500, lineHeight: ..., letterSpacing: -2), ..."
export function parseTextStyleTrailer(text) {
  const out = [];
  const start = text.indexOf('These styles are contained in the design:');
  if (start < 0) return out;
  const body = text.slice(start);
  for (const match of body.matchAll(/([\w/ .-]+?):\s*Font\(([^)]*)\)/g)) {
    const fields = Object.fromEntries([...match[2].matchAll(/(\w+):\s*("[^"]*"|[^,]+)/g)].map((field) => [field[1], field[2].replace(/^"|"$/g, '').trim()]));
    out.push({ name: match[1].trim(), family: fields.family ?? null, weight: fields.weight ? Number(fields.weight) : null, letterSpacingPercent: fields.letterSpacing ? Number(fields.letterSpacing) : null, size: fields.size ?? null, lineHeight: fields.lineHeight ?? null });
  }
  return out;
}
