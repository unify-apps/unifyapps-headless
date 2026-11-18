# API Group and API fields

Every field `save_api_group` and `save_api` take, with its allowed values and
what it does when a call arrives. `describe_api_fields` reads the same list live
from the tenant. It names each field by the input name the save tool takes, the
same names as below. When the two disagree on allowed values, required fields
or defaults, the live list wins. A line marked *(unverified)* has not been
checked against the platform's behaviour.

## Contents

- [An API Group's fields](#an-api-groups-fields)
- [Groups the platform owns](#groups-the-platform-owns)
- [An API's fields](#an-apis-fields)
- [The backing, by type](#the-backing-by-type)
- [External API settings](#external-api-settings)
- [How an API answers a call](#how-an-api-answers-a-call)
- [The URL](#the-url)
- [The contract](#the-contract)

## An API Group's fields

| Input | Needed | Default | Allowed values and what they do |
|---|---|---|---|
| `workspaceId` | on create | — | a number: the workspace the group lives in |
| `name` | yes | — | any text. Names repeat, so a name is not a key. |
| `path` | no | made from the name: every character that is not a letter or a digit becomes `-` | letters, digits, `_` and `-`. The screen allows one part. The platform also takes parts joined by `/`. At most 500 characters, counted with the version. Unique together with `apiVersion`. |
| `apiVersion` | only with `includeVersionInPath` | — | at most 10 characters. It is checked as part of the path, so letters, digits, `_` and `-` only: `v1` passes and `1.0` does not. |
| `includeVersionInPath` | no | off | on: the version becomes a part of every URL in the group. The tool refuses it without `apiVersion`. |
| `description`, `tags` | no | — | free text; a list of tags |
| `logging` | no | runs, nodes and variables all on | off on the group or on the API skips that part of the automation run log for a call. The Insights row is still written. See `api-insights`. |
| `traceHeaders` | no | — | request header names whose values are copied into the automation run. They add to the list in Settings. See `api-insights`. |
| `telemetry` | no | — | metrics published for calls to this group, as well as those in Settings. See `api-insights`. |

Policies go on a group through `attach_policies`; see `api-policies`.

No tool takes these, because the platform keeps them:

- the execution tier, which picks the runtime that serves the group;
- the marks that tie a group to an MCP server, an A2A server or the default webhook group.

## Groups the platform owns

Reads mark them with `managedBy`. The save and delete tools refuse them.

- **The default webhook group.** Deploying a Webhook automation adds an API to it. The API's path is the automation's id, its name is the automation's name followed by "Automation Web-hook", and its method is `ANY`. Pausing the automation switches that API off, and unpausing switches it on. The automation's clean-up deletes it. The group has its own client with a No Auth access profile, so its APIs take calls with no key. A workspace can have a default webhook group of its own. One group can hold hundreds of APIs, so read it with a `limit`.
- **MCP server groups.** One group per MCP server, holding the server's own APIs. A few also hold APIs someone added by hand.
- **A2A server groups.** One A2A server can own two groups, each with a full copy of its APIs, so it answers at two URLs. Find a server's groups by the server, not by name.
- **Groups made by automation helpers.** They are named "Default Collection For" and a path.

## An API's fields

| Input | Needed | Default | Allowed values and what they do |
|---|---|---|---|
| `groupId` | yes | — | the group the API lives in. An API cannot move to another group. |
| `name` | yes | — | any text. Names repeat, even inside one group. |
| `path` | no | made from the name | parts joined by `/`, with no empty part. A part is letters, digits and `_ - { } . ( ) %`, or `*`, or an environment variable in double braces. `{name}` is a path parameter. Braces must balance, at most two deep. `/` alone is allowed only for Callable and External API, and gives a URL that ends in `/`. Unique inside the group. |
| `methods` | yes | — | any of `GET`, `PUT`, `POST`, `PATCH`, `DELETE`, `HEAD` and `ANY`. The platform's own Webhook APIs use `ANY`. The Event Stream form offers no `DELETE`, and the LLM form asks for no method. Whether a SOAP API takes only `POST`, and whether `ANY` may sit beside other methods, is *(unverified)*. |
| `backing` | yes | — | see [The backing, by type](#the-backing-by-type) |
| `apiType` | for Callable | `REST` | `REST` or `SOAP`. It must match the request type the automation's trigger declares. The tool checks this. |
| `active` | no | on for a new API | off: callers get 403, and the call still reaches Insights |
| `timeout` | no | — | the API's own time limit: a number and a unit. The smallest Timeout policy on the call wins over it, and `save_api` warns when one does. With neither, the limit is 300 seconds. The screen's help says 240 seconds at most, but nothing holds to that. A call that runs too long gets 408. |
| `retry` | no | off | on or off; a count of 1 to 5; a first delay of 100 to 10,000 ms; a longest delay of 100 to 30,000 ms, not below the first; a backoff factor of 1 to 5, where 1 keeps the delay the same. A retry happens on a 5xx answer or a thrown error. It runs the backing again, so an automation that writes data can write twice. |
| `cache` | no | off | cache keys and a lifetime. A switched-on Cache policy on the call wins over it, and `save_api` warns when one does. See [How an API answers a call](#how-an-api-answers-a-call). |
| `logging` | no | all on | as on the group. Off on either the group or the API wins. |
| `fallbackResponse` | no | — | a status code, headers, a body (JSON, or XML for SOAP), and optional versions per language |
| `errorMessages` | no | — | a message per status code, keyed by the code as text, such as `"403"`. It replaces the message of any answer with that status. |
| `description`, `tags` | no | — | free text; a list of tags |

## The backing, by type

| `type` | Screen name | Keys | What to know |
|---|---|---|---|
| `CALLABLE_WORKFLOW` | Callable | `automationId`, `automationVersion` (optional) | One automation whose start trigger is `callables_from_api`. `automationVersion` pins a version: the API keeps running it after a new deploy. A caller can also ask for a version with a `resourceVersion` query parameter. |
| `WEBHOOK_WORKFLOW` | Webhook | `automationIds` | One or more automations, each with a `webhooks_default` start trigger. The call is handed over, and the caller gets 200 with no body at once. When the API serves more than one automation, or its path is not the automation's id, the URL gets a `resourceId` query parameter that picks the automation. |
| `SOUTHBOUND_API` | External API | `url`, and the optional keys below | Passes the call on to `url`, as HTTP or GraphQL, and gives back its status, headers and body. |
| `LLM_MODEL` | LLM | `requestType` (`CHAT` or `COMPLETION`), `modelId` (optional) | The call's body goes to the model through a platform automation. |
| `EVENT_STREAMS` | Event Stream | `streamId` (optional) | The call's body and query parameters go to the event stream through a platform interface. |

## External API settings

| Key | Default | Values and what they do |
|---|---|---|
| `url` | — (needed) | The outside address. A `{name}` in it is filled from the API's path parameters. Environment variables in double braces are filled too. A `{name}` left unfilled makes the call fail with 500, or with the fallback. The caller's query string is copied on. |
| `kind` | `HTTP` | `HTTP` or `GraphQL`. A GraphQL call always goes out as `POST`. |
| `httpMethod` | the caller's method | `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD` |
| `forwardAllPaths` | off | On: the rest of the caller's path is added to `url`. An External API with an empty path and this on answers every path that no other API in the group matches. |
| `httpVersion` | `HTTP_2` | `HTTP_1_1`, `HTTP_2` |
| `sslVerify` | on | off skips the check of the outside server's certificate |
| `followRedirects` | `NORMAL` | `NEVER`, `ALWAYS`, `NORMAL` |
| `routeByHeader` | off | A list of rules, each with `header`, `value` and `url`. The first rule whose header matches picks the outside URL. |

- Every header the caller sends goes to the outside URL, except connection headers. That includes the caller's key.
- A failed outside call is tried again up to 3 times.

## How an API answers a call

The order a call is checked in, and the status each refusal gives, are in
SKILL.md under "A refused call names the missing link".

When the backing fails, the caller gets the fallback for their language, then
the plain fallback, then 500. A failed sign-in, a switched-off API, a policy
block and a time-out answer without the fallback.

**What a Callable automation's output becomes.** `status` is the status code,
200 when left out. `headers` become the answer's headers. The body is the first
of `htmlBody`, `xmlBody`, `textBody` and `body` that is set. Every answer from a
Callable or Webhook API carries the run id in the `X-UA-TraceId` header.

**The cache.** Only 200 answers are kept, for the lifetime set. The cache key is
the API plus the value of each cache key, looked up in the path, then the query,
then the headers. If a call lacks one of the cache keys, nothing is cached. The
key does not name the caller, so two callers who send the same values get one
stored answer. A cached answer carries an `X-Cache: HIT` header. The API's own
`cache` and a Cache policy work the same way. When a switched-on Cache policy
is on the call, its settings are used instead of the API's; see `api-policies`.

**The fallback.** The screen offers the statuses 200, 400, 401, 403, 404, 409,
500, 502, 503, 504 and 505, and starts at 200. Give it a 5xx, so a failure does
not look like success. A version per language is picked by the caller's
`accept-language` header.

## The URL

Take it from `get_api` or from `readBack`, and never build it yourself. In
words, it is `https://`, then the API base domain, then `api-endpoint`, then the
group path, then the version, then the API path. The version is there only when
`includeVersionInPath` is on and `apiVersion` is set.

- The base domain is set for the tenant when it is set up. It is not always the address people use to open the platform.
- A platform setting can leave out the `api-endpoint` part.
- A Webhook API may carry a `resourceId` query parameter (see the backing table).
- No two APIs share a URL.

## The contract

`get_api` returns the contract: what a caller sends and what comes back.

- Parameters by place: path, query, headers, cookies and SOAP headers. Each has a name, whether it is required, and a type.
- The request body's shape.
- One response shape per status code, keyed by the code as text.

What to know about it:

- It comes from the automation's start trigger. No tool here edits it.
- A Webhook API's contract has no response shapes, and its body shape is usually empty.
- An empty contract is a normal answer, not an error.
- The contract's path parameters can differ from the `{name}` parts of the API path. Check both before building a call.
