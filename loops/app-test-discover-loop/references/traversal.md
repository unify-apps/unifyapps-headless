# Traversal — walking one page

## Contents
- Before you walk
- What a node is
- What an edge is
- The frontier
- One call per action
- What to exercise on a surface
- Platform chrome
- The app frame
- Creation walks and the request log
- A record made for your page
- A page that renders another page
- AI-generated output
- What is never touched
- Roles
- The survey files
- The fragment
- The depth check

The rules a `test-discover-agent` helper walks its page by. Ids are your
page's own (`N1`, `E1`, `S1.1`, `P1`); the merge renumbers them for the
run. `<pluginRoot>` in a command is the run file's `pluginRoot`.

## Before you walk

`skills/app-test-author/references/local-adaptations.md` binds on the
walk. Read its sections _Resolving the user id_, _Self-provisioning_, _The
readiness pair is unconditional after every navigation_ and _Walk
discipline_, and in _Phase 1_ the _Survey file_ paragraph and step 2. It
is written for the main session's browser; as a helper:

- Its `browser_snapshot`, `browser_find`, `browser_evaluate` and
  `browser_handle_dialog` are your `snapshot`, `find`, `eval` and
  `dialog-dismiss`, through `walk.mjs`.
- Where it says to sign in again, you never do: write the fragment as it
  stands and report `failed` with `signInFailed`.
- Its authoring rules (steps, payloads, pre-flight checks, submissions)
  are not yours.
- Other helpers create and delete records in the same app at the same
  time: the evidence that your action worked is your own record, found by
  its random name, never a total or a count that theirs also move.

## What a node is

A node is one surface in one state, as one role sees it. A surface is a
URL route with its visible content; a state is a shape of that surface
that a test could tell apart and that a control can leave it in:

- the default state on arrival;
- each tab, view mode or filter preset selected, and each collection,
  category or pill a list can be switched to;
- a list's next page, and a list at another page size;
- a dialog, drawer or side panel open, and a form open;
- a list's empty state (filter to a random string that matches nothing);
- a form's validation state (submit with required fields empty);
- the result a submit shows (a response, a confirmation), a created
  record's detail.

**A control you exercised landed somewhere: record where.** Evidence you
would write on an inventory line, `Next: Page 1 → 2`, `20 per page → Page
1 of 72`, `Clans → 6 cards`, `Send Request → response shown`, names a state
you reached. It is a node and an edge, never the line alone; the line alone
is a walk that stopped short, and _The depth check_ sends the page back
for it. Two visits that show the same route and the same shape are one
node, even when the data differs. A node has an id `N<k>`, the route, a one-line
title, its state, the roles that reached it, its survey file, its
inventory ids (`S<k>.<n>`, one per behaviour a test could check, numbered
by the node that owns them), and `terminal: true` when no walked edge
leaves it. A loading or error state is a node only when you can
reproduce it.

## What an edge is

An edge is one action on one node that lands on a node: a tab switch, a
filter that changes the list's shape, a submit that reaches a detail or a
confirmation, a Back or Close that returns. It has an id `E<n>`, `from`,
`to`, `via` (the inventory id of the control), a plain `action` ("click
New order", "submit the form with every required field empty"), the roles
that walked it, and a `kind`:

- `walked`, the default: you took it and saw where it landed.
- `nav`: a control of the frame around every page, one the pages repeat;
  the run file's `globalNav` lists the ones the map found, by hook. It is
  recorded **once, from the app frame node**, by the frame helper (your
  entry has `"frame": true`, _The app frame_): its first node is the frame
  as the entry's URL shows it, each frame control that lands on a route is
  a `nav` exit from that node (the entry's own route included), and a
  panel the frame opens (a menu, a drawer, an assistant) is a state of
  that frame.
  Every page helper, the entry page's included, records only the page
  body: a control in the navigation, header, footer, drawer or a floating
  launcher is the frame helper's whether or not `globalNav` lists it. No
  id, no edge, as _Platform chrome_ does.
- `untouched`: a control the walk saw and must not exercise (_What is
  never touched_). It is never part of a journey and is always a not-covered
  row.

**An exit** is an edge that lands on another route: `toRoute` holds the
URL it landed on, in place of `to`. Its page is walked by a helper of its
own; you go there only to finish a flow that starts on your page (_A flow
that leaves your page_): record the exit and go back. Ask
`node "<pluginRoot>/loops/app-test-discover-loop/scripts/pages.mjs" route --run <run file> --url "<URL>"`
whenever the path an action lands on differs from your page's route: the
same `route` is a state of your page; any other is an exit.

An action that changes nothing visible is an inventory item, not an
edge; it is a defect only when _The survey files_ count it critical. An action that opens a new tab
or window is an exit when it stays on the app's origin; otherwise an
inventory item with a `not expressible` row.

## The frontier

The frontier is the list of your page's nodes recorded but not yet
walked, in the order they were found. Start it with `N1`, the page's
default state at your `startUrl`, and write the fragment at once with
`N1` in it. Then, until it is empty:

1. Take the first node. Open it in your browser for the role, and apply
   the readiness pair. Every browser is opened with
   `--config=<browserConfig>`, as the run's device
   (`app-test-author/references/devices-and-browsers.md`,
   _Walking as the device_); never `resize` it.
2. Record what you see (_What to exercise on a surface_): the inventory,
   every edge out of it, and every new node those edges land on, appended
   to the frontier.
3. Return to the node before the next control.
4. Write the node's survey file and rewrite the fragment whole, with the
   frontier as it now stands.

A node found again is matched by route and state to one already recorded,
and the edge points at it; it is not walked twice. A node reached only
through an `untouched` control is not walked; it is recorded with
`reachedBy: "untouched"` so it lands in a not-covered row.

## One call per action

A walk step is one action, its readiness wait and the scoped read of its
effect, and it costs one call:

```bash
node "<pluginRoot>/loops/app-test-discover-loop/scripts/walk.mjs" "<browser folder>" click <ref> -- wait-for "<text the result shows>" -- find "<the region the next decision needs>"
```

`walk.mjs` runs each `browser.mjs` command in order, separated by `--`,
prints each one's output under its own heading (30 lines, the last one
150), and stops at the first command that fails. Chain as far as the next
decision allows: a form is its fills, its submit, its wait and the read
of the result in one call; a menu is its open, its read, its close. The
only call that stands alone is the full `snapshot` on first arrival. A
call that runs one command, or a turn spent between an action and the
read of its effect, is a defect. Never `sleep`: a wait is `wait-for <text> [cap-ms]`, a read with a
cap.

## What to exercise on a surface

The run file's `depth` says how much of each page is a state. At `core`,
the default, every control still gets an inventory line, but a state is
recorded once per kind: one tab or pill of each set beyond the one
selected on arrival, one page of a paginator, one filter or sort applied,
one dialog open and its validation state; the other tabs, pills and pages
of the same set are inventory lines that name the one walked (`same as
S1.6`). The right-to-left and double-click variants below are walked at
`full` only; at `core` they stay the variant rows the check produces. At
`full`, every tab, pill, page and panel is a state and every variant is
walked.

On arrival, one full `snapshot`; then exercise, once each, with a fresh
ref before every action:

- every navigation control, link and row that opens something;
- every button and menu item, except those _What is never touched_ names;
- every tab, view switch, sort, filter, search box and paginator, each
  once, reading the region it changed and going back; a row of pills or
  chips that switches which collection, category or view a list shows is
  a set of tabs, one id per pill. List the ids selected on arrival (one
  per tab set) in the node's `"selected"`: those land nowhere; every other
  tab owes its edge;
- every form, twice: once submitted empty for its validation state, once
  filled with random throwaway values, saved, followed (_A flow that
  leaves your page_) and deleted through the app's own control when it has
  one. Opening a form, a dialog, a drawer or a menu changes nothing and is
  always walked, whatever record the form is about. On a record you did
  not create, submit the form empty only when the client blocks it (a
  disabled submit, required marks, a validation message with no request
  sent); otherwise the submit is the confirming action, recorded as an
  `untouched` edge (_What is never touched_);
- at `full` depth, every input, once more with right-to-left text (`مرحبا`), in the same
  chained call as its ordinary fill: the read after it says whether the value shows as typed;
- at `full` depth, every submit, once double-clicked on a throwaway, with the read after it
  counting the rows that carry your random name;
- every toggle, once on and once off, when it changes only what the
  signed-in user sees; one that changes what every page shows (a theme,
  a preference, an app-wide setting) is exercised and put back in the same
  call, and its inventory line says `shared state`;
- every KPI or summary number, read beside the rows it summarises, and the cross-check named in the survey file.

Each control's effect becomes an edge, a new state or an inventory note.
A column with its sort and its filter are separate ids when a test could
check them apart.

**Every inventory line carries its kind**, in brackets after the id:
`- S1.8 [input]: Search box, aria-label 'Search solutions'`. The kinds are
`input` (a text box, a prompt, a search box), `form` (a form with a save
or send), `submit` (a save, send or create control on its own), `toggle`,
`select` (a dropdown, picker or menu that sets a value, a page size), `tab`
(a tab, a view switch, a pill of a set), `pager` (a list's Next, Prev or
page number), `list` (a table or list with its rows), `link` (opens
somewhere), `button` (acts without a value), `state` (a shape of the
surface a test can tell apart) and `other`. The node's `"inventoryKinds"`
repeats them by id; the kind decides which variants the id owes, and an id
with no kind owes none. A `tab`, `select`, `pager`, `form` or `submit` id
also owes the edge to the state it lands on (_The depth check_). Two rules
keep that owing honest: a form and its own save button are one id, kind
`form`, and `submit` is only a control with no form around it; a dropdown,
picker or date field inside a form is `input`, never `select`, since the
form's submit owes the edge, not its fields, and `select` is a control
that changes the surface on its own (a filter, a sort, a page size, a view
picker).

**A flow that leaves your page.** A flow worth a scenario that starts on
your page goes on to other pages for as long as it needs: your saved
record shown in another list and in its detail, a row that opens a detail
page and what that page shows. There, read only what the flow checks:
never explore the page's other controls and never record a node there;
its own helper owns it. Write one inventory id of kind `state` per fact
the flow checks off your page, on the node the flow left from (`- S3.6
[state]: the new request shows in My requests (/requests) with status
Submitted`). The way there is the exit already recorded from that node
(the action itself, when it lands there); add one only when none exists.
When only the app's navigation leads there, the id names no exit.

## Platform chrome

On a survey of the platform only. The platform draws the same frame
around every screen: the side navigation, the AI FDE button, the tenant
and branch switchers in the breadcrumb bar, notifications, the user menu.
None of it belongs to the module under survey. The main session reads it
once, before any helper starts, and the run file's `"chrome"` lists each
control by hook and label. **A chrome control gets no inventory id and no
edge**, on any surface: skip every control whose hook the list holds. The
module's own header controls (a New button in the page header's own view,
the surface's tabs) are not chrome; they are inventory.

In a builder or code app nothing is chrome: the run file's `"chrome"` is
empty (`init` refuses a list for an app), and the frame around its pages
is the app's own, walked whole by the frame helper (_The app frame_).

## The app frame

The frame helper's job (`Job: walk frame`; its entry has `"frame": true`,
no `route`, and the entry's URL as `startUrl`). On a survey of the
platform, walk only the controls `globalNav` lists; the platform's frame
around them is chrome (_Platform chrome_) and is never numbered. In an app
the frame is a part of the app like any page, and every part of it is
checked:

- **Its first node** is the frame as the entry's URL shows it, the page
  body left alone: the entry page's own helper walks that.
- **Walk every control the frame holds**, not only the ones `globalNav`
  lists: each item of the navigation (a `nav` exit per route it lands on,
  the entry's own route included), the brand or logo link, every header
  and footer control (a search box, notifications, the user menu, help, a
  language or theme switch, a global New or Create button and the dialog
  it opens), the side navigation's collapse and expand, the hamburger or
  drawer the run's device shows, breadcrumbs, a floating launcher or
  assistant and its panel. Each panel, menu or drawer open is a state of
  the frame, a node of yours; each control is inventory with its kind and
  owes the same variants a page's does; a footer link to another origin is
  a `not expressible` line.
- **A page only the frame leads to** (a profile, a settings page, help,
  the sign-in page, a not-found page) is an exit from the frame node:
  record it and go back; `pages.mjs report` queues it for a helper of its
  own. The sign-out control is `untouched`.
- **Walk the frame as every role**, as _Roles_ says: a navigation item or
  a menu entry only one role has is a new id and, when it lands somewhere,
  an edge with that role alone.

## Creation walks and the request log

Record how the app makes each record you create. Before the creation walk, in the same chained
call as the first action of it:

```bash
node "<pluginRoot>/loops/app-test-discover-loop/scripts/walk.mjs" "<browser folder>" log-requests on -- click <ref> -- wait-for "<the record's landing>"
```

and once the record has landed, and again after you delete it:

```bash
node "<pluginRoot>/loops/app-test-discover-loop/scripts/walk.mjs" "<browser folder>" log-requests read
```

The log keeps every same-origin request that is not a GET: its method,
path, the keys of its body, its status, the id its response carried and
how long it took; **never a header, a cookie or a body value**. It is **installed again after every reload or navigation**
(`log-requests on` a second time is harmless). Write the create call, the
one whose response carried the new record's id, into the fragment's
`provisioning` as a recipe:

```jsonc
{ "id": "P1", "observedOn": "E5", "method": "POST", "path": "/api/entity", "bodyKeys": [ "entityType", "properties" ],
  "idField": "id", "deletePath": "/api/entity/e_solution/delete/<id>", "durationMs": 184000, "viaAgent": true }
```

`deletePath` is the call you saw when you deleted the throwaway, with the
id replaced by `<id>`; `durationMs` is the time from the submit to the
record's landing surface; `"viaAgent"` is true when a model turn ran
between the two (a Stop button, a streaming reply, a "Generating…"
state). A creation whose create call the log did not see gets no recipe.

## A record made for your page

When your entry's `startUrl` names a record (an id in its path), the main
session made that record for you at the scan: it is the entry of
`seed-records.json`, beside the run file, whose `route` is your page's.
It is yours alone, so walk it as a throwaway: edit it, rename it, link and
unlink things to it. Deleting it is your last action, and it comes only
after the depth check passes on your fragment as it stands:

```bash
node "<pluginRoot>/loops/app-test-discover-loop/scripts/pages.mjs" check --run <run file> --key <your key>
```

Fix every problem it names (_The depth check_), run it again, and only
when it answers `"problems": []` delete the record through the app the way
its `deleteBy` says, listing it in your fragment's `throwaways` with
`deleted` true or false. A page whose seed is gone is never sent back: a
problem the main session's `report` still finds then stands in the run
report as yours. Never make another record of that type to reach your
page, and never open another page's record.

Check the record before you change it: a seed record carries the scan's
throwaway name (`qzx<digits> survey throwaway <page>`). A record by any
other name, the folder's own solution above all, is not yours: walk it
read-only, never rename, edit or delete it, and add a `notes` line
`Seed record not a throwaway: <name> (<id>)` so the main session fixes its
scan.

A seed marked `shared` is walked by other helpers at the same time, each
on a route of its own under the same record: never rename, delete,
publish or restore it, and never change what every route of it shows (its
title, description or tags). Make and delete only child records of your
own (a user, a team, a role, a note), found by their random names. Leave
the record as you found it; the main session deletes it at cleanup. A
control that would change the shared record itself is an inventory line
with `shared seed` on it, exercised by the helper of the record's own
route, never by you.

A seed marked `built` was generated by the app's AI with the contract's
prompt, so your page shows what a built record shows: walk all of it, the
output's content excepted (_AI-generated output_). A surface on it that
needs one more step of the record's own life (the Versions list needs a
published app) is yours to take on your own seed: publish it, and record
Publish as the edge that got you there. What the build made beside the
record (an object, a preview app) stays when the record is deleted; name
it in `throwaways` with `deleted: false`.

## A page that renders another page

Some routes show a page that is already another route's: a router's
catch-all that falls back to the home component, an alias route, a
redirect the browser does not show in the address bar. Run this check
only when your key is `fallback`, or when the page's heading is the name
of another route in the run file's `pages` (a heading `Orders` on a page
whose route is not `/orders`). Compare with the run's entry route first,
then with that named route: open it once in your browser, read its first
heading and the first five controls of the page body in snapshot order
(role and name), and nothing more. The same heading and the same five
controls make it the same page: that page's helper owns the controls, and
you record the fact, not the page again:

- one node, the default state, with one `state` id on it ("the unknown
  path `/qzx…-no-such-page` renders the dashboard of `/`; no not-found
  page");
- the fragment's `"sameAs"` set to that route (`"sameAs": "/"`), `status`
  `walked`, an empty frontier;
- `rolesDone` naming every user of the run not marked `dropped`: open the
  `startUrl` once as each, read the heading, and add the user; a role that
  sees a different page walks it as _Roles_ says;
- no other node, edge or survey line.

Any difference in the heading or the five controls makes yours its own
page.

A page that shares only the frame with another is not the same page, and
a page that renders another route's body with one difference (a banner,
a missing control) is its own page: walk it, and say in its survey file
what differs.

## AI-generated output

Some actions of the app make an output with a model: a solution built from
a prompt, an artifact generated in a chat, a plan written by an agent.
Whether that output is good or right is Eval's question, never Test
Studio's, so the walk never judges it:

- **Never number the output's content.** The screens of a generated app,
  the text of an artifact, the sections of a generated plan get no
  inventory id and no node of their own. A page that holds only the
  generated output (a generated app's preview, opened in its own tab or
  route) is not a page of the walk: the action that opens it is an
  inventory line, `[link]` or `[button]`, "opens the generated output in a
  new tab", with no exit and no `toRoute`, so no helper is sent there.
- **Do walk every action of the app around it.** What the output unblocks
  belongs to the app under test and is inventory like any other control:
  in the Solution Builder, Publish, the Versions list, Restore, opening the
  preview; in Enterprise Brain, downloading the artifact, clicking the
  artifact card to open it on the right, the previous and next page
  buttons. Record what each does to the platform's state (a version
  listed, a panel open, a file downloaded), never what the output says.
- **Make the output small.** When your page needs a generated output that
  its record does not have yet, generate it with the contract's AI
  generation prompt for that path, and only that prompt: the smallest
  output that unblocks the actions after it. The contract with no prompt
  for the path makes the actions behind it rows, `could not reach: AI
  generation has no prompt in the contract`, and the question goes in
  `wouldHaveAsked` with the prompt you would use as `proposedDefault`.
  Wait for the generation at most the contract's AI generation wait; one
  that takes longer is a row, `could not reach: AI generation took over
  <minutes> minutes`.

## What is never touched

Anything that emails, pays, notifies another person, deletes or changes a
record you did not create, bulk actions over existing rows, account or
security settings, sign-out, and another user's data. The contract's
untouched-controls field may add to this list, never shorten it. Such a
control is an `untouched` edge (or an inventory item when it opens
nothing) and goes to a row with reason `out of scope: <which>`. Protecting
other people's data never excuses the walk from recording the control.

What is untouched is the action, never the way to it. A button that opens
a form, a dialog or a menu is walked and the surface it opens is a node.
On a record you did not create, submit the form empty only when the client
blocks it (a disabled submit, required marks, a validation message with no
request sent); otherwise the submit is the confirming action. The
confirming control (Save, Confirm delivery, Mark as failed with a reason)
on a record you did not create is recorded as an `untouched` edge from the
node the form is open on, `via` its id, `to` that same node. An
`untouched` edge satisfies _The depth check_: the id keeps its kind `form`
or `submit`, never `button` or `state`.

## Roles

The run file's `users` holds one test user per role; skip a user marked
`dropped`. Walk the whole frontier as the first role, add that user's id
to the fragment's `rolesDone`, then open every recorded node as each
other role, record what differs, and add that role in turn. A surface the
role cannot open is noted on the node's `roles`; a control only that role
has is a new inventory id and, when it lands somewhere, a new edge with
that role alone. A behaviour with more than one person (a message the
second role sees, an approval the second role grants) is one inventory id
on the first role's node and one on the second's. A public app has one
role and no sign-in.

## The survey files

One per node, the format of `local-adaptations.md`'s _Survey file_,
beside your fragment as `survey-<k>.md`, and named in the node's
`surveyFile` by that bare file name.

A survey file is a list, not an essay. Record a defect (a trap, a broken
behaviour) only when it is critical: a task the page exists for is
blocked, data is wrong or lost, the app shows an error, or a control that
task needs does nothing (its main action, its save or submit, the way
into it). Judge it from your page alone; which scenarios are core is
decided after the walk. A cosmetic quirk is not a defect; leave it out. A
hook an author needs (a decoy copy, two fields sharing an id) stays on its
inventory line. A defect is one line: the control and what trips on it. An inventory line is the id with its kind, the
control, what it does and the hook found, with evidence in a few words
(`dead control`, `Ready 9 → 10 after one create`). The hook found is what
`generate-locator <ref>` answers for the control, chained in the same
`walk.mjs` call as the read that gave the ref; `walk.mjs` never cuts its
answer. Keep it only when it passes `app-test-author/references/local-rules.md`,
_Record identity is data, not a hook_ (no `e_` id, hex run, UUID or
business number in any attribute value, accessible name or text) and uses
the rulebook's locator vocabulary; otherwise write the hook the dialect's
ladder gives, read with one `eval`. A control set a surface
repeats (three charts with the same five buttons) is walked once and the
other ids say `same controls as S1.21–25`. Keep the file under 4 KB: to
fit, first collapse repeated sets that way, then cut each line's evidence
to its few words. Never drop an id to fit; a file that still runs over
keeps every id.

## The fragment

Your page's part of the graph, in your entry's `fragment` file, rewritten
whole after every node:

```json
{
  "key": "orders", "route": "/orders", "status": "walking",
  "entry": [ "N1" ],
  "nodes": [
    { "id": "N1", "url": "/orders", "title": "Orders", "state": "default", "roles": [ "<user id>" ],
      "surveyFile": "survey-1.md", "inventory": [ "S1.1", "S1.2", "S1.3" ],
      "inventoryKinds": { "S1.1": "link", "S1.2": "input", "S1.3": "button" },
      "selected": [ "<the tab ids selected on arrival, one per tab set; they owe no edge>" ] },
    { "id": "N2", "url": "/orders", "title": "Orders, no match", "state": "empty", "roles": [ "<user id>" ],
      "surveyFile": "survey-2.md", "inventory": [ "S2.1" ], "inventoryKinds": { "S2.1": "state" }, "terminal": true }
  ],
  "edges": [
    { "id": "E1", "from": "N1", "to": "N2", "via": "S1.2", "action": "search for a random string", "kind": "walked", "roles": [ "<user id>" ] },
    { "id": "E2", "from": "N1", "toRoute": "/orders/42", "via": "S1.1", "action": "click the first row", "kind": "walked", "roles": [ "<user id>" ] },
    { "id": "E3", "from": "N1", "to": "N1", "via": "S1.3", "action": "Delete all orders", "kind": "untouched", "roles": [ "<user id>" ] }
  ],
  "provisioning": [],
  "frontier": [],
  "rolesDone": [ "<user id>" ],
  "throwaways": [ { "record": "<what you created>", "deleted": true } ],
  "reason": "<why, when the page is unreachable>",
  "sameAs": "<the route this page renders, when it is another page's (A page that renders another page)>",
  "wouldHaveAsked": [ { "question": "<a decision the contract does not make>", "proposedField": "<field>", "proposedDefault": "<default>" } ]
}
```

`status` is `walking` until every role is in `rolesDone` and the frontier
is empty, then `walked`. A page whose `startUrl` opened another route is
`redirected`, with `landedOn` the URL shown and no nodes. A page no user
could open, or one whose `startUrl` would sign out or act on opening, is
`unreachable`, with the reason in `reason`. A decision the contract does
not make goes in `wouldHaveAsked`, and the item it concerns stays
recorded.

## The depth check

`pages.mjs report` reads a fragment reported `walked` and sends the page
back to the queue when the walk stopped short of what the page shows,
but only when the page has been dispatched just once: a page already
redispatched after its deadline is not sent back again. One helper on one rich page explores less than a walker
that spends its whole budget there, so the script holds the line:

- an id of kind `select`, `pager`, `form` or `submit` with no edge whose
  `via` is that id (an `untouched` edge counts): the state it lands on was
  never recorded;
- at `core` depth, a node whose `tab` ids have no edge at all: a tab set
  owes one edge, from any one of its tabs; at `full` depth, a `tab` id
  with no edge that the node's `"selected"` does not name: each tab
  selected is a state, and only the tabs selected on arrival land nowhere
  (a node that names none may leave one tab without an edge);
- `status` is `walked` while `frontier` still names a node;
- a user not marked `dropped` is missing from `rolesDone`.

The page's next helper gets the problems as its message's `Problem:` line,
continues from your fragment (every node, edge and survey file kept) and
fixes only what the line names. The second report is final: what it still
leaves goes in the run report. A page whose helper deleted its seed is not
sent back at all, since nothing is left to open: run the same check
yourself, `pages.mjs check --run <run file> --key <your key>`, before the
delete (_A record made for your page_). A control of these kinds that is disabled,
or whose click leaves the region read after it unchanged (a Next on a list
of one page), is given kind `button` or `state` with the reason on its
line, never left as a kind that owes an edge.
