// Stills of a story page, taken where each build has settled (the page's own stops): the layout check, the deck's
// thumbnails, the slides' pictures, and a storyboard and contact sheets to read the whole story at a glance.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, shot } from './chrome.mjs';

// across a cut: a frame every 50 ms (a cut's hand-over is 200 to 720 ms long)
const CUT_STEP = 50;

/**
 * every: a still for every build, or only each scene's last. quality: of the JPEG (the slides take 92, which a
 * projector cannot tell from a PNG at a quarter of the size). thumbs: also a 480x270 thumbnail of each scene's last
 * build, as a data URI.
 */
export async function stills(page, plan, dir, { every = true, quality = 88, thumbs = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/\.(jpg|png)$/.test(f)) fs.rmSync(path.join(dir, f));
  const p = await openPage(page);
  const shots = [], issues = [], thumb = {}, text = {};
  try {
    // the progress line belongs to playing the story, not to a picture of it
    await p.eval("document.getElementById('bar').style.display = 'none'");
    const stops = (await p.stops()).filter((x) => every || x.last);
    for (const [n, x] of stops.entries()) {
      await p.seek(x.to);
      const file = `${String(n + 1).padStart(3, '0')}-${x.id}-${x.step}.jpg`;
      fs.writeFileSync(path.join(dir, file), await p.frame(quality));
      for (const is of (await p.lint()).issues) issues.push({ ...is, scene: x.id, step: x.step, still: file });
      if (x.last) {
        text[x.id] = await p.text(x.scene);
        if (thumbs) thumb[x.id] = `data:image/jpeg;base64,${(await p.frame(80, 'jpeg', 0.25)).toString('base64')}`;
      }
      const lines = plan.scenes[x.scene].beats.filter((b) => b.build === x.step).map((b) => b.text);
      shots.push({ scene: x.scene, id: x.id, step: x.step, last: x.last, t: x.to, file: path.join(dir, file), lines });
    }
    // between scenes the clock moves, so the stills never see it: across each cut, no text of the leaving scene lies on
    // text of the arriving one while both are visible (a cut hands over; it does not print one on the other)
    const all = await p.stops();
    for (let i = 1; i < plan.scenes.length; i++) {
      const from = all.filter((x) => x.scene === i - 1).at(-1), to = all.find((x) => x.scene === i);
      if (!from || !to) continue;
      for (let t = from.to; t <= to.to; t += CUT_STEP) {
        await p.seek(t);
        const on = await p.eval(`UA.textOnText(${i - 1}, ${i})`);
        if (on) {
          const file = `cut-${from.id}-${to.id}.jpg`;
          fs.writeFileSync(path.join(dir, file), await p.frame(quality));
          issues.push({ kind: 'cut-overlap', text: `${from.id} / ${to.id}: ${on}`, scene: to.id, step: 0, still: file });
          break;
        }
      }
    }
  } finally { p.close(); }
  for (const s of shots) s.text = text[s.id];
  const uniq = [...new Map(issues.map((x) => [`${x.scene}|${x.kind}|${x.text}`, x])).values()];
  fs.writeFileSync(path.join(dir, 'lint.json'), `${JSON.stringify(uniq, null, 2)}\n`);
  const sheets = await contactSheets(shots, dir);
  const storyboard = writeStoryboard(shots, plan, dir);
  return { count: shots.length, shots, issues: uniq, sheets, storyboard, ...(thumbs && { thumbs: thumb }) };
}

/** 4 across, 5 down, one sheet per 20 stills: the whole story in a few pictures. */
async function contactSheets(shots, dir) {
  const sheets = [];
  for (let k = 0; k * 20 < shots.length; k++) {
    const part = shots.slice(k * 20, k * 20 + 20);
    const html = path.join(dir, `.sheet-${k}.html`);
    fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#222218;display:grid;grid-template-columns:repeat(4,480px);gap:6px;padding:6px}img{width:480px;height:270px;display:block}</style>${part.map((x) => `<img src="${path.basename(x.file)}">`).join('')}`);
    const sheet = path.join(dir, `contact-${k + 1}.jpg`);
    await shot(html, sheet, { width: 4 * 480 + 5 * 6, height: Math.ceil(part.length / 4) * 276 + 6, format: 'jpeg' });
    fs.rmSync(html);
    sheets.push(sheet);
  }
  return sheets;
}

function writeStoryboard(shots, plan, dir) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const file = path.join(dir, 'storyboard.html');
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><title>Storyboard · ${esc(plan.title ?? plan.slug)}</title>
<style>body{margin:0;padding:32px;background:#f4efe6;font:16px/1.45 Georgia,serif;color:#1b1a0e}h1{font-weight:400;margin:0 0 24px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(460px,1fr));gap:28px}
figure{margin:0;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.08)}img{width:100%;display:block}figcaption{padding:12px 16px}b{font:600 12px/1 Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#847347}</style>
<h1>${esc(plan.title ?? plan.slug)} · ${plan.scenes.length} scenes</h1><div class="g">${shots.map((x) => `<figure><img src="${path.basename(x.file)}" alt=""><figcaption><b>${x.scene + 1} · ${esc(x.id)} · build ${x.step}</b>${x.lines.map((l) => `<br>${esc(l)}`).join('')}</figcaption></figure>`).join('')}</div>`);
  return file;
}
