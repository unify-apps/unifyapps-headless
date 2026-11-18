# Requirements checklist (a thinking aid)

These 12 rows (the ids in the table below) are a way to find what is still unclear. They are not a form to fill. Skip a row that does not apply. A spec does not need the `## Requirements checklist` section. When it has one, `spec check` only gives warnings.


## Row rules (when you write the section)

Each row is `- [x] <id>: <source> — <specific evidence>`, in the table's order, under `## Requirements checklist ★`. Sources:

- `USER`: an explicit decision from the person. Name the decision. Never write just "confirmed".
- `READ`: a named read and the fact it showed.
- `N/A`: the row is outside this change, with a concrete reason.

A row is weak when its evidence is blank, filler (`TBD`, "standard", "as needed") or vague ("it" with no subject). Never invent a decision or a read. Raw HTML outside code spans is rejected.

## Specific enough by category

| id | Evidence must settle |
|---|---|
| `outcome` | actor, action, observable result, and why it matters |
| `users_access` | roles or user groups, entry point, read/write permissions, and denied access; for an app, which of its two visibility values: `PUBLIC` (anyone with the link, no sign-in) or `PRIVATE` (sign-in needed, then permission groups decide; this is "tenant users only") |
| `scope` | named entities and target pages, included work, exclusions, and the boundary of this single change |
| `workflow` | trigger, ordered steps, branch conditions, inputs, outputs, and end state |
| `data` | source records, exact fields and types, required/default values, validation, mapping, and retention when relevant. For an object this is the entity's boundaries, relationships, keys and indexes from `object-schema-designer` — a field list alone is not settled. For an automation this is the exact fields it reads or writes on each record it touches. For an API group, API, access profile or policy this is its exact fields from `describe_api_fields` (path, methods, auth fields, policy config), not just that the entity exists |
| `rules` | business decisions, duplicate/missing-record behavior, precedence, limits, and calculations |
| `ui_states` | target page, controls and copy, plus success, empty, loading, error, disabled, and recovery states that apply; a named control, event, menu feature or setting needs a read (the tool's schema or the knowledge sheet) that shows the platform has it |
| `integrations` | named connection/system, authentication already available or required, payload, result, timeout, and retry behavior. For an automation this is every other automation or connector it calls. For an AI agent this is its tools and knowledge sources — never its model or safety limits, which belong in `constraints`, or its turn-by-turn behavior, which belongs in `workflow`. For an API, access profile or policy this is the caller's authentication method, the rate limit or timeout and which one connection or group it is scoped to, and the status code each failure gives (see `api-access`, `api-groups`, `api-policies`) |
| `failures` | concrete failure conditions, what the person sees, retry or rollback, and what must remain unchanged |
| `constraints` | platform limits, compatibility, privacy/security, performance, device/browser, deadlines, and non-goals |
| `acceptance` | observable examples, inputs and expected outputs, read-back or visual proof, and pass/fail boundary |
| `rollout` | whether to keep draft, deploy, publish, migrate, or backfill; environment, order, timing, and any stop-before-release boundary |

## How to use it

1. Before you ask anything, check each row that applies: is it settled by the request, a read, or the ledger?
2. Ask only the rows that are still open and matter for this change ([questionnaire-template.md](questionnaire-template.md)).
3. Run `spec check --md-file <path> --json` on the working Markdown at `.sessions/<sessionId>/drafts/<spec-slug>.md`. Read its warnings. Fix the real gaps.
