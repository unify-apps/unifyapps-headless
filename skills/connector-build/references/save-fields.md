# Connector, action and trigger fields

Every input of the connector, action and trigger saves, with its allowed values
and what it does. A save reads what is stored, lays the fields you send over it, and reads
it back. A field you leave out keeps its stored value. Report what `readBack`
holds, not what you sent.

## Contents

- [The connector: save_connector](#the-connector-save_connector)
- [Where it is offered: save_connector_settings](#where-it-is-offered-save_connector_settings)
- [One action: an item of save_connector_action](#one-action-an-item-of-save_connector_action)
- [The HTTP request of an action](#the-http-request-of-an-action)
- [One trigger: an item of save_connector_trigger](#one-trigger-an-item-of-save_connector_trigger)
- [Trigger kinds, as saved and as read](#trigger-kinds-as-saved-and-as-read)
- [What an imported action looks like](#what-an-imported-action-looks-like)
- [What the reads answer](#what-the-reads-answer)

## The connector: save_connector

Leave `connectorId` out to make a connector. Send it to change one.

| Input | Needed | What it does |
|---|---|---|
| `connectorId` | to change | the connector to change; left out, a new connector is made every time |
| `name` | to make | any text. Names repeat, so a name is not a key. A name another custom connector has is saved and named in `warnings`. |
| `description` | no | free text |
| `logo` | no | an image URL, shown as the app icon in automations. A new connector without one gets the default custom connector icon. |
| `baseUrl` | no | a URL, e.g. `https://api.example.com/v2`. It is joined in front of every action URL whose `urlType` is `path`. Each action takes its copy at publish. |
| `categories` | no | a list of the screen's categories, each by id (`SALES_AND_CRM`) or name ("Sales and CRM"); stored as ids; another is refused with the list; the list you send replaces the stored one |

A new connector is a draft: not published, with no authentication, actions or
triggers.

## Where it is offered: save_connector_settings

`modules` holds three switches, the Settings tab's toggles. A switch you leave
out keeps its stored value. Nothing else in the settings changes.

| Switch | Screen | Default with no settings saved |
|---|---|---|
| `automation` | Workflows | on |
| `dataPipelines` | Data Pipelines | off |
| `catalog` | Data Catalog | off |

The switches take effect at the next publish. With `automation` off, the
publish makes no app for automations, and automations cannot use the connector.

## One action: an item of save_connector_action

`actions` takes 1 to 10 items. They are saved one at a time, in the order sent.

| Field | Needed | What it does |
|---|---|---|
| `actionId` | to change | the action to change; left out, a new action is made |
| `name` | to make | unique in the connector, in any case. A name another action has is refused, naming that action's id. |
| `description` | always (UnifyApps Headless's rule; the tool does not require it) | one or two sentences on what the action does and what it answers. Automation authors and agents choose an action by its name and this text. |
| `inputs` | no | the fields an automation fills in, as a JSON Schema object: `type` `object`, the fields under `properties`, and `required`. Give each field a `title`: automations show it as the label. The request reads each field as `{{rawPayload.<field>}}`. `{}` clears them. |
| `request` | no | the HTTP request; see the next section |
| `outputs` | to make | `body` (the response body) and `headers` (response headers to hand on), each a JSON Schema object. A part you leave out keeps its value. An action with no `body` is stored but flagged, so give every new action one. |
| `responsePath` | no | a dot path to the part of the response to hand on, e.g. `data.items`. `""` hands on the whole response. |

A new action starts paused. It needs `set_connector_resource_enabled` and a
publish to reach automations.

## The HTTP request of an action

| Field | Values | What it does |
|---|---|---|
| `method` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` | the HTTP method. A new request starts as `GET`. |
| `urlType` | `path` or `full` | `path`: `url` is joined onto the connector's `baseUrl`. `full`: `url` is the whole URL. A new request starts as `full`. |
| `url` | text, with templates | e.g. `/orders/{{rawPayload.orderId}}` with `path`. A new action needs one: a request with no URL is stored but flagged. |
| `headers` | a map of name to value | replaces the stored headers. Credentials belong in the authentication; see `connector-auth`. A literal value under a name that says credential is saved and named in `warnings`, and reads back masked, so it cannot be sent again: see `connector-auth`. |
| `queryParams` | a map of name to value | replaces the stored query parameters. Warned about as `headers` is. |
| `body` | `json` (an object) or `text`, and `formEncode` | `json` or `text`, not both. `formEncode: true` sends it form-encoded. `null` removes the body. A literal `json` field named like a credential (`password`, `secret`, `token`, `api_key`) is named in `warnings`; a `text` body is not searched. |
| `verifySsl` | true or false | checks the server's certificate; true by default. Reads answer it as `sslVerify`. |

`GET` and `DELETE` carry no body. A body sent with one is refused. Saving any
request field of a `GET` or `DELETE` action removes a body stored on it, as the
HTTP Request tab does.

Every value, and every header and query parameter name, may hold templates.
What a template may hold is in SKILL.md, under "What a template may hold".

## One trigger: an item of save_connector_trigger

`triggers` takes 1 to 10 items, saved one at a time in the order sent. The
tools make webhook triggers only.

| Field | Needed | What it does |
|---|---|---|
| `triggerId` | to change | the trigger to change; left out, a new trigger is made |
| `name` | to make | unique in the connector, in any case |
| `kind` | to make | `webhook_manual` or `webhook_auto`; see the next section |
| `description` | no | free text |
| `inputs` | no | the fields an automation fills in when it uses the trigger, as a JSON Schema object |
| `outputs` | to make | `body`: the event the other app sends, as a JSON Schema object. A trigger needs one. |
| `registration` | `webhook_auto` only | `actionId`, an action of this connector that registers the webhook URL in the other app, and `params`, values for that action's inputs by input name |
| `removal` | `webhook_auto` only | the same, for the action that removes it again |

The tool refuses `registration` or `removal` on a `webhook_manual` trigger, a
`webhook_auto` trigger without both, an action of another connector, and
`params` that name an input the action does not have. `params` values may hold
templates.

Every trigger save answers a warning that anyone with the webhook URL can start
an automation that uses the trigger. Pass it on to the person.

## Trigger kinds, as saved and as read

The save takes one word; the reads answer the stored value.

| `kind` you send | Read back as | Who registers the webhook URL in the other app |
|---|---|---|
| `webhook_manual` | `MANUAL_REGISTERED_WEBHOOK` | the person, by hand |
| `webhook_auto` | `AUTO_REGISTERED_WEBHOOK` | the platform: it runs the registration action when an automation that uses the trigger goes live, and the removal action when that automation stops |
| (none) | `FORWARD_POLLING`, `REVERSE_POLLING` | nobody: the platform calls the API on a schedule. Made on the screen only. The tools read it and refuse to change it. |

## What an imported action looks like

`import_connector_actions` makes actions the way the screen's Import OpenAPI
Spec does.

- Each action is named by the operation's `operationId`, or its path when there is none. Such names may have no spaces.
- Inputs are named by where they go: `pathParams_<name>`, `queryParams_<name>`, `body_<name>` and `headers_<name>`. A path parameter `id` is read as `{{rawPayload.pathParams_id}}`. Fill these names in `actionInputs` when testing.
- Input descriptions may hold HTML from the spec.
- Output schemas may be `$ref` and `definitions` with no `properties`.
- Every imported action starts paused.

## What the reads answer

- **`get_connector`**: `connectorId`, `name`, `description`, `logo`, `baseUrl`, `categories`, `published`, `managedBy`, `modules` (the three switches), `authentications` (each `type`, `name`, `grantType` and `connectionFields`, the names of its connection fields), `actions` (each `actionId`, `name`, `enabled`) and `triggers` (each `triggerId`, `name`, `kind`, `enabled`).
- **`get_connector_action`**: per action, `inputs`, `request` (null with a note when none is saved; `urlType`, `url`, `method`, `headers`, `queryParams`, `body`, `sslVerify`), `outputs` (`body`, `headers`, `error`, `responsePath`) and `enabled`. Credentials are masked as `connector-auth` describes; a template is shown as written.
- **`get_connector_trigger`**: the same for a trigger, plus `kind` as stored, and for a `webhook_auto` trigger `registrationConfig` and `removalConfig` (each the action's id as `resourceName`, and its `params`).
- An id that is not one of that connector's actions or triggers goes to `notFound`, and the others still answer.
- `urlType` is read from a stored switch that an action made on the screen may not set right. Read `url` too: a URL that starts with `https://` is a whole URL, whatever `urlType` says.
