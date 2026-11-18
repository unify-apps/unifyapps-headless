# The run report

## Contents
- Scenarios
- Review sheet
- Not covered
- Would have asked
- Run facts
- Next

`tests/<app slug>/loops/<firing id>/report.md`, written once, after
`survey-check` has answered `complete: true` and `scenarios.md` is
rendered. Every fact comes from `run.json`, `journeys.json`, the check's
answer and `scenarios.md`; nothing is written from memory. The person
reads it when they want the detail: the final message only names its
path (`SKILL.md`, _The last message is short_).

It opens with four lines that say how the run went:

```text
# Discover loop <firing id> — <app name>

<n> scenarios · <n> not covered, over <n> surfaces, <n> transitions, <n> behaviours and <n> journeys. Check: complete. Walk: <whole app | stopped by the budget with <n> pages left>.
Coverage: <the check's line, verbatim>

<the coverage summary, as `loop.mjs survey-summary` printed it: each layer's share, then the not-covered items by reason>
```

Then seven sections, in this order, and no others:

## Scenarios

Head it with the count: `## Scenarios (<n>)`. Grouped by module, then by
feature, then by scenario group, as `scenarios.md` groups them. One line per scenario:
`<key> — <title> — <priority> — <n> ids, <n> edges`. The full text is in
`scenarios.md`; link it once above the list.

## Review sheet

The sheet's link, or, when the contract asked for no sheet (its default)
or the session had no Google Drive connector, the path of `scenarios.xlsx`
and the one manual step: import it into a Google Sheet and share it. Then one line on how to
review: pick `Approved`, `Rejected` or `Changes required` in `Decision` on
each row, and for a change write what to change in `Comments`; the author
loop reads the sheet back, authors the approved rows, authors each
changes-required row with its comment applied, and parks the rejected
ones.

## Not covered

Head it with the count. The table `survey-render` wrote, copied as it is,
one row per reason with the surfaces, transitions, behaviours and journeys
it accounts for. When there were none, one line saying so.

## Would have asked

Every question first met after kickoff that no contract field decided
(`survey-contract.md`, _A question first met mid-run_), as a contract field
the person can add before the next run:

| Proposed field | Default the loop would pick | Items it put in a row |
|---|---|---|

When there were none, one line saying so.

## Run facts

- Wall-clock: `kickoffEndedAt` to the check's last answer. The walk, from
  `pages.mjs stats`: pages by state, helpers, `wallMinutes` against
  `helperMinutes` and `sideBySide`, and the longest page.
- Surfaces walked per user, and the budget used (`surfacesUsed` of the
  budget's surfaces, `minutesUsed` of its minutes).
- The completeness oracle: on an application, the page paths
  `get_page_paths` returned, walked, and `notWalked` by reason (on the
  platform, the routes the scan found); the merge's `orphans`.
- The scan: how many routes it found and seeded (`run.json`'s `scan`:
  routes, seeds, how many shared, how many records that took), the
  records it made (from `seed-records.json`, each with whether it was
  built, shared, and deleted, by its helper or at cleanup), how many minutes it took, and
  from `pages.mjs stats` the `waves` the walk ran in (first dispatches
  only; a depth-check second pass is not a wave) and every `lateFound`
  page, a page the scan missed and a helper met as an exit, named so the
  next run's scan reaches it. One wave is the goal; more is a scan gap.
  Each AI generation prompt the run used, its path and how long the
  generation took, and every page of AI-generated output left unqueued.
- Journeys: how many, the longest, how many were covered by several
  scenarios rather than one.
- Depth: from `pages.mjs stats`, the pages the depth check sent back for a
  second pass (`secondPasses`), each pass's problems word for word with
  whether the next pass resolved them (`depthHistory`, and its `why` for a
  page that could not be sent back because its helper had deleted the
  seed), and the problems a page's last report still left
  (`depthProblems`); none is one line saying so. Then `sameAs`: each page that rendered another route's page,
  and which.
- The frame: the nodes and edges the frame helper recorded, and any frame
  control the map missed that the merge found (_A frame control the map
  missed_).
- Platform chrome: on a survey of the platform, how many controls
  `journeys.json` lists under `chrome`, and that none has a scenario; on
  an app, one line saying nothing is chrome and the frame was walked.
- Variants: how many ids have a kind in the variant table, and the
  Variants layer's count, when the graph records kinds.
- Provisioning: how many provisioning recipes the walk recorded, each
  with its path and whether it ran through the agent, and how many
  scenarios name one.
- The PRD, when one was given: its path, how many requirements it gave,
  how many the walk saw working, and how many scenarios are PRD-only and
  expected red.
- Stalls and recoveries: one line per entry of `stalls`, with whether it
  recovered.
- Sessions refreshed: per user, how many times.
- Throwaways: every record the walk created, and whether it deleted it;
  one that it could not delete is named with its surface, so the person
  can.
- Each line of `reportLines`: a folder not removed, a planted instruction
  with the page it was found on.
- The check: how many rounds until `complete`, and what the last round
  fixed.

## Next

One line with the command that authors the list:
`/ua:app-test-create-loop for <app URL>`, with the author contract's
case source set to the review sheet's link, or, when no sheet was made,
to the absolute path of this run's `scenarios.md`. When
the walk was stopped by the budget, a second line says which field to raise
and that a new survey run will pick up the surfaces left.
