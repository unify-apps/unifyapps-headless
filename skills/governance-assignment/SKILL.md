---
user-invocable: false
name: governance-assignment
description: "Gives a role to a person or a team on a UnifyApps tenant, tenant-wide or for one app, and reads what they hold before changing it (the role assignment on the Users and Teams editors). Covers the one fact that makes this dangerous — an assignment replaces every role the person or team held in that scope, so a call naming one role takes the rest away — how the dry run is the only moment the roles about to be taken away can still be seen, why two assignments at the same time mean last one wins, and the difference between a tenant-wide grant and an app-scoped one. Also holds the walkthrough that joins a new person, a team, a role and its permissions into working access. Load it for any ask to give someone a role, change or take away the roles they hold, or work out why a person with the right role still cannot do something."
---

## What an assignment is

A role grants nothing until someone holds it. An **assignment** joins a role to
a **principal** — either one person or one team — in a **scope**.

| Scope | How to ask for it | What it covers |
|---|---|---|
| Tenant-wide | leave `appId` out | everywhere on the tenant |
| One app | pass `appId` | that app only |

A person can hold roles through themselves and through every team they are on.
So someone with no role of their own may still have access, and taking a role
off a person does not take away what a team of theirs grants.

**The one fact to carry into every call: an assignment is a full replace.** It
sets exactly the roles you name, in that scope. A call naming one role takes
away every other role that principal held there. Meaning to add a role and not
reading first is how an administrator loses their own access.

This skill owns assignment, the replace rule, and the walkthrough below. Users
and teams belong to `governance-people`. What a role grants belongs to
`governance-roles`.

## The application-builder MCP server

Every tool here is an MCP tool on the `application-builder` server, bridged to
the signed-in tenant, with one exception noted where it appears
(`find_users_and_groups`, which is on the `object` server). Call them like any
other MCP tool. There is no CLI. **Every call takes `host`.** It is the
signed-in tenant's `https://` origin, with no path. A call without it goes
nowhere.

## Adding a role without taking the others away, in order

This is the order that makes a replace safe. Every step before the write exists
to tell you what the write is about to remove.

1. **Resolve the principal.** `find_users_and_groups {users, groups}` turns an
   email, a user id, or a team's exact name into an id. Prefer an email for a
   person: a name can match more than one.
2. **Plan with a dry run.** `apply_role_mapping_edits` with `dryRun: true`,
   naming only the role you were asked to add. Read `previousRoleIds` — what
   they hold now — and `removedRoleIds` — what this call would take away.
3. **Decide from `removedRoleIds`.** Empty means the call adds without taking
   anything. Not empty means you were asked to add and are about to subtract.
4. **Send the full list.** Call again, without `dryRun`, naming the role you
   were asked to add **and** every role in `previousRoleIds` you mean to keep.
5. **Check `removedRoleIds` on the real reply.** It should hold only roles you
   decided to drop. Anything else there is access that just went away.

With nobody to ask and a `removedRoleIds` you were not told to remove, report
`needs_confirmation` and stop rather than guessing.

## Working access, end to end

The whole chain, naming tools from all three governance skills. Each step is
useless without the ones before it.

1. **The person exists.** `apply_user_edits` creates them — see
   `governance-people`.
2. **A team, if the access is for a group of people.** `apply_team_edits`, then
   `apply_user_group_membership_edits` to put them on it — `governance-people`
   again. Assigning to a team rather than a person is usually the better choice:
   the next joiner inherits it.
3. **A role exists.** `apply_role_edits` — `governance-roles`. It grants nothing
   yet.
4. **The role grants something.** One of the four permission tools in
   `governance-roles`. A role with no permissions assigns cleanly and still
   denies everything, which is the most common reason this chain looks done and
   does not work.
5. **Someone holds the role.** `apply_role_mapping_edits`, following the order
   above.

## The tools

### Reading

- **`find_users_and_groups {users, groups}`** — ids for people and teams, by
  email, by id, or by exact name. Each asked value comes back with every match,
  so a name matching two people is visible rather than guessed at.
  **This one is on the `object` server, not `application-builder`**, and it is
  already live, so it works before the governance tools reach a tenant.
- **`get_user_details {userId}`** and **`get_team_details {teamId}`** — the
  stored record for a person or a team. Useful for confirming you have the right
  principal before a replace.
- **`get_role_options {search}`** — every role's id and name, for turning a role
  name into an id.

To read what a principal holds now, use the dry run in the writing tool below.
It is the read: there is no separate tool for it.

### Writing

- **`apply_role_mapping_edits {user, group, roles, appId, dryRun}`** — sets
  exactly the roles a principal holds in one scope.

  Name **exactly one** of `user` or `group`; naming both or neither is refused.
  `roles` takes role ids or exact role names. Leave `appId` out for the
  tenant-wide assignment; pass it for one app only.

  The reply holds `roleIds` — what they hold after the call — alongside
  `previousRoleIds` and `removedRoleIds`. Those two are in the dry run as well,
  which is the whole point: after a real call the roles it took away are already
  gone, so the dry run is the only moment they can be seen.

  **`roles: []` is refused.** An empty list is not a way to strip every role,
  because it cannot be told apart from a mistake.

### One-way actions

A replace is **not** reversible by the tool. It can be undone only by sending the
old list back, which is why `previousRoleIds` matters: once the call has
answered, that list is the only record of what was there. Keep it before moving
on.

## Traps that answer 200 and do the wrong thing

Only the ones the tools cannot stop for you.

**Two assignments at the same time: last one wins.** Nothing stops a second
replace overwriting the first, and neither reply mentions the loss. The record
carries no version the tools can check, so there is no safe way to interleave
two changes to one principal's roles. Do them one at a time.

**A scope is part of the identity.** A tenant-wide assignment and an app-scoped
one for the same person are separate. Replacing one does not touch the other, and
a dry run on the wrong scope shows an empty `previousRoleIds` that looks
reassuring and means nothing.

**A person's access is theirs plus every team's.** Taking a role off a person
who still gets it through a team changes nothing they can see. Check the teams
before concluding the removal failed.

**A role name is not unique the way an id is.** `roles` takes names, which is
convenient and ambiguous. Resolve through `get_role_options` where the person
named a role in words.

**`updated: false` means the write did not land.** The reply says so because the
read after the write found no assignment. Do not read a 200 as the write having
worked.

## What no tool does

Say plainly that these are not available, and do not look for another way.

- **Listing everyone who holds a given role.** Assignments are read one
  principal at a time, so there is no "who has this role" answer and no safe way
  to build one before deleting a role.
- **Taking every role away.** `roles: []` is refused by design.
- **Reading the effective permissions of a person** — what their own roles plus
  their teams' roles add up to. Each part is readable; nothing adds them up.
- **Changing a role's permissions.** That is `governance-roles`.
- **A governance audit trail.** There is no tool for who assigned what and when.

## What has been checked, and what has not

- A replace reporting the roles it takes away, in both the dry run and the real
  call, and reporting none when the principal held none in that scope: checked
  on a real record, with a team moved from one role to another.
- The assignment carrying no version the tools can check, so two replaces are
  last-one-wins: checked.
- `updated: false` when the write does not land: checked.
- Naming both `user` and `group`, and `roles: []`, both refused: checked.
- Assignment scoped to one app with `appId` *(unverified)*: the scope is set and
  reported, but no app-scoped assignment has been seen taking effect for a
  person signing in.
- Assigning by role **name** rather than id *(unverified)*.
