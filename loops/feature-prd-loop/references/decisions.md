# Decisions — what you settle, what the person settles

## Contents
- The proof rule
- Decide yourself
- Ask the person
- Prune, then rank
- The rounds
- The question's shape
- When the list is long
- The ledger
- Never your guess in their name

## The proof rule

One test decides every question in this loop:

> **Can the app itself answer this, consistently, and can you cite the
> read that proves it?**

Yes on all three: you decide, and the PRD carries the decision with its
proof. Anything else: the person decides.

The three parts matter separately. *The app itself* rules out your sense
of what is usual. *Consistently* rules out an app that does it two ways,
where "follow the app" has no answer. *Cite the read* rules out a memory
of what you saw earlier in the run.

## Decide yourself

- **The ask already says it.** The ticket or the person's words settle
  it. Proof is the quote.
- **The app answers by pattern, and every instance agrees.** Every list
  in the app pages at 25, so the new list pages at 25. Every date shows
  as a relative time, so this one does. Proof is the reads, plural — one
  instance is not a pattern.
- **The platform leaves one answer.** The field's type permits one
  widget; the object's lookup forces the direction of the relationship.
  Proof is the read that shows the constraint.
- **It follows from a choice already made.** The person chose soft
  archive, so the list needs an archived filter. Proof is the decision it
  follows from.

## Ask the person

- **A product tradeoff.** Who can see it. What happens on a conflict.
  What the default is. What the empty state says. These have several
  right answers and the person owns which.
- **A scope boundary.** Is this in the feature or the next one. Ask it
  first: the answer deletes more questions than any other.
- **The app contradicts itself.** Two existing patterns disagree, so
  there is nothing to follow. Say both, and let the person pick.
- **It changes what an existing user already experiences.** A default
  that moves, a step that disappears, a screen that reorders. Somebody is
  used to the old one.
- **It is irreversible or touches data.** A new required field on a
  populated object. A changed automation contract. A migration. Never
  decided here, however obvious the answer looks.
- **The ask is vague on the thing that decides the build.** "Bulk
  archive" does not say whether archive hides or deletes, and every
  requirement downstream depends on which.

## Prune, then rank

List everything unclear first, from the ask, the context reads and the
blast radius. Then:

1. **Prune.** Drop every item the proof rule answers, and write each one
   straight into the decisions file as yours, with its proof. Most of the
   list dies here: the app usually answers the pattern questions.
2. **Rank by what each answer deletes.** Put first the question whose
   answer removes the most questions below it. Scope first, always.
   Defaults next. Details last — and many of the details will be gone by
   the time you reach them.
3. **Merge nothing.** One decision per question. A question with "and" in
   it gets an answer nobody can act on.

## The rounds

`AskUserQuestion` takes at most four questions in a call. So:

- Ask the top four. Never pad a round to four — two sharp questions beat
  four with filler.
- Re-prune with the answers. An answer that cut scope takes its whole
  branch of questions with it.
- Ask the next four.
- Stop when nothing important is unclear. One to three rounds is normal,
  because round one is scope.

A question is never asked twice. Before every round, check the ledger.

## The question's shape

- **Two to four concrete options.** Never an open "what do you want?".
- **The one you lean to first, labelled `(Recommended)`**, with the proof
  or the pattern behind the lean in its description. No lean: no
  recommendation, and say the options are equal.
- **Every option names what it costs in the blast radius.** "Changes
  three existing pages." "Needs a new required field on a populated
  object." That is the information the person cannot get anywhere else,
  and it is the whole reason the ripple runs before the questions.
- **Each option states the consequence, not the label alone.** `Soft
  archive` means nothing; `Soft archive — the record stays and the list
  gains an Archived filter` can be chosen.
- **Multi-select** when the choices are not exclusive.
- **`Other` is always there**, so the person is never trapped in your
  options. Their own answer is recorded verbatim.
- **A throwaway HTML page** when seeing beats reading — a layout, an
  ordering, two versions of a screen. Build it, name its path, and ask
  about what it shows. Never ask whether they want a mockup.

## When the list is long

More than eight questions surviving the prune means the ask is too vague
to click through. Write `<firing>/questions.md` instead: every question
with its options and your lean, in one pass, and ask the person to answer
in the file or in one message.

Then say it in the PRD. _Open questions_ names the count and that the ask
arrived underspecified. A long question list is a finding about the
ticket, and the person who wrote the ticket should read it. It is never a
reason to fill the gaps with defaults.

## The ledger

`features/<app slug>/decisions.json`, written as each answer arrives, so an
interrupted run resumes without asking again:

```json
{
  "appSlug": "billing",
  "decisions": [
    { "id": "d1", "question": "Does archive hide the invoice or delete it?",
      "answer": "Soft archive — the record stays, the list gains a filter",
      "decidedBy": "person", "firingId": "f_8h2k",
      "askFingerprint": "ENG-1234",
      "proof": null, "at": "2026-11-01T10:04:00Z" },
    { "id": "d2", "question": "How many rows per page on the archived list?",
      "answer": "25",
      "decidedBy": "loop", "firingId": "f_8h2k",
      "askFingerprint": "ENG-1234",
      "proof": "cache page PG_1, PG_4, PG_7 · every list pages at 25",
      "at": "2026-11-01T10:01:00Z" }
  ]
}
```

`decidedBy` is `person` or `loop`. A `loop` row with no `proof` is the
one shape this loop forbids, and `prd-check` fails on it.

A later run reads the file and asks only what is new. The person reopens
a row by naming it in the command.

**Two files, one shape.** This one is the app's and grows with every ask
it has ever answered. Before the document is written, the rows whose
`askFingerprint` is this ask's are copied into `<firing>/decisions.json`,
and that is the file `prd-check` and the reviewing agent read. A decision
another feature settled belongs in the app's ledger and not in this
document's table.

## Never your guess in their name

A decision you made is `decidedBy: "loop"`, in the ledger and in the
PRD's table, with its proof beside it. A decision nobody made is an
_Open questions_ row.

What is never written: your guess recorded as the person's answer, or a
default presented as a decision. The person reading the PRD has to be
able to see, row by row, which choices were theirs — otherwise the
document is a set of assumptions wearing their signature.
