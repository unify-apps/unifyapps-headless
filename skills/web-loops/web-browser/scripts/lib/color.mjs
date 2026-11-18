// CSS colours as the browser computes them, and the WCAG 2.x contrast between text and what is
// behind it. Pure.

const NAMED = { transparent: [0, 0, 0, 0], white: [255, 255, 255, 1], black: [0, 0, 0, 1] };

const channel = (part) => (part.endsWith('%') ? (parseFloat(part) * 255) / 100 : parseFloat(part));
const alphaOf = (part) => (part === undefined ? 1 : part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part));

/**
 * `rgb()`/`rgba()` (commas or spaces, `/` alpha), `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`,
 * `color(srgb r g b / a)` and the names transparent, white, black → { r, g, b, a } with r, g, b
 * in 0..255 and a in 0..1. Anything else (oklch, lab, a gradient) → null: unknown, never guessed.
 */
export function parseColor(text) {
  if (text === null || text === undefined) return null;
  const raw = String(text).trim().toLowerCase();
  if (!raw) return null;
  if (raw in NAMED) { const [r, g, b, a] = NAMED[raw]; return { r, g, b, a }; }
  const hex = /^#([0-9a-f]{3,8})$/u.exec(raw);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map((d) => d + d).join('');
    if (digits.length !== 6 && digits.length !== 8) return null;
    const value = (at) => parseInt(digits.slice(at, at + 2), 16);
    return { r: value(0), g: value(2), b: value(4), a: digits.length === 8 ? Math.round((value(6) / 255) * 1000) / 1000 : 1 };
  }
  const rgb = /^rgba?\(([^)]*)\)$/u.exec(raw);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/u).filter(Boolean);
    if (parts.length < 3) return null;
    const [r, g, b] = parts.slice(0, 3).map(channel);
    const a = alphaOf(parts[3]);
    if (![r, g, b, a].every(Number.isFinite)) return null;
    return { r, g, b, a: Math.max(0, Math.min(1, a)) };
  }
  const srgb = /^color\(srgb\s+([^)]*)\)$/u.exec(raw);
  if (srgb) {
    const parts = srgb[1].split(/[\s/]+/u).filter(Boolean);
    if (parts.length < 3) return null;
    const [r, g, b] = parts.slice(0, 3).map((part) => (part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part)) * 255);
    const a = alphaOf(parts[3]);
    if (![r, g, b, a].every(Number.isFinite)) return null;
    return { r, g, b, a };
  }
  return null;
}

/** `top` painted over `bottom` (source-over). */
export function blend(top, bottom) {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (key) => (top[key] * top.a + bottom[key] * bottom.a * (1 - top.a)) / a;
  return { r: mix('r'), g: mix('g'), b: mix('b'), a };
}

export const WHITE = Object.freeze({ r: 255, g: 255, b: 255, a: 1 });

/**
 * The background a text sits on, from its own background up to the first opaque one (`stack`
 * as the collector walked it, the text's element first), over the white canvas. Null when a
 * colour in it cannot be read.
 */
export function flatten(stack, base = WHITE) {
  let result = base;
  for (const text of [...stack].reverse()) {
    const color = parseColor(text);
    if (!color) return null;
    result = blend(color, result);
  }
  return result;
}

/** WCAG 2.x relative luminance. */
export function luminance({ r, g, b }) {
  const linear = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The contrast ratio of two opaque colours, 1 to 21, to two decimals. */
export function contrastRatio(one, two) {
  const [light, dark] = [luminance(one), luminance(two)].sort((x, y) => y - x);
  return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
}

/** WCAG large text: 24 px and up, or 18.66 px (14 pt) and up in bold (700+). */
export function isLargeText(sizePx, weight) {
  const size = parseFloat(sizePx);
  const bold = Number(weight) >= 700;
  return size >= 24 || (bold && size >= 18.66);
}

/** The AA minimum: 3 for large text, 4.5 for the rest. */
export function requiredRatio(sizePx, weight) {
  return isLargeText(sizePx, weight) ? 3 : 4.5;
}

const hex2 = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0').toUpperCase();

/** `#RRGGBB`, or `#RRGGBBAA` when not opaque; null for null. */
export function toHex(color) {
  if (!color) return null;
  const base = `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}`;
  return color.a >= 0.999 ? base : `${base}${hex2(color.a * 255)}`;
}

/**
 * The contrast of a text on its background stack: { ratio, required, large, fg, bg } with hex
 * colours, or null when a colour is unknown or the background is an image.
 */
export function textContrast({ color, stack = [], image = false, opacity = 1, fontSize, fontWeight }) {
  if (image) return null;
  const fg = parseColor(color);
  const bg = flatten(stack);
  if (!fg || !bg) return null;
  const shown = blend({ ...fg, a: fg.a * (Number.isFinite(opacity) ? opacity : 1) }, bg);
  return { ratio: contrastRatio(shown, bg), required: requiredRatio(fontSize, fontWeight), large: isLargeText(fontSize, fontWeight), fg: toHex(shown), bg: toHex(bg) };
}
