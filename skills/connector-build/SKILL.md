---
user-invocable: false
name: connector-build
description: "Builds and publishes a UnifyApps custom connector with the connector SDK (the Connectors screen, Custom tab): finds or makes the connector, adds actions by hand or by OpenAPI import, adds webhook triggers, switches them on, tests an action against the real API, and publishes it so automations can use it. Covers what a {{ }} template may hold, why nothing reaches automations before a publish, how every save answers, what a test cannot show, what each delete leaves behind, and why names are not keys. Load it for any ask to make, change, test, publish or delete a custom connector, an action or a trigger, to import an OpenAPI spec, or when the person names the Connectors SDK screens. Authentication, OAuth and connections are in connector-auth."
---

## Contents

- What a custom connector is
- The connectors-sdk MCP server
- Building a custom connector and publishing it, in order
- The tools: reading, writing, deleting, testing
- Traps that answer 200 and do the wrong thing
- What no tool does
- What has been checked, and what has not

## What a custom connector is

A **custom connector** is an app the tenant defines for an outside HTTP API, so
automations can call it. The Connectors screen lists them on its Custom tab,
with the status Active (published) or Inactive.

A connector holds:

- **details**: name, description, logo, base URL and categories;
- **settings**: where it is offered (Workflows, Data Pipelines, Data Catalog);
- **authentications**: how a connection signs in, at most one of each type;
- **actions**: one HTTP call each. Its Inputs tab holds what an automation fills in. Its HTTP Request tab holds the method, URL, headers, query parameters and body. Its Outputs tab holds the response body, the response headers and the response path;
- **triggers**: each starts an automation when the other app sends an event to a webhook URL.

**Published** is one switch on the connector. A publish copies what is saved
into what automations run. There is no unpublish, and nothing marks edits made
since the last publish.

**Enabled** is the Deploy / Pause switch of one action or trigger. A publish
puts only enabled ones in front of automations.

**A standard connector** holds custom actions on one of the platform's own apps.
Reads mark it `managedBy: platform`. Every write tool refuses it.

This skill owns the walkthrough below, the template rule, drafts and publishing,
how every save and every delete answers, tests, and why names are not keys.
`connector-auth` owns authentications, secrets, connection requests,
connections, and the rule that credentials belong in the authentication.

## The connectors-sdk MCP server

Every tool here is an MCP tool on the `connectors-sdk` server, bridged to the
signed-in tenant. Call them like any other MCP tool. There is no CLI.
**Every call takes `host`.** It is the signed-in tenant's `https://` origin, with
no path. A call without it goes nowhere.

Do not reach for the platform another way — a connector write outside these
tools has none of the guards they carry.

## Building a custom connector and publishing it, in order

Each part names an earlier one by id. An action can read a value its
authentication defines. A `webhook_auto` trigger names two actions. A publish
puts only enabled actions and triggers in front of automations. **Nothing
reaches an automation until `publish_connector` runs**, so the publish comes
last, once, when everything else is saved and tested.

1. **Find whether it exists.** `list_custom_connectors` with `search`. Names repeat, and may differ only by case or a stray space, so match by `connectorId`, never by name. When several rows fit, show them and ask which one; with nobody to ask, report `needs_confirmation`. Read the one you pick with `get_connector`: it lists its authentications, actions and triggers.
2. **Make or change the connector.** `save_connector` with `name` and no `connectorId` makes one. Add `baseUrl` when the actions will use paths. Keep the `connectorId` from `readBack` and send it on every later call: a second call without it makes a second connector.
3. **Give it its authentication.** `save_connector_authentication`: see `connector-auth`. Do it before the actions, because the authentication adds its headers to every action, and an action may read a value it defines.
4. **Add the actions.** Either write them with `save_connector_action` with `actions`, 1 to 10 per call. A new action needs a `name`. Give it a `request` with a `url`, and `outputs.body`: one without them is stored but flagged. Or import them: `import_connector_actions` with `spec` alone lists the spec's operations and imports nothing; call again with `operations` to import the ones the person wants. Read the imported actions back with `get_connector_action` and check each URL (see the traps). **Every action gets a `description`**, written or imported: one or two sentences on what it does and what it answers, such as "Gets one customer by its id and answers their name, email and status." The tool does not require one, but automation authors and agents choose an action by its name and description (`search_operations`, `list_app_actions`), and a bare name like `getCustomer2` leaves them guessing. An import keeps only what the spec says, so give each imported action that came back without one a `description` with `save_connector_action` (`actionId` and `description`), and keep a spec's description that is clear. Every field is in [references/save-fields.md](references/save-fields.md).
5. **Add webhook triggers, if the other app sends events.** `save_connector_trigger` with `triggers`. Each new trigger needs a `name`, a `kind` and `outputs.body`. A `webhook_auto` trigger names a registration action and a removal action of the same connector, so make those actions first, in step 4. The tools make no polling trigger.
6. **Switch on what should go live.** New and imported actions and triggers start paused. `set_connector_resource_enabled` with `actionIds`, `triggerIds` and `enabled: true` switches them on.
7. **Test each action.** `test_connector_action` with `actionId` and `actionInputs`. It runs the saved request once against the real API, with no publish. It sends no authentication, and a test of a request that writes changes real data. Read "Testing" below before the first one.
8. **Publish.** `publish_connector`. It is a release, like a deploy. Tell the person what changes: which actions and triggers reach automations, and which paused ones leave them. Wait for a clear yes; with nobody to ask, report `needs_confirmation`.
9. **Check it reached automations.** In the publish answer, `published` and `inAutomations` are true, and every action and trigger the person needs has `deployed: true`. Each row in `notDeployed` gives its reason, such as an action with no HTTP request saved. Fix it, then publish again. Once it is published, the person makes a connection (see `connector-auth`), and automations offer the connector as an app. Only a run of an automation with that connection shows that an action works signed in; no tool here does it.

## The tools: reading, writing, deleting, testing

Every call takes `host` as well as the inputs named below.

### Reading

- **`list_custom_connectors`** — the Custom tab, newest first. Takes `search` (text the name contains, in any case), `limit` (1 to 100, 30 by default) and `cursor`. Each row has `connectorId`, `name`, `description`, `published`, and when it was made and last changed. `total` comes on the first page only. Send the answered `cursor` with the same `search` for the next page. Standard connectors are not listed.
- **`get_connector`** — one connector in full. Takes `connectorId`. It answers the details, `published`, `managedBy`, the three `modules` switches, each authentication with its `connectionFields`, each action (`actionId`, `name`, `enabled`) and each trigger (`triggerId`, `name`, `kind`, `enabled`).
- **`get_connector_action`** — actions in full, as their three tabs hold them. Takes `connectorId` and `actionIds` (1 to 10). `request` is null when no HTTP request is saved.
- **`get_connector_trigger`** — triggers in full. Takes `connectorId` and `triggerIds` (1 to 10).

`get_connector_authentication` belongs to `connector-auth`.

### Writing

**Every save works the same way**, `save_connector_authentication` too. `connector-auth` points here.

- The tool reads what is stored, lays the fields you send over it, saves the whole record, and reads it back. A field you leave out keeps its stored value.
- A list or map you send replaces the stored one: `categories`, and an action's `headers` and `queryParams`.
- Report what `readBack` holds, not what you sent. A field named in `notStored` was sent and did not stick.
- A save changes the draft only. Its `note` says so. Nothing reaches automations until `publish_connector`.
- Pass every line of `warnings` on to the person.

**`save_connector` and `save_connector_settings` save one record
each.** They answer `saved`, `readBack`, `notStored`, `warnings`
and `note`. `saved` is false when the platform flagged the record (then
`violations` lists why; it is stored anyway, so fix it and save again) or did
not keep a field you sent (`notStored`).

**The list writes answer per item.** `save_connector_action`,
`save_connector_trigger`, `save_connector_authentication`,
`set_connector_resource_enabled` and `import_connector_actions` do each item on
its own. What landed is under
`stored`, `switched` or `imported`. Each item that did not land as sent is in
`failures`, with `index`, `id`, `error` and `code`. One failure makes the whole
call an error, but the other items still landed. Send only the failures again:

| `code` | Is it stored? | What to do |
|---|---|---|
| `REFUSED` | no | fix what `error` names, then send only that item again |
| `PLATFORM_ERROR` | no | send only that item again |
| `SAVED_WITH_VIOLATIONS` | yes, but flagged | change it by its id; never make it again |
| `NOT_STORED` | yes, but the change did not stick | send it again by its id; never make it again |

The writes:

- **`save_connector`** — make a connector (no `connectorId`; `name` is needed) or change one. Takes `name`, `description`, `logo`, `baseUrl` and `categories`. A name another connector has is saved and named in `warnings`. A new `baseUrl` on a published connector is named in `warnings` too: it reaches automations at the next publish.
- **`save_connector_settings`** — where the connector is offered. Takes `modules`, with the switches `automation` (on by default), `dataPipelines` and `catalog`. They take effect at the next publish.
- **`save_connector_action`** — make or change actions. Takes `actions`, 1 to 10 items, each with `actionId` (to change), `name`, `description` (always send one; see step 4), `inputs`, `request`, `outputs` and `responsePath`. It refuses an item with a name another action of the connector has, a body on a `GET` or `DELETE`, a template that is not a plain reference, or an action of another connector. A credential typed into the request's headers, query parameters or JSON body, under a name that says credential, is saved and named in `warnings`. Credentials belong in the authentication: see `connector-auth`.
- **`save_connector_trigger`** — make or change webhook triggers. Takes `triggers`, 1 to 10 items, each with `triggerId` (to change), `name`, `kind` (`webhook_manual` or `webhook_auto`), `description`, `inputs`, `outputs`, and for `webhook_auto` `registration` and `removal`. It refuses a polling trigger.
- **`import_connector_actions`** — actions from an OpenAPI spec. Takes `spec` (JSON or YAML text) and `operations`. Without `operations` it imports nothing and lists each operation with the action name it would get. With them, it imports each one listed, as an operationId or as `METHOD /path`. It refuses an operation that would repeat an action name. Imported actions start paused.
- **`set_connector_resource_enabled`** — the Deploy / Pause switch. Takes `actionIds`, `triggerIds` (either or both) and `enabled`. Each row of `switched` says whether this call `changed` it. It warns when an enabled one has no HTTP request.
- **`publish_connector`** — **one-way: it reaches automations at once and cannot be undone; confirm first; with nobody to ask, report `needs_confirmation`.** Takes `connectorId`. It answers `published`, `complete`, `inAutomations`, every enabled action and trigger with `deployed`, `notDeployed` with a reason each, and `publishError` when the platform failed part-way. `complete: false` means something did not reach automations: read `notDeployed` and `publishError`. A note says the platform published nothing because the connector changed since it was read: call it again.

### What a template may hold

A `{{ }}` template names a value the request reads when it runs. Templates may
sit in an action's `url`, `headers` (names and values), `queryParams` and
`body`, in a webhook trigger's `params`, and in an authentication's settings. They may sit inside longer text,
such as `Bearer {{input.auth.credentials.access_token}}`, and may have spaces
inside the braces.

**The platform runs every template as code on the server.** So the tools take
only a plain reference, and refuse anything else with the field's path:

- `{{rawPayload.<input>}}`: an input of the action or trigger;
- `{{input.auth.<field>}}`: a value the person typed into the connection;
- `{{input.auth.credentials.<field>}}`: a value the authentication fetched, such as an access token;
- `{{systemInputs.__ENV__.<name>}}`: an environment variable; other `{{systemInputs.<field>}}` values too. In an action's own request it is filled in only by `test_connector_action`: an automation run sends it empty and drops it (seen live). To give every call a variable, put the template in a connection field's value instead, such as an `api_key` of `{{systemInputs.__ENV__.API_KEY}}`; the authentication reads that field at run time.

A reference may go deeper with dots, index into a list with `[0]`, and have
`-` in a name. Refused: a method call, an operator, a condition, a bare
`{{orderId}}`, and `{{input.<field>}}` without `auth`. Do that work in the
automation that calls the connector, not in the request.

The refusal names each field that holds a refused template, such as
`request.url` or `request.headers (key)`, never the template itself, so read
that field in what you sent to find it.

An action made on the screen may already hold a template the tools refuse. A read shows
it as written. It stays until you send that field again.

### Deleting

**Every delete works the same way.** `connector-auth` points here.

1. Call it with the id. `dryRun` is `true` unless you set it to `false`, so this first call deletes nothing. It lists what goes, the automations and connections that use it, and one number, `usedByCount`. **An empty list is not proof that nothing uses it.** The lists come from the platform's dependency index, which often holds nothing for a custom connector: one that connections and automations use can answer 0. List its connections with `list_connections` and the connector id in `appNames`, and say plainly that the automations could not be counted.
2. Call it again with `dryRun: false` and that `usedByCount`. UnifyApps Headless's delete gate refuses this call with `CONFIRM_REQUIRED (d_…)` and the question to ask. Ask it once, with AskUserQuestion, and put what step 1 found in the options' descriptions; after the yes, make the same call again. Do not ask a yes of your own before it: the gate's question is the only one that unlocks the delete, so an earlier one asks the person twice. With nobody to ask, report `needs_confirmation` with the gate's line and what step 1 found.
3. A different `usedByCount` deletes nothing: something started or stopped using it since, so dry run again.
4. The delete is permanent. No tool and no screen brings it back.

**A delete reaches automations at once, with no publish.** It is the one change
that does. The connections and automations the dry run lists are not deleted
and not changed: each fails at the step that used what went, until a person
changes it.

| Tool | Also removes | Leaves behind |
|---|---|---|
| `delete_connector` | its authentications, actions, triggers and their HTTP requests | the connections made with it, the automations that use it, its settings |
| `delete_connector_action` | its HTTP request | the automations with a step that runs it, the `webhook_auto` triggers that register through it |
| `delete_connector_trigger` | its HTTP request | the automations it starts |

- **`delete_connector`** — **one-way; confirm first; with nobody to ask, report `needs_confirmation`.** Takes `connectorId`, `dryRun` and `usedByCount`. The dry run lists `connectionsUsingIt` and `automationsUsingIt`.
- **`delete_connector_action`** — **one-way; confirm first; with nobody to ask, report `needs_confirmation`.** Takes `connectorId`, `actionIds` (1 to 10), `dryRun` and `usedByCount`. The dry run lists, under `actions`, each action's `automationsUsingIt` and `triggersRegisteredThroughIt`.
- **`delete_connector_trigger`** — **one-way; confirm first; with nobody to ask, report `needs_confirmation`.** Takes `connectorId`, `triggerIds` (1 to 10), `dryRun` and `usedByCount`. The dry run lists, under `triggers`, each trigger's `automationsUsingIt`.

The action and trigger deletes take lists. One dry run covers the whole list:
`usedByCount` is the total, and an id that cannot go is under `notFound`. Send
the same ids back with that total. Each is then deleted on its own: `deleted`
lists what went, and `failures` the rest, with a `code`, as the list writes do.

`delete_connector_authentication` belongs to `connector-auth`.

**Changing is not deleting.** To change an action, save it with its `actionId`.
A deleted and remade action gets a new id, and every automation step that ran
the old one breaks.

### Testing

- **`test_connector_action`** — **one-way when the request is not `GET` or `HEAD`: it changes data in the other app; confirm first; with nobody to ask, report `needs_confirmation`.** Takes `connectorId`, `actionId`, `actionInputs` (values by input name) and `isWriteConfirmed`. A `POST`, `PUT`, `PATCH` or `DELETE` runs only with `isWriteConfirmed: true`, after the person agreed to the change it makes. It refuses an action with no HTTP request saved.

It runs the action's saved request once, against the real API. No publish is
needed, and the connector does not change. It answers `ran`, `passed`,
`authenticationApplied` and `note`, with `response` (the first record) or
`error`. Values under a name that says credential are masked, and long text is
cut. `passed: false` is the API's own error. A lost session, a timeout or an
unreachable host comes back as a tool error instead, not as a test result.

What a test shows: whether the URL, query parameters, body and response path
are right.

What a test cannot show:

- **A test does not sign in.** It sends only the action's own request, with no authentication header and no token call, for every type. Every answer says `authenticationApplied: false`. An API that needs sign-in answers 401 here even when a real connection works. A 401 in a test says nothing about the authentication.
- How an automation will run it. Automations run the last published copy, with a real connection. The test cannot stand in for that run.
- More than one record, or a next page.
- A trigger. No tool tests a trigger.

Each test makes an empty test connection, which the platform removes by itself
after an hour *(unverified)*. Nothing is left to clean up.

## Traps that answer 200 and do the wrong thing

- **A saved change is not live.** Every save, enable and pause changes the draft only. Automations keep the last published version until `publish_connector` runs. That includes the base URL, which each action copies at publish *(unverified)*. Once `publish_connector` is done, automations use the new version, running ones included.
- **Names repeat; ids are the key.** Two connectors can share a name, and differ only by case or a stray space. `save_connector` without `connectorId` makes a new connector every time, even when one with that name exists: it only warns. A retried create makes a duplicate. Keep every id the first answer gives, and find records by id.
- **A paused action keeps running in the automations that already use it.** A publish takes a paused action out of the app's list, so no new step can use it. A step that already uses it keeps running it, with its last published request (seen live). To stop it everywhere, delete the action, after its dry run and the person's yes; the automations that use it then fail at that step.
- **`urlType` and `url` can disagree.** With `path`, `url` is joined onto the connector's base URL. With `full`, `url` is the whole URL. An action made on the screen can hold a whole URL marked `path`, or a path marked `full`. A whole URL marked `path` is joined onto the base URL and breaks *(unverified)*. Read both in `get_connector_action`, and fix `urlType` when they disagree.
- **An imported URL can keep a parameter unfilled.** Some specs leave a path parameter as `{id}` or a bare `{{id}}` in the URL, which the request never fills. Read every imported URL. Change it to `{{rawPayload.pathParams_id}}`, with that input on the action.
- **An action hands on one record and never pages.** An automation gets only the first record of the answer *(unverified)*. Inputs such as `offset`, `page`, `cursor` or `limit` are plain inputs: the automation calls the action once per page.
- **Nothing checks the answer against `outputs`.** The output schema only tells automations which fields to offer: an action whose API answers an empty body hands on `""`, though its schema says object (seen live). A wrong schema saves, publishes and tests fine; later steps then read fields that never arrive. Write `outputs.body` from a real test answer. A webhook event reaches the automation as the other app sent it *(unverified)*.
- **`run_connector_operation` would run a custom action that writes.** It is on the `automation-code` server, and it stops only operations marked as writes. Nothing marks a custom action as one. Never use it to run a custom action. Test with `test_connector_action`, which asks first.
- **A webhook URL lets anyone in.** The platform checks no signature or token on a call to a connector's webhook *(unverified)*. Anyone with the URL can start an automation that uses the trigger. Every trigger save warns about it. Tell the person before they hand the URL out.

## What no tool does

The `connectors-sdk` server has no tool for these. When one is asked for, say
plainly that it is not available here and point at the Connectors screen. Do
not look for another way.

- **Unpublish, or go back to an earlier version.** The platform keeps no earlier version. To take one action out, pause it and publish, or delete it.
- **Polling triggers.** The tools read them and refuse to make or change one.
- **Import a cURL command** into an action's request.
- **The error response and the lookup setting** ("Add error response" and "Use as a lookup" on an action's Outputs tab). Reads show the error schema; no save sets either.
- **Settings beyond the three switches**: object types, static objects, object mappings and model lookup.
- **Share a connector** with people.
- **Custom actions on a standard connector.**
- **Change a connector's, action's or trigger's id**, or move an action to another connector.
- **Test a trigger, or test with authentication.**
- **Prove a published action works in an automation.** Only a run of an automation with a real connection shows it; `test_connector_action` cannot stand in.
- **Make the connection** an automation runs with: the `connection` server's `create_connection` does that once the connector is published; see `connector-auth`.
- **Describe every field live.** No tool lists a field's allowed values; use [references/save-fields.md](references/save-fields.md).

## What has been checked, and what has not

The walkthrough ran end to end through UnifyApps Headless on a test tenant:
build, sign-in, publish, connection, automation run and delete.

**Known to hold:**

- a published connector with an enabled action that has an HTTP request appears in automations with no other step; an action with no request does not;
- the same published action also appears in the list of apps and actions an agent's tools are chosen from (`list_apps`, `list_app_actions` on the `agent-builder` server); binding it to an agent and running it there is not checked *(unverified)*;
- a publish with a version that is not the stored one answers `false` and changes nothing, which is why `publish_connector` sends the current one and reads back;
- a connector delete leaves its settings record, and no tool deletes one; nothing reads it again;
- nothing records edits made since the last publish;
- an update of an action or trigger replaces the whole record, so the tools send it whole;
- a flagged save is stored anyway, which is why `SAVED_WITH_VIOLATIONS` means "change it by its id";
- a switch made with a stale version answers success and changes nothing, which is why the tools read every switch back;
- connector and action names can repeat, or differ by case only;
- an action delete leaves its HTTP request, which the tool removes;
- a test sends no authentication: its test connection holds no values, so no type signs in;
- a `webhook_manual` trigger saved by the tools publishes and reaches automations;
- that actions use `[n]` indexes and `-` in names in their templates;
- an environment variable template in an action's request is filled in by `test_connector_action` and sent empty by an automation run, while a connection field whose value is that template is filled in at run time;
- an automation run adds the authentication's headers with the connection's values, which a test never does;
- a paused action keeps running in the automations that already use it, with its last published request;
- an automation whose step used a deleted action fails at that step;
- nothing checks an answer against the output schema: an empty answer arrives as `""` where the schema says object;
- the delete dry runs' lists of connections and automations came back empty for a custom connector that had both;
- a save of an authentication type the connector already has replaces that authentication, with no warning;
- how imported actions name their inputs;
- `urlType` can disagree with `url` on actions made on the screen.

**Marked *(unverified)*, because nothing has shown it yet:**

- what a whole URL marked `path` does when it runs;
- that each action copies the base URL at publish;
- that a webhook event reaches the automation as the other app sent it;
- that an action hands on only its first record;
- that webhook calls are not authenticated;
- that a publish that fails part-way leaves the connector marked published (the publish answer reads back what reached automations either way);
- that the platform removes a test connection after an hour.

**Not tried across model sizes.** On a smaller model, take the walkthrough one
step at a time.
