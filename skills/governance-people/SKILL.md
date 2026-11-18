---
user-invocable: false
name: governance-people
description: "Creates, edits, disables and deletes the people on a UnifyApps tenant, resets a password, and builds the teams they belong to and the membership between the two (Settings > Governance: Users and Teams). Covers the five states a user can be in, which fields an edit overlays and which it leaves alone, why team membership has its own tool instead of being written through the user record, how a team built from criteria differs from one with named members, and what the reply proves after each write. Load it for any ask to add or remove a person, change their details, reset a password, make or change a team, or put people on a team and take them off."
---

## What users and teams are

A **user** is one person who can sign in to the tenant. The id is the number
they sign in as, written as text. A user record holds their name, the username
they sign in with, their contact details, any custom properties the tenant
added, and a state.

A **team** is a named set of users. The screens call it a Team; everything
stored calls it a UserGroup, which is why the tools take `teamId` while some
replies carry `staticUserGroups`.

| State | What it means |
|---|---|
| `ACTIVE` | can sign in |
| `DISABLED` | switched off by an administrator |
| `DORMANT` | has not signed in for long enough that the tenant parked them |
| `LOCKED` | locked out, usually after failed sign-ins |
| `DELETED` | the state a deleted record carries, where the tenant keeps one |

**A team has members in one of two ways, and only one of them is yours to
write.** A team with named members keeps them in `staticUserGroups` on each
user, and `apply_user_group_membership_edits` is the only tool that writes it. A
team built from criteria has its members worked out by the tenant's rule engine
and kept in `dynamicUserGroups`. No tool writes that, and nothing reads the
result of the rules.

This skill owns users, teams, membership and the password reset. Roles and what
they grant belong to `governance-roles`. Giving a role to a person or a team
belongs to `governance-assignment`, which also holds the walkthrough that joins
all three.

## The application-builder MCP server

Every tool here is an MCP tool on the `application-builder` server, bridged to
the signed-in tenant, with one exception noted where it appears
(`find_users_and_groups`, which is on the `object` server). Call them like any
other MCP tool. There is no CLI. **Every call takes `host`.** It is the
signed-in tenant's `https://` origin, with no path. A call without it goes
nowhere.

## Adding a person to a team, in order

Read before you write, every time. An edit overlays only the fields it names
onto the stored record, so the only way to know what else a save touches is to
have read the record first.

1. **Find the person.** `find_users_and_groups {users}` turns an email, a user
   id or an exact full name into an id. Prefer an email: a name can match more
   than one person. This tool lives on the `object` server, not with the rest.
2. **Read them.** `get_user_details {userId}` gives the stored record, so the
   next step's reply can be compared against it.
3. **Read the team.** `get_team_details {teamId}` confirms the team exists and
   is not one built from criteria.
4. **Plan the membership write.** `apply_user_group_membership_edits` with
   `dryRun: true` shows what it would add and remove without writing.
5. **Write it.** The same call without `dryRun`. The reply carries `membership`
   read off each affected user, not the arguments you sent.
6. **Check the reply, not the status.** A user listed as `unreadable` means the
   read after the write failed for that person, not that the write failed.

## The tools

### Reading

- **`get_user_details {userId}`** — the whole stored user record. Read it before
  any edit.
- **`get_team_details {teamId}`** — the whole stored team record, including how
  many users it holds.
- **`find_users_and_groups {users, groups}`** — ids for people and teams, by
  email, by id or by exact name. Each asked value comes back with every match,
  so a name that matched two people is visible rather than guessed at.

  **This one is on the `object` server, not `application-builder`.** It is the
  same tool the share pickers use.

### Writing

- **`apply_user_edits {userId, name, email, phoneNumber, username, password, customProperties, state, dryRun}`**
  — creates a user when no `userId` is given, edits one when it is. Only the
  fields named are overlaid; everything else on the record is carried through
  untouched, including custom properties the call does not name. The reply holds
  the stored record and `readBack`, which says whether that record came from a
  read after the write or from the write's own answer.

  Two things it deliberately never writes: **team membership**, which has its own
  tool, and **roles**, which belong to `governance-assignment`. Passing a
  password here sets one; no reply ever hands a password back out.

- **`apply_team_edits {teamId, name, description, criteria, applicationId, dryRun}`**
  — creates a team with no `teamId`, edits one with it. `criteria` makes the team
  rule-driven instead of named-member; leaving it alone keeps a team as it is.
  The reply holds the stored team and `readBack`.

- **`apply_user_group_membership_edits {add, remove, dryRun}`** — the only tool
  that writes who is on a team. Both `add` and `remove` take `userIds` and
  `teamIds`, and each is a full cross-product: every user named joins or leaves
  every team named. Give at least one of `add` or `remove`, and each one needs at
  least one user and one team.

  The reply reads each affected user's membership back. A user it could not read
  afterwards is marked `unreadable`, which is not the same as holding no teams.

- **`reset_user_password {userId, password, confirm, dryRun}`** — **one-way.**
  Sets any user's password outright, with no current password needed, and takes
  effect at once. It needs `confirm: true` on every real call, separate from
  `dryRun`. Confirm with the person first. With nobody to ask, report
  `needs_confirmation` and stop.

  There is no self-service change-password tool, because that only ever works
  for the caller's own sign-in, which an agent does not have.

### Deleting

- **`delete_user {userId, confirm, dryRun}`** — **one-way.**
- **`delete_team {teamId, confirm, dryRun}`** — **one-way.**

Both take one id. Run `dryRun: true` first; it reads the record, so a wrong id
is refused before anything goes. The real call needs `confirm: true`. Confirm
with the person first, and with nobody to ask, report `needs_confirmation`.

Each reply carries `afterDelete`: `gone` is the proof the record is no longer
there, and `unverified` means the read after the delete failed, so the delete
had already answered and only the proof is missing. Deleting a team does not
delete the people in it.

## Traps that answer 200 and do the wrong thing

Only the ones the tools cannot stop for you.

**A name is not an id, and two people can share one.** `find_users_and_groups`
returns every match for a name, so a write that takes the first one quietly
picks a person. Resolve by email where the person gave an email.

**A user's teams are three different fields.** `staticUserGroups` holds named
membership and is what the membership tool writes and reads back. `userGroups`
and `dynamicUserGroups` also hold teams the rules assigned. A person correctly
removed from a named team can still appear in those, so judging a removal by
them reads a success as a failure.

**A removal and an unreadable person look alike unless you check.** After a
remove, a user with no teams and a user whose record could not be read are
different outcomes. The reply tells them apart with `unreadable`; nothing else
does.

**A password reset cannot be read back.** Nothing can read a password, so the
only evidence is `reset: true` and the message the tenant answers with. Treat
that as the proof and do not look for a record to compare.

**Deleting a disabled user is still deleting.** Setting `state: DISABLED`
through `apply_user_edits` is the reversible way to stop someone signing in.
Reach for `delete_user` only when the person asked for the record to go.

## What no tool does

Say plainly that these are not available, and do not look for another way.

- **How a person signs in.** Single sign-on, identity providers, sessions and
  signing someone out are not here.
- **Personal access tokens or API keys for a person.** A machine caller should
  go through the API Platform instead, which has its own tools.
- **Evaluating a team's criteria.** `apply_team_edits` can set `criteria`, but
  nothing reads back who the rules then put on the team.
- **Writing membership through the user record.** By design: it would race the
  membership tool and whichever wrote last would win.
- **Reading a governance audit trail.** There is no tool for who changed what.

## What has been checked, and what has not

- The five user states, the create-or-edit behaviour of `apply_user_edits`, the
  membership cross-product, `unreadable`, `afterDelete` on both deletes, and the
  password reset answering `reset: true` with the tenant's own message: all
  checked on a real record.
- A deleted user is not readable at all afterwards, so the record goes rather
  than being kept in the `DELETED` state.
- Whether a deleted **team** is removed or kept in some deleted state
  *(unverified)*. Any readable team record counts as still there, so a team that
  disappeared from lists but is still readable by id would be reported as a
  refused delete.
- The reply shape of a team built from `criteria` *(unverified)*.
