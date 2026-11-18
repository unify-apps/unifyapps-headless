---
user-invocable: false
name: automation-performance
description: Only for the automation-agent builder agent. Makes an automation fast for whoever waits on it and cheap at the rate it really runs, without changing what it answers or writes. Before writing, it finds out who waits, how often the automation runs and which steps read, write or call. Then it shapes the work so slow independent steps run at the same time, each read fetches only what is used, and each read is checked against the object's indexes. It times test runs before and after, with the same answers, and reports the slow steps and each index a read needs. Load it on every task that writes or changes an automation.
---

# Make an automation fast

A person waits for the longest chain of steps that must run one after another. Make that chain short, and make each step on it cheap. An automation that runs only on a schedule has no one waiting. It still costs something each run, and each run must end well before the next one starts.

The `performance` skill holds the mechanics: caching, loops, batch calls, paging and analytics. This skill is the order you think in, and what you prove. A speed change never changes what the automation answers, what it writes, or how it fails, unless the task asks for that.

## 1. What to find out before you write

The brief's `Speed:` line gives what the router knew. Find out what it marks unknown.

- **Who waits.** A page on open, a person after a click, another automation (so whoever waits on that one), or no one (a schedule or a background job).
- **How often it runs.** For an automation that exists, `list_workflow_runs` with `runType: "workflow"` gives its recent live runs. Count them over the time the list covers, and say that time. Note the middle and the slowest time: that is what a person waits for. A small automation that many others call is often the one that runs most.
- **The data.** For each object a step reads, find its record count (`get_records` with `limit: 1`) and the filter the step uses. Then picture it at 10 and 100 times that count.
- **The aim.** When a person waits, aim for the whole run in under a second. When no one waits, aim for the fewest calls and rows per run. When a run is slower than the aim, name the slowest step and why it is slow.

## 2. Shape the work

Draw what needs what: for each step, which earlier step's output it reads. Then:

- **Run slow independent steps at the same time.** Put each one in its own arm of one `branch`, and leave out every arm's `when`, so every arm runs. This is the one use of `branch` that is not a split on one value. After the branch, read each arm's result through its own variable, as the agent file's shared branch result pattern does. Use it only when each arm is slow, such as an outside call or a large read: each arm costs a child run. See `automation-runtime` [runtime-facts.md § Branches and parallel work](../automation-runtime/references/runtime-facts.md#branches-and-parallel-work). In a test run, check that every arm ran and the answer matches. A test run may run the arms one after another, so its times prove nothing here.
- **Do not wait on work whose answer you do not use.** A notification, an activity record or a message to an outside tool may run as a call that does not wait, when the call step's schema has that option. Read that schema for what such a call returns and what happens when it fails. A failure there no longer stops the run. So make this change only when the task says that failure may be ignored. Otherwise, name it in `unverified` as a speed-up the person can choose.
- **Do the cheap check first.** A permission check, an empty input or a missing record that ends the run should run before the expensive reads, when it returns the same error.
- **Skip reads that cannot find anything.** When a filter list is empty, skip the read with an `if`. Every later step that reads that result must handle the skipped path. Give it the empty answer through a variable.
- **Read once, pass it on.** When two steps read the same records, read them once and pass the result on, unless a write in between changes them. Change a called automation's inputs only when the task names it, and check its other callers.
- **No reads or calls inside a loop.** Read every row the loop needs in one read before it, with `storage_by_unifyapps_get_records_by_ids` or an `isIn` filter. Then match the rows inside the loop. Keep that read within the operation's page limit, and page it when the list is longer. The `performance` skill has the batch calls.

## 3. Make each read cheap

- **Filter in the store.** Put the filter, sort and limit on the read. Never fetch a whole object to pick rows in code.
- **Fetch only what is used.** Ask only for the fields later steps read. Read every field when a later step uses the record's version or owner, or writes the whole record back. When a step needs only how many rows match, use `storage_by_unifyapps_count_records`, not a fetch.
- **Read by the narrowest key.** Read the rows you need by id, parent or owner. Do not read every row of a team or workspace to find a few.
- **Check each read against the indexes.** Compare its filter fields with the object's indexes (`cache obj <objectId> --refresh`). A read by id needs none. An index should lead with the equality fields, then the sort field, then the range field. When no index leads with the read's equality fields, report `index needed:` (see § Report). You do not change objects: `fde-agent` adds the index in the same change.

## 4. Prove it

1. **Run the old version first.** On an automation that exists, before you save, call `trigger_workflow_run` with `runType: "workflow_test"` on 2 to 3 inputs that cover the main paths. These are the same runs `automation-testing` asks for before the first fix round. Keep each answer and its time. A run that writes or sends something the task does not name needs the task's yes first (`automation-testing` step 3).
2. **Same answers, new times.** After the save, run the same inputs. Every answer must match the old one, apart from new ids and times, except for what the task asked to change. Compare the records it wrote too.
3. **Find the slow step.** `inspect_workflow_run` shows the run's steps. Name the slowest step on the path a person waits for.
4. **Trust only a clear change.** Time each input three times, one run after another, never at the same time. Take the middle time. This is the one case where a green run is run again. A change under about 30% is not a real change on a busy tenant. Compare before and after with test runs, since both run the same way, and report the live time from § 1 beside them.

## 5. Think past the task

The task describes today's inputs. Before you save, answer these:

- What happens when the input list has 1,000 items, not 10?
- What happens when each object it reads is 100 times bigger?
- What happens when it runs 10 times a second, because a loop or a busy page calls it?
- What happens when an outside system is slow? Name how long a person would wait on it. Change a timeout only when the task asks.
- Which step does every run pay for, even when it changes nothing in the answer?
- What does each automation it calls cost, and does that one wait on further calls?

Fix what would break. Put each risk you leave in `unverified`, with the number that shows it.

## Report

End each automation task with one `speed:` note in its `notes`:

`speed: <automation> · waits: <who> · runs: <rate over its time, or unknown> · test runs <middle ms> (before <middle ms>, or new) · slowest step: <step> <ms> · reads: <object> by <fields> → <index, or none> ; …`

Then one note per read that has no index that leads with its equality fields:

`index needed: <object id> (<field>, <field>) for <step> in <automation>, <records now> records`

On a plan task, also add `plan_change: absorbed add an index on <object id> (<fields>) for <step>`. A read you chose to leave without an index (a rare path on a small object) goes in `unverified` with its reason.
