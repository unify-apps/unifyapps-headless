# Reads, wiring and the READ table

This step asks the person nothing.

## What to read, and why

- **Targets.** Start from the entities the request names. Each one is a **target** (it changes) or a **reference** (read only). A reference is never linked.
- **Membership.** For each target, run `solution locate --link "<text>" --json`. [entity-membership.md](../../ua-change/references/entity-membership.md) has the facts about where it belongs. `lookup-failed` is never "not in any solution".
- **Impact first,** with no live call. For each target, run `impact <kind> <id|name> --change <output|input|field-rename|field-delete|delete|logic> --json`. Kinds: `automation`, `object`, `page`, `app`, `ai-agent`. Each row is `found`, `no-change` or `unknown`. `.nebula/solution-map.md` holds the same wiring to read by eye.
- **Settle the unknowns.** For a stale or uncached row, run `solution refresh` once and `impact` again. Then read live only what is still unknown.
- **The app's PRD.** When `solution context` lists a PRD for the app a target sits in, read it: `prd get <app> --part prd --json`. A requirement row may cite its `R<n>` as `READ`. A request the PRD contradicts, or one that goes beyond it, becomes a question: build to the PRD, or change the PRD first.
- **Read what the plan needs** from the cache: `entity context <kind> <id> [--app-id <id>] --json` or a `cache …` command. A `hit` is a READ.
- **Read live only for:**
  - `miss`, `stale` or `unknown` rows
  - records inside an object and their counts
  - connections, runs and logs
  - an AI agent's tools, skills, tasks and knowledge (`get_agent`)
  - knowledge sets, their sources and the agents each is given to (`list_knowledge_sets`, `get_knowledge_sets`)
  - evaluation datasets, metrics and experiments
  - the global check of every new name or id
- **An object the plan writes rows into** needs its keys and formats: a primary key, a unique key, an auto-generated value or a lookup decides which values can be written at all. `cache obj` shows them. On a miss, read `get_objects` with `parts: ["fields", "fieldDefinitions", "picklists"]`: `fields` alone hides them.
- **A change needs a tool that makes it.** Name it from [task-kinds.md § What each builder can do](../../ua-change/references/task-kinds.md#what-each-builder-can-do). A change no tool makes becomes a manual step for the person.

## What it hands on

Write `## Current state (READ)` in the shape the conventions below give, with the impact rows. Then settle what is still unclear with [questions.md](questions.md).

## Read conventions

A code app is never cached: `get_code_app` reads its head, `gitLinked` and deployment, and `get_branch_codebase` writes its committed source to `<appId>/<branch>` in the working folder, where Read, Grep and Glob find the screens and calls a change touches. Read one hop of consumers and producers. `cache limits` names what no snapshot holds.

Check a new name or id with the exact read for its kind, never a broad word search, which can miss the clash. A new object's `OBJ_` id: `get_objects` on that id, which answers `missing` when it is free; its name: `search` with the exact name. A new app's id: `get_app_overview` on that id, which answers not found when it is free. A new automation's name: `search_workflows` with the exact name. A new evaluation dataset's name: `list_datasets {name}`; a metric's: `get_metrics {nameContains}`; an experiment's: `get_experiments {name}`; a knowledge set's: `list_knowledge_sets {query}`. The READ row for a new name is always `READ` with that read, never `INFERRED`. A new API Group's path or name: `list_api_groups {search}`; a client's name: `list_clients {search}`. A new environment variable's name: `get_env_variables {names}` with the exact name, which lists it under `missing` when it is free and names any `caseOnlyMatches`.

API Platform records (an API Group, API, client, access profile or policy) are never cached: read them live with `get_api_group`, `list_apis` with `automationId` (whether an automation already has an API), `get_client`, `get_access_profile` and `get_policy`. When an `api` task reuses an existing automation, read its start trigger with `open_workflow`: only a `callables_from_api` or `webhooks_default` trigger can back an API ([task-kinds.md](../../ua-change/references/task-kinds.md) rule 17). Environment variables are never cached either: read them live with `get_env_variables` (by exact name) and `list_env_variables`. Custom connectors are never cached either: read them live with `list_custom_connectors` (a name search) and `get_connector`.

In the technical spec's `## Current state (READ)` table, write the entity, id, the read (`cache …`, `entity context …` or the tool), exact fact, and `READ` or `INFERRED`. `INFERRED` facts need the check that would settle them. The visual HTML uses the resulting named behavior and observable outcomes, without tool names or internal syntax.
