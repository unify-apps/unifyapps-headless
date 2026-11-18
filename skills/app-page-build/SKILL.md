---
user-invocable: false
name: app-page-build
description: Only for the app-agent builder agent. Builds one page of a UnifyApps app per plan batch — its page-layout task, its page-bind task, or the publish of one app — with how to read knowledge, how to batch page edits into one checked file, the ids a layout hands to its bind, and the two-tries rule for a failing step. Use when an app-agent holds a page-layout, page-bind or publish task from a UnifyApps Headless plan.
---

# Building one page

You hold ONE page: its layout, its bind, or both when they were ready
together. A publish batch holds the publish of one app. Do not touch another
page. Other pages are other builders' work. When your layout ran alone, its
bind usually comes back to you later in a new message file. It goes to a new
builder when you are busy, when a task was handed back twice, or when the
layout's builder is unknown, and that builder knows only what your report
hands over.

Every page tool is on the `application-builder` MCP server, and every page
call carries `host` and `interfaceId` (`create_app` and `publish_app` take
other inputs; see below). The block, write and style rules are in the
`app-design` skill; this skill is the order of work.

## Plan your reads, then read once

Before your first write, work out everything the tasks will need and read it
in as few calls as you can. Each refused write, and each read of one more
sheet, is a round trip you could have saved.

1. **Tools.** One ToolSearch for every tool your tasks need: the query from
   the tool table in your agent file, with full tool names.
2. **Files.** The rows of "What you can read" your tasks need, all in one turn
   of parallel Read calls.
3. **Sheets.** Every sheet id is listed in your agent file under "Every
   knowledge sheet there is". List every type your steps will write, then ask
   for all of their sheets in ONE `get_app_builder_knowledge` call. When your
   message holds the layout and the bind, that call also names the bind's
   sheets. One call brings them all; ask again only for what `omitted` still
   lists. The list:
   - `ai-editing/batch-edits`, `ai-editing/creating-blocks`,
     `ai-editing/condition-objects` and `concepts/blocks`, before the first
     `apply_page_edits` of a conversation;
   - each block (`blocks/<block>`), including `blocks/stack` and
     `blocks/typography`, which almost every page uses, and each block whose
     event you wire or change with `update_event_actions`: an event edit is a
     write to its block, even when it only changes one action's payload;
   - each part sheet of a big block whose name matches a feature your steps
     set. A block with parts has its own folder in the sheet list, such as
     `blocks/table/`, and a key that moved to a part is refused until that
     part is read. A Table that sets its row height and row selection names
     `blocks/table/appearance` and `blocks/table/row-selection-and-expansion`
     here, beside `blocks/table`;
   - each table column type (`blocks/table/columns/<type>`) and each form
     field type (`blocks/form/fields/<type>`). A write of a whole
     `content.columns` list needs the sheet of every column type in it, also
     the columns you copy unchanged;
   - each action (`actions/<action>`), including
     `actions/show-notification` for a result message;
   - for a bind, `concepts/data-sources` and `actions/control-data-source`.

   For example, a layout and bind of a table with a text and a date column,
   a Stack and a button that runs a source asks in one call for the four
   `ai-editing`/`concepts/blocks` sheets, `blocks/table`,
   `blocks/table/columns/text`, `blocks/table/columns/date`, `blocks/stack`,
   `blocks/typography`, `blocks/button`, `actions/control-data-source` and
   `concepts/data-sources`.
4. **Navigation.** A task that changes the menu or the home page reads
   `app-design/references/navigation.md` and the sheet
   `concepts/interface-record/app-navigation` before its first
   `apply_navigation_edits` (see "Navigation" below).

## Reading

How much to read is your call. For a trivial change you may skip a read you
judge unneeded. When you think a read is worth it, read it, even a second
time. The write verbs still refuse a write that lacks the `id@hash` tokens of
the sheets it leans on, and the refusal names every sheet it needs. How to
read cheaply is in the design skill's
[knowledge-reads.md](../app-design/references/knowledge-reads.md). In short:

- When your message already has both an app id and page id, first run
  `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs" entity context page <pageId> --app-id <interfaceId> --save --json`,
  from any folder. `--save` writes the page to the `file` its reply names, a
  file named after this page, and prints only its `id`, `name` and
  `version`: check they are your page, then read the file. Never save the
  answer under a name of your own; builders side by side share one scratchpad.
  `--save` first checks the app against the tenant, so an edit made in the
  builder or a publish made elsewhere comes in. A `hit` is your pre-write read: its `cache.page.properties.blocks` is every
  block in the same shape a block read returns, its `layout` plus each block's
  `component.content.blockIds` is the outline, and `dataSources` and
  `appDataSources` are its own and the app-level sources — for any fact the hit holds, make no tool call before the
  write. On `miss` or `stale`, use the Application Builder reads. The
  read-back after the write is always live.
- A layout task needs the whole page, so read the body. For one fact, read the
  same cache shaped instead — `cache outline <pageId> --app-id <interfaceId>`
  for the block tree, `cache blocks <pageId> --app-id <interfaceId> --name
  <displayName>` for one block (`--field component.appearance` for one of its
  keys), `cache ds` and `cache deps` for the data sources and edges, `cache
  grep <pattern>` for one thing across every cached page of the app, `cache
  events`, `cache form` and `cache keys` for the page's events, form fields and
  binding expressions, `cache paths <interfaceId>` for page paths — run the
  same way as `entity context`. A page's body is ~140 KB; these are lines.

- Read every sheet in one call and ask again only for what `omitted` still
  lists, with `agent` on the call so the bridge sends your tokens as `have`;
  read the part sheet a block sheet points at when the task touches
  it; a write refused for unread sheets names them all and may carry them in
  `sheets` (see "A refusal for unread sheets" in knowledge-reads.md).
- `get_style_options` by key, never bare: a colour key alone, `padding` and
  `margin` alone or with small keys, the small keys together.
- Values come from menus (`get_icon_options`, `get_style_options`,
  `get_color_tokens`, `get_slot_options`, `get_interaction_options`), never
  from memory.

## Page edits: batch them, in a checked file

Put up to 40 steps in one `apply_page_edits` call, and up to 20 edits in one
`update_blocks` step. The call writes nothing unless every step passes, so a
big batch costs nothing extra when it fails. How a later step names what an
earlier step made is in the `apply_page_edits` description: a block by its
`tempId`, a composite's scaffold child as `<tempId>.<childKey>`. Split a batch
only where the description says a second call is needed: something that
points at a page variable, function or folder made in this call.

Send a big call as a file. Write every argument except `host`,
`interfaceId` and `agent` to a `.json` file in the work folder your message names.
That folder already exists, so no `mkdir`. For example
`{"pageId": "e_…", "steps": [ … ]}`. Then call `apply_page_edits` with
`host`, `interfaceId`, `agent` and `argsFile`: the path to that file. Nothing is sent until the file passes a
check. A JSON mistake comes back with its line and column and the lines around
it, and a bad step with the line it sits on. Fix that line with one Edit and
call again with the same `argsFile`. Use a file for any call with more than a
few steps or with a condition object (`visibility`, `runCondition`), because
those are where a missing `}` breaks the call. A one-step edit can go inline.

On a MOBILE app, fix every line of the `warnings[]` the call returns before you report the task `ok` (`app-native` § What a native build owes at the end).

## The app task

A new app is created by its own `app` task, before any of its pages, so every
page of the app is then built at the same time. Its entity carries the app id
the plan fixed (`entity.id`).

1. Read it with `get_app_overview`. Not found: `create_app` with `host`, the
   accepted name, `type` and exactly that `id` (see the design skill's
   [open-page.md](../app-design/references/open-page.md)). Found: a first try
   already made it, so go on with it.
2. When your message has an `App look:` line, store it
   ([app-craft's app-look.md](../app-craft/references/app-look.md) § Store it).
   When ToolSearch finds `set_app_theme`, it becomes the app's theme
   (the `app-theme` skill). Else it goes in the app header. An `app` task on
   an existing app does only this.
3. Read the app back, and the look when you stored one. Report the app
   id in `ids.entity` and the builder URL in `notes`.

A task whose entity says `(a new global module)` creates a global module, not
an app. The platform makes a module's id, so the entity has none. Read
`Last attempt` first: an id there is the module a first try made, so go on
with it. Else call `create_global_module` with `host` and the accepted name,
then go on from step 2 with the id it answers. Report that id in
`ids.entity`; the pages of the module read it in `Built so far`.

A page layout never calls `create_app` when an app task made the app: the
app exists before the layout starts, and its id is in the task's
`entity.appId` and in `Built so far`. A layout whose app does not exist and
whose message has no `app` task in `Built so far` (a plan made before app
tasks) creates it with `entity.appId`, then stores the look as the `app`
task does, before the page.

## Values pages share

When your message has an `App state` line, it names every value the pages of
this app pass between them: its name, its store, the page that writes it and
the pages that read it. Write and read each one under exactly that name, in
exactly that store, on whichever page you build (a page variable on the
global page for `app variable`, the storage actions for `session storage` and
`local storage`, a page input for `page input`, or a `:` path segment via
`pageParams` for `path param` (never `page input`). Another builder is
building the other pages at the same time, so a name or store of your own
breaks the flow between them. A value the line does not hold is this page's own.

## The layout task

Plan your reads first (above). Then:

1. Read the page by name (`get_app_overview`, `get_page_paths`). If it exists,
   update it; do not create a second one. When your message has a `Design`,
   its regions are the page, in that order and with those weights: plan the
   blocks for each region before any write. A region that a part of
   [app-craft's kit.md](../app-craft/references/kit.md) covers starts from
   that part's settings.
2. `create_pages` first. Then write the edits file with the real page id and
   call `apply_page_edits`: the header / body / footer split, the look
   (`app-craft` § Pick the look before the first write: the app look is
   already stored, by the `app` task; build the Design's
   regions, the lead one first, in tokens and the custom CSS for what tokens
   cannot say), every block with its `name` at
   create, the page variables and functions
   (`create_page_variables`, `create_page_functions` with `runBehaviour` on each),
   the static text, the Form with its `fields`, and the loader, empty and error
   state blocks, hidden at create by a `props` entry `{"path": "visibility",
   "value": {"value": false}}`. A `visibility` key next to `props` is dropped by
   the server, so the bridge refuses it. On `update_blocks` the path is
   `visibility` and the value is that whole object, in the edit's `ops`
   (`{op: "set", path: "visibility", value: {…}}`); `visibility.value` is
   refused. Events that reach nothing outside the page go here too:
   `setPageVariable`, `navigateBack`, `controlDrawer`. A `controlDrawer`
   action names a drawer created in the same call by its `tempId`
   (`payload.drawerId`), so the drawer and its wiring go in one call.
3. Leave data-bound blocks **unbound**. Unbound means `content.data` holds a
   literal and `dataSourceIds` is empty. A Repeatable or Table created
   name-only arrives that way. Replace the sample with a literal in the
   object's real field shape from the Contract, for example
   `{{ [{"id":"p1","properties":{"flightNumber":"AI101","origin":"DEL"}}] }}`,
   and write the row bindings against it now:
   `{{ b_<rep>['context']['item']['properties']['origin'] }}`. A literal over 200 chars only
   warns on `apply_page_edits` (never refuses), pointing at a manual page function. A Table's
   columns use the same paths. Over a Storage object each `content.columns[].fieldKey` is
   `{"path": "properties.origin", "key": "origin"}`, because Storage keeps fields under
   `properties`; a flat `origin` path renders an empty column, no error. A row child's
   `dpOn` names the Repeatable, never a source, so the bind swaps one key and
   every row binding survives.
4. A Typography or StatCard for one record's field holds a literal sample. A
   Button that will call an automation holds its label and no `onClick`. A Form
   holds its `fields` and no `onSubmit` of yours. A new Form arrives with an
   `onSubmit` the platform seeds, a `showNotification` "Form submitted
   successfully" (`blocks/form`), which would tell a person their data was
   saved when nothing was. Its `act_` id exists only after the create, so
   remove it in a second `apply_page_edits`: `update_event_actions` mode
   `remove` with that `act_` id from `get_blocks`, then read the Form back
   with no `onSubmit`.
5. **Create no data source.** No `create_data_sources`, not even a storage one.
   A callable needs the DEPLOYED
   automation id, which may not exist yet, and a source written on a guess
   saves fine and renders blank.
6. Read back with `get_page_outlines {view: "tree"}` and `get_blocks`.
7. When the plan has no `bind` task for this page (a chat task with no bind in
   the ask counts), read its best practice score and fix what it names, two
   rounds at most (`app-verify`). Then, when this task's Proof says `shots at
   two widths`, look at the page (§ Look at the page).

## Look at the page

The task whose Proof says `shots at two widths` (the page's bind, or its
layout when nothing binds the page; in chat, the last task on a page with a
`Job:` line) ends by looking: `open-page` the preview URL, take `page-shot
1440` and `page-shot 1366`, Read both, say what you see of each region of the
Design, and answer `firstSeen`, `signals` and `dataOrder` from the shots. A
page whose data hangs on a page input takes it on both shots, `page-shot 1440
--input <name>=<value>`, so they show its data, not its empty state. Fix
what they show is wrong or unfinished, then shoot and look again. What you
saw, the shots and the answers go in your report's `design`; `plan report`
refuses the `ok` entry without them. A second agent, which did not build the
page, then judges your shots against the job and the Design; when it sends the
page back, your next message lists its findings under `Review found, in your
last shots:`.

## What the layout report hands over

The bind usually comes back to you, but it may run on a new builder. That
builder's only view of your page is your report, so hand over every id it needs:

- `ids.entity` = the page id, `ids.app` = the app id.
- Block ids by role, as `ids` keys: `"block.list"`, `"block.row.title"`,
  `"block.state.loader"`, `"block.state.empty"`, `"block.state.error"`,
  `"block.button.submit"`, `"block.form"`, one key per block the bind touches.
- Page variables as `"var.<name>": "var_…"`.
- Form field keys as one `notes` line: `handover: form <blockId> fields <key>, <key>`.

## The bind task

Plan your reads first (above). Then, in this order:

1. You built this page's layout in this conversation → you may skip this
   step; read again only what you judge worth it. A stale write refusal tells
   you the page changed. A new builder checks the page first, in its
   pre-write read: the `entity context page` hit above, which `plan report`
   refreshed when it recorded the layout. The ids the layout handed over must
   be there, and `content.data` must still hold the literal. If not, stop:
   something rebuilt the page. Read live (`get_page_outlines {pageIds:
   [pageId], view: "tree"}`, `get_blocks`) only on a `miss` or `stale`.
   A bind on a page that already exists may have no layout task, so nothing
   hands you ids. Read them from the page itself: the cached page (`cache
   outline` and `cache blocks` above), or `get_page_outlines` and
   `get_blocks` on a `miss` or `stale`. Never wait for a hand-over.
2. `prepare_data_source` for each source, with the ids from `Built so far`,
   until `status: "ready_to_create"`. It only reads. Send every source's call
   in one turn:
   - Storage: `{appName: "storage_by_unifyapps", resourceName:
     "storage_by_unifyapps_fetch_records", name, inputs: {object_type:
     "OBJ_…", numberOfRecordsToFetch: "MULTIPLE"}}`. Without
     `numberOfRecordsToFetch` it answers `need_input`.
   - Callable: `{appName: "callables", resourceName:
     "callables_call_automation", name, inputs: {automationId: "<deployed
     id>", version: "-1", synchronous: true, parameters: {…}}}`.

   Call `get_data_source_resource_shape` when `prepare_data_source` asks
   for a path you cannot fill, and before a source that sorts (`sortBy`) or
   aggregates (`projections`): `ready_to_create` does not show those shapes. The `preview` is what you send next, with one
   change: a callable's inputs go under `inputs.parameters`. The preview may
   still show them under `callable_loader`, which the platform stores but
   never reads.
3. `create_data_sources {sources: [{pageId, type: "APPLICATION", name, scope:
   "page", properties: {context, inputs, advancedOptions: {runBehaviour}}}]}`,
   one entry per source of this page. `scope`
   and `runBehaviour` are required
   ([writes.md](../app-design/references/writes.md)). Storage:
   `automatic`, with `object_type`, `numberOfRecordsToFetch: "MULTIPLE"` and
   `page`. `automatic` alone does not run when the page loads: it runs once a
   block that names it renders, or when its inputs change. A source that must
   run on page load needs both, `advancedOptions: {runBehaviour: "automatic",
   timing: {runQueryOnPageLoad: true}}`; `runQueryOnPageLoad` is `false` when
   left out (the knowledge sheet
   `concepts/data-sources/run-behavior-and-triggering`). The fetch filters on the server only in one shape:
   `inputs.triggerInputCondition` = `{"operator": "AND", "filters": [...]}`, each entry a
   leaf `{"property": "properties_<field>", "filter": {"operator": "EQUAL", "value": ...}}`
   or `{"resolvedFilter": {"filter": <filter tree>}}`, where the tree uses the
   `op`/`values`/`field` grammar of sheet `ai-editing/data-filters`, never the
   `operator`/`filters` shape, which answers HTTP 500 there. The server ignores any other
   shape with no error, and `get_data_source_resource_shape` does not describe it,
   so read the rows back and check that only the wanted rows come. A binding sees
   only the fetched page (`page.limit`, 20 by default).
   Callable: `manual`,
   `inputs.automationId` = the deployed id, `version: "-1"`,
   `synchronous: true`, and `inputs.parameters` with one entry per automation
   input, already bound, for example `{"grantId": "{{ b_<table>['selectedRow']['id'] }}",
   "decision": "{{ var_<id>['value'] }}"}`. The blocks and variables those
   bindings name exist since the layout. The result's `created` lists the `e_`
   ids in the order of `sources`; that id is what every binding names. A
   source is bound by id, never by name.

   **Get the source right here.** To change it later, use the
   `update_data_sources` step inside `apply_page_edits`: `{id, pageIds:
   [pageId], set: {properties: [{path, value}]}}`, then read it back with
   `get_data_sources`. On a tenant that does not have the platform fix yet,
   the standalone `update_data_sources` fails with `Attempted to assign to
   readonly property`; the step stores.
4. `get_data_sources {pageId}`, then `get_data_source_output_schemas
   {dataSourceIds}` for `arrayPaths` and `outputSchema`. Bind the path it gives
   (`['data']['objects']` for storage, the automation's own keys for a
   callable), never one from memory.
5. One `apply_page_edits` of `update_blocks`: the list's `content.data` →
   `{{ e_<dsId>['data']['objects'] }}`, each field Typography's
   `content.value`, each state block's `visibility` decided from the source's
   `['data']` and `['error']`, never from `['isLoading']` alone, which is
   missing until the source is queued: loading while it has neither, the
   error block on `['error']`, empty on `['data']['objects']['length']` of 0
   (`concepts/pages/loading-states`). The callable's inputs
   were set in step 3; nothing in this call changes the source.
   A value computed from the rows — grouped, joined, counted or summed — is a
   page function, never an IIFE in a binding. Its `create_page_functions`
   step goes in this call, with a body that reads the source as `{{
   e_<dsId>['data']['objects'] }}`; the tool derives the function's
   `dataSourceIds` and `dpOn` from that body, and refuses a `dataSourceIds`
   key. An array method (`.filter`/`.map`/`.reduce`/`.sort`/`.forEach`) or a
   function body makes it heavy, so use `runBehaviour: "manual"` here too, as
   on a MOBILE app (`app-native` rule 14), run by a `triggerFunction` on the
   source's `onSuccess`; `"automatic"` stays only below that bar. The block's
   binding, `{{ func_<id>['value'] }}`, goes next — a new function's id comes
   back only in the reply (`concepts/functions`).
6. `get_interaction_options` on the button and Form ids, then one
   `apply_page_edits` of `update_event_actions` steps: the button's `onClick`
   → `controlDataSource {dataSourceId, method: "trigger"}`; the source's
   `onSuccess` / `onFailure` (target `{kind: "data_source", id}`) branching on
   `{{ e_<dsId>['data']['status'] }}`. An app-level source is wired with the
   standalone `update_event_actions` instead
   ([writes.md](../app-design/references/writes.md)).
7. Read back: `get_blocks` on the bound ids shows `dataSourceIds` and
   `dpOn[].id` = the source; `get_dependency_graph {focus: [{kind:
   "data_source", id}]}` lists every block meant to bind and no other; the
   `evt_` ids are in `get_blocks` `events` on the button and in
   `get_data_sources {dataSourceIds}` `callbacks` on the source (the write's
   reply names ids only); `get_data_source_output_schemas` shows `savedSchema`
   only once the builder has run the source, and nothing reloads the builder
   after a write. Absent → `UNVERIFIED — <path> needs one builder run`.
8. Read the page's best practice score and fix what it names, two rounds at
   most (`app-verify`), then, if the Proof says `shots at two widths`, look
   (§ Look at the page).

## A page quality fix task

A `page-bind` task marked `audit: true`, with an id `q<n>` and the title
`Page quality fixes on <page>`, comes from the main session's page quality
pass on a MOBILE app, not from the spec. Its body lists the findings, one
numbered line each: the rule id, the block's id and name, and what to change.
The rule ids are the rows of the
[page quality rulebook](../app-page-quality/references/rulebook.md). Read a
row only when its line alone does not settle the write.

- Fix exactly those findings, on that page, and nothing else. Leave every
  block the body does not name as it is, and add no region or state.
- When a fix removes a block, such as a U3 tab-bar spacer or a P5 wrapper
  Stack, the body's line naming that block is the named loss that
  `app-design` § Destructive steps asks for: the task body is part of the
  accepted plan. Remove it without asking. Deleting a block is routine page
  editing, not an entity delete, so no delete gate stops it. A block the body
  does not name is never removed.
- A line no tool can apply, such as an image only a person can re-export,
  is never swapped for a different fix of your own. Apply the other lines,
  then report the task `needs_confirmation` naming what that line needs.
- The proof is the ordinary read-back of what changed: `get_blocks` on each
  changed block, and `get_page_outlines {view: "tree"}` when a block moved or
  went. Do not run `page-audit.mjs`. The main session runs it again in its
  next round, after `solution refresh`.
- Then read the page's best practice score into `readBack` and fix only what
  this task's own edits caused (`app-verify` § The best practice score).

## Navigation

The app's menu is not on a page. `cache nav <interfaceId>` reads it from the
cache, `get_navigation {appId}` reads it live,
`apply_navigation_edits {appId, ops, dryRun}` changes its items and
`set_navigation_style` changes what DRAWS it, where the tenant serves that
tool; `appId` is the app's `interfaceId`. Everything an agent needs is in
`app-design/references/navigation.md`, read the moment a task mentions a
menu, a nav bar, the app name in a header, or moving between pages.

**Never decide by yourself to build the app's menu out of page blocks.** A
`stack` of page links, an app-name link, a hamburger, a second hidden menu
for phones — that is the app menu rebuilt on one page: it lives there only,
ignores the app's permissions and the real menu's active state, and is
rebuilt on every new page. The menu belongs on the app record.

Two asks, two answers. A bar in another PLACE (a top bar, bottom tabs, a
drawer, hiding the rail) has no tool: report `needs_confirmation` naming the
manual step (*App settings → Navigation → Appearance*). A custom-LOOKING bar
where the app's bar already sits does: `set_navigation_style` with
`createModule` seeds a module bar and attaches it app-wide, with the real
items and the real permissions. Offer it before any hand-built bar, and say
in the report when the tenant does not serve it.

A hand-built bar needs the person's yes in the accepted spec's `## Contract`
or the brief's `## Changes` — a design region naming app chrome with no such
line behind it is `needs_confirmation`, not a licence. Then build it as one
`template-component` or `module` in each page's `header_id` socket, never raw
blocks repeated per page, and follow `app-design/references/navigation.md`
§ When the person asks for it anyway for the rest.

Page work that needs no such decision: breadcrumbs, and switching sections
inside one page (`tabs`, `navigation-menu`, `navigation-container`).

The rules a page task trips on most:

- `type` is uppercase: `PAGE`, `MODULE`, `URL`, `GROUP`, `USER_MENU`,
  `ACTION`, `BUTTON`, `COLOR_SCHEME_SWITCHER` or `LANGUAGE_SWITCHER`.
  `page` is refused.
- A `PAGE` item needs `name`, `icon` and `pageId`. The page must already exist
  in this app: an entry for a page not made yet is refused, so add it once its
  layout has made it. `create_pages` never adds a menu item.
- `icon` is an id from `get_icon_options`, such as `Home02`, never a word. A
  wrong id is saved with no error and draws an empty slot.
- A `URL` item needs an `icon` too. The `BRAND_NAVIGATION` item's icon is the
  app's `logoSmall` address.
- A `GROUP` needs `items: []`. Add each child with its own `addItem` and
  `parentGroupId`, never inside `items`.
- Send no `slug`, `path` or `appearance` on a new item. Send an `id` only for
  `BRAND_NAVIGATION`, `userMenu` or `notifications`.
- Where the bar sits and how it is styled has no tool: that task reports
  `needs_confirmation`. What DRAWS it is the one exception.

The smallest valid item: `{op: "addItem", list: "primary", item: {type:
"PAGE", name: "Orders", icon: "SvgKey01", pageId: "e_…"}}`. Send it once with
`dryRun: true` when you are unsure: that writes nothing and shows what the
menu would become. Read it back with `get_navigation`.

## The publish task

Only a `publish` task publishes. The router sends it only after every bind of
the app is done and, when the plan asks first, after the person said yes.
Before you publish, `entity context app <interfaceId> --save --json` is your read of
what goes live: the interface (`navigation`, `security`, `deploymentState`
with the deployed `entityVersion`) and every page with its blocks and data
sources. A `hit` answers the pre-publish check: for any fact it holds, make no tool
call before the publish. Published version history is not in the cache, so
read it live only when the task's proof names a published version. On `miss` or `stale`, read live. Then call
`publish_app {host, appId: <interfaceId>}`, with `deploymentNotes` saying
what it ships (the bridge adds the plan or chat task tag at the end). A 200 is not proof: the proof is the deployment read
back live (and the navigation when the task names it). The reply also carries
`liveUrl` and `pageUrls`, the live address of the app and of each page; quote
them in the report. A reply of `alreadyLive: true` means another publish already
shipped this draft and dropped your notes: read the task's change on the live
version and report `ok` with that read, not a failure for the missing version. For a MOBILE app, device proof belongs to this
task only when its Proof asks for it (`app-native` § Verify a native write on a
device).

A wait is a read with a cap, never a clock; a `sleep` in any form is refused.
The waits for a publish, a device or a screenshot are in the `app-verify` skill.

## Read the error, two tries

When a call fails, read the error and say in one line what it means before the
next call. A refusal names what is wrong: the step, the key, the unread sheets.
Fix exactly that and try again.

An unclear error, such as `internal error in the tool`, a 5xx, a timeout or
"not found" for an id you just created, names nothing to fix. Do one cheap
read, such as `get_app_overview` or `get_data_sources`, to see whether the
write landed. Then send the same call once more. Never `sleep`.

Apart from that one retry, never send an input that already failed. Stop after
the 2nd failed try of one step. Then do the step one different way, such as a
smaller batch, the `apply_page_edits` step instead of a standalone verb, or
another block. Or report the task `failed` with the tool, its last input and
the last error in `error`. The different way also gets 2 tries.
