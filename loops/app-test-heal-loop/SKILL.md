---
name: app-test-heal-loop
description: Heals and re-authors the Test Studio test cases of a UnifyApps app whose last run failed, without a person in the loop — one helper per red case replays it live as its test users and names the root cause; a locator red gets its one element re-pointed, a test defect (timing, step shape, data isolation, a changed UI, a stale expectation) is re-authored from the case's saved description and re-delivered through the green gate, a case that replays green is re-run once, and every other red (an app bug, a backend error, the environment, an AI dependency, a product decision) is reported under its root cause with its next step. The main session applies a written policy in place of every confirmation, and a separate judge agent closes every firing. The person starts it by typing the slash command, alone, with a case name, with the firing id of an analyse-run that routed reds to it, or with `--retry` and an earlier heal firing; `setup` saves the test users' sign-ins the loop replays with.
---

# Heal loop — every red, unattended

You run `app-test-author`'s heal and update runs as a loop: no confirmation
before the browser opens, no approval of a locator diff or of re-authored
steps. In their place is the policy in `references/policy.md`, applied to
every case the same way, and a judge that is not you. Every red gets a live
replay and ends as a heal (one element's `locator` and `name` per failing
step, never more), an update (the whole case re-authored from its saved
description and re-delivered through the platform's green gate), or a root
cause from a fixed vocabulary with a person's next step. Nothing is
softened to reach green; nothing the policy refuses is written.

## Where it runs

In the main Claude session, by command:

- `/ua:app-test-heal-loop setup for <app URL>` — once per app: saves
  the sign-in of every test user the app's cases run as (_Setup_).
- `/ua:app-test-heal-loop for <app URL>` — every case whose newest
  execution failed.
- `/ua:app-test-heal-loop <case name> for <app URL>` — that case's
  last execution.
- `/ua:app-test-heal-loop --from <firing id> for <app URL>` — the reds
  an analyse-run firing recorded (its ledger rows).
- `/ua:app-test-heal-loop --retry <firing id> for <app URL>` — what an
  earlier heal firing left for later: its environment and budget skips go
  on again, except a red on a branch preview, its flow-change proposals and failed updates go on as update
  jobs with the diagnosis it recorded; with `--hooks`, once the app has shipped the hooks asked for, its `no stable hook` cases too.

Any of the last four may add `--firing <id>` to name the firing, and
`--max-cases <n>` to change the firing's budget: at most 60 cases are
taken on per firing by default, newest red first, and the rest are
`skipped: run budget`, for the next firing.

It drives browsers, so it runs where the `playwright` MCP and the
`app-testing` bridge run: the FDE's machine, signed in to the tenant
(`/ua:setup`). Helpers (`test-author-agent`) replay, diagnose and
re-author the cases, several at once, as the authoring run dispatches them.

## Read first

From `${CLAUDE_PLUGIN_ROOT}/`, whole files. Items 1 to 5 are seven
files; read them all in one batch of parallel Read calls before any other
call of a firing (_The firing_, step 1). A firing that skips one breaks a rule only that file states.

1. `loops/app-test-heal-loop/references/policy.md` — the unattended policy and
   its limits. It wins over anything below where they differ.
2. `skills/app-test-author/references/heal.md` — the heal procedure the helpers
   follow, the diagnosis and the update, and the invariants; and
   `skills/app-test-author/references/platform-tool-modes.md`, _A case's users_
   and _Update run_.
3. `skills/app-test-author/references/platform-tools.md` — the tools, the
   element write pipeline, the availability probe.
4. `skills/app-test-author/references/parallel-authoring.md` — the run file, the
   private folder, dispatch, reports and questions, the end of the run.
   The heal loop's run file carries `cases` where the authoring run has
   `scenarios` (_The firing_, step 3).
5. `loops/app-test-triage-loop/references/taxonomy.md` — the classes, the
   root-cause vocabulary and the verdict each root cause hands back.
6. `skills/app-test-author/references/local-adaptations.md`, `local-rules.md`
   and `durability.md` only when you author a locator yourself (a batch
   patch, _Batch_ in `heal.md`); the helpers read them on their own.

## Setup

Once per app, and again when a sign-in has expired. The loop owns a private
home for its saved sign-ins, outside every run's folder:

```bash
node "${CLAUDE_PLUGIN_ROOT}/loops/app-test-heal-loop/scripts/loop-home.mjs" sign-in <tenant host> <interfaceId> <user id>
```

It prints `{ userId, signInFile, exists }`. A missing file is created
empty (`{}`) and 0600 on purpose, since a browser's `state-save` would
create it readable by others; `exists` is true only when the file holds a
saved browser state with cookies.

The steps of a `setup` firing are in [references/setup.md](references/setup.md);
read it whole before the first call of one. Every sign-in it saves has
passed `app-test-create-loop/references/sign-in.md`'s _Only test users_.

## The firing

Every firing has an id: `--firing <id>` when given, else the one
`loop.mjs firing-id` prints (local time, `YYYYMMDD-HHmm-xxxx`), and a
folder `<working folder>/tests/<app slug>/loops/<firing id>/` (`<firing>`
below). The app's ledger `<working folder>/tests/<app slug>/loop-ledger.json`
is shared with the analyse-run loop. The script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/loop.mjs" <command> …
```

**Ledger rows.** Every row this firing writes (each case row, the
`firing:<id>` row, the `judge:<id>` row) carries `loop: "heal-loop"` and
`firingId`. Write each to a JSON file in `<firing>/rows/` and upsert it
with `loop.mjs ledger upsert --file <ledger> --row @<file>`, never as a
quoted argument: a locator's quotes break the shell. Rows are keyed by
loop, firing and execution id, so a later firing keeps a row of its own.

**Progress.** At the end of each numbered step below, say one line to the
person in chat: the step that finished and its counts (`Intake: 41 cases
taken (30 heal, 11 diagnose), 2 skipped (1 run budget, 1 infra)`), and at
step 5 one line per case as its row is decided. A statement, never a question.

1. **Read, probe and resolve.** Read the seven files of _Read first_ in
   one batch of parallel Read calls, before any other call. Then load the
   `app-testing` tools with one ToolSearch and run the availability probe
   (`platform-tools.md`). Resolve the app and its subject as
   `app-test-author`'s _Resolve the target_ does. The subject names the
   dialect (a code app `code`, a builder app `builder`, the platform
   `platform`): the dialect file and the `--dialect` of `loop.mjs rung`.
   Every case replays as its own device. Without `deliver_steps` in the
   probe, every case a diagnosis routes to an update is `skipped` with its
   root cause and the reason `deliver_steps not served; update by hand`.
2. **The reds.** Each entry ends in `loop.mjs intake` with `--max-cases`
   (the command's value, else 60), which answers `{ take, skipped,
   sharedCause }`. Each `take` entry carries its `job`: `heal` for a
   `locator` or `wrong_element` red, `heal` with `needsLiveCheck` for an
   `assertion` red, `diagnose` for every other class but `infra` and
   `auth`, which are skipped with their root cause (`not replayed`,
   `environment`); a red past the budget is in `skipped` with the reason
   `run budget`, a red only off Chromium `browser specific`, a red that
   ran on a branch preview `branch preview` (`platform-tools.md`, _Running
   on another domain_) unless an environment event or the run service stopped it. Every
   `skipped` entry becomes a `skipped` case row with the reason and root
   cause intake gave, and is left untouched. Under a shared cause — the
   analyse-run firing's on `--from`, or this firing's own `classify` —
   `take` is empty: no replay runs on an environment event, and the
   report says so.
   - `--from <firing id>`: `loop.mjs intake --ledger <ledger> --firing <that id>`.
     It reads that analyse-run firing's rows, its `firing:<id>` row and
     shared cause included.
   - `--retry <firing id>`: `loop.mjs intake --ledger <ledger> --firing
     <that heal firing> --retry`. Its `take` entries carry the job the
     earlier firing left them with, and an update job carries its
     `diagnosis` (root cause, finding, fix); nothing is diagnosed twice;
     a row on a branch preview stays `skipped`. `--hooks` passes on.
   - No case named: `fetch_failed_executions` (`url`, `limit` 100), saved
     to `<firing>/failed.json`; `loop.mjs newest --in <firing>/failed.json`
     gives the newest execution per case; `fetch_execution_failure_reasons`
     (`url`, `ids`: those execution ids, one call), saved verbatim to
     `<firing>/evidence.json`; `loop.mjs classify --in <firing>/evidence.json
     --out <firing>/classified.json`; `loop.mjs intake --in
     <firing>/classified.json`.
   - A case named: `fetch_test_cases` (`url`, `name`: the case's name),
     keep the rows whose name equals it exactly. More than one match is not asked of anyone: the firing takes on
     no case, its firing row says `status: "skipped"`, `reason: "needs
     choice — <each match's name and id>"`, and the report lists it under
     Needs choice. One match: `fetch_test_case_last_execution` (`url`,
     `testCaseId`). When that run was on a branch preview, use instead the
     newest execution on the deployed app from `fetch_test_case_executions`
     (`url`, `testCaseId`), whose rows carry `DOMAIN`. The run used did not
     fail or time out, or there is none: the firing ends with "nothing to
     heal" (the firing row's `reason`); otherwise
     `fetch_execution_failure_reasons` (`url`, `ids`: [that execution id])
     saved to `<firing>/evidence.json`, then `classify` and `intake`.
3. **Users and the run file.** For each case that goes on, `get_test_case`
   (`url`, `id`) gives its users, its `runViewport` and `runDevice`, its step count, its
   first navigate (the `startingUrl`), its saved `description` (the
   intent an update re-authors from; a case with none re-authors from its
   stored steps' checks) and the names an update keeps (`name`, its
   module, feature and scenario groups when the read gives them). `list_test_users`
   (`url`, `interfaceId`) once. Every user id needs `loop-home.mjs sign-in`
   to print `exists: true`, `list_test_users` to list it, and its saved
   sign-in to pass `sign-in.md`'s _Only test users_ in one browser before
   the first dispatch; otherwise each
   of that user's cases is `skipped: no saved sign-in for <username>; run
   setup` (or `<user id> is no longer a test user`), root cause `not
   replayed`. No case is replayed as anyone but a test user. Then `private-folder.mjs prepare <sessionId>` for the
   helpers' browser profiles, and write the run file,
   `<working folder>/.sessions/<sessionId>/test-author/run.json`:

   ```json
   { "pluginRoot": "<absolute path>", "platformHost": "https://<platform-host>",
     "platformScreenUrl": "<url>", "appUrl": "<the app under test>",
     "subject": "builder app | code app | platform", "interfaceId": "<id>",
     "viewport": null, "submit": true,
     "users": [ { "id": "<user id>", "username": "<username>", "signInFile": "<the loop's signInFile>" } ],
     "cases": [
       { "key": "<case id>", "caseId": "<case id>", "name": "<case name>",
         "job": "heal | diagnose | update",
         "executionId": "<the red's execution id>", "stepCount": 12,
         "failingStep": { "position": 7, "title": "<step title>", "error": "<error text>" },
         "class": "locator | wrong_element | assertion | step_shape | data | navigation | unknown",
         "needsLiveCheck": false, "checksPassedBefore": false, "historyTag": "<tag, when known>",
         "description": "<the saved description, word for word, or null>",
         "module": "<its module, or null>", "feature": "<its feature group, or null>", "scenarioGroup": "<its scenario group, or its name>",
         "diagnosis": { "rootCause": "<vocabulary word>", "finding": "<what the replay found>", "fix": "<what has to change>" },
         "runViewport": { "width": 1440, "height": 834 }, "runDevice": { "type": "desktop", "variant": "laptop1440x834" },
         "startingUrl": "<the case's first navigate>",
         "dialectFile": "<pluginRoot>/skills/app-test-author/references/<dialect file>",
         "userIds": ["<the case's users, in order>"],
         "browserFolder": "<folder>/browser-<key>", "otherBrowserFolders": {}, "browserConfig": "<firing>/devices/<key>.json",
         "workFolder": "<working folder>/.sessions/<sessionId>/test-author/work/<key>",
         "patchFile": "<firing>/patches/<key>.json", "payloadFile": "<firing>/payloads/<key>.json" } ] }
   ```

   `users` has the shape of `parallel-authoring.md`'s run file. `viewport`
   is `null`: a case's `browserConfig` is the `configFile` that
   `device.mjs config <firing>/devices/<key>.source.json <firing>/devices/<key>.json`
   prints, the source holding its `runViewport` and `runDevice`. There is no
   `scenarios`, `source` or `ledger`. `submit` is `true` when the probe
   listed `deliver_steps`, and it governs update jobs only: a heal or
   diagnose job never writes to Test Studio. `diagnosis` is present only
   on an update job: the root cause, finding and fix the diagnosis (this
   firing's, or the earlier one's on `--retry`) recorded. `key` is the case
   id, so a patch file, a payload file and the case row meet in `check-heal`.
4. **Dispatch.** One helper per case, `Agent(subagent_type:
   "ua:test-author-agent", name: "<job>-<key>", prompt: "Run file:
   <path>\nJob: <job> case <key>")`, in the background, at most 10 at once,
   the cases with the most steps first (`stepCount`). Wait for the
   reports: each one arrives as a task notification, which keeps even a
   headless session alive while helpers run. Never call ListAgents in a
   loop and never ScheduleWakeup; start the next case when a helper
   reports. Each report is one JSON object (the agent file, _Finish_):
   - `needs_answer` (two or more candidates, or another choice) is not
     asked of a person: the row is `skipped`, reason `needs choice —
     <question>`, root cause `needs choice`, with the candidates
     (`options`) in the row. Then `SendMessage` "close" to that helper.
   - `skipped` with `signInFailed: <user id>`: every case of that user is
     `skipped: sign-in expired for <username>; run setup`, root cause `not
     replayed`; a case of that user not yet dispatched is not dispatched.
   - `skipped` with `flowChange` (a heal that goes green only with more
     than one element's locator and name): not a heal, and not a dead end.
     Rewrite the run file whole with the entry's `job` set to `update` and
     its `diagnosis` filled from the report (`rootCause`, else `test
     design`; `finding`; `fix` from `flowChange`), and dispatch
     `update case <key>` like any other case, after the helper has closed.
     Without `deliver_steps`, the row is `skipped` with that root cause
     and the diff kept in `flowChange`.
   - `diagnosed`: step 5, _Per diagnosis_.
   - Any other `skipped`: the row is `skipped` with the helper's `class`,
     `reason` and `rootCause` (`extension panel`, `not replayed`).
     `failed`: the row is `failed` with its `reason` and root cause.
   - `healed`: step 5, _Per heal_. `updated`: step 5, _Per update_.

   **A shared event during the firing.** When three reports name the same
   `environment` event (an AI cost or rate limit, the tenant down, a
   service refusing every call), stop dispatching, let the running helpers
   finish and record their reports, and give every case not yet dispatched
   a `skipped` row with root cause `environment`, reason `<the event>;
   retry with --retry <this firing>`. The firing row carries `sharedEvent`.
5. **The policy, per report.** In this order; the first sub-step that
   fails decides the row, and nothing after it runs.

   **Per heal** (`healed`):
   1. `loop.mjs check-patch --in <patchFile>`. Problems → the row is
      `failed` with the problems as reason, root cause `test design`;
      nothing is written.
   2. **Drift guard**, per patch step: `get_element` (`url`, `id`: the
      step's `elementId`). A `locator` other than the step's `oldLocator`
      means someone changed it meanwhile → `skipped: element changed
      during the firing`, root cause `not replayed`.
   3. **Rung**, per step, with the dialect of step 1. The drift guard just
      confirmed that `oldLocator` is the stored locator, so read both from
      the file and keep their quotes out of the shell:

      ```bash
      node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/loop.mjs" rung --dialect <dialect> \
        --old "$(jq -r '.steps[<i>].oldLocator' <patchFile>)" --new "$(jq -r '.steps[<i>].locator' <patchFile>)"
      ```

      Add `--scenario-named` when the step title names the element by its
      visible label (the builder dialect's carve-out), and
      `--old-rung-gone` when the step says `"oldRungGone": true`. `ok` →
      go on. `lower` or `banned` → the case is `proposed` with the
      verdict's `reason`, the diff and root cause `no stable hook`; never
      written. It is a hook request: the report lists it as one.
   4. **Write**, per step: `update_element` (`url`, `id`,
      `expectedVersion`: the element's `version` from your `get_element`
      read, `set`: the new `locator`, plus `name` when it differs from
      `oldName`). "Version changed" means someone edited the element after
      your read: the row is `failed` with that reason, never written over. An inline
      step (`"inline": true`) is written with `update_test_case` as
      `heal.md` step 8 says.
   5. **Read back**, after every write: `get_element` (`url`, `id`). The
      stored `locator` and `name` must be the ones sent. Record the write
      in the row's `writes`. A read-back that differs → roll back (7) and
      the row is `failed`.
   6. **Platform proof:** `run_test_cases` (`url`, `ids`: [case id]), then
      poll `fetch_test_case_last_execution` as `app-test-triage-loop`'s
      _Polling a run_ says: `loop.mjs pause --seconds 20` in the
      foreground between polls, at most 40, never ending the turn while a
      proof run is open. `PASSED` → the row is `healed`, `platformRunId` that
      execution's id.
   7. **Roll back** on anything else, a stuck run included: `update_element`
      with the stored locator and name and the `version` the step 5
      read-back showed, `get_element` to confirm them, and
      the row is `rolled_back` with the run's error (a stuck run: `platform
      run did not settle`, its execution id). Never retried in this firing.

   A case with several healed steps passes 1 to 3 for every step before
   any write, then has one proof run. A batch patch (several cases, one
   element id) is one write, then one platform run per case; a red among
   them rolls the element back for all and reports each case.

   **Per diagnosis** (`diagnosed`, with `rootCause`, `finding`, `fix`,
   `aiDependent`, `checksPassedBefore`, `event`). The root cause must be
   a word of the vocabulary (`taxonomy.md`, _Root causes_); any other word
   makes the row `failed`, reason `root cause not in the vocabulary`. Then
   by its route:
   - **`update`** (`test design`, `data isolation`, `ui changed`, `stale
     expectation`; and `ai dependency` only when the report's `fix` names
     an app-controlled fact that carries the same stated outcome): with
     `deliver_steps` served, rewrite the run file whole with the entry's
     `job` set to `update` and its `diagnosis` filled from the report, and
     dispatch `update case <key>` after the helper has closed. The row is
     written only when the update job reports. Without `deliver_steps`:
     `skipped` with the root cause, finding and fix.
   - **`rerun`** (`transient`: the whole case replayed green unchanged and
     no step depends on a model): `run_test_cases` (`url`, `ids`: [case
     id]) once and poll as a proof run. `PASSED` → the row is `flaky`,
     `rerun: { executionId, result: "PASSED" }`. Anything else → `skipped`,
     root cause `transient`, the second execution id and its error in
     `rerun`. At most 10 re-runs per firing; past that `skipped`, reason
     `transient; not re-run: cap`.
   - **`ai`** (`ai dependency` with no fix) → `skipped`, root cause `ai
     dependency`, `aiDependent: true`, the finding in `finding`.
   - **`bug`** (`app bug`, `backend`), **`person`** (`contradicts
     description`, `feature missing`, `extension panel`), **`hook`** (`no
     stable hook`, with the locator found in `hook`) → `skipped` with the
     root cause and the finding, and nothing written.
   - **`retry`** (`environment`, with the `event`) → `skipped` with the
     root cause, reason `<event>; retry with --retry <this firing>`; it
     counts toward the shared event of step 4.

   **Per update** (`updated`, from an update job):
   1. The report carries `attempts` (1 to 3), `steps` (the re-delivered
      step count), `testCaseId` equal to the entry's `caseId`, and
      `greenGate: "passed"`. Anything else → the row is `failed` with the
      report's `error`, the diagnosis kept.
   2. **Read back**: `get_test_case` (`url`, `id`). Its stored steps count
      equals the report's `steps`, its `name`, `description` and users are
      the entry's (an update changes none of them). A read-back that
      differs → the row is `failed`, reason `read-back differs: <what>`;
      the platform keeps the case's earlier version, so nothing is rolled
      back by hand.
   3. The row is `updated`, with `rootCause`, `finding`, `fix`, and
      `update: { attempts, stepsBefore: <the entry's stepCount>,
      stepsAfter, greenGate: "passed", readBack: true, testCaseId }`. The
      green gate ran on the platform's own runner, so no second proof run
      is made.
   An update job's `needs_answer` (a stated check the app no longer
   satisfies, a feature that is gone, an element with no legal hook, a
   form rejected twice) is never asked of a person: the row is `skipped`
   with the question as `finding` and the root cause the helper names
   (`contradicts description`, `feature missing`, `no stable hook`), and
   the helper is told to close. An update job's `failed` after three
   deliveries → `failed`, the last gate error as reason, `job: "update"`
   on the row so `--retry` sends it again; red only because the model produced nothing → `skipped`, `ai dependency`.
6. **Rows.** One row per case, written as _Ledger rows_ says: `loop`,
   `firingId`, `executionId`, `testCaseId`, `name`, `job`, `status`
   (`healed`, `updated`, `flaky`, `rolled_back`, `skipped`, `proposed`,
   `failed`), `reason`, `rootCause` (every status but `healed` and
   `rolled_back`), `domain` (intake's, when it gave one), `finding`, `fix`, `aiDependent`, `checksPassedBefore`,
   `failingStep` (position and title), `patch` (`elementId`,
   `stepPosition`, `oldLocator`, `newLocator`, `oldName`, `newName`: the
   first healed step, and `patches` with every step when there are more),
   `candidates`, `replay`, `rung` (the `loop.mjs rung` answer), `writes`
   (each write: `elementId`, `before`: the locator the drift guard read,
   `set`, `readBack`; a rollback is a write too), `platformRunId`,
   `rerun`, `update`, `hook`, `options`, `flowChange`, `planted`, `cause`
   (the defect in plain words, step 7), `confidence`
   (`lower` when no later assertion depends on a healed step, else
   `normal`, from the helper's report). `oldLocator` is always the stored
   locator the drift guard read, the one the write replaced, never the
   case's locator from before it broke. One row for the firing:
   `executionId: "firing:<id>"`, `counts` with all seven statuses (0
   included), `intake` (`taken`, `heal`, `diagnose`, `update`, `skipped`),
   `sharedCause` from intake, `sharedEvent` when step 4 recorded one,
   `retryOf` on a `--retry` firing, and `reason` when the firing took on
   no case.
7. **Causes and report.** `loop.mjs causes --ledger <ledger> --firing
   <id>` lists every row whose root cause names a defect (`app bug`,
   `backend`, `ui changed`, `feature missing`, `contradicts description`)
   with its finding. Write `<firing>/causes.json` as `{ "<executionId>":
   "<cause>" }` under `policy.md`, _Naming a cause_ (the defect in plain
   words; one wording for every row the same defect explains); then
   `loop.mjs causes --ledger <ledger> --firing <id> --in
   <firing>/causes.json` writes `cause` onto the rows. It and `check-heal`
   refuse code, a step, an error, a case or ticket name, the family's own
   word, or a row left unnamed. Then, for each element written, the cases
   outside the firing that reference it (`fetch_test_cases`, then
   `get_test_case` of each other case, once per firing), written to
   `<firing>/shared.json` as `{ "<element id>": ["<case name> (<case
   id>)", …] }`. Then `loop.mjs heal-report --ledger <ledger> --firing
   <id> --app "<app name>" --shared <firing>/shared.json --out
   <firing>/heal-report.md`, never `report.md`, which an analyse-run that
   chained this firing has already written there. Its first line names
   the firing, the app and the counts per status. It opens with **Still
   failing, by root cause**: every case the firing did not make green,
   headed `<family> — <cause>` (`App bug — the row-actions click opens
   the skill editor`, `Test design — timing, waits or step shape`), the
   largest group first, each with its next step and each case with its
   finding; then Healed, Updated, Flaky, Skipped, Needs choice, Rolled
   back, Proposed, Hook requests, Product checks and Elements written,
   each always present and `none` when empty. Nothing in it is typed by
   hand.
8. **Judge.** First run `loop.mjs check-heal --ledger <ledger> --firing
   <id> --patches <firing>/patches`. Before the judge row exists its one
   expected problem is `no judge:<id> row`; fix every other problem it
   names first. Then one fresh agent (`Agent(subagent_type:
   "general-purpose")`) gets the exit condition below, verbatim, the
   check-heal output, and the paths of the run file, the patches and
   payloads folders, the ledger and the report. Record its answer as the
   `judge:<id>` row (`verdict`: `met` or `not met`, and the open clauses).
   `not met` → fix what it names, run check-heal again and judge again
   with a fresh agent, at most two more rounds; then the report names the
   open clause. After the last judge row, check-heal must answer `ok:
   true`. A firing that took on no case and skipped none (nothing to heal,
   needs choice) ends with its firing row and report, without a judge.

   > Exit condition: `loop.mjs check-heal` reports no problem but the
   > missing judge row; the loop ledger is the record, and a row file in
   > the firing folder that differs from its ledger row does not count;
   > every red the intake answered has exactly one case row with a terminal
   > status; every `healed` row names one element id,
   > the stored locator the write replaced and a different new one, exactly
   > one candidate, an `ok` rung verdict, a green full replay by the helper,
   > a write whose `before` equals its old locator and whose read-back
   > equals what was sent, and a `PASSED` platform run id; every write of a
   > heal sets only `locator` and `name`, or one inline `selector`; every
   > `updated` row names a passed green gate from a `deliver_steps` call
   > that carried the case's own id, name, description and users, a
   > read-back of the stored steps, and the root cause and fix it answered;
   > every `flaky` row names a passed re-run; every `rolled_back` row holds
   > a rollback write confirmed by its read-back; no `proposed` row was
   > written; every skipped, proposed, failed, updated and flaky row
   > carries a root cause from the vocabulary, every row whose root cause
   > names a defect a `cause` in plain words, and every skipped, proposed,
   > failed and rolled-back row its reason; `confidence` is `lower` or
   > `normal`; under a shared cause no case was taken on; after a shared
   > event no case was dispatched; the report groups the still-failing
   > cases by cause in plain words with a next step each and says, for each written
   > element, which other cases use it and were not replayed.
9. **End of the run.** Close every helper browser (a helper that reported
   `needs_answer` closes on "close"), `private-folder.mjs remove
   <sessionId>`, and delete `.sessions/<sessionId>/test-author/`; the
   loop's own home, with the saved sign-ins, stays. Then hand the diagnoses back: `loop.mjs
   heal-tags --ledger <ledger> --firing <id> --out <firing>/heal-tags.json`
   writes every outcome as a verdict with its evidence and its cause; a firing chained
   from an analyse-run (`--from`) runs `loop.mjs annotate --in <that
   firing>/classified.json --tags <firing>/heal-tags.json --out <that
   firing>/classified.json`, so the analyse report it re-renders and the
   ticket loop see the app bugs, the AI dependencies and the flaky
   cases the replays found; a standalone firing keeps the tags file for a
   later analyse-run. End with the last message (below). Blocked is each
   still-failing group that waits on someone, largest first, at most three
   (`Blocked: <cause> — <n> cases; <next step>`). Done is `<n> healed ·
   <n> updated · <n> still red, of <n>`. Then the heal report's path.

   **The last message is short.** It says one thing: where the run is
   blocked, or, when nothing blocks it, what is done. Blocked: one line per
   block, `Blocked: <where> — <what the person does next>`. Not blocked: one
   line of what is done, with its counts. Then the report's path and the next
   command, when there is one. Nothing else: never the report pasted or
   quoted, a table, a list of cases or a repeat of a progress line; the files
   hold the rest.

## The helper's jobs

`test-author-agent` runs three jobs (its agent file, _Heal, diagnose and
update_). `heal case <key>`: open the case's users' browsers from the
saved sign-ins, replay to the failing step, find the one candidate, patch
the one element in its own copy of the steps, replay the whole case, run
`check-patch` and report; a red the live check shows is not a locator
failure goes on into a diagnosis. `diagnose case <key>`: replay to the
red, read the app against the step and the description, and name the root
cause from the vocabulary with the finding and the fix. `update case
<key>`: re-author the whole case from its saved description and the
diagnosis, every stated check kept, and re-deliver it through
`deliver_steps` with the case's own id; the green gate is the proof. Heal
and diagnose jobs never call a write tool: the main session alone writes,
after the policy. The update job's one write is its re-delivery.

## Limits

- The writes of this loop are `update_element` (and `update_test_case`
  only for a sanctioned inline `selector`, `heal.md` step 8),
  `run_test_cases` for a proof or a re-run, and `deliver_steps` carrying an
  existing case's id for an update; never a new case, suite, plan or test-user write.
- Never open Test Studio in a browser; the browser is for the app under
  test only (`app-test-author`'s rule).
- A heal changes one element's `locator` and `name` per failing step;
  anything more is an update job, proven by the green gate, with name,
  description and users unchanged and no stated check weakened.
- No person is asked anything during a firing. An ambiguous case name, two
  or more candidates, a check the app no longer satisfies or any other
  choice becomes a `skipped` row with its root cause and the question.
- The judge is a separate agent every time; never answer the exit
  condition for yourself.

## Self-review

Before the closing summary, the loop orchestrator's shared self-review rules (its self-review reference): `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" signals finish --run <firing folder> --json`, `<firing folder>/self-review.md` (what in this loop's text, scripts or tools made the run slower or wrong, from the run's files), each record it says is due named in the summary with an offer of `/ua:give-feedback` (nothing is sent unless the person runs it), and the summary's last line, `Loop review: …`. The same command's `signals add` records a signal during the run.
