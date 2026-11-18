---
user-invocable: false
name: app-native
description: Only for the app-agent builder agent. Overlay on the app-design skill for MOBILE apps on UnifyApps, which render on the UnifyApps mobile renderer (React Native) — the native block catalog, the blocks that render nothing, tap and scroll ownership, safe area, style JSON, and the device proof loop, which runs the app's saved draft in the UnifyApps Preview app. Use the moment get_app_overview or create_app reports appType MOBILE, before planning blocks or reading a block sheet; it overrides app-design wherever the two differ.
---

# Building a native (mobile) app

The `app-design` skill is the procedure; this one is the overlay for a native
target, and it **wins wherever the two differ**. Load it as soon as
`get_app_overview` or `create_app` reports `appType: MOBILE`, before the block
plan, not after the first thing renders wrong.

A MOBILE app runs on **the UnifyApps mobile renderer**, a React Native renderer with its own
block registry. It is NOT the builder's `mobile` device variant (a responsive
**web** breakpoint). The `blocks/…` sheets describe the web renderer and are
wrong about native in ways that fail silently, so on MOBILE you read the
`native/blocks/…` sheets instead (§ Sheets on a native target). The tools are
the same `application-builder` MCP tools.

## Blocks that render NOTHING on native

Silently, no error, no placeholder: `Meeting`, `Records`, `EventsTimeline`,
`Password`, `OrganizationChart`, and common web-only blocks — AudioPlayer,
Barcode, Cascader, Chat, CodeEditor, Comments, ContextualDialog, CustomBlock,
Kanban, Menu, MultiStatsCard, NavigationContainer, NavigationMenu,
PhoneNumber, RichText, Slider, SlotOutlet, Stepper, SteppedContainer,
TemplateComponent, Timeline, TreeView. `Rating`, `Counter`, `CopilotVoice` and
`CopilotVideo` do render on the phone; a client's build can leave out the two
Copilot ones.

Substitute: Password→TextInput with `content.inputType: "password"`,
Stepper→StepperV2, ContextualDialog→MobileContextualDialog,
MultiStatsCard→StatCard, Timeline→EventsCalendar or Repeatable,
NavigationMenu→Tabs/Drawer/page chrome, clickable Stack→Pressable. Pick every
block from
[references/block-catalog-native.md](references/block-catalog-native.md).

## Native block before hand-build

Check this table before you build a control from Stacks and Pressables.

| You want | Use |
| --- | --- |
| Number stepper (+/-) | `Counter` |
| Skeleton while loading | `Loader` with `appearance.type` `CONTENT`, plus `styles.width` and `styles.height`. Show it with a visibility condition. |
| List paging | `Repeatable` with `addOns.page.type` `INFINITE`. Always bind `total` and bind `content.data` straight to the data source. In a BottomSheet also set `behaviour.scrollableBody` to false. |
| Empty state | No block exists. Use one sibling block bound to the data source state. Never show it while the source is fetching. |
| Pager UI (pages, Prev/Next) | None on MOBILE. Use `INFINITE`. |

## The eight basics — grab the RIGHT one first

| You want | Use |
| --- | --- |
| Lay things out (column/row box) | `Stack` — it takes no taps, and scrolls only with a scroll `overflow` token (rules 1, 2) |
| Any text, anywhere | `Typography`, never text inside another block |
| A labelled tap target | `Button` |
| Make arbitrary content tappable | `Pressable` wrapping it |
| Plain content that must scroll | `Scrollable` (rule 2) |
| A list FROM DATA (rows off a binding) | `Repeatable` with `scrollable: true`; no inputs in its rows (rule 3) |
| Swipeable slides / paged panels | `Carousel`, not a general horizontal scroller |
| A surface sliding up over the page | `BottomSheet` (rule 4) |

## Safe area — ONE inset, ONE owner

The top inset is reserved exactly once, by whoever is topmost:

- Page has a visible HEADER slot → the header owns the top inset. The body
  adds NOTHING; `p-safe`/`pt-safe` there double-counts into a dead band.
- Read `root_id` BEFORE deciding. A fresh app's body can ship seeded with
  `padding: {all: "p-safe"}`. Seeded and no header → the body already owns
  the inset: add nothing to its first block. Seeded and a visible header →
  unset that body padding in the same batch. The seed occupies `root_id`'s
  only `padding` key, so the ONE horizontal page padding goes on a single
  body Stack directly under `root_id`; that Stack-in-Stack is deliberate,
  keep it and say so in the optimization pass. Decide from the read, never
  by asking.
- No header and no seeded body padding → the FIRST content block in the
  body takes `margin: {t: "mt-safe"}` (top-only, not all-sides `m-safe`), or
  a `pt-safe` top padding. BottomSheets, Modals and Drawers sit first in the
  body and take no layout space, so skip them when finding that block.
- Bottom inset belongs to the page footer/tab chrome; content blocks do not
  pad for it. Under a floating tab bar, the end of each tab page clears the
  bar ([references/mobile-navigation.md](references/mobile-navigation.md)
  rule 5).
- The `*-safe` tokens are mobile-only values; `get_style_options` with
  `applicationType: 'mobile'` lists them.

## Iron rules (each looks right in the builder, breaks on the phone)

1. Tap fires on `Pressable.onPress`, `Button.onClick`, `IconButton.onClick`,
   `Card`/`StatCard.onClick`, `Repeatable.onSelectItem`, form inputs, and the
   native-only gesture blocks' own events. `Stack.onClick` and `Icon.onClick`
   are DEAD; wrap in a `Pressable`. `onSelectItem` fires but shows no press
   feedback, so a list row's tap surface is a Pressable at the row's root
   (rule 17).
2. The page body does NOT scroll: content taller than the screen is cut off.
   Scroll comes from a `Scrollable`, a Repeatable with `scrollable: true`, or a
   Stack with one of the `overflow` tokens in `native/blocks/stack`
   (`native.md` rules 6–7). A scroll container needs a bounded height;
   `flex:1`/`h-full` INSIDE a scroll region collapses to zero. Plain content
   scrolls in a `Scrollable`. Only when `create_block` refuses a Scrollable,
   use a one-item Repeatable as the scroll host (`native.md` rule 9).
3. Inputs inside a Repeatable row render but do not take taps; put editors at
   page level (BottomSheet/Form keyed by a current-row page var).
4. BottomSheet opens via `controlDrawer` (`{drawerId, operation:'show'|'hide'}`);
   `controlBottomSheet` does not exist. Write the vars a sheet reads in the
   same chain BEFORE `show`. Give every sheet a height: an explicit height,
   snap points, or `h-auto` to size it to its content (capped at 90% of the
   window; `native/blocks/bottom-sheet`). With none it opens at 61.8% of the
   window.
5. Custom CSS is Style JSON on native: numeric values as NUMBERS, not px
   strings; token ids inside per-side `{custom:{…}}` maps are silently ignored
   (raw px only); `htmlAttributes`, selectors and `:hover` are inert.
6. `backgroundColor` HIDES `backgroundImage`; CSS gradients and `var(--…)`
   paint nothing. A gradient is `linearGradient` in the Style JSON, written as
   text to `additional.customCSS` only
   ([references/gradient.md](references/gradient.md)).
   `borderWidth/Style/Color` must all use the same map form or every render
   throws; empty-string style values (`{all:""}`) throw.
7. Bindings are written directly, no space between the braces: `{{ … }}`; an
   object literal inside one needs no round brackets — `{{ { "k": v } }}`
   works; row scope is
   `b_<rep>['context']['item']`/`['index']` (`currentItem` does not exist);
   guard var reads `(v['value']||{})['k']`.
8. `deviceContext` bindings save with no dependency edge and never
   re-evaluate; bind the `userContext['context']` mirror instead.
9. Iframe IS the native WebView: `data:` URIs hard-crash the app; the
   "blocked By CSP" banner is a mislabeled generic error; it paints solid
   white while loading; size it explicitly.
10. Every TextInput needs `onChange` wired or typed text silently drops.
    Page inputs are declared with `update_page_contracts`; declare every one a
    page reads. On the phone a declared input arrives with its type on a
    current tenant, and as text on an older one (`"3"`, `"true"`,
    an object as its JSON text); an undeclared name always arrives as text.
    Write bindings that read both, and pass an id, not a record (`native.md`
    rule 43).
11. `matrix://<slug>` deep links cannot reach bottom-tab-hosted pages;
    `navigateToPage` no-ops on unplaced pages (`address: null`).
12. Foregrounding the app never refetches page config. For device proof, tap
    the upper half of the Preview app's floating pill: it fetches the saved
    draft and comes back to the same page. A relaunch fetches it too but
    lands on the start page.
13. A scrolling `Repeatable` (`content.scrollable` true or absent — it
    defaults to true on the phone) never sits inside a `Scrollable`, another
    scrolling Repeatable, a Stack with a scroll `overflow` token or a
    `keyboardConfig` of `type: "scroll"` on the same axis, a BottomSheet whose
    body scrolls, or a Tabs pane or footer under a Tabs `header` slot — the
    list owns its scroll (`scrollable: true`, `customStyles`
    `flex: 1`, a parent that does not scroll, what sat above it in its
    `header` slot — the header renders once, scrolls away with the rows and
    is not sticky); nested, no row is virtualised and a long list stutters or
    blanks. A hero above tabs that scrolls away while the tab strip pins is
    the Tabs `header` slot: every pane then scrolls on its own, so a
    Repeatable in a pane is `scrollable: false` and short. The page quality
    pass reports it as P1.
14. Block inputs take plain references (`{{ var_x['value'] }}`,
    `{{ ds_x['data'] }}`); `.filter`/`.map`/`.reduce`/`.sort`, arrow functions
    and a `{{ }}` expression over 200 characters go in a manual page function
    (`runBehaviour: 'manual'`) run by a `triggerFunction` action on page load,
    the source's `onSuccess`, or the relevant `onChange`, and the block binds
    `{{ func_x['value'] }}` — an inline expression re-runs on every change it
    reads, per block and per row (P2). This manual function replaces the
    automatic one that `app-page-build` § The bind task writes on web.
15. A page whose header has a close cross opens as a modal: `navigateToPage`
    with `overridePageAnimation: true` and
    `pageTransitionBehavior: 'adaptive_sheet'`; a back-arrow page is pushed
    with no override — without `overridePageAnimation` the transition key is
    dropped and a cross page slides in sideways (U8). One exception: a page
    that is itself open as a sheet cannot open another sheet. The second
    `adaptive_sheet` does not open on the phone and shows no error, though the
    web preview opens it (`native.md` rule 56). Open the second page from the
    page underneath, or push it with no override and give its header a back
    arrow.
16. A result comes back through `navigateBack` with
    `navigateToSpecificPage: true`, `pageId` of the page underneath and
    `pageInputs` (send every input it was opened with again; they REPLACE the
    old ones and the page reads them in `onPageFocus`, `onPageLoad` does not
    run again), plus `pageParams` when that page's path has a `:` part
    (`actions/navigate-back`); either flag alone is a plain back. A result
    that must outlive one pop goes to `setLocalStorage` or an app variable on
    the global page. A mobile app has NO session storage: never
    `setInterfaceSessionStorage` or `sessionStorage[...]`.
17. Every tappable gives press feedback through a Pressable's
    `appearance.interactions`, by surface: a white/flat card or tile
    highlights (`highlightColor: { "custom": "#EFF0F2FF" }`, `opacity: 1`,
    `scale: 1`); a coloured pill, photo card or icon tile dims
    (`opacity: 0.6`); a solid CTA or chip shrinks (`scale: 0.96`,
    `hapticFeedback: "light"`); a text link or icon dims more
    (`opacity: 0.5`); `androidRipple: false` so both platforms feel the same.
    A Repeatable row tapped through `onSelectItem` or a Carousel slide
    through `onSlideClick` shows nothing: make a Pressable the root of the
    row or slide and move the action to its `onPress`, where the row reads
    itself as `{{ <listId>['context']['item'] }}`. The highlight fades from the
    Pressable's OWN background, so on a white card the Pressable carries the
    white (or fills the card from inside it); a white Stack painted over it
    hides the highlight.
    `update_blocks` accepts `appearance.interactions` on a Pressable only
    (U1).

The full rules and the per-block support matrix are in
[references/native.md](references/native.md).

## Readable config

Config is read by the person who debugs the app, so write it like code:

- `additional.customCSS` is JSON text on mobile, written pretty-printed as
  `JSON.stringify(value, null, 2)` prints it — `apply_page_edits` pretty-prints
  what it stores.
- Page function bodies: one statement per line, two-space indent.
- Inline scripts (`executeScript`, logic inside a binding) are a last
  resort, only when no block, action or page function can do it —
  `apply_page_edits` and `update_event_actions` warn on every `executeScript`
  they store.

## Smaller lessons

- Use a block's built-in behaviour before hand-rolling state with page
  variables: an accordion is a column of collapsible Cards
  (`content.collapsible.enabled`, plus `hideDefaultIcon` and an Icon bound to
  `isCollapsed` in the header for a custom chevron — the header row still
  toggles, so no Pressable); steps are Tabs; a list is a Repeatable. See the
  accordion recipe on `native/blocks/card`.
- TextInput side padding goes inside the `input` key of
  `additional.customCSS`; padding on the root lands on the wrapper around
  label, field and caption.
- `HTML` and `MARKDOWN` Typography load lazily on the phone — use
  `PLAIN_TEXT` for text that must be there on first paint.
- Figma frames are often 440pt wide; most phones are 402pt. Use flexible
  widths (`flex`, percentages), not the frame's fixed numbers.
- The bottom safe area is a padding token:
  `appearance.styles.padding.b: 'pb-safe'` on the chrome that sits on the
  bottom edge, such as a footer bar or a custom tab bar's root (§ Safe area).
- Loading without flicker: only regions fed by a data source wait. Static
  chrome and the greeting (`{{ userContext['name'] }}`, always present on a
  private page) render at once. Data regions show a light, loose skeleton of
  solid `CONTENT` Loaders while the source has neither `data` nor `error`,
  never `isLoading` alone, since a manual source starts empty on every run
  (`concepts/pages/loading-states`).
- Never send who the user is (email, id, name) as a data source parameter —
  the automation behind it reads the signed-in user's own User Variables, and
  a value sent from the page can be swapped for another user's.
- A page keeps the Android back button for itself with `onPageBack`; its
  chain must end with `navigateBack` (or `controlUser` `logout`), and never
  behind a `runCondition`, because the press is taken whether or not an action
  runs. Android only, so a page nobody may leave also needs
  `full_screen_modal` for iOS (`native.md` rule 60).

## Sheets on a native target

This is the one statement of which sheet to read on a MOBILE app; the other
files point here.

- A block with a native contract has two sheets: `blocks/<block>` for WEB and
  `native/blocks/<block>` for MOBILE. On MOBILE read `native/blocks/<block>`:
  the write gate asks for that one for the block itself, not the web sheet.
- A table column, a filter control or a chart type has no phone copy, so for
  those the gate asks for the `blocks/...` sheet on MOBILE too.
- Name the sheet you need most first, so it always ships, and ask again
  only for what `omitted` still lists.
- A `native/blocks/…` sheet is written from the native renderer's own code,
  and `ai-editing/native-custom-styles` is the Style JSON grammar. For a
  block's keys, values and how they are stored, the sheet wins. This skill and
  `references/native.md` hold what no block sheet says: which block to pick,
  scroll and tap ownership, the safe area, the device loop. When a sheet and
  these rules disagree, follow the sheet and report the clash as bug
  feedback.
- One known clash goes the other way. `native/blocks/scrollable` says the
  page body scrolls on its own, so a Scrollable around the body nests two
  scroll views. The body does not scroll: the phone draws it in a view of
  fixed height that cuts off what does not fit (`concepts/appearance-styles`).
  Follow iron rule 2 here, not that sheet, and report the clash as bug
  feedback.

A `trivial` change works the same on native with this skill loaded: you decide
what is worth reading, and the gate still needs the block's sheet. Never grep a
platform source repository.

## Verify a native write on a device — on request only

The default proof is the structural read-back in `app-verify`; record
`device: not requested` unless the person or the accepted Proof row asks for a
phone or simulator. When asked, follow
[references/native-verify.md](references/native-verify.md). Inside a
UnifyApps Headless loop run a builder never drives a simulator itself: it saves the
draft and reads it back, and the run's own workers check it on the simulator
pool; the brief says so.

A device check needs no publish of the change. The UnifyApps Preview app runs
the app's saved **draft**, once the app has been published at least once. It
refuses a link to an app never published; such an app opens only from the
builder's QR with "Use current login session" on. On a simulator or emulator, `scripts/preview.mjs open <app id>` reads
the app's Preview link from the tenant, checks that the app was published once
(it opens nothing when it never was, and says so), prints the link and opens it
on the booted device; the app asks "Choose a version to open", and you pick
**Draft**. A link to the app already open is
ignored, so to switch versions choose Exit Application in its debug sheet
first; that also signs the app out.
On a phone the person scans the builder's Preview QR code or pastes its "Copy
preview link" and picks **Draft**, or turns on "Use current login session",
which always opens the draft. After each save, tap the upper half of the
Preview app's floating pill: it fetches the new draft and comes back to the
same page, while a relaunch lands on the start page. Then check on the device.
The pill is the Preview app's own, in every screenshot; it is never a finding.
Publish only in the
assigned `publish` task, never to see a page. A client's own store build runs
only the published version, so it cannot show a change that is not published
yet.

This is where a MOBILE app differs from a WEB one: a WEB page is seen in the
browser preview, while the preview draws a MOBILE app with the web blocks, so
only the device shows the native page. A builder-canvas screenshot is never
device evidence, and the `application-builder` server has no `verify_app` tool.

## What a native build owes at the end

By default, what any page proves: the read-backs (`app-verify`) — blocks from
the native catalog, bindings, sources and callbacks each read back as
written — and `device: not requested` in the record. **Seen on the phone** is
claimed only when the device loop ran. The person hears the difference:
"The page is built and wired." against "The page is built and I saw its draft
on the simulator." Never "it should work".

Fix every line of the `warnings[]` that `apply_page_edits` returns before the
task is reported `ok`. The one line that may stay is an `executeScript` kept
as the last resort (§ Readable config), with why in the report's `notes`.

A score fix that breaks a rule here is an exception (`app-verify` § The best
practice score).

A page a plan builds is two tasks here as on web (`page <path> — layout` and
`page <path> — bind`, the `app-page-build` skill), with the
native catalog and the safe-area rule applied in the layout task, and
`publish_app` belonging to neither by default.

## Reference files

| File | Read it when |
|---|---|
| [references/block-catalog-native.md](references/block-catalog-native.md) | choosing any block; the native-built blocks one line each, then the blocks shared with web |
| [references/native.md](references/native.md) | the full iron rules and the per-block support matrix |
| [references/gradient.md](references/gradient.md) | a background gradient on a native Stack |
| [references/native-verify.md](references/native-verify.md) | the device loop on the draft in the UnifyApps Preview app, and the manual checklist fallback |
| [references/mobile-navigation.md](references/mobile-navigation.md) | bottom tabs, drawer or stack-only; seeding and attaching the custom tab bar or drawer module, and the bar it seeds; a floating bar; a raised centre button; badges |
| [references/data-layer.md](references/data-layer.md) | validation, derived values and constants written once: a constants folder, one validator function per page, one plain action chain per button |
| `skills/app-page-quality/references/rulebook.md` | building or reviewing any mobile page; a plan's page quality pass audits with it, so prevent its findings here |
