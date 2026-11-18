# App navigation

The app's menu, its home page and how a person moves between pages. Read this
before any `get_navigation`, `apply_navigation_edits` or `set_navigation_style`
call, before a page
event that moves to another page, and before building anything that looks like
a menu — a bar of page links, an app-name link in a header, a hamburger. Those
are the app menu, and they are never built out of page blocks.

Checked with live dry runs. `set_navigation_style`, and the `navigationBar`
and `modules` fields of `get_navigation`, are *not yet verified live*: they
are newer than those runs, so a tenant may not serve them yet. See
§ A module can draw the bar instead of the platform.

## Contents

- What the menu is
- Read it
- Change it
- Item types
- Groups
- Order and moving
- Home page
- Where an item points
- Who sees an item
- What the tools do to the menu for you
- How it looks: side bar, top bar, bottom tabs, drawer
- A module can draw the bar instead of the platform
- Mobile apps
- Page events that move the person
- The menu inside a page is a different thing
- Things that save but show wrong
- What no tool can do yet
- Proof

## What the menu is

The menu is not on a page. It lives on the app record, at
`properties.navigation`:

- `primary`: the main list of items. Groups can hold more items.
- `secondary`: the second list, on web only. The profile menu and the
  notifications bell live here.
- `defaultPageId`: the home page for a signed-in person.
- `defaultPublicPageId`: the home page for a signed-out visitor of a PRIVATE app.
- `appearance`: how the menu looks at each screen size (XL, LG, MD, SM).
- `pageTransition`: `FADE` or `SLIDE_HORIZONTAL` between pages, on web.

`get_app_overview` does not return any of this. Use `get_navigation`, or
`cache nav <appId>` when the app is in the working folder's cache.

## Read it

`get_navigation {host, appId}`. `appId` is the app's `interfaceId`.

The reply has `defaultPageId`, `defaultPublicPageId`, `primary`, `secondary`,
`warnings`, and `destinations`. `destinations[pageId or moduleId]` gives each
target's `path`, its `params` (the `:` parts of the path) and its `inputs`.
Only those `inputs` are legal `pageInputs` keys. Every `:` part needs a
`pageParams` value.

On a tenant that serves `set_navigation_style`, the reply also has
`navigationBar` — each screen size's bar `position`, `navigatorType` and
`navigatorModuleId` — and `modules`, every MODULE of this app, which is what
that tool may attach. Read them before you change the style. A warning there
names an attached module that no longer exists: that bar draws empty with no
error anywhere.

Two things the reply leaves out. `cache nav <appId>` shows both, from the
working folder's copy of the app:

- The rest of `appearance`. No tool reads it. `cache nav` names each screen
  size's navigator and position on its `devices:` line, so it answers the
  style question too on a tenant whose `get_navigation` returns no
  `navigationBar`.
- A home page set by a condition. When `defaultPageId` is a condition object,
  the reply has no `defaultPageId` at all. `cache nav` says `set by a
  condition`. Check it before you change the home page, so you do not overwrite
  a condition you never saw.

A warning such as `'e_…' is pointed at by a nav item but this host has no page
with that id` means an item points at a deleted page. Fix or remove it.

## Change it

`apply_navigation_edits {host, appId, ops, dryRun?}`. The ops run in order, and
a later op sees what an earlier one did. If any op is refused, nothing is
written. The refusal lists every problem with its path, such as
`ops[0].item.icon: a PAGE nav item needs it`.

| Op | Shape |
|---|---|
| `addItem` | `{op, list?, item, index?, parentGroupId?}`. `list` is `primary` (default) or `secondary`. No `index` puts it at the end. |
| `updateItem` | `{op, itemId, patch}`. The patch merges one level deep. `pageInputs: null` and `pageParams: null` clear those. `id` and `type` cannot change. |
| `removeItem` | `{op, itemId}`. Removes the item and, for a group, its children. |
| `moveItem` | `{op, itemId, index}`. Inside its own list only. Always send `index`. |
| `setDefaultPage` | `{op, pageId}`. A plain page id of this app. |
| `setDefaultPublicPage` | `{op, pageId}`. `null` clears it. |

Send `dryRun: true` first when you are not sure. It writes nothing and returns
`stored`, the whole menu as it would be saved, with its `appearance`.

A code app (`cache app` says mode `code`) is refused. Its menu is owned by the
code builder.

## Item types

`type` is uppercase. `page` is refused.

| Type | Needs | Notes |
|---|---|---|
| `PAGE` | `name`, `icon`, `pageId` | The page must already be in this app. `slug` and `path` are set from the page. Values you send for them are replaced. |
| `MODULE` | `name`, `icon`, `moduleId`, `slug` | A module of this app or a shared one. Its address is `/<slug>`. Pick a slug no page uses. |
| `URL` | `name`, `icon`, `url` | `openInNewTab` is optional. A full URL opens as written. A relative one such as `/orders` is read as a page path of this app. |
| `GROUP` | `name`, `items: []` | Give it an `icon` too, or the menu draws an empty slot. Primary only. |
| `USER_MENU` | `name` | The profile menu. Secondary, web only. Use id `userMenu`. |
| `ACTION` | `name` | `action: "showNotifications"` is the bell. Use id `notifications`. Secondary. |
| `BUTTON` | `name` | Only inside a USER_MENU's `menuItems`, with `interactions.events`. |
| `COLOR_SCHEME_SWITCHER`, `LANGUAGE_SWITCHER` | `name` | Only inside a USER_MENU's `menuItems`. |

Every item may also have `activeIcon`, `breakpointVisibility` and `permissions`
(see "Who sees an item").

**Icons.** An icon is an id from `get_icon_options`, such as `Home02`, `Cube02`,
`File05`, `Settings04`. A wrong name such as `house` or `Folder` is saved with no
error and draws an empty slot. Look the names up first, all in one call:
`get_icon_options {queries: ["home", "folder", "bell"]}`.

**Ids.** The tool makes an id like `nav_aB3dE` when you send none. It keeps an id
you send. Send your own id only for the 3 fixed ones the builder looks for by
name:

- `BRAND_NAVIGATION`: the logo link, first in `primary`. A `URL` item. The tool
  needs a non-empty `url`, so use `/`, and an `icon`, which a `URL` item
  cannot leave out: send the `logoSmall` address. The tool warns that URL is not in the
  builder's add menu. That warning is fine here. The logo and name come from
  `update_app_settings` panel `general` (`logoSmall`, `logoLarge`, `name`).
- `userMenu`: the profile menu. A `USER_MENU` with another id shows in some
  views and not in others.
- `notifications`: the bell. The builder also writes `properties.notifications.tags`.
  The tool does not, so a bell added by the tool has no tags.

The tool does not stop a second item with the same `type` or the same page. Read
the menu first and update the item that is there.

## Groups

Make a group in 2 steps, in one call:

```json
[
  {"op": "addItem", "list": "primary", "item": {"type": "GROUP", "id": "nav_reports", "name": "Reports", "icon": "BarChart10", "items": []}},
  {"op": "addItem", "list": "primary", "parentGroupId": "nav_reports", "item": {"type": "PAGE", "name": "Sales", "icon": "File05", "pageId": "e_…"}}
]
```

Never put the children inside `items` of the new group. Children sent that way
get no id, no check and no `slug` or `path`. The tool then saves an
`appearance` entry with no id, and on web a broken `appearance` entry hides the
whole menu.

Rules the runtimes follow:

- One level only. A group inside a group is saved, but it is not drawn.
- Inside a group only `PAGE`, `URL` and `MODULE` are drawn.
- On web, groups show only on a wide screen (XL) with expandable labels.
- A group with one child is drawn as that child.
- A group whose children are all hidden from the person is dropped.
- Bottom tabs and the mobile drawer do not draw groups.

## Order and moving

The order of `primary` and `secondary` is the menu order. `moveItem` changes the
position inside the item's own list. It cannot move an item into or out of a
group, or between `primary` and `secondary`. It ignores `parentGroupId` and
`list` with no error. To move across, remove the item and add it again where it
should go. It gets a new id unless you send the old one.

A `moveItem` with no `index` moves the item to the top.

## Home page

- `setDefaultPage` sets the page a signed-in person lands on at the app's root
  address. It must be a page of this app. Pick one with no `:` parts in its
  path: the builder offers only those, and the root address has no value to
  fill them.
- `setDefaultPublicPage` sets the page a signed-out visitor of a PRIVATE app
  lands on. Choose a page that is public (`set_pages_visibility`). With none
  set, the visitor goes to the login page.
- A page's own address is never `/`. Give the home page a plain address such as
  `/home`, then make it the default.
- `create_pages` makes the first page of an app the default when none is set.
- `delete_pages` refuses to delete the default page. It does not check
  `defaultPublicPageId`, so clear or move that yourself first.
- If the person may not open the default page, the runtime opens the first page
  they may open.
- The builder can set the home page by a condition. No tool can. `setDefaultPage`
  replaces a condition with a plain id and gives no warning.

## Where an item points

A `PAGE` item's link is its page's path. Two values fill it:

- `pageParams`: `[{key, value}]`, one row for every `:` part of the path, such
  as `[{"key": "orderId", "value": "123"}]`. A missing one is refused. On the
  live app, an empty part makes the click do nothing.
- `pageInputs`: `{name: value}`. Only inputs the page declares. They go into the
  query string.

Both take plain values only. A `{{ }}` binding is refused, because the menu puts
the text in as it is. When the value must come from data, use a button with a
`navigateToPage` action instead. Actions do take bindings.

A `MODULE` item takes `pageInputs` only. `pageParams` on it is refused.

To point an item at another page: `updateItem` with `pageId`, and
`pageParams: null` in the same patch when the old page had params.

## Who sees an item

- `breakpointVisibility`: a list of `XL`, `LG`, `MD`, `SM`. Missing means every
  size. XL is 1280 px and up, LG 1024, MD 768, SM below that.
- `permissions`: `{<permission group id>: [<permission>]}`. The person needs
  every one listed. Read group ids with `get_permission_group_options`. The
  tool does not check them. A wrong id hides the item from everyone.
- A `PAGE` item is also hidden when the person may not open that page
  (`apply_permission_edits` page permissions), even with no `permissions` on the
  item.
- A signed-out visitor has no permissions, so any item with `permissions` is
  hidden from them.
- A PUBLIC app (`set_app_visibility`) hides the `userMenu` item.
- A page left out of the menu still opens from its address or a link.

## What the tools do to the menu for you

| Tool | What it does to the menu |
|---|---|
| `create_app` | Starts with an empty menu and `defaultPageId: ""`. Looks: side bar on XL, LG, MD; bottom tabs on SM. |
| `create_pages` | Never adds a menu item. Add one with `apply_navigation_edits` after the page exists. Makes the first page the default when none is set. |
| `update_pages`, `update_page_paths` | Rewrite `slug` and `path` on every PAGE item, but not on items inside a USER_MENU. The item's label never changes. |
| `delete_pages` | Removes the page's PAGE items and any group left empty. Leaves MODULE items, USER_MENU links and `defaultPublicPageId`. |
| `apply_navigation_edits` | Rebuilds `appearance` from the item lists on every save. |
| `set_navigation_style` | Writes `navigationBar` only, and touches no item. On web it also resizes the bar for the style, as the settings form does. |

Because of that last row, a save can undo a look set in the builder. At a screen
size where nobody reordered the menu by hand, the rebuild drops any item hidden
there and any item put in the "More" list there. Say so before you edit the
menu of an app whose look was set by hand.

## How it looks: side bar, top bar, bottom tabs, drawer

It is `appearance.<XL|LG|MD|SM>`. One part of it has a tool; the rest has
none:

- `navigationBar.position`: `start`, `end`, `top` or `bottom`. No tool.
- `navigationBar.navigatorType`: `Standard` or `Custom` on web. `BottomTabsNavigator`,
  `DrawerNavigator` or `None` on SM and on mobile. `set_navigation_style`
  writes the web pair (`Standard` / `Custom`) only. Picking bottom tabs, a
  drawer or `None` has no tool.
- `navigationBar.navigatorModuleId`: the module that draws a custom menu.
  `set_navigation_style` writes it.
- `navigationBar.type`: `fixed` or `floating`. No tool.
- `navigationItem`: label style (`expandable`, `upfront`, `tooltip`, `none`),
  selected style (`stroke`, `solid`), icon size, text style. No tool.
- Item colours live in the app theme, under `theme.components.navigation`.

So a request to move the bar (a top bar, a drawer on the phone, bottom tabs),
to hide the menu, or to restyle it is a manual step in the builder: *App
settings → Navigation → Appearance*. Say that in the plan. Do not try to write
the app record another way. A request for a custom bar in the position the app
already uses is the one that now has a tool — the next section.

You can change the colours of the whole app with `update_app_settings` panel
`theme`. The menu follows the theme's brand colour.

## A module can draw the bar instead of the platform

`set_navigation_style {host, appId, resolutions, style, moduleId, createModule,
dryRun}` picks, per screen size, WHAT DRAWS the bar: the platform's own bar
(`style: "standard"`) or a MODULE of this app (`style: "custom"`). It is the
Navigation Style field of *App settings → Navigation → Appearance*, and it is
the only part of `appearance` that is a setting of its own rather than a mirror
of the item lists. The items stay `apply_navigation_edits` work: the module
replaces the chrome, not the menu, and reads the items through
`interfaceRecord['navigation']`.

Read `get_navigation` first. Its `navigationBar` says what each size does now,
and `modules` lists what you may attach.

| Input | What it takes |
|---|---|
| `resolutions` | A list of `XL`, `LG`, `MD`, `SM`. Each size has its own bar, so a change at XL leaves the phone alone. |
| `style` | `custom` (a module draws it) or `standard` (the platform's bar). |
| `moduleId` | `custom` only: a MODULE this app already has. |
| `createModule` | `custom` only: `{name?}`. Seeds a module built for that bar's position and attaches it in the same write. The name defaults to the one the builder's own create gives it. |
| `dryRun` | Writes nothing and returns `stored`, the navigation block as it would be saved. |

**`custom` needs a module.** `moduleId` or `createModule`, never both, never
neither. `custom` with no module is refused, and that refusal is the point: on
web it switches the platform's bar OFF and leaves nothing drawing it — a blank
strip, and no error anywhere.

**`createModule` seeds a working bar** for the position that size already
uses: a side rail, a top bar and a bottom bar are three different designs,
each with expand and collapse and an active state. It cannot serve two sizes
whose bars sit in different positions — that is refused, so create one module
per position. It does not MOVE the bar: the position is still the manual
Appearance step above.

**`standard` detaches the module** and puts the platform's bar back. The module
itself is left alone, to attach again or delete yourself.

The two shapes, because the runtime checks two different things:

| Where | What makes the bar custom |
|---|---|
| web `XL`, `LG`, `MD` | `navigatorType: "Custom"` |
| `SM`, and a mobile app at any size | `navigatorModuleId` being set, whatever the type says |

That is why `standard` deletes the module id instead of writing
`navigatorType: "Standard"` over it, and why a mobile app is never given
`navigatorType: "Custom"` — that would wipe the Drawer or Bottom-tabs choice
the attached module was built for. Do not try to reach these states any other
way.

Three `warnings` that are not refusals, each on a write that saved cleanly:

- A mobile app draws one bar and reads it from `SM` alone. Send
  `resolutions: ["SM"]` there; anything else is stored and never read.
- A mobile navigator left on `None` draws no module at all. Choosing Drawer or
  Bottom tabs is the manual step.
- An app whose record predates the `appearance` block gets all four sizes
  seeded with what a new app stores. Check the bar's position afterwards.

A code app is refused on every call: its record belongs to the code builder.
A module interface and a template-component interface are refused a
`createModule`, since only an application draws a navigation bar.

Where the tenant does not serve `set_navigation_style`, the whole style is the
manual Appearance step, exactly as the section above says. Check the live tool
list before you plan a task around it.

**Proof.** The reply has `applied`, one row per size written, `createdModuleId`
when it seeded one, and `stored`, the navigation block read back off the
tenant. Name the sizes, the `navigatorType` and the module id in the proof
line, and check `warnings`.

## Mobile apps

- `primary` holds at most 5 top-level items. A 6th is refused.
- There is no `secondary` list. Adding to it is refused.
- Only top-level `PAGE` items become a tab or a drawer row. Groups, URLs,
  modules and actions are dropped. Two items for one page show once.
- `pageParams` and `pageInputs` on a menu item are ignored on the phone.
- New apps use bottom tabs. A drawer is a manual change (see above).
- A page reached from the menu opens inside the tabs or drawer. Any other page is
  pushed on top, so a back control on it must use `navigateBack`.
- The phone ignores most of the looks above: it reads only `appearance.SM`,
  and a floating `navigationBar.type` or the `navigationItem` label and
  selected styles change nothing there.

The native rules for pages are in the `app-native` skill; choosing bottom
tabs, a drawer or stack-only, and the custom bar module, are in
[`../../app-native/references/mobile-navigation.md`](../../app-native/references/mobile-navigation.md).

## Page events that move the person

Read the action sheet before you write one. These take `{{ }}` bindings.

| Action | Sheet | Payload |
|---|---|---|
| `navigateToPage` | `actions/navigate-to-page` | `{pageId, pageParams: [{key, value}], pageInputs, target, history}` |
| `navigate` | `actions/navigate` | `{path, target: "_self" or "_blank", history: "push" or "replace"}`. Write `target`, not `openInNewTab`. Only for an address outside the app: a page of this app is `navigateToPage`, since a hand-written path such as `/home` leaves the builder and preview routes and lands on a 404. |
| `navigateBack` | `actions/navigate-back` | `{}` for a plain back. `{navigateToSpecificPage: true, pageId, pageParams, pageInputs}` when history cannot be trusted, and on a MOBILE app to return a result to the page underneath in `pageInputs` (`app-native` iron rule 16). `pageParams` fills every `:` part of the destination's path. |
| `setURLParameters` | `actions/set-url-parameters` | `{pageInputs, mergeWithExistingQueryParams, history}`. Changes the query string only. |
| `controlDrawerNavigator` | `actions/control-drawer-navigator` | `{operation: "show" or "hide"}`. Works on mobile only when the menu is a drawer. |

A back control uses `navigateBack`, never `navigateToPage`
(`app-verify/references/config-review.md` § Navigation).

## The menu inside a page is a different thing

The `navigation-menu` and `navigation-container` blocks are menus drawn inside
one page, with their own item format (`label`, `group`, `variant`). They are
edited with `apply_page_edits` and their sheets `blocks/navigation-menu` and
`blocks/navigation-container`. Changing the app menu does not change them. For
switching sections inside a page, use `tabs`.

Neither of them is the app menu, and neither is a `stack` of `button` or
`link` blocks. A bar of links to the app's other pages, an app-name link, a
hamburger with a hidden phone menu, a `desktopMenu` beside a `mobileMenu` —
every one of those is the app menu rebuilt by hand on one page, and it is
wrong:

- It exists on that page only. Every other page of the app loses it, or has
  to have the same blocks built again and kept in step by hand.
- It does not follow the menu's permissions, so it shows items a visitor may
  not open.
- It has no active state from the platform: `activeItem` comes from the real
  menu, not from blocks.
- It draws twice when the real menu is on as well.

The app menu is one write on the app record: `apply_navigation_edits`. The
fix for "the pages are not reachable" is a menu item per page, never a bar on
a page.

The one real pull toward hand-building it is the look: the menu's position
(top bar, bottom tabs, drawer) is `appearance`, and no tool moves the bar, so
a request for a top navigation bar cannot be satisfied by any menu tool. That
alone is not a reason to hand-build it. Put the items in the app menu, and
report the position as the manual builder step it is — *App settings →
Navigation → Appearance* — exactly as "What no tool can do yet" below says.

What a tool CAN do is replace what draws the bar where it already sits:
`set_navigation_style` with `createModule` seeds a module bar and attaches it,
on every page of the app, with the real items and the real permissions behind
it. When the ask is "a custom-looking bar" rather than "a bar in a different
place", that is the answer, not page blocks (§ A module can draw the bar
instead of the platform).

### When the person asks for it anyway

All of the above is the default, not a prohibition. A person who has been
told the costs may still choose a hand-built bar, and that choice is theirs:
the manual Appearance step may be one nobody can take, or the look they want
may be one `Standard` cannot produce. The rule is only that nothing builds it
by itself. The decision belongs in the accepted spec's `## Contract` or the
brief's `## Changes`, in the person's own words, with what it costs named —
built on every page by hand, no permission filter, no active state, and the
real menu to be switched off by hand. A design region naming app chrome with
no such line behind it is a `needs_confirmation`, never a licence.

Offer the platform's own custom bar first. A `module` attached with
`set_navigation_style` is the same freedom of look with none of those four
costs: it draws on every page, the platform switches its own bar off for you,
the items are the real items after permissions, and a seeded one comes with an
active state. The hand-built bar is for what is left — a bar in a position the
app does not use, or a tenant that does not serve the tool.

Once a hand-built bar is recorded, build it the way that survives:

- One `template-component` (look only) or `module` (look and behaviour),
  placed in each page's `header_id` socket. Not raw blocks repeated per page.
- Switch the real menu off for the sizes the bar replaces — `appearance`
  again, a manual step — or the app draws two menus.
- Filter items per permission group yourself with a visibility binding; the
  platform does not do it for blocks.
- Take the current page from `interfaceRecord['navigation'].activeItem` when
  the design wants an active state.

Breadcrumbs are the exception that stays page work: the app menu has no
breadcrumbs, so a breadcrumb trail is built on the page with `typography` and
`link` blocks, or bound from `interfaceRecord['navigation']`.

A page can read the app menu through the binding `interfaceRecord['navigation']`
(sheet `concepts/data-binding/interface-record/navigation`): `activeItem`,
`items.primary`, `items.secondary`. This is the menu the visitor may see, after
permissions.

## Things that save but show wrong

Each of these saves with no error. Check for them yourself.

1. An unknown icon name: an empty slot.
2. Group children sent inside `items`: no ids, and the whole web menu can vanish.
3. A group inside a group: not drawn.
4. A group on a mobile app: not drawn.
5. `moveItem` with `parentGroupId` or `list`: moved to the top level index, not
   into the group or list.
6. A page id in a MODULE item's `moduleId`: that page's routing entry is
   replaced and the page can stop opening.
7. A `USER_MENU` or bell with an id other than `userMenu` or `notifications`.
8. A wrong `permissions` group id: the item is hidden from everyone.
9. A menu edit on an app whose look was set by hand: hidden and "More" items at
   some sizes come back.
10. A menu edit on a DISPLAY app or a module: the next `create_pages` wipes it.
11. A `list` value other than `primary` or `secondary`: a crash
    (`TOOL_CALL_ERROR`), not a clean refusal.
12. A deleted module still attached as the custom bar: that size draws an
    empty bar. `get_navigation` warns. Attach another module or go back to
    `standard`.
13. `set_navigation_style` on a mobile app at a size other than `SM`: stored,
    and nothing reads it. Only a warning.

## What no tool can do yet

Say each of these is a manual builder step, or leave it out of scope:

- The menu's look, except which thing draws it: position, bottom tabs or
  drawer, top bar, hide the menu, styles, colours, per-size order, the "More"
  list. What draws the bar is `set_navigation_style` (§ A module can draw the
  bar instead of the platform); where it sits and how it is styled is not.
- `pageTransition`.
- A home page chosen by a condition.
- Bell tags.
- A path redirect.

## Proof

Read the menu back with `get_navigation` after every write. The proof line names
each item you added or changed by `id` and `name`, the `destinations` path it
points at, and the `defaultPageId` when you set it. Check `warnings` is empty.

For a menu task marked `[visual]`, open the app and check the item shows at the
screen size the task names. On a phone-sized screen a web app may use bottom
tabs, which show no groups.
