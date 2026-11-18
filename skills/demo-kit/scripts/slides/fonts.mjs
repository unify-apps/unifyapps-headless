// The story's fonts inside the PowerPoint, so it shows its own type on a machine that does not have them: each family's
// regular, bold, italic and bold italic, from Google Fonts as TrueType, cut down to the characters the deck uses and
// plain Latin (so an edit still finds its letters), and written as Embedded OpenType, the form PowerPoint keeps them in.
// Kept in HOME/fonts/ttf, so a rebuild needs no network. A family Google Fonts does not have is left to the machine.
import fs from 'node:fs';
import path from 'node:path';
import { HOME, sha1 } from '../core/util.mjs';

const FACES = { regular: [0, 400], bold: [0, 700], italic: [1, 400], boldItalic: [1, 700] };
const LATIN = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') + '‘’“”–—…•·×→←↑↓€£©®™°';

/**
 * runs: every run of text in the deck ({ font, weight, italic, text }). Returns [{ typeface, generic, faces:
 * { regular, bold, italic, boldItalic } }], each face an Embedded OpenType Buffer; a face it could not get is left out.
 */
export async function embedFonts(runs, { log = () => {} } = {}) {
  const fams = new Map();
  for (const r of runs) {
    const f = fams.get(r.font) ?? { typeface: r.font, generic: r.generic, faces: new Set(['regular']), text: new Set(LATIN) };
    f.faces.add(r.weight >= 600 ? (r.italic ? 'boldItalic' : 'bold') : r.italic ? 'italic' : 'regular');
    for (const c of r.text) f.text.add(c);
    fams.set(r.font, f);
  }
  const out = [];
  for (const f of fams.values()) {
    const faces = {};
    for (const face of f.faces) {
      const ttf = await fetchFace(f.typeface, face, [...f.text].sort().join('')).catch((e) => { log(`fonts: ${f.typeface} ${face} not embedded (${e.message})`); return null; });
      if (ttf) faces[face] = eot(ttf);
    }
    if (faces.regular) out.push({ typeface: f.typeface, generic: f.generic, faces });
  }
  return out;
}

async function fetchFace(family, face, text) {
  const [ital, wght] = FACES[face];
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:ital,wght@${ital},${wght}&text=${encodeURIComponent(text)}`;
  const kept = path.join(HOME, 'fonts', 'ttf', `${sha1(url)}.ttf`);
  if (fs.existsSync(kept)) return fs.readFileSync(kept);
  // a client Google Fonts does not know gets TrueType, not WOFF2
  const css = await get(url).then((r) => r.text());
  const src = css.match(/url\((https:[^)]+)\)\s*format\('truetype'\)/)?.[1];
  if (!src) throw new Error('no TrueType file');
  const ttf = Buffer.from(await (await get(src)).arrayBuffer());
  if (ttf.readUInt32BE(0) !== 0x00010000) throw new Error('not a TrueType file');
  fs.mkdirSync(path.dirname(kept), { recursive: true });
  fs.writeFileSync(kept, ttf);
  return ttf;
}

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'UnifyApps-Headless' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${r.status} from Google Fonts`);
  return r;
}

/**
 * A TrueType font as Embedded OpenType, version 2.1, uncompressed and unsubset as far as EOT knows: the header names
 * the font from its own tables, then the font follows unchanged. Refuses a font whose licence does not allow embedding.
 */
export function eot(ttf) {
  const tables = {};
  for (let i = 0, n = ttf.readUInt16BE(4); i < n; i++) {
    const at = 12 + i * 16;
    tables[ttf.toString('latin1', at, at + 4)] = { offset: ttf.readUInt32BE(at + 8), length: ttf.readUInt32BE(at + 12) };
  }
  const os2 = tables['OS/2'], head = tables.head, name = tables.name;
  if (!os2 || !head || !name) throw new Error('the font has no OS/2, head or name table');
  const o = os2.offset;
  const fsType = ttf.readUInt16BE(o + 8);
  if (fsType & 0x0002) throw new Error('the font may not be embedded');
  const names = readNames(ttf, name.offset);
  const str = (id) => Buffer.from(names[id] ?? '', 'utf16le');
  const family = str(1), style = str(2), version = str(5), full = str(4);
  // 80 bytes of fixed fields, four names each after a padding and a length, then a padding and an empty root string
  const size = 80 + 4 * 4 + family.length + style.length + version.length + full.length + 4;
  const h = Buffer.alloc(size);
  let p = 0;
  const u32 = (v) => { h.writeUInt32LE(v >>> 0, p); p += 4; };
  const u16 = (v) => { h.writeUInt16LE(v, p); p += 2; };
  const u8 = (v) => { h.writeUInt8(v, p); p += 1; };
  u32(size + ttf.length); u32(ttf.length); u32(0x00020001); u32(0);
  ttf.copy(h, p, o + 32, o + 42); p += 10;
  u8(1); u8(ttf.readUInt16BE(o + 62) & 1); u32(ttf.readUInt16BE(o + 4)); u16(fsType); u16(0x504c);
  for (let k = 0; k < 4; k++) u32(ttf.readUInt32BE(o + 42 + k * 4));
  const v1 = ttf.readUInt16BE(o) >= 1;
  u32(v1 ? ttf.readUInt32BE(o + 78) : 0); u32(v1 ? ttf.readUInt32BE(o + 82) : 0);
  u32(ttf.readUInt32BE(head.offset + 8));
  for (let k = 0; k < 4; k++) u32(0);
  for (const s of [family, style, version, full]) { u16(0); u16(s.length); s.copy(h, p); p += s.length; }
  u16(0); u16(0);
  if (p !== size) throw new Error(`EOT header is ${p} bytes, not ${size}`);
  return Buffer.concat([h, ttf]);
}

/** The Windows English names (platform 3, encoding 1, language 0x409) by name id, as text. */
function readNames(ttf, at) {
  const count = ttf.readUInt16BE(at + 2), strings = at + ttf.readUInt16BE(at + 4), out = {};
  for (let i = 0; i < count; i++) {
    const r = at + 6 + i * 12;
    const [platform, encoding, language, id, length, offset] = [0, 2, 4, 6, 8, 10].map((k) => ttf.readUInt16BE(r + k));
    if (platform !== 3 || encoding !== 1 || language !== 0x409 || out[id] != null) continue;
    const be = ttf.subarray(strings + offset, strings + offset + length);
    out[id] = Buffer.from(be).swap16().toString('utf16le');
  }
  return out;
}
