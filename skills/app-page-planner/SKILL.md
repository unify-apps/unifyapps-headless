---
user-invocable: false
name: app-page-planner
description: Designs an app before any page is built, as lines the plan hands to each page's builder and reviewer — first the whole app once (who opens it, colours, font, text sizes and weights, radius, gaps, grouping, depth, icons, its one bold thing, motion, and the default it turned down), then for each page its job and its regions in page order, with what waits one click away. Use while scoping a change asked in chat, or while planning one in depth, for any change that creates a page or reshapes one, before the spec is written.
---

# Planning the pages of an app

A page builder that also has to design builds a weak page. With no design, a
page comes out as a stack of cards of different widths. With its regions
written down first, the builder makes a page whose search leads, whose
heading gives the answer, and whose rows are grouped the way the person
thinks. So the pages are designed here, once, while the whole app is in view,
and every builder builds what the lines say.

## Contents
- What you write
- Design the app first
- The method, for each page
- Check the design before you write it
- The lines
- What the lines never hold

## What you write

In the spec's `## Contract`, in this order:

1. One `app look` line per new app, decided as
   [app-craft's app-look.md](../app-craft/references/app-look.md) § Decide it
   says. A page never chooses a colour, a size or a gap. The line goes above
   every `job` line: the spec check refuses a look line below
   one, because the app is designed before its pages.
2. For every new page, and every page whose layout this change reshapes, one
   `job` line and one `design` block. The spec check refuses a
   page with one and not the other.
3. When two pages of one app pass a value between them (a picked row, a
   filter, a step of a flow), one `state` line for that app, below its look
   line: `state · <app>: <value> in <store> · written by <page> · read by
   <page>, <page>; <next value> in …`. The store is one of `app variable`
   (every page reads it; a page load resets it), `session storage` (until
   the tab closes), `local storage` (across reloads and tabs) or `page input`
   (in the address when one page opens another). Every layout and bind of
   that app gets the line, so pages built side by side use one name in one
   store. Without it, each builder picks its own, and the flow breaks.

A line finds its page or app by name alone, so the spec check
refuses two job lines, two design blocks, two look lines or two state lines with one name. Two
pages of different apps get different names ("Orders" and "Shop Orders").

No sign-in page gets a job line: login, signup, mfa-verification,
forgot-password, update-password or reset-password. The platform already
serves working ones, and a page designed here would be built by hand at
`/login`, which the app never shows and the bridge refuses. When the person
asks for their own look or words on one, the plan copies the platform's
template instead ([task-kinds.md](../ua-change/references/task-kinds.md)
§ Facts every body follows, Sign-in pages), and the app look line still
decides its colours and font.

The plan then adds one `app` task for a new app, which creates the app and
stores its look before any page is built, so the pages are built side by
side (`plan` skill, [tasks.md](../ua-change/references/tasks.md)).

## Design the app first

Before you write any page's job, design the whole app. Read
[app-look.md](../app-craft/references/app-look.md) § Decide it and its list of
[default looks](../app-craft/references/default-looks.md), then answer all 17
questions in their order, from the request and the reads, and write the
line. Do not skip one because the request did not mention it: an answer you
do not choose is a default the platform or the model chooses for you.

Then hold the pages to it:

- **`use` sets how far each page pushes.** A demo page may make its bold
  thing large; a daily page keeps it to type, space and one accent; an
  expert page keeps every row of data.
- **`bold` lives on one page.** Decide which page carries it now, and make
  it, or the part of it that page shows, that page's lead region.
- **`groups`, `gaps` and `depth` shape every region.** A region is one group;
  its text says what it holds, never a new way to hold it.
- **`type` gives the levels.** A page uses its sizes for its title, its
  region titles and its one big number, if it has one. No page adds a size.

Decide every answer yourself, from the request and the reads, on every
path. Never ask the person about the look unless they raised it: they see
the line in the spec and the preview, and can change it there.

## The method, for each page

1. **Write the job.** Who uses the page, where and how often; the questions
   they come with, most important first; what most visits end with; the
   states the page passes through; the values whose meaning changes at a
   point, with that point. Take them from the request and the reads. The
   first question is the reason the page exists.
2. **Give each question a region that answers it, in that order.** The
   region for the first question leads: it sits where the eye starts, and it
   is the largest or strongest thing on the page. One region answers one
   question.
3. **Split what every visit needs from what waits one click.** What most
   visits need is on the page. What only some visits need is a `later`
   region: say where it waits (a drawer from its row, a tab, a detail page)
   and keep at most 2 levels hidden. When a person opens one record, choose
   on purpose: a side panel keeps the list in view for working through rows
   one by one, a page suits a record worked on for a long time, and a popup
   is only for a short question.
4. **Put each action next to what it acts on.** The main action belongs in
   the region whose data it uses, not in a separate band away from it. An
   action that only some rows allow shows only on those rows.
5. **Give every state a place.** Before first use, waiting, nothing found and
   failed each need a region, or a stated change to one ("the list shows the
   last 4 searches instead").
6. **Say what each region shows, in the person's words.** Name the real
   fields and values from the request, and how a signal value shows its
   state. The words follow [app-craft's words.md](../app-craft/references/words.md).
7. **Use proven parts.** When a region is a kind that
   [app-craft's kit.md](../app-craft/references/kit.md) covers ("a table of
   records to compare", "rows grouped under headings"), call it that, so the
   builder takes its proven settings. Do not plan what the kit says the
   platform cannot do.

## Check the design before you write it

- Would you have written this same design for any page like it? If so, find
  what this subject has that others do not, and put it in the lead region.
- Does every region serve a part of the job? Remove the ones that do not.
- Then remove one more thing.
- Does the page follow the app look? The page that carries `bold` leads with
  it; every page groups content the way `groups` says.
- Across the app's pages: one header, one way to show a state, one place for
  the main action ([app-craft's consistency.md](../app-craft/references/consistency.md)).
  A page that differs says why in its region text.

## The lines

The labels are fixed, because the CLI reads them. One example, in a subject
of its own, shows the format only:

```
- job · Leave Requests: for team leads, at their desk, a few times a week · answers whose leave needs my decision?; will approving it leave the team short? · main action approve or decline a request · states nothing to decide, loading, could not load · signals days until the leave starts: under 3 urgent
- design · Leave Requests:
  - lead · Requests to decide: one row per request, the person, the dates, the days until it starts with its urgency, and Approve and Decline on the row · serves answers 1, main action
  - support · Team on those dates: for the selected request, who else is away each day and how many stay · serves answers 2
  - quiet · Decided this month: a short list of the last decisions, newest first · serves states (nothing to decide)
  - later · Request history: every earlier request of that person, in a side panel from the row · serves answers 2
```

Each region line is `<lead|support|quiet|later> · <region>: <what it shows
and does> · serves <part of the job>`, in page order, top to bottom, indented
under its `design ·` line. A `later` region's text says where it waits. A
page has 3 to 8 regions and at least one `lead`. The page's screenshots show
every region but the `later` ones.

## What the lines never hold

- No colour, font, size or gap: the app look holds them.
- No block names, unless the request names a block.
- No app chrome. The menu, a navigation bar of links to the app's other
  pages, an app-name link, a hamburger: those live on the app record and are
  written once with `apply_navigation_edits`, so they are never a region of
  a page. A region named "navigation" or "header with the app name" makes
  the builder rebuild the menu by hand on that one page. If the request asks
  for a top bar, bottom tabs or a drawer, say it in the app look line's
  direction; its exact position stays a manual builder step, and the
  page's regions start below it. A bar that only looks custom, where the
  app's bar already sits, is an app task, not a region: `set_navigation_style`
  attaches a module that draws it on every page. Breadcrumbs are page work and may be
  a region. The one exception is the person asking for the bar in blocks
  after being told what it costs — built by hand on every page, no
  permission filter, no active state, the real menu switched off by hand:
  then it is a region like any other, and the `## Contract` or `## Changes`
  line that records their decision is what makes the builder build it
  rather than stop.
- No copy of another page's regions without a reason.
- No promise the platform cannot keep: when unsure whether a block can do
  something, choose a part the kit proves, or say "simplest form" in the
  region text.

Write the lines yourself. In an in-depth plan, ask the person only when the
request and the reads leave a page's first question or its main action open.
Either way the person sees them in the spec and the preview, and can change
them there.
