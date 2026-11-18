# Policy types: what each does, its config, and how it blocks

These are the policy types known so far. A tenant may offer fewer or others.
Read the live list with `describe_api_fields` (`kind` `policy`), and a
type's form with `policyType` as well. Use this file as a guide to what a type
does and how it fails, never as the list of what exists. The field names below
are the keys of `config` on `save_policy`. Facts marked *(unverified)* have not
been checked against the platform's behaviour.

## Contents

- Which types exist
- The status each policy answers when it blocks
- Rate Limiting
- Usage Quota
- IP Based Access Control
- CORS
- JWT Validation
- Request Validator
- Request Transformer
- Response Transformer
- Timeout
- Cache
- Idempotency
- API Filter
- ACL
- What runs before any policy

## Which types exist

| Type | Name on the screen | Category | Direction | Where it runs |
|---|---|---|---|---|
| `RATE_LIMITING` | Rate Limiting | Traffic Control | inbound | in the line |
| `USAGE_QUOTA` | Usage Quota | Traffic Control | inbound | in the line |
| `IP_BASED_ACCESS_CONTROL` | IP Based Access Control | Security | inbound | before the line, every level joined |
| `CORS` | CORS | Security | inbound | in the line; alone in the browser's preflight check |
| `JWT_VALIDATION` | JWT Validation | Security | inbound | in the line |
| `REQUEST_VALIDATOR` | Request Validator | Traffic Control | inbound | in the line |
| `REQUEST_TRANSFORMER` | Request Transformer | Transformation | inbound | in the line |
| `RESPONSE_TRANSFORMER` | Response Transformer | Transformation | outbound | after the backing answers |
| `TIMEOUT` | Timeout | Miscellaneous | inbound | read apart, every level joined |
| `CACHE` | Cache | Miscellaneous | inbound | read apart |
| `IDEMPOTENCY` | Idempotency | Traffic Control | inbound | after the line, POST and PATCH only |
| `API_FILTER` | API Filter | Traffic Control | inbound or outbound | in the line, or after the backing answers |
| `ACL` | ACL | Security | inbound | nothing to set |

"The line" is the inbound run order: the access profile's list, then the API's
list, then the API Group's list. SKILL.md says how it works.

Tenants offer different policy types. Some offer `ACL`, which has no settings,
and not `IDEMPOTENCY`. `save_policy` refuses a type the tenant does
not offer and a type whose form is empty.

Only Response Transformer carries the outbound direction in its type. The
platform sets the direction from the type, so `save_policy` takes no direction.

## The status each policy answers when it blocks

| Type | Status | When |
|---|---|---|
| `RATE_LIMITING` | 429 | the count for the window is used up; the body carries `message` when it is set |
| `USAGE_QUOTA` | 429 | the count for the window is used up |
| `IP_BASED_ACCESS_CONTROL` | 403 | the address is on a block list, or allow lists exist and it is on none of them |
| `CORS` | 403 | the protocol is not in `protocols`; or `originRequired` is on and the call has no origin or one not on the list |
| `JWT_VALIDATION` | 401 | no token, a bad signature, or a claim that does not match |
| `JWT_VALIDATION` | 400 | a bad algorithm |
| `REQUEST_VALIDATOR` | 403 | the protocol is not in `protocols` |
| `REQUEST_VALIDATOR` | 400 | a content type not allowed, a body that breaks the schema, a missing parameter, a wrong data type |
| `REQUEST_TRANSFORMER` | 403 | the protocol is not in `protocols` |
| `REQUEST_TRANSFORMER` | 400 | a change that cannot be made |
| `TIMEOUT` | 408 | the backing did not answer in time |
| `IDEMPOTENCY` | 409 | the same key was used inside the window: "Duplicate request" |
| `IDEMPOTENCY` | 400 | the key is missing from the call |
| `IDEMPOTENCY` | 500 | the policy's config is broken |
| `API_FILTER` | 400 | the automation says not to go on and sets no status, or it fails ("Failure in API policy enforcement") |
| `API_FILTER` | 500 | the policy names no automation |
| `CACHE`, `RESPONSE_TRANSFORMER` | — | never block |

A policy that blocks and sets no status answers 400.

In Insights only a 429 counts as a policy block. A 403, 401, 400, 408 or 409
from a policy counts as a failure. See `api-insights`.

## Rate Limiting

`RATE_LIMITING` counts calls in a fixed time window and refuses the calls past
the count with 429.

| Field | Required | Allowed values | Default |
|---|---|---|---|
| `unit` | yes | `MINUTES`, `HOURS`, `DAYS`, in upper case | — |
| `duration` | yes | a whole number, 1 or more | — |
| `numberOfRequests` | yes | a whole number, 1 or more | — |
| `message` | no | text; it is sent back in the 429 answer | "API rate limit exceeded" |

- The window is `duration` times `unit`. It is a fixed window, not a rolling one.
- The form offers no seconds.
- The counter belongs to the policy plus the place it is attached. On an access profile, each access profile counts alone. On an API or an API Group, every caller counts together.
- Only a call that passes every inbound policy keeps its count. When a later policy blocks the call, the count is given back. A call that passes the policies and then fails in the backing still counts.
- A cached answer still counts, since the policies run before the cache is read.

## Usage Quota

`USAGE_QUOTA` works like Rate Limiting, with a longer window and its own
counter, so one access profile can hold both.

| Field | Required | Allowed values | Default |
|---|---|---|---|
| `unit` | yes | `DAYS` only | `DAYS` |
| `duration` | yes | a whole number, 1 or more | — |
| `numberOfRequests` | yes | a whole number, 1 or more | — |

- The form says "number of requests allowed per profile". That holds only when the policy is on an access profile. On an API or an API Group, the count is shared by every caller.

## IP Based Access Control

`IP_BASED_ACCESS_CONTROL` lets in or refuses a call by the caller's address.

| Field | Required | Allowed values |
|---|---|---|
| `allowList` | no | one text value: IPv4 addresses or CIDR ranges split by commas, spaces allowed after a comma |
| `blockList` | no | the same |

- Each list is one text value, not a list of values.
- It is checked before the line, after sign-in. The allow lists and block lists from the access profile, the API and the API Group are joined, so where it sits in a list changes nothing.
- An address on any allow list passes, even when another level's allow list leaves it out. An address on any block list is refused, even when it is also on an allow list.
- With no allow list at all, every address passes the allow check. Only the block lists can then refuse it.
- The address is the first entry of `x-forwarded-for`, or the connection's address when that header is missing. Behind a proxy chain, that first entry is what the chain puts there *(unverified)*.
- Blocks with 403.

## CORS

`CORS` sets which web pages in a browser may call the API.

| Field | Required | Allowed values | Default |
|---|---|---|---|
| `protocols` | yes, at least one | `http`, `https` | `https` |
| `origins` | no | a list of origins; an entry that starts with `~` is a regular expression | every origin |
| `originRequired` | no | true or false (Require Origin Header) | false |
| `methods` | no | `GET`, `POST`, `DELETE`, `PATCH`, `PUT`, `OPTIONS`, `HEAD` | all |
| `headers` | no | a list of header names | — |
| `exposed_headers` | no | a list of header names; `*` shows them all | — |
| `max_age` | no | seconds | 900 |

- With no CORS policy, every origin is allowed, with every header, every method and credentials.
- A call whose protocol is not in `protocols` gets 403. Every API URL is `https`, so leave `https` in.
- An origin that is not on the list is refused only when `originRequired` is on. With it off, the call and the backing run, and only the browser hides the answer.
- With `originRequired` on, every call without an `Origin` header gets 403. That is every server and script, and `call_api` unless its `headers` carry one.
- The browser's preflight check (an OPTIONS call) skips sign-in and reads CORS policies only: from the API, the API Group, and every active access profile on the group.

## JWT Validation

`JWT_VALIDATION` checks a signed token (a JWT) the caller sends in a header. It
is an extra check after sign-in, not a way to sign in. For sign-in, see
`api-access`.

| Field | Required | Allowed values | Default |
|---|---|---|---|
| `jwtHeaderKey` | yes | the header that holds the token, such as `Authorization` | — |
| `algorithm` | yes | `RS256`, `RS384`, `RS512`, `HS256`, `HS384`, `HS512` | `RS256` |
| `rsaPublicKey` | for `RS` types | a public key in PEM form | — |
| `secret` | for `HS` types | a base64 secret | — |
| `reservedClaims` | no | `iss`, `sub`, `aud` | — |
| `expectedIss`, `expectedSub`, `expectedAud` | when that claim is picked | a list of values | — |
| `customClaims` | no | a list; each entry is one claim, with a `name` and a `value` | — |

- `exp`, `nbf` and `iat` are always checked.
- The issuer and subject must match one listed value. The audience must hold every listed value.
- Blocks with 401 for a missing token, a bad signature or a failed claim, and 400 for a bad algorithm.
- A 401 from this policy is logged in Insights. A 401 from sign-in is not. See `api-insights`.
- Reads mask `secret`. Never repeat one the person gives; see `api-access`.

## Request Validator

`REQUEST_VALIDATOR` checks the request before the backing sees it.

| Field | Required | Allowed values |
|---|---|---|
| `protocols` | yes | `http`, `https` |
| `allowed_content_types` | no | a list of content types |
| `parameter_schema` | no | a list of rules, each with `in` (`QUERY`, `HEADER`, `PATH`), `name`, and `datatype` (`string`, `boolean`, `integer`, `number`, `array`, `object`) |
| `body_schema` | no | a JSON Schema written as text, not as an object |

- A call whose protocol is not in `protocols` gets 403.
- A call whose content type is not in `allowed_content_types` gets 400. With the list empty, any content type passes.
- Every parameter named in `parameter_schema` becomes required. A missing one gets 400, and so does a wrong data type.
- `body_schema` is checked only on calls sent as JSON. The form's help says `application/json` must be in `allowed_content_types` for this check.
- A stored `parameter_schema` can be one JSON Schema object, or hold other keys. Such a rule checks nothing the form means. `save_policy` checks the nesting against the live form, so it refuses those shapes.

## Request Transformer

`REQUEST_TRANSFORMER` changes the request before later policies and the backing
see it.

| Field | Required | Allowed values | Default |
|---|---|---|---|
| `protocols` | no | `http`, `https` | `https` |
| `transformation` | no | a list of changes | — |
| each change's `operation` | yes | `upsert`, `remove`, `rename`, `replace` | — |
| each change's `location` | yes | `header`, `queryParams`, `body` | — |
| `key` and `value` | for `upsert` and `replace` | text | — |
| `key` | for `remove` | text | — |
| `oldValue` and `newValue` | for `rename` | text | — |

- Blocks with 403 when the protocol is not allowed, and 400 when a change cannot be made.
- It runs in the line, so a Request Validator after it checks the changed request.

## Response Transformer

`RESPONSE_TRANSFORMER` changes the answer after the backing gives it. It is the
one outbound type a person can make.

| Field | Required | Allowed values | Default |
|---|---|---|---|
| `protocols` | yes | `http`, `https` | `https` |
| `transformation` | no | a list of changes | — |
| each change's `operation` | yes | `upsert`, `remove`, `rename`, `replace` | — |
| each change's `location` | yes | `header`, `body` (no query) | — |
| `key` and `value` | for `upsert` and `replace` | text | — |
| `valueType` | for `upsert` and `replace` on the body | `string`, `number`, `boolean` | — |
| `oldValue` and `newValue` | for `rename` | text | — |

- It runs only when the answer is 200.
- It never blocks. When it fails, the caller gets the answer unchanged and nothing says so.
- How this type behaves on a real call has not been checked *(unverified)*; its form is the only source.

## Timeout

`TIMEOUT` sets how long a call may wait for the backing.

| Field | Required | Allowed values | Default |
|---|---|---|---|
| `customizeTimeout` | no | true or false | false |
| `apiTimeout.duration` | when `customizeTimeout` is on | a number of seconds | 30 |
| `apiTimeout.unit` | hidden | `SECONDS` | `SECONDS` |

- With `customizeTimeout` off, the policy does nothing.
- Timeout policies from the access profile, the API and the API Group are read together. The smallest one wins.
- Any timeout policy beats the API's own timeout setting, even a longer one. With no timeout policy, the API's own setting holds. With neither, the platform's default holds: 300 seconds.
- A call that runs past the timeout gets 408.
- The form says "Timeout is limited to 240 seconds". That limit is not enforced.
- The API has its own timeout setting on `save_api`, and `save_api` warns when a policy overrides it. See `api-groups`.

## Cache

`CACHE` keeps the answer to a call and gives it to the next call with the same
key, without running the backing.

| Field | Required | Allowed values | Default |
|---|---|---|---|
| `cacheResponse` | no | true or false | false |
| `cacheSettings.ttl.duration` | yes, when `cacheResponse` is on | a whole number | 600 |
| `cacheSettings.ttl.unit` | yes, when `cacheResponse` is on | `SECONDS`, `MINUTES`, `HOURS`, `DAYS` | — |
| `cacheSettings.cacheKeys` | yes, when `cacheResponse` is on | a list of names of values in the call | — |

- With `cacheResponse` off, the policy stores nothing.
- Only one cache setting is used. A switched-on Cache policy wins over the API's own cache setting. When several apply, the first switched-on one wins, looked for on the API, then the API Group, then the access profile. That is not the run order.
- The key is the API plus the value of each cache key. Each value is looked for in the path values, then the query, then the headers.
- When any cache key is missing from the call, nothing is stored and nothing is read.
- Only 200 answers are stored.
- The key never holds the caller. Two callers who send the same values get the same stored answer.
- An answer from the cache carries the header `X-Cache: HIT`.
- Inbound policies still run on a cached answer. Only the backing is skipped.
- The form's help says the time is at most 3600 seconds. Its schema sets no limit *(unverified)*.
- A stored Cache policy can hold `cacheKeys` empty with `cacheResponse` on. It then stores nothing.
- The API has its own cache setting on `save_api`, and `save_api` warns when a policy overrides it. See `api-groups`.

## Idempotency

`IDEMPOTENCY` refuses the same POST or PATCH when it comes twice inside a time
window.

| Field | Required | Allowed values | Default |
|---|---|---|---|
| `identifierSource` | yes | `HEADER`, `PAYLOAD_FULL`, `PAYLOAD_SUBSET` | `HEADER` |
| `identifierHeader` | no | a header name | `X-Idempotency-Key` |
| `identifierFields` | when `PAYLOAD_SUBSET` | a list of body fields | — |
| `idempotencyWindow.duration` | yes | a whole number, 1 or more | 10 |
| `idempotencyWindow.unit` | yes | a time unit | `MINUTES` |

- It acts on POST and PATCH only. Other methods pass.
- It runs after the line. When the API and its API Group both hold one, the API's is used.
- It goes on an API or an API Group only, one for each list. `attach_policies` refuses it on an access profile.
- A POST or PATCH without the key gets 400, even from a caller who never heard of the policy.
- A second call with the same key inside the window gets 409 "Duplicate request". It does not get the first call's answer.
- The key is kept for each API and each client. Two access profiles of one client share it.
- A 4xx answer from the backing frees the key, so the caller can try again. A 5xx answer keeps it, so a retry inside the window gets 409.
- A broken config answers 500.
- Some tenants do not offer this type.

## API Filter

`API_FILTER` runs an automation on each call. The automation gets the request
and the answer, can change them, and says whether the call goes on.

| Field | Allowed values |
|---|---|
| `workflowId` | the id of the automation |

- The platform makes it. Deploying an automation that uses the API filter interface (inbound or outbound) makes or renames one. Deleting the automation deletes it.
- `save_policy` refuses this type, and `list_policies` marks it with `managedBy`. The screen cannot edit one either.
- `attach_policies` may attach it, because attaching is the only way to use one.
- While its automation is not deployed, it passes every call with no check.
- When the automation says not to go on, the call gets 400 unless the automation sets another status. When the automation fails, the call gets 400 "Failure in API policy enforcement".
- As an outbound policy, its result is ignored.

## ACL

`ACL` appears on some tenants as an "Access Control List" based on consumer
groups. Its form has no fields, so nothing can be set, and `save_policy` refuses
it.

## What runs before any policy

A call meets several checks before the first policy, and a call they refuse
never reaches a policy. The order of all the checks, and the status each gives,
are in `api-groups`, under "A refused call names the missing link".

Calls marked as load tests skip every policy.
