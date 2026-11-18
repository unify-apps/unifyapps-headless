# The run contract

The run contract is the one place the person decides how an create loop
runs. It lives in the working folder at `tests/<app slug>/run-contract.md`,
is filled at kickoff, and is read again by every later run of the same
app, so the second run of an app asks nothing. The file is the table
below with a `Value` column added; the person may edit it between runs.

At kickoff each field is filled from its source, in order. A field that
stays empty takes its default. Only a field with no default and no source
is asked, in one AskUserQuestion call; in a session that has no
AskUserQuestion (a headless one), the same questions go in one plain
message, and the loop waits for the answer. Fields the folder already
answers are never asked again.

| Field | Source | Default |
|---|---|---|
| Tenant and solution | the folder's UnifyApps Headless link (`solution context`); never asked again when linked | none: an unlinked folder runs `/ua:setup` first |
| App platform link | the command's URL, or the folder link | none |
| App deployed link | `derive_matrix_url` on the platform link, or the command's URL when it is the deployed one | none |
| Test subject | the folder link, else the subject detection on `appUrl` (`app-test-author`, _Resolve the target_) | the detection's answer |
| Run mode | the folder | Sonic |
| Case source | the command, else the contract | none: asked at kickoff (a file path, `survey` to let the loop propose the cases, the `scenarios.md` a discover loop wrote (`app-test-discover-loop`), whose `(key)` after each title is the key field, or the link of the review sheet that loop shared, whose `Decision` and `Comments` columns the run obeys: approved rows are authored, changes-required rows are authored with their comments applied, rejected and undecided rows are parked) |
| Scope and priorities | the contract | every behaviour the survey saw (`app-test-author`'s coverage rule, `local-adaptations.md` Phase 1 step 4): each inventory id is a case, or a parked entry with its reason; P0 first, then P1, P2, P3. A value that names areas or a count narrows the cases and parks every other id `policy exclusion: outside the cap or the named areas` |
| Feature mapping and naming | the app's existing cases (`fetch_test_cases`): their modules, features, scenario groups and name pattern | match the existing cases; the module is the app's name, or for a test of the platform itself the product area the case exercises; a new case is named `<PREFIX>-nnn \| Title`, `PREFIX` taken from the existing cases, else from the app's short name in capitals, `nnn` the next free number |
| Test users per role | the contract; each role names an existing Test Studio test user, or permits creating one; for a test of the platform, a user to create also names its roles (`Builder`), asked at kickoff when none is named | the app's users with `testUser: true` from `list_test_users`, one per role, in the order the list gives them; a role left with none gets a new test user only when this field permits creating one |
| Device | the command, else the contract: a device in words ("an iPad mini in landscape", "a phone"), mapped to a type and model with `device.mjs list` (`app-test-author/references/devices-and-browsers.md`, _The run's device_) | the app's own, `get_app_run_viewport`'s `runDevice`; a value that fits two models, or none, is asked at kickoff |
| Browsers | the contract: one or more of `CHROMIUM`, `FIREFOX`, `WEBKIT` (Safari) | none set: each new case runs on Chromium alone; a value is set on each saved case (`devices-and-browsers.md`, _Browsers_), `CHROMIUM` alone on a case with an extension |
| Submit mode | the contract: submit each case, or author it and do not submit | submit each case as it is authored |
| Cleanup | the contract | each case deletes, in its own steps, the records it created; every record-creating field gets a random name |
| App contradicts scenario | the contract | park the case and continue |
| Model-output-dependent cases | the contract | attempt them with structural asserts only (an answer is present, non-empty, in the right place), never on the model's words |
| Provisioning | the contract | a scenario that names a provisioning recipe (`provision` in the discover firing's `scenarios.json`) is authored with the rulebook's provisioning pair, the record made and deleted through the app's own API (`app-test-author/references/local-rules.md`, _Provisioning is the one sanctioned JS setup_); a value of `none` parks every such scenario, `policy exclusion: provisioning off` |
| Fixtures and uploads | the contract: the real files the run may upload, each by path | a file Test Studio generates for a supported type; a real file only when listed; a case that needs a real file none is listed for is parked |
| Helper cap | the contract | 8 at once; lowered under load, never below 6 (the floor, written to the run file as `helperCapFloor`, and never above the cap); a case that changes what other cases see runs alone, after every other case (`stalls.md`, _The watch_) |
| Gate retry budget | the contract | 3 `deliver_steps` calls that reached the green gate, per case, across all its dispatches |
| Helper deadline | the contract, in minutes | 45: a helper with no report this long after its `dispatchedAt` is stalled (`stalls.md`, _Recovery_) |
| Suite and plan grouping | the contract | each saved case goes into its feature's suite, `<Module> · <Feature>`, and that suite into the app's plan, `<app name> · Regression`, both created when absent (`suites-and-plans.md`, _Where a new case belongs_); a value may name the suite or the plan to use instead, or say `no plan` |
| Run budget | the contract | 60 cases dispatched and 240 minutes from kickoff per firing; when either is reached the watch dispatches nothing more and parks every queued case `policy exclusion: run budget (<which>)`, named in the report's first lines; a later run takes them (its duplicate check parks the ones already saved) |

## A value that says part of a field

A value is merged with its field's default: the parts the value states
replace those parts of the default, and every part it leaves unstated
still holds. A cleanup value that says "each case deletes its own visits"
and says nothing of names keeps the default's random names; a helper cap
of 4 still lowers under load and still runs a shared-state case alone. A
part of the default is dropped only when the value says so in words
("fixed names are fine").

## A question first met mid-run

A question met after kickoff is never asked. When no contract field
decides it, its case is parked: with the policy's reason when a policy
answers it by parking (a class-name hook, an extension with no build,
data nothing can create), else `unanswered question`. Either way the
question goes on the report's _Would have asked_ list as a proposed
contract field with the default the loop would pick, so the person can
add it to the contract before the next run. A question a contract field
decides (fixtures, the app contradicting the scenario) is not listed.
