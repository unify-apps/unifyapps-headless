# Scope a change asked in chat

Used by the [ua-change skill](../SKILL.md). Output: the facts each brief needs. A short spec ([short-spec-template.md](short-spec-template.md)) is written only for a Sonic plan, under `.sessions/<sessionId>/drafts/`.

## Read what you need

| To learn | Command |
|---|---|
| The targets in the request | `state resolve --request "<text>" --json` |
| Where each one lives | `solution locate --link "<text>" --json`, then [entity-membership.md](entity-membership.md) |
| The whole solution | `entity context solution --json` |
| The order of work, what must exist first | [order-of-work.md](order-of-work.md) |
| One entity | `entity context object\|automation\|app\|ai-agent <id> --json`, or `entity context page <pageId> --app-id <id> --json` |
| One fact of a page | `cache blocks`, `cache outline`, `cache events`, `cache form`, `cache keys`, `cache ds`, `cache deps` |
| One fact of an app | `cache app`, `cache nav`, `cache paths` |
| An object, an automation, an AI agent | `cache obj <id>`, `cache wf <id> --contract`, `cache agent <id>` |

Go live for a `miss` or `stale`, and always for stored rows, connections, runs, evaluation datasets, metrics and experiments, knowledge sets, API Platform records, environment variables, custom connectors, a context graph (its nodes, edges, source scope and agent roles, through the `context-graph` tools), an unlinked entity, and the check that a new name is free ([reads.md](../../plan/references/reads.md) names the exact read per kind).

When the request says a graph, source, mapping, graph agent or answer is broken, follow `context-graph-repair`'s diagnosis steps before you split the fix.

An app id or name that does not resolve is a wrong id, not proof the app is missing: check `entity context solution --json` for the solution's own linked apps before you tell the person it does not exist.

A change no tool makes ([task-kinds.md § What each builder can do](task-kinds.md#what-each-builder-can-do)) is not built: tell the person (in a plan, `## Assumptions` says `Check this: no tool can <change>`).

Keep each fact as the read gave it, never a summary: the task body copies it word for word.

## Check the wiring

For each target, run `impact <kind> <id|name> --change <output|input|field-rename|field-delete|delete|logic> --json`.

- An affected entity that must change is one more piece of the work (a `## Contract` line in a plan).
- An `unknown` that stays after one refresh: read that entity live before the write (in a plan, a `Check this` line under `## Assumptions`).

## Decide

Settle every open choice from the request, the reads, memory or [defaults.md](defaults.md).

## Next

Chat work goes back to the [ua-change skill](../SKILL.md) § Build it directly. For a Sonic plan, write the short spec at `.sessions/<sessionId>/drafts/<slug>.md`, check it with `spec check --md-file <path> --json`, and go on in the [plan skill](../../plan/SKILL.md).
