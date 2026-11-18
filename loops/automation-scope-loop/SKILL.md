---
name: automation-scope-loop
description: Stage one of a UnifyApps automation, or a set of automations that work together. Turns a rough idea, call notes, a draft PRD or an ask to extend existing automations into an approved PRD (triggers, inputs and outputs, steps, systems and connections, rules, requirements with given-then acceptance lines, failure handling, rollout), a plan with one ticket per automation in dependency order, written in rounds with a fresh reviewer and every version saved on the solution; after one yes, files the tickets. Never writes an automation itself. Use when the person types /ua:automation-scope-loop, or asks to write a PRD for, plan or scope an automation, workflow, sync, schedule or integration.
argument-hint: "<idea in words | PRD doc or file> [automation]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion, ToolSearch
---

# Automation scope loop

Stage one of an automation: from what the person has to an approved PRD, a
plan, and tickets that `/ua:automation-build-loop` builds one at a
time. It uses the PRD commands every scope loop shares.
It creates nothing on the tenant: the build loop's first task makes the
empty automation.

Load `ua-safety` before the first tenant read. `N` is
`bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs"`;
`T` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" target`.

## Gate

`T "<the ask>" --verb scope --json`. An app: "This is an app. Use
`/ua:app-scope-loop` (web) or `/ua:native-scope-loop` (mobile)." An AI
agent: "Use `/ua:ai-agent-scope-loop`." An existing automation is read from
the cache (`N cache wf <name or id>`, `--contract`, `--deps`) into Current
state.

## Ways in

| The person gives | Intake reads |
| --- | --- |
| a few sentences, call notes, a transcript | the words; round 1 starts from an empty PRD |
| a draft PRD: a doc, a Markdown file or a PDF | the document, sorted into the PRD's sections; what it leaves open becomes round 1's questions |
| existing automations and what to add | their triggers, contracts, steps, callers and dependents from the cache, into Current state; the PRD covers the change |

## Run it

1. **Run settings**, one AskUserQuestion, at most four questions with
   defaults: the name of the set; the team, project and assignee the tickets carry; the
   environment the first deploy targets (UAT by default); the time zone for
   schedules.
2. **The PRD in rounds**, at most four. Each round: draft in the
   [template](references/prd-template.md) under
   `automation/<slug>/scope-<YYYYMMDD-HHMM>/prd-r<n>.md`; one fresh reviewer
   agent with the [reviewer brief](references/prd-reviewer.md) and the draft;
   at most four questions for the person; revise; `N prd save <slug> --file
   <draft> --base <b> --json` (`<b>` is `new` for the first PRD, else the
   newest approved version; the first save needs `title:` in the draft's
   frontmatter; a later round adds `--record-version <r>` from the last save's
   answer). The reviewer is this PRD's check: `prd check`, and the `issues`
   count `prd save` answers, test an app PRD's sections, so ignore them. The round that leaves no must or should requirement open and no
   blocker ends the PRD. After round four with something still open, park each open
   item as a question with an owner and ask the person to approve the PRD as
   it is, or stop.
3. **PRD approval**: the PRD as a short table (automations with their
   triggers, requirements by priority, systems, open questions parked with
   an owner). On the yes, `N prd approve <slug> --version <n> --record-version
   <r> --json`, with the record version the last save answered.
4. **The plan.** First `N prd get <slug> --json`: when its version is not the
   approved one, save the approved draft again with `N prd save` before
   planning. From the PRD: the objects first (one ticket when any is new,
   built by the FDE agent through the build loop; a new connection is a
   manual ticket for the person, since no agent makes one), then one ticket
   per automation in dependency order (a called automation before its
   caller), each naming its trigger, contract, steps, systems, the acceptance
   lines it proves, and what it depends on. `tickets.json` (`key`, `title`,
   `goal`, `contract`, `acceptance`, `dependsOn`) and the rendered tickets,
   each ending with "Start with `/ua:automation-build-loop <ticket link>`".
5. **Plan approval**: the tickets in build order. On the yes, each ticket
   is written to `RUN/tickets/<slice>.md` with `index.md` in build order,
   for the person to file where their team keeps its work, and
   `N prd tickets <slug> --version <n> --file <filed.json> --json` records
   them, where `filed.json` lists one row per ticket: `slice` (T0, T1…),
   `title`, `key` and `url` once the person gives them, `depends` and
   `requirements`.
6. **Finish** with the PRD version and the tickets in build order with the
   command that starts each.

## Rules

- Acceptance lines are given-then: the records and input before, the
  records, outputs and messages after, and how each is checked. A line the
  build loop cannot replay as a test run is a blocker in review.
- Never an automation, a connection, a deploy or a ticket delete.
- A draft someone else saved is continued only after the person says so; a
  version edited after approval is restored before the plan.

## Stop fact

The PRD version is approved with every open question parked with an owner;
every must and should requirement is in exactly one filed ticket, read back
and named in the index; the tickets are recorded on the version. Or the run stopped at a
question, with what is open.

## Outputs

- The PRD version on the solution, also at `docs/prd/<slug>.md`.
- The run folder: each round's draft and review, `tickets.json`, the
  rendered tickets and their keys.
- The closing summary: `scope · <set> · PRD v<n> · done | stopped: <why>`,
  the automations and triggers, the requirements by priority, the systems,
  the tickets in build order with links, and `Next: /ua:automation-build-loop <ticket link>` per ticket.

## Self-review

`S` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" signals`.

Before the closing summary, the shared [self-review](../../skills/native-loops/loop-orchestrator/references/self-review.md) rules:

1. `S finish --run <run folder> --json`.
2. Write `<run folder>/self-review.md`: what in this loop's text, briefs, scripts or
   tools made the run slower or wrong, one line each, from the run's files,
   never a transcript.
3. Name each record it says is due in the summary, one line each, and
   offer `/ua:give-feedback`. Send nothing unless the person runs it.
4. End the summary with `Loop review: …`.

During the run, `S add` records a signal the moment the loop knows. A tool
that fails the same way twice and stops the run is counted at once with
`S finish --now` (the hard stop).

## Approvals

The run settings, the PRD approval, the plan approval.
