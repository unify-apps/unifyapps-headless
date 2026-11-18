# Authentication methods, one by one

What each of the nine authentication methods needs, how a caller sends it,
whether its key can be rotated, and whether a key is shown once. Field names
are the stored ones, as `save_access_profile` takes them inside `auth`.
`describe_api_fields` with `kind` `access_profile` and the `authMethod` reads
the tenant's live form. Where the live form and this file differ, the live form
wins. Lines marked *(unverified)* have not been checked against the platform's
behaviour.

## Contents

- How the platform picks a method for a call
- Auth Token (`AUTH_TOKEN`)
- OAuth2 (`OAUTH2`)
- JSON Web Token (`JWT_TOKEN`)
- Basic Auth (`BASIC_AUTH`)
- No Auth (`NO_OP`)
- External Auth (`EXTERNAL_AUTH`)
- User Session (`USER_SESSION`)
- Custom Token (`CUSTOM_TOKEN`)
- Custom Workflow (`CUSTOM_WORKFLOW`)
- Methods no tool offers
- When a caller gets 401

## How the platform picks a method for a call

The caller never says which method it uses. The platform looks at what the call
carries and tries the method that fits.

| The call carries | Method tried |
|---|---|
| the `x-ua-cat` header or the `_cat` cookie | User Session |
| the `x-custom-auth` header | Custom Workflow |
| the `x-external-token` header | External Auth |
| `Authorization` starting with `Basic` | Basic Auth |
| `Authorization` starting with `Bearer` | OAuth2 |
| `Authorization` holding a token with no `Bearer` in front | JSON Web Token |
| nothing that fits a row above | Auth Token, Custom Token and External Auth |
| any call | No Auth lets it in when the group has an active No Auth access profile |

Only active access profiles that list the API's group and use that method are
tried. When the group has no such access profile, the platform tries global
access profiles of that method instead.

## Auth Token (`AUTH_TOKEN`)

The screen calls it "Auth Token". It is the most used method.

| | |
|---|---|
| Pick it when | a system calls with one fixed key. It is the plain choice for server-to-server calls. |
| Fields | `tokenInHeader` (on by default), `tokenInQuery` (off by default), `tokenKeyList` (the header or query names to look in, `api-token` by default), `tokenPrefix` (text the caller puts before the key). Most access profiles keep the defaults. |
| The save is refused when | both `tokenInHeader` and `tokenInQuery` are off, or `tokenKeyList` is empty. |
| How a caller sends it | the key in a header named in `tokenKeyList`, usually `api-token`, with `tokenPrefix` in front when one is set. With `tokenInQuery` on, a query parameter of that name works too. |
| The key | made by the platform. The caller sends it exactly as returned. |
| Shown once | yes, as `secret` in the create answer. |
| Rotate | yes, with `rotate_access_profile_key`. |

## OAuth2 (`OAUTH2`)

The screen calls it "OAuth2.0".

| | |
|---|---|
| Pick it when | the caller speaks OAuth2 and wants short-lived Bearer tokens instead of one fixed key. |
| Fields | `grantType`, required: `client_credentials`, `authorization_code` or `password`. It is stored in lower case, and the tool takes either case. `redirectUrls`: needed for `authorization_code`. `ttl`: how long a token lives, one hour by default. `accessTokenKey`: the name the token comes back under, `accessToken` by default. |
| Which grant | a machine calls with no person present: `client_credentials`. A person signs in through a browser: `authorization_code`. The caller holds a user's username and password: `password`. Other grants (implicit, device code) are not offered: say so, and do not pick the closest one. |
| How a caller sends it | two steps. First it asks the token URL that `howToCall` names for a token. It signs in there with Basic and its client id and client secret, and asks for the grant type the access profile holds. The token comes back under `accessTokenKey`. Then it calls the API with `Authorization: Bearer` and the token. |
| The key | the client id and the client secret. The platform makes both. The client secret is the secret. The client id stays readable. |
| Shown once | the client secret, as `secret` in the create answer. |
| Tokens | a token expires after `ttl`. A refresh token lives 30 days longer. `create_oauth_token` makes one Bearer token without the token URL, for `ttlMinutes` or the access profile's `ttl`. It changes nothing on the access profile. |
| Rotate | yes: a new client secret. Token requests with the old secret fail at once. Whether tokens already handed out keep working until they expire is *(unverified)*. |

## JSON Web Token (`JWT_TOKEN`)

The screen calls it "JSON Web Token". It is the method the create form picks
first.

| | |
|---|---|
| Pick it when | the caller signs its own tokens and the platform only checks them. |
| Fields | `algorithm`: `RS256` (the default), `RS384`, `RS512`, `HS256`, `HS384` or `HS512`. `rsaPublicKey` for an RS algorithm, in PEM (PKCS1 or PKCS8). `secret` for an HS algorithm. Optional: `reservedClaimsToEnforce` (any of `aud`, `exp`, `nbf`, `iat`, `jti`, `sub`, `iss`), `customClaimsToEnforce` (comma text), `acceptedIssuers`, `customClaimForKeyId`. |
| How a caller sends it | the signed token in the `Authorization` header, with no `Bearer` in front. With `Bearer`, the platform reads it as an OAuth2 token and refuses it with 401. The token's `kid` header must equal the access profile's key id. |
| The key | a key id the platform makes. It is not a secret: the caller writes it into each token's `kid`. `customClaimForKeyId` names a claim that carries it instead *(unverified)*. |
| Shown once | no. It is not a secret, so `howToCall` in `get_access_profile` shows it at any time. |
| Claims | each enforced claim is copied into a request header for the backing. The claim `ua-customer-id` picks the tenant. Whether a call to the tenant's own URL needs it is *(unverified)*. |
| Rotate | yes: a new key id. Every token must carry the new `kid` from then on. |
| Secrets the person gives | `secret`. Never repeat it. |

## Basic Auth (`BASIC_AUTH`)

| | |
|---|---|
| Pick it when | the caller can only send a username and a password. |
| Fields | `username` and `password`, both required. |
| How a caller sends it | `Authorization: Basic` and the Basic Auth token. The whole value must match the access profile's key. |
| The key | the Basic Auth token, which the platform builds from the username and password in base64url. A client that encodes the pair itself may not match for some passwords *(unverified)*, so hand the caller the returned token. |
| Shown once | the Basic Auth token, as `secret` in the create answer, and again after a change to `username` or `password`. |
| Rotate | no. Save a new `password` instead. That makes a new key, and callers still sending the old one are refused at once. |
| Secrets the person gives | `password`. Never repeat it. |

## No Auth (`NO_OP`)

| | |
|---|---|
| Pick it when | the APIs are meant to be public. Only then. |
| Fields | none. |
| How a caller sends it | it sends nothing. Any call to an API in the access profile's groups gets in, unless `allowedApis` leaves that API out. |
| Rules | a group holds at most one No Auth access profile; `save_access_profile` refuses a second. While it is active, a keyed access profile on the same group locks nothing. |
| The key | none to hand out. Reads show `NO_OP`. |
| Rotate | no. Switch the access profile off, or delete it, to close the door. |

The platform's default webhook client holds a No Auth access profile of its own.

## External Auth (`EXTERNAL_AUTH`)

The screen calls it "External Authentication". It is a switch with four kinds,
set in `externalAuthType`. `save_access_profile` refuses a save without it. Ask
the person which kind they mean: the form starts on `CUSTOM_AUTH`, but that is
not their choice. With nobody to ask, report `needs_confirmation`.
`describe_api_fields` with `externalAuthType` gives the fields
of that kind.

| `externalAuthType` | Fields |
|---|---|
| `OKTA` | `domain`, `clientId`, `clientSecret`, `grantType` (`authorization_code` by default); `scopes` optional |
| `OPEN_ID` | `grantType`, `accessTokenUrl`, `clientId`, `clientSecret`; `authorizationUrl` when the grant is `authorization_code`; `scopes` optional |
| `CUSTOM_OAUTH2` | the same as `OPEN_ID` |
| `CUSTOM_AUTH` | `externalAuthUrl`, `authHttpMethod` (`GET` or `POST`), `tokenFormat` (where the answer holds the token, such as `body.token`). Optional: `headers` and `queryParams` (each row needs a key and a value), `coverUpstreamHeaders` and `coverUpstreamQueryParams` (the names to take from the caller), `externalAuthTimeout` (five seconds by default, five minutes at most). |

| | |
|---|---|
| Pick it when | an outside identity provider already says who the caller is. |
| How a caller sends it | a token from its own identity provider, in the `x-external-token` header. The platform checks it with Okta, OpenID or the custom OAuth2 service. With no token, it tries the custom sign-in URL. |
| The key | none to hand out. The caller's identity provider issues its tokens. |
| Shown once | no. |
| Rotate | no. |
| Secrets the person gives | `clientSecret`. Never repeat it. |

## User Session (`USER_SESSION`)

| | |
|---|---|
| Pick it when | the callers are end users signed in to a platform app, and the app makes the call. |
| Fields | none. |
| How a caller sends it | the app user's session, in the `x-ua-cat` header or the `_cat` cookie. The sign-in a person uses to build in UnifyApps does not work, so it cannot be tried that way. |
| The key | none to hand out. |
| Rotate | no. |

## Custom Token (`CUSTOM_TOKEN`)

It is rarely used.

| | |
|---|---|
| Pick it when | the caller already holds fixed tokens of its own that must keep working. |
| Fields | `tokenKeys` (the header or query names), `validTokens` (the tokens callers may send), `tokenInHeader` and `tokenInQuery`. Set `tokenInHeader` or `tokenInQuery` yourself: the form starts with the header on, but a save that leaves both out stores both off. |
| The save is refused when | both `tokenInHeader` and `tokenInQuery` are off, or a valid token is already used by another access profile. |
| How a caller sends it | one of the valid tokens, in a header or query parameter named in `tokenKeys`. |
| The key | the person chose the tokens, so there is nothing new to hand out. Reads mask `validTokens`. A save that changes them returns no `secret`: the caller sends the tokens the person gave. |
| Rotate | no. Change `validTokens` instead. Callers still sending a removed token are refused. |
| Secrets the person gives | `validTokens`. Never repeat them. |

## Custom Workflow (`CUSTOM_WORKFLOW`)

| | |
|---|---|
| Pick it when | an automation must decide who gets in. |
| Fields | `workflowId`: the automation that decides. The form does not mark it required, but `save_access_profile` refuses a save without it. |
| How a caller sends it | the `x-custom-auth` header. The platform runs the automation, and the call gets in when the automation's output `body.authenticated` is true. What the automation receives is *(unverified)*. |
| The key | the value a caller sends in `x-custom-auth`. `save_access_profile` answers it once, in `secret`, on create; no read shows it again. |
| Rotate | no. The key never changes, so a leaked key works until the access profile is deleted. |

## Methods no tool offers

- **HMAC.** It has stored fields, but it never signs a caller in on its own, and the screen does not offer it.
- **Global access profiles and admin tokens.** `save_access_profile` refuses them. A global access profile made elsewhere still reaches every group that has no access profile of its method.

## When a caller gets 401

Sign-in answers 401 for any of these, for every method:

- no key, a wrong key, or a key in a header the access profile does not read;
- a JSON Web Token sent with `Bearer`, or an expired OAuth2 token;
- a switched-off access profile;
- an access profile that does not list the API's group, or whose `allowedApis` leaves this API out.

A 401 at sign-in never reaches Insights, so the answer the caller got is the
only proof of it; see `api-insights`. A JWT Validation policy also answers 401,
after sign-in, and that one does reach Insights; see `api-policies`. For 403,
404, 405 and 429, see the refused-call table in `api-groups`.
