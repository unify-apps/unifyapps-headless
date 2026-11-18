---
user-invocable: false
name: object-storage-manager
description: "Only for the fde-agent builder agent. Changes the Storage object (table) itself: add, rename, retype, or remove a field; set required, unique, primary key, secure, hashed, picklist values, default, or display name; create or delete an object; edit retention, audit trail, or indexes; create it inside a project. Also inspects an object's live schema and reads, counts, filters, or edits its records directly. Owns the object JSON-Schema format, field-property keys, index ops, record payload shape, and the object filter grammar. Load it whenever the data model itself must change — the object or field something needs does not exist yet, or a field's type, uniqueness, or picklist values must change to accept what will be written — since an object cannot be created or altered from inside a workflow node."
---

## The object MCP server

Every tool here is an MCP tool on the `object` server, which the plugin bridges to the signed-in tenant at `<mcp base>/mcp/object`. Call them like any other MCP tool. There is no CLI for objects.

**Every call takes `host`.** It is the `https://` origin of the signed-in tenant, for example `https://your-tenant.unifyapps.com`. A call without it goes nowhere.

**`dryRun` is for looking, not for safety.** `apply_object_batch` validates every step before it writes anything, so a bad step already writes nothing — sending the same batch twice buys you nothing and costs a round trip. Use `dryRun: true` when you want to read the exact payload before it lands, not as a habit.

Two writes are the exception and require it: `delete_object` and a filter edit in `apply_record_edits` refuse to run until you pass back the record count their dry run reported.

That count check is the tool's. Apart from it, UnifyApps Headless's tenant bridge holds every call that deletes, even after a dry run: `delete_object`, every `delete` edit in `apply_record_edits` (by `recordId` as well as by filter) and every `remove_fields` op answer `CONFIRM_REQUIRED (d_…)` and send nothing until the person approves that id in a dialog. A yes given in chat does not unlock it. Only a call with `dryRun: true` passes.

Act on the **live object**, never from memory: read it, change it, then report.

## Tools

Nine object tools and two shared readers.

### Reading

- **`get_objects`** — `objectIds` (an array, up to the tool's cap) plus optional `parts` (`fields`, `fieldDefinitions`, `picklists`, `tags`, `settings`, `indexes`, `definition`) and `fields` (narrows `fieldDefinitions`/`picklists` to named fields). `includeDefinition` is gone and is refused outright — pass `parts: ["definition"]` for the stored schema. Default `parts` returns only field names, required fields, and any field stored in only one half of the schema (`unmirroredFields`); it does **not** carry `pluralName` or `store` — ask for `parts: ["settings"]` or `["definition"]` when you need those. Ids the host does not have come back under `missing`. Call this before editing an object and after writing to it.
- **`get_records`** — `objectId` plus either `recordIds` or `filters` / `sort` / `limit` / `offset` — never both: `recordIds` is refused when combined with any of `filters`, `match`, `sort`, `limit` or `offset`. `limit` defaults to 25 and caps at 200. The reply carries `total`, so **a count is a `get_records` call with `limit: 1`** — read `total` and ignore the row.
- **`search`** — `kind: "object"` + optional `query`. Lists objects by name; `query` is a contains-match, not fuzzy. This is how you turn a name the user typed into an id. An empty list means nothing matched OR nothing this session may see; the api does not separate those, so never report "it does not exist" from an empty list alone.
- **`get_app_builder_knowledge`** — the application builder's sheets: pages, blocks, forms and data sources. It has no sheet on Storage objects, their fields, indexes or records, and answers an object question with `results: []`. So never ask it one. Its `blocks/form/fields/...` sheets are form inputs on a page, not object field types.

### Writing the object

One verb writes schema: **`apply_object_batch`** — `host` + `steps`, up to 50, each `{ tool, args }`. Steps run in order against an in-memory copy, so a later step reads what an earlier step built: a step can edit an object an earlier step in the same call created. A model of more than 50 steps goes in several calls, and the objects other objects point at go first. Optional `project` puts every object the batch CREATES into that project; objects it only edits stay where they are. Optional `dryRun` returns every payload without writing.

There is no single-object write tool. One object to create is one step in a one-element `steps` array.

**A refusal writes nothing.** Every step is validated before anything reaches the host, so one bad step leaves the tenant untouched. The result names the failing step by index with its issues and marks the rest `not_attempted`. Fix that step and send the whole batch again.

**A host failure partway does not.** There is no platform endpoint that writes several objects together, so the flush is one write per object. If the host refuses one, the result carries `written` (live — do not create these again) and `notWritten` (re-send only these). Read both before retrying.

**A lookup's target must already exist, or be created in the same call.** The batch refuses a `foreignKey` whose target object is neither on the host nor created by a step of that call. Inside one call, order does not matter: a step may point at an object a later step creates. Between calls, order matters: send the target first, or send both in one call. Two new objects that point at each other go in one call.

**That refusal looks like a success.** It answers with no error and every step `ok`. Only `wrote: false` and a `note` that names each lookup show that nothing was written. So read `wrote` before the steps. The check only covers lookups this call adds or re-points — a lookup already on the object that you did not touch, even one already dangling, is left alone and not re-checked. Report a lookup this call did flag, and change it only when you were asked to.

Copy each target id off the live object or the task, never from memory.

The three step verbs:

- **`create_object` step** — `name` plus optional `id`, `pluralName`, `description`, `tags`, `store`, `fields`, `required`, `fieldOrder`, `indexes`.
  - `id` is used **exactly as sent**. Pass the plan task's planned id here as the task writes it, `OBJ_<snake_case_slug>` or the style the plan chose. Left out, the platform mints `obj_<5 chars>`. A taken id is refused before anything is written.
  - `name` must also be unique across every object the tenant holds, not only the id: the platform refuses a create whose `name` matches an existing object's even when `id` is free. Check with `search` first, and on a collision ask the user whether to use a different name or a suffixed one (`students_2`) rather than retrying the same name.
  - `pluralName` left out defaults to `name` unchanged — no automatic "s". Give it explicitly when the plural reads differently.
  - `indexes` builds the object's indexes with it. Same rules as the `add_index` op, so there is never a reason to create an object and then index it in a second step.
  - `fields` may be left out. An object with no fields is valid, so never ask the user for fields before creating.
  - `required` is its own argument, a list of field names. It is **not** a key inside the schema.
  - `store` defaults to `MONGO`. `MONGO`, `OPEN_SEARCH` and `ANALYTICS_BY_UNIFY_APPS` hold records: `get_records` reads and counts them, and `apply_record_edits` writes them. `ANALYTICS_BY_UNIFY_APPS` is the exception: a write can take seconds to minutes to show up there, so a `total` of 0 right after a write is not proof of nothing — re-read a little later before acting on it. On `MONGO` and `OPEN_SEARCH`, a `total` of 0 is a real 0. `S3`, `REDIS` and `KAFKA` cannot read or write rows: the write looks like it worked and the records page then answers 500. **If the user asks for one of those three, do not create it.** Say the object would be unusable for records, offer `MONGO`, and create only once they choose. If they still want it, create it and restate the limit beside the result. This is the one create that pauses.
  - A create never blocks for anything else. Derive a name if none was given, default the store, use an empty schema, create, then report what you defaulted and offer to adjust.
- **`apply_object_edits` step** — `objectId` + `edits`, ops that run in order and see each other. Ops:
  - `add_fields` — `fields`, optional `required` (names to ADD; the existing list stays). It adds NEW fields only, onto the object as it stands, so a field somebody added in the builder since is not lost. A name that already exists is refused ("add_fields adds new fields, and these already exist … Change them with update_fields"), so never send an existing field here.
  - `update_fields` — changes fields that already exist. `fields` maps a field name to only the keys to change, merged into the stored field (an object merges, a list or a value replaces, `null` removes the key), so a title or a picklist change never resends the whole field. `rename` maps a field name to its new name and moves its required entry, its place in the order and the metadata that names it; it does not rewrite pages or automations that name the field. A rename is refused when the new name exists, when two renames in the same call target the same new name, and on an object that holds rows.
  - **Two fields on one object cannot share one `title`.** `create_object`, `add_fields` and `update_fields` are all refused when a new or changed title collides with another field's, old or new.
    - **Changing an existing field's `type` is refused once the object holds rows**, even rows that store nothing in that field: the step answers `wrote: false` with HTTP 500, errorCode `5008`, "Please delete data before updating entity schema, conflicting fields [...]". Clearing the field on every row first does not lift it. The route that works is two calls: `remove_fields` (a delete, so it waits for the person's yes in the dialog) in one `apply_object_batch`, then `add_fields` with the new definition (the name is free again once it is removed) (and `reorder_fields` to put it back in place) in the next. Take it only when the plan or the user asked for the type change and the field holds nothing worth keeping; otherwise add a new field of the new type and move the values. (Measured 2026-10-08 on a test tenant.)
  - `remove_fields` — `fields`, a list of names. Use only when the user asked to delete them. It drops the fields from the schema only: rows already stored keep their values (`get_records` still returned `item_type`, `path` and `content_type` on a row after those three were removed), though nothing in the object's schema reads them any more. So when you ask for the yes, say the fields leave the schema and their stored values stay in the rows, and report those values as still present.
  - `set_required` — `required`, which **replaces** the whole required list.
  - `reorder_fields` — `fieldOrder`, the left-to-right order a maker sees. It must list every field on the object exactly once — a partial list (moving only the fields you care about) is refused, not treated as "leave the rest where they are".
  - `add_index` — `fields: [{ field, direction }]`, optional `name`, `unique`, `expireAfterSeconds`. At most 5 custom indexes per object — a 6th is refused. An index over the same fields and order as an existing one is refused as a duplicate, whatever name you give it.
  - `remove_index` — `name`. `remove_all_indexes` — takes nothing. `set_indexes` — `indexes`, the full list the object should end up with; anything not listed goes. An empty list is refused; use `remove_all_indexes`.
  - Index builds are asynchronous. A step that touched indexes returns the new total and says so; after the call, `get_objects` and report each index's real status, never just "created".
  - **One field unique on its own** is `uniqueKey: true` on that field: through `add_fields` for a new field, `update_fields` for one that exists. It reads back in the object's `metadata.uniqueKeyFields`.
  - **Several fields unique together** (`fileName` + `version`) is one index with `unique: true` over those fields, through `add_index` or `indexes`. Never set `uniqueKey` on each of them: that makes each field unique alone.
  - Never add a unique index on one field that already has `uniqueKey`. Both save, but the index adds nothing.
- **`update_object_settings` step** — `objectId` + `panel` + `values`. Only the keys you send are written. A standard object is refused. Panels:
  - `details` — `name`, `pluralName`, `description`, `tags`. Renaming never changes the object's id.
  - `data` — `store`, `retentionDuration`, `retentionUnit`. `retentionUnit` is `MINUTES`, `HOURS` or `DAYS` and nothing else, so years and months go in `DAYS` (7 years is `2557` days). Retention exists only on `MONGO` and `REDIS`, and clearing the duration removes the whole retention window.
  - `logging` — `auditable`, `captureActivity`, `captureReporting`, `supportsWebhook`, `supportsDistinctValues`. Analytics SQL sees an object's rows only while `captureReporting` is on, and turning it on copies no row already stored: only rows saved after it reach Analytics. To bring old rows in, save each one again with the same values (measured 2026-10-06 on a test tenant).
  - `access` — `external`, `skipPermissionsFilter`.
  - `versioning` — `versioningEnabled`, `deployable`.

Deleting is its own tool, because it destroys rows and its confirmation is per object:

- **`delete_object`** — `objectId` + `expectedRecordCount`. Deletes the object and every record in it, with no undo. It refuses an id that does not exist, a standard object, and an object anything still depends on. Run it with `dryRun: true` first to get the record count and the dependency list, show the user what is about to go, get an explicit yes, then call again with that same number.

### Writing the rows

- **`apply_record_edits`** — `objectId` + `edits`. Ops:
  - `create` — `properties`, a map of field name to value.
  - `update` — `recordId` + `properties`. It reads the row first and **merges**, so a field you leave out keeps its value. Pass `replace: true` to overwrite the row outright.
  - `delete` — `recordId`, or `filters` (below).
  - Every property name is checked against the object's fields before anything is written. The platform's own columns are refused: `id`, `v`, `cTm`, `mTm`, `lMBy`, `oUId`, `pId`, `refKey`, `uId`.
  - Unlike `apply_object_edits`, these ops are written one at a time. A refusal partway through leaves the earlier ones written. The result carries `results`, one entry per op with its `op`, `recordId` and `ok`, so read that rather than assuming the batch landed.
- **A filter edit in `apply_record_edits`** — an `update` or `delete` edit with `filters` (and `match`) in place of `recordId` changes or deletes every row the filters match, in the grammar `get_records` takes. It refuses a missing filter, an empty filter and a filter with no real value, with no flag to turn that off. Run it with `dryRun: true` to read `matched` and the first `sampleIds`, get an explicit yes for a delete, then run it again with `expectedCount` set to that number; a different real count refuses it. Rows go 8 at a time by id, and `deleted` is counted back from the object afterwards. `replace` is not taken with filters. **A filter delete removes at most 500 rows per call.** When more than 500 match, the result's `remaining` says how many are left — call the same edit again with `expectedCount` set to that number, and repeat until `remaining` is 0. Stopping after one call on a bigger match silently leaves rows behind.

### Other stored types and people

These read and write the platform's own stored types, such as the Ontology records, not the rows of a storage object. For a storage object's rows, use `get_records` and `apply_record_edits`.

- **`describe_entity`** — `entityType`. The keys a stored type takes: which are required, the type of each, the values a key allows, and `undeclaredKeys` the live schema says nothing about. Read it before a write, and when a reply shows a key you do not know.
- **`get_entity_records`** — `entityType` plus `ids` (whole records) or `where` (records whose keys equal the values given), with `limit` and `cursor`. A key the type does not have is refused. An id that comes back with nothing is listed under `missing`.
- **`save_entity_records`** — `entityType` + `edits`: `create` with `properties`, `update` with `operations` (`SET`, `UNSET`, `ADD_TO_SET`, `REMOVE_FROM_SET`). Every edit is checked first, and one problem refuses the whole batch. Run it with `dryRun: true` first. It never deletes: a delete also removes what hangs off a record, so it is left to the person, in the platform screens.
- **Environment variables are not read or written here.** `get_entity_records` and `save_entity_records` refuse `e_env_variables`: read them with `get_env_variables` (`env-variables`). Creating, changing, sharing or deleting one is an `env-variable` task for `fde-agent`.
- **`find_users_and_groups`** — `users` and `groups`. Gives the ids of platform users (by email, id or exact name) and groups (by id or exact name). Call it before any write that names a person or a group, such as a record field that holds a user id. Prefer an email: a name can match more than one person.

## Object schema format — get this right or records will not save

`fields` is a map of field name to **JSON Schema**. Every field needs a JSON-Schema `type`: `string`, `number`, `integer`, `boolean`, `object`, or `array`. Never a platform name like `TEXT` or `DATE`. A field with no valid type makes the object reject **every** record with *"Failed to compile schema: type required."*

```json
{
  "amount": { "type": "number", "title": "Amount", "help": "Invoice total" },
  "status": { "type": "string", "format": "single-select",
              "oneOf": [{ "const": "paid", "title": "Paid" }] }
}
```

Map what the user asks for to a `type`, plus a `format` where noted:

| Field the user asks for | JSON Schema |
|---|---|
| text, name, email, phone, url | `{ "type": "string" }` |
| long text, notes, comments, multi-line | `{ "type": "string", "format": "textarea" }` |
| rich text, formatted text | `{ "type": "string", "format": "rich-text" }` |
| number, amount, currency, price | `{ "type": "number" }` |
| integer, count, quantity | `{ "type": "integer" }` |
| yes/no, boolean, flag | `{ "type": "boolean" }` |
| date | `{ "type": "integer", "format": "date", "dateFormat": "epoch" }` |
| datetime, timestamp | `{ "type": "integer", "format": "date-time", "dateFormat": "epoch" }` |
| picklist, status, category, priority | `{ "type": "string", "format": "single-select", "oneOf": [{ "const": "paid", "title": "Paid" }] }` |
| multi-select, tags | `{ "type": "array", "format": "multi-select", "items": { "type": "string", "oneOf": [ … ] } }` |
| lookup / reference to another object | `{ "type": "string", "format": "single-select", "foreignKey": { "reference": "ENTITY_ID:<object_id>" } }` |
| file, attachment | `{ "type": "object", "format": "file-uploader" }` |
| json, nested data, a map of values | `{ "type": "object" }`, with its keys under `properties` when they are known |
| list of json items | `{ "type": "array", "items": { "type": "object" } }` |

Use only a `format` from this table or the field-key table below. The batch stores any other `format` without a word, so a guessed one looks fine and is wrong. A `format` read off another object is not proof either.

**Required is an argument, not a field key.** Pass the names in `required` on a `create_object` step, in `add_fields` for new fields, or through the `set_required` edit op. `"owner_email": { "type": "string", "required": true }` saves without complaint and is still wrong: it is not valid JSON Schema, nothing flags it, and seeding that object later throws `Spread syntax requires ...iterable[Symbol.iterator] to be a function` and loses **every** record for it.

Every other field property is a key on the field itself:

| What the user asks for | Field key |
|---|---|
| Display label / help text | `"title"` / `"help"` |
| Display name (the record's label) | `"nameField": true` — the one string field that best labels a record |
| Searchable · Sortable · Filterable | `"searchable"` / `"sortable"` / `"filterable"`: `true` |
| Primary key / unique key | `"primaryKey": true` / `"uniqueKey": true` — string, number or integer only, and a primary-key field must also be in `required`. Several fields unique together are a unique index instead (`add_index`) |
| Secure (encrypt) | `"format": "secure"` |
| Hashing | `"format": "hash"` |
| Default value | `"default"` — must match the field's type |
| Conditional visibility | `"visibility": { "value": "conditions", "conditions": { "type": "filter", "payload": <filter tree> } }` |
| Auto number | `"format": "auto-generate"` + `"autoGeneratedFieldDefinition": { "prefix"?, "startFrom" }`. The platform puts `_` between prefix and number: prefix `ENQ`, start `1001` gives `ENQ_1001`, and prefix `ENQ-` gives `ENQ-_1001`, so a prefix never ends in its own separator |

- **`filterable` is on by default.** The only lever is `filterable: false`. `sortable` and `searchable` are **off** until written, and each fails silently when you assume otherwise.
- **Secure and hashing live in `format` and nowhere else.** `format` is one slot, so the two are mutually exclusive and they replace a type format. Date and datetime fields cannot be secured or hashed. Invented keys — `secure: true`, `is_secure`, `enableHashing`, `displayName` — are ignored but stay stored and read as if they worked. Delete them and set `format`.
- **A secure field cannot be filtered.** Its value is stored encrypted, so `EQUAL`, `IN` and every other filter on it match no row, in `get_records` and in an automation's fetch alike. A field a lookup, a duplicate check or any filter reads is never secure.
- **An object is stored twice.** One half draws the form, the other is what the store filters on. A field written into only one matches zero rows while looking fine on screen. These tools write both halves, and the batch reads every object it wrote back in the same call, reporting any field that did not survive under `objects[].unmirroredFields`. If a name shows up there, the field is broken — say so and fix it, do not report the write as done.
- **Before setting `primaryKey` or `uniqueKey` on an object that already has rows, check the data is really unique.** Read enough rows to see. If values collide, do not apply the flag: name the colliding values and how many records they hit, and ask whether to pick a different field or dedupe first.
- **A unique-key collision is a run-time error, not a save-time one.** `uniqueKey: true` is a real index. The object saves fine and the colliding write dies with a raw Mongo `E11000` that ends the run and orphans whatever the step before it created. Nothing warns at save time. Pre-check with a filtered read before writing a value that has to be unique.
- **A `uniqueKey` field left out counts as empty, and empties collide.** The index is not sparse: only one row may leave the field out, and the second dies with `E11000 … dup key { properties.email: null }`. So a `uniqueKey` field is in `required`, or every row the plan writes gives it a value.
- **A foreign key is checked on write and nowhere else.** The batch refuses a target object that does not exist — see the batch section above. On a record, a wrong id fails the record write with a raw `Foreign key constraint violation`, and a blank `""` is refused outright. On **delete** it does nothing: the parent goes and the children keep pointing at an id that is not there.
- **System fields are built-in — never declare them.** Every object already has `id`, `v`, `cTm` (created), `mTm` (modified), `lMBy`, `oUId`, `pId`. "Add an ID field" means the object already has `id`; say so, or add a differently-named business key.
- **The platform sets a record's id.** A record write that sends `id` is refused. When the object has a `primaryKey` field, that field's value becomes the record's id on create: a row created with `key: "shard:9"` reads back with id `"shard:9"`. So a record that needs a known id gets it from a `primaryKey` field, never from `id`.
- **System fields sort and project by their short name only.** `createdTime` and `modifiedTime` match nothing and are dropped without a word; ask for `cTm` / `mTm`. `version` is worse than missing: it comes back as `0` on every row whatever the row's real version, and only `v` returns the true number. An update guard built on that `0` refused every write while its tests stayed green, because the tests read the same projection.
- **Deleting an object does not free its id.** A `create_object` step refuses an id that is taken, and nothing else can tell a free id from a held one.

## Record values — match each field's schema type

`properties` is a map of field name to value. Dates are **epoch milliseconds** (`1767571200000`), never `"2026-01-05"`. Picklist and multi-select values are the option's **`const`**, not its label.

**`apply_record_edits` checks each top-level value against its field's `type`** and refuses the whole call before anything is written: `'value' expects object, got string`, `'views' expects object, got a list`. A picklist value outside the field's options and a string over its `maxLength` are refused the same way. `number` and `integer` take a number, and an `object` field takes a JSON object, never a string or a list. A list belongs in a field of `type: "array"`; do not wrap it as `{ "items": [...] }` to get past the check, since filters and tables then see an object. **Nothing checks a child inside an `object` field**, and nothing checks the platform's own record create or a Storage bulk upsert from an automation: they turn an array or a number into text in a `string` field (`["Meals"]` is stored as the text `"[\"Meals\"]"`), silently drop text sent to a `number` field, and have stored a real array in a `string` child. So send every value in its field's type, and read the row back when the type matters. (Measured 2026-09-30 and 2026-10-08 on a test tenant.)

**Write values, do not compute them.** Every value is written literally. If a record has to sit three days in the past, work the epoch number out and write it. Never build record payloads with a code-execution tool: it puts a failure mode between you and the write, and a code call that errors leaves the object empty while looking like progress.

## Filters — the exact grammar

A filter is a flat list, not a tree. Each entry is `{ field, op, values }`, and `match` says how they combine.

```json
{
  "filters": [
    { "field": "status", "op": "EQUAL", "values": ["paid"] },
    { "field": "amount", "op": "GT", "values": [1000] }
  ],
  "match": "all"
}
```

- **`field` is the plain field name.** Not `properties.amount`, not `properties_amount`. The platform stores a custom field under a `properties_` prefix and answers a bare name with 200 and zero rows, so the tool resolves the name for you. A name it cannot resolve is refused with the object's real field list, which is the answer you want.
- **A field that holds an object or a list of objects is filtered by its sub-field path**, e.g. `{ "field": "personInfo.lastNameEn", ... }`. A text operator (`CONTAINS`, `ICONTAINS`, etc.) run against the parent object/array field itself is refused, naming the sub-fields to use instead.
- **`values` is always an array**, even for one value.
- **`match`** is `"all"` (the default, every filter must hold) or `"any"` (one is enough). There is no nesting and no `AND` / `OR` / `NOT` entry.
- **Operators**, uppercase: `EQUAL · NOT_EQUAL · IN · NOT_IN · LT · LTE · GT · GTE · BETWEEN · CONTAINS · NOT_CONTAINS · ICONTAINS · NOT_ICONTAINS · STARTS_WITH · NOT_STARTS_WITH · ENDS_WITH · NOT_ENDS_WITH · REGEX · NOT_REGEX · IREGEX · NOT_IREGEX · EXISTS · MISSING`. `MIN_LENGTH`, `MAX_LENGTH`, `WITHIN` and `CONTEXTUAL` look like operators but the host refuses all four with a 500 — never send them. Anything outside the working list is refused here too, because the host answers an unknown operator with a 500 that reads like a server fault. `EXISTS`/`MISSING` take no real `values` — send an empty or placeholder array, the tool ignores it.
- Values must match the field's type: numbers unquoted, dates epoch millis, picklists the option `const`.
- System columns are filtered by their own short names: `id`, `cTm`, `mTm`.
- **`BETWEEN [a, b]` leaves out a row whose value is exactly `a`**, while `GTE` and `LTE` keep it (measured 2026-10-02 on a test tenant). For a window that holds both ends, send `GTE a` and `LTE b` as two filters with `match: "all"`.

## What this skill cannot do

The object MCP server has no tool for these. When one is asked for, say plainly that it is not available here and point at the builder UI. Do not improvise a workaround through another surface.

- **Move an existing object into a project.** `apply_object_batch` takes `project` and applies it to the objects that batch CREATES, so a new object can start in one. There is no move for one that already exists.
- **Share an object or a record with a user.**
- **Read an object's activity** — who changed what, and when.
- **Export records** to CSV, XLS or XLSX.
- **Import records** from a file.
- **Update many rows from one filter.** `get_records` with the filter, then `apply_record_edits` with an `update` op per row id, is the way to do it, and it is fine for tens of rows, not thousands.

## How to act

1. **Work from this skill.** It holds the field types, field keys, index ops, settings and record rules, and no knowledge tool covers objects. When the *how* is not here, say so plainly. Never act from memory about platform behaviour, and never guess a shape.
2. **Read the live object before you change it.** `get_objects` for the schema, `get_records` when the change touches data. Never mutate blind. If the user names an object you are not already holding, resolve it with `search` first: a display name is not an id, and a "standard" or "custom" label in the request may be wrong. Use identifiers exactly as the user typed them, and re-compare your search string against their message before concluding an object is not there.
3. **Never mutate a Standard object.** Before any write against an object you did not just create in this conversation, confirm from `get_objects` or `search` that it is custom. Standard objects are the platform's own tables — Policies, Users, other built-in governance objects. They must never be created, edited or deleted here, however the request is phrased. If the target turns out to be Standard, say so and decline the write. Do not attempt it and do not ask for confirmation, because no confirmation makes it safe. **Reading a Standard object is always fine.**
4. **Act on the request — do not ask permission, and resolve missing pieces yourself.** When the request is clear, do it and report. **Seed or sample records named by an approved plan or brief are already approved**; the plan approval was the yes. Never stop to confirm seed data or ask whether fabricated sample rows are allowed. **Write every row the plan or brief names**, in as many calls as the rows need; creates that sit next to each other travel in one request. **Rows you make up yourself, because the request gives no count, stay a small sample of at most twenty per object.** A seed-count shortfall is never a reason to stop: correct and rewrite that object's rows once, then record the gap and keep building. When the target is not named — which object to rename, which project to create in — find it with the read tools and act, preferring one you created this conversation. Ask only when several targets are genuinely equivalent **and** the action is irreversible. Never ask on a create, except the three record-less stores above.
5. **Permanent data loss needs an explicit yes first.** Before `delete_object`, a filter delete in `apply_record_edits`, removing a field, or narrowing a field's type: run the dry run, state exactly what will be lost with the real count, inspect the dependency list from `delete_object`'s dry run for an object delete, and wait. Never infer the yes, and never start a delete yourself.
6. **If a tool refuses, read the refusal.** These tools name the field, the operator or the missing id they refused, and that is the fix. When the refusal is a platform one you do not recognise, quote the exact error in your answer. Do not blindly retry. *"Failed to compile schema"* means the **schema** is malformed, not the record.
7. **Trust a write's returned result.** `apply_object_batch` returns `wrote`, one outcome per step, and a read-back of every object it wrote in the same call; build from those, not from a fresh read. Read `wrote` first: `false` means nothing landed, whatever the steps say. Record writes return their landed count. Do not re-read to confirm a write you just made. Re-read only when you need live metadata for a later step, or when the result reported a half-stored field. The write refreshes the user's open view, so never tell them to refresh.
8. **Validation-testing is legitimate.** When the user asks to try an empty or invalid value to see the platform's error, send exactly what they asked, skip the conveniences above, and report the real response word for word. Do not refuse it, do not fix the values, do not invent the error.
