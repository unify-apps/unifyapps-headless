---
name: ai-agent-scope-loop
description: Stage one of a UnifyApps AI agent. Turns a rough idea, call notes, a draft PRD or an ask to extend an existing agent into an approved PRD (its job, users and channels, conversations, requirements with example exchanges as acceptance lines, instructions outline, tools, knowledge, guardrails, models, rollout), a plan of the agent's parts and one ticket per capability, written in rounds with a fresh reviewer and every version saved on the solution; after one yes, creates the empty agent and files the tickets. Never writes instructions, tools or knowledge itself. Use when the person types /ua:ai-agent-scope-loop, or asks to write a PRD for, plan or scope an AI agent, assistant or chatbot.
argument-hint: "<idea in words | PRD doc or file> [agent]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion, ToolSearch
---

# AI agent scope loop

Stage one of an AI agent: from what the person has to an approved PRD, a
plan of the agent's parts, and tickets that `/ua:ai-agent-build-loop`
builds one at a time. It uses the PRD commands every scope loop shares, the
PRD commands every scope loop shares, and one plan through UnifyApps Headless for the empty agent.

Load `ua-safety` before the first tenant read. `N` is
`bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs"`;
`T` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" target`.

## Gate

`T "<the ask>" --verb scope --json`. An app: say "This is an app. Use
`/ua:app-scope-loop` (web) or `/ua:native-scope-loop` (mobile)." and stop.
An automation: "Use `/ua:automation-scope-loop`." A new agent is declared
by the person's words; an existing one is read from the cache
(`N cache agent <name or id>`) into the PRD's Current state.

## Ways in

| The person gives | Intake reads |
| --- | --- |
| a few sentences, call notes, a transcript | the words; round 1 starts from an empty PRD |
| a draft PRD: a Google Doc, a Claude doc, a Markdown file or a PDF | the document, sorted into the PRD's sections; what it leaves open becomes round 1's questions |
| an existing agent and what to add | its instructions, tools, knowledge sets, skills, guardrails and deployments from the cache, into Current state; the PRD covers the change |

## Run it

1. **Run settings**, one AskUserQuestion, at most four questions with
   defaults: the agent's name; the team and project the tickets are for and the assignee;
   the first channel (platform chat by default); the model when the person
   has a rule.
2. **The PRD in rounds**, at most four. Each round: draft the PRD in the
   [template](references/prd-template.md) under
   `ai-agent/<agent slug>/scope-<YYYYMMDD-HHMM>/prd-r<n>.md`; dispatch one
   fresh reviewer agent (`general-purpose`) with the
   [reviewer brief](references/prd-reviewer.md) and the draft, never the
   chat; turn its findings and the open sections into at most four questions
   for the person; revise; `N prd save <agent> --file <draft> --base <b> --json`
   (`<b>` is `new` for the first PRD, else the newest approved version; the first save needs `title:` in the draft's frontmatter; a later round
   adds `--record-version <r>` from the last save's answer), so every teammate
   reads the same draft. The reviewer is this PRD's check: `prd check`, and the
   `issues` count `prd save` answers, test an app PRD's sections, so ignore them. The round that leaves no must or
   should requirement open and no reviewer blocker ends the PRD. After round four with something still open, park each open
   item as a question with an owner and ask the person to approve the PRD as
   it is, or stop.
3. **PRD approval**: the PRD as a short table (requirements by priority,
   journeys, tools, knowledge, open questions parked with an owner). On the
   yes, `N prd approve <agent> --version <n> --record-version <r> --json`, with
   the record version the last save answered.
4. **The plan.** First `N prd get <agent> --json`: when its version is not the
   approved one, save the approved draft again with `N prd save` before
   planning. From the PRD: the parts of the agent and the order they are
   built: T0, the empty agent with its model, persona and the instructions
   skeleton; then one slice per capability (a journey or a requirement
   group), each naming the instructions it adds, the tools (an existing
   automation or app action, or a new automation the automation agent
   builds first), the knowledge it needs, the guardrail it adds, and the
   acceptance lines it proves. Write `tickets.json` (`key`, `title`, `goal`,
   `contract`, `acceptance`, `dependsOn`) and the rendered tickets, each
   ending with "Start with `/ua:ai-agent-build-loop <ticket link>`".
5. **Plan approval**: the tickets in build order and, for a new agent, the
   empty agent to be made. On the yes: a one-task plan through `ua-change`
   (`ai-agent` kind, the agent-builder agent: `mcp__plugin_ua_agent-builder__create_agent` with the name,
   model, persona and the instructions skeleton; read back with
   `mcp__plugin_ua_agent-builder__get_agent`), then each ticket written to
   `RUN/tickets/<slice>.md` with `index.md` in build order, for the person
   to file, and `N prd tickets <agent> --version <n> --file <filed.json> --json`
   records them, where `filed.json` lists one row per ticket: `slice`
   (T0, T1…), `title`, `key` and `url` once the person gives them,
   `depends` and `requirements`.
6. **Finish** with the PRD version, the agent id, and the tickets in build
   order with the command that starts each.

## Rules

- The PRD's acceptance lines are example exchanges, word for word: they are
  what the build loop replays and what the evaluation dataset is made from.
- Never creates a tool or a knowledge set, writes instructions beyond the
  skeleton, publishes, or deletes a ticket; a dropped slice gets a
  comment on its ticket.
- A draft of the same PRD someone else saved is continued only after the
  person says so. A version edited after its approval is caught by `prd get`
  and restored before the plan is made.
- Reads the cache first and the tenant only for what the cache lacks.

## Stop fact

The PRD version is approved with every open question parked with an owner;
every must and should requirement is in exactly one filed ticket, read back
and named in the index; the tickets are recorded on the version; the agent exists (a new
one, empty) and the cache knows it. Or the run stopped at a question the
person must answer, with what is open.

## Outputs

- The PRD version on the solution, also at `docs/prd/<agent slug>.md`.
- The run folder: each round's draft and review, `tickets.json`, the
  rendered tickets and their keys.
- The closing summary: `scope · <agent> · PRD v<n> · done | stopped: <why>`,
  the requirements by priority, the journeys, the tools and knowledge, the
  tickets in build order with their links, the agent id, and
  `Next: /ua:ai-agent-build-loop <ticket link>` per ticket, T0 first.

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

The run settings, the PRD approval, the plan approval. Saving a draft asks
nothing: it changes no approved version.
