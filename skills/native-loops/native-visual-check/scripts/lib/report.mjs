// The pass report: one self-contained HTML with downscaled images, the Figma slice beside each
// device viewport, overlay boxes for the gap rows and the filterable table. Also the composite
// thumbnail the approval looks at and the region crops the visual rows are judged from.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { box } from './schemas.mjs';
import { decodePngFile, encodePng, resize, crop, composeSideBySide, readIhdrFile, samplePixel, hexOf } from './png.mjs';

const CSS_PER_PT = 1.5;
const MAX_TALL = 1200;
const decoded = new Map();

function decodeCached(file) {
  if (!decoded.has(file)) decoded.set(file, fs.existsSync(file) ? decodePngFile(file) : null);
  return decoded.get(file);
}

/** How Figma canvas points map to device page points: a least-squares line per axis. */
export function fitFigmaToApp(spec) {
  const pairs = spec.elements.map((element) => [box(element.figma), box(element.app)]).filter(([figma, app]) => figma && app);
  const fit = (axis) => {
    const xs = pairs.map(([figma]) => figma[axis]); const ys = pairs.map(([, app]) => app[axis]);
    const n = xs.length;
    if (n < 2) return { slope: spec.scale?.factor ?? 1, intercept: 0 };
    const mx = xs.reduce((total, value) => total + value, 0) / n; const my = ys.reduce((total, value) => total + value, 0) / n;
    const vx = xs.reduce((total, value) => total + (value - mx) ** 2, 0);
    const slope = vx ? xs.reduce((total, value, index) => total + (value - mx) * (ys[index] - my), 0) / vx : spec.scale?.factor ?? 1;
    return { slope, intercept: my - slope * mx };
  };
  const xFit = fit('x'); const yFit = fit('y');
  return { sx: xFit.slope, tx: xFit.intercept, sy: yFit.slope, ty: yFit.intercept };
}

/** A copy no taller than maxTall px: sips on macOS, the built-in resampler elsewhere. */
export function downscalePng(src, dst, maxTall = MAX_TALL) {
  const ihdr = readIhdrFile(src);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (ihdr.height <= maxTall && ihdr.width <= maxTall) { fs.copyFileSync(src, dst); return dst; }
  const sips = spawnSync('sips', ['-Z', String(maxTall), src, '--out', dst], { encoding: 'utf8' });
  if (sips.status === 0 && fs.existsSync(dst)) return dst;
  const image = decodeCached(src);
  if (!image) throw new Error(`cannot downscale ${src}: sips failed and the PNG is not 8-bit RGB(A)`);
  const scale = maxTall / Math.max(image.width, image.height);
  fs.writeFileSync(dst, encodePng(resize(image, Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)))));
  return dst;
}

const dataUri = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

function viewportFor(rowBox, measured) {
  const screenH = measured.device.screen.h;
  let best = null;
  for (const viewport of measured.viewports) {
    const top = Math.max(0, rowBox.y - viewport.offset); const bottom = Math.min(screenH, rowBox.y + rowBox.h - viewport.offset);
    const visible = Math.max(0, bottom - top);
    if (!best || visible > best.visible) best = { k: viewport.k, visible, offset: viewport.offset };
  }
  return best;
}

export function writeReport({ spec, measured, gaps, passDir, out, figmaPng = null, link = false, regions = null }) {
  const reportDir = path.dirname(path.resolve(out));
  const imagesDir = path.join(reportDir, 'report-images');
  const screen = measured.device.screen;
  const fit = fitFigmaToApp(spec);
  const src = (file) => (link ? path.relative(reportDir, file) : dataUri(file));
  const band = regions ? spec.regions.filter((region) => regions.includes(region.id)).map((region) => box(region.app)).filter(Boolean) : [];
  const bandTop = band.length ? Math.min(...band.map((item) => item.y)) : null;
  const bandBottom = band.length ? Math.max(...band.map((item) => item.y + item.h)) : null;
  const shownViewports = measured.viewports.filter((viewport) => bandTop === null || (viewport.offset < bandBottom && viewport.offset + screen.h > bandTop));
  const figmaSmall = figmaPng && fs.existsSync(figmaPng) ? downscalePng(figmaPng, path.join(imagesDir, 'figma.png'), 2400) : null;
  const figmaCssW = spec.figma?.width ? spec.figma.width * fit.sx * CSS_PER_PT : screen.w * CSS_PER_PT;
  const figmaCssH = spec.figma?.height ? spec.figma.height * fit.sy * CSS_PER_PT : null;
  const overlayRows = gaps.rows.filter((row) => ['off', 'missing', 'extra'].includes(row.status) && (row.boxes?.measured || row.boxes?.expected));
  const panes = shownViewports.map((viewport) => {
    const png = viewport.png ? path.join(passDir, viewport.png) : null;
    const device = png && fs.existsSync(png) ? src(downscalePng(png, path.join(imagesDir, `device-${viewport.k}.png`))) : null;
    const boxCss = (item) => `left:${(item.x * CSS_PER_PT).toFixed(1)}px;top:${((item.y - viewport.offset) * CSS_PER_PT).toFixed(1)}px;width:${(item.w * CSS_PER_PT).toFixed(1)}px;height:${(item.h * CSS_PER_PT).toFixed(1)}px`;
    const rowsHere = overlayRows.filter((row) => viewportFor(row.boxes.measured ?? row.boxes.expected, measured)?.k === viewport.k);
    const overlays = (side) => rowsHere.map((row) => {
      const expected = row.boxes.expected ? `<div class="ov exp" style="${boxCss(row.boxes.expected)}"><b>${row.n}</b></div>` : '';
      const measuredBox = side === 'device' && row.boxes.measured ? `<div class="ov mea" style="${boxCss(row.boxes.measured)}"><b>${row.n}</b></div>` : '';
      return expected + measuredBox;
    }).join('');
    const figmaTop = (fit.ty - viewport.offset) * CSS_PER_PT;
    const figma = figmaSmall ? `<img src="${src(figmaSmall)}" style="position:absolute;left:${(fit.tx * CSS_PER_PT).toFixed(1)}px;top:${figmaTop.toFixed(1)}px;width:${figmaCssW.toFixed(1)}px;${figmaCssH ? `height:${figmaCssH.toFixed(1)}px;` : ''}">` : '<p class="none">no Figma screenshot given (--board or --figma)</p>';
    return `<section class="vp"><h2>Viewport ${viewport.k} · offset ${viewport.offset}pt (${viewport.offsetMethod}, ${viewport.offsetConfidence}${viewport.axStale ? ', AX stale' : ''})</h2>
<div class="pair"><div class="frame" style="width:${screen.w * CSS_PER_PT}px;height:${screen.h * CSS_PER_PT}px"><div class="lbl">Figma</div>${figma}${overlays('figma')}</div>
<div class="frame dev" style="width:${screen.w * CSS_PER_PT}px;height:${screen.h * CSS_PER_PT}px"><div class="lbl">Device</div>${device ? `<img src="${device}" style="width:100%;height:100%">` : '<p class="none">no device-' + viewport.k + '.png</p>'}${figmaSmall ? `<img class="ghost" src="${src(figmaSmall)}" style="left:${(fit.tx * CSS_PER_PT).toFixed(1)}px;top:${figmaTop.toFixed(1)}px;width:${figmaCssW.toFixed(1)}px;${figmaCssH ? `height:${figmaCssH.toFixed(1)}px;` : ''}">` : ''}${overlays('device')}</div></div></section>`;
  }).join('\n');
  const statuses = [...new Set(gaps.rows.map((row) => row.status))];
  const tableRows = gaps.rows.map((row) => `<tr class="r ${row.status}"><td>${row.n}</td><td>${esc(row.region)}</td><td>${esc(row.element)}</td><td>${esc(row.property)}</td><td>${esc(row.expected)}</td><td>${esc(row.measured)}</td><td>${esc(row.delta)}</td><td><span class="s ${row.status}">${row.status}</span> <small>${row.judge}${row.noise ? ` · ${row.noise}` : ''}</small></td><td>${esc(row.block?.displayName ?? '')} <small>${esc(row.block?.id ?? '')}${row.block?.how && row.block.how !== 'none' ? ` · ${row.block.how}` : ''}</small></td><td>${esc(row.accepted ?? row.hint ?? '')}</td></tr>`).join('\n');
  const s = gaps.summary;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Visual check pass ${gaps.pass} · ${esc(spec.page?.name ?? spec.page?.id ?? '')}</title>
<style>
body{font:14px/1.4 -apple-system,Helvetica,Arial,sans-serif;margin:16px;color:#1d1d1f;background:#f5f5f7}
h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 8px}.sum{color:#555}
.pair{display:flex;gap:16px;align-items:flex-start}.frame{position:relative;overflow:hidden;background:#222;border:1px solid #bbb;flex:none}.frame img{display:block}
.lbl{position:absolute;z-index:3;left:4px;top:4px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;padding:1px 6px;border-radius:4px}
.none{color:#ccc;text-align:center;padding-top:40%}.ghost{position:absolute;opacity:0;pointer-events:none;z-index:1}body.overlay .ghost{opacity:.5}
.ov{position:absolute;z-index:2;box-sizing:border-box}.ov.exp{border:2px dashed #2f80ed}.ov.mea{border:2px solid #e02424}
.ov b{position:absolute;left:-2px;top:-18px;font-size:11px;color:#fff;background:#e02424;padding:0 5px;border-radius:3px}.ov.exp b{background:#2f80ed;top:auto;bottom:-18px}
table{border-collapse:collapse;width:100%;background:#fff;font-size:12px}th,td{border-bottom:1px solid #e5e5e5;padding:4px 6px;text-align:left;vertical-align:top}th{background:#fafafa}
.s{padding:0 6px;border-radius:3px;color:#fff;background:#888}.s.match{background:#2e9e5b}.s.off,.s.missing{background:#e02424}.s.extra{background:#d97706}.s.noise{background:#9ca3af}.s.unjudged,.s.visual{background:#7c3aed}.s.accepted{background:#2563eb}.s.unknown{background:#6b7280}
.filters button{margin:0 4px 8px 0;padding:3px 8px;border:1px solid #bbb;background:#fff;border-radius:4px;cursor:pointer}.filters button.on{background:#1d1d1f;color:#fff}
tr.r.hide{display:none}small{color:#777}
</style></head><body>
<h1>Visual check pass ${gaps.pass} · ${esc(spec.page?.name ?? '')} · ${esc(measured.device.model ?? '')} ${screen.w}×${screen.h}pt · ${esc(measured.device.build ?? '')}</h1>
<p class="sum">${s.rows} rows: ${s.match} match · ${s.off} off · ${s.missing} missing · ${s.extra} extra · ${s.visual} visual · ${s.noise} noise · ${s.unknown} unknown · ${s.accepted} accepted → <b>${s.verdict}</b>${regions ? ` · regions ${esc(regions.join(', '))}` : ''}. Dashed blue = expected (spec), solid red = measured. <label><input type="checkbox" id="ovl"> Figma at 50% over the device</label></p>
${panes}
<h2>Gap table</h2><div class="filters">${['all', ...statuses].map((status) => `<button data-s="${status}" class="${status === 'all' ? 'on' : ''}">${status}</button>`).join('')}</div>
<table><thead><tr><th>#</th><th>region</th><th>element</th><th>property</th><th>expected</th><th>measured</th><th>Δ</th><th>status</th><th>block</th><th>note</th></tr></thead><tbody>${tableRows}</tbody></table>
<script>
document.getElementById('ovl').addEventListener('change',function(e){document.body.classList.toggle('overlay',e.target.checked)});
document.querySelectorAll('.filters button').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('.filters button').forEach(function(x){x.classList.remove('on')});b.classList.add('on');var s=b.dataset.s;document.querySelectorAll('tr.r').forEach(function(r){r.classList.toggle('hide',s!=='all'&&!r.classList.contains(s))})})});
</script></body></html>`;
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(out, html);
  return out;
}

function figmaBand(spec, figmaImage, fit, pageTop, pageBottom) {
  const pxPerPt = spec.figma?.pxPerPt ?? (spec.figma?.width ? figmaImage.width / spec.figma.width : 1);
  const canvasTop = (pageTop - fit.ty) / fit.sy; const canvasBottom = (pageBottom - fit.ty) / fit.sy;
  const canvasLeft = (0 - fit.tx) / fit.sx; const canvasRight = (spec.device.widthPt - fit.tx) / fit.sx;
  return crop(figmaImage, canvasLeft * pxPerPt, canvasTop * pxPerPt, (canvasRight - canvasLeft) * pxPerPt, (canvasBottom - canvasTop) * pxPerPt);
}

/** One downscaled side-by-side of viewport 1 (device left, Figma right): the approval's only image. */
export function writeComposite({ measured, passDir, figmaPng, spec, out, height = 900 }) {
  const first = measured.viewports[0];
  const png = first?.png ? path.join(passDir, first.png) : null;
  const device = png ? decodeCached(png) : null;
  if (!device) return null;
  const images = [resize(device, Math.round((device.width * height) / device.height), height)];
  const figma = figmaPng && fs.existsSync(figmaPng) ? decodeCached(figmaPng) : null;
  if (figma) {
    const slice = figmaBand(spec, figma, fitFigmaToApp(spec), first.offset, first.offset + measured.device.screen.h);
    images.push(resize(slice, Math.round((slice.width * height) / slice.height), height));
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, encodePng(composeSideBySide(images)));
  return out;
}

/** crops/<region>.png for the regions with visual rows (device | Figma), at most `limit` of them. */
export function writeCrops({ spec, measured, gaps, passDir, figmaPng, outDir, limit = 2, width = 400 }) {
  const counts = new Map();
  for (const row of gaps.rows) if (row.judge === 'visual' && row.status !== 'accepted' && row.status !== 'unknown') counts.set(row.region, (counts.get(row.region) ?? 0) + 1);
  const regions = [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, limit).map(([id]) => spec.regions.find((region) => region.id === id)).filter(Boolean);
  const figma = figmaPng && fs.existsSync(figmaPng) ? decodeCached(figmaPng) : null;
  const fit = fitFigmaToApp(spec);
  const written = [];
  for (const region of regions) {
    const app = box(region.app);
    if (!app) continue;
    const viewport = viewportFor(app, measured);
    const png = viewport ? path.join(passDir, `device-${viewport.k}.png`) : null;
    const device = png ? decodeCached(png) : null;
    if (!device) continue;
    const pxPerPt = device.width / measured.device.screen.w;
    const pad = 8;
    const deviceCrop = crop(device, (app.x - pad) * pxPerPt, (app.y - viewport.offset - pad) * pxPerPt, (app.w + pad * 2) * pxPerPt, (app.h + pad * 2) * pxPerPt);
    const images = [resize(deviceCrop, width)];
    if (figma) images.push(resize(figmaBand(spec, figma, fit, app.y - pad, app.y + app.h + pad), width));
    const file = path.join(outDir, `${region.id.replace(/[^a-z0-9-]+/gi, '-')}.png`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(file, encodePng(composeSideBySide(images, 8)));
    written.push(file);
  }
  return written;
}

export function samplePixelAt({ measured, passDir, element }) {
  const k = element.window?.k;
  const png = k ? path.join(passDir, `device-${k}.png`) : null;
  const image = png ? decodeCached(png) : null;
  if (!image) return null;
  const pxPerPt = image.width / measured.device.screen.w;
  return hexOf(samplePixel(image, (element.window.x + element.window.w / 2) * pxPerPt, (element.window.y + element.window.h / 2) * pxPerPt));
}
