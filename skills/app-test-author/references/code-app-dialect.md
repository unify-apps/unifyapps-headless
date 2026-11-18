# Code-app dialect (`testSubject: 'interface-code'`)

## Contents
- Durability ladder
- Labels and dropdowns
- Client-side races — same guards as builder
- Worked example — custom select + text-anchored row

**DOM facts:** semantic HTML (real headings, links, buttons); Radix/shadcn components (`data-slot`, `data-state`); labels usually properly associated; icon buttons carry `aria-label`. Client-rendered SPA (~1 KB shell): content mounts client-side; overlays (sheet, dropdown, popover, dialog) mount only when opened. Best hook: role + accessible name (measured: most interactive names are unique per page). Per-instance anchor in repeated items: a stable business identifier in the item's text — nothing else exists. Ids in the DOM are auto-generated (`radix-_r_5_`, `recharts-*`) — per-render, **never** hooks.

The snapshot itself carries the primary hooks (role + accessible name); `eval` only to confirm a `placeholder`/`aria-label`/`data-slot`.

## Durability ladder

1. **Explicit test hook** — `data-testid`/`data-test`/`data-qa` **if present**. These apps generally ship none — verify with one count before relying on it; when present it outranks everything **only when both its key AND its value align with the scenario's meaning**: a static, component-ish value that passes the record-identity check (_The scenario names the anchor_, main instructions). An identity-valued testid on an unspecified item ("any row") is banned — the slot, not the record, is the anchor.
2. **Role + accessible name** — `getByRole('button', { name: 'Create New' })`, `getByLabel('Role Name')` — the **primary hook**, not a fallback: semantic HTML plus labeled icon buttons make most interactive names unique per page. Verify count === 1; scope the few duplicates (typically repeated filter triggers) by a container plus the name.
3. **Attribute hooks** — `HTML_ATTRIBUTE` on `aria-label`, `placeholder`, or `data-slot` (shadcn's component-type marker: `select-trigger`, `table-row`, `input`, … — a **type**, never unique alone; always scope + name/text).
4. **Stable business identifier in the item's text** — for repeated items (table rows, list entries) this is the **only** per-instance anchor a code app offers, **and it is legitimate ONLY for a record the scenario itself named**. Express it as `ROLE` + name: a row's accessible name is its cell text, so `page.getByRole('row', { name: 'acme-prod-finance' })` (substring via `exact: false`) targets one row durably. Distinguish carefully: a business identifier (ticket number, account name) is stable data and legitimate _for that named record_; a volatile value (a count, a date, a status word) remains banned — and for a scenario that says "any/a/the first" item — or selects by **property** ("a row with empty amounts") — **this rung is banned outright**: an identifier harvested from the walk is not the scenario's identifier, and the mandatory form is positional or the property doctrine (_The scenario names the anchor_, main instructions).
5. **`NTH_CHILD`** — last resort, per the main rules.

**Never, with extra force here:** auto-generated ids. `radix-_r_5_`, `recharts-bar-_r_7_`, any `_r_N_`/`useId` pattern — **the pattern list is illustrative; the test is whether the id would survive a re-render, a remount, and a redeploy** (an id you can't explain as human-authored won't) — these sit on exactly the buttons a test wants and change every render/deploy. `ELEMENT_ID` is valid only for a human-authored literal id, which these apps rarely have — an id-shaped string is a trap until proven otherwise. `DATA_BLOCK_ID`/`RUNTIME_BLOCK_ID`/`BLOCK_TYPE` match **nothing** on a code app — never author them there.

**Content-derived accessible names are never hooks** — a surface whose role+name is its children's labels concatenated recomputes when contents change and dies mid-run; portal surfaces anchor by their attribute hook (`data-slot`, `data-radix-*`, an id), targets as semantic children.

**Strategy order**: 1. `ROLE`/`LABEL`, name-first — including text-anchored repeated items (`ROLE` role `row`/`listitem` + business-identifier name, subject to rung 4's classification). 2. `HTML_ATTRIBUTE` on `aria-label`/`placeholder`/`data-slot`, scoped via `children` where a type marker needs narrowing; `ELEMENT_TYPE` for a hook-less structural wrapper only when no role reaches it (semantic HTML means `table`/`rowgroup`/`row` roles usually do). 3. `NTH_CHILD`.

**Hook → locator link (the closed vocabulary — the store DERIVES candidates from your locator):**

| hook                           | locator link                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| literal `id` attribute         | `.locator('[id="hero-cta"]')` — **attribute form, never `#id` CSS** (ids with dots/colons — `root.f_xxx`, React `:r1:` — break CSS) |
| any attribute(s)               | `.locator('[data-slot="sheet-content"]')` — pairs compounded, no spaces; never key `class`, never a styling token                   |
| role + accessible name         | `.getByRole('combobox', { name: 'Assignee' })` — `exact: true` only when you mean to state it                                       |
| label association              | `.getByLabel('Email')`                                                                                                              |
| static visible text            | `.getByText('Submit', { exact: true })` — static UI text only, never data                                                           |
| bare tag (scaffolding descent) | `.locator('tr')` — **never `getByRole('row')` for a tag**: different engines, different match sets                                  |
| positional slot                | `.locator(':scope > :nth-child(2)')` — only ever chained under an anchored link, never first                                        |

Same-meaning-different-engine is still wrong: spell the hook you verified, in the link form above — anything outside this vocabulary fails the compile with the link named. **Class names are banned as hooks and as assertion subjects** (class-name ban, main instructions): `HTML_ATTRIBUTE` never takes key `class`; a class-only element is a `AskUserQuestion`, not a locator.

## Labels and dropdowns

The generator associates labels properly (`<label for>` present; icon-only buttons carry `aria-label`), so `getByLabel('Role Name')` and role + name are first-class — reach for them before any attribute, and verify the association the same way (count === 1). Hidden native mirrors were not observed on these apps, so the decoy threat is smaller; the a11y-first rule stands for the positive reason that the names are simply the strongest hooks this DOM offers.

Dropdowns are Radix triggers — **buttons, never a native `<select>`** — so the `select` action doesn't apply: the two-click decompose from _Forms_ in the main instructions, the trigger click carrying its listbox reveal. This is the norm on code apps, not the exception.

**The self-chain trap, by name:** shadcn's `data-slot="sheet-content"`/`dialog-content`/`popover-content` **are** the `role="dialog"` node itself (Radix names it from the title via `aria-labelledby`), so `getByRole('dialog', { name: … }).locator('[data-slot="sheet-content"]')` chains two descriptions of the same node and resolves to **0** — the same-node chain rule from the main instructions applies with full force here. This matters constantly because of the surface-first HARD RULE (main instructions, _The locator vocabulary_): every control inside an overlay chains under the surface's hook — checked before uniqueness, a unique bare hook is not an exemption — `getByRole('dialog', { name: … })` or the `data-slot` content marker are the usual anchors — so settle first which node the surface hook sits on, then chain the control strictly inside it.

## Client-side races — same guards as builder

No SSR markup, no pre-hydration gap, no transient SSR 404. The races that remain are client-side: a route transition mounts content **after** the URL flips (suspense/skeleton states), an overlay's content exists only once opened, and a state-mutating click round-trips to the server before the UI updates. Same discipline, different rationale — record `navigatesTo` on navigating steps, a reveal on any click that opens a surface later steps act inside (sheet/drawer, dropdown, select listbox), and the readiness pair after any state-mutating or filtering click (_Navigation guards_, main instructions): the first-pass defaults survive the dialect change because the stale-text failure they prevent is a network race, not an SSR one. Never a sleep in either dialect — the sanctioned exceptions are the pair's fixed render grace and the `wait` before an assert on the app's own timer after `go_offline` / `go_online` (`local-rules.md`, _Synchronization_).

## Worked example — custom select + text-anchored row

**Scenario:** "On the Accounts page, set the Environment filter to Production and verify the acme-prod-finance account row is shown."

> **Self-provisioning caveat (binding — `local-adaptations.md`):** the row named here is legitimate ONLY because the test's own earlier steps created the `acme-prod-finance` account (a stored random identity, filled, submitted) — the snippet is truncated to the filter-and-assert tail to show the locator shapes, and in a real payload the name enters as `<<accountName>>`, never as a literal, and the record is never one that pre-existed in the app.

Observe: `open …/accounts && snapshot --depth=3` → semantic table (`data-slot="table-row"` rows), and "Environment" is a Radix trigger — a **button** in the snapshot, no native `<select>` anywhere. Two clicks, not a `select`; the option exists only after the trigger opens, so the trigger click carries the reveal. The row's only per-instance anchor is its account name — a stable business identifier, expressed as `ROLE` row + name (legitimate: the scenario names the record).

```json
{
  "scenario": "Environment filter shows the acme-prod-finance account",
  "url": "https://<app-host>/accounts",
  "status": "draft",
  "steps": [
    {
      "index": 1,
      "action": "navigate",
      "value": "https://<app-host>/accounts"
    },
    {
      "index": 2,
      "action": "click",
      "element": {
        "pageId": "accounts",
        "locator": "page.getByRole('combobox', { name: 'Environment' })",
        "name": "Environment filter"
      },
      "revealsSelector": {
        "value": "page.getByRole('option', { name: 'Production' })"
      }
    },
    {
      "index": 3,
      "action": "click",
      "element": {
        "pageId": "accounts",
        "locator": "page.getByRole('option', { name: 'Production' })",
        "name": "Production option"
      }
    },
    { "index": 4, "action": "wait_for_ajax" },
    { "index": 5, "action": "wait", "value": 2 },
    {
      "index": 6,
      "action": "assert",
      "assertions": [
        {
          "type": "element_state",
          "expected": "visible",
          "element": {
            "pageId": "accounts",
            "locator": "page.getByRole('row', { name: 'acme-prod-finance' })",
            "name": "acme-prod-finance account row"
          }
        }
      ]
    }
  ],
  "observations": [
    "Code app: no data-block-* hooks exist. Environment is a Radix combobox (trigger button + portal options) — decomposed into two clicks, never select; the trigger click reveals the option it opens. Picking the option applies the filter — a refetch — so the readiness pair follows it before the row assert. Row anchored by its account name (stable business identifier, scenario-named) via ROLE row + substring name; roles/names taken from the snapshot, not assumed."
  ]
}
```
