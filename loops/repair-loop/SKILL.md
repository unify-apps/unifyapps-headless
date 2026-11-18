---
name: repair-loop
description: Fixes what is wrong, in one command, whatever it is about. Takes one issue described in chat, a ticket or a whole tracker project, a failed run, or an app to audit; works out the thing each is about (a web app, a Code Builder app, a mobile app, an AI agent or an automation) and runs that thing's own fix loop to the end, reproduced first, fixed, retested. Use when the person types /ua:repair-loop, or reports a bug, pastes a ticket or asks to fix or repair something without naming what it runs on.
argument-hint: "<issue in words, ticket key or link, tracker project, run id, or app>"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Skill, AskUserQuestion, ToolSearch
---

# Repair loop

One front door. It works out what the ask is about, then hands the whole run
to that thing's own loop and follows it to the end. It fixes nothing itself
and asks at most one question of its own.

`T` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" target`.
This plugin ships no issue-tracker tools: a ticket reaches the loop as
words, a file, a link, or through the person's own tracker tools when their
session holds any.

## Decide what it is about

1. **Read the ask.** Everything after the command: an issue in words, a
   ticket key or link, a tracker project, a run id, an app's, agent's or
   automation's name, id or URL. Run `T "<the ask>" --verb fix --kind <kind> --json`, with the kind you read the ask to be (and `--app` for an app) as [which loop](../../skills/native-loops/loop-orchestrator/references/which-loop.md) says. It
   answers `target`, the entity when one is cached, and `command`.
2. **A ticket** (`target: ticket`). Open
   [ticket sources](../../skills/native-loops/loop-orchestrator/references/ticket-sources.md)
   § Read a ticket and follow its steps before naming what it is about: the
   description, every comment, and every screenshot and recording in them,
   written to its ticket file. Name the
   thing it is about from all of it: an app, a page, an AI agent or an
   automation in the words, the comments or the links, or what a screenshot
   shows (the app's header, the page title, the address bar). Run `T` again
   with that name or link. A ticket that names nothing anywhere is an issue
   in words: run `T` with its title, description and comments.
3. **A tracker project.** Ask the person for its open tickets — a list
   they paste, a CSV, or their own tracker tools when the session holds
   them, the to-do status first and by priority. Tell them the count, and
   work them in that order: each ticket as step 2, each handed to its loop
   in turn; a ticket whose thing has no loop is listed as skipped with why. Never skip a
   ticket for having no words: its comments and files are read first.
4. **Unknown** (`target: unknown`). An issue in words that names nothing:
   when the solution has one app, it is that one; else one AskUserQuestion,
   "What is this about?", the cached apps, agents and automations as options
   (at most four, the likeliest first). Never guess. Run `T` again with the
   answer.
5. **No loop for it** (`command` empty, a reason). An object, a connection
   or a record with no loop of its own: say so in one line and the manual
   path, "Describe it in chat; UnifyApps Headless debugs and fixes it
   through its builder agents." Stop.

## Hand over

Load the loop `T` named, `ua:<command>`, with the Skill tool, and follow it
as written with the same ask (the words, the ticket with its ticket file,
the run id), from its first step to its stop fact. The loop reads the
ticket file, comments and screenshots included, rather than the ticket's
description alone. It asks its own questions, writes the ticket's
comment and status when the person allows it, and its closing summary is
this command's. Say in one line which loop took the run and why.

| It is about | Runs |
| --- | --- |
| an issue on a web app's or Code Builder app's page, from chat, a ticket or an audit | `/ua:app-fix-loop` |
| an issue on a mobile app's page | `/ua:native-fix-loop` |
| an AI agent that answered wrongly, a ticket about one, or an evaluation run's low scores | `/ua:ai-agent-fix-loop` |
| an automation that failed or wrote the wrong thing, or a ticket about one | `/ua:automation-fix-loop` |
| an object, a connection or a record | no loop: ask in chat |

## Self-review

The specific loop's self-review covers the run. One signal is this command's:
when you had to ask what the ask was about, or a ticket named nothing, add it
to the run the specific loop opens,
`node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" signals add --run <its run folder> --key router-miss --stage route --reason "<what was missing>"`,
so its
self-review and the shared [self-review rules](../../skills/native-loops/loop-orchestrator/references/self-review.md) carry it.
