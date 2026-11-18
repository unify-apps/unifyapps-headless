---
name: review-loop
description: Reviews a finished app the way a demanding user and a senior designer would, in one command, before a go-live or a demo. Works out what the ask is about and runs that thing's own review to the end. On a deployed web app it runs the config review (/ua:app-config-review, the performance half) and then the live design critic loop with its sign-out, address, notifications and coverage passes, writes one ticket per root cause after one yes, and ends with one summary naming both reports and the tickets; on a mobile app it runs the native design critic loop; an AI agent's review is its experiment scorecard, an automation's its best-practice report. Use when the person types /ua:review-loop, or asks to review, critique or QA the design or UX of an app, or to check an app before it goes live, without naming a platform.
argument-hint: "<app URL, app name or bundle id> [--pages N] [--flows 'checkout,signup'] [--page home] [--no-tickets] [--experience-only]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Skill, AskUserQuestion, ToolSearch
---

# Review loop

One front door. It works out what the ask is about, then hands the whole run
to that thing's own review and follows it to the end. It reviews nothing
itself and asks at most one question of its own. On a web app it is the
go-live command: the config review for performance, the live critic for the
experience, and the tickets. The reports it ends with are `/ua:repair-loop`'s
input.

`T` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" target`.

## Decide what it is about

1. **Read the ask.** Everything after the command: an app's URL, name, id or
   bundle id, the critic's own flags (`--pages`, `--flows`, `--page`,
   `--width`, `--nitpicks`), which pass through untouched, and this command's two flags:
   `--no-tickets` (review, no ticket stage) and `--experience-only` (the live
   critic only, no config review). Run `T "<the ask>" --verb review --kind <kind> --json`, with the kind you read the ask to be (and `--app` for an app) as [which loop](../../skills/native-loops/loop-orchestrator/references/which-loop.md) says.
   It answers `target`, the entity when one is cached, and `command`.
2. **Unknown** (`target: unknown`). A deployed URL that is not on the tenant,
   or a bundle id, is a mobile app when it looks like one
   (`com.example.app`) and a web app when it is an `https` address; say
   which you took it for. Otherwise one AskUserQuestion, "Which app?", the
   cached apps as options (at most four). Never guess.
3. **No loop for it** (`command` empty, a reason). A thing with no critic:
   say so in one line, name where its review is (the table below), and stop.

## Hand over

| It is about | Runs |
| --- | --- |
| a deployed web app, or a Code Builder app | the web app review below |
| a mobile app on a simulator, an emulator or a phone | `/ua:native-design-critic-loop`, as written, from its brief to its report |
| an AI agent | no critic: tell the person its experiment scorecard is the review (`/ua:ai-agent-run-test-loop` writes it) and start no loop |
| an automation | no critic: tell the person its best-practice report is the review (`/ua:automation-fix-loop` reads it) and start no loop |

Load each loop with the Skill tool, `ua:<command>`, and follow it as written
with the same ask and flags. It asks its own questions; its report and
closing counts are this command's. Say in one line which loop took the run
and why.

## The web app review

Three stages, in this order, each the loop's own text run to its end.

1. **The config review** (`ua:app-config-review`), unless `--experience-only`.
   It is the performance half: it reads the stored app against the rulebook
   and writes its report to the solution folder. Load it with a narrowed
   ask, not the person's words: the app `T` resolved (its cached id and
   name), `Whole app`, config review only, no fix offer, no ticket offer
   and no hand-off. Its fix and ticket offers are skipped: the P0 and P1 go
   into the summary's Next line instead, nothing from it is fixed in this
   run, and the tickets of this command are the critic's, one per root
   cause. It needs the app to
   be one of this folder's solution (`/ua:setup`); a deployed URL whose app
   is not cached here, or a Code Builder app, has no config review: say so
   in one line and go on to the critic.
2. **The live critic** (`ua:app-design-critic-loop`), from its brief to its
   report, with the ask and the pass-through flags. Its four go-live passes
   (the sign-out and sign-in again, the address bar and branding, the
   notifications bell, the coverage gate) and its design pass, where the
   app's design store holds a spec, are part of it. Give the critic
   `--no-tickets` when this command got it.
3. **The tickets**: the critic's own ticket stage, unless `--no-tickets`.
   One ticket per root cause, the list shown once, filed after the person's
   yes. When both reviews found the same defect (a page slug the rulebook's
   slug rules flag and the critic's `url-slug` issue), it is one ticket,
   naming the rule and the issue.

End with one summary, in this shape and nothing else:

```text
Review of <app name>
Config review: <verdict> · <P0> P0 · <P1> P1 · <path of its report>      (or: not run: <reason>)
Experience: <critical> critical · <high> high · <minor> minor · <nitpick> nitpick · <path of the critic's report>
Passes: auth <ran | not run: reason> · notifications <ran | not reached> · addresses <n leads> · coverage <complete | incomplete: n items>
Design: <n> of <pages> pages compared with a design (<n> at both widths)      (or: no design)
Tickets: <n> written in RUN/tickets/ · <n> already filed · <n> not written   (or: not written: --no-tickets)
Next: /ua:app-fix-loop with the critic's report; the config review's P0 and P1 through /ua:app-config-review's fix offer.
```

## Self-review

The specific loop's self-review covers the run. One signal is this command's:
when you had to ask what the ask was about, add it to the run the specific
loop opens,
`node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" signals add --run <its run folder> --key router-miss --stage route --reason "<what was missing>"`,
so its self-review and the shared
[self-review rules](../../skills/native-loops/loop-orchestrator/references/self-review.md)
carry it.
