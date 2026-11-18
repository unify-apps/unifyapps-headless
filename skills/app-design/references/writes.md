# How writes work — `apply_page_edits` and its steps

Almost every page write is a **step** inside `apply_page_edits`: 1–40 steps
against one page, all validated first, applied in order to one in-memory
page, saved once. One failing step refuses the whole call with every failure
listed by index; nothing is written. So batch: put up to 40 steps in one
call, and up to 20 edits in one `update_blocks` step. There is no dry run, and
none is needed. When steps are refused for unread
sheets, `sheetsToRead` lists them all: see "A refusal for unread sheets" in
[knowledge-reads.md](knowledge-reads.md).

The step grammar is the `apply_page_edits` tool description, which you hold
once the tool is loaded: each verb's args, tempIds, scaffold children, what
needs a second call, and the refusals. This file does not copy it, because a
copy goes stale when the tool changes. When this file or a sheet disagrees with
the description, follow the description and report the clash as bug feedback.

## Contents
- Sending a big call as a file
- Steps: the traps the description leaves out
- Inputs you must always choose
- Building a data source
- Data sources in a batch
- Standalone verbs
- What a write answers
- A JSON error on a call

## Sending a big call as a file

`apply_page_edits` takes `argsFile`: the path to a `.json` file holding every
argument except `host`, `interfaceId` and `agent`, such as `{"pageId": "e_…",
"steps": [ … ]}`. Write the file in the work folder your message names,
then call with `host`, `interfaceId`, `agent` and `argsFile`.
Nothing is sent until the file passes a check. A JSON mistake comes back with
its line, its column and the lines around it; a bad step comes back with the
line it sits on. Fix that line with one Edit and call again with the same
`argsFile`. Use a file for any call with more than a few steps or with a
condition object; a one-step edit can go inline.

## Steps: the traps the description leaves out

- **A composite's slot is already full.** A composite (Card, Drawer, Form,
  Repeatable, …) fills its slots with scaffold children at create, and a slot
  holds one block. So a `create_block` placed into a filled slot is refused.
  Place new content under the scaffold child instead, in the same call: a
  Card's body is `placement: {parentBlockId: "t_card.cardBody"}`. The child
  keys are in the block's sheet under "Scaffolds at create".
- **A Repeatable holds exactly one template.** Build the row inside the
  template it made, or `delete_blocks` that template in an EARLIER step than
  the `create_block` that replaces it.
- **A Typography's text is `content.value`.** The description's example path
  `content.text` is not a Typography key.
- **An `update_blocks` edit holds `ops`, not `props`.** The step's args are
  `{edits: [{blockId, ops: [{op: "set", path, value}]}]}`; each op names its
  `op`, and `props` (`{path, value}` with no `op`) is `create_block`'s.
  A key the platform writes itself, such as `additional.isCustomCSSValid`, is
  refused: write the CSS, then read that key back.

## Inputs you must always choose

These inputs have no default. Each one changes what the platform does a lot,
so the call is refused until you send it:

- `scope` on each `create_data_sources` entry: `"page"` puts the source on this page;
  `"app"` puts it on the global page, where every page can read it.
- `advancedOptions.runBehaviour` on each `create_data_sources` entry: `"automatic"` runs
  the source when a block that uses it first shows, and again when its inputs
  change; `"manual"` runs it only when an action triggers it. A callable that
  writes is always `"manual"`. `"automatic"` alone does not run at page load:
  the source runs at page load only with `advancedOptions.timing.runQueryOnPageLoad: true`
  as well (`concepts/data-sources/run-behavior-and-triggering`). So a storage
  list the page shows on load sets both: `{runBehaviour: "automatic", timing: {runQueryOnPageLoad: true}}`.
  An `"automatic"` source on a web app also runs again each time the person
  comes back to the browser tab: `refetchOnWindowFocus` is `true` when left
  out. A source whose `onSuccess` sets page variables (it seeds the page's
  state) turns it off, or every return to the tab sets that state again and
  drops what the person did since. On `create_data_sources` the key sits flat,
  `advancedOptions.refetchOnWindowFocus: false`, never under `timing`: the
  platform refuses `advancedOptions.timing.refetchOnWindowFocus`. Only the
  `settings` of an `update_data_sources` entry nests it, as
  `settings.timing.refetchOnWindowFocus`.
- `runBehaviour` on each `create_page_functions` entry: the same two values, same meaning.
- `set_form_fields.mode`: `"replace"` makes the form hold EXACTLY the fields
  you list, drops every other field and deletes a dropped SLOT field's block;
  `"append"` adds your fields after the existing ones.
- `pageIds` on each `update_data_sources` entry and on `delete_data_sources`: the pages to
  scan for bindings to the source. Send `[]` only when you know no page reads
  it; a rename or delete with no scan leaves broken bindings unreported.

`device` on block edits is optional: leave it out to edit the base config
every device inherits; name a device only for a device-specific override.

## Building a data source

`prepare_data_source` never writes. Call it round by round: it picks the app
and resource, then lists the fields still open (`need_input`), and stops at
`ready_to_create` (or `ready_to_update` for an existing source) with the exact
payload in `preview`. Show that preview to the user when the plan asks for a
confirmation. Then write it yourself as one entry of `create_data_sources`
(`sources`), adding `scope` and `runBehaviour` (above). A callable's inputs
go under `inputs.parameters.<key>`, already bound, even when the preview shows
them under `callable_loader`: the platform stores that key but never reads it.

Set every input and setting at create. To change a source this page owns
later, use the `update_data_sources` step inside `apply_page_edits` (below)
and read it back with `get_data_sources`. On a tenant that does not have the
platform fix yet, the standalone `update_data_sources` fails with `Attempted
to assign to readonly property`; the step stores.

## Data sources in a batch

A data source THIS page owns (its `interfacePageId` is this page) can be
changed inside the batch, and it is saved in the same request as the page:

- `update_data_sources` is a step: `{tool: "update_data_sources", args:
  {edits: [{id, pageIds: [<this page>], set: {…}}]}}`. The standalone tool of
  the same name takes the same entries. `set.properties` is a list of
  `{path, value}` writes, for example `{path: "inputs.page.limit", value:
  50}`; `set.name` renames and `set.settings` changes run behaviour.
- `update_event_actions` as a step can target that source (`{kind:
  "data_source", id}`) for its `onSuccess` / `onFailure` callbacks. Its edit
  shape: `{target: {kind, id, pageId?}, event, mode, targetId?, actions: [{actionType,
  payload, onSuccessActions?, onErrorActions?, runCondition?}]}`. `pageId` is
  required when `kind` is `block`, even inside one page's batch. For
  `append` / `insert_after` / `replace_all`, an edit with no `actions` (or an
  empty list) is not refused — it is skipped as a no-op and reported back in
  `warnings`, so it never costs the rest of the batch. If a branch of an event
  genuinely has nothing to do, leave that edit out rather than sending one with
  `actions: []`.

A step cannot move a source to another page: leave `interfacePageId` as it is.

## Standalone verbs

- `create_data_sources` and `delete_data_sources` are never steps: the platform
  cannot add or remove a source in the page's save. `prepare_data_source` is
  never a step either; it only reads.
- An app-level source (owned by the global page `e_global_<interfaceId>`) or
  another page's source is renamed with the standalone `update_data_sources`
  (a rename is the only change that saves today), and its callbacks are wired
  with the standalone `update_event_actions`.
- `update_event_actions` standalone also reaches targets on another page.
- `copy_entities` copies within one page only: its `toPageId` must be the same page, and another page is refused. To put the same parts on another page, build them there again from what you read.
- `update_event_actions` mode `remove` (and an insert's anchor) names an action by its own `act_` id, never the event entry's `evt_` id; `cache events` prints both as `[evt_… · action act_…]`.
- The standalone writes that take a list — `create_data_sources`,
  `update_data_sources`, `delete_data_sources`, `move_entities`,
  `copy_entities`, `update_page_contracts` and the app tool
  `set_pages_visibility` — check every entry first: one bad entry refuses the
  whole call and writes nothing. Each entry is checked against what the
  entries before it would leave, so an entry may depend on an earlier one. Then they save one entry at a time, because
  the platform saves one entity per request. If one fails part-way the reply is
  `ok: false` with `written`, `failed` and `notStarted` by index, and keeps
  what the written entries created. Retry only `failed` and `notStarted`.

## What a write answers

A write's reply names what changed, not its config: each entry in `created`
and `updated` carries only its id, type, name and (for a new block) parent.
It is not proof. Read the stored values back with `get_blocks` /
`get_page_outlines`, or `get_data_sources {dataSourceIds}` for a source. The
server rewrites some values on save (custom CSS reformatted, colours as
8-digit hex), so check the read-back, not what you sent.

## A JSON error on a call

`InputValidationError: … could not be parsed as JSON` means the JSON you wrote
is broken, almost always one `}` or `]` short where a nested condition object
closes (`visibility → conditions → payload → filters[]`). Resending the same
steps fails the same way. Write the arguments to a file and send `argsFile`
instead: the check names the line to fix.
