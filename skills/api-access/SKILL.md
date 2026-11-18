---
user-invocable: false
name: api-access
description: "Gives outside callers access to APIs in the UnifyApps API Platform (the API Manager screen): Clients, the Access Profiles inside them, the nine authentication methods (Auth Token API key, OAuth2 client id and client secret, JSON Web Token, Basic Auth, No Auth, External Auth with Okta or OpenID, User Session, Custom Token, Custom Workflow), which API Groups and endpoints a caller may reach, and keys that are shown once. Load it to create a client or access profile, hand out an API key or OAuth2 token, rotate or revoke a key, tell a caller which header to send, or find out why a call gets 401."
---

## What clients and access profiles are

A **Client** is one outside caller of your APIs: a partner, a system or an app.
You give it a name, a description, tags and a workspace. In the API Manager
screen it sits on the Clients tab.

An **Access Profile** belongs to one client and answers two questions: how that
caller signs in, and what it may reach. How it signs in is its authentication
method and the key that goes with it. What it may reach is a list of API Groups,
and, if you want, only some APIs inside them. A client can hold several access
profiles, for example one per method or one per set of groups.

A call gets through only when an active access profile lists the API's group and
the caller signs in the way that access profile expects. The whole chain a
working API needs is in `api-groups`.

Rights to an access profile come from its client. Whoever may edit a client may
create, change, rotate and delete its access profiles.

## The api-gateway MCP server

Every tool here is an MCP tool on the `api-gateway` server, bridged to the
signed-in tenant. Call them like any other MCP tool. There is no CLI.
**Every call takes `host`.** It is the signed-in tenant's `https://` origin, with
no path. A call without it goes nowhere.

Do not reach for the platform another way — an API Platform write
outside these tools has none of the guards they carry.

## Giving a caller access, in order

The order matters because the key exists in one answer only. Everything that
decides what the key can reach is settled before that answer arrives, and the
key is taken from it at once. A lost key can only be replaced by a rotation,
which locks out every caller using it.

1. **Find what the caller needs to reach.** `get_api_group` gives each group's APIs and the access profiles that can already call it. If an active No Auth access profile is on the group, anyone can already call it, and a new key locks nothing.
2. **Use or make the client.** `list_clients` with `search` finds an existing one, and `get_client` shows its access profiles. Otherwise make one client per outside caller with `save_client` (`workspaceId`, `name`, `description`). A client marked `managedBy` belongs to the platform, so make your own.
3. **Agree the authentication method with the person.** Use the table under "Which authentication method to pick". Then `describe_api_fields` with `kind` `access_profile` and the `authMethod` (plus `externalAuthType` for External Auth) lists the fields that method needs. Ask for every required value in one message. With nobody to ask, report `needs_confirmation`, naming the method you would pick and the values you need.
4. **Decide what it may reach.** In `groupIds`, list only the groups the caller needs. `allowedApis` is a map: each key is an API Group id, and its value is the list of API ids the caller may reach in that group. Add an entry only for a group where only some APIs are meant. A group with no entry in `allowedApis` opens every API in it.
5. **Create the access profile.** Its key goes straight to a private file (see "A key is shown once, and never repeated"): there is no choice to offer about keeping or showing it, since the key never reaches you to begin with. Call `save_access_profile` with `clientId`, `name`, `groupIds`, `allowedApis` and `auth` (`method` plus that method's fields). For Auth Token with its defaults, `auth` needs only `method` `AUTH_TOKEN`. It is saved switched on.
6. **Name the key file from that answer.** When the method has a key, the answer's `secretFile` is the private file the key was written to, marked `shownOnce`. Tell the person that path once, in your reply. NEVER open the file or print the key. A builder names it in a `Key file:` note instead.
7. **Tell the person how to call.** `howToCall` in the same answer names the header or query name, the prefix, the token URL for OAuth2, and the key id for a JSON Web Token. `get_api` gives the API's URL (see `api-groups`). Two things catch people. A JSON Web Token goes in `Authorization` with no "Bearer" in front. An OAuth2 caller first gets a token, then sends it after "Bearer". The reference file has every method.
8. **Read it back, then prove it.** `get_access_profile` shows whether it is active, which groups and `allowedApis` it holds, and its policies. Then prove it with `call_api` (see `api-insights`). For an OAuth2 access profile, pass its `profileId`, and `call_api` signs in with a token. For any other method, leave `profileId` out: `call_api` refuses any other `profileId`, and uses its own short-lived test caller instead. That proves the API answers, not that this key works. The caller's first real call proves the key. To run this access profile's policies on the test call, pass its id as `copyPoliciesFrom`; see `api-policies`.

## A key is shown once, and never repeated

- **You never see a key.** Only three tools return a key: `save_access_profile` (on create for a method with a key, and after a Basic Auth change), `rotate_access_profile_key`, and `create_oauth_token`. Each answers it in `secret`, marked `shownOnce`, and UnifyApps Headless's bridge takes it out before you see the answer: it writes the key to a private file, `.sessions/<sessionId>/secrets/<profileId>.txt` (an OAuth2 token to `<profileId>-token.txt`), readable by the owner only, and answers that file's path as `secretFile`. Every other answer masks the key, and no tool gives it back.
- A JSON Web Token access profile's key id is not a secret. Callers write it into every token, so reads show it in `howToCall`.
- Tell the person the key file's path once, in your reply. NEVER open, copy or print a key file: keep the key out of plans, specs, reports, notes, logs and replies. If the person asks for the key again, point them to the same file.
- **A builder keeps a key in its key file only.** An agent with nobody to ask makes the call: the key is already in the file the answer's `secretFile` names. It names only that file, in a `Key file: <path>` line in `notes`. It never writes a key into a report, a note or a reply. A rotation locks out every caller, so with nobody to ask it reports `needs_confirmation`, naming the call it would make, unless its message already carries the person's yes.
- Secrets the person gives are never repeated either: a Basic Auth `password`, a JSON Web Token `secret`, Custom Token `validTokens`, an External Auth `clientSecret`, and a JWT Validation policy's `secret`. Reads mask all of them. Pass them to the save, and never echo them in a reply, a plan, a report or an error.
- A lost key has one way back. `rotate_access_profile_key` works for Auth Token, OAuth2 and JSON Web Token access profiles only. It makes a new key, and the old one stops working at once, for every caller.
- Basic Auth and Custom Token access profiles cannot be rotated. Save new values instead. That locks out callers still sending the old ones. A Basic Auth change makes a new key and returns it once, as `secret`. A Custom Token change returns none, because callers send the tokens the person gave.
- An OAuth2 caller needs a token, not a new secret. `create_oauth_token` makes one and changes nothing.
- To stop a caller for now, switch its access profile off: `save_access_profile` with `active` set to false. It keeps its key and can be switched back on. A delete is for good (see `api-groups` for how deletes work).

## Which authentication method to pick

The platform picks the method from what the call carries, never from anything
the caller declares. Auth Token is the most used.

| Method (stored `authMethod`) | Pick it when | The caller sends | Rotate |
|---|---|---|---|
| Auth Token (`AUTH_TOKEN`) | a system calls with one fixed key | the key in the `api-token` header, or the header named in `tokenKeyList` | yes |
| OAuth2 (`OAUTH2`) | the caller speaks OAuth2 and wants short-lived tokens | a Bearer token, got from the token URL with its client id and client secret | yes |
| JSON Web Token (`JWT_TOKEN`) | the caller signs its own tokens | the token in `Authorization` with no "Bearer", carrying the access profile's key id as `kid` | yes |
| Basic Auth (`BASIC_AUTH`) | the caller can only send a username and a password | `Authorization: Basic` and the Basic Auth token | no |
| No Auth (`NO_OP`) | the APIs are meant to be public | nothing | no |
| External Auth (`EXTERNAL_AUTH`) | an outside identity provider (Okta, OpenID, a custom OAuth2 service or sign-in URL) already says who the caller is | its provider's token in `x-external-token` | no |
| User Session (`USER_SESSION`) | end users of a platform app call from that app | their app session | no |
| Custom Token (`CUSTOM_TOKEN`) | the caller already holds fixed tokens that must keep working | one of the valid tokens, in a header or query parameter it names | no |
| Custom Workflow (`CUSTOM_WORKFLOW`) | an automation must decide who gets in | the `x-custom-auth` header | no |

What each method needs, how the caller sends it, and why a caller gets 401 are
in [references/authentication-methods.md](references/authentication-methods.md).

## What a caller may reach

- A caller reaches the groups its access profile lists in `groupIds`, and nothing else.
- Inside each listed group it reaches every API, unless `allowedApis` has an entry for that group. Then it reaches only the APIs listed there.
- A group with no entry in `allowedApis` allows every API in it, including APIs added to it later.
- Sign-in checks all of this, for every method. A switched-off access profile, or one that leaves out the API's group or the API, gets 401. That call never reaches Insights.
- A caller that signs in can still get 403: the API is switched off, its IP is blocked, or a CORS, Request Validator or Request Transformer policy refused it. See `api-groups` for every status.
- An access profile has no list of HTTP methods. The API's own methods are the only limit.
- A No Auth access profile opens its groups to anyone, with no key.
- When a group has no active access profile of a method, the platform falls back to global access profiles of that method. No tool here makes one, but one made elsewhere reaches every group that has no access profile of its method.
- Read access from the access profiles, never from the client. `get_client` lists each access profile's groups and leaves out the client's own group list, which holds only the groups of its last saved access profile.
- Policies can go on an access profile too, with `attach_policies`. `get_access_profile` lists them in run order. Where they run and how they count is in `api-policies`.

## The tools

Every call
also takes `host`. Every save works the way `api-groups` describes: it merges
what you send, a list you send replaces the stored one, and `readBack` and
`notStored` say what stuck.

### Reading

- **`list_clients`** — find a client by name. Takes `workspaceId`, `search`, `limit` and `cursor`. Returns each client's id, name, number of access profiles and `managedBy`.
- **`get_client`** — one client with all its access profiles: method, active, groups, `allowedApis` and policies. Takes `clientId`. Keys come back masked. It leaves out the client's own group list.
- **`get_access_profile`** — one access profile, masked, with its policies in run order. It also gives `howToCall`: the header or query name, the prefix, the token URL for OAuth2, and the key id for a JSON Web Token. Takes `profileId`.
- **`describe_api_fields`** — the fields a method needs, read from the tenant's live form: type, required, default, allowed values, and when each field shows. Takes `kind` `access_profile`, `authMethod`, and `externalAuthType` for External Auth.

### Writing

- **`save_client`** — create or change a client. Takes `clientId` (to change), `workspaceId` (to create), `name`, `description` and `tags`. It takes no groups: a client's groups come from its access profiles.
- **`save_access_profile`** — create or change an access profile. Takes `profileId` (to change), `clientId`, `name`, `groupIds`, `allowedApis`, `auth` (`method` plus that method's fields), `active` and `tags`. It returns `howToCall`. **It returns a key once, as `secret`: on create for a method with a key, and after a Basic Auth change. Confirm first; with nobody to ask, report `needs_confirmation`.** What it checks:
  - It checks the method's fields against what `describe_api_fields` lists. Custom Workflow also needs `workflowId`, and External Auth needs `externalAuthType`. The tool never fills those two in by itself.
  - It refuses a group id that does not exist, and a second No Auth access profile on one group.
  - It refuses a new `clientId` on an existing access profile. To move one to another client, make a new one.
  - It still saves when stored group ids point at nothing, and names them in `deadGroupIds`. To drop them, send `groupIds` without them.
  - It still saves when a Basic Auth or Custom Token change will lock out current callers, with a warning. Confirm that too.
- **`rotate_access_profile_key`** — replace the key of a JSON Web Token, Auth Token or OAuth2 access profile. Takes `profileId` and `confirm`. **One-way: the old key stops working at once for every caller, and the new key is shown once, as `secret`. Confirm first; with nobody to ask, report `needs_confirmation`.**
- **`create_oauth_token`** — a Bearer token for an active OAuth2 access profile, for a test or to hand over. Takes `profileId` and `ttlMinutes`. It changes nothing on the access profile. **The token is shown once, as `secret`: confirm first; with nobody to ask, report `needs_confirmation`.**

### Deleting

Both deletes follow the steps in `api-groups`: a dry run first, because
`dryRun` is `true` unless you set it to `false`, then the real run.

- **`delete_client`** — delete a client and every access profile in it. Takes `clientId` and `dryRun`. The dry run gives `profileCount`, and the real run needs `dryRun: false` with that `profileCount`. **Permanent: every key of every access profile in it stops working. Confirm first; with nobody to ask, report `needs_confirmation`.**
- **`delete_access_profile`** — delete one access profile. Takes `profileId` and `dryRun`. The real run needs `dryRun: false` and `confirm: true`. **Permanent: its key stops working for good. Confirm first; with nobody to ask, report `needs_confirmation`.**

## Traps that answer 200 and do the wrong thing

- **Changing a Basic Auth password or a Custom Token's valid tokens.** The save answers 200, with a warning. Callers still sending the old values are refused from that moment. Only the Basic Auth change returns a new key.
- **Sending only the new group in `groupIds`, or only one group's entry in `allowedApis`.** What you send replaces what is stored. A `groupIds` list with one group drops the other groups. An `allowedApis` map with one entry drops the other entries, and each group left with no entry opens every API in it again. Send every group and every entry the access profile keeps.
- **Adding a keyed access profile to a group that has an active No Auth access profile.** The No Auth one still lets in any call with no key. To close the group, switch the No Auth access profile off or take the group off it, once the person agrees. With nobody to ask, report `needs_confirmation`.
- **Making a No Auth access profile to try an API.** It makes every API in its groups public, for anyone with the URL, until it is switched off. `call_api` needs no access profile to try an API.
- **Narrowing one group with `allowedApis`.** The access profile's other groups stay fully open: a group with no entry allows every API in it, and every API added later.
- **Taking a group off its last access profile of a method.** If a global access profile of that method exists, callers holding its key still get in.
- **Rotating an OAuth2 access profile to get a token.** A rotation replaces the client secret for every caller. `create_oauth_token` makes a token and changes nothing.
- **Giving a key to a caller of an External API.** That backing passes every caller header on to the outside URL, the key included; see `api-groups`. Tell the person before a keyed caller uses one.

## What no tool does

The api-gateway MCP server has no tool for these. When one is asked for, say
plainly that it is not available here and point at the API Manager screen. Do
not improvise a workaround through another surface.

- **Show a key again.** Nothing can, the API Manager screen included. A rotation makes a new one.
- **HMAC sign-in, admin tokens and global access profiles.** Not for agents; the screen does not offer HMAC either.
- **Share a client with people.**
- **See who changed an access profile, or when.** The screen's Activity tab shows it; no tool reads it.

## What has been checked, and what has not

**No tool here has ever run.** The `api-gateway` server does not exist, so
nothing in `## The tools` works today, and the steps above have not been carried
out end to end.

**The rules were checked against the platform's behaviour.** That covers how
each method signs a caller in, what makes a new key, what a caller may reach,
which methods and defaults are common, and that a client's group list follows
its last saved access profile. The screen words come from the API Manager
screens.

**These have not been checked yet:**

- whether a new key works on the first call or a few seconds later *(unverified)*. If a caller's first call gets 401, try once more after a few seconds.
- whether `get_api_group` lists global access profiles among those that can call a group *(unverified)*.
- whether OAuth2 tokens already handed out keep working after a rotation *(unverified)*.

**On a smaller model, take the steps one at a time, not batched together.**
That has not been tried across model sizes.

## Reference files

| File | Read it when |
|---|---|
| [references/authentication-methods.md](references/authentication-methods.md) | a method's fields, how a caller sends it, whether it rotates, or why a caller gets 401 is needed |
