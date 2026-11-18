// A story's look: eight tokens, and every colour the runtime and the scenes use, mixed from them; a named look also
// brings its own styling (runtime/looks/<look>.css).
import { UsageError } from './util.mjs';

// mark: a highlighter's colour, swept behind a heading's key words by a look that uses one
export const UNIFYAPPS = Object.freeze({ paper: '#fbf9f5', ink: '#1b1a0e', accent: '#847347', deep: '#1a3a0c', alert: '#b6502f', mark: '#efe2b8', serif: 'Spectral', sans: 'Inter' });
// Vox's explainer look: newsprint, black type, a yellow highlighter, red for what is wrong, black for the big moments.
// Kinetic type: heavy, tight headlines on the UnifyApps paper, a gold bar swept behind the key words, ink for the big
// moments; `heavy` is the extra headline weight its fonts are fetched with.
export const LOOKS = Object.freeze({
  unifyapps: UNIFYAPPS,
  vox: Object.freeze({ paper: '#f1ece1', ink: '#121212', accent: '#121212', deep: '#121212', alert: '#d42a1e', mark: '#ffd400', serif: 'Barlow Condensed', sans: 'Inter', look: 'vox' }),
  kinetic: Object.freeze({ paper: '#fbf9f5', ink: '#1b1a0e', accent: '#847347', deep: '#1b1a0e', alert: '#b6502f', mark: '#e6d398', serif: 'Inter Tight', sans: 'Inter', look: 'kinetic', heavy: 800 }),
});
const KEYS = Object.keys(UNIFYAPPS);
const FONTS = new Set(['serif', 'sans']);
const COLOUR = /^#[0-9a-f]{6}$/i;
// a Google Fonts family name: letters, digits and spaces, which also keeps it safe in CSS and in the fonts URL
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/;

// [role, its UnifyApps value, 'mix', a, b, t (a moved toward b by t) | 'alpha', a, k], where a and b are tokens or
// earlier roles. The UnifyApps palette was tuned by hand,
// so a role keeps its tuned value while every colour it is made from is still UnifyApps's own; the mix only
// approximates it, and takes over once a theme changes one of those colours.
const ROLES = [
  ['paper2', '#f4efe6', 'mix', 'paper', 'accent', 0.079], ['paper3', '#efe8dc', 'mix', 'paper', 'accent', 0.13],
  ['card', '#fffdf8', 'mix', 'paper', 'white', 0.375],
  ['ink2', '#2e2814', 'mix', 'ink', 'accent', 0.166], ['body', '#4c4841', 'mix', 'ink', 'paper', 0.21],
  ['muted', '#857e6e', 'mix', 'ink', 'paper', 0.44], ['rule', '#e6decf', 'mix', 'paper', 'accent', 0.205],
  ['accent2', '#938256', 'mix', 'accent', 'paper', 0.097], ['alert-bg', '#fbede6', 'mix', 'paper', 'alert', 0.065],
  ['deep2', '#2a5216', 'mix', 'deep', 'paper', 0.076], ['deep3', '#3f6b26', 'mix', 'deep', 'paper', 0.176],
  ['deep-glow', '#2f5a1a', 'mix', 'deep', 'paper', 0.108],
  // the deep ground, a radial gradient: its light stop, its body, and the darker stops toward the edge
  ['deep-hi', '#224a0f', 'mix', 'deep', 'paper', 0.045], ['deep-bg', '#163a08', 'mix', 'deep', 'black', 0.042],
  ['deep-bg2', '#12300a', 'mix', 'deep', 'black', 0.212], ['deep-bg3', '#10280a', 'mix', 'deep', 'black', 0.289],
  ['deep-lo', '#0d2104', 'mix', 'deep', 'black', 0.459], ['deep-edge', '#081403', 'mix', 'deep', 'black', 0.635],
  ['on-deep', '#f7f3ed', 'mix', 'paper', 'accent', 0.046], ['on-deep-body', '#b9bfad', 'mix', 'paper', 'deep', 0.304],
  ['on-deep2', '#e9e1cf', 'mix', 'paper', 'accent', 0.197], ['on-deep3', '#e8dfcc', 'mix', 'paper', 'accent', 0.205],
  ['on-deep-rule', 'rgba(247, 243, 237, .16)', 'alpha', 'on-deep', 0.16],
  ['accent-on-deep', '#c4b58c', 'mix', 'accent', 'paper', 0.45],
  ['accent-halo', 'rgba(132, 115, 71, .22)', 'alpha', 'accent', 0.22],
  ['shadow', 'rgba(27, 26, 14, .18)', 'alpha', 'ink', 0.18], ['edge', 'rgba(27, 26, 14, .08)', 'alpha', 'ink', 0.08],
  ['deep-shadow', 'rgba(22, 58, 8, .28)', 'alpha', 'deep-bg', 0.28],
  // the browser frame around a product screen; the screenshot itself sits on white whatever the theme
  ['view', '#ffffff', 'mix', 'paper', 'white', 1],
  ['frame-bar', '#f1ede5', 'mix', 'paper', 'accent', 0.096], ['frame-line', '#e3dccd', 'mix', 'paper', 'accent', 0.222],
  ['frame-dot', '#d8d0bf', 'mix', 'paper', 'accent', 0.306], ['frame-text', '#6a6662', 'mix', 'ink', 'paper', 0.349],
  // the preview player around the frame
  ['backdrop', '#0b0b08', 'mix', 'ink', 'black', 0.499], ['player', '#12120e', 'mix', 'ink', 'black', 0.204],
  ['player-ink', '#e8e2d4', 'mix', 'paper', 'accent', 0.18], ['player-line', '#4a4638', 'mix', 'ink', 'paper', 0.195],
  ['player-btn', '#23221b', 'mix', 'ink', 'paper', 0.046],
];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (c) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
const OPS = {
  mix: (a, b, t) => hex(rgb(a).map((x, i) => x + (rgb(b)[i] - x) * t)),
  alpha: (a, k) => `rgba(${rgb(a).join(', ')}, ${String(k).replace(/^0/, '')})`,
};
const BASE = { white: '#ffffff', black: '#000000' };
const UA_ROLES = { ...BASE, ...UNIFYAPPS, ...Object.fromEntries(ROLES.map(([role, ua]) => [role, ua])) };

function roles(theme) {
  const v = { ...BASE, ...theme };
  for (const [role, ua, op, ...args] of ROLES) {
    const from = args.filter((x) => typeof x === 'string');
    v[role] = from.every((k) => v[k] === UA_ROLES[k]) ? ua : OPS[op](...args.map((x) => (typeof x === 'string' ? v[x] : x)));
  }
  return v;
}

/** The story's theme from story.json: "unifyapps" (or absent), or an object of tokens, each left-out one UnifyApps's. */
export function resolveTheme(input = 'unifyapps') {
  if (typeof input === 'string' && LOOKS[input]) return { ...UNIFYAPPS, ...LOOKS[input] };
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new UsageError(`theme must be ${Object.keys(LOOKS).map((k) => `"${k}"`).join(' or ')}, or an object with any of ${KEYS.join(', ')}; got ${JSON.stringify(input)}`);
  const out = { ...UNIFYAPPS };
  for (const [k, x] of Object.entries(input)) {
    if (!KEYS.includes(k)) throw new UsageError(`theme has no key "${k}"; the keys are ${KEYS.join(', ')}`);
    if (FONTS.has(k) ? !FAMILY.test(x) : !COLOUR.test(x)) throw new UsageError(`theme.${k} is ${JSON.stringify(x)}; it must be ${FONTS.has(k) ? 'a Google Fonts family name (letters, digits and spaces)' : 'a colour written #rrggbb'}`);
    out[k] = FONTS.has(k) ? x : x.toLowerCase();
  }
  return out;
}

/** Every CSS custom property the runtime and the scenes read, for a resolved theme. */
export function themeVars(theme) {
  const v = roles(theme);
  const vars = Object.fromEntries([...KEYS.filter((k) => !FONTS.has(k)), ...ROLES.map(([role]) => role)].map((k) => [`--${k}`, v[k]]));
  vars['--serif'] = `'${theme.serif}', Georgia, 'Times New Roman', serif`;
  vars['--sans'] = `'${theme.sans}', 'Helvetica Neue', Arial, sans-serif`;
  return vars;
}

/** The Google Fonts stylesheet for the theme's two families, at the weights the scenes use and its look's heavy one. */
export const fontsUrl = (theme) => {
  const fam = (name) => name.replace(/ /g, '+');
  return `https://fonts.googleapis.com/css2?family=${fam(theme.sans)}:wght@400;500;600&family=${fam(theme.serif)}:ital,wght@0,200;0,300;0,400;0,500;0,600${theme.heavy ? `;0,${theme.heavy}` : ''};1,300;1,400;1,500&display=block`;
};

/** WCAG contrast ratio of two #rrggbb colours, 1 to 21. */
export function contrast(a, b) {
  const lum = (c) => rgb(c).map((x) => x / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)).reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pairs a film cannot be read in: body text under 4.5:1, the accent under 3:1. */
export function themeProblems(theme) {
  const v = roles(theme);
  const ratio = (r) => `${Math.floor(r * 100) / 100}:1`;
  return [
    ['ink', v.ink, 'paper', v.paper, 4.5], ['text on deep (mixed from paper)', v['on-deep'], 'deep', v.deep, 4.5], ['accent', v.accent, 'paper', v.paper, 3],
  ].flatMap(([fg, a, bg, b, min]) => {
    const r = contrast(a, b);
    return r < min ? [`theme: ${fg} ${a} on ${bg} ${b} is ${ratio(r)}; it needs ${min}:1 to be read`] : [];
  });
}
