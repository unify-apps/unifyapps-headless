# Configuring an experiment

Read this when you are **setting an experiment up** rather than reading its
results: which model does which job, how dataset fields are wired to task and
metric inputs, what the wizard's later steps offer, and the stored shapes behind
those controls. The rules that matter on every read — the three targets, what a
run costs, and how to read a score — stay in SKILL.md; this file is the
surrounding detail.

## Contents

- Three models, three jobs — and which one `llm_model` probably is
- Field mappings: two independent maps — and the localization bug in one
- Wizard steps 2 and 3 — the controls, and why the guide's `20` concurrency
  default is not one

## Three models, three jobs

An experiment involves three independent model choices, set in three different
places. Mixing them up is, by the product guide's own account, the most common
confusion in the whole product.

| Model | Set where | What it does |
|---|---|---|
| The agent's model | on the agent record itself | produces the answers being graded |
| `Test Case Generator` | experiment wizard, step 1 **Configure Dataset** | turns a conversational dataset's scenarios into the actual conversations the agent will face |
| Judge model | on each AI metric (`metricConfig.model`) | scores the answers |

`Test Case Generator` — *"select the LLM to generate the scenario based test
cases"* — appears **only when the chosen dataset is conversational**. It is not
rendered at all for an `LLM` dataset.

`llm_model` is the only experiment-level model field, and nothing documents what
it feeds. It is **most plausibly the `Test Case Generator`, not the judge**
*(unverified)*: the guide puts the judge model on each AI metric and a live metric
record carries `metricConfig.model`, which leaves the experiment no need of a
second judge field — but the guide contradicts itself, its workflow section still
saying you pick "which model acts as the judge" while configuring a run. Read
`metricConfig.model` for the judge, and do not write `llm_model` unless you mean
the generator. It is rarely set at all, and where it is set the stored value can
be a name-shaped literal rather than an opaque id, so "always an opaque id" is not
safe either.

The operating rule: **keep the generator and the judge fixed while you are
iterating on the agent.** Changing either changes the ruler, and two runs stop
being comparable.

## Field mappings: two independent maps

Both are lists of `{ sourceKey, fieldKey, sourceType }`, and they are set in
different steps of the wizard and stored in different places. The tools take the
metric side grouped by metric: `metricFieldMappings: [{ metricId, mappings: [
{ sourceKey, fieldKey, sourceType } ] }]`.

| | Where it is stored | What it maps | How `sourceType` is set |
|---|---|---|---|
| Task mappings | `task.fieldMappings` | a dataset field -> a task-automation input | hardcoded `'TASK'` |
| Metric mappings | `metrics[].fieldMappings` | a dataset or task field -> a metric input | derived from the picked option's group label |

`sourceKey` is the name on the test case, `fieldKey` the name the receiver gets it
under, and the pair exists so a task written for one naming convention can consume
a dataset that uses another. `sourceKey` is the camelCase dataset column.
`fieldKey` is the metric's parameter key exactly as the metric stores it, and
it must match that key, case included. Metric columns made on the screen are
stored in UPPER_SNAKE, so on most live experiments the map re-cases — a column
`region` feeding a parameter `REGION`. A column made by
`set_metric_metadata_fields` is stored under the key its reply's `column`
names, which can be `region` itself, so then the two halves are identical.
Read the key off `get_metric_details`; never re-case it yourself. Nothing checks
that the pairing is sensible: `priority` -> `REGION` next to `region` ->
`PRIORITY` is two fields crossed, each feeding the other's slot, and the platform
saves it without a word. **The mapping is per experiment, not per dataset**: the
same dataset can feed one task that wants the field and another that ignores it.
Without the mapping the value stays on the test case and never reaches the task,
with nothing to indicate it. Both sides treat `number` and `integer` as
interchangeable.

**Known bug.** The metric side derives `sourceType` by comparing against a
*translated* label, so under any non-English locale the comparison fails and every
dataset-sourced mapping is silently written as `'TASK'`, with no error and nothing
to notice at save time. It only bites under a non-English locale — records
written in English carry `sourceType: 'DATASET'` on the metric side as intended. If a mapping was saved under a non-English locale, read it back
and check `sourceType` before you spend a run on it. On the task side,
`task.fieldMappings` is usually absent or an empty array, and a non-empty one
carries the hardcoded `'TASK'` as documented.

## Wizard steps 2 and 3

**Step 2, `Metrics`.** `Add Metric` opens a picker with filter chips `All` / `LLM` /
`Conversational` and a search box. Each metric you add shows its name, its
test-case type, its description and who created it — the same four things
`get_metric_details` returns, so read them before attaching: it is how you catch
the moment you have picked up someone else's half-finished draft or a stray copy
of a metric.

**Step 3, `Additional Setup`.**

| Control | What it does | Property |
|---|---|---|
| `Max Concurrency` | how many test cases run at once — your lever against rate-limit errors from the model provider | `concurrency` |
| `Skip Approval Before Tool Execution` | auto-approves every tool call the agent makes during the run | `skipApprovalBeforeToolExecution` |
| `Schedule Runs` | turns the experiment into a recurring job | `schedulerConfig` |
| `Auto-start run` | a checkbox beside `Create` that fires the first run immediately | **none known** |

The guide's default of `20` is not a stored default: `concurrency` is more often
left unset than set, and where people do set it the value is typically well
below 20. Do not quote 20 as a default — read the
field, and treat absent as absent rather than as a number. `Auto-start run` maps to no
stored property at all — nothing in the live `ui:order`, no declared type — so
treat it as unmapped and start the first run explicitly instead.
