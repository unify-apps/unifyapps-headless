# Secrets, environment variables and outbound calls

## Contents

- The rule
- Environment variables
- Keys the platform shows once
- Runs and error handling
- Queries and outbound calls
- What proves it

## The rule

**A secret is never typed into anything UnifyApps Headless writes.** A token, API key,
password, client secret, signing secret, private key, connection string,
session cookie or bearer value is read from an environment variable, or held
by a connection the platform signs in with.

Every place this must hold:

| Place | The rule |
|---|---|
| HTTP node (`custom_http_endpoint_execute`) | no secret in a header, `baseUrl`, `path`, query or body. When the API needs the tenant's credentials, pass `connectionId` in `op()`'s fourth argument (the node options), or read the value from `ENV.NAME` |
| variable node (`variable_by_unifyapps_*`) | never holds a secret. Its value shows in the run and to every node that reads it |
| code node (`code_by_unifyapps_javascript`, `_python`) | no secret in the source. Anyone who can open the automation reads it |
| connection | the platform holds the credential. Never repeat it in a plan, a report, a reply or an error |
| AI agent instructions, role, goal | anyone who can open the agent reads them. No credential, no internal URL with a token in it |
| record or sample row | no secret in sample data. A "test" key becomes a real key once someone copies the pattern |
| page binding, custom CSS, page code, app code | the browser gets all of it. Anything here is public to every user of the app |
| plan, report, reply | names of variables only, never values |

## Environment variables

In automation code, read a variable as `ENV.NAME`, for example
`Authorization: \`Bearer ${ENV.BILLING_API_TOKEN}\``. Never write `{{ name }}`
in a string: the platform reads every `{{ }}` as a node reference, and the save
fails.

**A wrong name does not fail.** A variable that does not exist, or a misspelled
name, saves fine and becomes an empty string at run time. The call then goes
out with an empty key, and the run can still look green. So prove it with a
test run of a node that reports only `configured: true` or `false`, never the
value (`automation-runtime` runtime facts).

Name variables so a review can find them: `<SYSTEM>_<PURPOSE>_TOKEN`, `_KEY`,
`_SECRET`, `_PASSWORD`. Settings that are not secret, such as a base URL or a
timeout, get a name with none of those endings.

**A secret reaches a variable through chat only.** When the person gives a
secret value, the main session saves it at once with `save_env_variables`
(`env-variables`), marked sensitive, and repeats it nowhere: not in code, a
plan, a spec, a task, a builder's brief, a report or a reply. A plan never
carries a secret. `fde-agent` builds the rest as `env-variable` tasks: a
setting that is not secret, whose value the spec states (a base URL, a
timeout), a change of `sensitive`, a share and a delete.

A build that reads a secret the person has not given yet still reads the
variable by the exact name it will have, and adds one `unverified` line:

```
Security: environment variable <NAME> does not exist yet — the person gives its value in chat, or creates it on the Environment Variables screen, marked sensitive
```

The task can still be `ok` when everything else is built and read back. Never
put a value in instead.

## Keys the platform shows once

Some API Platform writes answer with a key marked `shownOnce`:
`save_access_profile` on create, `rotate_access_profile_key` and
`create_oauth_token` (`api-access`). UnifyApps Headless's bridge takes the key out of the
answer and writes it to a private file, whose path the answer gives as
`secretFile`. So you never see the key.

Name that path in one `Key file: <path>` line in your report's notes. Never
open, copy or print the file, and never write the key anywhere. A rotation
breaks every existing caller at once, so it needs the person's yes in your
message. With no yes, ask the person through your report.

## Runs and error handling

- A run keeps every node's inputs and outputs. A secret that passed through a
  node is in the run, and so is a response that echoes a header back. Keep
  secrets in the one node that needs them, and never return or store a whole
  request or response that holds a secret.
- **Error handling can show what the normal path hid.** A `catch` that stores
  the failed request stores its header too. Store the status, the node and the
  other system's error id, not the request.
- **An error message is not for debugging.** A stack trace, a raw connector
  error, a SQL message, an internal host name or the full request shown to an
  end user helps an attacker. Show the user one sentence, and keep the detail
  in the run.

## Queries and outbound calls

- **SQL connectors** (`postgres`, `mysql`, `sqlserver`, `oracle`): values go
  in the operation's parameters, never into the query text. No query built
  from strings, and no caller input joined into SQL in a code node. This
  covers `LIKE` patterns and `IN` lists too. A sort column chosen by the caller
  is picked from a fixed list of column names, never passed through. Read the
  operation's parameter keys with `get_operation_schema`.
- **Analytics reports**: prefer a structured report. Use report SQL only when
  needed, with values bound through the operation's parameters (`unifyapps-data`).
- **Outbound addresses come from the build, not from data.** A host or full URL
  taken from a record, a page field, an AI agent's tool argument or a webhook
  body can reach internal services that nothing else can. When the requirement
  needs a caller-chosen address, check the host against a list the requirement
  names, matching the whole host, not part of the text.
- **A redirect target is set by the caller too.** A `returnTo` or `next` value
  sent into a redirect lets anyone send users to another site. Match it against
  a list of known paths.
- **A private storage path is not a public URL** (`files-and-attachments`).
  Never forward a signed-in or expiring URL to a connector that cannot use its
  credentials. Turn it into a file with the file operation first.

## What proves it

A read-back of what you wrote, not a memory of what you meant to write. Read
every HTTP node's headers and address, every variable node's value, every code
node's source and every agent instruction the task wrote, and check that each
secret is an `ENV.NAME` read, a connection, or absent. Put the variable names
in the report, and name the ones that do not exist yet.
