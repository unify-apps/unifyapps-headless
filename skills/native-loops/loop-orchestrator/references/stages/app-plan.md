# Stage: app-plan

The scope loop's second stage: the whole app planned once, before it is cut
into tickets, so every ticket builds on the same data model, roles,
navigation and look. It writes the PRD's `# App plan` part and saves the
draft. It decides what to build, never how a page is laid out: each build
run designs its own pages.

## When it runs

After the PRD approval. A re-run revises the current version's plan for
what the new PRD version changes.

## 1. Data model

Load `ua:object-schema-designer` and plan from `## Data`, `## Rules` and the
journeys: one line per object, its purpose, its key fields with their types,
picklist values, how it relates to the others, who writes it, and the ticket
that makes it. An existing app's objects come from `ua cache obj` and are
marked `existing`; a field the PRD adds to one is marked `changed`. Indexes
and object ids are left to the build run.

## 2. Look and screens

Load `ua:app-page-planner`.

- A new app: its `app look` line, from the sources and the person's words.
- Every screen in `## Screens`: its `job · <page>` line. No `design` lines:
  the build run writes them with the design it gets.
- An existing app: no look line; job lines for its new screens only.
- On WEB the look line is the app at the design width (1440); the second
  width (375) is the responsive pass and gets no look of its own. A list
  screen is a table with filters and paging; a record is a page with a path.

## 3. The rest of the plan

- **Roles and access:** each role, the records it reads and changes, and
  what it is refused.
- **Navigation:** the tabs or menu (on WEB the chrome: a side bar or a top
  bar and its menu), the screen the app opens on, which screens each role
  reaches.
- **The kind of a new WEB app:** a code app, unless the person asked for a
  no-code app; the plan says which. An existing app keeps the kind
  `loops platform` answers.
- **Automations:** each one's trigger (a record change, a schedule, a tap),
  what it reads and writes, and whom it notifies.
- **AI agents:** each one's job, the records it reads, the screens that
  chat with it. `None.` when the PRD needs none.
- **Integrations:** each outside system, the connection it needs, what goes
  each way.

Write them into `R/prd.md` under `# App plan`, in the
[PRD template](../../../../../loops/native-scope-loop/references/prd-template.md)'s
shape, then `ua prd save <app> --file R/prd.md --base <base> --record-version <r> --note "App plan" --json`.

## Done when

Every requirement's screens, records and automations appear in the plan,
every screen has its job line, a new app has its look line, and the draft
with its plan is saved on the solution.
