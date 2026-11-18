# Stage: reproduce

## Contents

- When it runs
- What it hands on
- The loop
- 1. Steps from the person's words
- 2. Run them on a reserved device
- 3. Not reproduced: the repro question
- 4. Find the cause, layer by layer
- 5. Write the issue
- No screen: an issue in the background
- On a WEB app
- Done when

The fix loop's way in for one issue the person describes in chat ("when I
tap the favourite button and reload, it is not saved"). In place of the
broad audit, this stage turns the words into steps, runs them on a reserved
test device until it sees the issue, finds the layer that causes it with the
cheapest reads first, and writes one issue with an owner and the recorded
steps as its test. The issue then goes to the [fix stage](fix.md) like any
other, and every fix of it is retested by replaying those steps
([test-and-fix](test-and-fix.md) § Kind `replay`).

Replaces the reproduction of the old fix-bug loop.

## When it runs

- The person names one issue in chat, with or without steps, a page or a
  screenshot. Several issues in one message: one reproduction each, in
  parallel up to `limits.runners` (each holds a device of its own).
- Not for a list, a sheet or tickets: that is `native-triage`. Not
  when nothing specific is named: that is the quick audit.
- An issue with no screen to tap (an email not sent, a nightly sync that
  fails, a record a schedule should change): § No screen, with no device.
- A request for something new ("add analytics", "make the list live") is
  not an issue: say so in one line and offer `/ua:native-build-loop` (on a
  WEB app `/ua:app-build-loop`) from a description.

The reproduce agent is one background `general-purpose` agent per issue
(`Agent(subagent_type: "general-purpose", run_in_background: true, description: "reproduce <issue id>", prompt: <brief>)`).
Its brief names this file, the run folder `R`, the issue id it writes
(`RP1-01`, then `RP1-02` …), the person's words verbatim, the app id and
platform, the UnifyApps Headless CLI with `--session` for cache reads, the `loops` command
with the plugin's real path (for `loops shots add`), the device profile
and test user from `profile.json`, and these rules: "No tool writes to the
tenant: cache reads only. On the device, tap only the steps' own controls; a
step that saves runs only as the run settings allowed, as the test user. One
device, yours: reserve it and release it on every exit path (on WEB one
browser folder, closed before your reply). Final reply: the steps file, the
result line and the layer found, under 30 lines." The orchestrator makes the
reads a subagent cannot (the automation's runs through a read-only brief, the
record) and asks the person; the agent never does.

## What it hands on

| File | Holds |
| --- | --- |
| `R/repro/<issue id>/steps.md` | the steps, the expected result, the data the steps write, the version seen |
| `R/repro/<issue id>/` | the argent flow (MOBILE), the start and failure shots, the screen tree or snapshot, the network or data-source calls |
| `R/shots/<issue id>/` | the before shot (a copy of `fail.png`) and its `shot.json`, for the BEFORE \| AFTER sheet at the end of the run ([formats](../formats.md) § Shots) |
| `R/issues/reproduce-1.md` | the issue log: one issue per reported issue, with its owner and its `steps` |

The steps file, which a test runner replays without having seen the chat:

```
# Steps — RP1-01 (favourite not saved after reload)
- Platform: MOBILE | WEB (width 1440)
- Page: <Page> · <pageId> — route: <hops from loop-route-map>; on WEB the preview path
- Version seen: draft v<N> | published v<M> | draft (preview route) — proven by <refetch call | open-page loadedAt>
- Signed in as: <test user name>
- Writes: <what the steps save, as the test user> | none — allowed in the run settings
- Flow: repro-rp1-01 (argent, MOBILE) | none (<why: a time, a random order>)
- Repeat: 1 | 5 (intermittent: seen in 1 of 5 runs)

1. Open <Page> (<route>)
2. Tap ♡ on the first card (<block display name> b_…, label "Favourite")
3. Reload: MOBILE restart-app, then open <Page> again; WEB `reload`
4. Expect: ♡ on the first card is filled

Data: object <name> (<object id>) · record <test record id> · field <name> = true
Seen: ♡ empty after reload (fail.png; network.json: the save answered 200, the refetch returned false)
```

`Expect:` is the person's expected result in words a screen read can check
(a text, an icon name, a state, a count). `Data:` is written only when the
issue is about saved data: the object, the test user's record and the field
value the steps should leave, so a replay can confirm it read-only.

Two optional blocks follow, each a header line and one `- ` line per check.
A replay checks an `Effects:` block when the file has one; the build loop's
`acceptance` and `realtime` checks use the same file
([feature](feature.md) § Steps files, `R/accept/<feature>/<n>/steps.md`):

```
Effects:
- record <object name> (<object id>) · <record id or filter> · <field> = <value>
- run <automation name> (<automation id>) · success|failed · after step <n>

Watch:
- device 2 shows <expected> within <n> s
```

- **`Effects:`**, checked read-only after the steps. A `record` line is read
  with `get_records` (`limit` at most 5) and holds when a row read has the
  field at that value. A `run` line is the first run of that automation after
  step `<n>` ended, read with a read-only automation-agent brief
  (`list_workflow_runs`, `inspect_workflow_run`), and holds when its status
  is the one written.
- **`Watch:`**, for a `realtime` check only. Device 1 does the steps;
  device 2 must show `<expected>` (in words a screen read can check) within
  `<n>` seconds of the last step, 10 when the line gives none. An optional
  header line, `- Watcher: <Page> · <pageId> — <route>; signed in as <test
  user>`, names the page and the user of device 2; without it, device 2
  opens the request's page as the test user of `Signed in as:`.

`loops queue add` refuses a line in neither shape and a `run` line after a
step the file does not have.

## The loop

1 → 2 → found? → 4 → 5. Not found → 3, then 1 or 2 again. A reproduction
tries at most `limits.maxAttempts` times; after that, or when the person
picks Stop, the escalation for this issue only.

### 1. Steps from the person's words

1. **The page.** Match the words to a page with the cache:
   `ua cache paths <appId>`, `ua cache page <pageId> --app-id <appId>`, and
   [loop-route-map](../../../loop-route-map/SKILL.md) for the route from the
   home page (each hop with its block and event). A screenshot the person
   gave is read once and described in `steps.md`.
2. **The controls.** `ua cache blocks <pageId> --app-id <appId> --match <part of a name>`
   (a regular expression on display name and component type; `--name` takes
   only the exact display name) and `ua cache outline <pageId> --app-id <appId>`
   for each control the words name: its display name, `b_…` id and the label
   or icon the screen shows.
3. **The expected result.** From the person's words, then the block's own
   config (the icon the ♡ shows when set, the text a saved state shows).
4. **The data.** When the issue is about saved data: `ua cache ds <pageId> --app-id <appId>`
   (which source writes, which reads back, their inputs), and
   `ua cache wf <automationId> --deps` for the object an automation
   writes. The test user's record comes from the reproduction itself (the
   save call's input or answer), never a guess.
5. **Writes.** A step that saves (a favourite, a form) runs only when the run
   settings allowed it for this issue, as the test user, on that user's own
   records ([rules](../rules.md) § Safety). Not allowed: the steps stop
   before the write and the issue is `escalated` with "needs a step that
   writes". An allowed write goes on a record of the run's own (a seed, or
   the profile's `fixtures.recordFreshData`), and each field it changes has
   its undo entry first ([undo log](../../../loop-test-data/references/undo-log.md)).
   The steps file's `Data:` line names that record, so a replay changes the
   same one.

No page or control in the cache matches the words: when the words name
something that happens without a screen (an email, a notification, a
schedule, a sync, a record that should change by itself), go to § No screen.
Otherwise the repro question before any run ("I could not find <words> in
<app>: which page, and what did you tap?"), the person's answer as the new
words.

### 2. Run them on a reserved device

On a WEB app, § On a WEB app says how this step runs in a browser.

`device-pool reserve --task "reproduce <issue id>" --wait 600`
(Bash timeout 700 s). A reproduction holds a device itself; still busy, the agent ends with "no simulator" and the orchestrator
starts it again when a reservation frees up. Then
`native-device-pool`'s [protocol](../../../native-device-pool/references/protocol.md)
steps 2–6: boot, launch, the endpoint, the version (`draft` unless the person
saw it on the published app), sign-in by the recorded flow, the fresh-config
proof.

1. Shot the start: `screenshot` → `R/repro/<id>/start.png`
   (`includeImageInContext: false`).
2. Record the steps as an argent flow when they are deterministic:
   `flow-start-recording {name: "repro-<id>", project_root: "R/repro/<id>"}` →
   `restart-app` → each step with `flow-add-step` (tap points from
   `describe`, `await-ui-element` for each state) → `flow-finish-recording`.
   Steps that depend on a time or a random order stay prose in `steps.md`,
   with why.
3. At the end check: `describe` → `describe.json`, `screenshot` →
   `fail.png`, `native-network-logs` → `network.json` (the save and the
   refetch with their status and bodies).
4. The result: `reproduced` (the end check fails as the person said),
   `not reproduced` (it passes), or `blocked` (the device, sign-in or a step
   could not run; the device's recovery once, then the escalation).
5. On `reproduced`, `fail.png` is the issue's before shot:
   `loops shots add --run <R> --id <issue id> --side before --file R/repro/<id>/fail.png --page <pageId> --page-name "<Page>" --issues <issue id> --state "after the steps" --title "<the Expect: line, in a few words>" --version "draft v<N>" --by reproduce`.
   The replay that verifies the fix adds the after side.

`device-pool release` on every exit path.

### 3. Not reproduced: the repro question

On MOBILE, before a rendering issue (missing or wrong text, glyphs, fonts,
images, a theme look) is called `not reproduced`, run the steps once more
with a memory warning and a fresh layout at the end
([device traps](../device-traps.md) D17). When that shows it, `steps.md`
lists both as its last steps, after the flow.

"I could not reproduce it: <what the device showed, with the version>."
Options ([approvals](../approvals.md)): Try different steps · Run the flow
five times · Stop.

- **Try different steps**: the person's words, back to step 1.
- **Run the flow five times**: the same flow or steps five times on the same
  device. One failure in five is `reproduced`, written `Repeat: 5` in
  `steps.md`: an intermittent issue, whose replay also runs five times and
  passes only when all five do.
- **Stop**: the issue is written with status `escalated` and `not
  reproduced`, with what was seen; no fix job starts for it.

### 4. Find the cause, layer by layer

Cheapest read first; stop at the first layer whose evidence explains the
failure, and look again only when a fix shows another layer. Each layer has
its `cause` value ([formats](../formats.md) § Cause), which the person reads
first: "the filter resets because it lives in a page variable", not "the
page changed".

| Layer (cause) | Read | Settles it when | Owner |
| --- | --- | --- | --- |
| The block's look and settings (`config`) | `ua cache blocks <pageId> --app-id <appId> --id <b_…>` against its block sheet | a wrong text, icon, visibility condition or setting, with no event or data in play | `page`, or `module:<id>` / `card:<pageId>` when the block sits in a shared one |
| The block's event and action (`event`) | `ua cache events <pageId> --app-id <appId> --name <block>`, `cache blocks <pageId> --app-id <appId> --id <b_…>` | the tap runs no action, the wrong one, a chain in the wrong order, a save with no refresh after it | as above |
| Page state (`state`) | `ua cache keys <pageId> --app-id <appId>` (the page and app variables, functions and form fields a binding can read, with their expressions); `ua cache grep <variable> --app-id <appId>` for every page that sets or reads it; the set-variable actions in `cache events`; the app's `state` line in the spec when one exists | a value is lost or wrong: a page variable reset on load where the flow needs an app variable or storage that lasts (house rule H8: no session storage on MOBILE), a page input the opener never passes, a binding that reads the wrong key, two pages using two names for one value | as above |
| The data source (`data source`) | `ua cache ds <pageId> --app-id <appId>`: its inputs and outputs, against the calls in `network.json` | a call with the wrong inputs or none, an output bound to the wrong field, a read not run again after the write | as above |
| The automation behind it (`automation`) | the orchestrator's read-only `ua:automation-agent` brief, loading `ua:automation-run-debugging`: `open_workflow`, `list_workflow_runs` (its last five runs) and `inspect_workflow_run` on the run the call names. No save, no test run, no deploy | a failed node, `success: false`, a write that never ran, a wrong value saved | `automation:<id>` |
| The AI agent behind a chat (`agent`) | `ua cache agent <agentId>` (instructions, models, default tools, deployed version); the chat call and its answer in `network.json` (the tool the agent called, or none, and what it returned); a tool that calls an automation leads to the automation row | the agent calls no tool or the wrong one, its instructions say the wrong thing, a tool it needs is missing; a tool's automation that fails is the automation's | `agent:<id>` |
| The object and its record (`object`) | the orchestrator's read-only `mcp__plugin_ua_object__get_records` with the `Data:` line's object and record ids, `limit` at most 5; `ua cache obj <objectId>` for its fields, types, picklist codes and required flags | the object itself is wrong: a field is missing, its type cannot hold the value, a picklist lacks the code the app saves, a required flag refuses the save | `object:<id>`. The record missing or holding the old value is the writer's (`automation:<id>` or `page`) |
| Access (`access`) | the save's answer in `network.json` (a 401 or 403), the object's settings | the test user may not read or write it: a role or permission no tool sets | `person` |
| Platform code (`platform`) | the block sheet against the config read above; any error text on screen | config right per its sheet and the record right, the screen still wrong; an error screen naming the mobile renderer | `platform`: a handoff note |

The layer and its evidence go in `steps.md` under `Cause:` and in the
issue's `cause` and `evidence`. Each read is an evidence row
([rules](../rules.md) § Evidence).

### 5. Write the issue

`R/issues/reproduce-1.md`, the [issue log](../formats.md) with its header
first, one issue per reported issue:

- `id` `RP1-<nn>`, `check` `reproduce`, `rule` `—` (or the rule the cause
  breaks), `severity` by what the person loses (`critical` when they cannot
  finish the task or lose data), `kind` by what broke: `logic` for a wrong
  action or a value not saved, `state`, `navigation`, `crash`. Never `data`,
  which the fix stage reads as a styling fix of an empty or error state.
- `expected` the person's words; `actual` what the device showed;
  `evidence` the repro files and the reads; `fix hint` the smallest change at
  the layer found; `cause` and `owner` from the table above; `device` `device`; `status`
  `open`; `attempt` 0.
- `steps`: `flow:repro-<id> · steps:repro/<id>/steps.md` on MOBILE,
  `steps:repro/<id>/steps.md` on WEB or when no flow was saved.

`loops issues lint R/issues/reproduce-1.md` must pass. Then the fix stage
starts at once: `loops issues split` and the job, with no plan approval (the
issue was reproduced and its cause found, so nothing is left to ask; one line
in chat says what is fixed and where), then its retest by `replay`. The
approvals a job needs on its own still come when it reaches them
([approvals](../approvals.md) § A reproduced issue starts at once).

## No screen: an issue in the background

For an issue nothing on a screen shows: an email or notification not sent,
a scheduled or record-triggered automation that fails, a sync that leaves
records wrong. No device is reserved.

1. **The automation.** From the words, find the automations that could do
   it: `ua cache wf <id>` for each candidate (its trigger: a schedule, a
   record change, a call), `ua impact automation <id> --change logic` for
   who calls it. More than one fits: ask which, with the candidates as
   options. None fits: the repro question in its no-screen words ("I could
   not find what sends <words> in <app>: which automation, or when should it
   happen?").
2. **Its runs.** The orchestrator's read-only `ua:automation-agent` brief,
   as in the layer table: the last five runs, and the run that should have
   done it, node by node. A failed or wrong run is `reproduced`; its run id
   is the evidence.
3. **No run to read** (it never ran, or no run is kept): a test run with the
   failing input, only when the run settings allowed writes as the test user,
   through the same brief (`trigger_workflow_run`, `runType:
   "workflow_test"`); not allowed, the issue is `escalated` with "needs a test
   run that writes".
4. **The cause.** The run's failed node or wrong value settles it, layer by
   layer as above: the automation itself, the object it reads or writes, the
   connection or the record the client keeps (`environment`), a role
   (`access`).
5. **The steps file** says how to see it again, without a screen:

   ```
   - Platform: none (background)
   - Trigger: <automation name> (<id>) · <schedule | record change on <object> | called by <caller>> · input <R/repro/<id>/input.json | the failing run's input>
   - Expect: <what the run should do: the node that sends, the record it writes>
   Seen: run <run id> failed at <node> (<message>)
   ```

The issue's `device` is `run` and its `steps` the steps file. The fix stage's
automation job proves it with its test runs before and after; there is no
device replay. A cause in an object or an AI agent goes to that job as usual.

## On a WEB app

The same loop in a browser folder of the run's own,
`R/runners/web-repro-<n>/browser/` (no reservation), on the preview route
at the width the person saw (1440 when they did not say; 375 for the phone
view). Below, `B` is
`node "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" R/runners/web-repro-<n>/browser/`,
UnifyApps Headless's own browser ([web-browser](../../../../web-loops/web-browser/SKILL.md)).
The preview route shows the saved draft once `open-page` reloads it; no
restart. The browser is signed in as the person, not a test user, so a step
that saves writes as the person: it runs only on seeded test data
(`ZZ_LOOP_…`, [loop-test-data](../../../loop-test-data/SKILL.md)) with each
change in the undo log first, and the steps file's `Signed in as:` and
`Writes:` lines say so.

- **Run.** `node "${CLAUDE_PLUGIN_ROOT}/skills/web-loops/web-browser/scripts/open.mjs" --browser <browser> --url "<preview url>" --width <width>`,
  `B page-shot <width>` (at 375, `B fit-page` then
  `B screenshot --filename=page-375.png`, after `open.mjs` picked the width),
  which saves `<browser>/page-<width>.png`, copied to `start.png`; then each step as a browser.mjs command with a ref from a
  fresh `B snapshot` (`click e12`, `fill e14 "…"`, `reload`,
  `B wait-for "<text>" 10000`). Refs change with every snapshot, so
  `steps.md` names each control by its label and block, never by ref.
- **Capture.** `B snapshot` → `snapshot.txt`, `B calls` → `calls.json` (the
  data-source calls with status, request and answer), `B page-shot <width>`
  copied from `<browser>/page-<width>.png` to `fail.png`, which goes in as the before shot as § 2 step 5 says, with
  `--version "draft (preview route)"`. `B close` at the end.
- **No flow.** The steps file is the test; the issue's `steps` names it
  alone.
- **The data source layer** reads `calls.json` in place of `network.json`.
- **Platform code** is a handoff note.

### A code app

On a Code Builder app the steps run on the engine's preview route
(`https://<host>/agent-api/preview/b/<appId>/main<path>`), which
`open-page` lands on like a no-code draft. The cause is found in the app's
source: `cache blocks` has nothing for it, so the agent reads the checkout
(`skills/app-code-build` says how) for the component the steps reach, and
the issue's cause names a file and a line.

## Done when

Every reported issue has one issue in `R/issues/reproduce-1.md` that lints
clean, with a cause, an owner, its `steps`, and evidence with the version
seen (an issue with no screen: the run that shows it); or it
is `escalated` (not reproduced, a step that writes not allowed, a blocked
device) with what was seen; every reservation is released and every browser
closed.
