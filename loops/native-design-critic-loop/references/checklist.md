# Page checklist

Every page gets the **all pages** list. Then add the list for its page type. These are the questions a demanding user and a senior designer ask; each "no" is a candidate issue.

## Contents

- [All pages](#all-pages)
- [By page type](#by-page-type)
- [Across pages (consistency critic)](#across-pages-consistency-critic)
- [Theme (consistency critic)](#theme-consistency-critic)

## All pages

- **First glance.** In two seconds, can you tell what this page is for and what the main action is? Is there exactly one obvious primary action?
- **Hierarchy (house rule).** Read layout.json `typeRamp` and the screenshot together. Is the order title > heading > body > caption by size, weight and colour? Is the page's key fact the strongest text? Do several things compete? Note each role's size so the consistency critic can compare pages.
- **Spacing (house rule).** Do similar elements use the same left and right margins, the same gaps between them, and the same padding inside cards and rows? Use layout.json `dominantLeftMargin`, `dominantRightMargin` and `rhythm`. Look for one card or row that is off.
- **Alignment (house rule).** Do text, icons and controls share edges? Look for near misses of a few points (layout.json `misses`). Is centred content truly centred (equal space left and right)? Is each icon centred vertically on the text beside it? Do the header icon, page content and bottom bar share one left edge? Every alignment miss is high severity, whatever its size.
- **Safe areas.** Is anything under the status bar, the notch or Dynamic Island, the home indicator or the Android navigation bar? Is anything clipped at the screen edges?
- **Type.** Are there more than about 4 sizes or 3 weights on the page? Is meaningful text cut off with an ellipsis? Are any lines too long or too cramped?
- **Contrast.** Check body text, secondary text, placeholders, disabled states and icons with contrast.mjs. Also measure the edge of every input field, outlined button and card that relies on its border: put a thin box (height about 0.005) across the top edge and one across a side edge. Under 3:1 fails WCAG 1.4.11; when that edge is the only sign a field is there, it is high.
- **Press feedback (house rule).** Read the press-feedback probe for every pressable on the page. Does each show a highlight, dim or ripple while held? Is a ripple's colour visible on its background? Is the feedback the same for the same kind of control?
- **Scroll indicators (house rule).** Read the scroll-indicator probe. Is a scroll bar visible on any scrollable while it moves?
- **Touch.** Are targets at least 44×44 pt (iOS) or 48×48 dp (Android), with space between neighbours? Do tappable things look tappable, and non-tappable things not?
- **Copy.** Is the wording plain and consistent with other pages? Any typos, placeholder or debug text, raw keys like `home.title`, or wrong date, number or currency formats?
- **Accessibility.** Does every button and meaningful image have a label in screen.txt? Does the label match what is shown?
- **Platform.** Does the page feel native to this platform: navigation bar, back affordance, sheets, switches, pickers?
- **Behaviour.** Read probes.md for this page. Every unexpected result is a candidate issue in its own category.
- **Speed.** Read timings.md for this page and judge every row against the time budgets in taxonomy.md. Was there a loading state while waiting, and did it match what arrived (skeleton shaped like the content, no jump when it swaps)? Does the result jump or reflow after it could be read? On a simulator or Android, read `frames-*/changes.txt` and look at the frames around every change for flashes and blanks.

## By page type

- **auth:**
  - Does password manager autofill work (look for the system bar above the keyboard)?
  - Is there show/hide password?
  - Are the keyboard types right?
  - Is there a forgot-password path?
  - Do errors say what to do, without leaking whether an account exists in an odd way?
  - Is the main button visible with the keyboard up?
- **onboarding:**
  - Can you skip it?
  - Do you know how many steps are left?
  - Can you go back a step?
  - Are permission requests explained before the system prompt?
- **home:**
  - Is the most used action within thumb reach (bottom half)?
  - Does it make sense with little or no data?
  - Is anything that looks interactive actually dead?
- **list:**
  - Are rows consistent in height, padding and alignment?
  - Is there a clear empty state?
  - Is there a loading indicator for more items?
  - Is there pull to refresh?
  - Are long titles truncated sensibly?
  - Is search or filter where users expect it?
  - Do swipe actions have a hint?
- **detail:**
  - Is the key fact (title, status, price, date) the most prominent thing?
  - Are actions grouped and not hidden?
  - Does long content wrap?
  - Does back return to the same list position?
- **form:**
  - Does every field have a visible label (not just a placeholder)?
  - Are required fields marked?
  - Is validation inline and timely?
  - Is the keyboard type right per field?
  - Does Next move through the fields?
  - Is the submit button reachable with the keyboard up?
  - Is the button disabled or loading during submit?
  - Is input kept on error and on back?
  - Is there a warning before input is discarded?
- **search:**
  - Does the input get focus on open?
  - Is there a clear (×) button?
  - Are recent searches shown?
  - Is there a "no results" state with a next step?
  - Do results update without jumping around?
- **settings and profile:**
  - Are switches and pickers native?
  - Do changes say whether they were saved?
  - Are destructive actions (log out, delete account) separated, styled as destructive, and confirmed?
- **chat:**
  - Does the screen move from empty to conversation without a flash or jump?
  - Does feedback appear within about 1 s of sending (the message in place, a thinking indicator)?
  - Is there a stop button while it answers, and does it work?
  - Are thoughts or reasoning collapsible, clearly secondary to the answer, and readable when expanded?
  - Does the view follow streaming text without fighting the user's own scroll? Is there a jump-to-latest when scrolled up?
  - Do tables, charts, lists and numbers render cleanly, with sensible number formats and horizontal scroll for wide tables?
  - Does every action under an answer (copy, like, dislike, regenerate) have a label, press feedback, and confirmation (copied, thanks)?
  - Is the user's bubble clearly distinct from the answer?
  - Is the input above the keyboard, and does it grow?
  - Do new messages scroll into view?
  - Is the send state clear (sending, sent, failed)?
  - Can a failed message be retried?
- **media:**
  - Are images sized well and not stretched?
  - Are there placeholders while loading?
  - Are camera and gallery permissions handled when denied?
- **checkout** (never complete a payment):
  - Is the total clear before the final action?
  - Is the edit path back to the cart clear?
  - Are fees disclosed?
  - Is the final button wording explicit (Pay ₹499, not Continue)?
- **sheet and dialog:**
  - Does a bottom sheet have a grabber and sensible heights (not full screen for three options)?
  - With the keyboard up inside a sheet, are the input and the submit button still visible?
  - Is typed input kept, or clearly discarded with a warning, when the sheet is closed by accident?
  - Are the options in a feedback sheet clear, with a visible selected state, and is submit disabled until something is chosen?
  - After submit, is there a confirmation, and does the sheet close?
  - Is there an obvious way to close it?
  - Is the size right for the content?
  - Does the background dim?
  - Is a destructive choice styled and placed per platform?
  - Does Android back close it?
- **tabs-shell:**
  - Are there 3–5 tabs with clear icons and labels?
  - Is the selected state obvious?
  - Does each tab keep its position?
  - Does re-tapping a tab scroll to the top or pop to root?
- **empty and error:**
  - Does it say what happened and what to do next?
  - Is there a retry?
  - Is the tone human?
  - Is it never a raw error code or stack trace?
- **webview:**
  - Does it look and behave like the rest of the app?
  - Is there a loading state?
  - Is there a way back out?
  - Does pinch or zoom misbehave?
  - Is the text tiny or sized for desktop?

## Across pages (consistency critic)

- Is the same horizontal margin used across pages? Build a table of `dominantLeftMargin` and `dominantRightMargin` for every page and name each page that differs.
- Is card and row padding the same for the same kind of item on every page?
- Build a type-ramp table: each page's page title, section header, body and caption size (`typeRamp`) and weight and colour from the screenshot. The same role must match on every page.
- Is press feedback the same kind (highlight, dim or ripple, and its colour) for the same kind of control everywhere?
- Are headers and titles the same style and position on every page?
- Are primary, secondary and destructive buttons styled the same everywhere?
- Is one type scale used throughout, with the same title size on pages of the same level?
- Is one icon family used, at the same stroke and size?
- Do empty, loading and error states share one pattern?
- Is the same thing called by the same name everywhere?
- Does back behave the same way everywhere?
- Do similar opens take similar times (every list page, every sheet)? Is one page or sheet markedly slower than its siblings? Read the run's timings.md.

### Theme (consistency critic)

The theme is the set of visual decisions every page should share. Build one **theme table** from every page's screen.png and the sheets and states in `states/`, and put it at the top of the findings file, after the margin and type-ramp tables.

1. **Colour per role.** For each role below, sample it on every page where it appears with `contrast.mjs <png> x y w h`, the box taken from the element's frame in the tree (for a background or surface, a box of empty area). Record the hex values per page. Treat two values as the same colour when no channel differs by more than 6, which absorbs compression noise; any larger difference is a second value.

   | Role | Where to sample |
   |---|---|
   | page background | empty area of each page |
   | surface | cards, sheets, menus, the composer or input bar, list rows with a fill |
   | accent / brand | primary buttons, links, selected tab, active icons, toggles on |
   | text primary | titles and body |
   | text secondary | captions, timestamps, helper text, placeholders |
   | border | text fields, outlined buttons, cards |
   | divider | separators between rows and sections |
   | destructive / error | Delete, error text, error borders |
   | success / warning | confirmations, status chips |
   | disabled | disabled buttons and fields |
   | overlay | the dimmed page behind a sheet or dialog |

2. **Shape and depth per component type.** From the screenshots, compare these for each kind of component (card, primary button, secondary button, text field, search field, chip or tag, sheet, menu, dialog, floating button, avatar). Corner radius and shadow are judged from pixels, since the tree has neither; give an estimate in pt and say it is an estimate.
   - corner radius
   - shadow or elevation, or none
   - border thickness and colour
   - fill (filled, outlined, plain)
   - height and inner padding

3. **Type families.** Which font family each role uses (page title, body, buttons, inputs, captions). Two families can be a deliberate pairing; the same role in two families is not.

4. **States.** Selected, active, pressed, focused and disabled look the same for the same kind of control everywhere (one selected-tab style, one focus ring, one disabled style).

5. **Dark mode**, when that pass ran: every role has one dark value, and no light-only colour is left (a white card or black text on a dark page).

Raise an issue for every role or component type with more than one value: name the role, every value, and the pages where each appears. Root-cause key `theme`.
