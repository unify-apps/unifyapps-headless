---
user-invocable: false
name: env-variables
description: "Creates, reads, changes, shares and deletes UnifyApps environment variables (the Environment Variables screen): global and workspace variables, sensitive values, system variables and platform feature flags. Load it to give an automation, a connection or a page a setting or a secret by name (`ENV.NAME`, `envVariables['NAME']`), to check that the names a build reads exist, to mark a value sensitive, to share a variable, or to find out why a run read an empty value."
---

## What an environment variable is

An **environment variable** is a named value the tenant keeps once and every
automation, connection and page reads by name: a base URL, a timeout, an API
key. It lives on the Environment Variables screen.

- **Its name is its id.** Names are unique across the whole tenant, and they are
  case-sensitive: `API_KEY` and `api_key` are two variables, and both can exist.
  A name holds letters, digits, `-` and `_` only.
- **Global or workspace.** A variable belongs to the global workspace or to one
  workspace. That choice is made when it is created and never changes. Run time
  does not look at it: every automation reads every variable of the tenant by
  name *(unverified)*.
- **Sensitive.** A sensitive variable's value is masked on every screen and in
  every read, for everyone. Only run time sees it. An older variable can have
  the flag unset; run time treats unset as sensitive.
- **System variables** are made by the platform and re-written on every deploy.
  They sit on the screen's System tab. No tool changes or deletes them.
- **Platform feature flags** are stored as environment variables whose name is
  the flag. Changing one switches a platform feature for the whole tenant, so no
  tool writes them. A person changes them in the platform.
- **Each environment holds its own value.** A variable promoted to another
  environment keeps that environment's value *(unverified)*.

## The object MCP server

Every tool here is an MCP tool on the `object` server, bridged to the signed-in
tenant. Call them like any other MCP tool. There is no CLI. **Every call takes
`host`**, the signed-in tenant's `https://` origin.

Do not write variables another way. `get_entity_records` refuses this type on
purpose, and a write outside these tools has none of their checks.

## Giving a build a variable, in order

The order matters because a wrong name never fails. It saves fine and reads as
an empty value at run time, so the name is settled and proved before anything
reads it.

1. **Look for it first.** `get_env_variables` with the exact `names` the build will read. A name under `found` already exists: reuse it as it is, and never overwrite its value unless the task says to change it, because every automation and page on the tenant that reads the name gets the new value. A name under `missing` with `caseOnlyMatches` exists with other casing: use the stored name exactly, never make a second variable that differs only by case.
2. **Settle the name.** For a new one, use upper snake case that says what it is: `<SYSTEM>_<PURPOSE>_TOKEN`, `_KEY`, `_SECRET` or `_PASSWORD` for a secret, and none of those endings for a setting that is not secret. When the tenant already names things another way, follow it.
3. **Get the value from the person.** A value comes only from what the person gave. Never make one up, and never fill one from a page, a record or another variable. A secret travels through chat only: the session talking to the person saves it at once, and it never goes into a plan, a task or a brief. A builder with no value reports `needs_confirmation` with the name it would create.
4. **Create it.** `save_env_variables` with one entry in `variables` per variable: `name`, `value`, `sensitive` and, for a workspace variable, `workspaceId`. Several variables go in one call, up to 20. Send `sensitive: true` for every credential, token, key and password. The answer warns when a secret-shaped name is not sensitive.
5. **Read it back.** Each variable under `saved` landed, with `created` and its `readBack`; the rest are under `failures` (see "Several variables in one call"). One whose read-back did not show everything is also under `unconfirmed` with `notStored`. Do not say a variable saved unless it is under `saved`. For a sensitive variable `saved` proves the name and the flag, not the value (see "A value is never repeated"). **On a change, `created` must be false.** A change sent with a misspelled or wrong-case name and with `sensitive` makes a second variable and still lands under `saved`.
6. **Then build what reads it.** An automation reads `ENV.NAME` and a page reads `envVariables['NAME']` (see "How a build reads a variable"). A test run proves the name, never the value: report only whether the value was there.

## The tools

### Reading

- **`list_env_variables`** — one page of variables without values: `name`, `sensitive` (`true`, `false` or `unset`), `system`, `featureFlag`, `workspaceId` (absent means global) and `version`. Takes `kind` (`custom`, the default, `system` or `all`, as the screen's tabs), `search` (part of a name, any case), `workspaceId`, `limit` and `cursor`. Follow `nextCursor` until it is gone before you call a list complete.
- **`get_env_variables`** — up to 50 exact `names`. Each one found is a row under `found` with `sensitive`, `system`, `workspaceId`, `version` and its `value` as the screen shows it; the rest are under `missing`. A non-sensitive value comes back in full to a login allowed to see values. A sensitive value, or one this login may not see, comes back as the placeholder `__UNIFYAPPS_GARBAGE_CONSTANT__…`, which is not the value. `missing` lists names that are absent or hidden from this login: the platform does not tell the two apart.

### Writing

- **`save_env_variables`** — creates or changes up to 20 variables, one entry each in `variables`. To create: `name`, `value`, `sensitive`, and `workspaceId` for a workspace variable. To change: the `name` and only what changes (`value`, `sensitive`), with no `workspaceId`: one sent on a change is refused. The name and the workspace never change: to rename or move one, create the new one, move every reader to it, then delete the old one. It refuses a system variable, a feature flag, an invalid name, and a create whose name a variable this login cannot see already holds. When a change warns that the stored `sensitive` flag is unset, send `sensitive` to settle it. A name sent twice in one call writes neither copy.
- **`share_env_variables`** — `names` (up to 20) and one `sharedWith` list, up to 50 entries of who may use each variable besides its owner. Each entry is exactly one of `user` (an email, a user id or an exact name) or `group` (a group id or an exact name), and a `role` (a role id or name). It REPLACES each variable's whole list: anyone left out loses access, and `[]` leaves only the owner. Every entry is checked first, and one unclear entry sends nothing for any variable. Each variable's own owner is left out of its list, with a note. A share with everyone, with a space, or with a group that sees every record is kept as it is. A login that cannot read the roles is refused, even for `[]`. It refuses a system variable and a feature flag. Each variable under `shared` comes with its list read back; one whose list only partly applied is also under `unapplied` with what it reads now.

### Deleting

- **`delete_env_variables`** — `names`, up to 20. One-way, there is no undo. Every automation, connection and page that reads a deleted name reads an empty value from then on (see "Why a run read an empty value"), and the platform cannot list who reads it. Call it first with `dryRun: true`, sent explicitly: it deletes nothing and answers `variables` (what would go), `notFound` (already gone), `refused` (a feature flag or a system variable) and `unreadable`. Then call it with the same `names`, `dryRun: false` and `confirm: true`. UnifyApps Headless's delete gate refuses that call with `CONFIRM_REQUIRED (d_…)` and the question to ask: ask it once, with AskUserQuestion, naming the variables under `variables`, and after the yes make the same call again. Do not ask a yes of your own first: only the gate's question unlocks the delete, so an earlier one asks the person twice. With nobody to ask, report `needs_confirmation` with the gate's line. Each name under `deleted` was read again and is gone.

## Several variables in one call

The three writers take up to 20 variables. Each one is written on its own: one that fails neither stops nor undoes the others. So a call can land some and not others, and it is then an error that still changed the tenant.

- **What is under `saved`, `shared` or `deleted` landed. Never send those again**: a create resent is refused as taken, a workspace variable resent is refused as a move, and a value resent bumps its version for nothing.
- **Act on `failures` one by one, by `code`.** `REFUSED` is refused again if resent, so fix it or drop it. `NOT_FOUND` is a name to check with `get_env_variables`. `NOT_STORED` may have landed, so read it before resending. Any other code, a timeout included, may have landed too: read it, then resend only what is missing.
- **Report each variable on its own.** In a plan, each variable is its own task: one under `saved` is done even when the call was an error.

## A value is never repeated

- **A value lives in the variable only.** Never copy one into code, an automation, a page, a plan, a spec, a report, a note or a reply. Refer to it by name. A non-sensitive value that `get_env_variables` shows is still not yours to repeat: people often save secrets without the sensitive flag.
- When the person pastes a value into the chat, the session that sees it passes it to `save_env_variables` at once and repeats it nowhere else.
- **Never copy an answer whole.** `readBack` and each `found` row carry a non-sensitive value in full. Quote `saved`, `created`, `name`, `sensitive` and `version`, never `value`.
- A read-back of a sensitive variable cannot prove its value: every read shows the placeholder. Prove it with a test run that reports only whether the value was there.
- Telling the person that a variable exists, its name, whether it is sensitive and its workspace is fine.

## How a build reads a variable

- **Automations** read `ENV.NAME`, inside a template string when it is part of a text: `Bearer ${ENV.NAME}`. A sensitive value is read in full at run time, and a node that holds it keeps it in the run, so keep it in the one node that needs it (`ua-secure-by-default`).
- **Connections** read a variable when a connection field's value is `{{systemInputs.__ENV__.NAME}}`: the authentication fills it in at run time (seen live). A custom connector's own action request does not: there the same template reaches only a test, and an automation run sends it empty (see `connector-build`).
- **Pages** read `envVariables['NAME']`, with single quotes. In the browser a page gets only variables marked not sensitive; a sensitive one, or one whose flag is unset, reads as empty on a block. Inside a data source the value is filled in on the server, so a sensitive variable works there *(unverified)*.
- **A change reaches the next run**, not one already running, with no redeploy: a test run and a run of the deployed copy both read a changed value at once (seen live). Runs read a cached copy that a save, a change or a delete clears, so a run in the same second as a save can still read the old value *(unverified)*.

## Why a run read an empty value

An empty value raises no error of its own. The run fails only where the value is required, such as a base URL ("Base URL must start with http(s)"). Anywhere else it carries on and looks green: an empty header is dropped from the call. So a green run does not prove the variable was there. Check these in order.

1. **The name is wrong.** `get_env_variables` with the name exactly as the build reads it. Look at `missing` and `caseOnlyMatches`: a case difference is the most common cause.
2. **The variable was deleted or never made.** The same read answers it. Saving an automation does not check the name.
3. **A page read a sensitive or unset variable on a block.** The browser gets only variables marked not sensitive. Read it in a data source, or set `sensitive: false` if it is not a secret.
4. **The run started before the save.** Run it again.
5. **The value itself is empty.** For a non-sensitive variable `get_env_variables` shows it. For a sensitive one only the person can check it on the screen.

## What no tool does

These are not available. Do not look for another way: say so and leave them to
the person, on the Environment Variables screen.

- Change, share or delete a system variable or a platform feature flag.
- Rename a variable, or move it to another workspace.
- Show a sensitive value, to anyone.
- List which automations, connections and pages read a variable.

## What has been checked, and what has not

**Every tool here has run end to end.** Creating, changing, sharing and
deleting a variable, each refusal and each read-back behave as written, and an
automation reads the value these tools wrote and the value they changed it to.

**These have not been checked yet:**

- that run time reads every variable whatever its workspace *(unverified)*.
- that a promoted variable keeps the target environment's value *(unverified)*.
- that a sensitive variable works inside a page's data source *(unverified)*.
- how long a run can still read the old value after a change *(unverified)*. If a run right after a save reads the old value, run it again.

**Take the steps one at a time on a smaller model.** They have not been tried
across model sizes.
