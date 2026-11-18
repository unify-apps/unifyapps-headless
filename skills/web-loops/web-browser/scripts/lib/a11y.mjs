// The a11y check's analysis: accessible names (from the accessibility snapshot), form labels,
// images without alt, text contrast (WCAG AA), heading order and ARIA used wrongly (from the
// DOM collector). Pure.
import { textContrast } from './color.mjs';
import { CONTROL_ROLES, snapshotFindings } from './snapshot.mjs';

const FIELD_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider', 'listbox']);
const CONTRAST_ISSUES = 20;

const descendants = (nodes, node) => nodes.filter((other) => {
  for (let at = other.parent; at !== null; at = nodes[at].parent) if (at === node.i) return true;
  return false;
});

/**
 * The snapshot nodes that become issues: controls with no name (a field's name is its label, judged
 * in the DOM; an image is judged on its alt in the DOM) and clickable nodes with no control role
 * and no control inside.
 */
export function snapshotIssueNodes(nodes) {
  const { unnamed, clickable } = snapshotFindings(nodes);
  return {
    unnamed: unnamed.filter((node) => !FIELD_ROLES.has(node.role) && node.role !== 'img'),
    clickable: clickable.filter((node) => !descendants(nodes, node).some((down) => CONTROL_ROLES.includes(down.role))),
  };
}

/** Refs the CLI resolves to block ids before the analysis. */
export function refsToResolve(nodes) {
  const { unnamed, clickable } = snapshotIssueNodes(nodes);
  return [...new Set([...unnamed, ...clickable].map((node) => node.ref).filter(Boolean))];
}

/**
 * Many issues of one kind on one page say one thing: past `keep` they fold into one issue that counts
 * them and names the first blocks.
 */
export function foldRepeats(findings, keep = 3) {
  const groups = new Map();
  for (const finding of findings) {
    const key = finding.fold ? `${finding.rule}|${finding.fold}|${finding.inPage}` : null;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(finding);
  }
  const out = [];
  const done = new Set();
  for (const finding of findings) {
    const key = finding.fold ? `${finding.rule}|${finding.fold}|${finding.inPage}` : null;
    const group = key ? groups.get(key) : null;
    if (!group || group.length <= keep) { out.push(finding); continue; }
    if (done.has(key)) continue;
    done.add(key);
    const blocks = [...new Set(group.map((item) => item.blockId).filter(Boolean))];
    out.push({ ...group[0], what: `${group.length} × ${group[0].foldWhat ?? group[0].what}`, actual: `${group[0].actual} (${group.length} of them; blocks ${blocks.slice(0, 5).join(', ')}${blocks.length > 5 ? ', …' : ''})` });
  }
  return out.map(({ fold, foldWhat, ...rest }) => rest);
}

/**
 * Findings for the a11y check. `nodes` is the parsed snapshot, `dom` the collectA11y answer,
 * `refBlocks` a Map ref → { blockId, blockType, inPage } the CLI resolved, `evidence` names
 * where a finding's data sits.
 */
export function a11yFindings({ nodes = [], dom = {}, refBlocks = new Map(), evidence = { snapshot: 'snapshot.yml', dom: 'a11y.json' } }) {
  const findings = [];
  const notes = [];
  const at = (ref) => {
    const { inApp, ...where } = refBlocks.get(ref) ?? { blockId: null, blockType: null, inPage: true };
    return where;
  };
  // The snapshot covers the whole window: a node outside the app (the builder preview's toolbar and
  // its variant menu) is not the app's to fix, so it is left out. Inside the app but outside the page
  // root (the navigation, the header) is the app shell.
  const inApp = (node) => refBlocks.get(node.ref)?.inApp !== false;
  const found = snapshotIssueNodes(nodes);
  const unnamed = found.unnamed.filter(inApp);
  const clickable = found.clickable.filter(inApp);

  // W7: every control has a name.
  for (const node of unnamed) {
    findings.push({
      ...at(node.ref), what: `${node.role} (ref ${node.ref ?? '?'})`, rule: 'W7', severity: 'major', kind: 'component', fold: `unnamed-${node.role}`, foldWhat: `${node.role} with no name`,
      expected: 'an accessible name a screen reader says (WCAG 4.1.2)', actual: `${node.role} with no name: no text, aria-label or title`,
      evidence: `${evidence.snapshot}#${node.ref ?? node.i}`, fix: 'give the control a label: the block\'s label or tooltip setting, or aria-label through its HTML attributes',
    });
  }
  for (const node of clickable) {
    findings.push({
      ...at(node.ref), what: `${node.role}${node.name ? ` "${node.name}"` : ''} (ref ${node.ref ?? '?'})`, rule: 'W11', severity: 'major', kind: 'component', fold: 'clickable-no-role', foldWhat: 'clickable element with no control role',
      expected: 'a clickable element is a button or link to assistive technology', actual: `cursor pointer on a ${node.role} with no control role`,
      evidence: `${evidence.snapshot}#${node.ref ?? node.i}`, fix: 'a Button or Link block for the click target, or role=button with tabindex=0 through the block HTML attributes',
    });
  }

  // W8: every field has a label.
  for (const field of dom.fields ?? []) {
    if (field.labels + field.labelledBy > 0 || field.ariaLabel || field.title) continue;
    findings.push({
      blockId: field.blockId, blockType: field.blockType, inPage: field.inPage, what: `${field.role ?? field.tag}${field.type ? ` (${field.type})` : ''}`,
      rule: 'W8', severity: field.placeholder ? 'minor' : 'major', kind: 'component', fold: field.placeholder ? 'placeholder-only' : 'no-label', foldWhat: `field with ${field.placeholder ? 'only a placeholder' : 'no label'}`,
      expected: 'a label tied to the field (label for, aria-label or aria-labelledby; WCAG 1.3.1, 3.3.2)',
      actual: field.placeholder ? 'only a placeholder, which goes away as the person types' : 'no label, no aria-label, no placeholder',
      evidence: `${evidence.dom}#fields`, fix: 'set the field\'s label in the block; a label shown but not tied to the field is the form renderer (owner platform when the setting is there)',
    });
  }
  for (const field of dom.fields ?? []) {
    if (!field.missingRefs?.length) continue;
    findings.push({ blockId: field.blockId, blockType: field.blockType, inPage: field.inPage, what: field.role ?? field.tag, rule: 'W11', severity: 'minor', kind: 'component', expected: 'aria-labelledby names elements on the page', actual: `aria-labelledby names missing id(s) ${field.missingRefs.join(', ')}`, evidence: `${evidence.dom}#fields`, fix: '—' });
  }

  // W7: informative images have alt text (alt="" marks one as decorative).
  for (const image of dom.images ?? []) {
    if (image.hidden || image.ariaLabel || image.alt !== 'missing' || image.tag !== 'img') continue;
    findings.push({
      blockId: image.blockId, blockType: image.blockType, inPage: image.inPage, what: `image${image.path ? ` ${image.path.split('/').pop()}` : ''}`,
      rule: 'W7', severity: 'minor', kind: 'component', fold: 'img-no-alt', foldWhat: 'image with no alt',
      expected: 'alt text, or alt="" when the image is decorative (WCAG 1.1.1)', actual: 'no alt attribute', evidence: `${evidence.dom}#images`, fix: 'the Image block\'s alt text setting',
    });
  }

  // W9: text contrast, worst first.
  const contrast = [];
  let unknown = 0;
  for (const text of dom.texts ?? []) {
    if (text.disabled) continue;
    const result = textContrast(text);
    if (!result) { unknown += text.count ?? 1; continue; }
    if (result.ratio < result.required) contrast.push({ text, result });
  }
  contrast.sort((a, b) => a.result.ratio / a.result.required - b.result.ratio / b.result.required);
  for (const { text, result } of contrast.slice(0, CONTRAST_ISSUES)) {
    findings.push({
      blockId: text.blockId, blockType: text.blockType, inPage: text.inPage, what: `text ${text.fontSize} / ${text.fontWeight}`,
      rule: 'W9', severity: result.ratio < 3 ? 'major' : 'minor', kind: 'colour',
      expected: `contrast ≥ ${result.required}:1 (WCAG 1.4.3 AA${result.large ? ', large text' : ''})`,
      actual: `${result.ratio}:1, ${result.fg} on ${result.bg}${text.count > 1 ? `, ${text.count} texts alike` : ''}`,
      evidence: `${evidence.dom}#texts`, fix: 'a darker text token or a lighter background from the theme, not a lighter grey',
    });
  }
  if (contrast.length > CONTRAST_ISSUES) notes.push(`${contrast.length - CONTRAST_ISSUES} more low-contrast text styles (in ${evidence.dom})`);
  if (unknown) notes.push(`${unknown} texts not judged for contrast: on an image or gradient, or a colour the check cannot read`);

  // W10: headings go one level deeper at a time.
  const levels = (dom.headings ?? []).filter((heading) => heading.level);
  if (!levels.length) notes.push('no headings on the page');
  for (let i = 1; i < levels.length; i++) {
    const prev = levels[i - 1];
    const next = levels[i];
    if (next.level > prev.level + 1) {
      findings.push({
        blockId: next.blockId, blockType: next.blockType, inPage: next.inPage, what: `heading h${next.level}`, rule: 'W10', severity: 'minor', kind: 'typography',
        expected: 'headings go one level deeper at a time (WCAG 1.3.1)', actual: `h${prev.level} then h${next.level}, skipping h${prev.level + 1}`,
        evidence: `${evidence.dom}#headings`, fix: `the heading block's level: h${prev.level + 1}`,
      });
    }
  }

  // W11: ARIA used as meant.
  const ARIA = {
    'invalid-role': { severity: 'major', expected: 'a role from WAI-ARIA', actual: (item) => `role="${item.value}" is no ARIA role`, fix: 'remove the role or use a real one in the block HTML attributes' },
    'widget-not-focusable': { severity: 'major', expected: 'a control role on something the keyboard can reach', actual: (item) => `role=${item.role} without tabindex`, fix: 'tabindex=0 with the role, or a Button block' },
    'presentation-on-focusable': { severity: 'minor', expected: 'role none or presentation only on what is not focusable', actual: () => 'a focusable control marked presentation', fix: 'remove role=presentation' },
    'hidden-but-focusable': { severity: 'major', expected: 'aria-hidden content holds nothing focusable (WCAG 4.1.2)', actual: (item) => `aria-hidden="true" holds ${item.count} focusable element(s)`, fix: 'drop aria-hidden, or take the controls out of the tab order while hidden' },
    'nested-interactive': { severity: 'minor', expected: 'one control per click target', actual: (item) => `a ${item.inner} inside a ${item.tag}`, fix: 'move the inner control out, or make the outer one a plain container' },
    'missing-reference': { severity: 'minor', expected: 'aria-labelledby and aria-describedby name elements on the page', actual: (item) => `names missing id(s) ${item.missing.join(', ')}`, fix: '—' },
  };
  for (const item of dom.aria ?? []) {
    const rule = ARIA[item.problem];
    if (!rule) continue;
    findings.push({
      blockId: item.blockId, blockType: item.blockType, inPage: item.inPage, what: `${item.tag}${item.role ? `[role=${item.role}]` : ''}${item.name ? ` "${item.name}"` : ''}`,
      rule: 'W11', severity: rule.severity, kind: 'component', fold: item.problem, expected: rule.expected, actual: rule.actual(item), evidence: `${evidence.dom}#aria`, fix: rule.fix,
    });
  }
  return { findings: foldRepeats(findings), notes, counts: { controls: nodes.filter((node) => CONTROL_ROLES.includes(node.role)).length, fields: (dom.fields ?? []).length, texts: (dom.texts ?? []).length, headings: levels.length } };
}
