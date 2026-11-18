# Stage: tickets

## Contents

- When it runs
- 1. Slice
- 2. Check
- 3. The plan approval
- 4. Approve the PRD version
- 5. The empty app
- 6. Write the tickets out
- 7. A re-run updates what changed
- 8. Record the tickets
- Finish
- Done when

The scope loop's last stage: the approved PRD and its plan cut into tickets
`/ua:native-build-loop` (on WEB `/ua:app-build-loop`) builds one at a time, then, after one yes, the PRD
version approved, a new app's empty shell made, and the tickets written out
in build order for the person to file. Each ticket carries everything its build run needs:
its requirements with their acceptance lines word for word, its screens
with their design frames, its data, its automations, and the tickets it
waits for.

## When it runs

After the app-plan stage. A run that resumes reads `R/tickets.json`,
`R/keys.json` and the board: a ticket with a key is already filed, and is
never written out as new again.

## 1. Slice

Write `R/tickets.json` ([formats](../formats.md) § Scope tickets):

- **T0, the foundation.** The objects more than one slice uses, the roles
  and access, the navigation, the app's look, and the test users. Its
  acceptance lines are its own `checks`: "the Leave request object holds the
  fields the plan names", "an employee and a manager each sign in and reach
  Home".
- **One slice per user-facing feature**: a journey, or a group of
  requirements a person uses end to end, with the screens it builds (at most
  five), the objects it reads and writes (made in T0, or new here), its
  automations and AI agents, and the slices it waits for.
- Every must and should requirement in exactly one slice. A could
  requirement goes in a slice when the person asked for it, else in `later`.
- Order the slices so a slice waits only for what it reads: approvals wait
  for the request that creates what they approve.
- **A re-run keeps ids.** `ua prd get <app> --part tickets` into
  `R/previous-tickets.md`, and that version's PRD
  (`ua prd get <app> --version <base>`) into `R/previous-prd.md`. A
  slice that is still the same feature keeps its id; a new feature takes the
  next id after every one already filed; a dropped slice's id is never
  reused.

## 2. Check

```
loops scope tickets-check R/tickets.json --prd R/prd.md [--previous R/previous-tickets.md --previous-prd R/previous-prd.md] --json
```

Exit 1 lists every problem: fix `R/tickets.json` and check again. On a
re-run its `slices` say which tickets are new, changed, unchanged and
dropped.

## 3. The plan approval

One AskUserQuestion. The question: "Write <n> tickets for <project> and create
the empty <code|no-code> app <name>?" (an existing app: no app line; a re-run: "Write <n>
new, <c> changed and <d> dropped, leave <u> as they are?"). Above it,
one line per ticket in build order, `T<n> · <title> · <requirements> ·
<screens> · waits for <slices>`, then the Later list and who the tickets are
assigned to. Options: Write them (and create the app) · Change something ·
Keep for later. Keep for later ends the run with the PRD a draft.

## 4. Approve the PRD version

```
UnifyApps Headless prd approve <app> --version <n> --record-version <r> --json
```

with the record version of the draft the person approved.
`VERSION_CONFLICT` means a teammate changed the draft after the approval:
show the person what changed (`ua prd get <app> --version <n>` against
`R/prd.md`) and ask the plan approval again.

## 5. The empty app

A new app only. Its id is the app slug, free when `get_app_overview` answers
not found; else the person picks another.

1. A short spec in `.sessions/<sid>/drafts/`: `Requested outcome` (the
   empty MOBILE or WEB app the tickets build on), `## Touches` with
   `- app · <name> · new`, the `app look` line from the plan in
   `## Contract`, and `## Ready when` "the app exists, its type is MOBILE
   (or WEB), and its look is stored". A WEB code app, the kind app-plan
   § 3 wrote unless the person asked for no-code: `- code-app · <name> · new`,
   no `app look` line, and `## Ready when` "the code app exists and
   `get_code_app` answers it".
2. One task: kind `app`, entity `{kind: "app", name, id}`, a body that
   creates the app with `create_app` (`type: MOBILE`; on WEB `type: WEB`
   and `baseDeviceVariant: desktop`), stores the look, adds no page, and
   reads both back. A WEB code app instead: one task of kind `code-app` for
   `ua:code-app-agent`, entity `{kind: "code-app", name}`, a body that
   creates it with `create_code_app` and reads it back with `get_code_app`.
3. `ua plan propose --file <spec> --tasks-file <tasks> --mode sonic --json`,
   then `--save --hash <hash>` and `ua plan start <planId> --json`: the
   plan approval was the yes. Run it as `ua:ua-change` § Run a plan says,
   which finishes the plan when its run loop says so.
4. Read back: `get_app_overview` answers the app with `appType: MOBILE`
   (or `WEB`; a code app: `get_code_app`). `ua solution refresh`, then
   `loops platform <appId>` answers the loop's platform, and `kind: code`
   for a code app.

## 6. Write the tickets out

```
loops scope tickets-render R/tickets.json --prd R/prd.md --version <n> --app-name "<name>" --app-id <appId> --solution-name "<solution>" --solution-id <solutionId> --keys R/keys.json --out R/rendered.json --files R/tickets
```

`R/tickets/` holds one Markdown file per ticket and `index.md`, the build
order. Each file is a whole ticket: its goal, its requirements with their
acceptance lines, its screens and frames, its data, its automations, what it
waits for, the command that builds it, and its scope marker. Nothing is sent
anywhere — the person files them where their team keeps its work.

A ticket already filed is named by its key in `R/keys.json`
(`{ "T0": { "key": "<key>", "url": "<link>" } }`), which a stopped run leaves
behind. Ask the person once, after they have filed, for the keys or links they
got; write them into `R/keys.json`, log a `writeback` event per ticket, and
render again so every `Depends on` line names the real ticket rather than a
slice id. A person who keeps no keys says so, and the run goes on with the
slice ids.

T0 is first in the index and alone in its layer, so a reader files it first.

## 7. A re-run updates what changed

By the check's `slices`:

| Slice | What the run does |
| --- | --- |
| new | written out as § 6 says |
| changed | written out again, and named in the closing summary as changed, with what changed, so the person updates that ticket |
| unchanged | nothing |
| dropped | named in the closing summary as dropped, with why |

No ticket is ever deleted, and nothing rewrites a ticket under the person
working on it: the run says what changed and they decide.

## 8. Record the tickets

`R/tickets-filed.json`: `{ "tracker": { "team", "project", "assignee" }, "tickets": [...] }`,
each slice of `R/tickets.json` with its `key` and `url` where the person gave
them, in build order. Then

```
UnifyApps Headless prd tickets <app> --version <n> --file R/tickets-filed.json [--app-id <appId>] --json
```

`docs/prd/<app>.md` now shows the tickets, and the next run of the loop
compares its slices with them.

## Finish

1. `loops log append --run <R> '{"type":"run.end","outcome":…}'` with the
   counts; `board.json` gets `finished: true`, then `loops board`.
2. The closing summary in the loop's shape, every count from the files in
   `R`. The `Next:` lines list the tickets in build order, each as
   `/ua:native-build-loop <ticket link or R/tickets/T<n>.md> <its goal>` (on
   WEB `/ua:app-build-loop …`), for the person to start in a new session, T0
   first.

The scope loop has no device, no data change and no sheets: the
orchestrator's generic Finish steps 1, 2 and 4 do not apply.

## Done when

`loops scope tickets-check` passes; the PRD version is approved; a new app
exists and answers the loop's platform; every ticket is written to `R/tickets/` and named in the
index (on a re-run, every changed and every dropped slice named in the
summary); the
tickets are recorded on the version; the closing summary is given.
