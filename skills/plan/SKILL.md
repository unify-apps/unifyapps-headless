---
name: plan
description: Makes a plan for a change to a UnifyApps solution, only when the person asks for one or types /ua:plan — first asks Sonic (a quick plan) or Zen (an in-depth plan), then reads what the change touches, asks only what the reads leave unclear, writes a spec and a task graph, shows it and asks one yes, then runs it through the builder agents with ua-change. Every change asked in chat without a plan goes through ua-change, which hands it to the loop that fits or builds it directly when none does.
allowed-tools: Bash(bash:*), Read, Write, Edit, Task, Skill, AskUserQuestion
---

Load `ua-safety` before your first tenant read.

# Plan a change

Nothing is written on the tenant while planning. Say why when you skip a step that looks expected.

The text after `/ua:plan` is the change the person wants, word for word. With no text, ask what change to plan, in your own words.

Every command runs as `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs" <area> <command> ...` with `--json`.

## Needs a set-up folder

Run `solution context --json` first. On `NOT_STARTED` or `NO_SOLUTION`, load the `setup` skill with the Skill tool, pass the person's message as its opening request, and come back here when setup is done. Any other error code: follow the folder guide's § Errors you may see.

## Sonic or Zen

First ask which plan, with AskUserQuestion, unless the person already said:

- **Sonic**: a quick plan. Reads, a short spec, the task list in chat, one yes, then it runs.
- **Zen**: an in-depth plan. Everything below, with questions, a grill when it is worth it, and a preview page.

Recommend Sonic for a change on a few entities, Zen for a new app, a stored data change or 6 or more entities. The answer is the record's mode: pass `--mode sonic` or `--mode zen` to every `plan propose`.

**Sonic.** Read as [quick-scope.md](../ua-change/references/quick-scope.md) says. Write the tasks ([tasks.md](../ua-change/references/tasks.md)); for a new entity, a delete or a new page also a short spec ([short-spec-template.md](../ua-change/references/short-spec-template.md)) under `.sessions/<sessionId>/drafts/`. Run `plan propose --request "<the person's words>" --task '<json>' --mode sonic --json` for tasks on existing entities, else `plan propose --file <spec.md> --tasks-file <tasks.json> --mode sonic --json`. Fix what its `cacheWarnings` name (a page id, a block name beside its id, an app type the cache disagrees with), or read live. Show one line per task and the defaults you filled in, and ask one yes. On yes, run the same command with `--go` added, then follow `ua-change` § Run a plan.

**Zen** follows the rest of this skill.

## Steps

Zen steps:

| Step | Worth it when | How |
|---|---|---|
| Read | Always | [reads.md](references/reads.md): targets, `solution locate` and where each target belongs ([entity-membership.md](../ua-change/references/entity-membership.md)), the order of work and what must exist first ([order-of-work.md](../ua-change/references/order-of-work.md)), `impact` and `.nebula/solution-map.md` first, live reads only for unknown rows. A field delete is `impact object <id> --change field-delete`. |
| Ask | Only what is still unclear after the reads | [questions.md](references/questions.md), with the question shape and ledger in [questionnaire-template.md](references/questionnaire-template.md). [requirements-checklist.md](references/requirements-checklist.md) is a thinking aid. Often zero questions. |
| Objects | A new object, or changed fields or links | Load `object-schema-designer`. |
| Pages and apps | A new page or app, or a reshaped page | Load `app-page-planner` for the app look and each page's job and design lines. |
| Context graph | A new or changed context graph | Load `context-graph-design`: its questions join the Ask step, its `### Context graph` part ends `## Contract`, and it splits the graph tasks. |
| Spec | Always | [spec.md](references/spec.md), in the shape of [spec-template.md](references/spec-template.md): a title, `## Requested outcome`, `## Touches` and `## Ready when` always; the others when they carry something. |
| Tasks | Always | [tasks.md](../ua-change/references/tasks.md). One task per affected entity, each owned by one builder agent ([task-kinds.md](../ua-change/references/task-kinds.md)). |
| Grill | 5 or more tasks, an unknown impact row, or a stored data change | [grill.md](references/grill.md). Otherwise skip it. |

## Ask with options

Use AskUserQuestion. Put `(Recommended)` in the first option's label. A `You choose` option is fine when sensible defaults would do.

## Check and show the plan

Write two files under `.sessions/<sessionId>/drafts/`: the spec Markdown (with a readable `## Tasks` table: number, what, entity, agent, waits on) and the tasks JSON (the shape `plan propose --help` shows). Keep them saying the same thing. Then run:

```text
plan propose --file <spec.md> --tasks-file <tasks.json> --preview --mode zen --json
```

`--preview` writes the preview page and opens it. `--mode zen` labels the records as an in-depth plan.

A failed check names its reasons: fix the plan and propose again. After 2 failed checks in a row, show the reasons in plain words and ask how to go on.

When it passes, show, in this order:

1. The spec's `## Assumptions` lines, `Check this` lines on top.
2. The preview path (`previewPath`) in one line, so a page that did not open is not missed.
3. The plan, one line per task: `<n>. <what> · <entity> · <agent> · waits on <task numbers, or nothing>`.
4. The steps that will still ask first (`asks`): a release the preview does not name, and every delete.
5. When `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/permissions.mjs" check --json` answers `ok: false`: one line saying that Claude Code's auto mode may refuse the builders' calls while the person is away, until they run `command` from that answer once, in their own terminal (in the desktop app, the Terminal app). Never run it yourself.

Before that, look at `cacheWarnings`: each is a task fact the cache disagrees with (a page id, a block name beside its id, an app type). Fix the task and propose again, or read live when the cache may be old. They never block, so name any you keep in one line.

## One yes

Ask with AskUserQuestion, in your own words, whether to start building. Offer three choices: start it as shown, change something, or keep it for later.

- Start: run `plan propose ... --save --hash <hash> --mode zen --json` with the same files and the printed hash. It is safe to run again after a failure. Then load `ua-change`, start the plan with `plan start <planId> --json` and follow its § Run a plan to the finish.
- Change: ask what to change, apply it, propose again with `--preview` and ask again.
- Later: leave it. The next session start names it.

Never edit the files between the check and the save: only the hash the person saw can be saved.
