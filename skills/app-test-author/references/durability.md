# Durability — what keeps a case green past its first run

## Contents
- Where these rules come from
- A model's reply is not the app's
- State every case of this user sees
- Counts, baselines and names on shared lists
- Verification first, cleanup last and short
- JS steps cannot be healed
- The effect of every action, the pointer and the focus
- Redirects and new windows
- A hook the app does not have
- Pre-flight check 9 — the assertions say what the description says

Read with `local-adaptations.md`, before Phase 2, and again before an
update job (`platform-tool-modes.md`, _Update run_). These rules bind with
the force of the rulebook's hard rules; where the rulebook already states
one, this file names the shape that still got through.

## Where these rules come from

One app's full regression run: a third of its cases red, and after two heal
firings most of them still red. The heal loop re-points one element per
step; nearly everything else that was red had been authored in a shape the
next run could not survive. Every rule below names that shape.

## A model's reply is not the app's

An app that talks to a model (a chat, an assistant, a routine, an artifact
generator) hands the author three things the app does not control: whether
the reply arrives, when, and what it says.

- **The wait.** Every step that reads anything a model produced — the reply
  text, the action bar under it, an artifact card, a count in the log — is
  preceded by a wait on the completion marker the walk showed:
  `wait_for_hidden` on the control the app shows only while generating (a
  Stop button, a "Generating…" status), else `wait_for_visible` on a control
  the app renders only once the reply is complete (the reply's own Copy or
  Like button). Never the assert's own timeout: a reply took 8 to 50 seconds
  live, the assert gives up at 5. Never a marker the app shows only
  sometimes (a follow-up suggestions block): four cases waited on one as
  their "reply finished" signal and went red the day it stopped rendering.
- **The check.** Assert what the app controls: the reply exists, its action
  bar rendered, the artifact card and its type label, the draft's state (a
  card still in draft, no recipients). Never the reply's wording (`not been
  sent` is phrased differently each run), never a number's formatting
  (`83,810,205` against `83810205`), never a count of a token over the whole
  log (suggestion chips repeat the answer's words). A number the scenario
  expects in the reply is checked by an `execute_js_verify` scoped to the
  answer body that strips separators before comparing.
- **AI-dependent scenarios.** When the stated outcome is itself the model's
  decision — it produces an artifact of a kind, it answers with a fact, it
  refuses — the scenario is AI-dependent. Its text ends with the line
  `AI-dependent: <what the model decides>`; Phase 1 writes it, the survey
  loop writes it, and it goes into the description stored on the case. The
  steps still assert only app-controlled facts around that outcome. The
  analysis sets a red at such a step aside as an AI dependency, not a
  defect of the case or the app.
- **The budget.** The platform stops a case at 300 seconds. At most three
  model replies per case; a scenario that needs more (a thirty-turn chat) is
  split into cases that each start fresh, or goes to not covered with
  `not expressible: exceeds the run time budget`. A generation the walk
  measured over 120 seconds (a slide deck, a long document) gets a case of
  its own with nothing after the artifact check, or the same row.

## State every case of this user sees

Pins, tool toggles, a memory switch, a paused routine, a sidebar
preference: every case running as the same test user sees them, and the
platform runs cases in parallel.

- A case asserts the effect of its own change on its own record, never the
  account's whole state: "the case's chat is in Pinned", never "Pinned has
  one row". One run pinned fifteen chats and never unpinned them; the next
  run's Recents table was empty and three sort cases went red.
- A case that changes shared state restores it in its own steps, and the
  scenario text says so.
- A case that depends on a shared setting being on sets it on in its own
  steps and back afterwards; it never assumes the setting.
- Phase 1 marks such a scenario `shared state` in its entry (its
  `observations` line reads `shared state: <what it changes>`), and the
  dispatcher runs it alone (`parallel-authoring.md`, _Dispatch_).

## Counts, baselines and names on shared lists

- A count is over the case's own records, found by their random identity
  (`local-adaptations.md`, _Self-provisioning_). Never the rendered rows of
  a shared table: a virtualised table renders 27 rows of 333, so "row count
  equals the badge" can never hold. Never a baseline stored from a shared
  list and compared after an action: another run adds a row between the
  two reads.
- Every record name the case creates is random-based, even where the
  scenario names a literal to test: an invalid-character name is
  `<<random:8>>` plus the characters, never the fixed literal. A run that
  fails mid-way leaves its record behind, and a fixed name then breaks
  `count eq 1` for every later run (eight leftovers of one name, ten days).
- "The first card is mine" is never true on a shared list: the first card
  was another user's artifact. Find the case's own record by identity, and
  use a slot link only inside a set isolated by its search.
- Built-in or seeded records (a built-in skill, a sample project) are
  someone else's data: never a premise. A scenario that needs one goes to
  not covered.

## Verification first, cleanup last and short

Forty-six cases of one feature were red on their last step: the cleanup's
click on a row-actions menu, which one app bug broke. Every stated check
had passed. The run called forty-six working behaviours failures.

- The stated checks come before any cleanup, always.
- Cleanup takes the shortest path from where the last check left the app:
  delete from the editor that is already open, not search → row actions →
  menu → confirm. The readiness pair follows its refetch.
- Cleanup never carries a verification. The analysis marks a red after the
  last check as `checks passed; teardown red`, so a broken cleanup never
  reads as a broken feature; the cleanup is still fixed in an update.

## JS steps cannot be healed

A selector inside `execute_js` or `execute_js_verify` is not an element: the
heal loop re-points stored elements and never touches JS source, so a UI
change under a JS step always means re-authoring the case. Three cases
hard-coded a sidebar's inner block ids in their JS; one rebuild removed
every one of them.

- Typed steps wherever the grammar reaches (the rulebook's escape ladder),
  now with the cost named: a JS step is a step the loops cannot fix.
- A JS source anchors on one durable container hook (a region by its role
  and name, a stable `data-*` value, the surface's top-level block) and
  reads members by role or attribute, never by a list of inner block ids.
- Every JS step's `observations` line adds `unhealable`, so the person
  reading the report knows which steps a UI change will send back to an
  author.
- A provisioning step is JS by design (`local-rules.md`, _Provisioning is
  the one sanctioned JS setup_): it reaches no element, so no UI change
  breaks it, and only a change to the app's own API does. It is tagged
  `provision` beside `unhealable`, and a red on it is a setup failure,
  never a defect of the behaviour the case checks.

## The effect of every action, the pointer and the focus

- **Every action's effect is read in the same call**, `clear`, `press`,
  `hover` and `drag` included. A `clear` that leaves text in a rich-text
  composer is replaced by the key sequence the walk shows works (click,
  `ControlOrMeta+A`, `Backspace`). A drag whose effect did not show is not
  authored as a drag; a drag that worked is replayed once more during the
  walk before it is trusted.
- **After a hover that opened a popover or tooltip**, the next click is
  preceded by what dismisses it, observed (Escape, or a hover on a neutral
  element). A popover left under the resting pointer swallows the next
  click.
- **An outside click targets a measured neutral element** (the page heading,
  an empty region), never the log's centre: on a chat with a chart the
  centre is an iframe, and a click inside an iframe never reaches the page's
  outside-click handler.
- **A dialog that re-renders after a fill** (the walk shows the button
  detach and mount again) gets the readiness pair before its submit click.
- **A reveal marker is unique to what the action produced**: a marker present
  in every version or state of the surface guards nothing, and the retry
  wrap cannot tell a landed click from a no-op.

## Redirects and new windows

- A navigation that redirects (`/` → `/homepage?…`) is asserted on the
  final destination's element; a `url` assert on the intermediate route
  fails on the redirect's timing.
- `open_window_and_navigate` is a navigation: the readiness pair runs in
  the new window before anything reads it.

## A hook the app does not have

When the only one-match locator for an element the scenario names
non-positionally is positional, or the element has no accessible name at
rest (named only while hovered), the fix is in the app, not the case.

- Never author the positional form. Author the best legal locator the
  walk measured (hover first, then the role), or exclude that check with
  the reason.
- Report it: an `observations` line `needs hook: <surface> — <element> —
  <the static hook that would do, such as a data-testid>`. The run report
  lists these under _Hook requests_, so the app's team can add the hook and
  the heal loop can re-point the element afterwards.
- In the create loop the case is parked `capability missing: no stable
  hook for <element>` when no legal locator exists for a step the scenario
  needs.

## Pre-flight check 9 — the assertions say what the description says

Before every delivery, alongside the rulebook's five checks and the
adaptations' sixth, seventh and eighth: for each outcome the description
states, the assert that carries it has the same subject and the same
polarity. A description that says the edit persists is carried by an
assert that the edited token IS shown, never one that it is not. One case
asserted the opposite of its own description on two steps and could only
be green for the wrong reason. The description is the intent every heal
and update reads back; the steps answer to it.
