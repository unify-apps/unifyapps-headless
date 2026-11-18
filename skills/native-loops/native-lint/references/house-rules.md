# House rules for mobile pages

Rules the developer stated while building the first native apps, now checked by `page-lint` of this block ([page lint](page-lint.md)) on UnifyApps Headless cache reads (`cache outline|blocks|ds|events|deps`), with no tenant call. Each rule has an id, a severity, what the lint reads and the fix it names. The rules come from the memory lines and prompts of those builds.

| id | Rule | Severity | What the lint reads | Fix it names |
| --- | --- | --- | --- | --- |
| H1 | Never pass user identity (email, user id, name) as a data-source parameter; automations read the signed-in user from User Variables | blocking | `cache ds`: parameters bound to `userContext`, an email literal or a user id | Drop the parameter; match the user inside the automation |
| H2 | Never nest a Repeatable (or any scrolling list) inside a Scrollable; the list owns the scroll with `content.scrollable true` and a flex-1 bound | blocking | `cache outline`: a Repeatable under a Scrollable ancestor | Make the list the scroll owner |
| H3 | Component inputs hold plain references; data adaptation (filter, map, sort, reshape) lives in a manual page function | blocking | `cache blocks`: a binding over 200 characters or containing `.filter(`, `.map(`, `.sort(`, `.reduce(` | Move it to a page function and bind `['value']` |
| H4 | Press feedback by surface: white cards highlight `#EFF0F2`; coloured pills, photo cards and icon tiles use opacity 0.6; scale off | advisory | `cache blocks`: Pressables and Cards without `appearance.interactions` | Add the surface's feedback |
| H5 | A skeleton matches the layout of the content it stands in for | advisory | `cache outline`: a loader state whose block shapes differ from the content region | Reshape the skeleton |
| H6 | Every page sets its status bar; the app sets the default | advisory | page settings without a status bar value | Set it on the page |
| H7 | A header with a cross opens the page as a modal (`adaptive_sheet`); a back arrow pushes | blocking | `cache events`: `navigateToPage` into a page whose header icon disagrees with the transition | Fix the transition or the icon |
| H8 | Mobile apps have no session storage; use app variables or local storage | blocking | `cache blocks|events`: `sessionStorage` anywhere | Replace with the right store |
| H9 | `customCSS` is pretty-printed JSON so a human can read it | advisory | `cache blocks`: minified customCSS | Reformat |
| H10 | Constants live in a `constants` folder of page variables; one manual validator returns `{field:{valid,error}, canContinue}`; each button has one plain action chain | advisory | `cache keys|events`: inline validation in chains, duplicated logic per button | Centralise |
| H11 | Names are unique app-wide (folders, data sources) | blocking | a duplicate name across cached pages | Qualify the name |
| H12 | A changed asset gets a new file name | advisory | an asset URL whose bytes changed under the same name (board or audit record) | Re-upload under a new name |
| H13 | A bottom-tab page has no spacer block for the bar; the bar floats | blocking | `cache outline`: a trailing spacer on a tab page | Remove it |
| H14 | Widths copied from the 440pt canvas overflow a 402pt phone; rows share width | advisory | `cache blocks`: fixed widths ≥ 380 on a mobile page | Use flex or percentages |
| H15 | Public pages cannot read global-page variables; folders nest one level | blocking | `cache keys` on a public page reading an app-level variable | Keep the value on the page |
| H16 | Return a result to the page underneath with `navigateBack` (`navigateToSpecificPage true`, `pageId`, `pageInputs`), read in `onPageFocus` | advisory | a `navigateBack` with inputs but no `onPageFocus` reader | Add the reader |
| H17 | A page that takes the Android back button (`onPageBack`) still lets the person leave: its chain navigates or signs out, unconditionally | advisory | `cache events`: a page `onPageBack` chain with no `navigateBack`, `navigateToPage`, `navigate` or `controlUser` `logout`; one whose only such action is conditional reads unverified | End the chain with `navigateBack` and no `runCondition`, or remove `onPageBack` |
