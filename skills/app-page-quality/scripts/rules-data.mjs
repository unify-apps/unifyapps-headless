/**
 * The data, feedback and first-screen findings a page's data sources, page functions,
 * page variables, block bindings and event chains decide — U1, U7 (a hitSlop the phone drops),
 * U11, P2, P3, P7, P10, P14, X1, X2, X3, X4, X5 — plus the candidate lists the main Zen session judges
 * the rest of the rulebook from (U8, P6, P11, X6, X7). See references/rulebook.md for the prose
 * each rule mirrors.
 */

import { makeFinding, runRules } from './rules-structure.mjs';
import { blockBox, normalizeEvents, walkPage } from './walk.mjs';

const SOURCE_ID_PATTERN = /e_[0-9a-f]{24}/gu;
const FUNCTION_ID_PATTERN = /func_[A-Za-z0-9]+/u;

const isBound = value => typeof value === 'string' && value.includes('{{');
// A stored list, or none: a value stored as anything but an array reads as an empty list.
const listOf = value => (Array.isArray(value) ? value : []);

/** The nearest BottomSheet above `block` that mounts its slots late: `bottomSheetMountDelay` absent or not 0. */
function lateSheetAbove(walk, block) {
  for (const ancestorId of block.ancestors) {
    const ancestor = walk.facts.get(ancestorId);
    if (ancestor?.type === 'BottomSheet' && ancestor.customStyles?.bottomSheetMountDelay !== 0) return ancestor;
  }
  return null;
}

/**
 * Page sources read only by blocks that mount after the page loads, as Map<sourceId, { sheets,
 * tabs }>: inside a BottomSheet, whose slots mount about 4 s after the page settles, or inside a
 * Tabs pane that mounts when its tab first opens (the walk's `mountsOnOpen`). A block reads a
 * source through its bindings or its stored `dataSourceIds`, the list the runtime triggers an
 * automatic source from when the block mounts. An automatic page function mounts with the page
 * and triggers its own `dataSourceIds`, so a source it lists is read at load.
 */
function sourcesReadLate(context, walk) {
  const blocks = context?.page?.properties?.blocks ?? {};
  const readAtLoad = new Set();
  const readLate = new Map();
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    const stored = Array.isArray(blocks[id]?.dataSourceIds) ? blocks[id].dataSourceIds : [];
    const sourceIds = new Set([...block.bindings.flatMap(binding => binding.sourceIds), ...stored]);
    if (sourceIds.size === 0) continue;
    const sheet = lateSheetAbove(walk, block);
    const late = sheet || block.mountsOnOpen === true;
    for (const sourceId of sourceIds) {
      if (!late) {
        readAtLoad.add(sourceId);
        continue;
      }
      const entry = readLate.get(sourceId) ?? { sheets: new Set(), tabs: false };
      if (sheet) entry.sheets.add(sheet.name);
      else entry.tabs = true;
      readLate.set(sourceId, entry);
    }
  }
  for (const pageFunction of Object.values(context?.page?.properties?.pageFunctions ?? {})) {
    const automatic = pageFunction?.runBehaviour === 'automatic' || pageFunction?.runBehaviour === undefined;
    if (automatic && Array.isArray(pageFunction?.dataSourceIds)) for (const sourceId of pageFunction.dataSourceIds) readAtLoad.add(sourceId);
  }
  for (const sourceId of readAtLoad) readLate.delete(sourceId);
  return readLate;
}

function toSourceFacts(source, scope, { readLate, pageText }) {
  const properties = source?.properties ?? {};
  const advancedOptions = properties.advancedOptions ?? {};
  const flagged = advancedOptions.timing?.runQueryOnPageLoad === true;
  // Reruns on its own whenever an input it reads changes (P10), and runs when a block reading it mounts.
  const automatic = advancedOptions.runBehaviour === 'automatic';
  const lateReaders = scope === 'page' ? readLate.get(source.id) ?? null : null;
  // An app source lives on the app's global page; an automatic one starts on this page only
  // when something on it reads it, so one the page never names costs it nothing.
  const readByPage = scope === 'page' || (typeof source.id === 'string' && pageText.includes(source.id));
  return {
    id: source.id,
    name: properties.name ?? source.id,
    scope,
    automationId: properties.inputs?.automationId ?? null,
    resource: properties.context?.resourceName ?? null,
    // The page-load queue takes a flagged source whatever reads it; an automatic one with no flag
    // starts when the first block reading it mounts, which for a late reader is after the load.
    onLoad: flagged || (automatic && readByPage && !lateReaders),
    automatic,
    readByPage,
    lateReaders: lateReaders ? { sheets: [...lateReaders.sheets], tabs: lateReaders.tabs } : null,
    flagged,
    parameters: properties.inputs?.parameters ?? null,
    inputsText: JSON.stringify(properties.inputs ?? {}),
    // A callback can write a page variable, which P14 needs to know.
    callbacksText: JSON.stringify(properties.callbacks ?? {}),
  };
}

/**
 * `sourceFacts(context, walk) → SourceFacts[]`, page sources (`context.dataSources`) then app
 * sources (`context.appDataSources`); a list stored as anything else, or an entry that is not an
 * object, counts as no source. `walk` defaults to a walk of `context.page`; it is what tells a
 * source read only by late-mounting blocks from one the page's first render reads. An app source
 * is read by the page when its id appears anywhere on the page — a binding, a block's stored
 * `dataSourceIds`, a page function, an event, a page variable — or in a page source's settings.
 */
export function sourceFacts(context, walk = context?.page ? walkPage(context.page) : null) {
  const isSource = source => Boolean(source) && typeof source === 'object';
  const pageSources = listOf(context?.dataSources).filter(isSource);
  const appSources = listOf(context?.appDataSources).filter(isSource);
  const facts = {
    readLate: walk ? sourcesReadLate(context, walk) : new Map(),
    pageText: JSON.stringify(context?.page?.properties ?? {}) + JSON.stringify(pageSources),
  };
  return [
    ...pageSources.map(source => toSourceFacts(source, 'page', facts)),
    ...appSources.map(source => toSourceFacts(source, 'app', facts)),
  ];
}

// ---- U1 — press feedback on every tappable ----------------------------------------------

// None of these takes a tap on the phone, so an event wired on one never fires.
const DEAD_TAP_TYPES = new Set(['Stack', 'Icon', 'Typography', 'Divider']);

const SURFACE_FIX = 'give it feedback that suits its surface: a card highlights (highlightColor { "custom": "#EFF0F2FF" }), a coloured tile or photo dims (opacity 0.6), a solid CTA shrinks (scale 0.96, light haptic), a link dims more (opacity 0.5); set androidRipple: false so both platforms feel the same';

function hasEventType(events, eventType) {
  return events.some(event => event.eventType === eventType);
}

// The worklet animates a pressed opacity or scale only when it is truthy and not 1, so 0 and 1
// both change nothing. A binding resolves only on the phone, so it is given the benefit.
const animates = value => isBound(value) || (typeof value === 'number' && value !== 0 && value !== 1);

/** Why a highlightColor paints nothing, or null when it resolves: a palette id or `{ custom }` does; a bare hex string resolves, as a class name, to nothing. */
function highlightProblem(value) {
  if (value === undefined || value === null || value === '') return 'none';
  if (typeof value === 'string') return value.trim().startsWith('#') ? 'bare-hex' : null;
  return value && typeof value === 'object' && typeof value.custom === 'string' && value.custom.trim() ? null : 'unreadable';
}

/** What a press visibly does with one set of opacity, scale and highlightColor. */
function visibleFeedback(values) {
  const kinds = [];
  if (animates(values?.opacity)) kinds.push('opacity');
  if (animates(values?.scale)) kinds.push('scale');
  if (highlightProblem(values?.highlightColor) === null) kinds.push('highlight');
  return kinds;
}

/**
 * `pressFeedback(interactions) → { ios, android, androidValues }`, the visible feedback on each
 * platform. Android reads opacity, scale and highlightColor from `androidOverride` while it is
 * enabled (keys it lacks are missing, not inherited) and adds its ripple; iOS has no ripple. A
 * haptic is felt, not seen, so it is not counted.
 */
function pressFeedback(interactions) {
  const override = interactions.androidOverride;
  const androidValues = override && typeof override === 'object' && override.enabled ? override : interactions;
  return {
    ios: visibleFeedback(interactions),
    android: [...visibleFeedback(androidValues), ...(interactions.androidRipple ? ['ripple'] : [])],
    androidValues,
  };
}

function describeValues(values) {
  const show = value => (value === undefined ? 'unset' : JSON.stringify(value));
  const parts = [`opacity ${show(values?.opacity)}`, `scale ${show(values?.scale)}`];
  const problem = highlightProblem(values?.highlightColor);
  if (problem === 'bare-hex') parts.push(`highlightColor ${JSON.stringify(values.highlightColor)} is a bare hex, which the phone reads as no highlight`);
  else if (problem === 'unreadable') parts.push('highlightColor is neither a palette id nor { "custom": … }');
  else if (problem === 'none') parts.push('no highlightColor');
  return parts.join(', ');
}

function silentPressDetail({ ios, android, androidValues }, interactions) {
  if (ios.length === 0 && android.length === 0) return `a press shows nothing on either platform: ${describeValues(interactions)}, and androidRipple is off`;
  if (ios.length === 0) return `a press shows nothing on an iPhone, only the Android ${android.join(' and ')}: ${describeValues(interactions)}`;
  return `a press shows nothing on Android: androidOverride is enabled and replaces opacity, scale and highlightColor with ${describeValues(androidValues)}, and androidRipple is off`;
}

/** A plain colour string that hides what is under it: a hex with no alpha or full alpha, or a colour name. A binding, an alpha colour or a token is not known to. */
function opaqueColour(text) {
  const colour = typeof text === 'string' ? text.trim() : '';
  if (!colour || isBound(colour) || /transparent|^rgba|^hsla|^var\(/iu.test(colour)) return false;
  const hex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{6}(ff))$/iu.exec(colour);
  return hex ? true : !colour.startsWith('#') && /^[a-z]+$/iu.test(colour);
}

/**
 * Does a Stack paint an opaque background? In `appearance.styles` the colour is a palette id or
 * `{ custom }` (a bare hex string there paints nothing on the phone); in custom styles it is a
 * plain colour string.
 */
function paintsOpaque(stack) {
  const styled = stack.styles?.backgroundColor;
  if (styled && typeof styled === 'object' && opaqueColour(styled.custom)) return true;
  if (typeof styled === 'string' && styled.startsWith('bg-') && !/transparent|alpha/iu.test(styled)) return true;
  return opaqueColour(stack.customStyles?.backgroundColor);
}

// The highlight fades the Pressable's OWN background, so an opaque only-child Stack covers it.
function coveringStack(walk, pressable) {
  if (pressable.childIds.length !== 1) return null;
  const child = walk.facts.get(pressable.childIds[0]);
  return child?.type === 'Stack' && paintsOpaque(child) ? child : null;
}

function pressableFindings(walk, block) {
  const interactions = block.interactions;
  if (!interactions || typeof interactions !== 'object') {
    return [makeFinding('U1', 'blocking', block, 'appearance.interactions',
      'this Pressable sets no appearance.interactions, so a press shows nothing on either platform: no fade, no shrink, no ripple',
      SURFACE_FIX)];
  }
  const feedback = pressFeedback(interactions);
  if (feedback.ios.length === 0 || feedback.android.length === 0) {
    return [makeFinding('U1', 'blocking', block, 'appearance.interactions', silentPressDetail(feedback, interactions),
      `${SURFACE_FIX}; write a highlight as a palette id or { "custom": "#RRGGBBAA" }`)];
  }
  const cover = feedback.ios.length === 1 && feedback.ios[0] === 'highlight' ? coveringStack(walk, block) : null;
  if (!cover) return [];
  return [makeFinding('U1', 'blocking', block, 'appearance.interactions.highlightColor',
    `the highlight is this Pressable's only feedback, and it fades the Pressable's own background, which its only child, the Stack '${cover.id}', paints over with an opaque background: a press shows nothing`,
    `move the background colour from '${cover.id}' onto the Pressable, or give the Pressable an opacity or scale change`)];
}

/** The Pressable a tap on `rootId` lands on: the block itself, or reached from it through single children. */
function tapSurface(walk, rootId) {
  let block = walk.facts.get(rootId);
  const seen = new Set();
  while (block && block.type !== 'Pressable' && block.childIds.length === 1 && !seen.has(block.id)) {
    seen.add(block.id);
    block = walk.facts.get(block.childIds[0]);
  }
  return block?.type === 'Pressable' ? block : null;
}

// A Pressable inside a row takes the tap before the row's onSelectItem does, so a row whose
// tap surface is a Pressable runs that Pressable's onPress, never onSelectItem.
function rowTapFindings(walk, list) {
  const reads = `read the row as {{ ${list.id}['context']['item'] }} instead of selectedItem`;
  const surface = tapSurface(walk, list.content?.blockId);
  if (!surface) {
    return [makeFinding('U1', 'blocking', list, 'events.onSelectItem',
      "this Repeatable's row tap (onSelectItem) has no Pressable as the row's tap surface, so a tap on the row shows nothing",
      `make a Pressable the row template's root, move the onSelectItem actions onto its onPress (${reads}), remove onSelectItem, and give the Pressable feedback`)];
  }
  if (hasEventType(surface.events, 'onPress') || hasEventType(surface.events, 'onLongPress')) return [];
  return [makeFinding('U1', 'blocking', list, 'events.onSelectItem',
    `the row's tap surface, the Pressable '${surface.id}', takes every tap on the row first and has no onPress, so a tap runs nothing: this onSelectItem chain never fires`,
    `move the onSelectItem actions onto the onPress of '${surface.id}' (${reads}) and remove onSelectItem`)];
}

// A static Carousel draws content.items, any other its one content.blockId slide template.
function slideRootIds(carousel) {
  const content = carousel.content ?? {};
  if (content.type === 'STATIC') return (Array.isArray(content.items) ? content.items : []).map(item => item?.blockId).filter(id => typeof id === 'string');
  return typeof content.blockId === 'string' ? [content.blockId] : [];
}

function slideTapFindings(walk, carousel) {
  const bare = slideRootIds(carousel).filter(slideId => walk.facts.has(slideId) && !tapSurface(walk, slideId));
  if (bare.length === 0 && slideRootIds(carousel).some(slideId => walk.facts.has(slideId))) return [];
  return [makeFinding('U1', 'blocking', carousel, 'events.onSlideClick',
    "this Carousel's slide tap (onSlideClick) has no Pressable as the slide's tap surface, so a tap on a slide shows nothing",
    "make a Pressable each slide's root, move the onSlideClick actions onto its onPress, and give it feedback")];
}

// R13: appearance.interactions is a Pressable-only key. Button, IconButton and Card carry
// their own built-in press feedback and are exempt from this check entirely.
function u1Findings(walk) {
  const findings = [];
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    if (block.type === 'Pressable') {
      findings.push(...pressableFindings(walk, block));
    } else if (DEAD_TAP_TYPES.has(block.type) && block.events.length > 0) {
      const events = [...new Set(block.events.map(event => event.eventType))].join(', ');
      findings.push(makeFinding('U1', 'blocking', block, 'events',
        `this ${block.type} takes no tap on the phone, so its ${events} never fires`,
        'wrap it in a Pressable, move the actions onto the Pressable\'s onPress, and give the Pressable feedback'));
    } else if (block.type === 'Image' && block.events.length > 0) {
      findings.push(makeFinding('U1', 'blocking', block, 'events',
        'this Image fires its tap with no press feedback',
        'wrap it in a Pressable, move the actions onto the Pressable\'s onPress, and give the Pressable feedback'));
    } else if (block.type === 'Repeatable' && hasEventType(block.events, 'onSelectItem')) {
      findings.push(...rowTapFindings(walk, block));
    } else if (block.type === 'Carousel' && hasEventType(block.events, 'onSlideClick')) {
      findings.push(...slideTapFindings(walk, block));
    }
  }
  return findings;
}

// ---- U7 — a hitSlop the phone reads -------------------------------------------------------

// rules-structure.mjs reports a small Pressable with no hitSlop; this reports one whose hitSlop
// the phone drops. The phone reads { all: n }, { custom: { top, right, bottom, left } }, or the
// sides themselves, and turns anything else, a bare number included, into no hitSlop at all.
const INSET_SIDES = ['top', 'right', 'bottom', 'left'];
const hasNumericSide = insets => INSET_SIDES.some(side => typeof insets?.[side] === 'number');

function hitSlopReadable(hitSlop) {
  if (!hitSlop || typeof hitSlop !== 'object' || Array.isArray(hitSlop)) return false;
  if (typeof hitSlop.all === 'number') return true;
  if (hitSlop.custom && typeof hitSlop.custom === 'object') return hasNumericSide(hitSlop.custom);
  return hasNumericSide(hitSlop);
}

function u7Findings(walk, ctx) {
  const findings = [];
  const minPt = ctx.thresholds.tapMinPt;
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    const hitSlop = block.type === 'Pressable' ? block.appearance?.hitSlop : null;
    // An absent hitSlop is the structure check's; a binding resolves only on the phone.
    if (!hitSlop || JSON.stringify(hitSlop).includes('{{') || hitSlopReadable(hitSlop)) continue;
    const { width, height } = block.customStyles ?? {};
    const sized = typeof width === 'number' && typeof height === 'number';
    if (sized && width >= minPt && height >= minPt) continue;
    const all = typeof hitSlop === 'number' ? hitSlop : 'n';
    findings.push(makeFinding('U7', 'advisory', block, 'appearance.hitSlop',
      `hitSlop ${JSON.stringify(hitSlop)} is not an object the phone reads, so it is dropped and the tap area does not grow${sized ? `: the target stays ${width}×${height}pt, under the ${minPt}pt minimum` : ''}`,
      `write it as { "all": ${all} }, or per side as { "custom": { "top": n, "right": n, "bottom": n, "left": n } }, enough to reach ${minPt}pt`));
  }
  return findings;
}

// ---- P2 — block inputs are plain references, not adaptation -----------------------------

// The same test the page-builder tools warn with after every write: each {{ }} expression of a
// block input, trimmed, is heavy when it holds a function, runs an array method, or is over the
// character limit. `.find(` is not on the list. Only `component.content` and `component.appearance` are block inputs.
const BINDING_EXPRESSION = /\{\{([\s\S]*?)\}\}/gu;
const FUNCTION_BODY = /\bfunction\b|=>/u;
const ARRAY_PIPELINE = /\.(filter|map|flatMap|reduce|sort|forEach)\s*\(/u;
const BLOCK_INPUT_PATH = /^component\.(?:content|appearance)(?:$|[.[])/u;

/** Why one `{{ }}` expression reads as data adaptation, or null when it reads as a reference. */
function heavinessOf(expression, maxChars) {
  const trimmed = expression.trim();
  if (FUNCTION_BODY.test(trimmed)) return 'holds a function';
  const pipeline = ARRAY_PIPELINE.exec(trimmed);
  if (pipeline) return `runs an array method (.${pipeline[1]})`;
  if (trimmed.length > maxChars) return `is ${trimmed.length} characters long (over ${maxChars})`;
  return null;
}

// One finding per input path, on the first heavy expression in it. The tool warns the same
// way; the audit adds the severity: a template repeats the expression once per row.
function p2Findings(walk, ctx) {
  const findings = [];
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    for (const binding of block.bindings) {
      if (!BLOCK_INPUT_PATH.test(binding.path)) continue;
      const reason = [...binding.text.matchAll(BINDING_EXPRESSION)]
        .map(match => heavinessOf(match[1], ctx.thresholds.bindingChars)).find(Boolean);
      if (!reason) continue;
      findings.push(makeFinding('P2', block.inTemplate ? 'blocking' : 'advisory', block, binding.path,
        `${binding.path} has a binding that ${reason}`,
        "move the data adaptation into a manual page function (runBehaviour 'manual', run by a triggerFunction action on page load or on the data source's onSuccess) and bind the block to {{ func_x['value'] }}"));
    }
  }
  return findings;
}

// ---- P3 — data source budget -------------------------------------------------------------

// A duplicate-automation pair and an over-budget count are two different problems on the same
// page — a page can have both, and both findings fire (R: "emit both", not one instead of the other).
function p3Findings(walk, ctx) {
  const onLoadSources = ctx.sources.filter(source => source.onLoad);
  if (onLoadSources.length === 0) return [];
  const body = walk.facts.get(walk.roots.body);
  const findings = [];

  const byAutomation = new Map();
  for (const source of onLoadSources) {
    if (!source.automationId) continue;
    const group = byAutomation.get(source.automationId) ?? [];
    group.push(source);
    byAutomation.set(source.automationId, group);
  }
  const duplicateGroup = [...byAutomation.values()].find(group => group.length > 1);
  if (duplicateGroup) {
    const names = duplicateGroup.map(source => source.name).join(', ');
    findings.push(makeFinding('P3', 'advisory', body, 'dataSources',
      `${names} both call the same automation on page load — two sources doing one callable's job`,
      `merge ${names} into one source`));
  }

  const count = onLoadSources.length;
  if (count < ctx.thresholds.onLoadAdvisory) return findings;
  const severity = count >= ctx.thresholds.onLoadBlocking ? 'blocking' : 'advisory';
  const cost = severity === 'blocking' ? ": every one writes isLoading/data/error into the one store and re-runs every block's selector" : '';
  findings.push(makeFinding('P3', severity, body, 'dataSources',
    `${count} on-load sources${cost}${lateNote(ctx.sources)}${unreadNote(ctx.sources)}`,
    `${deferFix(onLoadSources)}merge or defer sources so the page starts at the 2-4 source budget`));
  return findings;
}

const whereLate = ({ sheets, tabs }) => [
  ...(sheets.length > 0 ? [`inside the BottomSheet${sheets.length > 1 ? 's' : ''} ${sheets.join(', ')}, whose blocks mount about 4 s after the page settles`] : []),
  ...(tabs ? ['inside a Tabs pane that mounts when its tab first opens'] : []),
].join(' or ');

/** The automatic sources left out of the count because only blocks that mount after the load read them. */
function lateNote(sources) {
  const late = sources.filter(source => !source.onLoad && source.lateReaders);
  if (late.length === 0) return '';
  return `; not counted: ${late.map(source => `${source.name}, read only ${whereLate(source.lateReaders)}`).join('; ')}`;
}

/** The automatic app sources left out of the count because this page never reads them. */
function unreadNote(sources) {
  const unread = sources.filter(source => source.scope === 'app' && source.automatic && !source.onLoad && !source.readByPage).length;
  if (unread === 0) return '';
  return `; not counted: ${unread} app source${unread === 1 ? '' : 's'} this page never reads`;
}

// A flagged automatic source that only late blocks read still loads with the page; with the
// flag off it starts when the first of those blocks mounts.
function deferFix(onLoadSources) {
  const deferrable = onLoadSources.filter(source => source.flagged && source.automatic && source.lateReaders);
  if (deferrable.length === 0) return '';
  const one = deferrable.length === 1;
  return `turn runQueryOnPageLoad off on ${deferrable.map(source => source.name).join(', ')}: only blocks that mount after the load read ${one ? 'it' : 'them'}, so ${one ? 'it' : 'each'} would start when they mount; `;
}

// ---- P7 — a page function's dataSourceIds match what it reads ---------------------------

function p7Findings(walk, ctx) {
  const findings = [];
  const body = walk.facts.get(walk.roots.body);
  for (const pageFunction of Object.values(ctx.functions ?? {})) {
    if (typeof pageFunction?.functionBody !== 'string') continue;
    const readIds = new Set(pageFunction.functionBody.match(SOURCE_ID_PATTERN) ?? []);
    const declaredIds = new Set(listOf(pageFunction.dataSourceIds));
    const missingIds = [...readIds].filter(sourceId => !declaredIds.has(sourceId));
    const label = pageFunction.name ?? pageFunction.id;
    if (missingIds.length > 0) {
      // create_page_functions and update_page_functions derive dataSourceIds from the {{ }}
      // reads in the body and refuse a dataSourceIds key, so the fix is in the body.
      const reads = missingIds.map(sourceId => `{{ ${sourceId}[…] }}`).join(', ');
      findings.push(makeFinding('P7', 'advisory', body, `pageFunctions.${pageFunction.id}.dataSourceIds`,
        `${label} reads ${missingIds.join(', ')} but its dataSourceIds is [${[...declaredIds].join(', ')}]`,
        `read ${missingIds.join(', ')} in the function body as ${reads} (a create_page_functions or update_page_functions step), so the tool derives dataSourceIds from the body; never send a dataSourceIds key, which the tool refuses`));
    }
    if (pageFunction.runBehaviour === 'automatic' && readIds.size > 1) {
      findings.push(makeFinding('P7', 'advisory', body, `pageFunctions.${pageFunction.id}.runBehaviour`,
        `${label} is automatic but reads ${readIds.size} sources`,
        'split into one function per source, or make it manual'));
    }
  }
  return findings;
}

// ---- P10 — one network refresh per interaction ------------------------------------------

/**
 * One event chain, one branch: two or more separate setPageVariable writes to variables an
 * automatic source reads, or such a write followed by an explicit trigger of that same source.
 * Each write reruns the source on its own, so one tap costs one call per write. The fix is never
 * an executeScript: the page-builder tools warn on every inline script they store.
 */
function refreshFinding(block, event, branch, source, writes, triggered) {
  const severity = source.automationId ? 'blocking' : 'advisory';
  const varIds = [...new Set(writes.map(write => write.payload.variableId))];
  const parts = [];
  if (writes.length > 1) parts.push(`${writes.length} separate setPageVariable writes (${varIds.join(', ')})`);
  if (triggered) parts.push('an explicit trigger after the write');
  const fix = [];
  if (writes.length > 1) fix.push(`hold ${varIds.join(', ')} in one object page variable that ${source.name} reads, written with a single setPageVariable MERGE`);
  if (triggered) fix.push(`drop the controlDataSource trigger of ${source.id}: changing its inputs already reruns it`);
  const manual = triggered ? 'that trigger is its one run' : 'one controlDataSource after the writes is its one run';
  return makeFinding('P10', severity, block, `events.${event.eventType}`,
    `on the ${branch} branch, ${parts.join(' and ')} each rerun the automatic source ${source.name} (${source.id})`,
    `${fix.join(', and ')}; or, when nothing else needs ${source.name} to rerun on its own, make it manual so ${manual}`);
}

// A whole-id match, so var_ab never matches inside var_abc. The stored id is text, never a
// pattern: it is escaped, so an id such as "{{ func_x }}" is looked for as it is written.
const escapeForPattern = text => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const readsVariable = (source, variableId) => new RegExp(`(?<![\\w$])${escapeForPattern(variableId)}(?![\\w$])`, 'u').test(source.inputsText);

function p10ChainFindings(block, event, sources) {
  const findings = [];
  const branches = new Map();
  for (const action of event.actions) {
    if (!branches.has(action.branch)) branches.set(action.branch, []);
    branches.get(action.branch).push(action);
  }
  for (const [branch, actions] of branches) {
    for (const source of sources) {
      const writes = [];
      let triggered = false;
      for (const action of actions) {
        const variableId = action.actionType === 'setPageVariable' ? action.payload?.variableId : null;
        if (typeof variableId === 'string' && readsVariable(source, variableId)) writes.push(action);
        if (action.actionType === 'controlDataSource' && action.payload?.dataSourceId === source.id && writes.length > 0) triggered = true;
      }
      if (writes.length > 1 || triggered) findings.push(refreshFinding(block, event, branch, source, writes, triggered));
    }
  }
  return findings;
}

function p10Findings(walk, ctx) {
  const sources = (ctx.sources ?? []).filter(source => source.automatic);
  if (sources.length === 0) return [];
  const findings = [];
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    for (const event of block.events) findings.push(...p10ChainFindings(block, event, sources));
  }
  const body = walk.facts.get(walk.roots.body);
  for (const event of normalizeEvents(ctx.pageEvents)) findings.push(...p10ChainFindings(body, event, sources));
  return findings;
}

// ---- U11 — close a BottomSheet only while it is open ---------------------------------------

/** The block id a close action targets: controlDrawer hide, controlBlockMethod hideDrawer, or the stored controlBottomSheet hide. */
function closedTargetId(action) {
  const payload = action.payload ?? {};
  if (action.actionType === 'controlDrawer' && payload.operation === 'hide') return payload.drawerId;
  if (action.actionType === 'controlBlockMethod' && payload.methodName === 'hideDrawer') return payload.blockId;
  if (action.actionType === 'controlBottomSheet' && payload.operation === 'hide') return payload.bottomSheetId;
  return null;
}

/** Does a run condition read the sheet's own open flag ({{ <id>.state.open }} in any spelling)? */
function readsOpenFlag(runCondition, sheetId) {
  if (runCondition?.type !== 'filter') return false;
  return leafFilters(runCondition.payload).some(entry => typeof entry?.property === 'string'
    && entry.property.includes(sheetId) && /\bstate\b/u.test(entry.property) && /\bopen\b/u.test(entry.property));
}

// hideDrawer on a sheet that is already closed never resolves, and the sheet stops opening until
// the person leaves the page. Judged only where the walk hands over the action's runCondition.
function sheetCloseFindings(owner, event, sheets) {
  const findings = [];
  for (const action of event.actions) {
    if (!Object.hasOwn(action, 'runCondition') || action.disabled === true) continue;
    const sheet = sheets.get(closedTargetId(action));
    if (!sheet || readsOpenFlag(action.runCondition, sheet.id)) continue;
    findings.push(makeFinding('U11', 'blocking', owner, `events.${event.eventType}`,
      `on the ${action.branch} branch, ${action.actionType} closes the BottomSheet ${sheet.name} (${sheet.id}) with no run condition on its state.open: on a sheet that is already closed the close never finishes, and the sheet stops opening until the person leaves the page`,
      `give that action the runCondition { "type": "filter", "payload": { "operator": "AND", "filters": [{ "property": "{{ ${sheet.id}.state.open }}", "filter": { "operator": "EQUAL", "value": "true" } }] } }`));
  }
  return findings;
}

function u11Findings(walk, ctx) {
  const sheets = new Map(walk.order.map(id => walk.facts.get(id)).filter(block => block.type === 'BottomSheet').map(block => [block.id, block]));
  if (sheets.size === 0) return [];
  const findings = [];
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    for (const event of block.events) findings.push(...sheetCloseFindings(block, event, sheets));
  }
  const body = walk.facts.get(walk.roots.body);
  for (const event of normalizeEvents(ctx.pageEvents)) findings.push(...sheetCloseFindings(body, event, sheets));
  return findings;
}

// ---- P14 — a block's own state, not a page variable that copies it -----------------------

// A toggle or default ButtonGroup holds its selection from first appearance; a dropdown holds none until a tap.
const SELECTING_GROUP_TYPES = new Set(['toggle', 'default']);

/** `{{ b_x['value'] }}`, `{{ b_x.value }}` or `{{ actionContext.value }}`: the block's own value, as written in its own handler. */
function readsOwnValue(value, blockId) {
  if (typeof value !== 'string') return false;
  const inner = value.trim().replace(/^\{\{\s*/u, '').replace(/\s*\}\}$/u, '');
  const own = [`${blockId}['value']`, `${blockId}["value"]`, `${blockId}.value`, "actionContext['value']", 'actionContext["value"]', 'actionContext.value'];
  return own.includes(inner);
}

/**
 * Every write of each page variable: `writes` are its setPageVariable actions with the block
 * they sit on (null for a page event), and `other` is true when any other action or a data
 * source callback names the variable, since a script or a callback may write it too.
 */
function variableWrites(walk, ctx) {
  const byId = new Map(Object.keys(ctx.variables ?? {}).map(id => [id, { writes: [], other: false }]));
  const visit = (owner, event) => {
    for (const action of event.actions) {
      const target = action.payload?.variableId;
      if (action.actionType === 'setPageVariable' && byId.has(target)) {
        byId.get(target).writes.push({ owner, event, action });
        continue;
      }
      const text = JSON.stringify(action.payload ?? null);
      for (const [id, entry] of byId) if (action.actionType !== 'setPageVariable' && text.includes(id)) entry.other = true;
    }
  };
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    for (const event of block.events) visit(block, event);
  }
  for (const event of normalizeEvents(ctx.pageEvents)) visit(null, event);
  for (const source of ctx.sources ?? []) {
    for (const [id, entry] of byId) if (source.callbacksText?.includes(id)) entry.other = true;
  }
  return byId;
}

/** Writes are all a plain SET on the main branch of one block's own events; returns that block, else null. */
function soleWriter(writes) {
  if (writes.length === 0) return null;
  const owner = writes[0].owner;
  if (!owner) return null;
  const plain = writes.every(write => write.owner === owner && write.action.branch === 'main'
    && write.action.disabled !== true && (write.action.payload?.operationDetails?.operation ?? 'SET') === 'SET');
  return plain ? owner : null;
}

/** Each option of a selecting ButtonGroup writes its own fixed value: the variable only names the selected option. */
function mirrorsSelection(block, writes) {
  if (block.type !== 'ButtonGroup' || block.content?.mode === 'mapped') return null;
  if (block.content?.type !== undefined && !SELECTING_GROUP_TYPES.has(block.content.type)) return null;
  const valueByOption = new Map();
  for (const { event, action } of writes) {
    const value = action.payload?.operationDetails?.value;
    if (event.eventType !== 'onClick' || !event.targetId || isBound(value) || valueByOption.has(event.targetId)) return null;
    valueByOption.set(event.targetId, String(value));
  }
  if (new Set(valueByOption.values()).size !== valueByOption.size) return null;
  return [...valueByOption].map(([option, value]) => `${option} → ${value}`).join(', ');
}

function p14Findings(walk, ctx) {
  const findings = [];
  for (const [variableId, { writes, other }] of variableWrites(walk, ctx)) {
    const block = other ? null : soleWriter(writes);
    if (!block) continue;
    const name = ctx.variables[variableId]?.name ?? variableId;
    const events = [...new Set(writes.map(write => write.event.eventType))].join(', ');
    const selection = mirrorsSelection(block, writes);
    if (selection) {
      findings.push(makeFinding('P14', 'advisory', block, `events.${events}`,
        `the page variable ${name} (${variableId}) only records which option of this ${block.type} is selected (${selection}); the block already holds that as {{ ${block.id}['selectedOptionId'] }} from the moment it appears`,
        `read {{ ${block.id}['selectedOptionId'] }} wherever ${variableId} is read (compare it to the option id), then remove these setPageVariable actions and delete ${variableId}`));
      continue;
    }
    if (writes.every(write => readsOwnValue(write.action.payload?.operationDetails?.value, block.id))) {
      findings.push(makeFinding('P14', 'advisory', block, `events.${events}`,
        `the page variable ${name} (${variableId}) only copies this ${block.type}'s own value, which the block already holds as {{ ${block.id}['value'] }}`,
        `read {{ ${block.id}['value'] }} wherever ${variableId} is read, then remove these setPageVariable actions and delete ${variableId}`));
    }
  }
  return findings;
}

// ---- shared data-region helpers (X1, X4) -------------------------------------------------

/** The condition object's property strings, flattened to one searchable blob — see rulebook.md's X1/X4 entries. */
function visibilityText(block) {
  return JSON.stringify(block.visibility ?? {});
}

function leafFilters(node) {
  if (Array.isArray(node?.filters)) return node.filters.flatMap(entry => leafFilters(entry));
  return node && typeof node === 'object' ? [node] : [];
}

/** Every leaf filter of the visibility condition. Groups nest — a real home page's error view puts its EXISTS inside an OR — so they are flattened. */
function visibilityFilters(block) {
  return leafFilters(block.visibility?.conditions?.payload);
}

/** Does any leaf filter's `property` contain `substring`, read with an operator `acceptsOperator` allows? */
function hasFilterReading(block, substring, acceptsOperator) {
  return visibilityFilters(block).some(filterEntry => {
    const property = filterEntry?.property;
    return typeof property === 'string' && property.includes(substring) && acceptsOperator(filterEntry?.filter?.operator);
  });
}

// R12: a data region shows a source's data in its content — component.content (a value, data,
// src, items, options, a label…). A switch never makes one: appearance (disabled, loading,
// styles), a content switch (disabled, readOnly, loading, hidden, visible) or paging settings
// (content.addOns) only react to the data, and a visibility-only read (an empty/error-state
// block testing the same source) is a STATE block reacting to the region, not the region
// itself. A Loader is never a region either, so its own gating condition (which legitimately
// mentions ['data']/['error']) never makes it one.
const CONTENT_PATH = /^component\.content(?:\.|\[)/u;
const SWITCH_PATH = /^component\.content\.addOns(?:\.|\[|$)|\.(?:disabled|isDisabled|readOnly|isReadOnly|loading|isLoading|hidden|isHidden|visible|isVisible|visibility)$/u;

function dataRegionBindings(block) {
  if (block.type === 'Loader') return [];
  return block.bindings.filter(binding => CONTENT_PATH.test(binding.path) && !SWITCH_PATH.test(binding.path)
    && binding.sourceIds.length > 0 && binding.text.includes("['data']"));
}

function siblingsOf(walk, block) {
  const parent = walk.facts.get(block.parentId);
  if (!parent) return null;
  return parent.childIds.map(childId => walk.facts.get(childId)).filter(Boolean);
}

/** Every data region that has a parent, with its sorted source ids, in document order. The root body is skipped. */
function dataRegions(walk) {
  const regions = [];
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    const regionBindings = dataRegionBindings(block);
    if (regionBindings.length === 0 || !walk.facts.has(block.parentId)) continue;
    regions.push({ block, sourceIds: [...new Set(regionBindings.flatMap(binding => binding.sourceIds))].sort() });
  }
  return regions;
}

/**
 * The first sibling `isGate` accepts beside `block` or beside any of its ancestors, nearest level
 * first, or null. A gate at one level covers the whole subtree under the block it sits beside.
 */
function coveredAtAnyLevel(walk, block, isGate) {
  for (const memberId of [block.id, ...block.ancestors]) {
    const member = walk.facts.get(memberId);
    const gate = (siblingsOf(walk, member) ?? []).find(sibling => sibling.id !== memberId && isGate(sibling));
    if (gate) return gate;
  }
  return null;
}

// Every level from a region's parent upward is shared by all of that parent's regions, so they
// share one verdict: X1's also hangs on which sources a gate names, X4's never reads them (R32).
const loaderGroupKey = ({ block, sourceIds }) => `${block.parentId}|${sourceIds.join(',')}`;
const stateGroupKey = ({ block }) => block.parentId;

/** Uncovered regions grouped by `keyOf`, in document order: the first region's fields, its parent, and the group's size. */
function groupRegions(walk, regions, keyOf) {
  const groups = new Map();
  for (const region of regions) {
    const key = keyOf(region);
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { ...region, parent: walk.facts.get(region.block.parentId), count: 1 });
  }
  return [...groups.values()];
}

// ---- X1 — static chrome first, a loader over every data region --------------------------

/** Does any descendant of `block` render a Loader? Memoised per block id in `memo`. */
function containsLoader(walk, block, memo) {
  if (!memo.has(block.id)) {
    memo.set(block.id, block.childIds.some(childId => {
      const child = walk.facts.get(childId);
      return Boolean(child) && (child.type === 'Loader' || containsLoader(walk, child, memo));
    }));
  }
  return memo.get(block.id);
}

// A gate is what shows in a region's place while its source loads: a Loader, or a skeleton
// container holding one, whose visibility names one of the region's sources. A content section
// gated on the same source but holding no Loader shows nothing while it loads, so it is no gate.
function isLoaderGate(walk, sibling, sourceIds, loaderMemo) {
  const text = visibilityText(sibling);
  if (!sourceIds.some(sourceId => text.includes(sourceId))) return false;
  return sibling.type === 'Loader' || containsLoader(walk, sibling, loaderMemo);
}

function readsIsLoadingOnly(gate) {
  const text = visibilityText(gate);
  return text.includes("['isLoading']") && !text.includes("['data']") && !text.includes("['error']");
}

function missingLoaderFinding({ block, parent, sourceIds, count }) {
  if (count === 1) {
    return makeFinding('X1', 'blocking', block, 'component',
      `this data region reads ${sourceIds.join(', ')} with no sibling CONTENT Loader covering it`,
      'add a sibling CONTENT Loader, visible while the source has neither data nor error');
  }
  return makeFinding('X1', 'blocking', parent, 'component.content.blockIds',
    `${count} blocks under this ${parent.type} read ${sourceIds.join(', ')} with no sibling CONTENT Loader covering them`,
    'add one CONTENT Loader as a child of this block, visible while the source has neither data nor error');
}

function isLoadingOnlyFinding(gate) {
  return makeFinding('X1', 'blocking', gate, 'visibility',
    `this ${gate.type}'s visibility reads isLoading alone, which misses the gap before a manual source's request even starts`,
    'change the loader to show while the source has neither data nor error');
}

function x1Findings(walk) {
  const loaderMemo = new Map();
  const uncovered = [];
  const gatesById = new Map();
  for (const region of dataRegions(walk)) {
    const gate = coveredAtAnyLevel(walk, region.block, sibling => isLoaderGate(walk, sibling, region.sourceIds, loaderMemo));
    if (gate) gatesById.set(gate.id, gate);
    else uncovered.push(region);
  }
  return [
    ...groupRegions(walk, uncovered, loaderGroupKey).map(missingLoaderFinding),
    ...[...gatesById.values()].filter(readsIsLoadingOnly).map(isLoadingOnlyFinding),
  ];
}

// ---- X2 — feedback on every interaction --------------------------------------------------

const ASYNC_ACTION_TYPES = new Set(['controlDataSource', 'submitForm', 'triggerFunction']);

// Button and IconButton draw a spinner from appearance.loading. A Pressable has no loading
// state, so a slow chain on one is the session's to judge (a separate Loader it drives).
const LOADING_SURFACE_TYPES = new Set(['Button', 'IconButton']);

const BIND_LOADING = 'bind appearance.loading as { "type": "filter", "payload": … } to the isLoading of the source the chain calls, or to a page variable the chain sets while it runs';

function actionTypesOf(block) {
  return block.events.flatMap(event => event.actions.map(action => action.actionType));
}

const callsOrSubmits = action => action.actionType === 'controlDataSource' || action.actionType === 'submitForm'
  || (action.actionType === 'controlBlockMethod' && action.payload?.methodName === 'submitForm');

/** What a press starts that outlasts the tap: 'blocking' for a source call or a form submit (a submit-type Button submits its form itself), 'advisory' for a page function. */
function slowWork(block) {
  const actions = block.events.flatMap(event => event.actions);
  const submitsItself = block.type === 'Button' && block.content?.type === 'submit' && Boolean(block.content?.formBlockId);
  if (submitsItself || actions.some(callsOrSubmits)) return 'blocking';
  return actions.some(action => action.actionType === 'triggerFunction') ? 'advisory' : null;
}

/** Does a filter condition read something from the page? An empty group or a literal reads nothing. */
const readsThePage = payload => leafFilters(payload).some(entry => isBound(entry?.property));

/**
 * How the phone reads appearance.loading: 'bound' when it follows the page, 'off', or 'stuck' with
 * why. A `{ type, payload }` condition and a `{{ }}` binding are resolved to true or false before
 * the button renders; any other value goes to the button as it is, and a truthy one shows the
 * spinner and turns the press off for good — an object most of all, whatever it holds. Only an
 * IconButton also unwraps `{ conditionalValueFilters, defaultValue }`.
 */
function loadingState(block) {
  const loading = block.loading;
  if (typeof loading === 'string' && isBound(loading)) return { state: 'bound' };
  if (!loading || typeof loading !== 'object') {
    return loading ? { state: 'stuck', why: `${JSON.stringify(loading)}, which reads as true` } : { state: 'off' };
  }
  if (loading.type === 'boolean' && typeof loading.payload === 'boolean') {
    return loading.payload ? { state: 'stuck', why: 'pinned on as { "type": "boolean", "payload": true }' } : { state: 'off' };
  }
  if (loading.type === 'filter' && loading.payload && typeof loading.payload === 'object') return { state: readsThePage(loading.payload) ? 'bound' : 'off' };
  if (block.type === 'IconButton' && Object.hasOwn(loading, 'conditionalValueFilters')) return { state: 'bound' };
  if (loading.value === 'conditions') return { state: 'stuck', why: 'stored in the visibility shape { "value": "conditions", "conditions": … }, an object the button reads as true' };
  return { state: 'stuck', why: `the object ${JSON.stringify(loading).slice(0, 80)}, which the button reads as true` };
}

function x2Findings(walk) {
  const findings = [];
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    if (!LOADING_SURFACE_TYPES.has(block.type)) continue;
    const loading = loadingState(block);
    if (loading.state === 'stuck') {
      findings.push(makeFinding('X2', 'blocking', block, 'appearance.loading',
        `this ${block.type}'s appearance.loading is ${loading.why}, so it always shows its spinner and never takes a press`,
        `${BIND_LOADING}, or remove it`));
      continue;
    }
    const work = slowWork(block);
    if (!work || loading.state === 'bound') continue;
    findings.push(makeFinding('X2', work, block, 'appearance.loading',
      work === 'blocking'
        ? `this ${block.type}'s chain calls a source or submits a form, and its appearance.loading is bound to nothing`
        : `this ${block.type}'s chain runs a page function, and its appearance.loading is bound to nothing`,
      BIND_LOADING));
  }
  return findings;
}

// ---- X3 — fixed boxes for images and measuring blocks ------------------------------------

function hasExplicitBox(block) {
  const { width, height } = blockBox(block);
  return width !== null && height !== null;
}

function x3Findings(walk) {
  const findings = [];
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    if (block.type === 'Image') {
      const hasBoundSrc = block.bindings.some(binding => binding.path.toLowerCase().includes('src'));
      if (hasBoundSrc && !hasExplicitBox(block)) {
        findings.push(makeFinding('X3', 'blocking', block, 'appearance.styles',
          'this data-bound Image has no fixed width/height, so the layout jumps once it loads',
          'set both width and height on the Image up front'));
      }
    } else if (block.type === 'Loader' && block.content?.type === 'CONTENT' && !hasExplicitBox(block)) {
      findings.push(makeFinding('X3', 'blocking', block, 'appearance.styles',
        'this CONTENT Loader has no fixed width/height, so it collapses before the real content measures in',
        'set both width and height on the Loader up front'));
    }
  }
  return findings;
}

// ---- X4 — empty and error states on every data region -------------------------------------

// A correctly-configured Loader reads ['error'] MISSING — "still loading" — and a content section
// gated on ['error'] MISSING shows only when there is no error: both are the opposite of an error
// state, so neither counts. A real error state is a non-Loader block reading ['error'] with any
// other operator (EXISTS, the one X1's own fix text asks the Loader NOT to use), or binding it bare.
function readsErrorState(block) {
  if (block.type === 'Loader') return false;
  const bareValue = block.visibility?.value;
  if (typeof bareValue === 'string' && bareValue.includes("['error']")) return true;
  return hasFilterReading(block, "['error']", operator => operator !== 'MISSING');
}

// The builder stores a length comparison as ['length'] as often as .length (a real home page's section gates).
function comparesLength(block) {
  const text = visibilityText(block);
  return text.includes('.length') || text.includes("['length']");
}

function missingStatesFinding({ block, parent, count, hasErrorState, hasLengthCheck }) {
  const missingLabel = !hasLengthCheck && !hasErrorState ? 'no empty or error state'
    : !hasLengthCheck ? 'no empty state'
    : 'no error state';
  const placement = count === 1 ? 'a sibling' : 'a child';
  const fixParts = [];
  if (!hasLengthCheck) fixParts.push(`${placement} whose visibility compares the array's .length to 0, for the empty state`);
  if (!hasErrorState) fixParts.push(`${placement} whose visibility reads ['error'] with EXISTS, for the error state`);
  const fix = `add ${fixParts.join(' and ')}`;

  if (count === 1) return makeFinding('X4', 'blocking', block, 'visibility', `this data region has ${missingLabel}`, fix);
  return makeFinding('X4', 'blocking', parent, 'component.content.blockIds',
    `${count} blocks under this ${parent.type} have ${missingLabel}`, fix);
}

// R11: every data region needs BOTH states — missing either one (not just both) is a finding.
function x4Findings(walk) {
  const uncovered = [];
  for (const region of dataRegions(walk)) {
    const hasErrorState = coveredAtAnyLevel(walk, region.block, readsErrorState) !== null;
    const hasLengthCheck = coveredAtAnyLevel(walk, region.block, comparesLength) !== null;
    if (!hasErrorState || !hasLengthCheck) uncovered.push({ ...region, hasErrorState, hasLengthCheck });
  }
  return groupRegions(walk, uncovered, stateGroupKey).map(missingStatesFinding);
}

// ---- X5 — split the first screen -----------------------------------------------------------

const HEAVY_TYPES = new Set(['Carousel', 'Chart', 'Iframe', 'Video', 'Repeatable']);

function isFullHeightBlock(fact) {
  if (fact.styles?.height === 'h-full') return true;
  const customHeight = fact.customStyles?.height;
  return typeof customHeight === 'number' && customHeight >= 300;
}

/** The page variables an onPageLoad action flips after deferMs[0] or more: the deferral X5's fix asks for. */
function deferredVariableIds(ctx) {
  const ids = new Set();
  for (const event of normalizeEvents(ctx.pageEvents)) {
    if (event.eventType !== 'onPageLoad') continue;
    for (const action of event.actions) {
      if (action.actionType !== 'setPageVariable') continue;
      const delay = action.payload?.delayDuration;
      const variableId = action.payload?.variableId;
      if (typeof delay === 'number' && delay >= ctx.thresholds.deferMs[0] && typeof variableId === 'string' && variableId) ids.add(variableId);
    }
  }
  return ids;
}

/** Does the block's visibility read one of the deferred variables? */
const deferredBy = (block, variableIds) => [...variableIds].some(variableId => visibilityText(block).includes(variableId));

/** A deferral: a deferred page variable read back by some block's visibility. */
function hasDeferral(walk, ctx) {
  const variableIds = deferredVariableIds(ctx);
  return variableIds.size > 0 && walk.order.some(id => deferredBy(walk.facts.get(id), variableIds));
}

function bodySizeFindings(walk, ctx) {
  // A tab pane that mounts on first open is already deferred, the way this rule's own fix asks.
  const count = walk.order.filter(id => {
    const fact = walk.facts.get(id);
    return fact.slot === 'body' && !fact.mountsOnOpen;
  }).length;
  if (count <= ctx.thresholds.firstScreenBlocks) return [];
  const body = walk.facts.get(walk.roots.body);
  const deferred = hasDeferral(walk, ctx);
  const detail = deferred
    ? `the body holds ${count} blocks; something is deferred, but more of it could move behind a page variable or Tabs`
    : `the body holds ${count} blocks with nothing deferred behind a page variable or Tabs`;
  return [makeFinding('X5', deferred ? 'advisory' : 'blocking', body, 'component.content.blockIds', detail,
    'defer a below-the-fold region behind a page variable an onPageLoad action flips after 150-300ms, or move it behind Tabs')];
}

/** How many full-height blocks sit before `blockId` among its own parent's children. */
function fullHeightSiblingsBefore(walk, blockId) {
  const block = walk.facts.get(blockId);
  const parent = walk.facts.get(block.parentId);
  if (!parent) return 0;
  const ownIndex = parent.childIds.indexOf(blockId);
  const before = parent.childIds.slice(0, ownIndex).map(childId => walk.facts.get(childId)).filter(Boolean);
  return before.filter(isFullHeightBlock).length;
}

function heavyRegionFindings(walk, ctx) {
  const findings = [];
  const variableIds = deferredVariableIds(ctx);
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    if (!HEAVY_TYPES.has(block.type) || block.mountsOnOpen) continue;
    // Already behind a deferred variable, on itself or on a block above it.
    if ([id, ...block.ancestors].some(memberId => deferredBy(walk.facts.get(memberId), variableIds))) continue;
    // The brief's "whose ancestors include two or more siblings before it": a heavy block
    // nested a level or two under the full-height run (inside a wrapper Stack of its own, say)
    // never sits directly among the h-full sections, so every rendered ancestor level — the
    // block's own position, then each ancestor's position under ITS parent — is checked in turn.
    const chain = [id, ...block.ancestors];
    const fullHeightBefore = Math.max(...chain.map(chainId => fullHeightSiblingsBefore(walk, chainId)));
    if (fullHeightBefore >= 2) {
      findings.push(makeFinding('X5', 'advisory', block, 'component',
        `this ${block.type} sits below ${fullHeightBefore} full-height sections and renders immediately instead of being deferred`,
        'defer this region behind a page variable an onPageLoad action flips after 150-300ms, or move it behind Tabs'));
    }
  }
  return findings;
}

function x5Findings(walk, ctx) {
  return [...bodySizeFindings(walk, ctx), ...heavyRegionFindings(walk, ctx)];
}

/** `dataFindings(walk, ctx) → Finding[]` for U1, U7 (a dropped hitSlop), U11, P2, P3, P7, P10, P14, X1, X2, X3, X4, X5, each run by `runRules`. */
export function dataFindings(walk, ctx) {
  return runRules([
    ['U1', () => u1Findings(walk)],
    ['U7', () => u7Findings(walk, ctx)],
    ['U11', () => u11Findings(walk, ctx)],
    ['P2', () => p2Findings(walk, ctx)],
    ['P3', () => p3Findings(walk, ctx)],
    ['P7', () => p7Findings(walk, ctx)],
    ['P10', () => p10Findings(walk, ctx)],
    ['P14', () => p14Findings(walk, ctx)],
    ['X1', () => x1Findings(walk)],
    ['X2', () => x2Findings(walk)],
    ['X3', () => x3Findings(walk)],
    ['X4', () => x4Findings(walk)],
    ['X5', () => x5Findings(walk, ctx)],
  ], ctx);
}

// ---- candidate lists for the rules the session judges (U8, P6, X6, X7) -------------------

function functionIdIn(text) {
  const match = FUNCTION_ID_PATTERN.exec(text);
  return match ? match[0] : null;
}

/** `candidateLists(walk, ctx) → { interactions, navigation, lists, writes, heavy, functionBound }` (ruling R3). */
export function candidateLists(walk, ctx) {
  const interactions = [];
  const navigation = [];
  const lists = [];
  const writes = [];
  const heavy = [];
  const functionBound = [];

  for (const id of walk.order) {
    const block = walk.facts.get(id);

    if (block.events.length > 0) {
      interactions.push({ blockId: block.id, blockName: block.name, type: block.type, actionTypes: actionTypesOf(block) });
    }

    for (const event of block.events) {
      // A chain's own follow-on actions (onSuccessActions/onErrorActions, flattened by
      // normalizeEvents into further `actions` entries) are what tell the session whether a
      // write chain reports back — so once an event qualifies as a write, its WHOLE chain goes
      // into the candidate, each action carrying the branch it runs on (main/success/error).
      const isWriteChain = event.actions.some(action => ASYNC_ACTION_TYPES.has(action.actionType));
      for (const action of event.actions) {
        if (action.actionType === 'navigateToPage') {
          // How it opens, for U8: a sheet only with both keys; a page opened as a sheet cannot
          // open a second sheet on the phone (app-native native.md rule 56).
          navigation.push({
            blockId: block.id, blockName: block.name, targetPageId: action.payload?.pageId ?? null,
            transition: action.payload?.pageTransitionBehavior ?? null, overridePageAnimation: action.payload?.overridePageAnimation === true,
          });
        }
        if (isWriteChain) {
          writes.push({ blockId: block.id, blockName: block.name, actionType: action.actionType, payload: action.payload ?? null, branch: action.branch ?? 'main' });
        }
      }
    }

    if (block.type === 'Repeatable') {
      // The paging type is content.addOns.page.type (P12, P13); the source is what content.data reads.
      const dataBinding = block.bindings.find(binding => binding.path === 'component.content.data');
      lists.push({
        blockId: block.id, blockName: block.name,
        sourceIds: dataBinding?.sourceIds ?? [],
        paging: block.content?.addOns?.page?.type ?? null,
        collectChildStates: block.content?.collectChildStates ?? null,
      });
    }

    if (HEAVY_TYPES.has(block.type)) {
      heavy.push({ blockId: block.id, blockName: block.name, type: block.type, belowFold: walk.order.indexOf(id) > ctx.thresholds.firstScreenBlocks });
    }

    for (const binding of block.bindings) {
      const functionId = functionIdIn(binding.text);
      if (functionId) functionBound.push({ blockId: block.id, blockName: block.name, path: binding.path, functionId });
    }
  }

  return { interactions, navigation, lists, writes, heavy, functionBound };
}
