# Navigation and routing

Menus, page paths and back controls.

90 rules: P0 7, P1 41, P2 28, P3 14.

## Contents

- P0
- P1
- P2
- P3

## P0

- Give every back control an event; a back arrow with `events: []` is a dead control.
- Pair `navigateToSpecificPage: true` with a real `pageId` and fill every `:param` of the destination.
- Link to this app's pages with `navigateToPage`, never `navigate` with a path like `/home`.
- Set navigationBar.navigatorType on a mobile app; unset with no navigator module, every tab page renders blank. (mobile only)
- Keep a way to close a Modal: hideOnClickOutside, hideOnEscape or a wired close action.
- Pass every page input a navigation item needs explicitly; page defaults apply in builder and preview, not published.
- Fill every :param of the target page in navigateToPage and navigateBack pageParams; short params do nothing when published.

## P1

- No more than 8 navigation items at the first level.
- The page route tree has no problems (get_page_paths).
- Wire every back control to `navigateBack`, never to `navigateToPage`.
- Move a hand-built app menu into the app menu with `apply_navigation_edits` and delete its blocks.
- Provide a reachable Log out in every app with sign-in, in Profile or More. (mobile only)
- In a hand-built tab bar, navigate with replace and a run condition on the selected tab; each tap must not push a page. (mobile only)
- Set a default page for logged-in users and one for logged-out users, both with static paths.
- Make the logged-out default page public, or logged-out users land on a page they cannot open.
- Point every menu item at a page that exists and that the people who see the item can open.
- Give every Custom navigation bar a module that exists; a missing or deleted module draws an empty strip with no error.
- Give every nav item and appearance entry an id; group children saved without ids can hide the whole web menu. (web only)
- Set a home page (defaultPageId) whose path has no : params; a new app starts with none.
- Point defaultPublicPageId at a public page that still exists; deleting a page does not clear it.
- Fill every : param of a PAGE menu item's path with a plain value; an empty one makes the click do nothing.
- Give each nav item permission a real permission group id; a wrong id hides the item from everyone.
- Never put a page id in a MODULE nav item's moduleId; it replaces that page's route and the page can stop opening.
- Don't build pages at login, signup, mfa-verification, forgot-password, update-password or reset-password; the platform serves them. (web only)
- Declare every page input a mobile page reads, with its type; an undeclared input arrives as text. (mobile only)
- Add each new primary item to every navigation.appearance.<SM|MD|LG|XL>.primary list; those lists override navigation.primary.
- Never navigateToPage to a bottom-tab page from a pushed page; the phone lands on the first tab. Use navigateBack. (mobile only)
- Never open an adaptive_sheet from a page already open as a sheet; the phone silently does nothing. (mobile only)
- Return a result with navigateBack: navigateToSpecificPage, pageId and every original pageInput, read in onPageFocus. (mobile only)
- Keep defaultPageId on a top-level tab or drawer item; a default page outside them opens with no tab bar. (mobile only)
- Keep navigation.primary empty on a stack-only mobile app; items under navigator None make navigation to them do nothing. (mobile only)
- In a navigator module read the active screen from pageInputs['activeTab'] (a slug), never activeItem or a page id. (mobile only)
- Give a floating tab bar's module root position absolute, with no overflow scroll token or background image; either breaks the float. (mobile only)
- Give a full_screen_modal page its own close or continue button; iOS cannot swipe it away. (mobile only)
- Every page that opens another sends every input that page needs.
- Keep a NavigationContainer's navigationMenuId and header blockId on the same Navigation menu.
- Replace a new Navigation's six seeded items (Home, Projects, Analytics...) instead of appending real ones.
- Give every Navigation item a type, every group an items list, and label items variant custom.
- Make every Navigation page item's pageId resolve; a dead one loads the app's default page when published.
- Write navigateToPage history as literal push or replace; a binding skips the navigation entirely.
- Write external navigate paths with https:// and internal ones with a leading slash.
- Never store a bare modifier (Shift) as a shortcut key; it fires on every keystroke. (web only)
- Make a detail page dynamic with a :param folder in its path, never a :param slug.
- Give every nav item a re-derived appearance entry, and every MODULE item its entityDetailsMap entry.
- Pass nav item pageInputs and pageParams the destination declares, as literals; a {{ }} there is stored as text.
- Read path segments from pageParams and query params from declared pageInputs, never location.pathParams or location.search.
- Don't rely on app navigation or app variables on a public page an anonymous visitor opens; that layout has neither. (web only)
- End a custom login on a public page with a full document load, not a soft navigateToPage, so calls switch to /api. (web only)

## P2

- Use readable and consistent page slugs.
- Multiple navigation items should not link to the same page.
- Keep 3 to 5 bottom tabs on mobile. (mobile only)
- Flag a summary with no navigation to the detail page its spec Touches list names.
- Rows or tiles that stand for different actions open their own destination, not one shared page.
- Route notification, push and in-app links through a target check; a missing or foreign target opens a link-broken or not-available state. (mobile only)
- Pick the navigation set from user state; a guest or user without the needed role must not get the full signed-in tab bar. (mobile only)
- Give every nav item, groups and URL items included, an icon id from the icon menu; a wrong name draws an empty slot.
- Put only PAGE, URL and MODULE items inside a nav group; other item types are not drawn. (web only)
- Flag a nav group the app needs below XL; groups draw only at XL on web, never in bottom tabs or a drawer. (web only)
- Pass only inputs the destination declares in a menu item or navigation action's pageInputs.
- Use the ids userMenu, notifications and BRAND_NAVIGATION for the profile menu, bell and logo link. (web only)
- Build a hand-built bar the person chose as one module or template in header_id, real menu off, items filtered by permission. (web only)
- Pass an id as a page input, never a whole record or list. (mobile only)
- Read numeric and boolean page inputs as possible text on mobile: Number(x), String(x) === 'true', JSON.parse only on a string. (mobile only)
- Keep a raised centre tab button inside the module root's bounds and out of a rounded Pressable, or part of it takes no taps. (mobile only)
- Never use pageTransitionBehavior modal on mobile; it opens as a plain push. (mobile only)
- Give an adaptive_sheet page that holds a BottomSheet a close cross; iOS can't swipe it down until that sheet has opened once. (mobile only)
- Deep link into a page as matrix://<slug>?<input>=<value>, never matrix://open?url=<endpoint>/<slug>. (mobile only)
- Go back or replace instead of pushing list, detail, list again; pushed pages stay mounted and memory grows. (mobile only)
- Every page in the path tree is reachable from the menu or a link for at least one role.
- Point a Navigation defaultValue at a leaf item, never a group.
- Set Stepper stepDetails.clickable true when users should click steps; absent is clickable only on the canvas.
- Set an app Default Page before using navigateBack resetToDefaultPage.
- Open a new tab with target _blank, never openInNewTab, which nothing reads.
- Write navigate target as _blank or _self deliberately; anything else tears the current page down.
- Set setUrlParameters history replace for filters and tabs, and keep mergeWithExistingQueryParams on.
- Store keyboard shortcuts with eventType onKeyboardShortcut, the combo under payload.shortcut, and no targetId. (web only)

## P3

- Limit primary and secondary navigation items.
- Hide the navigation bar if only one primary navigation item.
- Invalid Page Slug Generated from Cloned IDs.
- Nest groups one level at most, 3 to 6 items per group, no single-item groups.
- Translate navigation labels and keep one icon style.
- Configure the menu for small, medium and large screens.
- Keep 5 to 7 primary navigation items.
- Write target, not openInNewTab, on a navigate action.
- Keep anything a visit may need at most 2 levels hidden from the page.
- Don't style mobile tabs via navigationItem text, icon, background, overflowDetails or floatingOffset; the phone ignores them. (mobile only)
- Declare as page inputs every query key setURLParameters must clear; it never clears a key the page did not declare. (web only)
- Label a walkthrough's last forward control Finish and gate Back on hasPreviousStep.
- Don't promise keyboard shortcuts on mobile; every shortcut is dead there. (mobile only)
- Don't add a LANGUAGE_SWITCHER nav item to an app with one locale.
