---
user-invocable: false
name: eval-metrics
description: "Only for the agent-builder builder agent. Designs, reads, tests and explains a UnifyApps evaluation metric — the scoring function that grades one answer inside an experiment run. Covers the five kinds of judge, the four you can make and which to reach for first, how to write criteria a judge can actually check and how to check that judge against a person, what a metric reads off a test case, why it names no dataset and couples to one by field name instead, the score range that makes a cross-metric comparison meaningless, the two thresholds and which of them decides a case and which decides a run, dry-running a metric before you trust it, and why some scores are not scores at all. It owns scoring semantics for all three evaluation skills. Names the exact evaluation MCP tool for each job, with its inputs and how to read each write back. Load it whenever an evaluation metric has to be read, designed, created, cloned, tested or explained, or when a metric's scores or pass counts have to be understood."
---

## The evaluation MCP server

Every tool here is an MCP tool on the `evaluation` server, bridged to the signed-in tenant. Its
full name is `mcp__plugin_ua_evaluation__<tool>`, so `create_metrics` is
`mcp__plugin_ua_evaluation__create_metrics`. There is no CLI, and there is no other way in:
an evaluation write sent any other way has none of the checks these tools carry.

**Every call takes `host`.** It is the signed-in tenant's bare host name, with no `https://`
and no path. It is never filled in for you.

**When a call fails for no reason you can see, call `check_evaluation_automations` first.**
`test_metric` and `preview_derived_scale` run through platform automations, and a tenant that
has not registered one answers HTTP 500 `forbidden datasource: not found`.

**`delete_metrics` cannot be undone.** Call it without `confirm` first, say what it reports
to the person, and get their yes before you call it with `confirm: true`. When there is nobody
to ask, such as an unattended run, do not confirm: report what the first call said and stop.

## An AI metric needs a judge model

Every `AI` metric needs `metricConfig.model`: the id of the model that does the judging. **No
library template carries one**, so add it yourself. `create_metrics` and `update_metrics` refuse
an `AI` metric without it. Older metrics on a tenant can still lack it (many were copied from
the library on the screen, which adds no model): every run marks their score `notCalculable`.
`check_metric_definitions` reports them as broken, `check_experiment_readiness` lists them in
`metricsWithoutModel`, and `clone_metric` warns that a copy of one will not score either.

Get the id from the agent-builder server's `list_models`
(`mcp__plugin_ua_agent-builder__list_models`, with `host` and `forSlot: "TEXT_GENERATION"`).
Pick a card with `connectionActive: true`. A card with it false fails every run, and `null`
means its connection could not be read in time, so prefer a `true` card. Then prove the
pick with one `test_metric` call before any experiment uses the metric. If `list_models` fails,
say so and ask the person for a model id. Never guess one. The same id is what `modelId` takes on
`generate_scenarios` and on the `PROMPT` and `KNOWLEDGE_SET` routes of `import_test_cases`.

## What a metric is

A metric is the scoring function applied to one test-case result — the judge. A dataset holds
the questions, an experiment runs the agent over them, and a metric grades each answer,
producing a **score**, a **pass boolean** and a short **reason**, one set per test case. Who
does the grading is the metric's kind.

## Five kinds of judge, four you can make

| On the screen | Who grades | Can you create one |
|---|---|---|
| AI (LLM as a Judge) | another model, against criteria you write | yes |
| Automation | one of your own automations | yes |
| Human in the loop | a person | yes |
| Derived Metric | a formula over other metrics' scores | yes |
| Programmatic | code stored on the metric — a Python or JavaScript editor returning a score and a reasoning string *(unverified)* | no — legacy |

**Four of the five kinds can be created.** `Programmatic` is gone from the type picker and the
product guide dropped it, but the platform still stores, reads and renders those records —
keep reading them, never offer it as a choice.

**Pick the cheapest judge that can answer the question.** Where the answer can be checked
outright — it equals a value, it parses, it matches a schema, two queries return the same rows
— an `Automation` metric settles it at the same cost every time and gives the same answer
twice. Keep `AI` judges for the questions that genuinely need reading: tone, completeness,
whether an explanation holds together. Keep a person for what neither of those can do. The
usual mistake is an AI judge on a question a comparison would have answered — it costs more,
it moves between runs, and it can be wrong with a confident reason attached.

**The Automation runtime contract.** The platform calls your automation **once per test
case**, hands it **exactly the input parameters that were ticked** — so the automation and the
tick-boxes have to stay in agreement — and expects back **a score inside the metric's declared
range, and a reason** that makes a low score actionable later.

**A human-in-the-loop metric's criteria are written for a person, not for a model.** Brief the
reviewer the way you would a new teammate: what earns a top score, what earns a bottom one,
what to do about the awkward middle. Until someone types a score the case sits waiting inside
an otherwise completed run *(unverified)*.

## What a metric reads

A metric's **input parameters** are the test-case fields it is handed to judge on, and they
are the contract that makes it compatible with a dataset. The create flow offers them in four
named groups:

| Group | Parameters |
|---|---|
| Input fields | `Input` · `Expected Output` · `Context` · `Expected Tools` |
| Output fields | `Actual Output` · `Retrieval Context` · `Tools Called` |
| Conversational fields | `Turns` · `Agent Role` — offered only on a conversational metric |
| Metadata fields | `Latency` · `Cost`, plus any custom column you add |

**Tick only what the judgement needs.** Every extra parameter is more context for the judge to
weigh, and an irrelevant one can pull a score around.

**That list is what the flow offers, not what the field accepts.** Parameters are free-form:
metrics in the wild carry uppercased custom column names and outright junk. Never validate them
against a fixed list; you will reject working metrics. A parameter's name is whatever its
author typed — an uppercased custom column name of the `RESPONSE_QUALITY_V2` sort, a leftover
scratch name of the `test123` sort — and a metric carrying one still works. An unknown name is a warning with the known list attached, never a refusal. And when you answer "what does this metric need?", report
what the metric stores — a canonical list describes a metric nobody has.

A custom grading input beyond the standard ones is a **custom column** — the same kind of
record a dataset carries for its own custom columns, written with
`set_metric_metadata_fields`. The create flow groups them under the label "Metadata fields";
the concept is a custom column, and that is the word to use everywhere but a quoted label. Its
name is derived from its label rather than typed, so renaming the label renames the column.

## A metric names no dataset

A metric carries no dataset reference of any kind. It is free-standing and reusable, and it
couples to a dataset by **field name and test-case kind**, never by id:

- every input parameter it asks for must exist as a column on the dataset's test cases — a
  standard field the dataset has switched on, or a custom column;
- the metric's test-case kind (LLM or conversational) must match the dataset's.

**The experiment is the join table.** It holds the metric, the dataset, and the field mapping
that reconciles a dataset column to a metric parameter when the two names do not line up.

Nothing stops you attaching a conversational metric to an LLM dataset, or asking for tools
called on a dataset that never collects them. There is no save-time error: every case comes
back **missing a parameter**, with a reason naming the field. Not hypothetical either — it is
common for a metric to ask for a column the dataset does not carry, and nothing refuses it when
the metric is saved. `eval-datasets` states the same rule from the dataset's side.

## Evaluation type and range, and why scores never compare across metrics

A metric's **evaluation type** is `Scale`, `Binary` or `Star` — the three values of one closed
enum. `Star` is offered by human-in-the-loop metrics alone, which is why the AI flow never
shows it. Match the choice to the question — `Star` for an overall impression, `Binary` for a
yes/no gate, `Scale` to track movement between runs.

A `Scale` metric's **range** is a minimum and a maximum chosen per metric. **Ranges vary widely from
one metric to the next, so a 4 is a failure on one metric and a top mark on another.** Read the
range off the metric, never assume it, and **refuse a cross-metric comparison** rather than
compute one.

An AI metric gives its judge either one natural-language **criteria** string or an ordered list
of **steps**. The editor switches between them, and the choice changes how the judge reasons:
**criteria** when you want one holistic judgement in the judge's own words, **ordered steps**
when the judgement is a checklist and you want each point weighed on its own and in order.

**Write either one as statements that can be checked, not as a feeling to rate.** "Rate the
quality from one to ten" gives back a number nobody can act on; "names the policy", "gives the
refund amount", "stays polite" can each be agreed or disagreed with, and a low score then says
which one failed. Use `Binary` for the statements that have to hold and `Scale` for movement
between runs, and tell the judge it may answer that it cannot tell — a judge with no way to say
so invents a reason for whichever way it guessed.

## The two thresholds decide two different things

Mixing these up gives an experiment that reports the wrong pass rate.

| Threshold | Decides |
|---|---|
| Test-case success criteria | whether **one case** passed — the pass boolean on that case |
| Metric success criteria | whether the **whole run** passed on this metric — typically a minimum percentage of cases passing |

**On a binary metric the threshold is a boolean, not a number.** The pass condition is an
equality on true or false, so there is nothing to compare and nothing to parse — but the
author still has to pick the right boolean.

**The Binary direction trap.** The direction inverts for any metric that detects a *problem*.
A `Language Mismatch` metric **passes when the score is `false`**, because `false` means no
mismatch was found. Read the metric's description before setting the equality: "did it find
the bad thing" and "did it pass" are opposite booleans whenever the metric is named after the
problem rather than after the quality. Rare, and the one time it matters.

This skill defines both thresholds; it does not read them back. **When the question is "did it
pass?", read `eval-experiments` § "Did it pass?" is four questions**, which owns runs and their
roll-ups — with more than one metric attached, a per-metric pass rate cannot be read off the
run's own totals at all.

## Dry-run a metric before you trust it

A metric can be tried on one example from its own detail page, with no experiment and no
dataset: one value per declared parameter, and it scores. `test_metric` is that loop.

**Do this every time you write a judge prompt.** Criteria that read beautifully often score
nothing like you expect, and one example is cheaper to learn from than a 500-case run.

**Score the same example twice.** If the two scores differ, the criteria is not yet decided
enough for anyone to act on, and every number it produces afterwards carries that wobble. Fix
the wording before the metric grades anything that matters.

**Then check the judge against a person.** An AI judge is a model, so it can be confidently
wrong and nothing in a run will say so. Put an AI metric and a human-in-the-loop metric on the
same handful of cases and compare what each gives: where they disagree, it is the criteria that
is wrong, not the agent. Do it on an experiment whose source is the dataset — the answers are
already stored, so only the judges cost anything (`eval-experiments`). Repeat it whenever the
criteria changes, because a judge that agreed with a reviewer before an edit is not the judge
you have after one.

Where the evaluation automations were never registered, testing a metric is unavailable, and
the tool says so — `check_evaluation_automations` names which automation is missing.

## Some scores are not scores

A score is not a number until you know which kind of thing it is. **The run-reading tools in
`eval-experiments` run this classification for you**, so a caller normally sees a named status
rather than a raw number. The semantics are owned here, though, and a classification that looks
wrong is debugged by walking these steps against the raw value yourself.

Take the checks **in order**. This is **the score ladder**, and it is the canonical list of
score states for all three evaluation skills — cite it by that name and enumerate it nowhere
else. The order is the method: three of the steps key on the same value and only their
position tells them apart, and one metric kind is an exception part-way down.

**Nine steps, eight names.** Seven are the platform's own statuses — `scored`, `running`,
`needsAnnotation`, `missingParameters`, `notSupported`, `evaluationFailed`, `notCalculable` —
and the eighth, `unmeasured` at step 8, is a tool-side addition with no platform code behind
it. The steps outnumber the names because two of them land on `scored`, at 3 and at 9.

1. **No number at all — `running`.** Nothing has scored this metric on this case yet. Absent is
   not zero, and a run still in flight reads this way on every case it has not reached.
2. **The score is −2147483648, the smallest 32-bit integer — `notCalculable`.** Grading itself
   failed, or a derived formula could not be computed. Checked before every other numeric check
   and for every metric kind, because it is the one sentinel no formula can land on by accident.
   Only ladder step 1, which looks for no number at all, runs ahead of it.
3. **The metric is derived — `scored`, whatever the number is.** This is the exception, and it
   is why the order matters: a derived formula can legitimately produce −1 and −2, so ladder
   steps 4 to 8 never apply to a derived metric. A negative there is a real answer, not a
   missing one, and "filter out the negatives" is the wrong instinct.
4. **The score is −2 — `missingParameters`.** The metric asked for a test-case field the case
   did not carry, and the reason names the field when it carries one — see the suppression rule
   below the ladder.
5. **The score is −1 on a human-in-the-loop metric — `needsAnnotation`.** Nobody has typed a
   judgement yet, and the run finished around it.
6. **The score is −1 and the score's own type says not implemented — `notSupported`.** Nothing
   on the platform grades that combination.
7. **The score is −1 otherwise — `evaluationFailed`.** The evaluator returned nothing: the
   judge threw, or what it was handed was unusable. The reason carries what is known, subject to
   the same suppression rule.
8. **The score is 0 and the reason begins "Unmeasured" — `unmeasured`.** A real zero that
   measured nothing, because nothing was configured to measure it. **A configuration gap, not a
   failing case.** It clears every numeric check above, so the reason is the only thing that
   separates it, and counted as a failure it manufactures a 0% pass rate for a metric that
   never ran — the mistake every naive pass rate makes. A tool that stops at ladder step 9
   reports these as a scored zero *(unverified)*.
9. **Everything else — `scored`.** Including the negatives that reach here through ladder
   step 3, and including non-integers: −0.3333333333 is a real measurement.

**Ladder steps 4 and 7 are the two that carry a reason, and both drop a useless one.** A reason
reading exactly "Missing" or "Not implemented" is no reason at all and comes back empty — so a
`missingParameters` row can name no field, and an `evaluationFailed` row can explain nothing,
without either meaning the status is wrong.

**Ladder steps 3 and 9 are the two measurements; every other step is an exclusion.** Ladder
step 3 is the one that gets lost: a derived metric's −1 or −2 is a real score, so an exclusion
list written as "ladder steps 1 to 8" silently drops every derived metric out of every mean.
The platform's own predicate is this ladder's outcome and nothing else — a score counts when
its status is `scored`, which ladder steps 3 and 9 both produce. Keeping the exclusions in step
with the ladder is not bookkeeping in the other direction either: a list shorter than the
ladder is exactly how an `unmeasured` zero gets counted as a failure.

**Never average raw scores.** One `notCalculable` row inside a thousand-score mean drags that
mean to about −2,147,484 against a maximum legal score of 10 — orders of magnitude outside the
metric's own range, which reads as a broken platform rather than as a bad statistic. A sum, a
minimum, a standard deviation and any chart axis are poisoned by the same single row.

**Every mean you report ships with its `n` and its exclusions, or it is not reported** — and
never beside another metric's mean, because the two are not measured on the same range: **refuse a
cross-metric comparison of means** rather than compute one.

This skill owns scoring semantics. `eval-experiments` and `eval-datasets` point here and do
not re-derive it: there is one procedure, it is the score ladder above, and it lives in this
section.

## Derived metrics

A derived metric has no judge. It computes a score from other metrics' scores through a
formula, and its **range is computed by the server** from that formula and its base metrics —
`preview_derived_scale` returns it, and your threshold has to fall inside it. If the range
looks wrong, the formula is wrong, not the threshold.

**A `BINARY` base is stored as `1` or `0` on a run** — `1` is yes, `0` is no. So the plain
average `({{a}} + {{b}}) / 2` of a yes/no metric `a` and a 0–10 metric `b` lets a yes add only
0.5, and the derived score moves almost only with `b`. Put the bases on one scale first:
`({{a}} * 10 + {{b}}) / 2`, where `10` is `b`'s maximum. Read the range back with
`preview_derived_scale` after you change the formula, and set the threshold inside it.

**This is how you keep one judgement per judge.** A single metric asked to weigh accuracy, tone
and safety at once hands back one number that hides which of the three moved, and a judge
holding three questions at once answers all of them worse. Write one metric per dimension, each
with its own criteria, and let a derived metric combine them — then a drop points at the
dimension that caused it.

The base metrics still run: a formula over five metrics means five graders per test case, with
the cost and latency that implies. Combine metrics you were going to run anyway.

Read [references/derived-metrics.md](references/derived-metrics.md) before designing, changing
or deleting one — and before deleting **any** metric another one may read as a base.

## Writing a metric, in order

Each step fixes something the next one depends on, which is why the dry run is last and not
first. Each names the section that owns its rule rather than repeating it.

1. **Pick the kind.** § "Five kinds of judge, four you can make" — four can be created, and `Programmatic` is the legacy one.
2. **Tick only the parameters the judgement needs** — from the input, output, conversational and metadata groups. § "What a metric reads" for the names each group offers — they are the whole compatibility contract with a dataset, and a grading input beyond the standard ones is a custom column. § "How the inputs are spelled" gives the names `inputParameters` takes. Start from `get_metric_library` when a template is close: `create_metrics` takes its fields, but add `metricConfig.model` yourself, because no template carries one (§ "An AI metric needs a judge model").
3. **Choose the evaluation type — `Scale`, `Binary` or `Star`, and `Star` only on a human-in-the-loop metric — and for `Scale` its range, a minimum and a maximum.** § "Evaluation type and range, and why scores never compare across metrics" — the range you pick here is what every later number on this metric means.
4. **Write the criteria, or the ordered steps.** One or the other, from the same section; the editor switches between them and it changes how the judge reasons.
5. **Set the two thresholds, in that order — the test-case one, then the run one.** § "The two thresholds decide two different things", including the direction that inverts on a metric named after a *problem*.
6. **Dry-run it on one example before it is attached to anything — twice, and then against a person.** `test_metric`, and § "Dry-run a metric before you trust it" for why this one is never the step to skip, why the same example gets scored twice, and how an AI judge is checked against a human reviewer before anyone trusts its numbers.
7. **Have it checked before a run spends money proving it.** `check_metric_definitions` catches the threshold that falls outside the metric's own range, and the metric saved with no input parameters that would score nothing in silence.

Steps 1 to 5 are one `create_metrics` call; read the new metric back with
`get_metric_details` and check every field you sent is there before step 6.

**A derived metric reorders steps 3 to 5 of this write-up**: write the formula,
read the range back with `preview_derived_scale` because the server computes it
from the base metrics, and only then set a threshold inside it. There is no judge
to dry-run.

## The tools

Every call takes `host` as well as the inputs named below. Ids come from the
read named on each line, never from a guess or a name.

The platform enforces nothing on a metric record, so the tools do: a metric saved
with no input parameters saves cleanly and then scores nothing, silently, and
`create_metrics` refuses it.

### How the inputs are spelled

`inputParameters` takes the stored names, not the labels on the screen:

| On the screen | In `inputParameters` |
|---|---|
| Input · Expected Output · Context · Expected Tools | `INPUT` · `EXPECTED_OUTPUT` · `CONTEXT` · `EXPECTED_TOOLS` |
| Actual Output · Retrieval Context · Tools Called | `ACTUAL_OUTPUT` · `RETRIEVAL_CONTEXT` · `TOOLS_CALLED` |
| Turns · Agent Role | `turns` · `role` |
| Latency · Cost | `latency` · `cost` |
| a custom column | its name as `get_metric_details` reports it |

The same names key the `values` you send to `test_metric`. Read them back with
`get_metric_details` rather than typing them from this table, because a custom
column's name is derived from its label.

### Reading

- **`get_metrics`** — find metrics. Narrow with `nameContains`, `type` or `testCaseType` (`LLM` or `CONVERSATIONAL`), and page with `limit` and `cursor`, because a workspace can hold hundreds and an unnarrowed answer is an arbitrary slice that reads like the whole list. Summary rows only.
- **`get_metric_details`** — one metric by `metricId`, in full: the per-kind `metricConfig`, the criteria or steps, a derived metric's `formula` and `base_metrics`, both thresholds, the `version` that `update_metrics` takes, and `dependents` — the derived metrics and experiments that still read it.
- **`get_metric_library`** — the built-in templates, named exactly as the platform spells them, misspellings included. Narrow with `type` or `testCaseType`. Templates cannot be changed; copy one's fields into `create_metrics`.
- **`get_metric_schema`** — what configuration one kind takes, by `type`. Read it before `create_metrics` for any kind that is not a copy of a template. Read-only.
- **`check_metric_definitions`** — what is wrong with up to 50 saved metrics, by `metricIds`: a threshold outside the metric's own range, no input parameters, `STAR` on a metric that is not human-in-the-loop, a derived formula that disagrees with its base metrics. It also lists the dataset columns each metric needs.

### Writing

- **`create_metrics`** — up to 20 `metrics`. Each takes `name`, `type` (`AI`, `AUTOMATION`, `HUMAN_IN_THE_LOOP` or `DERIVED`; `PROGRAMMATIC` cannot be created), `testCaseType`, `inputParameters`, `evaluationType` (`SCALE`, `BINARY` or `STAR`), `evaluationScale` as `[minimum, maximum]` for `SCALE` and `STAR`, `evaluationCriteria` **or** `evaluationSteps`, `testCaseThreshold` as `{op, value}` (`GTE`/`LTE` with a number, or `EQUAL` with a boolean on `BINARY`), and `metricThreshold` as `{op, percent}`. `metricConfig` carries the per-kind part — the judge model, the automation — in the shape `get_metric_schema` reports. On an `AI` metric it must hold `model`, an id from agent-builder's `list_models`. Send `evaluationCriteria` (or `evaluationSteps`) at the top level of the metric, as listed above; the tool places it where the platform keeps it, even though `get_metric_schema` shows it inside `metricConfig`. A `DERIVED` metric takes `formula` and `baseMetrics` instead of `inputParameters` and criteria, but it still needs `evaluationType` and, on `SCALE`, `evaluationScale`: copy the range `preview_derived_scale` returned for that same formula. Every metric is checked before any is written, so one bad entry writes none. Read each one back with `get_metric_details`.
- **`update_metrics`** — up to 20 `metrics`, each with `metricId`, the `version` from `get_metric_details`, and only the fields to change. Every field you leave out stays as it was. The checks run over the whole metric after your change, which catches a new range that leaves the stored threshold outside it. `type` and `testCaseType` cannot change: that is a different metric, so clone it instead.
- **`clone_metric`** — `metricId` and the copy's `name`. Returns the copy's id. A clone may not carry the original's custom columns: read the copy with `get_metric_details` and add any that did not follow with `set_metric_metadata_fields`.
- **`set_metric_metadata_fields`** — `metricId` and up to 20 `fields`, each with `label` and optionally `type` (`STRING`, `NUMBER`, `INTEGER` or `BOOLEAN`), `description` and `optional`. It adds or updates the columns you name and keeps the others. The reply's `column` is the key the column is stored under, and that exact key is what `inputParameters` and the experiment's `fieldKey` must use. Do not convert its case yourself: columns made on the screen are stored in UPPER_SNAKE (`REGION`), and a column this tool makes is stored as the reply's `column` shows. A dataset stores its own column in camelCase (`region`); the experiment's field mapping joins the two. Adding a column does not make the metric ask for it: add its name to `inputParameters` with `update_metrics` too.

### Trying one out

- **`test_metric`** — `metricId` and one example: `values` for an `LLM` metric, `turns` (a list of the same maps) for a `CONVERSATIONAL` one, or `annotation` as `{score, reason}` for a human-in-the-loop one. Returns the judge's answer under `result`: `score` as text, the pass boolean as `Result` with a capital R, and `reason`. A `SCALE` metric scores as `"5.0/10"`; a `BINARY` one answers `"Yes"` or `"No"`, which a run then stores as `1` or `0`. Nothing is saved. An HTTP 500 here on an `AI` metric usually means it has no `metricConfig.model`. **Run it every time you write a judge prompt**, for the reason in § "Dry-run a metric before you trust it".
- **`preview_derived_scale`** — `formula` and `baseMetrics`: the range that formula will produce, computed by the server, before you set a threshold against it. Each base metric appears in the formula as `{{id}}`. Writes nothing.

### Deleting — needs the person's yes

- **`delete_metrics`** — up to 20 `metricIds`. Without `confirm: true` it scans for every derived metric and experiment that still reads them, reports the count, and deletes nothing. It refuses any id something still reads, and names what reads it, so detach it first. A batch with one such id deletes none. **Delete a derived metric before its base metrics**, in an earlier call: a base is still read by the derived metric until that one is gone. **Irreversible.**

## Traps that answer 200 and do the wrong thing

- A metric saved with no input parameters — nothing refuses it, and it scores nothing.
- An `AI` metric saved with no `metricConfig.model`, which is what a copied library template gives you. It saves, and every run marks its score `notCalculable` with the reason `No Value found in filter with field: id`.
- A metric whose kind or parameters the dataset does not match — no save-time error; every
  case comes back missing a parameter.
- A Binary threshold set the intuitive way round on a problem-detecting metric such as
  `Language Mismatch` — the direction inverts, and the run reports the inverse pass rate.
- A binary threshold read as a number — it is a boolean, and there is nothing to compare.
- Input parameters validated against the list the create flow offers — the field is free-form,
  and real metrics carry names that are not on it.
- An Automation metric configured with a judge model and no automation behind it — a shape that
  saves and can invoke nothing *(unverified)*.
- A negative score read as "not scored" on a derived metric — it is a real score there.
- An AI judge nobody ever compared against a person — it scores every case, and nothing says
  whether it scores them right.
- Criteria strict about the route rather than the result — an exact tool order, an exact numeric
  string — which fails an answer that reached the same place another way.
- Criteria a well-worded answer can satisfy without doing the task — the metric then measures
  the wording and not the work.

## What no tool does

- **Completing a human-in-the-loop score.** Deliberate: a HITL metric waits for a person, and
  no tool may type a judgement in on their behalf.
- **Answering "will this metric work on this dataset?" before an experiment exists.** The
  compatibility rule above is the central rule of all three evaluation skills, and nothing
  checks it until an experiment binds the two.
- **Telling you whether a clone carried the original's custom columns** — the open question
  flagged on `clone_metric` above.

The evaluation MCP server has no tool for these. When one is asked for, say plainly that it is
not available here. Do not improvise a workaround through another surface.

- **Changing a metric's kind or test-case kind.** That is a different metric: clone it and
  build the copy, or create a new one.
- **Writing the tenant-wide per-kind schema records** that `get_metric_schema` reads. They
  drive every metric form, and the product has no way to write them.

## What has been tested, and what has not

**Known to hold.** The score ladder is the platform's own scoring, step for
step — the same order, the same sentinels, the same seven platform statuses named above. Ladder
step 8, `unmeasured`, is the one step the platform does not implement, which is why it carries
its *(unverified)* marker and why a reader who needs certainty there should check the reason
rather than trust the status.

**Not verified.** Treat the judge-model advice in the library reference as craft rather than
as a measured result, and treat anything marked *(unverified)* in this file as what the
product's own screens and schemas say, not as settled behaviour.

## Reference files

| File | Read it when |
|---|---|
| [references/metric-library.md](references/metric-library.md) | you are picking, adding or naming a ready-made metric, or need what each template grades and needs |
| [references/derived-metrics.md](references/derived-metrics.md) | you are designing, reading or changing a derived metric, or are about to delete any metric another one may read as a base |
