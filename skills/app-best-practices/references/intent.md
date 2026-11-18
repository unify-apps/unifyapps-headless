# Intent and simplicity

Judgment calls: does the page do its job, with as little as it needs.

26 rules: P0 0, P1 4, P2 11, P3 11.

## P1

- Each data-bound query answers the page's purpose (e.g. a user's requests filtered by user).
- Bind dynamic regions (carousels, tiles, charts, counts, badges) to data; no fixed slides, made-up arrays or design sample images.
- On a page shown inside a chat message keep every declared input, page event and button message text the agent routes on.
- Every starter, card or promise a chat page offers maps to a tool its AI agent has.

## P2

- The component fits the data: a stat card for one number, key-value for pairs, a table for lists.
- The flow reaches the user's goal without detours through variables and onChange hops.
- Logic sits in the right layer: server aggregation, formattingOptions, theme tokens.
- Chained data sources that one server-side query would replace.
- Use the app's navigator module instead of a hand-built tab bar.
- Banners and action buttons that depend on state carry a visibility condition from the record's status and dates; no fixed day counts.
- Keep per-user state (read flags, favourites, recents) on the server, not only in device storage or local variables.
- Build the shared states (No internet, Network error, Technical issue) once as a module; hand-copied states drift in wording and layout.
- Lead with the region that answers the page's first question: where the eye starts, and the strongest thing on the page.
- Match a PinInput's length to the real code length; never guess 5 or 6.
- Put tracking, refresh and send actions last in a chain; the tap's visible result never waits on them.

## P3

- Delete disabled or superseded event handlers.
- A native block replaces a hand-built structure (Kanban, KeyValue, StatCard).
- Repeated subtrees become a Module, Template Component or Repeatable.
- Action chains of 4+ steps collapse to one native action.
- No identity wrappers: one-child stacks, pass-through functions, one-row repeatables.
- The block count fits the page's job; name the subtree to extract.
- Use a Modal or Drawer only when the task must interrupt or needs room; otherwise expand inline or link to a detail page.
- Open a record in a side panel to work through rows, a page for long work, and a popup only for a short question.
- Build a mobile accordion from collapsible Cards, not a boolean variable per row with visibility conditions and icon swaps. (mobile only)
- Don't rely on audience, schedule or frequency for a walkthrough a button starts; the button plays it for any viewer. (web only)
- Render one button per mode with its own visibility instead of one chain with a runCondition per mode.
