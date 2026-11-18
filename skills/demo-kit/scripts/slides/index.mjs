// The slides: the HTML deck rebuilt as a PowerPoint of its own shapes. Its text is text in the story's fonts, its
// boxes, pictures and lines are shapes, each build is a click that plays the deck's own motion, and the scene's lines
// are the speaker notes. The deck is made first when it is out of date.
import fs from 'node:fs';
import path from 'node:path';
import { stepped } from '../core/timeline.mjs';
import { deckFile, deckIsFresh, makeDeck } from '../deck/index.mjs';
import { embedFonts } from './fonts.mjs';
import { nativeSlides } from './native.mjs';
import { writePptx } from './pptx.mjs';

export async function makeSlides(story, { log = () => {} } = {}) {
  let issues;
  if (!deckIsFresh(story)) {
    log('deck: out of date, making it first');
    issues = (await makeDeck(story, { log })).issues;
  }
  const built = path.join(story.dir, 'build', 'deck');
  issues ??= fs.existsSync(path.join(built, 'lint.json')) ? JSON.parse(fs.readFileSync(path.join(built, 'lint.json'), 'utf8')) : [];
  const plan = stepped(story, story.scenes);
  const { slides, theme } = await nativeSlides(deckFile(story), { log });
  const label = (d) => d.kicker || d.title || d.text || d.who || '';
  const deck = slides.map((s) => {
    const scene = plan.scenes[s.scene];
    return { ...s, name: `${s.scene + 1} ${label(scene.data)}${s.parts > 1 ? ` (${s.part + 1} of ${s.parts})` : ''}`.trim(), notes: notesOf(scene, s.from, s.from + s.builds) };
  });
  const file = path.join(story.dir, 'out', `${story.slug}.pptx`);
  const runs = deck.flatMap((s) => s.items.flatMap((it) => it.m.lines?.flatMap((l) => l.runs) ?? []));
  const fonts = await embedFonts(runs, { log });
  writePptx(file, { title: story.title, slides: deck, theme, fonts });
  const sheets = fs.existsSync(built) ? fs.readdirSync(built).filter((f) => /^contact-\d+\.jpg$/.test(f)).map((f) => path.join(built, f)) : [];
  return { file, slides: deck.length, scenes: plan.scenes.length, fonts: fonts.map((f) => f.typeface), clicks: deck.reduce((n, s) => n + s.builds + (s.part ? 1 : 0), 0), mb: +(fs.statSync(file).size / 1e6).toFixed(1), issues, storyboard: path.join(built, 'storyboard.html'), sheets };
}

/** The lines of a scene's builds `from` to `to` as a slide's notes, the line each click brings marked. */
function notesOf(scene, from, to) {
  return scene.beats.map((b, i) => [b, b.build > 0 && scene.beats[i - 1]?.build !== b.build ? `[Click] ${b.text}` : b.text])
    .filter(([b]) => b.build >= from && b.build <= to).map(([, line]) => line).join('\n');
}
