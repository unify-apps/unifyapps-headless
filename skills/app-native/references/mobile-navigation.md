# Mobile navigation

Read this when the task sets up or changes how a MOBILE app moves between
screens: bottom tabs, a drawer or stack-only; adding a tab or drawer entry;
styling a custom tab-bar or drawer module; a floating bar with content
scrolling under it; a raised centre button; badges. Mobile navigation is NOT
web navigation — none of the web menu's appearance keys carry over, and the
failures are silent: a blank tab, a bar that no longer floats, a centre
button whose top half cannot be tapped.

A MOBILE app has exactly one primary navigator — bottom tabs, a drawer, or
none (stack only) — and every page that is not a tab or drawer entry is a
stack page pushed over it.

## Contents

- The rules
- The bar the tool seeds
- Tools
- Which action to wire between screens
- Transitions
- Related

## The rules

1. The phone reads only `appearance.SM`. The navigator is
   `navigationBar.navigatorType` (`BottomTabsNavigator`, `DrawerNavigator`,
   `None`). `get_navigation` reads it and no tool writes it (Tools, below):
   it is set in the builder, under Navigation → Appearance, and a new app
   uses bottom tabs. An unset type with no module renders every tab page
   blank. A task that needs another navigator, or finds every tab page blank,
   reports `needs_confirmation` naming that builder step.
2. Only top-level `PAGE` items become tabs or drawer entries; keep
   `defaultPageId` on one of them, and keep `primary` empty on a stack-only
   app. A default page outside the tabs opens the app with no tab bar; items
   left under `None` make navigation to them do nothing.
3. Anything beyond the default bar's theme colours needs a navigator module,
   and `set_navigation_style` seeds one and attaches it in a single write:
   `{host, appId, resolutions: ["SM"], style: "custom", createModule: {}}`.
   Send `resolutions: ["SM"]` and nothing else — the phone draws its bar from
   `SM`, and every other size is stored unread. The reply's `createdModuleId`
   is the module to style with the page tools. `moduleId` attaches a module
   the app already has; both together are refused, and so is `custom` with
   neither. `style: "standard"` puts the platform's bar back and leaves the
   module itself alone. On a phone the write sets `navigatorModuleId` only and
   never `navigatorType`, so the bottom-tabs-or-drawer choice the module was
   built for survives it. A navigator on `None` is the one case where the
   module is attached and nothing draws it: the reply warns, and choosing
   Bottom tabs is a builder step, so a task that finds `None` reports
   `needs_confirmation` naming it. `navigationItem.text`/`icon`/`background`,
   `overflowDetails`, `.type` and `.floatingOffset` are not read on the
   phone, and `appearance.SM.styles` only sets a custom drawer's width.
4. Inside the module, the active screen is `pageInputs['activeTab']` (a
   slug), never `activeItem` — it is always empty on the phone, and comparing
   `activeTab` with a page id never matches. A tap is a plain `navigateToPage`
   on the item's `pageId`; it switches tabs in place.
5. A floating bar needs: one app variable for the bar height (a `constants`
   folder page variable on the global page); the module root
   `position: absolute` (`bottom`/`left`/`right` 0, transparent background,
   `pb-safe`); and the end of each tab page clearing the bar height plus the
   bottom inset, `((deviceContext['safeArea'] || {})['bottom'] || 0)`. Write
   that space as the last content block's bottom padding, or else as a
   spacer block of that height; the page quality pass notes a spacer as
   advisory (U3). Never put an overflow scroll token or a background image on
   that root — the phone does not measure a custom bar, and either one puts
   the root back into normal layout, which breaks the float.
6. A raised centre button lives inside the module root's bounds (a
   transparent top band above the bar), lifted inside a plain Stack, and is
   never nested inside a rounded Pressable: a rounded Pressable clips its
   children, and touches outside a parent's box are unreliable on Android.

## The bar the tool seeds

`createModule` seeds the same bar the builder's own Create does, named *Custom
Bottom Navigation* (*Custom drawer navigation* on a drawer app). It arrives
already wired to the app's menu, so style it rather than rebuild it:

| Block | What it is |
| --- | --- |
| `body` (root) | The bar itself: a row Stack, `space-around`, items centred, `w-full`, `border-t border-secondary`, `pb-safe`, `h-auto`. A custom bar gets no height from the phone, so the bar's height lives on this root and nowhere else. |
| `NavigationItems` | A Repeatable over `{{interfaceRecord['navigation']['items']['primary']}}`, grid layout, `columns` bound to its own `currentData.length`, `gap-md`, `flex-grow`. |
| `NavigationItem` | One Pressable per item, its OnPress a `navigateToPage` on `{{NavigationItems['context']['item']['pageId']}}` with `target: _self` and `history: push`. |
| `NavigationItem_Container` | A column Stack, centred, `gap-xs`, `pt-md pb-md`, `pe-xs ps-xs`. |
| `NavigationItem_Icon` | `text-brand-tertiary` while `{{pageInputs['activeTab']}}` equals the item's `slug`, else `text-secondary`. The icon is the item's `activeIcon` when it has one and is the active tab, else its `icon`. |
| `NavigationItem_Label` | Typography `text-xxxs`, medium, `{{NavigationItems['context']['item']['name']}}`, coloured by the same active rule. |

The module declares one input, `activeTab`. The items are the app's own menu,
so WHAT the bar shows stays `apply_navigation_edits` work and the module
decides only how it looks. Never add `h-full` anywhere down this chain: it
resolves against a definite parent height the root does not have, and the bar
collapses to nothing. A `navigatorModuleId` left pointing at a module that was
deleted draws an empty strip with no error anywhere; `get_navigation` warns
on it.

## Tools

| Task | Tool |
| --- | --- |
| tabs / drawer entries, icons, order, default page | `apply_navigation_edits`, `get_navigation`, `get_icon_options` |
| creating or attaching the navigator module | `set_navigation_style` — `createModule` seeds one, `moduleId` attaches one the app has |
| the navigator module's blocks | `get_page_outlines`, `get_blocks`, `apply_page_edits` |
| navigator type (bottom tabs, drawer, none) | the builder only — `get_navigation` reads it, no tool writes it |

## Which action to wire between screens

A page whose header has a close cross opens as a modal; a page whose header
has a back arrow is pushed. A result passed back and page-inputs replacement
on pop both follow the same `navigateToPage` / `navigateBack` contract as
every other mobile page — see `skills/app-native/SKILL.md` iron rules 15–16
for the exact payload (`overridePageAnimation`, `pageTransitionBehavior`,
`navigateToSpecificPage`, `pageId`, `pageInputs`). The receiving page declares
its inputs with `update_page_contracts`. On the phone a declared input arrives
typed on a current tenant, and as text on an older one (`native.md` rule 43).

## Transitions

`pageTransitionBehavior` (with `overridePageAnimation: true`, or it is
dropped) takes nine values; what each does on the phone:

- `slide_from_right` (also what a page with no transition gets), `default`
  (the platform push), `fade`, `fade_from_bottom` and `none` (instant) are
  pushes: the back swipe and the Android back button close them. A page
  that wires `onPageBack` keeps the Android back button for its own chain
  instead (`native.md` rule 60).
- `adaptive_sheet` is a sheet over the page, which stays visible behind it:
  the iOS page-sheet card, and on Android a bottom sheet at 90% of the screen
  that does not drag taller. A swipe down closes it, and on Android so do a
  tap on the backdrop and the back button. None of the sheet's actions run
  then; the page beneath fires `onPageFocus`. A sheet page that wires
  `onPageBack` takes that Android back press for its chain as well — it is
  the page on screen — while the swipe down and the backdrop tap still close
  it (`native.md` rule 60).
- `full_screen_modal` covers the screen and cannot be swiped away on iOS, so
  it needs its own close or continue button. That is also what holds a person
  on a page on iOS, where `onPageBack` never fires (`native.md` rule 60).
- `overlay` fades in as a modal but paints its own page background, so it is
  not a see-through popup.
- `modal` does nothing on the phone: the page opens as if no transition were
  sent.

A navigation's own value wins over the page's own default (Page Settings),
then a slide from the right. An explicit `default` therefore forces a plain
push even on a page whose own default is a sheet; send no transition to keep
the page's default. A `replace` takes the transition too; a back never does —
a page closes the reverse of the way it opened. Tab and drawer pages ignore
transitions. A page that holds a BottomSheet block cannot be swiped down as an
iOS sheet until that BottomSheet has been opened and closed once, so give it a
cross.

## Related

- `skills/app-native/SKILL.md` — the layout, binding, navigation and
  press-feedback rules every mobile page follows (iron rules 1–17), and the
  readable-config and smaller-lessons sections.
- `skills/app-native/references/data-layer.md` — constants and manual
  functions, including the bar-height variable this skill's floating-bar rule
  needs and splitting menu items around a centre button.
