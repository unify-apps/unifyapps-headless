// The story as one HTML page: the runtime, the theme, every scene, the plan and the brand assets, inlined. Every
// output starts here: the deck is this page with its presenter, the video is this page with its preview player (and,
// for frames, with none), and slides are stills of the deck.
import fs from 'node:fs';
import path from 'node:path';
import { gsapScripts, needsGsap } from './gsap.mjs';
import { library, sceneFiles, sharedFiles, storySceneFiles } from './scenes.mjs';
import { fontsUrl, resolveTheme, themeVars } from './theme.mjs';
import { RUNTIME } from './util.mjs';

const MEDIA = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };

const dataUri = (file) => `data:${MEDIA[path.extname(file).toLowerCase()]};base64,${fs.readFileSync(file).toString('base64')}`;


/** Every local picture the scenes show (and `extra`, such as the customer's logo), by the path story.json writes it with. */
export function pictures(plan, extra = []) {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === 'string') { if (!/^(https?:|data:)/.test(v) && MEDIA[path.extname(v).toLowerCase()]) out.add(v); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  for (const s of plan.scenes) walk(s.data);
  walk(extra);
  return [...out];
}

/** The kit's scene files, and the story's own that its scenes use: a scene file still being written elsewhere stays out. */
function pageScenes(plan) {
  const used = new Set(plan.scenes.map((s) => s.type));
  return [...sceneFiles(), ...(plan.dir ? storySceneFiles(plan.dir).filter((f) => used.has(path.basename(f, '.js'))) : [])];
}

/** The story's pictures as data URIs, so the page needs no folder beside it. */
function inlinePictures(plan, dir, extra) {
  return Object.fromEntries(pictures(plan, extra).map((src) => {
    const file = path.resolve(dir, src);
    if (!fs.existsSync(file)) throw new Error(`${src} is not in the story folder`);
    return [src, dataUri(file)];
  }));
}

/**
 * Writes the page to `file`.
 * assetBase: how the page reaches the story folder, when pictures stay files; inline: the story folder, to put them in
 * the page instead. fonts: @font-face CSS with the fonts inside (else a Google Fonts link). player: the scripts and
 * styles of the output that drives the page (none: the page waits to be driven, as frames are taken). film: more
 * fields for window.FILM (the audio file, the deck's thumbnails). ground: the story's own, "deep" for a dark story.
 * customer: { name, logo, logoOnDeep? } of a story made for a customer, whose logo the page shows beside ours.
 */
export function writePage(file, plan, { title, footer, theme = resolveTheme(), ground = 'paper', assetBase, inline, fonts, player, film = {}, customer } = {}) {
  const read = (f) => fs.readFileSync(path.join(RUNTIME, f), 'utf8');
  const scenes = plan.scenes.map(({ id, type, ground, cut, data, start, end, cues, beats }) => ({ id, type, ground, cut, data, start, end, cues, lines: beats.map((b) => ({ text: b.text, build: b.build, ...(b.words && { words: b.words.map(({ w, at }) => ({ w, at })) }) })) }));
  const FILM = { title, footer, ground, look: theme.look, clock: plan.clock, duration: plan.duration, assetBase, customer, ...(inline && { inline: inlinePictures(plan, inline, [customer?.logo, customer?.logoOnDeep]) }), ...film, scenes };
  const assets = { logo: read('assets/logo-gold.svg') };
  const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  const attr = (s) => s.replace(/[&<"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '"': '&quot;' })[c]);
  const vars = Object.entries(themeVars(theme)).map(([k, v]) => `${k}: ${v};`).join(' ').replace(/</g, '\\3c ');
  const own = (files = []) => files.map((f) => fs.readFileSync(f, 'utf8'));
  const script = (js) => `<script>${js.replace(/<\/(script)/gi, '<\\/$1')}</script>`;
  // the film's shared parts, and GSAP when a scene or a shared part draws with it
  const shared = plan.dir ? sharedFiles(plan.dir) : { css: [], js: [] };
  const storyJs = [...own(shared.js), ...own(pageScenes(plan).filter((f) => plan.dir && f.startsWith(path.join(plan.dir, 'scenes'))))];
  const gsap = needsGsap(storyJs) ? gsapScripts() : [];
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${(title ?? 'UnifyApps').replace(/</g, '&lt;')}</title>
${fonts ? `<style>${fonts.replace(/<\//g, '<\\/')}</style>` : `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${attr(fontsUrl(theme))}">`}
<style>${read('theme.css')}
:root { ${vars} }
${theme.look ? read(`looks/${theme.look}.css`) : ''}
${own(shared.css).join('\n').replace(/<\/(style)/gi, '<\\/$1')}
${own(player?.styles).join('\n')}</style>
</head><body>
<div id="frame"><div id="stage"><div id="bg-deep"></div><canvas id="amb"></canvas><div id="foot"></div><div id="bar"></div></div></div>
<script>window.FILM=${json(FILM)};window.ASSETS=${json(assets)};</script>
${gsap.map(script).join('\n')}
<script>${read('runtime.js')}</script>
${own(shared.js).map(script).join('\n')}
${pageScenes(plan).map((f) => script(fs.readFileSync(f, 'utf8'))).join('\n')}
${own(player?.scripts).map((js) => `<script>${js}</script>`).join('\n')}
<script>UA.boot().catch(function(e){window.__bootError=String(e&&e.stack||e);console.error(e);});</script>
</body></html>`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  return file;
}
