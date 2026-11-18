# Dataset fields, imports and behaviour at size

Everything a read or a write of a dataset or one of its child records needs, at
field level — the detail the evaluation tools carry so the skill does not have to.
Facts marked `(unverified)` are not settled; nothing here smooths over a gap.

## Contents

- [Size, paging and blast radius](#size-paging-and-blast-radius)
- [The dataset record](#the-dataset-record)
- [Test-case columns as the schema spells them](#test-case-columns-as-the-schema-spells-them)
- [Conversations and scenarios](#conversations-and-scenarios)
- [Which columns a dataset shows](#which-columns-a-dataset-shows)
- [Import history and the per-route configuration](#import-history-and-the-per-route-configuration)
- [Custom columns: metadata_fields_schema](#custom-columns-metadata_fields_schema)
- [Permissions](#permissions)
- [Known gaps](#known-gaps)

## Size, paging and blast radius

None of this is a rule the platform enforces. It is how datasets behave once
they are real, and every line of it is something a reader has to allow for.

**A dataset can hold thousands of test cases.** A hand-made dataset is small — a
handful of test cases is by far the commonest size — but an imported one runs to
a thousand or more, and reading one of those in full is a payload large enough to
be a problem on its own. **Never read test cases without a limit**; nothing in
the product caps it for you.

**A test-case count is never exact.** A dataset is written to while you are
reading it, so two counts taken minutes apart can differ and neither is wrong.
Report a count as approximate, and re-read it before acting on it.

**A full scan is approximately complete, never provably complete.** Paging is
forward-only on created time, descending, with no offset paging and no stable
re-read. Duplicate created-time values are real — records written in the same
instant share one — and a page boundary landing on a tie **drops the sibling row
silently**, with no error. The longer the scan, the more boundaries it crosses
and the more rows it can lose. **A scan must never be the input to a delete.**

**Delete blast radius.** Deleting one dataset **deletes** every test case in it,
which for an imported dataset can be thousands. The experiments pointing at it —
there can be several, each carrying its own runs — are **orphaned, not deleted**,
left pointing at a dangling `dataset_ids[0]`. So one call can destroy thousands
of test cases and leave several experiments and all of their runs pointing at
nothing. Confirm the counts with the caller first, and expect them to have moved
since you read them.

**Finding a dataset by name is usually ambiguous.** A large share of dataset
names are machine-generated, built around a generated entity id (`e_<24 hex>`)
rather than anything a person typed, which makes them long and near-identical to
one another. A name search has to be substring rather than exact, and has to
expect more than one hit.

**Do not assume a dataset is in use.** Datasets are commonly referenced by no
experiment at all, so an unreferenced dataset is the ordinary case rather than a
sign of a broken link. The reverse happens too: an experiment can point at a
`dataset_ids[0]` that no longer resolves to a live dataset, so resolution has to
tolerate a miss rather than erroring.

## The dataset record

Schema properties: `name`, `description`, `type`, `conversationType`,
`visibleFields` (array of string). `required: ["name", "type"]` — nothing
else is enforced, and `conversationType` is optional at the schema level even
though the create form shows it only for Conversational.

`type` is `'LLM' | 'CONVERSATIONAL'`; `conversationType` is
`'SCENARIO' | 'TRANSCRIPT'`. Both value sets are closed in practice — no third
value is stored on a record. `(LLM, TRANSCRIPT)` records are real, and a
naive one-field check for "conversational" hides exactly those; `SCENARIO` is
not seen alongside `LLM`.

Optional at the schema level means sparse in practice: `description`,
`visibleFields`, `conversationType` and the project id are all frequently
absent, and many datasets carry no `visibleFields` at all. Absent never means
defaulted.

Live full records carry **no `tags` and no `grants`**. The Tags column in the
manager therefore reads empty; that is a UI fact, not a data one. `version: 0`
is a real and common value — treat it as a version, not as a missing one, or
the commonest record on the platform is the one you mishandle.

Each child record points back at the dataset through `datasetId`. The children:

| Entity type | What it holds | `required` |
|---|---|---|
| `llm_test_case` | one row: input, expected output, context, tools, and the actual-output side | `["input", "dataset_import_order"]` |
| `conversational_test_case` | one conversation; its turns are `llm_test_case` rows carrying `conversationId` | `["dataset_import_order"]` |
| `eval_dataset_scenario` | a short situation a conversation is generated from | *(unverified)* |
| `dataset_import_history` | one record per ingestion, with the config that produced it | `["type", "datasetId", "instanceId"]` |

`dataset_import_order` is required on both test-case types and appears in no UI
form. Anything writing a test case has to mint it. `add_test_cases` mints it
from each entry's position when you leave it out.

Two entity types, `test_case` and `conversation`, are unrelated demo objects that
can sit alongside these. Do not wire anything to them by name.

## Test-case columns as the schema spells them

The stored names are snake_case, and they are what a metric parameter has to
resolve to:

| Group on screen | Stored name | What it is for |
|---|---|---|
| Input Fields | `input` | the only field a test case genuinely cannot do without |
| | `expected_output` | the reference answer; `QA` and `AI vs Human` grade against it |
| | `context` | what Faithfulness and hallucination-style metrics check against |
| | `expected_tools` (array of object) | required by `Tool Correctness` |
| Output Fields | `actual_output` | what the run produced |
| | `retrieved_context` | compare against `context` to tell a retrieval problem from a generation problem |
| | `tools_called` (array of object) | what the agent actually called |
| Metadata Fields | `latency`, `cost` (numbers) | per-test-case run cost, gradeable as metric parameters |
| Custom columns | `customProperties`, `customPropertiesOutput`, `metadataFields` (objects) | the custom-column payloads |
| Plumbing | `conversationId`, `datasetId`, `dataset_ids`, `datasetImportHistoryId`, `dataset_import_order` | grouping, ownership, batch and ordering |

**`retrieved_context`, not `retrievedContext`.** Live `llm_test_case` records
carry `retrieved_context`; `retrievedContext` is stored on no record and in no
`visibleFields` array. Note too that many datasets never expose
`properties.retrieved_context` at all — a dataset routinely does not carry the
column a metric asks for. `retrievedContext` is the spelling people reach for, and
a metric parameter mapped that way is **wrong**. The wrong key does not error — it
answers with zero rows — so this is a silent-failure class. A third spelling, `retrieval_context` on the run side, is
**not stored on records** *(unverified)*.

**`dataset_ids` is NOT legacy on an `llm_test_case`.** It is present on live
records, always holding `[<datasetId>]` and exactly equal to `datasetId`.
Something current writes it. Read `datasetId`, but do not assume the plural is
absent or stale, and do not write only one of the two. (On the experiment, `dataset_ids` is the real
field: there, the plural is an experiment property and nothing else.)

**An unset column is empty, not absent — and the empty value follows the type.**
A stored record carries every declared field, filled or not. The text fields
`expected_output`, `context` and `retrieved_context` come back as `''`; the
array fields `expected_tools` and `tools_called` come back as the **empty
array**. A completeness check has to test `''`, an empty array **and**
`undefined`; testing only `''` misses every empty tools column. It matters,
because a large share of metrics declare `EXPECTED_OUTPUT` as a required
evaluation parameter — the mechanical origin of the missing-parameter sentinel.

Of the three custom-column payloads, `metadataFields` is the one stored records
actually carry (holding a custom key against its value); `customProperties` and
`customPropertiesOutput` are the unused arm.

## Conversations and scenarios

`conversational_test_case` is thin: `name`, `agent_role`, `datasetId`,
`dataset_ids` (legacy on this type, unlike on an `llm_test_case`),
`datasetImportHistoryId`, `dataset_import_order`. A conversation's turns are
`llm_test_case` rows carrying `conversationId`.

`eval_dataset_scenario` has an unsettled schema *(unverified)*. It
carries `datasetId` and a nested `scenario` object of `title` and `description`,
and the Scenarios board — what a `SCENARIO` dataset opens on instead of a grid —
labels those two differently from the way they are stored:

| On screen | Stored property |
|---|---|
| `Scenario Name` ("Angry customer, refund outside policy window") | `scenario.title` — **not `name`** |
| `Scenario Description` | `scenario.description` |

The board also has a `Generate` action that drafts a spread of scenarios to edit
and prune, and scenarios can be removed individually. `CONVERSATIONAL` +
`SCENARIO` datasets do get created, so the records certainly exist; only the
schema is unread.

## Which columns a dataset shows

`visibleFields` is an array of strings on the dataset. A custom key reaches it in
any of three spellings:

| Spelling in `visibleFields` | How common |
|---|---|
| bare, unprefixed `<key>` (e.g. `severity`) | the overwhelming majority |
| `properties.customProperties.<key>` | occasional |
| `properties.metadataFields.<key>` | occasional |

Do not assume a single canonical form and do not require a `properties.` prefix
when reading one — a reader that does drops nearly all real custom columns.

**Malformed entries are real, not hypothetical.** Entries that resolve to
nothing at all occur in practice and have to be tolerated rather than assumed
away. The shapes seen:

| Malformation |
|---|
| `properties.expected.output` (dots where the schema uses underscores) |
| `properties.actual.output` |
| `properties.expected.tools` |
| `properties.retrieved.context` |
| `properties.tools.called` |
| double-prefixed `properties.properties.<f>` |
| a whole JSON array literal stored as one string element |

None of these resolves to a column. Validate each entry against the schema
before rendering it, and report what does not resolve rather than throwing on
it.

## Import history and the per-route configuration

A `dataset_import_history` record carries `type`, `datasetId`, `instanceId` (the
automation run that performed the import), `status`, `testcaseCount`,
`createdBy`, `testCaseType` (`LLM` or `CONVERSATIONAL`) and exactly one config
block. Neither `type` nor `status` is a closed enum, so treat each set as
open rather than closed; `status` is `'completed' | 'failed' | 'syncing'`.
Four declared `type` values cover four of the wizard's six sources, and
`createdFromKnowledgeSets` breaks the SCREAMING_CASE of its three siblings:

| Route | `type` | Config block |
|---|---|---|
| Add from Sessions | `SESSION` | `sessionConfig` |
| Add from OTel Traces | *(unverified — no distinct value is declared; `SESSION` is the likely reuse)* | `sessionConfig` *(unverified)* |
| Upload CSV | `CSV` | `csvConfig` |
| Generate with AI Prompt | `PROMPT` | `promptConfig` |
| Generate using Knowledge Set | `createdFromKnowledgeSets` | `knowledgeSetsConfig` |
| Start from Scratch | *(unverified — probably no import record at all)* | — |

Whether `Start from Scratch` sits in that menu or reaches the grid another way
is itself *(unverified)*.

The config blocks, field by field:

| Block | Fields |
|---|---|
| `csvConfig` | `filename`, `fieldMappings` (pairs of `entityField` and `fileField`), `fileType`, `source` |
| `sessionConfig` | `filter`, `evalType` (`'normal' \| 'self'`), `samplingRate`, `fieldMappings` (pairs of `datasetField` and `sessionField`), `aiAgentId` |
| `promptConfig` | `aiAgentId`, `goal`, `modelId`, `fieldsToGenerate` |
| `knowledgeSetsConfig` | `knowledgeSets`, `goal`, `modelId` |

The two field-mapping shapes differ: CSV pairs `entityField` with `fileField`,
sessions pair `datasetField` with `sessionField`. And the create/update-dataset
modal schema holds **two textually identical `modelId` blocks** (prompt versus
knowledge-set) that can only be told apart by what follows them —
`testcaseCount` after the prompt one, `numberOfCases` after the other.

## Custom columns: `metadata_fields_schema`

Custom columns beyond the built-ins live on a separate entity,
`metadata_fields_schema`, whose properties are `entityId`, `schema` (a JSON
Schema), `type` (`'DATASET' | 'METRIC'`) and an optional `count`. One entity
type serves both Datasets and Metrics and the `type` discriminator is the only
thing separating them, which is why reading custom columns for one id fires both
fetches. The shape above is *(unverified)*.

Three sources merge into the test-case column set: the `llm_test_case` schema's
`customProperties.*`, the dataset's `metadata_fields_schema`, and the metric's.
A custom column's key is prefixed on the way to a column —
`customProperties.<key>` as an entity path, `properties.customProperties.<key>`
as a column key — but see the spellings above: the bare form dominates.

The field-definition form takes `field_label` (required), `description`,
`field_type` (`STRING | NUMBER | INTEGER | BOOLEAN`, default `STRING`),
`is_optional` (default false) and a type-conditional `default_value`. The field
*name* is never typed — it is `camelCase(field_label)`. Only `STRING`, `NUMBER`,
`INTEGER` and `BOOLEAN` can be written today, but stored schemas also hold
`object` and `array` fields that the write tools cannot express. A dataset's
write replaces the whole set, so it would drop them.

For a metric, a custom column made on the screen is re-keyed into
`UPPERCASE_UNDERSCORE` so it can sit beside the standard evaluation-parameter
values, with the original id preserved as `$id`. A column made by the
`set_metric_metadata_fields` tool is stored under the key its reply's `column`
names. Either way the experiment maps the dataset's key to the metric's key as
the metric stores it.

## Permissions

How record permissions apply:

- Record `EDIT` gates content writes on a dataset — adding test cases, managing
  fields, persisting `visibleFields`.
- Record `DELETE` gates only deleting the dataset itself.
- Viewing a test case is a read: the drawer opens read-only rather than being
  blocked, and the column picker stays open to viewers.

## Known gaps

- `eval_dataset_scenario` has no settled `required` list — but
  `CONVERSATIONAL` + `SCENARIO` datasets exist, so the entity is not
  theoretical. What deleting one cascades to is also *(unverified)*.
- No enum exists for import `type` or `status`; neither set is closed.
- The stored shape of a `metadata_fields_schema` entity is *(unverified)*.
- Whether a hand-typed (`scratch`) test case produces an import-history record
  is *(unverified)*.
- Whether OTel imports reuse `type: 'SESSION'` is *(unverified)*. As it stands the
  OTel route has no declared outcome channel at all, which means no way to tell
  whether one worked.
- The `Export` action's payload is *(unverified)*. What Export is *for* is worth
  recording even though its shape is not: reviewing a large dataset offline,
  sharing it with someone who does not live in the platform, and **bulk-edit
  round-trips** — export, fix a column across two hundred rows in a spreadsheet,
  bring it back through `Upload CSV`. It doubles as a cheap pre-import snapshot.
- `knowledgeSetsConfig` is typed as only `knowledgeSets`, `goal` and `modelId`,
  but the generation form has five more controls with **no typed home**:
  `Add Knowledge` (several sets at once), `Coverage` (`Complete` | `Targeted`,
  plus the topic list `Targeted` takes), `Nature of Test Cases` (the free-text
  brief, and `Use Template`), `No. of Cases`, and `Dataset Columns to generate`
  (`Input`, `Expected Output`, `Context`, `Expected Tools`, plus custom columns
  through the `Add Metadata Field` control). Whether `goal` carries the brief and
  `numberOfCases` the count is the obvious guess and nothing more
  *(unverified)*.
- **`Knowledge_ID`** — the product guide states every knowledge-set-generated
  test case is stamped with the `Knowledge_ID` it came from, whether or not it
  was asked for, so a wrong test case traces back to the knowledge that produced it. No
  field of that name exists in the `llm_test_case` schema; it is presumably
  a custom column *(unverified)*.
- `sessionConfig.evalType` (`'normal' | 'self'`) is almost certainly the
  `Map Sessions To` control (`Set quality benchmarks` → input/expectation
  fields, `Review past performance` → output/actual-result fields), but which
  mode is which value is *(unverified)*.
- The product guide says a task receives mapped values under `additional`
  alongside `metadataFields`. No stored field is named `additional`, so it is
  probably a runtime task-input key *(unverified)*, and only a live task-input
  payload will settle it.
