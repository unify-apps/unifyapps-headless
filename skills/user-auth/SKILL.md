---
user-invocable: false
name: user-auth
description: Load for private or public app callers, user authentication, role and resource authorization, multi-user workflows, or access policies in user customProperties.
---

## Authentication

Public and private apps can call automations. A private app's session-backed entry
point authenticates the user before invoking a workflow. Verify that the actual
entry point validates the session and preserves that caller. A callable workflow
can also run through other entry points, schedules or system contexts; being used
by a private app does not secure every invocation.

Use `RUN.userId` and `USER` from runtime context, never a trigger-supplied user ID,
persona or permission list, to identify the execution principal. Reject absent,
empty or anonymous identities for protected actions. A user lookup proves a record
exists; neither it nor `RUN.isAnonymousUser == false` proves a signed-in human.
Resolve guest classification from the actual user schema. Follow the user's policy
for anonymous access, such as a limited public response or an authentication error.

## Authorization

Platform RBAC grants asset permissions through roles assigned directly or through
teams. Check the permission required by the requested action under the intended
caller. Team membership and authentication alone do not grant every asset action.
A business policy may further restrict platform access; it must not bypass RBAC.

### Implicit asset control

Rely on an operation's access enforcement only after verifying its execution
principal and permission behavior. Storage can skip checks through object metadata
or non-UI request configuration. System contexts and connection credentials can
have broader access than the app user. An omitted user override does not prove
that every connector enforces that user's row permissions.

Preserve caller context and normal permission checks. Do not impersonate a more
privileged user to make a denied operation succeed. Handle denied, absent and
failed reads before returning data. For external databases, enforce tenant and
caller/ACL restrictions in the server-side data operation.

`standard_entities_check_entity_permissions` checks the current principal on a
platform asset. Its permissions list means any-of, and an empty list succeeds.
Check each required permission separately when the policy needs all of them.
This check does not reproduce every Storage record permission model.

### User customProperties

Inspect the live user schema before using `USER.customProperties`. These fields can
store personas, resource ID allowlists or references to authorization records.
Ask the user to define the policy before assigning meaning to those values.
For example, AUDITOR might read, WORKER might read and edit, and ADMIN might have
broader business access. These names carry no platform permissions by themselves.

Only trust access fields and policy references whose write access is restricted
to authorized policy administrators. Client-editable custom properties cannot
establish grants. Unknown personas, missing grants and failed policy lookups deny
protected actions. Business allowlists narrow access and retain platform checks.

For a referenced authorization table, inspect its schema and data, then bind each
grant to the current caller, requested resource and action. A reference to an
existing record alone is insufficient. Do not treat a business creator field as
system ownership or assume that ownership grants edit or delete permission.

## Examples

Use `find_workflow_examples` with the matching keywords below before authoring a user
access flow; it returns the example named in bold. These are
compiler-checked construction patterns. Resolve every placeholder object, team, automation and dynamic field
from the current environment before execution. For protected flows, verify session-backed
ingress, caller propagation and enabled Storage permission enforcement first. They do not
create roles or sharing grants.

- **Private app caller** (`private-app-caller`) uses `RUN.userId`
  to fetch a user and rejects anonymous, absent and failed lookups. Its prerequisite is a
  private app entry point that validates the session and preserves the caller. The lookup
  proves the record exists; it does not authenticate a public, scheduled or system invocation.
- **Public app visitors** (`public-app-anonymous-policy`) applies an
  explicit limited-access policy. `RUN.isAnonymousUser == false` alone does not prove a
  signed-in human. Resolve any additional guest classification from the actual user schema
  and the app's policy rather than inventing a field or enum.
- **Implicit record access** (`implicit-record-read`) reads through
  Storage in the caller context and handles denied, missing and failed reads before projecting
  data. A generic entity permission check does not reproduce every storage owner or permission-model rule.
- **Multiple required permissions** (`platform-permissions-all-of`)
  checks VIEW and EDIT separately. Permission lists mean any-of; an empty list succeeds.
- **Persona edit policy** (`persona-controlled-update`) applies a
  declared WORKER/ADMIN policy and then uses normal storage EDIT enforcement. AUDITOR and
  unknown personas deny. Persona names carry no permissions until the user defines the policy.
- **Resource ID allowlist** (`resource-id-allowlist`) uses a verified
  `customProperties` list as a business restriction, followed by the authorized storage read.
- **Authorization record reference** (`authorization-record-reference`)
  reads the policy record referenced by the current user and binds its grant to the caller,
  resource and action. Inspect the table schema first. Client-editable policy references or
  access fields cannot be trusted as grants.
- **Create with user association** (`create-associated-record`)
  derives a business creator field from `USER.id`. A custom record property is distinct from
  system `ownerUserId`, and ownership alone does not establish edit/delete permission.
- **Team gate and child call** (`team-gated-child-call`) checks an
  explicit team policy and preserves the caller into a synchronous child. The child still
  enforces record access. Passing an actor ID as input does not change its execution principal.

Before calling an example production-ready, run it from the actual app as two ordinary users.
Verify allowed access, cross-user denial, anonymous behavior, spoofed trigger identity and
failed permission evaluation. For external databases, enforce tenant and caller/ACL conditions
in the server-side data operation; platform asset checks do not automatically protect those rows.
