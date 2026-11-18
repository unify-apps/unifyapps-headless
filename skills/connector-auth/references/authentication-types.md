# The seven authentication types

What each type is for, the block of `save_connector_authentication` that holds
its settings, which of its values are secrets, and whether the platform fetches
its credentials again when they expire. A line marked *(unverified)* is not
confirmed yet.

## Contents

- [The types at a glance](#the-types-at-a-glance)
- [Inputs every type takes](#inputs-every-type-takes)
- [Each type's settings](#each-types-settings)
- [Where a value comes from](#where-a-value-comes-from)
- [What a read shows](#what-a-read-shows)

## The types at a glance

The "Block" column is the input that holds the type's own settings. A block of
another type is refused. Secrets are never shown back by a read: a literal one
reads `{ set: true }` or `{ set: false }`, a template is shown as written.

| `type` | Screen name | Use it when the other app's docs say | Block | Secrets | Refreshes |
|---|---|---|---|---|---|
| `TOKEN` | Access Token | send an API key or a personal token in a header | none | the value of a header or query parameter whose name says it is a credential | no |
| `BASIC` | Basic Auth | send a user name and password as HTTP Basic | `basic` | `password` | no |
| `OAUTH` | OAuth 2.0 | get an access token by OAuth 2.0 (authorization code, client credentials or password grant) | `oauth` | `clientSecret`, `password` | yes |
| `AUTH_10_A` | OAuth 1.0 | sign each call by OAuth 1.0a with a consumer key and a token | `oauth10a` | `consumerSecret`, `oauthToken`, `tokenSecret` | no |
| `JWT` | JWT Token | sign a JSON Web Token with a key, then trade it for an access token | `jwt` | `privateKey` | yes |
| `CUSTOM` | Custom | call a sign-in endpoint of the app's own design and keep what it answers | `custom` | none by name; headers, query parameters and body fields of its requests named like a credential | yes |
| `AWS_SIGNATURE` | AWS Signature | sign each call with AWS Signature Version 4 | `awsSignature` | `accessKey`, `secret` | no |

"Refreshes" is the only place `expiry` is taken. The tool refuses `expiry` on
`BASIC`, `TOKEN`, `AUTH_10_A` and `AWS_SIGNATURE`.

## Inputs every type takes

| Input | Needed | What it does |
|---|---|---|
| `connectorId`, `type` | yes | which connector, and which of its authentications. A connector has at most one of each type, so the type is the key. |
| `name` | for a new one | the label a person picks in the connection form |
| `description` | no | free text |
| `connectionFields` | for a new one | the form a person fills to make a connection, as a JSON Schema object with its fields under `properties`. Give each field a `title`. Give a secret field `format: password`. Each field is read as `{{input.auth.<field>}}`. `{}` clears it. |
| `headersOnEveryAction` | no | headers added to every action call, as a name-to-value map. It replaces the stored map, so send every header each time. |
| `retryOnError` | no | the Details tab's "Retry on Error". See the traps in SKILL.md before turning it off. |
| `expiry` | no | `OAUTH`, `JWT` and `CUSTOM` only: `refreshable` (true to fetch the credentials again when they expire) and `defaultExpirySeconds` (how long they last when the answer does not say). The unit is always seconds. |

A field left out keeps its stored value, a secret too. A map or a list that is
sent replaces the stored one: `headersOnEveryAction`, `scopes`,
`authorizationParams`, `additionalHeaders`, `jwtHeaders`, `jwtPayload`, and a
request's `headers` and `queryParams`.

## Each type's settings

### `TOKEN` (Access Token)

No block. The token is a connection field, and `headersOnEveryAction` sends it:
`Authorization: Bearer {{input.auth.token}}`, or `X-Api-Key: {{input.auth.api_key}}`.
The stored record has no token field of its own. The authentication adds
headers only, so an API that wants the key as a query parameter takes it in
each action's `queryParams` as the same reference.

### `BASIC` (Basic Auth)

`basic`: `username`, `password`. The platform builds the `Authorization: Basic`
header itself *(unverified)*. Leave `headersOnEveryAction` empty unless the app
also wants another header.

### `OAUTH` (OAuth 2.0)

`oauth`:

| Setting | Values | Notes |
|---|---|---|
| `grantType` | `authorization_code` (the default), `client_credentials`, `password` | authorization code needs a person to approve in a browser when the connection is made |
| `clientId`, `clientSecret` | reference or literal | `clientSecret` is a secret |
| `authorizationUrl` | URL | authorization code only: where the person signs in |
| `scopes` | list of text | one scope per item, never one string of joined scopes |
| `authorizationParams` | name-to-value map | extra query parameters on the authorization URL |
| `pkce` | true or false | authorization code only |
| `tokenUrl` | URL | where the access token is fetched |
| `tokenMethod` | `GET`, `POST` | send what the app's docs say. A new authentication starts at `POST` when its first save names the password or client credentials grant, as the screen does, and at `GET` otherwise. |
| `clientAuthentication` | `BASIC` (the default, "Send as Basic Header"), `REQUEST_BODY` ("Send in Request Body") | how the client id and secret reach the token URL |
| `username`, `password` | reference or literal | password grant only; `password` is a secret |

A new OAuth authentication gets `authorization_code`, `BASIC` and empty
`authorizationParams`, as the screen gives it. The access token the sign-in
fetches is read as `{{input.auth.credentials.access_token}}`. Set the header
yourself: `headersOnEveryAction` `{"Authorization": "Bearer {{input.auth.credentials.access_token}}"}`.
Whether the platform adds that header on its own when none is set is *(unverified)*.

### `AUTH_10_A` (OAuth 1.0)

`oauth10a`: `consumerKey`, `consumerSecret`, `oauthToken` (the screen's "Token
ID"), `tokenSecret`, `additionalHeaders`. None is required by the form.

### `JWT` (JWT Token)

`jwt`:

| Setting | What it is |
|---|---|
| `privateKey` | the key that signs the token; a secret |
| `signingAlg` | one the platform signs with, such as `RS256` (the screen's default) or `HS256`; any case; another is refused with the list |
| `expiryInSecs` | how long each signed token lives |
| `jwtHeaders`, `jwtPayload` | the token's header and its payload fields (`iss`, `sub`, `aud`, `scope`) as name-to-value maps. The platform sets `iat` and `exp` itself *(unverified)*. |
| `request` | the HTTP request that trades the signed token for credentials: `method`, `url`, `urlType`, `headers`, `queryParams`, `body`, `verifySsl` |
| `credentials` | what that request answers, as a JSON Schema object. Each field is read as `{{input.auth.credentials.<field>}}`. |

### `CUSTOM` (Custom)

`custom`:

| Setting | What it is |
|---|---|
| `request` | the HTTP request that fetches the credentials |
| `credentials` | what it answers, as a JSON Schema object; each field is read as `{{input.auth.credentials.<field>}}` |
| `refreshRequest` | the request that fetches them again. It reads the stored credentials as `{{rawPayload.credentials.<field>}}`, e.g. the refresh token *(unverified)*. |
| `expiryType` | `ABSOLUTE` (the answer holds the time they expire) or `RELATIVE` (it holds how long they last) |
| `expiryTime` | where that value is in the answer |
| `expiryUnit` | `SECONDS`, `MINUTES`, `HOURS` or `DAYS` |

### `AWS_SIGNATURE` (AWS Signature)

`awsSignature`: `mode` (`ACCESS_KEY`, the default; `IAM_ROLE`; `INSTANCE_ROLE`),
`region`, `serviceName` (e.g. `execute-api`, `s3`). `ACCESS_KEY` adds
`accessKey` and `secret`. `IAM_ROLE` adds `iamRole` (the role ARN) and
`externalId`.

## Where a value comes from

A template may only name a value. The tools refuse anything else; the full rule
is in `connector-build`.

| Reference | Holds | Used in |
|---|---|---|
| `{{input.auth.<field>}}` | what the person typed into a connection field | every type's settings and `headersOnEveryAction` |
| `{{input.auth.credentials.<field>}}` | what the sign-in fetched (`access_token`, or a field of `credentials`) | `headersOnEveryAction` of `OAUTH`, `JWT` and `CUSTOM` |
| `{{rawPayload.credentials.<field>}}` | the stored credentials, inside a refresh request | `custom.refreshRequest` *(unverified)* |

Connection values are stored on each connection, so every connection brings its
own. A literal value is stored on the connector, and every connection shares it.

## What a read shows

`get_connector_authentication` answers, for each type:

| Field | What it is | Screen tab |
|---|---|---|
| `type`, `name`, `description`, `grantType` | the authentication itself | Details |
| `connectionForm` | the connection fields, as a JSON Schema | Inputs |
| `connectionRequest` | the stored connection request: the type's settings, `actionAuthHeaders` (what `headersOnEveryAction` wrote), `enableRetry`, `refreshable`, `defaultExpiry`, `defaultExpiryUnit`, and the URLs, method, headers and body | Details |
| `credentialsSchema` | what the sign-in yields (`JWT`, `CUSTOM`) | Outputs |
| `note` | present when no connection request is saved yet: no connection can be made with it | — |

Read the grant from `connectionRequest.grantType`. An authentication may hold
it there and not beside `name`. `defaultExpiryUnit` is stored as `seconds`
or `SECONDS`; both mean seconds.
