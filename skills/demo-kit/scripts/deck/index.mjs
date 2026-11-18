// The HTML presentation: one self-contained file that steps through the story build by build, with speaker notes, all
// scenes, a presenter window, and its fonts and pictures inside it. Its stills are the layout check, and the slides.
import fs from 'node:fs';
import path from 'node:path';
import { inlineFonts } from '../core/fonts.mjs';
import { writePage } from '../core/page.mjs';
import { stills } from '../core/stills.mjs';
import { stepped } from '../core/timeline.mjs';

export const PLAYER = { scripts: [path.join(import.meta.dirname, 'presenter.js')], styles: [path.join(import.meta.dirname, 'presenter.css')] };

export const deckFile = (story) => path.join(story.dir, 'out', `${story.slug}.html`);

/** Writes out/<slug>.html, then takes a still of every build of it: the layout check, the storyboard, the thumbnails. */
export async function makeDeck(story, { log = () => {} } = {}) {
  const plan = stepped(story, story.scenes);
  const fonts = await inlineFonts(story.theme);
  if (!fonts) log('fonts: offline, so the deck links them: it shows its own type only with the internet');
  const file = deckFile(story);
  const write = (film) => writePage(file, plan, { title: story.title, footer: story.footer, theme: story.theme, ground: story.ground, inline: story.dir, fonts, player: PLAYER, film, customer: story.customer });
  write({});
  const shots = await stills(file, plan, path.join(story.dir, 'build', 'deck'), { thumbs: true });
  write({ thumbs: shots.thumbs });
  return { file, mb: +(fs.statSync(file).size / 1e6).toFixed(1), plan, ...shots };
}

/** Whether out/<slug>.html was made after every file it is made from. */
export function deckIsFresh(story) {
  const file = deckFile(story);
  if (!fs.existsSync(file)) return false;
  const made = fs.statSync(file).mtimeMs;
  const assets = path.join(story.dir, 'assets');
  const sources = ['story.json', 'facts.json'].map((f) => path.join(story.dir, f)).concat(fs.existsSync(assets) ? fs.readdirSync(assets).map((f) => path.join(assets, f)) : []);
  return sources.every((f) => !fs.existsSync(f) || fs.statSync(f).mtimeMs < made);
}
