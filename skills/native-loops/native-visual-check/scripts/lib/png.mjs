// A PNG reader and writer with no dependencies: enough for simulator screenshots
// (8-bit RGB or RGBA, not interlaced) and for the small images the report composes.
// A vendored pngjs under native-design-spec is used when it is there, so palette
// and 16-bit files decode too; nothing here requires it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

const CRC_TABLE = new Int32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  CRC_TABLE[index] = value;
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function* chunks(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file');
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    yield { type, data: buffer.subarray(offset + 8, offset + 8 + length) };
    offset += 12 + length;
    if (type === 'IEND') return;
  }
}

export function readIhdr(buffer) {
  for (const chunk of chunks(buffer)) {
    if (chunk.type !== 'IHDR') continue;
    return {
      width: chunk.data.readUInt32BE(0),
      height: chunk.data.readUInt32BE(4),
      bitDepth: chunk.data[8],
      colorType: chunk.data[9],
      interlace: chunk.data[12],
    };
  }
  throw new Error('PNG without IHDR');
}

export function readIhdrFile(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(33);
    fs.readSync(fd, head, 0, 33, 0);
    return readIhdr(head);
  } finally {
    fs.closeSync(fd);
  }
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function unfilter(raw, width, height, channels) {
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)];
    const src = row * (stride + 1) + 1;
    const dst = row * stride;
    const prev = row > 0 ? dst - stride : -1;
    for (let index = 0; index < stride; index += 1) {
      const byte = raw[src + index];
      const left = index >= channels ? out[dst + index - channels] : 0;
      const up = prev >= 0 ? out[prev + index] : 0;
      const upLeft = prev >= 0 && index >= channels ? out[prev + index - channels] : 0;
      let value = byte;
      if (filter === 1) value = byte + left;
      else if (filter === 2) value = byte + up;
      else if (filter === 3) value = byte + ((left + up) >> 1);
      else if (filter === 4) value = byte + paeth(left, up, upLeft);
      out[dst + index] = value & 0xff;
    }
  }
  return out;
}

function toRgba(pixels, width, height, channels) {
  if (channels === 4) return pixels;
  const out = Buffer.alloc(width * height * 4);
  for (let source = 0, target = 0; source < pixels.length; source += channels, target += 4) {
    if (channels === 3) {
      out[target] = pixels[source]; out[target + 1] = pixels[source + 1]; out[target + 2] = pixels[source + 2]; out[target + 3] = 255;
    } else if (channels === 2) {
      out[target] = out[target + 1] = out[target + 2] = pixels[source]; out[target + 3] = pixels[source + 1];
    } else {
      out[target] = out[target + 1] = out[target + 2] = pixels[source]; out[target + 3] = 255;
    }
  }
  return out;
}

let vendoredPngjs;
function vendoredPng() {
  if (vendoredPngjs !== undefined) return vendoredPngjs;
  vendoredPngjs = null;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const vendor = path.resolve(here, '../../../native-design-spec/scripts/vendor/pngjs');
  if (!fs.existsSync(path.join(vendor, 'package.json'))) return null;
  try {
    const loaded = createRequire(import.meta.url)(vendor);
    vendoredPngjs = loaded.PNG ?? loaded.default?.PNG ?? null;
  } catch {
    vendoredPngjs = null;
  }
  return vendoredPngjs;
}

/** Decode to {width, height, data: RGBA bytes}; null when the file is a kind this reader does not handle. */
export function decodePng(buffer) {
  const ihdr = readIhdr(buffer);
  const channels = CHANNELS[ihdr.colorType];
  const simple = channels && ihdr.bitDepth === 8 && ihdr.interlace === 0;
  if (!simple) {
    const PNG = vendoredPng();
    if (!PNG) return null;
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: Buffer.from(png.data) };
  }
  const idat = [];
  for (const chunk of chunks(buffer)) if (chunk.type === 'IDAT') idat.push(chunk.data);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = unfilter(raw, ihdr.width, ihdr.height, channels);
  return { width: ihdr.width, height: ihdr.height, data: toRgba(pixels, ihdr.width, ihdr.height, channels) };
}

export function decodePngFile(file) {
  return decodePng(fs.readFileSync(file));
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

/**
 * Encode RGBA bytes as an 8-bit PNG. `alpha: false` writes RGB with no alpha channel at all, for an
 * image that must be opaque (an App Store icon is refused when its file carries one).
 */
export function encodePng({ width, height, data }, { alpha = true } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const channels = alpha ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (stride + 1)] = 0;
    if (alpha) {
      data.copy ? data.copy(raw, row * (stride + 1) + 1, row * stride, row * stride + stride)
        : raw.set(data.subarray(row * stride, row * stride + stride), row * (stride + 1) + 1);
      continue;
    }
    for (let col = 0; col < width; col += 1) {
      const source = (row * width + col) * 4;
      const target = row * (stride + 1) + 1 + col * 3;
      raw[target] = data[source]; raw[target + 1] = data[source + 1]; raw[target + 2] = data[source + 2];
    }
  }
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

export function writePngFile(file, image, options) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(image, options));
}

export function solidImage(width, height, [red, green, blue, alpha = 255]) {
  const data = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) { data[offset] = red; data[offset + 1] = green; data[offset + 2] = blue; data[offset + 3] = alpha; }
  return { width, height, data };
}

export function fillRect(image, x, y, w, h, [red, green, blue, alpha = 255]) {
  const x1 = Math.max(0, Math.floor(x)); const y1 = Math.max(0, Math.floor(y));
  const x2 = Math.min(image.width, Math.ceil(x + w)); const y2 = Math.min(image.height, Math.ceil(y + h));
  for (let row = y1; row < y2; row += 1) {
    for (let col = x1; col < x2; col += 1) {
      const offset = (row * image.width + col) * 4;
      image.data[offset] = red; image.data[offset + 1] = green; image.data[offset + 2] = blue; image.data[offset + 3] = alpha;
    }
  }
  return image;
}

export function crop(image, x, y, w, h) {
  const x1 = Math.max(0, Math.floor(x)); const y1 = Math.max(0, Math.floor(y));
  const x2 = Math.min(image.width, Math.ceil(x + w)); const y2 = Math.min(image.height, Math.ceil(y + h));
  const width = Math.max(1, x2 - x1); const height = Math.max(1, y2 - y1);
  const data = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const src = ((y1 + row) * image.width + x1) * 4;
    data.set(image.data.subarray(src, src + width * 4), row * width * 4);
  }
  return { width, height, data };
}

/** Box-filter resize to the given width (height follows), or to both when height is given. */
export function resize(image, width, height = Math.max(1, Math.round((image.height * width) / image.width))) {
  const out = Buffer.alloc(width * height * 4);
  const sx = image.width / width; const sy = image.height / height;
  for (let row = 0; row < height; row += 1) {
    const y1 = Math.floor(row * sy); const y2 = Math.max(y1 + 1, Math.floor((row + 1) * sy));
    for (let col = 0; col < width; col += 1) {
      const x1 = Math.floor(col * sx); const x2 = Math.max(x1 + 1, Math.floor((col + 1) * sx));
      let red = 0, green = 0, blue = 0, alpha = 0, count = 0;
      for (let sourceRow = y1; sourceRow < y2 && sourceRow < image.height; sourceRow += 1) {
        for (let sourceCol = x1; sourceCol < x2 && sourceCol < image.width; sourceCol += 1) {
          const offset = (sourceRow * image.width + sourceCol) * 4;
          red += image.data[offset]; green += image.data[offset + 1]; blue += image.data[offset + 2]; alpha += image.data[offset + 3]; count += 1;
        }
      }
      const offset = (row * width + col) * 4;
      out[offset] = red / count; out[offset + 1] = green / count; out[offset + 2] = blue / count; out[offset + 3] = alpha / count;
    }
  }
  return { width, height, data: out };
}

/** Lay images side by side on a neutral background, tops aligned. */
export function composeSideBySide(images, gap = 16, background = [34, 34, 34, 255]) {
  const width = images.reduce((total, image) => total + image.width, 0) + gap * Math.max(0, images.length - 1);
  const height = Math.max(...images.map((image) => image.height));
  const out = solidImage(width, height, background);
  let x = 0;
  for (const image of images) {
    for (let row = 0; row < image.height; row += 1) {
      out.data.set(image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4), ((row * width) + x) * 4);
    }
    x += image.width + gap;
  }
  return out;
}

export function samplePixel(image, x, y) {
  const col = Math.min(image.width - 1, Math.max(0, Math.round(x)));
  const row = Math.min(image.height - 1, Math.max(0, Math.round(y)));
  const offset = (row * image.width + col) * 4;
  return { r: image.data[offset], g: image.data[offset + 1], b: image.data[offset + 2], a: image.data[offset + 3] };
}

export function hexOf({ r, g, b }) {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/**
 * Fraction of rows (from `fromRow` down) whose RGB bytes differ between two same-sized images.
 * The status band is skipped by the caller because the clock changes between shots.
 */
export function differingRowFraction(left, right, { fromRow = 0, tolerance = 0 } = {}) {
  if (left.width !== right.width || left.height !== right.height) return 1;
  const stride = left.width * 4;
  let differing = 0;
  const rows = Math.max(1, left.height - fromRow);
  for (let row = fromRow; row < left.height; row += 1) {
    const start = row * stride;
    for (let offset = start; offset < start + stride; offset += 4) {
      if (Math.abs(left.data[offset] - right.data[offset]) > tolerance || Math.abs(left.data[offset + 1] - right.data[offset + 1]) > tolerance || Math.abs(left.data[offset + 2] - right.data[offset + 2]) > tolerance) { differing += 1; break; }
    }
  }
  return differing / rows;
}

/** Mean luminance per row inside [x0, x1), for the row-correlation offset check. */
export function rowLuminance(image, x0 = 0, x1 = image.width) {
  const rows = new Float64Array(image.height);
  const start = Math.max(0, Math.floor(x0)); const end = Math.min(image.width, Math.ceil(x1));
  for (let row = 0; row < image.height; row += 1) {
    let total = 0;
    for (let col = start; col < end; col += 1) {
      const offset = (row * image.width + col) * 4;
      total += 0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2];
    }
    rows[row] = total / Math.max(1, end - start);
  }
  return rows;
}
