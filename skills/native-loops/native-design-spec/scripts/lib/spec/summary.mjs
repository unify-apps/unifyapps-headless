// The one-screen summary printed after a spec is written, so `unknown` is visible before a visual check.
const FONT_PROPS = ['fontSize', 'lineHeight', 'fontWeight', 'color'];

export function summarize(spec) {
  const kinds = {};
  const sources = {};
  let unknownFonts = 0;
  let visual = 0;
  for (const element of spec.elements) {
    kinds[element.kind] = (kinds[element.kind] ?? 0) + 1;
    for (const [prop, expectation] of Object.entries(element.expect)) {
      sources[expectation.source] = (sources[expectation.source] ?? 0) + 1;
      if (expectation.judge === 'visual') visual++;
      if (expectation.source === 'unknown' && FONT_PROPS.includes(prop) && element.kind === 'text') unknownFonts++;
    }
  }
  return { regions: spec.regions.length, elements: spec.elements.length, kinds, sources, unknownFonts, visual, positions: spec.sources.positions, statusBand: spec.figma.statusBand, factor: spec.scale.factor };
}

export function formatSummary(summary) {
  const kinds = Object.entries(summary.kinds).map(([kind, count]) => `${count} ${kind}`).join(', ');
  const sources = Object.entries(summary.sources).sort((a, b) => b[1] - a[1]).map(([source, count]) => `${source} ${count}`).join(' · ');
  return [
    `regions ${summary.regions} · elements ${summary.elements} (${kinds})`,
    `properties by source: ${sources}`,
    `unknown font properties on text: ${summary.unknownFonts} · visual-judge rows: ${summary.visual}`,
    `positions ${summary.positions} · status band ${summary.statusBand}pt · factor ${summary.factor.toFixed(4)}`,
  ];
}

export function regionMap(spec) {
  const map = {};
  for (const region of spec.regions) map[region.key] = { figmaNodeId: region.figmaNodeId, blockIds: [] };
  return map;
}
