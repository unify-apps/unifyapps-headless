---
user-invocable: false
name: agent-builder
description: "Only for the agent-builder builder agent. Builds and changes a UnifyApps AI agent: its instructions, the model it runs on, the tools it can call, the skills it loads, and the documents it can read. Also runs one, reads back why it answered the way it did, and publishes it. Owns the agent record shape, the four fields an agent needs before it can answer anything, the capability switches that make an attached skill or document reachable, how a bound tool gets its arguments, and how to read a run trace. Load it whenever an AI agent has to be made, changed, tested or published — none of this can be done from a page or an automation."
---

## The agent-builder MCP server

Every tool here is an MCP tool on the `agent-builder` server, which the plugin bridges to the signed-in tenant at `<mcp base>/mcp/agent-builder`. Call them like any other MCP tool. There is no CLI.

**Every call takes `host`.** It is the signed-in tenant's bare host name, with no `https://`, for example `your-tenant.unifyapps.com`. A call without it goes nowhere.

Act on the **live agent**: read it, change it, run it, read the trace. Never work from memory of what an agent holds.

## What an agent is

One record of type `ai_agent`. It holds instructions, a role, a goal, which model runs it, and a set of capability switches. On its own it is a chat bot with a prompt.

Everything else hangs off it as a **separate record that points back at the agent**. Ten kinds:

| On the screen | Stored as | Linked by |
|---|---|---|
| Tools | `e_action_ai_agent` | `aiAgentId` |
| Tasks | `e_topic_ai_agent` | `aiAgentId` |
| Prerequisite Actions | `e_prerequisite_task_ai_agent` | `aiAgentId` |
| Deployments | `ai_agent_deployment` | `aiAgentId` |
| Guardrails | `gaurd_rail` (the platform spells it that way) | `aiAgentId` |
| Prompts | `prompt` | `aiAgentId` |
| Skills | `e_skill_ai_agent` | `accessibleTo` holding `ai_agent/<id>` |
| Knowledge sets | `knowledge_set` | `accessibleTo` |
| Memory | `memoryprofile` | `accessibleTo` |
| Knowledge | `knowledge` | **both** fields |

The link lives on the CHILD, not on the agent, and **using the wrong field returns zero rows with HTTP 200** — which reads exactly like "this agent has none". `get_agent` already knows the right field for each kind, so read through it rather than searching yourself.

There are nine kinds of agent. Two are supported here, in the words the screen
uses: **Advanced** (stored `ai-agent`) and **Simple** (stored `custom-gpt`).
Between them they are 92.4% of a real tenant's agents. The other seven behave
differently enough to need their own testing.

## The four fields an agent needs before it can answer anything

```
useAgentCore: true
topicExecutionSettings.topicExecutionModel        ← the model the runtime really reads
topicExecutionSettings.topicSelectionModel
responseGenerationSettings.answerGenerationModel  ← set it, but it is NOT the one that runs
```

`create_agent` sets what the kind needs when you pass `model`. `get_agent`
reports it back as `readiness`, and `send_test_message` refuses to run an agent
that is missing a field, naming it.

**The list is per kind.** An Advanced agent needs `useAgentCore` — without it
the invoke endpoints are not reachable at all. A Simple agent does NOT: of 33
Simple agents that are deployed, and so demonstrably running, 33 carry
`topicExecutionModel` and none carries `useAgentCore`. Demanding it called every
one of them broken.

**`answerGenerationModel` is the trap.** It reads like THE model field. Set only that and the run either dies with `llmModelId is required to call the LLM`, or worse, looks fine and silently runs a different model.

`useAgentCore` is not in the platform's own schema, so a create refuses it. It goes on afterwards as a separate write. The tools do this; you do not have to.

## The tools

### Reading

- **`list_agents`** — find an agent. The tenant holds thousands, so pass `nameContains`, `kind`, or exact `ids`. A call with nothing to narrow it is refused, because the list endpoint quietly stops at 500 rows and an unfiltered answer would be an arbitrary slice that reads like the whole list. Page with `nextCursor`.
- **`get_agent`** — one agent and all ten kinds of child in one call, plus `readiness` and `capabilities`. Start here before changing anything.
- **`list_models`** — the model cards. `usable: false` means the card points at a connection that is not there; about a third are in that state and picking one fails at run time, not at save. Those are hidden unless you ask. `fills` is the list of slots a card may fill, so pass `forSlot` to narrow.
- **`list_apps`** — the apps whose actions can become tools. Over a thousand; pass `nameContains`.
- **`list_app_actions`** — one app's actions. Name an action to get its input and output schema too.
- **`list_connections`** — the tenant's saved logins. `appName` is matched exactly and in lower case.
- **`list_capabilities`** — every capability the tenant offers, with the key `update_agent` takes. Pass `agentId` to see which ones are on for that agent. A guessed key is refused, so read this first.
- **`describe_entity`** — what the keys on a stored record mean, read from the live schema. Use it when a reply shows a field you do not recognise. `undeclaredKeys` is the important half: keys the schema says nothing about, or is wrong about, that still decide whether a record works.

### Writing

- **`create_agent`** — a new agent configured so it can actually run. Needs a `model` from `list_models`. Takes a `kind`: `advanced` (the default) or `simple`, in the words the screen uses.
- **`update_agent`** — name, description, instructions, role, goal, model, capabilities, all in one write. Everything you leave out is untouched. The reply says which fields moved.
- **`add_tools` / `update_tools` / `remove_tools`** — bind automations as tools.
- **`add_app_action`** — bind an action from a connected app straight to the agent, with no automation in between. A different shape, not a variant: there is no `inputs` block, and the platform reads the arguments from the action's own schema.
- **`list_tasks` / `save_task` / `remove_task`** — a task is a named job inside one agent, with its own instructions and its own set of tools. Use tasks when one agent has to do several different jobs well.
- **`save_skill` / `attach_skills` / `detach_skills`** — write a skill and give it to an agent.
- **The knowledge tools** — documents, websites, apps and data catalogs an agent searches, its own or through a knowledge set several agents share: `upload_file`, `add_knowledge`, `update_knowledge`, `check_knowledge_status`, `attach_knowledge_sets` and the rest. Load the `agent-knowledge` skill before the first one; it owns them.
- **`publish_agent`** — make the draft live. Refuses until `confirmed: true`.

What each write sets is listed in [Settings an agent has](#settings-an-agent-has).

**Every tool that deletes takes `agentId` and `confirmed`.** That is `remove_tools`, `remove_knowledge`, `remove_task` and `remove_deployment` (`remove_knowledge` takes `knowledgeSetId` instead for a set's sources). Each id is read and checked against that agent BEFORE anything is deleted, so one wrong id in a list refuses the whole call rather than costing you the ids before it.

### Where it runs

- **`list_deployments`** — where the agent can be reached, and whether each place is switched on. An agent with none is published and unreachable.
- **`deploy_agent`** — put it in the UnifyApps copilot. Asks first. Channels such as Slack are not made here. It refuses an agent that was never published, because a deployment serves what is PUBLISHED and would otherwise sit there live with nothing to run. On an agent that already has a live copilot deployment, it creates nothing new: it answers `alreadyThere` with the same deployment id. So a plan task's proof that a release landed is never "a newer row in `list_deployments`" — read `publish_agent`'s `publishedVersion` back, or `get_agent`, instead.
- **`remove_deployment`** — take it out of a copilot deployment. It refuses a channel or a schedule, because those are wired to a connection and a trigger automation this route did not create and cannot recreate, and one of those ids refuses the WHOLE call.
- **`read_guardrails`** — the safety rules in plain words. For five of the six, a rule is on by its key EXISTING on the record; there is no per-rule `enabled`, and looking for one reports every configured agent as protecting nothing. **`RedactSensitiveInformation` — "PII Masking" on screen — is the exception.** It carries `enabled` on each sub-part one level down (`regex`, `piiByUA`, `automations`), so presence alone means nothing. Getting that backwards reported an agent with redaction switched off in both places as protected, which is the dangerous direction for a safety rule.
- **`set_guardrails`** — writes the denied topics, the rule that makes an agent refuse a subject. `mode` decides what happens to the topics already there: `add` is the DEFAULT and keeps them, `replace` makes your list the whole list and DELETES the rest. A write that drops anything names what it dropped. The other five rules are read-only here: their nested shapes carry judge models, per-category filter strengths and redaction patterns that have not been measured well enough to write safely.

### Running

- **`send_test_message`** — ask the agent. Runs the SAVED DRAFT, so a change shows up without publishing.
- **`send_test_messages`** — ask a list of up to 60 questions, each in a new conversation, and get one row per question: its answer, `caseId` and the tools the model called (`toolCalls`).
- **`read_trace`** — the prompt the model was actually given, the tools it was actually offered, and what it called them with.

## Settings an agent has

These are all the settings the tools here can write. A setting not named here does not exist on this platform. When a plan or a person asks for one, such as a temperature, say plainly that the agent has no such setting. A plan writes it down as an assumption, never as a task step.

The agent record:

| Setting | Written by | What it holds |
|---|---|---|
| `name`, `description` | `create_agent`, `update_agent` | what the agent is called, and one line about it |
| `instructions` | `create_agent`, `update_agent` | its whole behaviour as prose. An update replaces all of it |
| `role`, `goal` | `create_agent`, `update_agent` | one line each: who it is, and what it is for |
| `model` | `create_agent`, `update_agent` | a model card id from `list_models`. One value fills all three model slots |
| `kind` | `create_agent` only | `advanced` (the default) or `simple` |
| `tags` | `create_agent` only | tags the person asked for; the `UnifyApps Headless` tag is added to every create automatically |
| `capabilities` | `create_agent`, `update_agent` | switches turned on or off by key, such as `loadSkill`. `list_capabilities` lists the keys |
| `memory` | `update_agent` only | the "Enable memory" switch |
| `conversationStarters` | `update_agent` only | the first questions shown in chat. An update replaces the list |

Every input the two tools take: `create_agent {host, name, model, kind, instructions, description, role, goal, tags, capabilities}` and `update_agent {host, agentId, name, description, instructions, role, goal, model, capabilities, memory, conversationStarters}`.

The records that hang off the agent, each with its own tools:

- tools it can call: `add_tools`, `update_tools`, `remove_tools`, and app actions with `add_app_action`
- tasks: `save_task`, `remove_task`
- skills: `save_skill`, `attach_skills`, `detach_skills`
- knowledge, its own and through knowledge sets: the `agent-knowledge` skill
- denied topics: `set_guardrails`. The other five guardrail rules are read-only here
- the copilot deployment: `deploy_agent`, `remove_deployment`

Not settings here: a temperature, top-p or a max-token limit. Neither the agent record nor its model card has one. Prerequisite actions, channels, schedules, memory profiles, evaluation and teams are read-only here.

## The five crossed names

The screen and the store use different words for the same things, and mixing them up sends you to the wrong records. Every one of these has already caused a real mistake:

- screen **Tools** is stored `e_action_ai_agent` — what the model can call
- screen **Tasks** is stored `e_topic_ai_agent` — a topic
- screen **Prerequisite Actions** is stored `e_prerequisite_task_ai_agent` — so the record actually CALLED a task is the one the screen does not call a task
- screen **Advanced** is stored `ai-agent`, screen **Simple** is stored `custom-gpt`
- screen **PII Masking** is stored `RedactSensitiveInformation`, and `read_guardrails` reports it as `redactsSensitiveData` — one rule, three names

The tools here use the screen words. `entityType` is printed in every reply so you can always see which record was touched.

## Writing rules

**Never send a whole-entity update.** These tools never do. There is a second platform write path that REPLACES the properties bag rather than merging it — measured on a real agent, 16 of 17 keys destroyed, and it answered HTTP 200. If you are ever tempted to reach past these tools and write an agent directly, this is why you should not.

**Read back after every write.** Every write here does, and reports which top-level fields moved. A write that reports `changed: []` did nothing, whatever status it returned.

**Detach, do not overwrite.** A skill's `accessibleTo` is shared with every other agent it is attached to. `detach_skills` removes one entry; it never writes the remaining list back.

**Say when a save is not live.** Every write returns `needsPublish: true`. Testing uses the draft, so you can prove a change works before publishing it.

**Writing an agent that is any good** is a separate question from writing one that works.
Read [references/writing-good-agents.md](references/writing-good-agents.md) before writing
or changing an agent's instructions, tasks or tool descriptions, for any kind of job. It
covers what goes where, how to word a rule so a model follows it, grounding and "I don't
know", when to ask, handing over, tasks, tool descriptions, running on several models, and
how to test.

## Binding a tool

**The automation IS the argument list.** A tool record carries no parameter schema of its own — the platform derives the arguments from the bound automation's declared inputs. Bind an automation that declares nothing and the model gets a tool it cannot pass anything to, which looks exactly like the tool stripping its arguments.

So: after `add_tools`, run one `send_test_message` and `read_trace`, and look at `modelCalls[].toolsOffered`. That is the real proof of what the model was handed.

`add_tools` sets the two fields that are easy to miss — `enabled: true` (left out, a tool saves switched OFF with no error) and `topicId: "GLOBAL"` (required, never declared in the schema, used by 73.9% of live tools).

When a tool is never called, or called at the wrong moment, the fix is almost always its **description** — that is what the model reads to decide. Change it with `update_tools` and test again.

## Skills

A skill is a markdown document the agent loads by name when a request matches it. Use one for guidance too long or too situational for the instructions.

`save_skill` writes it. `attach_skills` gives it to an agent, and does two things nothing else does:

1. **Switches the `loadSkill` capability on.** Without it the skill is attached, enabled, and permanently unreachable — the model is never offered the tool that loads it.
2. **Refuses a duplicate name.** Two skills with the same name both attach successfully and the runtime silently uses one and drops the other. Nothing anywhere reports it.

## Capabilities are records, not a map

A capability — `loadSkill`,
`companyKnowledge`, web search — lives in its OWN `e_action_ai_agent` record
carrying `isStandardAction: true`, keyed by its name. The agent also has a
`properties.defaultTools` map, and that map is only the FALLBACK for agents old
enough to have no record. Once a record exists it decides the capability, in
both directions.

So writing `defaultTools` looks right and does nothing, and reading it alone
gives the opposite answer for any agent where a person has used the toggle.
Every tool here goes through one writer. You do not touch this yourself, but if
you ever read an agent record directly, do not believe that map.

## Knowledge

What an agent can search — documents, websites, apps and data catalogs, its own or through a
knowledge set several agents share — has its own skill. **Load the `agent-knowledge` skill before
the first knowledge write.** Two of its rules matter for every agent:

1. **The instructions must tell the agent to search.** With a source attached and nothing in the
   instructions about searching, a test agent answered "not in my knowledge" seven times in a row.
   One line telling it to search, and it quoted the document first try.
2. **Indexing is not instant.** Call `check_knowledge_status` before believing a test that says
   the agent does not know something.

## Testing

`send_test_message` runs the **draft**, which is what you are about to publish. Keep the `caseId` it returns: pass it back to continue the same conversation, and `read_trace` needs it.

Three things it handles that you would otherwise trip on:

- A turn that calls a tool comes back with no answer and no case id. Finding the
  case costs a SECOND run of the same message — the only endpoint that reports
  the id is an invoke, not a lookup — so it is NOT done for you. An agent bound
  to a write automation would write twice. The reply says so; pass
  `runAgainToFindAnswer: true` when the agent only reads.
- Most messages on the way are progress notes — "Searching", "Reading". They are skipped.
- Some replies are fluent apologies that mean the agent never ran at all. When one is spotted the reply carries a `warning`; read the trace before believing it.

### Many questions at once

`send_test_messages {agentId, messages}` asks each question in a new conversation, 4 at a time, and returns one row per question in order: `{message, caseId, answer, toolCalls, traceIncomplete?, note?, error?, platformResponse?}`. It is the tool for an evaluation, where one `send_test_message` and one `read_trace` per question would cost two calls each.

- The platform writes a trace 1-2 minutes after the answer, so the tool keeps reading traces for up to about 2.5 minutes after the last question. A call takes several minutes.
- `toolCalls: []` means the finished trace shows no tool call. A row with `traceIncomplete: true` has no list yet: read its `caseId` with `read_trace` later.
- A question that makes the agent call a tool comes back with no `caseId` and no answer, as with `send_test_message`. Pass `runAgainToFindAnswer: true` to fill those rows, but only for an agent that just reads, since it runs the question twice.
- One failed question makes the reply `ok: false` with every row under `details.rows`. The real reason is often only in the row's `platformResponse`.
- The reply is the only copy of the rows. Write them to a file, and quote from that file.

## Reading a trace

`read_trace` runs the platform's three-step trace chain and hands back `modelCalls`: the prompt the model was given and every tool it was offered.

**The entity records say what is attached. The trace says what reached the model.** Those two disagree more often than you would expect, and the trace is the one that decided the answer. Tool arguments exist only here.

A trace is written in stages — measured at 4 seconds it held two nodes and no model call; at 12 seconds it held five and one was the model call. `read_trace` waits for it. If it still comes back with none, the reply says so; read it again in a moment.

## Traps that answer 200 and do the wrong thing

- Searching a child on the wrong link field: zero rows, HTTP 200, reads like "none".
- A tool saved without `enabled: true`: switched off, no error.
- A skill attached without `loadSkill`: unreachable, no error.
- A document reachable but never searched, because the instructions never say to.
- A test run before the document finished indexing: "I do not know", no error.
- Two skills sharing a name: one silently wins.
- `answerGenerationModel` set alone: a different model runs, or a confusing 500.
- `list_agents` without a filter: an arbitrary slice that looks complete.
- A model card whose connection is gone: saves fine, fails at run time.

## Publishing is not deploying

`publish_agent` makes the saved draft live. It does not put the agent anywhere.
Someone still has to be able to reach it, and that is a deployment.

So the last two steps are both needed, in this order: publish, then deploy. Deploying
first ships whatever was published before, silently — `deploy_agent` warns when the
draft is ahead, but the order is the real fix.

Almost every deployment on the tenant is the copilot: 489 of 500 sampled. A channel
such as Slack needs a live connection and a trigger automation, and is not made here.
There are only 7 on the whole tenant, so each one is somebody's real integration.

## Publishing

`publish_agent` makes the draft live for everyone using that agent, so **ask the person first** and pass `confirmed: true` only after they say yes. A UnifyApps Headless builder gets this yes in its task message under `Answer from the person`, and does not ask again. The platform automation answers the bare string `"success"` and nothing else, so the tool re-reads the agent and reports the published version.

`needsPublish` compares the agent's own version against the deployed one. Not against `deploymentState.version`, which counts deployments — on a real agent those read 126 and 4.

## Reference files

| File | Read it when |
|---|---|
| [references/writing-good-agents.md](references/writing-good-agents.md) | before writing or changing an agent's instructions, tasks or tool descriptions |
