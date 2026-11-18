# The loop template

A loop built here is one folder. It runs in any folder set up for this
solution, from `.claude/skills/<name>/`, by people who never saw the session
it came from. It is not part of the plugin, so `${CLAUDE_PLUGIN_ROOT}` is
empty there: it reaches the CLI the way the folder's own `CLAUDE.md` says.

## Contents

- The folder
- SKILL.md
- Rules for the text
- Scripts

## The folder

```text
<name>/
  SKILL.md          the loop: when to run it, its inputs, stages, stop rule
  references/       what a stage reads but does not change: field lists, checklists, made-up samples
  scripts/          what a stage runs: a calculation, a transform, a check
  assets/           templates a stage copies and fills in
```

Only the folders the loop needs, and text files only.

## SKILL.md

```markdown
---
name: <name>
description: <What it does, in one or two sentences, then "Use when the person types /<name>, or asks to <the asks that should start it>.">
argument-hint: "<inputs>"
---

# <Title>

`/<name> <inputs>`

<One paragraph: the goal, and what done looks like.>

Load `ua:ua-safety` before the first tenant read. Build every change
through `ua:ua-change`. <Only when the loop reads or changes the tenant.>

The CLI runs the way this folder's `CLAUDE.md` says, in its UnifyApps
Headless guide: "Every command runs as `node "<path>" <area> <command>`".
Use that exact path, with `--json`. <Only when a stage runs the CLI.>

Paths to this skill's own files are relative to its folder. Claude Code
gives that folder's path when the skill loads.

The run folder is `loops/<name>/<YYYYMMDD-HHMM>/` in the working folder.
Every file the run writes goes there.

## Inputs

| Input | Required | Default | Ask when missing |
| --- | --- | --- | --- |

## Stages

### 1. <Stage>

<What it does.> Tools: `<exact full tool name>`, `<exact command>`.

Check: <what proves this stage worked, read live, never assumed>.

Rules: <the corrections the session made, as rules>.

### n. Self-review

Before the summary, write `self-review.md` in the run folder: at most five
lines on what in this skill's text, scripts or tools made the run slower or
wrong, and what it should say instead. Read the `self-review.md` of the
earlier runs under `loops/<name>/`. When a line is already in one of them,
tell the person and suggest rebuilding the loop with `/ua:identify-loops`.
Suggest `/ua:give-feedback` only when the problem is in a UnifyApps
Headless tool or command, not in this skill.

## Stop

Done when <the condition>. Gives up when <the condition>, and says what is
left. Never <the writes it must not make without a yes>.

## Finish

<The one summary it ends with: what changed, what was checked, what is left.>
```

## Rules for the text

- Say which builder agent a stage briefs, not how the agent works.
- Exact tool names in full (`mcp__plugin_ua_automation-code__list_workflow_runs`),
  never a short form.
- Every delete waits for the person's yes in an `AskUserQuestion`, always.
  Every write, deploy or publish waits too, unless the person asked in the
  inputs for an unattended run.
- No value from the session that names a client, a tenant, an entity or a
  record. Each becomes an input.
- Write for a reader who was not there: no "as before", no "the usual".

## Scripts

- Node (`.mjs`) with no packages to install.
- Input from arguments or a file, output as JSON on stdout, errors on stderr
  with a non-zero exit.
- No tenant calls from a script: the tenant is reached through the MCP tools
  and the CLI, which hold the sign-in and the safety checks. A script works
  on what a stage already read.
- No secrets in a script or as a default. A value the person gives at run
  time is an argument.
