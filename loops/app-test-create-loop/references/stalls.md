# Stalls — the run file, the watch and recovery

## Contents
- The run file
- Case states
- The checkpoint and the gate budget
- The watch
- Recovery
- Resume

## The run file

`tests/<app slug>/loops/<firing id>/run.json`, written by the main session
only. It is always rewritten whole, with the Write tool or one `node`
call that writes the whole object, never edited in place: a partial edit
of a file the evaluator reads as evidence can leave it half-written. It is
first written at the end of kickoff, with `scenarios` empty and
`kickoffEndedAt` set to the time of that write, taken in the same step
(`date -u +%Y-%m-%dT%H:%M:%SZ`), never earlier and never rounded; Plan
rewrites it with the scenarios. It is the helpers' run file too: every
field `app-test-author/references/parallel-authoring.md`, _The run file_,
names stays as it is (helpers read their entry by `key` and ignore the
rest; its `ledger` field is the scenario list, not the loop ledger), and
the loop adds its own:

```json
{
  "firingId": "<id>",
  "contract": "<absolute path of tests/<app slug>/run-contract.md>",
  "kickoffEndedAt": "<ISO time of the first write of this file>",
  "sessions": [ { "id": "<Claude session id>", "transcript": "<absolute path of its .jsonl>" } ],
  "helperCap": 8,
  "contractHelperCap": 8,
  "helperCapFloor": 6,
  "helperDeadlineMinutes": 45,
  "gateBudget": 3,
  "runBudget": { "cases": 60, "minutes": 240 },
  "capChanges": [ { "at": "<ISO>", "from": 8, "to": 6, "why": "machine load | shared state: <key>" } ],
  "stalls": [ { "at": "<ISO>", "kind": "<a row of the recovery table>", "key": "<case key or null>", "recovered": true } ],
  "sessionsRefreshed": [ { "at": "<ISO>", "userId": "<id>" } ],
  "wouldHaveAsked": [ { "key": "<case key>", "question": "<the question>", "proposedField": "<field>", "proposedDefault": "<default>" } ],
  "reportLines": [ "<a line for the report's Run facts, policies.md, Messages that become report lines>" ],
  "surveyFiles": [ "<absolute path of each survey file the Plan step wrote>" ],
  "scenarios": [
    { "key": "…", "name": "…", "module": "…", "feature": "…", "scenarioGroup": "…", "priority": "P0",
      "covers": [ "<each inventory id of the survey files this case exercises, or this parked entry accounts for>" ],
      "provision": [ "<each provisioning recipe the scenario names, copied whole from the discover firing's journeys.json; absent when it names none>" ],
      "state": "queued | authoring | waiting | saved | authored | parked",
      "steps": "<the case's planned step count, for most-steps-first>",
      "sharedState": "<true when it changes what other cases see>",
      "helper": "<the name the helper was dispatched under>",
      "dispatchedAt": "<ISO time of its Agent call, to the second>",
      "submissions": 0,
      "checkpoint": { "payloadFile": "<the entry's payloadFile, once it exists>", "lastGate": "<the last gate error, or null>" },
      "lastError": "<text, or null>",
      "testCaseId": "<id once saved>",
      "parkedReason": "<one of the fixed reasons, policies.md>",
      "evidence": "<the error, read, file or question that shows it>" }
  ]
}
```

`sessions` gains one entry for each Claude session that works on the run,
the first at kickoff and one more on every resume, because the evaluator
reads each transcript from `kickoffEndedAt` on and never searches the
disk for one. The transcript is
`~/.claude/projects/<the working folder's real path, every character other than a letter, a digit or - replaced by ->/<sessionId>.jsonl`.
Write it from an `ls` of that file, so the path in the run file is one
that exists:

```bash
ls "$HOME/.claude/projects/$(pwd -P | sed 's/[^A-Za-z0-9-]/-/g')/$CLAUDE_CODE_SESSION_ID.jsonl"
```

Every case the Plan step lists gets an entry, those it parks included: a
candidate the scope excludes, a duplicate, one that needs a real file,
data the test cannot create or an extension build is an entry in state
`parked`, never only a line of prose in the scenario list. `surveyFiles`
names every survey file the Plan step wrote, and every inventory id in
them (`S<k>.<n>`) appears in the `covers` of at least one entry, saved,
authored or parked: that is how the run file shows the whole app was
accounted for, and the evaluator's check 9 reads it.

## Case states

- `queued` — planned, not yet dispatched.
- `authoring` — a helper has it; `helper` and `dispatchedAt` are set at
  the dispatch.
- `waiting` — held for a recovery (a refresh, a back-off, a lower cap),
  then queued again from its checkpoint.
- `saved` — created in Test Studio, read back with `get_test_case` and
  named as its entry says.
- `authored` — only when the contract's submit mode does not submit: the
  helper reported `authored` and its payload is in `payloadFile`, not
  submitted.
- `parked` — not authored, with `parkedReason` from the fixed list
  (`policies.md`, _The parked reasons_) and its `evidence`.

`saved`, `authored` and `parked` are terminal. A run ends when every case
is one of them.

## The checkpoint and the gate budget

The main session writes the checkpoint from each helper report, the
moment it is recorded: `checkpoint.payloadFile` is the entry's
`payloadFile` when that file exists, and `checkpoint.lastGate` is the
report's `error` when the report is `failed`, else it keeps its value.
`lastError` is the same error.

The gate budget counts `deliver_steps` calls that reached the green gate.
A submission refused before the gate, at a compile or element step (an
`errorAt` such as `Generate Element Candidates (MCP)`), does not count. A
helper run spends up to 3 submissions by itself
(`agents/test-author-agent.md`, _Author_). Add to `submissions`, from each
report, its `attempts` less those its `error` or `notes` show were refused
before the gate; a report that does not say where an attempt stopped
counts it.

With the default budget of 3, a case a helper reports `failed` is not
re-dispatched: it is parked. With a budget above 3, it is re-dispatched
while budget is left, to a fresh helper with `lastAttempt` set from
`checkpoint.lastGate`, so it starts from the last gate error; the case may
pass the budget by the rest of that helper's own three, which the report
shows. When the budget is spent, the case is parked `gate budget spent`
with the last gate error, unless that error is infrastructure
(`DEADLINE_EXCEEDED`, a gate that produced no run output, a 5xx): then it
is parked `platform failure`.

## The watch

Helpers are dispatched in the background (`run_in_background: true`), so
their reports arrive as notifications; the watch is for what sends none,
and it is not optional. It is one foreground Bash call, `loop.mjs pause
--seconds 120`, then the reports that arrived meanwhile, then one tick, then
the next pause, until the last case is terminal. Never end the turn to
wait and never wait with a background `sleep`: a headless or scheduled
session exits when its turn ends with only a background shell command
running, and every case still in flight is left half done. It starts as soon as the
users are signed in at kickoff; until the first dispatch a tick does only
step 2, the heartbeat, so a long survey cannot outlast a keeper's idle
close. From the first dispatch each tick:

1. Reads `run.json`, and runs `loop.mjs tick --in run.json --load <the
   1-minute load from uptime> --cores <the CPU count> --failed-5xx <tenant
   5xx answers in a row>`. It answers which helpers are past their deadline
   (`redispatch` the first time, `park` with `platform failure` the
   second), the cap and any `capChange`, the 5xx `backoffMinutes`, the case
   keys to `dispatch` now, `budget` and `done`. Once the contract's run
   budget is reached (`runBudget`: cases dispatched, or minutes since
   kickoff), `dispatch` is empty and `budget.park` names every queued case
   with its reason, `policy exclusion: run budget (<which>)`: park each,
   and add the budget to `reportLines`. The steps below act on that answer;
   none of them decides a number again.
2. Keeps every session alive (`sign-in.md`, _Keeping sessions alive_).
3. Looks for a stall, by the table below, and recovers it.
4. Sets the cap. Load: `uptime`, and a load average above the number of
   CPU cores lowers the cap by 2, never below the contract's floor
   (`helperCapFloor`, 6 by default, never above the contract's cap); a
   load back under half the cores raises it again, up to the contract's
   cap. The load average counts the whole machine, not the run, so the
   floor keeps a busy machine from turning the run serial. Shared state: a
   case that changes what other cases see (an app-wide setting, a test
   user's own profile, `parallel-authoring.md`, _Dispatch_) is held back
   while any other case is still queued or waiting, so the rest run in
   parallel first; then it runs alone, after the others in flight have
   reported, with the cap at 1 while it runs. A case that only creates and removes its own rows is not shared
   state. Each change goes in `capChanges` with its time and why
   (`machine load`, or `shared state: <key>`).
5. Dispatches the keys the tick named (most steps first), each with an
   `Agent` call in the background, setting `helper` and `dispatchedAt`.

A helper's deadline is the contract's helper deadline (45 minutes by
default) from `dispatchedAt` with no report.

## Recovery

| Stall | Recovery |
|---|---|
| Expired session (401, a sign-in page, a helper's `needs_answer` that its sign-in did not load) | Refresh that user (`sign-in.md`), then re-dispatch the case from its checkpoint. |
| Tenant 5xx on any call | Back off 1, 2, 5 and 10 minutes, then every 10 minutes, with no cap (the tick's `backoffMinutes`); no new dispatch while it lasts. Cases in flight go to `waiting`. Resume dispatch when one call answers. |
| Helper idle past its deadline | Stop it, then re-dispatch the case once, to a new helper named `<name>-2`, with `lastAttempt` from its checkpoint. A second time parks it: `platform failure`, the stall as evidence. |
| A helper that could not be started | Send it once more as `<name>-2`; a second failure parks it `platform failure` (`policies.md`). |
| Machine load, or the app or browser quit | Lower the cap (_The watch_, step 4), then re-dispatch each case that lost its helper from its checkpoint. |
| Usage limit, a Claude restart or a plugin update | The run stops where it is. `/ua:app-test-create-loop resume` re-reads the run file (_Resume_). |
| A user's role lost (the role check fails mid-run) | Park that user's remaining cases `capability missing`; the rest continue. |

Each recovery is one entry in `stalls`. A re-dispatch sends the case's
`checkpoint.lastGate` as its `lastAttempt`, so the helper starts from the
last gate error (`agents/test-author-agent.md`, _Author_), and its
submissions count against the gate budget.

## Resume

`/ua:app-test-create-loop resume [<firing id>]`, in the same working
folder, asks nothing:

1. Find the run: the firing named, else the newest `run.json` under
   `tests/*/loops/` with a case not terminal.
2. Add this session to `sessions`, with its transcript path from `ls`.
   Prepare a new private folder for the helpers' browsers and rewrite each
   entry's `browserFolder`, `otherBrowserFolders` and `workFolder` for this
   session. An entry with no `module`, from a run started before modules,
   gets the app's name as its module.
3. Each `authoring` case goes to `waiting`: its helper belonged to the
   session that stopped.
4. Open each user's keeper again from their saved sign-in (`sign-in.md`,
   _A sign-in saved by an earlier run_). The windows the person signed in
   at kickoff did not survive the stop: a sign-in file that no longer
   loads parks that user's cases `capability missing`, and so does any
   session that expires later in the resumed run, since no one can sign
   it in again.
5. Start the watch and continue at Author.

Every change in these steps is one whole rewrite of `run.json`.
