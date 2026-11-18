# Access control: who may see and change what

## Contents

- Three different failures
- Object access settings
- App and page visibility
- API access
- Roles and permission groups
- The owner check in an automation
- Writes: name the fields
- Reads: return what the screen needs
- Deletes and bulk edits
- Automations with no signed-in user
- AI agent tools and cases
- What proves it

## Three different failures

They often show up in the same build:

- **Kind of action**: may this user do this *kind* of thing at all.
- **This record**: may this user do it to *this* record. Failing this lets a
  user change an id and open someone else's record.
- **These fields**: may this user set, or see, *these* fields.

A build often passes the first and fails the other two. The screen shows a
user only their own rows and fields, while the automation behind it will serve
and accept anyone's.

## Object access settings

The `update_object_settings` step of `apply_object_batch`, with
`panel: "access"`, writes two settings of one object:

| Value | What it does | When you may write it |
|---|---|---|
| `skipPermissionsFilter: true` | by its name, the object's records stop being filtered by the caller's permissions *(unverified: no UnifyApps Headless doc says what it does)* | only when the request says, in the person's own words, that everyone may read this object |
| `external: true` | *(unverified: no UnifyApps Headless doc says what it does)* | only when a named requirement asks for it |

Never set either one to make a build work. A read that returns nothing is a
permissions problem to solve, not a filter to remove. A task that cannot go on
without one asks the person through its report and names the value and the
object.

A standard object refuses `update_object_settings`.

## App and page visibility

`set_app_visibility` takes two values:

- `PRIVATE`: a visitor signs in, then permission groups decide. "Everyone on
  the tenant" is this value. **Every new app is set to this**, with
  `set_app_visibility` after `create_app`, because `create_app` takes no
  visibility. Read it back with `cache app --refresh`. Do not change it to make
  a preview easier to share.
- `PUBLIC`: anyone with the link, no sign-in. Write it only when the request
  says a signed-out visitor must reach the app. A `PUBLIC` app over records
  that belong to users shows those records to anyone with the link.

A `PRIVATE` app can still have public pages, through `set_pages_visibility`.
The same rule applies to each page: public only when the request asks for it.
A public page that shows data shows it to anyone.

`apply_permission_edits` sets which permission groups may open a page. Give a
page only the groups a requirement names.

An app made `PUBLIC` for a demo goes back to `PRIVATE` in the same plan, as its
own task, not as a promise in a report.

## API access

An API Platform access profile with No Auth (`NO_OP`) lets anyone call the
APIs it holds, the same as a `PUBLIC` app. Use it only when the request says
the APIs are public. Give an access profile only the API groups and APIs a
requirement names (`api-access`).

## Roles and permission groups

No UnifyApps Headless tool creates a permission group yet. Read the groups with
`get_permission_group_options`. When a build needs a new one, build the rest,
and add one `unverified` line naming the group, what it should allow, and
that an admin must set it. Never widen object access to make up for a
missing group.

**Creating a user and a role is a separate question, and `fde-agent` does it**
(`governance-people`, `governance-roles`, `governance-assignment`). Create the
user, put them on a role that grants only what the request named, and hand
the username and password back to the person verbatim, in the same reply, so
the account is usable the moment it is made. Giving a role REPLACES every
role that person or team already held in that scope, so a request that means
to add one role names in `deletes` any role the change would take away, read
before the write. A delete or a password reset is irreversible and waits for
the person's yes, the same as every other delete.

## The owner check in an automation

A read or write of a record that belongs to one user needs **two** checks:

1. the id or filter that says which record is wanted. This may come from the
   caller;
2. a check that the record belongs to the user running the automation. This
   one may **never** come from the caller.

Set by the caller, every one of them: a page parameter, a data source input, a
block binding, an automation's input from its caller, a request body field, a
query string value, a case id, an AI agent's tool argument, and any variable
filled from one of those.

`USER.id` is the user the automation runs as. Store the owner in a field of
your own, set from `USER.id` when the record is created, and compare against
it. The caller never sends the owner.

Read by id, then check the owner before using the record. The examples here
are a `callable` automation, where `return` ends the run. A webhook, a
schedule or an app event ends with `stop()` instead, and a `callableApi` with
`respond(...)`.

```ts
// An id was sent and a user is signed in
if (and(exists(t.caseId), exists(USER.id))) {
  // Find the case
  const found = op('storage_by_unifyapps', 'storage_by_unifyapps_get_record_by_id', {
    object_type: 'OBJ_case',
    id: t.caseId,
  }, { onError: 'CONTINUE' });

  // Found, and this user's case
  if (and(exists(found.id), eq(found.properties.ownerId, USER.id))) {
    // ... use found ...
  } else {
    // Not found or not theirs: one answer for both
    return { ok: false, message: 'Case not found' };
  }
} else {
  // No id, or no signed-in user
  return { ok: false, message: 'Case not found' };
}
```

Every `exists` there matters. With `onError: 'CONTINUE'`, a missing record
gives empty values, and a run with no user has an empty `USER.id`. Two empty
values are equal, so `eq` alone would let them through. An empty id can also
stop the read with an error, so check it before the read.

Or filter on the owner in the fetch itself, inside the same
`exists(USER.id)` check, so an empty user never matches records with an empty
owner:

```ts
// A user is signed in
if (exists(USER.id)) {
  // Find this user's case
  const mine = op('storage_by_unifyapps', 'storage_by_unifyapps_fetch_records', {
    object_type: 'OBJ_case',
    numberOfRecordsToFetch: 'MULTIPLE',
    triggerInputCondition: and(
      eq('properties_caseNumber', t.caseNumber),
      eq('properties_ownerId', USER.id),
    ),
  });
}
```

Check these shapes against `get_operation_schema` and `describe_storage_object`
before you write the node (`automation-runtime` says how). `USER.id`
can reach a code node as a number, so compare it as a string there.

**One answer for both.** A record that does not exist and a record that is not
the user's get the same answer and the same message. "Not found" against
"forbidden" tells an attacker which ids exist.

**Every way in, not every screen.** One object may be read by a page data
source, a callable automation, an API and an AI agent tool. The owner check
goes on each path. A check on the page is not a check, because the page is the
one part a user can change.

**A team is not an owner.** A record shared with a team is allowed for that
team's members. Check `USER.staticUserGroups` or `USER.dynamicUserGroups`
against the group stored on the record. Never trust a group name the caller
sent. `find_users_and_groups` finds user and group ids while you build; it is
not something a running automation can call.

**A page filter is not a check.** A page data source can filter Storage
records, but the filter value is set on the page, which the user controls. Data
one user must not see needs the platform's permission filter or a callable
automation that does the owner check.

## Writes: name the fields

`apply_record_edits` `update` **merges** the properties you send, and
`replace: true` overwrites the row. In an automation, an update node sets what
you give it. Both are safe only when *you* chose the field names.

For the fields input of `storage_by_unifyapps_update_record_fields_by_id` (read
its key with `get_operation_schema`; it is not written down here):

```
WRONG  <fields input>: t.changes
       the caller can add ownerId, status, price or isAdmin

RIGHT  <fields input>: { deliveryNote: t.deliveryNote, contactPhone: t.contactPhone }
       the requirement names the fields, and nothing else can be set
```

The fields a caller may set are a list in the requirement, and the build writes
that list. Never pass a whole input object on, never forward a whole form, and
never let a caller set an owner, a status, an amount, a role, a flag or a
date the server should own. `apply_record_edits` refuses the platform's own
columns (`id`, `v`, `cTm`, `mTm`, `lMBy`, `oUId`, `pId`, `refKey`, `uId`), but
that covers none of the fields above, and an automation write does not refuse
them at all.

A create follows the same rule: the caller gives the content fields, and the
build sets the owner from `USER.id`.

## Reads: return what the screen needs

A fetch with no field list returns every field, and every field reaches the
browser, bound to a block or not. Internal notes, another user's id and a
salary all travel behind a page that shows three columns.

Give `storage_by_unifyapps_fetch_records` a `fields` list of what the page uses.
For a count or a total, return the number, not the rows. A `fields` list drops
the system fields, so add any you need.

Store less too. Where the data has a natural life, set a retention window:
`panel: "data"`, `retentionDuration` with `retentionUnit` (`MINUTES`, `HOURS`
or `DAYS`). Retention works only on `MONGO` and `REDIS` objects.

## Deletes and bulk edits

- Check the owner before deleting, the same as any other write. A delete by an
  id the caller sent, with no owner check, lets a user destroy other users'
  records.
- A filter edit in `apply_record_edits` changes or deletes **every** row it
  matches. Run it with `dryRun: true`, read `matched` and `sampleIds`, then run
  it with `expectedCount` set to that number.
- Never build a filter from caller input alone. Whoever controls the filter
  controls how many rows it hits.
- `delete_object` takes `expectedRecordCount`. Run it with `dryRun: true`
  first for the count and what depends on it.
- The yes for any delete comes the way your message's delete rules say. You
  never ask the person yourself.

## Automations with no signed-in user

A record trigger, a schedule, a webhook and a callable reached from a `PUBLIC`
app may run with no signed-in user, or with a user who is not the person the
data belongs to. Branch on `RUN.isAnonymousUser` where it matters, and test
which user the trigger really runs as before you rely on `USER.id`.

An owner check written against an empty `USER.id` matches nothing or
everything. A background automation that acts across users is a named
requirement, and it filters on the record's own data, not on a user it does
not have. A flow that needs the signed-in user is a callable the app calls
while that user is signed in.

## AI agent tools and cases

An AI agent calls its tools with arguments the model wrote from what the user
typed. So every automation behind an agent tool is a way in like any other,
and carries the full owner check. A case id is an id the caller sends. See
[ai-agents.md](ai-agents.md).

## What proves it

The stored filter or condition, read back, with the owner check in it. For
anything two users can reach, one test where a second user asks for the first
user's record and is refused, when your tools can run as a second user. When
they cannot, add an `unverified` line saying this test is still needed.
