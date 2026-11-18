# A WEB page, live: its state, its events and a binding's value

## Contents

- Where it works
- The script
- The events
- evaluate
- By symptom
- Config or platform

The stored config says what a page should do. These reads say what it does
right now: the value a variable holds, the actions a click ran and in what
order, which side of a condition is false. Read them when the config alone
does not explain what was seen, and skip them when it does: each read needs a
signed-in browser on the page.

## Where it works

The builder and the builder preview of a no-code app carry a reader,
`window.__uaPulse`. `start`, `stop`, `events` and `state` only read. `evaluate`
runs code in the builder tab: see § evaluate for what that can touch. None of
it changes the page's saved config, and none of it reaches the app's users.

| Link | `start` · `events` · `state` | `evaluate` |
| --- | --- | --- |
| builder, `…/interfaces/<app>/builder/<path>` | yes | yes |
| preview, `…/interfaces/<app>/preview/<path>` | yes | no: only the builder answers a block's context |
| a published app's own address | no | no |
| a MOBILE app's builder link | yes | yes: it uses the same builder canvas |
| a MOBILE app on a device, a code app | no | no |

A tenant on an older build has no reader: the script exits 3. Debug from the
config then, and say the live reads were not available.

## The script

Open the page first, as [surfaces.md](surfaces.md) says, then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" <folder> open-page <builder or preview link>
node "${CLAUDE_PLUGIN_ROOT}/skills/ua-debug/scripts/live-page.mjs" <folder> start
```

Every command below is `live-page.mjs <folder> <command>`, in the same folder.

| Command | Answers |
| --- | --- |
| `start [--keep-on-reload]` | `{ capturing: true, lastSeq, keepOnReload }`. Capture is on from here; keep `lastSeq`. With `--keep-on-reload`, every later load in this tab captures from its first write |
| `stop` | `{ capturing: false }`, and forgets `--keep-on-reload` |
| `events [--since N] [--kinds a,b] [--out file]` | `{ events, lastSeq, capturing, evicted, missed, scopes }`, the events after `N`. `missed: true` means some events after `N` are gone (below) |
| `repeats [--since N] [--idle-ms MS] [--min 10]` | what changed at least `min` times, with `count` and `perSecond`; `--idle-ms` starts, waits with no input, then counts, and stops again if it started capture itself |
| `state` | `{ scopes }`: every live store, with `scopeId`, and `label` and `kind` (`app`, `page`, `module` or `template`) on all but a repeated row's store, which has neither |
| `state --scope S [--keys a,b]` | that store's live values. The page store's keys include `blocks`, `pageVariables`, `pageFunctions`, `dataSources`, `pageInputs` and `pageParams`; `state --scope S` without `--keys` lists them all |
| `evaluate --input file.json` | the value of a binding, a condition or a page function (below) |

Rules:

- Call `start` before the steps you watch. A reload ends capture; for what
  happens while the page opens (an `onPageLoad` chain, a data source that
  runs on load, a loop that starts on open) use `start --keep-on-reload`,
  then `open-page` the link again, then `events`. `stop` when done.
- The page keeps the last 500 events. The Pulse panel's Clear, closing the
  builder's DevTools dock and switching to another app also clear them; your
  capture stays on. `missed: true` says events after your `--since` are gone
  for one of these reasons: read again from your last `lastSeq` after the
  next steps, or read with `--out` soon after the steps.
- `start` again when `capturing` comes back `false`.
- Clicks, typing and waits are the browser's own commands (`snapshot`,
  `click <ref>`, `fill <ref> <text>`), between `start` and `events`.
- Values are the app's data. Quote ids and the shape of a value in a shared
  note, never a person's name, email or record content. The app store also
  holds the app's environment variables and the signed-in user: never copy a
  value that looks like a token, a cookie or a key into a report.

## The events

Each event has `id` (its seq), `timestamp` (ms), `scope`, `kind`, `entity`
(`{ type, id, name }`, `type` one of `block`, `pageVariable`, `pageFunction`,
`dataSource`, `event`, `action`) and these fields per kind:

| `kind` | Fields | Read it as |
| --- | --- | --- |
| `event` | `eventType`, `label`, `payload` | a block fired an event (`onClick`, `onChange`, …); the actions after it are its chain |
| `action` | `actionType`, `result`, `input`, `executionType`, `trigger` | one action ran. `result.status` is `ok`, `skipped` (with `reason`: `disabled`, `runCondition`, `userCancelled`, `debounceReset`) or `error` (with `message`). `trigger` is `onSuccess` or `onError` when it ran as a callback. `executionType` is `delay`, `debounce` or `throttle` |
| `componentMethod` | `method`, `target`, `args` | an action called a block's method |
| `stateChange` | `store.map`, `prev`, `next` | a value changed; `store.map` is `block`, `pageVariable`, `pageFunction` or `dataSourceData` |
| `dataSource` | `dsId`, `phase`, `durationMs`, `rowCount`, `message`, `reason`, `requestPayload` | `phase` is `request`, `success`, `error` or `skipped`; `reason` on `skipped` is `cache`, `disabled`, `runCondition`, `dedupe`, `notReady` or `unknown`; `requestPayload` is what the page sent |
| `error` | `source`, `message`, `expression`, `stack`, `payload` | `source` is `runScript`, `pageFunction` or `action`: the code or the action that threw |
| `log` | `label`, `payload`, `level` | a `logToDebugger` action printed it; `level` is `info`, `warn` or `error` |

The list is in time order and flat: an action does not point at the event that
ran it. The event before it on the same block, and the timestamps, give the
order.

## evaluate

The input file holds exactly one of these, plus `blockId` when the binding
lives on a block (its row and context come from that block; the page's root
is used without it). Three example files, one per kind:

```text
{ "blockId": "b_submit", "expression": "{{ var_count['value'] > 3 }}" }
{ "blockId": "b_banner", "condition": <the block's stored visibility.conditions object> }
{ "functionBody": "<a page function's body>" }
```

- `overrides` sets sample values on a copy of the context before it runs:
  `{ "overrides": { "var_count.value": 5 } }`. Use it to test what a value
  would make the binding give, without touching the page.
- An `expression` or `functionBody` answers `{ value, contextFrom }`. No
  `value` key means it gave `undefined`: almost always a wrong key or path,
  which the evaluator does not report as an error.
- A `condition` answers `{ result, leaves, contextFrom }`. Each leaf has
  `path`, `property`, `computedProperty`, `operator`, `value`,
  `computedValue` and `result`: the leaf whose `result` is `false` is the
  false side, and its computed values say why. A leaf with `ignored: true`
  has no operator yet: the block skips it, so it is never the false side.
- `evaluate` runs real code in the builder tab. A read-only context only
  hides the page's setters; an expression or a page function can still call
  `fetch`, write `localStorage` or navigate, and an endless loop freezes the
  tab. Evaluate the stored binding as it is, and never add a call of your own.
- `"allowWrites": true` gives a page function the page's actions and data
  source methods, which can run automations that write real records. Use it
  only on test data with the person's yes, and know a reload does not undo
  what it wrote.
- `{ error }` is the evaluator's own message: an id that does not exist, a
  call on `undefined`, a syntax error. That is the cause, not a failed read.
- "no block answered": the block is not on the open page, or the link is the
  preview. Open the builder on the page that shows it.

## By symptom

**The page is wrong as soon as it opens.** `start --keep-on-reload`,
`open-page` the link again, `events`: the `dataSource` and `action` events in
order show what ran on load and where it stopped. `stop` after.

**Submit does nothing.** `start`, `click` the button, wait two seconds,
`events --since <lastSeq>`. Find the `event` on the button, then read the
`action` events after it in order. Each follow-up carries `trigger:
onSuccess`. The chain stops at the first action whose `result.status` is
`skipped` (its `reason` says why) or `error`. A script that throws still
reports its `executeScript` action as `ok`: the `error` event right after it,
with `source: runScript`, holds the message, so read every `error` event in
the window, not only the action results. No `event` at all: the button has no
event, or it is disabled (read its state). On the builder link a click only
selects the block; turn on the builder's interact toggle first, or use the
preview link.

**A button stays disabled, a value is wrong.** `state --scope <page scope>
--keys pageVariables` (or `blocks`) for the live value, then `evaluate` the
block's stored `appearance.disabled` (or the binding) with its `blockId`. A
live value that differs from the variable's `initialValue` was set by an
action: `events` and look for the `stateChange` on it.

**A block is hidden for everyone.** `evaluate` its stored
`visibility.conditions` with its `blockId`. The false leaf names the side.
Then `overrides` with the value you expect a user to have: still false means
the condition is wrong for every user; true means the data is.

**A data source is empty or wrong.** `events --kinds dataSource` for its
`requestPayload`, `rowCount` and `message`; `skipped` with its `reason` means
it never ran. Then `run_data_source` with that same payload.

**A page that hangs, or evaluates without end.** A page nobody touches
records nothing. `repeats --idle-ms 5000` on the page with no input:

- `total` 0: nothing loops. The slowness is one heavy step; `events` around
  the slow action, with its `durationMs`.
- A `stateChange` group with a high `perSecond`: that value is written in a
  loop. Two groups of the same size are two values setting each other. Find
  who writes them: `cache events` and `cache grep <id>` for an `onChange`, a
  page variable's default, or a data source's `onSuccess` that sets a value
  its own binding reads.
- A `dataSource` `request` group: the source runs again and again, often
  because its input binding reads a value its own `onSuccess` sets.
- The script exits 4: the page does not answer at all. Its main thread is
  stuck. Look for the loop in the config as above; with none there, it is a
  platform bug.

## Config or platform

| Seen | It is |
| --- | --- |
| `evaluate` gives the wrong value, and the binding names a wrong id, path or operand | config |
| an action `skipped` for `runCondition` or `disabled`, and that rule is wrong for this case | config |
| a loop in `repeats` that an event, a default or a callback in the config explains | config |
| a data source's `requestPayload` holds the wrong inputs | config |
| the config is right by its knowledge sheet, `evaluate` gives the right value, and the screen still shows another | platform |
| an action `ok` whose `stateChange` never comes, or comes with another value | platform |
| an `error` whose `stack` is inside the platform's code while the config is valid | platform |
| a loop in `repeats`, or exit 4, that nothing in the config explains | platform |

A config cause goes through `ua-change` like any fix. A platform cause is not
fixed on the tenant: say so plainly, and hand the frontend team this block,
with every line filled:

```
**Platform bug:** <one sentence: what the platform does wrong>
**Page:** <builder link> · <app id> · <page id> · <block or variable ids>
**Steps:** <the steps file, as a person does them>
**Config:** <the stored setting, and the knowledge sheet that says it is right>
**Live:** <the events, by id, kind and timestamp> · <the state read> · <the evaluate answer>
**Expected:** <what the screen should show> · **Seen:** <what it shows>
```
