// PNG helpers with no dependencies: the IHDR for sizes, `sips` for crops on macOS, and an optional
// vendored pure-JS pngjs (scripts/vendor/pngjs) for crops where sips is absent.
import { readFileSync, openSync, readSync, closeSync, existsSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const VENDOR_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../vendor/pngjs');

export function isPng(file) {
  if (!existsSync(file)) return false;
  const head = Buffer.alloc(8);
  const fd = openSync(file, 'r');
  try { readSync(fd, head, 0, 8, 0); } finally { closeSync(fd); }
  return head.equals(SIGNATURE);
}

// { width, height, bitDepth, colorType } from the first chunk, or null when the file is not a PNG.
export function readIhdr(file) {
  if (!isPng(file)) return null;
  const head = Buffer.alloc(33);
  const fd = openSync(file, 'r');
  try { readSync(fd, head, 0, 33, 0); } finally { closeSync(fd); }
  if (head.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20), bitDepth: head[24], colorType: head[25] };
}

let pngjsPromise;
// Present only when someone vendored it under scripts/vendor/pngjs with its licence; everything else works without it.
export function loadPngjs() {
  pngjsPromise ??= (async () => {
    if (!existsSync(path.join(VENDOR_DIR, 'package.json')) && !existsSync(path.join(VENDOR_DIR, 'index.js'))) return null;
    try { const mod = await import(path.join(VENDOR_DIR, existsSync(path.join(VENDOR_DIR, 'index.js')) ? 'index.js' : 'lib/png.js')); return mod.PNG ?? mod.default?.PNG ?? null; } catch { return null; }
  })();
  return pngjsPromise;
}

let sipsAvailable;
export function hasSips() {
  if (sipsAvailable === undefined) {
    try { execFileSync('sips', ['--help'], { stdio: 'ignore' }); sipsAvailable = true; } catch { sipsAvailable = false; }
  }
  return sipsAvailable;
}

function sips(args) { execFileSync('sips', args, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 }); }

export function clampRect(rect, width, height) {
  const x = Math.max(0, Math.min(width - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(rect.y)));
  const w = Math.max(1, Math.min(width - x, Math.round(rect.w)));
  const h = Math.max(1, Math.min(height - y, Math.round(rect.h)));
  return { x, y, w, h };
}

// sips takes --cropOffset Y X and treats the pair 0 0 as "not set" (it centres the crop), and a flipped or
// rotated copy loses X=0 as well. A crop at the top-left corner pads the image by one pixel first and crops
// at 1 1, which is exact (measured: the first pixel of the crop is the first pixel of the image).
export function cropWithSips(src, rect, out, { maxWidth = 400 } = {}) {
  const info = readIhdr(src);
  if (!info) throw new Error(`${src} is not a PNG`);
  const box = clampRect(rect, info.width, info.height);
  mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.work.png`;
  copyFileSync(src, tmp);
  try {
    if (box.x === 0 && box.y === 0) {
      if (box.w < info.width || box.h < info.height) {
        sips(['--padToHeightWidth', String(info.height + 2), String(info.width + 2), '--padColor', '000000', tmp]);
        sips(['--cropToHeightWidth', String(box.h), String(box.w), '--cropOffset', '1', '1', tmp]);
      }
    } else {
      sips(['--cropToHeightWidth', String(box.h), String(box.w), '--cropOffset', String(box.y), String(box.x), tmp]);
    }
    if (box.w > maxWidth) sips(['--resampleWidth', String(maxWidth), tmp]);
    sips(['-s', 'format', 'png', tmp, '--out', out]);
  } finally { rmSync(tmp, { force: true }); }
  const result = readIhdr(out);
  return { tool: 'sips', ...box, width: result?.width ?? null, height: result?.height ?? null };
}

export async function cropWithPngjs(src, rect, out, { maxWidth = 400 } = {}) {
  const PNG = await loadPngjs();
  if (!PNG) return null;
  const image = PNG.sync.read(readFileSync(src));
  const box = clampRect(rect, image.width, image.height);
  const scale = box.w > maxWidth ? maxWidth / box.w : 1;
  const outW = Math.max(1, Math.round(box.w * scale));
  const outH = Math.max(1, Math.round(box.h * scale));
  const target = new PNG({ width: outW, height: outH });
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx = box.x + Math.min(box.w - 1, Math.floor(x / scale));
      const sy = box.y + Math.min(box.h - 1, Math.floor(y / scale));
      image.data.copy(target.data, (y * outW + x) * 4, (sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4);
    }
  }
  mkdirSync(path.dirname(out), { recursive: true });
  const buffer = PNG.sync.write(target);
  const tmp = `${out}.${process.pid}.tmp`;
  const { writeFileSync, renameSync } = await import('node:fs');
  writeFileSync(tmp, buffer);
  renameSync(tmp, out);
  return { tool: 'pngjs', ...box, width: outW, height: outH };
}

// sips first (zero dependencies on macOS), then pngjs, else null so the caller writes crops.json instead.
export async function cropPng(src, rect, out, options) {
  if (hasSips()) return cropWithSips(src, rect, out, options);
  return cropWithPngjs(src, rect, out, options);
}
