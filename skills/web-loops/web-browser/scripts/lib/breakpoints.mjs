// The widths a WEB page is checked at, and how the preview is put at one of them.
//
// The desktop sizes are the platform's own device sizes (DEVICE_SIZES in scripts/lib/page-jobs.mjs,
// the "Switch variant" menu's Desktop tab), which browser.mjs `page-shot <width>` picks. 375 is not
// one of them: page-shot refuses it, and resizing the window alone keeps the 1440 px laptop frame.
// The preview reaches 375 only through its phone tab: open the "Switch variant" menu, pick the
// phone tab, pick "Iphone X (375 x 812)". The phone tab is the one labelled Mobile or, when the
// menu's tabs are icons with no name, the tab whose list holds Iphone X. The app frame is then 375 px
// wide inside a phone frame, which needs a window at least 428 px wide, so the window goes to
// 460 x 900 afterwards.
import { DEVICE_SIZES } from '../../../../../scripts/lib/page-jobs.mjs';
import { command, evalIn, pageShot, snapshot } from './driver.mjs';
import { waitForWidth } from './collectors.mjs';
import { parseSnapshot, shownText } from './snapshot.mjs';

export { DEVICE_SIZES };

/** XL ≥ 1440 · LG ≥ 1280 · MD ≥ 768 · SM below. */
export function classOf(width) {
  if (width >= 1440) return 'XL';
  if (width >= 1280) return 'LG';
  if (width >= 768) return 'MD';
  return 'SM';
}

/** The one phone size the checks use: the phone tab's "Iphone X (375 x 812)". */
export const PHONE = Object.freeze({ width: 375, height: 812, tab: 'mobile', label: 'Iphone X' });

/** The window the phone frame needs: the frame sits inside a bezel, so a window under 428 px cuts its right edge. */
export const PHONE_WINDOW = Object.freeze({ width: 460, height: 900 });

/** Widths every WEB check runs at by default: the laptop size every WEB preview has, and the phone. */
export const DEFAULT_WIDTHS = Object.freeze([1440, PHONE.width]);

/** Every width the preview offers: the Desktop tab's sizes, then the phone. */
export const OFFERED_WIDTHS = Object.freeze([...DEVICE_SIZES.map((size) => size.width), PHONE.width]);

/** How a width is reached: `page-shot` for a platform device size, the phone tab for 375, `none` for any other. */
export function planFor(width) {
  const device = DEVICE_SIZES.find((size) => size.width === width);
  if (device) return { width, height: device.height, label: device.label, class: classOf(width), via: 'page-shot' };
  if (width === PHONE.width) return { width, height: PHONE.height, label: PHONE.label, class: classOf(width), via: 'variant-menu', tab: PHONE.tab };
  return { width, height: null, label: null, class: classOf(width), via: 'none' };
}

/** `"1440,375"` → [1440, 375]; `all` → one width of each class: 1440, 1366 and 375. */
export function parseWidths(text, fallback = DEFAULT_WIDTHS) {
  if (!text) return [...fallback];
  if (text === 'all') return [1440, 1366, PHONE.width];
  const widths = String(text).split(',').map((part) => Number(part.trim())).filter((width) => Number.isInteger(width) && width > 0);
  if (!widths.length) throw new Error(`--widths takes numbers like 1440,375, or all; got ${text}`);
  return widths;
}

const MENU_BUTTON = /^switch variant$/iu;
const TAB_NAME = new RegExp(`^${PHONE.tab}$`, 'iu');
const ITEM_NAME = new RegExp(`^${PHONE.label}\\s*\\(\\s*${PHONE.width}\\s*[x×]\\s*${PHONE.height}\\s*\\)$`, 'iu');
const SIZE_ITEM = /\(\s*\d+\s*[x×]\s*\d+\s*\)/u;

const labelsOf = (nodes, node) => [node.name, node.text, shownText(nodes, node)].map((label) => (label ?? '').replace(/\s+/gu, ' ').trim()).filter(Boolean);

const ownLabels = (node) => [node.name, node.text].map((label) => (label ?? '').replace(/\s+/gu, ' ').trim()).filter(Boolean);

/** The nodes under `root`, in document order (a parent always comes before its children). */
function under(nodes, root) {
  const inside = new Set([root.i]);
  const found = [];
  for (const node of nodes) {
    if (node.parent === null || !inside.has(node.parent)) continue;
    inside.add(node.i);
    found.push(node);
  }
  return found;
}

/**
 * The ref of the first of `candidates` that a test accepts (the first test that finds one wins), else
 * of the nearest ancestor that has one and passes the same test, so a bare label inside a control
 * clicks the control and never a container around other controls. Never goes up to `root`.
 */
function refWhere(nodes, candidates, root, ...tests) {
  for (const test of tests) {
    const hit = candidates.find((node) => test(node));
    for (let node = hit; node && node !== root && test(node); node = node.parent === null ? null : nodes[node.parent]) if (node.ref) return node.ref;
  }
  return null;
}

/** A fresh snapshot of the page, parsed: the menu's items only get refs once the menu is open. */
function look(folder, { env } = {}) {
  return parseSnapshot(snapshot(folder, 'variant-menu.yml', { env }));
}

/** The open menu: the snapshot's `tooltip` node (the preview draws it with role=tooltip) and what is under it. */
function menuOf(nodes) {
  const tooltip = nodes.find((node) => node.role === 'tooltip');
  return { tooltip, inside: tooltip ? under(nodes, tooltip) : [] };
}

/** The menu's tabs: every tab or button under the tooltip that has a ref, in document order. */
const tabsOf = (inside) => inside.filter((node) => ['tab', 'button'].includes(node.role) && node.ref);

/** The size items the open menu lists ("Laptop (1366 x 709)", …), each once. */
const sizeItems = (inside) => [...new Set(inside.flatMap((node) => [node.name, node.text].filter((label) => label && SIZE_ITEM.test(label))))];

/** The ref of "Iphone X (375 x 812)" under the tooltip, or null. */
const itemRef = (nodes, { tooltip, inside }) => (tooltip ? refWhere(nodes, inside, tooltip, (node) => labelsOf(nodes, node).some((label) => ITEM_NAME.test(label))) : null);

/**
 * When no tab is labelled Mobile (the live menu's tabs are icons with no name), each tab under the
 * tooltip is clicked in document order, with a fresh snapshot after each, until one lists Iphone X.
 * The next tab is found by its place in the latest snapshot, so a ref that changes after a click is
 * never stale. Answers { nodes, menu } of the phone tab's snapshot, or { tried } with what each listed.
 */
function findPhoneTab(folder, opened, { env } = {}) {
  const tried = [];
  let before = opened;
  for (let index = 0; ; index += 1) {
    const tab = tabsOf(menuOf(before).inside)[index];
    if (!tab) return { tried };
    command(folder, ['click', tab.ref], { env });
    const nodes = look(folder, { env });
    const menu = menuOf(nodes);
    if (itemRef(nodes, menu)) return { nodes, menu };
    tried.push({ tab: index + 1, label: labelsOf(before, tab)[0] ?? null, items: sizeItems(menu.inside) });
    before = nodes;
  }
}

/**
 * Picks "Iphone X (375 x 812)" in the preview's "Switch variant" menu: snapshot, click the menu
 * button, snapshot, click the phone tab, snapshot, click the item. The phone tab is the tab labelled
 * Mobile; when none is, each tab in turn until one lists the item. The tab and the item are looked
 * for under the menu's tooltip only, so a control of the page that is also called "Mobile" is never
 * clicked. Answers { ok: true, item } or { ok: false, why: 'no-menu' | 'no-tab' | 'no-item', items,
 * tabs, tried } with what the menu showed (`tried`: what each tab listed when none was labelled
 * Mobile); after a refusal nothing more is clicked.
 */
export function pickPhone(folder, { env } = {}) {
  let nodes = look(folder, { env });
  const menu = refWhere(nodes, nodes, null, (node) => node.role === 'button' && MENU_BUTTON.test(node.name ?? ''), (node) => MENU_BUTTON.test(node.name ?? ''));
  if (!menu) return { ok: false, why: 'no-menu', items: [], tabs: [] };
  command(folder, ['click', menu], { env });

  nodes = look(folder, { env });
  let opened = menuOf(nodes);
  const tab = opened.tooltip && refWhere(nodes, opened.inside, opened.tooltip,
    (node) => ['tab', 'button'].includes(node.role) && labelsOf(nodes, node).some((label) => TAB_NAME.test(label)),
    (node) => ownLabels(node).some((label) => TAB_NAME.test(label)));
  if (tab) {
    command(folder, ['click', tab], { env });
    nodes = look(folder, { env });
    opened = menuOf(nodes);
  } else {
    const tabs = opened.tooltip ? tabsOf(opened.inside) : [];
    const labels = tabs.flatMap((node) => labelsOf(nodes, node).slice(0, 1));
    if (!tabs.length) return { ok: false, why: 'no-tab', items: [], tabs: labels };
    const found = findPhoneTab(folder, nodes, { env });
    if (!found.nodes) return { ok: false, why: 'no-tab', items: [], tabs: labels, tried: found.tried };
    ({ nodes, menu: opened } = found);
  }

  const item = itemRef(nodes, opened);
  if (!item) return { ok: false, why: 'no-item', items: sizeItems(opened.inside), tabs: [PHONE.tab] };
  command(folder, ['click', item], { env });
  return { ok: true, item: `${PHONE.label} (${PHONE.width} x ${PHONE.height})` };
}

/** Why a width could not be set, in a sentence a person can act on. */
export function describeFailure(set) {
  const shows = (list) => (list?.length ? ` (it shows ${list.join(', ')})` : '');
  switch (set.why) {
    case 'not-offered': return `the preview does not offer ${set.width}px (it offers ${set.items.join(', ')})`;
    case 'no-menu': return 'the preview has no "Switch variant" menu';
    case 'no-tab': return set.tried?.length
      ? `the "Switch variant" menu has no Mobile tab and no tab lists "${PHONE.label} (${PHONE.width} x ${PHONE.height})" (${set.tried.map((tab) => `tab ${tab.tab}${tab.label ? ` "${tab.label}"` : ''} lists ${tab.items.length ? tab.items.join(', ') : 'no size'}`).join('; ')})`
      : `the "Switch variant" menu has no Mobile tab${shows(set.tabs)}`;
    case 'no-item': return `the Mobile tab has no "${PHONE.label} (${PHONE.width} x ${PHONE.height})" item${shows(set.items)}`;
    case 'frame-width': return `the app frame is ${set.frameWidth ?? '?'}px wide after picking ${set.item}, not ${set.width}px`;
    default: return set.why ?? 'unknown';
  }
}

/**
 * Puts the open preview at `width`. Answers { ok, width, height, via, shot?, why?, items?, message? }.
 * A device size goes through page-shot, which also saves `page-<width>.png` in the browser folder
 * and makes the window as tall as the page. 375 picks the phone in the variant menu, widens the
 * window to 460 x 900 and checks the app frame took the width; it saves no shot, so a check that
 * needs one takes `screenshot`. Any other width is not offered and is never guessed. A width that
 * cannot be set answers `ok: false` with `why` (a code) and `message` (a sentence).
 */
export function setWidth(folder, width, { env } = {}) {
  const plan = planFor(width);
  if (plan.via === 'page-shot') {
    const shot = pageShot(folder, width, { env });
    return { ok: true, ...plan, shot: shot.file ?? null, pageHeight: shot.height ?? null, variantMenu: shot.variantMenu ?? null };
  }
  const failed = (fields) => ({ ok: false, ...plan, items: [], tabs: [], ...fields, message: describeFailure({ ...plan, items: [], tabs: [], ...fields }) });
  if (plan.via === 'none') return failed({ why: 'not-offered', items: OFFERED_WIDTHS.map(String) });
  const picked = pickPhone(folder, { env });
  if (!picked.ok) return failed({ why: picked.why, items: picked.items, tabs: picked.tabs, ...(picked.tried ? { tried: picked.tried } : {}) });
  command(folder, ['resize', PHONE_WINDOW.width, PHONE_WINDOW.height], { env });
  const laid = evalIn(folder, waitForWidth, { width }, { env });
  const set = { ...plan, item: picked.item, window: { ...PHONE_WINDOW }, frameWidth: laid?.frameWidth ?? null };
  if (laid?.ok) return { ok: true, ...set, why: null };
  return { ok: false, ...set, why: 'frame-width', items: [], tabs: [], message: describeFailure({ ...set, why: 'frame-width' }) };
}
