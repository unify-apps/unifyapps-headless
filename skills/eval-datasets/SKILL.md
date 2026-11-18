---
user-invocable: false
name: eval-datasets
description: "Only for the agent-builder builder agent. Builds and fills a UnifyApps Evaluation dataset — the exam paper an Experiment grades an agent against. Covers what one test case holds, the two creation-time questions that decide whether a dataset is conversational and whether it stores scenarios or transcripts, which columns a metric can grade and which it silently cannot, how visible and custom columns work, the five routes that bring test cases in and which to prefer, what makes a test case worth having and a set worth trusting, and what a delete takes with it. Names the exact evaluation MCP tool for each job — create, fill, import, edit, export and delete — with the order of calls and how to read each write back. Load it whenever a dataset, its test cases, its columns or its imports have to be created, filled, read or explained — none of it can be done from a page or an automation."
---

## What a dataset is

A dataset is a named collection of **test cases** — the exam paper an
Experiment grades an agent against. The product page says it plainly:
*"Organise your test cases to quickly evaluate your AI Agents"*.

One test case is one question plus everything needed to mark the answer. A run
fills in the other side: what the agent actually said, retrieved and called, and
what the turn cost.

A dataset knows nothing about experiments or metrics. **The experiment is the
join table**: it names one dataset, names the metrics, and maps one to the
other. Cross that line and the answer is in `eval-experiments`.

## The evaluation MCP server

Every tool here is an MCP tool on the `evaluation` server, bridged to the
signed-in tenant. Its full name is `mcp__plugin_ua_evaluation__<tool>`, so
`create_dataset` is `mcp__plugin_ua_evaluation__create_dataset`. There is no
CLI, and there is no other way in: an evaluation write sent any other way has
none of the checks these tools carry.

**Every call takes `host`.** It is the signed-in tenant's bare host name, with no
`https://` and no path. It is never filled in for you.

**When a write fails for no reason you can see, call `check_evaluation_automations`
first.** Exports, the scenario delete and some reads run through platform
automations, and a tenant that has not registered one answers HTTP 500
`forbidden datasource: not found` from every tool that needs it.

**Four tools here delete, and none of them can be undone:** `delete_dataset`,
`delete_dataset_items`, `delete_dataset_conversation` and
`delete_dataset_scenario`. Each one, called without its confirmation, deletes
nothing and tells you what it would take. Say that back to the person and get
their yes before you call it again with the confirmation. When there is nobody to
ask, such as an unattended run, do not confirm: report what the first call said
and stop.

## Two questions decide what a dataset holds

Both are answered at creation and **neither can be changed afterwards**. Pick
the wrong one and you do not reconfigure the dataset, you create a new one.

**Is it conversational?** A dataset is conversational if it is declared
conversational — *or* if it is declared LLM and stores transcripts. That second
form is legacy data today's form cannot produce, but it exists, and treating
"conversational" as one field hides it: those datasets render flat, with no
conversations in them and no error.

**Scenario or transcript?** Only for a conversational dataset, and it decides
whether you store conversations or the instructions for producing them.

| Kind | What a run works from |
|---|---|
| `TRANSCRIPT` | the stored turns, exactly as they are |
| `SCENARIO` | conversations generated fresh from the situations, at run time |

A conversational dataset can also be stored with **no `conversationType` at all**.
Treat it as unknown: read its rows with `list_dataset_items` to see whether it
holds conversations or scenarios before you write to it.

### A scenario is not a saved conversation

Nothing is stored turn-by-turn in a scenario dataset. When an experiment runs
one, the platform reads the scenarios and **generates conversational test cases
from them at that moment**, with the Test Case Generator model configured on the
experiment (see `eval-experiments`). So scenario datasets are **not**
turn-for-turn reproducible between runs, and two runs compare only in aggregate.
Use transcripts for regression testing, or to reproduce a known failure exactly.

## A metric can only grade what the dataset carries

Every column exists because some metric reads it, and a dataset missing the
column a metric asks for produces a score that means nothing rather than an
error.

| Column | Why it is there |
|---|---|
| Input | the only field a test case genuinely cannot do without |
| Expected Output | the reference answer; QA and AI-vs-Human grade against it |
| Context | what faithfulness and hallucination metrics check against |
| Expected Tools | what Tool Correctness compares against |
| Actual Output | what the run produced |
| Retrieved Context | compare against Context to tell a retrieval problem from a generation problem |
| Tools Called | what the agent actually called |
| Latency, Cost | per-test-case run cost, gradeable like any other parameter |
| Custom columns | whatever your own metrics ask for |

**A metric names no dataset.** It couples by **field name and test-case type**:
its declared parameters must resolve to columns on these test cases, and its
test-case type must match the dataset's kind. Those parameter names are
**free-form, not a closed list** — real working metrics ask for custom
column names and for outright junk — so never validate them against the set the
wizard offers. That is the compatibility rule from the dataset's side;
`eval-metrics` owns the other side and the scoring semantics, and this skill
does not re-derive them.

## Which columns a dataset shows

The column set is not fixed. It is persisted on the dataset and edited through
**Manage Fields**, which sorts columns into Input, Output and Metadata. Writing
it needs edit rights on the record; the picker stays open to viewers. **This is
the contract a metric binds to**, so the shown set is what a reader believes the
dataset carries.

**Hiding a column does not clear it** — the value stays on the test case and a
metric can still read it, so hiding is never a way to remove data. The same
panel carries `Add Metadata Field`, so a **custom column is created from the
place columns are hidden**, not from a separate screen. Custom keys reach the
grid under several spellings; `get_dataset` resolves them, so do not
pattern-match a prefix yourself.

## A one-sided dataset teaches a one-sided lesson

**Nothing in this section or the two after it is enforced by the platform** — a
dataset saves whatever you put in it, and a badly built one scores exactly as
willingly as a good one. They are what separates a dataset you can act on from one
that only looks like a test.

A dataset made only of cases where the agent **should** act teaches it to always
act. Cover both sides of every behaviour you care about: the cases that should
trigger a search, a tool call or an escalation, and the cases where doing nothing
is the right answer. Without that second half there is nothing to lose by
over-triggering, and no test case measures it.

For a support agent that can search an order system, *"Where is order 1234?"*
should trigger the search, and *"What are your opening hours?"*, which its own
instructions already answer, should not. Put both in the dataset, with the
expected tools of the second one left empty.

The same balance applies to difficulty. A dataset of nothing but hard cases hides
a regression on the easy ones, and one of nothing but easy ones has nothing left
to teach once it passes.

## A test case nobody could pass is a broken test case

Write the expected output as a worked answer rather than a wish, and check that
an agent following the question could actually produce it. When every attempt at
a case fails, the case is usually the thing that is wrong — ambiguous,
under-specified, or expecting something the question never asked for — and the
agent is the last place to look.

**Everything a metric will mark has to be asked for in the input.** A metric that
takes a point off for a missing date, on a question that never asked for a date,
produces a failure the agent had no way to avoid. Two people reading the test
case should agree on what a pass looks like before it goes in the set.

## Two datasets, and you do not open the second one

Keep two: the dataset you iterate against, and a **held-back dataset** you check
yourself against. Change the agent against the first, then confirm the change on
the held-back one. If the first improves and the held-back one does not, the
change fitted those particular test cases rather than the problem behind them.

A held-back dataset only works for as long as nobody reads its failures: no test
case gets added, reworded or fixed because of what it said, or it has quietly
become part of what you tune against. There is nothing to split and nothing to
tag — the separation is two datasets and the discipline to leave one shut.
`eval-experiments` owns what to do with the pair once they exist.

## The five ways test cases get in

Five routes bring test cases in from somewhere else; `Start from Scratch` is not
one of them, it is typing test cases into the grid after defining the columns.
One dataset can be filled from several routes at once.

**The routes are not equally good, and the order matters.** Real traffic first —
Sessions and OTel traces carry the questions people actually ask, including the
ones nobody would have thought to invent. Then a CSV of the tickets and bug
reports the feature has already produced. Then a handful written by hand for the
behaviour you are specifically worried about. **Generated test cases last:** a
prompt or a knowledge set produces the cases you already expected, which is the
half of the problem you least need help with. When you do generate them, anchor
the prompt to real examples and read what comes back before it counts as a test
case.

| Route | What it is for |
|---|---|
| Sessions | real traffic from one agent, sampled and filtered |
| OTel traces | the same idea, from traces rather than sessions |
| CSV | a sheet somebody already has, or a round-trip of an export |
| Prompt | describe the test cases you want and have a model write them |
| Knowledge set | generate test cases from documents the agent is supposed to know |

### CSV rows become conversations

For a conversational, transcript-based dataset, **one CSV row is one turn, not
one conversation** — the mistake the product guide singles out as the one people
make most. Grouping is by a `Conversation ID` column you map at import:

- If you do not map the field, the importer falls back to a column **literally named `ConversationId`**.
- Rows for one conversation need not be adjacent, but their **relative order in the file is the turn order** — do not re-sort the sheet before uploading.
- **A blank id is its own group**, so a handful of blanks quietly become a handful of one-turn conversations. Give every row an id.
- Conversation-level values — the agent role for that dialogue, for instance — ride along on the rows and are applied to the conversation.

### Importing from sessions

You pick an agent, a sampling rate, a filter over the sessions, and the
decisive one, **`Map Sessions To`**, which decides where a session lands:

| Mode | Where the session lands |
|---|---|
| `Set quality benchmarks` | input and expectation fields — your best historical sessions become the standard new agent versions are held to |
| `Review past performance` | output and actual-result fields — analyse how the agent actually handled real traffic |

The dialog reports how many sessions match, and **only sessions with at least
one user query are imported**, so the count shown is the count you get.

**Sampling only what failed builds the wrong set.** A set assembled from the
cases one agent version got wrong is shaped around that version's particular
weaknesses, and it stops measuring much once the version changes. Take the
failures, but take the cases that are hard on their own merits as well, and keep
some ordinary traffic that should obviously pass — that is what tells you a
change broke something that used to work.

### Generating from a knowledge set

**`Coverage`** is either `Complete`, which samples across everything in the set,
or `Targeted`, which pulls only material matching topics you name. Every
generated test case is stamped with the **`Knowledge_ID`** it came from, asked
for or not, so a wrong test case traces back to the knowledge that produced it —
usually where the real bug is. That stamp arrives as a custom column rather than
a declared field *(unverified)*.

Generate only from a set whose sources finished indexing, since generation
reads what the set has indexed *(unverified)*. `check_knowledge_status
{knowledgeSetId}` on the agent-builder server answers `readyToTest`.

### An import is asynchronous and only history says it worked

Generation and large imports run in the background. Import history is the only
place that tells *"still working"* apart from *"failed and produced nothing"* —
two states that look identical from the dataset itself. Every test case remembers
the import it arrived in, which makes an import a traceable, deletable batch.

## Filling a dataset, in order

The order is the point: two of these cannot be undone later, and two of them are
the only way to find out that an import did nothing.

**Twenty to fifty test cases is a working set.** Early on the problems are large
enough that a small set finds them, and a small set is the one that actually gets
built — so start there and grow it from what the runs show, rather than holding
out for a set of hundreds.

1. **Answer the two creation-time questions before anything else.** Conversational or not, and — if conversational — scenario or transcript. Neither is editable afterwards, so a wrong answer costs a new dataset rather than a reconfiguration. `create_dataset` with `name`, `type` and, for a conversational one, `conversationType`. Keep the `datasetId` it returns.
2. **Define the columns before a single test case arrives.** `set_dataset_metadata_fields` writes the custom columns. It replaces the whole set, so read `get_dataset` first and send every column you want to keep. The custom columns are the contract a metric binds to by name, and a column that does not exist yet is a place an imported value cannot land. Setting the shown columns (`visibleFields` through `update_dataset`, with the `version` from `get_dataset`) is optional: it only decides which columns the dataset screen shows, and scoring works without it.
3. **Pick the route that matches where the test cases already are** — sessions, OTel traces, CSV, prompt or knowledge set, in the order of preference in `## The five ways test cases get in` — or write them directly: `add_test_cases` on a flat or transcript dataset, `add_scenarios` on a scenario one. One dataset can take several. Whatever the route, cover both sides of the behaviour before you stop: § "A one-sided dataset teaches a one-sided lesson".
4. **On the CSV route, map against real headers, never guessed ones.** `parse_import_columns` previews a CSV's headers; the other four routes have no header preview, so this step is CSV-only. On a conversational transcript CSV, map `Conversation ID` explicitly: unmapped it falls back to a column literally named `ConversationId`, a blank id becomes its own one-turn conversation, and file order is turn order. The file must be on the platform first: upload it with `upload_import_file`, which answers the file's platform path (`/api/file/…`). Pass that path as `source` to `parse_import_columns` and then to `import_test_cases`. A link to another site is not fetched.
5. **Start the import and watch its history until it finishes.** `import_test_cases` hands back only that the job was accepted, because the work is asynchronous. Call `list_import_history` until the newest row's `status` leaves `syncing`. It is the only thing that tells *still working* from *failed and produced nothing* — the dataset itself looks identical in both. An import still `syncing` after 10 minutes is stuck: no tool restarts, stops or removes it, so tell the person and count the rows with `list_dataset_items`; `completed` alone is not proof rows were written either.
6. **Check what actually landed before anyone attaches a metric.** `dataset_digest` says which columns are genuinely filled. A metric pointed at an empty column scores nothing and raises no error.
7. **Read the test cases back with a limit on the read.** `list_dataset_items` with `limit` 50. Most datasets hold a handful, but a dataset can hold thousands of test cases (see `## Size and blast radius`), and the cap belongs in the call rather than in a caveat after it. Raise the limit, or follow `cursor`, only if the digest says you need more.

A direct write is read back the same way. After `add_test_cases`, `add_scenarios`
or `update_test_case`, call `list_dataset_items` and check that the ids the write
returned are there, holding the values you sent.

## The tools

Every call takes `host` as well as the inputs named below. Ids come from the
read named on each line, never from a guess or a name.

`list_dataset_items` is the one place this skill does not say *test case*: it
also returns turns and scenarios, which are not test cases, so the tool is named
for the wider thing it returns. Everywhere else, the thing inside a dataset is a
test case.

### Reading

- **`list_datasets`** — find a dataset. `name` matches as a case-insensitive part of the name, because dataset names are often machine-generated and an exact name rarely resolves; `type` and `conversationType` narrow it further, and `limit` with `cursor` pages. Expect several hits and confirm which one is meant before writing to it.
- **`get_dataset`** — one dataset by `datasetId`: which kind it really is, which columns it shows, the custom columns it declares, which entries of `visibleFields` resolve to nothing (`unresolvedVisibleFields`), and the `version` that `update_dataset` needs.
- **`list_dataset_items`** — one page of what is inside a dataset: `datasetId`, `limit`, `cursor`. The dataset's kind decides the child type, and the reply names it in `childTypeUsed`. Pass a conversation's id as `conversationId` to read that conversation's turns. A very long value comes back cut to its first characters, and the reply's `shortened` lists where; name that path in `fullValues` on the next call to get it whole.
- **`list_import_history`** — one row per import, with `status` `syncing`, `completed` or `failed` and how many test cases it made. Takes `datasetId`; nothing else answers whether an import worked.
- **`dataset_digest`** — how many sampled test cases have each column filled in. Takes `datasetId` and an optional `sampleSize`. It is a sample, not a count, and it does not count custom columns: to prove one landed, read `metadataFields` on the rows `list_dataset_items` returns.
- **`parse_import_columns`** — the headers of a file already on the platform: `source` (the `/api/file/…` path `upload_import_file` answered), `fileType` (`CSV`, `XLS`, `XLSX` or `JSON`) and an optional `filename`.

### Writing

- **`create_dataset`** — `name`, `type` (`LLM` or `CONVERSATIONAL`, with no default), and `conversationType` (`TRANSCRIPT` or `SCENARIO`) for a conversational one. `description` and `visibleFields` are optional. Returns the `datasetId`.
- **`update_dataset`** — `datasetId`, the `version` from `get_dataset`, and any of `name`, `description` or `visibleFields`. `visibleFields` replaces the whole list. `type` and `conversationType` cannot be sent. A refused write means someone changed the dataset since you read it: read it again rather than guess a version.
- **`set_dataset_metadata_fields`** — `datasetId` and `fields`, each with `field_label` and optionally `description`, `field_type` (`STRING`, `NUMBER`, `INTEGER` or `BOOLEAN`) and `is_optional`. It **replaces** the whole set, so a column you leave out is gone. A stored column can also have type `object` or `array`, which this tool cannot send back: when `get_dataset` shows one, do not call this tool, because the replace would drop it. The stored key is `camelCase(field_label)` (`Region` becomes `region`). `get_dataset` lists the keys (`customFieldKeys`) but not their types, and no tool reads a column's type back; to check a column holds numbers, read a test case with `list_dataset_items` and look at the stored value. The experiment's field mapping joins this key to the metric's own key for the column, as the metric stores it: `{sourceKey: "region", fieldKey: "<the metric's key>", sourceType: "DATASET"}` (`eval-experiments`).
- **`add_test_cases`** — `datasetId` and up to 50 `test_cases`. Each takes `input` and any of `expected_output`, `context`, `actual_output`, `retrieved_context`, `expected_tools` and `tools_called` (each a list of `{name}`), `latency`, `cost`, and `metadataFields` for custom columns. The tool fills in `dataset_import_order` when you leave it out. On a flat dataset each entry is one test case. On a transcript dataset the entries are **the turns of one conversation**, in order: call it once per conversation, with that conversation's `conversationName` and `agent_role`. A scenario dataset is refused here.
- **`add_scenarios`** — `datasetId` and up to 50 `scenarios`, each with `title` and `description`. Only on a scenario dataset.
- **`generate_scenarios`** — `datasetId`, `modelId` (from agent-builder's `list_models`, see § "What no tool does") and `goal`, with optional `count` and `aiAgentId`. It **writes nothing**: it hands back drafts. Show them to the person, keep the good ones, and save those with `add_scenarios`.
- **`update_test_case`** — one test case: `datasetId`, plus `testCaseId` and `version` from `list_dataset_items`, plus only the columns to change. A test case from another dataset is refused. There is no bulk form, on purpose.
- **`upload_import_file`** — puts a CSV on the platform so the CSV route can read it: `filename` (ending `.csv`) and `content`, the CSV text itself, at most 1,000,000 characters. It answers `source` (the file's `/api/file/…` path), `fileType` and `filename`, which is what `parse_import_columns` and `import_test_cases` take. No tool deletes an uploaded file.
- **`import_test_cases`** — `datasetId` and `route`, then only that route's inputs. It returns only that the job started, so watch `list_import_history`.

  | `route` | Needs |
  |---|---|
  | `CSV` | `source`, `fileType`, `csvFieldMappings` (each `{entityField, fileField}`: a built-in column by its plain name, such as `input`, and a custom column as `metadataFields.<key>`; the tool refuses a custom column without the prefix, which the importer would drop), optional `filename` |
  | `SESSION` | `aiAgentId`, `evalType` (`normal` or `self`), optional `samplingRate`, `filter`, `sessionFieldMappings` (each `{datasetField, sessionField}`) |
  | `OTEL` | `filter` |
  | `PROMPT` | `goal`, `modelId`, optional `testCaseCount` and `fieldsToGenerate` |
  | `KNOWLEDGE_SET` | `knowledgeSets`, `goal`, `modelId`, optional `coverage` (`Complete` or `Targeted`) with `targetedTopics`, `testCaseCount`, `fieldsToGenerate` |

- **`export_dataset_test_cases`** — `datasetId` and an optional `fileType` of `CSV`. It returns **no test cases and no file**: the export runs in the background and the file reaches the person outside this conversation. Never present its reply as dataset content. To read rows, use `list_dataset_items`.

### Deleting — each needs the person's yes

- **`delete_dataset_items`** — `datasetId` and up to 200 `testCaseIds` from `list_dataset_items`. Without `confirm: true` it says how many it would delete and deletes nothing. One id from another dataset refuses the whole batch. To find the ids an import made, send `datasetImportHistoryId` on its own: that lists them and deletes nothing, and an imported batch can run to thousands. Never delete ids gathered by scanning the dataset: a scan can drop rows silently, so the list you deleted from was never the list you thought it was.
- **`delete_dataset_conversation`** — `datasetId` and `conversationId`. Without `confirm: true` it says how many turns the conversation holds. It deletes the conversation record **but not its turns**: when the turns must go too, list them with `list_dataset_items` and that `conversationId`, and delete them with `delete_dataset_items` first.
- **`delete_dataset_scenario`** — `datasetId` and `scenarioId`. Without `confirm: true` it names the scenario. It runs the platform's own scenario delete, and refuses rather than doing a bare delete when that automation is not registered.
- **`delete_dataset`** — `datasetId`, `confirm: true` and `confirmName` set to the dataset's exact name. Without both it reports the dataset, how many rows it holds and the experiments that use it (`experimentCount`), and deletes nothing. **It deletes the dataset record only.** Its rows stay behind where nothing can reach them, so delete them first: test cases with `delete_dataset_items`, conversations with `delete_dataset_conversation`, scenarios with `delete_dataset_scenario`. The experiments that use it are left pointing at nothing.

## Traps that answer 200 and do the wrong thing

- Treating "conversational" as one field: an LLM dataset holding transcripts renders flat, with none of its conversations.
- Comparing two runs of a scenario dataset test case by test case: the test cases were generated fresh each time and never matched.
- Hiding a column to remove a value: the value stays, and metrics still read it.
- A CSV with blank conversation ids: each blank becomes its own one-turn conversation.
- Re-sorting a CSV before uploading: file order is turn order.
- Validating a metric's parameters against the set the wizard offers: real, working metrics use names that are not in it.
- Attaching a metric whose test-case type does not match the dataset's kind: it scores nothing, and nothing says so.
- A dataset with no cases where the right answer is to do nothing: anything tuned against it over-triggers, and no test case measures that.
- A case every attempt fails, read as a weak agent: far more often the case itself is wrong.
- Adding or fixing a test case because the held-back dataset failed on it: it stops being held back the moment you do.

## Size and blast radius

**Never read a dataset's test cases without a limit.** Hand-made datasets hold a
handful of test cases, but an imported one can hold **thousands**, and reading
one of those in full is a large enough payload to be a problem on its own.
Anything tuned to the typical dataset falls over on the tail either way, so the
cap belongs in the read, not in a caveat after it. The same applies to a count:
a dataset is written to while you read it, so treat any total as approximate.

**A delete reaches further than the dataset and does not come back.** It takes
every test case in the dataset, and the experiments pointing at it are
**orphaned, not deleted** — each survives with a dataset reference that no longer
resolves, which is a state experiments do end up in. Confirm both counts with the
caller first, and expect them to have moved since you read them.

## What no tool does

When one of these is asked for, say plainly that it is not available here and point at the Evaluation UI. Do not improvise a workaround through another surface.

- **Edit a scenario.** Scenarios can be added, generated and deleted, but not changed. To change one, delete it and add the new version, with the person's yes for the delete.
- **Copy a dataset.** The product has no dataset copy, so neither do the tools.
- **Resolve an agent or a knowledge set by name.** `import_test_cases` and `generate_scenarios` take ids. Read them on the agent-builder server: an agent's from `list_agents` (`mcp__plugin_ua_agent-builder__list_agents`), a knowledge set's from `list_knowledge_sets` (`mcp__plugin_ua_agent-builder__list_knowledge_sets`). A `modelId` also comes from there: it is a model card id from the agent-builder server's `list_models` (`mcp__plugin_ua_agent-builder__list_models`, with `forSlot: "TEXT_GENERATION"`). Pick a card with `connectionActive: true`, and when the tool fails, ask the person for an id rather than guess one.
- **Delete everything a run of work leaves.** No tool deletes an import's history row, an uploaded CSV, or the custom-column record of a dataset or a metric, and all of them stay after their dataset or metric is gone. A CSV import into a flat dataset also gives each row a `conversationId`, and no tool lists or deletes the conversation record behind it. Tell the person what is left when you clean up.
- **Hand back an export's content.** `export_dataset_test_cases` starts an export and returns nothing you can read.

## What has been checked, and what has not

**Everything here describes stored behaviour you can check on your own
records.** A claim that is not settled is marked `(unverified)` where it
appears. Treat an `(unverified)` line as something to confirm before you build
on it.

**Expect to take the procedure a step at a time on a smaller model.** Do not
hand all seven steps over as one instruction and assume they land.

## Reference files

| File | Read it when |
|---|---|
| [references/dataset-fields-and-imports.md](references/dataset-fields-and-imports.md) | the stored shape is genuinely needed: the wire column names, the per-route import config, the custom-column mechanics, how a dataset behaves at size, and the known gaps |
