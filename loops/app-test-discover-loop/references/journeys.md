# Journeys — the graph, the scenario file and the coverage check

## Contents
- The graph file
- What a journey is
- The scenario file
- The coverage layers
- The variant table
- Requirements from a PRD
- Chains
- The fixed reasons
- The four commands
- When the check is not complete

The walk writes a graph; the loop proposes scenarios against it; a script
decides whether they cover it. The script is
`${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/loop.mjs`, the same
file the other Test Studio loops use, and its answer is the only thing
that makes a run complete. Nothing here is judged by reading.

## The graph file

`<firing>/journeys.json`, rewritten whole after every node the walk
records (`traversal.md`):

```json
{
  "appUrl": "<the app under test>",
  "entry": [ "N1" ],
  "nodes": [
    { "id": "N1", "url": "/", "title": "Home", "state": "default", "roles": [ "<user id>" ],
      "surveyFile": "survey/survey-1.md", "inventory": [ "S1.1", "S1.2" ],
      "inventoryKinds": { "S1.1": "link", "S1.2": "input" }, "terminal": false }
  ],
  "edges": [
    { "id": "E1", "from": "N1", "to": "N2", "via": "S1.1", "action": "click Orders in the side navigation", "kind": "nav", "roles": [ "<user id>" ] },
    { "id": "E3", "from": "N2", "to": "N3", "via": "S2.1", "action": "click New order", "kind": "walked", "roles": [ "<user id>" ] },
    { "id": "E7", "from": "N5", "to": "N5", "via": "S5.1", "action": "Delete account", "kind": "untouched", "roles": [ "<user id>" ] }
  ],
  "chrome": [
    { "hook": "[data-testid=\"nav-root\"]", "label": "Global side navigation", "seenOn": [ "N1", "N2" ] }
  ],
  "provisioning": [
    { "id": "P1", "observedOn": "E3", "method": "POST", "path": "/api/entity", "bodyKeys": [ "entityType", "properties" ],
      "idField": "id", "deletePath": "/api/entity/e_solution/delete/<id>", "durationMs": 184000, "viaAgent": true }
  ]
}
```

The graph is the merge of every page's fragment
([parallel-walk.md](parallel-walk.md), _The merge_): each node also names
its `page`, and a node the walk did not reach carries `notWalked`, the
reason its not-covered row starts with. `entry` names the node(s) the app
opens on: the entry page's first node, and the app frame node the shared
controls' `nav` edges start from. `kind` is `walked` (the
default when left out), `nav` or `untouched` (`traversal.md`, _What an
edge is_). A node's `inventory` lists the ids its survey file numbers; the
check reads the ids from here, so an id in a survey file but not in the
node's list is an id the check never sees. `inventoryKinds` gives each id
its kind, as the survey line carries it (`traversal.md`, _What to exercise
on a surface_): `input`, `form`, `submit`, `toggle`, `select`, `tab`,
`pager`, `list`, `link`, `button`, `state` or `other`. The kind decides
the id's variants (_The variant table_); an id with no kind has none.
`chrome` lists the platform's own controls on a survey of the platform,
the ones every screen shows and no module owns (`parallel-walk.md`, _The
map_): each once, by hook and label, with no inventory id and no edge. An
app has no chrome: its frame is the frame helper's node and edges. `"provisioning"` lists the create calls
the walk observed (`traversal.md`, _Creation walks and the request log_),
each a recipe a scenario may name to make its setup record through the
app's own API. Ids are `N<k>` for nodes, `E<n>` for edges, `S<k>.<n>` for
inventory items, `S<k>.<n>/<class>` for their variants, `J<n>` for
journeys and `P<n>` for recipes, so a scenario can name any of them
without saying which layer it means.

## What a journey is

A journey is a maximal simple path from an entry node: it follows walked
edges to nodes it has not visited yet, and ends where no such edge is left,
or at the contract's journey length (8 edges by default). A `nav` edge may
only be a journey's first step; an `untouched` edge is never part of one.
A journey that is the beginning of a longer journey is not listed on its
own. The list is deterministic: edges are taken in id order, so two runs of
`loop.mjs journeys` over one graph list the same journeys with the same
`J<n>` ids, and a resumed run can rely on them.

A journey is covered once every edge of it is walked by some scenario,
whichever scenarios walk them (_Chains_). A journey longer than one test
case can hold (40 steps, `app-test-author`'s walk discipline) is therefore
never one long scenario.

## The scenario file

`<firing>/scenarios.json`, written at the Propose stage and corrected at
the Check stage. `scenarios.md` is rendered from it; never write the
markdown by hand.

```json
{
  "scenarios": [
    { "key": "001", "title": "Create an order and open it", "module": "Order Desk", "feature": "Orders", "scenarioGroup": "Create order",
      "priority": "P1", "startingUrl": "https://<app>/orders", "roles": [ "Signed-in user" ],
      "description": "- From the orders list, click New.\n- Fill the form with a random name and save.\n- The detail page shows that name.\n- Delete the order from its detail.",
      "covers": [ "S3.1" ], "path": [ "E3", "E4" ] },
    { "key": "002", "title": "An emoji name is saved as typed", "module": "Order Desk", "feature": "Orders", "scenarioGroup": "Create order",
      "priority": "P3", "startingUrl": "https://<app>/orders", "roles": [ "Signed-in user" ],
      "description": "- From the orders list, click New.\n- Fill the name with emoji text and save.\n- The detail page shows the name as typed.\n- Delete the order from its detail.",
      "covers": [ "S3.1" ], "path": [ "E3", "E4" ], "variant": { "of": "S3.1", "class": "odd-data:emoji" } },
    { "key": "003", "title": "The Plan tab shows the plan", "module": "Order Desk", "feature": "Solution", "scenarioGroup": "Plan tab",
      "priority": "P1", "startingUrl": "https://<app>/solutions", "roles": [ "Signed-in user" ],
      "description": "- Provision a solution through the app's own API (P1).\n- Open it and click the Plan tab.\n- The tab shows the plan.\n- Delete the solution through the API.",
      "covers": [ "S4.2" ], "path": [ "E9" ], "provision": [ "P1" ] }
  ],
  "notCovered": [
    { "reason": "out of scope: account or security settings", "nodes": [ "N5" ], "edges": [ "E2", "E7" ], "ids": [ "S1.2", "S5.1" ], "journeys": [ "J2" ] },
    { "reason": "not expressible: no step reloads half-way through a form", "variants": [ "S3.1/odd-use:reload-midway" ] }
  ]
}
```

Each scenario is one of `app-test-author`'s Phase 1 entries: a title of at
most 8 words, a module (the app's name; for a test of the platform itself,
the product area the scenario exercises, as the platform's navigation
names it), a feature and a scenario group of 2 to 3 words, a description
written as steps, one per line starting with `- ` (what the test does, in
order, then the outcome it checks as the last line), a priority, the
starting URL, its roles in order when more than one person takes part, and
every rule of the rubric, self-provisioning first. Two fields are this
loop's: `covers`, the inventory ids (and node ids, when a surface is
reached without walking an edge) the scenario checks, and `path`, the edge
ids it walks in order, setup included, each edge starting where the one
before ended. A scenario is atomic: it checks one behaviour, so a red names
one thing (SKILL.md, _Propose_). `covers` lists what it checks, never the
controls it only walked through to get there; those have scenarios of
their own. One id may need several scenarios (a table's sort and its
filter); a scenario never checks two: the check refuses a `covers` with two
inventory ids (`scenario 025 checks 6 behaviours; one per scenario`).

**The shortest path to a behaviour is its setup.** Two scenarios that
check the same id on the same surface, as the same roles and in the same
variant, are the same check, and the check refuses the second (`scenario
110 repeats scenario 072's check of S14.2 at N12 by another path`). The
edges the longer route walks are covered by their own scenarios, one per
edge, each checking what that edge does.

A `variant` scenario checks the same control with another kind of input
or use (_The variant table_): `{ "of": "<inventory id>", "class":
"<class>" }`, with the id also in `covers`. It is a check of its own, never
a duplicate of the normal-use scenario.

A scenario whose setup needs a record the UI makes slowly or through a
model names the recipe instead of walking the path: `"provision": [ "P1" ]`,
and its first step says so. The check refuses a recipe the graph does not
hold (`scenario 003: provision names unknown recipe P9`). The create path
itself keeps its own scenarios; provisioning is for the scenarios that
only need the record to exist.

A `notCovered` row names what has no scenario, by id in the layer it
belongs to (`variants` for `S<k>.<n>/<class>` items), and a reason that
starts with a fixed reason (_The fixed reasons_). One row may hold many
items that share a reason.

## The coverage layers

`survey-check` measures the list against the graph layer by layer, and
every layer has to be complete:

| Layer | Items | In a scenario when |
|---|---|---|
| Surfaces | every node | an edge of some scenario's `path` enters or leaves it, or a scenario lists the node id in `covers` |
| Transitions | every edge, `untouched` ones included | some scenario's `path` walks it |
| Behaviours | every inventory id of every node | some scenario lists it in `covers` |
| Variants | every `<id>/<class>` of an id whose kind is in the variant table | some scenario names it as its `variant` (_The variant table_) |
| Journeys | every journey `loop.mjs journeys` enumerates | every edge of it is in some scenario's `path`, whichever scenarios walk them (_Chains_) |
| Requirements (with a PRD) | every `R<n>` of the graph file | some scenario lists it in `covers` (_Requirements from a PRD_) |

The Variants layer exists only when the graph records kinds, and the
Requirements layer only with a PRD; a graph without them reads as before.
An item in no scenario and in no not-covered row is **missing**, and the
check is not complete. An item in a scenario and in a not-covered row is a
**problem**: a row is for what has no scenario. The Coverage line counts
each layer: `Coverage: 4 of 5 surfaces, 4 of 7 transitions, 5 of 8
behaviours, 2 of 8 variants, 1 of 2 journeys have a scenario; 8 not
covered, each with a reason.`

## The variant table

A walk sees each control working once, with one ordinary value. The
checklist a tester applies next, the odd data, the odd use, the states, is
what this table holds, per kind of control, so the list is as long as the
app has behaviours and not as long as the walk was. Every id whose kind is
in the table owes one scenario per class, or a row; a kind not in the table
(`pager`, `link`, `button`, `state`, `other`) owes nothing beyond its
normal use.

| Kind | Classes | What the scenario checks |
|---|---|---|
| `input` | `odd-data:emoji`, `odd-data:rtl`, `odd-data:html`, `odd-data:spaces`, `odd-data:long` | the value is shown as typed: emoji, right-to-left text, HTML typed as text, leading and trailing spaces, very long text; never a crash, a script run or a cut |
| `form` | `odd-use:double-submit`, `odd-use:reload-midway`, `odd-use:back-midway` | a double submit makes one record; a reload half-way through loses or keeps the draft as the app says; Back half-way through saves or discards through the app's own control |
| `submit` | `odd-use:double-click` | a double-click acts once |
| `list` | `state:empty`, `state:one-item` | the empty state (filter to a random string) and a list of one record the scenario makes |
| `toggle` | `state:on-off-on` | on, off and on again each show the state the app says |
| `select` | `state:first-option`, `state:last-option` | picking the first and the last option each applies |
| `tab` | `state:kept-after-return` | the tab is still selected after leaving the surface and coming back |

A variant scenario states its outcome structurally (the value shows, one
record exists, the state is kept), never on the model's words or an exact
rendering. The contract's variant-kinds field adds or drops kinds for a
run (`survey-contract.md`); a dropped kind's items go to a row, `outside
the cap or the named areas`.

## Requirements from a PRD

When the survey contract names a PRD, the graph file gains
`requirements`, written at kickoff and never changed by the walk:

```json
{ "requirements": [
  { "id": "R1", "text": "An order can be created from the orders list", "from": "PRD § 3.2", "maps": [ "E3", "E4" ] },
  { "id": "R2", "text": "An order can be archived from its detail", "from": "PRD § 3.5", "observed": false }
] }
```

`maps` names the edges or ids the walk found for it, when it found any;
`observed: false` says the walk saw no such behaviour, or saw it broken.
The check then has a fifth layer, **Requirements**: every `R<n>` is in
some scenario's `covers` or in a not-covered row's `requirements`. A
scenario with `source: "prd"` covers at least one requirement id and may
walk no edge: it describes what the PRD promises, in the rubric's shape
(a stated outcome, self-provisioning, one behaviour), and the render
marks it `PRD only: R2 — not observed live, expected red until the app
does this`, so the create loop and the person know what its red means.
A PRD never removes a layer or an item: what the walk saw is covered as
before, and the PRD adds to it. Without a PRD the layer does not exist
and nothing reads differently.

## Chains

A journey of 12 edges through three forms is never one case. The check
accepts a journey covered by any set of scenarios whose paths together walk
every edge of it: scenario A walks the first four edges to check what the
fourth does, B walks the shortest route to the seventh, C the shortest to
the twelfth. They need not join end to start, and each is still
self-provisioning: B creates what it needs rather than relying on A having
run. The chain is about coverage of the graph, not about one test running
after another.

## The fixed reasons

A not-covered row's reason starts with one of `app-test-author`'s Phase 1
step 4 reasons, or this loop's `minor`, then a colon or semicolon and the
detail:

- `requires pre-existing data; no creation path`
- `out of scope: <emails | pays | deletes others' data | account or security settings | AI-generated content (Eval tests its quality and correctness)>`
- `not expressible: <native dialog | file download | …>`
- `needs another person on a public app`
- `could not reach: <traversal budget | session expired | no control leads to it | AI generation has no prompt in the contract | AI generation took over <minutes> minutes | …>`
- `outside the cap or the named areas`
- `covered by existing case <name>`
- `minor: <what>`, only for what the contract's Priorities field leaves
  out (`SKILL.md`, _Propose_)

"Low value" or "similar to another scenario" is never a reason. The check
refuses a row whose reason starts with anything else.

## The four commands

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/loop.mjs" journeys --in <firing>/journeys.json --max-edges 8 --out <firing>/journeys.list.json
node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/loop.mjs" survey-check --journeys <firing>/journeys.json --scenarios <firing>/scenarios.json --max-edges 8
node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/loop.mjs" survey-render --journeys <firing>/journeys.json --scenarios <firing>/scenarios.json --out <firing>/scenarios.md --header "<run header>" --app "<app name>"
node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/loop.mjs" survey-sheet --journeys <firing>/journeys.json --scenarios <firing>/scenarios.json --out <firing>/scenarios.xlsx --app-url <app URL> --app "<app name>"
node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/loop.mjs" survey-summary --journeys <firing>/journeys.json --scenarios <firing>/scenarios.json --app "<app name>" --out <firing>/coverage.md
```

- `journeys` prints `{ journeys: [{ id, edges, nodes }], nodeCount,
  problems }`. More than 2,000 journeys is a problem: lower `--max-edges`,
  or check that the global navigation edges are `kind: "nav"`.
- `survey-check` prints `{ complete, line, layers, problems, journeys }`,
  each layer with `total`, `covered`, `notCovered` and `missing`, and exits
  1 unless `complete` is true.
- `survey-render` writes `scenarios.md` in the shape `app-test-author`'s
  scenario list has: the run header, `## <Module>`, `### <Feature>` and
  `#### <Scenario group>` headings with numbered entries (a scenario with
  no `module` goes under `--app`, the app's name), each entry's key in parentheses
  after its title, then the `## Coverage` table and the `## Not covered,
  and why` table, both computed by the same check. It exits 1 when the
  check is not complete, and then adds a `## Problems the check found`
  section, so a list that was rendered early says so on its face.
- `survey-sheet` writes the review sheet as a workbook, and the same
  rows as `scenarios.csv` beside it: one row per scenario, module by
  module in the order `scenarios.md` lists them and, within each, most
  important first (by priority, then by how many journeys pass through the
  surface the scenario checks, then by key), with the columns `Key`,
  `Module`, `Feature`, `Scenario group`, `Title`, `Description` and, empty
  for the reviewers, `Decision` and `Comments`; `Roles` is added after
  `Title` when the scenarios name more than one set of roles. The
  description is the steps as bullets. The header row is bold, shaded and
  frozen, the cells wrap, and `Decision` is a dropdown of `Approved`,
  `Rejected` and `Changes required`. Every cell is text, so no scenario
  text ever runs as a formula. It prints the workbook as `base64` for the
  Drive upload. It refuses while the check is not complete. Priority,
  starting URL, covers, path and the not-covered rows stay in
  `scenarios.md`; the sheet holds what a reviewer decides on, and the
  create loop reads the rest by key.

- `survey-summary` prints the coverage summary the last message and the
  report carry: one line with each layer's share that has a scenario,
  behaviours as the headline (`Coverage of <app>: 113 of 177 behaviours
  (64%) have a scenario; 39 of 39 surfaces (100%), …`), then `Not covered:
  <n> items, by reason:` and one line per fixed reason, most items first,
  with the layers its items fall in and the rows' own detail. It never
  refuses: before the check is complete it ends with `Check: not complete
  — <n> items missing`.

The same `--max-edges` goes to all of them, from the contract's journey
length; a different value lists different journeys.

## When the check is not complete

Fix the scenario file, never the graph:

| The check says | What to do |
|---|---|
| a `missing` id in Surfaces, Transitions or Behaviours | write the scenario that exercises it, or a row with the reason it has none |
| a `missing` journey | an edge of it is in no scenario's path: write the scenario that checks what that edge does, walking the shortest route to it (_Chains_); a journey through an `untouched` edge cannot exist, so this is always a walked path |
| a `missing` variant `S3.1/odd-data:emoji` | write the variant scenario (`variant: { "of": "S3.1", "class": "odd-data:emoji" }`, with `S3.1` in `covers`), or a row naming it under `variants` |
| `scenario <key> checks <n> behaviours; one per scenario` | split it: one scenario per inventory id, each with the same setup path |
| `scenario <B> repeats scenario <A>'s check of <id> at <N> by another path` | drop B; the edges only B walked get a scenario each, checking what each edge does |
| `scenario <key>: variant of <id>, but covers does not name it` · `<class> is not a variant class of kind <kind>` · `<id> is a <kind>, which has no variants` | fix the variant to an id the scenario covers and a class its kind has (_The variant table_) |
| `<id> is platform chrome; remove it from the inventory and list it under chrome` | the walk numbered a control of the platform shell: take the id out of the node's inventory and `inventoryKinds` and put the control in the graph's `chrome` (the one graph correction this allows, since it records the walk's own evidence) |
| `scenario <key>: <E> ends at <N> but <E'> starts at <N'>` | the path skips an edge or names them out of order; fix the path |
| `scenario <key>: covers unknown id` | the id is not in any node's `inventory`; use the id the survey file numbered, or add the id to the node when the walk missed it (that is a graph correction from the walk's own evidence, the one allowed) |
| `<item> is in a scenario and in a not-covered row` | remove it from the row |
| `not-covered row <n>: reason "…" does not start with a fixed reason` | use one of the eight, with the detail after it |
| `more than 2000 journeys` | lower the journey length in the contract for this run and say so in the report, or mark the global navigation edges `nav` |
