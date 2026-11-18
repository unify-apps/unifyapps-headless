// The one place that turns a Figma value into a device value. Every script and test imports from here.
// Rule, from an accepted Home-page spec of an earlier rebuild (canvas 440 -> device 402): sizes, paddings, gaps and radii go
// to the nearest multiple of the grid; fonts, line heights and anything that scales below `smallBelow`
// go to whole points; Figma text is cap-trimmed, so a vertical gap next to text loses half of that
// line's extra leading before it is rounded.

export const DEFAULT_SCALE = Object.freeze({
  factor: 402 / 440,
  grid: 4,
  middleTolerance: 0.1,
  smallBelow: 7,
  capHeightRatio: 0.7,
});

// Corrections that accepted spec settled per app font size/line height. These win over the formula
// below: the formula with a 0.70 cap height gives 3.65, 3.45, 4.45, 4.75, 5.4, 6, 6.8 for the same pairs,
// and three of the accepted text gaps only come out right with the table.
export const CAP_CORRECTIONS = Object.freeze({
  '11/15': 3.5, '13/16': 3.5, '13/18': 4.5, '15/20': 4.75, '16/22': 5.25, '20/26': 6, '22/29': 6.5,
});

function options(given) {
  return { ...DEFAULT_SCALE, ...(given ?? {}) };
}

// Nearest multiple of `grid`. A value within `middleTolerance` of the exact middle goes to the lower
// multiple for spacing and to the upper one for sizes: 24 x 0.9136 = 21.93 is a 20 as a padding and a 24
// as an icon. Scaled values under `smallBelow` are too small for the grid and go to whole points.
export function roundOnGrid(scaled, tie, { grid, middleTolerance, smallBelow }) {
  if (!Number.isFinite(scaled)) return null;
  const sign = scaled < 0 ? -1 : 1;
  const value = Math.abs(scaled);
  if (value < smallBelow) return sign * Math.round(value);
  const lower = Math.floor(value / grid) * grid;
  const upper = lower + grid;
  const middle = lower + grid / 2;
  if (Math.abs(value - middle) <= middleTolerance + 1e-9) return sign * (tie === 'up' ? upper : lower);
  return sign * (value - lower < upper - value ? lower : upper);
}

export function scaleSpacing(figmaValue, given) {
  const opts = options(given);
  if (!Number.isFinite(figmaValue)) return null;
  return roundOnGrid(figmaValue * opts.factor, 'down', opts);
}

export function scaleSize(figmaValue, given) {
  const opts = options(given);
  if (!Number.isFinite(figmaValue)) return null;
  return roundOnGrid(figmaValue * opts.factor, 'up', opts);
}

// Fonts and line heights: whole points, half up.
export function scaleFont(figmaValue, factor = DEFAULT_SCALE.factor) {
  if (!Number.isFinite(figmaValue)) return null;
  return Math.round(figmaValue * factor);
}

// Half of the leading the app adds around a cap-trimmed Figma text line: (lineHeight - capHeight) / 2 in
// app points. The table wins when it has the pair. `figmaTextHeight` (the single-line trimmed height in
// Figma points) with `factor` gives the cap height from the design itself when the table has no entry.
export function capCorrection(lineHeightApp, fontSizeApp, capHeightRatio = DEFAULT_SCALE.capHeightRatio, figmaTextHeight, factor) {
  if (!Number.isFinite(lineHeightApp) || !Number.isFinite(fontSizeApp)) return null;
  const known = CAP_CORRECTIONS[`${fontSizeApp}/${lineHeightApp}`];
  if (known !== undefined) return known;
  let capApp = capHeightRatio * fontSizeApp;
  if (Number.isFinite(figmaTextHeight) && Number.isFinite(factor)) {
    const measured = figmaTextHeight * factor;
    // A single trimmed line is 55-85% of its font size; anything else is a multi-line box, not a cap height.
    if (measured >= 0.55 * fontSizeApp && measured <= 0.85 * fontSizeApp) capApp = measured;
  }
  return Math.max(0, (lineHeightApp - capApp) / 2);
}

// A neighbour is `{ kind, fontSizeApp, lineHeightApp, figmaTextHeight? }` or null. Only a text neighbour
// loses its correction; a container, icon or image keeps its box edge.
export function neighbourCorrection(neighbour, given) {
  if (!neighbour || neighbour.kind !== 'text') return 0;
  const opts = options(given);
  const correction = capCorrection(neighbour.lineHeightApp, neighbour.fontSizeApp, opts.capHeightRatio, neighbour.figmaTextHeight, opts.factor);
  return correction ?? 0;
}

// Vertical gap between two siblings: scale, subtract each text neighbour's correction, round as spacing.
export function scaleTextGap(figmaGap, neighbourA, neighbourB, given) {
  const opts = options(given);
  if (!Number.isFinite(figmaGap)) return null;
  const corrected = figmaGap * opts.factor - neighbourCorrection(neighbourA, opts) - neighbourCorrection(neighbourB, opts);
  return roundOnGrid(corrected, 'down', opts);
}

// Letter-spacing stays in em. Figma exports it in em or in px; px needs the Figma font size.
export function letterSpacingEm(value, unit, fontSizeFigma) {
  if (!Number.isFinite(value)) return null;
  if (unit === 'em') return Number(value.toFixed(3));
  if (unit === 'px' && Number.isFinite(fontSizeFigma) && fontSizeFigma > 0) return Number((value / fontSizeFigma).toFixed(3));
  if (unit === '%') return Number((value / 100).toFixed(3));
  return null;
}
