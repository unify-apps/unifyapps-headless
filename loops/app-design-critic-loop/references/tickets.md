# Tickets from a review

The ticket stage writes the review's issues up the way the Test Studio ticket loop writes failing cases: one ticket per root cause, never one per issue, shown to the person once and filed only after their yes. The shared rules live in the ticket loop's reference, [ticket.md](../../app-test-ticket-loop/references/ticket.md): _What a root cause is_, _The ticket's fields_, _The tickets contract_, _Who is assigned_, _Dedupe_ and _The handoff_ bind here as written. This file holds only what differs when the input is a review.

`SKILL_DIR` is `${CLAUDE_PLUGIN_ROOT}/loops/app-design-critic-loop`; `RUN` is the run folder; `T` is `node SKILL_DIR/scripts/tickets.mjs`.

## What differs

| In the ticket loop | Here |
|---|---|
| a confirmed red (`classified.json`) | an issue of `RUN/merged.md` (`### C1 · <title>` and its field lines) |
| `cases`: execution ids | `cases`: issue IDs (`C1`, `H3`, `M2`) |
| the root cause named by the heal or triage read | the issue's root-cause key: the merger already grouped the same key across pages, so one key is one ticket to start with |
| `Fingerprint: nebula-test-bug/<fingerprint>` | `Fingerprint: nebula-review-bug/<fingerprint>`; the board search looks for both, so a defect a test run filed is found |
| idempotency key `nebula-test-bug:<app slug>:<fingerprint>` | `nebula-review-bug:<app slug>:<fingerprint>` |
| the firing's ledger | this folder's earlier runs: `T check --earlier ./app-critique` names a fingerprint an earlier run filed, with its key |
| `loop.mjs tickets-check`, `tickets-render` | `T draft`, `T check`, `T render` |
| the contract at `tests/<app slug>/tickets-contract.md` | the same file, shared with the test loops, so a team that runs both answers once |

A **nitpick** is listed in the report and never ticketed unless the person says so: `T draft` puts each in `notTicketed` with the reason `nitpick`, and `T check` refuses a nitpick inside a ticket. When the person asks for them (at the approval, or "file the nitpicks too"), run `draft` and `check` again with `--nitpicks`.

**Priority** starts from severity (critical → `high`, high → `medium`, minor → `low`) and the contract's rule raises it: `urgent` for data loss, a private page shown after sign-out, or a permission not enforced; `high` for an issue on the app's first page or its core task. **Layer** is `UI` unless the evidence shows a failed request from a service (`request-failed` with a 5xx) → `BE`, or cannot tell → `UI+BE`. **Module** is the page or area the first issue names, written as the contract's module owners name their areas.

## The commands

```bash
T draft  --merged RUN/merged.md --out RUN/tickets.json [--nitpicks]
T check  --tickets RUN/tickets.json --merged RUN/merged.md [--nitpicks] [--earlier ./app-critique] [--json]
T render --tickets RUN/tickets.json --merged RUN/merged.md --out RUN/tickets --app-url <url> --run <run folder name> --report RUN/report.md
T list   --tickets RUN/tickets.json --merged RUN/merged.md --out RUN/tickets-proposed.md
```

`draft` writes one ticket per root-cause key with its fields filled from the issues (observed from _What the user sees_, expected from _What good looks like_, the steps from _Steps to see it_, the evidence paths), and is the file you edit: merge two keys the user would see as one problem, split a key that holds two, write the title as `<page or component>: <the defect>`, set the module, layer and assignee, and add `related` lines from the dedupe. `check` exits 1 until every critical, high and minor issue is in exactly one ticket or one not-ticketed row with a fixed reason (`already filed <key>`, `not confirmed`, `person declined`, `nitpick`), every ticket has its fields, no issue is in two tickets and every fingerprint is a slug used once; at most five rounds, then stop and report the open items. `render` refuses while the check is not complete; it also writes `RUN/tickets-proposed.md`, the page the person reads before the approval (ticket.md, _The approval_), and `list` writes that page alone after a ticket was dropped or renamed.

## After the filing

Write what the person reports back onto each ticket in `RUN/tickets.json`, `filed: { key, id, url, status }` as read back, so the next run of this folder finds it (`T check --earlier`), and fill the report's `## Tickets` section: one line per ticket, `<key> · <title> · <priority> · <issue IDs> · <link>`, then the issues not ticketed with their reasons.
