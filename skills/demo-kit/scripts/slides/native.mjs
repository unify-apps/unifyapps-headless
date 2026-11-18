// The native slides: each scene of the deck page read build by build (slides/layout.js) and made into its slide
// (slides/model.mjs), with its pictures: the ones it shows, a picture of each piece PowerPoint cannot draw, and the
// slide's background, the page with everything that became a shape taken off it.
import fs from 'node:fs';
import path from 'node:path';
import { openPage } from '../core/chrome.mjs';
import { slideModel, slidesOf } from './model.mjs';

const LAYOUT = fs.readFileSync(path.join(import.meta.dirname, 'layout.js'), 'utf8');

const media = (uri) => {
  const m = String(uri).match(/^data:image\/(png|jpeg);base64,(.*)$/s);
  return m ? { type: m[1], data: Buffer.from(m[2], 'base64') } : null;
};

/**
 * The slides of every scene of `page` (one, or one per build that takes something away), each with its scene's
 * index, and the story's theme (colours and fonts) for the PowerPoint's own.
 */
export async function nativeSlides(page, { log = () => {} } = {}) {
  // twice the frame's pixels, so a picture of a drawing stays sharp on a large screen
  const p = await openPage(page, { scale: 2 });
  try {
    await p.eval(`${LAYOUT};1`);
    await p.eval("document.getElementById('bar').style.display = 'none'");
    await p.clear();
    const stops = await p.stops(), theme = await p.eval('UA.ppt.palette()');
    const scenes = Math.max(...stops.map((x) => x.scene)) + 1, slides = [];
    for (let i = 0; i < scenes; i++) {
      const mine = stops.filter((x) => x.scene === i);
      const sources = await p.eval(`UA.ppt.prepare(${i})`);
      const frames = [];
      for (const x of mine) frames.push(await p.eval(`UA.ppt.measure(${x.to})`));
      const model = slideModel({ sources, frames, anims: await p.eval('UA.ppt.anims()'), clock: await p.eval('UA.ppt.clock()') });
      const pics = new Map();
      for (const it of model.items) {
        if (it.kind === 'pic') {
          if (!pics.has(it.n)) pics.set(it.n, media(await p.eval(`UA.ppt.picture(${it.n})`)));
          it.media = pics.get(it.n);
        } else if (it.kind === 'raster' || it.kind === 'paint') {
          await p.seek(mine[it.at].to);
          const clip = await p.eval(`UA.ppt.mode('iso', ${it.n})`);
          it.media = { type: 'png', data: await p.capture(clip, 'png') };
          it.m = { rect: clip };
          await p.eval('UA.ppt.mode(null)');
        }
      }
      await p.seek(mine.at(-1).to);
      await p.eval("UA.ppt.mode('plate')");
      const plate = { type: 'jpeg', data: await p.capture({ x: 0, y: 0, w: 1920, h: 1080 }, 'jpeg', 0.5) };
      await p.eval('UA.ppt.mode(null)');
      const parts = slidesOf({ ...model, items: model.items.filter((it) => !['pic', 'raster', 'paint'].includes(it.kind) || it.media) });
      for (const part of parts) slides.push({ ...part, scene: i, parts: parts.length, plate });
      log(`slides: ${model.id} ${model.items.length} shapes, ${model.builds} builds, ${parts.length} slide${parts.length > 1 ? 's' : ''}`);
    }
    await p.eval('UA.ppt.reset()');
    return { slides, theme };
  } finally { p.close(); }
}
