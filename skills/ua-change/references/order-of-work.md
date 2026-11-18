# Order of work

Used by the [ua-change skill](../SKILL.md). The exact task edges are in [task-kinds.md § Dependency rules](task-kinds.md#dependency-rules).

## The order

Skip a step the change does not need.

1. The solution is open ([solution guide § Where work belongs](../../setup/references/solution-guide.md#where-work-belongs)).
2. Objects. An object that a lookup points at comes before the object that points at it.
3. Seed records.
4. Automations. A new one that a page, a code app or an AI agent calls starts as a shell, then its logic, then its deploy. A called automation is deployed before its caller runs.
5. The app. A new app is a code app unless the person asked for a no-code one or a mobile app ([defaults.md § Apps](defaults.md#apps)). Its first `code-app` task creates it, and its `code-app` tasks take the place of steps 6 to 8. A new no-code app gets its `app` task, which also stores its look.
6. Page layouts.
7. Page binds, right after each layout, by the same builder: in the same run when the objects and automations it uses exist.
8. Page reviews, of the bound page.
9. The app's publish.
10. AI agents, after the automations they bind as tools. A knowledge set comes before the agents that search it.
11. A context graph, in the stages of `context-graph-sources/references/build-order.md`: the graph with its node and edge types, rules, source and object scope, after the objects and automations it loads from; its discoverer and cleaner AI agents; the source's Discover & Enrich, mappings and publish; then record edges and the search automation; then the graph's consumer AI agent, and its publish.
12. Evaluation datasets and metrics.
13. Experiments.
14. UI tests, after the publish.

## What to check first

A missing item becomes one more task in the same change.

| Before | Check | How |
|---|---|---|
| A page, a code app or an AI agent calls a new automation | Plan a shell for it | [task-kinds.md § Automation shells](task-kinds.md#automation-shells) |
| An automation calls, or a test runs, another automation | The callee is deployed. Its draft does not count. | `cache wf <id> --deps`, then `search_workflows` |
| Any deploy state | Read it from `search_workflows`. `open_workflow` has none. | `search_workflows` |
| An automation uses a connection | The connection is signed in | `list_connections` (live, never cached) |
| A new no-code app | Its id is free | `get_app_overview` answers not found |
| A new object | Its `OBJ_` id is free, and every lookup target exists | `get_objects` on the id, `cache obj <id>` per target |
| A new name of any kind | It is free, by the exact read for its kind | [reads.md](../../plan/references/reads.md) |
| A field rename or delete | Every page and automation that uses the field changes in the same plan | `impact object <id> --change field-rename` or `field-delete` |
| A change to an entity in no solution | It joins a solution first | `solution locate --link "<link or id>"`, then [entity-membership.md](entity-membership.md) |
| An AI agent with tools | Each tool automation is deployed | `search_workflows` |
| An AI agent searches a knowledge set | The set exists, and its sources finished indexing before any answer is tested | `list_knowledge_sets`, `check_knowledge_status` |
| A graph source reads a connection | The connection is signed in, and what else uses it | `list_connections` (live), and the connection's dependencies before a change to it |
| A graph's consumer AI agent | The graph's search automation is deployed | the last graph stage's report, then `search_workflows` |
| An evaluation run | The dataset, the metric and the graded agent exist | `get_dataset`, `get_metric_details`, `get_agent` |
| A UI test | The app is published, and the person names a test user | `list_interface_versions` |
| A change no builder can make | Tell the person | [task-kinds.md § What each builder can do](task-kinds.md#what-each-builder-can-do) |
