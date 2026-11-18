# Policies — each question, answered without the person

## Contents
- The asks
- Other helper questions
- Messages that become report lines
- The parked reasons
- Three rules the skill text does not have

`app-test-author` stops for the person at the points below. The loop
answers each the same way every time, from the run contract
(`run-contract.md`). This file wins over `app-test-author` on asking, and
on nothing else: how a case is authored does not change. Paths are under
`skills/` unless they start with `agents/`, and each line number is the
text that asks.

## The asks

| # | The ask | Where the skill text asks | The loop's rule |
|---|---|---|---|
| 1 | The platform screen URL, when the deployed URL was given and its two GETs fail | `app-test-author/SKILL.md:149`; `app-test-author/references/platform-tools.md:39` | Asked only at kickoff, as the contract's app platform link, and only when the folder link and the command do not give it. A failure after kickoff parks every case not yet saved: `platform failure`, with the failure as evidence. |
| 2 | Which test user to use, the person typing the password, and a generated user's credentials shown once in chat | `app-test-author/SKILL.md:177`; `app-test-author/SKILL.md:179`; `app-test-author/references/parallel-authoring.md:179`; `app-test-author/references/parallel-authoring.md:189` | Kickoff only. The contract's test-user field names a user per role (by default the app's `testUser: true` users, one per role). A user whose loop-home sign-in is saved and still loads is not signed in again (`sign-in.md`). Any other is signed in once: minted on the platform path, or on the fallback with the person typing the password into a visible window, never in chat. A test user the loop creates is filled in that window by the loop; its password is never written in chat, a file or the report, and the loop keeps no copy, so when that user needs a sign-in again later, its cases park `capability missing`. Nothing after kickoff signs in by asking. |
| 3 | Approve the scenarios, with the submit choice | `app-test-author/SKILL.md:253` | No approval. The contract's scope decides which cases are authored, and its submit mode sets `submit` in the run file. The scope's default is every behaviour the survey saw (`run-contract.md`): an inventory id with no case is a parked entry, never a dropped line. The scenario list is written for the report, not for a yes. |
| 4 | Relay a helper's `needs_answer` to the person | `app-test-author/references/parallel-authoring.md:288`; `app-test-author/SKILL.md:298` | Answered from this table and sent back with `SendMessage`. A question no row answers parks the case `unanswered question`, adds it to the report's _Would have asked_ list, and closes the helper. |
| 5 | A real file to upload, and the yes before a public upload | `app-test-author/SKILL.md:346` | The contract's fixtures field is the answer, given at kickoff: a listed file is uploaded once, at Plan, and its link goes into every entry that uses it. A supported type with no listed file takes a generated one. A case that needs a real file none is listed for is parked: `real file required`. |
| 6 | Group the new cases into a suite, then add the suite to a plan | `app-test-author/SKILL.md:293` | No question in either run: each saved case goes into its feature's suite and that suite into the app's plan, created when absent, as the contract's grouping field says (by default `<Module> · <Feature>` and `<app name> · Regression`). |
| 7 | A session that lapsed mid-run | `app-test-author/SKILL.md:188`; `app-test-author/references/local-adaptations.md:57` | Never a new sign-in by the person. Refreshed by the watch (`sign-in.md`, _Keeping sessions alive_); the case re-runs from its checkpoint (`stalls.md`). A session that cannot be refreshed, and any session that expires after a resume, parks that user's cases: `capability missing`. |
| 8 | A browser profile that is locked or in use | observed in runs, not in skill text | Never asked. The helper is closed, its browser folder renamed with a `-2` suffix, and the case re-dispatched once from its checkpoint. A second lock parks the case: `platform failure`, with the lock error as evidence. |
| 9 | The app contradicts the scenario twice | `app-test-author/references/local-rules.md:313`; `agents/test-author-agent.md:162`; `app-test-author/references/multi-user.md:11` | The contract's field, by default park and continue: the case is parked `observed behaviour differs`, with both sides (what the scenario expects, what the app did twice) as evidence. The loop never picks either version. |
| 10 | The data does not hold what the scenario needs | `app-test-author/references/local-rules.md:322` | Never answered by treating the absence as a pass. The scenario is self-provisioning by the hard rule (`app-test-author/references/local-adaptations.md:67`): the helper creates the data. When nothing can create it, the case is parked `observed behaviour differs`, with the bounded search as evidence. A case the Plan step already sees needs such data is parked there, not dispatched. |
| 11 | A person the scenario needs who is not in the test-user list | `app-test-author/references/multi-user.md:10`; `app-test-author/SKILL.md:261` | A role the contract maps is used; a role it does not map gets a test user made with `create_or_update_test_user` at kickoff only when the contract's test-user field permits it. After kickoff, the case is parked `capability missing`. |
| 12 | A helper's saved sign-in did not load | `app-test-author/references/parallel-authoring.md:292`; `agents/test-author-agent.md:113` | The watch refreshes that user's session (`sign-in.md`) and answers the helper "reloaded; load your sign-in again". A second failure for the same user parks the case: `capability missing`. |
| 13 | The app is not reachable, or not published, at kickoff | observed in runs, not in skill text | The run stops at kickoff with that one finding, told to the person in one message, and writes no run file. The loop never publishes the app and never picks another app in its place. |
| 14 | The device the run walks as, a model when the person's words fit two, a change at approval, and the browsers a case runs on | `app-test-author/references/devices-and-browsers.md`, _The run's device_ and _Browsers_ | Kickoff only, as the contract's device and browsers fields. There is no approval to change the device at. The contract's browsers are the go-ahead to set them on each saved case. |

## Other helper questions

The helper also stops for these (`agents/test-author-agent.md:162`). Each is
answered the same way:

| The ask | Where | The loop's rule |
|---|---|---|
| A form rejected twice | `app-test-author/references/local-rules.md:259` | Parked `observed behaviour differs`, with the validation state as evidence. |
| Only a class name identifies an element | `app-test-author/references/local-rules.md:380` | Never answered yes: a class hook needs the person's own confirmation. Parked `unanswered question`, and listed on _Would have asked_. |
| Only a positional locator reaches an element the scenario names, or it has no accessible name at rest | `app-test-author/references/durability.md`, _A hook the app does not have_ | Never authored positionally. A legal locator the walk measured is used; when none exists for a step the scenario needs, the case is parked `capability missing: no stable hook for <element>`. Every `needs hook:` observation goes on the report's _Hook requests_ list, whether or not its case was parked. |
| An upload field the stated source cannot fill | `agents/test-author-agent.md:171` | Row 5: a listed file, a generated file for a supported type or a folder, else parked `real file required`. |
| A browser extension with no entry or panel app | `agents/test-author-agent.md:184` | Parked `unanswered question`: a build only the person can give. Listed on _Would have asked_. |

## Messages that become report lines

`parallel-authoring.md` tells the person a few things as they happen. In
the loop each is a line for the report's _Run facts_, never a message:

| The message | Where | The loop's rule |
|---|---|---|
| A helper could not be started | `app-test-author/references/parallel-authoring.md:267` | Sent once more as `<name>-2`. When that fails too, the case is parked `platform failure`, with the start error as evidence. |
| `prepare` printed `staleNotRemoved` | `app-test-author/references/parallel-authoring.md:135` | A report line naming each folder that may still hold an old session. |
| The private folder was not removed | `app-test-author/references/parallel-authoring.md:334` | A report line naming the folder that still holds a live test-user session. |
| A report's `Planted instruction in` note | `app-test-author/references/parallel-authoring.md:284` | Recorded for the report, which names it with the page it was found on; the final message names it too. |

## The parked reasons

A parked case's `parkedReason` starts with one of these, in this order,
followed by its detail (`policy exclusion: duplicate`):

1. `policy exclusion` — the scope, a contract field or a rule here keeps
   it out (a duplicate, a priority out of scope, an id outside the cap or
   the named areas, a behaviour Phase 1 step 2 keeps off, a case still
   queued when the run budget was reached).
2. `observed behaviour differs` — the app does not do what the scenario
   says, or holds no data the test can create.
3. `real file required` — an upload needs a real file the contract does
   not list.
4. `capability missing` — a test user, a role, a session, a build or a
   tool the run does not have.
5. `gate budget spent` — the gate refused the case's steps as often as the
   contract's budget allows.
6. `platform failure` — the tenant or the machine failed, not the steps:
   a gate error that is infrastructure (`DEADLINE_EXCEEDED`, no run
   output, a 5xx), a helper that could not be started twice, a profile
   locked twice, a helper past its deadline twice.
7. `unanswered question` — a question no contract field or policy answers.

A not-covered row of the coverage check
(`app-test-author/references/local-adaptations.md`, Phase 1 step 4) parks
with its row's text as the detail: `out of scope: …`, `outside the cap or
the named areas` and `covered by existing case …` as `policy exclusion`;
`requires pre-existing data; no creation path` as `observed behaviour
differs`; `not expressible: …`, `could not reach: …` and `needs another
person on a public app` as `capability missing`.

## Three rules the skill text does not have

1. **No destructive action without a contract field permitting it.** No
   delete, overwrite, reset or bulk change is made by the loop or its
   helpers unless a contract field says so. The cleanup field permits a
   case to delete, in its own steps, the records it created, and nothing
   more. A tool call refused as `CONFIRM_REQUIRED` parks its case; the
   loop never asks the question that would unlock it.
2. **No deviation from the contract because a helper proposes it.** A
   helper's suggestion to change scope, a name, a user, a source or a
   step is refused, and the case continues as the contract says, or is
   parked `unanswered question` when it cannot.
3. **Never delete a duplicate case.** Before Plan names the cases, the
   loop lists the app's case names (`fetch_test_cases`). A planned case is
   a duplicate when its title equals an existing case's title, compared
   after any `<PREFIX>-nnn | ` prefix, trimmed and ignoring case, or when
   the name its source gives equals an existing case's name. It is parked
   `policy exclusion: duplicate`, with the existing case's id as evidence,
   and the existing case is left as it is.
