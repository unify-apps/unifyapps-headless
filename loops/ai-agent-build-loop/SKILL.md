---
name: ai-agent-build-loop
description: Builds one ticket or capability of a UnifyApps AI agent and proves it. Plans the agent's parts the ticket needs (instructions, tools, knowledge, skills, guardrails; a new automation a tool calls; an object it reads), builds them through the agent builder and the other builder agents as a plan, then replays every acceptance line of the ticket as a test message and reads the trace, fixing and retrying until each line passes or is accepted; keeps the PRD current. Never publishes without the publish approval. Use when the person types /ua:ai-agent-build-loop, or asks to build or extend an AI agent from a ticket, a PRD or a description.
argument-hint: "<ticket link | capability in words> [agent]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion, ToolSearch
---

# AI agent build loop

One ticket or capability at a time: planned, built by the agent builder
(with the automation agent for a new tool, the FDE agent for data, the app
agent for a page), and proven by replaying its acceptance lines as test
messages, each trace read.

Load `ua-safety` before the first tenant read. `N` is
`bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs"`;
`T` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" target`;
`RUN` is the run folder `ai-agent/<agent slug>/build-<YYYYMMDD-HHMM>/`.

## Gate

`T "<the ask>" --verb build --json`. An app: say "This is an app. Use
`/ua:app-build-loop` (web) or `/ua:native-build-loop` (mobile)." and stop.
An automation: "Use `/ua:automation-build-loop`." An agent that does not
exist: "Scope it first with `/ua:ai-agent-scope-loop`."

## Run it

1. **The ask.** A ticket: open
   [ticket sources](../../skills/native-loops/loop-orchestrator/references/ticket-sources.md)
   § Read a ticket and follow its steps (or read the ticket file a
   front door wrote), then take from the description, every comment, and
   every screenshot and recording in them: its goal, contract and acceptance
   lines, the PRD ids it cites, and what the comments added or changed. Words:
   the capability as the person said it; the PRD (`N prd get <agent>
   --part prd --json`) supplies the `R<n>` and `A<n>.<m>` lines it maps to, or
   the run writes new acceptance lines in the same shape and shows them in
   the plan approval. The agent as it is: `N cache agent <agent>` (refresh
   when stale).
2. **Run settings**, one AskUserQuestion, at most four questions: the test
   user or channel the proof runs as; whether a tool's automation may be
   deployed when its test run passes (yes on a UAT tenant); the ticket
   write-back (a comment and a status, written for the person to apply) at
   the end.
3. **The plan**, a `ua-change` spec and tasks under `RUN/`, in build order:
   `object` tasks (`ua:fde-agent`) for data the agent reads; `automation`
   tasks (`ua:automation-agent`: shell, logic, a test run, deploy) for a new
   tool; `ai-agent` tasks (`ua:agent-builder`): the instructions change, the
   tools attached (`mcp__plugin_ua_agent-builder__add_tools`, `mcp__plugin_ua_agent-builder__add_app_action`), the knowledge
   (`mcp__plugin_ua_agent-builder__add_knowledge`, `mcp__plugin_ua_agent-builder__attach_knowledge_sets`), the skills (`mcp__plugin_ua_agent-builder__attach_skills`),
   the guardrails (`mcp__plugin_ua_agent-builder__set_guardrails`), each read back with `mcp__plugin_ua_agent-builder__get_agent`; a
   `page` task (`ua:app-agent`) only when the ticket says a page shows the agent. The spec's
   `acceptance` rows are the ticket's lines word for word. `N spec check`,
   then `N plan propose --mode zen`, the plan approval, `N plan start`.
4. **Build it**: `ua-change` § Run a plan as written; each builder reports
   its read-back; a question becomes `needs_confirmation` and is asked once.
5. **Prove it.** For every acceptance line, in `RUN/accept/<n>/`: `mcp__plugin_ua_agent-builder__send_test_message`
   to the agent with the user's words (or `mcp__plugin_ua_agent-builder__send_test_messages` for a
   multi-turn line), save the answer, `mcp__plugin_ua_agent-builder__read_trace` for the tools called and
   the knowledge retrieved, and judge the line by its own check (exact text,
   contains, the tool called with the inputs named, the refusal). Write
   `result.md` per line: pass, or fail with the answer, the trace and what
   differed.
6. **Fix and retry.** A failed line becomes one fix task for the part at
   fault (instructions, a tool, knowledge, a guardrail, the model), the
   plan revised, the same builder, then the line replayed; three attempts,
   then ask the person once (AskUserQuestion): accept the line as it is, try
   once more, or stop; a stop lists the line as open.
7. **Finish**: `N plan finish`; `N prd classify` and the next PRD version
   when the build changed what the PRD says; the write-back on the
   ticket when the settings said so; the closing summary. Publishing waits for the publish approval: offer it, and call `mcp__plugin_ua_agent-builder__publish_agent`
   only after a yes.

## Rules

- The agent builder writes the agent; this loop never calls `mcp__plugin_ua_agent-builder__update_agent`
  itself. Every change is a plan task with a read-back.
- A test message runs against the draft agent, as the test user or channel
  the settings named; never against a published version a customer uses.
- A tool's automation deploys only after its own test run passes, and asks
  first off UAT.
- Reads the PRD, keeps it current, never rewrites its approved version.

## Stop fact

Every acceptance line of the ticket passed its replay, or was accepted by
the person; the plan is finished; the PRD is current; the ticket carries its
write-back when asked. Or the run stopped at the person's choice, with what is
open.

## Outputs

- `RUN/`: the spec, the tasks, `accept/<n>/` (message, answer, trace,
  result), the builders' reports, `board.md`, `self-review.md`.
- The closing summary: `build · <agent> · <ticket> · <passed>/<lines> · done | stopped: <why>`,
  each line's verdict, what was built (instructions, tools, knowledge,
  skills, guardrails, automations), the open lines, and `Next:` the next
  ticket or `/ua:ai-agent-design-test-loop <agent>`.

## Self-review

`S` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" signals`.

Before the closing summary, the shared [self-review](../../skills/native-loops/loop-orchestrator/references/self-review.md) rules:

1. `S finish --run RUN --json`.
2. Write `RUN/self-review.md`: what in this loop's text, briefs, scripts or
   tools made the run slower or wrong, one line each, from the run's files,
   never a transcript.
3. Name each record it says is due in the summary, one line each, and
   offer `/ua:give-feedback`. Send nothing unless the person runs it.
4. End the summary with `Loop review: …`.

During the run, `S add` records a signal the moment the loop knows. A tool
that fails the same way twice and stops the run is counted at once with
`S finish --now` (the hard stop).

## Approvals

The run settings, the plan approval, the deploy approval off UAT, the
publish approval, the choice after three failed attempts.
