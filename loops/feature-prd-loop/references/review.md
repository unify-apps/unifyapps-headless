# Review — an agent that did not write it

## Contents
- Why a second agent
- What it gets
- The checks
- What it answers
- What it never does
- Applying the findings

## Why a second agent

The author of a PRD is the worst reader of it. Every gap in it is a gap
they already decided was fine, and every unproven claim reads as obvious
to the person who made it up. The failure this loop has to prevent is not
a badly written document — it is a confident one with an unchecked claim
inside, because that claim gets built.

`prd-check` catches the mechanical faults. A missing proof line is a
string match. "This proof does not actually prove this requirement" is
not, and that is what the review is for.

The repo already works this way: `page-reviewer` and
`test-create-loop-evaluator` are both agents that did not build the thing
they judge.

## What it gets

Dispatch one subagent with the firing folder and nothing else. It reads:

- `prd.md` — the document
- `blast-radius.json` — every entity the feature can reach
- `decisions.json` — who decided what, with what proof
- `targets.json` — the ask resolved, and what stayed unproven
- `context.md` — what was read, at which version
- `look/` — the surface notes

It does not get your account of the run, and it is not told what you were
worried about. Both would tell it where to look, which is the one thing
it must work out for itself.

Give it this brief:

> You are reviewing a product requirements document you did not write,
> for a feature on a UnifyApps app. Everything you need is in the firing
> folder. Read the document and its evidence files, then answer each
> check below `met` or `not met`. For `not met`, quote the line and say
> the smallest change that fixes it. Judge the document, not the process
> that made it. Do not edit any file.

## The checks

**Traceability**

1. Every requirement traces to the ask, to a decision in
   `decisions.json`, or to a cited read. None is invented.
2. Every requirement's `Proof` line actually supports what the
   requirement says. A read that proves a related fact is not proof.
3. Every `Acceptance` line is a concrete scenario with a visible outcome,
   and a test could be written from it without asking anything.

**Decisions**

4. Every decision marked `loop` carries proof that satisfies the proof
   rule: the app itself, consistently, with the read named. A decision
   that only looks reasonable is not met.
5. No decision marked `person` records something the person was not
   actually asked.
6. Nothing a person should have decided was decided by the loop — a
   product tradeoff, a scope boundary, anything irreversible or touching
   data, anything changing what an existing user experiences.

**Breakage**

7. Every blast-radius row appears in the impact table, with a
   `mustNotBreak` sentence that names a real behaviour rather than
   restating the change.
8. The high-risk rows are the ones that deserve to be: the write-conflict
   and contract layers, required-field changes, and role boundaries are
   not sitting at `low`.
9. No requirement contradicts a `mustNotBreak` sentence elsewhere in the
   document.

**Edge cases**

10. Every requirement has at least one edge case, and none of them is
    only a restatement of the happy path.
11. The five kinds are each considered or explicitly excused per
    requirement: empty and absent, many and large, concurrent and
    repeated, permission, partial failure.
12. Every edge case that comes from the app's own shape cites the
    blast-radius row or the read it comes from.

**Honesty**

13. Every unverified fact is marked unverified where it is used, and
    named in _Provenance_ with why.
14. Nothing is asserted about runtime behaviour that only the look could
    establish and the look did not cover.
15. A draft-versus-deployed difference is stated wherever a requirement
    rests on an undeployed draft.
16. _Open questions_ holds everything genuinely open, and nothing was
    quietly answered with a default.

**Readable**

17. A person who did not sit through the run can act on this document:
    the summary says what the feature is, the requirements say what to
    build, the impact says what not to break.
18. No run narration, no internal paths, no entity ids where a name would
    do, nothing about how the loop works.

## What it answers

One JSON file, `<firing>/review.json`:

```json
{
  "verdict": "not met",
  "checks": [
    { "n": 4, "name": "decisions · loop proof", "answer": "not met",
      "line": "| d7 | How many rows per page… | 25 | loop | cache page PG_1 |",
      "finding": "One page is cited, so there is no pattern to follow.",
      "fix": "Cite every list page read, or move d7 to the person." },
    { "n": 10, "name": "edge cases · every requirement", "answer": "met" }
  ]
}
```

`verdict` is `met` only when every check is met.

## What it never does

- It writes no file but `review.json`, and edits nothing.
- It does not read the tenant, open a browser or call an MCP tool. The
  evidence is the folder.
- It does not rewrite the document or suggest wording. It names the
  defect and the smallest fix.
- It does not grade the run. A stage that was skipped for a good reason
  is only a finding if the document hides it.

## Applying the findings

One pass. For each `not met`: fix it, or write down that you disagree and
why. Both go into the PRD's _Review_ section, with the finding quoted.

A second review runs only when the first changed a requirement — a fix to
a proof line or a `mustNotBreak` sentence does not earn one. Two rounds is
the cap. A finding still open after them stays in _Review_ marked open,
and the final message names it.

A finding you disagree with is not deleted. The reader decides which of
you was right.
