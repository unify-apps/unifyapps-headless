# Check: data

Does every data region get the right data, in every state, for every account
the page serves: a new account with no records, a missing record, an empty
input, a slow or failing source? On a WEB or a MOBILE app (§ On a WEB app).
Runs as [audit checks](../audit-checks.md) § The check agent says. Issues:
`DA<g>-<nn>`, `check: data`, `kind: data` or `state`. The automation side
follows the fetched UnifyApps Headless skills `ua:data-fetching`,
`ua:resiliency` and `ua:node-inputs-and-pills`, which
`ua:automation-agent` loads itself.

## Page side (the check agent, from the cache)

1. **Every source.** `ua cache ds <pageId> --app-id <appId>`: the
   callable it calls exists and is deployed (`ua cache wf <id> --contract`),
   its parameters match the callable's inputs by name and type, and it loads
   when the page needs it (`runQueryOnPageLoad`, `runBehaviour`).
2. **Every binding.** `ua cache deps <pageId> --app-id <appId>` and
   `ua cache blocks`: each bound path exists in the source's output
   schema; a path that may be undefined on first paint has a default (D02); a
   function's `dataSourceIds` match what it reads (rulebook P7).
3. **States.** Every data region has a loader (X1), an empty state and an
   error state (X4), worded as the design words them.
4. **One refresh per interaction** (P10) and **fetch once** (P11): read with
   the performance check's findings when both run; report each once, in the check that
   owns the rule (perf).

## Automation side (one read-only brief per automation)

```
Reads only: open_workflow, describe_callable_workflow, the last runs (list_workflow_runs,
inspect_workflow_run, limit 5). No save, no deploy. Answer with the node and the line:
1. A lookup or search whose result may be empty: is the empty case handled before a later
   node reads it (node-inputs-and-pills)?
2. A record that may be missing for a new account: does the run return the empty result
   with the outputs unchanged, or fail (trap A04)?
3. An input that may be empty: spliced into SQL or a filter unquoted (A03), or checked first?
4. A node skipped by a condition whose output a later Groovy step reads (A02)?
5. Connector or platform failures: retries, partial-failure behaviour, an error the page can
   show (resiliency)?
6. The query: filtered and sorted at the source, paged, only the fields needed (data-fetching)?
7. The last failed runs: the failing node and its error, one line each.
```

Each problem is an issue with `owner: automation:<id>`.

## Test runs (only where they write nothing)

When the check may run tests (an automation whose writes are none, or the
person allowed test runs in the run settings), run the `data-layer-check` workflow
with one entry per automation and outcomes `found`, `empty`, `missing record`
and `empty input`:

```
Workflow(name: "data-layer-check", args: {tenant, env, solution, uaCli, session, workFolders,
  automations: [{id, name, version, allowedEffects: [], outcomes: [{name, payload, expect}]}]})
```

Payloads use test ids, never a person's details. A verdict `differs` is an issue;
`unverified` stays `unverified` with the reason. An automation that writes is
never test-run in an audit: its issues are from the read alone.

## On the device

The performance check's `performance` request records each source call's status and time on
open; when `perf` is not in the focus, the data check queues that request itself
([performance check](audit-perf.md) § Device). A call that answers other than 200
(`forbidden datasource` before a first publish: `native-lint` trap T19) comes
back to this check as an issue.

## On a WEB app

The page side and the automation side are the same. The rulebook rules this
check uses (P7, X1, X4, P10, P11) hold on WEB, judged by the check agent from
the cache: `page-audit.mjs` refuses a WEB page. On the device, the
`performance` request runs [web-profile](../../../../web-loops/web-profile/SKILL.md)
in a test runner's browser (`loops queue add --kind performance --platform web`,
as the [performance check](audit-perf.md) § On a WEB app says), on the
preview route, where the saved draft's data sources run for real. Its calls
come from browser.mjs `calls` (the data-source name, the status, when it was
made), matched to resource timing for their time and size, so each step
file's `dataSources` holds the calls, the failed ones, the slowest and the
duplicates (the same source with the same body within 2 s, a 12-character
hash of the body, never the body). A call that failed or answered other than
200 is a `DA` issue naming the source and the step file in
`R/perf/<pageId>/steps/`; a duplicate is the performance check's P10 issue,
not this check's. A page whose data hangs on an input gets it in the preview
URL's query (`?requestId=…`), with a test id.
