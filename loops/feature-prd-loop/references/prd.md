# The document

## Contents
- Who reads it
- The shape
- Each section
- What the check enforces
- Numbering, and why it matters

## Who reads it

Three people, and the document has to work for all three.

The person who asked for the feature reads _Summary_, _Requirements_ and
_Out of scope_, and wants to know whether this is the thing they meant.

Whoever builds it reads _Requirements_, _Edge cases_ and
_Impact on the existing app_, and wants to know exactly what to make and
what not to break.

Whoever reviews it later reads _Decisions_ and _Provenance_, and wants to
know who chose what, and which facts were actually checked.

So: no section is decoration, and nothing is asserted without saying
where it came from. Write it as a product document, not as a report of
what the loop did. The loop is not the subject.

## The shape

Headings are exact — `prd-check` reads them.

```markdown
# <app name> · <feature in a few words>

## Summary
## The ask
## How the app works today
## Requirements
### R1 — <one line>
### R2 — <one line>
## Out of scope
## Decisions
## Edge cases
## Impact on the existing app
## Open questions
## Provenance
## Review
```

## Each section

### Summary

One paragraph: what the feature is, who it is for, and what changes for
them. No implementation, no entity ids. A person who reads only this
should be able to say whether it is the right feature.

### The ask

Where it came from, and the ask itself.

For a ticket: the key as a link, its title, its status, and the
description and the comments that carry requirement — quoted, not
paraphrased. For words in chat: the words, verbatim.

**Quote the ticket inside a code fence.** A description written in the
tracker's own editor can arrive carrying markup, and the check reads anything in
angle brackets as a placeholder somebody forgot to fill. A fence is
exempt from every text check, so the quote stays exact and the check
stays strict.

Then one line on what the ask left unsaid, because that is what the rest
of the document is for.

### How the app works today

The current behaviour the feature lands on, in plain words: the pages a
person uses, what they do there, what the data looks like, which roles
see what. Only the part the feature touches — this is not an app tour.

Every claim carries its source inline: `(cache page PG_1 @7)`,
`(look · Invoice list, as Manager)`, `(live read)`. A claim with no
source does not belong here; it belongs in _Open questions_.

Where the look disagreed with the config, say both and say which is
true. That disagreement is often the most useful line in the document.

### Requirements

One `### R<n> — <one line>` block each, in the order a reader meets them.
Every block carries exactly these lines:

```markdown
### R3 — A manager archives several invoices at once

**What:** On the invoice list a manager selects rows and archives them in
one action. Archived invoices leave the default list and stay reachable
under an Archived filter.

**Why:** Closing a month means archiving dozens of invoices one at a
time today.

**Decided by:** person (d1, d4) · loop (d7)

**Proof:** cache page PG_1 @7 · look · Invoice list, as Manager · d1

**Acceptance:** A manager selects three invoices, archives them, and sees
them leave the list and appear under Archived. A viewer sees no archive
action.
```

`Acceptance` is what makes a requirement buildable and testable: a
concrete scenario with a visible outcome, not a restatement of `What`. A
requirement nobody can write a test from is not finished.

`Decided by` names the decision ids from the _Decisions_ table that this
requirement rests on. A requirement resting on no decision has
`**Decided by:** the ask`.

### Out of scope

What was considered and excluded, each with who excluded it. Short rows.

This section exists so the same question is not asked again in three
weeks, and so the builder does not add a thing the person said no to. An
exclusion the person made is worth more than one you made; say which.

### Decisions

One row per decision, in the order they were settled:

```markdown
| # | Question | Answer | Decided by | Proof |
|---|---|---|---|---|
| d1 | Does archive hide the invoice or delete it? | Soft archive — the record stays, the list gains an Archived filter | person | — |
| d7 | How many rows per page on the Archived list? | 25 | loop | cache page PG_1, PG_4, PG_7 · every list pages at 25 |
```

Every row of `<firing>/decisions.json` appears here — this ask's rows,
including ones an earlier firing on the same ask settled, which carry
that firing id in the Proof column. A decision another ask settled stays
in the app's ledger and out of this table.

A `loop` row with an empty Proof is the one thing this document may not
contain.

### Edge cases

One row per case, each tied to a requirement and, where it comes from the
app's own shape, to a blast-radius row:

```markdown
| Requirement | Case | Expected | From | Proof |
|---|---|---|---|---|
| R3 | Selection includes an already-archived invoice | It is skipped, and the result names it | semantic | — |
| R3 | Selection spans a page boundary | The selection is kept across paging | look · Invoice list | look note |
| R3 | Two managers archive the same invoice at once | The second sees it already archived, not an error | write-conflict · WF_4 | blast-radius |
| R4 | The Archived filter is opened with nothing archived | An empty state, not a blank table | schema · OBJ_inv | cache obj OBJ_inv @5 |
```

Work through each requirement against five kinds, and say when a kind
does not apply:

- **Empty and absent** — nothing selected, no records, a null field, a
  missing lookup target.
- **Many and large** — a selection bigger than a page, a value at the
  field's limit, a list long enough to page.
- **Concurrent and repeated** — two people at once, the action fired
  twice, a retry after a timeout.
- **Permission** — each role the blast radius names, including the role
  that should not see the feature at all.
- **Partial failure** — some of the batch succeeds. What the person sees,
  and what state the data is left in. This one is missed most often and
  costs the most.

Every requirement needs at least one row. A requirement whose only edge
case is "it works" has not been thought about.

### Impact on the existing app

One line of what this section is, then the table printed by

```bash
feature.mjs impact-table --blast <firing>/blast-radius.json
```

pasted whole, including its truncation line when it prints one. The table
is computed from the blast radius and never typed, and `prd-check`
compares the document against the file.

Under it, in plain words: the three or four rows that genuinely worry
you, and what the build has to do about each. The table is the complete
list; this is the part a person acts on.

### Open questions

Everything still unanswered, named rather than buried:

- a question nobody could answer, with who could
- a fact the look could not confirm, and the one action that would
- a stage that did not run, and what it would have settled
- the questionnaire, when the ask arrived too vague to click through, with
  the count

An empty section is written as `None.` — never left out, because a
missing section reads as a complete document.

### Provenance

How each kind of fact in the document was established:

```markdown
| Source | Count | What it covers |
|---|---|---|
| live read | 3 | the roles and their grants |
| cache @ version | 24 | pages, objects, automations as of the refresh at 10:02 |
| look | 7 | runtime behaviour on five surfaces, as Manager and Viewer |
| unverified | 2 | what the archive automation returns on a partial failure; the Viewer role, which has no test user |
```

Every `unverified` row names what is unverified and why. A document whose
provenance table has no `unverified` row and whose text says
"unverified" somewhere is inconsistent, and the check says so.

### Review

The reviewing agent's findings, whole: each check it answered not met,
what you did about it, and — where you disagreed — that you disagreed and
why. Then its verdict.

A finding you fixed still appears here. The reader is entitled to know
what the document got wrong before they read it.

## What the check enforces

```bash
feature.mjs prd-check --prd <firing>/prd.md --blast <firing>/blast-radius.json \
  --decisions <firing>/decisions.json
```

It exits 1 and names every failure:

- a heading from the shape above missing
- a requirement block short of `What`, `Why`, `Decided by`, `Proof` or
  `Acceptance`
- a requirement with no row in _Edge cases_
- requirement numbers not contiguous from `R1`
- a blast-radius row absent from the impact table, or a table row the
  blast radius does not hold
- a blast-radius row still holding `null` in `risk` or `mustNotBreak`
- a decision in `decisions.json` absent from the table, or a `loop` row
  with an empty Proof
- the word `unverified` in the text with no `unverified` row in
  _Provenance_
- a placeholder left behind: `TBD`, `TODO`, `???`, or an unfilled
  `<…>`
- _Open questions_ or any other section left empty rather than written
  as `None.`

Fix what it names. Never relax the document to make it pass.

## Numbering, and why it matters

Requirements are `R1`, `R2`, `R3`, contiguous, in reading order.

`app-test-discover-loop` reads a PRD's requirements by exactly that
numbering, turns each into a requirement row in its journey graph, and
grows a coverage layer that proves every one has a test scenario or a
stated reason it has none. Write the document this way and it becomes
that loop's input with no edit: the feature gets its test coverage proved
from the same numbers the builder worked from.
