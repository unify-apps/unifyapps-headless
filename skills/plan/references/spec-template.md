# Final spec templates (owner-replaceable defaults)

## Contents
- Technical Markdown default
- The visual page

Only three headings are required: `## Requested outcome`, `## Touches` and `## Ready when`, plus a `# <Title>`. Other headings are optional. When used, keep their exact names (the `★` suffix is optional).

- `## Requirements checklist` follows [requirements-checklist.md](requirements-checklist.md) and only gives warnings.
- `## Touches` entries are `kind · name · id`, with `new` for an uncreated entity. The id is always the last part. `kind` is one of `object`, `automation`, `app`, `page`, `code-app`, `connection`, `ai-agent`, `graph`; `app` and `page` are a no-code app, `code-app` a Code Builder app whose source is in git.
- `## Open questions` says `None` before acceptance.
- A deploy or publish is authorised only by a `deploy <automation name>` or `publish <app name>` line under `## Ready when`, naming its `## Touches` entry. `spec draft` refuses a line that names none.
- A Proof row ending in `[visual]` requires a screenshot.
- Contract and Proof follow [task-kinds.md § Facts every body follows](../../ua-change/references/task-kinds.md#facts-every-body-follows).

The visual page is made only when the person asks for it: add `--html` to `spec draft` or `spec revise`. The CLI renders it from the Markdown; never write or edit HTML. See § The visual page.

## Technical Markdown default

Keep only the sections this change needs.

```markdown
# <Title>

## Requested outcome ★
<Two or three sentences: who this helps, what they can do when it is done, how that improves today. The first paragraph becomes the solution description when it is empty.>

## Scope
<The named apps, pages, automations, objects and connections this changes. The chosen shape and the alternative it replaces.>

## Requirements checklist ★
<Only the rows of requirements-checklist.md that apply, in its row format.>

## Touches ★
- object · <name> · <id or "new">
- automation · <name> · <id or "new">
- app · <name> · <id or "new">
- page · <name> · <id or "new">
- connection · <name> · <id>
- code-app · <name> · <id or "new">
- ai-agent · <name> · <id or "new">
- knowledge-set · <name> · <id or "new">
- dataset · <name> · <id or "new">
- metric · <name> · <id or "new">
- experiment · <name> · <id or "new">
- api_group · <name> · <id or "new">
- api · <name> · <id or "new">
- client · <name> · <id or "new">
- access_profile · <name> · <id or "new">
- policy · <name> · <id or "new">
- env_variable · <name> · <name, or "new">
- connector · <name> · <connectorId or "new">
- graph · <name> · <id or "new">

## Current state (READ) ★
| entity | id | read | fact the plan depends on | READ / INFERRED |
|---|---|---|---|---|
| <object> | <id> | object get | <exact fields, constraints, row count> | READ |
| <new object> | <planned OBJ_ id> | get_objects on the planned id + search with the exact name | missing; no object of that name | READ |

## Contract ★
<Exact object fields, filters, uniqueness, links; each picklist's stored codes with their labels, and dates as epoch milliseconds. Exact automation inputs and result vocabulary. Exact page path (ending in a plain word, never `/`), data source, submit action and visible branch per result. A new app's `app look · <app>:` line, above every `job · <page>:` line and `design · <page>:` block of its new pages, written by the app-page-planner skill. `spec draft` refuses a new app or a new page without its lines. When pages pass values between them, one `state · <app>:` line per app names each value, its store, the page that writes it and the pages that read it.>

### Context graph
<Only when the change touches a context graph: the last part of `## Contract`, written with the `context-graph-design` skill. `plan propose` checks it.>

#### Acceptance questions
| Key | Question |
|---|---|
| Q1 | <question> |

#### Nodes
| Node | Key | Loaded by | Ref |
|---|---|---|---|
| <Node> | <key field> | sourceObject \| extraction \| loader \| records | <source object or extraction name> |

#### Edges
| Edge | From | To | Needed for | Attributes | Created |
|---|---|---|---|---|---|
| <EDGE_NAME> | <Node> | <Node> | <acceptance question key> | <edge properties, or —> | matched \| defined |

#### Node settings
| Node | Category | Enable permissions | SCD2 | Auditable | Colour | Tags |
|---|---|---|---|---|---|---|
| <Node> | core \| secondary \| derived | yes \| no | yes \| no | yes \| no | <token or —> | <tag names or —> |

#### Rules
| Node | Survivorship | Match rule | Data quality |
|---|---|---|---|
| <Node> | <default strategy; field: strategy> | <fields → AUTO_MERGE \| FLAG_FOR_REVIEW \| RELEVANCE_BASED> | <rule → REJECT \| ACCEPT_WITH_WARNING> |

#### Source objects
| Object | Discover & Enrich | Discoverer | Enricher | Scope |
|---|---|---|---|---|
| <source object> | none \| enrich_all \| discover | <name or —> | <name or —> | <which rows, or all> |
## Business rules
<Required information, duplicates, missing records, permissions, visible failure behaviour, platform constraints.>

## Proof ★
| entity | read-back | expected line |
|---|---|---|
| <object> | object get <id> | <both schema copies mirrored, every field the Contract lists> |
| <page> | get_page_outlines · get_blocks | <blocks by name, bindings> [visual] |
| <automation> | search_workflows | <deployment DEPLOYED, deployed version higher than before> |
| <app> | publish_app read-back · list_interface_versions | <a new published version with the plan note> |

## Ready when ★
- <observable result, in the user's words>
- deploy <automation name>
- publish <app name or AI agent name>

## Not proven when done
<What no read-back can establish, and the check that would.>

## Open questions ★
None
```

## The visual page

Made only when the person asks for it. `spec draft --html` renders it from the Markdown and opens it; `spec accept` renders it again from the accepted Markdown; `spec revise --html` renders it once more. A spec drafted without `--html` keeps no page. `spec render --md-file <path> [--out <path>] --json` previews any spec Markdown with no session. Never write or edit the HTML: the look lives in [spec-visual.css](spec-visual.css), [unifyapps-logo.svg](unifyapps-logo.svg) and [spec-visual.js](spec-visual.js), and restyling edits them, not code.

With `--html`, the Contract MUST give the page its entities and arrows, and `spec draft`, `spec accept` and `spec revise` refuse it otherwise. Without `--html`, `spec check` and `spec draft` only warn:

- Every `## Touches` entity has its own `### <kind> · <name>` heading in `## Contract`. A trailing ` · <id>` or `(…)` on the heading is allowed. The kind tells a page and an automation of the same name apart.
- Every relation bullet names a `## Touches` entity of its kind: `- Calls: <automation or AI agent> (<the action>)` and `- Opens: <page> (<the click>)` on a page; `- Reads: <object, dataset or knowledge set>, …` and `- Writes: <object or dataset>, …` on a page or an automation; `- Uses: <connection or connector>` on an automation.

Write one relation bullet for every connection the spec states, under the entity that does it. Write the headings in Touches order, each with one line under it saying what the entity is for: that line leads the entity's card. No check reads the order or the line, and a card without one says the Contract does not describe it.

The other facts a card shows, one `- Key: value` bullet each, when the change gives them: `Address`, `Shows`, `Loading`, `Empty`, `Error`, `Not found` on a page; `Holds`, `<name> codes`, `Unique`, `Indexes`, `Seed` on an object; `Runs when`, `Inputs`, `Steps`, `Can answer`, `Returns` on an automation; `Used for`, `Message`, `If it fails` on a connection; `Menu today`, `Menu after`, `Stays the same` on an app. The job line, design block and app look line sit under their entity's heading as before.

The page has one layout for every spec. It has no buttons that act: the person's yes stays in the chat. Its one script, `spec-visual.js`, opens and closes cards, filters them by kind, lights a box's arrows on hover, tracks the scroll in the contents rail and opens every card for print; `validateSpecHtml` allows that exact text and no other script, and the folder render checks a stored page the same way before it writes `specs/<name>.html`.

| Section | Read from | When that is missing |
|---|---|---|
| Overview: the app and its kind, the title, the outcome, Today → After, the Scope line | the `app` Touches line, `MOBILE` or `mobile app` in Current state or the constraints row, `## Requested outcome`, `## Today`, `## After`, `## Scope` | After is the observable `## Ready when` lines |
| Who it's for: role · how many · what they do | `## Who it's for` lines, `Name · count · what they do` | the `users_access` row, one line per `;` clause; left out with neither |
| What changes: the diagram (pages and code apps · automations and AI agents · the rest), then one card per `## Touches` entity | Touches, the Contract headings and their bullets | no arrows without relation bullets; no diagram with fewer than two boxes or one column; a card with no heading shows the checklist row that names it (`ui_states`, `data`, `integrations`) |
| How it moves: numbered steps, each with who acts | `## How it moves` lines, `Step · who · what happens` | the `workflow` row split at its `→` arrows; left out with neither |
| Rules | `## Business rules` bullets, `Title: rule` | the `rules` row split at `;` |
| When it goes wrong: what breaks · what the person sees · what happens to the data | `## When it goes wrong` bullets | the `failures` row split at `;` |
| Before you accept: assumed reads, the decisions, what was left out | INFERRED rows of `## Current state (READ)`, `## Requirements checklist`, `## Out of scope` | a Scope sentence that starts with "Excluded", "Out of scope" or "No other" |
| What goes live: each deploy and publish, and the rollout | the deploy and publish lines of `## Ready when`, the `rollout` row | "Nothing is deployed or published." |
| Done when | the observable `## Ready when` lines, the `acceptance` row, `## Not proven when done`, `## Open questions` | — |

A spec with no `## Requirements checklist` shows no decisions and none of the fallbacks from its rows. Proof rows, read commands and tool names stay in the Markdown.
