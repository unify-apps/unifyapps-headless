---
user-invocable: false
name: eval-experiments
description: "Only for the agent-builder builder agent. An evaluation experiment binds a target — an AI agent, a task automation, or the answers already stored in a dataset — to the test cases it runs over and the metrics that score them, and it is the only place in Evaluation where a run happens. Covers creating and editing one, starting, stopping and scheduling its runs, reading a run's per-case results and roll-ups, answering whether it passed — the one verdict the product computes at read time and never stores — why one run is one sample, and how to compare two runs without fooling yourself. Starting a run against an agent invokes that agent once per test case at real model cost, so it is an expensive write and never a read. Load it whenever an evaluation experiment or run has to be read, created, changed, run, scheduled or explained. Names the exact evaluation MCP tool for each job, with the order of calls, the confirmation each costly or destructive call needs, and how to read each write back."
---

## What an experiment is

One record. It binds a **target** — the thing being graded — to the **datasets**
whose test cases it runs over, and to the **metrics** that score each answer.
Then it executes them.

An experiment is the only place in Evaluation where a run happens. A dataset
holds cases, a metric is a scoring function, and neither of them executes
anything. Starting a run produces one run record, which fans out into one result
per test case.

## The evaluation MCP server

Every tool here is an MCP tool on the `evaluation` server, bridged to the
signed-in tenant. Its full name is `mcp__plugin_ua_evaluation__<tool>`, so
`create_experiments` is `mcp__plugin_ua_evaluation__create_experiments`.
There is no CLI, and there is no other way in: an evaluation write sent any other
way has none of the checks these tools carry.

**Every call takes `host`.** It is the signed-in tenant's bare host name, with no
`https://` and no path. It is never filled in for you.

**When a call fails for no reason you can see, call `check_evaluation_automations`
first.** The run export and the cost read run through platform automations, and
a tenant that has not registered one answers HTTP 500
`forbidden datasource: not found` from every tool that needs it.

**Two kinds of call need the person's yes before you make them.** Starting a run
spends money (`start_experiment_runs`, and `set_experiment_schedules` arms a
recurring one when a schedule is on; a paused schedule spends nothing). Deleting cannot be undone (`delete_experiments`,
`delete_experiment_runs`). Each of these refuses until you pass its confirmation,
and the refusal tells you what to say to the person first. When there is nobody to
ask, such as an unattended run, do not confirm: report what the refusal said and stop.

## Three targets, and the cheap one people miss

The wizard asks this as **Source of Output Parameters** and offers three cards.
They are not three flavours of one thing: one calls a model on every case, one
calls nothing.

| Card | `target` the tools take | What a run does | Then pick |
|---|---|---|---|
| **Agent** | `agent` | invokes the agent live on every test case and grades what it says — the normal choice | which agent, as `agentId` |
| **Dataset** | `dataset` | runs nothing at all; grades the answers already stored on the test cases | nothing |
| **Task** | `callable` | calls a task automation you wrote and grades what it returns | which task, as `automationId` from `list_task_targets` |

No `Task` value is stored anywhere: the card says Task and the record says `callable`.

**`Source = Dataset` is the cheap loop, and it is under-used.** It grades stored
answers with no agent calls, so a re-run costs the metrics alone. That is the
right way to tune a judge prompt or a passing threshold: iterate against
`Dataset`, then switch back to `Agent` once the scoring is settled.

## Starting a run spends money

With `Source = Agent`, starting a run invokes the agent **once per test case**, at
real model cost. A dataset can hold thousands of test cases, so one careless start
is thousands of agent invocations. Say the case count out loud before you start
anything. `start_experiment_runs` takes no count from you: it refuses until
`confirmSpend` is true, and its refusal carries the live count per experiment,
because that count is the bill.

**When a batch start fails part-way, the runs that started are the problem.**
Everywhere else the risky half of a failed batch is the part that did not land.
Here it is the part that did, because those runs are spending now. Stop them with
`stop_experiment_runs` and the `runId`s the error names, and do not retry the
batch until you know what is still running.

**When there is nobody to say it to — an unattended or script-driven run — do not
start the run.** Report it as `needs_confirmation` with the test-case count and
the experiment id in `error`, and carry on with anything that does not need the
answer. A count spoken into an empty room is not a confirmation, and this is the
one write in Evaluation that spends real money on someone else's behalf.

**Cost is a result as well as a bill.** The agent's own cost and latency come back
separately from the scoring's, and both are gradeable parameters, so "the same
answers for a fraction of the cost" is something an experiment can be pointed at
deliberately — a smaller model, shorter instructions, fewer turns. It is the one
goal that still works on a dataset the agent already passes, where there is no
quality left to win.

Run `check_experiment_readiness` first. The failure it catches most often costs the
whole spend and reports nothing: **an experiment with no metrics runs every test
case and scores none of them.** It is easy to save an experiment with no metrics
attached and nothing warns you. The run completes, the cases execute, every
roll-up comes back empty, and nothing calls that an error.

## "Did it pass?" is four questions

Four things answer to "passed", at three levels. **Three of them are read; the
one that reads like the answer is not stored anywhere.**

| Level | Read with | What it is |
|---|---|---|
| One test case | `get_run_results` | pass or fail on that case, decided by the metric's test-case success criteria |
| One case, one metric | `get_run_results` | pass or fail per metric on that case |
| One run, rolled up | `get_experiment_runs` | counts: passed, failed, how many metrics graded |
| **The metric's verdict on the run** | **nothing returns it** | you compute it — see below |

The verdict is *defined* in the **`eval-metrics`** skill, not here: every metric
carries a success criteria across the run, typically "at least 80% of cases
passed". Read "The two thresholds decide two different things" there for both
criteria and the direction trap in one of them.

**Nothing stores the result of applying it** *(unverified — not a contract)*: no run carries a pass field, and an experiment's last-run status
holds `completed`, never `passed`. You compute it at read time, and you say that
you computed it.

**What computing it costs.** The criteria is **per metric** — a percentage of
*that metric's* cases — while the roll-ups are **run-level across every metric at
once**, so with two metrics attached, per-metric pass rates are **not derivable
from the roll-ups at all**. `experiment_scorecard` does that grouping for you: it
is the only place a mean over scores is computed, and it always ships the
exclusions beside it. It stops one step short — it never applies the criteria, so
the last row stays yours. And the question asks about the *experiment* while that
row is one *metric's* verdict: N metrics give N verdicts, and **no roll-up rule is
stated anywhere** *(unverified)*, so report them per metric.

**The caveat on that computation.** Run roll-ups do not always sum, and a run can
execute every case with nothing grading it — its pass rate is then undefined, not
0%. The scorecard flags both. **Every pass-rate sentence must carry the metric
count and the test-case count beside it**, or it must not be written. And before
counting anything as a failure, read "Reading a score" below.

## Runs: three levels

| Level | What it holds | Read with |
|---|---|---|
| The experiment | the configuration, and what its last run did | `get_experiment_details` |
| One run | one execution: status, roll-up counts, cost and latency aggregates | `get_experiment_runs` |
| One case inside a run | the answer the target gave, its pass or fail, and one score per metric | `get_run_results` |

A run is in one of five statuses: `running`, `completed`, `failed`, `cancelled`,
`stopped`. `get_experiment_runs` normalises them. The product's two label maps
name four of the five and leave `stopped` blank, so do not treat a list the
product shows you as a closed set.

**`running` does not mean live.** Stale `running` runs are common — runs that
stopped progressing and were never cleaned up, sitting at `running` hours or days
later. Nothing in the product surfaces a stall, and the roll-up is not
evidence of one: on a `running` row the counts are zeros or a partial tally,
not the run's result, whether it is live or stuck. `find_stalled_runs` is the only way to tell a stall from a run in
flight.

## You changed an experiment that already ran

You add a metric, or swap the dataset, on an experiment that has runs behind it.
**Old runs keep the numbers they were given.** Nothing re-applies a new
configuration to a finished run, and nothing re-scores one. Each run's numbers
describe the configuration that was in place when it executed, not the one you are
looking at now.

So comparing two runs across an edit compares two different experiments. If you
want the comparison, re-run after the edit. Which configuration produced a given
run's numbers **is** recorded on the run, but **no tool returns it** — see "What no
tool does". Whether a metrics-only edit counts as a new configuration, and whether
any surface shows a past run's settings, are both unconfirmed *(unverified)*. Say
this much and no more, and **promise no re-score.**

## Reading a score

The ladder that turns a raw score into a status is canonical in **`eval-metrics`**,
under "Some scores are not scores". Do not re-derive it; there is one procedure and
it lives there. What a reader of *this* skill needs on top of it:

- A score can be absent for several distinct reasons, and they are separate
  statuses rather than one. **Which reasons exist, and which one applies, is the
  ladder's own steps** — `get_run_results` classifies each score through it. This
  skill keeps no list of them, because a shorter list is exactly how one of them
  gets counted as a failure. **None of them is a wrong answer from the target.**
- **A score of zero whose reason begins "Unmeasured" is a configuration gap, not an
  agent that answered badly** — step 8 of the ladder, which owns the rule and marks
  it *(unverified)*, because nothing enforces the prefix. Zero clears every numeric check and lands as a scored failure if
  you let it. Exclude it, say that you excluded it, and carry the marker across
  when you say so.
- Never average raw scores across metrics — different metrics score on different
  ranges, so the mean means nothing. `experiment_scorecard` is the one place a mean
  is computed and it carries its exclusions with it. Quote both or quote neither.
- **A failure that does not look fair once you read the case is evidence about the
  test case or the metric, not about the agent.** That is what reading the answers
  buys you and no roll-up will.

## One run is one sample

The same question asked twice can be answered differently, so one run measures the
agent once and then reads as though it had settled the matter. Running the same
experiment several times over a dataset of stored test cases, and joining the
per-case results by test case across those runs, answers two different questions:

| Counted as | What it tells you |
|---|---|
| passed on at least one attempt | whether the agent **can** do it |
| passed on every attempt | whether you can **rely** on it |

The second is the one that matters for anything a customer touches, and it falls
away far faster than the first: a case that passes three attempts out of four
passes three in a row only about two times in five. Say which of the two you
counted — they diverge so widely that quoting one as the other describes a
different agent.

**This needs a dataset of stored conversations.** A scenario dataset generates its
test cases afresh on every run, so repeated runs over one are not repeated
attempts at the same question and cannot be joined by case (`eval-datasets`).

**It is also what makes a difference between two runs readable.** Two runs of an
unchanged setup do not return the same number, and the size of that movement is
the floor under every comparison: below it, a rise is not an improvement and a
fall is not a regression. So a run-to-run difference is quoted with the number of
attempts behind it, beside the metric count and the test-case count this skill
already asks for.

## Change one thing, then check it twice

An improvement you cannot attribute is not an improvement. **The platform enforces
none of this** — it will run anything you point it at and hand back a number either
way. This is the discipline that makes two of those numbers mean something next to
each other:

1. **Change one thing** — the agent's instructions, its model, one tool
   description, one setting. Not three at once, or nothing afterwards says which
   of them did the work.
2. **Re-run both datasets**: the one you iterate against and the held-back one
   (`eval-datasets`).
3. **Keep the change only if both moved up.** Up on the first and flat or down on
   the held-back one means it fitted those test cases rather than the problem;
   down on either means it cost something. Both of those come out again.
4. **Do not read the held-back dataset's failures.** Reading them is how its test
   cases quietly become cases you tuned against, and after that it confirms
   nothing.

Leave the generator and the judge alone for the whole loop — § "Three models,
three jobs". And watch for a dataset running out of room: once nearly every case
passes, it can still catch something breaking, but it has nothing left to show you
about getting better. A score sitting at the top, or flat while the agent is
plainly improving, is a dataset to make harder rather than a result to report.

## Three models, three jobs

Three independent model choices sit in three places: the **agent's own model**
produces the answers, the **test-case generator** turns a conversational dataset's
scenarios into the conversations the agent will face, and each AI metric's **judge
model** scores them.

**The judge model lives on the metric, as `metricConfig.model`, and it is required.** A
metric copied from the library has none: it saves, and then every case of every run comes
back `notCalculable` with no error at start. Before the first run, read each attached AI
metric with `get_metric_details` and check `metricConfig.model` is set. The id comes from
the agent-builder server's `list_models` (`mcp__plugin_ua_agent-builder__list_models`),
from a card with `connectionActive: true`; § "An AI metric needs a judge model" in the
`eval-metrics` skill.

**Keep the generator and the judge fixed while you iterate on the agent.**
Changing either changes the ruler, and two runs stop being comparable. Which of
the three an experiment-level model field feeds is unsettled *(unverified)*:
[references/experiment-config.md](references/experiment-config.md).

## Scheduling is a recurring bill

An experiment can be put on an interval or a cron expression, and **every firing
costs what "Starting a run spends money" costs** — a daily schedule on a large
dataset is that whole bill, every day, with nobody watching.

**What a schedule is for.** The dataset you are iterating against does not want to
be on one: it is meant to fail, and you are watching it yourself. The dataset
worth scheduling is the one the agent already passes — it is there to tell you
when something that used to work has stopped working, and nobody remembers to run
that by hand. So two datasets, two jobs: the hard one you improve against, and the
settled one that runs on its own and raises the alarm. A hard dataset that reaches
the point of passing everything has become the second kind, and belongs on a
schedule rather than in the iteration.

**Pausing does not delete the schedule.** The pause is a flag on a schedule that
stays exactly where it was, so one the screen shows as paused is one write away
from firing again. When someone asks you to stop a recurring run, be clear which
of the two they are getting.

## Creating and running an experiment, in order

Step 4 is the one that is skipped and the one that costs the whole spend.

1. **Pick the target.** `Agent` invokes the agent live on every case, `Task` calls an automation, `Dataset` runs nothing and grades what is already stored. If you are still tuning a judge prompt or a threshold, iterate on `Dataset` and switch to `Agent` once the scoring is settled.
2. **Attach the datasets and the metrics, then write the record.** Call `create_experiments` with one entry in `experiments`, holding `name`, `datasetIds`, `target` and `metricIds`, plus `agentId` for an `agent` target or `automationId` for a `callable` one. It hands back the `experimentId` everything after this step needs. The platform accepts an experiment with no metrics — it runs every test case, scores none of them, returns empty roll-ups and calls that success — so the tool refuses one. Read the record back with `get_experiment_details` and check the target, datasets and metrics are the ones you sent.
3. **Reconcile the names that do not line up.** `get_experiment_field_options` reads the mappings the experiment holds — a dataset column and a metric parameter couple by name, and the two mappings name their halves in opposite directions. `apply_experiment_edits` stores what you settle on, and is how you change anything on an experiment that already exists.
4. **Run `check_experiment_readiness` before you start anything.** It answers whether this run will score something, which is the one question a completed run cannot answer for you afterwards. Also check every attached AI metric has `metricConfig.model` and scored one example with `test_metric` (§ "Three models, three jobs").
5. **Say the test-case count out loud, then start.** Call `start_experiment_runs` with `confirmSpend: false` to get the live count, say it, and call again with `confirmSpend: true` once the person agrees — with `Source = Agent` that count is one agent invocation each and it is the bill; with `Source = Dataset` nothing calls the agent and only the judges cost. Unattended, this step ends the work instead: do not start, and report `needs_confirmation` with that count and the experiment id. The start answers each run's `runId`; check it is listed in `get_experiment_runs`. A `runId` of `null` with a `note` means the run started but was not listed yet: read it from `get_experiment_runs`, newest first, before anything else.
   **Waiting for the run to finish.** No tool waits for a run. Call `get_experiment_runs` again every 15 seconds, pausing with `sleep 15` in Bash between calls, for up to 5 minutes: a run of a few cases with a `dataset` target usually finishes in under a minute. If it is still `running` after 5 minutes, stop polling. A UnifyApps Headless builder reports the task `waiting` with `checkAfter` (minutes, for example `10`) and names the `runId` to read in `error`; anyone else tells the person the `runId` and reads it later.
6. **Watch for a stall, not just for a status.** A run sitting at `running` is often not live. Its roll-up counts are zeros or partial and prove nothing either way. `find_stalled_runs` is the only thing that separates them.
7. **Read the results per case, then per metric.** `get_run_results` for the answers and scores, `experiment_scorecard` for the per-metric pass rates the run roll-ups cannot give you. Classify every score through the ladder in `eval-metrics` before counting anything as a failure. Read a sample of the answers themselves and not only the numbers, and ask of every failure whether it looks fair: an unfair one is a test case or a metric to fix, not an agent that answered badly.
8. **Compute the verdict last, and say that you computed it.** Nothing stores it. Apply each metric's success criteria yourself, report one verdict per metric, and carry the metric count, the test-case count and the exclusions in the same sentence as the number.

These eight steps get you one run. Improving the agent from there is a different
loop and it starts at § "Change one thing, then check it twice" — a run you mean to
compare against the next one also wants § "One run is one sample" before you read
anything into the difference.

## The tools

Every call takes `host` as well as the inputs named below. Ids come from the
read named on each line, never from a guess or a name.

### Reading

- **`get_experiments`** — find experiments by part of their `name`, or read a known list of `experimentIds`; `limit` caps it. With neither it refuses rather than listing the tenant. Each row says which target it runs, how many metrics are attached (`hasMetrics`) and its last run status.
- **`get_experiment_details`** — one experiment's whole configuration by `experimentId`, and the `version` that every edit takes. Read it before changing anything. `metricsFromRecord` is the attached metric list to trust; `scheduleLive: "ambiguous"` means the stored schedule flags disagree.
- **`get_experiment_field_options`** — the field mappings stored on one experiment, task map and per-metric maps, by `experimentId`. `sourceKey` is the name on the test case (the camelCase dataset column) and `fieldKey` is the name the receiver gets: the task input, or the metric's parameter exactly as the metric stores it (`get_metric_details`). It does not list the fields there are to choose from.
- **`check_experiment_readiness`** — whether this experiment will score anything if you start it now, by `experimentId`. `readiness` is `ready`, `will_run_but_score_nothing` or `will_not_run`, and `estimatedTargetInvocations` is roughly what the run will call.
- **`get_experiment_runs`** — the runs behind one experiment: `experimentId`, optional `status`, `limit`, `cursor`. Every row is keyed by the `runId` the run tools take. `status` is folded to one value; `rawStatus` keeps the stored spelling. The `status` filter asks for both spellings (`Completed` and `completed`), because the store matches case exactly; never filter runs by one spelling yourself.
- **`find_stalled_runs`** — the `running` runs of one experiment that are old enough to be stuck: `experimentId`, optional `stalledAfterMinutes` (default 60) and `limit`. A row here is a suspicion, not a verdict. Until a tool fix lands it reads the run's age from a field runs do not carry, so it can report none: check `ageMinutes` on `get_experiment_runs`, and if that is empty too, treat a `running` run with no change across two reads an hour apart as stuck.
- **`get_run_results`** — one run's per-case rows: `experimentId`, `runId`, optional `limit`. Every score carries a `status` from the score ladder, and only `scored` rows carry a `score`. `partial: true` means the run was too large to read whole: say so. A very long answer comes back cut, with its path in `shortened`; name that path in `fullValues` on the next call to get it whole.
- **`experiment_scorecard`** — per-metric pass rates for one run: `experimentId` and `runId`. Each metric comes back with `scoredCount`, `mean` (over scored rows only, and null when nothing scored), `passCount`, `failCount`, `passRate` and the `notScored` exclusions. Quote the exclusions with the mean or quote neither. On a `DERIVED` metric the platform can store the wrong pass or fail: a 0 against a bar of 7 was stored as a pass. This tool and `get_run_results` judge a derived score by the metric's own bar and report `platformResultWrong`, so take pass and fail from them, never from the platform's stored `result`.
- **`get_run_cost_and_latency`** — what one run cost and how slow the target was: `experimentId` and `runId`. Agent cost and scoring cost come back separately.
- **`list_task_targets`** — the task automations a `callable` target can call, with optional `limit`. If the reply says `hasMore` or `totalUnknown`, it is one page, not the tenant's whole list.

### Writing

- **`create_experiments`** — up to 20 `experiments`, each with `name`, `datasetIds`, `target` (`agent`, `callable` or `dataset`) and `metricIds`. An `agent` target needs `agentId`, a `callable` one needs `automationId` from `list_task_targets`, and a `dataset` one needs neither. Optional: `description`, `concurrency`, `llmModel`, `taskVersion`, `skipApprovalBeforeToolExecution` and `taskFieldMappings`. It **refuses an experiment with no metrics**, which the platform itself would accept. It checks every item before writing any, and it starts nothing.
- **`apply_experiment_edits`** — up to 20 `edits`, each with `experimentId`, the `version` from `get_experiment_details`, and only the parts to change: `name`, `description`, `datasetIds`, `target` with its `agentId` or `automationId`, `metricIds`, `metricFieldMappings`, `taskFieldMappings` or `concurrency`. `metricIds` replaces the whole attached set. `taskFieldMappings` is a list of `{sourceKey, fieldKey, sourceType}`, with `sourceType` `DATASET` or `TASK`. `metricFieldMappings` is grouped by metric, and the metric must be attached after the edit:

  ```json
  "metricFieldMappings": [
    { "metricId": "<metric id>",
      "mappings": [ { "sourceKey": "region", "fieldKey": "<the metric's key>", "sourceType": "DATASET" } ] }
  ]
  ```

  `fieldKey` is the metric's parameter key exactly as `get_metric_details` shows it, case included: `REGION` on a column made on the screen, the reply's `column` on one `set_metric_metadata_fields` made. Runs already behind the experiment keep their old numbers.
- **`set_experiment_schedules`** — up to 20 `schedules`, each with `experimentId`, `version`, `type` (`INTERVAL` or `EXPRESSION`), `isScheduled` and `timezone`. An `INTERVAL` takes `frequency` (`MINUTES`, `DAYS` or `WEEKS`), `interval` and `startTime`; an `EXPRESSION` takes a cron `expression`, which is refused unless it parses. `startTime` takes an ISO time, epoch milliseconds, or words such as `tomorrow 09:00`, and the reply echoes it as `startTimeResolved`. `isScheduled: false` pauses; it does not delete. The tool takes no confirmation flag, so get the person's yes yourself before you send `isScheduled: true`. Whether deleting an experiment removes its schedule has not been checked, so pause a schedule before you delete its experiment.

### Running — needs the person's yes

- **`start_experiment_runs`** — up to 10 `experimentIds` and `confirmSpend`. Called with `confirmSpend: false`, it starts nothing and answers the live test-case count for each experiment: say that count to the person, then call again with `confirmSpend: true` once they agree. It takes no count from you. It refuses an experiment with no metrics. **If it fails part-way, the runs that did start are the problem, not the ones that did not**: they are spending now. Stop them with `stop_experiment_runs` and their `runId`s, and do not retry the batch.
- **`stop_experiment_runs`** — up to 20 `runIds` (not experiment ids). No confirmation, on purpose: stopping is the cheap direction. A finished run cannot be stopped, and stopping deletes nothing.
- **`export_experiment_run`** — `experimentId`, up to 50 `runIds` and `fileType` (`csv` or `xlsx`). It returns **no data**: the file reaches the person outside this conversation. For numbers, use `experiment_scorecard` or `get_run_results`.

### Deleting — needs the person's yes

- **`preview_experiment_runs_deletion`** — `experimentId` and up to 20 `runIds`. It counts the runs it found (`runCount`, with `runsNotFound`) and the test-case rows under them (`testCaseRunCount`). It deletes nothing. Run it right before the delete.
- **`delete_experiment_runs`** — `experimentId`, the same `runIds`, and `confirmRunCount` and `confirmTestCaseRunCount` copied from the preview. It refuses when either count has moved since the preview. A run is the only record of its scores, and nothing makes it again.
- **`delete_experiments`** — up to 10 `experimentIds`. Call it first without `confirmRunsGoToo`: it deletes nothing and reports the runs and test-case rows that would go with each experiment. Tell the person, then call again with `confirmRunsGoToo: true`. Every run and its test-case rows go too. If a later id fails, the reply names the ids already deleted.

## Traps that answer 200 and do the wrong thing

- An experiment with no metrics: every case runs, nothing scores, every roll-up comes back empty, no error anywhere.
- A pass rate quoted without its metric count: a run that nothing graded reads as 0% passed.
- A score of zero whose reason begins "Unmeasured": a configuration gap that counts itself as a failure — ladder step 8, and *(unverified)* there.
- A mean quoted without the scores it excluded, or averaged across metrics that score on different ranges.
- A run sitting at `running` that stopped progressing days ago.
- Roll-up counts on a `running` run read as the result: they are zeros or a partial tally until the run completes.
- A run's average latency and cost, read as the agent's: they average that case's metric scores. The agent's own cost and latency are reported separately.
- A dataset deleted out from under an experiment: the experiment survives, points at nothing, and a run over it has nothing to grade.
- A schedule paused on the screen: still there, still armed, one write from firing.
- An edit to an experiment that already ran: old runs are not re-scored, and their numbers describe the old configuration.

## Who can do what

Running (start and stop), editing the configuration, and deleting are three
separate permissions. Someone who can run an experiment cannot necessarily change
it, and stopping is gated exactly as starting is — stop is not the safer half.
Runs are their own records, so a run's permissions are not the experiment's.

Sharing is per experiment and can go to people, teams or applications. Sharing
with a team rather
than an individual ages better as people move around, but that is a build habit
offered as advice, **not a platform rule** — follow whatever the tenant you
are on already does.

## What no tool does

When one of these is asked for, say plainly that it is not available here, and do
not improvise a workaround through another surface.

- **Applying a metric's success criteria to produce the verdict.** `experiment_scorecard` gets you the per-metric pass rate; the last row of "Did it pass?" is still arithmetic you do and label as yours.
- **Saying which configuration produced a finished run's numbers.** It is recorded on the run and returned by nothing.
- **Completing a human-in-the-loop score.** A HITL metric waits for a person by design; no tool may type the score in for them.
- **Handing back an export's content.** `export_experiment_run` starts a file the person gets elsewhere. Read numbers with `experiment_scorecard` or `get_run_results` instead.
- **Re-scoring a finished run, or bringing back a deleted one.** Neither exists, which is why the run delete asks for counts first.
- **Online evaluation** — grading live production traffic — is not reachable through these tools at all. It is a different feature that lives on the agent, not under Evaluation: [references/online-evaluation.md](references/online-evaluation.md). The two are layers rather than alternatives: an experiment grades the cases you chose, in advance, and online evaluation grades what users actually sent, after the fact — so a problem that gets past one is often only visible to the other.
- **Annotation routing** — which team is asked to review an experiment's runs — is stored on the experiment, and no tool reads or writes it.

## What has been checked, and what has not

So that nobody reads more assurance into this file than it carries:

- **The stored field names and shapes hold for real records.** Anything that is
  not settled is marked *(unverified)* where it appears.
  [references/online-evaluation.md](references/online-evaluation.md) is the
  exception: it describes the product's screens, not stored records, and says so
  in its first paragraph.
- **Three rules hold exactly as stated here:** the run-status fold including the
  capitalised spelling, a pass rate with no metrics attached being undefined
  rather than 0%, and an `Unmeasured` zero being excluded from a pass rate
  instead of counted as a failure.
- **Take it a step at a time on a smaller model.** Do not hand a whole
  experiment over as one instruction and assume every step lands.

## Sibling and reference files

| File | Read it when |
|---|---|
| `eval-metrics` skill | you need the score ladder, either success threshold, or what a metric type does — it owns scoring semantics |
| `eval-datasets` skill | you need the test cases an experiment runs over, dataset size and blast radius, or why an experiment's dataset no longer resolves |
| [references/experiment-config.md](references/experiment-config.md) | **setting an experiment up** rather than reading its results — which of the three models does which job, how dataset fields are wired to task and metric inputs, and what the wizard's later steps offer |
| [references/runs-and-scoring.md](references/runs-and-scoring.md) | reading a run, a test-case result or a metric score, or scheduling one — the stored run statuses and how to fold them, the pass-rate trap, what a score status carries, and the stored scheduler shapes |
| [references/online-evaluation.md](references/online-evaluation.md) | anyone asks about grading live production traffic or "online governance evaluation" — a **pointer for a person**, carrying only the two things this skill needs: that the two names are one feature, and what nobody has confirmed about it. The feature lives on the agent under `Observability`, no tool here reaches it, and its configuration is not described here |
