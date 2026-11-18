# Windows & tabs

Every window is a `Page` on the one shared context; "switch" rebinds which page later steps act on. Author these only from a walk you actually performed.

**Open & switch:** `open_new_tab`, `open_window_and_navigate` (value=URL), `click_and_switch_to_new_window` (+`element` — the trigger), `submit_and_switch_to_new_window` (+`element` — the submit control).
**Switch to an existing window:** `switch_to_window_by_title` (value=title), `switch_to_window_by_title_contains` (value=substring), `switch_to_window_by_index` (value=0-based index).
**Wait:** `wait_for_new_window` (blocks until a new window opens; no value).
**Close:** `close_current_window`, `close_window_by_title` (value=title), `close_window_by_index` (value=index), `close_all_windows`, `close_other_windows`.
**Verify:** `verify_link_opens_new_window` (+`element` — checks the target opens a new window/tab without switching).

## A link that opens a new tab — two shapes, by what the scenario needs

- Only need to **prove** it opens a new tab and stay put → author the click with `opensTab: true` (the observed fact), or `verify_link_opens_new_window` (+`element`) when that's the whole check.
- Need to **act inside** the new tab → `click_and_switch_to_new_window` (+`element` — the link) rebinds later steps onto the opened page, so the assertions/fills that follow run against the new tab; `close_current_window` (rebinds back) when done.
- Never fake a switch — not with an `if`, a `frameLocator`, a URL assert on the current page, or any other emulation: **later steps act on the new page only through the switch actions above**; anything short of them leaves every following step bound to the OLD page while reading green against it.
