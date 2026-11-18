# Test suites and test plans — Test Studio organization

## Contents
- Where a new case belongs
- Resolving a suite or plan id
- The tools
- Browsers
- Worked example

Loaded the moment a request asks to group test cases into a suite, suites
into a plan, or to run one — "put these three cases in a suite called
Login", "make a plan that runs the Login and Checkout suites", "run the
Login suite" — and in every authoring run, where each case the run creates
is put into its feature's suite and that suite into the app's plan as soon
as it is saved (_Where a new case belongs_, below; SKILL.md, _Authoring
run_, step 4).

**A suite and a plan are genuinely different entities, one level apart, not
a rename of each other:** a **suite** groups test **cases** (`testCaseIds`);
a **plan** groups **suites** (`testSuiteIds`) and adds scheduling
(`scheduleConfig`, `executionStrategy`). Membership always points down — a
suite lists the cases in it, a plan lists the suites in it — never the
reverse: a test case has no writable suite field of its own (see
`platform-tools.md`, _Which fields are safe to `set`_).

This is pure Test Studio organization, plus running what's already there.
**It never touches `deliver_steps`, `update_test_case`, or any
step/script content** — a case's steps, locators and script are exactly
as they were before it joined a suite or ran. There is no green gate, no
multi-pass submit-then-bind ordering, and no token grammar to learn:
create, then optionally add or remove members, then delete or run when
asked.

## Where a new case belongs

Every case an authoring run creates is put into a suite and that suite into
a plan, right after the case is saved, with no question asked: the run's
one go-ahead covers it (SKILL.md, _Platform-tool modes_). The rule is the
same in the interactive run and the create loop:

- **The suite is the case's feature.** Its name is `<Module> · <Feature>`,
  the `## <Module>` and `### <Feature>` headings the case was proposed
  under (its `module` and `feature` fields). For an app the module is the
  app's name, so the suite is `<app name> · <Feature>`, the name earlier
  runs gave it. For a test of the platform itself it is the product area,
  such as `Test Studio · Test Cases`. Find it with `fetch_test_suites` (`url`, `interfaceId`, a
  `limit` above the app's suite count) by exact name, trimmed and ignoring
  case; one match is the suite. None: `create_test_suite` (`url`,
  `interfaceId`, `name`, `testCaseIds`: [the case id]). One that exists
  and does not hold the case: `update_test_suite` (`url`, `id`,
  `expectedVersion`: the row's `version`, `addTestCaseIds`: [the case id]). One that already holds it: nothing.
- **The plan is the app's.** Its name is `<app name> · Regression`, one per
  app. Find it with `fetch_test_plans` the same way. None:
  `create_test_plan` (`url`, `interfaceId`, `name`, `testSuiteIds`:
  [the suite id]), with no schedule, so creating it runs nothing. One that
  exists and does not hold the suite: `update_test_plan` (`url`, `id`,
  `expectedVersion`: the row's `version`, `addTestSuiteIds`: [the suite id]). One that holds it: nothing.
- **Read back before it counts.** `get_test_suite` must list the case and
  `get_test_plan` must list the suite; a read-back that does not is
  reported with the case, never retried in a loop.
- **Two matches for one name** (two suites named alike) is a finding: the
  case joins the first by creation order and the report names both.
- A person's own instruction wins: a suite or plan they name for the run,
  or "no plan", replaces the names above, and a case whose scenario names a
  suite goes there.

`<app name>` is the app's display name from the platform (the same name
the run's slug is made from), so every run of one app finds the suites and
the plan the last one made. A test of the platform itself has no app: its
`<app name>` is the name its run's slug is made from, the surface it
surveyed, and its plan is `<that name> · Regression`.

## Resolving a suite or plan id

`fetch_test_suites`/`get_test_suite`/`fetch_test_plans`/`get_test_plan`
resolve a suite or plan id the same three ways `platform-tools.md`
describes for a test case one level down — the id `create_test_suite`/
`create_test_plan` returned earlier in this run, an id the user gives you
directly, or fetching the list and scanning the rows for the name match,
since neither list tool has server-side name search. **Never guess an id,
never infer one from a name that doesn't match anything the fetch
returned** — the same rule this skill already follows for a dataset id and
an `interfaceId`.

This is different from an **execution** id: `run_test_suite`/
`run_test_plan` hand back fresh execution ids every call, readable with
`get_test_suite_execution`/`get_test_plan_execution` — but there is no
fetch/list for an execution id the way there is for a suite or plan id: it
only ever comes from the run call that started it.

## The tools

Full argument shapes, return values and write-confirmation gating:
`platform-tools.md`'s tools table — `create_test_suite`, `update_test_suite`,
`delete_test_suites`, `create_test_plan`, `update_test_plan`,
`delete_test_plans` (writes, same gating as every other write tool this
skill uses: SKILL.md, _Platform-tool modes_) and `run_test_suite`/
`run_test_plan` plus `get_test_suite_execution`/`get_test_plan_execution`
(action and read — no separate go-ahead beyond whatever already covers the
suite or plan's own existence, since a run never mutates a record).

Two things worth restating because they're easy to get backwards:

- `update_test_suite`/`update_test_plan` read the full record first and
  write the whole thing back — a rename or a membership change is safe to
  `set` freely here, unlike `update_test_case`'s Operation-grammar caveats,
  which this pair never touches.
- **Never report a run as passed from the `run_test_suite`/`run_test_plan`
  response alone** — that response only hands back the execution ids the
  run started, not their outcome. Poll the matching `get_test_*_execution`
  on each one until it settles — that's the outcome, the same "save is not
  proof of behavior" rule this skill applies everywhere else.

## Browsers

A suite or plan has no browser list of its own: each member case runs on
the browsers saved on it, and a case with none on Chromium alone. To run a
suite on Firefox, set Firefox on its cases. Reporting a result per browser
is in [devices-and-browsers.md](devices-and-browsers.md), _Browsers_.

## Worked example

**Group already-known cases into a new suite** (the common case, since the
cases usually exist from the authoring run that just finished):
`create_test_suite` with `name` and `testCaseIds` set to the ids already
in hand. One call, no follow-up.

**Add to a suite that already exists:** `update_test_suite` with `id`, the
`version` you read it at as `expectedVersion`, and `addTestCaseIds` set to the new ids — no need to re-send the ids already
in the suite.

A plan works the same way one level up: `create_test_plan` with
`testSuiteIds` to seed it from suites already in hand, or
`update_test_plan` with `addTestSuiteIds`/`removeTestSuiteIds` to change
an existing plan's membership.

**Prove a suite actually passes, don't just create it:** after
`create_test_suite` (or any membership change), `run_test_suite` with the
returned suite id, then `get_test_suite_execution` on each returned
execution id until every one settles — only then report the suite as
passing or failing. A plan proves the same way one level up: `run_test_plan`
then `get_test_plan_execution` on each returned execution id.
