# Page quality rulebook

## Contents
- Thresholds
- Part 1 — UI
  - U1 — Press feedback on every tappable
  - U2 — One scroll owner per axis
  - U3 — Safe areas at the status bar, floating bar and tab-bar space
  - U4 — A working keyboard-aware ancestor for every input
  - U5 — Colours as tokens, never bare hex or CSS vars
  - U6 — Spacing on the 4pt grid
  - U7 — Minimum tap target via hitSlop
  - U8 — Cross header opens as a sheet, back header pushes
  - U9 — Sheets and overlays first in the body
  - U10 — A fixed sheet clips its scrolling body
  - U11 — Close a sheet only while it is open
- Part 2 — Real performance
  - P1 — A list owns its own scroll
  - P2 — Block inputs are plain references, not adaptation
  - P3 — Data source budget
  - P4 — Image size and format
  - P5 — No structural cruft
  - P6 — Paging past ~50 rows
  - P7 — A page function's `dataSourceIds` match what it reads
  - P8 — Fixed row size on a virtualized list
  - P9 — No visibility condition on a virtualized list
  - P10 — One network refresh per interaction
  - P11 — Fetch unchanging data once
  - P12 — An endless list loads its next page
  - P13 — Page-by-page paging needs a control on the phone
  - P14 — A block's own state, not a variable that copies it
- Part 3 — Perceived performance
  - X1 — Static chrome first, a loader over every data region
  - X2 — Feedback on every interaction
  - X3 — Fixed boxes for images and measuring blocks
  - X4 — Empty and error states on every data region
  - X5 — Split the first screen
  - X6 — Optimistic small writes
  - X7 — Navigation feels instant into the next page too
  - X8 — Custom styles the phone can parse
- Decided by

Each rule is detect / fix / why / severity. **Detect** is what the script (or
the session, for a judgment rule) reads in the stored page to find a
violation. **Fix** is what to write. **Why** is the platform fact that makes
the rule true, with the knowledge sheet to read when one is named. **Severity**
is `blocking` (fixed before the publish) or `advisory` (offered once, recorded
when declined) — some rules carry a compound severity; read it exactly as
written.

## Thresholds

| Threshold | Value | Used by |
|---|---|---|
| Binding expression | 200 characters, each `{{ }}` trimmed | P2 |
| On-load data sources | advisory at 2–4, blocking at 5 or more | P3 |
| Image intrinsic size | 1×–2× the box in device pixels (the box in points × `--scale`, default 3) | P4 |
| Image file size | advisory over 200 KB, blocking over 500 KB (or over 2× the box) | P4 |
| Tap target | 44pt on either side | U7 |
| List length | 50 rows | P6 |
| First-screen body size | 160 blocks | X5 |
| Defer delay | 150–300 ms | X5 |

These are the `THRESHOLDS` constants at the top of `scripts/page-audit.mjs`.

## Part 1 — UI

### U1 — Press feedback on every tappable

**Detect:** a tap that shows nothing on the screen:
- a Pressable with no `appearance.interactions`;
- a Pressable whose interactions change nothing on one platform: its pressed
  `opacity` and `scale` are 1 or 0 (both mean no change), and it has no
  `highlightColor` the phone reads. A bare hex string such as `"#EFF0F2"` is
  no highlight. Android takes the three from `androidOverride` while that is
  enabled, and adds a ripple when `androidRipple` is true; an iPhone has no
  ripple. A haptic is felt, not seen, so it does not count. A new
  Pressable's seed, a 5% shrink (`scale: 0.95`) and `androidRipple: true`,
  passes;
- a Pressable whose only feedback is the highlight while its only child, a
  Stack, paints an opaque background over it;
- a Stack, Icon, Typography or Divider with an event (none of them takes a
  tap on the phone, so the event never fires), or an Image with one (it fires
  with no feedback);
- a Repeatable wired through `onSelectItem` whose row template is not a
  Pressable (followed down through single children), or whose template
  Pressable has no `onPress`: a Pressable in the row takes every tap first,
  so that row runs nothing;
- a Carousel wired through `onSlideClick` with a slide that is not a
  Pressable.

**Fix:** give each Pressable the feedback its surface calls for: a white or
flat card highlights (`highlightColor: { "custom": "#EFF0F2FF" }`, opacity 1,
scale 1), a coloured tile or photo card dims (opacity 0.6), a solid CTA
shrinks (scale 0.96, light haptic), a link dims more (opacity 0.5); set
`androidRipple: false` so both platforms feel the same. Write a highlight as
a palette id or `{ "custom": "#RRGGBBAA" }`, and move a covering Stack's
background onto the Pressable. Make a Pressable the root of a bare row, slide
or tappable block and move the actions onto its `onPress`, removing
`onSelectItem` or `onSlideClick`; a row then reads itself as
`{{ <listId>['context']['item'] }}`, not `selectedItem`.
**Why:** press feedback is the Pressable's own `appearance.interactions`. On
a press the phone animates opacity and scale only when the value is neither 0
nor 1, and fades the Pressable's own background to a highlight that resolves
from a palette id or `{ custom }` (`native/blocks/pressable`), so a child
painted over that background hides the fade. A Stack, Icon, Typography and
Divider have no events on the phone, and a Pressable inside a row keeps the
tap from the row's `onSelectItem` (`native/blocks/repeatable`).
**Not a violation:** a tab of a tab bar whose press feedback is turned off on
purpose: the tab switches as the finger lifts and its new selection shows at
once. Accept the finding for it.
**Severity:** blocking: the person taps and sees nothing, or nothing runs

### U2 — One scroll owner per axis

**Detect:** a Scrollable or a scrolling Stack inside an ancestor that already
scrolls it on the same axis. A Stack scrolls with an overflow scroll token, or
with `keyboardConfig` `type: "scroll"` in its custom styles, which makes it a
keyboard-aware scroll view. What scrolls a block: a Scrollable, a scrolling
Stack, a scrolling Repeatable (its template, and its header slot unless the
list is horizontal), a Tabs block whose header slot is set (each pane, and the
footer it draws inside each pane), and a BottomSheet whose body scrolls (its
body slot only). A horizontal rail inside a vertical page is fine;
vertical-in-vertical or horizontal-in-horizontal is not. A Repeatable nested
this way is P1's finding.
**Fix:** let one block own each axis: replace the inner Scrollable with a
Stack, which does not scroll, or remove the inner Stack's overflow token or
`keyboardConfig` `type: "scroll"` — or stop the outer block scrolling that
axis.
**Why:** a scroll region's frame grows to fit its content unless something
bounds it, so inside a scroller on the same axis it never scrolls; bounded,
the two fight over one gesture (`native/blocks/scrollable`). A Stack scrolls
only through those two settings (`native/blocks/stack`). A Tabs header slot
switches the strip to its collapsing layout, where every pane is its own
vertical scroll view (`native/blocks/tabs`). A BottomSheet's body is a scroll
view unless `behaviour.scrollableBody` is `false`, or is absent while
`customStyles.shouldWrapContentInScrollView` is `false`
(`native/blocks/bottom-sheet`).
**Severity:** blocking — the person meets a region that does not scroll, or a
page whose scroll stops when the finger lands on the inner region.

### U3 — Safe areas at the status bar, floating bar and tab-bar space

**Detect:** the top inset is reserved once, by whoever is topmost. When the
page has no header slot (`header_id`), or it is hidden, or it has no children
and no height of its own, the top inset is missing when none of these holds:
- the body itself (`root_id`) has a safe top padding, such as a seeded
  `padding: { "all": "p-safe" }`;
- the first body block has a safe top padding (`pt-safe`) or a safe top margin
  (`margin: { "t": "mt-safe" }`);
- either of them reaches the same inset in its custom styles, with a
  `paddingTop`, `paddingVertical`, `padding`, `marginTop`, `marginVertical` or
  `margin` value reading `deviceContext['safeArea']`.

A padding or margin counts in every shape it is stored in: `custom.t`, `t`,
`y` or `all`. The first body block is the first one that takes layout space:
a BottomSheet, Modal or Drawer before it draws over the page and is skipped.
Under a visible header the top inset belongs to the header, so nothing here
is checked. Also, and independent of the header: an empty Stack at the end of
the body (overlays after it are skipped) whose custom height is a binding — a
spacer for a floating bar.
**Fix:** add `margin: { "t": "mt-safe" }` to the first body block — top only,
never all-sides `m-safe`. Add nothing when the body already carries a safe top
padding: never a second inset. A floating-bar spacer works, as
`app-native`'s `references/mobile-navigation.md` rule 5 builds it; the last
content block's own bottom padding of the same height (the bar's height plus
`((deviceContext['safeArea'] || {})['bottom'] || 0)`) does the same without an
extra block.
**Why:** the status bar sits over the top of the page body, so the body has
to reserve the device's own inset (`deviceContext['safeArea']`, or a `*-safe`
token) rather than assume the OS already applied it. A page with a visible
header gets its top inset from the header, and a second inset under it is a
dead band (`app-native` § Safe area). A floating bar lies over the content, so
the end of the content has to clear the bar's height plus the bottom inset —
by the last block's bottom padding, or a spacer. The bottom inset itself
belongs to the footer or tab chrome, never to the content blocks.
**Severity:** blocking for a missing top inset; advisory for a floating-bar
spacer

### U4 — A working keyboard-aware ancestor for every input

**Detect:** a TextInput, TextArea, Form or MessageInput (a field inside a Form
counts as its Form) with nothing above it that keeps it clear of the keyboard.
What works, nearest ancestor first:
- a Stack with `keyboardConfig` in its custom styles, of any `type`, unless the
  same Stack carries a `linearGradient`, or a `blurConfig` that no
  `background-blur` effect replaces;
- a Scrollable with `keyboardConfig` `type: "scroll"`, the only type it acts on;
- a Modal;
- a BottomSheet with keyboard avoidance on: `appearance.behaviour.keyboardAvoidance`,
  else `customStyles.keyboardAvoidance`, else off. A sheet too tall to lift —
  full screen, a percentage height over 60%, or no height, which opens at 61.8% —
  needs `behaviour.scrollableBody` on as well. A pixel height depends on the
  phone, so it passes.

A Modal or a BottomSheet draws over the page, so nothing above it counts for
an input inside it. When an ancestor's setting is there but does not work, the
script reports once on that ancestor, with how many inputs it fails; otherwise
once per input, and the fix names the block that takes the setting.
**Fix:** put the setting where it adds no second scroller. A scroll
`keyboardConfig` makes a Stack a vertical scroll view, which inside a block
already scrolling the inputs vertically is a U2 finding, so:
- when a Scrollable already scrolls the inputs vertically, give that
  Scrollable `keyboardConfig: { "type": "scroll" }` in `additional.customCSS`;
- when a scrolling Stack does, replace its overflow scroll token with
  `keyboardConfig: { "type": "scroll" }`: the keyboard-aware scroll view
  scrolls it instead;
- when a scrolling list's row or a Tabs pane does, which takes no
  `keyboardConfig`, give the nearest Stack that holds the inputs
  `keyboardConfig: { "type": "keyboardAvoidingView" }`, which does not scroll;
- only when nothing above scrolls them, give the nearest Stack that holds the
  inputs and the content above them `keyboardConfig: { "type": "scroll" }`.

The Stack must carry no `linearGradient`, and no `blurConfig` without a
`background-blur` effect. In a BottomSheet set
`appearance.behaviour.keyboardAvoidance: true`, and keep
`behaviour.scrollableBody` on when the sheet is too tall to lift.
**Why:** keyboard avoidance is off by default. A Stack mounts its gradient or
blur layer instead of its keyboard view (`native/blocks/stack`); a Scrollable
ignores the `keyboardAvoidingView` and sticky types (`native/blocks/scrollable`).
A sheet written without `appearance.behaviour` gets no keyboard avoidance; a
sheet over 60% of the screen does not lift, and scrolls the focused field into
view only while its body scrolls (`native/blocks/bottom-sheet`). A Modal's
dialog sits in a container that keeps clear of the keyboard
(`native/blocks/modal`).
**Severity:** blocking — the focused field, or the button under it, sits behind
the keyboard.

### U5 — Colours as tokens, never bare hex or CSS vars

**Detect:** in `appearance.styles`, a colour value written as a bare hex
string or a `var(--…)` CSS variable instead of `{ "custom": "#RRGGBBAA" }` or
a palette id; a block carrying both `backgroundColor` and `backgroundImage`.
**Fix:** rewrite the colour as `{ "custom": "#RRGGBBAA" }` or a palette id;
remove `backgroundColor` from any block that also sets `backgroundImage`.
**Why:** the mobile renderer's style pipeline reads colours in its own token form,
not raw CSS (`native/blocks/stack`); a bare hex or `var(--…)` string is a
web-only form the phone doesn't resolve, and a `backgroundColor` beside a
`backgroundImage` is dead weight the image always paints over.
**Severity:** blocking

### U6 — Spacing on the 4pt grid

**Detect:** a padding, gap or margin number in `customCSS` not divisible by 4
(2 is allowed for hairlines); a `deviceContext['deviceInfo']` formula used
inside a custom style. The session also judges a second, different
side-gutter value on another touched page of the app.
**Fix:** round the spacing number to the nearest multiple of 4 (or 2 for a
hairline); reuse the app's one side-gutter value everywhere; replace the
`deviceContext['deviceInfo']` formula with a fixed value or a token.
**Why:** off-grid numbers and a per-block device-info formula both produce
spacing that drifts from device to device instead of landing on consistent,
predictable pixels.
**Severity:** advisory

### U7 — Minimum tap target via hitSlop

**Detect:** a tappable block whose visual box is smaller than 44pt on either
side and carries no `hitSlop`; and a Pressable whose `hitSlop` the phone
drops: a bare number (`hitSlop: 8`), or an object with no `all` number, no
`custom` sides and no side numbers of its own. A dropped `hitSlop` is
reported unless the box is known to be 44pt or more on both sides.
**Fix:** add `hitSlop` as `{ "all": n }`, or per side as `{ "custom": { "top":
n, "right": n, "bottom": n, "left": n } }`, enough to bring the tappable area
to 44pt; never enlarge the visual box itself to reach it.
**Why:** the Pressable's touch area and its visible size are separate
properties on the mobile renderer (`native/blocks/pressable`); `hitSlop` extends the
first without changing the second. The phone reads only an object there and
drops anything else without a word, so a bare number leaves the target as
small as it looks.
**Severity:** advisory

### U8 — Cross header opens as a sheet, back header pushes

**Detect (session):** a `navigateToPage` action whose target page's header
shows a cross (close) icon but is not opened as `adaptive_sheet` with
`overridePageAnimation: true`; or a target whose header shows a back arrow but
is opened as a sheet instead of a push. `candidates.navigation` gives each
action's target and how it opens (`transition`, `overridePageAnimation`); read
the target's header from the cache (`cache outline`).
**Not a violation:** a cross-headed target opened by a push from a page that
itself opens as a sheet (another touched page's `candidates.navigation` opens
it with `adaptive_sheet`). A sheet opened from a sheet does not open on the
phone, and shows no error (`app-native`'s `references/native.md` rule 56), so
never tell that navigation to become a sheet: open the target from the page
underneath, or keep the push and give the target's header a back arrow.
**Fix:** set the navigation to `adaptive_sheet` with `overridePageAnimation:
true` for a cross-headed target; use a plain push for a back-arrow target.
**Why:** the header's icon is the user's promise of how the page will leave —
a cross promises a sheet dismiss, a back arrow promises a push back — and the
two navigation patterns read differently on screen; `overridePageAnimation`
and `pageTransitionBehavior: "adaptive_sheet"` are documented on the
navigation action itself (`actions/navigate-to-page`).
**Severity:** advisory

### U9 — Sheets and overlays first in the body

**Detect:** a BottomSheet, Drawer or Modal among the page body's (`root_id`)
children that comes after a content block. The script reports them once per
page, on the body, naming each.
**Fix:** move every BottomSheet, Drawer and Modal to the top of the body,
before the first content block, keeping their order among themselves.
**Why:** an overlay takes no layout space in the body, so moving it changes
nothing on screen. With all of them first, the outline shows every overlay
in one place and the content below reads in screen order. A snackbar is the
`showNotification` action, not a block, so it has no place in the body.
**Severity:** advisory

### U10 — A fixed sheet clips its scrolling body

**Detect:** a BottomSheet with `appearance.height.heightMode: "fixed"` and
`appearance.behaviour.scrollableBody: true` whose custom styles have no
`contentContainerStyle` with `overflow: "hidden"`. Also, on any BottomSheet,
the custom-style keys `borderTopLeftRadius`, `borderTopRightRadius` or
`backgroundColor`, which the sheet ignores.
**Fix:** add `"contentContainerStyle": { "overflow": "hidden",
"borderTopLeftRadius": R, "borderTopRightRadius": R }` to
`additional.customCSS`, where R is `appearance.shape.cornerRadius`. Delete the
ignored keys: the sheet takes its radius only from Shape → Corner radius and
its colour only from `bottomSheetBackground`.
**Why:** in a fixed sheet only the pinned header clips its own content. The
scrolling body has nothing clipping it, so as it scrolls its blocks draw past
the sheet's rounded top edge. `contentContainerStyle` is the one key the phone
applies to the box that holds the header and the body. The appearance panel
has no overflow or clip setting for that box, so the key lives in custom
styles. The radius is repeated inside it because Shape → Corner radius rounds
the sheet's background and header, not that box. Clipping the body Stack does
not help: it sits inside the scroll view and moves with it
(`native/blocks/bottom-sheet`).
**Severity:** blocking for the missing clip; advisory for the ignored keys

### U11 — Close a sheet only while it is open

**Detect:** an action that closes a BottomSheet (`controlDrawer` with
`operation: "hide"`, `controlBlockMethod` with `hideDrawer`, or a stored
`controlBottomSheet` hide) whose `runCondition` does not read that sheet's own
`{{ <id>.state.open }}`. A close whose target is a binding is not checked, and
neither is a Drawer's: closing a closed Drawer does nothing.
**Fix:** give the action `"runCondition": { "type": "filter", "payload": {
"operator": "AND", "filters": [ { "property": "{{ <id>.state.open }}",
"filter": { "operator": "EQUAL", "value": "true" } } ] } }`.
**Why:** closing a sheet that is already closed never finishes. The chain
waits, and every later open sets `state.open` and fires `onExpand` but slides
nothing up, until the person leaves the page and comes back
(`native/blocks/bottom-sheet`). That happens whenever the sheet is down before
the close runs: the person pulled it down while a save was running, or the
close sits in the sheet's own `onClose`, which fires once the sheet has
closed.
**Severity:** blocking: the sheet stops opening for the person who hit it

## Part 2 — Real performance

### P1 — A list owns its own scroll

**Detect:** a Repeatable whose `scrollable` is `true` or absent, inside an
ancestor that already scrolls it on the same axis: a Scrollable, a scrolling
Stack, another scrolling Repeatable's template, a pane or the footer of a Tabs
block whose header slot is set, or the body of a BottomSheet whose body scrolls
(U2 says what scrolls each child).
**Fix:** give the list its own scroll — `scrollable: true`,
`customStyles.flex: 1` — inside a parent that does not itself scroll that
axis. In a Tabs pane, set the list's `scrollable: false` and keep it short, or
remove the Tabs' header slot. In a BottomSheet, set
`appearance.behaviour.scrollableBody: false` and cap the list with a
`maxHeight`, or set the list's `scrollable: false` and keep it short.
**Why:** the mobile renderer's list virtualization needs to own both the scroll
gesture and the measurement pass; nested inside another scroller it either
loses the gesture or renders every row unvirtualized (`native/blocks/repeatable`).
A Tabs header slot makes every pane its own vertical scroll view
(`native/blocks/tabs`), and a BottomSheet's body is a scroll view by default
(`native/blocks/bottom-sheet`).
**Severity:** blocking — every row mounts at once, so a long list stutters or
blanks as the person scrolls it.

### P2 — Block inputs are plain references, not adaptation

**Detect:** a block input, a string under `component.content` or
`component.appearance`, holding a `{{ }}` expression that, trimmed:
- holds a function (`function` or `=>`);
- runs an array method: `.filter`, `.map`, `.flatMap`, `.reduce`, `.sort` or
  `.forEach`, with or without a space before the bracket (`.find` is not on
  the list); or
- is over 200 characters. Each expression is measured on its own, so two
  short expressions in one string pass.

Visibility conditions, page function bodies, actions and data source settings
are not block inputs and are not checked: that is where code belongs.
**Fix:** move the adaptation into a manual page function (`runBehaviour:
"manual"`, run by a `triggerFunction` action on page load or on the data
source's `onSuccess`) and bind the block to `{{ func_x['value'] }}`.
**Why:** an inline expression runs again whenever anything it reads changes,
once for each block that holds it and once for each row of a list template,
and it cannot be read back or debugged as one unit. A manual function
computes the value once and the block reads it as a plain reference
(`concepts/functions`).
**The tool's warning:** `apply_page_edits` runs this same test on the blocks
each write touches and returns a warning, never a refusal, whatever the block
sits in. The audit runs it on every block of the page and adds the severity,
because an expression inside a template runs once per row.
**Severity:** blocking inside a template the page repeats per row (a
Repeatable's row, a mapped Carousel's slide), advisory elsewhere

### P3 — Data source budget

**Detect:** count the sources that run on page load — page and app sources
with `runQueryOnPageLoad` true, page sources with `runBehaviour` automatic,
and app sources with `runBehaviour` automatic that this page reads. An app
source lives on the app's global page; the page reads it when its id appears
anywhere on the page (a binding, a block's stored `dataSourceIds`, a page
function, an event, a page variable) or in a page source's settings, and the
finding counts the automatic app sources it never reads as not counted. An
automatic page source without `runQueryOnPageLoad` is left out when only
blocks that mount after the load read it (through a binding or the block's
stored `dataSourceIds`) and no automatic page function lists it: blocks inside
a BottomSheet, unless its custom styles set `bottomSheetMountDelay: 0`, and
blocks inside a Tabs pane that mounts when its tab first opens. The finding
names each source left out. Two or more of the counted sources calling the
same automation are duplicates rather than a genuine second source. The
session also judges two counted sources reading the same object with the same
filter, from the page's data sources.
**Fix:** merge sources that call the same automation or read the same object
with the same filter into one; turn `runQueryOnPageLoad` off on an automatic
source that only such late blocks read, so it starts when they mount; bring
the page's on-load source count down to the budget above.
**Why:** every source writes `isLoading`, `isFetching`, `data` and `error`
into the one `GlobalStateStore` through
`useGlobalStateStore().hooks.useActions().dataSource`, and every write re-runs
every block's selector — so N on-load sources cost about 2–3N page-wide
recomputes. The page queues a source with `runQueryOnPageLoad` when it opens,
whatever reads it; an automatic source without it starts when the first block
or automatic page function reading it mounts, so an automatic app source no
block on this page reads costs this page nothing. A BottomSheet mounts its blocks
about 4 s after the page settles, or at once when it is opened first, and
keeps them mounted (`native/blocks/bottom-sheet`), so a source only its blocks
read still runs once even when the sheet never opens, just not with the
page's first render. A Tabs strip with no header slot mounts every pane but
the one it opens on the first time its tab opens (`native/blocks/tabs`).
**Severity:** advisory at 2–4, blocking at 5 or more

### P4 — Image size and format

**Detect:** on a static (not bound) image, measured from its first bytes: a
format that is not WebP (or SVG for a glyph); intrinsic pixels outside 1×–2×
the box in device pixels (the box in points × `--scale`); over 200 KB. On a
static Image block, a width or height that is not set at all. The box is in
points when both sides are a number, `<n>px`, or a size token (`w-12` is 48pt,
in Tailwind's 4pt steps; `h-[76px]` is 76pt), in `appearance.styles` or as a
custom-style number. A side set some other way (`w-full`, a percentage, flex)
is set, not missing: the ratio is skipped and only the format and file size
are judged, as for an address no block sizes (a page variable) and for an
SVG, whose viewBox says nothing about its cost. P4 runs only with the image
probe: under `--no-images` (and on a fixture) it reports nothing.
**Fix:** re-export as WebP (SVG for a glyph) at the box's device-pixel size
(its point size × `--scale`), under 200 KB, and set both width and height
explicitly.
**Why:** an oversized or wrongly-dimensioned image still decodes at its full
intrinsic size before the box clips it, costing memory and paint time the
phone doesn't need (`native/blocks/image`).
**Severity:** blocking when intrinsic > 2× the box or > 500 KB; advisory
otherwise
**Not probed:** an image whose probe failed (a timeout or network error,
tried once more; an HTTP error; an unrecognised format; an address that is
not a URL; a tenant redirect that is not to an https address) is advisory
`not probed: <reason>`, fixed by probing it by hand (open the address) and
re-running, and counted in `summary.unprobed`. A `/`-relative address such as
`/api/file/download/…` is probed on the tenant with the saved sign-in; the
tenant answers it with a 303 to a signed storage address, which is read with
no cookie.

### P5 — No structural cruft

**Detect:**
- a Stack whose only child is another Stack and that styles nothing of its
  own;
- a Pressable whose only child is a Stack;
- a Pressable with a Button or IconButton inside it;
- a Card still carrying an unfilled scaffold slot (a slot Stack holding only
  the placeholder).

The session also judges, from the outline:
- a Form or Repeatable still carrying its unfilled scaffold;
- a `Divider` or an empty Typography used only to add spacing;
- a Pressable that holds only a label, a label and an icon, or only an icon;
- a Card that only adds padding, or a Card with `onClick` used as a row.

**Fix:**
- collapse the redundant wrapper Stack into its child (or its parent);
- drop the Stack between a Pressable and its real content;
- move a wrapping Pressable's actions onto the Button inside it, then remove
  the Pressable;
- make a label, label-and-icon or icon-only Pressable a Button or an
  IconButton. A chip or a tab with selected styling stays a Pressable;
- make a padding-only Card a Stack. Make a tappable row Card a Pressable,
  which also gives it press feedback (U1);
- fill in or remove a composite's leftover scaffold slots;
- replace a spacing `Divider` or empty Typography with padding or a gap on
  the real block.

**Why:** each of these adds a block the render path still has to mount and
diff for no visual or structural purpose of its own. A Pressable around a
Button is worse: the Button takes the tap, so the outer Pressable's actions
never run. A Button or IconButton already carries its own press feedback,
loading state and label, which a hand-built Pressable has to copy block by
block.
**Not cruft:** a block whose visibility is always false. It may be a
section someone switches on later, so ask before deleting it.
**Severity:** advisory

### P6 — Paging past ~50 rows

**Detect:** a Repeatable whose source can return more than about 50 rows but
is not paged `INFINITE`; a Repeatable with `collectChildStates` on while no
binding reads its `instances`.
**Fix:** set the list's paging mode to `INFINITE`; turn `collectChildStates`
off unless a binding genuinely reads `instances`.
**Why:** rendering every row of an unbounded list at once, or keeping every
row's state mounted when nothing reads it, spends memory and render time the
list never needed.
**Severity:** advisory

### P7 — A page function's `dataSourceIds` match what it reads

**Detect:** a page function whose body reads a source `e_<id>` that is not
listed in its own `dataSourceIds`; an automatic (`runBehaviour: "automatic"`)
function whose body reads more than one source.
**Fix:** read the missing source in the function body as
`{{ e_<id>[…] }}`, in a `create_page_functions` step, or an
`update_page_functions` step that changes the body: the tool derives
`dataSourceIds` from the body's `{{ }}` reads and refuses a `dataSourceIds`
key, so never write that key. Split a multi-source automatic function into one
function per source, or make it manual.
**Why:** `dataSourceIds` is how a page function declares what it depends on
and re-runs for; an undeclared source read is a dependency the function never
reacts to, and an automatic function tied to several sources re-runs on every
one of their changes (`concepts/functions`). The page tools work that list
out from the body (`app-page-build`), so a source read outside `{{ }}` never
gets on it.
**Severity:** advisory

### P8 — Fixed row size on a virtualized list

**Detect:** a scrolling Repeatable (`scrollable` `true` or absent) that owns
its scroll, whose row template has no numeric `height`, `minHeight` or
`maxHeight` in `appearance.styles`. For a horizontal list, the same check
applies to `width`, `minWidth` or `maxWidth`. A token that resolves to a
number counts (`h-12`, `{ "custom": "198px" }`); `h-full`, `h-auto`, `h-fit`
and percentages do not.
**Fix:** give the row template a fixed height, or a `minHeight` equal to the
tallest row. Give its variable parts a fixed size too, such as reserving two
lines for an address, so every row comes out the same height.
**Why:** the phone's list estimates its item size only from the template's
own numeric height, `minHeight` or `maxHeight` (width on a horizontal list),
read from `appearance.styles`. A size in custom styles does not count.
Without one, the list cannot size its render window, so scroll position
suffers (`native/blocks/repeatable`).
**Exempt:** rows that change height by design, such as a row that expands
in place. Accept the finding for those, or set `useFlatList: true` in the
list's custom styles.
**Severity:** advisory

### P9 — No visibility condition on a virtualized list

**Detect:** a scrolling Repeatable that owns its scroll, or a wrapper whose
only child leads down to it, with a visibility condition.
**Fix:** set the list's visibility to always shown. Collapse it instead with a
bound `maxHeight` (`100%` when there is data, `0px` otherwise) on the list or
its wrapper.
**Why:** a visibility condition unmounts the list when it turns false and
mounts it again when it turns true, rebuilding every row and losing scroll
position and loaded pages. A zero `maxHeight` hides the list and keeps it
mounted.
**Not a violation:** a condition that flips at most once per visit, such as
one read from local storage. Accept the finding for it.
**Severity:** blocking when the list pages `INFINITE`; advisory otherwise

### P10 — One network refresh per interaction

**Detect:** in one event's chain, on the same branch:
- two or more `setPageVariable` actions that write variables an automatic
  (`runBehaviour: "automatic"`) data source reads in its inputs; or
- a `setPageVariable` that writes such a variable, followed by a
  `controlDataSource` that triggers that same source.

**Fix:**
- hold the inputs in one object page variable that the source reads, and
  write them with a single `setPageVariable` `MERGE`, one change instead of
  one per input;
- drop the explicit trigger: changing the source's inputs already reruns it;
- or, when nothing else needs the source to rerun on its own, make it manual
  (`runBehaviour: "manual"`) and run it once with `controlDataSource` after the
  writes.

Never an `executeScript`: the page-builder tools warn on every inline script
they store, since nothing checks what it reads or writes.
**Why:** an automatic source reruns whenever an input it reads changes. Each
separate write is a separate change, so one tap starts one call per write,
plus one more for the explicit trigger. Only the last answer is used, but
every call still loads the network and the automation. A `MERGE` overlays its
keys on the object in one write, and a manual source runs only when something
runs it, such as a `controlDataSource`, never because an input changed
(`actions/set-page-variable`, `actions/control-data-source`).
**Severity:** blocking when the source calls an automation; advisory otherwise

### P11 — Fetch unchanging data once

**Detect (session):**
- an automation called on every tap only to compute something the phone
  could compute, such as joining strings into a query;
- `refetchOnWindowFocus` on a source whose data rarely changes;
- a source that fetches fields no binding reads;
- a source that runs on page load when only an always-hidden section reads
  it;
- the same lookup repeated each time a sheet or page reopens, with no cache.

**Fix:**
- fetch the fixed part once and compute the rest in a page function;
- turn refetch on window focus off;
- trim the fetched fields to the ones bindings read;
- turn `runQueryOnPageLoad` off for a source only hidden blocks read;
- cache a lookup with a key built from every one of its inputs.

**Never cache** a source whose `onSuccess` starts the next step of a flow. A
cache hit can return without running `onSuccess`, so the flow stops.
**Why:** data that does not change between taps costs a network round trip,
and often an automation run, every time it is fetched again.
**Severity:** blocking for a per-tap automation call; advisory otherwise

### P12 — An endless list loads its next page

**Detect:** a Repeatable with `content.addOns.page.type: "INFINITE"` whose
`addOns.page.total` binds no data source, whose `content.data` reads its rows
through a page function, a page variable or a block instead of naming the data
source, or whose `content.scrollable` is `false`.
**Fix:** bind `content.addOns.page.total` to the row count of the source
`content.data` reads, such as `{{ e_<source>['data']['total'] }}`; bind
`content.data` straight to the data source; set `content.scrollable: true`
with a height bound.
**Why:** the platform turns endless paging on only when the list's
`content.data` and `addOns.page.total` both name the data source, and only a
scrolling list asks for the next page as it nears its end
(`native/blocks/repeatable`).
**Severity:** blocking — the list stops after its first page, so the person
never sees the rows after it, and nothing says there are more.

### P13 — Page-by-page paging needs a control on the phone

**Detect:** a Repeatable with `content.addOns.page.type: "PAGE"` that no
`controlBlockMethod` `goToPage` action on the page, in a block's events or in
the page's own, points at.
**Fix:** set the type to `INFINITE`, with `content.scrollable: true` and
`total` bound as P12 says; or remove `content.addOns.page` to show every row;
or add a Button that calls `goToPage` on the list.
**Why:** `PAGE` draws no page controls on the phone: the list shows its first
page and moves only when something calls `goToPage`. It is what the builder's
Pagination add-on seeds, so a list that had pagination switched on in the
panel starts this way (`native/blocks/repeatable`).
**Severity:** blocking — the rows after the first page cannot be reached.

### P14 — A block's own state, not a variable that copies it

**Detect:** a page variable whose only writes are plain `SET` actions in one
block's own events, where either
- the block is a manual `toggle` or `default` ButtonGroup and each option's
  `onClick` writes its own fixed value (`Monthly` → `true`, `Yearly` →
  `false`), or
- every write is that block's own value: `{{ b_<id>['value'] }}` or
  `{{ actionContext.value }}`.

A variable that any other action, page event or data-source callback also
names is not flagged, because something else may write it.
**Fix:** read the block's state wherever the variable is read: `{{
b_<id>['selectedOptionId'] }}` compared to the option id for a ButtonGroup,
`{{ b_<id>['value'] }}` for an input. Then remove the `setPageVariable`
actions and delete the variable. Keep the block's other actions, such as a
data-source trigger on one option.
**Why:** a block that holds a selection or a value already exposes it as
state. A toggle or default ButtonGroup writes `selectedOptionId` from the
moment it appears, and on every tap. A visibility condition on it follows
each tap on the phone (`native.md`, ButtonGroup). The copy is a second source
of truth, with an action per change that can drift from the block, for
example when the block is reset by a method that does not fire the event.
**Severity:** advisory

## Part 3 — Perceived performance

### X1 — Static chrome first, a loader over every data region

**Detect:** a data region with no loader gate, or a gate whose visibility
reads `isLoading` alone. A data region is a block whose content
(`component.content`: its value, data, src, items, options, label…) reads
`e_<dsId>['data']`; a switch never makes one — `appearance` (`disabled`,
`loading`, styles), a content switch (`disabled`, `readOnly`, `loading`,
`hidden`, `visible`), paging settings (`content.addOns`) or a visibility
condition only react to the data. A Loader is never a region. A loader gate is
a sibling of the region, or of any block above it, whose visibility names the
region's source and that is a `CONTENT` Loader or a container holding one (a
skeleton). Coverage is inherited: a gate beside a section covers every region
inside it, however deep. A content section gated on the same source but
holding no Loader is not a gate. The script reports uncovered regions once per
parent-and-source group, on the parent with their count, and a gate reading
`isLoading` alone once, on the gate. The session also judges, from the
outline, page chrome, static tiles, fixed buttons or `userContext` text placed
inside a loading condition instead of rendering at once.
**Fix:** pull static chrome and `userContext` text out of any loading
condition so it renders immediately. Give each data region a `CONTENT`
Loader gate — a Loader, or a skeleton container of Loaders, beside the region
or beside a section that holds it; one gate covers every region under the
block it sits beside — light and loose, visible when the source has neither
`data` nor `error`.
**Why:** a manual source starts empty on every run, so gating a loader on
`isLoading` alone leaves a blank region before the request even starts; the
loader has to read the absence of both `data` and `error` to cover that gap
(`native/blocks/loader`, `concepts/pages/loading-states`).
**Severity:** blocking when a data region has no loader gate, or its gate
reads `isLoading` alone; advisory for chrome or `userContext` text inside a
loading condition

### X2 — Feedback on every interaction

**Detect:**
- a Button or IconButton whose chain calls a source or submits a form (a
  `controlDataSource`, a `submitForm`, a `controlBlockMethod` `submitForm`,
  or a Button with `content.type: "submit"` and a `formBlockId`, which
  submits by itself) and whose `appearance.loading` reads nothing from the
  page. It reads the page as `{ "type": "filter", "payload": … }` with a
  binding in it, or as a `{{ }}` binding; an IconButton also takes
  `{ "conditionalValueFilters", "defaultValue" }`;
- a Button or IconButton whose `appearance.loading` is on for good, whatever
  its chain: `true`, `{ "type": "boolean", "payload": true }`, or any other
  object, such as the visibility shape `{ "value": "conditions",
  "conditions": … }`;
- a chain that writes with no `showNotification` on success or on error;
- a chain that takes longer than a tap with no loader at all.

A Pressable has no loading state, so its slow chains are judged from
`candidates.interactions`: one needs a separate Loader, shown by a page
variable the chain sets while it runs.
**Fix:** bind `appearance.loading` as `{ "type": "filter", "payload": … }` to
the `isLoading` of the source the chain calls, or to a page variable the chain
sets while it runs, and write a loading that is on for good the same way; add
a `showNotification` action on both the success and the error branch of a
chain that writes; add a loader to any action that runs longer than a tap.
**Why:** with nothing changing on screen, a slow chain and a chain that
silently did nothing look identical to the person who tapped it;
`showNotification` is how a write chain reports back (`actions/show-notification`).
The page resolves a `{ "type", "payload" }` condition and a `{{ }}` binding to
true or false before the button draws; any other value reaches the button as
it is, and anything truthy, an object above all, keeps its spinner on and its
press off (`native/blocks/button`, `native/blocks/icon-button`). A Pressable
has no loading state (`native/blocks/pressable`).
**Severity:** blocking for sources and submits and for a loading that is on
for good, advisory for the rest

### X3 — Fixed boxes for images and measuring blocks

**Detect:** an Image whose `src` is bound, or a `CONTENT` Loader, missing an
explicit width or height. A side counts as set from `appearance.styles` or
from `customStyles` (`additional.customCSS`), in points or any other value
such as `100%`. The session also judges the other measuring blocks, a circle
or gauge progress, from the outline.
**Fix:** set both width and height on the block up front, sized to what the
data or the picture will fill.
**Why:** a box with no fixed size collapses before data or an image lands and
then jumps to its final size once it does — the same layout-shift cost a
static Image avoids with its own fixed box (`native/blocks/image`,
`native/blocks/loader`, `concepts/pages/loading-states`).
**Severity:** blocking

### X4 — Empty and error states on every data region

**Detect:** a data region (X1 says which blocks are one) with no empty-state
branch, no error-state branch, or whose empty check tests for `MISSING`
instead of an array's length. Both
states are inherited the way X1's gate is: a sibling of the region, or of any
block above it, counts. An error state reads `['error']` with any operator but
`MISSING`, or binds it bare, and is never a Loader; a section gated on
`['error']` `MISSING` shows only when there is no error, the opposite of an
error state. An empty state compares a list's length (`.length` or
`['length']`). The script reports uncovered regions once per parent, on the
parent with their count.
**Fix:** add a visible empty state and a visible error state beside the
region or beside a section that holds it — one pair covers every region under
the block it sits beside; test an empty array by its length, not by comparing
it to `MISSING`.
**Why:** a source can legitimately return zero rows without ever failing,
which is a different state from not having fetched yet or having errored;
testing on `MISSING` conflates them, so a genuine failure then renders as an
indistinguishable blank.
**Severity:** blocking

### X5 — Split the first screen

**Detect:** a page body over 160 blocks with nothing deferred; a heavy region
below the fold that renders immediately instead of behind a deferred variable
or Tabs: a Carousel, Chart, Repeatable, Iframe or Video below two full-height
sections (`h-full`, or a custom height of 300 or more) at its own level or any
level above it, whose visibility, and every visibility above it, reads no
deferred variable. A deferred variable is one an `onPageLoad`
`setPageVariable` flips after a `delayDuration` of 150 ms or more. The count takes
every block the body mounts without being opened, a closed BottomSheet's
contents included. It leaves out the panes of a Tabs strip with no header
slot, all but the one it opens on: those mount the first time their tab opens.
**Fix:** defer the heavy or below-the-fold region behind a page variable that
an `onPageLoad` action flips after a `delayDuration` of 150–300 ms, or move it
behind Tabs, so the above-the-fold content paints first.
**Why:** everything in the body mounts and measures together on first paint;
deferring the part the person can't see yet, with the action node's own
`delayDuration` (`ai-editing/action-nodes`), lets the visible part paint
without waiting on it. A BottomSheet's children mount about four seconds after
the page settles, open or not, and stay mounted, so they cost the page while
the person is already using it (`native/blocks/bottom-sheet`). A Tabs strip
with no header slot mounts each pane the first time its tab opens; with a
header slot every pane mounts with the page (`native/blocks/tabs`).
**Severity:** advisory; blocking when the body holds more than 160 blocks and
nothing is deferred

### X6 — Optimistic small writes

**Detect:** a favourite or toggle action chain that waits for the write to
complete before changing what's on screen, with no local flip and no
revert-on-error branch.
**Fix:** flip the UI immediately on tap, then revert it and show a snackbar
only if the write comes back with an error.
**Why:** a small, usually-successful write that waits for its round trip
before changing anything reads as unresponsive even when the request itself is
fast.
**Severity:** advisory

### X7 — Navigation feels instant into the next page too

**Detect:** a navigation target (from `candidates.navigation`) that is itself
a touched page but fails X1 — its data regions have no loader — or whose
tapped block fails U1.
**Fix:** apply the U1 and X1 fixes to the target page as well as the page the
tap started from.
**Why:** the person's sense of "instant" carries across the tap into the next
page; a snappy tap into a page that then stalls on its own data regions undoes
the feedback U1 just gave.
**Severity:** advisory

### X8 — Custom styles the phone can parse

**Detect:** `additional.customCSS` that is not a JSON object: CSS, unquoted
keys, comments, trailing commas, or JSON that is an array or a single value.
**Fix:** rewrite it as one strict JSON object — double-quoted keys, unitless
numbers, no comments, no trailing commas — or clear it.
**Why:** on a MOBILE app `additional.customCSS` holds the block's custom
styles as JSON text, and the phone takes styles only from a JSON object: every
save rebuilds `appearance.customStyles` from the text, as `{}` when it does not
parse, so none of its styles apply and nothing reports it
(`ai-editing/native-custom-styles`). The script
reads such a block as having no custom styles, so a `keyboardConfig` or a size
in the broken text counts for nothing in U4 and the other rules.
**Severity:** blocking — the block draws on the phone without the layout the
text was written for (its sizes, `flex`, keyboard handling).

## Decided by

The script (`scripts/page-audit.mjs`) decides every rule it can read
mechanically from the stored page; the main session judges the rest from the
script's `candidates` lists and the page outline. A rule the script lists under
`errors` did not run on the page (the script exits 2): judge it by hand, or
fix the config it names and re-run.

**Script decides, mechanically:** U2, U3, U4, U5, U9, U10, U11, P1, P2, P4,
P7, P10, P12, P13, P14, X4, X8.

**Script decides when it can, session judges the rest:**
- U1 — mechanical; judgment on whether a tab bar's tab turns its press
  feedback off on purpose.
- U6 — mechanical for an off-grid custom spacing number and a
  `deviceContext['deviceInfo']` formula; judgment for a second side-gutter
  value on another touched page of the app.
- U7 — mechanical when the tappable's visual box size is known from its
  config, and for a `hitSlop` the phone drops; judgment otherwise.
- P3 — mechanical for the on-load count and two sources calling one
  automation; judgment for two sources reading the same object with the same
  filter, from the page's data sources.
- P5 — mechanical for wrapper Stacks, a Pressable's lone Stack, a Pressable
  around a Button and a Card's unfilled scaffold slot; judgment for a Form's
  or Repeatable's leftover scaffold, a spacer Divider or empty Typography,
  Pressables that could be a Button or IconButton, and Cards.
- P8 — mechanical for the missing row size; judgment on whether the rows
  change height by design.
- P9 — mechanical for the condition; judgment on whether it flips more than
  once per visit.
- X1 — mechanical for a data region's loader gate and a gate reading
  `isLoading` alone; judgment for chrome, static tiles, fixed buttons or
  `userContext` text inside a loading condition, from the outline.
- X2 — mechanical for `appearance.loading` on a Button or IconButton;
  judgment for a Pressable's slow chain, the write/notification check and
  "longer than a tap", from `candidates.writes` and `candidates.interactions`.
- X3 — mechanical for a bound Image and a `CONTENT` Loader; judgment for a
  circle or gauge progress, from the outline.
- X5 — mechanical for the 160-block count, a closed BottomSheet's contents in
  it and the waiting panes of a Tabs strip with no header slot out of it, and
  for a heavy block below two full-height sections; judgment on which region
  to defer.

**Session judges from candidates:**
- U8 — from `candidates.navigation` (every `navigateToPage` with its target
  page id and how it opens: `transition`, `overridePageAnimation`), the
  target's header read from the cache, and the other touched pages'
  navigations into this page.
- P6 — from `candidates.lists` (every Repeatable with the `sourceIds` its
  `content.data` reads, its paging type from `content.addOns.page.type`, and
  `collectChildStates`).
- P11 — from `candidates.interactions` and the page's data sources (their
  timing, fields and cache settings).
- X6 — from `candidates.writes` (every write chain).
- X7 — from `candidates.navigation`; the target is audited only when it is
  also a touched page.
