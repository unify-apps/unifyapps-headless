---
name: app-page-quality
description: Runs a UnifyApps Headless plan's page quality pass in the main session — audits the MOBILE pages the plan touched against its rulebook with scripts/page-audit.mjs, asks the person about advisory findings, turns findings into fix tasks through plan audit, and holds the publish until the pages are settled. Loaded by the main session's run loop when plan ready says the pass is due; builders read only references/rulebook.md, to prevent its findings while they build.
user-invocable: false
---

# Page quality

The page quality pass of a plan, run by the main session. Once the page work
of a MOBILE app's plan is settled, and before its publish, it audits each
touched page against [references/rulebook.md](references/rulebook.md), turns
what it finds into fix tasks, and holds the publish until the pages are clean
or the person says otherwise. Builders never load this skill: the
`app-design` and `app-native` skills point them at the rulebook, so they
prevent its findings while they build. The pass is not the platform's best
practice score: each builder already read that score for its page
(`app-verify`), the pass does not read it again, and a builder's score fix
never overrides a rulebook rule.

A MOBILE page is checked the way a phone draws it, not the way the web preview
does: the browser preview draws a MOBILE app with the web blocks. So the pass
reads the stored config with the script, and looks at the page in the UnifyApps
Preview app, which runs the app's saved draft. The pass therefore checks the
pages before the publish it holds. The Preview app opens an app by link only
once it has been published at least once, which `preview.mjs` checks before it
opens anything; a new app opens only from the builder's QR with "Use current
login session" on.

## When it runs

`plan ready`'s `next` holds this line, and only this line:

`Run the page quality pass on <pages>, then record it with plan audit <planId> --file <json> [--tasks-file <json>].`

- It comes once every page task of the plan's MOBILE pages is settled: the
  layouts, the binds and the page reviews. Until then the rest of the plan
  runs as usual.
- `heldForQuality` names each publish that is otherwise ready but held, and
  `progress` ends `· page quality pending`.
- The hold applies only to a publish of an app that owns an audited page. A
  publish of any other app goes out as usual. When a page's app cannot be
  told, every app publish is held, never an AI agent's.
- A page rebuilt after its audit is audited again: the line names it once
  more before its app's publish goes out.
- Never on a non-MOBILE app: the script refuses with exactly
  `app-page-quality audits MOBILE apps only`, and a plan with no MOBILE page
  task never runs the pass — its `plan ready` output is unchanged.

## Procedure

1. Say once, in one line, that the page quality pass is running.
2. Run `solution refresh --json`.
3. Read [references/rulebook.md](references/rulebook.md).
4. For each page the line names: run `node
   "${CLAUDE_PLUGIN_ROOT}/skills/app-page-quality/scripts/page-audit.mjs"
   <pageId> --app-id <interfaceId> --json`, judge the rules the script left
   to the session against its `candidates` lists, then run the device step.
   Exit 2 with a report on stdout means a rule failed: the report's
   `errors` names it, every other rule ran, and the page is not fully
   audited, so judge that rule by hand and say so beside the page in the
   table. Exit 2 with no report means the script could not audit the page:
   the cached page is stale or missing, or it has no root; its error line
   says which. A blockIds loop does not stop it; it is a `cycle` note. Run
   `solution refresh --json` and the script once more. When it still fails, tell the person in one
   line which page could not be audited and why, and ask one
   `AskUserQuestion`: `Publish without auditing <page>` or `Stop here`. A yes
   to publishing puts the page in `pages` with no findings and
   `unaudited: {"reason": "<why>", "words": "<their words>"}` on its entry.
   `Stop here` records nothing, so the publish stays held.
5. Write the merged findings with their evidence to
   `.sessions/<sessionId>/audits/<planId>.json`, and a table plus the
   per-finding lines to `.sessions/<sessionId>/audits/<planId>.md`.
6. Show one table: page · blocking · advisory. A page only partly audited
   (`summary.unreached` above 0, or rule `errors`) says so beside it.
7. When any advisory findings exist, ask about them once for the whole plan
   (§ The advisory question).
8. Build one quality fix task per page that has blocking findings, or
   advisory findings the person chose, and record everything with `plan
   audit <planId> --file <json> [--tasks-file <json>] --json`.
9. Go back to send; the run loop dispatches the fix tasks as usual. Two
   rounds at most. Round 1's fix tasks go out and report done. When blocking
   findings were open, `plan ready` names the pages again: that is round 2,
   run from step 1, so the script re-audits the pages after a fresh
   `solution refresh`. If blocking findings are still open after round 2,
   stop adding tasks, show what is open, and let the person choose. Record
   round 2 with `plan audit <planId> --file <json> --json`, their choice in
   `accepted.decision` and their words in `accepted.words`, then:
   - *Accept and publish* (`"accept-and-publish"`): the audit settles the
     pass and `plan ready` releases the publish.
   - *Fix by hand then re-run* (`"fix-by-hand"`): wait for the person to say
     they are done, run `solution refresh --json`, re-run step 4 on the same
     pages and record a new `plan audit`.
   - *Finish without publishing* (`"finish-without-publishing"`): for each
     publish `heldForQuality` names, run `plan task <planId> <publishId>
     --status skipped --error "user declined optional action" --json`. With
     no publish pending the hold has nothing to hold, and `plan ready`
     reaches its finish line.

   A publish that already ran before the pass is left as it ran and named on
   the audit entry as `publishedBefore`; to ship the fixes, add a fresh
   publish task through `plan revise`.

## The advisory question

One `AskUserQuestion` with header `Advisory`, single-select, each option with
a one-line description:

- `Fix them all`: every advisory finding goes into its page's fix task.
- `Pick by rule`: offered only when the advisory findings span two or more
  rules.
- `Leave them`: every advisory finding is recorded as declined.

When the pass already sends a fix task for blocking findings, `Fix them all`
comes first, marked `(Recommended)`, since the advisory fixes ride along.
Otherwise `Leave them` comes first, marked `(Recommended)`, since fixing
advisory findings alone adds a round before the publish.

On `Pick by rule`, ask once more, in one `AskUserQuestion` call: up to 4
questions, each `multiSelect`, headers `Fix rules 1` to `Fix rules 4` (or
`Fix rules` when there is one). Each option is one rule, naming the rule,
what it checks and where it was found, such as `U6 · spacing off the 4pt
grid · 3 on Home, 1 on Detail`. Split the rules so every question holds 2 to
4 options. With more than 16 rules, the last option of the fourth question
is `The other <n> rules`. A rule left unpicked is declined. The advisory
findings declined either way go in `accepted.findings`.

## The findings file

```json
{
  "page": { "id": "e_…", "name": "Home", "version": 265 },
  "app": { "id": "field-service", "appType": "MOBILE" },
  "summary": { "blocking": 2, "advisory": 5, "blocks": 172, "onLoadSources": 2, "unprobed": 0, "unreached": 0, "notes": 0, "errors": 0 },
  "findings": [
    { "rule": "P4", "severity": "blocking", "blockId": "b_…", "blockName": "tileIcon",
      "path": "content.data.src", "detail": "1024×1024 PNG (212 KB) in a 48×48 box (×3 = 144px): 7.1× the box",
      "fix": "re-export as WebP (SVG for a glyph) at 144px, under 200 KB, with both width and height set explicitly" }
  ],
  "candidates": { "interactions": [], "navigation": [], "lists": [], "writes": [], "heavy": [], "functionBound": [] },
  "images": [ { "url": "…", "type": "png", "width": 1024, "height": 1024, "bytes": 212000 } ],
  "unreached": [], "notes": [], "errors": []
}
```

That is one page's report from the script. `images` holds one entry per
image address the script probed: its type, size and bytes, or `error` when
the probe failed. `summary.unprobed` counts the P4 findings for images the
probe could not measure (`not probed: <reason>`). `summary.unreached` counts
the blocks the page references that the script never reached, and
`unreached` lists their ids: no rule checked them. A page with any is only
partly audited, so say so beside it in the table. `notes` lists the walk's
structural notes, each `{ kind, blockId, parents, detail }`: `shared` is a
block more than one parent lists, walked once under the first; `cycle` is a
child reference back up the tree, which the walk did not follow. They are
not findings. `errors` lists each rule that threw, as `{ rule, message }`:
that rule did not run on the page, so judge it by hand or fix the config it
names and re-run. Among the `candidates`, `navigation` entries are
`{ blockId, blockName, targetPageId, transition, overridePageAnimation }` and
`lists` entries `{ blockId, blockName, sourceIds, paging, collectChildStates }`. The merged file `plan
audit` reads (step 5, `.sessions/<sessionId>/audits/<planId>.json`) is one
object for the whole plan, in exactly this shape:

```json
{
  "pages": [ { "id": "e_…", "name": "Home" } ],
  "summary": { "blocking": 1, "advisory": 0 },
  "findings": [
    { "page": "e_…", "rule": "P4", "severity": "blocking", "blockId": "b_…", "blockName": "tileIcon",
      "path": "content.data.src", "detail": "1024×1024 PNG (212 KB) in a 48×48 box (×3 = 144px): 7.1× the box",
      "fix": "re-export as WebP (SVG for a glyph) at 144px, under 200 KB, with both width and height set explicitly" }
  ],
  "accepted": { "findings": [], "decision": null, "words": null }
}
```

- `pages`: every page `plan ready` named, as `{ id, name }`. `plan audit`
  refuses a file that leaves one out. A page the script could not audit
  (step 4) carries `unaudited: { reason, words }`, the person's own words,
  and no findings; `plan audit` refuses either part empty.
- `findings`: one flat list across the pages of the findings left open —
  the blocking ones and the advisory ones the person chose to fix — each the
  script's finding plus `page`, the id of the page it is on. `plan audit`
  refuses a finding whose `page` is not in `pages`.
- `summary`: `blocking` is the number of entries in `findings` with
  `severity: "blocking"`, and `plan audit` refuses a file where the two
  differ; `advisory` is the number of advisory entries in `findings`.
- `accepted`: `findings` holds the advisory findings the person declined at
  the advisory question. `decision` is `null`, or after round 2 with
  blocking findings still open the person's choice, one of
  `"fix-by-hand"`, `"accept-and-publish"` or `"finish-without-publishing"`,
  and `words` is then their own words (`null` otherwise); `plan audit`
  refuses a decision with empty `words`. Only `accept-and-publish` settles a
  pass that still has open blocking findings.

## The fix task

```json
{ "id": "q1", "title": "Page quality fixes on Home", "kind": "page-bind",
  "entity": { "kind": "page", "id": "e_…", "name": "Home", "app": "Field Service", "appId": "field-service" },
  "dependsOn": [], "visual": false, "audit": true,
  "body": "1. Read first: cache outline … and live get_blocks for b_…, b_…\n2. X2 renewButton (b_…): …\n3. U1 orderRow (b_…): …\n…\nN. Read back and report each proof line.",
  "proof": "get_blocks shows renewButton (b_…) appearance.loading bound to the source's isLoading, and orderRow (b_…) a Pressable root with appearance.interactions and the action on its onPress" }
```

`audit: true` marks it as a quality task — the only task kind `plan audit`
may add, inserted as a dependency of the `publish` of its page's app (never
an AI agent's or another app's). Its id
is `q<n>` (`q1`, `q2`, …), one per audited page; never reuse a `t<n>` id for
it. The CLI makes each fix task depend on every task of its page, its page
review included, so leave `dependsOn` out of the file, or `[]`.

- **Body:** one numbered line per finding — rule · block id and name · what
  to write — then the read-back line. A line names only what the builder's
  tools can write: for an image that must be re-exported (P4), ask the
  person for the new file's address first and put it in the line.
- **Proof:** the read-back of what changed: `get_blocks` on each changed
  block, and the outline when a block moved or went. The builder does not
  run the script. The main session runs it again in round 2, after
  `solution refresh`.

## The device step

Main session, after the script, and only with a device driver. `native-setup` installs one (argent, with a pool of iOS 18 simulators the
`native-device-pool` block reserves), and the loops' audit and test-and-fix stages
run this step on that pool; a person may also have another driver installed
(`app-native` [native-verify.md](../app-native/references/native-verify.md),
pre-flight step 4). The calls below are named as one common driver exposes them
(`list-devices`, `describe`, `screenshot`, `gesture-*`):
map them to your driver's equivalents, and skip a step your driver has
nothing for. With no driver, show `Device check skipped: no device driver`
and let the findings stand on the config alone.

It checks the draft, so the change needs no publish: the UnifyApps Preview
app runs the app's saved draft, once the app has been published at least
once (`native-verify.md`, pre-flight). Run the step only when the driver
shows a booted simulator with the Preview app open on this app's **Draft**
(its debug sheet header reads Draft). A client's own store build runs only
the published version, the copy from before this plan's work, so it never
counts. Otherwise show `Device check skipped: <reason>` (no simulator
running, no Preview app on it, the Preview app not open on the draft, or the
app never published and nobody opened it from the builder's QR) and let the
findings stand on the config alone. When a simulator is running but the app
is not on its draft, open it first: `node
"${CLAUDE_PLUGIN_ROOT}/skills/app-native/scripts/preview.mjs" open
<interfaceId>` prints the Preview link and opens it in the Preview app on the
booted device. It says when the Preview app is missing, and opens nothing for
an app never published. Then tap **Draft** in "Choose a version to open". A link to the app already open is
ignored: when it is open on Published, choose Exit Application in its debug
sheet first. That signs the app out, so the person signs in again. Never copy
the builder's own preview link: it carries the person's sign-in.

Per touched page, in this order, each step skipped with a note when its
precondition fails:

1. Reach the page through the app in at most three taps (tab bar, a list
   row, back); otherwise skip the page's device step.
2. Reload with the upper half of the Preview app's floating pill: the app
   fetches the saved draft and comes back to this page. A relaunch lands on
   the app's start page, so use it only when this page is the start page. Take a screenshot as often as the driver allows from the
   tap until the page settles, and read the frames from the first one that
   shows the page. The page draws its header region at once but its body and
   footer only after the screen's interactions end
   (`InteractionManager.runAfterInteractions`, then an idle callback), so a
   body that is blank or the workspace colour in those first frames is the
   runtime, never X1 evidence. X1 evidence is a data region drawn with
   neither its data nor a loader. A body that stays blank long after the
   header is X5 evidence only when the script counts the body over X5's
   threshold. The pill is in every frame and is never a finding.
3. A press-and-hold (touch down, screenshot, touch up) on one tappable of
   each surface kind — U1 evidence.

Measurements attach to the matching findings as evidence lines with the
screenshot paths. They never change a rule's severity; a finding with no
measurement stays labelled `config-only`. The Preview app gives no render
counts or scroll commits, so P1, P2 and P3 findings always stay
`config-only`.

## What the person sees

One line that the pass is running; the page · blocking · advisory table; one line per fix
task sent and its `Recorded` line, as the run loop already shows; the closing
line `Page quality: <n> pages, <b> blocking, <a> advisory accepted` (or `…
<b> blocking open, accepted by you` when the person finishes with open
findings) — then `plan finish` and its `entityTable` as today.

## Reference files

| File | Read it when |
|---|---|
| [references/rulebook.md](references/rulebook.md) | building or fixing a MOBILE page, to prevent each rule's finding; a fix task's lines name its rows, and the main session's pass judges findings against it |
