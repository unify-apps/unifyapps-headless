---
user-invocable: false
name: governance-roles
description: "Builds and changes what a role grants on a UnifyApps tenant across all four of its permission areas: an app's permission groups, the platform's own record types, which connectors it can use, and which business objects it can touch (Settings > Governance: Roles). Covers why all four live on one stored record, why two of them write the same field keyed two different ways so each must leave the other alone, which grants let a role widen its own access and therefore need confirming, the two mutually exclusive ways to grant on business objects, and how to resolve a legal permission name before granting it. Load it for any ask to create a role, read what a role grants, grant or revoke permissions on one, or work out why someone with a role still cannot see something."
---

## What a role is

A **role** is a named set of permissions. It grants nothing to anybody until it
is given to a person or a team, which is `governance-assignment`'s job.

The screen shows a role as four tabs, and that is the single most useful thing
to know about it: **all four are fields on one stored record.** Reading the role
once gives you all of them; every write reads that record, changes its own
slice, and sends the whole thing back.

| Tab | What it grants | Tool |
|---|---|---|
| Application | an app's permission groups | `apply_role_permission_edits` |
| Platform | the platform's own record types, such as users and roles | `apply_role_platform_permission_edits` |
| Connectors | which connectors the role can use | `apply_role_connector_permission_edits` |
| Entity Types | which business objects the role can touch | `apply_role_entity_type_permission_edits` |

**The Application and Platform tabs write the same field.** Both land in the
role's permission map: the Application tab keyed by an app's permission-group
id, the Platform tab keyed by a record type. Each tool touches only its own keys
and carries the other's through untouched. This is why there is no single
"set the role's permissions" tool, and why granting through anything other than
these tools would wipe the half it did not know about.

This skill owns the four tabs and everything about what a role grants. Users and
teams belong to `governance-people`. Giving a role to someone belongs to
`governance-assignment`.

## The application-builder MCP server

Every tool here is an MCP tool on the `application-builder` server, bridged to
the signed-in tenant. Call them like any other MCP tool. There is no CLI.
**Every call takes `host`.** It is the signed-in tenant's `https://` origin, with
no path. A call without it goes nowhere.

## Granting a permission on a role, in order

The order matters because every name in a grant has to be a name the tenant
offers. Sending one it does not know is refused, and guessing wastes the call.

1. **Find the role.** `get_role_options {search}` gives every role's id and
   name. The reply says `truncated` when there are more than it returned.
2. **Read what it grants now.** `get_role_details {roleId}` returns all four
   areas on the one record. Without this you cannot tell a grant you added from
   one that was already there.
3. **Resolve the legal names for the area you are changing.** Each area has its
   own reader, below. Permission names are not free text.
4. **Plan the write.** Every one of the four tools takes `dryRun: true` and
   shows the result it would store.
5. **Write it**, then read the reply's stored values rather than assuming the
   request landed as sent.

## The tools

### Reading

- **`get_role_options {search}`** — every role's id and name, with `truncated`
  when the list was cut short. Start here when you have a name and need an id.
- **`get_role_details {roleId}`** — the whole stored role: the permission map
  for both the Application and Platform tabs, the connector settings, and the
  business-object settings. Read it before any write.
- **`get_platform_permission_options {strategy, search}`** — every platform
  record type a role can be granted on, and the legal permission names for each.
  Pass `strategy: 'application'` for the narrower set a role's per-app tab
  offers; leave it out for the whole tenant-wide set.
- **`get_connector_permission_options {search, appNames, limit, offset}`** —
  the connectors this tenant has, for turning a connector's name into the id a
  grant needs. Passing `appNames` also returns each of those connectors' usable
  triggers and actions.

  **Pass `search` on a tenant with many connectors.** The unscoped list can fail
  outright rather than being slow, and asking for a smaller page does not help.
  `appNames` on its own reads no list at all and returns only the triggers and
  actions, so asking about connectors whose ids you already hold is always safe.
- **`get_entity_type_permission_options {search, limit, offset}`** — the one
  shared set of permission names every business object takes, and this tenant's
  business objects, for naming one in a grant.

### Writing

- **`apply_role_edits {roleId, name, description, appId, dryRun}`** — creates a
  role with no `roleId`, edits one with it. **Name and description only.** A role
  created here grants nothing until one of the four tools below runs. Pass
  `appId` to scope the role to a single app. The reply holds the stored role and
  `readBack`.

- **`apply_role_permission_edits {roleId, appId, grant, revokeGroups, dryRun}`**
  — the Application tab. `grant` names this app's permission groups and the
  permissions on each; `revokeGroups` drops named groups outright. It touches
  only the groups belonging to `appId`, so another app's groups and the Platform
  tab's keys survive. Give at least one of `grant` or `revokeGroups`.

- **`apply_role_platform_permission_edits {roleId, grant, revokeEntityTypes, confirm, dryRun}`**
  — the Platform tab. `grant` replaces the whole permission list for each record
  type it names; a record type it does not name is left alone.
  `revokeEntityTypes` drops named types.

  **Granting on users, teams or roles needs `confirm: true`.** Those three let
  the role manage governance itself, which means a person holding the role could
  widen their own access. The tool refuses without it even when everything else
  about the call is valid. Confirm with the person first; with nobody to ask,
  report `needs_confirmation`.

- **`apply_role_connector_permission_edits {roleId, connectorsEnablement, setApps, removeApps, dryRun}`**
  — the Connectors tab. `connectorsEnablement` decides the whole shape: `ALL`
  grants every connector and the per-connector list is ignored, `SPECIFIED`
  makes the named ones the only ones granted, and `EXCEPT_SPECIFIED` grants
  everything but the named ones.

  `setApps` adds or updates by connector id and **replaces** that connector's
  triggers, actions and connection permissions rather than merging them.
  `removeApps` drops named connectors. Give at least one of the three inputs.

- **`apply_role_entity_type_permission_edits {roleId, mode, allPermissions, setEntityTypes, removeEntityTypes, dryRun}`**
  — the Entity Types tab. **The two modes are mutually exclusive**, so pick one
  per call:

  - `mode: 'all'` applies one shared permission set to every business object.
    Leaving `allPermissions` empty keeps the role unrestricted; giving a list
    restricts every object to those permissions.
  - `mode: 'specified'` grants per object. `setEntityTypes` names each object
    and its permissions; `removeEntityTypes` drops named ones.

### Deleting

- **`delete_role {roleId, confirm, dryRun}`** — **one-way.** Takes one id. Run
  `dryRun: true` first, which reads the role, so a wrong id is refused before
  anything goes; the real call needs `confirm: true`. Confirm with the person
  first, and with nobody to ask, report `needs_confirmation`. The reply carries
  `afterDelete`: `gone` is the proof, `unverified` means only the read after the
  delete failed.

  Deleting a role does not tell you who held it. Read that first through
  `governance-assignment`, or the people who had it lose the access with no
  record of what they lost.

## Traps that answer 200 and do the wrong thing

Only the ones the tools cannot stop for you.

**A grant replaces a list, it does not add to it.** On the Platform tab, naming
a record type sets its whole permission list. On the Connectors tab, naming a
connector sets its whole set of triggers and actions. So a call meaning "also
allow editing" that names only `EDIT` takes away whatever else was there. Read
the role first and send the full list you want to end up with.

**A new role grants nothing.** `apply_role_edits` writes a name and a
description. A role that looks created but denies everything is usually a role
nobody granted anything on yet.

**The two entity-type modes overwrite each other.** A call with `mode: 'all'`
clears the per-object grants, and `mode: 'specified'` leaves the shared mode
behind. Decide which shape the role should end in before calling, not after.

**Permission names are not free text.** Each area's reader returns the legal
names; a name outside them is refused. Connector trigger and action names are
the exception and are not checked against anything, so a wrong one is accepted
and quietly grants nothing — resolve them with `get_connector_permission_options`
and `appNames` first.

**A role can be scoped to one app.** A role created with `appId` is not a
tenant-wide role. Someone wondering why a role does nothing outside one app is
usually looking at that.

## What no tool does

Say plainly that these are not available, and do not look for another way.

- **Listing the tenant's apps.** No tool here does it, and
  `apply_role_permission_edits` needs an app id, so get it from whatever named
  the app in the first place.
- **Reading who holds a role.** That is role assignment, in
  `governance-assignment`.
- **Copying one role's permissions onto another.** Read the first, then send the
  values through each of the four tools.
- **Telling you whether a role is in use.** Nothing reports that before a
  delete.
- **A governance audit trail.** There is no tool for who changed a role and when.

## What has been checked, and what has not

- All four tabs living on one record, the Application and Platform tabs sharing
  one permission map, the `confirm` refusal on the three governance record
  types, both entity-type modes, and connector enablement moving between its
  values and back: all checked on a real record, with the stored role read back
  after each write.
- `apply_role_edits` creating a role that holds no permissions at all: checked.
- A connector grant naming a trigger or action that does not exist *(unverified)*
  — the behaviour described above comes from the tool not checking those names,
  not from a record that was seen.
- `apply_role_permission_edits` end to end *(unverified)*: it needs an app id,
  and the checks run so far could not read one.
- Whether a deleted role is removed or kept in a deleted state *(unverified)*.
