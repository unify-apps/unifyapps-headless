# Tickets — root causes, the tickets file, dedupe and the handoff

Two loops file tickets by this reference: the Test Studio ticket loop, whose
input is a triage firing's confirmed reds, and the web app design critic
(`/ua:app-design-critic-loop`, § Tickets), whose input is a review's merged
issues. Everything below binds both; where the critic's input differs (issue
IDs in place of execution ids, its own fingerprint prefix and scripts), its
own reference says so. Both read and write the same tickets contract, so a
team that runs both answers its questions once.

## Contents
- What a root cause is
- The tickets file
- The ticket's fields
- The tickets contract
- Who is assigned
- Dedupe
- The handoff
- The approval
- The report

## What a root cause is

A root cause is one defect in the app that explains why a set of cases
failed, whatever step or assertion caught each one. Twenty-five cases on
a Skills table failing at different steps, one on a search, one on a
delete, one on a column count, share one cause when every failure begins
with the row-actions button opening the editor instead of its menu: the
button's click bubbles to the row. Eleven upload cases of every size and
type that all end on `Failed` share one cause: the post-upload pipeline.

Group by the defect, not by the symptom:

- the same control or component misbehaving the same way, on any surface
  it appears on, is one cause;
- the same server error from one operation, whatever the case that
  called it, is one cause;
- two different controls that happen to fail with the same Playwright
  error are two causes;
- a case whose failure follows from another cause (the deleted skill
  still showing because Stop did not halt generation) joins that cause,
  with a line in the root cause saying so.

A group of one is fine when the evidence shows a defect of its own. What
is not fine is a ticket named after a case ("TC-110 fails") rather than
a defect ("a project renders as two cards"): that is a case, not a cause.
When the evidence cannot tell whether two groups share a cause, keep them
apart and say so in each root cause; a developer merges tickets more
easily than they split one.

A product question is grouped the same way, by the one change behind it:
two cases held because the homepage no longer lists recent chats are one
question, "the homepage shows conversation starters instead of recent
chats: intended?", asked once.

## The tickets file

`<firing>/tickets.json`:

```json
{
  "firingId": "20261016-2022-jpm2",
  "tickets": [
    { "fingerprint": "skills-table-row-actions-click-race",
      "title": "Skills table: the row-actions click bubbles to the row and opens the editor",
      "rootCause": "The ⋮ button of a Skills-table row handles its click without stopping propagation, so the row's own click handler runs too and opens the full skill editor over, or instead of, the actions menu. A direct JS click that skips the native event sequence works every time, and the dialog count goes from 1 to 2 on a native click.",
      "expected": "Clicking ⋮ on a row opens that row's actions menu and nothing else.",
      "observed": "The skill editor opens; the actions menu is covered or never shown.",
      "reproduce": [ "Open Settings → Skills as a user with one skill", "Click the ⋮ button on the skill's row", "The editor dialog opens over the menu" ],
      "cases": [ "<execution id 1>", "<execution id 2>" ],
      "evidence": [ "<execution id>-step3.png: the editor over the row", "dialog count 1 → 2 after the click (DOM read in the analyse residue)", "run <RUN-ID>" ],
      "kind": "bug", "layer": "UI", "related": [ "Possibly the same as ABC-101 (filed by another team)" ],
      "priority": "high", "module": "Skills table", "assignee": "<the module's UI owner, or the fallback assignee>" }
  ],
  "notTicketed": [
    { "executionId": "<execution id 3>", "reason": "already filed ABC-102" }
  ]
}
```

`fingerprint` is 2 to 12 lowercase words joined by hyphens, naming the
defect, stable across runs: the same bug found by next week's run gets the
same fingerprint, and that is what the dedupe matches. `cases` are
execution ids from `classified.json`, so `tickets-check` can tell a
confirmed bug from anything else. `notTicketed` reasons start with one
of: `already filed <key>`, `not confirmed` (the evidence turned out not
to show a defect: say what it showed), `person declined`.

## The ticket's fields

| Field | What it holds |
|---|---|
| `title` | `<component>: <the defect>`, at most 120 characters, no case key, no "test fails" |
| `rootCause` | 2 to 5 sentences: the mechanism as far as the evidence shows it, and how it was confirmed |
| `expected` | one sentence: what the step expected, as the product means it |
| `observed` | one sentence: what the page did |
| `reproduce` | numbered steps from one representative case, as a person would do them |
| `cases` | every confirmed bug this cause explains |
| `evidence` | screenshot files in the firing folder, DOM reads, run and execution ids, the analyse `evidence` line |
| `priority` | by the contract's rule; by default `urgent` for data loss, a security hole or a permission not enforced, `high` for 5 or more cases or a core journey blocked, else `medium` |
| `kind` | `bug` for confirmed App bugs, `product` for product questions; a ticket holds reds of its own kind only |
| `module` | the app area the defect lives in, named as the contract's module owners name their areas (`Skills table`, `Project files`, `Sharing`): the surface or component the root cause points at, never a case key |
| `layer` | where the fix lives: `UI` (the page renders, handles or orders it wrong), `BE` (a service answers wrong: an error, a 500, wrong data in the response), `UI+BE` when the evidence cannot tell, `Product` for every product question |
| `assignee` | the owner of `module` for the ticket's `layer` (_Who is assigned_), else the fallback assignee; the name as the contract writes it, resolved to an id only at filing. A `UI+BE` ticket's is a list of both owners, BE first |
| `question` | product tickets only, optional: the decision asked, when the default ("intended? then the cases are rewritten or retired; else a regression") does not fit |
| `related` | optional: a regression of a done ticket, a possible duplicate on another team, a ticket the defect may share a cause with; each a line naming its key |

## The tickets contract

`tests/<app slug>/tickets-contract.md`, the table below with a `Value`
column, filled at kickoff, read by every later run:

| Field | Source | Default |
|---|---|---|
| Tracker host | the contract | none. Only the link a table shows beside a key; without it a key stands alone |
| Team | `--team`, else the contract | none: asked at kickoff |
| Project | `--project`, else the contract | none: asked at kickoff, with "no project" |
| Title prefix | the contract | `[app-test] ` |
| Priority rule | the contract | the default rule of _The ticket's fields_ |
| Module owners | the contract: a link to the sheet that lists, per module, its PM, UI and BE owners (read again every run), or a table of the same columns, or `<module or area> → <person's name or email>` lines (one owner for every layer) | none. Each owner is named by the name or email the list holds |
| Custom fields | the contract: each field the team files with and its value per ticket kind and layer (a category such as `Bug`, a dev category `UI`, `BE`, `UI+BE`, `Product`) | none: the ticket carries no extra fields |
| AI dependency ticket | the contract: the key of the ticket that tracks mocking model calls in test runs | none: AI dependencies are only counted in the report |
| Fallback assignee | the contract | the person running the loop: asked once at kickoff by name or email and written back; every ticket whose module has no owner names them, so no ticket is ever unassigned |
| Testing status | the contract | the team status whose name contains `QA` or `Testing`: where a developer puts a fixed ticket for `app-test-signoff-loop` to verify |
| Rejected status | the contract | `QA Rejected`: where the sign-off loop puts a ticket whose re-run still fails the same way |
| Done status | the contract | the team's done status, `Done` when several: where the sign-off loop puts a verified ticket |

## Who is assigned

The module is the area the root cause points at, named as the owners list
names its modules. Within it, the layer picks the owner: a `BE` ticket to
the module's BE owner, a `UI` ticket to its UI owner, a `UI+BE` ticket to
the BE and UI owner both (`assignee` a list, the BE owner first; one name
when the same person owns both), a `Product` ticket to its PM. A cell that names several
people names its lead first or marks the lead (`(lead)`); otherwise the
first person named, and when the cell names a sub-area that fits the root
cause better (`chat history and search`, `message queue`, `project
sharing`), that person. An area missing from the list, or an empty cell,
goes to the fallback assignee and the report says so; a `UI+BE` ticket
with one of its two cells empty goes to the owner the other names.

## Dedupe

Three guards, each enough on its own:

1. **The ledger.** Every ticket the person filed has a
   `ticket:<fingerprint>` row with its key, so the same fingerprint in a
   later firing is `already filed <key>` before anything is written.
2. **The fingerprint line.** Every rendered description ends
   `Fingerprint: nebula-test-bug/<fingerprint>` (a review's ticket carries
   `nebula-review-bug/<fingerprint>`; either line is the same bug), so a
   person or a teammate searching their tracker for that line finds the
   ticket that already holds the defect.
3. **The person.** The ledger holds this app's own runs only, so the
   proposed list says so and the approval takes `<n>: filed <key>` for a
   row a teammate already filed.

A bug already filed gets a comment file with this run's id and the cases
that failed again, for the person to paste on that ticket, so it shows the
bug is still there. Only an open ticket counts as filed. One the person
says is done or cancelled means the bug came back: a new ticket is written,
naming the old one as `Regression of <key>` in `related`. A ticket for the
same defect on another team is named in `related` as a possible duplicate;
it does not stop this team's ticket.

## The approval

The person reads the proposed tickets as a page, never inside a question. Before the question, the loop writes `tickets-proposed.md` beside the `tickets/` folder (`loop.mjs tickets-list` on a test run, the critic's `tickets.mjs list` or `render` on a review): one table of the proposed tickets, one row each with its number, title, kind, priority, assignee, module, the cases or issues it groups, one line of root cause and a link to its rendered description; then a table of the tickets that get a comment instead (the existing key, its link, what the comment says); then the nitpicks left unfiled (a review only) and every other row not filed, with its reason. The first table is printed in chat as a Markdown table, with the file's path under it; a session with the Artifact tool also publishes the file as a private page and gives its link. Then one AskUserQuestion carries only the counts and the choice: "Write all <n>", "Write none", "Pick" (a free-text row: the numbers to write, a renamed title as `3: <new title>`, or `3: filed <key>`), and "Also write the <k> nitpicks" only when there are any. No ticket text goes in the question. Nothing is written without one of those answers; a dropped ticket goes to `notTicketed`, reason `person declined`, the check runs once more and the page is written again.

## The handoff

This plugin ships no issue-tracker tools, so a run writes and the person
files. Every ticket is one file, `tickets/<fingerprint>.md`, and the fields
are words, not ids: the team and project as the contract names them, the
title with its prefix, the priority as the word (`high`), never a number
read as another scale, and one assignee per layer — one name, or two for a
`UI+BE` ticket. The description is the markdown `tickets-render` wrote:
paragraphs, bold section lines, lists and a rule. A `#` line is not used,
because a tracker often renders a heading as nothing.

A ticket counts as filed only once the person gives its key back; that key,
and the link they give with it, go in the ledger row and the report. A
table that shows a key shows its link beside it when there is one, so
nobody looks a ticket up by hand. The description carries the app URL, the
run id, the firing id and the fingerprint line, and never a cookie, a
password or a raw evidence dump.

## The report

`<firing>/tickets-report.md`, after the last ticket is written:

```text
# Bug tickets <firing id> — <app name>

<n> written · <n> already filed · <n> declined · <n> not confirmed, from <n> confirmed bugs in <n> root causes.
```

Then: **Written**, one line per ticket, `<file> — <kind> — <title> —
<priority> — <module> <layer> → <assignees> — <n> cases`, with its key and
link once the person gives them; **Already filed**, `<key> — <title> —
<n> cases failed again, comment written`; **AI dependency**, `<key> — <n>
cases, comment written`, or `none`; **Declined**; **Not confirmed**, each with
its reason; **Run facts**: the analyse firing, the run id, check rounds,
every assignee that fell back and why, and each line of `reportLines`.
The final message only names this file's path and the new tickets' keys
and links (`SKILL.md`, _The last message is short_).
