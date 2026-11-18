---
name: test-loop
description: The test lifecycle in one command with three modes. discover writes and reviews the cases from the PRD; build turns the approved cases into something that runs (Test Studio for a web app, an evaluation for an AI agent; a mobile app has no test loops); run executes them and writes the report. It works out what the ask is about and runs that thing's own test loop for the mode to the end. Use when the person types /ua:test-loop, or asks to write, automate or run tests without naming what it runs on.
argument-hint: "<discover [--walk] | build | run> <app, ticket or URL> [suite or plan, for run]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Skill, AskUserQuestion, ToolSearch
---

# Test loop

One front door with three modes. It works out what the ask is about, then
hands the whole run to that thing's own test loop for the mode and follows it
to the end. It writes, automates and runs nothing itself, and asks at most
two questions of its own: the mode, and the app.

`T` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" target`.

## The mode

The first word after the command: `discover`, `build` or `run` (`design`
and `automate`, the older words, mean `discover` and `build`). Without one,
read the ask: "write cases", "test cases", "review the cases" is `discover`;
"automate", "build the tests", "into Test Studio", "journeys" is `build`;
"run", "execute", "report" is `run`. Still unclear: one AskUserQuestion with
the three modes, in order. The modes chain: discover, then build, then run;
a loop whose input is missing says so and names the mode that makes it.

`discover --walk` asks the discover loop to walk the live app first and add
what it finds beside the PRD cases, for a web app or a Code Builder app.
On a mobile app or an AI agent, say in one line "A walk is for web apps in
Test Studio" and run the mode without it.

## Decide what it is about

1. **Read the ask.** The words after the mode, without `--walk`: an app's
   name, id or URL, a ticket key or link, or words; in `run` mode a suite or
   plan name after the app stays in the ask. Run
   `T "<the ask>" --verb test --mode <mode> --kind <kind> --json`, with the kind you read the ask to be (and `--app` for an app) as [which loop](../../skills/native-loops/loop-orchestrator/references/which-loop.md) says. It answers `target`,
   the entity when one is cached, and `command`, or a `reason` when there
   is none.
2. **A ticket** (`target: ticket`). Open
   [ticket sources](../../skills/native-loops/loop-orchestrator/references/ticket-sources.md)
   § Read a ticket and follow its steps before naming what it is about (the
   description, every comment, and every screenshot and recording in them),
   and name the app or agent it is
   about from its words, comments, links or screenshots. In `run` mode a ticket names a fix to
   verify: a WEB app's ticket goes to `/ua:app-test-signoff-loop` with the
   key and the app's URL. A MOBILE app or an AI agent has no signoff loop:
   run `T` again with the app or agent (when the words around the ticket say
   mobile, `T` answers that reason instead of the signoff loop). In every
   other mode, run `T` again with the app or agent.
3. **Unknown** (`target: unknown`), or a design link (`target: design`).
   The app or agent the ask names, else the solution's one app, else one
   AskUserQuestion, "Which app?", the cached apps and agents as options (at
   most four). Never guess. Run `T` again with the answer.
4. **An automation** (`target: automation`). It has no test loops: say the
   reason `T` gives, name `/ua:automation-build-loop` and
   `/ua:automation-fix-loop`, whose test runs prove it, and stop.

## Hand over

Load the loop `T` named, `ua:<command>`, with the Skill tool, and follow it
as written with the same ask, `--walk` passed on with it, from its first
step to its stop fact. It asks its own questions; its closing summary is
this command's. Say in one line which loop took the run and why.

| Mode | A web app or a Code Builder app | An AI agent |
| --- | --- | --- |
| `discover` | `/ua:app-discover-test-loop` | `/ua:ai-agent-design-test-loop` |
| `build` | `/ua:app-build-test-loop` | `/ua:ai-agent-automate-test-loop` |
| `run` | `/ua:app-run-test-loop` | `/ua:ai-agent-run-test-loop` |
| `run` on a ticket | `/ua:app-test-signoff-loop <ticket> for <app URL>` | `/ua:ai-agent-run-test-loop` |

A mobile app has no test loops: say the reason `T` gives, name
`/ua:native-build-loop` and `/ua:native-fix-loop`, whose checks on a simulator
prove its pages, and stop.

A `run` asked with a code app pull request link ("run the tests my PR
affects") is `/ua:app-test-affected`, not the run loop: it runs only the
cases the PR's changed files reach, on the PR's preview.

An AI agent's tests are an evaluation (a dataset, metrics, an experiment);
its loops keep the names `design` and `automate`.

## Self-review

The specific loop's self-review covers the run. One signal is this command's:
when you had to ask what the ask was about, or a ticket named nothing. Once
the loop has opened its run folder, add the signal with
`node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" signals add --run <its run folder> --key router-miss --stage route --reason "<what was missing>"`
and carry on; the loop's self-review and the shared
[self-review rules](../../skills/native-loops/loop-orchestrator/references/self-review.md)
carry it.
