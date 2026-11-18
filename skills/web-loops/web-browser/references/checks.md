# The WEB checks

## Contents

- What the checks read in the page
- The rules
- Interaction: how it is read
- A11y: how it is read
- Responsive: how it is read
- Good to know

## What the checks read in the page

Every check reads the page through `eval` (browser.mjs refuses `run-code` in a
signed-in browser). The in-page code is `scripts/lib/collectors.mjs`, sent as
source text; the judging is in Node (`scripts/lib/interaction.mjs`, `a11y.mjs`,
`responsive.mjs`). The UnifyApps DOM they rely on:

| What | Where it comes from |
| --- | --- |
| the page root: `[data-page-id]` | app-verify's page-checks (open-page waits for it) |
| a block root: `[data-block-id]`, with `data-block-type` and `data-block-runtime-block-id` | page-checks; app-test-author's builder-app dialect. A repeated block shares one block id |
| the page scrolls inside `main.ua-page-workspace` | page-checks (`fit-page`) |
| the app's theme root: `.interface-theme`; the navigation: `.nocode-navigation-container` | app-verify's config review |
| the WEB preview's frame: `[class*="min-w-["]`, its width the variant's | browser.mjs page-shot |

The app root is the `.interface-theme` element around the page root, else the
page root. A finding outside the page root (inside the app root) is an `app
shell` issue. A page drawn inside a same-origin iframe is read through the
frame.

## The rules

| Rule | Check | Finds | Severity | Kind |
| --- | --- | --- | --- | --- |
| W1 | interaction | a clickable control whose look does not change on hover | major; minor when it has an :active rule or a ripple | interaction |
| W2 | interaction | a control Tab lands on with no visible focus indicator (WCAG 2.4.7) | major | interaction |
| W3 | interaction | a clickable control without `cursor: pointer` | minor | interaction |
| W4 | interaction | a click target the keyboard cannot reach (cursor pointer, no role, no tabindex); a focusable control Tab never reaches; focus stuck on one or two elements for ten presses (WCAG 2.1.2) | major | interaction |
| W5 | interaction | Tab moving back up the page, or left along a line | minor | interaction |
| W6 | interaction (`--active`) | no :active rule and no ripple: no pressed look | minor | interaction |
| W7 | a11y | a control with no accessible name (snapshot); an `img` without alt (DOM) | major; image minor | component |
| W8 | a11y | a field with no tied label: only a placeholder is minor, nothing at all major (WCAG 1.3.1, 3.3.2) | major / minor | component |
| W9 | a11y | text under WCAG AA contrast: 4.5:1, 3:1 for 24 px or 18.66 px bold | major under 3:1, else minor | colour |
| W10 | a11y | a heading level skipped going deeper (h1 then h3) | minor | typography |
| W11 | a11y | no such ARIA role; a widget role the keyboard cannot reach; aria-hidden over focusable content; a control inside a control; a clickable node with no control role; aria-labelledby naming a missing id | major or minor | component |
| W12 | responsive | the page, its scroller or a block wider than the window | major | layout |
| W13 | responsive | text cut off (an ellipsis is minor), or clipped by its container | major / minor | layout |
| W14 | responsive | two texts sharing a quarter of the smaller one's box | major | layout |
| W15 | responsive | a side bar over a quarter of a phone's width; no navigation and no menu button where the widest width had one; top-bar items cut off | major; cut items minor | navigation |

A finding repeated more than three times on a page (the same rule and
problem) folds into one issue that counts them and names the first blocks. One
problem of one block at several widths is one issue, the widest width's,
naming the others. The fix hints name the block's custom CSS as
`[data-block-id='<id>']` (app-craft's custom CSS rules), the theme, or the
block setting.

## Interaction: how it is read

1. **Survey.** Native controls (`a[href]`, `button`, `input`, `select`,
   `textarea`, `summary`, contenteditable), ARIA widget roles, `tabindex` ≥ 0,
   and the outermost element with `cursor: pointer` (a clickable div); a
   pointer wrapper around a real control counts once. At most `--max` (60),
   in page order, each marked `data-ua-probe=<n>` (the marks come off at
   the end). For each: its resting look (background, colour, borders,
   shadow, outline, underline, opacity, transform, filter, background image,
   for the element and its block root), whether it is focusable, and which
   stylesheet rules give it a :hover, :focus, :focus-visible or :active look
   (rules of another origin cannot be read and do not count).
2. **Resting looks** are read with the mouse in the window's bottom-right
   corner; a control the mouse still rests on is not judged for hover.
3. **Hover.** `B hover <probe>` on each control that is not a field; a
   listener reads its look 250 ms after the pointer arrives (a transition has
   started by then). A hover that cannot reach the control (covered, moved)
   is a note, not an issue.
4. **Tab walk.** The keyboard's starting point goes to the top of the
   document, then `B press Tab` up to the focusable count + 20 (at most
   `--max-tabs`, 80), read every 10 presses. A listener records every
   element that takes focus and its look 250 ms later. The walk ends when it
   comes back round (leaves the app and returns, or reaches its first stop
   again), when every focusable control was reached, or when it is stuck.
   Unreached controls are judged only on a walk that went round. The preview
   chrome before the app takes the first presses.

## A11y: how it is read

- **Names** come from `B snapshot` (the browser's accessibility tree, the
  name a screen reader says). A node with a ref is resolved to its block with
  one `eval` on the ref (at most `--max-refs`, 30), which also says whether
  it is inside the app: the snapshot covers the whole window, so a node
  outside the app root (the builder preview's toolbar and its "Switch
  variant" menu) is left out, and one inside the app but outside the page
  root (the menu, a shared header) is `app shell`. Fields are judged on
  their labels in the DOM, images on their alt.
- **Contrast** per distinct colour, size and weight: the text colour times
  the opacity of every ancestor, over the background stack from the text's
  own element up to the first opaque one, over a white canvas (WCAG 2.x
  relative luminance). A background image or gradient on the way, or a colour
  outside sRGB notation (oklch, lab), is not judged and is counted in a
  note. Disabled controls are exempt. The worst 20 styles become issues.
- **Headings** from the DOM (`h1`–`h6`, `role=heading` with `aria-level`).
  A page with none is a note.

## Responsive: how it is read

- **Overflow:** the document's and the page scroller's `scrollWidth` against
  their width; each block's box against the window (at 375, against the app
  frame), unless it sits in a scroller of its own or is a fixed element parked
  off screen (a closed drawer). Only the outermost overflowing block is an
  issue.
- **Cut text:** a text element whose own overflow is hidden and whose
  content is wider or taller than its box (a line clamp is meant); a text
  that runs past an ancestor that clips. Text inside a horizontal scroller is
  meant to scroll.
- **Overlap:** two text elements, neither inside the other, sharing a
  quarter of the smaller one's box.
- **Navigation:** the `.nocode-navigation-container`, else the largest
  `nav` or `role=navigation`, measured from the app's own box: `side` or
  `side-right` (taller than wide, at an edge), `top`, `bottom`, `drawer`
  (not on screen, a menu button is), `none`, `other`. The answer lists it
  per width.

## Good to know

- **Frames.** Whether the page is drawn in the top document or in a same-origin
  iframe, the collectors read it; a hover inside a frame uses the target
  `iframe >> nth=<i> >> internal:control=enter-frame >> [data-ua-probe="<n>"]`.
- **375.** The app frame is 375 px inside a phone frame, in a 460 px window,
  so W12 holds a block to the app frame's edges there, not the window's. The
  navigation is measured from the app's own box. The skill's § Opening a
  page's draft at a width says how the page gets there.
- **Block roots.** A UnifyApps block root may paint itself or wrap the element
  that does; web-visual-check measures the first painting element under a root
  that does not.
- **Time.** A large page takes longer: about 1 s per browser call, so 60 probes
  and 80 Tab presses is 2–3 minutes a width.
