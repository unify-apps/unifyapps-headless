# Network rules and offline steps

Loaded the moment a scenario is about the network: a call that fails, a slow load, an answer the server sends that the test cannot cause through the app, or a user going offline. A scenario that is not about the network never loads it, and its payload has no `networkRules`.

## Contents
- Rule or offline step
- A rule's shape
- Which rule handles a call
- Conditions come from the walked call
- Walking a rule
- Walking offline
- Waiting on the app's own timer
- A rule that never acted
- Limits
- Two worked payloads

## Rule or offline step

There are two tools, and they do different things:

- **A network rule** acts on single calls: the calls it matches fail, wait, get an answer the rule gives, or go out changed. Rules belong to the whole case, not to a step: they sit in the payload's `networkRules` list beside `steps`, apply in every test user's browser from before step 1, and stay on for the whole test. A rule has no `user` field and no position in the steps.
- **`go_offline` / `go_online`** are steps, for an offline banner, presence dropping, a reconnect or work done while offline. `go_offline` takes the step's user's browser offline: new calls fail, and each websocket its pages opened is closed. The app's side sees close code 1006 (reason `Network connection lost`); the server sees a close with no status code (1005). A socket a worker opens is not affected and stays connected. `go_online` brings the browser back; reconnecting is the app's own job.

**Never let a rule stand in for test data.** A `respond` never supplies the records, ids or values the scenario is about: the test creates those through the app (_Self-provisioning_). A rule supplies only the failure, the slowness or the answer the scenario names. **Never add a rule, or change one, to make a red test green.**

## A rule's shape

```json
{ "id": "rule_save_fails", "name": "The first save fails",
  "conditions": [ { "field": "method", "op": "EQUAL", "value": "POST" },
                  { "field": "path", "op": "EQUAL", "value": "/api/workflow/execute/node" },
                  { "field": "call_number", "op": "EQUAL", "value": "1" } ],
  "action": { "kind": "fail", "error": "failed" } }
```

- **`id`** — a fresh id of the rule's own, unique in the list, such as `rule_save_fails`. **`name`** — the rule's label, in sentence case. Without one, the label is the rule's exact path or URL, shortened; else its leading condition; else `New rule`. `disabled: true` keeps a rule saved and skips it at run time; you never author a rule that is off.
- **`conditions`** — at least one. A call must meet **every** condition; there is no OR, so an alternative is another rule. `field` is `method`, `path` (the URL path, no host or query), `url` (the whole URL), `call_number`, or a field inside the call written `<source>.<path>` with source `body`, `header` or `query`: `body.context.resourceName` (a dot path into a JSON request body; a list item by its position, `body.items.0.id`; a form or text body has no fields), `header.x-trace-id` (any case), `query.page`.
- **`op`**, per field — `method`: `EQUAL`, `NOT_EQUAL`. `path` and `url`: `EQUAL`, `NOT_EQUAL`, `ICONTAINS`, `NOT_ICONTAINS`, `STARTS_WITH`, `ENDS_WITH`, `REGEX`. A body, header or query field: the same seven plus `EXISTS` and `MISSING`. `call_number`: `EQUAL`, `GTE`, `LTE`. `ICONTAINS` and `NOT_ICONTAINS` ignore case, the others do not. `REGEX` is an unanchored JavaScript pattern. `NOT_EQUAL` and `NOT_ICONTAINS` also match a call that lacks the field.
- **`value`** — always text, numbers included (`"2"`); omitted for `EXISTS` and `MISSING`. `method` takes `GET`, `POST`, `PUT`, `PATCH` or `DELETE`; `call_number` a whole number from 1. A body value that is not text is compared as its JSON text, so `42` equals `"42"`. **Values are literal**: a rule is set up before step 1, so a `<<token>>` inside it is never resolved.
- **`action`** — exactly one, by `kind`:

| `kind` | use it when | what the call gets | fields |
|---|---|---|---|
| `respond` | the app shows a server error, status or body | the rule's answer; the server never sees the call | `status` (100–599), `headers` (`[{ "key", "value" }]`, any name), `body` (text; valid JSON when a content-type header says json) |
| `fail` | a save fails, or the first fails and the retry saves (`call_number`) | a network error; it never reaches the server | `error`: `failed` unless the test needs a specific one — `connectionrefused`, `connectionreset`, `timedout`, `namenotresolved`, `aborted`, `accessdenied`, `addressunreachable`, `blockedbyclient`, `blockedbyresponse`, `connectionaborted`, `connectionclosed`, `connectionfailed`, `internetdisconnected` |
| `delay` | a loader shows, or the app copes with a slow answer | held for `seconds`, then sent on | `seconds`: above 0 and at most 60 |
| `change_request` | the server must refuse a forged value or an expired token | sent on, changed; it must change at least one thing | `setHeaders` (added, or replacing the header of that name), `removeHeaders` (names, any case), `body` (the new request body as JSON text; omit it to keep the app's) |

`change_request` refuses, to set or to remove, `set-cookie` and the headers the browser owns: `cookie`, `host`, `origin`, `referer`, `content-length`, `connection`, `accept-encoding`, `accept-charset`, `date`, `dnt`, `expect`, `keep-alive`, `permissions-policy`, `te`, `trailer`, `transfer-encoding`, `upgrade`, `via`, and any name starting `sec-`, `proxy-` or `access-control-request-`.

## Which rule handles a call

- **The list is ordered.** Each call is handled by the **first** rule that is on and whose conditions all match; a call no rule matches goes through untouched. Put a narrow rule before a broad one on the same call, or the broad one handles everything.
- **`call_number` counts per rule, per user's browser, from the start of the run**: the calls that meet the rule's other conditions, counted before the rule decides, **whether or not an earlier rule handled them**. `call_number` `EQUAL` `"2"` acts on the second such call only; `GTE` `"2"` on every call from the second on. Calls on page load count too, so count them in the walk (below).
- **A click whose call a rule fails or delays past about 2 seconds carries no `navigatesTo` or `revealsSelector`.** The run re-sends such a click until the page moves on, checking every 2 seconds for up to 15, and each re-send is a new call: it moves `call_number` on and can save twice. Check the outcome with the next step instead.
- **While a user is offline**, a call a rule matches fails as disconnected instead of getting the rule's action, and still counts toward that rule's call numbers.
- **A rule that is on must be complete**, or the compile is refused naming the rule (_Limits_ has the message shape).

## Conditions come from the walked call

**A matcher is copied from a call the walk saw, never guessed.** Trigger the call in the walk, then read it: as a helper, `requests` (each call numbered, with its method and URL) and `request-body <n>` for its body; in the main session's MCP browser, `browser_network_requests` and `browser_network_request`. Never print a call's headers: they carry the test user's session.

- **Narrow by default:** `method` + `path` (`EQUAL`), plus the body fields that tell this call from its neighbours. A builder app sends every record call to one path, so the body decides: `body.context.resourceName` (what kind of call, such as a create or a fetch) and `body.inputs.object_type` (which object), read off the walked body. A condition like `path` `ICONTAINS` `"/api/"` matches nearly every call the app makes: never.
- **`path`, never `url`, unless the host is the point.** The host differs between environments, so a `url` naming one never matches on another.
- **Count the calls before you pick a `call_number`**: `requests` after the walk's trigger shows how many calls met the conditions before the one the scenario means, page-load calls included.

## Walking a rule

Walk the scenario with the rule on, so every step and assert is what the app really does under it. Put the rule on **before the first page loads**, as the run does, matching and counting the same way: as a helper, write the function to a file in your `workFolder` and run `run-code --filename=<that file's absolute path>` in the browser, before its first `goto` and after `state-load`; in the main session, `browser_run_code_unsafe` before `browser_navigate`. With more than one user, put it on in every user's browser.

```js
async (page) => { const context = page.context(); context.walkSeen = 0; await context.route('**/*', async (route) => { const request = route.request(); let body = {}; try { body = JSON.parse(request.postData() ?? '{}') ?? {}; } catch {} const meets = request.method() === 'POST' && new URL(request.url()).pathname === '/api/workflow/execute/node' && body.context?.resourceName === 'storage_by_unifyapps_create_record' && body.inputs?.object_type === 'requests'; if (!meets) return route.fallback(); context.walkSeen += 1; if (context.walkOffline) return route.abort('internetdisconnected'); if (context.walkSeen === 1) return route.abort('failed'); return route.fallback(); }); return 'rule on'; }
```

The other actions in the walk: `route.fulfill({ status, headers, body })` for `respond`, a `setTimeout` promise before `route.fallback()` for `delay`, and for `change_request` the app's own headers with only the rule's change on top, as the run does: `const headers = { ...request.headers() }; for (const name of removeHeaders) delete headers[name.trim().toLowerCase()]; for (const { key, value } of setHeaders) headers[key.trim().toLowerCase()] = value; await route.fallback(body === undefined ? { headers } : { headers, postData: body });` (the rule's own `removeHeaders`, `setHeaders` and `body` written in). **If the page looks as it does with no rule on, check the rule caught its call before anything else**: `async (page) => page.context().walkSeen` after the trigger. 0 means the rule went on after the page loaded, or its conditions miss the call. Take the rule off when this scenario's walk is done: `async (page) => { await page.context().unrouteAll({ behavior: 'ignoreErrors' }); return 'rules off'; }`.

## Walking offline

`setOffline(true)` alone leaves open websockets connected, unlike `go_offline`. So walk it the way the step runs. Once, before the first page loads (where the rule above goes), route the user's websockets. This routing outlives `unrouteAll`, so walk each offline scenario in a fresh browser:

```js
async (page) => { const context = page.context(); context.walkSockets = []; await context.routeWebSocket(/.*/, (socket) => { context.walkSockets.push({ app: socket, server: socket.connectToServer() }); }); return 'sockets routed'; }
```

Go offline: `async (page) => { const context = page.context(); context.walkOffline = true; await context.setOffline(true); for (const { app, server } of context.walkSockets.splice(0)) { app.onClose(() => {}); server.onClose(() => {}); await server.close(); await app.close({ code: 1006, reason: 'Network connection lost' }); } return 'offline'; }`. Back online: `async (page) => { const context = page.context(); context.walkOffline = false; await context.setOffline(false); return 'online'; }`. With more than one user, run them in that user's browser only.

An offline window can outlast the app's own reconnect attempts. If recovery after `go_online` works only after a `reload`, record that in `observations` as a finding before you add the `reload`.

## Waiting on the app's own timer

An assert retries for only about 5 seconds in the run (more with `delay` rules on, _Limits_). A change the app makes on its own timer after `go_offline` or `go_online` (presence dropping after a heartbeat timeout, a retry after its interval) can take longer. When no `wait_for_*` can express it, put a `wait` right before that assert. **Measure the timer at least twice in the walk** and wait the longest you saw plus half again.

Measure inside the browser, never with a shell `sleep` (Claude Code blocks it, and a backgrounded one ends your turn, so the offline window grows until you are resumed): `async (page) => { await page.waitForTimeout(25000); return await page.locator('<locator>').count(); }`. Make going offline, each timed read and going back online consecutive calls with nothing between them, so the walk's offline window matches the test's.

## A rule that never acted

A rule that is on but never acted does not fail the run. The run output says so instead, one line per such rule, its calls totalled over every user's browser: `network rule "<label>": ` and why. No call matched it; or calls matched but it acted on none (its call number was never reached, or an earlier rule took them); or every call it would have acted on came while the user was offline. When the test failed, the first two end with `; the test stopped early, …`.

- **On a passing run**, the case is not done: it passed without the rule doing anything. Check the rule's conditions against the call the app really makes (_Conditions come from the walked call_).
- **On a failing run with the stopped-early suffix**, fix the failing step first: the rule's call comes after it.
- **On the offline line**, move the rule's call or the offline window so the call is made online.
- **Give every network scenario an assert that fails when the rule never acts**: the error, the loader, the retry the walk saw under the rule. An assert that would also pass with no rule on proves nothing about it.

## Limits

- **Service workers are blocked while any rule is on**, so every call reaches the rules. A browser with an extension keeps its service workers, so a call one answers from its cache is never seen by a rule.
- **A CORS preflight and a redirect's later hops cannot be matched**: a rule sees the app's own call only.
- **A `delay` raises the time limits** of the test and of every wait or check step without its own limit (about 5 seconds) by the sum of the delay rules' seconds times the number of users' browsers. Each rule counts once however many calls it holds, so a broad delay (no `call_number`, or `GTE`) can still run out the limit: pin a delay to one call. The whole test must still finish inside the green gate's limit.
- **Refused at compile**, stopping at `Convert Steps To Script`: one line per problem in a rule that is on, `network rule "<label>"[, field "<field>"][, at action.<list>[<row>]]: <message>`, with `field` for a condition and `at` for a header row. Fix what the message says.

## Two worked payloads

The first save fails and shows an error; the retry saves. Each save, the failed one included, gets its readiness pair before the next read.

```json
{ "steps": [
    { "index": 1, "action": "navigate", "value": "https://…/requests/new" },
    { "index": 2, "action": "wait_for_ajax" }, { "index": 3, "action": "wait", "value": 2 },
    { "index": 4, "action": "store", "from": "literal", "value": "<<random:10>>", "into": "requestTitle" },
    { "index": 5, "action": "fill", "element": { …the title field… }, "value": "<<requestTitle>>" },
    { "index": 6, "action": "click", "element": { …the Save button… } },
    { "index": 7, "action": "wait_for_ajax" }, { "index": 8, "action": "wait", "value": 2 },
    { "index": 9, "action": "assert", "assertions": [ { "type": "text", "element": { …the error message, as the walk saw it under the rule… }, "match": "contains", "expected": "…the error text the walk saw…" } ] },
    { "index": 10, "action": "click", "element": { …the Save button… } },
    { "index": 11, "action": "wait_for_ajax" }, { "index": 12, "action": "wait", "value": 2 },
    { "index": 13, "action": "assert", "assertions": [ { "type": "text", "element": { …the saved record's title… }, "match": "contains", "expected": "<<requestTitle>>" } ] } ],
  "networkRules": [
    { "id": "rule_first_save_fails", "name": "The first save fails",
      "conditions": [ { "field": "method", "op": "EQUAL", "value": "POST" },
                      { "field": "path", "op": "EQUAL", "value": "/api/workflow/execute/node" },
                      { "field": "body.context.resourceName", "op": "EQUAL", "value": "storage_by_unifyapps_create_record" },
                      { "field": "body.inputs.object_type", "op": "EQUAL", "value": "requests" },
                      { "field": "call_number", "op": "EQUAL", "value": "1" } ],
      "action": { "kind": "fail", "error": "failed" } } ] }
```

Offline shows the offline state; back online, the save goes through. No rule: `go_offline` and `go_online` are steps.

```json
{ "steps": [
    { "index": 1, "action": "navigate", "value": "https://…/requests/new" },
    { "index": 2, "action": "wait_for_ajax" }, { "index": 3, "action": "wait", "value": 2 },
    { "index": 4, "action": "store", "from": "literal", "value": "<<random:10>>", "into": "requestTitle" },
    { "index": 5, "action": "fill", "element": { …the title field… }, "value": "<<requestTitle>>" },
    { "index": 6, "action": "go_offline" },
    { "index": 7, "action": "assert", "assertions": [ { "type": "element_state", "expected": "visible", "element": { …the offline banner the walk saw… } } ] },
    { "index": 8, "action": "go_online" },
    { "index": 9, "action": "click", "element": { …the Save button… } },
    { "index": 10, "action": "wait_for_ajax" }, { "index": 11, "action": "wait", "value": 2 },
    { "index": 12, "action": "assert", "assertions": [ { "type": "text", "element": { …the saved record's title… }, "match": "contains", "expected": "<<requestTitle>>" } ] } ] }
```
