/**
 * A one-tab .xlsx workbook from rows of text, with no dependency: Google Drive converts it into
 * a Google Sheet that keeps what a CSV cannot carry — a bold, shaded, frozen header row, wrapped
 * cells with line breaks, column widths and a dropdown (a list data validation) on one column.
 *
 *   buildXlsx({ columns, rows, dropdown: { column: 'Decision', options: ['Approved', …] }, widths: { Description: 70 } })
 *     → Buffer of the workbook
 *
 * Every cell is an inline string, so no text ever runs as a formula. The ZIP is written here
 * too (deflate from node:zlib, CRC-32 by table): a workbook is a ZIP of XML parts.
 */
import zlib from 'node:zlib';

const escapeXml = (text) => String(text ?? '')
  .replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, '');

/** A 0-based column index as its letters: 0 → A, 25 → Z, 26 → AA. */
export function columnLetters(index) {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** A ZIP archive (deflated entries, no encryption, no zip64) from { path: text | Buffer }. */
export function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    const packed = zlib.deflateRawSync(data);
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034B50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // utf-8 names
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt16LE(dosTime, 10);
    header.writeUInt16LE(dosDate, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    locals.push(header, nameBytes, packed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014B50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x0800, 8);
    record.writeUInt16LE(8, 10);
    record.writeUInt16LE(dosTime, 12);
    record.writeUInt16LE(dosDate, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(packed.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(nameBytes.length, 28);
    record.writeUInt16LE(0, 30); // extra
    record.writeUInt16LE(0, 32); // comment
    record.writeUInt16LE(0, 34); // disk
    record.writeUInt16LE(0, 36); // internal attrs
    record.writeUInt32LE(0, 38); // external attrs
    record.writeUInt32LE(offset, 42);
    central.push(record, nameBytes);
    offset += header.length + nameBytes.length + packed.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBytes, end]);
}

const STYLE_HEADER = 1;
const STYLE_CELL = 2;

/**
 * The workbook. `columns` are the header names in order, `rows` arrays of cell text in that
 * order. `dropdown` names one column whose cells, on every row, offer `options` as a list and
 * refuse anything else; `widths` gives a column's width in characters (default 18); `sheetName`
 * the tab's name. The header row is bold on a light fill and frozen; every other cell wraps and
 * aligns to its top, so a cell with line breaks reads as lines.
 */
export function buildXlsx({ columns, rows, dropdown, widths = {}, sheetName = 'Scenarios' } = {}) {
  if (!Array.isArray(columns) || !columns.length) throw new Error('buildXlsx: columns are required');
  const cell = (ref, text, style) => `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
  const lines = [];
  lines.push(`<row r="1">${columns.map((name, i) => cell(`${columnLetters(i)}1`, name, STYLE_HEADER)).join('')}</row>`);
  (rows ?? []).forEach((row, index) => {
    const r = index + 2;
    lines.push(`<row r="${r}">${columns.map((_, i) => cell(`${columnLetters(i)}${r}`, row[i] ?? '', STYLE_CELL)).join('')}</row>`);
  });
  const lastRow = (rows?.length ?? 0) + 1;
  const lastColumn = columnLetters(columns.length - 1);
  const cols = columns.map((name, i) => `<col min="${i + 1}" max="${i + 1}" width="${Number(widths[name] ?? 18)}" customWidth="1"/>`).join('');
  let validations = '';
  if (dropdown?.column && dropdown.options?.length) {
    const index = columns.indexOf(dropdown.column);
    if (index < 0) throw new Error(`buildXlsx: dropdown column ${dropdown.column} is not a column`);
    const letter = columnLetters(index);
    const list = dropdown.options.map((option) => String(option).replace(/,/gu, ' ')).join(',');
    validations = `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showDropDown="0" showErrorMessage="1" errorTitle="Decision" error="Pick one of: ${escapeXml(dropdown.options.join(', '))}" sqref="${letter}2:${letter}${Math.max(lastRow, 2)}"><formula1>"${escapeXml(list)}"</formula1></dataValidation></dataValidations>`;
  }
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:${lastColumn}${lastRow}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${lines.join('')}</sheetData>
<autoFilter ref="A1:${lastColumn}${lastRow}"/>
${validations}
</worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E2F3"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
  return zip({
    '[Content_Types].xml': contentTypes,
    '_rels/.rels': rootRels,
    'xl/workbook.xml': workbook,
    'xl/_rels/workbook.xml.rels': workbookRels,
    'xl/styles.xml': styles,
    'xl/worksheets/sheet1.xml': sheet,
  });
}

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
