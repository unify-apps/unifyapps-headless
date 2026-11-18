---
name: build-loop
description: "Builds a ticket or a feature on whatever it is about, in one command. Takes a ticket, a Figma link, a description or a name, works out the thing (a web app, a Code Builder app, a mobile app, an AI agent or an automation) and runs that thing's own build loop to the end, with its proof: pages checked in a browser or on a device, an agent's acceptance lines replayed as test messages, an automation's as test runs. Use when the person types /ua:build-loop, or asks to build a page, a feature, a capability or a ticket without naming what it runs on."
argument-hint: "<ticket key, Figma link, description or app> [what to build]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Skill, AskUserQuestion, ToolSearch
---

# Build loop

One front door. It works out what the ask is about, then hands the whole run
to that thing's own loop and follows it to the end. It builds nothing itself
and asks at most one question of its own.

`T` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" target`.

## Decide what it is about

1. **Read the ask.** Everything after the command: a ticket key or link, a
   Figma link, words, an app's name, id or URL. Run
   `T "<the ask>" --verb build --kind <kind> --json`, with the kind you read the ask to be (and `--app` for an app) as [which loop](../../skills/native-loops/loop-orchestrator/references/which-loop.md) says. It answers `target`, the entity when
   one is cached (`id`, `name`, `kind`: `no-code` or `code`), and `command`.
2. **A ticket** (`target: ticket`). Open
   [ticket sources](../../skills/native-loops/loop-orchestrator/references/ticket-sources.md)
   § Read a ticket and follow its steps before naming what it is about: the
   description, every comment, and every screenshot and recording in them,
   written to its ticket file. A ticket
   the scope loop filed names its app and its command in the body; any other
   names the app, agent or automation in its words, comments, links or
   screenshots. Run `T` again with that name or link.
3. **A design link** (`target: design`). The frames belong to an app: the one
   the ask names, else the solution's one app, else ask which. Run `T` again
   with the app.
4. **Unknown** (`target: unknown`). A build needs a thing that exists. One
   AskUserQuestion, "What is this for?", the cached apps, agents and
   automations as the options (at most four, the likeliest first). Never guess. Run `T`
   again with the answer.
5. **No loop for it** (`command` empty, a reason). A thing with no build
   loop (an object, a connector): say so in one line and the manual path,
   "Ask for it in chat; UnifyApps Headless builds it through its builder
   agents." Stop.

## Hand over

Load the loop `T` named, `ua:<command>`, with the Skill tool, and follow it
as written with the same ask (the ticket with its ticket file, the link,
the words), from its first step to its stop fact. It asks its own questions; its closing summary
is this command's. Say in one line which loop took the run and why.

| It is about | Runs |
| --- | --- |
| a page or feature of a web app, or of a Code Builder app | `/ua:app-build-loop` |
| a page or feature of a mobile app | `/ua:native-build-loop` |
| a ticket or capability of an AI agent | `/ua:ai-agent-build-loop` |
| a ticket of an automation | `/ua:automation-build-loop` |
| a deck, a presentation or a video, whatever app it shows | `/ua:content-loop` |

## Self-review

The specific loop's self-review covers the run. One signal is this command's:
when you had to ask what the ask was about, or a ticket named nothing, add it
to the run the specific loop opens,
`node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" signals add --run <its run folder> --key router-miss --stage route --reason "<what was missing>"`,
so its
self-review and the shared [self-review rules](../../skills/native-loops/loop-orchestrator/references/self-review.md) carry it.
