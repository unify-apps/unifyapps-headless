---
user-invocable: false
name: app-verify
description: Only for the app-agent builder agent. Self-checks a changed UnifyApps page against its live stored config with the config-review checklist (structure, blocks, bindings, data sources, callbacks, paths, loading/empty/error states, and the native traps on a MOBILE app), reads its platform best practice score and fixes the checks it names until the page scores 90, and proves it by reading it back through the application-builder page tools (outline, blocks and bindings, data sources and their schema, event callbacks, the automation's direct run), and for a task marked [visual] by opening it (builder screenshot, the preview-route walk, the device). Use after any page write, and when a task's Proof row marks [visual]. For repeatable UI test cases saved in Test Studio, use app-test-author instead.
---

# Proving a page — read-backs first, the browser only for `[visual]`

**One owner.** The agent that wrote the page proves it, in the same dispatch,
and puts the proof in its report. Nobody re-opens the page after it.

**The default proof is the read-back.** Everything a page task writes is
stored config, and the page tools (`application-builder` MCP server) read it
back exactly. A block whose read-back shows the stored binding
`{{ e_<dsId>['data']['objects'] }}` with
`dataSourceIds: ["e_<dsId>"]` IS bound. A screenshot of the
same list shows rows, which says less: a literal sample renders rows too.

## The read-backs — always, every task, in this order

Every page read carries `host` + `interfaceId` (`publish_app` takes `host` +
`appId`). Each read has one line that means
"it landed"; the report quotes that line, not the whole result.

| What was written | The read | The line that proves it |
|---|---|---|
| the page and its blocks (layout task) | `get_page_outlines {pageIds: [pageId], view: "tree"}` | `blockCount` and the tree — every block you created, under the socket you placed it in, with the `name` you gave it |
| a block's props, a row binding, a state block | `get_blocks {pageId, blockIds}` on the ids you wrote | the value at the path you set; on a row child `dpOn: [{id: "b_<rep>", …}]`; on a hidden state block `visibility.value: false` |
| an unbound list block (layout task) | the same `get_blocks` | `content.data` holds the literal sample and `dataSourceIds: []` — the handover state the bind task checks first |
| a data source (bind task) | `get_data_sources {pageId}` | the `id`, `name`, `runBehaviour` (`automatic` / `manual`) you created — by id; names are not unique |
| its shape | `get_data_source_output_schemas {dataSourceIds: [dataSourceId]}` | `arrayPaths` holds the path you bound (`['data']['objects']`); for a callable, `outputSchema.properties.status` lists the automation's vocabulary; `savedSchema` after the builder has run it once |
| a binding | `get_blocks` on the bound ids | `content.data` = `{{ e_<dsId>[…] }}` (stored form; write it spaced), `dataSourceIds: ["e_<dsId>"]`, `dpOn[].id` = `e_<dsId>` |
| every binding to one source | `get_dependency_graph {pageId, focus: [{kind: "data_source", id}]}` | `usedBy[]` names each block that was meant to bind, with its paths, and no block that was not |
| the callable's inputs | `get_data_sources {dataSourceIds}` (a write's reply names ids only) | `inputs.parameters.<key>` = the block, `pageParams` or `var_` binding you sent, `dP[]` listing each `inputs.parameters.<key>` path |
| event actions | `get_data_sources {dataSourceIds}` for a source, `get_blocks` `events` for a block | `callbacks.successEvents[]` / `failureEvents[]` — one `evt_` id per action you sent, each with its `runCondition`; on a block, `events[]` with the `actionType` and payload |
| the automation the source calls | not a call you can make: the automation task's read-back in `Built so far` | the run's final `status` and the automation's own `status` in its output |

**The automation's run, without a browser.** A callable source fires only
in a browser or on a device, and the app agent has no automation tools
(they are on the `automation-code` server). The automation's
own task tests the draft and hands its run status over in `Built so far`; quote
it. A queued or running run is not a pass. The page's own firing (button →
`controlDataSource trigger` → `onSuccess`) is proved by the event read-back
above. Say which of the two the report holds, and put what neither proves in
`unverified` with the one check that would settle it.

**A read that disagrees** with what you sent goes in the report's `notes`,
then one fix inside the design skill's 2-round cap. A read you could not make
is `UNVERIFIED — <the read> — needs <what>`.

## The config self-check

Run it yourself, in the same task that wrote the page, after the read-backs.

1. Read the stored config: `get_page_outlines`, focused `get_blocks`, the
   source schema (`get_data_source_output_schemas`), the dependency graph and
   the callback result. Never trust a write response or a remembered config.
2. Check it against [references/config-review.md](references/config-review.md).
   Every page gets the main list. A MOBILE app also gets its **Mobile only**
   part; confirm `appType` first.
3. Correct a concrete finding within the assigned task, then re-read it.
   Note each fix as: block id and property, before and after, the rule it
   broke, and whether you saw it fail (`reproduced`) or only know it is wrong
   by the rules (`not reproduced`). A rule break you have not seen fail is a
   guess; say so rather than grade it critical.
4. Put any unmet item in the report's `notes`; if proof remains unseen, add
   `UNVERIFIED` and the one check that would settle it.
5. Run the builder gate on each page you write, so no P0 or P1 is new on
   what you wrote. From the solution folder, right after the
   `entity context page … --save` read that refreshes the page's cache, run
   `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/skills/app-best-practices/scripts/rule-check.mjs" --app-id <interfaceId> --pages <pageId> --session <id> --out .sessions/<id>/gate/<pageId>-<step>.json`
   twice: `before`, before your first write, and `after`, after your
   read-back, adding `--baseline` with the `before` file and `--touched` with
   every block, data source, variable and function id you created or changed.
   A page you create has no `before`: run `after` with the `--baseline` path
   anyway, and everything on the page counts as yours.
   Exit 0 passes. Exit 1: `gate.blocking` lists each P0 or P1 new on something
   you wrote; fix each one and run `after` again. Problems the page already had
   are not yours and do not count. Exit 2: the page could not be checked; read
   it again once.
   [must-fix.md](../app-best-practices/references/must-fix.md) lists every P0
   and P1 a page you build meets.

## The best practice score

The platform scores each page against its best practice checks (performance,
usability, security and issues) and lists the ones the page fails. A page is
done at **90 or more**. The score comes after the config self-check, in the
same task.

**Which task.** The one that leaves the page finished: a bind, a layout when
the plan has no `bind` task for this page (a chat task with no bind in the ask
counts), a page quality fix, or a page task given in chat. A layout whose bind
comes next skips it: its state blocks stay hidden until the bind gives them a
condition, and the score would count them as dead blocks. Read it before any
`[visual]` shots, because a fix can change what they show.

A page quality fix (`app-page-build` § A page quality fix task) reads the score
and puts it in `readBack`. It fixes only a check its own edits caused; every
other failing check it leaves is an exception with the reason `existing page
content, not part of this task`. The quality pass audits the rulebook and the
score audits the platform's checks: neither stands in for the other.

1. **Read.** `get_best_practice_report {host, interfaceId, pageIds: [pageId]}`
   scores the saved page, so call it after your last write. `pages[0]` holds
   `score`, `passedChecks`, `totalChecks` and `failing`. The first `score` is
   the "first read" the report quotes beside the final score. A `null` score
   or category means not scored, never 0.
   - A page id under `notFound`, or a page whose own `score` is `null`, is
     one `unverified` line, `Best Practice score not read: <page not found |
     the page has no score>`, and without a score there is no fix round.
   - A call that fails (`{ok: false, error}`) is called once more. A second
     failure, or a tenant that does not serve the tool, is one `unverified`
     line, `Best Practice score not read: <the error |
     get_best_practice_report is not served on this tenant>`.

   In each case the task goes on.
2. **Under 90, fix.** `pages[0].failing` is the platform's raw failing rows,
   one row per check per affected entity, in no order. A row holds `checkId`,
   `checkTitle`, `checkDescription`, `checkImpact` (`critical`, `high`,
   `medium` or `low`), `checkCategory`, and the block, source or variable it
   fails on as `impactedEntityId`, `impactedEntityName` and
   `impactedEntityType`. Work the rows by `checkImpact`: critical, then high,
   medium, low. Rows with the same `checkId` are one check: fix it on each
   `impactedEntityName`. Skip a row with `ignored: true`. The row's own
   `checkDescription` says what to change: fix each check from it.

   Make no fix that changes what the page shows or does: no removed block,
   source, variable or event that something reads, and no new behaviour. A
   check that needs one is an exception with the reason `fix would change
   behaviour`.

   A round is an `apply_page_edits` you send, holding that round's fixes. Read
   the changed items back with `get_blocks` or `get_data_sources`, then read
   the report again. A round that lowers the score, or breaks a read-back, is
   undone with `apply_page_edits`; its checks become exceptions with the reason
   `fix lowered the score`. If no failing row is in scope and not ignored, send
   none: record the exceptions and stop.
3. **Two rounds, then stop.** Stop as soon as the report shows 90 or more; at
   90 or more nothing is fixed. These two rounds are their own: they are not
   counted in the self-check's rounds (`app-design` § The non-negotiables). A
   page still under 90 after the second round stops too, and every check still
   failing is an exception.
4. **Scope.** Fix a check on blocks, sources and variables this task created
   or was asked to change, and on those an earlier task of the same plan
   created on this page (the handoff lists them). A check whose rows all name
   content that was on the page before the plan stays failing and becomes an
   exception, unless the task's ask is the score itself ("raise the best
   practice score", "fix the failing checks"): then the page is the task's.

   A check about the app (public access, content security policy, menu size)
   comes as rows with `impactedEntityType: 'app'`. These appear only in
   `app.failing`, once each, and pull down every page's score. Only an app
   task, or a task whose ask is the score, fixes them.

   On a MOBILE app, `app-native` and the page quality rulebook win: a fix that
   breaks one of their rules is an exception naming the rule.
   `delete_data_sources` and `delete_pages` still need the person's yes
   (`app-design` § Destructive steps).

**Exceptions.** Each of these gets one line in the report's `notes` (in a
chat task, in your closing report), which the main session shows the person: a
check you tried to fix and could not; every check still failing when the page
ends under 90 (left out of scope, or because the person said to leave it);
each critical check still failing when the page is at 90 or more, including
one whose fix waits for the person's yes; each check the platform shows as
`ignored`; and each row of `app.failing` that is not ignored, as `app
setting`, once per task and not once per page.

`best practice exception: <checkId> <checkTitle> · <impactedEntityName(s)> · <reason>`

The reason is one clause, one of:

- `existing page content, not part of this task`
- `app setting`
- `native rule <id> wins`
- `ignored in the platform`
- `fix would change behaviour`
- `fix lowered the score`
- `still failing after two rounds: <what the fix did>`
- `score already 90 or more`
- `delete needs the person's yes`

An exception never fails or holds the task. A page that ends under 90 says so
in its `readBack` line.

**What the report holds.** One `readBack` line per page, starting with the page
name or id: `<name>: best practice 94 (27 of 29 checks) after 1 fix round,
first read 71`, the two numbers being the last read's `passedChecks` and
`totalChecks`. A first read already at 90 or more is `best practice 94 (27 of
29 checks), no fix round needed`. A page that stays under 90 says `best
practice 82 (24 of 29 checks), under 90 after 2 fix rounds, first read 71,
exceptions in notes`. The exceptions are in `notes`; a tool or check you
could not run is in `unverified`.

## Other proofs

**Publication is its own plan task.** Only an assigned `publish` task named in
the accepted spec's `Ready when` calls `publish_app`. A page task reports a
missing publish as `UNVERIFIED` and returns it to the router.

**The browser and the device** run only for a task marked `[visual]`. You get
a browser of your own, signed in as the person, through
`scripts/browser.mjs open-page`. The browser, the screenshot, the walk and the
device loop are in [references/browser-walk.md](references/browser-walk.md). Overlays and hidden
states are in [references/visual-verification.md](references/visual-verification.md).

**A binding the read-back cannot prove.** The read-back shows a binding is
stored, not what it gives. When its value is not plain from the config, check
it once on the builder link with `live-page.mjs evaluate`
(`ua-debug`'s [live-page.md](../ua-debug/references/live-page.md)), on any
task, `[visual]` or not. That is a binding that reads a row or item context,
nests another binding or calls a page function; a condition with an `OR` group,
or one that tests an empty array, an empty string, `0`, `false` or `null`; a
value the next block's binding reads. Use `overrides` for a value the page has
no data for yet. Skip it for a plain one (one id, one key, a literal): each
check opens a browser. The answer goes in the report as
`evaluate: <block>.<key> = <value>`.

**Repeatable test cases are not this skill.** This is one pass over one flow.
UI test cases saved in Test Studio are the `app-test-author` skill, run from the
main session.

## What goes in the report

Per page: the read-back lines from the table above, the automation run's
verdict and which path produced it, what the self-check fixed, the best
practice score and its exceptions, `visual: not requested` when that is the
case, and `Still off`.

## Reference files

| File | Read it when |
|---|---|
| [references/config-review.md](references/config-review.md) | the self-check before a page task reports `ok`; read its Contents, then the groups your task touched |
| [references/browser-walk.md](references/browser-walk.md) | a task marked `[visual]`: your browser, the screenshot, the walk and the device loop |
| [references/visual-verification.md](references/visual-verification.md) | a `[visual]` task that must show an overlay, a loader or an empty state |
