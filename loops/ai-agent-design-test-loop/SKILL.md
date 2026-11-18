---
name: ai-agent-design-test-loop
description: Designs and reviews the test cases of a UnifyApps AI agent from its PRD. Each case is a conversation (the user's turns, the tool the agent should call, the expected answer or refusal) citing the requirement and acceptance ids it proves, saved in the agent's tests folder as the source the automate loop turns into an evaluation dataset; the person reviews them in one HTML page whose decisions the loop applies until every case is approved or rejected. Writes nothing to Evaluation and never changes the agent. Use when the person types /ua:ai-agent-design-test-loop, or asks to write or review the test cases or eval cases of an AI agent.
argument-hint: "<agent> [journeys or a ticket that narrows the scope]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion, ToolSearch
---

# AI agent test design

Test design for an agent: the cases are conversations, written from the
PRD and reviewed in one page, in the same shape and with the same tool as an
app's cases.

`N` is `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs"`;
`T` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" target`;
`C` is `node "${CLAUDE_PLUGIN_ROOT}/loops/app-discover-test-loop/scripts/cases.mjs"`.

## Gate

`T "<the ask>" --verb test --mode discover --json`. An app: "This is an app.
Use `/ua:app-discover-test-loop`." An
automation has no test loops: say "An automation is proven by the test runs
of `/ua:automation-build-loop` and `/ua:automation-fix-loop`." and stop.

## Where the cases live

`tests/<agent slug>/design/`, `<agent slug>` the agent's name in lowercase
with hyphens: `cases.json` (the source of truth), `review.html`,
`review-decisions.json`, `cases.md` (the approved list).

## The case shape

The app loop's shape ([cases](../app-discover-test-loop/references/cases.md)),
read for an agent:

- `page`: the journey (`J<n>` from the PRD) or the capability the case
  exercises.
- `steps`: the conversation, one turn per step: `User: "<message>"`, and
  between turns what the agent must do: `Agent calls <tool> with <inputs>`,
  `Agent asks <question>`.
- `expected`: the agent's final answer or behaviour, exact where the PRD is
  exact (`Answers "<text>"`), else the check a judge applies (`Contains the
  order number and the delivery date`, `Refuses and offers the handoff`).
- `source`: the `R<n>` and `A<n>.<m>` ids, or `flow:`, `ticket:`, `live:`.
- `preconditions`: the records and the user the case needs.

## Run it

1. **The PRD.** `N prd get <agent> --part prd --json`; no PRD stops with
   "<agent> has no PRD. Write it with `/ua:ai-agent-scope-loop`, then run
   this again." Journeys, a ticket or a document the person adds narrow or
   add.
2. **Settings**, one AskUserQuestion, at most four questions: the scope
   (the whole PRD or named journeys); add to `cases.json` or start again.
3. **Read**: the PRD; `cases.json` when it exists (keep ids; mark new,
   changed, unchanged); the agent as it is (`N cache agent <agent>`: tools,
   knowledge sets, guardrails, so a case names real tools); the datasets
   the agent already has (`mcp__plugin_ua_evaluation__list_datasets`, `mcp__plugin_ua_evaluation__list_dataset_items` by name), so
   a case already in a dataset is reused, not written again.
4. **Author**: one helper per journey group with the app loop's
   [helper brief](../app-discover-test-loop/references/helper-brief.md), read
   with the case shape above (treat each journey as a page, and give the
   helper the agent's cached configuration in place of an app's page files);
   merge; `C check --cases <cases.json>` until `ok`. One
   happy-path conversation per journey, with the turns as steps; a
   separate case only for a named rule, a guardrail, a material risk (a
   wrong action, a leaked record) or a known wrong answer, named in
   `source`.
5. **Review**: `C review build --cases <cases.json> --out <review.html> --open`;
   tell the person the counts by journey and why each extra case exists;
   wait; `C review apply --cases <cases.json> --decisions <review-decisions.json>`;
   apply the notes, rebuild, ask again until every case is approved or
   rejected. Never decide for the reviewer.
6. **Finish**: `C render --cases <cases.json> --out <cases.md> --app "<agent name>"`;
   the counts, the files, and `Next: /ua:ai-agent-automate-test-loop <agent>`.

## Rules

- Test what the agent should do, from the PRD; never what it answers today.
- `expected` is checkable: exact text, a contains, or a judge rubric in one
  sentence. "Answers helpfully" fails the check.
- Reads only: nothing is written to the agent or to Evaluation.

## Stop fact

Every case is approved or rejected, `cases.md` holds the approved ones, and
the next command is named.

## Outputs

`tests/<agent slug>/design/cases.json`, `review.html`, `cases.md`; the
closing summary `test-design · <agent> · PRD v<n> · <approved> approved · <rejected> rejected · <pending> pending`.

## Self-review

`S` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" signals`.

Before the closing summary, the shared [self-review](../../skills/native-loops/loop-orchestrator/references/self-review.md) rules:

1. `S finish --run tests/<agent slug>/design --json`.
2. Write `tests/<agent slug>/design/self-review.md`: what in this loop's text, briefs, scripts or
   tools made the run slower or wrong, one line each, from the run's files,
   never a transcript.
3. Name each record it says is due in the summary, one line each, and
   offer `/ua:give-feedback`. Send nothing unless the person runs it.
4. End the summary with `Loop review: …`.

During the run, `S add` records a signal the moment the loop knows. A tool
that fails the same way twice and stops the run is counted at once with
`S finish --now` (the hard stop).

## Approvals

The run settings and each review round.
