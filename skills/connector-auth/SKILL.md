---
user-invocable: false
name: connector-auth
description: "Gives a UnifyApps custom connector (the connector SDK, Connectors screen) its authentication: picks one of the seven types (Access Token, Basic Auth, OAuth 2.0, OAuth 1.0, JWT, Custom, AWS Signature), defines the connection fields a person fills, sets the type's settings with templates instead of literal secrets, the credentials, expiry and refresh, and the headers every action and trigger call sends, then reads it back. Covers how secrets are written and never shown back, why credentials belong in the authentication and not in an action's own headers, how connections relate to it, OAuth grants, and deleting an authentication. Load it to add, change, read or delete the authentication of a custom connector, built by hand or from an OpenAPI import, to sign its calls with an API key, token or OAuth before a publish, or when the person names the Authentications tab."
---

## Contents

- What a connector's authentication is
- The connectors-sdk MCP server
- Giving a connector its authentication, in order
- The tools
- Traps that answer 200 and do the wrong thing
- What no tool does
- What has been checked, and what has not
- Reference files

## What a connector's authentication is

A custom connector calls another app. Its **authentication** says how each call
signs in to that app. It sits on the connector's Authentications tab, and each
one has three tabs: Details, Inputs and Outputs.

There are seven types. The screen names them Access Token (`TOKEN`), Basic Auth
(`BASIC`), OAuth 2.0 (`OAUTH`), OAuth 1.0 (`AUTH_10_A`), JWT Token (`JWT`),
Custom (`CUSTOM`) and AWS Signature (`AWS_SIGNATURE`). **A connector has at most
one authentication of each type**, so the type is its key. A connector may have
several types; the person picks one when they make a connection.

An authentication has three parts:

- **Connection fields** (the Inputs tab): the form a person fills when they make a connection, such as an API key or a client secret.
- **The connection request** (the Details tab): the type's settings, the headers every action sends, retry, and expiry and refresh.
- **The credentials** (the Outputs tab): what a `JWT` or `CUSTOM` sign-in answers, such as an access token. The save sets them as `jwt.credentials` or `custom.credentials`; a read answers them as `credentialsSchema`.

The authentication is a template for connections. It never signs in by itself.
A **connection** is what a person makes from it, with their own values. An
automation runs each action with one connection.

This skill owns the seven types, secrets, the rule that credentials belong in
the authentication, how connections relate, and refresh and expiry.
`connector-build` owns the whole build, templates, publishing, how every save
and delete answers, and testing.

## The connectors-sdk MCP server

Every tool here is an MCP tool on the `connectors-sdk` server, bridged to the
signed-in tenant. Call them like any other MCP tool. There is no CLI.
**Every call takes `host`.** It is the signed-in tenant's `https://` origin, with
no path. A call without it goes nowhere.

Do not reach for the platform another way — a connector write outside these
tools has none of the guards they carry.

## Giving a connector its authentication, in order

Each step uses what the one before decided. The type decides which settings
exist. The connection fields decide what the settings can read. The read-back is
the only proof that it stuck. Nothing reaches a connection before a publish.
The whole build, from the connector to the publish, is the walkthrough in
`connector-build`; this is its authentication step.

1. **Find what is there.** `get_connector` lists the connector's authentications. `get_connector_authentication` with `connectorId` reads every one in full; `types` narrows it. Also read the actions with `get_connector_action`: a credential typed into an action's own headers belongs in the authentication (see the traps).
2. **Never replace a sign-in without asking.** A connector holds one authentication of each type, so a save of a type it already has changes that one: a new `name`, `connectionFields` or `headersOnEveryAction` replaces what is stored, and the save gives no warning. When the person asked to change that sign-in, change it. When they asked for a new or another one of a type the connector already has, stop and tell them first, naming it: "zz httpbin already has an Access Token sign-in, 'zz api key'. A connector holds one per type, so this replaces it: its `api_key` field and `X-Api-Key` header go, and connections made with it no longer match." Ask whether to replace it, change the existing one instead, or stop. With nobody to ask, report `needs_confirmation` with that line. After a replace, say that the old sign-in's fields can stay on the connection form until the connector is published again.
3. **Decide the type from the other app's docs.** Match what its API reference says about signing in to a row of [references/authentication-types.md](references/authentication-types.md). An API key or personal token in a header is `TOKEN`. OAuth 2.0 is `OAUTH`, with the grant the docs name. A sign-in endpoint of the app's own design is `CUSTOM`. **A type cannot change in place.** A save with another type adds a second authentication beside the first. To move connections to a new type, make the new one, and delete the old one only after the person agrees.
4. **Define the connection fields.** `save_connector_authentication` with `connectorId` and `authentications`, one item per type. Each item names its `type`; a new authentication also needs both `name` and `connectionFields`. `connectionFields` is a JSON Schema object: one property per value a person brings, each with a `title`, and `format: password` on every secret. Each field is read as `{{input.auth.<field>}}`.
5. **Set the type's settings, with templates.** In the same call, send the type's block: `basic`, `oauth`, `oauth10a`, `jwt`, `custom` or `awsSignature`. `TOKEN` has no block. A credential is a reference to a connection field, such as `clientSecret: {{input.auth.client_secret}}`, never the value itself. A template may only name a value; the full rule is in `connector-build`. For `OAUTH`, send `grantType`, `tokenUrl` and `tokenMethod` as the docs give them, and `clientAuthentication` when they do not want the client id and secret in a Basic header. A new authentication whose first save names the password or client credentials grant starts with `tokenMethod` `POST`, as the screen does. For `OAUTH`, the read and the save answer `callbackUrl`, the redirect URL the other app must accept: give it to the person to register in that app before anyone signs in. For `JWT`, `signingAlg` must be one the platform signs with; a refusal lists them.
6. **For `OAUTH`, `JWT` and `CUSTOM`: the credentials and their expiry.** `JWT` and `CUSTOM` take `credentials`, the JSON Schema of what their sign-in request answers. `OAUTH` always yields `access_token`. Each value is read as `{{input.auth.credentials.<field>}}`. Send `expiry` with `refreshable: true` and `defaultExpirySeconds` when the credentials expire. `CUSTOM` also takes `refreshRequest`, `expiryType`, `expiryTime` and `expiryUnit`.
7. **Set what every action sends.** `headersOnEveryAction` is a header map added to every action call. For `OAUTH` it is `{"Authorization": "Bearer {{input.auth.credentials.access_token}}"}`. For `TOKEN` it is the whole authentication, such as `{"Authorization": "Bearer {{input.auth.token}}"}`. It replaces the stored map, so send every header each time. Credentials never go in an action's own headers.
8. **Read it back.** The save answers as every save does (see `connector-build`). Report what `readBack` holds. `saved: false` with `violations` means the platform flagged something, such as a missing client id or token URL; fix it and save again. Every path in `warnings` is a credential typed in literally, which every connection now shares: replace it with a reference.
9. **Hand over the rest.** The change reaches connections and automations only after `publish_connector`, which is a release; see `connector-build`. Then a connection is made: the `connection` server's `create_connection` (see the `connection-manager` skill) makes one for a published custom connector with the values the person gives, and for the authorization code grant it answers a sign-in link the person opens. A connection made this way is active without its values being checked, because the platform does not test a custom connector's connection; only an automation run shows they sign in. Say so plainly: the connector is not usable until a connection exists.

## The tools

Every call takes `host` as well as the inputs named below. Each type's settings,
with their allowed values, are in
[references/authentication-types.md](references/authentication-types.md).

### Reading

- **`get_connector`** — the connector with its authentications: `type`, `name`, `grantType` and the connection fields of each. Takes `connectorId`.
- **`get_connector_authentication`** — authentications in full. Takes `connectorId` and `types`, a list of 1 to 7 types; every one the connector has when left out. Each answer holds `connectionForm` (the connection fields), `connectionRequest` (the Details tab, secrets masked), `credentialsSchema` (the Outputs tab) and `grantType`. A type the connector does not have goes to `notFound`, which names the types it does have.

Three things to know when reading:

- **An authentication can have no connection request yet.** The answer then has `connectionRequest: null` and a `note`. No connection can be made with such an authentication. One save with `save_connector_authentication` writes the request.
- **Read the OAuth grant from `connectionRequest.grantType`.** An authentication may hold it only there.
- **A `TOKEN` authentication stores no token.** The token is a connection field, and the header in `connectionRequest.actionAuthHeaders` reads it.

### Writing

- **`save_connector_authentication`** — makes or changes authentications, one per type: a save of a type the connector already has replaces that one, with no warning, so ask first (step 2). Takes `connectorId` and `authentications`, 1 to 7 items, each type once, each with `type`, `name`, `description`, `connectionFields`, `headersOnEveryAction`, `retryOnError`, `expiry`, and the type's block (`basic`, `oauth`, `oauth10a`, `jwt`, `custom` or `awsSignature`). It writes each authentication and its connection request together, as the screen's three tabs do, one item at a time. It answers per item, as the list writes in `connector-build` do.

Every save on the server answers the same way, and `connector-build` owns that
rule. What is particular to this one:

- A field left out keeps its stored value, a secret too.
- A map or a list that is sent replaces the stored one: `headersOnEveryAction`, `scopes`, `authorizationParams`, and a request's `headers` and `queryParams`. To add one header, send the ones already there as well.
- A new OAuth authentication gets the screen's defaults: `grantType` `authorization_code` and `clientAuthentication` `BASIC` ("Send as Basic Header").
- When the connection request of a new authentication cannot be saved, the tool deletes the new authentication again and says so. Nothing half-made is left.
- A credential typed in literally is saved and named in `warnings`, by its path: a named secret field of the type's block, a header of `headersOnEveryAction`, or a header, query parameter or JSON body field of the `custom` or `jwt` request, when its name says credential.

It refuses, and these are not to be worked around: a block of another type;
`expiry` on `BASIC`, `TOKEN`, `AUTH_10_A` or `AWS_SIGNATURE`, which the platform
never refreshes; a new authentication without `name` or `connectionFields`; a
template that is not a plain reference; a standard connector.

### How secrets are written and read

This skill owns these rules; `connector-build` points here.

- **A credential comes from the connection.** Write `{{input.auth.<field>}}`, and the person types the value when they make a connection. Each connection then holds its own, and the connector holds none.
- **The exception is OAuth's authorization code grant.** Its `clientId` and `clientSecret` are the connector's own app, as registered in the other app, and are written as they are. The platform builds the sign-in link before any connection exists, so a template that reads a connection value there is refused. Every connection signs in through that one app; each person's own sign-in happens in the browser.
- **A literal secret is stored on the connector and shared by every connection.** It travels with the connector, and every connection signs in as the same account. The save names each one in `warnings`.
- **No tool shows a secret back.** A literal secret reads `{ set: true }`, or `{ set: false }` when none is stored. A template is shown as written, because it is a reference, not a secret. This holds for the type's named secret fields, for a header or query parameter whose name says it is a credential, and for a body field named like one, at any depth (see the traps for what it does not cover).
- **There is no "shown once".** The platform never makes a secret here. To change a literal one, save the new value. A secret left out of a save keeps its stored value.
- **A masked value cannot be sent back.** A header map you send replaces the stored one, and a value that reads `{ set: true }` is not in your hands to resend. To add a header beside a literal credential, send the credential as a reference in the same call.
- **Credentials belong in the authentication, never in an action's own headers.** The authentication adds its headers to every action, so changing it changes them all. A credential typed into one action is shared by every connection, and the authentication never touches it.
- **The one exception is a key the API wants as a query parameter.** The authentication adds headers only. Put the reference, such as `{{input.auth.api_key}}`, in each action's `queryParams`, never the key itself.

### Deleting

`connector-build` owns how every delete works: the dry run, the count sent back,
and why a delete is for good.

- **`delete_connector_authentication`** — **one-way; confirm first; with nobody to ask, report `needs_confirmation`.** Deletes authentications by type, each with its connection request. Takes `connectorId`, `types` (1 to 7), `dryRun` and `usedByCount`. The first call is a dry run. It answers each type under `authentications` with its `connectionsUsingIt`, a type the connector does not have under `notFound`, and `usedByCount`, the total. An OAuth connection is counted under the grant it was made with. Show the person the connections. Then call again with the same `types`, `dryRun: false` and that `usedByCount`. Each type is then deleted on its own: `deleted` lists what went, and `failures` the rest, which makes the call an error.

**The connections stay.** No tool deletes a connection. After the next publish,
the connector no longer offers that type for new connections. Whether the
connections already made with it keep signing in is *(unverified)*. Tell the
person which connections to move to another type, and that a person moves them.

### Testing

`test_connector_action` never signs in: it sends the action's own request with no
authentication, so an API that needs one answers 401. See `connector-build`.

## Traps that answer 200 and do the wrong thing

- **A credential under a name that does not say so gets no warning and is shown back.** The warnings and the masking go by name: a header or query parameter named like `auth`, `token`, `secret`, `key`, `password`, `signature`, `cookie` or `session`, and a body field named like `password`, `secret`, `token`, `api_key` or `private_key`. A literal under any other name, or in a text body, is stored, shared by every connection, and shown on every read. Write every credential as `{{input.auth.<field>}}`, wherever it goes.
- **A credential in an action's own headers is shared and hidden from the authentication.** `save_connector_action` stores it and only warns. Every connection then signs in as one account, and changing the authentication does not change that action. Move the header to `headersOnEveryAction`, as a reference, and take it off the action.
- **The last save wins** *(unverified)*. Saving an authentication does not check whether someone changed it since it was read. A person editing the Authentications tab at the same time loses their change, or overwrites yours, with no error. Read it back after the save. When someone else may be editing it, say so in the report.
- **A save with another type does not change the type.** It adds a second authentication. The first stays, with its connections. Read with `get_connector_authentication` before a save, and change the one that exists.
- **A secret connection field without `format: password` is stored unencrypted on each connection.** The platform encrypts a connection value only when its field's format is `password` or `secure`. `save_connector_authentication` warns about a field named like a credential without it, but not about one named otherwise. Give that format to every key, secret, password and token field.
- **After five failed token refreshes, a connection goes inactive** *(unverified)*. Automations that use it stop until a person fixes the connection. Check `tokenUrl`, `clientAuthentication` and the `CUSTOM` `refreshRequest` against the docs before the publish. No tool warns about this.
- **`retryOnError: false` also stops the refresh after a 401** *(unverified)*. By default a call that gets 401 refreshes the token and tries again, and 429 and 408 are retried. Turning retry off turns all of that off. Leave it on for `OAUTH`, `JWT` and `CUSTOM`.

## What no tool does

The `connectors-sdk` server has no tool for these. Say plainly that it is not
available here. Do not look for another way.

- **Make a connection before the connector is published.** Until then, the `connection` server's `create_connection` finds no app to connect to.
- **Sign in for OAuth authorization code.** A person opens the app's sign-in page and approves. No agent can do it.
- **Check that sign-in works.** No tool signs in; what a test cannot show is in `connector-build`.
- **Send a `TOKEN` authentication's token as a query parameter.** It adds headers only; see the exception under "How secrets are written and read".
- **Change an authentication's type in place.** Make the new one, then delete the old one with the person's yes.
- **Show a stored secret.** No read shows one, and no tool can.

## What has been checked, and what has not

**The tools work only where the `connectors-sdk` server is live.** Until then,
nothing in `## The tools` can be done; say so when a job arrives.

**Known to hold:**

- a connector holds at most one authentication of each type;
- the platform returns stored secrets on every read of a connection request, which is why the tools mask them;
- the OAuth form defaults: `authorization_code` and `BASIC`;
- an authentication can have no connection request, and then no connection can be made with it;
- `create_connection` makes connections for a published custom connector (Basic, Access Token and OAuth client credentials were made and active), answers a sign-in link for the authorization code grant, and finds no app before a publish;
- for the authorization code grant, a client id that reads a connection value breaks the sign-in link, so the app's own values are written as they are;
- the OAuth grant may be stored only on the connection request;
- the expiry unit may be stored as `seconds` or `SECONDS`;
- a `TOKEN` authentication stores no token, only a header that reads a connection field;
- a credential can be stored in an action's own headers instead of an authentication.

**Marked *(unverified)*, because nothing has shown it yet:**

- a connection goes inactive after five failed refreshes;
- that saving an authentication does not check the version it was read at, so the last save wins;
- turning retry off stops the refresh after a 401;
- whether connections made with a deleted type keep signing in;
- whether OAuth adds a Bearer header when none is set;
- how a `CUSTOM` refresh request reads the stored credentials;
- that `BASIC` builds its header itself, and that `JWT` sets `iat` and `exp`.

**Not tried across model sizes.** On a smaller model, take the steps one at a
time.

## Reference files

| File | Read it when |
|---|---|
| [references/authentication-types.md](references/authentication-types.md) | picking a type, or writing a type's settings: what each type is for, its block and settings, its secrets, whether it refreshes, and what a read shows |
