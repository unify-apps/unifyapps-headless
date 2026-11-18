---
name: scope-loop
description: Turns an idea, call notes, a draft PRD, Figma frames, a ticket or "extend this" into an approved PRD, a plan and tickets, in one command, by working out what the ask is about (a web app, a Code Builder app, a mobile app, one feature of an app that exists, an AI agent, or an automation) and running that thing's own scope loop to the end. Use when the person types /ua:scope-loop, or asks to write a PRD, plan or scope something without naming what it runs on.
argument-hint: "<idea, PRD, ticket key, Figma link or app> [whole app]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Skill, AskUserQuestion, ToolSearch
---

# Scope loop

One front door. It works out what the ask is about, then hands the whole run
to that thing's own loop and follows it to the end. It plans nothing itself
and asks at most one question of its own.

`T` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" target`.

## Decide what it is about

1. **Read the ask.** Everything after the command: words, a ticket key or
   link, a Figma link, an app's name, id or URL. Run
   `T "<the ask>" --verb scope --kind <kind> --json`, with the kind you read the ask to be (and `--app` for an app) as [which loop](../../skills/native-loops/loop-orchestrator/references/which-loop.md) says (add `--whole` when the person said the
   whole app). It answers what the ask is, and which loop runs it:
   `target` (`web-app`, `code-app`, `native-app`, `ai-agent`, `automation`,
   `ticket`, `design` or `unknown`), the entity when one is cached (`id`,
   `name`, `existing`), and `command`.
2. **A ticket** (`target: ticket`). Open
   [ticket sources](../../skills/native-loops/loop-orchestrator/references/ticket-sources.md)
   § Read a ticket and follow its steps before naming what it is about: the
   description, every comment, and every screenshot and recording in them,
   written to its ticket file. Name the
   thing it is about: an app, agent or automation in its words, comments,
   links or screenshots, or the platform it names. Run `T` again with that
   name or link. A ticket that names nothing anywhere is an ask in words:
   run `T` with its title, description and comments.
3. **A design link** (`target: design`). The frames belong to an app: the one
   the ask names, else the solution's one app, else ask which. Run `T` again
   with the app.
4. **Unknown** (`target: unknown`). One AskUserQuestion, "What is this for?",
   four options in this order: a web app, a mobile app, an AI agent, an
   automation; the hint first when `T` gave one. Never guess. Run `T` again
   with the answer as words.
5. **No loop for it** (`command` empty, a reason). A thing with no scope
   loop (an object model on its own, a connector): say so in one line and
   the manual path, "Ask for it in chat; UnifyApps Headless plans and builds
   it through its builder agents." Stop.

## Hand over

Load the loop `T` named, `ua:<command>`, with the Skill tool, and follow it
as written with the same ask, from its first step to its stop fact. It asks
its own questions; its closing summary is this command's. Say in one line
which loop took the run and why: "Demo web app [e_…]: web-app → /ua:app-scope-loop".

| It is about | Runs |
| --- | --- |
| a new web app, or a Code Builder app, or the whole of one that exists | `/ua:app-scope-loop` |
| a new mobile app, or the whole of one that exists | `/ua:native-scope-loop` |
| one feature of an app that exists, on either platform | `/ua:feature-prd-loop` |
| an AI agent, new or to extend | `/ua:ai-agent-scope-loop` |
| an automation or a set of them, new or to extend | `/ua:automation-scope-loop` |

## Self-review

The specific loop's self-review covers the run. One signal is this command's:
when you had to ask what the ask was about, or a ticket named nothing, add it
to the run the specific loop opens,
`node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" signals add --run <its run folder> --key router-miss --stage route --reason "<what was missing>"`,
so its
self-review and the shared [self-review rules](../../skills/native-loops/loop-orchestrator/references/self-review.md) carry it.
