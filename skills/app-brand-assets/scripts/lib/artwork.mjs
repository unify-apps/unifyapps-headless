// Reads a logo image into artwork: the background it sits on, the colours it is drawn in, its
// pieces grouped into marks and lines of text, and any chosen pieces lifted off the background as
// flat colour with a coverage alpha. Shapes come from coverage; colour only says which ink a
// pixel belongs to, so a red letter keeps its full colour and its exact edge.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodePng } from '../../../native-loops/native-visual-check/scripts/lib/png.mjs';
import { blank, rgbToHex } from './raster.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** Read a PNG, or on macOS any image `sips` reads (JPEG, HEIC, WebP, TIFF), as RGBA. */
export function readImage(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.subarray(0, 4).equals(PNG_SIGNATURE)) {
    const image = decodePng(bytes);
    if (image) return image;
  }
  if (/\.svg$/i.test(file)) throw new Error('An SVG logo cannot be read here. Ask for a PNG export at least 1024 px wide.');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-logo-'));
  const converted = path.join(temp, 'logo.png');
  try {
    execFileSync('sips', ['-s', 'format', 'png', file, '--out', converted], { stdio: 'ignore' });
    const image = decodePng(fs.readFileSync(converted));
    if (image) return image;
  } catch { /* sips is macOS only; fall through to the plain answer */ }
  finally { fs.rmSync(temp, { recursive: true, force: true }); }
  throw new Error(`${path.basename(file)} is not an image this can read. Ask for a PNG of the logo.`);
}

const dist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const at = (image, i) => [image.data[i * 4], image.data[i * 4 + 1], image.data[i * 4 + 2], image.data[i * 4 + 3]];

/**
 * The background: transparent when the image is mostly see-through, else the colour that covers
 * the most pixels. Then the area to read: the largest connected run of that background, so a logo
 * on a card inside a screenshot is read on the card and the frame around it is left out.
 */
export function findBackground(image, override) {
  const n = image.width * image.height;
  let clear = 0;
  for (let i = 0; i < n; i += 1) if (image.data[i * 4 + 3] < 16) clear += 1;
  if (override === 'transparent' || (!override && clear > n * 0.05)) {
    return { kind: 'transparent', area: { x: 0, y: 0, w: image.width, h: image.height } };
  }
  let colour;
  if (override) {
    colour = override;
  } else {
    const bins = new Map();
    for (let i = 0; i < n; i += 1) {
      const [r, g, b] = at(image, i);
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bin.count += 1; bin.r += r; bin.g += g; bin.b += b;
      bins.set(key, bin);
    }
    const top = [...bins.values()].sort((a, b) => b.count - a.count)[0];
    colour = [top.r / top.count, top.g / top.count, top.b / top.count].map(Math.round);
  }
  const isBg = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) if (dist(at(image, i), colour) <= 24 && image.data[i * 4 + 3] > 200) isBg[i] = 1;
  const runs = components(isBg, image.width, image.height, 1);
  const largest = runs.sort((a, b) => b.area - a.area)[0];
  const area = largest ? { x: largest.x, y: largest.y, w: largest.w, h: largest.h } : { x: 0, y: 0, w: image.width, h: image.height };
  return { kind: 'colour', colour, hex: rgbToHex(colour), area };
}

/** 8-connected components of a 0/1 mask, each with its box, area and pixel indices. */
export function components(mask, width, height, minArea = 1) {
  const label = new Int32Array(mask.length);
  const out = [];
  const stack = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || label[start]) continue;
    const id = out.length + 1;
    const pixels = [];
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    label[start] = id; stack.push(start);
    while (stack.length) {
      const p = stack.pop(); pixels.push(p);
      const x = p % width; const y = (p - x) / width;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy; if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx; if (nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (mask[q] && !label[q]) { label[q] = id; stack.push(q); }
        }
      }
    }
    if (pixels.length >= minArea) out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area: pixels.length, pixels });
  }
  return out;
}

function inkMask(image, bg) {
  const n = image.width * image.height;
  const mask = new Uint8Array(n);
  const { x, y, w, h } = bg.area;
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      const i = row * image.width + col;
      const px = at(image, i);
      mask[i] = bg.kind === 'transparent' ? (px[3] > 24 ? 1 : 0) : (px[3] > 128 && dist(px, bg.colour) > 32 ? 1 : 0);
    }
  }
  return mask;
}

/**
 * The inks: colours of pixels inside a flat run (all 8 neighbours ink and within 16 of it),
 * clustered, each with its share of those pixels. A flat logo has a few; a photo has many.
 */
export function findPalette(image, mask) {
  const { width } = image;
  const clusters = [];
  let total = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const x = i % width; const y = (i - x) / width;
    if (x === 0 || y === 0 || x === width - 1 || y === image.height - 1) continue;
    const c = at(image, i);
    let flat = true;
    for (let dy = -1; dy <= 1 && flat; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const q = i + dy * width + dx;
      if (!mask[q] || dist(at(image, q), c) > 16) { flat = false; break; }
    }
    if (!flat) continue;
    total += 1;
    let home = clusters.find((k) => dist(k.mean, c) <= 40);
    if (!home) { home = { sum: [0, 0, 0], count: 0, mean: c.slice(0, 3) }; clusters.push(home); }
    home.sum[0] += c[0]; home.sum[1] += c[1]; home.sum[2] += c[2]; home.count += 1;
    if (home.count % 64 === 1) home.mean = home.sum.map((v) => v / home.count);
  }
  return clusters
    .map((k) => ({ rgb: k.sum.map((v) => Math.round(v / k.count)), share: k.count / Math.max(1, total) }))
    .filter((k) => k.share >= 0.005)
    .sort((a, b) => b.share - a.share)
    .map((k) => ({ ...k, hex: rgbToHex(k.rgb) }));
}

const overlapY = (a, b) => Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const gapX = (a, b) => Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function union(a, b) {
  const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y, area: a.area + b.area, parts: [...a.parts, ...b.parts] };
}

/**
 * Pieces grouped the way a person names them: shapes nested in each other's box make one mark,
 * letters of one size side by side make one line of text, and a speck (an i's dot) joins the
 * group beside it. Numbered in reading order.
 */
export function groupPieces(pieces) {
  let groups = pieces.map((p, index) => ({ x: p.x, y: p.y, w: p.w, h: p.h, area: p.area, parts: [index] }));
  const mergeWhile = (shouldMerge) => {
    for (let changed = true; changed;) {
      changed = false;
      outer: for (let i = 0; i < groups.length; i += 1) {
        for (let j = i + 1; j < groups.length; j += 1) {
          if (!shouldMerge(groups[i], groups[j])) continue;
          groups[i] = union(groups[i], groups[j]); groups.splice(j, 1); changed = true; break outer;
        }
      }
    }
  };
  mergeWhile((a, b) => intersects(a, b));
  mergeWhile((a, b) => {
    const small = Math.min(a.h, b.h); const big = Math.max(a.h, b.h);
    return overlapY(a, b) >= 0.5 * small && big / small <= 1.8 && gapX(a, b) <= 0.6 * small;
  });
  const largest = Math.max(...groups.map((g) => g.area));
  const specks = groups.filter((g) => g.area < largest * 0.01);
  for (const speck of specks) {
    const others = groups.filter((g) => g !== speck && g.area >= largest * 0.01);
    let best = null; let bestDistance = Infinity;
    for (const g of others) {
      const dx = Math.max(0, g.x - (speck.x + speck.w), speck.x - (g.x + g.w));
      const dy = Math.max(0, g.y - (speck.y + speck.h), speck.y - (g.y + g.h));
      const d = Math.hypot(dx, dy);
      if (d <= 0.6 * g.h && d < bestDistance) { best = g; bestDistance = d; }
    }
    if (best) { groups[groups.indexOf(best)] = union(best, speck); groups.splice(groups.indexOf(speck), 1); }
  }
  // Reading order: by line (tops within half a height), then left to right.
  groups.sort((a, b) => (Math.abs(a.y - b.y) < Math.min(a.h, b.h) / 2 ? a.x - b.x : a.y - b.y));
  return groups.map((g, index) => ({ id: index + 1, ...g }));
}

/** Everything `inspect` reports about a logo, plus what `make` needs to lift pieces off it. */
export function analyse(image, { background } = {}) {
  const bg = findBackground(image, background);
  const mask = inkMask(image, bg);
  const minArea = Math.max(4, Math.round(image.width * image.height * 0.000004));
  let pieces = components(mask, image.width, image.height, minArea);
  const inset = bg.area.w < image.width || bg.area.h < image.height;
  const dropped = [];
  if (inset) {
    // A frame around a card: ink touching the card's own edge is the frame's corners, not the logo.
    const { x, y, w, h } = bg.area;
    pieces = pieces.filter((p) => {
      const edge = p.x <= x || p.y <= y || p.x + p.w >= x + w || p.y + p.h >= y + h;
      if (edge) dropped.push(p);
      return !edge;
    });
  }
  const palette = findPalette(image, mask);
  const groups = groupPieces(pieces).map((g) => {
    const shares = new Map();
    for (const index of g.parts) for (const p of pieces[index].pixels) {
      const px = at(image, p); const ink = nearestInk(px, palette);
      if (ink && dist(px, ink.rgb) <= 40) shares.set(ink.hex, (shares.get(ink.hex) ?? 0) + 1);
    }
    const sum = [...shares.values()].reduce((a, b) => a + b, 0) || 1;
    return { id: g.id, box: [g.x, g.y, g.w, g.h], area: g.area, parts: g.parts,
      inks: [...shares].sort((a, b) => b[1] - a[1]).map(([hex, count]) => ({ hex, share: +(count / sum).toFixed(3) })) };
  });
  return { image, bg, mask, pieces, groups, palette, droppedFrame: dropped.length };
}

function nearestInk(px, palette) {
  let best = null; let bestD = Infinity;
  for (const ink of palette) { const d = dist(px, ink.rgb); if (d < bestD) { best = ink; bestD = d; } }
  return best;
}

// Coverage of one pixel by an ink: how far the pixel sits from the background toward that ink.
function coverageOf(px, bgRgb, ink) {
  const v = [ink[0] - bgRgb[0], ink[1] - bgRgb[1], ink[2] - bgRgb[2]];
  const len2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2;
  if (len2 < 1) return { a: 0, residual: Infinity };
  const a = Math.max(0, Math.min(1, ((px[0] - bgRgb[0]) * v[0] + (px[1] - bgRgb[1]) * v[1] + (px[2] - bgRgb[2]) * v[2]) / len2));
  const residual = Math.hypot(px[0] - (bgRgb[0] + a * v[0]), px[1] - (bgRgb[1] + a * v[1]), px[2] - (bgRgb[2] + a * v[2]));
  return { a, residual };
}

/**
 * Lift the chosen pieces off the background and lay them out: each part is a group (by id) or a
 * box [x, y, w, h], moved by dx, dy source pixels. Answers the artwork cropped to what it holds.
 */
export function lift(analysis, parts) {
  const { image, bg, pieces, groups, palette } = analysis;
  const { width } = image;
  // Ink pixels of the chosen pieces, grown 2 px for their soft edge, each labelled with its piece.
  const owner = new Int32Array(image.width * image.height);
  const placed = [];
  for (const part of parts) {
    let box; let chosen;
    if (part.group !== undefined) {
      const group = groups.find((g) => g.id === part.group);
      if (!group) throw new Error(`There is no group ${part.group}; inspect numbers ${groups.map((g) => g.id).join(', ')}.`);
      box = group.box; chosen = group.parts;
    } else if (Array.isArray(part.box) && part.box.length === 4) {
      box = part.box.map(Math.round);
      chosen = pieces.map((p, index) => index).filter((index) => intersectsBox(pieces[index], box));
    } else {
      throw new Error('Each part names a "group" from inspect or a "box": [x, y, w, h].');
    }
    owner.fill(0);
    for (const index of chosen) for (const p of pieces[index].pixels) owner[p] = index + 1;
    for (const index of chosen) for (const p of pieces[index].pixels) {
      const x = p % width; const y = (p - x) / width;
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
        const nx = x + dx; const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < image.height && !owner[ny * width + nx]) owner[ny * width + nx] = index + 1;
      }
    }
    // Each piece is drawn only in the inks found inside it. A neutral grey sits on the line from
    // white to black, so a grey edge pixel fits black at half coverage as well as grey at full;
    // without this, a grey square's edge reads as see-through black and looks bitten.
    const inksOf = new Map(chosen.map((index) => [index + 1, piecePalette(image, pieces[index], palette)]));
    const [bx, by, bw, bh] = box;
    const x0 = Math.max(0, bx - 2); const y0 = Math.max(0, by - 2);
    const x1 = Math.min(width, bx + bw + 2); const y1 = Math.min(image.height, by + bh + 2);
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
      const i = y * width + x;
      if (!owner[i]) continue;
      const px = at(image, i);
      const candidates = inksOf.get(owner[i]);
      let rgb; let a;
      if (bg.kind === 'transparent') {
        a = px[3] / 255; const ink = nearestInk(px, candidates);
        rgb = ink && dist(px, ink.rgb) <= 40 ? ink.rgb : px.slice(0, 3);
      } else {
        let best = { a: 0, residual: Infinity }; let bestInk = null;
        for (const ink of candidates) {
          const c = coverageOf(px, bg.colour, ink.rgb);
          if (c.residual < best.residual) { best = c; bestInk = ink; }
        }
        if (!bestInk || best.residual > 60) { a = 1; rgb = px.slice(0, 3); } else { a = best.a; rgb = bestInk.rgb; }
      }
      if (a <= 0.02) continue;
      placed.push([x + Math.round(part.dx ?? 0), y + Math.round(part.dy ?? 0), rgb, a]);
    }
  }
  if (!placed.length) throw new Error('The chosen parts hold no ink.');
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const [x, y] of placed) { if (x < left) left = x; if (y < top) top = y; if (x > right) right = x; if (y > bottom) bottom = y; }
  const art = blank(right - left + 1, bottom - top + 1);
  for (const [x, y, rgb, a] of placed) {
    const o = ((y - top) * art.width + (x - left)) * 4;
    if (a * 255 < art.data[o + 3]) continue;
    art.data[o] = rgb[0]; art.data[o + 1] = rgb[1]; art.data[o + 2] = rgb[2]; art.data[o + 3] = Math.round(a * 255);
  }
  return art;
}

// The inks one piece is drawn in: those its own pixels match, each holding at least 5% of them.
function piecePalette(image, piece, palette) {
  const counts = new Map();
  let total = 0;
  for (const p of piece.pixels) {
    const px = at(image, p); const ink = nearestInk(px, palette);
    if (ink && dist(px, ink.rgb) <= 24) { counts.set(ink, (counts.get(ink) ?? 0) + 1); total += 1; }
  }
  const kept = [...counts].filter(([, n]) => n >= total * 0.05).map(([ink]) => ink);
  return kept.length ? kept : palette;
}

function intersectsBox(piece, [x, y, w, h]) {
  return piece.x < x + w && x < piece.x + piece.w && piece.y < y + h && y < piece.y + piece.h;
}

/** Swap inks: every pixel within 48 of a `from` colour takes its `to` colour; the shape stays. */
export function recolour(art, rules = []) {
  const out = { width: art.width, height: art.height, data: Buffer.from(art.data) };
  const parsed = rules.map((r) => ({ from: r.from, to: r.to }));
  for (let o = 0; o < out.data.length; o += 4) {
    if (!out.data[o + 3]) continue;
    const px = [out.data[o], out.data[o + 1], out.data[o + 2]];
    const rule = parsed.find((r) => dist(px, r.from) <= 48);
    if (rule) { out.data[o] = rule.to[0]; out.data[o + 1] = rule.to[1]; out.data[o + 2] = rule.to[2]; }
  }
  return out;
}

/** One flat colour with the artwork's alpha, minus any ink in `knockout`, which turns clear. */
export function silhouette(art, rgb, knockout = []) {
  const out = { width: art.width, height: art.height, data: Buffer.from(art.data) };
  for (let o = 0; o < out.data.length; o += 4) {
    if (!out.data[o + 3]) continue;
    const px = [art.data[o], art.data[o + 1], art.data[o + 2]];
    if (knockout.some((k) => dist(px, k) <= 48)) { out.data[o + 3] = 0; continue; }
    out.data[o] = rgb[0]; out.data[o + 1] = rgb[1]; out.data[o + 2] = rgb[2];
  }
  return out;
}

/** Greyscale by perceived lightness, alpha kept. */
export function greyscale(art) {
  const out = { width: art.width, height: art.height, data: Buffer.from(art.data) };
  for (let o = 0; o < out.data.length; o += 4) {
    const v = Math.round(0.299 * out.data[o] + 0.587 * out.data[o + 1] + 0.114 * out.data[o + 2]);
    out.data[o] = out.data[o + 1] = out.data[o + 2] = v;
  }
  return out;
}

/** The farthest drawn pixel (alpha over 10%) from the centre of the artwork's box, in its pixels. */
export function maxRadius(art) {
  const cx = art.width / 2; const cy = art.height / 2;
  let best = 0;
  for (let y = 0; y < art.height; y += 1) for (let x = 0; x < art.width; x += 1) {
    if (art.data[(y * art.width + x) * 4 + 3] < 26) continue;
    const dx = Math.max(Math.abs(x - cx), Math.abs(x + 1 - cx));
    const dy = Math.max(Math.abs(y - cy), Math.abs(y + 1 - cy));
    best = Math.max(best, Math.hypot(dx, dy));
  }
  return best;
}

/** The inks an artwork is drawn in, by share of its drawn pixels. */
export function inksOf(art) {
  const counts = new Map();
  let total = 0;
  for (let o = 0; o < art.data.length; o += 4) {
    if (art.data[o + 3] < 230) continue;
    const hex = rgbToHex([art.data[o], art.data[o + 1], art.data[o + 2]]);
    counts.set(hex, (counts.get(hex) ?? 0) + 1); total += 1;
  }
  return [...counts].map(([hex, n]) => ({ hex, share: n / Math.max(1, total) })).sort((a, b) => b.share - a.share);
}
