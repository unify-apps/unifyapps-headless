// Style expectations: fonts, colours, radii, fills, shadows. Each property remembers its source.
import { scaleFont, scaleSize, scaleSpacing, letterSpacingEm } from '../scale.mjs';
import { normalizeColor } from '../color.mjs';

const TIERS = ['designContext', 'css'];
const SOURCE_NAME = { designContext: 'design-context', css: 'css' };

function pick(element, prop) {
  for (const tier of TIERS) {
    const record = element.sources?.[tier];
    if (record && record.props[prop] !== undefined && record.props[prop] !== null) return { value: record.props[prop], source: SOURCE_NAME[tier] };
  }
  return null;
}

const expectation = (value, figma, source, extra = {}) => ({ value, figma, source, ...extra });
const unknown = (figma = null) => ({ value: null, figma, source: 'unknown' });

export function radiusValue(figmaRadius, box, scale) {
  if (Array.isArray(figmaRadius)) return figmaRadius.map((corner) => (corner >= Math.min(box.w, box.h) / 2 ? 'pill' : scaleSize(corner, scale)));
  if (!Number.isFinite(figmaRadius)) return null;
  return figmaRadius >= Math.min(box.w, box.h) / 2 ? 'pill' : scaleSize(figmaRadius, scale);
}

function shadowValue(shadow, scale) {
  const whole = (value) => Math.round(value * scale.factor);
  return { x: whole(shadow.x), y: whole(shadow.y), blur: scaleSpacing(shadow.blur, scale), spread: whole(shadow.spread), color: shadow.color, inset: Boolean(shadow.inset) };
}

export function textStyleExpectations(element, { scale, letterSpacing }) {
  const expect = {};
  const fontSize = pick(element, 'fontSize');
  const lineHeight = pick(element, 'lineHeight');
  const fontWeight = pick(element, 'fontWeight');
  const fontFamily = pick(element, 'fontFamily');
  const color = pick(element, 'color');
  const text = (() => {
    const dc = element.sources?.designContext;
    if (dc?.text) return { value: dc.text, source: 'design-context' };
    const css = element.sources?.css;
    if (css?.text) return { value: css.text, source: 'css' };
    return { value: element.name, source: 'metadata', rule: 'layer-name' };
  })();
  expect.fontSize = fontSize ? expectation(scaleFont(fontSize.value, scale.factor), fontSize.value, fontSize.source) : unknown();
  expect.lineHeight = lineHeight ? expectation(scaleFont(lineHeight.value, scale.factor), lineHeight.value, lineHeight.source) : unknown();
  expect.fontWeight = fontWeight ? expectation(fontWeight.value, fontWeight.value, fontWeight.source) : unknown();
  expect.fontFamily = fontFamily ? expectation(fontFamily.value, fontFamily.value, fontFamily.source, { compare: false }) : { value: null, figma: null, source: 'unknown', compare: false };
  expect.color = color ? expectation(normalizeColor(color.value) ?? color.value, color.value, color.source) : unknown();
  expect.text = expectation(text.value, text.value, text.source, text.rule ? { rule: text.rule } : {});
  const transform = pick(element, 'textTransform');
  const letters = String(text.value ?? '');
  const isUpper = /[A-Z]/.test(letters) && letters === letters.toUpperCase();
  if (transform?.value === 'uppercase') expect.textCase = expectation('upper', 'uppercase', transform.source);
  else if (isUpper && letters.replace(/[^A-Za-z]/g, '').length >= 2) expect.textCase = expectation('upper', 'text', text.source, { rule: 'from-text' });
  const spacing = pick(element, 'letterSpacing');
  if (spacing) {
    const match = /^(-?[\d.]+)\s*(em|px|%)?$/.exec(String(spacing.value).trim());
    const em = match ? letterSpacingEm(Number(match[1]), match[2] ?? 'px', fontSize?.value) : null;
    expect.letterSpacing = em === null ? unknown(spacing.value) : expectation(em, spacing.value, spacing.source, { unit: 'em' });
  } else {
    const upper = expect.textCase?.value === 'upper';
    expect.letterSpacing = expectation(upper ? letterSpacing.upper : letterSpacing.copy, null, 'rule', { unit: 'em', rule: upper ? 'uppercase +0.02em' : 'copy -0.02em' });
  }
  const opacity = pick(element, 'opacity');
  if (opacity && opacity.value !== 1) expect.opacity = expectation(opacity.value, opacity.value, opacity.source, { judge: 'visual' });
  element.font = fontSize && lineHeight ? { fontSizeFigma: fontSize.value, lineHeightFigma: lineHeight.value, fontSizeApp: expect.fontSize.value, lineHeightApp: expect.lineHeight.value, source: fontSize.source } : null;
  return expect;
}

export function boxStyleExpectations(element, { scale }) {
  const expect = {};
  const record = element.sources?.designContext ?? element.sources?.css ?? null;
  const svgShape = element.sources?.svg ?? null;
  const fill = pick(element, 'fill');
  const gradient = pick(element, 'gradient');
  const image = pick(element, 'image');
  if (image) expect.image = expectation(true, true, image.source, { judge: 'visual' });
  if (gradient) expect.gradient = expectation(gradient.value, gradient.value, gradient.source, { judge: 'visual' });
  else if (svgShape?.gradient) expect.gradient = expectation(svgShape.gradient.stops, svgShape.gradient.stops, 'svg', { judge: 'visual', type: svgShape.gradient.type });
  if (fill) expect.fill = expectation(fill.value, fill.value, fill.source, expect.gradient ? { judge: 'visual', note: 'under a gradient' } : {});
  else if (svgShape?.fill) expect.fill = expectation(svgShape.fill, svgShape.fill, 'svg');
  else if (record) expect.fill = expectation('none', null, record.source, { rule: 'no background in the source' });
  else if (element.kind !== 'icon') expect.fill = unknown();
  const radius = pick(element, 'borderRadius');
  if (radius) expect.radius = expectation(radiusValue(radius.value, element.figma, scale), radius.value, radius.source);
  else if (svgShape?.rx !== null && svgShape?.rx !== undefined) expect.radius = expectation(radiusValue(svgShape.rx, element.figma, scale), svgShape.rx, 'svg');
  else if (element.node.tag === 'ellipse') expect.radius = expectation('pill', null, 'metadata', { rule: 'ellipse' });
  const shadow = pick(element, 'shadow');
  if (shadow) expect.shadow = expectation(shadowValue(shadow.value, scale), shadow.value, shadow.source, { judge: 'visual' });
  else if (svgShape?.filter?.kind === 'shadow') expect.shadow = expectation(shadowValue(svgShape.filter.shadow, scale), svgShape.filter.shadow, 'svg', { judge: 'visual' });
  const blur = pick(element, 'filterBlur');
  if (blur) expect.blur = expectation(Math.round(blur.value * scale.factor), blur.value, blur.source, { judge: 'visual' });
  else if (svgShape?.filter?.kind === 'blur') expect.blur = expectation(Math.round(svgShape.filter.blur * scale.factor), svgShape.filter.blur, 'svg', { judge: 'visual' });
  const backdrop = pick(element, 'backdropBlur');
  if (backdrop) expect.backdropBlur = expectation(Math.round(backdrop.value * scale.factor), backdrop.value, backdrop.source, { judge: 'visual' });
  const opacity = pick(element, 'opacity');
  if (opacity && opacity.value !== 1) expect.opacity = expectation(opacity.value, opacity.value, opacity.source, { judge: 'visual' });
  const border = pick(element, 'border');
  if (border) expect.border = expectation({ width: Math.max(1, Math.round((border.value.width ?? 1) * scale.factor)), color: border.value.color ?? null }, border.value, border.source);
  else if (svgShape?.stroke && svgShape.strokeWidth) expect.border = expectation({ width: Math.max(1, Math.round(svgShape.strokeWidth * scale.factor)), color: svgShape.stroke }, { width: svgShape.strokeWidth, color: svgShape.stroke }, 'svg');
  return expect;
}

export function styleExpectations(element, options) {
  if (element.kind === 'text') return textStyleExpectations(element, options);
  if (element.kind === 'image') { const expect = boxStyleExpectations(element, options); delete expect.fill; expect.image ??= { value: true, figma: true, source: 'metadata', rule: 'image by name', judge: 'visual' }; return expect; }
  return boxStyleExpectations(element, options);
}

// Cap trimming: a CSS export says it outright; otherwise the text heights tell, against known line heights
// when fonts are known and against a 13pt threshold (the tallest single trimmed line of a 16pt body font) when not.
export function detectCapTrim(elements, cssRecords, mode) {
  if (mode === 'on' || mode === 'off') return { value: mode === 'on', evidence: 'flag' };
  const trimmed = cssRecords.find((record) => record.props.leadingTrim);
  if (trimmed) return { value: true, evidence: `${trimmed.source} leading-trim` };
  const texts = elements.filter((element) => element.kind === 'text' && element.figma.h > 0);
  const withFont = texts.filter((element) => element.font?.lineHeightFigma);
  if (withFont.length >= 3) {
    const ratios = withFont.map((element) => element.figma.h / element.font.lineHeightFigma).sort((a, b) => a - b);
    const median = ratios[Math.floor(ratios.length / 2)];
    return { value: median < 0.85, evidence: `median text height / line height ${median.toFixed(2)}` };
  }
  if (texts.length >= 3) {
    const heights = texts.map((element) => element.figma.h).sort((a, b) => a - b);
    const median = heights[Math.floor(heights.length / 2)];
    return { value: median <= 13, evidence: `median text height ${median}pt, no font sizes to compare with` };
  }
  return { value: true, evidence: 'default: too few text nodes to tell' };
}
