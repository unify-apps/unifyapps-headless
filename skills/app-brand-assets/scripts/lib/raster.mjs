// Raster work for the brand assets, with no dependencies: resampling with a cubic filter, the
// platform masks, alpha compositing, and a small bitmap font for labels. An image is
// { width, height, data } with straight (not premultiplied) RGBA bytes, as png.mjs reads and writes.

export function blank(width, height, [r, g, b, a] = [0, 0, 0, 0]) {
  const data = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) { data[offset] = r; data[offset + 1] = g; data[offset + 2] = b; data[offset + 3] = a; }
  return { width, height, data };
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) throw new Error(`expected a colour as #RRGGBB, got ${JSON.stringify(hex)}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** WCAG relative luminance and contrast ratio. */
export function luminance([r, g, b]) {
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Catmull-Rom: sharp enough for logo edges, and it keeps flat colour flat.
function cubic(x) {
  const t = Math.abs(x);
  if (t < 1) return 1.5 * t ** 3 - 2.5 * t ** 2 + 1;
  if (t < 2) return -0.5 * t ** 3 + 2.5 * t ** 2 - 4 * t + 2;
  return 0;
}

// Per output index: the source indices and weights. Output pixel centre o + 0.5 maps to source
// (o + 0.5 - shift) / scale; a pixel outside the source counts as transparent, so edges fade out.
function taps(outCount, inCount, scale, shift) {
  const stretch = Math.min(1, scale);
  const support = 2 / stretch;
  const out = new Array(outCount);
  for (let o = 0; o < outCount; o += 1) {
    const centre = (o + 0.5 - shift) / scale - 0.5;
    const lo = Math.ceil(centre - support);
    const hi = Math.floor(centre + support);
    const index = []; const weight = []; let total = 0;
    for (let i = lo; i <= hi; i += 1) {
      const w = cubic((i - centre) * stretch);
      total += w;
      if (i >= 0 && i < inCount && w !== 0) { index.push(i); weight.push(w); }
    }
    out[o] = { index, weight: weight.map((w) => w / (total || 1)) };
  }
  return out;
}

/**
 * Draw `image` scaled by `scale`, its top-left landing at (left, top) of a new width x height
 * image. Upscaling re-sharpens the alpha edge, so a logo drawn larger than its source keeps a
 * one-pixel edge instead of a blur: the shapes are flat colour, and their edge is all that blurs.
 */
export function place(image, { width, height, scale, left, top, sharpen = true }) {
  const cols = taps(width, image.width, scale, left);
  const rows = taps(height, image.height, scale, top);
  const src = image.data;
  // Premultiplied horizontal pass, one row of the source at a time.
  const mid = new Float32Array(image.height * width * 4);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const { index, weight } = cols[x];
      if (!index.length) continue;
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < index.length; k += 1) {
        const offset = (y * image.width + index[k]) * 4;
        const alpha = src[offset + 3] / 255 * weight[k];
        r += src[offset] * alpha; g += src[offset + 1] * alpha; b += src[offset + 2] * alpha; a += alpha;
      }
      const target = (y * width + x) * 4;
      mid[target] = r; mid[target + 1] = g; mid[target + 2] = b; mid[target + 3] = a;
    }
  }
  const out = blank(width, height);
  const gain = sharpen && scale > 1.2 ? Math.min(scale, 4) : 1;
  for (let y = 0; y < height; y += 1) {
    const { index, weight } = rows[y];
    if (!index.length) continue;
    for (let x = 0; x < width; x += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < index.length; k += 1) {
        const offset = (index[k] * width + x) * 4;
        r += mid[offset] * weight[k]; g += mid[offset + 1] * weight[k]; b += mid[offset + 2] * weight[k]; a += mid[offset + 3] * weight[k];
      }
      if (a <= 1e-4) continue;
      let alpha = Math.min(1, a);
      if (gain > 1) alpha = Math.max(0, Math.min(1, (alpha - 0.5) * gain + 0.5));
      if (alpha <= 0) continue;
      const target = (y * width + x) * 4;
      out.data[target] = Math.max(0, Math.min(255, Math.round(r / a)));
      out.data[target + 1] = Math.max(0, Math.min(255, Math.round(g / a)));
      out.data[target + 2] = Math.max(0, Math.min(255, Math.round(b / a)));
      out.data[target + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

/** Scale to fit width x height, keeping the aspect ratio, centred. */
export function fitInto(image, width, height, sharpen = false) {
  const scale = Math.min(width / image.width, height / image.height);
  return place(image, { width, height, scale, left: (width - image.width * scale) / 2, top: (height - image.height * scale) / 2, sharpen });
}

/** Source-over: `top` drawn onto `base` (in place) with its top-left at (x, y), through an optional coverage mask. */
export function over(base, top, x = 0, y = 0, mask = null) {
  for (let row = 0; row < top.height; row += 1) {
    const by = row + y; if (by < 0 || by >= base.height) continue;
    for (let col = 0; col < top.width; col += 1) {
      const bx = col + x; if (bx < 0 || bx >= base.width) continue;
      const s = (row * top.width + col) * 4;
      let sa = top.data[s + 3] / 255;
      if (mask) sa *= mask[row * top.width + col];
      if (sa <= 0) continue;
      const d = (by * base.width + bx) * 4;
      const da = base.data[d + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c += 1) base.data[d + c] = Math.round((top.data[s + c] * sa + base.data[d + c] * da * (1 - sa)) / oa);
      base.data[d + 3] = Math.round(oa * 255);
    }
  }
  return base;
}

/** The same image with each pixel's alpha multiplied by a coverage mask (0..1 per pixel). */
export function masked(image, mask) {
  const out = { width: image.width, height: image.height, data: Buffer.from(image.data) };
  for (let i = 0; i < mask.length; i += 1) out.data[i * 4 + 3] = Math.round(out.data[i * 4 + 3] * mask[i]);
  return out;
}

// Coverage of a shape, 4x4 samples per pixel, so its edge is antialiased.
function coverage(width, height, inside) {
  const mask = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < 4; sy += 1) for (let sx = 0; sx < 4; sx += 1) if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) hits += 1;
      mask[y * width + x] = hits / 16;
    }
  }
  return mask;
}

export function circleMask(width, height, cx, cy, radius) {
  return coverage(width, height, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2);
}

export function roundedSquareMask(size, radius) {
  return coverage(size, size, (x, y) => {
    const dx = Math.max(radius - x, 0, x - (size - radius));
    const dy = Math.max(radius - y, 0, y - (size - radius));
    return dx * dx + dy * dy <= radius * radius;
  });
}

/** A one-colour ring, drawn in place, for safe-zone guides on the preview. */
export function ring(image, cx, cy, radius, rgb, width = 2) {
  const ringMask = coverage(image.width, image.height, (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - radius) <= width / 2);
  const paint = blank(image.width, image.height, [...rgb, 255]);
  return over(image, paint, 0, 0, ringMask);
}

export function fill(image, rgb) {
  return over(blank(image.width, image.height, [...rgb, 255]), image);
}

// 5 x 7 capitals, digits and a few marks, for preview labels and group numbers.
const GLYPHS = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111',
  3: '11111000100010000010000011000101110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
  6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110',
  9: '01110100011000101111000010001001100', ' ': '00000000000000000000000000000000000', '-': '00000000000000011111000000000000000',
  '.': '00000000000000000000000000110001100', ':': '00000011000110000000011000110000000', '/': '00001000010001000100010001000010000',
  '(': '00010001000100001000010000010000010', ')': '01000001000001000010000100010001000', '%': '11000110010001000100010001001100011',
};

/** Draw text in place at (x, y), each font pixel `size` image pixels; unknown characters draw as a space. */
export function text(image, x, y, words, rgb, size = 2) {
  let cursor = x;
  for (const ch of String(words).toUpperCase()) {
    const glyph = GLYPHS[ch] ?? GLYPHS[' '];
    for (let i = 0; i < 35; i += 1) {
      if (glyph[i] !== '1') continue;
      const gx = cursor + (i % 5) * size; const gy = y + Math.floor(i / 5) * size;
      for (let py = gy; py < gy + size; py += 1) {
        for (let px = gx; px < gx + size; px += 1) {
          if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
          const o = (py * image.width + px) * 4;
          image.data[o] = rgb[0]; image.data[o + 1] = rgb[1]; image.data[o + 2] = rgb[2]; image.data[o + 3] = 255;
        }
      }
    }
    cursor += 6 * size;
  }
  return image;
}

export function textWidth(words, size = 2) { return String(words).length * 6 * size; }

export function strokeRect(image, x, y, w, h, rgb, width = 2) {
  const paint = (px, py) => {
    if (px < 0 || py < 0 || px >= image.width || py >= image.height) return;
    const o = (py * image.width + px) * 4;
    image.data[o] = rgb[0]; image.data[o + 1] = rgb[1]; image.data[o + 2] = rgb[2]; image.data[o + 3] = 255;
  };
  for (let t = 0; t < width; t += 1) {
    for (let px = x; px < x + w; px += 1) { paint(px, y + t); paint(px, y + h - 1 - t); }
    for (let py = y; py < y + h; py += 1) { paint(x + t, py); paint(x + w - 1 - t, py); }
  }
  return image;
}
