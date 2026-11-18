// Turns the Tailwind classes of a get_design_context element into the style record css.mjs produces.
// Figma writes tokens as var(--token,fallback): the fallback is the design value, so it is what we keep.
import { normalizeColor } from './color.mjs';

const WEIGHT_NAMES = { thin: 100, extralight: 200, light: 300, normal: 400, regular: 400, roman: 400, book: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, heavy: 800, black: 900 };

export function resolveVar(value) {
  let out = String(value);
  // nested var(--a,var(--b,8px)) resolves from the inside out
  for (let guard = 0; guard < 5 && /var\(/.test(out); guard++) {
    out = out.replace(/var\((--[^,()]+)(?:,([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (_whole, _name, fallback) => (fallback ?? '').trim());
  }
  return out.replace(/^(length|color|family-name|background|position):/, '').trim();
}

const px = (value) => { const match = /^(-?[\d.]+)px$/.exec(value); return match ? Number(match[1]) : null; };
const unquote = (value) => value.replace(/^['"]|['"]$/g, '').replace(/_/g, ' ');

// 'Inter:Medium' -> { family: 'Inter', weight: 500 }
export function fontFromFamilyToken(token) {
  const first = unquote(resolveVar(token).split(',')[0].trim());
  const [family, style] = first.split(':');
  const weight = style ? WEIGHT_NAMES[style.toLowerCase().replace(/\s+/g, '')] ?? null : null;
  return { family: family || null, weight };
}

function radiusCorner(props, corner, value) {
  props.borderRadiusCorners ||= {};
  for (const key of corner) props.borderRadiusCorners[key] = value;
}

export function parseTailwindClasses(classText) {
  const props = {};
  for (const cls of String(classText).split(/\s+/).filter(Boolean)) {
    const arb = /^(-?)([a-z-]+?)-\[(.+)\]$/.exec(cls);
    if (arb) { applyArbitrary(props, arb[2], resolveVar(arb[3]), arb[1] === '-'); continue; }
    const square = /^\[([a-z-]+):(.+)\]$/.exec(cls);
    if (square) { applyProperty(props, square[1], resolveVar(square[2])); continue; }
    applyBare(props, cls);
  }
  if (props.borderRadiusCorners && props.borderRadius === undefined) {
    const corners = props.borderRadiusCorners;
    const values = ['tl', 'tr', 'br', 'bl'].map((key) => corners[key] ?? 0);
    props.borderRadius = values.every((value) => value === values[0]) ? values[0] : values;
  }
  return props;
}

function applyArbitrary(props, prefix, value, negative) {
  const number = px(value);
  const signed = number === null ? null : negative ? -number : number;
  const color = normalizeColor(value);
  switch (prefix) {
    // text-[0px] and leading-[0] mark a text with mixed styles; the spans inside carry the real values.
    case 'text':
      if (number !== null) { if (number > 0) props.fontSize = number; }
      else if (color) props.color = color;
      return;
    case 'leading': if (number !== null && number > 0) props.lineHeight = number; return;
    case 'font':
      if (/^\d+$/.test(value)) props.fontWeight = Number(value);
      else if (/[A-Za-z]/.test(value) && value !== 'normal') { const font = fontFromFamilyToken(value); if (font.family) props.fontFamily = font.family; if (font.weight && props.fontWeight === undefined) props.fontWeight = font.weight; }
      return;
    case 'tracking': {
      const match = /^(-?[\d.]+)(px|em|%)?$/.exec(value);
      if (match) { props.letterSpacing = `${negative ? '-' : ''}${match[1]}${match[2] ?? 'px'}`; }
      return;
    }
    case 'rounded': props.borderRadius = number ?? (value === 'full' ? 9999 : props.borderRadius); return;
    case 'rounded-tl': radiusCorner(props, ['tl'], number ?? 0); return;
    case 'rounded-tr': radiusCorner(props, ['tr'], number ?? 0); return;
    case 'rounded-br': radiusCorner(props, ['br'], number ?? 0); return;
    case 'rounded-bl': radiusCorner(props, ['bl'], number ?? 0); return;
    case 'rounded-t': radiusCorner(props, ['tl', 'tr'], number ?? 0); return;
    case 'rounded-b': radiusCorner(props, ['bl', 'br'], number ?? 0); return;
    case 'bg': applyProperty(props, 'background', value); return;
    case 'shadow': props.boxShadow = value.replace(/_/g, ' '); return;
    case 'opacity': props.opacity = Number(value); return;
    case 'blur': props.filterBlur = number; return;
    case 'backdrop-blur': props.backdropBlur = number; return;
    case 'border':
      if (number !== null) (props.border ||= {}).width = number;
      else if (color) (props.border ||= {}).color = color;
      return;
    case 'w': props.width = number; return;
    case 'h': props.height = number; return;
    case 'size': props.width = number; props.height = number; return;
    case 'left': props.left = signed; return;
    case 'top': props.top = signed; return;
    case 'right': props.right = signed; return;
    case 'bottom': props.bottom = signed; return;
    case 'gap': props.gap = number; return;
    case 'p': props.padding = [number, number, number, number]; return;
    case 'px': props.padding = pad(props, { r: number, l: number }); return;
    case 'py': props.padding = pad(props, { t: number, b: number }); return;
    case 'pt': props.padding = pad(props, { t: number }); return;
    case 'pb': props.padding = pad(props, { b: number }); return;
    case 'pl': props.padding = pad(props, { l: number }); return;
    case 'pr': props.padding = pad(props, { r: number }); return;
    default: return;
  }
}

function pad(props, sides) {
  const [t, r, b, l] = props.padding ?? [0, 0, 0, 0];
  return [sides.t ?? t, sides.r ?? r, sides.b ?? b, sides.l ?? l];
}

function applyProperty(props, name, value) {
  // [text-box-trim:trim-both] [text-box-edge:cap_alphabetic] is how the code says the text is cap-trimmed
  if (name === 'text-box-trim') { props.leadingTrim = value.replace(/^trim-/, ''); return; }
  if (name === 'text-box-edge') { props.textEdge = value.split('_')[0]; return; }
  if (name === 'background') {
    const color = normalizeColor(value);
    if (color) props.fill = color;
    else if (/gradient\(/.test(value)) props.gradient = value;
    else if (/url\(/.test(value)) props.image = true;
    props.background = value;
  }
}

function applyBare(props, cls) {
  const weight = /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.exec(cls);
  if (weight) { props.fontWeight = WEIGHT_NAMES[weight[1]]; return; }
  switch (cls) {
    case 'uppercase': case 'lowercase': case 'capitalize': props.textTransform = cls; return;
    case 'text-center': case 'text-left': case 'text-right': props.textAlign = cls.slice(5); return;
    case 'text-white': props.color = '#FFFFFFFF'; return;
    case 'text-black': props.color = '#000000FF'; return;
    case 'bg-white': props.fill = '#FFFFFFFF'; props.background = 'white'; return;
    case 'bg-black': props.fill = '#000000FF'; props.background = 'black'; return;
    case 'rounded-full': props.borderRadius = 9999; return;
    case 'border': (props.border ||= {}).width ??= 1; return;
    case 'flex-col': props.display = 'flex'; props.flexDirection = 'column'; return;
    case 'flex-row': props.display = 'flex'; props.flexDirection = 'row'; return;
    case 'flex': props.display = 'flex'; props.flexDirection ??= 'row'; return;
    case 'whitespace-nowrap': props.nowrap = true; return;
    case 'w-full': props.width = 'full'; return;
    case 'h-full': props.height = 'full'; return;
    case 'size-full': props.width = 'full'; props.height = 'full'; return;
    case 'absolute': case 'relative': props.position = cls; return;
    case 'items-center': props.alignItems = 'center'; return;
    case 'justify-center': props.justifyContent = 'center'; return;
    case 'justify-between': props.justifyContent = 'space-between'; return;
    case 'opacity-0': props.opacity = 0; return;
    default: {
      const opacity = /^opacity-(\d+)$/.exec(cls);
      if (opacity) props.opacity = Number(opacity[1]) / 100;
    }
  }
}
