# Business rules: check a rule where its state is stored

## Contents

- The rule
- Where to read each state
- Order of steps
- Repeats and two runs at once
- Values the caller does not choose
- Ways in that are not what they look like
- What proves it

A business rule checked against caller input is not checked:

```ts
// WRONG: the caller decides whether it was approved
if (eq(t.approved, true)) {
  // Release it
  op('storage_by_unifyapps', 'storage_by_unifyapps_update_record_fields_by_id', {
    object_type: 'OBJ_request', id: t.requestId, /* the release fields */
  });
}
```

Nothing in that run looked at an approval. `t.approved` came from a page, an
API caller or an AI agent's tool argument. The automation stamps whatever it
is told.

This is the same mistake as trusting an id, one step up. A missing owner check
trusts the caller about *who they are*. This trusts the caller about *what
already happened*.

## The rule

**Before any step that depends on an earlier state, read that state again from
the system that owns it, in the same run, and branch on what the read
returned.**

In a `callable` automation (a webhook, schedule or app event ends with
`stop()`, a `callableApi` with `respond(...)`):

```ts
// An id was sent
if (exists(t.requestId)) {
  // Read the request where it is stored
  const req = op('storage_by_unifyapps', 'storage_by_unifyapps_get_record_by_id', {
    object_type: 'OBJ_request',
    id: t.requestId,
  }, { onError: 'CONTINUE' });

  // Found, approved, and not by the person who raised it
  if (and(
    exists(req.id),
    eq(req.properties.status, 'APPROVED'),
    exists(req.properties.approvedBy),
    ne(req.properties.approvedBy, req.properties.raisedBy),
  )) {
    // Release it
    op('storage_by_unifyapps', 'storage_by_unifyapps_update_record_fields_by_id', {
      object_type: 'OBJ_request', id: req.id, /* the release fields */
    });
  } else {
    // Refuse
    return { ok: false, message: 'Request is not approved' };
  }
} else {
  // No id
  return { ok: false, message: 'Request is not approved' };
}
```

Three things to copy beyond the read itself. An empty id is refused before the
read. A missing record fails the check, because `exists(req.id)` is false. And
it checks a rule the status alone does not hold: the approver is not the
requester, and an empty approver never passes.

## Where to read each state

The owning system is the one that would still be right if every other copy
were wrong.

| The rule depends on | Read it from | Not from |
|---|---|---|
| an approval | the approval record, now, with who approved and when | the fact that an approval page was open, or a flag the page set |
| a check or verification | the record or service that does the check | a stored true/false with no date, which may be years old |
| stock, seats or capacity | a fresh read right before the write | a count read at the start of a long run |
| a quota | the counter, read right before the write | a count the caller reports |
| another system's state (a ticket closed, a payment taken) | that system's own read, or the record its webhook wrote | a status the page set, or a value in the request body |
| whether this user may act | the owner check ([access-control.md](access-control.md)) | the id being hard to guess |

**When the state is in another system**, check more than one field of its
answer. A finished operation for the *wrong* item or the *wrong* amount does
not allow this one. Compare every field that ties the answer to this request:
the reference you sent, the amount or quantity, the currency or unit, and the
status. A payment is the usual example, but the same check applies to a
shipment, a signature or a credit check.

## Order of steps

- **Check before the first write.** Read and check every condition before
  anything is written, so a refusal leaves nothing behind.
- **Write the "done" mark last**, after the work it marks has succeeded
  (`resiliency` § Preserve business state). A record marked `FULFILLED` before
  the fulfilment returns is wrong when the fulfilment fails.
- **One automation owns each status change.** Two automations that both move a
  record to the same status will disagree. Name the one that owns each change.
- **`onError: "CONTINUE"` on a check node turns a hard rule into a soft one.**
  Use it only where the later nodes really do not depend on what failed. A read
  that may find nothing can use it, as above, as long as the next branch treats
  empty as a failed check.

## Repeats and two runs at once

A caller who can send a request once can send it twice, and two requests can
arrive together.

- Make the write safe to repeat, on a key the caller cannot change: the other
  system's event id, or the record id plus the target status. Not a time, not a
  new random id, not a value from the body alone.
- Make storage refuse the repeat, not a branch: one field with `uniqueKey:
  true`, or one index with `unique: true` over several fields
  (`object-storage-manager`). A second write then fails with a duplicate-key
  error (`E11000`) that ends the run. Catch it with `try`/`catch`, but a
  `catch` gets every error, not only this one. So in the `catch`, read the row
  by its key, and call it "already done" only when the row is there. Any other
  error stays an error.
- For a status change, prefer `storage_by_unifyapps_update_records` in `SINGLE`
  mode with a filter on the current status (`PENDING`). It has behaved like a
  guarded update: it updates by the row's current version, so a second run that
  lost the race got `false` and changed nothing (`automation-runtime` runtime
  facts). Check the result and read the
  row back.
- No storage operation in the UnifyApps Headless docs adds to or takes from a number in one
  step *(unverified: none is documented, not proved missing)*. A read-then-write on a
  stock or seat count can oversell when two runs overlap. When oversell matters,
  build the guarded update above, and add an `unverified` line that the count is
  not protected from two runs at once.

## Values the caller does not choose

Work these out on the server from the source, every time:

- an amount, price, total, fee, tax or discount. A value from a page is an
  offer, not a fact;
- a date or time that decides eligibility. Use `RUN.currentTime`;
- the sign of a quantity and which way to round;
- a code or coupon, checked when used: it exists, is active, is in date, is not
  used up, applies to this item, and is applied once.

## Ways in that are not what they look like

- **A webhook is an HTTP request from anyone** until it is proved otherwise.
  Treat its body as a notice, not as data: take the id from it and read the
  item from the sending system. Refuse repeats by the sender's event id with a
  unique index. Checking the sender's signature needs the raw body and headers,
  which the `webhook` trigger does not document giving you. Check with
  `get_operation_schema` first. When you cannot check it, add an `unverified`
  line that the webhook's sender is not verified.
- **A callable reached from a `PUBLIC` app** may have no signed-in user. Every
  rule it applies is applied to data, not to identity
  ([access-control.md](access-control.md) § Automations with no signed-in user).
- **An AI agent tool** is called with arguments a model wrote from what a user
  typed. It is a way in like any other.

## What proves it

The automation, read back with `open_workflow`, showing the read of each
condition and the branch on its result. And a test run that took the refusing
branch, not only the one that passed. An automation that branches on a state it
did not read is wrong even when its run passed, because the run had a friendly
caller.
