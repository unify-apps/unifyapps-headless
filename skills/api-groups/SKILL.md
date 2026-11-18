---
user-invocable: false
name: api-groups
description: "Makes a UnifyApps automation callable from outside through the API Platform (the API Manager screen), and builds, reads, changes and deletes API Groups and the APIs (endpoints) inside them. Covers the chain a working API needs (API Group, API, client, access profile and its API key), the five things an API can run (a Callable or Webhook automation, an External API URL, an LLM, an Event Stream), how an API's URL is built, versions in the path, fallback responses, OpenAPI export, and how every save and delete works. Load it for any ask to expose, publish or hand out a URL for an automation, to find whether an automation already has an API, to read why a published API answers 401, 403 or 404, or when the person names the API Groups screen."
---

## What the API Platform is

The API Platform lets a caller outside UnifyApps reach something built inside
it, over HTTP. Its screen title is "API Manager".

An **API Group** is a set of APIs under one path, with an optional version. An
**API** is one path inside a group, with the HTTP methods it takes. Behind every
API is its backing: the thing a call runs.

| Backing | Stored as | What a call does |
|---|---|---|
| Callable | `CALLABLE_WORKFLOW` | runs one automation and waits for its answer |
| Webhook | `WEBHOOK_WORKFLOW` | hands the call to one or more automations and answers at once |
| External API | `SOUTHBOUND_API` | passes the call on to a URL outside the platform |
| LLM | `LLM_MODEL` | sends the call's body to a model |
| Event Stream | `EVENT_STREAMS` | hands the call's body to an event stream |

**A working API is a chain of four records.** An API Group. An API in it that is
switched on. A client. An access profile of that client that is switched on and
lists the group. A call with no matching access profile gets 401. Policies are
optional rules on top. Insights shows the calls that got past sign-in.

This skill owns the chain, the walkthrough that builds it, and how every save
and delete works. `api-access` owns clients, access profiles and keys.
`api-policies` owns policies. `api-insights` owns proving a call works, Insights
and Settings.

**Some groups belong to the platform.** Deploying a Webhook automation adds an
API to the default webhook group. Each MCP server and each A2A server gets
groups of its own. Automation helpers make groups named "Default Collection For"
and a path. Reads mark all of these with `managedBy`, and the save and delete
tools refuse them.

## The api-gateway MCP server

Every tool here is an MCP tool on the `api-gateway` server, bridged to the
signed-in tenant. Call them like any other MCP tool. There is no CLI.
**Every call takes `host`.** It is the signed-in tenant's `https://` origin, with
no path. A call without it goes nowhere.

Do not reach for the platform another way — an API Platform write
outside these tools has none of the guards they carry.

## Making an automation callable from outside, in order

Each record names the one before it by id, so they are made in this order.
Reuse comes first, because a second API for one automation is a second URL to
keep safe. The chain is not done when the records exist. It is done when a
real call gets the right answer.

1. **Find what already exists.** `list_apis` with `automationId` answers "is this automation already an API?". If it is, read it with `get_api` and check with the person that it is the one they mean; with nobody to ask, report `needs_confirmation`. Then give its URL and stop. A deployed Webhook automation always has one (see the traps).
2. **Let the start trigger pick the backing.** A `callables_from_api` trigger means a Callable backing. A `webhooks_default` trigger means a Webhook backing. Any other trigger, such as a schedule or an app event, cannot back an API. The automation must change first, and that is automation work. You need not read the trigger yourself. `save_api` checks it, and the `REST` or `SOAP` type, and refuses a backing that does not fit. Its answer is enough. An agent that also has the tools of the `automation-code` server can read the trigger first. `search_workflows` finds the automation by name. `open_workflow` takes its id as `workflowId`.
3. **Deploy the automation before the API is used.** An API answers with an error until its automation is deployed. `save_api` warns when it is not. The fix is `deploy_workflow` on the `automation-code` server, done by whoever owns the automation.
4. **Pick or make the API Group.** `list_api_groups` with `search` finds one, and `get_api_group` shows what it holds and who can call it. Reuse the group the person's other APIs live in. Otherwise call `save_api_group` with `workspaceId`, `name` and `path`. Add `apiVersion` with `includeVersionInPath` only when the person wants the version in the URL. The group path is part of every URL in the group, so agree it with the person now; with nobody to ask, report `needs_confirmation`.
5. **Make the API.** `save_api` with `groupId`, `name`, `path`, `methods` and `backing`. For Callable, `backing` is `type` `CALLABLE_WORKFLOW` with `automationId`, and `apiType` is the request type the trigger declares (`REST` or `SOAP`). For Webhook, it is `WEBHOOK_WORKFLOW` with `automationIds`. A new API is switched on. Its URL is in `readBack`.
6. **Give the caller a way in.** Reuse the caller's client when there is one (`list_clients`, `get_client`), or make one with `save_client`. Then call `save_access_profile` with `clientId`, `name`, `groupIds` holding this group, and `auth`. For a method with a key, that call returns the key once, so confirm first; with nobody to ask, report `needs_confirmation`. See `api-access` for authentication methods, keys and limiting a caller to some APIs.
7. **Add policies only when asked.** A rate limit, CORS or a check on the request is `save_policy`, then `attach_policies`. See `api-policies` for where each one attaches and the order they run in.
8. **Prove it with a real call.** `call_api` with `apiId`, `method` and a body of test data. Calling runs the automation for real, so the data must be safe to write. It returns the status, the body, a `traceId` and the automation's `runId`. See `api-insights` for reading the call back, and for why a 401 or 404 leaves no trace there.
9. **Hand over what a caller needs.** Give the URL `get_api` returns, the method, and how to sign in (`howToCall` from `get_access_profile`). How to pass on a key is `api-access`'s rule.

## The tools

Every call
takes `host` as well as the inputs named below. Every field, with its allowed
values, is in [references/api-fields.md](references/api-fields.md).

### Reading

- **`list_api_groups`** — find a group. Takes `workspaceId`, `search`, `limit` and `cursor`. Each row has the path, `apiVersion`, `includeVersionInPath`, the number of APIs and `managedBy`.
- **`get_api_group`** — one group by `groupId`. It returns its APIs with their URLs and the access profiles that can call it. It also returns the group's policies in run order and its settings: logging switches, trace headers and telemetry.
- **`list_apis`** — find APIs. Takes `groupId`, `automationId`, `search`, `activeOnly`, `limit` and `cursor`. With `automationId`, it answers "is this automation already an API?".
- **`get_api`** — one API by `apiId`. It returns every field, the URL, the policies and the fallback response. It also returns the contract: the parameters a caller sends, the request shape, and the response for each status code. With `profileId` as well, it lists every policy a call from that access profile runs, in run order; see `api-policies`.
- **`describe_api_fields`** — with `kind` `api_group` or `api`, it lists each field's type, whether it is required, its default, its allowed values and when it shows. Each field comes under the input name the save tool takes. Read it when a field is not in the reference, or when the two disagree. On allowed values, required fields and defaults, the live list wins.
- **`export_openapi`** — the OpenAPI text of a REST group or API, or the WSDL of a SOAP one. Takes `groupId` or `apiId`, and `format` (`yaml` or `json`). It takes one group or one API per call. A group with no APIs has nothing to export.

### Writing

**Every save on the `api-gateway` server works the same way.** The other API
skills point here.

- The tool reads the stored record, merges in the fields you give, saves it, and reads it back.
- A field you leave out keeps its stored value.
- A list you give replaces the stored list. That holds for `tags`, `groupIds`, `traceHeaders` and telemetry metrics, and for the `allowedApis` map of an access profile. To add one item, send the items already there as well.
- Report what `readBack` holds, not what you sent. Name every field in `notStored`: it was sent and did not stick.

The two saves this skill owns:

- **`save_api_group`** — make a group (no `groupId`, and `workspaceId` is needed) or change one (with `groupId`). Takes `name`, `path`, `apiVersion`, `includeVersionInPath`, `description`, `tags`, `logging`, `traceHeaders` and `telemetry`. The last three are explained in `api-insights`.
- **`save_api`** — make an API (no `apiId`) or change one (with `apiId`). Takes `groupId`, `name`, `path`, `methods`, `backing`, `apiType`, `active`, `description`, `tags`, `timeout`, `cache`, `retry`, `logging`, `fallbackResponse` and `errorMessages`. `methods` holds any of `GET`, `PUT`, `POST`, `PATCH`, `DELETE`, `HEAD` and `ANY`. To switch an API off or on, send `apiId` and `active`. It warns when the automation is not deployed. It also warns when an attached Timeout or Cache policy will override the `timeout` or `cache` you give; see `api-policies`.

`backing` takes a `type` and the keys of that type:

| `type` | Screen name | Other keys |
|---|---|---|
| `CALLABLE_WORKFLOW` | Callable | `automationId`, `automationVersion` (optional) |
| `WEBHOOK_WORKFLOW` | Webhook | `automationIds` |
| `SOUTHBOUND_API` | External API | `url`, and optional `kind` (`HTTP`, the default, or `GraphQL`), `httpMethod`, `forwardAllPaths`, `httpVersion`, `sslVerify`, `followRedirects`, `routeByHeader` |
| `LLM_MODEL` | LLM | `requestType` (`CHAT` or `COMPLETION`), `modelId` (optional) |
| `EVENT_STREAMS` | Event Stream | `streamId` (optional) |

### Deleting

**Every delete on the `api-gateway` server works the same way.** The other API
skills point here.

1. Call it with the record's id. `dryRun` is `true` unless you set it to `false`, so this first call deletes nothing. It says what else will go and gives one number.
2. Tell the person what will go, with that number, and wait for a clear yes. With nobody to ask, stop and report `needs_confirmation` with the number.
3. Call it again with `dryRun: false` and the number, sent back under its own name. `delete_access_profile` takes `confirm: true` instead. The real run needs it, and it is refused when the number no longer matches: something changed, so dry run again.
4. Treat the delete as permanent. The platform only hides the record, but no tool and no screen brings it back.

The two deletes this skill owns:

- **`delete_api_group`** — **one-way; confirm first; with nobody to ask, report `needs_confirmation`.** Deletes the group and every API in it, and takes the group off access profiles and clients. Takes `groupId` and `dryRun`. Its dry run gives `apiCount`. It also lists the access profiles that will be left with no group. The tool keeps them, and the person decides what happens to them.
- **`delete_api`** — **one-way; confirm first; with nobody to ask, report `needs_confirmation`.** Deletes one API and takes it off every access profile that allowed it. Takes `apiId` and `dryRun`. Its dry run gives `profileCount`.

What each delete on the server takes with it:

| Tool | Also removes | What the real run needs back |
|---|---|---|
| `delete_api_group` | every API in the group; the group on access profiles and clients | `apiCount` |
| `delete_api` | the API on access profiles' `allowedApis` | `profileCount` |
| `delete_policy` | the policy on every group, API and access profile | `attachmentCount` |
| `delete_client` | every access profile of the client; their keys stop working | `profileCount` |
| `delete_access_profile` | nothing else; its key stops working for good | `confirm: true` |

Three jobs look like deletes and are not:

- **Taking a policy off a group or an API** is `detach_policies`. Deleting the group or the API deletes the group or the API.
- **Changing an API** is `save_api` with its `apiId`. Deleting and making it again gives it a new id, and access profiles that allowed only that API lose it.
- **Deleting an automation** leaves the APIs that run it in place. Find them with `list_apis` and `automationId`, and ask the person about each one. With nobody to ask, report `needs_confirmation`.

## Traps that answer 200 and do the wrong thing

- **Deploying a Callable automation does not make it callable from outside.** The deploy succeeds. A caller still gets 404 until a group and an API exist, and 401 until an active access profile lists the group. Build the whole chain.
- **A deployed Webhook automation already has an API, and it lets any caller in.** The deploy adds an API to the default webhook group. That group's access profile is No Auth, so its URL works with no key. Give that URL rather than making a second API. If callers must sign in, a second API in the person's own group can ask for a key. The first URL still stays open. Tell the person so.
- **An API's request and response shape belong to its automation.** They come from the automation's start trigger, not from the API. Change the automation's inputs, and every caller of the API sees the change. The API record does not change. The platform caches the shape and drops it 5 minutes after the last call to the API. Whether a redeploy drops it sooner is *(unverified)*.
- **The parameters in an API's path and the automation's parameters are not kept in step.** The `{name}` parts of the path come from the API. The contract's path parameters come from the automation. Check both in `get_api` before building a call.
- **Changing a path moves the URL.** A new group path or version, or a new API path, gives a new URL. Callers of the old URL get 404, and a 404 never reaches Insights. Agree the change with the person before `save_api_group` or `save_api`. With nobody to ask, report `needs_confirmation`.
- **Names repeat; paths do not.** Two groups or two APIs can share a name. A group is unique by its path and version. An API is unique by its path inside its group. Find records by id or path, never by name. A save without `groupId` or `apiId` makes a new record, even when one with that name exists.
- **Two groups may share a path when their versions differ.** The version is part of the URL only when `includeVersionInPath` is on. Two such groups with the version left out share a URL start. Which one answers has not been checked *(unverified)*. Give each group its own path, or keep the version in the path of both.
- **A Webhook API answers 200 before its automation runs.** The answer has no body. A 200 proves the call was taken, not that the automation worked. Check the run; see `api-insights`.
- **An External API passes the caller's key on.** Every header the caller sends goes to the outside URL, including the key header and `Authorization`. Point an External API only at a service the person trusts with those keys, and tell them. Whether a Request Transformer policy that removes a header stops this is *(unverified)*; see `api-policies`.
- **A pinned automation version keeps running after a new deploy.** `automationVersion` fixes the version a Callable API runs. Leave it out unless the person asks to pin. With it left out, the API runs the deployed version *(unverified)*.
- **A fallback response with status 200 hides failures.** A caller gets the fallback when the backing fails. The screen starts its status at 200, so a failure looks like success. Give a fallback a 5xx status. Whether a failed automation run, and not only a thrown error, brings in the fallback is *(unverified)*.

## A refused call names the missing link

The status of a refused call says which part of the chain is missing. A call is
checked in this order: the path, sign-in, the API switched on, the IP lists, the
method, the policies, the cache, the backing. The first check that fails gives
the answer. After the backing, outbound policies change the answer but never
refuse it. The other API skills point here for this order. Check `active` in
`get_api` early: a switched-off API answers 403, the same status some policies
give.

| Status | What it means | Reaches Insights |
|---|---|---|
| 404 | no group or API at that path, or the wrong address | no |
| 405 | the API does not take that method | sometimes |
| 401 | no key, a wrong key, a switched-off access profile, or an access profile that leaves out this group or this API. Sign-in checks all of these, for every method. | no |
| 403 | the API is switched off, the caller's IP is blocked, or a CORS, Request Validator or Request Transformer policy refused it | yes |
| 408 | the backing took longer than the time limit | yes |
| 429 | a rate limit or a quota; see `api-policies` | yes |

What an access profile allows is in `api-access`. The status each policy gives
is in `api-policies`. Why a 401 or 404 leaves no trace in Insights is in
`api-insights`.

## What no tool does

The `api-gateway` server has no tool for these. When one is asked for, say
plainly that it is not available here and point at the API Manager screen. Do
not improvise a workaround through another surface.

- **Import from OpenAPI, Swagger, Postman or cURL.** The platform has no import.
- **Change an API's request or response shape.** It comes from the backing automation's start trigger. Change the automation.
- **Move an API to another group.** Make a new API in the new group, then delete the old one by the steps under `### Deleting`. The old URL stops working.
- **Set the base domain or a custom domain.** The platform sets it when the tenant is set up. `get_api` shows the URL it gives.
- **Split calls between automation versions.** The platform stores canary settings, but the tools leave them out.
- **Export every API Group at once.** `export_openapi` takes one group or one API per call.
- **Close or secure a Webhook automation's default API.** It sits in the default webhook group, which the platform owns.
- **Share a group with people.**

## What has been checked, and what has not

**No tool here has run.** The `api-gateway` server does not exist, so nothing in
`## The tools` works today. The walkthrough has never been carried out end to
end. When a job arrives, say that it is not available yet.

**Checked against the platform's behaviour:**

- the group and API fields and their forms;
- the URL rule;
- the groups the platform owns;
- repeated names and unique paths;
- the No Auth access profile of the default webhook group;
- contracts that come from the automation;
- the order a call is checked in, and the status of each refusal;
- Webhook APIs answering before their automation runs;
- External APIs passing the caller's headers on;
- when the fallback is used;
- version pinning;
- how long the platform caches an API's request shape;
- what each delete takes with it.

**Marked *(unverified)*, because nothing has shown it yet:**

- which group answers when two share a path;
- what runs when no version is pinned;
- whether a failed run brings in the fallback;
- whether a redeploy drops the cached request shape.

**A dropped version shows in `notStored`.** If a group's `apiVersion` is not
stored, `save_api_group` names it there.

**Not tried across model sizes.** On a smaller model, take the walkthrough one
step at a time.

## Reference files

| File | Read it when |
|---|---|
| [references/api-fields.md](references/api-fields.md) | a write needs a field's allowed values, a backing's settings, how an API answers, how the URL is built, or what the contract holds |
