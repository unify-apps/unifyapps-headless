# Write the task graph

Used by the [ua-change skill](../SKILL.md) and the [plan skill](../../plan/SKILL.md). Kinds, agents and the exact dependency edges are in [task-kinds.md](task-kinds.md).

## Contents

- Steps
- Tasks from the Contract
- Task fields
- Body template
- Body rules
- Replacing an earlier plan
- The change plan

## Steps

1. Read the spec, the `impact` rows and the reads. One task per affected entity. An `impact` row with `found` becomes a task, or joins the task on that entity. A `no-change` row gets none. An `unknown` row needs a live read first.
2. A task that creates an object or changes its schema or links: load `object-schema-designer`. When the Contract lacks boundaries, access patterns, links, constraints or indexes, go back and ask.
3. Write the `Task[]` JSON under `.sessions/<sessionId>/drafts/`. `plan propose --help` shows its shape.
4. Self-review against [grill.md](../../plan/references/grill.md) § 4: every Contract and Ready when line maps to a task. Grill when its rule says so.
5. Hand both files back to the skill that asked. It runs `plan propose`.

## Tasks from the Contract

Each `## Contract` line makes these tasks:

- `object · create|update` → `object`. The body names every field with its type and rule, each picklist's codes with labels, each date as epoch ms. A new object gets a semantic id `OBJ_<snake_case_slug>` from its singular business concept, or the id style the solution's objects already share (`mw_<name>`). When taken, add a short domain qualifier, never random characters.
- `record · seed · <object>` → `record`, one task per object. The body names every row, or the file the rows come from.
- `automation · create` that a page, a code app or an AI agent calls → `automation-shell` and `automation` ([task-kinds.md § Automation shells](task-kinds.md#automation-shells)). The shell needs the automation's `deploy` line in `## Ready when`. Without it, build one `automation` task and bind against its deploy.
- Any other `automation · create`, and `automation · update` → `automation`.
- `automation · delete` → `automation`. The body reads references first and stops if any exist. `deletes` names it.
- `page · create` → `page-layout`, then `page-bind` (data sources, actions, visibility) right after it, then `page-review` of the bound page when the page has a `job` line (every new page does).
- `page · update` → one task with the page id: `page-bind` when it adds or changes a data source, binding or action, `page-layout` when it is UI only.
- `page · delete` → `page-layout` on that page. The body reads references, stops if any exist, then calls `delete_pages`. `deletes` names the page.
- `app · create` (`app · <name> · new` in `## Touches`) → one `app` task. It gets one even with no page. Only for a no-code app: one the person asked for as no-code, or a mobile app. Any other new app is `code-app · <name> · new` ([defaults.md § Apps](defaults.md#apps)).
- `app · update` for a look → an `app` task on that app. For navigation → folded into the publish, or a menu entry in the layout of the page it opens. For access or data → a `page-bind`.
- `code-app · create|update` → `code-app`, entity kind `code-app`: a code app, built from a local checkout by `code-app-agent`, never with page tasks. One task per change, naming the screens and files it changes and what each does; the first task of a new app creates it. Two tasks on one app depend one on the other, because they share its checkout. Like a `page-bind`, it depends on the object tasks whose records it reads or writes and on the shell of each new automation it calls, and names each automation with the input fields the app sets.
- `app look`, `job` and `design` lines → no task. `plan propose` hands them to the app, layout and review tasks. A body never copies them.
- `ai-agent · create|update` → `ai-agent`, one per agent: instructions, tools, skills and knowledge.
- `knowledge-set · create|update|delete` → `ai-agent`, one per set, with the set as its entity: its sources and settings. The `ai-agent` task of each agent that searches the set gives it the set and depends on it. A `delete` names the set in `deletes`, and says whether its sources go too: deleting a set keeps them.
- `dataset`, `metric`, `experiment` → the kind of the same word. A run starts only when the line says so.
- `api_group`, `api`, `client`, `access_profile` or `policy · create|update|delete` → kind `api`, one task per entity, built by fde-agent. Its edges are [task-kinds.md](task-kinds.md) rule 17. A `delete` line, or a key rotation, is the same kind, and `deletes` names what goes.
- `env_variable · create|update|delete` → kind `env-variable`, one task per variable, built by fde-agent. The entity's name is the variable name exactly as stored, and its edges are [task-kinds.md](task-kinds.md) rule 18. It never carries a secret value: the main session saves a secret in chat.
- `connector · create|update|delete` → kind `connector`, one task per custom connector, built by fde-agent with `connector-build` and `connector-auth`: its details, authentications, actions, triggers, enabling and publish. Its edges are [task-kinds.md](task-kinds.md) rule 19.
- `graph · create|update` → `graph` tasks, one per stage of [task-kinds.md](task-kinds.md) rule 22, each naming the nodes and edges it builds in `graphNodes` and `graphEdges`. Load `context-graph-design` to split them. A graph's consumer, discoverer or cleaner is an `ai-agent · create|update` line, and its edges are rule 22.
- `connection` → `manual`.
- `deploy <automation>` and `publish <app or AI agent>` in `## Ready when` → `deploy` and `publish`, with the exact name. `publish <code app>` → `code-publish`, which depends on every `code-app` task of that app. A release appears only when `## Ready when` names it.

## Task fields

- A unique `t<n>` id, a title, a kind.
- `entity {kind, id?, name, app?, appId?}` from `## Touches`. A page names its app in `app` and its app id in `appId`.
- Real `dependsOn` ids.
- `proof`, a read-back line from the spec's Proof and Ready when.
- `visual: true` only for an explicit `[visual]` proof. A layout of a page with a job is made visual by `plan propose`.
- `deletes` when the task deletes something, in plain words.
- `graphNodes` and `graphEdges` on a `graph` task: the node and edge names it builds, from the spec's `### Context graph` part; empty arrays for a stage that builds none.

## Body template

At least five lines, no placeholders:

1. Read: `<the cache command, e.g. cache blocks <pageId> --app-id <app> --id <id>,<id>>`, live only on `miss` or `stale`. A new entity has no id yet: `entity context <kind> --name "<name>" --json`. If it differs from `<the scoping fact>` (a name, field, contract or id, never a version), stop and report.
2. Done when: `<what must be true after, in the names, fields, codes, filters and values the spec or a read gave>`.
3. Apply the write once (page tools use the confirmed host and interfaceId). No save or write tool takes a plan id; the bridge adds it to the end of a deploy's or publish's `deploymentNotes` by itself.
4. Read back: `<the exact line to quote>`.
5. Report ids, readBack, unverified, notes.

## Body rules

- A body says what must be true when done, not how. The builder picks its tools and makes every new id. A later task names a new thing by name and gets its id from `Built so far`.
- A later task gets only what `Built so far` carries from the tasks it waits on: their ids, read-back lines and `handover:` notes. So a body never says "use what task X reported": it states the fact itself, or the earlier task's body asks for that fact as a `handover:` note.
- Never write an id, key or setting you did not read.
- Quote what you read whole: every key of an object value, a contract, the person's code, or the file that holds it. A write built from a summary deletes live config.
- `columnCounts` is the number of fields, not rows. Rows come from `get_records`.
- A page task copies the picklist codes from the object task.
- A `page-review` body says to judge the two shots against the job, as the person in it. It names no tool.
- A mobile app's device proof runs on the draft in the UnifyApps Preview app, so the change needs no publish: it goes on the task whose change it checks. A new app's first device check waits for its first publish, or for the person to open the draft from the builder's QR with "Use current login session" on. A page task never publishes just to get a screenshot. When no device can run it, the device check is `unverified`.
- An `object` or `automation` task body has a `Speed:` line, shaped as the `ua-change` brief gives it: who waits, how often it runs and how big the data is, from the spec's `constraints` row, the Contract and the reads. Write `unknown` for what none of them says; the builder measures it.
- Follow [task-kinds.md § Facts every body follows](task-kinds.md#facts-every-body-follows).
- Never write `TBD`, `TODO`, `handle errors`, `similar to`, `wire it up` or `fill in`.

## Replacing an earlier plan

Read that plan and the live entities it touched. Do not repeat proven writes. A task that was running when the plan stopped becomes a reconciliation read before any write. Keep the lineage with `plan fork <oldPlanId>` when the spec still holds. A replacement spec goes through `plan propose`.

## The change plan

Show one line per task: `<n>. <what> · <entity> · <agent> · waits on <numbers, or nothing>`.

When `plan propose` refuses the graph, fix the graph. The spec stays unless the reason names it. A refusal may name several problems (`N problems. Fix all of them at once: (1) … (2) …`); fix every one before you send the tasks again.
