# Features and user flows

## Contents
- 5 rules

Composition rules stop a page from looking hollow. These stop it from being
incomplete: read the spec's `## Changes` and `## Rules` rows for this page
again before writing a single block, and check each of the following against
what they actually ask for.

1. **Every list has a real action, not just a look.** When the spec's
   Changes row for this page names an action on a record (acknowledge, edit,
   approve, delete, decide) and the layout is a `table` or `repeatable`, that
   action needs a real affordance on the row or in a drawer/detail panel
   opened from it — not a page that only displays the list and leaves the
   action for "later." A read-only list is fine ONLY when the spec's row
   says read-only.
2. **A summary implies a detail.** When a page's Changes row is a rollup or
   count (a Pending Approval style summary, a per-group total), and the spec's
   Touches list also names a page that shows the individual records behind
   that rollup, the summary row or card should navigate to that page —
   `navigateToSpecificPage` with the filter/id carried across, not a dead
   number with nowhere to go. When no such page exists in Touches, the
   summary stands alone and this rule does not apply.
3. **Every action has both endings.** A form, a drawer action, or a button
   that calls an automation needs a success path (the spec's own wording:
   a toast, a status change, a redirect) AND a failure path (an inline error
   or a banner) — a submit button wired only to the success branch is an
   action nobody can trust the first time it goes wrong.
4. **Filters and search exist where the spec implies volume.** When the
   spec's Changes row describes a list grouped or filtered by a field
   (by status, by supplier, by date range), that grouping or filter is a
   real control on the page — a segmented control, a filter dropdown, tabs —
   not something the person can only get by asking the agent to add it
   later. A short, fixed-size list (a handful of rows, no grouping named in
   the spec) does not need one.
5. **Multi-step flows keep their steps visible.** When the spec describes a
   record moving through named states (Issued → Acknowledged → Output
   Logged → Closed, in the Job Work Tracker fixture's own shape), the page
   that manages that record shows which state it is in — a status badge, a
   grouped view by state, a `stepper-v2` — not a flat list where the state is
   only visible by opening each row.

Read the spec's `## Rules` section for the exact state names, exact required
fields, and exact validation conditions each flow above must respect — this
file says which flow needs to exist, not what any one app's specific rule
text says.
