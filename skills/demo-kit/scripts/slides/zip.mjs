// A plain ZIP writer: no zip64, no extra fields, and one fixed timestamp, so the same entries always give the same bytes.
import zlib from 'node:zlib';

const LIMIT = 0xffffffff;
const UTF8_NAMES = 0x0800;
const DOS_DATE = (1 << 5) | 1; // 1980-01-01; the time is 00:00
const TOO_BIG = (what = 'the archive') => new Error(`${what} is 4 GB or more, and this writer has no zip64`);

/** A ZIP archive of `entries`, in order. `data` is a Buffer or a string (UTF-8). Deflated unless `store` is true. */
export function zip(entries) {
  if (entries.length > 0xffff) throw new Error(`a ZIP without zip64 holds at most 65535 entries, not ${entries.length}`);
  const local = [], central = [];
  let offset = 0;
  for (const { name, data, store } of entries) {
    const file = Buffer.from(name, 'utf8');
    if (file.length > 0xffff) throw new Error(`the entry name "${name.slice(0, 40)}…" is longer than 65535 bytes`);
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    if (raw.length >= LIMIT) throw TOO_BIG(name);
    const body = store ? raw : zlib.deflateRawSync(raw);
    if (body.length >= LIMIT) throw TOO_BIG(name);
    const head = fields({ method: store ? 0 : 8, crc: zlib.crc32(raw), packed: body.length, size: raw.length, nameLength: file.length });
    local.push(u32(0x04034b50), head, file, body);
    // version made by 2.0 on MS-DOS; then comment length, disk number and file attributes, all zero
    central.push(u32(0x02014b50), u16(20), head, Buffer.alloc(10), u32(offset), file);
    offset += 4 + head.length + file.length + body.length;
    if (offset >= LIMIT) throw TOO_BIG();
  }
  const directory = Buffer.concat(central);
  if (offset + directory.length + 22 >= LIMIT) throw TOO_BIG();
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

/** The 26 bytes a local header and its central directory record share, from "version needed" to "extra field length". */
function fields({ method, crc, packed, size, nameLength }) {
  const b = Buffer.alloc(26);
  b.writeUInt16LE(20, 0);
  b.writeUInt16LE(UTF8_NAMES, 2);
  b.writeUInt16LE(method, 4);
  b.writeUInt16LE(DOS_DATE, 8);
  b.writeUInt32LE(crc, 10);
  b.writeUInt32LE(packed, 14);
  b.writeUInt32LE(size, 18);
  b.writeUInt16LE(nameLength, 22);
  return b;
}

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }
