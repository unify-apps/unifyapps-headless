/**
 * An app look: the design one app uses on every page. Its colours, font, text
 * sizes and weights, corner radius, gaps, how content is grouped, depth,
 * icons, its one bold thing, its motion, and the first idea it turned down.
 * Pure: no files, no network.
 *
 * The plan writes it once as an `app look` line with real values, before any
 * page is designed; `fast brief` and `spec draft` read the line with
 * `readLookLine` and refuse it when a value is missing or fails a check. The
 * app's `app` task stores it with `skills/app-craft/scripts/app-look-args.mjs`:
 * as the app's own theme (`themeArgs`) on a tenant with the theme tools, else
 * as the app header block (`lookBlock`).
 */

// The markers of an app look already stored on a tenant, so they keep the
// former name: renaming them would hide every look written before.
export const LOOK_START = '<!-- nebula app look -->';
export const LOOK_END = '<!-- /nebula app look -->';

// Every seed, with what it colours. Colours are #rrggbb.
export const SEEDS = {
  'page-bg': 'the background behind every card',
  'surface': 'cards, inputs, tables and menus',
  'surface-alt': 'table headers, chips, a hovered row',
  'primary': 'the one accent: the main button, the selected tab, links',
  'primary-light': 'the accent on hover, and its lighter shades',
  'primary-dark': 'the accent when pressed, and its darker shades',
  'text-primary': 'body text and headings',
  'text-secondary': 'labels, captions, help text',
  'border': 'input borders and dividers',
  'border-light': 'quiet dividers inside a card',
  'success': 'done, paid, in stock',
  'warning': 'due soon, running low',
  'error': 'failed, overdue',
};
const OTHER_SEEDS = ['radius', 'font-text', 'font-display', 'font-url'];
// Seeds a look line adds and a seeds file may leave out. Each becomes a
// `--ds-*` variable custom CSS can use; the radius sizes also set the theme's.
const PIXEL_SEED = /^(radius-(small|medium|large)|text-size-[1-6]|gap-(inside|between))$/u;
const WEIGHT_SEED = /^weight-(regular|medium|strong)$/u;

/**
 * The text sizes the platform's text blocks offer, in px (its `--fontSize-*`
 * values). An app picks its sizes from these, so a builder can set each one
 * from the block's size list. The look never changes them: tables, inputs and
 * badges read the same sizes.
 */
export const TEXT_SIZES = Object.freeze([10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 30, 36, 48, 60, 72]);
/** The font weights the look block loads from Google Fonts (`fontUrl`). */
export const FONT_WEIGHTS = Object.freeze([400, 500, 600, 700]);
/**
 * The fonts a look may name: the theme's built-in fonts (`get_theme_options`),
 * less the ones every AI reaches for first and `Mono`. Each is also a Google
 * Font, so the header path loads the same name.
 */
export const LOOK_FONTS = Object.freeze(['Figtree', 'Geist', 'Instrument Sans', 'Lato', 'Lexend', 'Manrope',
  'Merriweather', 'Nunito', 'Poppins', 'Source Serif 4', 'Spectral', 'Special Gothic Expanded One']);
/** How far an app pushes its look: seen once to convince, opened every day, or read under pressure. */
export const USES = Object.freeze(['demo', 'daily', 'expert']);
// The parts of the line that are a decision in words. Each must be there.
const WORDS = {
  groups: 'how content is held together: cards, open sections, ruled lines or bands',
  depth: 'flat, borders or shadows',
  icons: 'one icon set and its style',
  bold: 'the one memorable thing in the app',
  motion: 'the one moving moment, or "none because …"',
  brand: 'the brand colours, logo or font the request names, or "none named"',
};

// The greys of a look: they must share one temperature.
const NEUTRALS = ['page-bg', 'surface', 'surface-alt', 'border', 'border-light'];
// Below this OKLCH chroma a grey shows no colour of its own; above it, its hue shows.
const TINT_SHOWS = 0.0025;
// How far apart two tinted greys' hues may be and still read as one temperature.
const SAME_TEMPERATURE = 60;

// The pairs that must stay readable, and the lowest contrast each may have.
// 4.5 is WCAG AA for normal text; 3 is the bar for a control's edge or fill.
const CHECKS = [
  ['text-primary', 'surface', 4.5],
  ['text-primary', 'page-bg', 4.5],
  ['text-secondary', 'surface', 4.5],
  ['primary', 'surface', 3],
  ['#ffffff', 'primary', 4.5], // a filled button's label is white
  ['success', 'surface', 4.5],
  ['warning', 'surface', 4.5],
  ['error', 'surface', 4.5],
];

const HEX = /^#[0-9a-f]{6}$/i;

function channels(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

function luminance(hex) {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio of two #rrggbb colours. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** OKLCH chroma and hue (degrees) of a #rrggbb colour. */
export function chromaAndHue(hex) {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { chroma: Math.hypot(A, B), hue: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** Every problem with a seeds object, and every contrast number checked. */
export function checkSeeds(seeds) {
  const problems = [];
  for (const name of Object.keys(SEEDS)) {
    if (!HEX.test(seeds[name] ?? '')) problems.push(`${name} must be a #rrggbb colour, got ${JSON.stringify(seeds[name])}`);
  }
  for (const name of OTHER_SEEDS) {
    if (typeof seeds[name] !== 'string' || !seeds[name].trim()) problems.push(`${name} is missing`);
  }
  if (seeds.radius && !/^\d+px$/.test(seeds.radius)) problems.push(`radius must look like 8px, got ${JSON.stringify(seeds.radius)}`);
  for (const [name, value] of Object.entries(seeds)) {
    if (PIXEL_SEED.test(name) && !/^\d+px$/.test(value)) problems.push(`${name} must look like 8px, got ${JSON.stringify(value)}`);
    if (WEIGHT_SEED.test(name) && !FONT_WEIGHTS.includes(Number(value))) problems.push(`${name} must be one of ${FONT_WEIGHTS.join(', ')}, got ${JSON.stringify(value)}`);
  }
  if (seeds['font-url'] && !/^https:\/\/fonts\.googleapis\.com\/css2\?/.test(seeds['font-url'])) {
    problems.push('font-url must be a https://fonts.googleapis.com/css2?… address');
  }
  for (const name of ['font-text', 'font-display']) {
    if (/[<>{};]/.test(seeds[name] ?? '')) problems.push(`${name} may not hold < > { } or ;`);
  }
  const numbers = [];
  if (!problems.length) {
    for (const [fg, bg, min] of CHECKS) {
      const a = fg.startsWith('#') ? fg : seeds[fg];
      const ratio = contrast(a, seeds[bg]);
      numbers.push({ fg, bg, ratio: Math.round(ratio * 100) / 100, min });
      if (ratio < min) problems.push(`${fg} on ${bg} is ${ratio.toFixed(2)}:1, below ${min}:1`);
    }
    // A cool grey page with warm grey panels reads as two looks pasted together.
    const tinted = NEUTRALS.map((name) => ({ name, ...chromaAndHue(seeds[name]) })).filter((n) => n.chroma >= TINT_SHOWS);
    for (let i = 0; i < tinted.length; i++) for (let j = 0; j < i; j++) {
      const [a, b] = [tinted[i], tinted[j]];
      if (hueGap(a.hue, b.hue) > SAME_TEMPERATURE) {
        problems.push(`${b.name} ${seeds[b.name]} and ${a.name} ${seeds[a.name]} lean to different colours (hue ${Math.round(b.hue)}° and ${Math.round(a.hue)}°): make every grey lean the same way, or make one plain grey`);
      }
    }
  }
  return { problems, numbers };
}

const fontUrl = (family) => `https://fonts.googleapis.com/css2?family=${family.trim().replace(/\s+/g, '+')}:wght@400;500;600;700&display=swap`;

// Which values each part of the line holds, in order.
const LINE_COLOURS = {
  primary: ['primary', 'primary-light', 'primary-dark'],
  page: ['page-bg'],
  surface: ['surface', 'surface-alt'],
  text: ['text-primary', 'text-secondary'],
  borders: ['border', 'border-light'],
  status: ['success', 'warning', 'error'],
};

/** The shape of an app look line, for a refusal to quote. */
export const LOOK_LINE_SHAPE = `app look · <app>: <direction> · light because <who, where> · use <demo|daily|expert> because <who opens it, how often> · primary #main / #hover / #pressed · page #… · surface #… / #alt · text #… / #secondary · borders #… / #light · status #success / #warning / #error · font <one of ${LOOK_FONTS.join(', ')}> (<3 words>) · type 12 / 14 / 18 / 30 / 48 · weights 400 / 600 · radius 4px / 8px / 12px · compact · gaps 8 inside / 24 between · groups <how content is held together> · depth <flat, borders or shadows> · icons <one set and its style> · bold <the one memorable thing> · motion <the one moving moment, or none because …> · brand <what the request names, or none named> · not <the first idea> because <why it is a default> · leads <what the eye goes to first>`;

const numbersIn = (text) => [...String(text).matchAll(/(\d+(?:\.\d+)?)\s*(?:px)?/gu)].map((match) => Number(match[1]));
const partFor = (parts, pattern) => parts.find((part) => pattern.test(part));

// The text sizes: 3 to 6 of the platform's sizes, smallest first, each step a
// real step up and the largest at least twice the smallest. Few sizes far
// apart read as clear levels; many sizes a step apart read as fog.
function typeProblems(sizes) {
  if (sizes.length < 3 || sizes.length > 6) return [`"type" needs 3 to 6 text sizes, smallest first, such as 12 / 14 / 18 / 30 / 48 (found ${sizes.length})`];
  const problems = [];
  const odd = sizes.filter((size) => !TEXT_SIZES.includes(size));
  if (odd.length) problems.push(`"type" ${odd.map((size) => `${size}px`).join(', ')} ${odd.length > 1 ? 'are' : 'is'} not a size the platform's text offers; pick from ${TEXT_SIZES.join(', ')}`);
  for (let i = 1; i < sizes.length; i++) {
    if (sizes[i] < sizes[i - 1] * 1.1) problems.push(`"type" sizes must go up by at least 1.1x each step, smallest first: ${sizes[i - 1]}px to ${sizes[i]}px is not`);
  }
  if (sizes.at(-1) < sizes[0] * 2) problems.push(`"type" needs one big jump: the largest size, ${sizes.at(-1)}px, is less than twice the smallest, ${sizes[0]}px`);
  return problems;
}

// The weights: 2 or 3 the look loads, lightest first, far enough apart to tell apart.
function weightProblems(weights) {
  if (weights.length < 2 || weights.length > 3) return [`"weights" needs 2 or 3 font weights, lightest first, such as 400 / 600 (found ${weights.length})`];
  const problems = [];
  const odd = weights.filter((weight) => !FONT_WEIGHTS.includes(weight));
  if (odd.length) problems.push(`"weights" ${odd.join(', ')} ${odd.length > 1 ? 'are' : 'is'} not loaded; pick from ${FONT_WEIGHTS.join(', ')}`);
  if (weights.some((weight, i) => i && weight <= weights[i - 1])) problems.push('"weights" must go up, lightest first');
  else if (weights.at(-1) - weights[0] < 200) problems.push(`"weights" ${weights[0]} and ${weights.at(-1)} look alike; make the strong one at least 200 heavier`);
  return problems;
}

/**
 * Reads the text after `app look · <app>:`. Returns `{ none }` when the line
 * says `none because <reason>`, else `{ seeds, scheme, density, font, design,
 * problems }`, where problems include every `checkSeeds` problem and `design`
 * holds the decisions in words and numbers that are not colours.
 */
export function readLookLine(text) {
  const value = String(text ?? '').trim();
  const none = /^none\s+because\s+(\S.*)$/iu.exec(value);
  if (none) return { none: none[1].trim(), problems: [] };
  const parts = value.split(/\s+·\s+/u).map((part) => part.trim());
  const problems = [];
  const seeds = {};
  const design = {};
  for (const [label, names] of Object.entries(LINE_COLOURS)) {
    const part = parts.find((p) => new RegExp(`^${label}\\s+#`, 'iu').test(p));
    const hexes = part ? part.match(/#[0-9a-f]{6}\b/giu) ?? [] : [];
    if (hexes.length !== names.length) {
      problems.push(`"${label}" needs ${names.length} colour${names.length > 1 ? 's' : ''} (${names.join(', ')}), found ${hexes.length}`);
      continue;
    }
    names.forEach((name, i) => { seeds[name] = hexes[i]; });
  }
  const scheme = /\b(light|dark)\s+because\s+\S/iu.exec(value)?.[1]?.toLowerCase();
  if (!scheme) problems.push('say "light because …" or "dark because …"');
  const named = parts.map((p) => /^font\s+([A-Za-z0-9][A-Za-z0-9 ]*?)\s*(?:\(|$)/u.exec(p)?.[1]).find(Boolean);
  const font = LOOK_FONTS.find((name) => name.toLowerCase() === named?.toLowerCase());
  if (!named) problems.push(`"font" needs one of ${LOOK_FONTS.join(', ')}`);
  else if (!font) problems.push(`"font" ${named} is not a font the app theme offers; pick one of ${LOOK_FONTS.join(', ')}`);
  else {
    seeds['font-text'] = `'${font}', sans-serif`;
    seeds['font-display'] = `'${font}', sans-serif`;
    seeds['font-url'] = fontUrl(font);
  }
  const use = parts.map((p) => /^use\s+(\w+)\s+because\s+\S/iu.exec(p)?.[1]?.toLowerCase()).find(Boolean);
  if (!USES.includes(use)) problems.push('"use" needs demo, daily or expert, with a reason: "use daily because the team opens it every shift"');
  else design.use = use;
  // The radius has three sizes: small for tags and checkboxes, medium for
  // buttons and inputs, large for cards and panels. One radius on everything
  // is a default, not a choice.
  const radii = numbersIn(partFor(parts, /^radius\s+\d/iu)?.replace(/^radius/iu, '') ?? '');
  if (radii.length !== 3) problems.push('"radius" needs 3 sizes, small / medium / large, such as 4px / 8px / 12px');
  else if (radii.some((r, i) => r > 24 || (i && r < radii[i - 1]))) problems.push('"radius" sizes go small to large, each 0 to 24px');
  else {
    design.radius = { small: radii[0], medium: radii[1], large: radii[2] };
    seeds.radius = `${radii[1]}px`;
    for (const [size, px] of Object.entries(design.radius)) seeds[`radius-${size}`] = `${px}px`;
  }
  const sizes = numbersIn(partFor(parts, /^type\s+\d/iu)?.replace(/^type/iu, '') ?? '');
  const typeIssues = typeProblems(sizes);
  problems.push(...typeIssues);
  if (!typeIssues.length) {
    design.type = sizes;
    sizes.forEach((size, i) => { seeds[`text-size-${i + 1}`] = `${size}px`; });
  }
  const weights = numbersIn(partFor(parts, /^weights\s+\d/iu)?.replace(/^weights/iu, '') ?? '');
  const weightIssues = weightProblems(weights);
  problems.push(...weightIssues);
  if (!weightIssues.length) {
    design.weights = weights;
    [seeds['weight-regular'], seeds['weight-strong']] = [String(weights[0]), String(weights.at(-1))];
    // A line naming 3 weights has a middle one too: dropping it left no way for
    // custom CSS to reach it, even though it was asked for and validated above.
    if (weights.length === 3) seeds['weight-medium'] = String(weights[1]);
  }
  const density = parts.map((p) => /^(compact|comfortable)\b/iu.exec(p)?.[1]?.toLowerCase()).find(Boolean);
  if (!density) problems.push('say "compact" or "comfortable"');
  // Less space inside a group than between groups, or nothing reads as a group.
  const gaps = /^gaps\s+(\d+)\s*(?:px)?\s+inside\s*\/\s*(\d+)\s*(?:px)?\s+between\b/iu.exec(partFor(parts, /^gaps\s/iu) ?? '');
  if (!gaps) problems.push('"gaps" needs the gap inside a group and between groups, such as "gaps 8 inside / 24 between"');
  else if (Number(gaps[2]) < Number(gaps[1]) * 2) problems.push(`"gaps" between groups (${gaps[2]}px) must be at least twice the gap inside one (${gaps[1]}px), or nothing reads as a group`);
  else {
    design.gaps = { inside: Number(gaps[1]), between: Number(gaps[2]) };
    [seeds['gap-inside'], seeds['gap-between']] = [`${gaps[1]}px`, `${gaps[2]}px`];
  }
  for (const [label, what] of Object.entries(WORDS)) {
    const part = partFor(parts, new RegExp(`^${label}\\s+\\S`, 'iu'));
    if (!part) problems.push(`"${label}" needs ${what}`);
    else design[label] = part.slice(label.length).trim();
  }
  const not = /^not\s+(\S.*?)\s+because\s+(\S.*)$/iu.exec(partFor(parts, /^not\s+\S/iu) ?? '');
  if (!not) problems.push('"not" needs the first idea and why it is a default: "not white cards with a blue button on each because that fits any admin app"');
  else design.not = { idea: not[1].trim(), because: not[2].trim() };
  const leads = partFor(parts, /^leads\s+\S/iu);
  if (!leads) problems.push('"leads" needs what the eye goes to first');
  else design.leads = leads.slice('leads'.length).trim();
  if (!problems.length) problems.push(...checkSeeds(seeds).problems);
  return { seeds, scheme, density, font, design, problems };
}

const colorMix = (colour, percent, into) => `color-mix(in srgb,${colour} ${percent}%,${into})`;
const mix = (seed, percent, into) => colorMix(`var(--ds-${seed})`, percent, into);
const shadow = (text, y, blur, percent) => `0 ${y}px ${blur}px ${colorMix(text, percent, 'transparent')}`;

// Three shadows that all fall the same way, tinted with the look's own text
// colour so they lean the palette's way. Custom CSS uses them when the look's
// depth says shadows.
const shadows = (text) => ({
  'shadow-1': shadow(text, 1, 2, 8),
  'shadow-2': `${shadow(text, 2, 6, 10)},${shadow(text, 1, 2, 6)}`,
  'shadow-3': `${shadow(text, 8, 24, 14)},${shadow(text, 2, 6, 8)}`,
});

/**
 * The `--ds-*` values written as they are, names without the prefix: the
 * line's radius, text and gap sizes, its weights, and the three shadows tinted
 * with `text`. The header block writes them all; the theme points the radius
 * sizes at its own radius steps instead (`themeDsVars`).
 */
export function plainDsVars(seeds, text) {
  const sizes = Object.keys(seeds).filter((name) => PIXEL_SEED.test(name) || WEIGHT_SEED.test(name)).sort();
  return { ...Object.fromEntries(sizes.map((name) => [name, seeds[name]])), ...shadows(text) };
}

// The theme's radius steps, by which of the look's three sizes they take.
const RADIUS_STEPS = {
  small: ['--radius-xxs', '--radius-xs', '--radius-sm', '--checkbox-radius', '--tooltip-radius', '--chart-bar-radius'],
  medium: ['--radius-md', '--radius-lg', '--radius-xl', '--radius-2xl', '--button-xs-radius', '--button-sm-radius',
    '--button-md-radius', '--button-lg-radius', '--input-radius'],
  large: ['--radius-3xl', '--radius-4xl', '--radius-5xl', '--radius-6xl', '--radius-7xl', '--radius-8xl', '--radius-9xl', '--radius-10xl'],
};
// The theme's brand tints, `--palette-alpha-brand-05` to `-100`.
const ALPHA_STEPS = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
// A seeds file with one radius still works: each size falls back to it.
const radiusOf = (size) => `var(--ds-radius-${size},var(--ds-radius))`;

/** The look block for one set of seeds: the font link, the seeds, the mapping. */
export function lookBlock(seeds) {
  const root = [...Object.keys(SEEDS), 'radius', 'font-text', 'font-display']
    .map((name) => `--ds-${name}:${seeds[name]};`).join('')
    + Object.entries(plainDsVars(seeds, 'var(--ds-text-primary)')).map(([name, value]) => `--ds-${name}:${value};`).join('');
  const surface = 'var(--ds-surface)';
  const brand = {
    25: mix('primary', 3, surface), 50: mix('primary', 6, surface), 100: mix('primary', 12, surface),
    200: mix('primary', 24, surface), 300: mix('primary', 40, surface), 400: mix('primary', 60, surface),
    500: 'var(--ds-primary-light)', 600: 'var(--ds-primary)', 700: mix('primary', 50, 'var(--ds-primary-dark)'),
    800: 'var(--ds-primary-dark)', 900: mix('primary-dark', 80, '#000'), 950: mix('primary-dark', 60, '#000'),
  };
  const gray = {
    25: mix('text-primary', 2, surface), 50: mix('text-primary', 4, surface), 100: mix('text-primary', 7, surface),
    200: mix('text-primary', 12, surface), 300: mix('text-primary', 20, surface), 400: mix('text-primary', 38, surface),
    500: mix('text-primary', 55, surface), 600: mix('text-secondary', 85, 'var(--ds-text-primary)'),
    700: 'var(--ds-text-secondary)', 800: mix('text-primary', 85, surface), 900: 'var(--ds-text-primary)',
    950: mix('text-primary', 80, '#000'),
  };
  const mapping = [
    ...Object.entries(brand).map(([k, v]) => `--palette-brand-${k}:${v};`),
    ...Object.entries(gray).map(([k, v]) => `--palette-gray-${k}:${v};`),
    '--bg-workspace:var(--ds-page-bg);--bg-primary:var(--ds-surface);--bg-secondary:var(--ds-surface-alt);',
    '--border-primary:var(--ds-border);--border-secondary:var(--ds-border-light);--border-tertiary:var(--ds-border-light);',
    '--palette-success-600:var(--ds-success);--palette-warning-600:var(--ds-warning);--palette-error-600:var(--ds-error);',
    '--fontFamily-text:var(--ds-font-text);--fontFamily-display:var(--ds-font-display);',
    // The brand tints: a selected row's background, a hovered brand fill and
    // the focus ring. Left alone they keep the platform's default purple.
    ...ALPHA_STEPS.map((n) => `--palette-alpha-brand-${String(n).padStart(2, '0')}:${n === 100 ? 'var(--ds-primary)' : mix('primary', n, 'transparent')};`),
    ...Object.entries(RADIUS_STEPS).flatMap(([size, names]) => names.map((name) => `${name}:${radiusOf(size)};`)),
  ].join('');
  // `:root` in front outranks the theme's own `.interface-theme` rule, so the
  // mapping wins whichever of the two the page loads last.
  const scope = ":root .interface-theme,:root .interface-theme [data-color-scheme='light']";
  // A theme sets these on the element itself, which beats a value inherited
  // from the app root, so they are set on the same elements here. The theme
  // nests them under `.interface-theme, .interface-theme
  // [data-color-scheme='light']` and names the size too (`& .ua-input-vars[data-size='md']`),
  // and its style loads after the header, so a rule here as heavy as the
  // theme's loses. `:root:root` makes each one heavier than the theme's. Seen
  // on a test tenant on 2026-10-05: with one `:root`, a button and an input kept
  // the theme's 0.5rem.
  const heavy = ':root:root .interface-theme';
  const onElements = `${heavy} .ua-button[data-size],${heavy} .ua-iconButton[data-size]{--button-radius:${radiusOf('medium')}}`
    + `${heavy} .ua-input-vars,${heavy} .ua-input-vars[data-size]{--input-radius:${radiusOf('medium')}}`
    + `${heavy} .ua-chart-root{--chart-bar-radius:${radiusOf('small')}}`;
  return `${LOOK_START}<link rel="preconnect" href="https://fonts.googleapis.com">`
    + `<link href="${seeds['font-url']}" rel="stylesheet">`
    + `<style>:root{${root}}${scope}{${mapping}}${onElements}</style>${LOOK_END}`;
}

// Where the look block sits in a header, as [start, end], or null.
function lookSpan(text) {
  const start = text.indexOf(LOOK_START);
  const end = text.indexOf(LOOK_END);
  return start !== -1 && end > start ? [start, end + LOOK_END.length] : null;
}

/** The header with the look block in place of any earlier one, everything else kept. */
export function withLook(header, block) {
  const text = header ?? '';
  const span = lookSpan(text);
  if (span) return text.slice(0, span[0]) + block + text.slice(span[1]);
  return text ? `${block}${text}` : block;
}

/** The header with its look block taken out and everything else kept, or null when it holds none. */
export function withoutLook(header) {
  const text = header ?? '';
  const span = lookSpan(text);
  return span ? text.slice(0, span[0]) + text.slice(span[1]) : null;
}

/** The theme's radius presets in px, [small, medium, large]: `get_theme_options`' sm, md and xl, 16px to the rem. */
export const RADIUS_PRESETS = Object.freeze({ FullySquare: [0, 0, 0], SoftSquare: [4, 4, 4], Rounded: [6, 8, 8], FullyRounded: [12, 12, 12] });

/**
 * Each theme colour seed and the look role it takes. All ten are always sent:
 * a seed left out keeps the old theme's value, such as the tenant default's
 * purple `secondary`. The look has one accent, so `secondary` is `primary`.
 */
export const THEME_COLORS = Object.freeze({ primary: 'primary', secondary: 'primary', gray: 'text-secondary',
  text: 'text-primary', background: 'surface', workspace: 'page-bg', navigation: 'surface',
  success: 'success', warning: 'warning', error: 'error' });

/**
 * Theme tokens the look sets itself, each from one look role or a mix of two.
 * Grown from the seeds alone they came out wrong on a test tenant on 2026-10-06:
 * an off-white surface gave amber backgrounds and borders, `--text-secondary`
 * came out nearly black, and a dark primary turned brand 700 to 950 to #000000.
 */
const darker = (role, percent) => (seeds) => colorMix(seeds[role], percent, '#000');
// The text steps below secondary, each lighter than the one before. Pinning
// only --text-secondary left these grown from the text seed, darker than
// secondary, so tertiary and disabled text read stronger (a test tenant, 2026-10-10).
const fainter = (percent) => (seeds) => colorMix(seeds['text-secondary'], percent, seeds.surface);
export const ROLE_PINS = Object.freeze({
  '--bg-secondary': 'surface-alt',
  '--bg-tertiary': 'border-light',
  '--bg-quaternary': 'border',
  '--border-primary': 'border',
  '--border-secondary': 'border-light',
  '--border-tertiary': 'border-light',
  '--text-secondary': 'text-secondary',
  '--text-tertiary': fainter(80),
  '--text-quaternary': fainter(65),
  '--text-placeholder': fainter(65),
  '--text-disabled': fainter(50),
  '--palette-brand-500': 'primary-light',
  '--palette-brand-700': (seeds) => colorMix(seeds.primary, 50, seeds['primary-dark']),
  '--palette-brand-800': 'primary-dark',
  '--palette-brand-900': darker('primary-dark', 80),
  '--palette-brand-950': darker('primary-dark', 60),
});

// The `--ds-*` names that point at a theme token, so a change in the theme
// manager reaches custom CSS too.
const THEME_ALIASES = {
  primary: 'var(--palette-brand-600)', 'primary-light': 'var(--palette-brand-500)', 'primary-dark': 'var(--palette-brand-800)',
  'page-bg': 'var(--bg-workspace)', surface: 'var(--bg-primary)', 'surface-alt': 'var(--bg-secondary)',
  'text-primary': 'var(--text-primary)', 'text-secondary': 'var(--text-secondary)',
  border: 'var(--border-primary)', 'border-light': 'var(--border-secondary)',
  success: 'var(--palette-success-600)', warning: 'var(--palette-warning-600)', error: 'var(--palette-error-600)',
  'font-text': 'var(--fontFamily-text)', 'font-display': 'var(--fontFamily-display)',
  radius: 'var(--radius-md)', 'radius-small': 'var(--radius-sm)', 'radius-medium': 'var(--radius-md)', 'radius-large': 'var(--radius-xl)',
};

/** The preset nearest the look's three radius sizes: least total px apart; a tie goes to the nearer medium, then the smaller. */
export function radiusPreset({ small, medium, large }) {
  // Medium is the look's primary, most load-bearing size, so it is the sort
  // key, not just a tiebreaker on the total: summing all three let one far-off
  // large value (an outlier past every preset, nothing close) outweigh an
  // exact medium match and swing the pick to the wrong preset. small is the
  // tiebreaker on a medium tie; the sort is stable and the presets go
  // smallest first, so a full tie keeps the smaller.
  const apart = ([s, m]) => [Math.abs(m - medium), Math.abs(s - small)];
  return Object.entries(RADIUS_PRESETS).map(([name, sizes]) => [name, ...apart(sizes)])
    .sort((a, b) => a[1] - b[1] || a[2] - b[2])[0][0];
}

/** The `--ds-*` names as the theme stores them, names without the prefix: the theme-token aliases and `plainDsVars`. */
export function themeDsVars(seeds) {
  return { ...plainDsVars(seeds, 'var(--text-primary)'), ...THEME_ALIASES };
}

/**
 * The two theme writes for one ready look: `set_app_theme` and
 * `set_theme_typography` arguments, each without `host`. Throws on a look that
 * says none or has problems, so a bad line never reaches the tenant.
 */
export function themeArgs(look, appId) {
  if (look.none || look.problems.length) {
    throw new Error(`This look has no theme: ${look.none ? `it says none (${look.none})` : look.problems.join('; ')}`);
  }
  const { seeds } = look;
  // Only the role pins and the --ds-* names. A raw token wins over what the
  // theme grows from its seeds, so each other one would leave a theme manager
  // control doing nothing.
  const cssVars = Object.fromEntries([
    ...Object.entries(ROLE_PINS).map(([token, pin]) => [token, typeof pin === 'function' ? pin(seeds) : seeds[pin]]),
    ...Object.entries(themeDsVars(seeds)).map(([name, value]) => [`--ds-${name}`, value]),
  ]);
  const colors = Object.fromEntries(Object.entries(THEME_COLORS).map(([key, role]) => [key, seeds[role]]));
  return {
    theme: { appId, colorScheme: look.scheme, colors, radius: radiusPreset(look.design.radius), cssVars },
    typography: { appId, textFont: look.font, baseFontSizePx: baseFontSize(look.design.type) },
  };
}

// The look's own body text size for the tenant's typography control, which
// the look block itself never touches (that stays `--ds-text-size-*`, read by
// custom CSS only). `type` is 3 to 6 sizes, smallest first; the second size is
// the body size in the scale the look line's example follows (12 caption / 14
// body / 18 heading / …). `set_theme_typography`'s own range is 10-24px, so a
// look whose scale jumps straight past that for its body size is clamped
// rather than sent a number the tenant would refuse.
function baseFontSize(sizes) {
  return Math.min(24, Math.max(10, sizes[1] ?? sizes[0]));
}
