#!/usr/bin/env node
// Usage:
//   node contrast.mjs <png> --info                 pixel size of the screenshot
//   node contrast.mjs <png> <x> <y> <w> <h>        normalized box (0–1, same space as describe frames)
// Reports the dominant (background) colour, the colour with the highest contrast against it that
// covers at least 1% of the box (the text or icon), and their WCAG contrast ratio.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const MIN_SHARE = 0.01;

function decodePng(path) {
  const buffer = readFileSync(path);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || data[12] !== 0 || ![2, 6].includes(colorType)) {
        throw new Error('only 8-bit, non-interlaced RGB or RGBA PNGs are supported');
      }
    }
    if (type === 'IDAT') idatChunks.push(data);
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)];
    const source = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    const target = pixels.subarray(row * stride, (row + 1) * stride);
    const previous = row > 0 ? pixels.subarray((row - 1) * stride, row * stride) : Buffer.alloc(stride);
    for (let index = 0; index < stride; index++) {
      const left = index >= channels ? target[index - channels] : 0;
      const up = previous[index];
      const upLeft = index >= channels ? previous[index - channels] : 0;
      target[index] = (source[index] + predict(filter, left, up, upLeft)) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

function predict(filter, left, up, upLeft) {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return (left + up) >> 1;
  const estimate = left + up - upLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpLeft = Math.abs(estimate - upLeft);
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left;
  return distanceUp <= distanceUpLeft ? up : upLeft;
}

function luminance([red, green, blue]) {
  const linear = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const toHex = (rgb) => `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

function sampleBox(image, box) {
  const [x, y, w, h] = box;
  const left = Math.max(0, Math.floor(x * image.width));
  const top = Math.max(0, Math.floor(y * image.height));
  const right = Math.min(image.width, Math.ceil((x + w) * image.width));
  const bottom = Math.min(image.height, Math.ceil((y + h) * image.height));
  // Quantize to 5 bits per channel so anti-aliased edges fold into their nearest solid colour.
  const buckets = new Map();
  let total = 0;
  for (let row = top; row < bottom; row++) {
    for (let column = left; column < right; column++) {
      const start = (row * image.width + column) * image.channels;
      const rgb = [image.pixels[start], image.pixels[start + 1], image.pixels[start + 2]];
      const key = rgb.map((channel) => channel >> 3).join(',');
      const bucket = buckets.get(key) ?? { count: 0, sum: [0, 0, 0] };
      bucket.count += 1;
      rgb.forEach((channel, index) => {
        bucket.sum[index] += channel;
      });
      buckets.set(key, bucket);
      total += 1;
    }
  }
  if (total === 0) throw new Error('the box is empty; check the frame values');
  const colors = [...buckets.values()]
    .map((bucket) => ({ share: bucket.count / total, rgb: bucket.sum.map((sum) => Math.round(sum / bucket.count)) }))
    .sort((first, second) => second.share - first.share);
  const background = colors[0];
  const foreground = colors
    .slice(1)
    .filter((color) => color.share >= MIN_SHARE)
    .sort((first, second) => contrastRatio(second.rgb, background.rgb) - contrastRatio(first.rgb, background.rgb))[0];
  return { background, foreground, pixels: total };
}

const [path, ...rest] = process.argv.slice(2);
if (!path) {
  console.error('usage: contrast.mjs <png> --info | <x> <y> <w> <h>');
  process.exit(2);
}
const image = decodePng(path);
if (rest[0] === '--info') {
  console.log(JSON.stringify({ width: image.width, height: image.height }));
  process.exit(0);
}
const box = rest.map(Number);
if (box.length !== 4 || box.some(Number.isNaN)) {
  console.error('give the box as four numbers: x y w h (normalized 0–1)');
  process.exit(2);
}
const { background, foreground, pixels } = sampleBox(image, box);
const ratio = foreground ? contrastRatio(foreground.rgb, background.rgb) : null;
console.log(
  JSON.stringify(
    {
      box,
      pixels,
      background: { hex: toHex(background.rgb), share: Number(background.share.toFixed(3)) },
      foreground: foreground ? { hex: toHex(foreground.rgb), share: Number(foreground.share.toFixed(3)) } : null,
      ratio: ratio ? Number(ratio.toFixed(2)) : null,
      passes: ratio ? { normalText: ratio >= 4.5, largeTextOrUi: ratio >= 3 } : null,
    },
    null,
    2,
  ),
);
