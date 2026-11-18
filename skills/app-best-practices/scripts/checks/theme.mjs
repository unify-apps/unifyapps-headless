// Theme and styles (THEME): style values the renderer can read.
import { blockTarget, isPlainObject, oncePerTarget } from './shared.mjs';

/**
 * The text a token string spread into an object spells (`{"0":"b","1":"g"}` is "bg"), or null:
 * keys "0".."n-1" all present, each a single character. A sibling `custom` key may survive.
 */
function spreadToken(value) {
  if (!isPlainObject(value)) return null;
  const letters = [];
  for (let index = 0; Object.hasOwn(value, String(index)); index += 1) {
    const letter = value[String(index)];
    if (typeof letter !== 'string' || letter.length !== 1) return null;
    letters.push(letter);
  }
  return letters.length >= 2 ? letters.join('') : null;
}

function spreadValues(value, path, out) {
  const spelled = spreadToken(value);
  if (spelled) out.push({ path, spelled });
  else if (isPlainObject(value)) for (const [key, nested] of Object.entries(value)) spreadValues(nested, `${path}.${key}`, out);
  return out;
}

export const themeChecks = [
  {
    id: 'fix-style-values-stored-character',
    run: page => oncePerTarget(page.walk.order.flatMap(id => {
      const appearance = page.blocks[id]?.component?.appearance ?? {};
      return [...spreadValues(appearance.styles, 'appearance.styles', []), ...spreadValues(appearance.customStyles, 'appearance.customStyles', [])]
        .map(({ path, spelled }) => ({ target: blockTarget(page, id), evidence: `${path} is a character-indexed object spelling "${spelled}", so the token is lost` }));
    })),
  },
];
