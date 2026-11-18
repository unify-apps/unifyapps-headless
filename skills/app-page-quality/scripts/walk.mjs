/**
 * Walks a cached page's block map into a flat, rule-friendly shape: one
 * `BlockFacts` per block, keyed by id, plus the visiting order, the three
 * page roots (body/header/footer) and the referenced blocks the walk never
 * reached. The structure and data rules in rules-structure.mjs and
 * rules-data.mjs read this instead of re-deriving it.
 */

// An empty socket: the builder stores '__PLACEHOLDER__', and the platform also treats 'null' as no child.
const PLACEHOLDER_IDS = new Set(['__PLACEHOLDER__', 'null']);
const SOURCE_ID_PATTERN = /e_[0-9a-f]{24}/gu;

const isRealBlockId = id => typeof id === 'string' && id.length > 0 && !PLACEHOLDER_IDS.has(id);

// Ported from the platform's own nested-list guard for mobile pages.
// (stackScrollAxis + scrollAxisOf): the values Stack's StackChildrenContainer.native turns
// into a ScrollView, Scrollable's own direction, and Repeatable's default (scrollable
// absent means virtualised, a grid always scrolls vertically whatever `direction` says).
function stackScrollAxis(appearance) {
  const overflow = appearance?.styles?.overflow;
  if (
    overflow?.y === 'overflow-y-scroll' ||
    overflow?.y === 'overflow-y-auto' ||
    overflow?.all === 'overflow-scroll' ||
    overflow?.all === 'overflow-auto'
  ) {
    return 'vertical';
  }
  if (overflow?.x === 'overflow-x-scroll' || overflow?.x === 'overflow-x-auto') return 'horizontal';
  return null;
}

// Drawn under appearance.effects, a background-blur takes over from customStyles.blurConfig
// on the phone, so that blurConfig no longer paints.
function hasBackgroundBlurEffect(appearance) {
  const effects = Array.isArray(appearance?.effects) ? appearance.effects : [];
  return effects.some(effect => effect?.type === 'background-blur' && effect.visible !== false && Number(effect.blur) > 0);
}

/**
 * `stackKeyboardView(fact) → { type, blockedBy } | null` for a Stack whose custom styles carry
 * `keyboardConfig`. The phone's Stack mounts the keyboard view only after a
 * `linearGradient` or `blurConfig` layer, so either one on the same Stack stops it, and
 * `blockedBy` names it. `type` is the stored `keyboardConfig.type`: `scroll` mounts a keyboard-aware
 * scroll view, `keyboardAvoidingView` an avoiding view and anything else a sticky view.
 */
export function stackKeyboardView(fact) {
  const config = fact.customStyles?.keyboardConfig;
  if (!config) return null;
  return { type: typeof config === 'object' ? config.type ?? null : null, blockedBy: keyboardBlockers(fact) };
}

/** What on a Stack keeps a keyboardConfig from mounting: its `linearGradient`, or a `blurConfig` no `background-blur` effect replaces; null when nothing does. */
export function keyboardBlockers(fact) {
  const blockers = [];
  if (fact.customStyles?.linearGradient) blockers.push('linearGradient');
  if (fact.customStyles?.blurConfig && !hasBackgroundBlurEffect(fact.appearance)) blockers.push('blurConfig');
  return blockers.length > 0 ? blockers.join(' and ') : null;
}

/**
 * `stackScrollSource(fact) → 'overflow' | 'keyboard' | null`: what makes a Stack scroll. An
 * overflow scroll token wraps its children in a ScrollView, and a keyboard view of type
 * `scroll` is a keyboard-aware scroll view, vertical.
 */
export function stackScrollSource(fact) {
  if (stackScrollAxis(fact.appearance)) return 'overflow';
  const keyboard = stackKeyboardView(fact);
  return keyboard && !keyboard.blockedBy && keyboard.type === 'scroll' ? 'keyboard' : null;
}

function scrollAxisOf(fact) {
  const { type, content, appearance } = fact;
  if (type === 'Repeatable') {
    if (content?.scrollable === false) return null;
    return appearance?.layout !== 'grid' && appearance?.direction === 'horizontal' ? 'horizontal' : 'vertical';
  }
  if (type === 'Scrollable') {
    const direction = appearance?.direction;
    return direction === 'row' || direction === 'row-reverse' ? 'horizontal' : 'vertical';
  }
  if (type === 'Stack') return stackScrollAxis(appearance) ?? (stackScrollSource(fact) === 'keyboard' ? 'vertical' : null);
  return null;
}

/**
 * Every direct child id a block hands to the walk, in every shape the platform stores one, the
 * same shapes the platform follows when it deletes a block:
 * `content.blockId` (a Repeatable's template, a dynamic Carousel's slide), `content.blockIds`,
 * `content.items[].blockId` (a Tabs pane, a static Carousel slide) and each slot's `blockId`
 * (plus a slot's `blockIds`, read here as before).
 */
function childIdsOf(block) {
  const content = block.component?.content ?? {};
  const slots = block.component?.slots ?? {};
  const ids = [];
  if (isRealBlockId(content.blockId)) ids.push(content.blockId);
  if (Array.isArray(content.blockIds)) for (const id of content.blockIds) if (isRealBlockId(id)) ids.push(id);
  if (Array.isArray(content.items)) for (const item of content.items) if (isRealBlockId(item?.blockId)) ids.push(item.blockId);
  for (const slot of Object.values(slots)) {
    if (!slot || typeof slot !== 'object') continue;
    if (isRealBlockId(slot.blockId)) ids.push(slot.blockId);
    if (Array.isArray(slot.blockIds)) for (const id of slot.blockIds) if (isRealBlockId(id)) ids.push(id);
  }
  return ids;
}

// The block repeated once per row: a Repeatable's template, and a Carousel's slide unless the
// carousel is STATIC (the phone draws `content.items` for STATIC, `content.blockId` else).
function templateIdOf(block) {
  const { componentType, content } = block.component ?? {};
  const repeats = componentType === 'Repeatable' || (componentType === 'Carousel' && content?.type !== 'STATIC');
  return repeats && isRealBlockId(content?.blockId) ? content.blockId : null;
}

// The panes of a Tabs strip that mount only when their tab first opens. With no header slot the
// strip renders its panes lazily: the one it opens on (`content.defaultValue`, else the first)
// mounts with the page and the rest wait. A header slot switches to the collapsing layout, which
// mounts every pane at once on the phone.
function panesMountingOnOpen(block) {
  const { componentType, content, slots } = block.component ?? {};
  if (componentType !== 'Tabs' || slots?.header) return new Set();
  const items = Array.isArray(content?.items) ? content.items : [];
  const openIndex = Math.max(0, items.findIndex(item => item?.value === content?.defaultValue));
  return new Set(items.filter((item, index) => index !== openIndex && isRealBlockId(item?.blockId)).map(item => item.blockId));
}

function collectBindings(value, path, out) {
  if (typeof value === 'string') {
    if (value.includes('{{')) out.push({ path, text: value, sourceIds: [...new Set(value.match(SOURCE_ID_PATTERN) ?? [])] });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectBindings(item, `${path}[${index}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) collectBindings(nested, `${path}.${key}`, out);
  }
}

function extractBindings(block) {
  const out = [];
  collectBindings(block.component ?? {}, 'component', out);
  collectBindings(block.visibility ?? {}, 'visibility', out);
  return out;
}

const followOns = actions => (Array.isArray(actions) ? actions : []);

// A stored action's follow-on chain (onSuccessActions/onErrorActions, each an action object
// with its own actionType/payload) is flattened in here, main action first, so a rule reading
// `actions` sees the whole chain without walking the nested shape itself.
function flattenAction(action, branch) {
  if (!action) return [];
  const own = [{ actionType: action.actionType ?? null, payload: action.payload ?? null, branch,
    runCondition: action.runCondition ?? null, disabled: action.disabled === true }];
  const onSuccess = followOns(action.onSuccessActions).flatMap(nested => flattenAction(nested, 'success'));
  const onError = followOns(action.onErrorActions).flatMap(nested => flattenAction(nested, 'error'));
  return [...own, ...onSuccess, ...onError];
}

// Exported so rules-data.mjs can normalize page-level onPageLoad events (page.properties.events)
// through the same { eventType, actions } shape walkPage already gives every block's events.
export function normalizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map(event => ({
    eventType: event?.eventType ?? null,
    // The option a ButtonGroup handler is aimed at in manual mode (P14), else null.
    targetId: event?.targetId ?? null,
    actions: flattenAction(event?.action, 'main'),
  }));
}

/**
 * `resolveCustomStyles(block) → { customStyles, customCssError }`. On a MOBILE app
 * `additional.customCSS` is JSON text: every save rebuilds `appearance.customStyles` from it, as
 * `{}` when it does not parse, and the phone takes styles only from a JSON object. Text that is
 * not one styles nothing, so it resolves to `{}` here and `customCssError` is
 * `{ reason, excerpt }`. With no text, `appearance.customStyles` is read as before.
 */
function resolveCustomStyles(block) {
  const raw = block.additional?.customCSS;
  if (typeof raw === 'string' && raw.trim()) {
    const excerpt = raw.replace(/\s+/gu, ' ').trim().slice(0, 60);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { customStyles: {}, customCssError: { reason: `not JSON (${error.message})`, excerpt } };
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { customStyles: parsed, customCssError: null };
    const kind = Array.isArray(parsed) ? 'a JSON array' : parsed === null ? 'JSON null' : `a JSON ${typeof parsed}`;
    return { customStyles: {}, customCssError: { reason: `${kind}, not an object`, excerpt } };
  }
  return { customStyles: block.component?.appearance?.customStyles ?? {}, customCssError: null };
}

const SIZE_TOKEN = /^(?:min-|max-)?[hw]-(?:\[(\d+(?:\.\d+)?)(?:px)?\]|(\d+(?:\.\d+)?))$/u;
const PLAIN_SIZE = /^(\d+(?:\.\d+)?)(?:px)?$/u;
// A size token counts in Tailwind's 4pt steps: h-12 is 48pt, w-4 is 16pt.
const TOKEN_STEP_PT = 4;

/**
 * `sizePoints(value) → number | null`: a stored size in points — a number, "<n>px" or "<n>", a
 * size token (`h-12` is 48pt, `w-[76px]` 76pt, `min-`/`max-` alike), or any of those as
 * `{ custom }`. Null for a size set some other way (`w-full`, `h-auto`, a percentage, a binding)
 * or not set. P4 measures a box with it; P8 asks only whether a row's size is one.
 */
export function sizePoints(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = value && typeof value === 'object' ? value.custom : value;
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  const plain = PLAIN_SIZE.exec(trimmed);
  if (plain) return Number(plain[1]);
  const token = SIZE_TOKEN.exec(trimmed);
  if (!token) return null;
  return token[1] !== undefined ? Number(token[1]) : Number(token[2]) * TOKEN_STEP_PT;
}

// One side of a block's box: a number of points when appearance.styles holds a size in points
// (sizePoints) or customStyles a bare number, the stored value when it is set some other way
// ("100%", "w-full", flex), or null when neither sets it.
function boxSide(block, side) {
  const styled = block.styles?.[side];
  const custom = block.customStyles?.[side];
  const points = sizePoints(styled);
  if (points !== null) return points;
  if (typeof custom === 'number' && Number.isFinite(custom)) return custom;
  const styledValue = styled && typeof styled === 'object' ? styled.custom : styled;
  return styledValue || custom || null;
}

/**
 * `blockBox(block) → { width, height }`, the one reading of a block's box: X3 asks whether both
 * sides are set, P4 how many points they are (a side that is not a number is set, not in points).
 */
export function blockBox(block) {
  return { width: boxSide(block, 'width'), height: boxSide(block, 'height') };
}

// Every block id held as a string anywhere in a block's component, which is where every child
// pointer lives, whatever its shape.
function idsNamedIn(value, blocks, out) {
  if (typeof value === 'string') {
    if (Object.hasOwn(blocks, value)) out.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) idsNamedIn(item, blocks, out);
  } else if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) idsNamedIn(nested, blocks, out);
  }
  return out;
}

/**
 * The blocks the walk was led to and never visited: every block id a visited block's
 * component names that the walk did not reach, and everything under those, so a child
 * pointer of a shape `childIdsOf` does not read shows up as blocks the audit never saw.
 */
function unreachedFrom(blocks, facts) {
  const unreached = [];
  const seen = new Set(facts.keys());
  const queue = [];
  const take = id => {
    if (seen.has(id)) return;
    seen.add(id);
    unreached.push(id);
    queue.push(id);
  };
  for (const id of facts.keys()) for (const named of idsNamedIn(blocks[id]?.component, blocks, new Set())) take(named);
  while (queue.length > 0) for (const named of idsNamedIn(blocks[queue.shift()]?.component, blocks, new Set())) take(named);
  return unreached;
}

/**
 * The walk's notes, one per block: a block more than one parent lists (`shared`, walked once,
 * under the first) and a child reference back up to a block above it (`cycle`, never followed).
 * Neither is a rule finding; they say why the walked tree differs from the stored pointers.
 */
function walkNotes(listedBy, backEdges) {
  const notes = [];
  for (const [blockId, parents] of listedBy) {
    if (parents.length < 2) continue;
    const where = parents.map(parent => parent ?? 'the page root').join(', ');
    notes.push({ kind: 'shared', blockId, parents, detail: `${blockId} is listed ${parents.length} times, by ${where}; walked once, under ${parents[0] ?? 'the page root'}` });
  }
  for (const [blockId, parents] of backEdges) {
    notes.push({ kind: 'cycle', blockId, parents, detail: `${parents.join(', ')} ${parents.length === 1 ? 'lists' : 'list'} ${blockId}, which is above it, so the walk did not follow it there` });
  }
  return notes;
}

/**
 * `walkPage(page) → { facts, order, roots, unreached, notes }`. Each block is walked once, so
 * the facts form a tree: a block a second parent lists (or one parent lists twice) is walked
 * under the first listing only, and a child reference back up to a block on the current path
 * is skipped; each fact's `childIds` keeps only the children walked under it. `notes` names
 * both cases (see `walkNotes`), and `unreached` the referenced blocks the walk never visited
 * (see `unreachedFrom`), so no rule ran on them. Throws only when the page has no `root_id`.
 */
export function walkPage(page) {
  const blocks = page?.properties?.blocks ?? {};
  if (!blocks.root_id) throw new Error('page has no root_id block');

  const facts = new Map();
  const order = [];
  const visiting = new Set();
  const listedBy = new Map(); // block id → every parent that lists it, in walk order
  const backEdges = new Map(); // block id → the parents below it that list it again

  const record = (map, id, parentId) => (map.get(id) ?? map.set(id, []).get(id)).push(parentId);

  // A child reference the walk follows: the first listing of a stored block not already walked.
  function follows(id, parentId) {
    if (!blocks[id]) return false;
    if (visiting.has(id)) {
      record(backEdges, id, parentId);
      return false;
    }
    record(listedBy, id, parentId);
    return !facts.has(id);
  }

  function visit(id, renderedParentId, ancestors, slot, inTemplate, mountsOnOpen) {
    if (!follows(id, renderedParentId)) return;
    const block = blocks[id];
    visiting.add(id);

    const storedChildIds = childIdsOf(block);
    const templateChildId = templateIdOf(block);
    const lazyPanes = panesMountingOnOpen(block);
    const { customStyles, customCssError } = resolveCustomStyles(block);

    const fact = {
      id,
      name: block.displayName ?? id,
      type: block.component?.componentType ?? null,
      // The block's own stored parentId when it carries one (a root never does), else the
      // parent we actually descended from. Rule code (P1's scroller chain) walks THIS field,
      // because a stored page's parentId is what the platform itself treats as the tree —
      // it can disagree with the live blockIds nesting below.
      parentId: typeof block.parentId === 'string' ? block.parentId : renderedParentId,
      ancestors, // the rendered (depth-first, blockIds-walked) ancestor chain, nearest first — not the stored parentId chain
      slot,
      inTemplate,
      // True inside a Tabs pane that mounts only when its tab first opens, so it is not part of
      // the page's first render. A BottomSheet's slots stay false: they mount a few seconds after
      // the page loads, without being opened, and stay mounted.
      mountsOnOpen,
      childIds: [], // the children walked under this block, filled in below
      bindings: extractBindings(block),
      events: normalizeEvents(block.events),
      interactions: block.component?.appearance?.interactions ?? null,
      loading: block.component?.appearance?.loading ?? null,
      visibility: block.visibility ?? null,
      styles: block.component?.appearance?.styles ?? {},
      customStyles,
      customCssError, // { reason, excerpt } when additional.customCSS styles nothing (X8), else null
      content: block.component?.content ?? {},
      appearance: block.component?.appearance ?? {},
      slots: block.component?.slots ?? {},
    };
    fact.scrollAxis = scrollAxisOf(fact);
    facts.set(id, fact);
    order.push(id);

    const childAncestors = [id, ...ancestors];
    for (const childId of storedChildIds) {
      const walkedBefore = facts.has(childId);
      visit(childId, id, childAncestors, slot, inTemplate || childId === templateChildId, mountsOnOpen || lazyPanes.has(childId));
      if (!walkedBefore && facts.has(childId)) fact.childIds.push(childId);
    }
    visiting.delete(id);
  }

  const roots = { body: 'root_id', header: blocks.header_id ? 'header_id' : null, footer: blocks.footer_id ? 'footer_id' : null };
  visit('root_id', null, [], 'body', false, false);
  if (roots.header) visit('header_id', null, [], 'header', false, false);
  if (roots.footer) visit('footer_id', null, [], 'footer', false, false);

  return { facts, order, roots, unreached: unreachedFrom(blocks, facts), notes: walkNotes(listedBy, backEdges) };
}
