# Context graph agent lifecycle

Read it when a task creates, attaches, publishes or checks a context graph's consumer, discoverer or cleaner agent.

## Contents

- [Manifest](#manifest)
- [Role states](#role-states)
- [Shared creation and recovery](#shared-creation-and-recovery)
- [Consumer lifecycle](#consumer-lifecycle)
- [Consumer instruction pattern](#consumer-instruction-pattern)
- [Discoverer lifecycle](#discoverer-lifecycle)
- [Cleaner lifecycle](#cleaner-lifecycle)
- [Completion gate](#completion-gate)

Give one `ai-agent` plan task to every platform agent role the accepted spec names. The normal role set is:

| Role key | Platform purpose | Binding | Runtime evidence |
|---|---|---|---|
| `consumer` | Answer user questions from the graph | One validated read-only graph search action | A live question, case ID, trace, graph retrieval and grounded answer |
| `discoverer` | Classify each full source record | Source discovery config | Discoverer schema, saved config read-back and classified source fields |
| `cleaner` | Extract canonical records for an entity | Enricher entry on the source discovery config | Enricher schema, saved config read-back and projected records keyed by stable identity |

Keep these as distinct agents by default. The consumer has graph read tools and user access. A discoverer or cleaner receives source records and emits structured data. It does not need a graph search tool. Combine discovery and cleaning in one agent only when the accepted design says so and both processor schema endpoints verify the same published version.

## Role states

Track each role's `ai-agent` task through these states, in its report's
`notes` and in the plan's task result: `planned`, `selected`, `configured`,
`bound`, `published`, `runtime_verified`, `blocked` and `not_required`. Use
`not_required` only when the accepted spec removes that role. A task with no
agent ID in `ids.entity` means the build is incomplete. A planned agent name
is not an agent definition.

Advance a state only from a platform read-back, never from a write response
alone. Quote the read-back line that proves it, and the tool name it came
from. Keep the error text when a state becomes `blocked`.

## Shared creation and recovery

Use the agent-builder lifecycle. Do not add a graph-specific creation path.

1. Call `list_agents` and `get_agent` before creation. Reuse an agent only when its role, instructions, model and attachments match this manifest entry.
2. Call `list_models`. Select a visible active connection and a model that supports the role. Prefer a smaller compatible model for classification or extraction after a representative quality check. Record the selected model ID.
3. Call `create_agent` once. If creation returns an ID and later configuration fails, keep that ID, read it with `get_agent`, and continue with its current version. Do not create a replacement.
4. Use `update_agent` only for fields exposed by its discovered schema. Read back with `get_agent`. Require `readiness.canRun: true` before processor publication or consumer testing.
5. Call `publish_agent` only after configuration and binding read-back. Agent components such as tools are separate entities. Attaching and publishing one can advance the parent agent version after the first agent publish. After the final component binding, read `get_agent`, publish that current agent version, then read it again. If the read-back still reports `needsPublish: true` because the component relation advanced the version, publish the new current version once and read it back again. Reuse the existing tool ID. Do not create a duplicate binding to make the versions match. A discoverer or cleaner is published here, inside its own `ai-agent` task, because the source configuration that binds it names a published version; the consumer is published by its `publish` task after the person's yes.

## Consumer lifecycle

1. Create or select the `consumer` through the shared lifecycle.
2. Read `get_context_graph_consumer_context`. Put the exact node labels, property names and relationships in the consumer instructions. Keep the instructions read-only and bounded.
3. Call `bind_graph_search` with the explicit graph ID and the search automation the graph task deployed. The binding verifies that automation is the exact three-node shape `context-graph-sources/references/build-order.md` step 10 describes (callable `cypherQuery` in, one OpenCypher step on the graph's connection with RBAC on, its outputs returned) and refuses any other, naming the failed checks; a refused automation is the graph task's to rebuild, so report `needs_confirmation` with the checks rather than binding something else. This creates the scoped agent tool. Do not treat saved `graphModelId` metadata or `get_graph_agent_access` as binding proof.
4. Read `get_agent`. Require the returned tool list to contain the enabled tool ID from `bind_graph_search`. Read `get_graph_agent_access` separately for user access. Its graph role rows do not prove tool binding.
5. Do not publish in this task. The consumer is published by its own `publish` task after the person's yes: that task publishes the current agent version, applies the shared relation-version check above, and confirms `published: true` and `needsPublish: false`.
6. Call `send_test_message` with an agreed question. It runs the saved draft, which the `publish` task then releases unchanged. Start a fresh case for each acceptance question, so earlier messages cannot supply the answer. Keep its case ID. Call `read_trace` and require the expected read-only tool call plus graph-shaped evidence before marking `runtime_verified`. An answer alone is insufficient. A pending or error result remains pending or blocked.

Consumer notes:

- Put the exact labels, `_pr_` names and edges in the instructions, with two example queries. The model then writes correct Cypher on the first try.
- Tell it to show names, not raw `<@U…>` mentions, by reading the Person node.
- Access is a role grant to a user or group: `set_graph_agent_access` on the agent, and `share_context_graph`, a graph-agent tool in a `graph` task, when those users must read the graph itself. Grant the group the spec's `users_access` row names; "everyone" is never a grant.
- A trace is about 100 KB. Check it by searching for the tool name and one returned value.
- `publish_agent` can time out and still succeed. Read `get_agent` before you retry.

The consumer must not receive connector write actions, source record mutation tools or cleanup instructions unless the person explicitly changes the accepted scope.

## Consumer instruction pattern

Write the consumer's instructions to this pattern. It fixes the most common failure: answering from whichever source replies first.

1. State the core rule: no single source is complete. The graph and a knowledge base, when both exist, hold different, non-overlapping facts.
2. Search the graph exhaustively. Resolve identity first, then query every relevant relationship type — not just the first one that returns rows.
3. Put the Cypher rules from `SKILL.md` § Graph search tool in the instructions.
4. When the agent also has a knowledge base, search it separately, with several phrasings — the literal term, synonyms, and commitment patterns like "X will" or "plans to".
5. Merge and deduplicate carefully. Never truncate. A shorter answer that drops real items is worse than a longer, complete one.
6. Run a silent self-check before answering.
7. Lead with the direct answer, then detail. Never narrate which tool returned what. Ground every fact in a tool result.

The built-in `search_knowledge_graph` default tool does not turn on from `graphModelId` and `defaultTools` alone. Bind the explicit tool with `bind_graph_search` (step 3 above).

## Discoverer lifecycle

1. Create or select the `discoverer` through the shared lifecycle.
2. Call `configure_graph_processor` in `discovery` mode with root scalar classification fields. Use fields such as `hasDecision`, `hasBlocker` or `entityKind` only when they match the accepted source design. Do not hide these fields inside a `results` array.
3. Read `get_agent` and confirm its role, models, instructions and structured output settings. Publish the current version.
4. Call `get_context_graph_discoverer_schema` for the published version. Require the planned classification fields at the schema root.
5. Report the agent id and the published deployment version in the task's `ids` and `notes`. The `graph` task that saves the source's Discover & Enrich configuration binds them with `configure_context_graph_source_discovery` and reads `get_context_graph_source_discovery_configs` and `get_context_graph_source_objects` back; mark `bound` only from that read-back, quoted from its report.
6. Mark `runtime_verified` only after a real source run exposes the expected classification fields. Schema read-back proves configuration, not execution.

## Cleaner lifecycle

1. Create or select the `cleaner` through the shared lifecycle. Use one cleaner for several discovered entities only when they share one output contract and identity policy.
2. Call `configure_graph_processor` in `cleaning` mode. Its root object must contain `results`, and `results` must be an array of extracted objects.
3. Put the destination stable key in every result. Map a source field directly when it needs no change, and let the cleaner compute a value the source lacks. Spend model calls only on semantic extraction or classification.
4. Name no output field after a field of the source object it enriches; `context-graph-design/references/modeling-rules.md` § Cleaning and identity says how to rename it.
5. Read `get_agent`, publish the current version, then call `get_context_graph_enricher_schema`. Require every mapped output field and the stable key.
6. Report the agent id and the published deployment version. The `graph` task binds the cleaner as the relevant entity's enricher with `configure_context_graph_source_discovery` and reads the saved discovery configs and projected source fields back before mapping.

A `cleaning` mode schema can make every chat and `invoke_agent` call fail with provider HTTP 400. Changing the model does not fix it. When an automation calls the agent instead of a source, use a plain agent that answers in JSON text. Call it with `ai_agents_by_unifyapps_invoke_agent` (`parameters: { aiAgentId, userQuery }`) and parse `agentResponses[].text`, stripping code fences. Each call carries about 8k tokens of fixed prompt, so send several records per call when volume is high. Loops have no parallel mode.

A cleaner extracts records; it does not merge duplicates. Duplicates converge through the node's MDM match rules and the review queue (`context-graph-mdm`).

## Completion gate

Before calling the build complete, inspect every required role's task:

- `agentId`, current entity version, published deployment version and model ID are present.
- The role-specific binding read back from the platform.
- Publication is current.
- Runtime evidence exists for the role.
- Consumer access and graph retrieval are separate checks.

If one item is absent, report the exact role and state. Say `planned`, `configured`, `published` or `blocked`. Do not call it built.
