/** The session ledger: decisions, entities and open questions that a compaction must not drop.
 * Kept in state.json (`state.ledger`), capped at about 2 KB so it never dominates the context
 * a SessionStart reminder re-injects. Pure: no files, no network. */

export const EMPTY_LEDGER = Object.freeze({ decisions: [], entities: [], openQuestions: [] });
const MAX_LEDGER_CHARS = 2000;

// Oldest decisions go first, then questions, then entities: an entity's id is the
// hardest thing to reconstruct from memory, so it is the last thing dropped.
function capped(ledger) {
  const next = { decisions: [...ledger.decisions], entities: [...ledger.entities], openQuestions: [...ledger.openQuestions] };
  while (JSON.stringify(next).length > MAX_LEDGER_CHARS && (next.decisions.length || next.openQuestions.length || next.entities.length)) {
    if (next.decisions.length) next.decisions.shift();
    else if (next.openQuestions.length) next.openQuestions.shift();
    else next.entities.shift();
  }
  return next;
}

export function withDecision(ledger, line) {
  const base = ledger ?? EMPTY_LEDGER;
  return capped({ ...base, decisions: [...base.decisions, line] });
}

export function withQuestion(ledger, line) {
  const base = ledger ?? EMPTY_LEDGER;
  return capped({ ...base, openQuestions: [...base.openQuestions, line] });
}

// Replaces any earlier entry for the same entity, so its latest status wins.
export function withEntity(ledger, entity) {
  const base = ledger ?? EMPTY_LEDGER;
  const same = (a) => (a.id && entity.id ? a.id === entity.id : a.name === entity.name);
  const entities = [...base.entities.filter((existing) => !same(existing)), entity];
  return capped({ ...base, entities });
}

/** The line a SessionStart compact reminder adds after the current-task line. '' when there is nothing to say. */
export function ledgerLine(ledger) {
  if (!ledger) return '';
  const parts = [];
  if (ledger.decisions?.length) parts.push(` Decisions: ${ledger.decisions.join('; ')}.`);
  if (ledger.entities?.length) {
    parts.push(` Entities: ${ledger.entities.map((e) => `${e.kind ?? 'entity'} ${e.name}${e.id ? ` (${e.id})` : ''} — ${e.status}`).join('; ')}.`);
  }
  if (ledger.openQuestions?.length) parts.push(` Open questions: ${ledger.openQuestions.join('; ')}.`);
  return parts.join('');
}
