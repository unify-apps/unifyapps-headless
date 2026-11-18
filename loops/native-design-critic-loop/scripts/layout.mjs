#!/usr/bin/env node
// Usage: node layout.mjs <describe.txt> --screen <W>x<H> [--platform ios|android] [--safe-top N] [--safe-bottom N]
// Converts argent describe frames (normalized 0–1) to points/dp and prints layout signals as JSON.
// Signals are leads for a critic to confirm on the screenshot, not issues on their own.
import { readFileSync } from 'node:fs';

const FRAME = /\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)\s*$/;
const INTERACTIVE_ROLE = /button|link|textfield|searchfield|edittext|checkbox|switch|toggle|slider|tab|cell|radio|spinner|picker/i;
const TEXT_ROLE = /statictext|textview|text$|heading|label/i;
const SYSTEM_LABEL = /battery|cellular|wi-?fi|signal|^\d{1,2}:\d{2}/i;

function parseArgs(argv) {
  const [file, ...flags] = argv;
  const options = { file, platform: 'ios', safeTop: undefined, safeBottom: undefined, screen: undefined };
  for (let index = 0; index < flags.length; index += 2) {
    const [flag, value] = [flags[index], flags[index + 1]];
    if (flag === '--screen') options.screen = value.split('x').map(Number);
    if (flag === '--platform') options.platform = value;
    if (flag === '--safe-top') options.safeTop = Number(value);
    if (flag === '--safe-bottom') options.safeBottom = Number(value);
  }
  if (!file || !options.screen || options.screen.length !== 2 || options.screen.some(Number.isNaN)) {
    console.error('usage: layout.mjs <describe.txt> --screen <W>x<H> [--platform ios|android]');
    process.exit(2);
  }
  options.safeTop ??= options.platform === 'ios' ? 62 : 24;
  options.safeBottom ??= options.platform === 'ios' ? 34 : 48;
  return options;
}

function parseLine(line, [screenWidth, screenHeight]) {
  const frame = line.match(FRAME);
  if (!frame) return undefined;
  const body = line.slice(0, frame.index).trim();
  const role = body.split(/\s+/)[0];
  const label = body.match(/^\S+\s+"([^"]*)"/)?.[1] ?? '';
  const value = body.match(/value="([^"]*)"/)?.[1];
  const id = body.match(/id="([^"]*)"/)?.[1];
  const [x, y, w, h] = frame.slice(1).map(Number);
  const round = (number) => Math.round(number * 10) / 10;
  return {
    role,
    label,
    value,
    id,
    interactive: INTERACTIVE_ROLE.test(role) || /tappable|clickable/i.test(body),
    isText: TEXT_ROLE.test(role),
    x: round(x * screenWidth),
    y: round(y * screenHeight),
    w: round(w * screenWidth),
    h: round(h * screenHeight),
  };
}

function nearMissEdges(elements) {
  const counts = new Map();
  for (const element of elements) {
    const edge = Math.round(element.x);
    counts.set(edge, (counts.get(edge) ?? 0) + 1);
  }
  const edges = [...counts.entries()].sort((first, second) => first[0] - second[0]);
  const misses = [];
  for (let index = 1; index < edges.length; index++) {
    const [previousEdge, previousCount] = edges[index - 1];
    const [edge, count] = edges[index];
    const distance = edge - previousEdge;
    if (distance > 0 && distance <= 6) misses.push({ edges: [previousEdge, edge], counts: [previousCount, count] });
  }
  return { misses, dominantLeftMargin: edges.filter(([edge]) => edge > 0 && edge <= 40).sort((a, b) => b[1] - a[1])[0]?.[0] };
}

function dominantRightMargin(elements, screenWidth) {
  const counts = new Map();
  for (const element of elements) {
    const margin = Math.round(screenWidth - (element.x + element.w));
    if (margin > 0 && margin <= 40) counts.set(margin, (counts.get(margin) ?? 0) + 1);
  }
  return [...counts.entries()].sort((first, second) => second[1] - first[1])[0]?.[0];
}

// Line height is roughly 1.2 × font size, so this ranks sizes rather than naming them exactly.
function typeRamp(elements) {
  const sizes = new Map();
  for (const element of elements.filter((candidate) => candidate.isText && candidate.label.trim())) {
    const lineHeight = Math.round(element.h);
    sizes.set(lineHeight, [...(sizes.get(lineHeight) ?? []), element.label]);
  }
  return [...sizes.entries()]
    .sort((first, second) => second[0] - first[0])
    .map(([lineHeight, texts]) => ({ lineHeight, approxFontSize: Math.round(lineHeight / 1.2), count: texts.length, texts: texts.slice(0, 4) }));
}

function columnGaps(elements) {
  const columns = new Map();
  for (const element of elements) {
    const key = Math.round(element.x / 2) * 2;
    columns.set(key, [...(columns.get(key) ?? []), element]);
  }
  const gaps = [];
  for (const [left, members] of columns) {
    const ordered = members.sort((first, second) => first.y - second.y);
    for (let index = 1; index < ordered.length; index++) {
      const above = ordered[index - 1];
      const gap = Math.round(ordered[index].y - (above.y + above.h));
      if (gap >= 0 && gap <= 48) gaps.push({ left, gap, between: [above.label || above.role, ordered[index].label || ordered[index].role] });
    }
  }
  const distinct = [...new Set(gaps.map((entry) => entry.gap))].sort((first, second) => first - second);
  const unevenPairs = distinct.filter((gap, index) => index > 0 && gap - distinct[index - 1] <= 4 && gap - distinct[index - 1] > 0);
  return { gaps, distinctGaps: distinct, nearEqualGaps: unevenPairs.map((gap) => [distinct[distinct.indexOf(gap) - 1], gap]) };
}

const options = parseArgs(process.argv.slice(2));
const [screenWidth, screenHeight] = options.screen;
const elements = readFileSync(options.file, 'utf8')
  .split('\n')
  .map((line) => parseLine(line, options.screen))
  .filter((element) => element && !(element.x === 0 && element.y === 0 && element.w === screenWidth))
  .filter((element) => !SYSTEM_LABEL.test(element.label) && element.y + element.h > options.safeTop - 10);

const minTarget = options.platform === 'ios' ? 44 : 48;
const content = elements.filter((element) => element.w < screenWidth * 0.98);
const result = {
  screen: { width: screenWidth, height: screenHeight, unit: options.platform === 'ios' ? 'pt' : 'dp' },
  elementCount: elements.length,
  smallTargets: elements
    .filter((element) => element.interactive && Math.min(element.w, element.h) < minTarget)
    .map(({ role, label, id, w, h, x, y }) => ({ role, label, id, w, h, x, y, minimum: minTarget })),
  unlabeledControls: elements
    .filter((element) => (element.interactive || /image/i.test(element.role)) && !element.label && !element.value)
    .map(({ role, id, x, y, w, h }) => ({ role, id, x, y, w, h })),
  unsafeEdges: elements
    .filter((element) => element.x < 0 || element.x + element.w > screenWidth || element.y + element.h > screenHeight - options.safeBottom)
    .map(({ role, label, x, y, w, h }) => ({ role, label, x, y, w, h })),
  ...nearMissEdges(content),
  dominantRightMargin: dominantRightMargin(content, screenWidth),
  typeRamp: typeRamp(content),
  rhythm: columnGaps(content.filter((element) => element.isText || element.interactive)),
  elements,
};
console.log(JSON.stringify(result, null, 2));
