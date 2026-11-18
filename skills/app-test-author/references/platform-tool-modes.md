# Platform-tool modes — test users, update, auto-heal, heal, reconcile

## Contents
- A case's users
- A case's network rules
- Test-user run
- Update run
- Auto-heal run
- Heal run — failed executions
- Reconcile run
- Suite and plan management

The six modes below call the app-testing MCP; the endpoint, session cookie,
tool contracts and the element write pipeline are in `platform-tools.md`,
read before the first call of a session. Read tools fire whenever a mode
needs them. **Every write** (`create_or_update_test_user`,
`update_test_case`, `delete_test_cases`, `create_element` /
`create_elements`, `update_element`, `delete_elements`, `create_test_suite`,
`update_test_suite`, `delete_test_suites`, `create_test_plan`,
`update_test_plan`, `delete_test_plans`) **fires only on the user's explicit
request or per-item confirmation, never as a side effect**, with exactly
one exception: the sign-in flow's automatic
`create_or_update_test_user` when `list_test_users` shows the app has no test
user at all. Element writes that persist the elements of a step write-back
the user already approved count as part of that approved write. Each mode
takes the app's **platform screen URL** (from the run header in
`scenarios.md`, or resolved per `platform-tools.md`).

**Test Studio is never operated through the browser.** Existing cases and
elements are read with `get_test_case`, `get_element` and `search_elements`
and changed only with the write tools; every write is verified by an MCP
re-read. The browser opens the app under test only.

## A case's users

A case runs as its users (`get_test_case`), the first the default. The
update, auto-heal and heal runs walk or replay a case as those
users, each step in its own user's browser (`multi-user.md`), and as the
case's device, its `runViewport` and `runDevice` (`get_test_case`): before
replaying a case, make each of its browsers that device
([devices-and-browsers.md](devices-and-browsers.md), _An existing case_),
since the app picks its layout from the size and user agent once per page
load. Another user's browser takes a device only when it opens: open it
with `--config=<file>` from `device.mjs config`, and when a later case runs
as another device, `close` it, open it again with that case's file and
`state-load <signInFile>`. Sign each user in once per run, however many
cases share them:

1. **Who they are.** `list_test_users` gives each id's name and username.
   An id it does not list is no longer one of the app's test users, and no
   one can sign in as it: report the case and leave it untouched. A case of
   the platform itself reads the platform's listing (SKILL.md, _Test users
   of the platform_).
2. **The first user** signs in to the MCP browser through SKILL.md's
   sign-in flow, picking that test user.
3. **Each other user**, only for a case with two or more: run
   `node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/private-folder.mjs" prepare <sessionId>`
   once per run, then steps 2 to 4 of _Another test user_ in
   `parallel-authoring.md`, which sign the user in, in a visible browser,
   `<folder>/login-<user id>`, and check the account. Add the case's
   `--config=<file>` to that `open`: you walk in this browser. Save the session with
   `state-save <signInFile>` so a lapse can be reloaded, and keep that
   browser open: it is the one you walk that user in.
4. **Drive another user's browser** with the wrapper's commands, as a
   helper does: `find` or `snapshot <ref>` where the MCP browser takes
   `browser_find` or a scoped `browser_snapshot`, `eval` for
   `browser_evaluate`, `tab-list` / `tab-select` for `browser_tabs`,
   `dialog-dismiss` for `browser_handle_dialog`, and `click`, `fill`,
   `press`, `reload`, `go-back` and `goto`. A session that lapses is reloaded with
   `state-load <signInFile>`, or signed in again from step 3.
5. **At the end of the run**, `close` every such browser and run
   `node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/private-folder.mjs" remove <sessionId>`:
   every sign-in file and profile in it holds a test user's session.

## A case's network rules

A case whose `get_test_case` holds `properties.networkRules`, or a
`go_offline` or `go_online` step, runs with them, so the update, auto-heal,
reconcile and heal runs walk or replay it with them too: read
`network-rules.md` first, and before each browser's first page loads put
every saved rule that is on in place (_Walking a rule_) and route the
sockets of each user who goes offline (_Walking offline_). A replay without
them shows the app as the run never sees it, so its red is not the case's
red and a locator found there may be the wrong one.

## Test-user run

The user asks to create or update a test user (the identity Test Studio can
run a test as).

1. `list_test_users` first and show what exists. If a suitable test user is
   already there, creating another needs the user to say so.
2. To promote an existing account: `list_test_users` with
   `testUsersOnly=false`, find it, confirm the match, then
   `create_or_update_test_user` with its `id` plus the identity fields the
   listing returned.
3. To create: use the identity fields the user supplied, or generate them
   exactly as the sign-in flow does when the user leaves them to you.
   Generated credentials are shown in chat only; credentials never go into
   any file.
4. Report the result. If the user wants the next walk under that identity,
   sign the browser in through the same flow: fill the credentials of a user
   this run created, or pre-fill the username of an existing one and let the
   user type the password.

For the platform itself a create also takes the user's roles (SKILL.md,
_Test users of the platform_); the tool refuses a platform user without
one.

## Update run

The user names an existing test case and the change they want.

1. `fetch_test_cases` with the case's name as `name`; match the named case. If the match is ambiguous,
   confirm name + id with the user before touching anything.
2. Read what the case does today with `get_test_case`: its stored steps,
   which reference their elements by element id, and its users.
   Resolve the ids the change touches with `get_element` to see their
   locators.
3. Re-walk ONLY the affected flow live, signed in as the case's users
   (_A case's users_). Walk discipline and all pre-flight checks apply in
   full; the current steps are
   context, never a memory source.
4. Author the updated steps preserving every verification the user did not
   ask to change, and show a short diff (changed vs. preserved). A stored
   step's `user` stays exactly as it is, and a new or re-authored step
   carries the `user` of the person who performs it (`multi-user.md`). A
   change that needs a person the case does not have is reported, not
   authored.
5. On the go-ahead, write back one of two ways. **Re-delivery** (the
   default, and the only way the heal loop's unattended update job uses):
   one `deliver_steps` call carrying the case's `testCaseId` with its own
   `name`, `module`, `feature`, `scenario`, `description` and `userIds` word for word
   and the re-authored `steps` (`submission-contract.md`); the platform
   resolves the elements, runs the green gate live and saves the steps only
   on green, so nothing unproven replaces the stored case. **Field write**,
   when only one step changes and no re-run is wanted: run new or changed
   locators through the element write pipeline (`platform-tools.md`) so the
   stored steps reference persisted element ids, never inline locator
   objects, then **one `update_test_case` call** (`set` / `unset` field
   operations; the platform writes a new version).
6. Verify by re-reading with `get_test_case` and confirming the stored steps
   are the ones you sent. Confirm before reporting success.

## Auto-heal run

The user asks to heal or fix some or all existing test cases.

1. `fetch_test_cases`, with `name` when the user names one case, resolves each name → `id` and returns the case's saved
   `description`, the approved scenario text the submission stored with it.
   That description is the **intent source**: what the test must provision,
   do and verify. A case with no saved `description` (created before the
   parameter existed) falls back to its current steps as the intent source.
2. For each case, `get_test_case` returns the implemented steps and the
   case's users, and `get_element` on each referenced id
   returns its stored locator.
3. **Survey the app again**: re-walk the flow live per the description,
   signed in as the case's users (_A case's users_), exactly as an
   authoring run would (own records, readiness pairs, all pre-flight
   checks), and validate two things against what the walk shows.
   - **(a) The steps against the description.** Every divergence is a
     defect to fix: a verification the description states but the steps
     skip or check differently, a step that acts on or asserts something the
     description never says, provisioning that does not match what the
     description creates.
   - **(b) Every referenced element's locator against the live app.** Check
     on the live DOM (`browser_find` / `browser_evaluate` on the app under
     test) that each stored locator still resolves to the node the step
     means. The stored steps and locators are a checklist, never a
     substitute for observing.
4. Fix case by case. A **stale locator on an intact flow** → `update_element`
   with the corrected locator, re-derived per the dialect's durability
   ladder; every step and case referencing that element id heals at once, so
   the new locator must target the same intended node, never a different one
   that happens to pass. **Changed behaviour, flow or description
   divergence** → re-author the affected steps to match the description and
   write back via `update_test_case` (element write pipeline for any new
   locators).
5. Keep the case's name and every description-stated verification. **Never
   weaken an assertion to make it pass**; a verification the live app no
   longer satisfies is a finding to report, not something to heal away.
6. All writes on the user's go-ahead; verify each with `get_element` /
   `get_test_case` re-reads.

## Heal run — failed executions

The person asks to heal or fix *failing* tests, fix broken locators, or asks
why a test fails and to fix it. The trigger is a failed execution.

1. Read `heal.md` at the start of the run and follow it end to end.
2. A heal repairs only locator failures: one failing step's element
   `locator` / `name`. It never changes an action, value, assertion or step,
   and it reports every other kind of failure untouched.
3. A request to check cases against their saved descriptions, whatever
   their last run said, is the auto-heal run above.

## Reconcile run

The user asks which test cases to add, update or remove after the app
changed.

1. `fetch_test_cases` with a `limit` that covers the whole suite, then run
   Phase 1's survey exactly as an authoring run.
2. Produce a diff in `<run-folder>/scenarios.md` and the report where
   **every entry is explicitly labelled with its operation**:
   - **ADD**: observed behaviour no case covers, written as normal taxonomy
     entries. The coverage check of Phase 1 step 4 runs here with the
     existing cases counted as covering: every inventory id ends in an ADD,
     in an existing case (`covered by existing case <name>`) or in a
     not-covered row, and the `## Coverage` table adds up.
   - **UPDATE**: an existing case whose behaviour still exists but changed;
     cite the case's name + id, its saved `description`, and the survey
     evidence of what changed and how the case must follow.
   - **DELETE**: its surface or behaviour is gone; cite the survey evidence.
     "The survey didn't reach it" is NOT deletion evidence.
   - **still valid** for the untouched rest.
3. **STOP for approval.**
4. Approved ADDs go through the normal author → submit pipeline. Approved
   UPDATEs go through the update run's path, one case at a time: live
   re-walk of the affected flow, then **one `update_test_case` call per
   case** (element write pipeline as needed), verified by a `get_test_case`
   re-read; never delete-and-recreate. Approved DELETEs go in **one
   `delete_test_cases` call carrying exactly the ids the user confirmed**:
   show the list (name, id, reason), get explicit confirmation of it, and
   pass those ids and nothing more. Deletion is irreversible and the tool
   does no lookup of its own.

## Suite and plan management

Fires two ways. The user asks directly — names a suite or a plan, asks to
organize cases that way, or asks to run one — and each write follows the
same explicit-request-or-confirmation gate as every other write in this
file. Or an authoring run creates a case: that case goes into its
feature's suite and the suite into the app's plan at once, both created
when absent, under the run's one go-ahead and with no question
([suites-and-plans.md](suites-and-plans.md), _Where a new case belongs_).
Nothing else about suites or plans is proposed by you. The suite/plan
hierarchy, id resolution and the worked call sequences:
[suites-and-plans.md](suites-and-plans.md).
