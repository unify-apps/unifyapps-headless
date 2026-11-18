// The interaction check's analysis: hover, focus ring, pointer cursor, keyboard reach and focus
// order, from what the collectors read in the page (the survey, the hover log, the Tab walk's
// focus log). Pure. The WEB counterpart of the MOBILE touch feedback check.
import { parseColor } from './color.mjs';

const FIELD_TAGS = new Set(['input', 'textarea', 'select']);
const FIELD_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider']);

/** The computed properties that differ between two looks of one element (and of its block). */
export function sigDiff(rest, now) {
  if (!rest || !now) return [];
  const changed = [];
  for (const part of ['el', 'block']) {
    const a = rest[part];
    const b = now[part];
    if (!a || !b) continue;
    for (const key of Object.keys(a)) if (a[key] !== b[key]) changed.push(part === 'el' ? key : `block.${key}`);
  }
  return changed;
}

/** True when a look draws an outline someone can see. */
export function hasOutline(sig) {
  if (!sig) return false;
  const width = parseFloat(sig.outlineWidth);
  const color = parseColor(sig.outlineColor);
  return sig.outlineStyle && sig.outlineStyle !== 'none' && width > 0 && (!color || color.a > 0);
}

/** A focus look someone can see: an outline, or a change of background, colour, border, shadow or underline. */
export function focusVisibleBy(rest, now) {
  if (!now) return null;
  if (hasOutline(now.el) || hasOutline(now.block)) return 'outline';
  const changed = sigDiff(rest, now);
  const seen = changed.find((key) => /backgroundColor|backgroundImage|^color|block\.color|border|boxShadow|textDecorationLine|outline/u.test(key));
  return seen ?? null;
}

const isField = (probe) => FIELD_TAGS.has(probe.tag) || FIELD_ROLES.has(probe.role);
const what = (probe) => `${probe.role ?? probe.tag}${probe.name ? ` "${probe.name}"` : ''}`;
const keyOf = (entry) => (entry.n ? `n${entry.n}` : `${entry.tag}@${entry.box?.x},${entry.box?.y}`);

/**
 * The Tab walk: which probes took focus, in which order, whether the walk went all the way round
 * (it left the app or came back to its first element), and whether focus got stuck.
 */
export function readFocusWalk(focusLog, { presses = focusLog.length, focusable = [] } = {}) {
  const entries = focusLog.filter((entry) => entry.tag !== 'body' && entry.tag !== 'iframe' && entry.tag !== 'html');
  const reached = new Set(entries.filter((entry) => entry.n).map((entry) => entry.n));
  const inApp = entries.filter((entry) => entry.inApp);
  const firstInApp = inApp[0] ? keyOf(inApp[0]) : null;
  let leftApp = false;
  let wrapped = false;
  let seenApp = false;
  let wrapAt = null;
  for (const [at, entry] of entries.entries()) {
    if (entry.inApp) {
      if ((seenApp && leftApp) || (seenApp && keyOf(entry) === firstInApp && entry !== inApp[0])) { wrapped = true; wrapAt = at; break; }
      seenApp = true;
    } else if (seenApp) leftApp = true;
  }
  // The walk in order up to where it came round again: what is after belongs to the next lap.
  const lap = wrapAt === null ? entries : entries.slice(0, wrapAt);
  const allReached = focusable.length > 0 && focusable.every((n) => reached.has(n));
  const tail = entries.slice(-10);
  const tailKeys = new Set(tail.map(keyOf));
  const stuck = entries.length >= 10 && tail.length === 10 && tailKeys.size <= 2 && !allReached ? tail[tail.length - 1] : null;
  return { entries, lap, reached, complete: wrapped || allReached || (seenApp && leftApp), presses, stuck };
}

/** Pairs of consecutive in-app focus stops where focus moves back up, or left on the same line. */
export function orderJumps(entries) {
  const stops = [];
  for (const entry of entries) {
    if (!entry.inApp || !entry.box) continue;
    if (stops.length && keyOf(stops[stops.length - 1]) === keyOf(entry)) continue;
    stops.push(entry);
  }
  const jumps = [];
  for (let at = 1; at < stops.length; at++) {
    const from = stops[at - 1];
    const to = stops[at];
    const up = from.box.y - (to.box.y + to.box.h);
    const sameLine = Math.abs(from.box.y - to.box.y) < 8;
    const left = from.box.x - (to.box.x + to.box.w);
    if (up > 8) jumps.push({ from, to, dy: Math.round(up), how: 'up' });
    else if (sameLine && left > 8) jumps.push({ from, to, dx: Math.round(left), how: 'left' });
  }
  return jumps;
}

/**
 * Findings for the interaction check. `survey` from surveyInteractive, `hoverLog` from the hover
 * logger, `hoverFailed` the probe numbers a hover could not reach, `focusLog` from the Tab walk.
 * `evidence(n)` names the evidence for probe n. Options: `active` adds the :active advisory.
 */
export function interactionFindings({ survey, hoverLog = [], hoverFailed = [], focusLog = [], presses = 0, evidence = (n) => `#n${n}`, active = false }) {
  const findings = [];
  const notes = [];
  const probes = survey.probes ?? [];
  const lastHover = new Map();
  for (const entry of hoverLog) if (entry.hovered !== false) lastHover.set(entry.n, entry);
  const add = (probe, finding) => findings.push({ blockId: probe.blockId, blockType: probe.blockType, inPage: probe.inPage, what: what(probe), evidence: evidence(probe.n), ...finding });

  for (const probe of probes) {
    if (probe.disabled) continue;
    const field = isField(probe);
    // W1: hover feedback.
    if (!field) {
      const hovered = lastHover.get(probe.n);
      if (probe.hoveredAtRest) notes.push(`n${probe.n} ${what(probe)}: the mouse was on it when its resting look was read, so its hover is not judged`);
      else if (hoverFailed.includes(probe.n)) { /* the hover never reached it: the CLI notes it */ }
      else if (hovered) {
        const changed = sigDiff(probe.rest, hovered.sig);
        if (!changed.length) {
          add(probe, {
            rule: 'W1', severity: probe.rules?.active || probe.ripple ? 'minor' : 'major', kind: 'interaction',
            expected: 'a hover look: background, colour, border, shadow, underline or outline changes',
            actual: `no computed style changed on hover (element and its block)${probe.rules?.hover ? '; a :hover rule matches but changes nothing shown' : ''}`,
            fix: probe.blockId ? `hover style for the block: theme component style, or the block's custom CSS [data-block-id='${probe.blockId}']:hover` : 'a hover style for the element in the theme or the block custom CSS',
          });
        }
      } else notes.push(`n${probe.n} ${what(probe)}: hover not recorded`);
    }
    // W3: pointer cursor on what can be clicked.
    if (!field && probe.cursor && probe.cursor !== 'pointer') {
      add(probe, {
        rule: 'W3', severity: 'minor', kind: 'interaction', expected: 'cursor: pointer over a clickable control', actual: `cursor: ${probe.cursor}`,
        fix: probe.blockId ? `cursor: pointer in the block's custom CSS [data-block-id='${probe.blockId}']` : 'cursor: pointer on the control',
      });
    }
    // W4: a click target the keyboard cannot reach at all.
    if (probe.pointerOnly && !probe.focusable) {
      add(probe, {
        rule: 'W4', severity: 'major', kind: 'interaction', expected: 'reachable with Tab and operable with Enter or Space (a Button or Link block, or role=button with tabindex=0)',
        actual: `a clickable ${probe.tag} (cursor pointer) with no control role and no tabindex`,
        fix: 'make the click target a Button or Link block, or add role=button and tabindex=0 through the block HTML attributes',
      });
    }
    // W6 (advisory, on request): a pressed look.
    if (active && !field && !probe.rules?.active && !probe.ripple) {
      add(probe, { rule: 'W6', severity: 'minor', kind: 'interaction', expected: 'a pressed (:active) look', actual: 'no :active rule and no ripple', fix: probe.blockId ? `[data-block-id='${probe.blockId}']:active style` : '—' });
    }
  }

  // The Tab walk.
  const focusableProbes = probes.filter((probe) => probe.focusable && !probe.disabled).map((probe) => probe.n);
  const walk = readFocusWalk(focusLog, { presses, focusable: focusableProbes });
  const byN = new Map(probes.map((probe) => [probe.n, probe]));
  const judged = new Set();
  for (const entry of walk.entries) {
    if (!entry.n || judged.has(entry.n) || !entry.sig) continue;
    judged.add(entry.n);
    const probe = byN.get(entry.n);
    if (!probe) continue;
    const by = focusVisibleBy(probe.rest, entry.sig);
    if (!by) {
      add(probe, {
        rule: 'W2', severity: 'major', kind: 'interaction', expected: 'a visible focus indicator when Tab lands on it (WCAG 2.4.7)',
        actual: `outline ${entry.sig.el?.outlineStyle ?? 'none'}; nothing else changes on focus${entry.focusVisible === false ? ' (:focus-visible did not match)' : ''}`,
        fix: probe.blockId ? `keep a focus ring: [data-block-id='${probe.blockId}'] :focus-visible { outline: 2px solid <brand colour> }, or the theme's focus style` : 'a :focus-visible outline',
      });
    }
  }
  if (walk.complete) {
    for (const n of focusableProbes) {
      if (walk.reached.has(n)) continue;
      const probe = byN.get(n);
      add(probe, {
        rule: 'W4', severity: 'major', kind: 'interaction', expected: 'Tab reaches every focusable control',
        actual: `focusable (tabIndex ${probe.tabbable ? '≥ 0' : 'native'}) but not reached in ${walk.presses} Tab presses, which went all the way round`,
        fix: 'check for a positive tabindex elsewhere, an overlay or drawer holding focus, or a control hidden from the keyboard',
      });
    }
  } else if (focusableProbes.length) notes.push(`Tab walk stopped after ${walk.presses} presses before going round: unreached controls are not judged`);
  if (walk.stuck) {
    const probe = walk.stuck.n ? byN.get(walk.stuck.n) : null;
    findings.push({
      blockId: probe?.blockId ?? null, blockType: probe?.blockType ?? null, inPage: walk.stuck.inPage, what: probe ? what(probe) : `${walk.stuck.role ?? walk.stuck.tag} "${walk.stuck.name ?? ''}"`,
      evidence: evidence(walk.stuck.n ?? 'focus'), rule: 'W4', severity: 'major', kind: 'interaction', expected: 'Tab moves on through the page (WCAG 2.1.2, no keyboard trap)',
      actual: 'the last 10 Tab presses stayed on the same one or two elements', fix: 'a focus trap without an exit: let Tab and Escape leave the component',
    });
  }
  for (const jump of orderJumps(walk.lap).slice(0, 5)) {
    const probe = jump.to.n ? byN.get(jump.to.n) : null;
    findings.push({
      blockId: probe?.blockId ?? null, blockType: probe?.blockType ?? null, inPage: jump.to.inPage, what: probe ? what(probe) : `${jump.to.role ?? jump.to.tag} "${jump.to.name ?? ''}"`,
      evidence: evidence(jump.to.n ?? 'focus'), rule: 'W5', severity: 'minor', kind: 'interaction', expected: 'focus follows the reading order, top to bottom and left to right',
      actual: `Tab moves from "${jump.from.name ?? jump.from.tag}" to "${jump.to.name ?? jump.to.tag}", ${jump.how === 'up' ? `${jump.dy}px above it` : `${jump.dx}px to its left on the same line`}`,
      fix: 'order the blocks so the page order matches what shows; avoid moving blocks with absolute position or flex order',
    });
  }
  return { findings, notes, walk: { presses: walk.presses, complete: walk.complete, reached: walk.reached.size, focusable: focusableProbes.length, stuck: Boolean(walk.stuck) } };
}
