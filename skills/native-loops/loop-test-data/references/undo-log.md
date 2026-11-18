# Undo log: every data change is written down before it is made

A device check or a test run that saves changes stored data. A job can die
between the change and its restore, so the way back is written first. The log
is one file per run, `R/data/undo-log.jsonl`, written by
`D="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-test-data/scripts/data-undo.mjs"`
(`node "$D" --help`). It stays in the run folder: its values are real record values,
so it never goes into a ticket, a comment or a shared summary.

## Before any change

1. **Use a record of the run's own.** A check that changes data runs on a
   seeded record (`ZZ_LOOP_<goal>_<what>`, [seed](seed.md)) or on the profile's
   fixture (`profile.mjs get --dir <folder> fixtures.recordFreshData`, see
   [profile](../../loop-preflight/references/profile.md) § Fixtures). It never
   runs on a record other people use. When none can be made, the check ends
   `not checked (no record of its own)` and says what the person can add.
2. **Read the value now**, live, with `get_records` (`limit` at most 5).
3. **Write the entry, then change.**

   ```sh
   node "$D" add --run <R> --object <object> --record <record id> --field <field> \
     --before '<the value now, as JSON>' [--parent <parent record id>] --job <job>
   ```

   Use `--before-absent` when the field has no value. A change the run
   cannot undo by setting a field back (a record it creates) is
   `--op create`. The change is made only after `add` printed the entry id.
   An agent that cannot run `add` makes no change.

## The restore step

It runs in three places, and each one is the same step:

- the end of the run (the orchestrator's Finish, before the board says
  `finished`);
- the start of a resumed run ([SKILL.md](../../loop-orchestrator/SKILL.md)
  § Before every loop, resume first);
- right after a job died or was stopped, before its page lock is released.

```sh
node "$D" check --run <R>      # exit 1 while any change is not restored
node "$D" plan  --run <R>      # newest change first, one line each
```

For each line of the plan, in order: put the value back through the
fde-agent (`apply_record_edits`), read the record live, then
`node "$D" mark-restored --run <R> --id <entry> --read-back "<the live read>"`.
The restore is done when `check` exits 0. A restore that fails stays pending
and goes to the person's list with the entry, never silently dropped.

A record the run created is deleted only through UnifyApps Headless's own delete dialog
([rules](../../loop-orchestrator/references/rules.md) § UnifyApps Headless ownership);
the plan names it, the dialog is the person's yes.

## A discarded added item is deleted

An item the run adds in the app (a row, a part, a sub-record) and then discards
is not left in the draft or empty state: the item is deleted (its discard
control, or its delete action), and the log carries a `create` entry for it
until the live read shows it gone. A run that stopped with such an item still
open treats it as a pending entry on resume.

## Format

One JSON object per line, append-only; a status is never edited in place.

```json
{"type":"add","id":"u_001","at":"2026-10-16T10:42:07Z","op":"update","object":"<object>","record":"<record id>","parent":"<parent record id>","field":"status","before":"Open","after":"Closed","job":"<job>","note":null}
{"type":"restored","id":"u_001","at":"2026-10-16T10:50:31Z","readBack":"status = Open (get_records, limit 1)"}
```

`op` is `update`, `create` or `delete`. `before` is the value read before the
change; `beforeAbsent: true` marks a field that had none. A torn last line
after a crash is skipped when the log is read.

## Not confirmed

- The script records and replays what the person's tools do; it does not
  write to the tenant. Putting a value back needs the object tool of the
  fde-agent, which a test runner does not hold: the orchestrator runs the
  restore step.
