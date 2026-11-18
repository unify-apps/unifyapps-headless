---
name: ai-agent-fix-loop
description: Fixes a UnifyApps AI agent that answered wrongly. Takes a conversation that went wrong (its words or a trace), a ticket, or the low-scoring cases of an evaluation run; reproduces each with a test message, reads the trace, finds the cause layer by layer (instructions, a tool and its automation run, knowledge, a guardrail, the model), fixes it through the agent builder as a plan, replays the same message and the evaluation cases it touched, and writes a before/after table. Never publishes without the publish approval. Use when the person types /ua:ai-agent-fix-loop, or says an AI agent, assistant or chatbot answers wrongly, calls the wrong tool, refuses, or scored badly.
argument-hint: "<what went wrong | ticket | experiment run id> [agent]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion, ToolSearch
---

# AI agent fix loop

Fix what is wrong with an agent, one issue at a time, each reproduced before
it is touched and replayed after.

Load `ua-safety` before the first tenant read. `N` is
`bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs"`;
`T` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" target`;
`RUN` is the run folder `ai-agent/<agent slug>/fix-<YYYYMMDD-HHMM>/`.

## Gate

`T "<the ask>" --verb fix --json`. An app: "This is an app. Use
`/ua:app-fix-loop` or `/ua:native-fix-loop`." An automation: "Use
`/ua:automation-fix-loop`." A ticket about an agent is this loop's. Continue with the agent `T`
names; when it names none or several, ask once which.

## Ways in

| The person gives | The issues are |
| --- | --- |
| a conversation that went wrong: the words, a transcript, a trace id | one issue: the user's message and what the agent should have done, from the PRD's acceptance line when one covers it (`N prd get <agent> --part prd`) |
| a ticket or a list | one issue per ticket: open [ticket sources](../../skills/native-loops/loop-orchestrator/references/ticket-sources.md) § Read a ticket and follow its steps (or read the ticket file a front door wrote), for the description, every comment (a later one outranks the description), and every screenshot and recording |
| an experiment run id | one issue per case under its metric's threshold, from `mcp__plugin_ua_evaluation__get_run_results` and `mcp__plugin_ua_evaluation__experiment_scorecard`: the input, the expected output, the score and the judge's reason |

## Run it

1. **Run settings**, one AskUserQuestion, at most four questions: the test
   user or channel to replay as; whether a tool's automation may be
   redeployed when its test run passes (yes on UAT); the write-back.
2. **The before.** When the agent has an experiment, run it once now
   (`mcp__plugin_ua_evaluation__start_experiment_runs`) and keep its scorecard as the before. Then
   **reproduce** each issue in `RUN/issues/<n>/`: `mcp__plugin_ua_agent-builder__send_test_message` with the
   same words (or `mcp__plugin_ua_agent-builder__send_test_messages` for the turns before it), save the
   answer and `mcp__plugin_ua_agent-builder__read_trace`. If two replays do not give the wrong answer, ask the person once what
   differs (the channel, the user, the data), then park it as unreproduced.
3. **Cause**, layer by layer, written as one line each in `cause.md`:
   the instructions (the sentence that led here, or the one missing); the
   tool (the trace's call and its automation run through
   `mcp__plugin_ua_automation-code__inspect_workflow_run`: wrong inputs, a failed step, a wrong answer);
   the knowledge (what was retrieved, what should have been); a guardrail
   (a refusal that fired, or did not); the model. Stop at the first layer
   that explains the answer; name it in the issue.
4. **Fix** as a plan through `ua-change`: an `ai-agent` task for the agent
   builder (the instructions change, a tool's inputs, the knowledge, the
   guardrail), an `automation` task for the automation agent when the tool's
   automation is at fault, an `object` task for the FDE agent when the data
   is. Jobs on different parts run in parallel; the plan approval lists
   them.
5. **Retest**: replay each issue's message; then the evaluation cases that
   touch the same part (`mcp__plugin_ua_evaluation__start_experiment_runs` on the agent's experiment
   when one exists, the scorecard before and after). A fix that makes another replayed message or evaluation case worse is
   reverted by a new plan task and tried again; three attempts, then ask the
   person once: accept, try once more, or stop.
6. **Finish**: `N plan finish`; the before/after table; the comment
   and status when asked; `N prd classify` when the fix changed what the PRD
   says. Publishing waits for the publish approval: offer it, call `mcp__plugin_ua_agent-builder__publish_agent` only after a yes.

## Rules

- Every fix is a plan task with a read-back; the loop never calls
  `mcp__plugin_ua_agent-builder__update_agent` itself.
- Replay against the draft agent as the test user; never a customer's
  conversation.
- An issue in an automation the agent calls is fixed by the automation
  agent and re-proven by its own test run before the agent is replayed.
- A low score the judge explains as a wrong expectation (the case, not the
  agent) is a case fix for `/ua:ai-agent-design-test-loop`, not an agent
  change; say so and park it.

## Stop fact

Every issue is verified by its replay, accepted by the person, parked with
its reason, or stopped at the person's choice;
the experiment, when one exists, scores no worse than before on every
metric; the before/after table is written.

## Outputs

- `RUN/issues/<n>/` (message, answer before, trace, `cause.md`, answer after),
  `before-after.md`, `RUN/self-review.md`, the builders' reports.
- The closing summary: `fix · <agent> · <fixed>/<issues> · done | stopped: <why>`,
  one line per issue (cause layer, fix, verdict), the scorecard before and
  after, and `Next:` the open issues or `/ua:ai-agent-run-test-loop <agent>`.

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
