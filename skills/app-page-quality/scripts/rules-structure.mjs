/**
 * The structure findings the audit decides purely from `walkPage`'s output:
 * U2/P1 (one scroll owner per axis), U3 (safe areas), U4 (keyboard-aware
 * ancestor), U5 (colour tokens), U6 (4pt grid), U7 (tap target), U9 (overlays
 * first), U10 (sheet clip), P5 (structural cruft), P8 (row size), P9 (list
 * visibility), P12 (endless paging), P13 (page-mode paging), X8 (custom styles
 * that parse). See references/rulebook.md for the prose each of these mirrors.
 */

import { keyboardBlockers, normalizeEvents, sizePoints, stackKeyboardView, stackScrollSource } from './walk.mjs';

// Exported so rules-data.mjs (Task 3) builds the same seven-field Finding shape without a duplicate.
export const makeFinding = (rule, severity, block, path, detail, fix) => ({ rule, severity, blockId: block.id, blockName: block.name, path, detail, fix });

/**
 * `runRules(rules, ctx) → Finding[]` runs each `[rule, run]` pair. With an `errors` list on
 * `ctx` (page-audit.mjs gives one), a rule that throws adds `{ rule, message }` to it and the
 * other rules still run, so one malformed block never hides the rest of the page; without one,
 * the throw passes through to the caller.
 */
export function runRules(rules, ctx) {
  const findings = [];
  for (const [rule, run] of rules) {
    if (!Array.isArray(ctx?.errors)) {
      findings.push(...run());
      continue;
    }
    try {
      findings.push(...run());
    } catch (error) {
      ctx.errors.push({ rule, message: error?.message ?? String(error) });
    }
  }
  return findings;
}

// Blocks that draw over the page and take no layout space in the body.
const OVERLAY_TYPES = new Set(['BottomSheet', 'Drawer', 'Modal']);

// The phone's BottomSheet reads `behaviour.scrollableBody ?? customStyles.shouldWrapContentInScrollView`,
// and scrolls its body when both are absent.
const sheetBodyScrolls = sheet => Boolean(sheet.appearance?.behaviour?.scrollableBody ?? sheet.customStyles?.shouldWrapContentInScrollView ?? true);

// The same test the platform's own mobile page rules run: the axis `parent` scrolls `childId`
// on. Most scrollers scroll every child their own way; three choose by child:
// - a Tabs block whose header slot is set, even to an empty entry, wraps every pane, and the
//   footer it draws inside each pane, in a vertical scroll view; the header and dividers sit
//   outside it (the collapsing tabs layout);
// - a BottomSheet scrolls its body slot while its body scrolls, never its header or footer;
// - a horizontal list draws its header slot above the row, outside its scroll.
function scrollAxisAround(parent, childId) {
  if (parent.type === 'Tabs') {
    if (!parent.slots?.header) return null;
    const items = Array.isArray(parent.content?.items) ? parent.content.items : [];
    const isPane = items.some(item => item?.blockId === childId);
    return isPane || parent.slots.footer?.blockId === childId ? 'vertical' : null;
  }
  if (parent.type === 'BottomSheet') return parent.slots?.body?.blockId === childId && sheetBodyScrolls(parent) ? 'vertical' : null;
  if (parent.type === 'Repeatable' && parent.scrollAxis === 'horizontal' && parent.slots?.header?.blockId === childId) return null;
  return parent.scrollAxis;
}

// As the platform's own mobile page rules do: walk the block's own stored
// parentId chain (BlockFacts.parentId — see walk.mjs) up to the nearest ancestor
// that scrolls it on the same axis. This is deliberately NOT walk.mjs's own depth-first
// `ancestors` chain: a stored page's parentId is what the platform treats as the
// tree, and it can disagree with the live blockIds nesting. walkPage's own cycle
// check only watches the child-reference recursion it walks, never this field, so
// a stored parentId loop would hang here without its own `seen` guard.
function nearestSameAxisScroller(block, walk, axis) {
  const seen = new Set([block.id]);
  let child = block;
  let parentId = block.parentId;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = walk.facts.get(parentId);
    if (!parent) return null;
    if (scrollAxisAround(parent, child.id) === axis) return parent;
    child = parent;
    parentId = parent.parentId;
  }
  return null;
}

// Where the inner scroller sits, in words: a Tabs pane and a sheet body scroll for a reason the
// person has to see to fix it.
function scrollerPlace(outer) {
  if (outer.type === 'Tabs') return `a pane of '${outer.id}' (Tabs), whose header slot makes every pane its own vertical scroll view`;
  if (outer.type === 'BottomSheet') return `the body of '${outer.id}' (BottomSheet), which scrolls vertically`;
  return `'${outer.id}' (${outer.type ?? 'block'}), which scrolls the same way`;
}

function nestedListFinding(list, outer) {
  if (outer.type === 'Tabs') {
    return makeFinding('P1', 'blocking', list, 'component.content.scrollable',
      `'${list.id}' (Repeatable) scrolls inside ${scrollerPlace(outer)}, so either the list is not virtualised (every row mounts at once) or it scrolls on its own inside the pane, and scrolling it does not collapse the header.`,
      "Set the Repeatable's content.scrollable to false and keep it short, or remove the Tabs' header slot so the list can own the pane's scroll.");
  }
  if (outer.type === 'BottomSheet') {
    return makeFinding('P1', 'blocking', list, 'component.content.scrollable',
      `'${list.id}' (Repeatable) scrolls inside ${scrollerPlace(outer)}, so the list is never virtualised there: every row mounts at once.`,
      `Set appearance.behaviour.scrollableBody to false on '${outer.id}' and cap the list with a maxHeight, or set the Repeatable's content.scrollable to false and keep it short.`);
  }
  return makeFinding('P1', 'blocking', list, 'component.content.scrollable',
    `'${list.id}' (Repeatable) scrolls inside '${outer.id}' (${outer.type ?? 'block'}), which scrolls the same way, so the list is never virtualised there: every row mounts at once.`,
    "Make the Repeatable the scroll owner (content.scrollable true, customStyles flex 1) and remove the scrolling parent; what sat above the list goes in its header slot, which scrolls away with the rows.");
}

function nestedScrollerFinding(inner, outer) {
  const axis = inner.scrollAxis;
  const source = inner.type === 'Stack' ? stackScrollSource(inner) : null;
  const path = inner.type === 'Scrollable' ? 'component.componentType'
    : source === 'keyboard' ? 'additional.customCSS.keyboardConfig.type' : 'component.appearance.styles.overflow';
  const own = inner.type === 'Scrollable' ? `replace '${inner.id}' with a Stack, which does not scroll,`
    : `remove ${source === 'keyboard' ? 'keyboardConfig type "scroll"' : 'the overflow scroll token'} from '${inner.id}'`;
  return makeFinding('U2', 'blocking', inner, path,
    `'${inner.id}' (${inner.type}) scrolls ${axis === 'vertical' ? 'vertically' : 'horizontally'} inside ${scrollerPlace(outer)}, so the two fight over one gesture: the inner region grows to fit its content and never scrolls, or takes the scroll from the outer one.`,
    `${own} so '${outer.id}' owns the ${axis} scroll, or stop '${outer.id}' scrolling that way.`);
}

// One scroll owner per axis. A Repeatable nested in a same-axis scroller is P1, because the list
// is never virtualised there; any other nested scroller (a Scrollable, a scrolling Stack) is U2.
function nestedScrollFindings(walk) {
  const findings = [];
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    if (!block.scrollAxis) continue;
    const outer = nearestSameAxisScroller(block, walk, block.scrollAxis);
    if (!outer) continue;
    findings.push(block.type === 'Repeatable' ? nestedListFinding(block, outer) : nestedScrollerFinding(block, outer));
  }
  return findings;
}

// A header owns the status-bar safe area only when it is actually occupying that space:
// present, not hidden, and either holding content or carrying an explicit height of its
// own (a header can be all padding/height with no child block, and still own the inset).
function headerOwnsTopSafeArea(walk) {
  const headerId = walk.roots.header;
  if (!headerId) return false;
  const header = walk.facts.get(headerId);
  if (!header) return false;
  if (header.visibility?.value === false) return false;
  return header.childIds.length > 0 || Boolean(header.styles?.height);
}

// The platform stores a safe-area spacing token in several shapes, all seen on the pages of a
// real app: styles.padding.custom.<edge>, styles.padding.<edge>, styles.padding.y and
// styles.padding.all (the last two cover both edges). A margin is stored the same ways
// (margin: { t: "mt-safe" }), and custom styles reach the same inset with a value reading
// deviceContext['safeArea']. Any one of them is enough — never require a specific shape.
const CUSTOM_SAFE_TOP_KEYS = { padding: ['paddingTop', 'paddingVertical', 'padding'], margin: ['marginTop', 'marginVertical', 'margin'] };

/** Does the block reserve the top safe area with its `padding` (or `margin`), in any stored shape? */
function safeTop(facts, kind = 'padding') {
  const spacing = facts.styles?.[kind];
  const candidates = [spacing?.custom?.t, spacing?.t, spacing?.y, spacing?.all];
  if (candidates.some(value => typeof value === 'string' && value.includes('safe'))) return true;
  return CUSTOM_SAFE_TOP_KEYS[kind].some(key => typeof facts.customStyles?.[key] === 'string' && facts.customStyles[key].includes('safeArea'));
}

// The first block in the body that takes layout space: an overlay draws over the page.
function firstContentChild(walk, body) {
  return body.childIds.map(childId => walk.facts.get(childId)).find(child => child && !OVERLAY_TYPES.has(child.type)) ?? null;
}

// One top inset, one owner (app-native § Safe area): the visible header, else the body's own
// safe top padding (a seeded p-safe), else the first body block's safe top padding or margin.
function topInsetFinding(walk, body) {
  if (headerOwnsTopSafeArea(walk) || safeTop(body)) return [];
  const first = firstContentChild(walk, body);
  if (!first || safeTop(first) || safeTop(first, 'margin')) return [];
  return [makeFinding('U3', 'blocking', first, 'appearance.styles.margin',
    `there is no visible header, and neither the body nor its first block '${first.id}' reserves the top safe area (a safe top padding on the body, or a safe top margin or padding on the first block, such as mt-safe or a custom value reading deviceContext['safeArea']), so the content sits under the status bar`,
    `add margin { "t": "mt-safe" } to '${first.id}', the first body block, and no other top inset: one inset, one owner`)];
}

// mobile-navigation rule 5's spacer: an empty Stack ending the body whose height is bound (the
// bar's height plus the bottom inset). It works; the last block's own bottom padding does the
// same without a block.
function floatingBarSpacerFinding(walk, body) {
  const content = body.childIds.map(childId => walk.facts.get(childId)).filter(child => child && !OVERLAY_TYPES.has(child.type));
  const last = content[content.length - 1];
  if (!last || last.type !== 'Stack' || last.childIds.length > 0) return [];
  if (typeof last.customStyles?.height !== 'string' || !last.customStyles.height.includes('{{')) return [];
  return [makeFinding('U3', 'advisory', last, 'customStyles.height',
    'an empty Stack at the end of the body holds a bound height, a spacer that keeps the end of the content clear of the floating bar',
    "it works; the last content block's own bottom padding of the same height (the bar's height plus the bottom inset) clears the floating bar without an extra block")];
}

function u3Findings(walk) {
  const body = walk.facts.get(walk.roots.body);
  return [...topInsetFinding(walk, body), ...floatingBarSpacerFinding(walk, body)];
}

const KEYBOARD_INPUT_TYPES = new Set(['TextInput', 'TextArea', 'Form', 'MessageInput']);

// behaviour.keyboardAvoidance, else the customStyles fallback, else off, as the phone's BottomSheet reads it.
// A new sheet is seeded with it on; a sheet written without `behaviour` has none.
const sheetAvoidsKeyboard = sheet => Boolean(sheet.appearance?.behaviour?.keyboardAvoidance ?? sheet.customStyles?.keyboardAvoidance ?? false);

// A sheet over 60% of the screen does not lift for the keyboard: it scrolls the focused field into
// view instead, and only while its body scrolls. Only the heights that are tall on every phone
// count: full screen (h-full, h-screen, 100%), a fixed percentage over 60, and no defaultHeight
// at all, which opens at 61.8% of the window.
function sheetTooTallToLift(sheet) {
  const { heightMode, defaultHeight } = sheet.appearance?.height ?? {};
  if (defaultHeight === undefined || defaultHeight === null) return heightMode !== 'snapPoints';
  const text = typeof defaultHeight === 'object' ? defaultHeight.custom : defaultHeight;
  if (typeof text !== 'string') return false;
  const value = text.trim();
  if (value === 'h-full' || value === 'h-screen' || value === '100%') return true;
  const percent = /^(\d+(?:\.\d+)?)%$/u.exec(value);
  return heightMode !== 'snapPoints' && percent !== null && Number(percent[1]) > 60;
}

/**
 * `keyboardGap(walk, input) → null | { at, path, why, fix }`: null when something keeps the
 * input clear of the keyboard, nearest ancestor first —
 * - a Stack whose keyboardConfig view mounts (stackKeyboardView: no linearGradient or blurConfig
 *   on the same Stack);
 * - a Scrollable whose keyboardConfig.type is "scroll", the only type it reads;
 * - a Modal, whose dialog sits in a keyboard-avoiding view;
 * - a BottomSheet with keyboard avoidance on that can lift or scroll.
 * A Modal or a BottomSheet draws over the page, so nothing above it counts for an input inside it.
 * Otherwise `at` is the nearest ancestor whose setting does not work, or null when none has one.
 */
function keyboardGap(walk, input) {
  let gap = { at: null };
  const note = (ancestor, path, why, fix) => { if (!gap.at) gap = { at: ancestor, path, why, fix }; };
  for (const ancestorId of input.ancestors) {
    const ancestor = walk.facts.get(ancestorId);
    if (!ancestor) continue;
    if (ancestor.type === 'Stack') {
      const view = stackKeyboardView(ancestor);
      if (view && !view.blockedBy) return null;
      if (view) {
        note(ancestor, 'additional.customCSS.keyboardConfig', `its keyboardConfig never mounts, because the same Stack carries ${view.blockedBy}`,
          `move keyboardConfig from '${ancestor.id}' to a Stack that carries neither linearGradient nor blurConfig, such as a child Stack around the inputs`);
      }
    } else if (ancestor.type === 'Scrollable') {
      const config = ancestor.customStyles?.keyboardConfig;
      if (config?.type === 'scroll') return null;
      if (config) {
        note(ancestor, 'additional.customCSS.keyboardConfig.type', `its keyboardConfig type is ${JSON.stringify(config.type ?? null)}, and a Scrollable acts only on "scroll"`,
          `set keyboardConfig.type to "scroll" in the additional.customCSS of '${ancestor.id}'`);
      }
    } else if (ancestor.type === 'Modal') {
      return null;
    } else if (ancestor.type === 'BottomSheet') {
      if (!sheetAvoidsKeyboard(ancestor)) {
        note(ancestor, 'component.appearance.behaviour.keyboardAvoidance', 'the BottomSheet has keyboard avoidance off, and the sheet draws over the page, so nothing outside it lifts it',
          `set appearance.behaviour.keyboardAvoidance to true on '${ancestor.id}'`);
        return gap;
      }
      if (sheetTooTallToLift(ancestor) && !sheetBodyScrolls(ancestor)) {
        note(ancestor, 'component.appearance.behaviour.scrollableBody', 'the BottomSheet is too tall to lift (over 60% of the screen), and it scrolls the focused field into view only while its body scrolls, which it does not',
          `turn appearance.behaviour.scrollableBody on for '${ancestor.id}', or make the sheet 60% of the screen or shorter so it lifts`);
        return gap;
      }
      return null;
    }
  }
  return gap;
}

// The nearest Stack above the input whose keyboardConfig would mount.
const nearestPlainStack = (walk, input) => input.ancestors.map(id => walk.facts.get(id)).find(block => block?.type === 'Stack' && !keyboardBlockers(block)) ?? null;

/**
 * Where the keyboard setting goes, as the fix names it. A scroll keyboardConfig makes a Stack a
 * vertical scroll view, so under a block that already scrolls the input vertically it would be
 * U2's nested scroller: the setting goes on that scroll owner instead — a Scrollable takes it
 * as it is, and on a scrolling Stack it replaces the overflow token. A list row or a Tabs pane
 * cannot take it, so the nearest Stack gets the avoiding type, which does not scroll. With
 * nothing above scrolling, the nearest Stack holding the input takes the scroll type.
 */
function keyboardFix(walk, input) {
  const owner = nearestSameAxisScroller(input, walk, 'vertical');
  const stack = nearestPlainStack(walk, input);
  const css = type => `keyboardConfig { "type": "${type}" } in additional.customCSS`;
  if (owner?.type === 'Scrollable') return `set keyboardConfig { "type": "scroll" } in the additional.customCSS of '${owner.id}', the Scrollable that already scrolls it`;
  if (owner?.type === 'Stack' && stackScrollSource(owner) === 'overflow') {
    return `replace the overflow scroll token on '${owner.id}', the Stack that already scrolls it, with keyboardConfig { "type": "scroll" } in its additional.customCSS: the keyboard-aware scroll view scrolls it instead`;
  }
  if (owner && stack) return `give '${stack.id}', the nearest Stack that holds the input, ${css('keyboardAvoidingView')} — not "scroll", since '${owner.id}' (${owner.type}) already scrolls it`;
  if (stack) return `give '${stack.id}', the nearest Stack that holds the input and the content above it, ${css('scroll')}`;
  return `wrap the input in a Stack that holds it and the content above it, and give that Stack ${css('scroll')}`;
}

function u4Findings(walk) {
  const findings = [];
  const byAncestor = new Map();
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    if (!KEYBOARD_INPUT_TYPES.has(block.type)) continue;
    // A field nested inside a Form is covered by the Form's own finding — the Form is the
    // wrapper a fix actually touches, so it is reported once there, not once per field.
    const hasFormAncestor = block.ancestors.some(ancestorId => walk.facts.get(ancestorId)?.type === 'Form');
    if (hasFormAncestor) continue;
    const gap = keyboardGap(walk, block);
    if (!gap) continue;
    if (gap.at) {
      // The fix is on that ancestor, so it is reported once there, however many inputs it fails.
      const group = byAncestor.get(gap.at.id) ?? { ...gap, inputs: 0 };
      group.inputs += 1;
      byAncestor.set(gap.at.id, group);
      continue;
    }
    findings.push(makeFinding('U4', 'blocking', block, 'component.appearance.customStyles.keyboardConfig',
      `${block.type} has nothing above it that keeps it clear of the keyboard: no Stack with keyboardConfig, no Scrollable with keyboardConfig type "scroll", no Modal and no BottomSheet with keyboard avoidance on`,
      keyboardFix(walk, block)));
  }
  for (const { at, path, why, fix, inputs } of byAncestor.values()) {
    findings.push(makeFinding('U4', 'blocking', at, path,
      `${inputs} input${inputs === 1 ? '' : 's'} under this ${at.type} ${inputs === 1 ? 'is' : 'are'} not kept clear of the keyboard: ${why}`, fix));
  }
  return findings;
}

function colorFindings(block) {
  const findings = [];
  const styles = block.styles ?? {};
  for (const [key, value] of Object.entries(styles)) {
    if (typeof value === 'string') {
      if (/^#/u.test(value) && /color$/iu.test(key)) {
        findings.push(makeFinding('U5', 'blocking', block, `appearance.styles.${key}`,
          `${key} is a bare hex string "${value}" instead of a token`, `rewrite ${key} as { "custom": "${value}" } or a palette id`));
      } else if (value.includes('var(--')) {
        findings.push(makeFinding('U5', 'blocking', block, `appearance.styles.${key}`,
          `${key} is a CSS variable "${value}" instead of a token`, `rewrite ${key} as { "custom": "#RRGGBBAA" } or a palette id`));
      }
    } else if (value && typeof value === 'object' && typeof value.custom === 'string' && value.custom.includes('var(--')) {
      findings.push(makeFinding('U5', 'blocking', block, `appearance.styles.${key}.custom`,
        `${key}.custom is a CSS variable "${value.custom}" instead of a token`, `rewrite ${key} as { "custom": "#RRGGBBAA" } or a palette id`));
    }
  }
  if (styles.backgroundColor && styles.backgroundImage) {
    findings.push(makeFinding('U5', 'blocking', block, 'appearance.styles.backgroundColor',
      'the block sets both backgroundColor and backgroundImage; the colour is dead weight the image always paints over',
      'remove backgroundColor from this block'));
  }
  return findings;
}

function u5Findings(walk) {
  const findings = [];
  for (const id of walk.order) findings.push(...colorFindings(walk.facts.get(id)));
  return findings;
}

const SPACING_KEY_PATTERN = /^(padding|margin)/iu;
const EXACT_SPACING_KEYS = new Set(['gap', 'rowGap', 'columnGap']);
const isSpacingKey = key => SPACING_KEY_PATTERN.test(key) || EXACT_SPACING_KEYS.has(key);

function offGridFindings(block) {
  const findings = [];
  for (const [key, value] of Object.entries(block.customStyles ?? {})) {
    if (!isSpacingKey(key) || typeof value !== 'number') continue;
    if (value % 4 === 0 || value === 2) continue;
    findings.push(makeFinding('U6', 'advisory', block, `customStyles.${key}`,
      `${key}: ${value} is off the 4pt grid`, `round ${key} to the nearest multiple of 4 (or 2 for a hairline)`));
  }
  return findings;
}

function deviceFormulaFindings(block) {
  const findings = [];
  const scan = (value, path) => {
    if (typeof value === 'string') {
      if (value.includes('deviceInfo')) {
        findings.push(makeFinding('U6', 'advisory', block, path,
          `${path} reads a per-block deviceContext['deviceInfo'] formula`,
          "replace the deviceContext['deviceInfo'] formula with a fixed value or a token"));
      }
      return;
    }
    if (value && typeof value === 'object') for (const [key, nested] of Object.entries(value)) scan(nested, `${path}.${key}`);
  };
  scan(block.customStyles ?? {}, 'customStyles');
  return findings;
}

function u6Findings(walk) {
  const findings = [];
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    findings.push(...offGridFindings(block), ...deviceFormulaFindings(block));
  }
  return findings;
}

function u7Findings(walk, ctx) {
  const findings = [];
  const minPt = ctx.thresholds.tapMinPt;
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    if (block.type !== 'Pressable') continue;
    const { width, height } = block.customStyles ?? {};
    if (typeof width !== 'number' || typeof height !== 'number') continue;
    if (width >= minPt && height >= minPt) continue;
    if (block.appearance?.hitSlop) continue;
    findings.push(makeFinding('U7', 'advisory', block, 'appearance.hitSlop',
      `the tap target is ${width}×${height}pt, under the ${minPt}pt minimum, with no hitSlop`,
      `add hitSlop to bring the tappable area to ${minPt}pt; never enlarge the visual box itself`));
  }
  return findings;
}

// The exact "styles nothing of its own" shape named in the test list: just these
// three neutral tokens, which the builder writes by default and style nothing visibly.
function wrapperStackIsNeutral(styles) {
  if (!styles || Object.keys(styles).length === 0) return true;
  const allowed = { gap: value => value?.all === 'gap-0', padding: value => value?.all === 'p-0', backgroundColor: value => value === 'bg-transparent' };
  return Object.keys(styles).every(key => allowed[key]?.(styles[key]) === true);
}

const SCAFFOLD_TYPES = new Set(['Card']);
const BUTTON_TYPES = new Set(['Button', 'IconButton']);

// Depth-first through the walk's own childIds, so a Button any number of levels inside counts.
function descendantOfType(walk, block, types) {
  for (const childId of block.childIds) {
    const child = walk.facts.get(childId);
    if (!child) continue;
    if (types.has(child.type)) return child;
    const nested = descendantOfType(walk, child, types);
    if (nested) return nested;
  }
  return null;
}

function p5Findings(walk) {
  const findings = [];
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    if (block.type === 'Stack' && block.childIds.length === 1) {
      const onlyChild = walk.facts.get(block.childIds[0]);
      if (onlyChild?.type === 'Stack' && wrapperStackIsNeutral(block.styles)) {
        findings.push(makeFinding('P5', 'advisory', block, 'component.content.blockIds',
          'this Stack wraps a single child Stack and styles nothing of its own',
          'collapse the redundant wrapper Stack into its child (or its parent)'));
      }
    }
    if (block.type === 'Pressable' && block.childIds.length === 1) {
      const onlyChild = walk.facts.get(block.childIds[0]);
      if (onlyChild?.type === 'Stack') {
        findings.push(makeFinding('P5', 'advisory', block, 'component.content.blockIds',
          'this Pressable wraps its content in a Stack with no purpose of its own',
          "drop the Stack between the Pressable and its real content"));
      }
    }
    if (block.type === 'Pressable') {
      const button = descendantOfType(walk, block, BUTTON_TYPES);
      if (button) {
        findings.push(makeFinding('P5', 'advisory', block, 'events',
          `this Pressable wraps the ${button.type} '${button.id}', which takes the tap, so the Pressable's own actions never run`,
          `move the Pressable's actions onto '${button.id}' and remove the Pressable`));
      }
    }
    if (SCAFFOLD_TYPES.has(block.type)) {
      // An unfilled slot is stored as blockIds: ["__PLACEHOLDER__"], which the walk strips
      // to zero childIds — so "a Stack child with no children of its own" is exactly "holds
      // only __PLACEHOLDER__".
      const hasUnfilledSlot = block.childIds.some(childId => {
        const child = walk.facts.get(childId);
        return child?.type === 'Stack' && child.childIds.length === 0;
      });
      if (hasUnfilledSlot) {
        findings.push(makeFinding('P5', 'advisory', block, 'component.slots',
          `this ${block.type} still carries an unfilled scaffold slot`,
          "fill in or remove the composite's leftover scaffold slot"));
      }
    }
  }
  return findings;
}

// The lists the phone's list optimisation can size: a scrolling Repeatable that owns its scroll.
// One nested in a same-axis scroller is P1's finding and is never virtualised, so P8 and P9
// leave it alone.
function virtualizedLists(walk) {
  const lists = [];
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    if (block.type !== 'Repeatable' || !block.scrollAxis) continue;
    if (nearestSameAxisScroller(block, walk, block.scrollAxis)) continue;
    lists.push(block);
  }
  return lists;
}

// What the phone's list optimisation reads: a style that resolves to a NUMBER. A token such as
// h-12 or h-[76px] and a { custom: "198px" } do; h-full, h-auto, h-fit and percentages do not.
const isNumericSize = value => sizePoints(value) !== null;

const ROW_SIZE_KEYS = { vertical: ['height', 'minHeight', 'maxHeight'], horizontal: ['width', 'minWidth', 'maxWidth'] };

function p8Findings(walk) {
  const findings = [];
  for (const list of virtualizedLists(walk)) {
    const template = walk.facts.get(list.content?.blockId);
    if (!template) continue;
    const keys = ROW_SIZE_KEYS[list.scrollAxis];
    if (keys.some(key => isNumericSize(template.styles?.[key]))) continue;
    findings.push(makeFinding('P8', 'advisory', list, 'component.content.blockId',
      `the row template '${template.id}' has no numeric ${keys.join(', ')} in appearance.styles, so the list cannot estimate its row size`,
      `give '${template.id}' a fixed ${keys[0]} (or a ${keys[1]} equal to the largest row) in appearance.styles; give its variable parts a fixed size too`));
  }
  return findings;
}

// A condition or a binding, which can flip; a constant true or false never does.
const hasVisibilityCondition = block => {
  const value = block.visibility?.value;
  return value !== undefined && value !== null && value !== true && value !== false;
};

function p9Findings(walk) {
  const findings = [];
  for (const list of virtualizedLists(walk)) {
    // The list itself, then each wrapper whose only child leads down to it, up to the body.
    let gated = hasVisibilityCondition(list) ? list : null;
    let current = list;
    while (!gated) {
      const parent = walk.facts.get(current.ancestors[0]);
      if (!parent || parent.id === walk.roots.body || parent.childIds.length !== 1) break;
      if (hasVisibilityCondition(parent)) gated = parent;
      current = parent;
    }
    if (!gated) continue;
    const paged = list.content?.addOns?.page?.type === 'INFINITE';
    const where = gated === list ? 'the list' : `its wrapper '${gated.id}'`;
    findings.push(makeFinding('P9', paged ? 'blocking' : 'advisory', gated, 'visibility',
      `${where} has a visibility condition, so the list unmounts and rebuilds every row each time it flips${paged ? ', and loses the pages it already loaded' : ''}`,
      `set ${where}'s visibility to always shown and collapse it with a bound maxHeight ('100%' with data, '0px' without); accept this if the condition flips at most once per visit`));
  }
  return findings;
}

// One finding per page, on the body: the fix is one reorder of root_id, however many overlays move.
function u9Findings(walk) {
  const body = walk.facts.get(walk.roots.body);
  let firstContent = null;
  const late = [];
  for (const childId of body.childIds) {
    const child = walk.facts.get(childId);
    if (!child) continue;
    if (!OVERLAY_TYPES.has(child.type)) firstContent ??= child;
    else if (firstContent) late.push(child);
  }
  if (late.length === 0) return [];
  return [makeFinding('U9', 'advisory', body, 'component.content.blockIds',
    `${late.length} overlay${late.length === 1 ? '' : 's'} come${late.length === 1 ? 's' : ''} after the content block '${firstContent.id}': ${late.map(block => `${block.name} (${block.id})`).join(', ')}`,
    'move every BottomSheet, Drawer and Modal to the top of the body, before the first content block, keeping their order')];
}

const IGNORED_SHEET_KEYS = ['borderTopLeftRadius', 'borderTopRightRadius', 'backgroundColor'];

function u10Findings(walk) {
  const findings = [];
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    if (block.type !== 'BottomSheet') continue;
    const fixed = block.appearance?.height?.heightMode === 'fixed';
    const scrolls = block.appearance?.behaviour?.scrollableBody === true;
    const clipped = block.customStyles?.contentContainerStyle?.overflow === 'hidden';
    if (fixed && scrolls && !clipped) {
      const radius = block.appearance?.shape?.cornerRadius;
      const r = (radius && typeof radius === 'object' ? radius.all : radius) ?? 'R';
      findings.push(makeFinding('U10', 'blocking', block, 'additional.customCSS.contentContainerStyle',
        'a fixed sheet with a scrolling body and no contentContainerStyle overflow hidden: the body draws past the rounded top edge as it scrolls',
        `add "contentContainerStyle": { "overflow": "hidden", "borderTopLeftRadius": ${r}, "borderTopRightRadius": ${r} } to additional.customCSS`));
    }
    const ignored = IGNORED_SHEET_KEYS.filter(key => block.customStyles?.[key] !== undefined);
    if (ignored.length > 0) {
      findings.push(makeFinding('U10', 'advisory', block, 'additional.customCSS',
        `custom styles set ${ignored.join(', ')}, which a BottomSheet ignores`,
        `delete ${ignored.join(', ')} from additional.customCSS; the radius comes from Shape → Corner radius and the colour from bottomSheetBackground`));
    }
  }
  return findings;
}

// The id a binding reads first, the way the platform picks the source an endless list pages:
// the first path segment of the
// first {{ }} expression, or null when there is no binding or it starts with inline JSON.
function firstBindingRoot(value) {
  if (typeof value !== 'string') return null;
  const expression = /\{\{\s*(.*?)\s*\}\}/u.exec(value)?.[1];
  const root = expression?.split(/\.|\['|'\]/u).find(Boolean) ?? null;
  return root && !/^[{[]/u.test(root.trim()) ? root : null;
}

// A page function, a page variable or a block: never the data source an endless list must name.
function isNotDataSource(id, walk, ctx) {
  return /^(?:func|var)_/u.test(id) || Object.hasOwn(ctx.functions ?? {}, id) || Object.hasOwn(ctx.variables ?? {}, id) || walk.facts.has(id);
}

// An endless list pages only when its `content.data` and its `addOns.page.total` both name the
// data source (the platform reads the source id from each), and only
// as a scrolling list nears its end — so any of these stops it at its first page.
function p12Findings(walk, ctx) {
  const findings = [];
  for (const id of walk.order) {
    const list = walk.facts.get(id);
    const page = list.type === 'Repeatable' ? list.content?.addOns?.page : null;
    if (page?.type !== 'INFINITE') continue;
    const dataRoot = firstBindingRoot(list.content?.data);
    const stop = 'so the next page never loads and the list ends after its first page';
    if (!firstBindingRoot(page.total)) {
      findings.push(makeFinding('P12', 'blocking', list, 'component.content.addOns.page.total',
        `content.addOns.page.total binds no data source, ${stop}`,
        `bind content.addOns.page.total to the row count of the source content.data reads, such as "{{ ${dataRoot && !isNotDataSource(dataRoot, walk, ctx) ? dataRoot : 'e_<source>'}['data']['total'] }}"`));
    }
    if (dataRoot && isNotDataSource(dataRoot, walk, ctx)) {
      findings.push(makeFinding('P12', 'blocking', list, 'component.content.data',
        `content.data reads ${dataRoot}, not a data source, ${stop}`,
        "bind content.data straight to the data source, such as \"{{ e_<source>['data']['objects'] }}\"; an endless list cannot read its rows through a page function"));
    }
    if (list.content?.scrollable === false) {
      findings.push(makeFinding('P12', 'blocking', list, 'component.content.scrollable',
        `content.scrollable is false, and only the scrolling list loads the next page as it nears its end, ${stop}`,
        "set content.scrollable to true and give the list a height bound (customStyles flex 1, or a fixed height)"));
    }
  }
  return findings;
}

// The lists something on the page moves with the goToPage method (controlBlockMethod).
function goToPageTargets(walk, ctx) {
  const targets = new Set();
  const read = actions => {
    for (const action of actions) {
      if (action.actionType === 'controlBlockMethod' && action.payload?.methodName === 'goToPage') targets.add(action.payload?.blockId);
    }
  };
  for (const id of walk.order) for (const event of walk.facts.get(id).events) read(event.actions);
  for (const event of normalizeEvents(ctx.pageEvents)) read(event.actions);
  return targets;
}

// PAGE paging draws no page controls on the phone: the list moves past its first page only when
// something calls goToPage on it (the native Repeatable paging sheet).
function p13Findings(walk, ctx) {
  const targets = goToPageTargets(walk, ctx);
  const findings = [];
  for (const id of walk.order) {
    const list = walk.facts.get(id);
    if (list.type !== 'Repeatable' || list.content?.addOns?.page?.type !== 'PAGE' || targets.has(list.id)) continue;
    findings.push(makeFinding('P13', 'blocking', list, 'component.content.addOns.page.type',
      'content.addOns.page.type is "PAGE", which draws no page controls on the phone, and nothing calls goToPage on this list, so it shows its first page with nothing to tap for the rest',
      'set content.addOns.page.type to "INFINITE" (with content.scrollable true and content.addOns.page.total bound to the source), remove content.addOns.page to show every row, or move pages with a Button that calls goToPage'));
  }
  return findings;
}

function x8Findings(walk) {
  const findings = [];
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    if (!block.customCssError) continue;
    const { reason, excerpt } = block.customCssError;
    findings.push(makeFinding('X8', 'blocking', block, 'additional.customCSS',
      `additional.customCSS is ${reason}, so the phone applies none of the styles in it: "${excerpt}"`,
      'rewrite additional.customCSS as one strict JSON object — double-quoted keys, unitless numbers, no comments, no trailing commas — or clear it'));
  }
  return findings;
}

/** `structureFindings(walk, ctx) → Finding[]` for U2/P1, U3, U4, U5, U6, U7, U9, U10, P5, P8, P9, P12, P13, X8, each run by `runRules`. */
export function structureFindings(walk, ctx) {
  return runRules([
    ['U2/P1', () => nestedScrollFindings(walk)], ['U3', () => u3Findings(walk)], ['U4', () => u4Findings(walk)],
    ['U5', () => u5Findings(walk)], ['U6', () => u6Findings(walk)], ['U7', () => u7Findings(walk, ctx)],
    ['U9', () => u9Findings(walk)], ['U10', () => u10Findings(walk)], ['P5', () => p5Findings(walk)],
    ['P8', () => p8Findings(walk)], ['P9', () => p9Findings(walk)], ['P12', () => p12Findings(walk, ctx)],
    ['P13', () => p13Findings(walk, ctx)], ['X8', () => x8Findings(walk)],
  ], ctx);
}
