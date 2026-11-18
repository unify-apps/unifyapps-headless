# Builder-app dialect (`testSubject: 'interface-builder'`, or absent)

## Contents
- Durability ladder
- Form controls
- Overlays — what to anchor the surface by
- Hydration — the #1 false failure
- Transient SSR 404
- Worked example — navigation with a destination assertion

**DOM facts:** block-based; `data-block-id`/`-runtime-block-id`/`-type` on everything; click targets are often role-less `<div>`s; field labels usually NOT associated. Server-rendered then hydrated: **visible ≠ interactive**. Ids in the DOM are builder-assigned and stable. Per-instance anchor in repeated items: the runtime block id — but value-check it first: runtime block ids frequently EMBED record identity (`runTimeBlockKey_b_chip_status_CHG-1042`), and an identity-carrying value follows the same classification as any record-bound anchor (scenario-named records only). Best hook overall: `data-block-id`.

The a11y snapshot does **not** show `data-*` attributes — read every touched element's hooks with one chained `eval` covering all candidate refs, never one call per element.

## Durability ladder

Pick the highest-stability hook the live DOM supports, then verify exactly one match:

1. **Explicit test hook — always with the value check; the two are one operation.** Builder apps render platform-generated `data-test-id`/`data-cell-id` attributes whose values are machine-generated element ids (`e_` + hex) — those are **banned as hooks outright**. But builders can also author **custom** HTML attributes on their blocks, and a static, human-authored value (`data-testid="invoice-table"`, `data-qa="submit-btn"`) is a first-class rung-1 hook. The key never decides — the **value** does: read it before using it, and an id shape (`e_`+hex, 16+ hex chars, a 24-hex Mongo id, a UUID) or any data-dependent value → reject the attribute and move down the ladder, no matter how test-friendly the key looks. Using a test-hook attribute without having read its value is the defect; when the value fails the check, rung 2's `data-block-id` is the platform's reliable hook.
2. **`data-block-id`** — stable, machine-generated, label- and layout-independent; usually the **best hook**. Word-like (`b_nav_dashboard`) and short-code (`b_U2CkQ`) forms are equally stable builder-assigned ids, not per-render hashes. Target the exact block the step acts on. **Carve-out — the scenario names the element by its visible label/role** ("click the Login button", "the Username field"): there rung 3's semantic form (`ROLE` + name / `LABEL`), when it measures unique in the a11y tree, **outranks the block id** — it encodes what the scenario said and survives block regeneration and app variants where the same control is a different block. The block id stays the hook when the semantic form is ambiguous even after container scoping, when the element has no accessible name, or when the scenario doesn't name it (_The scenario names the anchor_, main instructions).
3. **Role + accessible name** — `getByRole('heading', { name })`, `getByLabel(...)` — for genuinely semantic elements; ideal for destination-content assertions. Many clickable blocks are role-less `<div>`s, so this often won't match the _action_. Builder tables DO render semantic rows whose accessible name is the row's cell text — which makes this rung the easiest place to smuggle record identity into a locator: `getByRole('row', { name: 'INV-VEN0005-…' })` is a record-bound anchor, legitimate ONLY for a record the scenario itself named. For an "any"/positional/property-selected item the name-anchored row is banned outright — the slot encoding or the property doctrine applies (_The scenario names the anchor_, main instructions).
4. **`data-block-type` scope + text** — only when no block id targets it. Text is the weakest hook (relabeling, non-uniqueness) — keep it short, assert count === 1: `page.locator('[data-block-type="Card"]').filter({ hasText: 'Analytics' })`.
5. **Never**: positional hooks (`data-block-pos`, `nth`, `.first()`), dynamic values (counts, dates, generated names), deep CSS chains, structural CSS (`>`, descendant space, `+`/`~`, `:nth-child`) — chain `.locator()` instead; the a11y tree hides platform-injected wrappers. The compiler **rejects** all of these. (Carve-out: a scenario-positional/generic target is encoded as `NTH_CHILD` under a durable container candidate — main instructions, _The scenario names the anchor_.)

**A block id inside a repeating region matches EVERY instance — and "the repeated item root" is verified, never guessed.** Builder repeats clone the block, so all instances share one `data-block-id`; several nested blocks inside each item are themselves `Card`/`Stack` types, and the block-type alone never says which one is the item root (failed run: an inner Availability strip — `data-block-type="Card"` — taken for the candidate card; every containment probe built on it was false). Before any count, sweep, or slot chain treats a block as the repeated item, verify BOTH live during the walk: (1) its instance count equals a member count established independently (the visible item count, a stored baseline — mind virtualization: rendered can exceed visible); (2) instance 1 CONTAINS the item's expected inner blocks (one `querySelector` probe on the live page — name, avatar, action button). A block failing either is an inner fragment, not the item — walk up the ancestor chain and re-verify.

**Content-derived accessible names are DATA, never hooks.** A surface or container whose accessible name is computed from its contents — a panel whose role+name reads as its children's labels concatenated ("Apply Filters filter-items add-condition clear-filters apply-filters"), a wrapper named by its current values — recomputes the moment its contents change (a filter chip renders, a row appears) and the locator dies mid-run. The tell is mechanical: a name that reads like several labels glued together. Never anchor a surface by such a name; a portal-rendered surface takes its attribute hook (a static `id` via `[id="popover-content"]`, or a `data-*`) as the parent level, targets as semantic children. The same litmus as everywhere: would this accessible name change while the feature still worked? Yes → it is data, not a hook.

**Strategy order** (most durable first): 1. `ELEMENT_ID`/`DATA_BLOCK_ID` — best for a **click target the scenario doesn't name by its visible label** (a scenario-named label/role promotes `ROLE`/`LABEL` above this — rung-2 carve-out). 2. `ROLE`/`LABEL` — for **form controls**, destination assertions, and scenario-named elements; prefer a `ROLE` leaf scoped by a `DATA_BLOCK_ID` parent **when the block id sits on a wrapper around the control** — a block id on the control itself takes no `children` (leaf rule, main instructions); bare `LABEL` only after confirming a real association. 3. `RUNTIME_BLOCK_ID` — disambiguating a repeated block. 4. `BLOCK_TYPE`/`HTML_ATTRIBUTE`, normally scoped by a parent via `children`; `ELEMENT_TYPE` for structural descent through hook-less scaffolding (`tbody`, `tr`, `ul`) under an anchored parent — prefer it over stacked blind `NTH_CHILD` levels, never for a form control. 5. `NTH_CHILD` — only when nothing else distinguishes it, and say so in `observations`.

**Hook → locator link (the closed vocabulary — the store DERIVES candidates from your locator):**

| hook                           | locator link                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| block id                       | `.locator('[data-block-id="b_nav_dash"]')`                                                                                       |
| runtime block id               | `.locator('[data-block-runtime-block-id="rb_42"]')`                                                                              |
| block type                     | `.locator('[data-block-type="Button"]')`                                                                                         |
| literal `id` attribute         | `.locator('[id="new-ticket-card"]')` — **attribute form, never `#id` CSS** (form-field ids carry dots: `root.f_xxx`)             |
| any attribute(s)               | `.locator('[data-scroll-id="root.F1"]')` — pairs compounded, no spaces; never key `class`, never a styling token                 |
| role + accessible name         | `.getByRole('button', { name: 'Log in' })` — `exact: true` only when you mean to state it                                        |
| label association              | `.getByLabel('Username')`                                                                                                        |
| static visible text            | `.getByText('Approvals', { exact: true })` — static UI text only, never data                                                     |
| bare tag (scaffolding descent) | `.locator('tbody')` — **never `getByRole('row')` for a tag**: the tag and the role are different engines matching different sets |
| positional slot                | `.locator(':scope > :nth-child(3)')` — only ever chained under an anchored link, never first                                     |

Chained example — block-id parent → tbody descent → first row: `page.locator('[data-block-id="b_IX71U"]').locator('tbody').locator(':scope > :nth-child(1)')`. Same-meaning-different-engine is still wrong: spell the hook you verified, in the link form above — anything outside this vocabulary fails the compile with the link named. **Class names are banned as hooks and as assertion subjects** (class-name ban, main instructions): `HTML_ATTRIBUTE` never takes key `class`; a class-only element is a `AskUserQuestion`, not a locator. The same goes for the platform's **styling-token attributes** — `data-color`, `data-size`, `data-variant` (theme tokens like `text-brand-tertiary` on `ua-icon` svgs): presentation, never hooks or assertion subjects; selection/toggle state reads its semantic carrier (`data-selected` on the toggle block, `aria-pressed`, `data-state`).

## Form controls

Component libraries render **decoys beside the real control** — the test for a decoy: **would a user see or interact with it?** Anything `aria-hidden`, zero-size, off-screen, or `readonly`-for-measurement is one, whatever the library: MUI/Joy autosize `Textarea` adds a second `aria-hidden` `readonly` `<textarea>` for height measurement; a Select renders a hidden native `<input>`; pickers render off-screen mirrors — and tomorrow's library will render its own variant. Tag-based selectors match them all and fail on multiple matches; `ROLE`/`LABEL` resolve through the a11y tree, which excludes `aria-hidden` by construction. Hence: `DATA_BLOCK_ID` for a _click_, block-id scope + role leaf for a _form control_.

**`LABEL` needs a real label→control association — visible text above the field is not enough.** Builder forms usually render field titles (`Username*`) as separate, unassociated nodes — no `for`, no `aria-label` — so `getByLabel('Username')` resolves to **zero**. Verify the association first (confirm the locator resolves to 1, or read the a11y name from a scoped snapshot). Without a real association, pick in order: (1) **`ROLE` scoped by the field's `data-block-id`** — `page.locator('[data-block-id="…"]').getByRole('textbox')` — the most durable UnifyApps form hook; (2) **placeholder** — `getByPlaceholder(...)` when unique (author as an `HTML_ATTRIBUTE` candidate on `placeholder` or inline).

## Overlays — what to anchor the surface by

The surface-first HARD RULE (main instructions, _The locator vocabulary_) applies with full force here: every control inside a popover, modal, drawer, menu, or tooltip chains under the overlay's own hook — checked BEFORE uniqueness, so a bare inner hook that measures 1 is not an exemption. Builder overlays come in two kinds, with different anchors. An overlay that IS a builder block (a dialog or drawer authored in the builder) carries a `data-block-id` on its root — that's the surface anchor, same as any block. A **platform-rendered** overlay (MUI `base-Popup` filter menus, pickers, dropdown panels) mounts in a **portal at document end**, far from the block that opened it, with generated class soup on its wrappers — the anchor is a static marker on the content root (`data-test-id="filter-menu-content"`, a static `id`), value-checked like any hook (an id-shaped value is not an anchor); failing that, the overlay's role or a `BLOCK_TYPE` inside it. Portal rendering is exactly why the bare inner hook is untrustworthy on these surfaces: the control's DOM neighborhood shares nothing with the page region it logically belongs to, so only the surface chain says which overlay owns it.

## Hydration — the #1 false failure

SSR markup passes actionability checks _before_ the client-side framework hydrates; a click in that gap succeeds as an action but is a **no-op** — nothing happens, and a later assertion times out though earlier steps are green. You never script the guard — you record the observed effect on the step (`navigatesTo`, or the reveal, per the main instructions' _Observed facts_), and the compiler emits the retry wrap that **re-issues the click** until the effect appears.

**You will not see the race on your warm walk — anticipate it.** By the time you click, the page hydrated long ago; the failure surfaces only in the compiled run's cold load. So "I didn't see it fail" never means "no guard": for any action whose effect a later step depends on, record that effect the first time you compile — a first-pass default, not a reaction to a red run.

**But record only what you observed — don't sprinkle reveals.** The guard re-issues the _action_; a wrong marker re-clicks forever — worse than no guard. When unsure a click is even hydration-sensitive **and** no later step needs its effect, leave the fact off and let the scenario's assert catch a real no-op loudly. A **state-mutating or refetching** click carries no reveal at all — it is followed by the readiness pair instead (_Navigation guards_, main instructions); reveals here cover navigation and surface-opening clicks.

## Transient SSR 404

On builder preview deployments a route change occasionally renders a transient 404 with the **correct URL** (resolves on reload) — the compiler's readiness guard handles it _when it has a destination-specific marker to wait on_, which is why URL-alone is never enough. Always give navigating steps a destination-specific marker per the main instructions' _Navigation guards_.

## Worked example — navigation with a destination assertion

**Scenario:** "Click the Analytics card on the dashboard; it should open the Analytics page."

Observe: `playwright-cli open https://app.example.com/dashboard && snapshot --depth=3` → a Card "Analytics"; `snapshot e44` → `data-block-id="b_nav_analytics"`; measure (`querySelectorAll` → 1); `click e44` → `/analytics`, heading "Analytics"; `go-back`. Two element objects: the card via `DATA_BLOCK_ID`, the heading via `ROLE`.

```json
{
  "scenario": "Analytics card opens the Analytics page",
  "url": "https://app.example.com/dashboard",
  "status": "draft",
  "steps": [
    {
      "index": 1,
      "action": "navigate",
      "value": "https://app.example.com/dashboard"
    },
    {
      "index": 2,
      "action": "click",
      "navigatesTo": "/analytics",
      "element": {
        "pageId": "dashboard",
        "locator": "page.locator('[data-block-id=\"b_nav_analytics\"]')",
        "name": "Analytics card"
      }
    },
    {
      "index": 3,
      "action": "assert",
      "assertions": [
        {
          "type": "element_state",
          "expected": "visible",
          "element": {
            "pageId": "analytics",
            "locator": "page.getByRole('heading', { name: 'Analytics' })",
            "name": "Analytics heading"
          }
        }
      ]
    }
  ],
  "observations": [
    "Analytics card is a role-less div; block-id is the hook. Route confirmed by clicking; navigatesTo is the guard, not an assertion. The one stated outcome is asserted against the destination heading; no bare URL assert added."
  ]
}
```
