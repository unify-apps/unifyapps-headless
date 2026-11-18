// Folds the person's Figma exports (CSS all layers, PNG @1x, SVG, PDF) into <run>/board/exports/.
// Big SVGs are rasterised, never read; PDF text is extracted only when pdftotext exists.
import { existsSync, mkdirSync, copyFileSync, statSync, openSync, readSync, closeSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { slug, readJsonIfExists, writeJsonAtomic } from './args.mjs';
import { readIhdr } from './png.mjs';

export const RASTERISE_ABOVE = 1024 * 1024;

export function classifyExport(file) {
  const head = Buffer.alloc(512);
  const fd = openSync(file, 'r');
  let read = 0;
  try { read = readSync(fd, head, 0, 512, 0); } finally { closeSync(fd); }
  const text = head.toString('latin1', 0, read);
  if (text.startsWith('\x89PNG')) return 'png';
  if (text.startsWith('%PDF')) return 'pdf';
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg/i.test(text)) return 'svg';
  const ext = path.extname(file).toLowerCase();
  if (ext === '.css' || /\/\*[^*]*\*\/\s*[\s\S]*?[a-z-]+\s*:/i.test(text)) return 'css';
  if (ext === '.md' || ext === '.txt') return 'text';
  if (['.jpg', '.jpeg', '.webp'].includes(ext)) return 'image';
  return 'other';
}

function has(tool) { try { execFileSync('which', [tool], { stdio: 'ignore' }); return true; } catch { return false; } }

// sips renders a 52 MB export in about a second at the SVG's own size; qlmanage renders vector-sharp at
// 2048 px but hung for minutes on the same file, so it is only the fallback and only for small files.
export function rasterizeSvg(src, out) {
  mkdirSync(path.dirname(out), { recursive: true });
  if (has('sips')) {
    try {
      execFileSync('sips', ['-s', 'format', 'png', src, '--out', out], { stdio: 'ignore', timeout: 180000 });
      const ihdr = readIhdr(out);
      if (ihdr) return { tool: 'sips', width: ihdr.width, height: ihdr.height, note: 'rendered at the SVG size (1x)' };
    } catch { /* fall through */ }
  }
  if (has('qlmanage') && statSync(src).size <= 8 * 1024 * 1024) {
    try {
      const dir = path.dirname(out);
      execFileSync('qlmanage', ['-t', '-s', '2048', '-o', dir, src], { stdio: 'ignore', timeout: 120000 });
      const produced = path.join(dir, `${path.basename(src)}.png`);
      if (existsSync(produced)) { copyFileSync(produced, out); const ihdr = readIhdr(out); return { tool: 'qlmanage', width: ihdr?.width ?? null, height: ihdr?.height ?? null, note: 'thumbnail on a square 2048 canvas: padded, not cropped' }; }
    } catch { /* fall through */ }
  }
  return null;
}

export function pdfText(src, out) {
  if (!has('pdftotext')) return null;
  try { execFileSync('pdftotext', ['-layout', src, out], { stdio: 'ignore', timeout: 120000 }); return existsSync(out) ? { tool: 'pdftotext', size: statSync(out).size } : null; } catch { return null; }
}

export function listExportFiles(dir) {
  return readdirSync(dir).filter((name) => !name.startsWith('.')).map((name) => path.join(dir, name)).filter((file) => statSync(file).isFile());
}

// Copies each file in, records it in board.json under sources.exports and returns one line per file.
export function importExports(runDir, files) {
  const exportsDir = path.join(runDir, 'board', 'exports');
  mkdirSync(exportsDir, { recursive: true });
  const boardFile = path.join(runDir, 'board', 'board.json');
  const board = readJsonIfExists(boardFile) ?? { sources: {} };
  board.sources ||= {};
  const sources = (board.sources.exports ||= { css: null, svg: null, pdf: null, png: null, svgRaster: null, pdfText: null, other: [] });
  const report = [];
  for (const file of files) {
    if (!existsSync(file)) { report.push({ file, status: 'missing' }); continue; }
    const kind = classifyExport(file);
    const ext = kind === 'text' ? path.extname(file) : kind === 'image' ? path.extname(file) : `.${kind}`;
    const name = `${slug(path.basename(file, path.extname(file)), 'export')}${kind === 'other' ? path.extname(file) : ext}`;
    const target = path.join(exportsDir, name);
    copyFileSync(file, target);
    const rel = path.join('exports', name);
    const size = statSync(target).size;
    const line = { file, kind, copiedTo: rel, size };
    // Several files of one kind: the biggest is the frame export, the rest (icons, cards) are kept as other.
    const pixels = kind === 'png' ? (() => { const ihdr = readIhdr(target); return ihdr ? ihdr.width * ihdr.height : 0; })() : size;
    if (['css', 'svg', 'pdf', 'png'].includes(kind)) {
      const current = sources[kind] ? sources[`${kind}Weight`] ?? 0 : -1;
      if (pixels > current) { if (sources[kind]) sources.other.push(sources[kind]); sources[kind] = rel; sources[`${kind}Weight`] = pixels; line.primary = true; }
      else { sources.other.push(rel); line.primary = false; }
    } else sources.other.push(rel);
    if (kind === 'svg' && line.primary && size > RASTERISE_ABOVE) {
      const raster = rasterizeSvg(target, path.join(exportsDir, `${path.basename(name, '.svg')}.raster.png`));
      line.raster = raster ?? 'unrasterised';
      sources.svgRaster = raster ? { path: path.join('exports', `${path.basename(name, '.svg')}.raster.png`), ...raster } : 'unrasterised';
    }
    if (kind === 'pdf' && line.primary) {
      const text = pdfText(target, path.join(exportsDir, `${path.basename(name, '.pdf')}.txt`));
      line.text = text ?? 'skipped (no pdftotext)';
      sources.pdfText = text ? path.join('exports', `${path.basename(name, '.pdf')}.txt`) : null;
    }
    if (kind === 'png') { const ihdr = readIhdr(target); line.px = ihdr ? `${ihdr.width}x${ihdr.height}` : null; if (line.primary) sources.pngPx = ihdr ? { width: ihdr.width, height: ihdr.height } : null; }
    report.push(line);
  }
  writeJsonAtomic(boardFile, board);
  return { report, board };
}
