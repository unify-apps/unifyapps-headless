# Insights and Settings: fields, counts and statuses

Everything a read of Insights or Settings needs at field level. Facts marked
*(unverified)* have not been checked against the platform's behaviour.

## Contents

- What one call row holds
- What each status means, and whether it leaves a row
- Success, failure and policy violation
- The three times
- What each Insights tile and chart shows
- The screen's filters and call list
- What each settings field does
- Who can see and change what
- Known gaps

## What one call row holds

`list_api_calls` returns the short form. `get_api_call` returns everything.

| What | `list_api_calls` | `get_api_call` | Notes |
|---|---|---|---|
| call id | yes | yes | Give it to `get_api_call` as `callId`. |
| time the call came in | yes | yes | Rows are newest first by this time. |
| time the answer left | – | yes | |
| method | yes | yes | |
| path | yes | yes | The API Group path, then the API path. |
| status | yes | yes | The status the caller got. |
| time taken | yes | yes | The whole call, as the API Platform saw it. |
| backend time | yes | yes | What the backing took. |
| API, API Group, client | yes | yes | Stored as ids. Names are looked up when you read, so a deleted API or client shows only its id. |
| `traceId` | yes | yes | The caller's `x-ua-trace-id` header, or one the platform made up. |
| request and response headers | – | yes | Keys are masked: the access profile's key headers and `Authorization`. |
| request and response bodies | – | yes | Personal data. Very large bodies are cut short. Without the `VIEW_PII` right they come back as `hidden: true`. |
| what went to the backing and came back | – | yes | Holds the backing's own status. |
| answers of each retry | – | *(unverified)* | Only when the API retries. |
| caller IP, content type, sizes | – | *(unverified)* | Stored on the row. |
| the backing's kind and automation | – | *(unverified)* | Stored on the row: `CALLABLE_WORKFLOW`, `WEBHOOK_WORKFLOW`, `SOUTHBOUND_API`, `LLM_MODEL` or `EVENT_STREAMS`, and the automation id and version. |
| automation run id | – | – | Not returned. The row's stored run id is often empty, so do not rely on it. Keep `runId` from `call_api`. |
| policy id | – | – | Not returned. The row's stored policy id is an old access profile field. It does not name the policy that refused the call. |

A call marked as a load test writes no row.

## What each status means, and whether it leaves a row

The order a call is checked in is in `api-groups`, under "A refused call names
the missing link". A call stopped at the path or at sign-in leaves no row. A
call stopped at any later step does. See `api-policies` for what each policy
checks, and `api-access` for sign-in.

| Status | Why | Row? | Counted as |
|---|---|---|---|
| 401 at sign-in | no key or token, or a wrong one; a switched-off access profile; or an access profile that does not list the API Group or does not allow this API | no | – |
| 404, no path matches | no API Group or API matches the path. The path is matched before sign-in. | no | – |
| 405, the path matches but no API there takes the method | the method is matched with the path, before sign-in | no | – |
| 403 | the API is switched off, or the caller's IP is blocked | yes | failure |
| 405 | the method is not one of the API's methods | yes | failure |
| 400 | a policy refused the request: a Request Validator, a Request Transformer, a missing idempotency key, or an API Filter that said no | yes | failure |
| 401 | a JWT Validation policy refused the token | yes | failure |
| 403 | a CORS, Request Validator or Request Transformer policy refused the origin or the protocol | yes | failure |
| 408 | the backing took longer than the timeout | yes | failure |
| 409 | the same idempotency key came twice inside its window | yes | failure |
| 429 | a rate limit or quota ran out | yes | policy violation |
| 500 | the backing failed and no fallback response is set, or a custom policy failed | yes | failure |
| any status | the backing's own answer: a Callable automation's `status` output, or an External API's status | yes | by its status |
| 200 at once | a Webhook API, which answers before its automation runs | yes | success |

A response with the `X-Cache: HIT` header came from the response cache, and the
backing did not run. `call_api` shows this as `cacheHit`. With a fallback response set, a failing backing answers
with that response's status instead of 500.

## Success, failure and policy violation

- **Success** (`succeeded` in `get_api_traffic`): status 200 to 399. Redirects count as successes.
- **Failure** (`failed` in `get_api_traffic`): status 400 or more, except 429. This holds every policy refusal that is not a 429, and 403s from IP lists and CORS.
- **Policy violation** (`policyBlocked` in `get_api_traffic`): status 429 only.
- **`onlyFailures`** on `list_api_calls`: status 400 or more, 429 included. It holds both of the counts above.

The screen puts its "3xx Redirect" tile under "Failed API Requests", but the
tile counts successes. Its "4xx Client" tile leaves 429 out.

## The three times

- **Time taken** (`avgTimeMs` on average): from the moment the call came in to the moment the answer left. The whole call.
- **Backend time** (`avgBackendTimeMs` on average): what the backing took: the automation, the model or the outside URL. The screen calls it "Downstream Execution" and "Resource Time".
- **The gap between them:** the API Platform's own time. The screen calls it "Average Latency" and "Latency". It is often under a millisecond, and the screen then shows the tile blank.

## What each Insights tile and chart shows

Every tile and chart uses the screen's date range and filter.

| Tile or chart | What it shows | Watch for |
|---|---|---|
| "Total API Requests" | every call in the range | Its "View Requests" arrow opens the call list. |
| "Successful Requests" | successes | |
| "Failed Requests", "Failed API Requests" | failures | Two tiles, one number. |
| "Average Execution Time" | average time taken | The whole call, despite the name. Leaves out 4xx calls. No change against before. |
| "Downstream Execution" | average backend time | Leaves out 4xx calls. |
| "Average Latency" | average gap | Leaves out 4xx calls. |
| "3xx Redirect" | redirects | Sits under failures, counts successes. |
| "4xx Client", "5xx Server" | failures by status class | 429 is left out of "4xx Client". |
| "API Requests Trend" | calls over time, stacked by status code | Days are UTC days. A long range can lose its last days. |
| "Top Endpoints by Request Count" | the APIs with the most calls, with successes, failures and policy violations | Only the top few. |
| "Endpoints by Highest Average Time Taken" | the slowest APIs, with backend time and gap | Only the top few. |
| "Status Codes" | calls by status | |
| "Top Clients by Request Count" | the clients with the most calls | Only the top few. |
| "Top Collections by Request Count" | a table of API Groups with calls, failures, successes and policy violations | Pages as you scroll. |

The screen fetches the count tiles' change against the same length of time
just before, but does not show it. `compareToPrevious` gives it. When nothing
changed, the change is 0 %. Otherwise, when the earlier value was zero it is
+100 %, and when the new value is zero it is −100 %.

The screen's time tiles leave out 4xx calls. `get_api_traffic` counts every
call in its averages, 4xx included, and says so. So its times can differ from
the screen's.

## The screen's filters and call list

- **Date range.** Presets run from today to the whole lifetime of the data, plus a custom range. The default is the last 7 days, today included. There is no "last hour" preset, so a person needs a custom range for it.
- **Filter button.** One free filter over the row's fields. There is no API Group, API or client picker: a person narrows by the API Group path, the API path, or the client.
- **Run History.** Opens from "View Requests" on the "Total API Requests" tile, with the same range and filter. Columns: Executed On, Endpoint Name, Status, Execution Time, Method, Path, Resource Type, API Collection. It searches by path. A row opens four tabs: Headers, Payload, Response and Timing.
- **Never shown on the screen:** a call's trace id and its client. To find a call by trace id, use `list_api_calls`.

## What each settings field does

### Settings: `get_api_settings` and `save_api_settings`

Both take `workspaceId` for one workspace. Leave it out for the tenant-wide
record. Which record a call uses when both exist has not been checked
*(unverified)*.

| Input | Screen | What it is |
|---|---|---|
| `traceHeaders` | Settings → Traceability ("Tracking Headers") | Names of request headers. When a call carries one, its value reaches the automation run. |
| `telemetry` | Settings → Open Telemetry Metrics ("Metric Configs") | `enabled`, a switch for all of them, and `metrics`, the list published for every call. Each metric has the fields below. |

### One telemetry metric

| Input (screen label) | Rule |
|---|---|
| `name` (Metric Name) | Required. Starts with a letter or `_`, then letters, digits and `_` only. The tool checks it. |
| `metricType` (Metric) | One of `API_EXECUTION` (a call counter), `API_EXECUTION_DURATION` (call time, a timer, the screen's default) or `API_RESOURCE_EXECUTION_DURATION` (backend time, a timer). |
| `publishIf` (Publish If) | Required. The choices depend on the metric type: read them with `describe_api_fields`, `kind` `telemetry_metric` and the `metricType`. The platform names `ALWAYS`, `SUCCESS` and `FAILURE`. The tool refuses a choice the type does not offer. |
| `tags` (Tags) | A list, each with a `key` and a `value`. A value can use `{{` to take a value from the call: `httpStatus`, `outcome`, `tenantId`, `userId`, `path`, `collectionPath`, `endpointId`, `collectionId`, `httpMethod`, `host`, `authType`, `apiClientId`, `cacheHit`, `endpointName`, `collectionName`. |
| `buckets` (Buckets, ms) | Only for the two timer types; the tool refuses them on the counter. Numbers, decimals allowed. With buckets, the timer is published as a histogram. |

### An API Group and an API: through `save_api_group` and `save_api`

These inputs are owned by `api-groups`. What they do at run time:

| Input | On | What it does |
|---|---|---|
| `logging` | API Group and API | Three switches: run, step (node) and variable logging. All on by default. Off on either turns it off for that call. The Insights row is still written. |
| `traceHeaders` | API Group | Used together with the list in Settings. |
| `telemetry` | API Group | Published first, then the metrics in Settings. Both are published. |

An API Group's execution tier (which runtime serves its path) is kept by the
platform. Read it; never set it.

Settings are cached for up to an hour, and a save clears the cache.

## Who can see and change what

- The Insights tab needs the view right on API reports.
- A person sees rows only for API Groups they can view, so their totals leave the rest out.
- Request and response bodies, and what went to the backing and came back, need the `VIEW_PII` right on API Groups.
- Reading and saving settings both need the view-settings right on API Groups. There is no separate right to change them, so anyone who can open Settings can change it.

## Known gaps

- **A search by `traceId` is untested.** The row's trace id is not marked as a field you can filter on.
- **How long a row takes to arrive was not measured.** It is seconds, not at once.
- **Insights can be switched off for a whole deployment.** Then no call leaves a row, and nothing in these tools can switch it on.
- **How long rows are kept** is set for each tenant by the platform team. With no setting, nothing is deleted *(unverified)*.
- **No percentile query exists anywhere in Insights.** Averages are all there is.
