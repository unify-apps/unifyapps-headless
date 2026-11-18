# Surfaces: where each kind shows its behaviour

One row per entity kind: where the issue is seen, what to open or call to see
it, what counts as evidence, which steps write, and which builder fixes it
through `ua-change`. Reads come from the cache first (`cache …` commands)
and go live on a `miss`.

| Kind | Surface | Reproduce with | Evidence | Writes | Fixed by |
| --- | --- | --- | --- | --- | --- |
| `page` of a WEB app | browser | the page's `preview` link from `entity link`, opened signed in as the person with the browser script: `node "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" <folder> open-page <url>`, then `page-shot <width>` for the screen and `calls` for the data source calls the page made; the plugin's Playwright tools are not signed in to the tenant, so they serve only a public page. In the Claude desktop app the browser pane also shows the page (`ua-change` § Open the preview) | a screenshot, the console lines, the data source calls with status and body; the live state, the events a click ran and a binding's value with `live-page.mjs` ([live-page.md](live-page.md)) | a step that saves a form or a record | app-agent |
| `page` of a MOBILE app | device | `/ua:native-fix-loop` with the report's words: its reproduce stage runs the steps on a pool simulator and brings back one issue with its cause and recorded steps; config reads (`cache blocks`, `cache events`, `cache ds`) meanwhile | its steps file, shots, network calls | as its run settings allow | app-agent, through that loop |
| `code-app` | browser | its `preview` link from `entity link` (the latest build on `main`; 404 until built once), opened with the same browser script; the source with `get_code_app` and `get_branch_codebase` | a screenshot, the console, the network calls, the source lines | a step that saves | code-app-agent |
| `automation` | run | `list_workflow_runs` with `workflowId` for the last runs of both kinds (`workflow_test`, `workflow`); `inspect_workflow_run` with `runId`, first without `nodeIds`, then the failing node; no run kept: `trigger_workflow_run` with `runType: "workflow_test"` and a `triggerInput` built from a real run's start node, only when writes are allowed | the run id, the node, its input and output, the error text | a test run executes every connector action it holds | automation-agent |
| `object`, `record` | record | `cache obj <id>` for the fields; `get_records` with `objectId`, `recordIds` or `filters`, `limit` 5; `describe_entity` for a platform entity | the field definition, the row read, with ids and never personal values in a shared note | none (a record is changed only as the fix, by its owner) | fde-agent |
| `ai-agent` | test-message | `send_test_message` with `agentId` and `message` (runs the draft), then `read_trace` with its `caseId`; a set of questions with `send_test_messages`; [ai-agents.md](ai-agents.md) | the answer, `toolCalls`, the trace's `modelCalls` (prompt, tools offered, arguments) | an agent whose tools write runs them: allowed only as a test user | agent-builder |
| `knowledge-set` | test-message | a question whose answer is in the document, through the agent that holds the set; `check_knowledge_status` with `agentId` | the answer, the status of each item | none | agent-builder |
| `api` | call | `get_api` with `apiId` for its definition and policies; `call_api` with `apiId`, `method`, `pathParams`, `query`, `headers`, `body` as the report says: a `GET` freely, anything else only when writes are allowed | the response status and body, the policy that answered | a `POST`, `PUT`, `PATCH` or `DELETE` call | fde-agent |
| `connector` (custom) | call | `get_connector_action` with `connectorId` and `actionIds`; `test_connector_action` with `connectorId`, `actionId` and `actionInputs`, which reaches the external system: only when the person allows it, and `isWriteConfirmed` only on their yes | the action's request and response | every test call reaches the external system | fde-agent |
| `connection` | config | `list_connections`; the connector's own answer when an action runs | the connection's status and the error it gives | none | the person (credentials); fde-agent for the rest |
| `env-variable` | config | `get_env_variables` with `names`; a secret's value is never printed, only whether it is set | the variable's presence and scope | none | fde-agent |
| `governance` (user, team, role) | config | `get_user_details`, `get_team_details`, `get_role_details`; the 401 or 403 the user got | the role's permissions against what the step needed | none | fde-agent |
| `dataset`, `metric`, `experiment` | run | `get_experiment_runs`, `get_run_results`, `experiment_scorecard`; `test_metric` on one case | the run's rows and scores | a run grades the agent again | agent-builder |

## Rules for every surface

- The version matters. A page shows its draft in the builder's preview and
  its published copy to users; an automation runs its deployed copy for
  callers and its saved copy in a test run; an agent answers from its draft
  in a test message and from its published version in the copilot. Reproduce
  on the copy the report is about, and say which.
- Sign in as the user the report is about when the issue may be theirs
  (access, a role, a filter by owner), as a test user with that role; never
  with the person's own account on a step that writes.
- Evidence is a read with ids and what it showed, never a sentence about
  what probably happened.
