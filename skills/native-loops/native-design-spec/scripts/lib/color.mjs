// Colours normalise to #RRGGBBAA so sources can be compared byte for byte.

const NAMED = { white: '#FFFFFFFF', black: '#000000FF', transparent: '#00000000', red: '#FF0000FF', none: null };

const hex2 = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0').toUpperCase();

export function normalizeColor(text) {
  if (text === undefined || text === null) return null;
  const raw = String(text).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower in NAMED) return NAMED[lower];
  const hex = /^#([0-9a-f]{3,8})$/i.exec(raw);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map((d) => d + d).join('');
    if (digits.length === 6) digits += 'FF';
    if (digits.length !== 8) return null;
    return '#' + digits.toUpperCase();
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/i.exec(raw);
  if (!fn) return null;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean).map((part) => part.trim());
  if (parts.length < 3) return null;
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? Number(parts[3].slice(0, -1)) / 100 : Number(parts[3]);
  if (fn[1].toLowerCase().startsWith('rgb')) {
    const channels = parts.slice(0, 3).map((part) => (part.endsWith('%') ? (Number(part.slice(0, -1)) * 255) / 100 : Number(part)));
    if (channels.some((channel) => !Number.isFinite(channel))) return null;
    return '#' + channels.map(hex2).join('') + hex2(alpha * 255);
  }
  const [hue, sat, light] = [Number(parts[0]), Number(parts[1].replace('%', '')) / 100, Number(parts[2].replace('%', '')) / 100];
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = light - chroma / 2;
  const sector = Math.floor(((hue % 360) + 360) % 360 / 60);
  const rgb = [[chroma, second, 0], [second, chroma, 0], [0, chroma, second], [0, second, chroma], [second, 0, chroma], [chroma, 0, second]][sector];
  return '#' + rgb.map((channel) => hex2((channel + match) * 255)).join('') + hex2(alpha * 255);
}

// Pulls every colour literal out of a longer value (a gradient, a shadow) in order.
export function colorsIn(text) {
  const out = [];
  for (const match of String(text).matchAll(/#[0-9a-f]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)|\b(?:white|black|transparent)\b/gi)) {
    const color = normalizeColor(match[0]);
    if (color) out.push(color);
  }
  return out;
}

export const isSolidColor = (text) => normalizeColor(text) !== null;
