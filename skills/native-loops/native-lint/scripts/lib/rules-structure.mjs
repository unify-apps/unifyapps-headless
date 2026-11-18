// Structure rules decided from the outline tree and the stored blocks: H2 scroll nesting,
// H4 press feedback, H5 skeleton shape, H13 tab-page spacer, H14 canvas widths.
import { makeFinding, fixedPoints, customStylesOf } from './rules.mjs';

const typeOf = (block) => block?.component?.componentType ?? null;

// The values that turn a Stack into a ScrollView on native (page-audit walk.mjs stackScrollAxis).
function stackScrolls(block) {
  const overflow = block?.component?.appearance?.styles?.overflow ?? {};
  return ['overflow-y-scroll', 'overflow-y-auto'].includes(overflow.y) || ['overflow-scroll', 'overflow-auto'].includes(overflow.all);
}

function h2(context) {
  const findings = [];
  for (const node of context.nodes.filter((item) => item.componentType === 'Repeatable')) {
    const block = context.byId.get(node.id);
    if (!block) continue;
    const content = block.component?.content ?? {};
    const appearance = block.component?.appearance ?? {};
    // A horizontal strip inside a vertical page is the carousel pattern, not this rule.
    const vertical = appearance.layout === 'grid' || appearance.direction !== 'horizontal';
    if (content.scrollable === false || !vertical) continue;
    const host = context.ancestors(node.id).find((ancestor) => ancestor.componentType === 'Scrollable' || (ancestor.componentType === 'Stack' && stackScrolls(context.byId.get(ancestor.id))));
    if (!host) continue;
    findings.push(makeFinding('H2', 'blocking', block, 'component.content.scrollable',
      `Repeatable ${block.displayName ?? node.id} scrolls inside ${host.componentType} ${host.displayName ?? host.id} [${host.id}], so every row mounts at once`,
      'make the list the scroll owner: content.scrollable true and a flex-1 bound, and remove the scrolling parent'));
  }
  return findings;
}

function h4(context) {
  return context.blocks.filter((block) => ['Pressable', 'Card'].includes(typeOf(block)) && !block.component?.appearance?.interactions)
    .map((block) => makeFinding('H4', 'advisory', block, 'component.appearance.interactions',
      `${typeOf(block)} ${block.displayName ?? block.id} has no press feedback`,
      'white cards highlight #EFF0F2; coloured pills, photo cards and icon tiles opacity 0.6; scale off; androidRipple false'));
}

const LEAF_CONTENT = new Set(['Typography', 'Image', 'Icon', 'Button', 'IconButton']);
const visibilityText = (block) => JSON.stringify(block?.visibility ?? '');

// A skeleton is a container shown while a source loads; its stand-in is the sibling shown with the data.
function h5(context) {
  const findings = [];
  const loaderCount = (id) => context.descendants(id).filter((node) => node.componentType === 'Loader').length;
  for (const node of context.nodes) {
    const block = context.byId.get(node.id);
    if (!block || !/isLoading/u.test(visibilityText(block)) || !loaderCount(node.id)) continue;
    const siblings = (context.children.get(node.parentId ?? null) ?? []).filter((sibling) => sibling.id !== node.id && !loaderCount(sibling.id));
    const content = siblings.find((sibling) => /isLoading|\['data'\]/u.test(visibilityText(context.byId.get(sibling.id)))) ?? siblings[0];
    if (!content) continue;
    const loaders = loaderCount(node.id);
    const leaves = context.descendants(content.id).filter((item) => LEAF_CONTENT.has(item.componentType)).length;
    if (!leaves || Math.abs(loaders - leaves) <= Math.max(2, Math.round(leaves / 2))) continue;
    findings.push(makeFinding('H5', 'advisory', block, 'component.content.blockIds',
      `skeleton ${block.displayName ?? node.id} draws ${loaders} loaders for ${leaves} content leaves in ${content.displayName ?? content.id} [${content.id}]`,
      'reshape the skeleton to the layout of the content it stands in for'));
  }
  return findings;
}

function h13(context) {
  const tabs = context.set.nav ? (context.set.nav.primary ?? []).filter((item) => item.type === 'PAGE' && item.pageId).map((item) => item.pageId) : null;
  if (!tabs) { context.unverified('H13', 'cache nav not read, so whether this is a tab page is unknown'); return []; }
  if (!tabs.includes(context.pageId)) return [];
  // The trailing block of the body: follow the last child down from the body root.
  let node = context.nodes.find((item) => item.id === 'root_id') ?? context.nodes.find((item) => item.level === 0);
  while (node && (context.children.get(node.id) ?? []).length) node = (context.children.get(node.id) ?? []).at(-1);
  const block = node ? context.byId.get(node.id) : null;
  if (!block || typeOf(block) !== 'Stack') return [];
  const height = fixedPoints(block, 'height');
  const styles = block.component?.appearance?.styles ?? {};
  if (height === null || height < 40 || styles.backgroundImage) return [];
  return [makeFinding('H13', 'blocking', block, 'component.appearance.styles.height',
    `tab page ends in an empty Stack ${block.displayName ?? block.id} of ${height}pt, a spacer for the bottom bar`,
    'remove it; the bar floats, and the last sheet keeps bottom padding of BOTTOM_BAR_HEIGHT + safe area + gap')];
}

function h14(context) {
  const findings = [];
  for (const block of context.blocks) {
    if (['root_id', 'header_id', 'footer_id'].includes(block.id)) continue;
    const width = fixedPoints(block, 'width');
    if (width === null || width < 380) continue;
    const path = typeof customStylesOf(block).width === 'number' && !/px$/u.test(String(block.component?.appearance?.styles?.width?.custom ?? '')) ? 'additional.customCSS.width' : 'component.appearance.styles.width';
    findings.push(makeFinding('H14', 'advisory', block, path, `${typeOf(block)} ${block.displayName ?? block.id} has a fixed width of ${width}pt; a 402pt phone shows 370pt of content`, 'use w-full, flex or a percentage; rows share width'));
  }
  return findings;
}

export const STRUCTURE_RULES = [
  { id: 'H2', title: 'No Repeatable inside a Scrollable; the list owns the scroll', severity: 'blocking', uaRule: 'P1', run: h2 },
  { id: 'H4', title: 'Press feedback by surface', severity: 'advisory', uaRule: 'U1', run: h4 },
  { id: 'H5', title: 'A skeleton matches the layout it stands in for', severity: 'advisory', uaRule: null, run: h5 },
  { id: 'H13', title: 'A bottom-tab page has no spacer block for the bar', severity: 'blocking', uaRule: null, run: h13 },
  { id: 'H14', title: 'Widths copied from the 440pt canvas overflow a 402pt phone', severity: 'advisory', uaRule: null, run: h14 },
];
