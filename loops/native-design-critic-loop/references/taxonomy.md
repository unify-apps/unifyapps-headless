# Severity and categories

## Contents

- [Severity rubric](#severity-rubric)
- [Categories, in report order](#categories-in-report-order)
- [House rules](#house-rules)
- [Issue shape](#issue-shape)
- [Root cause keys](#root-cause-keys)
- [Time budgets](#time-budgets)

## Severity rubric

Judge by the effect on a real user, not by how easy it is to fix.

| Severity | Meaning | Typical examples |
|---|---|---|
| **Critical** | The user cannot finish the task, loses data or money, or is misled into the wrong action. | Crash or freeze. A core action that never finishes, or takes over 30 s with nothing on screen. Dead end with no way back. Keyboard covers the submit button and the page cannot scroll. Back throws away a long form with no warning. A primary button does nothing. Text unreadable (contrast under 3:1 on primary content). Wrong item opened or acted on. |
| **High** | The task is possible but with real friction or confusion that many users will hit. | No feedback after a submit, so people tap twice. Error message missing or blames the user vaguely. Primary touch target well under 44 pt / 48 dp. Key information truncated. Back goes somewhere unexpected. Tab loses its place on every switch. Body text contrast between 3:1 and 4.5:1. Input field or button edges under 3:1 when the edge is the only cue that the control exists. Loading state is a blank screen for over a second. A tap with no visible response for over 1 s. A page open or core action that misses its time budget below. Any misalignment: items that belong together off a shared edge or centre line, icons off-centre on their text, centred content not truly centred (house rule, any size, including 1–3 pt). |
| **Minor** | Noticeable polish problems that do not block anything. | Padding differs between similar screens. Inconsistent button styles or capitalisation. Secondary target slightly small. Empty state is plain text with no guidance. Placeholder used as the only label. |
| **Nitpick** | Small taste or pixel issues a careful designer would still fix. | Icon stroke weights mixed. Slightly uneven vertical rhythm. Copy tone shifts. Divider colours differ slightly. |

Raise severity one step when the problem sits on the main path (onboarding, sign in, the app's core task, checkout). Lower it one step when it sits on a rarely visited page.

## Categories, in report order

1. **Stability and blockers**: crashes, freezes, dead ends, actions that do nothing, white screens, wrong action executed.
2. **Navigation and flow**: back and swipe-back behaviour, lost state on return, tab reset, modals and sheets with no clear way out, unclear location ("where am I"), deep links landing wrong, too many steps for a common task, unexpected redirects.
3. **Input and keyboard**: keyboard covering inputs or buttons, wrong keyboard type (email, number, phone), no Next or Done, no tap-outside dismiss, focus jumps, autofill and password managers blocked, validation that is late, unclear or wipes input, inputs that lose text.
4. **Feedback and system states**: loading, empty, error, success, offline, disabled and in-progress states missing, unclear or inconsistent; no confirmation for destructive actions; spinners with no end; toasts that vanish too fast.
5. **Layout and spacing**: page margins or card padding that differ between pages, items off their shared edge or centre line, icons not centred on their text, uneven rhythm, content under the notch, status bar, home indicator or navigation bar, clipped or overflowing content, cramped or empty-feeling density, poor use of the screen.
6. **Typography and hierarchy**: unclear hierarchy (several things shouting at once, or the main thing not standing out), a type ramp out of order (a caption as big as the body, a section header bigger than the page title), the same role in different styles on different pages, too many sizes or weights, truncation of meaningful text, long line length, inconsistent title styles.
7. **Colour, contrast and visual consistency**: low contrast, colour as the only signal, inconsistent brand colours, mixed icon styles, inconsistent buttons, dark-mode breakage.
8. **Touch and gestures**: pressables with no press feedback (no highlight, dim or ripple), small or crowded targets, targets that do not look tappable, tappable-looking things that are not, gesture conflicts (swipe-back vs carousel), hidden gestures with no hint.
9. **Content and copy**: unclear labels, jargon, inconsistent terms for the same thing, unhelpful error text, typos, placeholder or debug text, untranslated strings, wrong formatting of dates, numbers and currency.
10. **Accessibility**: unlabeled buttons and images in the tree, labels that do not match what is shown, illogical reading order, broken layout at large text size, information only in colour or only in an image.
11. **Platform conventions**: visible scroll indicators (house rule), iOS patterns on Android or the reverse, non-standard controls where a native one is expected, system back or swipe-back overridden badly, sheet and alert patterns that feel foreign.
12. **Perceived performance**: slow transitions, layout shift after load, flicker, images popping in, jank while scrolling, delay between tap and response. Judge measured times against the time budgets below.

## House rules

Standards this review holds every app to. Apply them on every page, on top of HIG and Material, even where a platform guideline would allow otherwise. Each finding cites the rule by name.

| Rule | What fails it | Category | Default severity |
|---|---|---|---|
| **Press feedback** | A pressable (button, row, chip, card, icon, tab) shows no visible change while the finger is down: no highlight or dim on iOS, no ripple on Android. A ripple whose colour is invisible on its background also fails. | Touch and gestures | minor; high on the page's primary action |
| **No scroll indicators** | A scroll bar is visible on any scrollable (page, list, sheet, carousel, text box) while it scrolls. | Platform conventions | minor |
| **Consistent padding** | Page margins, card padding or row padding differ between pages or between similar items. | Layout and spacing | minor; nitpick at 1–3 pt |
| **Alignment** | Items that belong together do not share an edge or a centre line; an icon is not centred on the text beside it; centred content is not truly centred. Any measured miss counts, even 1–3 pt. | Layout and spacing | high, always; never lowered for size or a rarely visited page |
| **Consistent theme** | A colour role (background, surface, accent, text, border, divider, error, disabled, overlay), a component's shape (corner radius, shadow, border, fill) or a state style (selected, focused, disabled) has more than one value across pages, or one role uses two font families. | Colour, contrast and visual consistency | minor; high when it changes meaning (two accents where one marks the primary action, two error colours) or sits on the primary button; nitpick when the values differ only slightly and never side by side |
| **Clear text hierarchy** | The type ramp on a page is not ordered title > heading > body > caption, the main text is not the strongest, or the same role (page title, section header, body, caption) uses a different size, weight or colour on another page. | Typography and hierarchy | minor; high when the page's key fact is not the most prominent text |

## Issue shape

Every critic returns issues exactly like this:

```markdown
### <short title in plain words>
- **Severity:** critical | high | minor | nitpick
- **Category:** <one category from the list above>
- **Pages:** <NN-slug>[, <NN-slug> …]
- **What the user sees:** <one or two sentences, from the user's chair>
- **Why it matters:** <the effect on the user; name the guideline if one applies (HIG, Material, WCAG 2.2 x.y.z)>
- **Evidence:** <screenshot file(s); measured numbers from layout.mjs or contrast.mjs; probe step from probes.md>
- **Steps to see it:** <numbered steps from app launch, only for behaviour issues>
- **What good looks like:** <the expected behaviour or look, in user terms, no implementation>
- **Confidence:** proven | likely
- **Root cause key:** <one key from the list below, or other:<short-slug>>
```

`proven` means the evidence alone shows it. `likely` means a judgement call from the screenshot; the main thread must confirm a likely critical or high before it ships.

## Root cause keys

Every issue carries one key, so the merger can group the same root problem across pages and critics without matching titles by hand. Pick the narrowest key that fits; use `other:<short-slug>` only when none does, and reuse the same slug for the same problem.

| Key | Root problem |
|---|---|
| `tap-does-nothing` | a control or row gives no result |
| `wrong-result` | the action acts on, opens or answers the wrong thing |
| `lost-input` | typed text or a choice is discarded or comes back wrongly |
| `back-behaviour` | back button or edge swipe missing, or lands somewhere unexpected |
| `no-state-shown` | a filter, selection, current item or mode is active but not shown |
| `missing-feedback` | no loading, success, error, stopped or empty message where one is needed |
| `keyboard-covers` | the keyboard hides a field or a button |
| `keyboard-wont-dismiss` | the keyboard cannot be put away the expected ways |
| `sheet-exit` | a sheet or dialog is hard to close, or closes too easily |
| `sheet-style` | sheets of one kind differ in size, padding, title or buttons |
| `alignment` | items off a shared edge or centre line |
| `padding` | margins or padding differ between similar items or pages |
| `type-hierarchy` | type ramp out of order, or the key fact is not the strongest text |
| `contrast-text` | text under its WCAG contrast minimum |
| `theme` | a colour role, component shape or state style with more than one value across pages |
| `contrast-edge` | a field, button or card boundary under 3:1 |
| `small-target` | a touch target under 44 pt / 48 dp |
| `press-feedback` | no visible pressed state |
| `scroll-indicator` | a scroll bar visible while scrolling |
| `a11y-unlabeled` | a control missing from the tree or without a name |
| `a11y-role` | a control announced with the wrong role or state |
| `internal-text` | technical, debug or internal wording shown to users |
| `copy` | unclear, inconsistent or mistaken words |
| `layout-overflow` | content clipped, cut off, or running under system bars |
| `perf-slow` | a measured time over its budget |
| `perf-jank` | jumps, flicker, blanks, layout shift, inconsistent timing |

## Time budgets

Measured as in capture.md "Timing probes". A time within the device's timing resolution (device.md) of a limit is not a failure; mark it `likely` at most. Severity rises one step on the app's core task, as everywhere.

| Moment | Fine | Minor | High | Critical |
|---|---|---|---|---|
| Tap to first feedback | under 0.3 s | 0.3–1 s | over 1 s | — |
| Page or sheet open to first content | under 1 s | 1–2 s with a loading state | over 2 s, or over 1 s blank | — |
| First content to settled (late content, layout shift) | no visible change | settles within 1 s | content jumps after the user could start reading or tapping | — |
| Long action (answer, search, upload, save): something visible | within 1 s | — | over 1 s with nothing | over 30 s with nothing |
| Long action: result | progress shown and cancel offered over 10 s | over 10 s with progress but no cancel | over 10 s with no progress | never finishes |
| Cold start to first content | under 2 s | 2–4 s | over 4 s | — |
| Resume from background to the same screen | under 1 s | 1–2 s | lands elsewhere or reloads the page | — |
| Repeat consistency (same action, 3 runs) | slowest under 1.5× fastest | slowest over 2× fastest | — | — |
| Flash or blank between states (video or burst) | none | one frame, once | repeated, or on the core task | — |
