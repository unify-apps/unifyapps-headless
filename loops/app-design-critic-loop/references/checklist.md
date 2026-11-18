# Page checklist

Every page gets the **all pages** list at the design width, then the **at 375** list, then the list for its page type. These are the questions a demanding user and a senior designer ask; each "no" is a candidate issue.

## Contents

- [All pages](#all-pages)
- [At 375](#at-375)
- [By page type](#by-page-type)
- [Across pages (consistency critic)](#across-pages-consistency-critic)
- [Theme (consistency critic)](#theme-consistency-critic)
- [Across the app (flow critic)](#across-the-app-flow-critic)

## All pages

- **First glance.** In two seconds, can you tell what this page is for and what the main action is? Is there exactly one obvious primary action?
- **Hierarchy (house rule).** Read the layout file's `typeRamp` and `headings` with the screenshot. Is the order title > heading > body > caption by size, weight and colour? Is the page's key fact the strongest text? Do several things compete? Note each role's size so the consistency critic can compare pages.
- **Spacing (house rule).** Do similar elements use the same left and right margins, the same gaps, and the same padding inside cards and rows? Use `dominantLeftMargin`, `dominantRightMargin`, `rhythm` and `unevenGaps`. Look for one card or row that is off.
- **Alignment (house rule).** Do text, icons and controls share edges? Look for near misses of a few px (`misses`). Is centred content truly centred? Is each icon centred vertically on the text beside it? Do the page title, the content and the toolbar share one left edge? Every alignment miss is high severity, whatever its size.
- **Width use.** At 1440, is the content width sensible: forms and paragraphs not stretched edge to edge, tables not squeezed? Is there a maximum width, and is it centred or deliberately left?
- **Type.** More than about 4 sizes or 3 weights (`typeRamp`)? Meaningful text cut with an ellipsis and no tooltip? Lines over 90 characters (`longLines`)? Heading levels skipped (`headingOrder`)?
- **Contrast.** Read `contrastFails` for body text, secondary text, placeholders, disabled states and icons. Also check the edge of every input, outlined button and card that relies on its border: under 3:1 fails WCAG 1.4.11; when that edge is the only sign a field is there, it is high.
- **Hover and focus (house rule).** Read the hover and focus probes for every control. Does each show a hover look? Is there a visible focus ring on every Tab stop, and does the order follow the page? Is the feedback the same for the same kind of control?
- **Pointer (house rule).** Read `noPointer`: a clickable element with the arrow cursor, or a pointer on something that does nothing.
- **Targets.** Any control under 24 CSS px (`smallTargets`)? Under 44 on the primary action? Controls so close that a slip hits the neighbour?
- **Copy.** Plain wording, consistent with other pages? Typos, placeholder or debug text, raw keys like `home.title`, wrong date, number or currency formats?
- **Accessibility.** Does every control have a name in the snapshot (`unlabeled`)? Every input a real label, not just a placeholder (`unlabeledInputs`)? Does the label match what is shown? Are there landmarks (navigation, main)? Does the reading order of the snapshot match the visual order?
- **Behaviour.** Read probes.md for this page. Every unexpected result is a candidate issue in its own category.
- **Stability.** Read `console-<W>.txt`, `console-375.txt` and `requests-*.txt` with the Console and network row of probes.md. Any console error, any request that failed or answered 4xx or 5xx on the open or on an action the page offers? Count them; the first line of each is the evidence.
- **Design.** When `design/<W>/gaps.json` exists for this page: read its open rows with `issues.md` and look at `pass-report.html`, the page shot and the design picture side by side. Every open row is a candidate `design-drift` issue; a page with no design folder is "no design", never a finding.
- **Speed.** Read timings.md and `perf-*/perf.json` for this page and judge every row against the budgets in taxonomy.md. Was there a loading state while waiting, and did it match what arrived (a skeleton shaped like the content, no jump when it swaps)? Did the content shift after it could be read? Look at the burst frames around every change for blanks and flashes.

## At 375

- **No sideways scroll (house rule).** `overflowX` false and `overflow` empty in the 375 layout file; nothing cut at the edges on the 375 screenshot.
- **Navigation.** Does every page in the side bar or top bar stay reachable (a menu button, a bottom bar)? Is the current page shown? Does the menu close after a choice?
- **One column.** Do cards, columns and forms stack? Is anything two columns squeezed into 375?
- **Tables.** Does a table scroll inside itself with its header kept, stack into cards, or overflow the page? Can the key columns be read without scrolling?
- **Text.** Any text cut or overlapping (`overflow`, the screenshot)? Lines readable, not one word a line?
- **Controls.** Targets at least 44 CSS px on a phone, with space between neighbours? Row actions that only show on hover: is there a touch path?
- **Forms.** Fields full width, labels above, the submit button reachable without scrolling past the fold or clearly below it?
- **Dialogs.** Fit the viewport, scroll inside themselves, keep their close button in view?
- **Same content.** Nothing dropped at 375 that the person needs (a filter, a column, an action).

## By page type

- **auth:**
  - Is the main button visible without scrolling? Does Enter submit?
  - Is there show/hide password, and a forgot-password path?
  - Does the browser's password manager work (the right input types and autocomplete)?
  - Do errors say what to do, without leaking whether an account exists in an odd way?
- **home and dashboard:**
  - Is the most useful thing at the top? Does it make sense with little or no data?
  - Do cards share one height and padding? Do charts have titles, legends and units?
  - Is anything that looks interactive actually dead?
- **list:**
  - Rows consistent in height, padding and alignment? Columns aligned by type (numbers right, text left)?
  - A clear empty state? A loading indicator for more rows? Paging or infinite scroll that says where you are?
  - Long titles truncated sensibly, with a tooltip? Search and filters where users expect them, and their active state shown?
  - Row actions discoverable without hover? Bulk selection clear?
- **detail:**
  - Is the key fact (title, status, amount, date) the most prominent thing? Are actions grouped and not hidden?
  - Does long content wrap? Does back return to the same list position and filter? Does the URL name the record?
- **form:**
  - Every field with a visible label (not just a placeholder)? Required fields marked? Help text where a field is not obvious?
  - Validation inline and timely, next to the field? Input kept on error, back and reload? A warning before input is discarded?
  - Tab order through the fields in order? Enter submits from a text field? The right input type (email, number, date)?
  - The button disabled or loading during submit? A clear result after?
- **wizard:**
  - Do you know how many steps are left and which you are on? Can you go back a step without losing input?
- **search:**
  - Focus in the input on open? A clear (×) button? A "no results" state with a next step? Results that update without jumping?
- **settings and profile:**
  - Do changes say whether they were saved? Destructive actions (delete, sign out) separated, styled as destructive, and confirmed?
- **chat:**
  - Feedback within about 1 s of sending? A stop button while it answers? Does the view follow streaming text without fighting the user's scroll?
  - Tables, lists and numbers render cleanly? Every action under an answer has a name, hover and focus feedback, and a confirmation?
- **media:**
  - Images sized well and not stretched? Placeholders while loading? Drag and drop and a file picker both offered, and a size limit stated?
- **checkout** (never complete a payment):
  - The total clear before the final action? The edit path back clear? Fees disclosed? The final button wording explicit (Pay ₹499, not Continue)?
- **dialog and drawer:**
  - An obvious way to close? Escape and a click outside work? Input kept, or a clear warning, when closed by accident?
  - The size right for the content, the background dimmed, focus moved into it and returned after? A destructive choice styled and placed as expected?
- **empty and error:**
  - Says what happened and what to do next? A retry? Human tone? Never a raw error code or stack trace?

## Across pages (consistency critic)

- Is the same horizontal margin used across pages? Build a table of `dominantLeftMargin` and `dominantRightMargin` for every page at each width and name each page that differs.
- Is card and row padding the same for the same kind of item on every page?
- Build a type-ramp table: each page's page title, section header, body and caption size (`typeRamp`), weight, family and colour. The same role must match on every page.
- Are hover and focus styles the same for the same kind of control everywhere (one hover colour, one focus ring)? Is the cursor consistent?
- Are headers, titles and toolbars the same style and position on every page? Is the navigation's current-page mark the same everywhere?
- Are primary, secondary and destructive buttons styled the same everywhere?
- Is one icon family used, at the same stroke and size?
- Do empty, loading and error states share one pattern?
- Is the same thing called by the same name everywhere?
- Does back and reload behave the same way everywhere?
- Do similar opens take similar times (every list page, every dialog)? Is one page markedly slower than its siblings? Read the run's timings.md.
- Does every page adapt the same way at 375 (the same navigation, the same stacking)?

### Theme (consistency critic)

The theme is the set of visual decisions every page should share. Build one **theme table** from every page's dumps (`screen-*.json`, exact colours) and screenshots, and the surfaces in `states/`, and put it at the top of the findings file, after the margin and type-ramp tables.

1. **Colour per role.** For each role below, read the value on every page where it appears from the dump (`color`, `bg`, `border`). Record the values per page. Treat two values as the same colour when no channel differs by more than 6; any larger difference is a second value.

   | Role | Where to read it |
   |---|---|
   | page background | the page's `bg` |
   | surface | cards, dialogs, menus, drawers, table rows with a fill |
   | accent / brand | primary buttons, links, the selected navigation entry, active icons, toggles on |
   | text primary | titles and body |
   | text secondary | captions, timestamps, helper text, placeholders |
   | border | text fields, outlined buttons, cards |
   | divider | separators between rows and sections |
   | destructive / error | Delete, error text, error borders |
   | success / warning | confirmations, status chips |
   | disabled | disabled buttons and fields |
   | overlay | the dimmed page behind a dialog |
   | focus ring | the outline on a focused control |

2. **Shape and depth per component type.** From the dumps (`radius`, `shadow`, `border`) and the screenshots, compare these for each kind of component (card, primary button, secondary button, text field, search field, chip or tag, dialog, menu, drawer, table row, avatar): corner radius, shadow, border thickness and colour, fill, height and inner padding.

3. **Type families.** Which font family each role uses (`fonts` and `typeRamp`). Two families can be a deliberate pairing; the same role in two families is not.

4. **States.** Hover, focus, selected, active and disabled look the same for the same kind of control everywhere.

5. **Dark mode**, when that pass ran: every role has one dark value, and no light-only colour is left.

6. **The design's values.** When `RUN/design.md` names a spec, read the spec's type ramp, colour roles and radii first and judge every page against them; the app's majority value is the yardstick only where no spec exists. A page that matches the other pages but not the spec is `design-drift`, not `theme`.

Raise an issue for every role or component type with more than one value: name the role, every value, and the pages and widths where each appears. Root-cause key `theme`.

## Across the app (flow critic)

The flow critic owns the run-wide keys (`url-slug`, `default-branding`, `deep-link`, `notification`, `auth-leak`, `auth-return`): one issue for the app, every page named, raised here and never by a page critic.

- **Addresses.** From `branding.md`: list every page whose slug says clone, copy or test, carries a number or a hash, or does not name the page. One issue for the app, every page named (`url-slug`).
- **Names.** Every tab title, page heading, app name and logo that still says Clone of, Copy, Untitled or a default (`default-branding`).
- **Deep links.** Every page whose Direct open probe did not land on the page itself, lost its data on reload, or left the app on back (`deep-link`).
- **Notifications.** From `notifications.md`: does the bell's count match its list? Does marking one read change the count and the row? Does the notification an allowed action sends arrive within the budget in taxonomy.md, as a toast, a count or both? Say "not reached" when the file says so.
- **Auth.** From `auth.md`: did sign-out land on the sign-in page? Did the private URL show nothing of the page before asking to sign in? Did the sign-in return to the page that was asked for? Say "not run" when the file says so.
- **Stability over the app.** Add up the console errors and failed requests per page from every probes.md. A page with many is one issue; one error on every page is one issue with every page named.
