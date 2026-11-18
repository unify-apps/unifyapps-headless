# Look — the deployed app, on the blast radius only

## Contents
- What this stage is for
- Which surfaces
- Signing in
- What is never touched
- What to confirm on a surface
- The notes
- When a role has no test user
- When there is no browser

## What this stage is for

The context reads give the wiring: which block sits where, which data
source calls which automation, which field is required. They do not give
behaviour. A page whose config says a panel exists says nothing about
whether a condition hides it, what a manager sees that a viewer does
not, or what the automation returns when the list is empty.

A PRD built on wiring alone describes an app nobody uses. This stage is
how a fact moves from *implied by config* to *seen*.

It is also where config is caught being wrong. A disagreement between
what the config predicted and what the screen did is the most valuable
thing this stage produces, and it goes into the PRD whole — in
_How the app works today_ if it changes the current picture, and in
_Open questions_ if nobody can explain it.

## Which surfaces

Every blast-radius row that is a page, and the pages one step from them:
the page a nav item opens into them from, and the page their primary
action leads to. Nothing else.

Not the whole app. A feature in billing does not need the admin screens
walked, and a walk that wide costs the time the document needs.

Order them highest risk first, so a stage that runs out of room has
confirmed the facts that matter.

## Signing in

One existing test user per role the blast radius names, as
`app-test-create-loop/references/sign-in.md` says: the saved sign-in is
reused when it still loads, and a user whose session will not refresh
leaves its facts unverified.

Pass `sign-in.md`'s _Only test users_ check before opening anything. A
refusal stops the look — not the run. The PRD is written with the
runtime facts unverified and says so.

## What is never touched

`app-test-author/references/local-adaptations.md` Phase 1 step 2 binds
here exactly as it does in the test loops. Nothing that submits,
deletes, emails, pays, notifies another person, changes data the look did
not create, or touches account or security settings. No bulk action.

Reading is the whole job. A fact that would need one of those actions to
confirm stays unverified in the PRD, with the action named — so the
person can confirm it themselves in one step if it matters.

Nothing is created either. This loop makes no throwaway record: a fact
needing one is a fact for the build to prove, not the PRD.

## What to confirm on a surface

Four things, and only what the feature actually depends on:

1. **What is on screen that config did not predict, and what config
   predicted that is not there.** A conditional panel, a field hidden by
   a rule, an empty state the block tree does not show.
2. **What this role sees.** Open the same surface as each role the blast
   radius names, and note the difference. A feature behind a role
   boundary lives or dies here.
3. **What the data looks like.** Not how many records — what shape the
   real values take, where a list is long enough to need paging, whether
   a field the ask treats as filled is filled in practice.
4. **What a person does here today.** The path they take through the
   surface, so the PRD can say what the feature must not interrupt. This
   is what feeds the `mustNotBreak` sentences on the blast-radius rows.

## The notes

One file per surface, `<firing>/look/<page slug>.md`, three parts:

- **Predicted** — what the context read said this surface does.
- **Seen** — what it did, per role.
- **Agrees** — yes, or the disagreement in one sentence.

A screenshot only when the disagreement needs one. The notes are cited by
the PRD's provenance lines, so each fact in them is one line, not a
paragraph.

## When a role has no test user

Say so, in the notes and in the PRD, and leave that role's facts
unverified. Nothing is created to get around it: a test user minted for a
document is a write to the tenant, and this loop writes nothing.

## When there is no browser

A session without the `playwright` MCP or the `app-testing` bridge skips
this stage entirely. The loop still produces a PRD; every fact that
needed the look is marked unverified, and _Open questions_ names the
stage that did not run and what it would have settled. A PRD honest about
what it did not see is useful. One that reads as if it saw everything is
not.
