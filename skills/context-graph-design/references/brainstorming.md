# Graph questions

A change that touches a context graph is designed the way any change is: from
reads first, then only the questions the reads leave open. It gets no extra
phase, no extra round and no separate accept gate. This file lists what to
settle, and where each answer lands.

## When to load this file

Load it before you ask anything about a change that creates, extends or
repairs a context graph, or names an outcome ("summarise", "answer questions
about", "find related") that a live read shows can only come from a graph:

- **A change asked in chat** (`ua-change`): settle what a sensible default
  cannot, with options, and name the defaults you used, from
  `ua-change/references/defaults.md` § Context graphs.
- **A Zen plan** (`plan` skill § Steps, Ask): fold these questions into the
  change's other questions ([questions.md](../../plan/references/questions.md)),
  never a separate dialog.
- **A Sonic plan**: answer every question from live reads and the defaults,
  and list each default under `## Assumptions`. Never ask the person.

## What to settle

Ask only what live reads and the request do not already answer.

- **Source and scope** — which system or tenant-native resource, which
  objects, which rows, estimated row count and run time. In a Zen plan, the
  checklist row `scope`.
- **Ingestion path** — a graph source that reads rows, or a loader
  automation. For each source object, its Discover & Enrich mode: `none`
  (raw fields map straight to nodes), `enrich_all` (one enricher per
  record) or `discover` (a discoverer splits records into entities, one
  enricher per entity). Row `workflow`.
- **Nodes and keys** — every node, its key and key format. See
  [modeling-rules.md](modeling-rules.md) § Keys. Row `data`.
- **Relationships** — every edge type with its foreign key, direction,
  cardinality and the acceptance question it serves. Cut an edge no
  question needs. Rows `data` and `rules`.
- **Many links** — list fields and join tables split into one edge per
  item. Row `rules`.
- **Missing links** — the rule for an empty foreign key or one pointing at
  a missing record. Row `rules`.
- **Cleaning and identity** — normalize rules, duplicate rule, which value
  wins. Row `rules`.
- **Refresh** — resync, deletes, and how merges survive a resync. Row
  `rollout`.
- **Consumer** — the read-only agent, its graph search tool and model.
  Rows `workflow` and `users_access`.
- **Acceptance questions** — 3 to 5 real questions the consumer must
  answer, including one with no answer and one with several links. Row
  `acceptance`.
- **Users and access** — who asks, and who must not see what. Offer only
  limits the tools can apply: agent access follows tenant group roles, so
  "only me" cannot be set. Offer a group role instead. Row `users_access`.

When an answer changes the source, the data or the runtime, the earlier
derivations no longer hold: say so and settle the affected points again in
the same exchange.

## Writing it down

Fill the `### Context graph` part from the answers, in the exact format of
`plan/references/spec-template.md` § Context graph: in a plan at the end of
`## Contract`, in a chat build as a file in your work folder. Before the plan is
shown, or before the first piece is sent: every edge has a `Needed for`
question, every node has a `Loaded by` path, and every source object's mode is
set.

## Splitting the build

See `context-graph-design/SKILL.md` § Splitting the build for how the
Context graph part becomes `graph` and `ai-agent` work.
