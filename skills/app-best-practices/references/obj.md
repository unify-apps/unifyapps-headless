# Objects the app binds to

Indexes, permissions, store type and field shapes behind the page's data.

14 rules: P0 0, P1 7, P2 5, P3 2.

## P1

- Never update a JSON-store object through analytics nodes; those updates do not show.
- Store a choice from a user-editable list (status, stage, tag) as the option's id, not its copied text.
- Index every field a list filters or sorts on, equality fields first; at most five custom indexes per object.
- Make several-field uniqueness one unique index over those fields, never uniqueKey on each field.
- Never mark a field secure when a lookup, duplicate check or filter reads it; secure values match no filter.
- Store money as integer minor units with a currency code, never a float.
- Give every user-owned object an owner field set from USER.id at create; the caller never sends it.

## P2

- Write down each object's expected record count and daily inflow; an unknown count is itself a finding.
- Give an object that takes tens of thousands of records a day a clean-up or archive automation.
- Use JSON store for small operational objects and analytics store only where analytics reads them; decide before data lands.
- Store enums as stable machine keys and show labels; never filter on display text.
- Link two objects through a junction object, never an array of ids on one of them.

## P3

- Turn reporting off on objects nothing analyses, after checking no list view filters or sorts on those fields.
- Merge objects with identical fields split by a name into one object with a discriminator column.
