# Severity and categories

## Contents

- [Severity rubric](#severity-rubric)
- [Categories, in report order](#categories-in-report-order)
- [House rules](#house-rules)
- [Issue shape](#issue-shape)
- [Root cause keys](#root-cause-keys)
- [The same finding in the config review](#the-same-finding-in-the-config-review)
- [Time budgets](#time-budgets)

## Severity rubric

Judge by the effect on a real user, not by how easy it is to fix.

| Severity | Meaning | Typical examples |
|---|---|---|
| **Critical** | The user cannot finish the task, loses data or money, or is misled into the wrong action. | A blank page or an error page. A core action that never finishes, or takes over 30 s with nothing on screen. Dead end with no way back. A dialog that cannot be closed. Reload or back throws away a long form with no warning. A primary button does nothing. Text unreadable (contrast under 3:1 on primary content). Wrong record opened or acted on. A core control unreachable at 375. A private page that shows anything after sign-out, before the sign-in. A deep link to a page that lands on a blank or an error. |
| **High** | The task is possible but with real friction or confusion that many users will hit. | A console error or a failed request on a page's open or its core action. A deep link that lands on the first page instead of the page asked for, or a sign-in that does not return to it. A notification that never arrives for an action that should send one. No feedback after a submit, so people click twice. Error message missing or vague. A primary target under 24 CSS px. Key information truncated with no way to read it. Back goes somewhere unexpected. Body text contrast between 3:1 and 4.5:1. Field or button edges under 3:1 when the edge is the only cue. A loading state that is a blank page for over a second. A click with no visible response for over 500 ms. A page open or core action past its time budget. A control on the main path with no visible focus ring, or one the keyboard cannot reach. Horizontal scroll of the page at either width. Any misalignment: items that belong together off a shared edge or centre line, icons off-centre on their text, centred content not truly centred (house rule, any size, including 1–3 px). |
| **Minor** | Noticeable polish problems that do not block anything. | A box, gap or type value off its design spec by more than 4 px (high when a region of the design is missing or the primary action has the wrong colour role; nitpick within 4 px). A slug that says clone, copy or test, or carries a number or a hash; an app name, tab title or logo that still says Clone of, Copy, Untitled or a default (high when it is on the first page or the browser tab of every page). A notification that arrives late. Padding differs between similar pages. Inconsistent button styles or capitalisation. A clickable element with the default cursor. No hover look on a secondary control. Empty state is plain text with no guidance. Placeholder used as the only label. A line of text over 90 characters. A heading level skipped. |
| **Nitpick** | Small taste or pixel issues a careful designer would still fix. | Icon stroke weights mixed. Slightly uneven vertical rhythm. Copy tone shifts. Divider colours differ slightly. |

Raise severity one step when the problem sits on the main path (sign in, the app's first page, the core task, checkout). Lower it one step when it sits on a rarely visited page. Never above what the row or the house rule allows: Critical holds only by its own definition.

## Categories, in report order

1. **Stability and blockers**: errors, blank pages, dead ends, actions that do nothing, wrong action executed, a page that cannot be reached at 375, console errors and failed or 4xx/5xx requests a page makes on its open or its actions, a private page that shows after sign-out.
2. **Navigation and flow**: browser back and reload behaviour, lost state on return, URLs that do not name the page, a slug that says clone, copy or test or carries a number or a hash, a deep link that does not land on its page, a sign-in that does not return to the page asked for, dialogs and drawers with no clear way out, unclear location ("where am I"), too many steps for a common task, unexpected redirects, a navigation that loses entries at 375.
3. **Input and forms**: labels, required marks, validation that is late, unclear or wipes input, focus that jumps, autofill blocked, the wrong input type, Enter that does not submit, inputs that lose text on back or reload.
4. **Feedback and system states**: loading, empty, error, success, disabled and in-progress states missing, unclear or inconsistent; no confirmation for destructive actions; spinners with no end; toasts that vanish too fast or cover a control; a notifications bell whose count does not match its list, a mark-read that changes nothing, a notification that arrives late or never.
5. **Layout and spacing**: a box, gap or inset off the page's design spec, page margins or card padding that differ between pages, items off their shared edge or centre line, icons not centred on their text, uneven rhythm, content past the viewport, clipped or overlapping content, cramped or empty-feeling density, poor use of the width (a form stretched to 1400 px, a table squeezed into a column).
6. **Typography and hierarchy**: unclear hierarchy, a type ramp out of order, the same role in different styles on different pages, too many sizes or weights, truncation of meaningful text, lines over 90 characters, skipped heading levels, inconsistent title styles.
7. **Colour, contrast and visual consistency**: low contrast, colour as the only signal, inconsistent brand colours, mixed icon styles, inconsistent buttons, dark-mode breakage.
8. **Pointer, hover and focus**: clickable things with the default cursor, controls with no hover look, no visible focus ring, a focus order that does not follow the page, keyboard traps, targets under 24 CSS px or crowded, actions only reachable by hover with no keyboard or touch path.
9. **Content and copy**: unclear labels, jargon, inconsistent terms for the same thing, unhelpful error text, typos, placeholder or debug text, raw keys, wrong formatting of dates, numbers and currency, an app name, tab title, page heading or logo that still says Clone of, Copy, Untitled or a default.
10. **Accessibility**: controls without a name, a wrong role or state, illogical reading order, missing landmarks, images without text, information only in colour, content lost at 200% zoom.
11. **Responsive**: at 375, horizontal scroll, cut or overlapping text, a table that cannot be read, a navigation that hides pages, controls too small or too close for a thumb, a layout that does not adapt on resize.
12. **Perceived performance**: slow opens, layout shift after load, flicker, images popping in, delay between click and response, long tasks that freeze the page. Judge measured values against the budgets below.

## House rules

Standards this review holds every app to. Apply them on every page, at both widths, on top of WCAG 2.2 and the conventions of a desktop browser and a phone. Each finding cites the rule by name.

| Rule | What fails it | Category | Default severity |
|---|---|---|---|
| **Hover and focus feedback** | A control (button, link, row, chip, card, icon, tab) shows no visible change on hover, or no visible focus ring when reached by keyboard. | Pointer, hover and focus | minor; high on the page's primary action, and high for a missing focus ring anywhere on the main path |
| **Pointer cursor** | A clickable element keeps the default arrow cursor, or a non-clickable one shows a pointer. | Pointer, hover and focus | minor |
| **Consistent padding** | Page margins, card padding or row padding differ between pages or between similar items. | Layout and spacing | minor; nitpick at 1–3 px |
| **Alignment** | Items that belong together do not share an edge or a centre line; an icon is not centred on the text beside it; centred content is not truly centred. Any measured miss counts, even 1–3 px. | Layout and spacing | high, always; never lowered for size or a rarely visited page |
| **Consistent theme** | A colour role (background, surface, accent, text, border, divider, error, disabled, overlay), a component's shape (corner radius, shadow, border, fill) or a state style (hover, focus, selected, disabled) has more than one value across pages, or one role uses two font families. | Colour, contrast and visual consistency | minor; high when it changes meaning (two accents where one marks the primary action, two error colours) or sits on the primary button; nitpick when the values differ only slightly and never side by side |
| **Clear text hierarchy** | The type ramp on a page is not ordered title > heading > body > caption, the main text is not the strongest, or the same role uses a different size, weight or colour on another page. | Typography and hierarchy | minor; high when the page's key fact is not the most prominent text |
| **Readable lines** | Body text runs over about 90 characters a line, or a form field or paragraph stretches across the whole width at 1440. | Typography and hierarchy | minor |
| **No sideways scroll** | The page scrolls horizontally at either width (a table or chart that scrolls inside its own box is fine). | Responsive | high |

## Issue shape

Every critic returns issues exactly like this:

```markdown
### <short title in plain words>
- **Severity:** critical | high | minor | nitpick
- **Category:** <one category from the list above>
- **Pages:** <NN-slug>[, <NN-slug> …]
- **Width:** 1440 | 375 | both
- **What the user sees:** <one or two sentences, from the user's chair>
- **Why it matters:** <the effect on the user; name the guideline if one applies (WCAG 2.2 x.y.z, a platform convention)>
- **Evidence:** <screenshot file(s); measured numbers from the layout file or the dump; probe step from probes.md>
- **Steps to see it:** <numbered steps from the app's first page, only for behaviour issues>
- **What good looks like:** <the expected behaviour or look, in user terms, no implementation>
- **Confidence:** proven | likely
- **Root cause key:** <one key from the list below, or other:<short-slug>>
```

`proven` means the evidence alone shows it. `likely` means a judgement call from the screenshot; the main thread must confirm a likely critical or high before it ships.

## Root cause keys

Every issue carries one key, so the merger can group the same root problem across pages and critics without matching titles by hand. Pick the narrowest key that fits; use `other:<short-slug>` only when none does, and reuse the same slug for the same problem.

| Key | Root problem |
|---|---|
| `click-does-nothing` | a control or row gives no result |
| `wrong-result` | the action acts on, opens or answers the wrong thing |
| `lost-input` | typed text or a choice is discarded on back, reload or close, or comes back wrongly |
| `back-behaviour` | browser back lands somewhere unexpected, or the URL does not name the page |
| `deep-link` | the page's own URL, opened in a fresh tab, lands on the first page, a blank or an error, or a reload loses the page or its data |
| `url-slug` | the address bar shows a slug that says clone, copy or test, ends in or carries a number, looks like a generated hash, or does not name the page; one issue for the app, every page listed |
| `default-branding` | the app name, tab title, page heading or logo still says Clone of, Copy, Untitled or a default |
| `auth-leak` | after sign-out, a private URL shows any of the page before the sign-in page, or does not ask to sign in at all |
| `auth-return` | after the sign-in, the app lands on its first page instead of the page that was asked for |
| `notification` | the bell's count does not match its list, mark-read changes nothing, or a notification arrives late or never |
| `no-state-shown` | a filter, selection, current item or mode is active but not shown |
| `missing-feedback` | no loading, success, error or empty message where one is needed |
| `dialog-exit` | a dialog or drawer is hard to close, or closes too easily |
| `dialog-style` | dialogs of one kind differ in size, padding, title or buttons |
| `alignment` | items off a shared edge or centre line |
| `padding` | margins or padding differ between similar items or pages |
| `type-hierarchy` | type ramp out of order, or the key fact is not the strongest text |
| `line-length` | lines over about 90 characters, or content stretched across the full width |
| `heading-order` | heading levels skipped or out of order |
| `contrast-text` | text under its WCAG contrast minimum |
| `contrast-edge` | a field, button or card boundary under 3:1 |
| `theme` | a colour role, component shape or state style with more than one value across pages |
| `small-target` | a click target under 24 CSS px, or crowded |
| `hover-feedback` | no visible hover state |
| `focus-ring` | no visible focus ring |
| `focus-order` | the Tab order does not follow the page, or a control is unreachable |
| `keyboard-trap` | focus cannot leave a region or close a dialog |
| `cursor` | the wrong cursor on a clickable or non-clickable element |
| `hover-only` | an action only reachable by hover, with no keyboard or touch path |
| `a11y-unlabeled` | a control missing from the snapshot or without a name |
| `a11y-role` | a control with the wrong role or state, or a missing landmark |
| `responsive-overflow` | content cut, overlapping or scrolling sideways at 375 |
| `responsive-nav` | the navigation loses pages or actions at 375 |
| `responsive-table` | a table unreadable at 375 |
| `internal-text` | technical, debug or internal wording shown to users |
| `copy` | unclear, inconsistent or mistaken words |
| `layout-overflow` | content clipped or past the viewport at the design width |
| `design-drift` | the page differs from its design spec at that width: a box, gap, inset, type value, colour, fill or radius off the spec by more than its tolerance, a region missing, or text the design does not have. The gap row is the evidence, with the page shot and the design picture side by side; the category is the one of what drifted (a box, gap or inset: Layout and spacing; a type value or text: Typography and hierarchy; a colour, fill or radius: Colour, contrast and visual consistency); rows of one kind on one page are one issue; a missing region or a wrong colour role on the primary action is high, an off over 4 px minor, within 4 px nitpick, never critical |
| `console-error` | the page writes errors to the console on its open or on an action (the count and the first line are the evidence) |
| `request-failed` | a request the page makes fails or answers 4xx or 5xx (the count and the first URL are the evidence) |
| `perf-slow` | a measured time over its budget |
| `perf-shift` | layout shift, flicker, blanks, content jumping after it could be read |

## The same finding in the config review

`/ua:review-loop` runs `/ua:app-config-review`'s config review before this loop. Its rulebook already has two rules on page addresses, _Use readable and consistent page slugs_ and _Invalid Page Slug Generated from Cloned IDs_. A `url-slug` issue here is the same defect seen live: the summary lists it once, under this report's ID, and names the rule beside it, never as two findings.

## Time budgets

Measured as in capture.md "Timing probes". A time within the browser's timing resolution (browser.md) of a limit is not a failure; mark it `likely` at most. Severity rises one step on the app's core task, as everywhere, never past the row's highest column.

| Moment | Fine | Minor | High | Critical |
|---|---|---|---|---|
| Click to first feedback (INP) | under 200 ms | 200–500 ms | over 500 ms | — |
| Page open to largest content (LCP) | under 2.5 s | 2.5–4 s with a loading state | over 4 s, or over 1 s blank | — |
| Layout shift after load (CLS) | under 0.1 | 0.1–0.25 | over 0.25, or content jumps after the user could start reading or clicking | — |
| Long tasks during the open | none over 50 ms | a few, under 200 ms each | the page freezes for over 200 ms | — |
| Long action (search, upload, save): something visible | within 1 s | — | over 1 s with nothing | over 30 s with nothing |
| Long action: result | progress shown and cancel offered over 10 s | over 10 s with progress but no cancel | over 10 s with no progress | never finishes |
| Reload to the same page and state | under 1 s | 1–2.5 s | lands elsewhere or loses the state | — |
| Repeat consistency (same action, 3 runs) | slowest under 1.5× fastest | slowest over 2× fastest | — | — |
| Flash or blank between states (burst) | none | one frame, once | repeated, or on the core task | — |
| Notification after the action that sends it (bell or toast) | under 3 s | 3–10 s | over 10 s, or never within 60 s | — |
