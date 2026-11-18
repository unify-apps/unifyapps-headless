# Platform dialect (`testSubject: 'platform'`)

## Contents
- Test users
- Durability ladder (platform component surfaces)
- Manager tables
- Overlays — one shared portal, and it stacks
- Forms & dropdowns
- Client-side races — same guards, platform flavor
- Worked example — create an agent, then find it by search (self-provisioning)

The subject is the **UnifyApps platform UI itself** (shell, managers, editors) — not an app it built. **DOM facts (measured on the live platform):** Next.js SSR **shell** + client-mounted data — the server HTML carries the chrome, never the table rows/entity content; route transitions, search, and filters refetch client-side. Joy UI/emotion component system. Zero `<label>` elements anywhere — label association is **exclusively `aria-label`** (often mirroring the placeholder); visible field titles are unassociated text, exactly as on builder apps. Many click targets are role-less (`<p>` menu items, clickable `<tr>`s); icon nav buttons carry no name on the button — the accessible name comes from the inner `svg[aria-label]` (name-from-content still resolves it: `getByRole('button', { name: 'AI Workflows' })`).

**The platform is a hybrid — read each surface before picking its ladder.** Two vocabularies coexist:

- **Platform component surfaces** (shell nav, manager/list pages, tables, toolbars, portal popovers) speak **component-type markers** (observed today on `data-testid` — `nav-root`, `nav-item`, `page-layout`, `table-root`, `table-row`, `table-row-actions-trigger`, `popover-root`, `menu-item` — but the key is incidental; re-read it each run) plus `data-nav-item="<semantic key>"` (`workflow`, `settings`, …) and aria-labels. This dialect's ladder below governs them.
- **Builder-rendered regions** (entity config/edit pages — e.g. an agent's configuration — and embedded blocks; even a manager table root carries `data-block-id="table_block"` / `data-block-type="UAEntityTable"`) speak the **full builder DOM**: `data-block-id` (`b_TpvDd` short codes, word-like ids), `data-block-type` (`Stack`, `Copilot`, `Repeatable`, …), `runTimeBlockKey_*` runtime ids, `data-block-pos`. **The first eval on such a region means: read `references/builder-app-dialect.md` before authoring anything inside it** — the builder ladder, repeat-region verification, and hydration/form rules govern those regions verbatim; this skill stays governing everywhere else. The tell is unmissable: `data-block-*` dense on everything vs. absent.

The a11y snapshot does not show `data-*` attributes — read every touched element's hooks with one chained `eval` covering all candidate refs, as on builder apps.

## Test users

A test of the platform, an app's builder or overview screen included, runs as the platform's own test users, never an app's: SKILL.md, _Test users of the platform_.

## Durability ladder (platform component surfaces)

1. **Explicit test hook — judged by its observed VALUE, never by its key.** The platform ships several test-hook keys (`data-testid`, `data-test-id`, `data-cell-id`, and whatever tomorrow adds); which key carries what is an implementation detail that can flip any release, so **no key is trusted or distrusted by name** — read the value during the walk and classify it, every time: a static, human-authored, component-ish value (`table-row`, `popover-root`, `table-top-toolbar`) is a hook; a machine-generated one (an `e_`+hex record id, a UUID, a `<recordId>_<column>` compound, anything failing the generative test in the main instructions' record-identity rule) is not, whatever key holds it. Static values here are **TYPE markers, not identities** — they repeat per instance (`table-row` on every row) — so always scope (container/row first) + marker, or marker + name/text. Presence is never permission; an unread value is an invented hook.
2. **`data-nav-item="<key>"`** — the platform's stable semantic navigation keys (`workflow`, `ai_ontology_data`, `settings`); the best hook for any shell-nav target, ahead of the icon-derived name.
3. **Role + accessible name / `getByLabel`** — first-class for everything that carries a name: named buttons/links, inputs via `aria-label` (`Search agents`, `Filter Property`), nav buttons via the inner svg's label. Some aria-labels are kebab component names (`table-filter`, `filter-root-operator`) — static and human-authored, legitimate hooks despite the machine look (they pass the generative test: same on every record, render, and deploy). Verify count === 1; segmented view switches (`Agents` / `System Agents`) are `<a href>` **links**, not tabs — `getByRole('link', { name: … })`.
4. **Static visible text scoped under a surface** — the only hook role-less targets offer (portal menu items are bare `<p>`s: `page.locator('[id="popover-content"]').getByText('Archive', { exact: true })`). Static UI text only, never data.
5. **`data-block-id` where a region carries one** (word-like values like `table_block`) — an honest container anchor even outside fully builder-rendered regions.
6. **`NTH_CHILD`** — last resort, per the main rules; the standard positional-row form is container anchor → `tbody` descent → `:scope > :nth-child(n)`.

**Never:** styling/layout tokens as hooks or assertion subjects — `data-variant`, `data-color`, `data-size`, `data-weight`, `data-shape`, `data-label-variant`, and the grid bookkeeping attrs `data-index`, `data-row-index`, `data-column-index`, `data-option-index`, `data-pinned*`, `data-first-child`/`-last-child` — the list is illustrative; the test is the VALUE's nature (a theme token, a layout coordinate, a render index) rather than the key name. Generated ids — `_r_N_`/`_R_` React useIds, `<combobox>-option-N`, `e_`+hex entity ids — same generative test as everywhere: unexplainable as human-authored → not a hook. Selection/toggle state reads its semantic carrier: `data-selected`, `aria-pressed`, `aria-current`, `aria-expanded`.

**Hook → locator link** — the closed vocabulary of the main instructions applies unchanged; the platform-typical links are `.locator('[data-testid="table-row"]')` / `.locator('[data-nav-item="settings"]')` (both `HTML_ATTRIBUTE`), `.getByRole(…)`/`.getByLabel(…)`, `.getByText(…)` for role-less items, `.locator('[id="popover-content"]')` (`ELEMENT_ID`, attribute form), and `.locator('[data-block-id="…"]')` where blocks appear.

## Manager tables

Semantic `<table>`/`<tr>`/`<td>` (material-react-table): implicit ARIA works — `getByRole('row', { name: … })` matches with **no** explicit `role` attributes in the DOM. Row anatomy as measured today: a static type marker (`table-row`), a record id (`e_`+hex — record identity, never a hook; the sole carve-out is a scenario spelling that exact id), and positional bookkeeping (`data-index`, banned) — each classified by the **value you read**, not the key it sat under, since keys shift between releases. Cells carried a `<recordId>_<columnId>` compound (record identity again); header cells carried static column keys (`properties_name`, `tags`) — static, usable for column-scoped needs once re-read live. So:

- **Scenario-named record** → `ROLE` row + the name as substring (`getByRole('row', { name: 'Application test author' })`) — the row's accessible name is its cell text, and the business name is the scenario's own anchor.
- **"Any / the first" row** → container anchor (`[data-testid="table-root"]` or the region's `data-block-id`) → `tbody` descent → `:scope > :nth-child(n)`; a harvested `e_` id or name is not the scenario's identifier.
- **Per-row controls** (`table-row-actions-trigger` repeats on every row) → row anchor first, marker inside: `<row link>.locator('[data-testid="table-row-actions-trigger"]')`.
- Rows are clickable (`cursor: pointer`, no role) — a row click is a legitimate action step on the row element itself.

## Overlays — one shared portal, and it stacks

**Every** popup — filter panels, row-action menus, autocomplete listboxes — mounts in a portal at document end as `role="tooltip"` with `data-testid="popover-root"` **and the same static `id="popover-content"` on every instance**. Measured: two open surfaces (a popover + its inner combobox's listbox) = **two** `id="popover-content"` nodes — the id is a shared marker, not unique. Consequences:

- The surface-first HARD RULE applies: controls inside chain under `[id="popover-content"]` (or `[data-testid="popover-root"]`).
- With **stacked** surfaces that anchor is ambiguous — never resolve with `.first()`/`.nth()`. Reach the inner surface's contents by their semantic hooks that exist only there: `getByRole('option', { name: … })` for listbox options is globally unambiguous while the list is open; role-less menu items stay text-under-surface only when a single popover is open — otherwise re-shape the step (act on the option/list role directly).
- Row-action menus carry **no** `menu`/`menuitem` roles; items are role-less `<p>` text → rung 4.

## Forms & dropdowns

`getByLabel` resolves through `aria-label` — there are no `<label>` elements to associate, so a zero-match `getByLabel` means the control carries no aria-label, not a broken association; fall to placeholder (`HTML_ATTRIBUTE`) or a scoped role. Dropdowns are **MUI/Joy autocomplete comboboxes** — `input[role="combobox"][aria-label]`, never a native `<select>`: the `select` action doesn't apply; decompose into the two-click/fill form (_Forms_, main instructions), the trigger interaction carrying the listbox/option reveal. Options (`role="option"`) render **asynchronously after** the listbox mounts — the reveal names an option you watched appear, never the empty listbox shell. Date pickers surface as `readonly` inputs with an aria-label — the readonly input is the visible trigger (not a decoy; the decoy test from the builder dialect still decides).

## Client-side races — same guards, platform flavor

The shell is SSR but the **data is not**: entity content is absent from server HTML and mounts after client queries resolve, and every filter/search/mutation refetches. So the standard first-pass defaults apply unchanged (_Navigation guards_, main instructions): `navigatesTo` on navigating steps with a destination-specific marker (the destination's content mounts late — URL-only can't catch it), a reveal on any click opening a surface later steps act inside (popover, menu, listbox — remembering options render late), and the readiness pair after any state-mutating or filtering action — **and, locally, the pair after EVERY navigation before the first fill or click, forms included** (`local-adaptations.md`, _The readiness pair is unconditional_): create/edit forms are builder-rendered and re-mount after the shell paints, so a fill issued on arrival is dropped and the submit never enables. Builder-rendered regions add the builder hydration doctrine on top (`references/builder-app-dialect.md`). Never a sleep; the pair's fixed render grace is the sanctioned exception.

## Worked example — create an agent, then find it by search (self-provisioning)

**Scenario:** "On the Agents manager, create an agent with a random name, return to the manager, and search for that name; exactly one row is shown and it contains the name." (A scenario that searched for an EXISTING agent by name would be rejected under the self-provisioning rule in `local-adaptations.md` — the record is not the test's to depend on.)

Observe: `open …/p/0/ai-agents/custom && snapshot --depth=3` → "Create agent" is a named button; the create form's name input carries `aria-label="Agent name"` (eval confirms; no `<label>` anywhere); saving navigates to the new agent's page; back on the manager, the search input carries `aria-label="Search agents"`; rows are semantic `<tr>`s marked `data-testid="table-row"` under `[data-testid="table-root"]`. Typing in search refetches the table → readiness pair before the count and the assert. Every hook below was read on the live walk — yours will differ; measure them.

```json
{
  "scenario": "Create agent and find it by search",
  "url": "https://<tenant>/p/0/ai-agents/custom",
  "status": "draft",
  "steps": [
    { "index": 1, "action": "navigate", "value": "https://<tenant>/p/0/ai-agents/custom" },
    { "index": 2, "action": "wait_for_ajax" },
    { "index": 3, "action": "wait", "value": 2 },
    { "index": 4, "action": "store", "from": "literal", "value": "<<random:12>>", "into": "agentName" },
    {
      "index": 5,
      "action": "click",
      "element": { "pageId": "agents-manager", "locator": "page.getByRole('button', { name: 'Create agent' })", "name": "Create agent button" },
      "navigatesTo": "/p/0/ai-agents/create"
    },
    { "index": 6, "action": "wait_for_ajax" },
    { "index": 7, "action": "wait", "value": 2 },
    {
      "index": 8,
      "action": "fill",
      "value": "<<agentName>>",
      "element": { "pageId": "agent-create", "locator": "page.getByLabel('Agent name')", "name": "Agent name input" }
    },
    {
      "index": 9,
      "action": "click",
      "element": { "pageId": "agent-create", "locator": "page.getByRole('button', { name: 'Create' })", "name": "Create button" },
      "navigatesTo": "/p/0/ai-agents/"
    },
    { "index": 10, "action": "navigate", "value": "https://<tenant>/p/0/ai-agents/custom" },
    { "index": 11, "action": "wait_for_ajax" },
    { "index": 12, "action": "wait", "value": 2 },
    {
      "index": 13,
      "action": "fill",
      "value": "<<agentName>>",
      "element": { "pageId": "agents-manager", "locator": "page.getByLabel('Search agents')", "name": "Agents search input" }
    },
    { "index": 14, "action": "wait_for_ajax" },
    { "index": 15, "action": "wait", "value": 2 },
    {
      "index": 16,
      "action": "assert",
      "assertions": [
        {
          "type": "count", "op": "eq", "expected": 1,
          "element": { "pageId": "agents-manager", "locator": "page.locator('[data-testid=\"table-root\"]').locator('[data-testid=\"table-row\"]')", "name": "Agents table row" }
        }
      ]
    },
    {
      "index": 17,
      "action": "assert",
      "assertions": [
        {
          "type": "text", "match": "contains", "expected": "<<agentName>>",
          "element": { "pageId": "agents-manager", "locator": "page.locator('[data-testid=\"table-root\"]').locator('tbody').locator(':scope > :nth-child(1)')", "name": "First agent row" }
        }
      ]
    }
  ],
  "observations": [
    "Self-provisioning: the agent is created by the test (random 12-char name stored BEFORE it is typed, so the same value serves the fill and both asserts); no existing agent is referenced anywhere. Readiness pair after every navigation — the manager load, the Create-agent click's landing on the form (before the name fill), and the navigate back. Platform manager surface: no <label> elements — getByLabel resolves via aria-label, verified live. Create navigates to the new agent's page, so the test navigates back to the manager (readiness pair) before searching. Search refetches → readiness pair before the count. Count targets the repeated row marker (the item, never the table); the first-row positional link is legal only because the search established identity (count eq 1). The row also carries an e_ record id — record identity, never a hook. Cleanup: the walk found no delete action on the agent page reachable in scope; a random-named agent remains per run — harmless residue."
  ]
}
```
