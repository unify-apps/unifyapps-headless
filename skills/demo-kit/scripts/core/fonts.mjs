// The theme's two Google Fonts families as @font-face CSS with the font files inside, so a deck shows its own type
// offline, in a meeting room, or inside a page whose security policy blocks Google Fonts. Kept in HOME/fonts, so a
// rebuild needs no network.
import fs from 'node:fs';
import path from 'node:path';
import { fontsUrl } from './theme.mjs';
import { HOME, sha1 } from './util.mjs';

// Google Fonts answers with woff2 only to a browser it knows
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
// Latin and the accented Latin of European names; the other scripts would double the size for text a story never has
const SUBSETS = new Set(['latin', 'latin-ext']);

/** The CSS, or null when it cannot be fetched and was never kept (the page then links the fonts instead). */
export async function inlineFonts(theme) {
  const url = fontsUrl(theme);
  const kept = path.join(HOME, 'fonts', `${sha1(url)}.css`);
  if (fs.existsSync(kept)) return fs.readFileSync(kept, 'utf8');
  try {
    const get = async (u) => {
      const r = await fetch(u, { headers: { 'User-Agent': BROWSER }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`${r.status} for ${u}`);
      return r;
    };
    const css = await (await get(url)).text();
    const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*{[^}]*})/g)].filter((m) => SUBSETS.has(m[1])).map((m) => m[2]);
    const files = new Map();
    for (const b of blocks) for (const [, u] of b.matchAll(/url\((https:[^)]+\.woff2)\)/g)) files.set(u, null);
    await Promise.all([...files.keys()].map(async (u) => files.set(u, Buffer.from(await (await get(u)).arrayBuffer()).toString('base64'))));
    const out = blocks.map((b) => b.replace(/url\((https:[^)]+\.woff2)\)/g, (_, u) => `url(data:font/woff2;base64,${files.get(u)})`)).join('\n');
    if (!out) return null;
    fs.mkdirSync(path.dirname(kept), { recursive: true });
    fs.writeFileSync(kept, out);
    return out;
  } catch {
    return null;
  }
}
