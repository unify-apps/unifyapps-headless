# Debugging an AI agent

## Contents

- What an agent is, for a debugger
- Reproduce
- The cause ladder for agents
- Verify
- Who fixes it

## What an agent is, for a debugger

An AI agent is one record: instructions, a role and a goal, the model it
runs on, capability switches, and what is attached to it: tools (an app
action, an automation, a connector operation), skills, and knowledge sets.
Two things decide every answer, and they disagree more often than expected:

- **The record says what is attached.** `cache agent <id>`, or `get_agent`
  with `agentId` and `full: true` for a miss.
- **The trace says what reached the model.** `read_trace` with the `caseId`
  of a run: the prompt the model was given, the tools it was offered, what it
  called them with, and what came back. The trace decided the answer.

A test message runs the **draft**. The copilot and every deployment serve the
**published** version (`list_deployments` with `agentId`). A report about
"the agent in the copilot" is about the published copy; a fix in the draft
reaches it only after a publish.

## Reproduce

1. The message: the report's words, as the user typed them, with the same
   context when the report names one (a record open, a page). Several
   messages: `send_test_messages` with `agentId` and `messages`, one new
   conversation each, one row per question with its answer, `caseId` and
   `toolCalls`.
2. One message: `send_test_message` with `agentId` and `message`. Keep the
   `caseId` it returns: pass it back as `caseId` to continue the same
   conversation, and the trace needs it.
3. The trace: `read_trace` with that `caseId`. The platform writes it in
   stages over one to two minutes; the tool waits, and when it still answers
   with no model call, read it again in a moment. `modelCalls[]` holds the
   prompt, `toolsOffered`, each tool call with its arguments, and the result.
4. A fluent apology ("I am unable to help with that right now") can mean the
   agent never ran at all. Such a reply carries a `warning`; read the trace
   before believing the answer.
5. Evidence: the message, the answer, the `caseId`, the trace's tool list
   and calls. A tool that writes (a record save, a message sent) runs for
   real in a test message: send one only as a test user, or when the person
   allowed the write.

## The cause ladder for agents

Cheapest read first; stop at the first row whose evidence explains the
answer.

| Symptom | Read | Cause when | Layer |
| --- | --- | --- | --- |
| Dies, or "llmModelId is required", or a fluent apology with a `warning` | `cache agent`, `list_models` with `includeUnusable: true` | the model card's connection is gone (`usable: false`), or only the answer-generation model is set and the main model is not | `environment` |
| Answers from general knowledge, never from the data | the trace's `toolsOffered` | the tool is attached on the record but a capability switch keeps it off, so it never reached the model | `config` |
| Right tool offered, never called | the prompt in the trace, the instructions | the instructions do not say when to use it, or say to answer without it | `config` |
| Tool called with the wrong arguments | the tool call in the trace; the tool's description and input schema on the record | the description or schema misleads the model, or a required input has no source in the conversation | `event` |
| Tool called, wrong or empty result | the result in the trace; for an automation tool, `list_workflow_runs` and `inspect_workflow_run` on the run it started | the automation, API or connector behind the tool failed or returned the wrong rows | `automation` (or the tool's own kind) |
| "I do not know" about a document that is attached | `check_knowledge_status` with `agentId` | the item is not processed yet, or failed indexing | `environment` |
| Refuses or redacts what it should say | `read_guardrails` with `agentId` | a guardrail matches the question or the answer | `config` |
| Right in the test message, wrong in the copilot | `list_deployments`, the published version against the draft | the fix was never published | `environment` |
| Forgets what the user said two turns ago | the memory switch on the record; the trace of the later turn | memory is off, or the context was not passed | `state` |
| Each answer different, sometimes right | five runs of the same message; the trace of a wrong one | instructions leave the choice open, or two tools overlap | `config` |

The entity records and the trace are both read; the fix goes where the
trace shows the gap, not where the record looks fine.

## Verify

The same message, or the same `send_test_messages` set, after the fix and
before any publish: compare the answer and `toolCalls` to the reproduction,
and read one trace. A report about the copilot is verified only after the
publish (`ua-change` § Releases asks first), with the same message in
the published copy. A set of questions worth keeping becomes an evaluation
dataset and experiment (`eval-experiments` skill), so the next change grades
itself.

## Who fixes it

The agent itself (instructions, model, tools, switches, knowledge): the
`agent-builder` builder agent, through `ua-change` with the cause line.
An automation behind a tool: the automation-agent. A connection or a model
card's credentials: the person. A document that will not index: the person,
with the item named.
