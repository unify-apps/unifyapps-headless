# Where answers come from

## Contents

- How to look
- The solution
- Apps and pages
- Objects and records
- Automations and runs
- AI agents
- Connections, tests and users

## How to look

Each row lists the cheapest source first. The main session may call read-only tools for a question. A row read takes a limit and names the fields it needs. Live tools are written as `<tool>` (on `<server>`).

## The solution

| Question | First | Then |
|---|---|---|
| What are the dependencies of this solution? | `.nebula/solution-map.md`, `.nebula/wiring.json` | `impact <kind> <id> --change <...>` per entity |
| What breaks if I change or delete X? | `impact <kind> <id> --change <output\|input\|field-rename\|field-delete\|delete\|logic>` | a live read for rows marked `unknown` |
| What breaks if I delete field F of object O? | `impact object <O> --change field-delete` | `cache grep F` to see each binding |
| What does the spec or plan say? | `specs/`, `plans/` | `spec get`, `plan get`, `plan list` |
| What was built? | `docs/` | `feature list`, `feature get` |

## Apps and pages

| Question | First | Then |
|---|---|---|
| Pages, mode, access, what it deploys | `cache app <app>` | `get_app_overview` (on `application-builder`) |
| Menu and page paths | `cache nav`, `cache paths` | `get_navigation`, `get_page_paths` |
| The blocks of a page | `cache outline`, `cache page` | `get_page_outlines`, `get_blocks` |
| One block and its settings | `cache blocks --name <name>` | `get_blocks` (ids only) |
| What does this button do? | `cache events --name <block>` | |
| What can a binding read? | `cache keys`, `cache form` | `get_context_keys`, `list_form_fields` |
| Where is this text or name used? | `cache grep <text>` | `search_app` |
| What the app depends on | `cache deps`, `impact app <id>` | `get_dependency_graph` |
| The app theme | | `get_app_theme` |
| Is it published, which version? | `cache app` | `list_interface_versions`, `get_interface_version` |
| What changed between two versions? | `cache diff` | `compare_interface_versions` |
| How does a block or setting work? | | `get_app_builder_knowledge_map`, `get_app_builder_knowledge` |
| How well is a page built (its best practice score)? | | `get_best_practice_report` with `pageIds` (on `application-builder`); never cached |

**Why is this page empty?** First `cache ds <page> --app-id <app>`: each source, when it loads (`timing.runQueryOnPageLoad`) and what each parameter is bound to. A source that never loads, a filter in the wrong shape or a parameter bound to an empty value explains most cases. Then read live with `get_data_sources`, `get_data_source_output_schemas`, and `get_records` (on `object`) for the rows it should return. A browser check is an `app-agent` plan task.

## Objects and records

| Question | First | Then |
|---|---|---|
| Fields, ids and links of an object | `cache obj <id or name>` | `get_objects`, `describe_entity` (on `object`) |
| What rows are stored? | | `get_records` with a limit and fields |
| Find an object by words | | `search` (on `object`) |
| Which users or groups exist? | | `find_users_and_groups` |
| What uses this object? | `impact object <id> --change <...>` | |

## Automations and runs

| Question | First | Then |
|---|---|---|
| What does it do? | `cache wf <id or name>` | `open_workflow` (on `automation-code`), always before an edit |
| Its inputs and outputs | `cache wf --contract` | `describe_callable_workflow` |
| Who calls it, what it calls | `cache wf --deps` | `get_workflow_dependencies` |
| Does it exist, is it deployed? | | `search_workflows` (never `open_workflow` for deploy state) |
| Why did a run fail? | | `list_workflow_runs`, `inspect_workflow_run` |
| How well is it built (its best practice score)? | | `get_workflow_best_practice_report` with `workflowIds` (on `automation-code`); never cached |

## AI agents

| Question | First | Then |
|---|---|---|
| Role, goal, instructions, models, memory, conversation starters | `cache agent <id or name>` | `get_agent` (on `agent-builder`) |
| Its tools, skills, knowledge | | `get_agent`, `list_capabilities`, `check_knowledge_status` |
| A knowledge set: its sources, settings and the agents it is given to | | `list_knowledge_sets`, `get_knowledge_sets` |
| Its tasks and guardrails | | `list_tasks`, `read_guardrails` |
| Where it runs, why it answered that way | | `list_deployments`, `read_trace` |

## Connections, tests and users

| Question | First | Then |
|---|---|---|
| Which connections exist? | | `list_connections` (on `connection`) |
| What a connection type needs | | `get_connection_schema` |
| Which UI tests exist, did they pass? | `tests/` | `fetch_test_suites`, `fetch_test_cases`, `fetch_test_case_last_execution` (on `app-testing`) |
| Who is signed in, which tenant? | `solution context` | |
| Is the app public or private? | `cache app` (no tool reads it) | |
