# Defaults for a change asked in chat

Values to use when the request gives none. Tell the person each one you used, and list it under `## Assumptions` when there is a plan.

## Scope and naming
- Several independent outcomes in one request: build them all, side by side. In a plan, one spec holds one focused change.
- New names follow the solution's existing naming seen in the reads (case, spacing, prefixes).
- Reuse an existing entity that already carries the concept. Duplicate nothing.

## Objects
- Fields the request names are required. Fields added for convenience are optional, with a sensible default.
- Status fields are picklists. Each value the request uses is the label, stored as a snake_case code (`To Do` is stored as `to_do`). The first value is the default.
- Uniqueness follows the request's natural key (vendor + invoice number), checked before save, not only by the schema.
- Seed rows only when the request says so: every row or count it names, else a small, clearly fictional set of at most 20 rows per object.

## Automations
- One automation per user action that writes data. A page never writes an object directly when a rule must run first.
- Results: `saved · duplicate · invalid · error` for saves, `decided · already_decided · forbidden · error` for decisions, unless the request names others.

## Apps
- A new app is a code app: a React web app whose source Code Builder keeps in git, built by `code-app-agent` with `code-app` tasks. Build a no-code app (an `app` task, then page layouts and binds by `app-agent`) only when the person asks for one, in words like no-code, config, blocks or application builder, or asks for a mobile app, which is always no-code.
- A page or feature added to an existing app follows that app's kind: `cache app` says `mode code` for a code app.

## Pages
- Reuse the app's existing page pattern (table with drawer, form page, detail page). A new page copies the header, spacing, block types and look (colours, custom CSS, effects) of the closest existing page.
- A new no-code app gets its own look (`app-page-planner` writes the line). An app that keeps the tenant's theme, or a mobile app, writes `none because <reason>`.
- Every list has loading (skeleton), empty ("No <items> yet.") and error ("Couldn't load <items>." with Retry) states.
- On a MOBILE app, build loading, empty, paging and number steppers with the native blocks in [app-native § Native block before hand-build](../../app-native/SKILL.md#native-block-before-hand-build).
- Every form has inline field errors, a disabled submit while saving, a success toast naming the record, and a failure banner that keeps the entered values with one Retry.
- One menu entry per new top-level page, visible only to the groups the request names.
- A new no-code app's home page is `/home`, set as the default page. A detail page keeps its id in a folder: `/cases/:caseId/detail`.

## Access and rules
- Access follows groups that already exist on the app. A new group is never created silently: the spec lists it as a `Check this` assumption.
- A new app is `PRIVATE` unless the request says anyone may open it without signing in ([task-kinds.md § Facts](task-kinds.md#facts-every-body-follows), App visibility).
- Money uses the locale and currency seen in existing data. Thresholds are inclusive unless the request says "above".
- Deleting anything is never assumed. A delete appears in `## Contract` only when the person asked for it and the read shows no references.

## Context graphs
- Ingestion path is a graph source connection and object when the connector supports one; a loader automation only when the connector cannot filter to the requested scope, and say why.
- Discover & Enrich mode is `none` when source fields map straight to the node's properties, `enrich_all` when every record needs one enricher pass, `discover` only when one source record can be more than one kind of entity.
- Keys are the source's stable id field, normalized lower-case and trimmed; a name or label is never a key.
- One edge type per role; a list field or join table becomes one edge per item, never one edge per record.
- Cleaning default: exact composite-key matching, newest record wins a field conflict. A semantic or fuzzy merge is a question, never a default.
- Refresh default: resync updates existing nodes by key and does not delete on a source row's removal, unless the request says deletes should propagate.
- The consumer is a new read-only agent bound to the graph's own search tool, scoped to the nodes and edges the acceptance questions need; access follows the app's existing groups.
- Acceptance questions default to the ones the request states, plus one not-found case and one many-links case when the request does not supply them.

## Release
- Deploy and publish follow [ua-change § Releases](../SKILL.md). In a plan, state the choice in `## Ready when`.
- No migrations or backfills unless the request names them.

## When nothing settles a question
When nothing above settles a choice and a wrong guess would not change what gets built, take the safest option: fewer entities touched, no release, no change to existing data, the smaller scope. Tell the person (and add a `Check this` line first under `## Assumptions` when there is a plan). When a wrong guess would change what gets built, ask instead.
