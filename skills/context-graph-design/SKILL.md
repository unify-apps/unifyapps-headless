---
name: context-graph-design
description: Designs a UnifyApps context graph from a business outcome — nodes, keys, relationships, cleaning, ingestion and the acceptance questions it must answer — before the graph-agent builds it, and splits the build into its stages. Use whenever a change asked in chat or a plan creates or changes a context graph.
user-invocable: false
---

# Context graph design

This is a design skill, like `object-schema-designer`. It has no phases, no
accept gates and no files of its own. It plugs into the normal flow:
`ua-change` loads it before a change asked in chat that creates or changes
a graph, and the `plan` skill loads it in its Ask, Spec and Tasks steps. The
design is the `### Context graph` part below. In a plan it sits in the spec;
in a chat build there is no spec, so the main session keeps the same tables and
puts the lines each piece needs in that builder's brief. Nothing goes in a
separate graph document.

## Contents

- [references/graph-rules.md](references/graph-rules.md) — model rules, which
  skill owns what, templates and shared-tenant rules.
- [references/modeling-rules.md](references/modeling-rules.md) — keys,
  property types, foreign keys, cardinality, cleaning and identity, and the
  checks that catch a broken model before the plan is accepted.
- [references/brainstorming.md](references/brainstorming.md) — the graph
  questions to settle in chat or in a plan, and where each answer lands.

## What target counts as a graph change

Treat UnifyApps as the build target unless the person explicitly names
tenant-native platform resources (agents, automations) as the data. Preserve
a named business outcome and source; do not infer an internal platform
inventory, Slack, GitHub, Drive or another connector on your own.

Separate reading data from ingesting it into the graph. A domain MCP read can
acquire metadata or records for planning; it does not make them a graph
source. Before planning cleaning, deduplication, relationship materialization
or Q&A, confirm a supported graph source connection and object, or an
authorized automation-backed staging path.

## The Context graph part

In a plan, the `### Context graph` part sits at the end of `## Contract`, in the
exact format of `plan/references/spec-template.md` § Context graph (the same in
a short spec). The graph's `## Touches` line also gets its own `### graph · <name>`
heading in `## Contract`, with one line on what the graph is for, like every
other entity. In a chat build, write the same tables in your work folder. Fill
them from the answers and the rules in
[references/brainstorming.md](references/brainstorming.md):

- **Acceptance questions** — 3 to 5 real questions the consumer must answer,
  including one with no answer and one with several links.
- **Nodes** — every node, its key, and how it is loaded (`sourceObject`,
  `extraction`, `loader` or `records`), with the `Ref` that names the source.
- **Edges** — every edge type, its endpoints, the acceptance question it
  serves, how it is created (`matched`, the default, or `defined`; see
  [references/modeling-rules.md](references/modeling-rules.md) § Defined vs
  matched edges) and, when it carries data, its `Attributes`. The table's
  `Created` column holds that choice, `matched` or `defined`. Cut an edge no
  question needs. Edges are created as one list call, not one at a time.
- **Node settings** (optional) — a node's category (`core`, `secondary`,
  `derived`), Enable permissions, SCD Type 2, auditable, colour and tags,
  only for nodes that depart from the defaults.
- **Rules** (optional) — a node's survivorship, match rule (with what a match
  does: `AUTO_MERGE`, `FLAG_FOR_REVIEW` or `RELEVANCE_BASED`) and data
  quality, from the checklist's `rules` row. Shapes in
  `context-graph-mdm/references/rules.md`.
- **Source objects** — each object's Discover & Enrich mode (`none`,
  `enrich_all` or `discover`), its discoverer/enricher and its `Scope`
  (which rows).

`plan propose` checks this part and lists each issue with its code; fix what
it lists before you show the plan. A chat build has no such check: before the
first piece, check the same things yourself — 3 or more questions with unique
keys, every node with a key and a `Loaded by` path, every edge joining two
planned nodes and naming the question it serves.

## Splitting the build

A graph is built in pieces in a chat build and in tasks in a plan, with the
same two kinds of work:

- **`graph`** → `graph-agent`. Everything that touches the graph itself:
  creating or updating the graph, its node and edge types with their
  settings and rules, sources, object scope, Discover & Enrich
  configuration, mappings, relationship
  materialization and ingestion, golden-record review and sharing. A
  connection is not graph work: it is a manual task
  (`ua-change` `task-kinds.md`). In a plan, the task carries `graphNodes` and
  `graphEdges` (string arrays) naming only nodes and edges already in the
  spec's `### Context graph` part — `GRAPH_TASK_UNPLANNED` refuses a name the
  spec does not have; in a chat build, the brief names the same nodes and
  edges. A node or edge found useful during the build goes back to the design,
  and to the person when it changes what they agreed, before it is built.
- **`ai-agent`** → `agent-builder`, which loads `context-graph-agent` for
  these roles. One piece or task per consumer, discoverer or cleaner role.
  Its proof asks the acceptance questions to the saved assistant and quotes
  the trace evidence — configuration alone is not proof a role works.

Keep a graph piece and its dependent `ai-agent` piece separate: an agent
cannot bind a query tool to a graph that is not yet built, and a discoverer
or cleaner cannot bind to a source object whose scope is not yet saved.

Split `graph` tasks into the three stages of the proven build order in
[context-graph-sources/references/build-order.md](../context-graph-sources/references/build-order.md):
graph + publish + node and edge types with their settings and rules + source
and scope; then Discover & Enrich + mappings + source publish + projection
check, after the processors' `ai-agent` pieces; then record edges + search
automation. The consumer (`ai-agent`) and its publish follow. In a chat build,
start each stage when the one before it reports, with the graph id and the
other ids it reported in `Built so far` (`ua-change` § Build it directly).
In a plan, set each task's `dependsOn` to match (`ua-change`
`task-kinds.md` rule 22); `plan propose` refuses a new graph whose stages
leave a spec node or edge unbuilt (`GRAPH_NODE_UNCOVERED`,
`GRAPH_EDGE_UNCOVERED`) or that has no `ai-agent` task (`GRAPH_NO_CONSUMER`).

The consumer's publish follows the release rule of `ua-change` § Releases:
publish when the person asked for it, or ask first. A discoverer or cleaner is
published inside its own piece, because the source configuration that binds
it names a published version, and nobody uses it directly.

## Modeling and identity

Read [references/modeling-rules.md](references/modeling-rules.md) before
writing the Nodes and Edges tables. Every node needs a key and its format.
Every edge needs its five items: from node, to node, edge name, foreign key
field and which side holds it, and cardinality. A list field or join table
becomes one edge per item, never one edge per record. Write the cleaning and
merge rule for every key that can collide, and how a resync keeps a merge.
