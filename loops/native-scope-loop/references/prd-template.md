# PRD template

## Contents

- The file
- The PRD part
- What each section answers
- The App plan part
- The Tickets part

The working copy is `R/prd.md`. `ua prd check --file R/prd.md` reads it,
`ua prd save` stores it as the open draft, and `docs/prd/<app>.md` shows
the version every teammate reads. A section heading is written exactly as
below: the check finds a section by its name.

## The file

```markdown
---
title: "Leave Management"
appId: "<the app's id, an existing app only>"
---
# PRD

<the sections below>

# App plan

<filled by the app-plan stage; empty until then>

# Tickets

<left empty: the tickets stage records them after filing>
```

## The PRD part

```markdown
## Outcome
Employees request leave on their phone and managers approve it the same day,
so HR stops chasing paper forms.

## Users and roles
- Employee · files leave requests, sees their own requests and balance
- Manager · approves or declines the requests of their own team

## Scope
In: leave requests, approvals, balances. Out: payroll export. Later: a public
holiday calendar.

## Current state
N/A — a new app.

## Journeys
- J1 · Employee applies for leave: opens Apply, picks dates, submits, sees Pending in My Requests
- J2 · Manager approves: opens Inbox, reads the request, approves; the employee sees Approved

## Requirements
### R1 · must · An employee applies for leave
- A1.1: A full-day request for tomorrow shows as Pending in My Requests.
- A1.2: A request longer than the balance is refused with "Not enough leave".
- Screens: S1, S2
- Journey: J1
### R2 · should · A manager approves a request
- A2.1: Approving a Pending request shows it as Approved to the employee within a minute.
- Screens: S3
- Journey: J2

## Screens
### S1 · Apply Leave
- Job: an employee files one leave request in under a minute
- States: saving, refused (names the field), saved
- Frame: https://www.figma.com/design/<file>?node-id=<frame>
### S2 · My Requests
- Job: an employee follows the status of their requests
- States: loading, no requests yet, offline (last list shown)
- Frame: none

## Data
Leave request: employee, start date, end date, type, status. Balance: per
employee and leave type, days left.

## Rules
A request may not overlap another approved request of the same employee.

## Integrations
N/A — no outside systems in the first release.

## Failures
A refused save keeps the form filled and names the field; an offline submit
waits and sends when the phone is back online.

## Quality
Lists open in under two seconds on a mid-range phone with 500 requests.

## Rollout
Built as drafts on UAT and tested by two HR users before the pilot team gets it.

## Open questions
- Q1 · Can a manager approve their own leave? · owner: HR lead · blocks: R2
```

Ids are written as shown: `J<n>` journeys, `### R<n> · must|should|could · <what>`
requirements, `A<n>.<m>` acceptance lines numbered under their `R<n>`,
`### S<n> · <name>` screens, `Q<n>` open questions. An id is never reused
for something else in a later version: a dropped requirement keeps its gap.

## What each section answers

| Section | Answers | May be N/A |
| --- | --- | --- |
| Outcome | who can do what, and the visible result that proves it worked | no |
| Users and roles | each role, what it sees and changes, and what a denied role sees | no |
| Scope | what is in, what is out, what waits for later | no |
| Current state | for an app being extended: the pages, objects and automations it has today | yes, a new app |
| Journeys | what starts each flow, its steps, and the result of each branch | no |
| Requirements | each requirement with its priority and its acceptance lines | no |
| Screens | each screen's job, its states (loading, empty, error) and its design frame | no |
| Data | the records, their fields and who writes them | yes, with why |
| Rules | validation, duplicates, calculations, state changes | yes, with why |
| Integrations | outside systems, notifications and AI agents, with what triggers each | yes, with why |
| Failures | invalid input, denied access, a failed dependency, no network, and how a person recovers | no |
| Quality | speed, volume, offline, realtime, languages, accessibility, security | no |
| Rollout | what stays a draft, who tests it, who gets it first | no |
| Open questions | each question, who answers it, and the requirement it blocks | yes, none open |

An acceptance line is something a person sees on the phone, or a record
shows, after named steps: "A full-day request for tomorrow shows as Pending",
never "leave works". Every must requirement has one line for the way it
fails, or its boundary.

An optional section that does not apply says `N/A — <why>`. A gap is never
left as TBD: it becomes an open question with an owner, or one of the
round's questions to the person.

## The App plan part

Written by the [app-plan stage](../../../skills/native-loops/loop-orchestrator/references/stages/app-plan.md):

```markdown
## Data model
- Leave request (new) · key fields: employee (user), start (date), end (date),
  type (picklist), status (picklist: Pending, Approved, Declined) · belongs to
  an employee · written by: employee (create), manager (status) · made in T0

## Look
app look · <the app-page-planner line>

## Screens
job · Apply Leave: for … · answers … · main action … · states … · signals …

## Roles and access
- Employee: their own requests. Manager: their team's requests.

## Navigation
Tabs: Home, My Requests, Inbox (managers only). Opens on Home.

## Automations
- Request submitted (record trigger) → notifies the manager · writes nothing

## AI agents
None.

## Integrations
None.
```

## The Tickets part

Left empty in the file. `ua prd tickets` records the filed tickets on the
approved version, once: a table, and the full list below it that the next
version compares its slices with.
