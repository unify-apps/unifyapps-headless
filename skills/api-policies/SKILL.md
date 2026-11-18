---
user-invocable: false
name: api-policies
description: "Puts rules on the calls to UnifyApps API Platform APIs, from the API Manager screen's Policies tab: rate limit and usage quota, CORS, timeout, cache, IP allow and block lists, JWT validation, request validator, request and response transformer, idempotency. Covers reading the policy types a tenant offers, saving a policy, attaching it to an API Group, an API (endpoint) or an access profile at a position, the fixed order policies run in, a rate limit for each caller versus one shared by all, and the status each policy answers when it blocks (429, 403, 401, 400, 408, 409, 500). Load it when a policy must be made, changed, attached, detached or deleted, when a call is blocked by a policy, or when asked why a limit is shared or a browser call is refused."
---

## What a policy is

A **Policy** is a rule the API Platform runs on the calls to an API. It can
limit how often a caller calls, refuse a caller by address or by origin, check
or change the request, change the answer, keep an answer for a while, or stop a
call that runs too long. The API Manager screen lists them under Policies.

A policy is made once and then attached by id to any number of API Groups, APIs
and access profiles. It does nothing until it is attached, and most stored
policies are attached to nothing. Each API Group, API and access profile holds
its own ordered list of policy ids. The policy holds no link back, so
`get_policy` works out where it sits.

Each policy has one type, stored by id (`RATE_LIMITING`, `CORS`, `TIMEOUT`...),
and a config whose fields depend on the type. The types differ by tenant, so the
list is read live, never taken from memory or from this skill.

Where a policy is attached decides which calls it runs on, and for a rate limit
or quota, who shares one count. The order it runs in is fixed by where it sits.
Only its place inside one list can be chosen.

## The api-gateway MCP server

Every tool here is an MCP tool on the `api-gateway` server, bridged to the
signed-in tenant. Call them like any other MCP tool. There is no CLI.
**Every call takes `host`.** It is the signed-in tenant's `https://` origin, with
no path. A call without it goes nowhere.

Do not reach for the platform another way — an API Platform write
outside these tools has none of the guards they carry.

## Putting a policy on calls, in order

Each step needs the one before it. The type list and its form come from the
tenant, so the config is right before the save. The save gives the `policyId`
the attach needs. Where it is attached decides who shares a limit. And a policy
on the wrong list is stored, answers 200, and limits nothing, so the proof reads
back where it sits.

1. **Read the policy types the tenant offers.** `describe_api_fields` with `kind` `policy` and no `policyType`. It gives each type's id, name, category, direction and description. Pick from this answer only. [references/policy-types.md](references/policy-types.md) lists every type known so far, as a guide to what each does, not as the list of what exists.
2. **Read that type's form.** `describe_api_fields` with `kind` `policy` and `policyType`. It gives each config field: its type, whether it is required, its default, its allowed values and when it shows. Build `config` from this answer.
3. **Look for a policy that already does the job.** `list_policies` with `type`, then `get_policy` on a match. `get_policy` shows every API Group, API and access profile that holds it. A change to a policy reaches all of them, so change a shared one only when that is what is wanted. Otherwise save a new one.
4. **Pick where it attaches.** A limit for each caller goes on the access profile. A limit that guards the backing goes on the API or the API Group. Read the two sections below before you choose.
5. **Save it.** `save_policy` with `name`, `type` and `config`, plus `policyId` to change one. Check that `notStored` is empty and that `readBack` holds the config you meant. When the save is refused, fix the config the answer names. Do not switch to another type to get past it.
6. **Attach it at a position.** `attach_policies` with `target` (its `kind`, one of `api_group`, `api` or `access_profile`, and its `id`), `policyIds`, and `position` (`start` or `end`). The answer is the new list in run order. Check the policy sits where you meant.
7. **Prove it.** First prove the config by reading it back. `get_policy` shows the stored config and every place the policy sits. `get_api` with `apiId` and a caller's `profileId` shows where it runs in that caller's run order. Then, when it is safe, prove it acts with a real call. `call_api` makes the call; `api-insights` says how to read its answer. Make one call that should pass and one that should be blocked. Check each status against the table in the reference. Every call that passes runs the backing for real, so use test data. Four limits on this proof:
   - Showing that a rate limit or quota blocks takes one call more than the limit, and each of those calls runs the backing for real. Prove blocking only on a test API with a small limit. Otherwise say plainly that the limit is set but not tested. Never send the limit plus one calls to a real backing without the person's yes; with nobody to ask, report `needs_confirmation`.
   - Without `profileId`, `call_api` signs in as a short-lived test caller that holds no policies of its own. To prove a policy on an access profile, pass that access profile's id as `copyPoliciesFrom`. The test caller then runs its policies, and a rate limit counts on the test caller, not on the real access profile.
   - A limit on an API or an API Group is shared with real callers. Calling past it to prove it uses up their count for that window too.
   - The call comes from the tool server's address, with no `Origin` header unless `headers` holds one. An IP allow list, or a CORS policy with `originRequired` on, refuses it, and the answer says which.

### Where a policy attaches decides who shares it

| Attached to | Runs on | A rate limit or quota counts |
|---|---|---|
| Access profile | calls signed in with that access profile, to any API it may reach | that access profile's calls only |
| API | every caller of that API | every caller of that API together |
| API Group | every caller of every API in the group | every call to any API in the group together |

A rate limit or quota on an API or an API Group is one counter shared by every
caller. For a limit per caller, attach it to the access profile.

- A counter belongs to the policy plus the place it sits. One policy on two APIs keeps two counters, one for each API.
- There is no counter per client. A client with two access profiles has two counters, one for each.
- An idempotency policy goes on an API or an API Group only, one for each list. When both hold one, the API's wins.
- Timeout and Cache policies and IP lists act from every level at once. The traps below say how they combine.
- The browser's preflight check reads CORS policies from the API, the API Group and every active access profile on the group. So put a CORS policy on the API or the API Group. On one access profile, it changes the preflight answer for every caller of the group.

### Policies run in a fixed order

On a real call, inbound policies run in this order: the access profile's list,
then the API's list, then the API Group's list, each in list order, then
idempotency. The first one that blocks stops the call. Nothing after it runs,
and the backing does not run. Rate-limit and quota counts already taken for that
call are given back, so a blocked call uses up no count.

- `get_api` with `apiId` and a caller's `profileId` lists every policy that caller's call runs, in this order.
- `position` moves a policy only inside one list. No tool makes an API Group policy run before an access profile policy.
- The order decides what a later policy sees. A Request Transformer on the access profile changes the request before a Request Validator on the API checks it.
- The order decides which status the caller gets. When two policies would both block, the caller sees the first one's status.
- Some types do not run in the line. The line is the run of the three lists, in the order above. IP Based Access Control is checked before it, with every level's lists joined. Timeout is read apart, so its place in a list changes nothing. Cache is read apart too, in its own order (see the traps). Idempotency runs after the line.
- After the backing answers, the same three lists run again for the outbound types: Response Transformer and an outbound API Filter. Their result is ignored, so an outbound policy never blocks.
- The browser's preflight check (the OPTIONS call a browser sends before the real one) skips sign-in and looks at CORS policies only.

## The tools

Every call
takes `host` as well as the inputs named below.

### Reading

- **`list_policies`** — find policies. Takes `type`, `search` (part of a name), `limit` and `cursor`. Each row has the id, name, type, direction and `managedBy`. A row with `managedBy` is owned by the platform and cannot be changed here.
- **`get_policy`** — one policy by `policyId`: its type, direction, config, and every API Group, API and access profile it is attached to. Read it before you change, detach or delete a policy. Secrets in a config, such as a JWT Validation policy's `secret`, come back masked.
- **`describe_api_fields`** — with `kind` `policy` and no `policyType`, the tenant's policy types with name, category, direction and description. With `policyType` as well, every config field of that type: type, required, default, allowed values and when it shows.

`get_api` with `profileId` gives one caller's whole run order; see
`api-groups`. `get_access_profile` gives one access profile's own list; see
`api-access`.

### Writing

- **`save_policy`** — make a policy, or change one by `policyId`. Takes `name`, `type`, `config` and `tags`. It reads the type's live form first. It refuses a config with a required field missing or a value the form does not allow, a type the tenant does not offer, a type whose form is empty, and `API_FILTER`. It saves the way `api-groups` describes, and returns `readBack` and `notStored`. A change reaches every place the policy is attached.
- **`attach_policies`** — put policies on a list. Takes `target` (its `kind`: `api_group`, `api` or `access_profile`; and its `id`), `policyIds`, and `position` (`start` or `end`). It refuses an idempotency policy on an access profile, and a second one on an API or an API Group, and says why. It may attach an API Filter policy the platform made: attaching is the only way to use one. It returns the new list in run order.
- **`detach_policies`** — take policies off a list. Takes `target` and `policyIds`. It returns the list that is left. The policy itself stays.

### Deleting

- **`delete_policy`** — takes `policyId` and `dryRun`. **One-way: confirm first. With nobody to ask, report `needs_confirmation`.** `dryRun` is `true` unless you set it to `false`. The dry run says how many API Groups, APIs and access profiles hold the policy, as `attachmentCount`. The real run needs `dryRun: false` with that `attachmentCount`, and takes the policy off all of them. It refuses a policy the platform owns. To take a policy off one place only, use `detach_policies`. How deletes work: see `api-groups`.

## Traps that answer 200 and do the wrong thing

The status each type answers when it blocks, and every config field, are in
[references/policy-types.md](references/policy-types.md).

- **A shared limit looks like a limit per caller.** A rate limit or quota on an API or an API Group counts every caller together, so one busy caller uses up the count for all. The Usage Quota form says "per profile", which holds only on an access profile. The count is a fixed window, so a caller can send the full count at the end of one window and again at the start of the next.
- **With no CORS policy, every origin is allowed.** The answer also allows credentials. The browser's preflight check looks at CORS policies only, so other policies do not change its answer.
- **A CORS policy lets a wrong origin through.** It refuses an origin that is not on its list only when Require Origin Header (`originRequired`) is on. With it off, the call runs and the backing runs; only the browser hides the answer. With it on, every caller that sends no `Origin` header gets 403: servers, scripts, and `call_api` unless you pass one in `headers`.
- **A policy whose `protocols` leaves out `https` refuses every call.** CORS, Request Validator and Request Transformer answer 403 to a call whose protocol is not on the list, and every API URL is `https`.
- **A cache policy stores nothing when any of its cache keys is missing from the call.** It stores only 200 answers. Its key is the API plus the cache keys' values and never the caller, so two callers who send the same values get the same stored answer. Name a cache key that tells callers apart when the answer depends on who asks.
- **Only one cache setting is used.** A switched-on Cache policy wins over the API's own cache setting. When several apply, the first switched-on one wins, looked for on the API, then the API Group, then the access profile. That is not the run order. `save_api` warns when a policy overrides the `cache` it is given; see `api-groups`.
- **When several timeout policies apply, the smallest one wins.** A short timeout on an API Group cuts every API in it. Any timeout policy also beats the API's own timeout setting, even a longer one. `save_api` warns when a policy overrides the `timeout` it is given.
- **A Timeout or Cache policy saved with its switch off does nothing.** A Timeout policy needs Customize Timeout (`customizeTimeout`) on, and a Cache policy needs Cache Response (`cacheResponse`) on. Both are off by default.
- **A Request Validator skips its body schema.** It checks `body_schema` only on calls sent as JSON. A call sent with another content type skips it, unless `allowed_content_types` refuses that type.
- **A Response Transformer runs only on a 200, and when it fails nothing says so.** The caller gets the answer unchanged.
- **An API Filter lets every call through.** The platform makes an API Filter policy when an automation that uses the API filter interface is deployed. While that automation is not deployed, the filter passes every call with no check.
- **An idempotency policy acts on POST and PATCH only.** Once it is attached, every POST or PATCH without the key gets 400, from callers who never heard of it too. Any 4xx answer frees the key, so a retry runs again. A 5xx answer keeps the key, so a retry inside the window gets 409 and not the first answer. The key is kept for each API and each client, so two access profiles of one client share it.
- **IP allow lists from every level add up.** An address on any one allow list passes, even when another level's list leaves it out. An address on any block list is refused, even when it is also on an allow list. With no allow list at all, every address passes the allow check. The IP check reads the first address in `x-forwarded-for`. Behind a proxy chain, that may not be the caller's own address *(unverified)*.

## What no tool does

The api-gateway MCP server has no tool for these. When one is asked for, say
plainly that it is not available here and point at the API Manager screen. Do
not improvise a workaround through another surface.

- **Make or edit an API Filter policy.** Deploying an automation that uses the API filter interface makes it, and deleting the automation deletes it. The screen cannot edit one either: change the automation.
- **Make a custom policy type.** `save_policy` refuses any type the tenant does not offer.
- **Share a policy with people.**

## What has been checked, and what has not

**The tools have never run.** The `api-gateway` server does not exist, so every
tool line above describes a planned tool, and the job above has not been
carried out end to end.

**Checked against the platform's behaviour, never seen on a live call:** the run
order, the given-back counts, the counter for each place, the smallest timeout,
which cache setting wins, the cache key, the idempotency rules, the joined IP
lists, the CORS rules and the status each type answers. Treat them as true, and
prove the one you rely on by the steps above.

**The policy types differ between tenants,** so read them with
`describe_api_fields`. Some tenants offer `ACL`, which has no settings, and not
`IDEMPOTENCY`. The forms in the reference were read live, except Idempotency's,
which was not seen on a live form. A stored policy can break its own type's
form, because the platform does not check a config on save. Such a policy may
hold a config that `save_policy` would now refuse, so a change to it needs its
config fixed too *(unverified)*.

**Not known:**

- How soon a new attachment reaches live calls *(unverified)*. A changed policy's cached copy is cleared on save.
- Behind a proxy chain, which address the IP check reads *(unverified)*.
