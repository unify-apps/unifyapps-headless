---
name: context-graph-agent
description: Only for the agent-builder builder agent. Use when a real context graph needs a read-only Q&A agent, a discoverer or a cleaner, with its model connection, graph search binding, access and runtime evidence.
user-invocable: false
---

# Context graph agent

Read [references/agent-lifecycle.md](references/agent-lifecycle.md) whenever the plan names a consumer, discoverer, cleaner or enricher. Each planned role is its own `ai-agent` task. A required role with no agent ID and runtime evidence is still planned, even when another task is working.

## Workflow

Read compatible agents, graph scope, intended users and agreed questions. Use the shared agent-builder tools for the agent lifecycle: `list_agents`, `get_agent`, `list_models`, `create_agent` and `update_agent`. Attach an existing compatible agent when one matches. Otherwise create one with minimal read-only instructions and read it back before attachment. Choose Simple or Advanced from the needed behavior, then inspect the readiness reported by `get_agent`; the two kinds have different runtime requirements.

Attach the agent to one explicit graph. Bind only the graph search (`bind_graph_search`), which runs bounded read-only Cypher. Select an explicitly available model connection. Do not copy a production agent's model, tools or permissions by default.

Read back effective attachment, tool scope, model connection and access. Validate configuration, then test known, relationship, missing, ambiguous, incomplete and denied questions. Verify the answer is grounded in real graph retrieval with source references. Configuration alone does not prove consumption.

Use `send_test_message` for the saved draft and retain its case ID for `read_trace`. Use `publish_agent` and the deployment tools when the agreed delivery needs publication or a channel. A passing draft test does not prove deployment or graph retrieval.

## Agent components

- Use `add_tools` only for an explicitly scoped automation-backed tool. Keep the graph consumer read-only unless the person requests write behavior.
- Use knowledge tools for documents and websites, then check indexing status. They do not replace a scoped graph-search binding. Use skill tools and guardrail tools when the agreed behavior needs them.
- Change capabilities through `update_agent` and verify with `get_agent`. Capability records override legacy defaults; do not edit `defaultTools` manually or delete a record to turn a capability off.
- Use `list_connections` for the agent connection catalogue and `list_apps` for the app catalogue, on the `agent-builder` server. The composed `context-graph` route serves the same two catalogues as `list_agent_connections` and `list_agent_apps`, because there the plain names are the automation catalogues; `agent-builder` is not given those aliases.

## Graph search tool

- Give the agent the graph's real node labels, edge names and property names in its instructions, read from the live graph. It cannot guess them.
- Send one test message before other checks. If the model returns an empty reply, pick another model connection that supports tool calls.
- Test a record with several links. The answer must list all of them.
- Put these query rules in the agent instructions: every `RETURN` includes `labels(v) AS labels` and `v.modelId AS modelId`; never match with an inline `{prop: value}` map, match the label then filter with `WHERE toLower(coalesce(v.<prop>, '')) CONTAINS '<text>'`.
- A question about what is missing (records with no author, people with no tickets) is answered by a graph pattern, `OPTIONAL MATCH` with `WHERE b IS NULL` or `NOT EXISTS`, never by searching a word from the question as a name. Matching a word from the question, such as "unknown", as a name can return the right answer by luck instead of by evidence. Put that rule in the instructions and test it with the spec's not-found question.

## Safety and evidence

Creating an agent does not attach it, enable a graph tool, publish it, or grant access. Keep those states visible in the report. Detaching an agent leaves graph data intact. Access to the agent is `set_graph_agent_access`, one role per user or group; access to the graph its users read is `share_context_graph`, a graph-agent tool in a `graph` task.

Use the explicit graph ID when binding the graph search action. An agent name or creation result does not establish graph access. If creation reports a saved agent ID followed by a configuration failure, read that agent and resume its configuration with the current version. Do not create a duplicate. Inspect structured platform error details before diagnosing an HTTP 500 as a platform outage; schema validation can also return that status.

For a source processor, create its runnable agent with `create_agent`, then call `configure_graph_processor` with that ID and current version to configure structured output. Use discovery mode for root classification fields. Read the enricher schema before choosing the extracted-record shape because the contract may expose structured fields directly or an array. Publish the processor inside its `ai-agent` task, read its discoverer or enricher schema, and report the published version in `ids` and `notes`; the `graph` task attaches it to the source with `configure_context_graph_source_discovery`, which only `graph-agent` calls. Keep the entity version used for edits separate from the deployment version used for processor selection.

Keep the read-only consumer separate from source processors. The consumer binds a validated graph query tool. The discoverer classifies full source records. The cleaner or enricher extracts canonical records. A cleaner configuration is not proof that duplicate records converged. Apply the lifecycle completion gate before reporting any of these roles as built.

Use MCP for every platform action; never scripts, raw HTTP or browser writes.
