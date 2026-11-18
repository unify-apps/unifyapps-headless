import { markdownLines, withoutCodeSpans } from './spec-markdown.mjs';

// Stable ids live in the spec's Markdown, never in new platform columns.
// `kinds` is the one place that says which entity kind forces this row open
// (forbids N/A). skills/plan/references/requirements-checklist.md
// explains the rows in plain words; this array is the source of truth for
// which kinds each row applies to, never the other way round. A new entity
// kind UnifyApps Headless can build adds its own word to the kinds array of every row its
// facts force open, in this one place.
export const REQUIREMENTS = Object.freeze([
  { id: 'outcome', label: 'Outcome', question: 'Who should be able to do what, and what visible result proves it worked?' },
  { id: 'users_access', label: 'Users and access', question: 'Which user roles can read or change this, and what happens when access is denied?' },
  { id: 'scope', label: 'Scope', question: 'Which named entities change, and what is explicitly outside this change?' },
  { id: 'workflow', label: 'Workflow', question: 'What starts the flow, what exact steps follow, and what is the result of each branch?' },
  // A user and a team are records with fields a spec has to name. A role is not: what it grants
  // belongs to `users_access`, which every spec answers already.
  { id: 'data', label: 'Data', question: 'What are the exact fields, types, required values, defaults, inputs and outputs?', optional: true, kinds: ['object', 'automation', 'knowledge-set', 'dataset', 'metric', 'experiment', 'graph', 'api_group', 'api', 'client', 'access_profile', 'policy', 'env_variable', 'connector', 'user', 'team'] },
  { id: 'rules', label: 'Business rules', question: 'What validation, duplicate handling, calculations and state transitions apply?', optional: true },
  { id: 'ui_states', label: 'UI and states', question: 'Which pages and controls change, including loading, empty, success and error states?', optional: true, kinds: ['app', 'page', 'code-app'] },
  { id: 'integrations', label: 'Integrations', question: 'Which systems and operations are called, with which inputs, outputs and access?', optional: true, kinds: ['connection', 'automation', 'ai-agent', 'metric', 'experiment', 'graph', 'api', 'access_profile', 'policy'] },
  { id: 'failures', label: 'Failure and recovery', question: 'What happens on invalid input, denied access or a failed dependency, and how can the user recover?' },
  { id: 'constraints', label: 'Constraints', question: 'Which tenant, platforms, existing behavior and relevant volume or timing limits must be respected?' },
  { id: 'acceptance', label: 'Acceptance examples', question: 'Give concrete starting data, actions and expected results, including a failure or boundary example.' },
  { id: 'rollout', label: 'Rollout', question: 'What stays a draft, what may be deployed or published, and what must remain unchanged?' },
].map(item => Object.freeze(item)));

// Masks what a text quotes, its code spans and its quoted values, so literal
// copy such as a label "TBD" or the picklist code `todo` is never read as a gap.
function withoutQuotedValues(text) {
  return withoutCodeSpans(text)
    .replace(/"[^"]*"|“[^”]*”|‘[^’]*’|(?<![\p{L}\p{N}])'[^'\n]+'(?![\p{L}\p{N}])/gu, ' named value ');
}

// A gap left for later. The short forms count only in capitals, the way a
// writer leaves them: a lowercase todo is a value, such as a picklist code.
const GAP_MARKS = /\b(?:TBD|TBC|TODO)\b/u;
const GAP_WORDS = /\bto be (?:decided|determined|confirmed|defined)\b|\b(?:handle errors|similar to|wire it up|fill in)\b/iu;

/** The first placeholder in a spec answer or a task body, or null. The one
 * check both use, so `spec check` and `plan create` agree on what a gap is. */
export function placeholderIn(text) {
  const visible = withoutQuotedValues(String(text ?? ''));
  const found = [GAP_MARKS.exec(visible), GAP_WORDS.exec(visible)].filter(Boolean).sort((a, b) => a.index - b.index)[0];
  return found ? found[0] : null;
}

function evidenceProblem(answer) {
  if (!answer.trim()) return 'Give a specific answer and its evidence.';
  const prose = withoutQuotedValues(answer).trim();
  const plain = prose.toLowerCase().replace(/[.!]+$/gu, '').trim();
  if (/^(?:yes|no|done|complete|confirmed|verified|clear|none|n\/?a|not applicable|not relevant|user confirmed|all requirements are clear|same as before|see (?:above|below)|looks good)$/u.test(plain)) {
    return `A checkbox or generic confirmation is not a specific requirement. Found: "${plain}".`;
  }
  const assurance = /^(?:everything|it|this|that|they)\s+(?:should|must|will|can|is|are)\b.*\b(?:work|correct|expected|successful|successfully|use it)\b/iu.exec(prose)
    ?? /^(?:the )?(?:current|existing) (?:implementation|behavior|behaviour|system|configuration)\b.*\b(?:checked|reviewed|verified)\b.*\b(?:correct|fine|good|approved)\b/iu.exec(prose)
    ?? /^(?:all |the )?(?:requirements?|decisions?|details?)\b.*\b(?:confirmed|approved|clear|agreed)\b/iu.exec(prose)
    ?? /^(?:this|the) (?:category|requirement|item|feature) is (?:outside (?:the )?(?:current )?scope|not (?:applicable|needed|required))[.!]*$/iu.exec(prose);
  if (assurance) return `Replace a general assurance with the concrete decision, observed fact, or scope exclusion. Found: "${assurance[0].trim()}".`;
  // A placeholder such as <name> always opens on a letter; "amount < 100" and
  // "> 500" are comparisons, not a placeholder, so a space or digit after "<"
  // never matches. "if required"/"as needed" and "the one" are only vague
  // when nothing follows to say what they mean; end-anchored so a real
  // sentence such as "disables Save if required fields are missing" or
  // "keep the one created first" is not caught.
  const placeholder = placeholderIn(answer) ?? /<(?=[a-z])[a-z][\w .'/-]{0,60}>|\b(?:something|stuff|whatever|etc)\b|\b(?:this|that|some)\s+(?:thing|one)\b|\bthe thing\b|\bthe one\b(?=\s*[.,;:!?]?\s*$)|\b(?:as|if) (?:needed|required)\b(?=\s*[.,;:!?]?\s*$)|\b(?:usual|standard) (?:way|behaviou?r)\b|\bsee (?:above|below)\b|\bmake it (?:good|nice|better|work)\b|\byou decide\b/iu.exec(prose)?.[0];
  if (placeholder) return `Replace vague references or placeholders with named behavior, values or a concrete decision. Found: "${placeholder.trim()}".`;
  if ((prose.match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) ?? []).length < 3) return `State the decision or observed fact, not just a label. Found: "${prose.trim()}".`;
  return null;
}

export function assessRequirements(section, touches = []) {
  const items = REQUIREMENTS.map(item => ({ id: item.id, label: item.label, question: item.question, checked: false, source: null, answer: '', complete: false, issues: [] }));
  const byId = new Map(items.map(item => [item.id, item]));
  // `formatIssues` holds a problem that is not tied to any specific checklist
  // item: a stray/malformed line under the heading, or a row naming an id no
  // requirement has. These are kept separate from `items[].issues` (and so
  // from `completed`/`total`) so a caller can tell "every item itself is
  // done" apart from "the checklist section has a formatting problem outside
  // any row" — the two can otherwise look the same from `completed === total`
  // alone. They are still folded into the flat `issues` list below, so
  // `ready` and `warnings` (which read `issues`) keep their existing meaning.
  const seen = new Set(), issues = [], formatIssues = [];
  // A checklist row that wraps onto a second line (a plain paragraph continuing
  // right after a matched row) gets its own message, so the person knows to pull
  // the text back onto the row rather than hunting for a missing "- [ ]".
  let previousRow = false;
  for (const { line, code } of markdownLines(section)) {
    if (code) continue;
    if (!line.trim()) { previousRow = false; continue; }
    const row = /^ {0,3}-\s+\[([ xX])\]\s+([a-z_]+):\s*(.*)$/u.exec(line);
    if (!row) {
      const message = previousRow
        ? `A checklist row must stay on one line; move "${line.trim().slice(0, 40)}" back onto the row above it.`
        : 'Use a checklist row: - [x] outcome: USER — specific answer.';
      issues.push({ id: 'checklist', message });
      formatIssues.push({ id: 'checklist', message });
      previousRow = false;
      continue;
    }
    previousRow = true;
    const id = row[2], item = byId.get(id);
    if (!item) {
      const message = `Unknown requirement ${id}.`;
      issues.push({ id, message });
      formatIssues.push({ id, message });
      continue;
    }
    if (seen.has(id)) { item.issues.push('Duplicate requirement; keep one consistent answer.'); continue; }
    seen.add(id);
    item.checked = row[1].toLowerCase() === 'x';
    if (!item.checked) item.issues.push('This requirement is not confirmed yet.');
    const evidence = /^(USER|READ|N\/A)\s*[—–]\s*(.*)$/iu.exec(row[3]);
    if (!evidence) { item.issues.push('Name the evidence source: USER, READ, or an allowed N/A with its reason.'); continue; }
    item.source = evidence[1].toUpperCase(); item.answer = evidence[2].trim();
    const problem = evidenceProblem(item.answer);
    if (problem) item.issues.push(problem);
    const definition = REQUIREMENTS.find(entry => entry.id === id);
    if (item.source === 'N/A' && (!definition.optional || definition.kinds?.some(kind => touches.some(ref => ref.kind === kind)))) {
      item.issues.push('This requirement applies to the named scope and cannot be marked N/A.');
    }
  }
  for (const item of items) {
    if (!seen.has(item.id)) item.issues.push('This requirement is missing.');
    item.complete = item.issues.length === 0;
    issues.push(...item.issues.map(message => ({ id: item.id, message, question: item.question })));
  }
  return { ready: issues.length === 0, completed: items.filter(item => item.complete).length, total: items.length, items, issues, formatIssues };
}
