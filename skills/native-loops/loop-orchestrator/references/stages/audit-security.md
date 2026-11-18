# Check: security

Can one user see or change another user's data, or a secret, through these
pages? The rules are `ua:ua-secure-by-default`'s six: locked by
default, identity from the server and never from the caller, a rule checked
where its state is stored, only the fields and rows a request needs, no secret
typed into anything, outside text kept as text. Runs as
[audit checks](../audit-checks.md) § The check agent says. Issues:
`SC<g>-<nn>`, `check: security`, `kind: identity` or `data`. Reads only:
a check never proves a hole by using it.

## Page side (the check agent, from the cache)

| Check | Read | An issue when |
| --- | --- | --- |
| Identity as a parameter (rule 2, house rule H1) | `ua cache ds <pageId> --app-id <appId>` | a data source parameter is bound to the user context, an email, a user id, a person number (an employee or PS number) or a page input that carries one |
| Identity as a page input | `ua cache keys <pageId> --app-id <appId>`, the page's declared inputs, and the events of the pages that open it (`ua cache events`) | a page takes "who" from its input (`userId`, `employeeId`, a person number) and passes it on; another page or an AI agent could open it with someone else's |
| A page filter as the only guard | the same reads | a Storage source filters one user's records by a value set on the page, with no automation owner check behind it |
| Locked by default (rule 1) | `ua cache app <appId>`, page settings | a `PUBLIC` app or page the person never asked for in their own words |
| Secrets (rule 5) | `ua cache grep` for key-, token- and password-shaped values in variables, constants, functions and custom code | a key, token or password stored on a page |
| Outside text (rule 6) | custom code and HTML attributes that render a value the page did not write | a record value or an agent's answer placed into HTML, a script or a URL |

## Automation side (one read-only brief per automation)

For each callable the pages in scope call (`ua cache wf <id> --contract`
for its inputs), brief `ua:automation-agent` (it preloads
`ua:ua-secure-by-default`):

```
Reads only: open_workflow and the last runs (list_workflow_runs, inspect_workflow_run, limit 3).
No save, no test run, no deploy. Answer per automation, with the node and the line:
1. Does it read or write records that belong to one user? Which object?
2. Where does "who" come from: USER.id (the server), or an input the caller sends
   (a user id, email, person number such as an employee or PS number, a case id treated as ownership)?
3. Is there an owner check (USER.id compared with a stored owner field, inside exists() checks),
   or a fetch filtered on the owner? One answer for "not found" and "not yours"?
4. Does it skip the permission filter, or return every field of the record?
5. Does it act on a state (approved, paid, quota) the caller passed, without reading it again?
6. Any token, key or password typed into a node, a variable or code?
```

Each yes on 2 (caller-sent identity), a no on 3, or a yes on 4–6 is an issue
with `owner: automation:<id>`, the node as `target`, and the quoted line as
`evidence`.

## Severity

- `critical`: an automation that trusts a caller-sent user id or person number
  to read or change one user's data; a page that passes identity as a
  parameter to such an automation; a secret stored on a page.
- `major`: a missing owner check behind a page filter; a public page the
  person did not ask for; a state check trusted from the caller.
- `minor`: a read that returns more fields than the screen shows.

## Fix hint

Name the change in the rule's words: "drop the `userId` parameter; the
automation reads `USER.id` and compares it with `ownerId`". An automation
issue keeps its `automation:<id>` owner and becomes an automation job in the
fix loop, the hint as its fix hint; a change to the automation's inputs (the
`userId` parameter dropped) reaches its callers, which the job's impact
analysis turns into jobs too. A control no tool can
set (a role, an environment variable) is written as the rule's
`Security: <control> is not set — needs <who> to <do what>` line in `fix hint`.
