# API request steps (`api_request`)

Loaded the moment a scenario, or the person's own prompt, describes a step that calls an API — however it says so: a pasted `curl …` command, a plain description ("POST to /api/v1/apps with this body", a URL plus some headers), "call the API", "api req", "req api", "hit this endpoint", or any other phrasing meaning the same thing. This is never gated on matching one exact keyword or phrase — judge what the step actually asks for, not the words it happened to use. Also loaded for a request to verify a value a call returned. A scenario that never calls an API directly never loads this file, and its steps carry no `api_request`.

## Contents
- Turning the person's prompt into the step
- The step shape
- Address resolution
- Headers
- Body
- Saving a value from the reply, in the SAME step
- Reusing a saved value anywhere later
- Verifying a saved value — the `stored_value` assertion
- What never to author
- Worked example

## Turning the person's prompt into the step

**From a pasted `curl` command** — call the app-testing MCP's `parse_curl` tool with the command exactly as copied, `{ "command": "<the curl text>" }`; never hand-parse the flags yourself. It returns `{ method, url, headers, body?, notes }`, and the mapping into the step is direct, no reshaping:

- `method` → the step's `method`, already upper-cased.
- `url` → the step's `value` (quotes already stripped) — still subject to _Address resolution_ below; the tool only parses the text, it does not decide relative vs absolute for you.
- `headers` → the step's `headers`, already the ordered `{ "key", "value" }[]` shape the step wants.
- `body` → the step's `body` when present; already pretty-printed when it parsed as JSON, passed through as-is when it did not.
- `notes` → never discarded. `parse_curl` has already dropped every credential-looking header or option before returning (cookies, auth, API keys, session headers, and the platform's own `dpop`/`x-ua-at`/`x-ua-cat`), the same intent as the curl importer the Test Studio builder UI uses on its own paste box. Each entry says what it removed and why (`REMOVED_HEADER` / `REMOVED_CREDENTIALS` / `REMOVED_COOKIE`) — carry that into the step's `observations` verbatim. Never ask the person to repaste a "cleaned" curl; the tool already cleaned it.

A command the tool refuses comes back `isError: true` (not curl, no URL, an option it does not support, e.g. `-d @file`) — report its own message to the person, verbatim. Never hand-parse the command yourself to work around the refusal, and never retry it as a live request "just to see what it meant" (_What never to author_ and the HARD RULE below still apply: `parse_curl` never executes anything).

**From a plain description** (no curl pasted) — there is no tool for this path: take the method from the verb named ("POST", "send a GET", "call"), the address from the path or URL named, and `headers`/`body` only from what the person actually stated; never invent a header or a placeholder body to fill the shape. A description naming no body or headers produces a step with neither field.

**Strip credential headers yourself when the description itself pastes one.** A plain description that quotes a live header or cookie carries the same risk a curl command does, and `parse_curl` never sees it to clean it for you. Before any such header reaches the step, drop a header whose name — edges trimmed, case ignored — is exactly `cookie`, `set-cookie`, `authorization` or `proxy-authorization`, or contains `token`, `secret`, `api-key` (with or without the hyphen or underscore), `password`, `signature` or `session` anywhere in it, and the platform's own session headers by their exact names: `dpop`, `x-ua-at`, `x-ua-cat`. Note what you dropped in `observations`, the same as a `parse_curl` note; never ask the person to repaste a "cleaned" description — just clean it.

## The step shape

```jsonc
{
  "index": 3,              // required, like every step
  "action": "api_request", // required
  "method": "POST",        // required — GET | POST | PUT | PATCH | DELETE, upper-cased
  "value": "/api/v1/apps", // required — the address; see Address resolution
  "headers": [{ "key": "X-Trace-Id", "value": "<<var>>" }], // optional, ordered
  "body": "{\"name\": \"<<var>>\"}",  // optional — JSON text, a STRING, never an object
  "saves": [{ "into": "appId", "path": "entity.id" }],      // optional
  "user": "u_reviewer"     // optional, exactly like every other step (multi-user.md)
}
```

There is no separate `url` key — the address is the step's ordinary `value` field, same as every other step. Never author `label`, `candidates`, `timeout` or `checks` on this step: a label is derived from `method` + `value`, candidates do not apply (there is no element), there is no per-step timeout (the request itself is fixed at 30 seconds), and `checks` was tried on the platform side and removed (_What never to author_, below).

**HARD RULE — never execute the call yourself to author or "verify" it.** Unlike `execute_js`/`execute_js_verify` (which the rulebook MANDATES be dry-run live in the browser before shipping, `local-rules.md`, _Capture & runtime variables_), an `api_request` step is purely declarative and gets **no** author-time execution of any kind — not a `Bash` `curl`, not a `browser_evaluate` `fetch`, not a request made "just to see the response shape." It runs exactly once, inside the compiled test, when `deliver_steps`'s green gate runs it live — that run IS the verification. Hitting the endpoint yourself first is also a boundaries violation on its own terms (SKILL.md, _Boundaries_: outside the UI, only four specific non-UI requests are sanctioned, and an arbitrary API call is never one of them). A prompt phrased as an imperative ("call this API", "hit this endpoint") is still an instruction to **author the step**, never an instruction to run it now — read it the same way you'd read "click Save": as the action to put IN the test, not an action to take outside it. Calling `parse_curl` is not an exception to any of this: it never makes the request, it only tokenizes the text you hand it into `method`/`url`/`headers`/`body` — a pure offline transform, the same category as `extract_elements` or `generate_element_candidates`, not a live call.

## Address resolution

- A full address (`https://…`) is sent as written.
- A relative path (`/api/v1/apps`) resolves automatically against the **test subject's own deployed host** — there is no base-URL field to set on the step. Use a relative path for the app under test.
- Always author a full `https://` address when the call targets something other than the app under test (an external API, another tenant). A relative path with no base address configured fails at run time naming exactly that.

## Headers

An ordered list of `{ "key": …, "value": … }`, both plain strings; `value` accepts `<<token>>` substitution the same as `fill`'s `value` (_Capture & runtime variables_, `local-rules.md`). No implicit merging — each row is sent exactly as given. Leave `content-type` out when sending JSON: the runner adds `content-type: application/json` on its own whenever `body` is non-empty and no header already sets it — never author that header yourselves unless the call sends something other than JSON.

## Body

A JSON **string**, never a JSON object — author it as the text a developer would paste, pretty-printed. It must parse as JSON once every `<<token>>` is stubbed out: keep a token inside quotes (`{"name": "<<var>>"}`), never bare (`{"name": <<var>>}` only works when the field is genuinely numeric, e.g. `{"id": <<var>>}`). Leave `body` out entirely for a `GET`/`DELETE` that sends none.

## Saving a value from the reply, in the SAME step

`saves` sits on the `api_request` step itself — there is no second step and no separate tool call to keep a value from the reply:

```jsonc
"saves": [
  { "into": "appId", "path": "entity.id" },
  { "into": "authCode", "path": "auth_code" },  // a FLAT top-level field is a path too — just its bare key name, no dot
  { "into": "wholeBody" }              // the field left out entirely → the whole reply body, as text
]
```

- **`into`** — the variable name (letters, digits, `_`, `$`, not starting with a digit). A blank/missing `into` saves nothing silently — never send a placeholder row.
- **`path`** — dot/bracket syntax into the parsed JSON reply. When the reply is a flat object whose field sits at the top (`{"auth_code": "…"}`), the path is just that key's bare name — `auth_code`, no dot, nothing nested — and it is **required** for that field: a bare key is still a path, exactly as much as `entity.id` or `items[0].id` is. **Never leave `path` blank, and never read "leave the path empty to save the whole response" as license to leave it blank for a top-level field you DO want to pick out — blank saves the ENTIRE reply body as one text blob, not that one field; the two are not interchangeable.** Omit `path` (the whole field, not just its value) only when you deliberately want the entire raw reply saved.
- Every saved value is coerced to text, exactly like `store`'s and `execute_js`'s `into` — `<<name>>` substitution is always textual.
- A `path` that resolves to nothing **fails the step**, naming the path. There is no "optional" save.
- Two rows sharing one `into` is a validation error — each saved value needs its own name.
- **There is no way to save the HTTP status code.** Do not author `saves[].target`.

## Reusing a saved value anywhere later

The moment a value is saved, it is an ordinary stored variable — exactly like a `store` or `execute_js` step's `into` — in the **same shared bag every step writes to and reads from**. It is never limited to reuse inside another `api_request`: write `<<name>>` in any later step's existing value-bearing field — a `fill`'s `value`, a `navigate`'s address, another `api_request`'s `value`/`headers[].value`/`body`, or a `stored_value` assertion's `expected.value` (below). There is no separate "read a saved API value" step; it is the same `<<token>>` resolver documented in `local-rules.md`, _Capture & runtime variables_.

```jsonc
[
  { "index": 0, "action": "api_request", "method": "POST", "value": "/api/v1/apps",
    "body": "{\"name\": \"<<random:12>>\"}", "saves": [{ "into": "appId", "path": "entity.id" }] },
  { "index": 1, "action": "fill", "element": { …App ID field… }, "value": "<<appId>>" }
]
```

If reuse isn't working: check the `saves` row's `into` isn't blank, the `path` matches the reply's real shape (a wrong path fails loudly, naming itself), and the saving step runs before the reusing step in the compiled order — a token reads only what an EARLIER step stored.

## Verifying a saved value — the `stored_value` assertion

To check a saved value, author a **separate `assert` step** after it — the same one-assertion-per-step discipline every other check in this skill follows (`local-rules.md`, _assert — one flattened check per step_), even though the compiler also accepts the assertion written inline on the `api_request` step's own `assertions` list: this skill always uses the dedicated step, never the inline form.

```jsonc
{ "action": "assert", "assertions": [
  { "type": "stored_value", "expected": { "name": "appId", "value": "<<appId>>" } }
] }
```

- `expected.name` — the exact variable name some step in the test actually saves (an `api_request`'s `saves[].into`, or a `store`/`execute_js` step's `into`), checked against every save in the whole test. Naming a variable nothing saves is a compile-time error that lists the names it did find — never a typo'd guess.
- `expected.value` — the text to compare against; `<<token>>` substitution applies here too.
- The comparison is always exact text equality — there is no `match` option on this assertion.
- Needs no `element`: it is page-level, like `url` or `text_on_page`.

## What never to author

Three fields were tried on the platform side and removed. Authoring any of them is a defect, not a stricter check:

- **`expectStatus`** — there is no way to mark a non-2xx response as expected. Any non-2xx response **always fails the step**, full stop. A scenario that needs to assert a call fails is out of scope today: report it rather than inventing a field.
- **`saves[].target: "status"`** — the status code cannot be saved.
- **`checks`** on the `api_request` step itself — a response-body assertion belongs after the step, as a `stored_value` assertion on the value you `saves`, never as an inline `checks` list.

## Worked example

Create, then verify the created id, over two test cases' worth of pattern — provisioning (`local-rules.md`, _Provisioning is the one sanctioned JS setup_) stays JS-only; this is for a scenario that is itself ABOUT calling an API:

```jsonc
[
  {
    "index": 0,
    "action": "api_request",
    "method": "POST",
    "value": "/api/v1/apps",
    "body": "{\"name\": \"<<random:12>>\"}",
    "saves": [{ "into": "appId", "path": "entity.id" }]
  },
  {
    "index": 1,
    "action": "api_request",
    "method": "GET",
    "value": "/api/v1/apps/<<appId>>"
  },
  {
    "index": 2,
    "action": "assert",
    "assertions": [{ "type": "stored_value", "expected": { "name": "appId", "value": "<<appId>>" } }]
  }
]
```
