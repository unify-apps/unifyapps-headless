# Runs and scoring

Read this when you are reading a run rather than configuring an experiment: a
run's roll-ups, one test case's result, one metric score — or when you are putting
an experiment on a schedule and need the stored shapes behind it. The score ladder
is canonical in the **`eval-metrics`** skill; SKILL.md carries the decisions, and
this file is the surrounding detail plus the stored shape of the data behind
them.

## Contents

- The run statuses — the stored values, two label maps, and the two spellings you
  have to fold together
- Roll-up counts and the pass-rate trap — read before quoting any rate off a run
- Metric score statuses — why the ladder in `eval-metrics` owns them, what a
  status carries, and how far the sentinel values are settled
- What a score record holds — the keys, which of them records actually carry, and
  where the two thresholds live
- Test-case runs — the keys, which two records actually carry, and the `avg*` trap
- Human-in-the-loop — why a HITL score sits unscored after a run finishes
- The stored shape of an experiment — which fields are always there, the schema
  extras, and the counters where 0 is a real value
- Stored `schedulerConfig` shapes — the keys, the undocumented `frequency` enum,
  and the cron expressions nobody validates

## The run statuses

The product has no single run-status list: the two places it shows a status
label them differently, on purpose. And both a capitalised and a lowercase
spelling of the same status are stored — `Completed` and `completed` — because
the capitalised form is historical rather than a typo, and older runs keep it
forever.

SKILL.md teaches five statuses and says nothing about capitalisation, because
`get_experiment_runs` folds the two spellings together before you see them. What
that fold covers — and what bites anyone who reads a status without it:

- **A case-sensitive `=== 'completed'` silently misses every run written with the
  capitalised spelling**, and on an old enough experiment that is most of them.
  A status you read may be written either way, so never compare one literally —
  and a filter that matches on spelling needs both forms to catch everything.
- Recent runs are written lowercase, so both spellings coexist permanently and a
  case-sensitive filter is wrong in one direction or the other whichever literal
  it picks.
- **`stopped` is in no label map anywhere** and renders blank in the product. It
  is rare, and still one of the five a tool must return.
- A normalised status no longer shows which spelling the row was written with,
  so quote the raw stored value when a surprising filter result needs explaining.

The two label maps, which are the product's own vocabulary:

| Stored | Experiments manager, Last Run Status | Runs grid, Status |
|---|---|---|
| `running` / `Running` | Running | Running |
| `completed` / `Completed` | Complete | Completed |
| `failed` | Failed | Failed |
| `cancelled` | Cancelled *(no colour, deliberately)* | Cancelled *(no colour)* |
| `stopped` | — | — |

"Complete" versus "Completed" is deliberate — do not normalize one label to the
other.

**Only one of the two maps is right to be lowercase-only.** The experiments-manager
map has no capitalised key and that is **correct**: an experiment's own last-run
status is written lowercase, where a run's status is not. Case-folding is
mandatory on a run's status and a no-op on the experiment's — do not apply one
rule to both. An experiment with no last-run status at all has never been run;
that blank is not a failure, and plenty of experiments sit in it.

## Roll-up counts and the pass-rate trap

Read this before computing or quoting any rate from a run's roll-ups.

Passed + failed **does not always equal** a run's total test cases, so
`passed / total` is wrong some of the time and `passed / (passed + failed)` is
wrong the other way. Three more things a run can be, each of which breaks a rate
quoted off it:

- **A run can execute its test cases with nothing grading them** — no metric
  scored it. Its pass rate is not 0%; it is undefined. Experiments with no
  metrics attached are common, so this is the usual case, not the exotic one.
- **A run can have 0 test cases.**
- **A completed run passing nothing is ordinary**, and most often it means
  nothing graded it rather than that the agent answered badly.

So "most completed runs passed nothing" is a true-looking sentence and a
fabricated story unless it also says how many of those runs had no metrics
attached. **Every pass-rate sentence must carry the metric count and the
test-case count beside it.** On a `running` row the roll-up counts are
present but not final: usually all zeros, sometimes a partial tally. Never read
them as the run's result until its status leaves `running`.

## Metric score statuses

**The status a metric score resolves to is decided by the ladder in the
`eval-metrics` skill, under "Some scores are not scores", and that ladder is the
only list of them.** It is ordered, the order is the method, and it carries the
sentinel value and the exception for `DERIVED` metrics at each step. Do not keep a
copy of the statuses here or count them: walk the ladder against the raw value.
`get_run_results` classifies each score by walking that same ladder; there is no
table here to read instead.

One thing the ladder does not decide, because it is record shape rather than
classification: which keys travel with a status. A real score carries `score`; the
two failure statuses that explain themselves carry a `reason` — and `reason` is
suppressed when the backend sends `"Missing"` or `"Not implemented"`, which are
treated as no reason at all. The full key list is in "What a score record holds"
below.

**How far the sentinels are settled — read before quoting them.** The sentinel
values the ladder keys on are `-2147483648`, `-1` and `-2`. **Those values, and
the ladder that reads them, stand; how often each one occurs is not established**
*(unverified)*, so do not quote a frequency for any of them.

The other half of the same trap is not in doubt: a score can be stored as `0`,
`result: false`, with `reason` and `comment` both beginning
*"Unmeasured: …"* and naming the metric that had no threshold configured. Those
are a **configuration gap, not failures**, and a numeric check counts every one of
them as a failure unless you exclude it — ladder step 8 owns the rule and marks it
*(unverified)*. The **ladder in `eval-metrics` stands regardless**: a `DERIVED`
metric's configuration is a base-metric list plus a formula, which can go
negative, and a stored threshold like `GTE ["0.6"]` shows non-integer scores are
real.

## What a score record holds

One score on one test case carries, at most: the metric it came from, the numeric
`score`, the boolean `result`, a `reason` (the judge's short explanation), a
`comment`, a `scoredBy`, `latency`, `cost`, `totalTokens`, the test-case type, the
metric type (or `NOT_IMPLEMENTED`), and an evaluator id.

What a score actually comes back carrying is `comment`, `cost`, `latency`,
`metricId`, `reason`, `result`, `score`, `scoredBy`, `totalTokens` and `type`.
`comment` is absent from the documented shape and repeats `reason` verbatim, so
it is never a second piece of information. The test-case type and the evaluator id
are declared rather than seen on a record — do not expect either on a score you
read *(unverified on a record)*.

**`scoredBy` is not a human-reviewer marker.** It is set on automatic scores too —
automation-typed, holding a workflow-execution query string. Never infer a human
reviewer from its presence.

Two thresholds decide pass/fail, and both live on the **metric**, not the
experiment: the test-case criteria decides one case's result, and the metric
criteria decides whether the metric passes across the whole run (e.g. "≥ 80% of
test cases passed"). Both are canonical in `eval-metrics`.

## Test-case runs

One row per test case per run, sorted so failures surface first.

Keys worth knowing: `result` (boolean pass/fail), `actualOutput`, `metricScores[]`,
`retrieval_context`, `tool_called`, `testCaseObject` (an input and
expected-output snapshot), `agentLatency`, `agentCost`, `totalMetricsCost`,
`avgTokenUsed`, `metadataFields`. The schema also declares `avgLatency`,
`avgCost`, `additionalOutputProperties` and `tools_called`, but real run rows do
not carry them, so do not read them.

**The same column has two spellings on two records.** A test case stores
`retrieved_context`; a run row stores `retrieval_context`. Read each record by its
own spelling. Neither one is ever `retrievedContext`.

`agentLatency` and `agentCost` are the agent's own numbers, and
`totalMetricsCost` is the scoring's.

These rows are written by experiment runs **and** by online governance evaluation,
which is why the same row shape serves both. `tools_called` (plain names) is
declared for governance rows; experiment rows carry `tool_called` (objects). See [online-evaluation.md](online-evaluation.md).

## Human-in-the-loop

A HITL metric is left unscored when the run finishes — resolving to
`needsAnnotation` — until a reviewer opens the run and types a score, optionally
with a note that lands **as a comment on the score**, not as a separate record.
Those human scores then join the automatic ones in the report. The write itself was
never traced *(unverified)*.

The product guide says the same thing from the product side, and it is worth
quoting because it makes the incompleteness intentional rather than a bug to chase:
*"A human-in-the-loop metric is not scored during the run. The engine parks it with
a placeholder and moves on, so the report comes back incomplete by design — the
automatic metrics have their numbers and this one is waiting."*

Which reviewer is asked is set on the experiment, not on the run: an annotation
setting names the team responsible for reviewing it. **Its stored shape is
*(unverified)*** and no tool
reads or writes it.

## The stored shape of an experiment

Absent is not a default: read the field, never assume a value.

| Field | What to expect |
|---|---|
| `dataset_ids`, `name` | always set — and `dataset_ids` is a list that in practice holds a single dataset |
| `task`, `lastRunStatus` | set on nearly every experiment; `agentId` (deprecated) on every one with an agent target |
| `metrics` | **often an empty list, sometimes missing** — both are the metric-less experiment SKILL.md warns about, and a large share of experiments are in that state, so check for both |
| `outputSource`, `schedulerConfig`, `concurrency` | frequently unset |
| `llm_model`, `pId` | rare |
| `tags`, `annotationConfig`, `evaluators` | declared by the schema; nothing sets them in practice |
| on a full record | `skipApprovalBeforeToolExecution` (in practice always `true`), `runCount`, `lastRunOn`, sometimes `description`, sometimes `metricIds` (stale — below) |

The schema's `required` is `["name","dataset_ids"]` on an experiment,
`["runId","experimentId","status"]` on a run, and
`["runId","experimentId","type","testCaseId"]` on a case result. A run row can
still come back with no experiment id despite that: a field being required does
not mean it is there.

The stored `ui:order` adds five fields the documented shape does not declare —
`metricIds`, `lastRunStatus`, `outputSource`, `annotationConfig`,
`skipApprovalBeforeToolExecution` — and a stored record also carries `runCount` and
`lastRunOn`. A run row likewise carries average test-case run time, total agent
cost and total experiment run cost, undocumented but present. All are
backend-denormalized and safe to read.

**Counters.** An experiment's `version` is a counter that climbs with every edit,
and `version: 0` is a real stored value elsewhere in Evaluation, so a version of
0 is a version, not a missing one — and it is the commonest case, the one most
easily mistaken for absent. A run's `experimentVersion` — the only record of
which configuration produced its numbers — is a **per-experiment**
counter, not a global one, and may be absent on a `running` row. Run ids
are bare 24-hex strings, **not** `e_`-prefixed like every other evaluation entity,
so recognising an id by its shape will misclassify a run id.

**Three ways a read of an experiment can mislead you.** An experiment can point
at a first dataset that no longer exists — a deleted dataset orphans the experiment
rather than removing it, so a name resolution that misses must not empty the list.
`metricIds` can survive a save and go stale, naming a different metric than
`metrics[]` does — always read `metrics[].metricId`. And the target lives in two
places: `task.task` holds **three** values (`agent`, `callable`, `dataset`) where
the documented list has two, while `outputSource` is often unset and can
disagree with `task.task` — prefer `task.task`, which is what the runtime reads,
and note that the screen's **Task** card stores `callable` with no `Task` literal
anywhere. `agentId` is deprecated and the manager column still reads it: it and
`task.aiAgentId` are always set together, with identical values, and neither is
ever set alone — a create must still write both.

## Stored `schedulerConfig` shapes

A stored config carries `type` (`INTERVAL` or `EXPRESSION`), `isScheduled`, and —
for an interval schedule — `frequency`, `interval`, `startTime` and `timezone`,
plus `active` and, for an expression schedule, `expression`. Interval schedules
are far and away the common case. **`frequency` is an undocumented enum**, with
`DAYS`, `MINUTES` and `WEEKS` all in use. **Stored cron expressions are not
validated**: `'90 0 * * *'`, whose minute is out of range, and `'0 0 * jan *'`,
whose month is a name where a number is expected, both persist without complaint,
so do not assume a stored expression parses.

`isScheduled` and `active` are supposed to agree and do not — `active` is often
unset, and the two can contradict each other in both directions. **"Is this
schedule live?" cannot be answered from either field alone**: read both, and treat
a disagreement as ambiguous rather than picking a winner. Creating an experiment
with a scheduler config does not by itself arm the scheduler.
