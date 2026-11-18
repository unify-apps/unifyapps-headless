# Task lint: a brief or tasks file is about to be sent

`task-lint.mjs` runs UnifyApps Headless's own task rules and the known traps over a plan task graph or a builder brief, so nothing `plan propose`, `plan revise` or a builder refuses is sent in the first place. Reads files only.

With `L="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-lint/scripts"`:

```bash
node "$L/task-lint.mjs" tasks.json            # or brief.md, or - for stdin
node "$L/task-lint.mjs" tasks.json --json                   # { file, kind, platform, installed, findings, summary, fixed }
node "$L/task-lint.mjs" tasks.json --platform WEB          # a WEB app: the phone's traps are skipped
node "$L/task-lint.mjs" tasks.json --fix                    # writes tasks.json.linted.json; never in place
node "$L/task-lint.mjs" tasks.json --installed $LOOPS_HOME/config.json --only T05,T08
```

One line per finding, `<id> · <task> line <n> · <detail> → <rewrite>`:

```
T05 · t3 line 4 · evt_R7mjz in removeActionIds → read the block's events live and map each evt_ to its act_ id
UA · t2 · t2 body has a placeholder: "similar to". Write the real value; … → fix it before plan propose/revise, which refuse the same thing
```

Exit 1 when any finding blocks (every UnifyApps Headless rule, and the traps marked blocking below); 0 otherwise; 2 when the file cannot be read or `--platform` is not `MOBILE` or `WEB`.

## What it checks

**UnifyApps Headless rules** (`scripts/lib/task-rules.mjs`, each regex copied from this plugin's `scripts/lib/contracts.mjs` and `spec-requirements.mjs`, and checked against them by the plugin's tests): task ids `t<n>` / `q<n>` and the `audit` flag; unique ids; a known kind; a title, unless the file carries the task back as done or skipped; a named entity with one id; `dependsOn` an array of known ids, no self or cycle; a page-bind on a new page needs its layout; a page-layout never waits on a backend task; **body at least five lines**; a proof; **no placeholder** in body or proof (`TBD`, `TBC`, `TODO` in capitals, "to be decided/determined/confirmed/defined", "handle errors", "similar to", "wire it up", "fill in"; a literal in a code span or quotes is not one); no hand-written field count on an object or record task; `deletes` named when the body calls a delete tool; the release shapes of deploy and publish, no fixed version number; an automation after its automation-shell; no two tasks of one kind on one entity at once.

Not covered, because they need the spec body: the `## Ready when` match of a deploy or publish, page jobs and page-review ordering, new app ids and app tasks, and tool access per agent. UnifyApps Headless still checks those at propose and revise.

**Traps** (`scripts/lib/traps.mjs`): one detector per row of the [known traps](known-traps.md). Blocking: T01–T06, T08, T11–T13, T15, T17, T20–T24. Advisory: T07, T09, T10, T14, T16, T18, T19. Each detector is a few lines; its message names the trap id and the line, and the rewrite column of the table is what to send instead. T24 alone reads the whole tasks file, since a page's loading states may sit in another task than its bind; a brief never trips it.

**Platforms.** Each trap carries `platforms`: `--platform` (`MOBILE` by default, `WEB` for a WEB app) runs only the traps that hold there. T01, T03, T04, T09, T10, T17, T19, T22 and T23 are about the phone (Module events, Pressable, the TextInput label add-on, the native sheets, the seeded `maxWidth`, argent, the Preview app, transitions and navigator, native custom styles) and are skipped on WEB; every other trap, T24 included, holds on both. `summary.applicable` lists the traps that ran.

A tasks file is linted task by task (body and proof apart, so a proof that promises a read-back of `isPublic` is reported as `t3 proof`). A brief is linted as text with lines numbered over the file; only the placeholder rule applies to it from the UnifyApps Headless set.

## How traps retire

Each trap carries `retiredBy: { ua?: "<version>", platform?: "#<pr>" } | null`. A trap applies until every named condition holds: UnifyApps Headless's version is the plugin these scripts ship in (a `nebula.version` in `$LOOPS_HOME/config.json` pins another), and `known.platformPrs` of the same file lists the platform PRs that are live (`--installed` names another file). When the file is absent no PR is known to be merged, so every platform-retired trap applies. Merged PRs are not detectable from the laptop, which is why `known.platformPrs` is a list a person maintains.

Two traps retire by halves and stay in the table: T16's alphabetical child order ends at UnifyApps Headless 3.50.0 (the message drops that clause), the stale-hit part has no fix; T22's `pageTransitionBehavior` write lands with platform PR #31453, `navigatorType` stays a manual step.

## `--fix`

Applies the safe rewrites only and writes `<file>.linted.<ext>` beside the input: T06 snake_case names on `displayName` and `create_block` lines to camelCase (ids such as `b_abc` are left alone), T02 `updates` to `edits` when the task names `update_blocks`, T08 `initialValue: true|false` to the strings `"true"`/`"false"`. Everything else needs a human or a live read (the `act_` ids of T05 come from the block's events).

## In a loop

1. Lint the tasks file before `plan propose --preview` and again before every `plan revise`, with `--platform` set to the run's platform.
2. Blocking: rewrite the offending line with the rewrite column, run again. Advisory: carry the line into the task body as a note the builder reads.
3. Record the run in `evidence.md` as kind `run` with the summary line.

Unconfirmed: the trap detectors are regexes over prose; a brief that describes a trap in other words passes. Report such a miss as a new detector, never as a reason to skip the lint.
