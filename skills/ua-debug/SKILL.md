---
user-invocable: false
name: ua-debug
description: Finds why something on a UnifyApps tenant misbehaves and proves the fix, for any entity - a page of a no-code app, a code app, an automation, an object or its records, an AI agent, an API, a custom connector, a connection, an environment variable. Reproduces the issue on the entity's own surface first, finds the cause layer by layer with the cheapest read first, fixes the cause (never the symptom) through ua-change, and replays the reproduction after. Load before a fix built directly (a bug reported in chat goes to its fix loop first, as ua-change § Loop first says), in a ticket or by a loop, and when the person asks why an agent, a page or an automation does what it does.
---

# Debug anything on the tenant

A bug is fixed when the same steps that showed it no longer show it, and the
change sits where the cause is. Everything here serves those two sentences.

## Six rules

1. **Reproduce first.** A fix for what nobody saw is a guess. See it, record
   how, then read.
2. **Fix the cause where it lives.** No guard, retry, default value, hidden
   empty state or second data source that makes the symptom go away while the
   cause stays. A fix that needs a sentence to explain why it sits somewhere
   else sits in the wrong place.
3. **Check the pattern, not the instance.** The same wrong binding, node or
   setting is usually on a sibling too: `cache grep` across the app,
   `impact <kind> <id>` for what shares the part.
4. **When stuck, read more.** A test run, a trace, the console, the network
   call, the record. Never a guess written as a cause.
5. **State before code.** A stale cache (`solution refresh`), a draft that
   differs from what is deployed or published, a record holding old data, a
   test user with a different role. Half of "it still fails" is one of these.
6. **Record before reads.** The issue record and the steps file exist before
   the first read, and every step reads and adds to them; the hand-off between
   steps is the file, never chat prose. A fact the record cannot hold is not
   known yet. Two issues on one entity are worked one after the other, never
   side by side.

## The issue record

One record per issue, written to a file the moment the issue is located and
updated at every step. Every step below reads it and adds to it; nothing is
carried in chat prose.

```json
{
  "ask": { "words": "<the report, verbatim>", "links": [] },
  "entity": { "kind": "page", "id": "", "name": "", "appId": "" },
  "surface": "browser | device | run | test-message | record | call | config",
  "repro": { "state": "pending", "steps": "<steps file>", "expected": "", "seen": "", "version": "", "repeat": 1, "evidence": [] },
  "cause": { "layer": "", "where": "", "why": "", "evidence": [] },
  "ripple": [ { "kind": "", "id": "", "name": "", "why": "", "action": "changes-too | retest | unaffected", "result": "" } ],
  "fix": { "taskId": "", "change": "", "readBack": "" },
  "verify": { "state": "pending", "seen": "", "evidence": [] },
  "attempts": 0,
  "state": "located"
}
```

`kind` is one of UnifyApps Headless's entity kinds: `app`, `page`, `code-app`,
`automation`, `object`, `record`, `ai-agent`, `knowledge-set`, `api`,
`connector`, `connection`, `env-variable`, `governance`, `dataset`, `metric`,
`experiment`, or `unknown` until step 1 settles it. `layer` is one of the
rows in § 3. The states, in order:

| State | Set when | Next |
| --- | --- | --- |
| `located` | the entity and its surface are known | reproduce |
| `reproduced` | the steps showed what the report says | cause |
| `not-reproduced` | the steps ran and did not show it | the repro question, or done when the expected result already holds |
| `no-surface` | nothing can show it yet (no run kept, a step that writes is not allowed) | ask for the one thing that gives a surface |
| `caused` | one layer's evidence explains the failure | fix |
| `fixed` | the change landed with a read-back | verify |
| `verified` | the replay passed | done |
| `failed` | the replay failed | cause again, with the new evidence, up to two fixes |
| `blocked` | a refused dialog, a missing permission, a usage limit, no sign-in | the person |

## 1. Locate the entity and its surface

1. `state resolve --request "<the words>" --json` for every link and id in
   the report; `solution locate --link "<text>" --json` for where each lives.
2. Names without an id: `cache grep <words> --app-id <appId>` across the
   app, `entity context solution --json` for the solution's entities, then
   live reads for a `miss`. An entity on this tenant but outside this
   solution follows the membership rule in `ua-change`.
3. Two candidates fit: ask once, with both as options (in a loop, the loop's
   own question). None fits and the words describe something with no screen
   (an email, a schedule, a sync): the automation that could do it, from
   `cache wf <name>`.
4. The surface comes from the kind ([surfaces.md](references/surfaces.md)):
   a browser for a web page or a code app, a device for a MOBILE page, a run
   for an automation, a test message for an AI agent, a record for an object,
   a call for an API or a connector action, the config alone for the rest.

## 2. Reproduce on that surface

1. Write the steps file first, from the report: the entity, the version to
   use (draft unless the report saw it published or deployed), who is signed
   in, the steps, `Expect:` in words a read can check (a text, a status, a
   value, a count), and `Writes:` when a step saves something.
2. Run the steps on the surface as [surfaces.md](references/surfaces.md)
   says for the kind, and record what was seen with its evidence: a
   screenshot, a run id, a trace, a record read, a response body.
3. A step that writes runs only with the person's yes (or a loop's run
   settings), as a test user, on test data. Throwaway items start with
   `ZZ_DEBUG_<what>` and are listed for cleanup. Not allowed: `no-surface`,
   with "needs a step that writes" as the one thing.
4. The result: `reproduced` (the end check fails as the report says),
   `not-reproduced`, `no-surface` or `blocked`.
5. **Not reproduced.** Say what was seen, with the version. Then one
   question: try different steps · run it five times · stop. One failure in
   five is reproduced with `repeat: 5`, and the replay runs five times too.
   When the expected result already holds on the live entity, the issue is
   done as already fixed, with that read as the evidence.

## 3. Find the cause, layer by layer

Cheapest read first. Stop at the first layer whose evidence explains the
failure, and look again only when a fix shows another layer. Write
`cause.why` as the sentence the person reads first: "the filter resets
because it lives in a page variable", not "the page changed".

| Layer | Read | Settles it when | Fix owner |
| --- | --- | --- | --- |
| `config` | the entity's own settings: `cache blocks`, `cache outline`, `cache obj`, `cache wf`, `cache agent`; the live `get_*` read of the kind for a miss | the config itself says the wrong thing: a text, a visibility rule, a field type, a node setting, an instruction | the kind's builder |
| `event` | `cache events` (page and block events, data source callbacks); an agent's tool binding; an API's policies; on a WEB page, the actions a click ran, in order, with `live-page.mjs events` ([live-page.md](references/live-page.md)) | the wrong action runs, or none, or in the wrong order; a save with no refresh after it | the kind's builder |
| `state` | `cache keys` (page and app variables, functions, form fields); `cache grep <variable>` for who sets and reads it; a record used as state; an agent's memory switch; on a WEB page, the live value with `live-page.mjs state` and a binding's or a condition's value with `live-page.mjs evaluate` ([live-page.md](references/live-page.md)) | a value lost or wrong between two steps, two names for one value, a reset on load | the kind's builder |
| `data-source` | `cache ds`; `run_data_source` with `interfaceId`, `dataSourceId` and the same `inputs` the page sends | wrong inputs or none, an output bound to the wrong field, a read not run again after a write | app-agent, or the automation it calls |
| `automation` | `list_workflow_runs` with `workflowId`, then `inspect_workflow_run` with `runId` twice: once without `nodeIds` for the status and summary, then only the failing node | a failed node, `success: false`, a write that never ran, a wrong value saved | automation-agent |
| `agent` | `send_test_message` with `agentId` and `message`, then `read_trace` with its `caseId`; [ai-agents.md](references/ai-agents.md) | the entity is an AI agent, or a chat built on one answers wrong: the ladder in ai-agents.md names the layer from the trace (`config`, `event`, `state`, `automation` or `environment`), and `cause.layer` takes that name, never `agent` | as ai-agents.md § Who fixes it says |
| `object` | `cache obj <id>`; `get_records` with `objectId`, `recordIds` (or `filters`) and `limit` 5 | a field missing, a type that cannot hold the value, a picklist without the code, a required flag that refuses the save; a record holding the old value is the writer's layer, not this one | fde-agent (the object), the writer (the record) |
| `access` | a 401 or 403 in the call; `get_user_details`, `get_role_details`; the object's settings | the user may not read or write it | fde-agent through the governance tools, or an admin |
| `environment` | `list_connections`; `get_env_variables` with `names` (values of a secret are never printed); the deployed version against the draft; the external system's own answer | a connection gone or expired, a variable missing or wrong per environment, callers reaching an old deployed copy | fde-agent (variable), the person (credentials), a deploy or publish (version) |
| `code` | `get_code_app`, `get_branch_codebase`; the browser console on its preview | the app's own source does the wrong thing | code-app-agent |
| `platform` | config right by its own sheet, record right, call right, and the screen or run still wrong; an error text naming the platform; on a WEB page, the live reads in [live-page.md](references/live-page.md) § Config or platform | not fixable on a tenant | nobody here: say so plainly, and offer `/ua:give-feedback` when UnifyApps Headless's guidance led there |

Each read is one evidence line: what was read, with ids, and what it showed.
Cache reads first; a `miss` or `stale` goes live. Deeper automation reads
(a run's payloads node by node) go to a read-only `ua:automation-agent`
brief, as `ua-change` briefs, with "No save, no test run, no deploy".

## 4. Ripple, then fix the cause

A fix changes one entity; other entities read it. Before the brief, find
every one of them and decide what the fix means for it.

1. **Who depends on it.** `impact <kind> <id> --change <logic|output|input|field-rename|field-delete|delete> --json`,
   with the change kind the fix makes: a page (every page that shows the
   same module or card), an automation (every page, AI agent and automation
   that calls it; a deploy reaches them all at once), an object (every page
   and automation that reads or writes the field), an AI agent (every app
   and page that chats with it). A kind with no `impact` command (an
   environment variable, a connection, an API, a connector action) gets
   `cache grep <name>` across the solution and a live search of what uses
   it. An `unknown` row is read live before the fix.
2. **What the fix means for each.** One row per dependent in `ripple`:
   `changes-too` (its contract or behaviour must change with the fix: it is
   a piece of the same change), `retest` (it should behave the same, and the
   replay proves it), or `unaffected` (say why in `why`). A caller already
   live that a deploy or publish reaches is named to the person before the
   release, as `ua-change` § Releases says.
3. **The same pattern elsewhere.** `cache grep` for the same binding, text
   or setting across the app. Siblings in scope go into the same change; the
   rest are named in the closing block.
4. **The fix**, through `ua-change` § Build it directly, with the owner the
   layer names. The brief carries the cause line, the steps file's path, the
   `changes-too` rows, and this sentence: "Fix the cause at `<layer>` in
   `<entity>`; add no guard, retry or default elsewhere that hides it." The
   builder's read-back goes into `fix.readBack`.

## 5. Verify by replay

1. After the read-back, run the same steps file on the same surface, with
   the same version rule (the draft unless the report was about what is
   deployed or published; then the release first, under `ua-change`
   § Releases). `repeat: 5` runs five times and passes only when all five do.
2. Compare to `repro.seen`. The read-back alone never verifies a bug fix: it
   shows the change landed, not that the symptom is gone.
3. Every `retest` row gets its own check on its own surface (a page opened
   and its data source run, an automation's test run, an agent's test
   message); every `changes-too` row gets its own replay. The result goes
   into the row's `result`. A dependent that now fails is a new issue with
   its own record, named in the closing block.
4. Pass: `verified`. Fail: `failed`, back to § 3 with the new evidence; the
   fix showed another layer. At most two fixes per issue; then stop with what
   was seen, both reads and both attempts, and `blocked`.

## The closing block

One block per issue, in this shape, every time. The evidence lines stay in
the record file; the block names the file.

```
**Issue:** <entity, with its id> · <what was seen, on which version> · <the steps file>
**Cause:** <layer> · <where, with ids> · <why, in one sentence>
**Fix:** <what changed, with ids> · <draft | deployed v<n> | published v<n>>
**Also affected:** <one line per ripple row: name, action, result> · or: nothing else reads it
**Verify it yourself:**
1. Open <the preview link from `entity link`, or the automation, agent or record by name>
2. <the steps, as a person does them>
3. Expect <the result in words a person can see>
**Left:** <what was not done, a dependent that now fails, the publish still to do> · or: nothing
```

"Verify it yourself" is the steps file written for a person: a link, the
actions, the expected result. For an automation: the test input and the
node or record to look at. For an AI agent: the message to send and the
answer or tool call to expect. Never "check that it works".

## References

| File | Read it when |
| --- | --- |
| [surfaces.md](references/surfaces.md) | reproducing or replaying on a kind's surface: what to open, what to read, which writes it may make, which builder fixes it |
| [ai-agents.md](references/ai-agents.md) | the entity is an AI agent, or a chat built on one answers wrong |
| [live-page.md](references/live-page.md) | a WEB page does something its config does not explain: a click that does nothing, a wrong or disabled value, a hidden block, a page that hangs or evaluates without end |
