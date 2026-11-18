#!/usr/bin/env node
// One call per capture of a WEB page in the loops' browser: the whole-page screenshot at a width, the
// accessibility tree, and a measured dump of every visible element (box, type, colours, cursor), with the
// layout signals a critic confirms on the screenshot. Node 22, no dependencies beyond web-browser's library.
//
//   node capture.mjs --browser <folder> --out <path-without-extension> --width <w> [--layout] [--burst 0,1,3] [--json]
//
// Writes <out>.png (page-shot at the width, no reload), <out>.yml (the snapshot), <out>.json (the element
// dump) and, with --layout, <out>.layout.json (scripts/layout.mjs on the dump). --burst takes small viewport
// screenshots <out>-t<sec>.png at those seconds after the call starts, before the settled capture, so a
// transition's blank, flash or jump is on record.
//
// Exit codes: 0 done · 1 a browser command failed · 2 usage.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, '../../../skills/web-loops/web-browser/scripts/lib');
const { evalIn, linkedFile, run, snapshot } = await import(join(LIB, 'driver.mjs'));
const { layoutSignals } = await import(join(HERE, 'layout.mjs'));

// How many elements the dump keeps: enough for a long page, small enough to read as JSON.
const MAX_ELEMENTS = 1500;

/** Runs in the page: every visible element a critic can point at, measured. `H` is web-browser's helpers. */
function dumpElements(ctx, H, opts) {
  const doc = (ctx && ctx.doc) || document;
  const win = doc.defaultView || window;
  const max = opts.max || 1500;
  const CONTROL = /^(button|link|checkbox|radio|switch|textbox|searchbox|combobox|listbox|slider|spinbutton|tab|menuitem|option|menuitemcheckbox|menuitemradio|treeitem)$/;
  const alpha = (c) => { const m = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+))?\s*\)/.exec(c || ''); return m ? (m[1] === undefined ? 1 : Number(m[1])) : 0; };
  const effectiveBg = (el) => {
    let n = el;
    for (let depth = 0; n && n.nodeType === 1 && depth < 40; depth++, n = n.parentElement) {
      const s = H.cs(n);
      if (alpha(s.backgroundColor) > 0) return s.backgroundColor;
      if (s.backgroundImage && s.backgroundImage !== 'none') return 'image';
    }
    return 'rgb(255, 255, 255)';
  };
  const labelled = (el) => {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return true;
    if (el.id && doc.querySelector('label[for="' + CSS.escape(el.id) + '"]')) return true;
    return Boolean(el.closest('label'));
  };
  const vw = win.innerWidth; const vh = win.innerHeight;
  const out = [];
  const all = doc.querySelectorAll('body *');
  for (const el of all) {
    if (out.length >= max) break;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') continue;
    if (el.closest('svg') && tag !== 'svg') continue;
    if (!H.visible(el)) continue;
    const s = H.cs(el);
    const role = H.role(el);
    const control = CONTROL.test(role) || el.hasAttribute('onclick') || (el.tabIndex >= 0 && tag !== 'body') || s.cursor === 'pointer';
    const own = H.ownText(el);
    const heading = /^h[1-6]$/.test(tag) || role === 'heading';
    const img = tag === 'img' || tag === 'svg' || role === 'img';
    if (!control && !own && !heading && !img) continue;
    const b = H.box(el);
    const r = el.getBoundingClientRect();
    out.push({
      i: out.length, tag, role, name: H.name(el), text: own ? H.text(el, 80) : '', box: { x: b.x, y: b.y + win.scrollY, w: b.w, h: b.h },
      inViewport: r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw,
      font: { size: Math.round(parseFloat(s.fontSize) * 10) / 10, weight: s.fontWeight, family: (s.fontFamily || '').split(',')[0].replace(/["']/g, '').trim(), lineHeight: s.lineHeight },
      color: s.color, bg: effectiveBg(el), radius: s.borderTopLeftRadius, shadow: s.boxShadow !== 'none' ? s.boxShadow : null,
      border: alpha(s.borderTopColor) > 0 && parseFloat(s.borderTopWidth) > 0 ? s.borderTopWidth + ' ' + s.borderTopColor : null,
      cursor: s.cursor, control, heading: heading ? (role === 'heading' ? Number(el.getAttribute('aria-level')) || 2 : Number(tag[1])) : null, img,
      input: /^(input|textarea|select)$/.test(tag) ? { type: el.getAttribute('type') || tag, labelled: labelled(el), placeholder: el.getAttribute('placeholder') || '' } : null,
      href: tag === 'a' ? H.pathOnly(el.getAttribute('href') || '') : null,
    });
  }
  const scrollW = doc.documentElement.scrollWidth; const scrollH = doc.documentElement.scrollHeight;
  return { url: H.pathOnly(location.href), title: doc.title, viewport: { w: vw, h: vh }, page: { scrollWidth: scrollW, scrollHeight: scrollH, overflowX: scrollW > vw + 1 }, truncated: out.length >= max, elements: out };
}

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

/** The file a playwright-cli command saved: the absolute name given, the browser folder's copy, or the link it printed. */
function savedFile(folder, name, stdout) {
  const candidates = [name, join(folder, basename(name)), linkedFile(stdout)].filter(Boolean).map((f) => (isAbsolute(f) ? f : join(folder, f)));
  return candidates.find((f) => existsSync(f)) ?? null;
}

const sleepUntil = (at) => { while (Date.now() < at) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(200, at - Date.now())); };

export function capture({ browser, out, width, layout = false, burst = [], env = process.env }) {
  const folder = resolve(browser);
  const base = resolve(out);
  mkdirSync(dirname(base), { recursive: true });
  const result = { out: base, width, files: {} };
  const started = Date.now();
  for (const sec of burst) {
    sleepUntil(started + sec * 1000);
    const name = `${base}-t${sec}.png`;
    const shot = run(folder, ['screenshot', `--filename=${name}`], { env });
    const file = shot.status === 0 ? savedFile(folder, name, shot.stdout) : null;
    if (file && file !== name) renameSync(file, name);
    if (file) result.files[`t${sec}`] = name; else process.stderr.write(`burst t${sec} failed: ${shot.message ?? shot.stderr ?? ''}\n`);
  }
  const shot = run(folder, ['page-shot', String(width), '--no-reload'], { timeoutMs: 120000, env });
  if (shot.status !== 0) fail(`page-shot ${width} failed: ${shot.message ?? shot.stderr ?? ''}`, 1);
  const png = join(folder, `page-${width}.png`);
  if (!existsSync(png)) fail(`page-shot ${width} saved no ${png}`, 1);
  copyFileSync(png, `${base}.png`);
  result.files.png = `${base}.png`;
  const tree = snapshot(folder, `${basename(base)}.yml`, { env });
  writeFileSync(`${base}.yml`, tree);
  result.files.yml = `${base}.yml`;
  result.treeLines = tree.split('\n').length;
  const dump = evalIn(folder, dumpElements, { max: MAX_ELEMENTS }, { env });
  writeFileSync(`${base}.json`, `${JSON.stringify(dump, null, 1)}\n`);
  result.files.json = `${base}.json`;
  result.elements = dump.elements.length;
  if (layout) {
    const signals = layoutSignals(dump, { width });
    writeFileSync(`${base}.layout.json`, `${JSON.stringify(signals, null, 1)}\n`);
    result.files.layout = `${base}.layout.json`;
  }
  return result;
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: { browser: { type: 'string' }, out: { type: 'string' }, width: { type: 'string' }, layout: { type: 'boolean' }, burst: { type: 'string' }, json: { type: 'boolean' } }, strict: true });
  if (!values.browser || !values.out || !values.width) fail('usage: capture.mjs --browser <folder> --out <path-without-extension> --width <w> [--layout] [--burst 0,1,3] [--json]', 2);
  const width = Number(values.width);
  if (!Number.isInteger(width) || width < 200) fail('--width is a whole number of CSS px, 200 or more', 2);
  const burst = values.burst ? values.burst.split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0) : [];
  const result = capture({ browser: values.browser, out: values.out, width, layout: Boolean(values.layout), burst });
  process.stdout.write(values.json ? `${JSON.stringify(result)}\n` : `saved ${result.files.png} ${result.files.yml} ${result.files.json}${result.files.layout ? ` ${result.files.layout}` : ''} (${result.treeLines} tree lines, ${result.elements} elements)\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
