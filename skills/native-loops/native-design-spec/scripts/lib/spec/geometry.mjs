// Geometry expectations from the metadata boxes: sizes, gaps to the previous sibling, insets and line counts.
import { scaleSize, scaleSpacing, scaleTextGap, neighbourCorrection } from '../scale.mjs';

const STRETCH_INSET = 48;

const textNeighbourOf = (element) => (element && element.kind === 'text' && element.font ? { kind: 'text', fontSizeApp: element.font.fontSizeApp, lineHeightApp: element.font.lineHeightApp, figmaTextHeight: element.figma.h } : element ? { kind: element.kind } : null);
// A source whose text boxes are already full line boxes (an HTML prototype, a marked screenshot) has no cap
// trim to undo: every neighbour keeps its box edge.
const boxNeighbourOf = (element) => (element ? { kind: element.kind === 'text' ? 'text-box' : element.kind } : null);

const spacing = (figma, scale, extra = {}) => ({ value: scaleSpacing(figma, scale), figma, source: 'metadata', ...extra });

// A vertical distance next to a text node loses that node's cap correction before rounding.
function verticalSpacing(figma, neighbourA, neighbourB, scale, extra = {}) {
  const a = neighbourCorrection(neighbourA, scale);
  const b = neighbourCorrection(neighbourB, scale);
  const out = { value: scaleTextGap(figma, neighbourA, neighbourB, scale), figma, source: 'metadata', ...extra };
  if (a || b) out.correction = { a: a || 0, b: b || 0, capTrim: true };
  return out;
}

function widthExpectation(element, parent, scale, deviceWidth, frameWidth) {
  const { w } = element.figma;
  if (element.kind === 'text') return { value: Math.round(w * scale.factor), figma: w, source: 'metadata', rule: 'text-width', tolKey: 'textWidth' };
  if (w >= frameWidth - 0.5) return { value: deviceWidth, figma: w, source: 'metadata', rule: 'full-width' };
  if (parent) {
    const insetLeft = element.figma.x - parent.figma.x;
    const insetRight = parent.figma.x + parent.figma.w - (element.figma.x + element.figma.w);
    if (insetLeft <= STRETCH_INSET && insetRight <= STRETCH_INSET && w >= 0.6 * parent.figma.w && parent.app?.w) {
      return { value: parent.app.w - scaleSpacing(insetLeft, scale) - scaleSpacing(insetRight, scale), figma: w, source: 'metadata', rule: 'parent-minus-insets' };
    }
  }
  return { value: scaleSize(w, scale), figma: w, source: 'metadata', rule: 'size' };
}

function linesExpectation(element, capTrim) {
  const { h } = element.figma;
  const font = element.font;
  if (!font) return { value: null, figma: h, source: 'unknown' };
  const cap = 0.7 * font.fontSizeFigma;
  const lines = capTrim ? Math.max(1, 1 + Math.round((h - cap) / font.lineHeightFigma)) : Math.max(1, Math.round(h / font.lineHeightFigma));
  return { value: lines, figma: h, source: font.source, rule: capTrim ? '1 + (h - cap) / lineHeight' : 'h / lineHeight' };
}

export function geometryExpectations(elements, { scale, deviceWidth, frameWidth, safeAreaTop, statusBand, capTrim, capTrimGaps = true }) {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const neighbourOf = capTrimGaps ? textNeighbourOf : boxNeighbourOf;
  const toApp = (value) => Math.round(value * scale.factor);
  for (const element of elements) {
    const parent = element.parent ? byId.get(element.parent) : null;
    const prev = element.prevSibling ? byId.get(element.prevSibling) : null;
    const expect = element.expect;
    const self = neighbourOf(element);
    const { x, y, w, h } = element.figma;
    expect.w = widthExpectation(element, parent, scale, deviceWidth, frameWidth);
    if (element.kind === 'text') {
      expect.lines = linesExpectation(element, capTrim);
      expect.h = element.font && expect.lines.value ? { value: expect.lines.value * element.font.lineHeightApp, figma: h, source: element.font.source, rule: 'lines x lineHeight' } : { value: null, figma: h, source: 'unknown' };
    } else {
      expect.h = { value: scaleSize(h, scale), figma: h, source: 'metadata', rule: 'size' };
    }
    if (parent) {
      const insetLeft = x - parent.figma.x, insetRight = parent.figma.x + parent.figma.w - (x + w);
      const insetTop = y - parent.figma.y, insetBottom = parent.figma.y + parent.figma.h - (y + h);
      const siblings = elements.filter((candidate) => candidate.parent === parent.id);
      const first = siblings[0] === element, last = siblings[siblings.length - 1] === element;
      // Across the flow, a stretched child has two real paddings; anything else sits on one edge and the
      // other inset only repeats its width or height, so only the nearer edge is an expectation.
      const stretchedX = expect.w.rule === 'parent-minus-insets' || expect.w.rule === 'full-width';
      const stretchedY = h >= parent.figma.h - 1;
      if (element.flow === 'column') {
        if (prev) expect.gapTop = verticalSpacing(y - (prev.figma.y + prev.figma.h), neighbourOf(prev), self, scale, { neighbour: prev.id, ...(y < prev.figma.y + prev.figma.h - 0.5 ? { rule: 'overlap' } : {}) });
        if (first) expect.insetTop = verticalSpacing(insetTop, null, self, scale);
        if (last) expect.insetBottom = verticalSpacing(insetBottom, self, null, scale);
        if (!element.centered.x) {
          if (stretchedX || insetLeft <= insetRight) expect.insetLeft = spacing(insetLeft, scale);
          if (stretchedX || insetRight < insetLeft) expect.insetRight = spacing(insetRight, scale);
        }
      } else if (element.flow === 'row') {
        if (prev) expect.gapLeft = spacing(x - (prev.figma.x + prev.figma.w), scale, { neighbour: prev.id, ...(x < prev.figma.x + prev.figma.w - 0.5 ? { rule: 'overlap' } : {}) });
        if (first) expect.insetLeft = spacing(insetLeft, scale);
        if (last) expect.insetRight = spacing(insetRight, scale);
        if (!element.centered.y) {
          if (stretchedY || insetTop <= insetBottom) expect.insetTop = verticalSpacing(insetTop, null, self, scale);
          if (stretchedY || insetBottom < insetTop) expect.insetBottom = verticalSpacing(insetBottom, self, null, scale);
        }
      } else {
        expect.insetTop = verticalSpacing(insetTop, null, self, scale);
        expect.insetLeft = spacing(insetLeft, scale);
      }
    }
    element.app = { x: toApp(x), y: safeAreaTop + toApp(y - statusBand), w: expect.w.value ?? toApp(w), h: expect.h.value ?? toApp(h) };
  }
  return elements;
}
