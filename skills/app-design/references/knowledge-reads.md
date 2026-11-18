# Knowledge reads — sheets, option menus and how to read cheaply

The write verbs refuse a write until they receive the `id@hash` tokens
`get_app_builder_knowledge` returned for the sheets it leans on. Beyond that,
how much you read is your call: for a trivial change you may skip a read you
judge unneeded, and when you think a read is worth it, read it, even a second
time. A guessed shape stores fine and renders nothing, so read what you do not
know.

You keep no token list. Send `agent`, your name from the first line of your
message, on every `get_app_builder_knowledge`, `apply_page_edits` and
`update_event_actions` call. The bridge keeps the token of every sheet you
read under that name, sends them as `have` on your reads, and adds them to
every write. A sheet you read once stays read for the whole session, until a
deploy changes it, or until you send `have: []`.

## Contents
- One read brings every sheet you name
- Part sheets
- A refusal for unread sheets
- `get_style_options` by key
- A trivial change
- Values come from menus, not from memory

## One read brings every sheet you name

Name every sheet the task needs in `nodes`, in ONE call. The tenant sends at
most 6,000 words per reply, but the bridge asks again for whatever it left out
and hands you every page as one reply. So one call brings every sheet you
named and their prerequisite sheets (`requires` / `defines`).

1. **Read `omitted` once, after the call.** It is empty when every sheet came.
   If `omitted.budget` still lists nodes, the reply reached its size cap: call
   again with exactly those ids. Never write while a sheet you need is still in
   `omitted`.
2. **Send `have: []` on your first read, then leave `have` out.** Your
   name may have been used before, by an earlier builder whose sheets you
   never saw. `have: []` tells the bridge you hold none, and it starts your
   list again from that read. After that the bridge fills `have` from your
   list, so a sheet you hold is not sent again. When a sheet you need comes
   back under `alreadyHeld` and its text is not in your context (after a
   summary, for example), ask for it again with `have: []`. A refused write
   whose `bridge` line says the bridge started again (a plugin update
   mid-session) means the bridge lost your list: read the sheets the refusal
   names again with `have: []`, then send the same write.
3. **Put the sheet you need most first**, since the first one always ships.
4. **Leave `includeRequirements` at its default.** Turning it off hides which
   prerequisites you are missing.

A read comes back whole, so there is no spill file to search. If one ever
appears, the `id@hash` tokens are in its first lines. Read what you need from
it; a grep for the keys you are about to write is usually enough.

## Part sheets

A big block's sheet is split. The block sheet keeps what nearly every build
needs and opens with one pointer line per part:

> **Table pagination** → `blocks/table/pagination.md`: showing rows a page at a
> time… It holds the keys under `content.addOns.page`; events `onPageChange`…

- When the task touches a feature a pointer names, read that part sheet too.
  The pointer lists the keys, events, methods and slots that moved there.
- A write to a moved key is refused until its part sheet is read, so a part
  you skipped costs one refused write.
- Name the parts in your FIRST read, beside the block sheet. You do not need
  the pointer lines for that: the part names are in your agent file's sheet
  list, in the block's own folder (`blocks/table/`: `appearance`,
  `row-selection-and-expansion`, `pagination`, …). Pick every part whose name
  matches a feature your steps set.
- A list documented on its own sheet has one pointer row instead of its keys.
  Table columns are on `blocks/table/columns/common.md`, and every column type
  sheet (`blocks/table/columns/<type>`) brings it along.

## A refusal for unread sheets

A write refused for unread sheets lists ALL of them in one message. A failed
`apply_page_edits` batch carries `sheetsToRead` at the top: every unread sheet
across every step.

- When the refusal also carries `sheets`, those pages are in the reply, after
  its first block, and the bridge has put their tokens on your list. Read them
  there, check your file against them, and send the same call again. No edit
  is needed for tokens. A page in `sheets.omitted` still needs one
  `get_app_builder_knowledge` call.
- When it carries no `sheets`, read them in ONE `get_app_builder_knowledge`
  call, check your file against them, then send the same call again.

Never fix one sheet at a time.

## `get_style_options` by key

Never call it bare. It takes `keys` (1–25) and `applicationType`. Its own
description says to ask for every key in one call; do not — one key alone can
be most of the budget. Colour keys (`backgroundColor`) go ALONE in their call;
`padding` and `margin` each alone or with the small keys only; the small keys
(`borderRadius`, `gap`, `width`, `height`, `minWidth`, `minHeight`, `maxWidth`,
`alignItems`, `justifyContent`) batch freely. Read only `storedExample` and
`options[].id` from the result.

## A trivial change

One property, text, colour or style on one EXISTING block (the `trivial`
class the planner assigns). You decide what is worth
reading. The gate still needs that block's own sheet (on a MOBILE app, which
one is `app-native` § Sheets on a native target).
What usually answers such a change is `get_page_outlines` for the page,
`get_blocks` for that block, and its sheet.

When the sheet lacks the fact, ONE `get_app_builder_knowledge_map` on the
exact term. Still `notFound` → say the sheet is missing it, put what you did
find (the key, the shape, the file or tool that said it) in the final JSON
report's `notes`, then decide with what you hold or report the gap to the
router. Never grep a platform source repository; it is not the contract and it
is not on the person's machine.

## Values come from menus, not from memory

- Icons from `get_icon_options` — search the object drawn, not the action
  ("trash", never "delete").
- Style keys and values from `get_style_options`; colours from
  `get_color_tokens`; positions from `get_slot_options`.
- Events from `get_interaction_options {host, interfaceId, pageId, targets:
  [{kind: "block", id}]}` — it needs EXISTING block ids, so it runs after the
  create step, on the ids you read back. Wire them with `update_event_actions
  {host, interfaceId, agent, edits: [{target: {kind: "block", id,
  pageId}, event: "onClick", mode: "append" | "insert_after" | "replace_all",
  …}]}` — the key is `event`, not `eventType`.
- Batch the lookups: one call for all icons; style keys in the batches the
  rule above allows.
