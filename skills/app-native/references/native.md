# The mobile renderer — full iron rules + block support matrix

## Contents
- Tap
- Scroll
- Layout
- Styling
- Blocks that silently do nothing
- Data, bindings & events
- Build & verify
- Support matrix

Native is the UnifyApps mobile renderer (React Native / Expo). **No DOM, no CSS engine.**
It is a different renderer with its own block registry — NOT the builder's
`mobile` device variant, which is a responsive **web** breakpoint. A native
file for a block is NOT proof it renders; the native runner's registry is the
authority.

Violate a rule below and the page looks right in the web builder, but breaks
on the phone. Facts are device-verified on a production build of the
mobile renderer unless marked `[DERIVED]` (read from code, not observed
running). Where behaviour differed between the devkit write path and the raw
entity-API write path, the rule says so. A fact can go stale when the platform
changes: where a block's `native/blocks/…` sheet disagrees with a rule here
about that block's keys, the sheet wins (`app-native` § Sheets on a native
target).

## Tap

1. Device-verified tap set: `Pressable.OnPress`, `Button.onClick`,
   `IconButton.onClick`, `Card.onClick`, `StatCard.onClick`,
   `Repeatable.onSelectItem`, and form inputs (`onChange`/`onCheckChange`).
   The native-only gesture blocks also fire their own events [DERIVED]:
   SwipeableStack (`OnSelectItem`/`OnSwipeItem`), FlippableCard (`OnFlip`),
   MobileContextualDialog's trigger slot, Scrollable (`OnPullDown`).
   `onSelectItem` fires but shows no press feedback, so it is never a row's
   tap surface (rule 4).
2. `Stack.onClick` and `Icon.onClick` are DEAD on native (a plain `Icon`
   declares no events at all). A bare Stack or decorative Icon used as a tap
   target does nothing, silently. Wrap it in a `Pressable` or use `IconButton`.
3. `Pressable` is the native tap primitive; it has no web equivalent. To make
   an existing styled Stack tappable with zero restyling: create a bare
   Pressable in its parent and `move_blocks` the Stack into it.
4. Whole-row taps on a list: make a Pressable the root of the row template
   and put the action on its `onPress`; the row reads itself as
   `{{ <listId>['context']['item'] }}`. The Repeatable's `onSelectItem` still
   fires and fills `<rep>['selectedItem']`, but the row shows no press
   feedback, and a Pressable in the row takes the tap first, so that
   `onSelectItem` runs nothing (`app-native` SKILL.md iron rule 17, the page
   quality pass's U1). On raw-written pages, interactives nested in a row
   template never receive taps — a Pressable engages only as the template root.
5. `Button.onPress` is dead (Button fires `onClick` only); Pressable has no
   text key (label = child Typography) and fires `onPress`.

Press feedback is a Pressable-only key: `appearance.interactions`
(`highlightColor`, `opacity`, `scale`, `hapticFeedback`, `androidRipple`), set
by surface — a white/flat card highlights, a coloured tile or photo card
dims, a solid CTA shrinks, a text link dims more. A Repeatable row tapped
through `onSelectItem`, or a Carousel slide through `onSlideClick`, shows no
feedback on its own: make a Pressable the tap surface and move the action
onto its `onPress`. The highlight fades from the Pressable's OWN background,
so on a white card the Pressable carries the white (or fills the card from
inside it); a Stack painted over it hides the highlight. `update_blocks` accepts
`appearance.interactions` on a Pressable only (`app-native` SKILL.md iron
rule 17).

## Scroll

6. The page body does NOT scroll. It is a plain bounded view, so content
   taller than the screen is cut off (`concepts/appearance-styles`). Put tall
   content in ONE scroll owner under the body: a `Scrollable`, or a
   Repeatable with `content.scrollable: true`.
7. A `Container` never scrolls. A `Stack` scrolls only with one of the
   `overflow` tokens its sheet lists (`native/blocks/stack`, "Scrolling");
   any other `overflow` value is a plain view. Prefer a scroll block. Blocks
   with their own scroll: Repeatable, Tabs bar, Calendar, CopilotChat, WebView.
8. Every scroll container needs a bounded height from a parent. `height:100%` /
   `flex:1` INSIDE a ScrollView resolves against nothing and collapses to zero
   (`[legend-list] List height is 0`). Use `flexGrow` on content to fill. This
   is the single most common native layout bug.
9. Plain content scrolls in a `Scrollable`. Fallback only when `create_block`
   refuses a Scrollable (seen on the devkit path): unset the root's seeded
   `h-full`, give it `customStyles {flex:1}`, and make the scroll owner a
   **Repeatable with `content.scrollable:true` + `customStyles {flex:1}`** fed
   one item, whose row template is the page body; inner lists
   `scrollable:false`. Section bands → interleave marker rows so
   ONE list owns the scroll (a second list = a second scroll owner = broken).
10. Two scrollables on the same axis break virtualization. A Repeatable inside
    a BottomSheet needs the sheet's own scroll OFF
    (`appearance.behaviour.scrollableBody: false`; every new sheet sets it,
    and `shouldWrapContentInScrollView` is read only when it is absent).

A scrolling Repeatable (`content.scrollable` true or absent — true is the
default) has to be the one scroll owner in its chain: `customStyles`
`flex: 1`, no scrolling ancestor on the same axis (a Scrollable, another
scrolling Repeatable, a Stack with a same-axis `overflow` token or a
`keyboardConfig` of `type: "scroll"`, a BottomSheet whose body scrolls, or a
Tabs pane or footer when the Tabs has a `header` slot), and
whatever content sat above the list moved into its own `header` slot, which
scrolls away with the rows. Nested, no row virtualises and a long list
stutters or blanks — a plan's page quality pass reports this as P1
(`app-native` SKILL.md iron rule 13).

11. "Scroll the form, not the screen" = fixed children in the page
    header/footer, a bounded-height scroll region between them.

## Layout

12. Column ratios (1:2:1, 2:1) are a `Container` ("Grid") job, not a Stack job.
    No CSS grid, no responsive column-stacking, no equal-height cells.
13. Use a real gap token — an unrecognised gap resolves to 0 and columns touch.
    `gap-0` exists; per-axis gap = `{custom:{x,y}}`.
14. No `position: sticky`. Only the page header/footer (outside the body)
    and `KeyboardStickyView` pin reliably.
15. No declarative z-axis overlay. Use BottomSheet, Drawer, Navigation
    Floating, or MobileContextualDialog.
16. Safe area: one inset, one owner. The rule lives in the `app-native`
    SKILL.md, "Safe area".
17. Flex columns: RN defaults `min-width:auto` — give each column
    `{flex:1, minWidth:0}` or a `w-full` child blows the row out. Trailing
    control clusters get `{flexShrink:0}` so they align across rows.

## Styling

18. "Custom CSS" on native is **Style JSON, not CSS**. Write it as JSON text
    in `additional.customCSS` only. The tool fills `appearance.customStyles`
    from that text, and a value written to `appearance.customStyles` alone
    never reaches the phone. The grammar is the `ai-editing/native-custom-styles`
    sheet, and each block's own native sheet lists the keys it honours. Never
    put real CSS text there. The `linearGradient` fields are in
    [gradient.md](gradient.md).
19. Numeric style values are NUMBERS, not px strings (`lineHeight`, `flex`,
    absolute offsets: `bottom:8`, never `"8px"` — a string pins to top-left).
20. Token ids inside per-side `{custom:{t,r,b,l}}` padding/margin maps are
    silently ignored — raw px only. `{all:"p-xl"}` token form is fine.
21. `backgroundColor` HIDES `backgroundImage` — never pair them. CSS
    `linear-gradient` in backgroundImage paints nothing (classic invisible
    white-on-white header) — the native gradient is rule 18's
    `linearGradient`; `var(--…)` CSS variables are dead.
22. Borders: `borderWidth`/`borderStyle`/`borderColor` must ALL use the same
    map form — mixing `{all:…}` with per-side `{custom:{…}}` throws
    `cssToNativeStyles` on every render. Always write all three — an uncolored
    border paints black. Per-side rounded borders silently do not draw — keep
    borders uniform. Rounded corners need `overflow:hidden` to clip.
23. Empty-string style values (`borderRadius {all:""}` — the web builder
    writes them) throw a red toast per render; use the `-none` token or unset.
24. `box-shadow` does not work. Use `appearance.effects`
    (`{type:'drop-shadow', x, y, blur, spread, color}`) — mobile-only and
    Stack-only.
25. No `:hover` — design pressed/selected states. Letter spacing works only on
    a Typography in `PLAIN_TEXT`, as `appearance.letterSpacing` (its sheet
    gives the shape).
26. No CSS cascade. Set the whole-screen background in Themes → Colors →
    Background, not on a Stack. Sizes come from named scale variants.
27. `htmlAttributes`, footer code, injected `<script>`, `[data-block-id]{}`
    selectors do nothing on native.

A word where the phone needs a size, such as an Image `height` of `"Auto"`,
is accepted by the web builder and unreadable on the phone: the Image
stretches over the whole area and pushes the blocks below it off screen.
Give it a number. [DEVICE-VERIFIED on the Android emulator]

A BottomSheet takes its corner radius only from Shape → Corner radius and its
colour only from `bottomSheetBackground`; `borderTop*Radius` and
`backgroundColor` in its custom styles do nothing. In a fixed sheet with a
scrolling body only the pinned header clips, so the body draws past the
rounded top as it scrolls; clip it with `contentContainerStyle` in
`additional.customCSS`, as the page-quality rule U10 writes it. [DERIVED]

## Blocks that silently do nothing

28. `Password`, `EventsTimeline` have `.native` forks but are NOT registered —
    they render nothing. `OrganizationChart` IS registered (forked, gated) but
    its native fork returns `null` — configurable in the builder, empty on
    device. Use a TextInput with `content.inputType: "password"`, an
    EventsCalendar, and a Repeatable instead.
29. `Meeting` and `Records` are in the native builder palette but NOT the
    runner — placeable, never render.
30. `KeyValue` is read-only on native; its inline value editor is stubbed out.
31. Self-measuring blocks render NOTHING until sized — set explicit
    width/height on Camera, PhotoBooth, QRCode, Carousel, PDFViewer, Iframe.
    Image on mobile seeds `w-full` with no height — set a size; `objectFit`
    wants `"object-contain"`, not `"contain"`.
32. A sheet's `gate:` frontmatter names a per-client build flag
    (`DISABLE_BLOCK_*`, or `EXPO_PUBLIC_DISABLE_CAMERA` for the whole camera
    family) that can drop the block from that client's APK — silently: the
    builder preview still shows it. Confirm the target client's build includes
    a gated block before designing a screen around it.

## Data, bindings & events

33. Row scope is `b_<rep>['context']['item']` / `['index']` — `currentItem`
    does not exist (evaluator throws). `['context']` resolves only INSIDE the
    row template subtree; in the Repeatable's own events use
    `<rep>['selectedItem']`. `['context']['index']` is the index in the
    FILTERED data — store ids, not indexes.
34. Brace grammar: every binding is written directly, no space between the
    braces — `{{ … }}`. An object LITERAL inside one needs no round brackets,
    and neither does one nested inside that: `{{ { "k": v, "n": { "j": 1 } } }}`
    stores and reads back fine.
35. `create_block` textually substitutes tempIds into `{{ }}` binding strings
    in the same call — never name a tempId like a data key (prefix `tmp_`).
36. Guard every var read: `(var['value']||{})['k']`, `(arr||[])[i]` — a
    property read on an unset page var throws, and a throwing expression
    blanks the whole template (static text included).
37. `deviceContext` bindings are saved with `dependsOn: []` — they never
    re-evaluate at runtime. Bind live values via the `userContext['context']`
    mirror.
38. BottomSheet: page-level block; open/close with the `controlDrawer` action
    (`{drawerId, operation:'show'|'hide'}`) — `controlBottomSheet` and
    `controlBlockMethod {open}` store fine and are silently dead. Set the
    current-row var FIRST in the same chain, then `show`, or the sheet renders
    the previous row's data.
39. Verify a native component actually reads `state.open` before driving it by
    control method — `MobileContextualDialog` ignores it (trigger-driven only).
40. Editable inputs inside a Repeatable row render but do not engage taps —
    page-level editors (BottomSheet/Form) keyed by a current-row var. Sheet
    editors DO engage.
41. Every TextInput needs `onChange` wired at build time or typing silently
    drops. "Renders and accepts typing" is not verified — assert the var.
42. `runCondition` works on action nodes. Order terminal actions (hide/close)
    BEFORE state mutations (advance) — actions recompute bindings as they run.
43. Pass an id between pages, never a whole record: page inputs travel in
    the page's address. Declare them with `update_page_contracts`. A
    declared input arrives on the phone with its declared type, as on the
    web, on a current tenant. On an older one,
    every value a navigation passes arrives as TEXT: `3` as `"3"`, `true` as
    `"true"`, an object or a list as its JSON text. A name the page does not
    declare arrives as text on the phone, while the web never reads it, and
    a `null` is not sent at all. Until every tenant is current, write
    bindings that read both: `Number(...)` for a number, `String(...) ===
    'true'` for a flag, and `JSON.parse` only on a string. A deep link's
    `?param=` arrives the same way. The old single
    `pageInputs=<json>` parameter, which a notification tap still sends, is
    the one that arrives parsed. There is no session storage to pass data
    through on a phone (below).

Why the phone differs [DERIVED from the mobile renderer]: `navigateToPage` writes each
input into its own query parameter, and the phone's router hands the page
those parameters as its inputs. The page converts each declared input by its
type, as on the web, and then lays the raw text over the converted values.

44. `navigateToPage` no-ops when the target page is unplaced
    (`address: null` in the path tree) while `matrix://<slug>` deep links keep
    working — audit `get_page_paths`, fix it with `update_pages {edits: [{pageId, set: {path}}]}`.
45. `matrix://<slug>` deep links cannot reach bottom-tab-hosted pages; nav tab
    items resolve by `pageId`.

A page opened as a modal (a close cross in its header) needs
`navigateToPage` with `overridePageAnimation: true` and
`pageTransitionBehavior: 'adaptive_sheet'` — omit `overridePageAnimation` and
a cross page slides in sideways like a pushed one; a back-arrow page is
pushed with neither key set. A page that is itself open as a sheet cannot
open a second sheet (rule 56). Returning a result needs BOTH
`navigateToSpecificPage: true` and `pageId` of the page underneath on
`navigateBack`, plus `pageInputs` resending every input the page was opened
with (they REPLACE the old ones and are read in `onPageFocus`, since
`onPageLoad` does not run again on a pop), and `pageParams` when that page's
path has a `:` part; either key alone is a plain back with no result. The
page underneath comes back as the SAME copy, still presented the way it was
opened — a sheet stays a sheet — with its state kept. A mobile app has no
session storage: never `setInterfaceSessionStorage` or
`sessionStorage[...]` — a result that must
outlive one pop goes to `setLocalStorage` or an app variable on the global
page (`app-native` SKILL.md iron rules 15–16).

46. Bind "Export data" to a real data source; the inline-array engine is
    client-side and does not work on native.

## Build & verify

47. Foregrounding the app does NOT refetch page config. Before judging an
    edit, tap the upper half of the Preview app's floating pill (57): it
    fetches the saved draft and comes back to the same page. A relaunch, or a
    JS bundle reload on a dev build, fetches it too but lands on the start
    page. Never judge an edit off a foreground-only screenshot.
48. Long `apply_page_edits` batches buffer the interface record at batch start
    and flush it wholesale — a concurrent writer's changes (nav tabs,
    defaultPageId, page-wide `customStyles`) can be silently reverted. A page
    can lose ALL its customStyles this way. Keep build payloads as your
    rollback source — there is no reachable version-history read API.
    `update_pages` with no changes is still a full-record WRITE.
49. `update_blocks` caps at 20 edits/call; any edit re-validates the whole
    block. `navigation.appearance.<SM|MD|LG|XL>.primary` id whitelists
    OVERRIDE `navigation.primary` — new tabs are invisible until added there.
50. The web builder canvas is not the native build. Verify on a device with the
    available device driver; when none is available, use the labeled manual
    checklist. The post-write procedure (per-block checks, discovery recipes, the no-device-driver
    fallback) is [native-verify.md](native-verify.md).
51. The builder canvas does not run an action's `onSuccessActions`, and it
    takes taps only with Interactive Canvas on (⌘⇧E). A chain that works on
    the canvas proves the first action at most; prove the rest on a device.
52. With "Use current login session" off (57), the UnifyApps Preview app
    opens the app's runtime address
    (`<app>-<tenant>.<preview domain>` for the tenant's own preview domain,
    the host the Preview QR code carries), never a builder link or the tenant host: it
    calls `<address>/auth/interface` and expects the app back. Error titles
    "This URL isn't a matrix tenant" and "Endpoint didn't return a matrix
    response" mean the wrong link was pasted. "Can't reach this endpoint"
    means a network problem. Test it from Chrome inside the emulator: when
    Chrome opens `<address>/auth/interface` and the app still cannot, the
    network re-signs HTTPS (SSL inspection). The release Preview APK trusts
    only Android's built-in certificates, so those hosts must be left out of
    inspection; allowlisting alone does not fix it.
53. The release Preview APK blocks plain `http://` addresses (no cleartext
    traffic), which a browser still loads; only debug builds allow them. Use
    `https://` for every link, image, iframe and API the page calls.
    [DERIVED from the installed Preview APKs]
54. On a locked-down network the phone needs four hosts the web app never
    calls: `u.expo.dev` (app updates), the Preview build's Sentry ingest host
    (`*.ingest.us.sentry.io`, crash reports), and
    `firebaseinstallations.googleapis.com` and `fcm.googleapis.com` (push).
    Blocking them does not stop the app opening: it runs the version it
    shipped with, without crash reports or push. A client's own store build
    may use other update and Firebase hosts; read its config.
55. `navigateToPage` to a page that is a `navigation.primary` item, from a
    page outside the menu (a pushed page, or the developer launcher), lands
    on the FIRST primary item instead of the page named. The web preview opens
    the named page. To return to a menu page that is underneath, use a plain
    `navigateBack {}`; to open one fresh, start from a menu page.
56. `navigateToPage` with `pageTransitionBehavior: 'adaptive_sheet'` from a
    page that is itself open as an `adaptive_sheet` does not open the second
    sheet on the phone, and shows no error; the web preview opens it. It is
    not the actions before it: with the preceding `setPageVariable` switched
    off the sheet still does not open. Open the second page from the page
    underneath, or push it instead of sheeting it and give its header a back
    arrow (`app-native` SKILL.md iron rule 15).
57. The UnifyApps Preview app runs a MOBILE app's saved draft, so a change
    is checked on a phone before it is published. The app must have been
    published once: with "Use current login session" off the Preview app
    reads both copies and refuses an app never published. Open it from the
    builder's Preview QR code or "Copy preview link". With "Use current login
    session" off, the app opens the runtime address (52), signs in on the
    tenant's login page and asks "Choose a version to open": Draft or
    Published. With it on, the app runs against the builder, signed in as
    the person who made the QR, always on the draft, with push notifications
    off and a public app treated as private. A client's own store build runs
    only the published version. The debug sheet, opened from the lower half
    of the floating pill or by shaking the device, shows Draft or Published
    and `v<n>` in its header; the pill's upper half reloads the saved draft
    and stays on the page. The builder's link carries the person's live
    sign-in, so it never goes into a report, a file or chat. On a simulator
    or emulator, [preview.mjs](../scripts/preview.mjs) `open` reads the
    address from the tenant, checks the app was published once, prints a
    link with no sign-in in it (`matrix://open?url=<address>`) and opens it
    in the Preview app. A link to the app already open is ignored: Exit Application in
    the debug sheet resets the Preview app to a fresh install, sign-in
    included, and another app's link signs the open one out.
    [DERIVED from the mobile renderer]
58. A Repeatable with `content.collectChildStates: true` exposes each row's
    inner block state on the phone as a lazy Proxy: index it directly —
    `b_<list>['instances'][i]['b_<child>']['value']`, or `['data']['dob']`
    for a Form field — in a block binding or an action's value, and it
    updates as the row changes. Inside a page function's body the same read
    returns nothing, even when the function recomputes, so write the values
    into a variable from an action and let the function read the variable.
    A later action in that same chain reads the variable fresh but still gets
    the function's previous result, so compute what that action needs inline
    from the variable. `Object.keys`, `Object.values` and `.length` on `instances` also return
    nothing, so `Object.values(b_<list>['instances'])[i]` is always empty and
    only a `runtimeBlocks['runTimeBlockKey_<id>_' + i]` fallback beside it
    ever worked. Bound every read by a count you hold (a row removed from the
    data keeps its entry on the phone), not by counting `instances`.
    [DEVICE-VERIFIED on the Android emulator]
59. A block that holds a choice is read directly; no page variable copies it.
    A manual `toggle` ButtonGroup writes `b_<id>['selectedOptionId']` when it
    first appears (its `initialSelectedItemId`) and on every tap, and a
    visibility condition such as `{{ String(b_<id>['selectedOptionId'] !==
    'Yearly') }}` EQUAL `"true"` shows and hides its blocks with each tap on
    the phone. The ButtonGroup sheet's note that such a condition does not
    re-evaluate, and its advice to copy each option into a page variable, no
    longer hold, so drop the per-option `setPageVariable` actions and the
    variable. Inputs are the same: read `b_<id>['value']`.
    [DEVICE-VERIFIED on the Android emulator]
60. A page can take the Android back button for itself with the page trigger
    `onPageBack` (On Back Pressed in its Events panel), written by
    `update_event_actions` with target `{kind: 'page', id}`. Once wired, the
    back button no longer closes the page: the chain runs instead, and the
    person moves only if the chain navigates. So end it with `navigateBack`
    when they should still leave, or with `controlUser` `logout` on a page they
    must not back out of, such as setting a new password after signing in
    with a temporary one (logout already takes them to the signed-out page).
    Wiring the trigger is what takes the press, not what the chain does with
    it: the press is swallowed whether or not an action runs, so a
    `runCondition` on the navigating action cannot hand it back to the
    navigator — wherever that condition is false, back is dead. Keep the leave
    unconditional. Only the page on screen answers, so a wired page the person
    has already navigated off does not take back from the page above it. A
    chain that never navigates leaves back dead on that page, and on the app's
    first page back no longer leaves the app. It covers the Android system
    back, the button and the back gesture alike: the iOS back swipe, a sheet's
    swipe down and the page's own back arrow still close the page without
    running it, and it never fires on the web. So it holds nobody on a page on
    iOS — a page they must not leave needs `full_screen_modal` there, which
    cannot be swiped away, plus its own continue button
    (`mobile-navigation.md` Transitions). A module's builder does not offer it;
    wire it on the page that holds the module. A tenant whose
    `get_interaction_options` for a page does not list `onPageBack` does not
    have it yet: tell the person, because the builder and the phone lack it
    there too. `page-lint` H17 flags a chain that never leaves, and reports a
    chain whose only leave is conditional as unverified. [DERIVED]

## Support matrix

`*` = gated: registered by default but droppable per-client via
`DISABLE_BLOCK_*` (camera family via `EXPO_PUBLIC_DISABLE_CAMERA`).
`[X]` = the STORED componentType differs from the folder/palette name — write
the bracketed string. Authority: the native runner's block registry.

### Renders on native — forked (45)

Has a dedicated `.native.*` implementation; behaviour can differ sharply from
web. Which sheet to read before configuring one: `app-native` § Sheets on a native target; this
file holds the native differences.

AvatarGroup, BottomSheet, Button, ButtonGroup, Calendar[EventsCalendar]*,
Camera*, Card, Carousel, Chart*, Container, Copilot*, CopilotChat*,
CopilotVideo*, CopilotVoice*, Counter, DatePicker[Calendar]*, Drawer,
FlippableCard, Form, Icon, IconButton, Iframe, Image, KeyValue, Loader,
LottieAnimation*, MobileContextualDialog, Module,
OrganizationChart* (fork renders null — do not use), PDFViewer*, PhotoBooth*,
Pressable, QRCode*, Repeatable, Scrollable, Signature*, Stack, StepSeparator,
StepperV2, Stories*, SwipeableStack, Table*, Tabs*, Typography, Video*

(Table: stored componentType is `Table`; the native impl lives in the
`Table/DataTable` folder — the folder name is not the componentType.
Chart: only PIE, GAUGE and LINE render — BAR/COLUMN render null, and every
other chart type silently draws as a PIE of your data [DERIVED].
CopilotChat: not a standalone registered block — Copilot renders it
internally; its folder registers CopilotIframe / CopilotChartCard /
CopilotTypography / Citation / LocationPreview, and Citation's native fork
renders null.
CopilotVoice and CopilotVideo: each has its own gate,
`DISABLE_BLOCK_COPILOT_VOICE` and `DISABLE_BLOCK_COPILOT_VIDEO`, separate from
Copilot's. CopilotVideo is a fixed tile on the phone: its web floating mode
draws as the same tile [DERIVED].)

### Renders on native — shared (30)

Registered, no fork; the cross-platform component renders. Web knowledge is
broadly valid; the global iron rules still apply.

Alert, Avatar, Checkbox, CopilotInput*, Dictation*, Divider, FileUpload,
Filters*, FloatingActionButton, Link, Marquee, Media, MessageInput*, Modal,
PinInput, Progress[ProgressBar], RadioButton, Rating, RepeatableGrid,
RepeatableList, Scanner*, SingleSelect, StatCard, StepIndicator,
SwipeableButton, Tag, TextArea (typing works; inside a BottomSheet
`focusTextArea` does nothing, and `onSubmit` never fires on the phone),
TextInput, Timer, Toggle

### DOES NOT RENDER — never place these on a native page

**builder-only (2)** — in the native palette but not the runner, so they look
placeable and render nothing: `Meeting`, `Records[JSONExplorer]`.

**unregistered forks (2)** — a `.native.*` file exists but the block is not in
the native runner: `EventsTimeline`, `Password`.

**Common web-only components** — absent from the checked native runner:
AudioPlayer, AudioRecorder, Barcode, BusinessHours, Cascader,
CategoryFilter, Chat, CodeEditor, CommentInput, CommentList, Comments,
ContextualDialog, CopilotHistory, CopilotResponse, CopilotThread,
CopilotVoiceTranscripts, CustomBlock,
DeprecatedForm, FieldBuilder, HeadlessCopilot, ImageGrid, Kanban,
KnowledgeBuilder, LinkPreview, Menu, MultiStatsCard, NavigationContainer,
NavigationMenu[Navigation], PhoneNumber, RichText, SchemaEditor,
SheetPreview, SimpleAgentBuilder, SkillEditor, Slider, SlotOutlet,
SteppedContainer, Stepper, TemplateComponent, Timeline, Traces, TreeView

For an application-specific custom component, verify its native registration
before using it. A web implementation or builder palette entry is not proof
that it renders in the native app.

### Substitutions

| Wanted (web) | Use on native |
|---|---|
| Password | TextInput with `content.inputType: "password"` |
| Stepper / SteppedContainer | StepperV2 |
| ContextualDialog | MobileContextualDialog |
| Barcode | QRCode |
| MultiStatsCard | StatCard |
| Timeline / EventsTimeline | Calendar[EventsCalendar], or a Repeatable |
| OrganizationChart | Repeatable / bespoke layout |
| CustomBlock, SlotOutlet, TemplateComponent | Module |
| NavigationMenu / NavigationContainer | page header/footer, Tabs, Drawer |
| RichText, CodeEditor | Typography (limited markdown) |
| a clickable Stack | Pressable |
