// A 16:9 PowerPoint deck with speaker notes. A slide is native (its own text boxes, boxes, pictures and lines, built
// and animated click by click, over a background picture of the ground) or one full-bleed picture with alt text.
// The master, layouts, themes, notes master and properties parts follow python-pptx's PowerPoint-authored default
// template, with the placeholders moved to their 16:9 places, and the theme takes the story's colours and fonts.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { boxShape, group, pathShape, picShape, textShape } from './shapes.mjs';
import { timingXml } from './timing.mjs';
import { zip } from './zip.mjs';

const W = 12192000, H = 6858000;
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PML = 'application/vnd.openxmlformats-officedocument.presentationml';
const TYPE = {
  presentation: `${PML}.presentation.main+xml`,
  slideMaster: `${PML}.slideMaster+xml`,
  slideLayout: `${PML}.slideLayout+xml`,
  slide: `${PML}.slide+xml`,
  notesMaster: `${PML}.notesMaster+xml`,
  notesSlide: `${PML}.notesSlide+xml`,
  presProps: `${PML}.presProps+xml`,
  viewProps: `${PML}.viewProps+xml`,
  tableStyles: `${PML}.tableStyles+xml`,
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
  core: 'application/vnd.openxmlformats-package.core-properties+xml',
  app: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
};
const MEDIA = {
  png: { mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
  jpeg: { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
};
const PRESENTATION_RELS = [
  ['slideMaster', 'slideMasters/slideMaster1.xml'],
  ['notesMaster', 'notesMasters/notesMaster1.xml'],
  ['theme', 'theme/theme1.xml'],
  ['presProps', 'presProps.xml'],
  ['viewProps', 'viewProps.xml'],
  ['tableStyles', 'tableStyles.xml'],
];

/**
 * Writes a 16:9 .pptx with speaker notes.
 * slides: a picture slide { image: Buffer, type: 'png' | 'jpeg', notes?, alt?, name? }, or a native one
 * { plate: { data, type }, items, builds, notes?, name? }: items as slides/model.mjs gives them, a picture's or a
 * drawing's own pixels in `media: { data, type }`.
 * theme: { major, minor } fonts and { dk1, lt1, dk2, lt2, accent1 … accent6 } colours (hex), else Office's.
 * fonts: [{ typeface, generic, faces: { regular, bold?, italic?, boldItalic? } }], each face Embedded OpenType, to
 * travel inside the file.
 * Returns the bytes; writePptx also writes them to `file`.
 */
export function pptx({ title, author = 'UnifyApps', slides, theme = {}, fonts = [] }) {
  if (!Array.isArray(slides) || !slides.length) throw new Error('a deck needs at least one slide');
  const deck = slides.map((s, i) => readSlide(s, i + 1));
  const parts = [];
  // every picture once, however many slides show it (a footer's logo is on most of them)
  const media = new Map();
  const file = (data, mime, ext) => {
    const key = crypto.createHash('sha1').update(data).digest('hex');
    if (!media.has(key)) media.set(key, { name: `image${media.size + 1}.${ext}`, mime, data });
    return media.get(key).name;
  };
  const add = (name, type, xml, rels) => {
    parts.push({ name, type, data: doc(xml) });
    if (rels) parts.push({ name: relsOf(name), data: doc(relationships(rels)) });
  };

  add('docProps/core.xml', TYPE.core, core(title, author));
  add('docProps/app.xml', TYPE.app, app(deck));
  const faces = fonts.flatMap((f) => FACE_ORDER.filter((k) => f.faces[k]).map((k) => ({ f, k, data: f.faces[k] })));
  faces.forEach((x, i) => { x.rId = `rId${PRESENTATION_RELS.length + deck.length + i + 1}`; x.file = `font${i + 1}.fntdata`; });
  add('ppt/presentation.xml', TYPE.presentation, presentation(deck, fonts, faces), [...PRESENTATION_RELS, ...deck.map((s) => ['slide', `slides/slide${s.n}.xml`]), ...faces.map((x) => ['font', `fonts/${x.file}`])]);
  for (const x of faces) parts.push({ name: `ppt/fonts/${x.file}`, mime: 'application/x-fontdata', data: x.data });
  add('ppt/presProps.xml', TYPE.presProps, PRES_PROPS);
  add('ppt/viewProps.xml', TYPE.viewProps, VIEW_PROPS);
  add('ppt/tableStyles.xml', TYPE.tableStyles, TABLE_STYLES);
  add('ppt/theme/theme1.xml', TYPE.theme, themeXml(theme));
  add('ppt/theme/theme2.xml', TYPE.theme, themeXml({}));
  add('ppt/slideMasters/slideMaster1.xml', TYPE.slideMaster, MASTER, [['slideLayout', '../slideLayouts/slideLayout1.xml'], ['slideLayout', '../slideLayouts/slideLayout2.xml'], ['theme', '../theme/theme1.xml']]);
  add('ppt/slideLayouts/slideLayout1.xml', TYPE.slideLayout, LAYOUT, [['slideMaster', '../slideMasters/slideMaster1.xml']]);
  add('ppt/slideLayouts/slideLayout2.xml', TYPE.slideLayout, TITLE_LAYOUT, [['slideMaster', '../slideMasters/slideMaster1.xml']]);
  add('ppt/notesMasters/notesMaster1.xml', TYPE.notesMaster, NOTES_MASTER, [['theme', '../theme/theme2.xml']]);
  for (const s of deck) {
    const notes = s.notes.length ? [['notesSlide', `../notesSlides/notesSlide${s.n}.xml`]] : [];
    const rels = [['slideLayout', `../slideLayouts/slideLayout${s.native ? 2 : 1}.xml`]];
    const rel = (data, type) => {
      const target = `../media/${file(data, MEDIA[type].mime, type)}`;
      const at = rels.findIndex(([kind, t]) => kind === 'image' && t === target);
      if (at >= 0) return `rId${at + 1}`;
      rels.push(['image', target]);
      return `rId${rels.length}`;
    };
    const xml = s.native ? nativeSlide(s, rel) : slide(s, rel(s.image, s.type));
    add(`ppt/slides/slide${s.n}.xml`, TYPE.slide, xml, [...rels, ...notes]);
    if (notes.length) add(`ppt/notesSlides/notesSlide${s.n}.xml`, TYPE.notesSlide, notesSlide(s), [['notesMaster', '../notesMasters/notesMaster1.xml'], ['slide', `../slides/slide${s.n}.xml`]]);
  }
  for (const m of media.values()) parts.push({ name: `ppt/media/${m.name}`, mime: m.mime, data: m.data, store: true });

  const root = [
    ['officeDocument', 'ppt/presentation.xml'],
    ['http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'],
    ['extended-properties', 'docProps/app.xml'],
  ];
  return zip([
    { name: '[Content_Types].xml', data: doc(contentTypes(parts)) },
    { name: '_rels/.rels', data: doc(relationships(root)) },
    ...parts.map(({ name, data, store }) => ({ name, data, store })),
  ]);
}

export function writePptx(file, deck) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, pptx(deck));
  return file;
}

function readSlide(s, n) {
  if (s.items) return readNative(s, n);
  const { image, type, notes, alt, name } = s;
  const media = MEDIA[type];
  if (!media) throw new Error(`slide ${n}: type must be "png" or "jpeg", not ${JSON.stringify(type)}`);
  if (!Buffer.isBuffer(image)) throw new Error(`slide ${n}: image must be a Buffer`);
  if (!media.magic.every((b, i) => image[i] === b)) throw new Error(`slide ${n}: the image is not a ${type.toUpperCase()} file`);
  return { n, image, type, notes: paragraphs(notes), alt: clean(alt), name: clean(name).trim() || `Slide ${n}` };
}

function readNative({ plate, items, builds = 0, notes, name, part = 0, parts = 1 }, n) {
  const check = (m, what) => {
    if (!MEDIA[m?.type] || !Buffer.isBuffer(m.data) || !MEDIA[m.type].magic.every((b, i) => m.data[i] === b)) throw new Error(`slide ${n}: ${what} must be a PNG or JPEG Buffer with its type`);
  };
  if (plate) check(plate, 'the background');
  for (const it of items) if (it.media) check(it.media, `the picture of ${it.kind} ${it.n}`);
  return { n, native: true, plate, items, builds, part, parts, notes: paragraphs(notes), name: clean(name).trim() || `Slide ${n}` };
}

/**
 * A native slide: the background picture, then each item as its shape in the page's order, and its effects by build.
 * Its heading is the slide's title placeholder, so PowerPoint's outline and accessibility check read it.
 */
function nativeSlide(s, rel) {
  let id = 1;
  const next = () => ++id;
  const shapes = [], builds = Array.from({ length: s.builds + 1 }, () => []);
  // a scene told over several slides names each piece the same on all of them, so Morph carries it across
  const label = (it, kind) => {
    const words = clean(it.m.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 48);
    const base = it.title ? 'Title' : words || kind;
    return s.parts > 1 ? `!!${it.n} ${base}` : base;
  };
  const on = (k, e) => { if (k <= s.builds) builds[k].push(e); };
  const pieces = [];
  for (const it of s.items) {
    const sid = next();
    let xml, text = null;
    if (it.kind === 'text' || it.kind === 'svgtext') { xml = textShape(sid, it, label(it, 'Text')); text = true; }
    else if (it.kind === 'box') { xml = boxShape(sid, it, label(it, 'Box'), next); text = xml.startsWith('<p:sp>') ? false : null; }
    else if (it.kind === 'path') { xml = pathShape(sid, it, label(it, it.m.fill && !it.m.stroke ? 'Shape' : 'Line')); text = false; }
    else if (it.media) xml = picShape(sid, it, label(it, it.kind === 'pic' ? 'Picture' : 'Drawing'), rel(it.media.data, it.media.type));
    else continue;
    pieces.push({ it, xml });
    if (it.enter && it.unit == null) on(it.from, { spid: sid, text, type: 'in', ...it.enter });
    let at = [0, 0];
    for (const mv of it.moves) { on(mv.build, { spid: sid, text, type: 'move', from: at, dx: mv.dx, dy: mv.dy, delay: mv.delay, dur: mv.dur }); at = [mv.dx, mv.dy]; }
    for (const d of it.dims) on(d.build, { spid: sid, text, type: 'dim', to: d.to, delay: d.delay, dur: d.dur });
    if (it.exit) on(it.exit.build, { spid: sid, text, type: 'out', delay: it.exit.delay, dur: it.exit.dur });
  }
  // a unit's pieces, side by side in the page, are one group with one entrance
  for (let i = 0; i < pieces.length;) {
    const u = pieces[i].it.unit;
    let j = i + 1;
    while (u != null && j < pieces.length && pieces[j].it.unit === u) j++;
    if (j - i < 2) { shapes.push(pieces[i].xml); i = j; continue; }
    const run = pieces.slice(i, j), first = run[0].it, gid = next();
    const rs = run.map((p) => p.it.m.rect), x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
    const r = { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
    shapes.push(group(gid, s.parts > 1 ? `!!${first.n} Group` : 'Group', r, run.map((p) => p.xml)));
    if (first.enter) on(first.from, { spid: gid, text: null, type: 'in', ...first.enter });
    i = j;
  }
  const bg = s.plate ? `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${rel(s.plate.data, s.plate.type)}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>` : '';
  return `
<p:sld ${NS}>
  <p:cSld name="${attr(s.name)}">${bg}
    <p:spTree>${TREE}
      ${shapes.join('\n      ')}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
  ${s.part ? MORPH : '<p:transition spd="fast"><p:fade/></p:transition>'}
  ${timingXml(builds)}
</p:sld>`;
}

/** The notes as paragraphs: one per line, with a run of blank lines kept as one empty paragraph. */
function paragraphs(notes) {
  const text = clean(notes).split('\n').map((line) => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text ? text.split('\n') : [];
}

/** Drops what XML 1.0 forbids (control characters other than tab and newline, lone surrogates, U+FFFE, U+FFFF) and makes every line break \n. */
function clean(s) {
  return String(s ?? '').replace(/\r\n?/g, '\n').replace(/[^\t\n\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '');
}

function esc(s) {
  return clean(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

/** An attribute value; a parser reads a raw newline or tab in one as a space. */
function attr(s) {
  return esc(s).replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
}

/** A part's text: the XML declaration, then the template without the whitespace between tags that keeps it readable here. */
function doc(xml) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xml.trim().replace(/>\s+</g, '><')}`;
}

function relsOf(name) {
  return path.posix.join(path.posix.dirname(name), '_rels', `${path.posix.basename(name)}.rels`);
}

function relationships(targets) {
  return `
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${targets.map(([type, target], i) => `<Relationship Id="rId${i + 1}" Type="${type.includes('/') ? type : `${REL}/${type}`}" Target="${target}"/>`).join('\n  ')}
</Relationships>`;
}

function contentTypes(parts) {
  const media = new Map(parts.filter((p) => p.mime).map((p) => [path.posix.extname(p.name).slice(1), p.mime]));
  return `
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${[...media].map(([ext, mime]) => `<Default Extension="${ext}" ContentType="${mime}"/>`).join('\n  ')}
  ${parts.filter((p) => p.type).map((p) => `<Override PartName="/${p.name}" ContentType="${p.type}"/>`).join('\n  ')}
</Types>`;
}

function core(title, author) {
  return `
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${esc(title)}</dc:title>
  <dc:creator>${esc(author)}</dc:creator>
  <cp:lastModifiedBy>${esc(author)}</cp:lastModifiedBy>
  <cp:revision>1</cp:revision>
</cp:coreProperties>`;
}

function app(deck) {
  return `
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <TotalTime>0</TotalTime>
  <Words>0</Words>
  <Application>UnifyApps</Application>
  <PresentationFormat>Widescreen</PresentationFormat>
  <Paragraphs>0</Paragraphs>
  <Slides>${deck.length}</Slides>
  <Notes>${deck.filter((s) => s.notes.length).length}</Notes>
  <HiddenSlides>0</HiddenSlides>
  <MMClips>0</MMClips>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="4" baseType="variant">
      <vt:variant><vt:lpstr>Theme</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>1</vt:i4></vt:variant>
      <vt:variant><vt:lpstr>Slide Titles</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>${deck.length}</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="${deck.length + 1}" baseType="lpstr">
      <vt:lpstr>Office Theme</vt:lpstr>
      ${deck.map((s) => `<vt:lpstr>${esc(s.name)}</vt:lpstr>`).join('\n      ')}
    </vt:vector>
  </TitlesOfParts>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
</Properties>`;
}

const FACE_ORDER = ['regular', 'bold', 'italic', 'boldItalic'];

function presentation(deck, fonts = [], faces = []) {
  const embedded = fonts.length ? `<p:embeddedFontLst>${fonts.map((f) => `<p:embeddedFont><p:font typeface="${attr(f.typeface)}" pitchFamily="${f.generic === 'sans' ? 34 : 18}" charset="0"/>${FACE_ORDER.map((k) => faces.find((x) => x.f === f && x.k === k)).filter(Boolean).map((x) => `<p:${x.k} r:id="${x.rId}"/>`).join('')}</p:embeddedFont>`).join('')}</p:embeddedFontLst>` : '';
  return `
<p:presentation ${NS} saveSubsetFonts="1"${fonts.length ? ' embedTrueTypeFonts="1"' : ''} autoCompressPictures="0">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst>
  <p:sldIdLst>
    ${deck.map((s, i) => `<p:sldId id="${256 + i}" r:id="rId${PRESENTATION_RELS.length + i + 1}"/>`).join('\n    ')}
  </p:sldIdLst>
  <p:sldSz cx="${W}" cy="${H}"/>
  <p:notesSz cx="6858000" cy="9144000"/>
  ${embedded}
  <p:defaultTextStyle>
    <a:defPPr><a:defRPr lang="en-US"/></a:defPPr>
    ${levels(plainLevel(1800))}
  </p:defaultTextStyle>
</p:presentation>`;
}

function slide({ name, alt }, rId) {
  return `
<p:sld ${NS}>
  <p:cSld>
    <p:spTree>${TREE}
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="2" name="${attr(name)}"${alt ? ` descr="${attr(alt)}"` : ''}/>
          <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="${rId}"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        ${box(0, 0, W, H)}
      </p:pic>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function notesSlide({ n, notes }) {
  return `
<p:notes ${NS}>
  <p:cSld>
    <p:spTree>${TREE}
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          ${notes.map((line) => (line ? `<a:p><a:r><a:t>${esc(line)}</a:t></a:r></a:p>` : '<a:p/>')).join('\n          ')}
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Slide Number Placeholder 3"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="5"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p>${field(NOTES_NUMBER, 'slidenum', n)}<a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:notes>`;
}

function box(x, y, cx, cy, extra = '') {
  return `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${extra}</p:spPr>`;
}

function field(id, type, text) {
  return `<a:fld id="${id}" type="${type}"><a:rPr lang="en-US"/><a:t>${text}</a:t></a:fld>`;
}

/** 12 pt text for a header, footer, date or number placeholder. */
function small(align, colour = '') {
  return `<a:lstStyle><a:lvl1pPr algn="${align}"><a:defRPr sz="1200">${colour}</a:defRPr></a:lvl1pPr></a:lstStyle>`;
}

function levels(write) {
  return Array.from({ length: 9 }, (_, i) => write(i + 1)).join('\n    ');
}

function plainLevel(size) {
  return (n) => `<a:lvl${n}pPr marL="${(n - 1) * 457200}" algn="l" defTabSz="457200" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="${size}" kern="1200">${TEXT_COLOR}${MINOR_FONT}</a:defRPr></a:lvl${n}pPr>`;
}

function bulletLevel(n) {
  const [marL, indent, char, size] = BULLETS[n - 1];
  return `<a:lvl${n}pPr marL="${marL}" indent="${indent}" algn="l" defTabSz="457200" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial"/><a:buChar char="${char}"/><a:defRPr sz="${size}" kern="1200">${TEXT_COLOR}${MINOR_FONT}</a:defRPr></a:lvl${n}pPr>`;
}

const TREE = `
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;
const INSETS = 'vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"';
const CLR_MAP = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';
const TEXT_COLOR = '<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>';
const MINOR_FONT = '<a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/>';
const MASTER_DATE = '{5BCAD085-E8A6-8845-BD4E-CB4CCA059FC4}';
const MASTER_NUMBER = '{C1FF6DA9-008F-8B48-92A6-B652298478BF}';
const NOTES_DATE = '{0F89C1C7-3DCD-1040-A9CF-14679D8B5DDD}';
const NOTES_NUMBER = '{BB5E49A5-4136-284D-997B-48E1D791AD67}';
const BULLETS = [
  [342900, -342900, '•', 3200],
  [742950, -285750, '–', 2800],
  [1143000, -228600, '•', 2400],
  [1600200, -228600, '–', 2000],
  [2057400, -228600, '»', 2000],
  [2514600, -228600, '•', 2000],
  [2971800, -228600, '•', 2000],
  [3429000, -228600, '•', 2000],
  [3886200, -228600, '•', 2000],
];
const PROMPTS = ['Click to edit Master text styles', 'Second level', 'Third level', 'Fourth level', 'Fifth level']
  .map((t, i) => `<a:p><a:pPr lvl="${i}"/><a:r><a:rPr lang="en-US"/><a:t>${t}</a:t></a:r></a:p>`).join('\n          ');
const GREY = '<a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill>';

const MASTER = `
<p:sldMaster ${NS}>
  <p:cSld>
    <p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>
    <p:spTree>${TREE}
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        ${box(838200, 365125, 10515600, 1325563)}
        <p:txBody>
          <a:bodyPr ${INSETS} anchor="ctr"><a:normAutofit/></a:bodyPr>
          <a:lstStyle/>
          <a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master title style</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Text Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        ${box(838200, 1825625, 10515600, 4351338)}
        <p:txBody>
          <a:bodyPr ${INSETS}><a:normAutofit/></a:bodyPr>
          <a:lstStyle/>
          ${PROMPTS}
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Date Placeholder 3"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="dt" sz="half" idx="2"/></p:nvPr></p:nvSpPr>
        ${box(838200, 6356350, 2743200, 365125)}
        <p:txBody><a:bodyPr ${INSETS} anchor="ctr"/>${small('l', GREY)}<a:p>${field(MASTER_DATE, 'datetimeFigureOut', '1/27/13')}<a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="5" name="Footer Placeholder 4"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="ftr" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr>
        ${box(4038600, 6356350, 4114800, 365125)}
        <p:txBody><a:bodyPr ${INSETS} anchor="ctr"/>${small('ctr', GREY)}<a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="6" name="Slide Number Placeholder 5"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="4"/></p:nvPr></p:nvSpPr>
        ${box(8610600, 6356350, 2743200, 365125)}
        <p:txBody><a:bodyPr ${INSETS} anchor="ctr"/>${small('r', GREY)}<a:p>${field(MASTER_NUMBER, 'slidenum', '‹#›')}<a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMap ${CLR_MAP}/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/><p:sldLayoutId id="2147483650" r:id="rId2"/></p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle>
      <a:lvl1pPr algn="ctr" defTabSz="457200" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="4400" kern="1200">${TEXT_COLOR}<a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr>
    </p:titleStyle>
    <p:bodyStyle>
    ${levels(bulletLevel)}
    </p:bodyStyle>
    <p:otherStyle>
    <a:defPPr><a:defRPr lang="en-US"/></a:defPPr>
    ${levels(plainLevel(1800))}
    </p:otherStyle>
  </p:txStyles>
</p:sldMaster>`;

const LAYOUT = `
<p:sldLayout ${NS} type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>${TREE}
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Date Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="dt" sz="half" idx="10"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p>${field(MASTER_DATE, 'datetimeFigureOut', '1/27/13')}<a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Footer Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="ftr" sz="quarter" idx="11"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Slide Number Placeholder 3"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="12"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p>${field(MASTER_NUMBER, 'slidenum', '‹#›')}<a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;

// the next part of a scene morphs from the one before (PowerPoint 2019 and later); an older one fades
const MORPH = '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" Requires="p159"><p:transition spd="med"><p159:morph option="byObject"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="fast"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>';

// the layout of a native slide: a title placeholder its heading fills, so a slide added by hand starts with one
const TITLE_LAYOUT = `
<p:sldLayout ${NS} type="titleOnly" preserve="1">
  <p:cSld name="Title Only">
    <p:spTree>${TREE}
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master title style</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;

const NOTES_MASTER = `
<p:notesMaster ${NS}>
  <p:cSld>
    <p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>
    <p:spTree>${TREE}
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Header Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="hdr" sz="quarter"/></p:nvPr></p:nvSpPr>
        ${box(0, 0, 2971800, 458788)}
        <p:txBody><a:bodyPr ${INSETS}/>${small('l')}<a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Date Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="dt" idx="1"/></p:nvPr></p:nvSpPr>
        ${box(3884613, 0, 2971800, 458788)}
        <p:txBody><a:bodyPr ${INSETS}/>${small('r')}<a:p>${field(NOTES_DATE, 'datetimeFigureOut', '10/17/16')}<a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Slide Image Placeholder 3"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr>
        ${box(685800, 1143000, 5486400, 3086100, '<a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln>')}
        <p:txBody><a:bodyPr ${INSETS} anchor="ctr"/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="5" name="Notes Placeholder 4"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr>
        ${box(685800, 4400550, 5486400, 3600450)}
        <p:txBody>
          <a:bodyPr ${INSETS}/>
          <a:lstStyle/>
          ${PROMPTS}
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="6" name="Footer Placeholder 5"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="ftr" sz="quarter" idx="4"/></p:nvPr></p:nvSpPr>
        ${box(0, 8685213, 2971800, 458787)}
        <p:txBody><a:bodyPr ${INSETS} anchor="b"/>${small('l')}<a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="7" name="Slide Number Placeholder 6"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="5"/></p:nvPr></p:nvSpPr>
        ${box(3884613, 8685213, 2971800, 458787)}
        <p:txBody><a:bodyPr ${INSETS} anchor="b"/>${small('r')}<a:p>${field(NOTES_NUMBER, 'slidenum', '‹#›')}<a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMap ${CLR_MAP}/>
  <p:notesStyle>
    ${levels(plainLevel(1200))}
  </p:notesStyle>
</p:notesMaster>`;

const THEME = `
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F497D"/></a:dk2>
      <a:lt2><a:srgbClr val="EEECE1"/></a:lt2>
      <a:accent1><a:srgbClr val="4F81BD"/></a:accent1>
      <a:accent2><a:srgbClr val="C0504D"/></a:accent2>
      <a:accent3><a:srgbClr val="9BBB59"/></a:accent3>
      <a:accent4><a:srgbClr val="8064A2"/></a:accent4>
      <a:accent5><a:srgbClr val="4BACC6"/></a:accent5>
      <a:accent6><a:srgbClr val="F79646"/></a:accent6>
      <a:hlink><a:srgbClr val="0000FF"/></a:hlink>
      <a:folHlink><a:srgbClr val="800080"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs>
            <a:gs pos="35000"><a:schemeClr val="phClr"><a:tint val="37000"/><a:satMod val="300000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="15000"/><a:satMod val="350000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:lin ang="16200000" scaled="1"/>
        </a:gradFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="100000"/><a:shade val="100000"/><a:satMod val="130000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="50000"/><a:shade val="100000"/><a:satMod val="350000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:lin ang="16200000" scaled="0"/>
        </a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"><a:shade val="95000"/><a:satMod val="105000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>
        <a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>
        <a:effectStyle>
          <a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst>
          <a:scene3d><a:camera prst="orthographicFront"><a:rot lat="0" lon="0" rev="0"/></a:camera><a:lightRig rig="threePt" dir="t"><a:rot lat="0" lon="0" rev="1200000"/></a:lightRig></a:scene3d>
          <a:sp3d><a:bevelT w="63500" h="25400"/></a:sp3d>
        </a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="40000"/><a:satMod val="350000"/></a:schemeClr></a:gs>
            <a:gs pos="40000"><a:schemeClr val="phClr"><a:tint val="45000"/><a:shade val="99000"/><a:satMod val="350000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="20000"/><a:satMod val="255000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:path path="circle"><a:fillToRect l="50000" t="-80000" r="50000" b="180000"/></a:path>
        </a:gradFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="80000"/><a:satMod val="300000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="30000"/><a:satMod val="200000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>
        </a:gradFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults>
    <a:spDef>
      <a:spPr/><a:bodyPr/><a:lstStyle/>
      <a:style><a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="3"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="2"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></a:style>
    </a:spDef>
    <a:lnDef>
      <a:spPr/><a:bodyPr/><a:lstStyle/>
      <a:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="1"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></a:style>
    </a:lnDef>
  </a:objectDefaults>
  <a:extraClrSchemeLst/>
</a:theme>`;

const PRES_PROPS = `
<p:presentationPr ${NS}>
  <p:extLst>
    <p:ext uri="{E76CE94A-603C-4142-B9EB-6D1370010A27}"><p14:discardImageEditData xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" val="0"/></p:ext>
    <p:ext uri="{D31A062A-798A-4329-ABDD-BBA856620510}"><p14:defaultImageDpi xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" val="0"/></p:ext>
  </p:extLst>
</p:presentationPr>`;

const VIEW_PROPS = `
<p:viewPr ${NS}>
  <p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr>
  <p:slideViewPr>
    <p:cSldViewPr snapToGrid="0" snapToObjects="1">
      <p:cViewPr varScale="1"><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr>
      <p:guideLst/>
    </p:cSldViewPr>
  </p:slideViewPr>
  <p:notesTextViewPr>
    <p:cViewPr><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr>
  </p:notesTextViewPr>
  <p:gridSpacing cx="76200" cy="76200"/>
</p:viewPr>`;

const TABLE_STYLES = '<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>';

/** The theme with the story's colours and fonts in place of Office's, where it gives them. */
function themeXml({ major, minor, colors = {} } = {}) {
  let xml = THEME;
  for (const [slot, hex] of Object.entries(colors)) if (/^[0-9A-F]{6}$/i.test(hex ?? '')) xml = xml.replace(new RegExp(`<a:${slot}>.*?</a:${slot}>`), `<a:${slot}><a:srgbClr val="${hex.toUpperCase()}"/></a:${slot}>`);
  if (major) xml = xml.replace(/<a:majorFont><a:latin typeface="[^"]*"/, `<a:majorFont><a:latin typeface="${attr(major)}"`);
  if (minor) xml = xml.replace(/<a:minorFont><a:latin typeface="[^"]*"/, `<a:minorFont><a:latin typeface="${attr(minor)}"`);
  return xml;
}
