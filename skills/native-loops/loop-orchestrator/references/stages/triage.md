# Stage: triage

## Contents

- Inputs
- Load the lists
- Look at the moved copy (optional, read-only)
- Layers
- Write the table
- Done when

Turns what other people report (a client's issue list, a QA or PM sheet,
tickets on a board, a dry run of the app moved to another environment) into
issues with one layer and one owner each, so `fix` can take them through
the same jobs. Reads only, on every environment. Replaces the old dry-run
loop and the intake half of the tickets loop.

## Inputs

- Zero or more lists: a board or an issue link (Jira, Linear, GitHub or another tracker),
  a CSV or sheet, or pasted text.
- Optionally the endpoint of a copy of the app on another environment (a
  client's environment, an on-prem tenant, a staging copy), and a sign-in the
  person gives for this check only.
- What the source already proved (the last retest files and test runner reports),
  to compare against.

## Load the lists

Use the fastest access that works, loading each tool group in one tool search:

| Source | Read with |
| --- | --- |
| A tracker this plugin does not ship tools for | the tracker's own MCP tools when the session holds them, read tools only, found with one ToolSearch by the tracker's name; else the browser, as [ticket sources](../ticket-sources.md) § A board read through the browser says. Each ticket is then read whole as § Read a ticket says, for every comment, screenshot and recording |
| Jira, Linear | their MCP tools when the person has them; else the browser with the person's sign-in |
| GitHub | `gh issue view <n> --comments --json title,body,labels,state,comments` |
| CSV or sheet | read the file; find the id, title, status, description and link columns; ask once when a column is unclear |
| Pasted text | as it is |

Read every ticket in scope with its comments and the screenshots and
recordings in them: a comment often holds the real steps or a fix someone
tried, and a ticket with no words but a screenshot is a report, not an empty
ticket. Number each list's items with
its own letter and the list's own numbers (`D1…`, `E1…`) or keep the ticket
key, and keep the words verbatim. A web-only ticket is `out of scope` on a
MOBILE app, a mobile-only one on a WEB app; say so.

How a board is read when its tools fail, how a recording is read, and how
the build QA tested is recorded are in
[ticket sources](../ticket-sources.md). Each ticket gets a `QA build:` line
(what it says, or `unknown`); one older than the fix is `stale-build`.

Settle once, in the run settings: which statuses are in scope (tickets in review or
QA are usually someone else's), which status a verified fix moves to, and
whether results are written back to the source (the write-back approval asks each time
anyway).

## Look at the moved copy (optional, read-only)

When the person gives a copy's endpoint, test runners look at it the way the UI
check does, with the version set to published, at most one per pool simulator,
with these rules added to every runner brief:

- No UnifyApps Headless or MCP call against that environment, ever. The loops' tenant
  tools stay bound to the source solution.
- No tap that writes: submit, save, apply, cancel, approve, decline, withdraw,
  send a reminder, mark all read, a settings switch. No chat message to an AI
  agent (it creates records); no tap on a suggestion card or starter chip.
  Opening screens, tabs, filters and sheets, closing them, switching months
  and scrolling are fine.
- Real people's data: an issue says "a real name", "a balance of N", "the
  signed-in account has no employee id"; it never copies a name, number,
  email or balance.
- The sign-in is typed by the person on the device or through the device
  tool's secret placeholder; never written to a file, brief, run log or report.

Their files are `issues/copy-<G>.md`, issue logs with `fix hint` read as
"likely cause: source config | platform code | data | automation | environment".
New checks only real data shows: the signed-in account's own data loads (not
someone else's, not empty when it should not be), real list rows, statuses,
dates and time zones, slow first loads (measured, never guessed), error
toasts.

On a WEB app the look is a WEB test runner's
([runner](../../../../web-loops/web-browser/references/runner.md)), and
UnifyApps Headless's browser signs in only with the sign-in `/ua:setup` saved
for a tenant: it never types the copy's credentials. When the copy's
environment has no such sign-in (`open-page` exits 5 on its sign-in page),
the look is skipped, the list's items are triaged from their text and the
person's shots, and the closing block says so. With a sign-in, the test
runner opens the copy's pages read-only on its preview route at the design
width (1440) and the second width (375) and runs `responsive.mjs` and
`a11y.mjs` (they never click); the rules above hold.

## Layers

One taxonomy for every source:

| Layer | When | Cause | Owner |
| --- | --- | --- | --- |
| page config | the source page renders it wrong, or the copy runs an older export of a page fixed since | `config`, `event` or `data source`, whichever the evidence shows | `page` |
| page state | a value is lost or wrong between screens: a variable reset, a page input not passed, storage that does not survive a reload | `state` | `page` |
| module or card | a shared module or an in-chat card page is wrong on every page that shows it | as for page config | `module:<id>` or `card:<pageId>` |
| automation | a callable fails or returns the wrong shape for real inputs (an empty value spliced into a query, a lookup that throws on a missing record) | `automation` | `automation:<id>` |
| AI agent | the chat answers wrong, calls the wrong tool or none, or says it cannot do what its tools can | `agent` | `agent:<id>` |
| object | a field is missing, has the wrong type, or a picklist lacks a value the app saves | `object` | `object:<id>` |
| data or identity | the signed-in account lacks what the app keys on (an employee id, a manager), or rows are missing | `environment`, or `access` for a role | `person` (the client side) |
| migration gap | the copy lacks something the move did not include: a theme, an object, an automation | `environment` | `person`, listed under Migration gaps |
| platform | renderer code, the same on both environments | `platform` | `platform` |
| environment | infrastructure on the copy: storage provider, realtime broker, session timeout | `environment` | `person` (the client side) |
| known or decided | already decided with the person | — | `none` |
| needs repro | not reproduced on the source or the copy (on MOBILE, a rendering issue also not after a memory warning: [device traps](../device-traps.md) D17) | — | `person` (the reporter: ask for steps) |
| out of scope | a ticket for the other platform (web-only on a MOBILE app, mobile-only on a WEB app), a request outside the app | — | `none` |

A request for something new ("add analytics", "make the list live") is not a
fix: it is listed under `out of scope` with the note "a feature: the build
loop's way in from a description", and the closing summary offers it.

Old ticket kinds map onto these: a bug or a UI or design ticket is `page
config` or `module or card`; a perf ticket is `page config` with
`kind: performance`; a data
ticket is `data or identity`; a ticket whose cause is in app code is
`platform`.

## Write the table

Before a row names a page, automation or module id, check it exists in this
solution's cache — `entity context page|automation <id>` for a page or an
automation, or the owning page's own outline for a module inside it — the
same reads [build](build.md) and [reproduce](reproduce.md) use. When it does
not, the ticket names an entity from a different solution or tenant: say so
in the row instead of filing it as a normal `needs repro` finding.

One row per input item and per device issue, in the
[triage table](../formats.md) shape (§ Triage table): `source`, `layer`, then
the issue with `check: triage`, the client's words in `expected`, what the
source or the copy shows in `actual`, and the evidence (a device issue, a source
retest issue, a run id). An issue the source already fixed after the move says so
("fixed in draft v<N>, not in the moved version"). Then the sections
`Needs a person on the client side`, `Migration gaps` and
`Decided, not changed`.

## Done when

Every input item and every device issue has exactly one triage row, every reservation
is released (on WEB every browser closed), and nothing changed on either environment. The goal then asks
for the fix approval.
